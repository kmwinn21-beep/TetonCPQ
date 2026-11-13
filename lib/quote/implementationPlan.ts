/**
 * Implementation plan: the stages from contract to go-live, worked backward
 * from each pilot community's go-live date. Lengths default to the "Path to
 * Go Live" slide (plus Evaluation & Contracting) and can be changed per deal.
 * Stages may overlap the one before (the slide's Implementation starts in the
 * last week of Kick-off, Baseline in the last week of Implementation).
 * The go-live date is the first day of the Training & Go live stage.
 */

export const STAGE_KEYS = ['evaluation', 'kickoff', 'implementation', 'baseline', 'golive'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export interface StageSetting {
  weeks: number;
  /** Weeks this stage starts before the previous one ends. */
  overlapWeeks: number;
}
export type ImplementationPlan = Record<StageKey, StageSetting>;

export interface StageInfo {
  key: StageKey;
  name: string;
  /** Standard weeks / overlap. */
  weeks: number;
  overlapWeeks: number;
  /** Whether the overlap can be set (the first two stages run back to back). */
  canOverlap: boolean;
  description: string;
}

export const STAGES: StageInfo[] = [
  { key: 'evaluation', name: 'Evaluation & Contracting', weeks: 8, overlapWeeks: 0, canOverlap: false, description: 'Review the proposal, complete security and legal review, and sign the order form.' },
  {
    key: 'kickoff',
    name: 'Kick-off',
    weeks: 2,
    overlapWeeks: 0,
    canOverlap: false,
    description: 'Corporate and community kick-off calls: pilot scope, communication plan and steering committee cadence; meet your account and customer success managers.',
  },
  {
    key: 'implementation',
    name: 'Implementation',
    weeks: 3,
    overlapWeeks: 1,
    canOverlap: true,
    description: 'Virtual tour and floor-plan markup, family education sessions and consents, and professional hardware installation.',
  },
  { key: 'baseline', name: 'Baseline', weeks: 5, overlapWeeks: 1, canOverlap: true, description: 'Teton runs in the background for 30 days to collect baseline health data for each consenting resident.' },
  {
    key: 'golive',
    name: 'Training & Go live',
    weeks: 1,
    overlapWeeks: 0,
    canOverlap: true,
    description: 'Onsite staff training on the mobile and desktop apps, personalized alerts, live support and troubleshooting, then go live.',
  },
];

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, StageInfo>;

export function defaultPlan(): ImplementationPlan {
  return Object.fromEntries(STAGES.map((s) => [s.key, { weeks: s.weeks, overlapWeeks: s.overlapWeeks }])) as ImplementationPlan;
}

/** Fill in stages missing from older drafts; clamp to sane values. */
export function normalizePlan(p: Partial<Record<StageKey, Partial<StageSetting>>> | null | undefined): ImplementationPlan {
  const out = defaultPlan();
  let prevWeeks = 0;
  for (const s of STAGES) {
    const raw = p?.[s.key];
    const weeks = Math.max(0, Math.round(Number(raw?.weeks ?? s.weeks)) || 0);
    const overlap = s.canOverlap ? Math.min(Math.max(0, Math.round(Number(raw?.overlapWeeks ?? s.overlapWeeks)) || 0), prevWeeks) : 0;
    out[s.key] = { weeks, overlapWeeks: overlap };
    prevWeeks = weeks;
  }
  return out;
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const toTime = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface ScheduledStage {
  key: StageKey;
  name: string;
  /** First day, ISO date. */
  start: string;
  /** Last day (inclusive), ISO date. */
  end: string;
  /** Week numbers counted from kick-off (week 1); evaluation is before week 1. */
  fromWeek: number;
  toWeek: number;
  weeks: number;
}

export interface Schedule {
  goLive: string;
  stages: ScheduledStage[];
  /** When Evaluation & Contracting has to begin. */
  contractStart: string;
  /** Kick-off start. */
  kickoff: string;
  /** Whole weeks from contract start to go-live. */
  weeksToGoLive: number;
}

/** Stage offsets in weeks from kick-off start (kick-off = 0), plus where go-live falls. */
function offsets(plan: ImplementationPlan) {
  const p = normalizePlan(plan);
  const rel: Array<{ key: StageKey; start: number; weeks: number }> = [];
  let prevEnd = 0;
  for (const s of STAGES.slice(1)) {
    const start = s.key === 'kickoff' ? 0 : prevEnd - p[s.key].overlapWeeks;
    rel.push({ key: s.key, start, weeks: p[s.key].weeks });
    prevEnd = start + p[s.key].weeks;
  }
  const goLiveAt = rel[rel.length - 1].start;
  return { p, rel, goLiveAt };
}

/** Work a plan backward from a go-live date. */
export function scheduleFor(goLive: string, plan: ImplementationPlan): Schedule {
  const { p, rel, goLiveAt } = offsets(plan);
  const kickoff = toTime(goLive) - goLiveAt * WEEK;
  const evalWeeks = p.evaluation.weeks;
  const stages: ScheduledStage[] = [
    {
      key: 'evaluation',
      name: STAGE_BY_KEY.evaluation.name,
      start: toIso(kickoff - evalWeeks * WEEK),
      end: toIso(kickoff - DAY),
      fromWeek: 1 - evalWeeks,
      toWeek: 0,
      weeks: evalWeeks,
    },
    ...rel.map((r) => ({
      key: r.key,
      name: STAGE_BY_KEY[r.key].name,
      start: toIso(kickoff + r.start * WEEK),
      end: toIso(kickoff + (r.start + r.weeks) * WEEK - DAY),
      fromWeek: r.start + 1,
      toWeek: r.start + r.weeks,
      weeks: r.weeks,
    })),
  ];
  return { goLive: goLive.slice(0, 10), stages, contractStart: stages[0].start, kickoff: toIso(kickoff), weeksToGoLive: evalWeeks + goLiveAt };
}

/** Weeks from contract start to go-live for a plan. */
export const weeksToGoLive = (plan: ImplementationPlan) => normalizePlan(plan).evaluation.weeks + offsets(plan).goLiveAt;

/** Earliest go-live reachable if contracting starts on `today`, moved to the following Monday. */
export function earliestGoLive(today: string, plan: ImplementationPlan): string {
  const t = toTime(today) + weeksToGoLive(plan) * WEEK;
  const dow = new Date(t).getUTCDay(); // 0 Sun … 6 Sat
  return toIso(t + ((8 - dow) % 7) * DAY);
}

/** "Weeks 2–4" style label for a stage's place in the plan. */
export function weekLabel(s: ScheduledStage, short = false): string {
  if (s.key === 'evaluation') return short ? 'before kick-off' : `${s.weeks} ${s.weeks === 1 ? 'week' : 'weeks'} before kick-off`;
  if (s.weeks <= 0) return 'none';
  return s.fromWeek === s.toWeek ? `Week ${s.fromWeek}` : `Weeks ${s.fromWeek}–${s.toWeek}`;
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
