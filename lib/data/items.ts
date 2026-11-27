/**
 * Adding items to the price book and editing their details (admins). Items added here are priced generically
 * (lib/pricing/items). Built-in items keep their pricing rules: their wording and description can change; a few
 * (CONVERTIBLE) can switch to being priced from their own details.
 *
 * Whenever a generic item changes, the line-up's copy of it is refreshed as a new line-up version (new deals use
 * it; open deals show "Update this deal"), so a deal always prices with the version it was built with.
 */
import { PACK_IDS, TINT_IDS, TINTS, packIcon } from '@/lib/resources/iconPack';
import type { Client } from '@libsql/client';
import { BUILTIN_DETAILS, COUNT_BASES, pricingModelFor, type Billing, type CountBasis, type PerUnit, type PilotRule } from '@/lib/pricing/catalog';
import { CATEGORIES } from '@/lib/pricing/markets';
import { CONVERTIBLE, OFFER_LOCKED, SIDES, sameLineup, type Side } from '@/lib/pricing/lineup';
import { listPriceBookRows, norm, type PriceBookRow } from './priceBook';
import { getLineup, saveLineup, withItemDetails, type LineupInfo } from './lineup';

const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });
const PERS: PerUnit[] = ['bed', 'room', 'sensor', 'device', 'community', 'flat'];

export interface ItemInput {
  name: unknown;
  itemCode: unknown;
  category: unknown;
  sub: unknown;
  billing: unknown;
  everyYears?: unknown;
  per: unknown;
  counted: unknown;
  pilotRule?: unknown;
  list: unknown;
  description?: unknown;
  /** Icon from the icon pack and its tint (optional: unset uses the category's icon). */
  icon?: unknown;
  iconTint?: unknown;
  /** Also add it to a core product, for a way to buy (turned on there if it was off). */
  addTo?: { core: unknown; side: unknown } | null;
}

/** Details as given, checked (names can't say "pilot" or "introductory": proposals use those words to mark pilot lines). */
function details(b: Partial<ItemInput>, partial: boolean) {
  const out: { billing?: Billing; everyYears?: number | null; per?: PerUnit; counted?: CountBasis; pilotRule?: PilotRule; category?: string; sub?: string; description?: string } = {};
  if (b.billing !== undefined || !partial) {
    if (b.billing !== 'monthly' && b.billing !== 'once' && b.billing !== 'years') throw bad('Choose how it bills: monthly, one-time or every N years');
    out.billing = b.billing;
  }
  if (b.everyYears !== undefined || out.billing === 'years') {
    const n = Math.floor(Number(b.everyYears));
    if (out.billing === 'years' || b.billing === undefined) {
      if (!Number.isFinite(n) || n < 1 || n > 20) throw bad('Every how many years? Use 1–20');
      out.everyYears = n;
    }
  }
  if (out.billing && out.billing !== 'years') out.everyYears = null;
  if (b.per !== undefined || !partial) {
    if (!PERS.includes(b.per as PerUnit)) throw bad('Choose what one unit is');
    out.per = b.per as PerUnit;
  }
  if (b.counted !== undefined || !partial) {
    if (!COUNT_BASES.includes(b.counted as CountBasis)) throw bad('Choose what the quantity is');
    out.counted = b.counted as CountBasis;
  }
  if (b.pilotRule !== undefined || out.billing) {
    const monthly = out.billing ? out.billing === 'monthly' : null;
    const allowed = monthly === null ? ['free', 'charged', 'credited', 'none'] : monthly ? ['free', 'charged'] : ['credited', 'none'];
    out.pilotRule = (allowed.includes(String(b.pilotRule)) ? b.pilotRule : allowed[0]) as PilotRule;
  }
  if (b.category !== undefined || !partial) {
    if (!(CATEGORIES as readonly string[]).includes(String(b.category))) throw bad('Choose a category');
    out.category = String(b.category);
  }
  if (b.sub !== undefined || !partial) {
    const s = String(b.sub ?? '').trim().replace(/\s+/g, ' ');
    if (s.length < 2 || s.length > 40) throw bad('Name the group it goes in (2–40 characters)');
    out.sub = s;
  }
  if (b.description !== undefined) out.description = String(b.description ?? '').trim().slice(0, 400);
  return out;
}

