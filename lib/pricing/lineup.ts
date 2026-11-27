/**
 * The line-up: what each core product (the cards on the deal page) adds to a deal, for each way to buy, and the
 * combinations that swap items when two core products are on the same deal. Admins edit it in the price book
 * (Core products tab); each deal keeps a copy of the line-up it was built with, so editing it never changes a saved
 * deal. A deal without a copy uses DEFAULT_LINEUP, which is exactly how deals priced before the line-up existed.
 *
 * Built-in items keep their own pricing (pilot rates, credits, the bundle saving, E-Call per room or device, …): each
 * has a role here. An item counts on a deal while it is in at least one core product's list (or an enabled
 * combination) for that way to buy; take it out of every list and it is free on deals that use that line-up. Items
 * with no role (added in the price book) are priced generically and only when their core product is on the deal.
 */
import type { Commercial } from '@/lib/quote/draft';
import { SKU, COUNT_BASES, type Billing, type CountBasis, type PilotRule } from './catalog';

export type Side = 'subscription' | 'capex';
export const SIDES: Side[] = ['subscription', 'capex'];
export const SIDE_LABEL: Record<Side, string> = { subscription: 'Subscription', capex: 'Equipment purchase' };

/** The built-in core products (custom ones get ids like "core-…"). */
export type BuiltinCore = 'monitoring' | 'ecall' | 'commonArea' | 'finish';
export const BUILTIN_CORES: BuiltinCore[] = ['monitoring', 'ecall', 'commonArea', 'finish'];

/** A built-in item's pricing behaviour. */
export type RoleId =
  | 'platform'
  | 'install'
  | 'snf'
  | 'sensor'
  | 'ecallFee'
  | 'ecallDevice'
  | 'ecallInstall'
  | 'bundle'
  | 'commonAreaMonthly'
  | 'commonAreaSetup'
  | 'capexBase'
  | 'capexBaseEcall'
  | 'capexSoftware'
  | 'capexSoftwareUpfront'
  | 'capexSensor'
  | 'capexEcallInstall'
  | 'capexEcallSoftware'
  | 'capexEcallSoftwareUpfront'
  | 'capexRenewal'
  | 'finishLow'
  | 'finishHigh'
  | 'finishCredit';

export interface LineupEntry {
  sku: string;
  /** Built-in behaviour; missing for items added in the price book (and filled from the SKU for built-in ones). */
  role?: RoleId;
  /** Items priced generically: their details as of this line-up version (copied from the price book on save). */
  item?: ItemSpec;
}

/** A generically priced item, as a line-up version copied it from the price book. */
export interface ItemSpec {
  name: string;
  code: string;
  list: number;
  billing: Billing;
  everyYears?: number;
  counted: CountBasis;
  pilot: PilotRule;
}

export interface LineupSide {
  /** Offered this way: off greys the card out on deals sold this way. */
  offered: boolean;
  items: LineupEntry[];
}

export interface CoreProduct {
  id: string;
  name: string;
  note: string;
  /** A core product (a card) or an option (a chip under the cards). */
  kind: 'core' | 'option';
  sides: Record<Side, LineupSide>;
}

export interface Combination {
  id: string;
  /** All of these core products on the deal… */
  when: string[];
  side: Side;
  /** …with this E-Call system (built-in combinations), or any. */
  system?: 'ble' | 'inovonics';
  /** Items taken off the deal's item list… */
  replace: string[];
  /** …and the items shown instead. */
  with: LineupEntry[];
  enabled: boolean;
  /** Built-in: the bundle (can be turned off: no saving) or the base package with E-Call (always on). */
  builtin?: 'bundle' | 'capexEcallBase';
}

export interface Lineup {
  /** Increases with every save in the price book. */
  version: number;
  cores: CoreProduct[];
  combos: Combination[];
}

