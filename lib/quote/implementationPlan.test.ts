import { describe, expect, it } from 'vitest';
import {
  addCustomStage,
  defaultPlan,
  earliestGoLive,
  isDefaultPlan,
  moveStage,
  normalizePlan,
  pilotGroups,
  planChanges,
  removedStandardStages,
  removeStage,
  resetToStandard,
  restoreStage,
  scheduleFor,
  updateStage,
  weekLabel,
  weeksToGoLive,
} from './implementationPlan';

const rows = (goLive: string, p = defaultPlan()) => scheduleFor(goLive, p).stages.map((x) => [x.id, x.start, x.end, weekLabel(x)]);

describe('implementation plan', () => {
  it('matches the Path to Go Live slide with the standard stages', () => {
    expect(rows('2027-02-01')).toEqual([
      ['evaluation', '2026-09-28', '2026-11-22', 'Before kick-off'],
      ['queue', '2026-11-23', '2026-12-06', 'Before kick-off'],
      ['kickoff', '2026-12-07', '2026-12-20', 'Weeks 1–2'],
      ['implementation', '2026-12-14', '2027-01-03', 'Weeks 2–4'],
      ['baseline', '2026-12-28', '2027-01-31', 'Weeks 4–8'],
      ['golive', '2027-02-01', '2027-02-07', 'Week 9'],
    ]);
    const s = scheduleFor('2027-02-01', defaultPlan());
    expect(s.contractStart).toBe('2026-09-28');
    expect(s.weeksToGoLive).toBe(18);
    expect(s.stages[1]).toMatchObject({ name: 'Implementation Queue', weeks: 2 });
    expect(isDefaultPlan(defaultPlan())).toBe(true);
  });

  it('shifts later stages when a length or overlap changes', () => {
    let p = updateStage(defaultPlan(), 'baseline', { weeks: 6 });
    p = updateStage(p, 'implementation', { overlapWeeks: 0 });
    expect(weeksToGoLive(p)).toBe(20);
    const s = scheduleFor('2027-02-01', p);
    expect(s.stages.find((x) => x.id === 'baseline')).toMatchObject({ fromWeek: 5, toWeek: 10 });
    expect(s.stages.find((x) => x.id === 'golive')).toMatchObject({ start: '2027-02-01', fromWeek: 11 });
    expect(s.contractStart).toBe('2026-09-14');
  });

  it('converts plans saved as the old five-stage record', () => {
    const p = normalizePlan({ evaluation: { weeks: 6, overlapWeeks: 0 }, kickoff: { weeks: 2, overlapWeeks: 0 }, implementation: { weeks: 3, overlapWeeks: 9 }, baseline: { weeks: 5, overlapWeeks: 1 }, golive: { weeks: 1, overlapWeeks: 0 } });
    expect(p.order).toEqual(['evaluation', 'queue', 'kickoff', 'implementation', 'baseline', 'golive']);
    expect(p.stages.evaluation.weeks).toBe(6);
    expect(p.stages.implementation.overlapWeeks).toBe(2); // clamped to Kick-off's 2 weeks
    expect(p.stages.kickoff.name).toBe('Kick-off');
  });

  it('removes a stage and adds it back in its standard place', () => {
    const p = removeStage(defaultPlan(), 'baseline');
    expect(p.order).toEqual(['evaluation', 'queue', 'kickoff', 'implementation', 'golive']);
    expect(weeksToGoLive(p)).toBe(14); // 8 + queue 2 + kick-off 2 + implementation 3 − 1 overlap
    expect(removedStandardStages(p).map((s) => s.key)).toEqual(['baseline']);
    expect(restoreStage(p, 'baseline').order).toEqual(defaultPlan().order);
    expect(removeStage(normalizePlan({ order: ['kickoff'], stages: { kickoff: { name: 'K', weeks: 2, overlapWeeks: 0, description: '' } }, version: 2 }), 'kickoff').order).toEqual(['kickoff']); // keeps at least one
  });

  it('without Training & Go live, go-live is the day after the last stage', () => {
    const s = scheduleFor('2027-02-01', removeStage(defaultPlan(), 'golive'));
    expect(s.stages[s.stages.length - 1]).toMatchObject({ id: 'baseline', end: '2027-01-31' });
    expect(s.weeksToGoLive).toBe(18);
  });

  it('adds, renames and moves custom stages', () => {
    const { plan, id } = addCustomStage(defaultPlan(), 'Site survey', 2);
    expect(plan.order).toEqual(['evaluation', 'queue', 'kickoff', 'implementation', 'baseline', id, 'golive']);
    expect(weeksToGoLive(plan)).toBe(20);
    const s = scheduleFor('2027-02-01', plan);
    expect(s.stages.find((x) => x.id === id)).toMatchObject({ name: 'Site survey', start: '2027-01-18', end: '2027-01-31', fromWeek: 9, toWeek: 10 });
    const moved = moveStage(plan, id, -1);
    expect(moved.order.indexOf(id)).toBe(4);
    const renamed = updateStage(plan, id, { name: '  IT   review ', description: 'Network check' });
    expect(renamed.stages[id]).toMatchObject({ name: 'IT review', description: 'Network check' });
    expect(planChanges(defaultPlan(), renamed)).toEqual([`added IT review (2 wk)`]);
    expect(planChanges(defaultPlan(), removeStage(updateStage(defaultPlan(), 'kickoff', { weeks: 3 }), 'baseline'))).toEqual(['removed Baseline', 'Kick-off 2 → 3 wk']);
  });

  it('drops bad ids and caps the number of stages', () => {
    const p = normalizePlan({ order: ['evaluation', 'Bad Id!', 'evaluation', 'ghost'], stages: { evaluation: { weeks: 8 } }, version: 2 });
    expect(p.order).toEqual(['evaluation']);
  });

  it('finds the earliest reachable go-live', () => {
    expect(earliestGoLive('2026-11-13', defaultPlan())).toBe('2027-03-22'); // Friday + 18 weeks → next Monday
    expect(earliestGoLive('2026-11-16', defaultPlan())).toBe('2027-03-22'); // already a Monday
  });

  it('groups pilot communities by go-live date', () => {
    const g = pilotGroups(
      [
        { name: 'Forest Hills', goLive: '2027-03-01' },
        { name: 'Aspen A', goLive: '2027-02-01' },
        { name: 'Aspen B', goLive: '2027-02-01' },
      ],
      defaultPlan(),
    );
    expect(g.map((x) => [x.goLive, x.names])).toEqual([
      ['2027-02-01', ['Aspen A', 'Aspen B']],
      ['2027-03-01', ['Forest Hills']],
    ]);
  });

  it('renames standard stages, and Reset to standard keeps the names', () => {
    let p = updateStage(defaultPlan(), 'kickoff', { name: 'Launch calls', weeks: 3 });
    p = removeStage(p, 'baseline');
    p = addCustomStage(p, 'Site survey').plan;
    expect(isDefaultPlan(updateStage(defaultPlan(), 'kickoff', { name: 'Launch calls' }))).toBe(true); // a rename alone is still standard
    const r = resetToStandard(p);
    expect(r.order).toEqual(defaultPlan().order);
    expect(r.stages.kickoff).toMatchObject({ name: 'Launch calls', weeks: 2 });
    expect(r.stages.baseline.name).toBe('Baseline');
    expect(planChanges(defaultPlan(), updateStage(defaultPlan(), 'golive', { name: 'Go live' }))).toEqual(['renamed Training & Go live to Go live']);
  });

  it('adds Implementation Queue once to plans saved before it existed', () => {
    const old = { order: ['evaluation', 'kickoff', 'implementation', 'baseline', 'golive'], stages: Object.fromEntries(['evaluation', 'kickoff', 'implementation', 'baseline', 'golive'].map((k) => [k, defaultPlan().stages[k]])) };
    const p = normalizePlan(old);
    expect(p.order).toEqual(defaultPlan().order);
    // Once saved with it, removing it sticks.
    expect(normalizePlan(removeStage(p, 'queue')).order).not.toContain('queue');
  });
});