async function others(db: Client, sku: string | null) {
  const rs = await db.execute({ sql: 'SELECT sku, name, item_code FROM products WHERE sku <> ?', args: [sku ?? ''] });
  return rs.rows.map((r) => ({ sku: String(r.sku), name: String(r.name), code: r.item_code == null ? null : String(r.item_code) }));
}

/** The name, checked: 2–80 characters, not used by another item (lower case, spaces ignored), no pilot words. */
export async function checkName(db: Client, raw: unknown, sku: string | null): Promise<string> {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw bad('Use 2–80 characters for the name');
  if (/pilot|introductory/i.test(name)) throw bad('Leave “pilot” and “introductory” out of the name: proposals use those words to mark pilot and intro-rate lines.');
  const taken = (await others(db, sku)).find((o) => norm(o.name) === norm(name));
  if (taken) throw bad(`“${taken.name}” already exists`);
  return name;
}

/** The SKU, checked: letters, digits and dashes, not used by another item. */
export async function checkCode(db: Client, raw: unknown, sku: string | null): Promise<string> {
  const code = String(raw ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code)) throw bad('Use 2–32 letters, digits and dashes for the SKU');
  const taken = (await others(db, sku)).find((o) => o.code != null && norm(o.code) === norm(code));
  if (taken) throw bad(`${code} is already used by ${taken.name}`);
  return code;
}

