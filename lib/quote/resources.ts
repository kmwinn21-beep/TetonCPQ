/**
 * Estimated resource allocation: which of the customer's roles take part in
 * each implementation stage, for roughly how many hours, doing what. Each
 * role appears once (it can span several stages). Shown on the proposal as
 * "[Company] Estimated Resource Allocation".
 *
 * Stored on the draft as `resources` (an ordered list; empty = none).
 * Entries for stages no longer in the plan are kept but not shown.
 */
import { normalizePlan, type ImplementationPlan } from './implementationPlan';

export const DEFAULT_ROLES = ['Executive Director', 'Clinical Leadership', 'Operations Leadership', 'Director of Nursing', 'IT', 'Facilities Director', 'Corporate Leadership'] as const;

export interface StageEffort {
  hours: number;
  note: string;
}

export interface ResourceRole {
  id: string;
  /** Role or department name; '' until chosen. */
  role: string;
  /** Typed in (not one of the defaults). */
  custom: boolean;
  /** By implementation stage id. */
  stages: Record<string, StageEffort>;
}

export type Resources = ResourceRole[];

const ID = /^[a-z][a-z0-9-]{0,40}$/;
const MAX_ROLES = 30;
const key = (s: string) => s.trim().toLowerCase();

const newId = () => `r-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Validate stored or edited resources. Duplicate roles (same name, any case) keep the first. */
export function normalizeResources(input: unknown): Resources {
  if (!Array.isArray(input)) return [];
  const out: Resources = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_ROLES)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : newId();
    if (out.some((x) => x.id === id)) continue;
    const role = String(r.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (role && seen.has(key(role))) continue;
    if (role) seen.add(key(role));
    const stages: Record<string, StageEffort> = {};
    if (r.stages && typeof r.stages === 'object' && !Array.isArray(r.stages)) {
      for (const [sid, v] of Object.entries(r.stages as Record<string, unknown>)) {
        if (!ID.test(sid) || !v || typeof v !== 'object') continue;
        const e = v as Record<string, unknown>;
        const hours = Math.min(Math.max(Math.round(Number(e.hours) * 2) / 2 || 0, 0), 999);
        stages[sid] = { hours, note: String(e.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) };
      }
    }
    const custom = !!r.custom || (!!role && !(DEFAULT_ROLES as readonly string[]).includes(role));
    out.push({ id, role, custom, stages });
  }
  return out;
}

/** Default roles not yet used (for the role menu). */
export const availableRoles = (rs: Resources, except?: string) =>
  DEFAULT_ROLES.filter((r) => !rs.some((x) => x.id !== except && key(x.role) === key(r)));

/** Whether a role name is already used by another card. */
export const roleTaken = (rs: Resources, name: string, except?: string) => rs.some((x) => x.id !== except && key(x.role) === key(name));

export function addRole(rs: Resources, role = '', custom = false): { resources: Resources; id: string } {
  if (role && roleTaken(rs, role)) throw new Error(`${role} is already listed`);
  const id = newId();
  return { resources: [...normalizeResources(rs), { id, role, custom, stages: {} }], id };
}

export function updateRole(rs: Resources, id: string, patch: Partial<Pick<ResourceRole, 'role' | 'custom'>>): Resources {
  if (patch.role && roleTaken(rs, patch.role, id)) throw new Error(`${patch.role} is already listed`);
  return normalizeResources(rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

export const removeRole = (rs: Resources, id: string): Resources => normalizeResources(rs.filter((r) => r.id !== id));

export function moveRole(rs: Resources, id: string, by: -1 | 1): Resources {
  const i = rs.findIndex((r) => r.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= rs.length) return rs;
  const out = [...rs];
  [out[i], out[j]] = [out[j], out[i]];
  return normalizeResources(out);
}

/** Tick or untick a stage for a role. */
export function toggleStage(rs: Resources, id: string, stageId: string): Resources {
  return normalizeResources(
    rs.map((r) => {
      if (r.id !== id) return r;
      const stages = { ...r.stages };
      if (stageId in stages) delete stages[stageId];
      else stages[stageId] = { hours: 0, note: '' };
      return { ...r, stages };
    }),
  );
}

export function setEffort(rs: Resources, id: string, stageId: string, patch: Partial<StageEffort>): Resources {
  return normalizeResources(rs.map((r) => (r.id === id && r.stages[stageId] ? { ...r, stages: { ...r.stages, [stageId]: { ...r.stages[stageId], ...patch } } } : r)));
}

/* ------------------------------------------------------------------ */
/* For display                                                         */
/* ------------------------------------------------------------------ */

export interface AllocationTable {
  /** Stages (in plan order) that at least one named role works in. */
  stages: Array<{ id: string; name: string }>;
  rows: Array<{ id: string; role: string; hours: Record<string, number>; total: number; notes: Array<{ stage: string; hours: number; note: string }> }>;
  stageTotals: Record<string, number>;
  total: number;
}

/** Roles × stages, limited to stages in the plan and roles with a name. */
export function allocationTable(rs: Resources, planInput: ImplementationPlan): AllocationTable {
  const plan = normalizePlan(planInput);
  const named = normalizeResources(rs).filter((r) => r.role);
  const used = plan.order.filter((sid) => named.some((r) => sid in r.stages));
  const stages = used.map((id) => ({ id, name: plan.stages[id].name }));
  const stageTotals: Record<string, number> = Object.fromEntries(used.map((s) => [s, 0]));
  const rows = named.map((r) => {
    const hours: Record<string, number> = {};
    const notes: AllocationTable['rows'][number]['notes'] = [];
    for (const s of stages) {
      const e = r.stages[s.id];
      if (!e) continue;
      hours[s.id] = e.hours;
      stageTotals[s.id] += e.hours;
      notes.push({ stage: s.name, hours: e.hours, note: e.note });
    }
    return { id: r.id, role: r.role, hours, total: Object.values(hours).reduce((a, b) => a + b, 0), notes };
  });
  return { stages, rows, stageTotals, total: rows.reduce((a, r) => a + r.total, 0) };
}

export const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hr' : 'hrs'}`;

