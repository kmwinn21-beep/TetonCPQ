/**
 * Implementation plan: the stages from contract to go-live, worked backward
 * from each pilot community's go-live date. It starts from the "Path to Go
 * Live" slide (plus Evaluation & Contracting); per deal, stages can be
 * lengthened, overlapped, removed, reordered, or added (custom stages).
 *
 * Stages run in order; each may start some weeks before the previous one
 * ends (the slide's Implementation starts in the last week of Kick-off).
 * Go-live is the first day of the Training & Go live stage, or the day after
 * the last stage ends if that stage was removed. Weeks are numbered from
 * Kick-off (week 1), or from the first stage after Evaluation & Contracting.
 */

export const STAGE_KEYS = ['evaluation', 'queue', 'kickoff', 'implementation', 'baseline', 'golive'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export interface StageInfo {
  key: StageKey;
  name: string;
  weeks: number;
  overlapWeeks: number;
  description: string;
}

/** The standard stages, in order, with their standard lengths. */
export const STAGES: StageInfo[] = [
  { key: 'evaluation', name: 'Evaluation & Contracting', weeks: 8, overlapWeeks: 0, description: 'Review the proposal, complete security and legal review, and sign the order form.' },
  {
    key: 'queue',
    name: 'Implementation Queue',
    weeks: 2,
    overlapWeeks: 0,
    description: 'Estimated timeframe for Teton to allocate implementation/customer success resources to project and for pre-project planning & provisioning.',
  },
  {
    key: 'kickoff',
    name: 'Kick-off',
    weeks: 2,
    overlapWeeks: 0,
    description: 'Corporate and community kick-off calls: pilot scope, communication plan and steering committee cadence; meet your account and customer success managers.',
  },
  { key: 'implementation', name: 'Implementation', weeks: 3, overlapWeeks: 1, description: 'Virtual tour and floor-plan markup, family education sessions and consents, and professional hardware installation.' },
  { key: 'baseline', name: 'Baseline', weeks: 5, overlapWeeks: 1, description: 'Teton runs in the background for 30 days to collect baseline health data for each consenting resident.' },
  { key: 'golive', name: 'Training & Go live', weeks: 1, overlapWeeks: 0, description: 'Onsite staff training on the mobile and desktop apps, personalized alerts, live support and troubleshooting, then go live.' },
];
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, StageInfo>;
const isStandard = (id: string): id is StageKey => (STAGE_KEYS as readonly string[]).includes(id);

export interface PlanStage {
  name: string;
  weeks: number;
  /** Weeks this stage starts before the previous one ends. */
  overlapWeeks: number;
  /** Shown on the proposal. Standard stages fall back to the standard text. */
  description: string;
}

/** Stage ids in order (standard keys, or "custom-…"), and each stage's settings. */
export interface ImplementationPlan {
  order: string[];
  stages: Record<string, PlanStage>;
  /** 2 = includes the Implementation Queue stage by default (plans saved before it get it added once). */
  version?: number;
}

const PLAN_VERSION = 2;

export const MAX_STAGES = 12;
const ID = /^[a-z][a-z0-9-]{0,40}$/;

export function standardStage(key: StageKey): PlanStage {
  const s = STAGE_BY_KEY[key];
  return { name: s.name, weeks: s.weeks, overlapWeeks: s.overlapWeeks, description: s.description };
}

export function defaultPlan(): ImplementationPlan {
  return { order: [...STAGE_KEYS], stages: Object.fromEntries(STAGE_KEYS.map((k) => [k, standardStage(k)])), version: PLAN_VERSION };
}

const int = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = Math.round(Number(v ?? fallback));
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fallback;
};

/**
 * Validate a stored or edited plan; clamp values. Plans saved before stages
 * could change were a record of the five standard stages: they convert.
 */