/** A built-in role: what it is, how it is counted, and what taking it out of every list means. */
export interface Role {
  id: RoleId;
  side: Side | 'both';
  counted: string;
  /** What removing the item from every list does to deals. */
  removed: string;
  /** The deal fields it prices (for "removed": these become free). */
  remove: (k: Commercial, system: 'ble' | 'inovonics' | null) => Commercial;
}

const set = <T extends object>(o: T, patch: Partial<T>): T => ({ ...o, ...patch });
const capex = (k: Commercial, patch: Partial<Commercial['capex']>): Commercial => ({ ...k, capex: { ...k.capex, ...patch } });

export const ROLES: Record<RoleId, Role> = {
  platform: { id: 'platform', side: 'subscription', counted: 'per monitored bed, per month (pilot and introductory rates apply)', removed: 'The subscription is free (pilot and intro rates too).', remove: (k) => set(k, { platformRate: 0, pilotRate: 0, specialRate: k.specialRate == null ? null : 0 }) },
  install: { id: 'install', side: 'subscription', counted: 'per monitored bed, one-time (credited on pilot sites)', removed: 'Installation is free.', remove: (k) => set(k, { installRate: 0 }) },
  snf: { id: 'snf', side: 'subscription', counted: 'per skilled nursing bed, per month (only when there are SNF beds)', removed: 'Skilled nursing beds are billed at the subscription rate.', remove: (k) => set(k, { snfRate: null }) },
  sensor: { id: 'sensor', side: 'subscription', counted: 'additional sensors from the scope, one-time', removed: 'Additional sensors are free.', remove: (k) => set(k, { sensorPrice: 0 }) },
  ecallFee: { id: 'ecallFee', side: 'subscription', counted: 'per E-Call room or device, per month', removed: 'E-Call is free (also during the pilot).', remove: (k) => set(k, { ecallRate: 0, ecallPilotRate: 0 }) },
  ecallDevice: { id: 'ecallDevice', side: 'subscription', counted: 'E-Call devices beyond the rooms, one-time', removed: 'Extra E-Call devices are free.', remove: (k, s) => set(k, { ecallDevices: { ...(k.ecallDevices ?? { bleButton: 100, inoPendant: 160, inoPullcord: 150 }), ...(s === 'inovonics' ? { inoPullcord: 0 } : { bleButton: 0 }) } }) },
  ecallInstall: { id: 'ecallInstall', side: 'subscription', counted: 'per E-Call-only bed, one-time', removed: 'E-Call installation is free.', remove: (k) => set(k, { ecallInstallRate: 0 }) },
  bundle: { id: 'bundle', side: 'subscription', counted: 'per bed with both, per month (subscription + E-Call less the saving)', removed: 'No bundle saving: the subscription and E-Call are billed separately.', remove: (k, s) => set(k, { bundleDiscount: { ...(k.bundleDiscount ?? { ble: 0, inovonics: 0 }), [s === 'inovonics' ? 'inovonics' : 'ble']: 0 } }) },
  commonAreaMonthly: { id: 'commonAreaMonthly', side: 'subscription', counted: 'per common-area sensor, per month (after the pilot)', removed: 'Common-area sensors have no monthly fee.', remove: (k) => set(k, { commonArea: { setup: k.commonArea?.setup ?? 0, monthly: 0 } }) },
  commonAreaSetup: { id: 'commonAreaSetup', side: 'subscription', counted: 'per common-area sensor, one-time (credited on pilot sites)', removed: 'Common-area setup is free.', remove: (k) => set(k, { commonArea: { monthly: k.commonArea?.monthly ?? 0, setup: 0 } }) },
  capexBase: { id: 'capexBase', side: 'capex', counted: 'per monitored bed without E-Call, one-time', removed: 'Base packages are free.', remove: (k) => capex(k, { basePrice: 0 }) },
  capexBaseEcall: { id: 'capexBaseEcall', side: 'capex', counted: 'per monitored bed with E-Call, one-time', removed: 'Base packages with E-Call are free.', remove: (k, s) => capex(k, s === 'inovonics' ? { inovonicsBasePrice: 0 } : { bleBasePrice: 0 }) },
  capexSoftware: { id: 'capexSoftware', side: 'capex', counted: 'per monitored bed, per month (when software bills monthly)', removed: 'Software & services are free (monthly).', remove: (k) => capex(k, { softwareRate: 0 }) },
  capexSoftwareUpfront: { id: 'capexSoftwareUpfront', side: 'capex', counted: 'per monitored bed, one-time (when software bills upfront)', removed: 'Software & services are free (upfront).', remove: (k) => capex(k, { softwareUpfront: 0 }) },
  capexSensor: { id: 'capexSensor', side: 'capex', counted: 'additional sensors from the scope, one-time', removed: 'Additional sensors are free.', remove: (k) => capex(k, { sensorPrice: 0 }) },
  capexEcallInstall: { id: 'capexEcallInstall', side: 'capex', counted: 'per E-Call-only bed, one-time', removed: 'E-Call-only installation is free.', remove: (k, s) => capex(k, s === 'inovonics' ? { ecallInstallInovonics: 0 } : { ecallInstallBle: 0 }) },
  capexEcallSoftware: { id: 'capexEcallSoftware', side: 'capex', counted: 'per E-Call-only bed, per month (when software bills monthly)', removed: 'E-Call software is free (monthly).', remove: (k) => capex(k, { ecallSoftware: 0 }) },
  capexEcallSoftwareUpfront: { id: 'capexEcallSoftwareUpfront', side: 'capex', counted: 'per E-Call-only bed, one-time (when software bills upfront)', removed: 'E-Call software is free (upfront).', remove: (k) => capex(k, { ecallSoftwareUpfront: 0 }) },
  capexRenewal: { id: 'capexRenewal', side: 'capex', counted: 'per E-Call bed, at each renewal (Bluetooth every 4 years, Inovonics every 3)', removed: 'E-Call renewals are free.', remove: (k, s) => capex(k, s === 'inovonics' ? { inovonicsRenewal: 0 } : { bleRenewal: 0 }) },
  finishLow: { id: 'finishLow', side: 'both', counted: 'per room, one-time (low end of the range)', removed: 'The low end of the concealed range is $0.', remove: (k) => set(k, { finish: { ...k.finish, low: 0 } }) },
  finishHigh: { id: 'finishHigh', side: 'both', counted: 'per room, one-time (high end of the range)', removed: 'The high end of the concealed range is $0.', remove: (k) => set(k, { finish: { ...k.finish, high: 0 } }) },
  finishCredit: { id: 'finishCredit', side: 'both', counted: 'per room, credited against the concealed price', removed: 'No standard installation credit.', remove: (k) => set(k, { finish: { ...k.finish, credit: 0 } }) },
};

