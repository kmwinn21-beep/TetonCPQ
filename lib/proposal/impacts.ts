/**
 * Business case, "What the program returns": which parts of the organization each source of value impacts.
 * A row's impacts are department keys or custom entries (name, color, icon); rows without a saved list use the
 * defaults below.
 */
export const DEPARTMENTS = {
  sales: { name: 'Sales', color: 'coral', icon: 'trend' },
  revenue: { name: 'Revenue', color: 'green', icon: 'dollar' },
  residents: { name: 'Residents', color: 'lavender', icon: 'home' },
  corporate: { name: 'Corporate', color: 'slate', icon: 'building' },
  clinical: { name: 'Clinical', color: 'blue', icon: 'cross' },
  operations: { name: 'Operations', color: 'amber', icon: 'gear' },
  care: { name: 'Care Staff', color: 'pink', icon: 'carer' },
} as const;
export type DeptKey = keyof typeof DEPARTMENTS;
export const DEPT_KEYS = Object.keys(DEPARTMENTS) as DeptKey[];

/** Ink and tint for each color. */
export const IMPACT_COLORS = {
  coral: ['#C9502F', '#FDECE7'],
  green: ['#2E8F5A', '#E6F5EC'],
  lavender: ['#5B52C9', '#EEECFD'],
  slate: ['#4A5563', '#ECEEF1'],
  blue: ['#2F74C0', '#E8F2FD'],
  amber: ['#A9751A', '#FDF3DF'],
  pink: ['#B83E78', '#FBE9F2'],
  teal: ['#0E8A8A', '#E2F5F4'],
} as const;
export type ImpactColor = keyof typeof IMPACT_COLORS;

/** Icons a custom entry can use (the departments' own icons are listed too). */
export const CUSTOM_ICONS = ['star', 'shield', 'heart', 'chart', 'clock', 'people', 'key', 'leaf', 'bolt', 'phone', 'pill', 'flag'] as const;
export type ImpactIcon = (typeof CUSTOM_ICONS)[number] | (typeof DEPARTMENTS)[DeptKey]['icon'];
const ALL_ICONS = new Set<string>([...CUSTOM_ICONS, ...DEPT_KEYS.map((k) => DEPARTMENTS[k].icon)]);

export type CustomImpact = { name: string; color: ImpactColor; icon: ImpactIcon };
export type ImpactItem = DeptKey | CustomImpact;

/** Defaults by source of value (the benefit rows' keys). */
export const DEFAULT_IMPACTS: Record<string, DeptKey[]> = {
  'roi.benefit.care': ['revenue', 'clinical', 'residents'],
  'roi.benefit.moveIn': ['sales', 'revenue'],
  'roi.benefit.staffing': ['operations', 'care', 'clinical'],
  'roi.benefit.los': ['residents', 'revenue', 'clinical'],
  'roi.benefit.tech': ['corporate', 'operations'],
  'roi.benefit.falls': ['residents', 'corporate', 'clinical', 'care'],
};

export const impactsFor = (saved: Record<string, ImpactItem[]> | undefined, row: string): ImpactItem[] => saved?.[row] ?? DEFAULT_IMPACTS[row] ?? [];

/** Name, ink, tint and icon of an entry. */
export function impactLook(it: ImpactItem): { name: string; ink: string; tint: string; icon: ImpactIcon; key: string } {
  if (typeof it === 'string') {
    const d = DEPARTMENTS[it];
    const [ink, tint] = IMPACT_COLORS[d.color];
    return { name: d.name, ink, tint, icon: d.icon, key: it };
  }
  const [ink, tint] = IMPACT_COLORS[it.color];
  return { name: it.name, ink, tint, icon: it.icon, key: `c:${it.name.toLowerCase()}:${it.color}:${it.icon}` };
}

const MAX_ROWS = 40;
const MAX_ITEMS = 10;

/** Keeps saved impacts well-formed (unknown departments, colors or icons are dropped). */
export function sanitizeImpacts(raw: unknown): Record<string, ImpactItem[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, ImpactItem[]> = {};
  for (const [row, list] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_ROWS)) {
    if (!/^[\w.-]{1,60}$/.test(row) || !Array.isArray(list)) continue;
    const items: ImpactItem[] = [];
    for (const it of list.slice(0, MAX_ITEMS)) {
      if (typeof it === 'string' && it in DEPARTMENTS) items.push(it as DeptKey);
      else if (it && typeof it === 'object') {
        const c = it as Partial<CustomImpact>;
        const name = String(c.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
        if (name && typeof c.color === 'string' && c.color in IMPACT_COLORS && typeof c.icon === 'string' && ALL_ICONS.has(c.icon)) items.push({ name, color: c.color as ImpactColor, icon: c.icon as ImpactIcon });
      }
    }
    out[row] = items;
  }
  return Object.keys(out).length ? out : undefined;
}
