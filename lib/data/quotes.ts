/**
 * Data access for deals, quotes and versions. Every function takes the client
 * so it can be tested against a throwaway database; route handlers pass getDb().
 *
 * Versioning rules:
 *   - each quote has exactly one draft (the highest version number) that the form edits;
 *   - "Save version" freezes the draft — inputs, engine outputs and guardrail
 *     findings are computed on the server and stored — and opens a new draft
 *     copied from it;
 *   - frozen versions can't be edited or deleted (database triggers enforce it).
 */
import { createHash } from 'node:crypto';
import type { Client, Row } from '@libsql/client';
import { runModel, ENGINE_VERSION, type ModelResult } from '@/lib/model';
import { priceBook, SKU, type PriceBook, type Product, type PricingModel } from '@/lib/pricing/catalog';
import { evaluateGuardrails, type GuardrailResult } from '@/lib/pricing/guardrails';
import { buildPriceLines, type PriceLine } from '@/lib/pricing/lines';
import { bedsOf, hasEcall, defaultDraft, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { changeLines, diffDrafts } from '@/lib/quote/diff';

export interface DealSummary {
  dealId: number;
  quoteId: number;
  customerName: string;
  status: string;
  updatedAt: string;
  savedVersions: number;
  communities: number;
  beds: number;
  ownerName: string | null;
  ownerId: number | null;
  /** Open tasks on the deal, and how many of them are past due. */
  openTasks: number;
  overdueTasks: number;
  /** For the user asking: their collaborator permissions on it (null when they aren't one). */
  myPerms: { inputs: boolean; scope: boolean; deliverables: boolean } | null;
  /** A prospect asked for the agreement and nobody has marked it sent yet. */
  agreementRequested: boolean;
}

export interface VersionSummary {
  id: number;
  versionNo: number;
  status: string;
  savedAt: string | null;
  sentAt: string | null;
  changeNote: string | null;
  engineVersion: string | null;
  totalInvestment12: number | null;
  netBenefit12: number | null;
  rung: number | null;
  requiredApprover: string | null;
  savedByName: string | null;
  sentByName: string | null;
  /** What changed from the version it was based on, one line each. */
  changes: string[];
}

export interface QuoteEditorData {
  /** The version the draft is based on, and its inputs (the baseline for unsaved changes). */
  activeVersionId: number | null;
  activeInputs: QuoteDraft | null;
  dealId: number;
  quoteId: number;
  quoteName: string;
  draftVersionId: number;
  draftVersionNo: number;
  draft: QuoteDraft;
  draftUpdatedAt: string;
  versions: VersionSummary[];
  products: Product[];
}

/** What a frozen version stores as outputs: everything except traces, which are rebuilt from inputs on demand. */
export { computeOutputs, type StoredOutputs } from '@/lib/quote/outputs';
import { computeOutputs, type StoredOutputs } from '@/lib/quote/outputs';
import { getPriceBookSettings } from './priceBook';

const json = (v: unknown) => JSON.stringify(v);

export async function loadPriceBook(db: Client): Promise<{ products: Product[]; book: PriceBook }> {
  const rs = await db.execute('SELECT sku, name, pricing_model, list_price, description FROM products WHERE active = 1 ORDER BY rowid');
  const products = rs.rows.map((r) => ({
    sku: String(r.sku),
    name: String(r.name),
    pricingModel: String(r.pricing_model) as PricingModel,
    list: Number(r.list_price),
    description: String(r.description ?? ''),
  }));
  return { products, book: priceBook(products) };
}

export async function listDeals(db: Client, userId: number | null = null): Promise<DealSummary[]> {
  const rs = await db.execute({
    sql: `
    SELECT d.id AS deal_id, q.id AS quote_id, d.customer_name, d.status, d.updated_at, d.owner_id,
           c.can_inputs, c.can_scope, c.can_deliverables, c.user_id AS collab,
           (SELECT COUNT(*) FROM quote_versions v WHERE v.quote_id = q.id AND v.status <> 'draft') AS saved_versions,
           (SELECT inputs_json FROM quote_versions v WHERE v.quote_id = q.id AND v.status = 'draft') AS draft_json,
           (SELECT name FROM users u WHERE u.id = d.owner_id) AS owner_name,
           (SELECT COUNT(*) FROM deal_tasks t WHERE t.deal_id = d.id AND t.completed_at IS NULL) AS open_tasks,
           (SELECT COUNT(*) FROM deal_tasks t WHERE t.deal_id = d.id AND t.completed_at IS NULL AND t.due_date IS NOT NULL AND t.due_date < date('now')) AS overdue_tasks,
           EXISTS (SELECT 1 FROM agreement_requests a WHERE a.deal_id = d.id AND a.sent_at IS NULL) AS agreement_open
    FROM deals d JOIN quotes q ON q.deal_id = d.id
    LEFT JOIN deal_collaborators c ON c.deal_id = d.id AND c.user_id = ?
    WHERE q.id = (SELECT MIN(id) FROM quotes WHERE deal_id = d.id)
    ORDER BY d.updated_at DESC, d.id DESC`,
    args: [userId ?? 0],
  });
  return rs.rows.map((r) => {
    const draft = r.draft_json ? (JSON.parse(String(r.draft_json)) as QuoteDraft) : null;
    return {
      dealId: Number(r.deal_id),
      quoteId: Number(r.quote_id),
      customerName: String(r.customer_name),
      status: String(r.status),
      updatedAt: String(r.updated_at),
      savedVersions: Number(r.saved_versions),
      communities: draft?.communities.length ?? 0,
      beds: draft?.communities.reduce((s, c) => s + bedsOf(c), 0) ?? 0,
      ownerName: r.owner_name ? String(r.owner_name) : null,
      ownerId: r.owner_id == null ? null : Number(r.owner_id),
      openTasks: Number(r.open_tasks ?? 0),
      overdueTasks: Number(r.overdue_tasks ?? 0),
      myPerms: r.collab == null ? null : { inputs: Number(r.can_inputs) === 1, scope: Number(r.can_scope) === 1, deliverables: Number(r.can_deliverables) === 1 },
      agreementRequested: Number(r.agreement_open ?? 0) === 1,
    };
  });
}

export async function createDeal(db: Client, customerName: string, opts: { userId?: number | null; now?: Date } = {}): Promise<{ dealId: number; quoteId: number }> {
  const userId = opts.userId ?? null;
  const now = opts.now ?? new Date();
  const name = customerName.trim();
  if (!name) throw new Error('Customer name is required');
  const { book } = await loadPriceBook(db);
  const { softwareBilling } = await getPriceBookSettings(db);
  const tx = await db.transaction('write');
  try {
    const deal = await tx.execute({ sql: 'INSERT INTO deals (customer_name, owner_id) VALUES (?, ?) RETURNING id', args: [name, userId] });
    const dealId = Number(deal.rows[0].id);
    const quote = await tx.execute({ sql: "INSERT INTO quotes (deal_id, name, created_by) VALUES (?, 'Proposal', ?) RETURNING id", args: [dealId, userId] });
    const quoteId = Number(quote.rows[0].id);
    await tx.execute({
      sql: "INSERT INTO quote_versions (quote_id, version_no, status, inputs_json, created_by) VALUES (?, 1, 'draft', ?, ?)",
      args: [quoteId, json(defaultDraft(name, book, now, { softwareBilling })), userId],
    });
    await tx.commit();
    return { dealId, quoteId };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

function versionSummary(r: Row): VersionSummary {
  const out = r.outputs_json ? (JSON.parse(String(r.outputs_json)) as StoredOutputs) : null;
  const g = r.guardrail_json ? (JSON.parse(String(r.guardrail_json)) as GuardrailResult) : null;
  return {
    id: Number(r.id),
    versionNo: Number(r.version_no),
    status: String(r.status),
    savedAt: r.saved_at ? String(r.saved_at) : null,
    sentAt: r.sent_at ? String(r.sent_at) : null,
    changeNote: r.change_note ? String(r.change_note) : null,
    engineVersion: r.engine_version ? String(r.engine_version) : null,
    totalInvestment12: out?.kpis.totalInvestment12 ?? null,
    netBenefit12: out?.kpis.netBenefit12 ?? null,
    rung: g?.rung ?? null,
    requiredApprover: g?.requiredApprover ?? null,
    savedByName: r.saved_by_name ? String(r.saved_by_name) : null,
    sentByName: r.sent_by_name ? String(r.sent_by_name) : null,
    changes: r.changes_json ? (JSON.parse(String(r.changes_json)) as string[]) : [],
  };
}


/** The version the draft is based on: the one last saved or made active (else the latest saved). */
async function activeVersionId(db: Pick<Client, 'execute'>, quoteId: number): Promise<number | null> {
  const r = await db.execute({
    sql: `SELECT COALESCE((SELECT active_version_id FROM quotes WHERE id = ?),
                          (SELECT id FROM quote_versions WHERE quote_id = ? AND status <> 'draft' ORDER BY version_no DESC LIMIT 1)) AS id`,
    args: [quoteId, quoteId],
  });
  return r.rows[0]?.id == null ? null : Number(r.rows[0].id);
}

export async function getQuoteEditor(db: Client, quoteId: number): Promise<QuoteEditorData | null> {
  const q = await db.execute({ sql: 'SELECT id, deal_id, name FROM quotes WHERE id = ?', args: [quoteId] });
  if (!q.rows.length) return null;
  const vs = await db.execute({
    sql: `SELECT v.id, v.version_no, v.status, v.saved_at, v.sent_at, v.change_note, v.engine_version, v.outputs_json, v.guardrail_json, v.inputs_json, v.updated_at, v.changes_json,
                 (SELECT name FROM users u WHERE u.id = v.saved_by) AS saved_by_name,
                 (SELECT name FROM users u WHERE u.id = v.sent_by) AS sent_by_name
          FROM quote_versions v WHERE v.quote_id = ? ORDER BY v.version_no DESC`,
    args: [quoteId],
  });
  const draftRow = vs.rows.find((r) => r.status === 'draft');
  if (!draftRow) throw new Error(`Quote ${quoteId} has no draft`);
  const { products } = await loadPriceBook(db);
  const activeId = await activeVersionId(db, quoteId);
  const activeRow = vs.rows.find((r) => Number(r.id) === activeId && r.status !== 'draft');
  return {
    activeVersionId: activeRow ? activeId : null,
    activeInputs: activeRow ? normalizeDraft(JSON.parse(String(activeRow.inputs_json))) : null,
    dealId: Number(q.rows[0].deal_id),
    quoteId,
    quoteName: String(q.rows[0].name),
    draftVersionId: Number(draftRow.id),
    draftVersionNo: Number(draftRow.version_no),
    draft: normalizeDraft(JSON.parse(String(draftRow.inputs_json))),
    draftUpdatedAt: String(draftRow.updated_at),
    versions: vs.rows.filter((r) => r.status !== 'draft').map(versionSummary),
    products,
  };
}

/** Minimal shape check on a draft coming from the browser. */
export function assertDraft(d: unknown): asserts d is QuoteDraft {
  const x = d as QuoteDraft;
  if (!x || typeof x !== 'object' || !Array.isArray(x.communities) || typeof x.commercial !== 'object' || typeof x.schedule !== 'object') {
    throw new Error('Invalid quote draft');
  }
}

/** The draft changed since this copy was loaded (another tab, or another person). */
export class DraftConflictError extends Error {
  status = 409 as const;
  constructor() {
    super('This deal was changed in another tab or by someone else since you opened it. Reload to get the latest — changes made here since then were not saved.');
  }
}

/**
 * Save the draft. When `baseUpdatedAt` is given (the editor always sends it),
 * the save only applies if the draft is still at that revision — so an older
 * tab can't silently overwrite newer edits made elsewhere.
 */
export async function saveDraft(db: Client, quoteId: number, draft: QuoteDraft, baseUpdatedAt?: string | null): Promise<{ updatedAt: string }> {
  assertDraft(draft);
  const guard = baseUpdatedAt ? ' AND updated_at = ?' : '';
  const rs = await db.execute({
    // Millisecond timestamps so two saves within the same second are still distinguishable.
    sql: `UPDATE quote_versions SET inputs_json = ?, roi_case = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE quote_id = ? AND status = 'draft'${guard} RETURNING updated_at`,
    args: baseUpdatedAt ? [json(draft), draft.roiCase, quoteId, baseUpdatedAt] : [json(draft), draft.roiCase, quoteId],
  });
  if (!rs.rows.length) {
    if (baseUpdatedAt) {
      const exists = await db.execute({ sql: "SELECT 1 FROM quote_versions WHERE quote_id = ? AND status = 'draft'", args: [quoteId] });
      if (exists.rows.length) throw new DraftConflictError();
    }
    throw new Error(`Quote ${quoteId} has no draft`);
  }
  await db.execute({
    sql: "UPDATE deals SET customer_name = ?, updated_at = datetime('now') WHERE id = (SELECT deal_id FROM quotes WHERE id = ?)",
    args: [draft.customerName.trim() || 'Untitled customer', quoteId],
  });
  return { updatedAt: String(rs.rows[0].updated_at) };
}

/**
 * Freeze the current draft as a saved version (outputs computed here, on the
 * server, from the stored inputs) and open the next draft as a copy.
 */
export async function saveVersion(db: Client, quoteId: number, changeNote: string | null, userId: number | null = null): Promise<{ versionId: number; versionNo: number }> {
  const { book } = await loadPriceBook(db);
  const { softwareBilling } = await getPriceBookSettings(db);
  const tx = await db.transaction('write');
  try {
    const d = await tx.execute({ sql: "SELECT id, version_no, inputs_json FROM quote_versions WHERE quote_id = ? AND status = 'draft'", args: [quoteId] });
    if (!d.rows.length) throw new Error(`Quote ${quoteId} has no draft`);
    const versionId = Number(d.rows[0].id);
    const versionNo = Number(d.rows[0].version_no);
    const inputsJson = String(d.rows[0].inputs_json);
    const draft = normalizeDraft(JSON.parse(inputsJson) as QuoteDraft);
    const { outputs, guardrails, lines } = computeOutputs(draft, book);
    // What changed from the version this draft was based on.
    const baseId = await activeVersionId(tx, quoteId);
    const base = baseId ? await tx.execute({ sql: 'SELECT inputs_json FROM quote_versions WHERE id = ?', args: [baseId] }) : null;
    const changes = base?.rows.length ? changeLines(diffDrafts(normalizeDraft(JSON.parse(String(base.rows[0].inputs_json))), draft)) : [];

    await tx.execute({
      sql: `UPDATE quote_versions SET status = 'saved', engine_version = ?, outputs_json = ?, guardrail_json = ?, inputs_hash = ?,
              change_note = ?, roi_case = ?, saved_by = ?, saved_at = datetime('now'), updated_at = datetime('now'), changes_json = ? WHERE id = ?`,
      args: [ENGINE_VERSION, json(outputs), json(guardrails), createHash('sha256').update(inputsJson).digest('hex'), changeNote?.trim() || null, draft.roiCase, userId, json(changes), versionId],
    });
    await tx.execute({ sql: 'UPDATE quotes SET active_version_id = ? WHERE id = ?', args: [versionId, quoteId] });
    // The proposal's wording and layout (both formats) carry over from the version this draft was based on,
    // so a new version keeps every customization; "Reset to standard" on the proposal clears them.
    if (baseId) {
      await tx.execute({
        sql: `INSERT OR IGNORE INTO proposal_text (quote_version_id, edits_json, layout_json, updated_by, updated_at)
              SELECT ?, edits_json, layout_json, ?, datetime('now') FROM proposal_text WHERE quote_version_id = ?`,
        args: [versionId, userId, baseId],
      });
    }
    for (const [i, c] of draft.communities.entries()) {
      await tx.execute({
        sql: `INSERT INTO communities (quote_version_id, position, name, market, beds, il_beds, al_beds, mc_beds, snf_beds, coverage, ecall, is_pilot, pilot_units, occupancy, go_live_month, roi_delay_months, additional_sensors)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [versionId, i, c.name, c.market, c.ilBeds + c.alBeds + c.mcBeds, c.ilBeds, c.alBeds, c.mcBeds, c.snfBeds, c.coverage, hasEcall(c) ? 1 : 0, c.pilot ? 1 : 0, c.pilotUnits, c.occupancy, c.goLiveMonth, c.roiDelayMonths, c.additionalSensors],
      });
    }
    for (const l of lines) {
      await tx.execute({
        sql: `INSERT INTO quote_version_lines (quote_version_id, community_position, sku, description, qty, unit_list, unit_net, billing, start_month, term_months, concession_code)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [versionId, l.communityPosition, l.sku, l.description, l.qty, l.unitList, l.unitNet, l.billing, l.startMonth, l.termMonths, l.concessionCode],
      });
    }
    // Record what would need approval — the foundation for the approval workflow. Nothing blocks yet.
    for (const f of guardrails.findings.filter((x) => x.requiredApprover)) {
      await tx.execute({
        sql: 'INSERT INTO approval_events (quote_version_id, rule_code, required_role, note, requested_by) VALUES (?, ?, ?, ?, ?)',
        args: [versionId, f.code, f.requiredApprover!, f.message, userId],
      });
    }
    await tx.execute({
      sql: "INSERT INTO quote_versions (quote_id, version_no, parent_version_id, status, roi_case, inputs_json, created_by) VALUES (?, ?, ?, 'draft', ?, ?, ?)",
      args: [quoteId, versionNo + 1, versionId, draft.roiCase, inputsJson, userId],
    });
    await tx.execute({ sql: "UPDATE deals SET updated_at = datetime('now') WHERE id = (SELECT deal_id FROM quotes WHERE id = ?)", args: [quoteId] });
    await tx.commit();
    return { versionId, versionNo };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/**
 * Make a saved version the active one: the draft's inputs become that
 * version's (anything unsaved in the draft is replaced) and later saves are
 * compared with it.
 */
export async function activateVersion(db: Client, quoteId: number, versionId: number): Promise<void> {
  const v = await db.execute({ sql: "SELECT inputs_json FROM quote_versions WHERE id = ? AND quote_id = ? AND status <> 'draft'", args: [versionId, quoteId] });
  if (!v.rows.length) throw Object.assign(new Error('Version not found'), { status: 404 });
  const tx = await db.transaction('write');
  try {
    await tx.execute({
      sql: "UPDATE quote_versions SET inputs_json = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE quote_id = ? AND status = 'draft'",
      args: [String(v.rows[0].inputs_json), quoteId],
    });
    await tx.execute({ sql: 'UPDATE quotes SET active_version_id = ? WHERE id = ?', args: [versionId, quoteId] });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/**
 * Delete a saved version outright, with everything stored for it (its lines,
 * communities, approvals, proposal wording and exports). Versions saved from
 * it keep working; if it was the active one, the latest remaining version
 * becomes active.
 */
export async function deleteVersion(db: Client, quoteId: number, versionId: number): Promise<void> {
  const v = await db.execute({ sql: "SELECT id FROM quote_versions WHERE id = ? AND quote_id = ? AND status <> 'draft'", args: [versionId, quoteId] });
  if (!v.rows.length) throw Object.assign(new Error('Version not found'), { status: 404 });
  const tx = await db.transaction('write');
  try {
    for (const t of ['quote_version_lines', 'communities', 'approval_events', 'proposal_text', 'proposal_exports']) {
      await tx.execute({ sql: `DELETE FROM ${t} WHERE quote_version_id = ?`, args: [versionId] });
    }
    await tx.execute({ sql: 'UPDATE quote_versions SET parent_version_id = NULL WHERE parent_version_id = ?', args: [versionId] });
    // Comments stay with the deal (they keep the version number they were made on).
    await tx.execute({ sql: 'UPDATE proposal_comments SET version_id = NULL WHERE version_id = ?', args: [versionId] });
    await tx.execute({
      sql: `UPDATE quotes SET active_version_id = (SELECT id FROM quote_versions WHERE quote_id = ? AND status <> 'draft' AND id <> ? ORDER BY version_no DESC LIMIT 1)
            WHERE id = ? AND active_version_id = ?`,
      args: [quoteId, versionId, quoteId, versionId],
    });
    await tx.execute({ sql: 'DELETE FROM quote_versions WHERE id = ?', args: [versionId] });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** A frozen version's stored inputs and outputs — exactly what was saved. */
export async function getVersion(db: Client, versionId: number) {
  const rs = await db.execute({
    sql: `SELECT v.*, (SELECT name FROM users u WHERE u.id = v.saved_by) AS saved_by_name, (SELECT name FROM users u WHERE u.id = v.sent_by) AS sent_by_name
          FROM quote_versions v WHERE v.id = ?`,
    args: [versionId],
  });
  if (!rs.rows.length) return null;
  const r = rs.rows[0];
  return {
    ...versionSummary(r),
    quoteId: Number(r.quote_id),
    inputs: normalizeDraft(JSON.parse(String(r.inputs_json)) as QuoteDraft),
    outputs: r.outputs_json ? (JSON.parse(String(r.outputs_json)) as StoredOutputs) : null,
    guardrails: r.guardrail_json ? (JSON.parse(String(r.guardrail_json)) as GuardrailResult) : null,
    sentTo: r.sent_to ? String(r.sent_to) : null,
  };
}

/** The price lines stored when a version was saved, with community names from the version's inputs. */
export async function getVersionLines(db: Client, versionId: number, communityNames: string[]): Promise<PriceLine[]> {
  const rs = await db.execute({ sql: 'SELECT * FROM quote_version_lines WHERE quote_version_id = ? ORDER BY id', args: [versionId] });
  return rs.rows.map((r) => ({
    communityPosition: Number(r.community_position),
    communityName: communityNames[Number(r.community_position)] ?? '',
    sku: String(r.sku),
    description: String(r.description ?? ''),
    qty: Number(r.qty),
    unitList: Number(r.unit_list),
    unitNet: Number(r.unit_net),
    billing: String(r.billing) as PriceLine['billing'],
    startMonth: Number(r.start_month),
    termMonths: r.term_months == null ? null : Number(r.term_months),
    concessionCode: r.concession_code ? String(r.concession_code) : null,
  }));
}

export const PROPOSAL_TEMPLATE_VERSION = '1';

export interface ProposalExport {
  id: number;
  createdAt: string;
  templateVersion: string;
  createdByName: string | null;
}

/**
 * Record that a version's proposal was sent: the version moves to 'sent' (its
 * inputs and outputs stay frozen) and the exact HTML that was viewed is kept.
 */
export async function markSent(db: Client, versionId: number, sentTo: string, html: string, userId: number | null = null): Promise<{ exportId: number }> {
  if (!sentTo.trim()) throw new Error('Say who it was sent to');
  if (!html || html.length < 100) throw new Error('Missing proposal snapshot');
  const tx = await db.transaction('write');
  try {
    const v = await tx.execute({ sql: 'SELECT status FROM quote_versions WHERE id = ?', args: [versionId] });
    if (!v.rows.length) throw new Error('Version not found');
    if (v.rows[0].status === 'draft') throw new Error('Save the draft as a version before sending it');
    await tx.execute({ sql: "UPDATE quote_versions SET status = 'sent', sent_at = datetime('now'), sent_to = ?, sent_by = ? WHERE id = ?", args: [sentTo.trim(), userId, versionId] });
    const ex = await tx.execute({
      sql: 'INSERT INTO proposal_exports (quote_version_id, html_snapshot, template_version, created_by) VALUES (?, ?, ?, ?) RETURNING id',
      args: [versionId, html, PROPOSAL_TEMPLATE_VERSION, userId],
    });
    await tx.commit();
    return { exportId: Number(ex.rows[0].id) };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function listExports(db: Client, versionId: number): Promise<ProposalExport[]> {
  const rs = await db.execute({
    sql: 'SELECT e.id, e.created_at, e.template_version, (SELECT name FROM users u WHERE u.id = e.created_by) AS by_name FROM proposal_exports e WHERE e.quote_version_id = ? ORDER BY e.id DESC',
    args: [versionId],
  });
  return rs.rows.map((r) => ({ id: Number(r.id), createdAt: String(r.created_at), templateVersion: String(r.template_version), createdByName: r.by_name ? String(r.by_name) : null }));
}

export async function getExportHtml(db: Client, exportId: number): Promise<string | null> {
  const rs = await db.execute({ sql: 'SELECT html_snapshot FROM proposal_exports WHERE id = ?', args: [exportId] });
  return rs.rows.length ? String(rs.rows[0].html_snapshot) : null;
}