/** The role a built-in SKU has by default (TETON-INSTALL also serves as E-Call installation, set on its entry). */
export const ROLE_BY_SKU: Record<string, RoleId> = {
  [SKU.platform]: 'platform',
  [SKU.install]: 'install',
  [SKU.snf]: 'snf',
  [SKU.sensor]: 'sensor',
  [SKU.ecallBle]: 'ecallFee',
  [SKU.ecallInovonics]: 'ecallFee',
  [SKU.ecallBleButton]: 'ecallDevice',
  [SKU.ecallInoPullcord]: 'ecallDevice',
  [SKU.bundleBle]: 'bundle',
  [SKU.bundleInovonics]: 'bundle',
  [SKU.commonAreaMonthly]: 'commonAreaMonthly',
  [SKU.commonAreaSetup]: 'commonAreaSetup',
  [SKU.capexBase]: 'capexBase',
  [SKU.capexBaseBle]: 'capexBaseEcall',
  [SKU.capexBaseInovonics]: 'capexBaseEcall',
  [SKU.capexSoftware]: 'capexSoftware',
  [SKU.capexSoftwareUpfront]: 'capexSoftwareUpfront',
  [SKU.capexSensor]: 'capexSensor',
  [SKU.capexEcallInstallBle]: 'capexEcallInstall',
  [SKU.capexEcallInstallInovonics]: 'capexEcallInstall',
  [SKU.capexEcallSoftware]: 'capexEcallSoftware',
  [SKU.capexEcallSoftwareUpfront]: 'capexEcallSoftwareUpfront',
  [SKU.capexBleRenewal]: 'capexRenewal',
  [SKU.capexInovonicsRenewal]: 'capexRenewal',
  [SKU.finishConcealedLow]: 'finishLow',
  [SKU.finishConcealedHigh]: 'finishHigh',
  [SKU.finishStandardCredit]: 'finishCredit',
};