export function normalizePlan(input: unknown): ImplementationPlan {
  if (!input || typeof input !== 'object') return defaultPlan();
  const raw = input as Record<string, unknown>;
  let order: string[];
  let stages: Record<string, Partial<PlanStage>>;
  if (Array.isArray(raw.order) && raw.stages && typeof raw.stages === 'object') {
    order = (raw.order as unknown[]).filter((x): x is string => typeof x === 'string');
    stages = raw.stages as Record<string, Partial<PlanStage>>;
    // Plans saved before Implementation Queue was a standard stage get it, after Evaluation & Contracting.
    if ((Number(raw.version) || 1) < 2 && !order.includes('queue')) {
      const at = order.indexOf('evaluation');
      order = [...order];
      order.splice(at >= 0 ? at + 1 : 0, 0, 'queue');
      stages = { ...stages, queue: standardStage('queue') };
    }
  } else {
    // Legacy: { evaluation: { weeks, overlapWeeks }, kickoff: {…}, … }
    order = [...STAGE_KEYS];
    stages = Object.fromEntries(STAGE_KEYS.map((k) => [k, { ...standardStage(k), ...((raw[k] as Partial<PlanStage>) ?? {}) }]));
  }
  const out: ImplementationPlan = { order: [], stages: {}, version: PLAN_VERSION };
  let prevWeeks = 0;
  for (const id of order) {
    if (!ID.test(id) || out.order.includes(id) || out.order.length >= MAX_STAGES) continue;
    const s = stages[id];
    if (!s || typeof s !== 'object') continue;
    const std = isStandard(id) ? STAGE_BY_KEY[id] : null;
    const weeks = int(s.weeks, std?.weeks ?? 1, 0, 52);
    const overlap = out.order.length === 0 ? 0 : int(s.overlapWeeks, std?.overlapWeeks ?? 0, 0, prevWeeks);
    const name = String(s.name ?? std?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || std?.name || 'New stage';
    const description = String(s.description ?? std?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    out.order.push(id);
    out.stages[id] = { name, weeks, overlapWeeks: overlap, description };
    prevWeeks = weeks;
  }
  return out;
}

/**
 * The standard stages, lengths and overlaps, keeping any names given to the
 * standard stages that are in the plan ("Reset to standard" keeps renames).
 */
export function resetToStandard(p: ImplementationPlan): ImplementationPlan {
  const cur = normalizePlan(p);
  const d = defaultPlan();
  for (const k of STAGE_KEYS) if (cur.stages[k]) d.stages[k] = { ...d.stages[k], name: cur.stages[k].name };
  return d;
}

/** Standard stages, lengths and overlaps (names may differ). */
export const isDefaultPlan = (p: ImplementationPlan) => JSON.stringify(normalizePlan(p)) === JSON.stringify(resetToStandard(p));

/** Standard stages not in the plan (so they can be added back). */
export const removedStandardStages = (p: ImplementationPlan) => STAGES.filter((s) => !p.order.includes(s.key));

/** Add a standard stage back, in its standard place. */
export function restoreStage(p: ImplementationPlan, key: StageKey): ImplementationPlan {
  if (p.order.includes(key)) return p;
  const pos = STAGE_KEYS.indexOf(key);
  const after = STAGE_KEYS.slice(0, pos).reverse().find((k) => p.order.includes(k));
  const order = [...p.order];
  order.splice(after ? order.indexOf(after) + 1 : 0, 0, key);
  return normalizePlan({ order, stages: { ...p.stages, [key]: standardStage(key) }, version: PLAN_VERSION });
}

/** Add a custom stage, before Training & Go live (or at the end). Returns the plan and the new id. */
export function addCustomStage(p: ImplementationPlan, name = 'New stage', weeks = 1): { plan: ImplementationPlan; id: string } {
  const id = `custom-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const order = [...p.order];
  const at = order.indexOf('golive');
  order.splice(at >= 0 ? at : order.length, 0, id);
  return { plan: normalizePlan({ order, stages: { ...p.stages, [id]: { name, weeks, overlapWeeks: 0, description: '' } }, version: PLAN_VERSION }), id };
}

export function removeStage(p: ImplementationPlan, id: string): ImplementationPlan {
  if (p.order.length <= 1) return p;
  const stages = { ...p.stages };
  delete stages[id];
  return normalizePlan({ order: p.order.filter((x) => x !== id), stages, version: PLAN_VERSION });
}

export function moveStage(p: ImplementationPlan, id: string, by: -1 | 1): ImplementationPlan {
  const i = p.order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= p.order.length) return p;
  const order = [...p.order];
  [order[i], order[j]] = [order[j], order[i]];
  return normalizePlan({ order, stages: p.stages, version: PLAN_VERSION });
}

export function updateStage(p: ImplementationPlan, id: string, patch: Partial<PlanStage>): ImplementationPlan {
  if (!p.stages[id]) return p;
  return normalizePlan({ order: p.order, stages: { ...p.stages, [id]: { ...p.stages[id], ...patch } }, version: PLAN_VERSION });
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const toTime = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface ScheduledStage {
  id: string;
  name: string;
  description: string;
  /** Standard stage key, if this is one. */
  standard: StageKey | null;
  /** First day, ISO date. */
  start: string;
  /** Last day (inclusive), ISO date. */
  end: string;
  /** Week numbers counted from week 1 (Kick-off); 0 or less is before week 1. */
  fromWeek: number;
  toWeek: number;
  weeks: number;
}

export interface Schedule {
  goLive: string;
  stages: ScheduledStage[];
  /** When the first stage has to begin (Evaluation & Contracting, normally). */
  contractStart: string;
  /** Whole weeks from the first stage's start to go-live. */
  weeksToGoLive: number;
}

/** Stage starts in weeks, relative to the first stage, and where go-live and week 1 fall. */
function layout(plan: ImplementationPlan) {
  const p = normalizePlan(plan);
  const rel: Array<{ id: string; start: number; weeks: number }> = [];
  let prevEnd = 0;
  p.order.forEach((id, i) => {
    const s = p.stages[id];
    const start = i === 0 ? 0 : prevEnd - s.overlapWeeks;
    rel.push({ id, start, weeks: s.weeks });
    prevEnd = start + s.weeks;
  });
  const lastEnd = Math.max(0, ...rel.map((r) => r.start + r.weeks));
  const golive = rel.find((r) => r.id === 'golive');
  const goLiveAt = golive ? golive.start : lastEnd;
  // Week 1 is Kick-off, else the first stage after Evaluation & Contracting, else the first stage.
  const anchor = rel.find((r) => r.id === 'kickoff') ?? rel.find((r) => r.id !== 'evaluation') ?? rel[0];
  return { p, rel, goLiveAt, week1: anchor ? anchor.start : 0 };
}

/** Work a plan backward from a go-live date. */
export function scheduleFor(goLive: string, plan: ImplementationPlan): Schedule {
  const { p, rel, goLiveAt, week1 } = layout(plan);
  const zero = toTime(goLive) - goLiveAt * WEEK; // first stage's start
  const stages: ScheduledStage[] = rel.map((r) => ({
    id: r.id,
    name: p.stages[r.id].name,
    description: p.stages[r.id].description || (isStandard(r.id) ? STAGE_BY_KEY[r.id].description : ''),
    standard: isStandard(r.id) ? r.id : null,
    start: toIso(zero + r.start * WEEK),
    end: toIso(zero + (r.start + r.weeks) * WEEK - DAY),
    fromWeek: r.start - week1 + 1,
    toWeek: r.start - week1 + r.weeks,
    weeks: r.weeks,
  }));
  return { goLive: goLive.slice(0, 10), stages, contractStart: stages[0]?.start ?? goLive.slice(0, 10), weeksToGoLive: goLiveAt };
}

/** Weeks from the first stage's start to go-live. */
export const weeksToGoLive = (plan: ImplementationPlan) => layout(plan).goLiveAt;

/** Earliest go-live reachable if the first stage starts on `today`, moved to the following Monday. */
export function earliestGoLive(today: string, plan: ImplementationPlan): string {
  const t = toTime(today) + weeksToGoLive(plan) * WEEK;
  const dow = new Date(t).getUTCDay(); // 0 Sun … 6 Sat
  return toIso(t + ((8 - dow) % 7) * DAY);
}

/** "Weeks 2–4", "Week 9", or "Before kick-off" for stages before week 1. */
export function weekLabel(s: ScheduledStage, short = false): string {
  if (s.weeks <= 0) return 'none';
  // Stages before week 1 (e.g. Evaluation & Contracting, Implementation Queue): their length is shown alongside.
  if (s.toWeek <= 0) return short ? 'before kick-off' : 'Before kick-off';
  const from = Math.max(s.fromWeek, 1);
  return from === s.toWeek ? `Week ${from}` : `Weeks ${from}–${s.toWeek}`;
}

export interface PilotGroup {
  goLive: string;
  names: string[];
  schedule: Schedule;
}

/** Pilot communities grouped by go-live date (earliest first), each with its schedule. */
export function pilotGroups(pilots: Array<{ name: string; goLive: string }>, plan: ImplementationPlan): PilotGroup[] {
  const by = new Map<string, string[]>();
  for (const p of pilots) {
    const k = p.goLive.slice(0, 10);
    by.set(k, [...(by.get(k) ?? []), p.name || 'Unnamed community']);
  }
  return Array.from(by.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([goLive, names]) => ({ goLive, names, schedule: scheduleFor(goLive, plan) }));
}

/** Plain-language differences between two plans, for version notes and comparisons. */
export function planChanges(before: ImplementationPlan, after: ImplementationPlan): string[] {
  const a = normalizePlan(before);
  const b = normalizePlan(after);
  const out: string[] = [];
  for (const id of a.order) if (!b.stages[id]) out.push(`removed ${a.stages[id].name}`);
  for (const id of b.order) {
    const s = b.stages[id];
    const was = a.stages[id];
    if (!was) {
      out.push(`added ${s.name} (${s.weeks} wk)`);
      continue;
    }
    if (was.name !== s.name) out.push(`renamed ${was.name} to ${s.name}`);
    if (was.weeks !== s.weeks) out.push(`${s.name} ${was.weeks} → ${s.weeks} wk`);
    if (was.overlapWeeks !== s.overlapWeeks) out.push(`${s.name} overlap ${was.overlapWeeks} → ${s.overlapWeeks} wk`);
    if (was.description !== s.description) out.push(`${s.name} description edited`);
  }
  const kept = (o: string[], other: ImplementationPlan) => o.filter((id) => other.stages[id]);
  if (kept(a.order, b).join() !== kept(b.order, a).join()) out.push('stages reordered');
  return out;
}
