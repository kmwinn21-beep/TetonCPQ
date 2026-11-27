/** The core products line-up (lib/pricing/lineup): the current one, and saving a new version (admins). */
import type { Client } from '@libsql/client';
import { DEFAULT_LINEUP, normalizeLineup, ROLES, roleOf, SIDES, sameLineup, SIDE_LABEL, type Lineup } from '@/lib/pricing/lineup';

export interface LineupInfo {
  lineup: Lineup;
  savedAt: string | null;
  savedBy: string | null;
}

/** The current line-up (the default until an admin saves one). */
export async function getLineup(db: Client): Promise<LineupInfo> {
  try {
    const r = (await db.execute('SELECT l.version, l.lineup_json, l.created_at, u.name FROM lineup_versions l LEFT JOIN users u ON u.id = l.created_by ORDER BY l.version DESC LIMIT 1')).rows[0];
    if (!r) return { lineup: structuredClone(DEFAULT_LINEUP), savedAt: null, savedBy: null };
    return { lineup: { ...normalizeLineup(JSON.parse(String(r.lineup_json))), version: Number(r.version) }, savedAt: String(r.created_at), savedBy: r.name == null ? null : String(r.name) };
  } catch {
    // Before the migration.
    return { lineup: structuredClone(DEFAULT_LINEUP), savedAt: null, savedBy: null };
  }
}

const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * Save a new version. `baseVersion` is the version the admin started from: if someone saved since, it is refused
 * (409) so one admin's changes don't silently replace another's. Every item must be in the price book, and built-in
 * items only go where they price (a subscription item can't go under equipment purchase).
 */
export async function saveLineup(db: Client, raw: unknown, userId: number | null, baseVersion: number): Promise<LineupInfo> {
  const cur = await getLineup(db);
  if (cur.lineup.version !== baseVersion) throw bad('Someone saved the core products since you opened them. Reload to see their changes.', 409);
  const next = normalizeLineup(raw);
  const rs = await db.execute('SELECT sku, name FROM products WHERE active = 1');
  const names = new Map(rs.rows.map((r) => [String(r.sku), String(r.name)]));
  for (const c of next.cores) {
    for (const s of SIDES) {
      for (const en of c.sides[s].items) {
        if (!names.has(en.sku)) throw bad(`${c.name}: an item isn’t in the price book (${en.sku}).`);
        const role = roleOf(en);
        if (role && ROLES[role].side !== 'both' && ROLES[role].side !== s) throw bad(`${c.name}: ${names.get(en.sku)} is priced with ${ROLES[role].side === 'capex' ? 'equipment purchase' : 'the subscription'}, so it can’t go under ${SIDE_LABEL[s].toLowerCase()}.`);
      }
    }
  }
  for (const x of next.combos) for (const en of x.with) if (!names.has(en.sku)) throw bad(`A combination uses an item that isn’t in the price book (${en.sku}).`);
  if (sameLineup(next, cur.lineup)) return cur;
  const version = cur.lineup.version + 1;
  const toStore: Lineup = { ...next, version };
  await db.execute({ sql: 'INSERT INTO lineup_versions (version, lineup_json, created_by) VALUES (?, ?, ?)', args: [version, JSON.stringify(toStore), userId] });
  return getLineup(db);
}

/** A saved version of the line-up (version 0: the default), or null if there is no such version. */
export async function lineupVersion(db: Client, version: number): Promise<Lineup | null> {
  if (version === 0) return structuredClone(DEFAULT_LINEUP);
  try {
    const r = (await db.execute({ sql: 'SELECT lineup_json FROM lineup_versions WHERE version = ?', args: [version] })).rows[0];
    return r ? { ...normalizeLineup(JSON.parse(String(r.lineup_json))), version } : null;
  } catch {
    return null;
  }
}

/**
 * A deal's copy of the line-up must be one the price book saved: it decides which items are free, so it can't be
 * edited from the browser (that would make items free without any guardrail noticing).
 */
export async function assertKnownLineup(db: Client, draft: { lineup?: Lineup | null }): Promise<void> {
  if (!draft.lineup) return;
  const l = normalizeLineup(draft.lineup);
  const saved = await lineupVersion(db, l.version);
  if (!saved || !sameLineup(saved, l)) throw bad('This deal’s core products don’t match the price book. Reload the deal and try again.');
}