/** The E-Call system a built-in SKU belongs to (null: either). */
export const SYSTEM_OF: Record<string, 'ble' | 'inovonics'> = {
  [SKU.ecallBle]: 'ble',
  [SKU.ecallInovonics]: 'inovonics',
  [SKU.ecallBleButton]: 'ble',
  [SKU.ecallInoPullcord]: 'inovonics',
  [SKU.bundleBle]: 'ble',
  [SKU.bundleInovonics]: 'inovonics',
  [SKU.capexBaseBle]: 'ble',
  [SKU.capexBaseInovonics]: 'inovonics',
  [SKU.capexEcallInstallBle]: 'ble',
  [SKU.capexEcallInstallInovonics]: 'inovonics',
  [SKU.capexBleRenewal]: 'ble',
  [SKU.capexInovonicsRenewal]: 'inovonics',
};

/** An entry's role (its own, or its SKU's), or undefined for an item priced generically. */
export const roleOf = (e: LineupEntry): RoleId | undefined => (e.item ? undefined : e.role ?? ROLE_BY_SKU[e.sku]);

const side = (offered: boolean, items: LineupEntry[]): LineupSide => ({ offered, items });
const e = (sku: string, role?: RoleId): LineupEntry => (role ? { sku, role } : { sku });

/** Today's rules: what every deal priced before the line-up existed. */
export const DEFAULT_LINEUP: Lineup = {
  version: 0,
  cores: [
    {
      id: 'monitoring',
      name: 'Resident monitoring',
      note: 'Teton sensors in resident rooms',
      kind: 'core',
      sides: {
        subscription: side(true, [e(SKU.platform), e(SKU.install), e(SKU.snf), e(SKU.sensor)]),
        capex: side(true, [e(SKU.capexBase), e(SKU.capexSoftware), e(SKU.capexSoftwareUpfront), e(SKU.capexSensor)]),
      },
    },
    {
      id: 'ecall',
      name: 'E-Call',
      note: 'Pendants and pull-cords',
      kind: 'core',
      sides: {
        subscription: side(true, [e(SKU.ecallBle), e(SKU.ecallInovonics), e(SKU.install, 'ecallInstall'), e(SKU.ecallBleButton), e(SKU.ecallInoPullcord)]),
        capex: side(true, [e(SKU.capexEcallInstallBle), e(SKU.capexEcallInstallInovonics), e(SKU.capexEcallSoftware), e(SKU.capexEcallSoftwareUpfront), e(SKU.capexBleRenewal), e(SKU.capexInovonicsRenewal)]),
      },
    },
    {
      id: 'commonArea',
      name: 'Common area sensors',
      note: 'Dining, halls, lounges; count per community',
      kind: 'core',
      sides: {
        subscription: side(true, [e(SKU.commonAreaMonthly), e(SKU.commonAreaSetup)]),
        capex: side(false, []),
      },
    },
    {
      id: 'finish',
      name: 'Concealed finish',
      note: 'Optional install add-on, quoted per room',
      kind: 'option',
      sides: {
        subscription: side(true, [e(SKU.finishConcealedLow), e(SKU.finishConcealedHigh), e(SKU.finishStandardCredit)]),
        capex: side(true, [e(SKU.finishConcealedLow), e(SKU.finishConcealedHigh), e(SKU.finishStandardCredit)]),
      },
    },
  ],
  combos: [
    { id: 'bundle-ble', when: ['monitoring', 'ecall'], side: 'subscription', system: 'ble', replace: [SKU.platform, SKU.ecallBle], with: [e(SKU.bundleBle)], enabled: true, builtin: 'bundle' },
    { id: 'bundle-inovonics', when: ['monitoring', 'ecall'], side: 'subscription', system: 'inovonics', replace: [SKU.platform, SKU.ecallInovonics], with: [e(SKU.bundleInovonics)], enabled: true, builtin: 'bundle' },
    { id: 'capex-ecall-ble', when: ['monitoring', 'ecall'], side: 'capex', system: 'ble', replace: [SKU.capexBase, SKU.capexEcallInstallBle, SKU.capexEcallSoftware], with: [e(SKU.capexBaseBle)], enabled: true, builtin: 'capexEcallBase' },
    { id: 'capex-ecall-inovonics', when: ['monitoring', 'ecall'], side: 'capex', system: 'inovonics', replace: [SKU.capexBase, SKU.capexEcallInstallInovonics, SKU.capexEcallSoftware], with: [e(SKU.capexBaseInovonics)], enabled: true, builtin: 'capexEcallBase' },
  ],
};

