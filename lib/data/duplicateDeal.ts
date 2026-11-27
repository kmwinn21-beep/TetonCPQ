/**
 * Duplicating a deal: a new deal the person owns, with the chosen version's inputs (or the unsaved draft) saved as
 * its v1 and that version's formatted proposal. Optionally its deal room content (files get their own records,
 * sharing the stored copy) and its questions for prospects (not the answers). Left behind: collaborators, floor plans
 * and their notes (room types keep their counts, lose their tags), legal entity and signatories (geography kept),
 * share links, comments, tasks, version history, agreement requests and activity.
 */
import type { Client } from '@libsql/client';
import { normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { normalizeCommonAreas, normalizeRoomTypes } from '@/lib/quote/roomTypes';
import { createDeal, saveDraft, saveVersion } from './quotes';
import { emptyDetails, getDealDetails } from './dealDetails';

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

export interface DuplicateInfo {
  name: string;
  owner: string | null;
  communities: number;
  /** Saved versions, newest first. */
  versions: Array<{ id: number; no: number; savedAt: string | null; active: boolean }>;
  /** The draft has changes not in the active version. */
  draftChanged: boolean;
  /** The deal room has content / questions to copy. */
  roomItems: number;
  questions: number;
}

const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null);

/** What the dialog needs about a deal. */
export async function duplicateInfo(db: Client, quoteId: number): Promise<DuplicateInfo> {
  const q = await db.execute({ sql: 'SELECT q.deal_id, q.active_version_id, d.customer_name, u.name AS owner FROM quotes q JOIN deals d ON d.id = q.deal_id LEFT JOIN users u ON u.id = d.owner_id WHERE q.id = ?', args: [quoteId] });
  if (!q.rows.length) throw httpError('Deal not found', 404);
  const dealId = Number(q.rows[0].deal_id);
  const active = q.rows[0].active_version_id == null ? null : Number(q.rows[0].active_version_id);
  const vs = await db.execute({ sql: "SELECT id, version_no, saved_at, status, inputs_json FROM quote_versions WHERE quote_id = ? ORDER BY version_no DESC", args: [quoteId] });
  const draft = vs.rows.find((r) => r.status === 'draft');
  const activeRow = vs.rows.find((r) => Number(r.id) === active);
  let draftChanged = !!draft && !activeRow;
  if (draft && activeRow) {
    try {
      draftChanged = stable(normalizeDraft(JSON.parse(String(draft.inputs_json)))) !== stable(normalizeDraft(JSON.parse(String(activeRow.inputs_json))));
    } catch {
      draftChanged = true;
    }
  }
  let communities = 0;
  try {
    communities = (JSON.parse(String((draft ?? activeRow)?.inputs_json ?? '{}')) as QuoteDraft).communities?.length ?? 0;
  } catch {
    /* ignore */
  }
  const n = async (sql: string) => Number((await db.execute({ sql, args: [dealId] })).rows[0].n);
  return {
    name: String(q.rows[0].customer_name),
    owner: q.rows[0].owner == null ? null : String(q.rows[0].owner),
    communities,
    versions: vs.rows.filter((r) => r.status !== 'draft').map((r) => ({ id: Number(r.id), no: Number(r.version_no), savedAt: r.saved_at == null ? null : String(r.saved_at), active: Number(r.id) === active })),
    draftChanged,
    roomItems: await n("SELECT COUNT(*) AS n FROM deal_resources WHERE deal_id = ? AND deleted_at IS NULL AND plan_id IS NULL AND kind <> 'floorplan'"),
    questions: await n('SELECT COUNT(*) AS n FROM deal_questions WHERE deal_id = ? AND deleted_at IS NULL'),
  };
}

/** Inputs with everything tied to the original's floor plans taken out: room types keep their counts, not their tags. */
export function withoutPlanTags(d: QuoteDraft): QuoteDraft {
  return {
    ...d,
    communities: d.communities.map((c) => {
      const out = { ...c } as typeof c;
      if (c.roomTypes !== undefined) {
        out.roomTypes = normalizeRoomTypes(c.roomTypes).map((t) => {
          const { marks: _m, roomsFromPlan: _f, ...rest } = t;
          return rest;
        });
      }
      if (c.commonAreas !== undefined) {
        out.commonAreas = normalizeCommonAreas(c.commonAreas).map((a) => {
          const { mark: _m, ...rest } = a;
          return rest;
        });
        // Their sensors were counted from the plan; now they're a typed-in count (the same total).
        delete (out as { commonAreaSensorsExtra?: number }).commonAreaSensorsExtra;
      }
      return out;
    }),
  };
}