/** Plain-language differences, for version notes and comparisons. */
export function resourcesChanges(before: Resources, after: Resources, planInput: ImplementationPlan): string[] {
  const a = normalizeResources(before);
  const b = normalizeResources(after);
  const plan = normalizePlan(planInput);
  const stageName = (sid: string) => plan.stages[sid]?.name ?? 'removed stage';
  const name = (r: ResourceRole) => r.role || 'Unnamed role';
  const out: string[] = [];
  for (const r of a) if (!b.some((x) => x.id === r.id)) out.push(`removed ${name(r)}`);
  for (const r of b) {
    const was = a.find((x) => x.id === r.id);
    if (!was) {
      const h = Object.values(r.stages).reduce((s, e) => s + e.hours, 0);
      out.push(`added ${name(r)}${h ? ` (${fmtHours(h)})` : ''}`);
      continue;
    }
    if (was.role !== r.role) out.push(`renamed ${name(was)} to ${name(r)}`);
    for (const sid of Object.keys(was.stages)) if (!(sid in r.stages)) out.push(`${name(r)}: removed ${stageName(sid)}`);
    for (const [sid, e] of Object.entries(r.stages)) {
      const p = was.stages[sid];
      if (!p) out.push(`${name(r)}: added ${stageName(sid)} (${fmtHours(e.hours)})`);
      else {
        if (p.hours !== e.hours) out.push(`${name(r)}: ${stageName(sid)} ${p.hours} → ${fmtHours(e.hours)}`);
        if (p.note !== e.note) out.push(`${name(r)}: ${stageName(sid)} note edited`);
      }
    }
  }
  const kept = (xs: Resources, ys: Resources) => xs.filter((x) => ys.some((y) => y.id === x.id)).map((x) => x.id).join();
  if (kept(a, b) !== kept(b, a)) out.push('roles reordered');
  return out;
}