/** The line-up a deal prices with: its own copy, or the default (deals built before the line-up existed). */
export const lineupOf = (d: { lineup?: Lineup | null }): Lineup => d.lineup ?? DEFAULT_LINEUP;

/** The same rules (the version number aside). */
export const sameLineup = (a: Lineup, b: Lineup) => JSON.stringify({ c: a.cores, x: a.combos }) === JSON.stringify({ c: b.cores, x: b.combos });

/**
 * The built-in roles a line-up prices, per way to buy: in some core product's list, or in an enabled combination's
 * items (finish roles count for either way to buy). The base package with E-Call can't be turned off.
 */
export function pricedRoles(l: Lineup): Set<string> {
  const out = new Set<string>();
  const add = (s: Side, en: LineupEntry) => {
    const r = roleOf(en);
    if (!r) return;
    const k = ROLES[r].side === 'both' ? `both:${r}:${en.sku}` : `${s}:${r}:${en.sku}`;
    out.add(k);
  };
  for (const c of l.cores) for (const s of SIDES) for (const en of c.sides[s]?.items ?? []) add(s, en);
  for (const x of l.combos) if (x.enabled || x.builtin === 'capexEcallBase') for (const en of x.with) add(x.side, en);
  return out;
}

/** The built-in roles a line-up prices, cached per line-up object (line-ups are never mutated once built). */
const pricedCache = new WeakMap<Lineup, Set<string>>();
const pricedOf = (l: Lineup) => {
  let s = pricedCache.get(l);
  if (!s) pricedCache.set(l, (s = pricedRoles(l)));
  return s;
};

/** Every built-in (role, SKU) pair DEFAULT_LINEUP prices: the ones a deal's line-up can take away. */
const DEFAULT_PRICED = pricedRoles(DEFAULT_LINEUP);

/**
 * The deal's prices with the built-in items its line-up doesn't price set to free (see ROLES.removed). Returns the
 * same object when nothing is removed, so deals on the default line-up price exactly as before.
 */