export interface DuplicateOptions {
  name?: unknown;
  /** 'active' (default), 'draft', or a saved version's id. */
  from?: unknown;
  room?: unknown;
  questions?: unknown;
}

export async function duplicateDeal(db: Client, quoteId: number, userId: number, opts: DuplicateOptions = {}): Promise<{ dealId: number; quoteId: number; versionId: number }> {
  const src = await db.execute({ sql: 'SELECT q.deal_id, q.name, q.presentation, q.active_version_id, d.customer_name FROM quotes q JOIN deals d ON d.id = q.deal_id WHERE q.id = ?', args: [quoteId] });
  if (!src.rows.length) throw httpError('Deal not found', 404);
  const s = src.rows[0];
  const srcDealId = Number(s.deal_id);
  const srcName = String(s.customer_name);
  const activeId = s.active_version_id == null ? null : Number(s.active_version_id);
  const name = String(opts.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || `${srcName} (copy)`;

  // The inputs to copy and the version whose formatted proposal comes along.
  let inputsRow: { id: number; no: number; inputs: string };
  let formatFrom: number | null;
  const pick = async (sql: string, args: Array<string | number>) => {
    const r = await db.execute({ sql, args });
    return r.rows[0] ? { id: Number(r.rows[0].id), no: Number(r.rows[0].version_no), inputs: String(r.rows[0].inputs_json) } : null;
  };
  if (opts.from === 'draft') {
    const d = await pick("SELECT id, version_no, inputs_json FROM quote_versions WHERE quote_id = ? AND status = 'draft'", [quoteId]);
    if (!d) throw httpError('This deal has no draft');
    inputsRow = d;
    formatFrom = activeId;
  } else {
    const id = opts.from == null || opts.from === 'active' ? activeId : Number(opts.from);
    const v = id ? await pick("SELECT id, version_no, inputs_json FROM quote_versions WHERE id = ? AND quote_id = ? AND status <> 'draft'", [id, quoteId]) : null;
    if (!v) {
      // No saved version yet: the draft is all there is.
      const d = await pick("SELECT id, version_no, inputs_json FROM quote_versions WHERE quote_id = ? AND status = 'draft'", [quoteId]);
      if (!d || (opts.from != null && opts.from !== 'active')) throw httpError('That version wasn’t found');
      inputsRow = d;
      formatFrom = null;
    } else {
      inputsRow = v;
      formatFrom = v.id;
    }
  }
  const draft = withoutPlanTags({ ...normalizeDraft(JSON.parse(inputsRow.inputs)), customerName: name });
  const fromLabel = opts.from === 'draft' ? `${srcName} (unsaved changes)` : `${srcName} v${inputsRow.no}`;

  const created = await createDeal(db, name, { userId });
  try {
    await saveDraft(db, created.quoteId, draft);
    await db.execute({ sql: 'UPDATE quotes SET name = ?, presentation = ? WHERE id = ?', args: [String(s.name ?? 'Proposal'), String(s.presentation ?? 'opex'), created.quoteId] });
    const saved = await saveVersion(db, created.quoteId, `Duplicated from ${fromLabel}`, userId);

    // The formatted proposal (minus settings tied to the original's floor plans).
    if (formatFrom) {
      const pt = await db.execute({ sql: 'SELECT edits_json, layout_json FROM proposal_text WHERE quote_version_id = ?', args: [formatFrom] });
      if (pt.rows.length) {
        let layout = pt.rows[0].layout_json == null ? null : String(pt.rows[0].layout_json);
        try {
          if (layout) {
            const l = JSON.parse(layout) as { hiddenValues?: string[] };
            if (Array.isArray(l.hiddenValues)) l.hiddenValues = l.hiddenValues.filter((k) => typeof k === 'string' && !k.startsWith('fp.'));
            layout = JSON.stringify(l);
          }
        } catch {
          /* keep as is */
        }
        await db.execute({
          sql: `INSERT INTO proposal_text (quote_version_id, edits_json, layout_json, updated_by, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(quote_version_id) DO UPDATE SET edits_json = excluded.edits_json, layout_json = excluded.layout_json`,
          args: [saved.versionId, String(pt.rows[0].edits_json ?? '{}'), layout, userId],
        });
      }
    }

    // Deal details: geography only.
    const det = await getDealDetails(db, srcDealId);
    const details = { ...emptyDetails(), geography: det?.geography ?? '', geographyOther: det?.geographyOther ?? '' };
    await db.execute({
      sql: 'UPDATE deals SET details = ?, duplicated_from_deal = ?, duplicated_from_name = ?, duplicated_from_version = ? WHERE id = ?',
      args: [JSON.stringify(details), srcDealId, srcName, opts.from === 'draft' ? null : inputsRow.no, created.dealId],
    });

    if (opts.room !== false) await copyDealRoom(db, srcDealId, created.dealId, userId);
    if (opts.questions !== false) {
      await db.execute({
        sql: `INSERT INTO deal_questions (deal_id, position, body, kind, options, page, page_label, allow_change, created_by)
              SELECT ?, position, body, kind, options, page, page_label, allow_change, ? FROM deal_questions WHERE deal_id = ? AND deleted_at IS NULL ORDER BY position, id`,
        args: [created.dealId, userId, srcDealId],
      });
    }
    return { dealId: created.dealId, quoteId: created.quoteId, versionId: saved.versionId };
  } catch (e) {
    // Don't leave half a deal behind.
    const { deleteDeal } = await import('./deleteDeal');
    await deleteDeal(db, { dealId: created.dealId, quoteId: created.quoteId, canDelete: true } as never).catch(() => {});
    throw e;
  }
}

/** The deal room's settings and content (not floor plan cards, not what prospects viewed). Files get new records. */
async function copyDealRoom(db: Client, fromDeal: number, toDeal: number, userId: number) {
  await db.execute({
    sql: `INSERT INTO deal_rooms (deal_id, enabled, tab_name, heading, note, contact_user_id, show_booking, team, sections, novelty)
          SELECT ?, enabled, tab_name, heading, note, NULL, show_booking, team, sections, novelty FROM deal_rooms WHERE deal_id = ?`,
    args: [toDeal, fromDeal],
  });
  const rs = await db.execute({
    sql: "SELECT * FROM deal_resources WHERE deal_id = ? AND deleted_at IS NULL AND plan_id IS NULL AND kind <> 'floorplan' ORDER BY section_id, position, id",
    args: [fromDeal],
  });
  const fileMap = new Map<number, number>();
  for (const r of rs.rows) {
    let fileId: number | null = r.file_id == null ? null : Number(r.file_id);
    if (fileId != null) {
      if (!fileMap.has(fileId)) {
        const f = await db.execute({
          sql: `INSERT INTO stored_files (deal_id, name, mime, size, r2_key, chunks, complete, created_by)
                SELECT ?, name, mime, size, r2_key, chunks, complete, ? FROM stored_files WHERE id = ? AND deal_id = ? RETURNING id`,
          args: [toDeal, userId, fileId, fromDeal],
        });
        if (!f.rows.length) continue; // the file is gone: skip the card
        const nid = Number(f.rows[0].id);
        await db.execute({ sql: 'INSERT INTO stored_file_chunks (file_id, idx, data) SELECT ?, idx, data FROM stored_file_chunks WHERE file_id = ?', args: [nid, fileId] });
        fileMap.set(fileId, nid);
      }
      fileId = fileMap.get(fileId)!;
    }
    await db.execute({
      sql: `INSERT INTO deal_resources (deal_id, section_id, position, kind, title, description, hidden, allow_download, url, file_id, plan_id, page_id, meta, blocks, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      args: [toDeal, r.section_id, r.position, r.kind, r.title, r.description, r.hidden, r.allow_download, r.url, fileId, r.page_id, r.meta, r.blocks, userId],
    });
  }
}