/** The next free SKU in a series, e.g. TT-CAP-014 after TT-CAP-013. */
export async function nextFreeCode(db: Client, prefix: string): Promise<string> {
  const p = prefix.trim().toUpperCase().replace(/-?\d*$/, '');
  const used = new Set((await others(db, null)).map((o) => (o.code ?? '').toUpperCase()));
  let n = 1;
  for (const c of used) {
    const m = c.match(new RegExp(`^${p.replace(/[-]/g, '\\-')}-(\\d+)$`));
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  let code = `${p}-${String(n).padStart(3, '0')}`;
  while (used.has(code)) code = `${p}-${String(++n).padStart(3, '0')}`;
  return code;
}

async function log(db: Client, sku: string, field: string, oldValue: string | null, newValue: string | null, userId: number | null) {
  await db.execute({ sql: 'INSERT INTO product_history (sku, field, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?)', args: [sku, field, oldValue, newValue, userId] });
}

/** Refresh the line-up's copy of generic items (a new version when anything changed). */
export async function refreshLineupItems(db: Client, userId: number | null): Promise<LineupInfo | null> {
  const cur = await getLineup(db);
  const rows = await listPriceBookRows(db);
  const next = withItemDetails(cur.lineup, new Map(rows.map((r) => [r.sku, r])));
  if (sameLineup(next, cur.lineup)) return null;
  return saveLineup(db, next, userId, cur.lineup.version);
}

const row = async (db: Client, sku: string): Promise<PriceBookRow> => {
  const r = (await listPriceBookRows(db)).find((x) => x.sku === sku);
  if (!r) throw bad('Item not found', 404);
  return r;
};

/** Add an item (priced from its details), optionally straight into a core product. */
export async function createItem(db: Client, b: ItemInput, userId: number | null): Promise<{ item: PriceBookRow; lineup: LineupInfo | null }> {
  const name = await checkName(db, b.name, null);
  const code = await checkCode(db, b.itemCode, null);
  const d = details(b, false);
  const list = Number(b.list);
  if (!Number.isFinite(list) || list < 0 || list > 1_000_000) throw bad('Enter a list price ($0 or more)');
  let sku = '';
  for (let i = 0; !sku || (await db.execute({ sql: 'SELECT 1 FROM products WHERE sku = ?', args: [sku] })).rows.length; i++) sku = `ITEM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await db.execute({
    sql: `INSERT INTO products (sku, name, pricing_model, list_price, description, item_code, billing, every_years, per_unit, counted, pilot_rule, category, sub, generic, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`,
    args: [sku, name, pricingModelFor(d.billing!, d.per), Math.round(list * 100) / 100, d.description ?? '', code, d.billing!, d.everyYears ?? null, d.per!, d.counted!, d.pilotRule!, d.category!, d.sub!, userId],
  });
  await log(db, sku, 'created', null, `${code} · ${name}`, userId);
  const ic = iconOf(b.icon, b.iconTint);
  if (ic.icon) await db.execute({ sql: 'UPDATE products SET icon = ?, icon_tint = ? WHERE sku = ?', args: [ic.icon, ic.tint, sku] });
  let lineup: LineupInfo | null = null;
  if (b.addTo) {
    const side = b.addTo.side === 'capex' ? 'capex' : b.addTo.side === 'subscription' ? 'subscription' : null;
    const cur = await getLineup(db);
    const core = cur.lineup.cores.find((c) => c.id === String(b.addTo!.core));
    if (!core || !side) throw bad('Choose a core product and a way to buy');
    const next = structuredClone(cur.lineup);
    const c = next.cores.find((x) => x.id === core.id)!;
    c.sides[side].items.push({ sku });
    // Adding it turns that way to buy on for the core product (where it can be switched).
    if (!OFFER_LOCKED.has(c.id)) c.sides[side].offered = true;
    const rows = await listPriceBookRows(db);
    lineup = await saveLineup(db, withItemDetails(next, new Map(rows.map((r) => [r.sku, r]))), userId, cur.lineup.version);
  }
  return { item: await row(db, sku), lineup };
}

export interface DetailsPatch {
  billing?: unknown;
  everyYears?: unknown;
  per?: unknown;
  counted?: unknown;
  pilotRule?: unknown;
  category?: unknown;
  sub?: unknown;
  description?: unknown;
  /** Built-in items in CONVERTIBLE: true = priced from these details from now on; false = back to built-in rules. */
  generic?: unknown;
}

/** Edit an item's details. Built-in items: wording and description, or switching a convertible one (see CONVERTIBLE). */
export async function updateItemDetails(db: Client, sku: string, p: DetailsPatch, userId: number | null): Promise<{ item: PriceBookRow; lineup: LineupInfo | null }> {
  const cur = await row(db, sku);
  const builtin = !!BUILTIN_DETAILS[sku] || cur.pricingModel === 'multiplier';
  const convertible = !!CONVERTIBLE[sku];
  let generic = !!cur.generic;
  if (p.generic !== undefined) {
    if (!convertible) throw bad(builtin ? 'This item prices by its built-in rules; it can’t switch.' : 'Items added in the price book are always priced from their details.');
    generic = p.generic === true;
  }
  const pricingFields = ['billing', 'everyYears', 'counted', 'pilotRule'] as const;
  if (builtin && !generic && pricingFields.some((f) => p[f] !== undefined)) {
    throw bad(convertible ? 'Switch it to “priced from these details” first.' : 'How this item bills is part of its built-in pricing rules (pilot rates, credits, bundles), so it can’t change here. To bill it another way, add a new item and swap it into the core product.');
  }
  if (builtin && (p.category !== undefined || p.sub !== undefined)) throw bad('Built-in items stay in their place in the price book.');
  // Fill what wasn't sent from the item as it is (switching a built-in item: its built-in counting and pilot rule).
  const switching = p.generic === true && !cur.generic;
  const given: Partial<ItemInput> = {
    ...p,
    ...(p.billing === undefined && (switching || p.everyYears !== undefined || p.pilotRule !== undefined) ? { billing: cur.billing ?? 'once' } : {}),
    ...(p.everyYears === undefined && cur.everyYears ? { everyYears: cur.everyYears } : {}),
    ...(p.counted === undefined && switching ? { counted: CONVERTIBLE[sku].counted } : {}),
    ...(p.pilotRule === undefined ? { pilotRule: switching ? CONVERTIBLE[sku].pilot : cur.pilotRule ?? undefined } : {}),
  };
  const d = details(given, true);
  const changes: Array<[string, string, unknown, unknown]> = [];
  const set = (col: string, field: string, was: unknown, next: unknown) => {
    if (next === undefined || (was ?? null) === (next ?? null)) return;
    changes.push([col, field, was, next]);
  };
  set('billing', 'billing', cur.billing ?? null, d.billing);
  set('every_years', 'every years', cur.everyYears ?? null, d.everyYears);
  set('per_unit', 'priced per', cur.per ?? null, d.per);
  set('counted', 'counted by', cur.counted ?? null, d.counted);
  set('pilot_rule', 'pilot', cur.pilotRule ?? null, d.pilotRule);
  set('category', 'category', cur.category ?? null, d.category);
  set('sub', 'group', cur.sub ?? null, d.sub);
  set('description', 'description', cur.description, d.description);
  if (generic !== !!cur.generic) changes.push(['generic', 'priced by', cur.generic ? 1 : 0, generic ? 1 : 0]);
  // Back to built-in rules: its built-in billing again (its other details are left as they were, unused).
  if (p.generic === false && BUILTIN_DETAILS[sku]) set('billing', 'billing', d.billing ?? cur.billing ?? null, BUILTIN_DETAILS[sku].billing);
  if (changes.length) {
    const billing = (changes.find((c) => c[0] === 'billing')?.[3] as Billing | undefined) ?? cur.billing ?? 'once';
    const per = (changes.find((c) => c[0] === 'per_unit')?.[3] as PerUnit | undefined) ?? cur.per ?? 'bed';
    const cols = changes.map((c) => `${c[0]} = ?`).join(', ');
    await db.execute({
      sql: `UPDATE products SET ${cols}${generic ? ', pricing_model = ?' : ''}, updated_by = ?, updated_at = datetime('now') WHERE sku = ?`,
      args: [...changes.map((c) => (c[3] as string | number | null) ?? null), ...(generic ? [pricingModelFor(billing, per)] : []), userId, sku],
    });
    const show = (v: unknown) => (v == null ? null : String(v));
    for (const c of changes) await log(db, sku, c[1], c[1] === 'priced by' ? (c[2] ? 'its details' : 'built-in rules') : show(c[2]), c[1] === 'priced by' ? (c[3] ? 'its details' : 'built-in rules') : show(c[3]), userId);
  }
  return { item: await row(db, sku), lineup: await refreshLineupItems(db, userId) };
}

/** An icon choice, checked: a pack icon and a tint (a missing or unknown tint: the icon's own default), or none. */
function iconOf(icon: unknown, tint: unknown): { icon: string | null; tint: string | null } {
  if (icon == null || icon === '') return { icon: null, tint: null };
  if (!PACK_IDS.has(String(icon))) throw bad('Choose an icon from the library');
  return { icon: String(icon), tint: TINT_IDS.has(String(tint)) ? String(tint) : null };
}

/** Set (or, with no icon, reset to its category's) an item's icon. Any item, built-in ones too: it's only how it looks. */
export async function setItemIcon(db: Client, sku: string, icon: unknown, tint: unknown, userId: number | null): Promise<PriceBookRow> {
  const cur = await row(db, sku);
  const next = iconOf(icon, tint);
  if ((cur.icon ?? null) === next.icon && (cur.iconTint ?? null) === next.tint) return cur;
  await db.execute({ sql: "UPDATE products SET icon = ?, icon_tint = ?, updated_by = ?, updated_at = datetime('now') WHERE sku = ? AND active = 1", args: [next.icon, next.tint, userId, sku] });
  const name = (i: string | null, t: string | null) => (i ? [packIcon(i)?.name ?? i, t ? TINTS[t]?.name : null].filter(Boolean).join(' · ') : 'Automatic');
  await log(db, sku, 'icon', name(cur.icon ?? null, cur.iconTint ?? null), name(next.icon, next.tint), userId);
  return row(db, sku);
}

/** Open deals whose copy of the line-up has this item (built-in items: every open deal without a copy, too). */
export async function openDealsWith(db: Client, sku: string): Promise<number> {
  const rs = await db.execute("SELECT inputs_json FROM quote_versions WHERE status = 'draft'");
  let n = 0;
  for (const r of rs.rows) {
    const d = JSON.parse(String(r.inputs_json)) as { lineup?: { cores?: Array<{ sides?: Record<Side, { items?: Array<{ sku: string }> }> }> } };
    if (!d.lineup) {
      if (BUILTIN_DETAILS[sku]) n++;
      continue;
    }
    if ((d.lineup.cores ?? []).some((c) => SIDES.some((s) => (c.sides?.[s]?.items ?? []).some((e) => e.sku === sku)))) n++;
  }
  return n;
}