export function effectiveCommercial(k: Commercial, lineup: Lineup | null | undefined): Commercial {
  if (!lineup) return k;
  const priced = pricedOf(lineup);
  let out = k;
  for (const key of DEFAULT_PRICED) {
    if (priced.has(key)) continue;
    const [, role, sku] = key.split(':') as [string, RoleId, string];
    out = ROLES[role].remove(out, SYSTEM_OF[sku] ?? null);
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** An item spec from storage (null when malformed). */
export function specOf(v: unknown): ItemSpec | null {
  if (!isObj(v)) return null;
  const billing = v.billing === 'monthly' || v.billing === 'once' || v.billing === 'years' ? v.billing : null;
  const counted = COUNT_BASES.includes(v.counted as CountBasis) ? (v.counted as CountBasis) : null;
  const list = Number(v.list);
  if (!billing || !counted || !Number.isFinite(list)) return null;
  const years = Math.floor(Number(v.everyYears));
  // Monthly items are free or billed during the pilot; one-time ones are credited on pilot sites or not.
  const allowed = billing === 'monthly' ? (['free', 'charged'] as const) : (['credited', 'none'] as const);
  const pilot: PilotRule = allowed.find((p) => p === v.pilot) ?? allowed[0];
  return { name: str(v.name) || 'Item', code: str(v.code, 40), list: Math.max(0, list), billing, ...(billing === 'years' ? { everyYears: years >= 1 ? years : 1 } : {}), counted, pilot };
}

/** A line-up from storage or a request: well-formed, with every built-in core product present (in its place). */
export function normalizeLineup(raw: unknown): Lineup {
  if (!isObj(raw)) return structuredClone(DEFAULT_LINEUP);
  const entries = (v: unknown): LineupEntry[] => {
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: LineupEntry[] = [];
    for (const x of v) {
      if (!isObj(x) || !str(x.sku)) continue;
      const item = specOf(x.item);
      const role = !item && typeof x.role === 'string' && x.role in ROLES ? (x.role as RoleId) : undefined;
      const k = `${x.sku}:${role ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item ? { sku: str(x.sku), item } : role && role !== ROLE_BY_SKU[str(x.sku)] ? { sku: str(x.sku), role } : { sku: str(x.sku) });
    }
    return out;
  };
  const sideOf = (v: unknown, fb: LineupSide): LineupSide => (isObj(v) ? { offered: v.offered !== false, items: entries(v.items) } : structuredClone(fb));
  const given = Array.isArray(raw.cores) ? raw.cores.filter(isObj) : [];
  const cores: CoreProduct[] = [];
  for (const c of given) {
    const id = str(c.id, 60);
    if (!id || cores.some((x) => x.id === id)) continue;
    const def = DEFAULT_LINEUP.cores.find((x) => x.id === id);
    if (!def && !/^core-[a-z0-9-]+$/.test(id)) continue;
    const sides = isObj(c.sides) ? c.sides : {};
    cores.push({
      id,
      name: str(c.name) || def?.name || 'Core product',
      note: str(c.note, 200) || (def?.note ?? ''),
      kind: def ? def.kind : c.kind === 'option' ? 'option' : 'core',
      sides: { subscription: sideOf(sides.subscription, def?.sides.subscription ?? side(true, [])), capex: sideOf(sides.capex, def?.sides.capex ?? side(true, [])) },
    });
    // Resident monitoring, E-Call and the finish are always offered both ways (see OFFER_LOCKED).
    if (def && (id === 'monitoring' || id === 'ecall' || id === 'finish')) for (const s of SIDES) cores[cores.length - 1].sides[s].offered = true;
  }
  // Built-in core products can't be removed: missing ones come back in their default place.
  DEFAULT_LINEUP.cores.forEach((def, i) => {
    if (!cores.some((x) => x.id === def.id)) cores.splice(Math.min(i, cores.length), 0, structuredClone(def));
  });
  const ids = new Set(cores.map((c) => c.id));
  const combos: Combination[] = [];
  for (const x of Array.isArray(raw.combos) ? raw.combos.filter(isObj) : []) {
    const id = str(x.id, 60);
    if (!id || combos.some((y) => y.id === id)) continue;
    const def = DEFAULT_LINEUP.combos.find((y) => y.id === id);
    if (def) {
      // Built-in combinations: only the bundle can be turned on or off; their items stay as they are.
      combos.push({ ...structuredClone(def), enabled: def.builtin === 'bundle' ? x.enabled !== false : true });
      continue;
    }
    if (!/^combo-[a-z0-9-]+$/.test(id)) continue;
    const when = (Array.isArray(x.when) ? x.when : []).map((w) => str(w, 60)).filter((w) => ids.has(w));
    if (when.length < 2) continue;
    combos.push({
      id,
      when: Array.from(new Set(when)),
      side: x.side === 'capex' ? 'capex' : 'subscription',
      replace: (Array.isArray(x.replace) ? x.replace : []).map((r) => str(r)).filter(Boolean),
      with: entries(x.with),
      enabled: x.enabled !== false,
    });
  }
  DEFAULT_LINEUP.combos.forEach((def) => {
    if (!combos.some((y) => y.id === def.id)) combos.push(structuredClone(def));
  });
  const version = Number.isFinite(Number(raw.version)) ? Math.max(0, Math.floor(Number(raw.version))) : 0;
  return { version, cores, combos };
}

/** The built-in roles a deal's line-up takes away (role:SKU), e.g. "install:TETON-INSTALL". Empty on the default. */
export function removedRoles(lineup: Lineup | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!lineup) return out;
  const priced = pricedOf(lineup);
  for (const key of DEFAULT_PRICED) if (!priced.has(key)) out.add(key.split(':').slice(1).join(':'));
  return out;
}

/** Whether a deal's line-up takes away a built-in role (for a SKU, or any of its SKUs). */
export const isRemoved = (removed: Set<string>, role: RoleId, sku?: string) => (sku ? removed.has(`${role}:${sku}`) : Array.from(removed).some((r) => r.startsWith(`${role}:`)));

/**
 * The draft as it prices: its own prices, with the built-in items its line-up takes away set to free. The same
 * object when nothing is taken away. Use it for pricing and for showing prices, never for editing or saving.
 */
export function pricedDraft<T extends { commercial: Commercial; lineup?: Lineup | null }>(d: T): T {
  const k = effectiveCommercial(d.commercial, d.lineup);
  return k === d.commercial ? d : { ...d, commercial: k };
}

/** A core product in a line-up. */
export const coreOf = (l: Lineup, id: string) => l.cores.find((c) => c.id === id);

/**
 * Built-in core products whose "offered" switches can't change: Resident monitoring, E-Call and the concealed finish
 * price the same way on both sides (the engine has one E-Call system and one finish per deal).
 */
export const OFFER_LOCKED = new Set<string>(['monitoring', 'ecall', 'finish']);

/** Whether a core product is offered for a structure (Both: offered either way). */
export function offeredFor(l: Lineup, id: string, structure: 'subscription' | 'capex' | 'both'): boolean {
  const c = coreOf(l, id);
  if (!c) return false;
  if (OFFER_LOCKED.has(id)) return true;
  return structure === 'both' ? c.sides.subscription.offered || c.sides.capex.offered : c.sides[structure].offered;
}

/**
 * Built-in items that can switch to being priced from their own details (lossless enough to offer): what they're
 * counted by, how pilots treat them, which built-in rules switching drops, and where a deal keeps their price.
 */
export const CONVERTIBLE: Record<string, { counted: CountBasis; pilot: PilotRule; drops: string; dealPrice: (k: Commercial) => number | null | undefined }> = {
  [SKU.sensor]: { counted: 'additionalSensors', pilot: 'none', drops: 'the deal’s “credit additional sensors too” option on pilot sites', dealPrice: (k) => k.sensorPrice },
  [SKU.capexSensor]: { counted: 'additionalSensors', pilot: 'none', drops: 'the conversion credit at pilot communities', dealPrice: (k) => k.capex?.sensorPrice },
  [SKU.commonAreaMonthly]: { counted: 'commonAreaSensors', pilot: 'free', drops: 'nothing (it prices the same way)', dealPrice: (k) => k.commonArea?.monthly },
  [SKU.commonAreaSetup]: { counted: 'commonAreaSensors', pilot: 'credited', drops: 'nothing (it prices the same way)', dealPrice: (k) => k.commonArea?.setup },
};
