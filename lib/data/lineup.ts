/** The core products line-up (lib/pricing/lineup): the current one, and saving a new version (admins). */
import type { Client } from '@libsql/client';
import { DEFAULT_LINEUP, normalizeLineup, ROLES, roleOf, SIDES, sameLineup, SIDE_LABEL, type ItemSpec, type Lineup, type LineupEntry } from '@/lib/pricing/lineup';
import { billingOf, type Product } from '@/lib/pricing/catalog';
import { DETAIL_COLS, productDetails } from './priceBook';

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
  const products = await activeProducts(db);
  const next = withItemDetails(normalizeLineup(raw), products);
  // Core products and combinations added in the price book hold items priced from their details only (built-in
  // items price by their own rules wherever they're listed).
  for (const c of next.cores) {
    if (DEFAULT_LINEUP.cores.some((d) => d.id === c.id)) continue;
    for (const s of SIDES) for (const en of c.sides[s].items) if (!en.item) throw bad(`${c.name}: only items priced from their details can go in a core product added in the price book.`);
  }
  for (const x of next.combos) {
    if (x.builtin) continue;
    if (!x.with.length && !x.replace.length) throw bad('A combination needs items to replace or to add.');
    for (const en of x.with) if (!en.item) throw bad('A combination can only add items priced from their details.');
    for (const r of x.replace) if (!products.get(r)?.generic) throw bad('A combination can only replace items priced from their details.');
  }
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

/** Active products with their item details. */
async function activeProducts(db: Client): Promise<Map<string, Product>> {
  const rs = await db.execute(`SELECT sku, name, pricing_model, list_price, description, item_code, ${DETAIL_COLS} FROM products WHERE active = 1`);
  return new Map(
    rs.rows.map((r) => [String(r.sku), { sku: String(r.sku), name: String(r.name), pricingModel: String(r.pricing_model) as Product['pricingModel'], list: Number(r.list_price), description: String(r.description ?? ''), itemCode: r.item_code == null ? null : String(r.item_code), ...productDetails(r as Record<string, unknown>) }]),
  );
}

/** A generic product's details, as a line-up version keeps them. */
export function specFrom(p: Product): ItemSpec {
  const billing = billingOf(p);
  return {
    name: p.name,
    code: p.itemCode ?? p.sku,
    list: p.list,
    billing,
    ...(billing === 'years' ? { everyYears: Math.max(1, p.everyYears ?? 1) } : {}),
    counted: p.counted ?? 'monitoredBeds',
    pilot: p.pilotRule ?? (billing === 'monthly' ? 'free' : 'credited'),
  };
}

/**
 * Every entry as the price book has it now: generic products carry their current details (name, SKU, list price,
 * billing, quantity, pilot rule); built-in ones carry none (their role prices them).
 */
export function withItemDetails(l: Lineup, products: Map<string, Product>): Lineup {
  const fix = (e: LineupEntry): LineupEntry => {
    const p = products.get(e.sku);
    if (p?.generic) return { sku: e.sku, item: specFrom(p) };
    const { item: _drop, ...rest } = e;
    return rest;
  };
  return {
    ...l,
    cores: l.cores.map((c) => ({ ...c, sides: { subscription: { ...c.sides.subscription, items: c.sides.subscription.items.map(fix) }, capex: { ...c.sides.capex, items: c.sides.capex.items.map(fix) } } })),
    combos: l.combos.map((x) => ({ ...x, with: x.with.map(fix) })),
  };
}
