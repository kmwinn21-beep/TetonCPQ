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
import { computeCapex, runModel, ENGINE_VERSION, type CapexResult, type ModelResult } from '@/lib/model';
import { priceBook, SKU, type PriceBook, type Product, type PricingModel } from '@/lib/pricing/catalog';
import { evaluateGuardrails, type GuardrailResult } from '@/lib/pricing/guardrails';
import { defaultDraft, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';

export interface DealSummary {
  dealId: number;
  quoteId: number;
  customerName: string;
  status: string;
  updatedAt: string;
  savedVersions: number;
  communities: number;
  beds: number;
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
}

export interface QuoteEditorData {
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
export type StoredOutputs = Omit<ModelResult, 'traces'> & { capex?: Omit<CapexResult, 'trace'> };

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

export async function listDeals(db: Client): Promise<DealSummary[]> {
  const rs = await db.execute(`
    SELECT d.id AS deal_id, q.id AS quote_id, d.customer_name, d.status, d.updated_at,
           (SELECT COUNT(*) FROM quote_versions v WHERE v.quote_id = q.id AND v.status <> 'draft') AS saved_versions,
           (SELECT inputs_json FROM quote_versions v WHERE v.quote_id = q.id AND v.status = 'draft') AS draft_json
    FROM deals d JOIN quotes q ON q.deal_id = d.id
    WHERE q.id = (SELECT MIN(id) FROM quotes WHERE deal_id = d.id)
    ORDER BY d.updated_at DESC, d.id DESC`);
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
      beds: draft?.communities.reduce((s, c) => s + (Number(c.beds) || 0) + (Number(c.snfBeds) || 0), 0) ?? 0,
    };
  });
}

