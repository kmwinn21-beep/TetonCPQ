import { describe, expect, it } from 'vitest';
import { defaultPlan, earliestGoLive, normalizePlan, pilotGroups, scheduleFor, weekLabel, weeksToGoLive } from './implementationPlan';

describe('implementation plan', () => {
  it('matches the Path to Go Live slide with the standard lengths', () => {
    const s = scheduleFor('2027-02-01', defaultPlan());
    expect(s.stages.map((x) => [x.key, x.start, x.end, weekLabel(x)])).toEqual([
      ['evaluation', '2026-10-12', '2026-12-06', '8 weeks before kick-off'],
      ['kickoff', '2026-12-07', '2026-12-20', 'Weeks 1–2'],
      ['implementation', '2026-12-14', '2027-01-03', 'Weeks 2–4'],
      ['baseline', '2026-12-28', '2027-01-31', 'Weeks 4–8'],
      ['golive', '2027-02-01', '2027-02-07', 'Week 9'],
    ]);
    expect(s.contractStart).toBe('2026-10-12');
    expect(s.weeksToGoLive).toBe(16);
  });

  it('shifts later stages when a length or overlap changes', () => {
    const p = defaultPlan();
    p.baseline.weeks = 6;
    p.implementation.overlapWeeks = 0;
    const s = scheduleFor('2027-02-01', p);
    expect(weeksToGoLive(p)).toBe(18);
    expect(s.stages.find((x) => x.key === 'baseline')).toMatchObject({ fromWeek: 5, toWeek: 10 });
    expect(s.stages.find((x) => x.key === 'golive')).toMatchObject({ start: '2027-02-01', fromWeek: 11 });
    expect(s.contractStart).toBe('2026-09-28');
  });

  it('clamps bad values and fills missing stages', () => {
    const p = normalizePlan({ implementation: { weeks: 3, overlapWeeks: 9 }, kickoff: { weeks: -2, overlapWeeks: 1 } });
    expect(p.kickoff).toEqual({ weeks: 0, overlapWeeks: 0 });
    expect(p.implementation.overlapWeeks).toBe(0); // can't overlap more than the 0-week kick-off
    expect(p.evaluation.weeks).toBe(8);
  });

  it('finds the earliest reachable go-live', () => {
    expect(earliestGoLive('2026-11-13', defaultPlan())).toBe('2027-03-08'); // Friday + 16 weeks → next Monday
    expect(earliestGoLive('2026-11-16', defaultPlan())).toBe('2027-03-08'); // already a Monday
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
});