export async function createDeal(db: Client, customerName: string, now = new Date()): Promise<{ dealId: number; quoteId: number }> {
  const name = customerName.trim();
  if (!name) throw new Error('Customer name is required');
  const { book } = await loadPriceBook(db);
  const tx = await db.transaction('write');
  try {
    const deal = await tx.execute({ sql: 'INSERT INTO deals (customer_name) VALUES (?) RETURNING id', args: [name] });
    const dealId = Number(deal.rows[0].id);
    const quote = await tx.execute({ sql: "INSERT INTO quotes (deal_id, name) VALUES (?, 'Proposal') RETURNING id", args: [dealId] });
    const quoteId = Number(quote.rows[0].id);
    await tx.execute({
      sql: "INSERT INTO quote_versions (quote_id, version_no, status, inputs_json) VALUES (?, 1, 'draft', ?)",
      args: [quoteId, json(defaultDraft(name, book, now))],
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
  };
}

export async function getQuoteEditor(db: Client, quoteId: number): Promise<QuoteEditorData | null> {
  const q = await db.execute({ sql: 'SELECT id, deal_id, name FROM quotes WHERE id = ?', args: [quoteId] });
  if (!q.rows.length) return null;
  const vs = await db.execute({
    sql: `SELECT id, version_no, status, saved_at, sent_at, change_note, engine_version, outputs_json, guardrail_json, inputs_json, updated_at
          FROM quote_versions WHERE quote_id = ? ORDER BY version_no DESC`,
    args: [quoteId],
  });
  const draftRow = vs.rows.find((r) => r.status === 'draft');
  if (!draftRow) throw new Error(`Quote ${quoteId} has no draft`);
  const { products } = await loadPriceBook(db);
  return {
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

export async function saveDraft(db: Client, quoteId: number, draft: QuoteDraft): Promise<{ updatedAt: string }> {
  assertDraft(draft);
  const rs = await db.execute({
    sql: "UPDATE quote_versions SET inputs_json = ?, roi_case = ?, updated_at = datetime('now') WHERE quote_id = ? AND status = 'draft' RETURNING updated_at",
    args: [json(draft), draft.roiCase, quoteId],
  });
  if (!rs.rows.length) throw new Error(`Quote ${quoteId} has no draft`);
  await db.execute({
    sql: "UPDATE deals SET customer_name = ?, updated_at = datetime('now') WHERE id = (SELECT deal_id FROM quotes WHERE id = ?)",
    args: [draft.customerName.trim() || 'Untitled customer', quoteId],
  });
  return { updatedAt: String(rs.rows[0].updated_at) };
}

export function computeOutputs(draft: QuoteDraft, book: PriceBook): { outputs: StoredOutputs; guardrails: GuardrailResult } {
  const inputs = toModelInputs(draft);
  const { traces: _traces, ...model } = runModel(inputs);
  const { trace: _capexTrace, ...capex } = computeCapex(inputs, draft.commercial.capexDiscountRate);
  const outputs: StoredOutputs = { ...model, capex };
  const guardrails = evaluateGuardrails(draft, book[SKU.platform]?.list ?? 99, {
    ble: book[SKU.ecallBle]?.list ?? 10,
    inovonics: book[SKU.ecallInovonics]?.list ?? 15,
  });
  return { outputs, guardrails };
}

/**
 * Freeze the current draft as a saved version (outputs computed here, on the
 * server, from the stored inputs) and open the next draft as a copy.
 */
export async function saveVersion(db: Client, quoteId: number, changeNote: string | null): Promise<{ versionId: number; versionNo: number }> {
  const { book } = await loadPriceBook(db);
  const tx = await db.transaction('write');
  try {
    const d = await tx.execute({ sql: "SELECT id, version_no, inputs_json FROM quote_versions WHERE quote_id = ? AND status = 'draft'", args: [quoteId] });
    if (!d.rows.length) throw new Error(`Quote ${quoteId} has no draft`);
    const versionId = Number(d.rows[0].id);
    const versionNo = Number(d.rows[0].version_no);
    const inputsJson = String(d.rows[0].inputs_json);
    const draft = normalizeDraft(JSON.parse(inputsJson) as QuoteDraft);
    const { outputs, guardrails } = computeOutputs(draft, book);

    await tx.execute({
      sql: `UPDATE quote_versions SET status = 'saved', engine_version = ?, outputs_json = ?, guardrail_json = ?, inputs_hash = ?,
              change_note = ?, roi_case = ?, saved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      args: [ENGINE_VERSION, json(outputs), json(guardrails), createHash('sha256').update(inputsJson).digest('hex'), changeNote?.trim() || null, draft.roiCase, versionId],
    });
    for (const [i, c] of draft.communities.entries()) {
      await tx.execute({
        sql: `INSERT INTO communities (quote_version_id, position, name, market, beds, snf_beds, coverage, ecall, is_pilot, pilot_units, occupancy, go_live_month, roi_delay_months, additional_sensors)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [versionId, i, c.name, c.market, c.beds, c.snfBeds, c.coverage, c.ecall ? 1 : 0, c.pilot ? 1 : 0, c.pilotUnits, c.occupancy, c.goLiveMonth, c.roiDelayMonths, c.additionalSensors],
      });
    }
    // Record what would need approval — the foundation for the approval workflow. Nothing blocks yet.
    for (const f of guardrails.findings.filter((x) => x.requiredApprover)) {
      await tx.execute({
        sql: 'INSERT INTO approval_events (quote_version_id, rule_code, required_role, note) VALUES (?, ?, ?, ?)',
        args: [versionId, f.code, f.requiredApprover!, f.message],
      });
    }
    await tx.execute({
      sql: "INSERT INTO quote_versions (quote_id, version_no, parent_version_id, status, roi_case, inputs_json) VALUES (?, ?, ?, 'draft', ?, ?)",
      args: [quoteId, versionNo + 1, versionId, draft.roiCase, inputsJson],
    });
    await tx.execute({ sql: "UPDATE deals SET updated_at = datetime('now') WHERE id = (SELECT deal_id FROM quotes WHERE id = ?)", args: [quoteId] });
    await tx.commit();
    return { versionId, versionNo };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** A frozen version's stored inputs and outputs — exactly what was saved. */
export async function getVersion(db: Client, versionId: number) {
  const rs = await db.execute({ sql: 'SELECT * FROM quote_versions WHERE id = ?', args: [versionId] });
  if (!rs.rows.length) return null;
  const r = rs.rows[0];
  return {
    ...versionSummary(r),
    quoteId: Number(r.quote_id),
    inputs: normalizeDraft(JSON.parse(String(r.inputs_json)) as QuoteDraft),
    outputs: r.outputs_json ? (JSON.parse(String(r.outputs_json)) as StoredOutputs) : null,
    guardrails: r.guardrail_json ? (JSON.parse(String(r.guardrail_json)) as GuardrailResult) : null,
  };
}
