import { describe, expect, it } from 'vitest';
import { defaultPlan, removeStage } from './implementationPlan';
import { addRole, allocationTable, availableRoles, moveRole, normalizeResources, removeRole, resourcesChanges, setEffort, toggleStage, updateRole } from './resources';

const build = () => {
  let { resources: rs, id: don } = addRole([], 'Director of Nursing');
  rs = toggleStage(rs, don, 'implementation');
  rs = setEffort(rs, don, 'implementation', { hours: 6, note: 'Family sessions' });
  rs = toggleStage(rs, don, 'golive');
  rs = setEffort(rs, don, 'golive', { hours: 8, note: 'Co-lead training' });
  const it = addRole(rs, 'IT');
  rs = toggleStage(it.resources, it.id, 'implementation');
  rs = setEffort(rs, it.id, 'implementation', { hours: 8, note: 'Wi-Fi check' });
  return { rs, don, itId: it.id };
};

describe('resource allocation', () => {
  it('builds the roles × stages table in plan order', () => {
    const { rs } = build();
    const t = allocationTable(rs, defaultPlan());
    expect(t.stages.map((s) => s.id)).toEqual(['implementation', 'golive']);
    expect(t.rows.map((r) => [r.role, r.hours, r.total])).toEqual([
      ['Director of Nursing', { implementation: 6, golive: 8 }, 14],
      ['IT', { implementation: 8 }, 8],
    ]);
    expect(t.stageTotals).toEqual({ implementation: 14, golive: 8 });
    expect(t.total).toBe(22);
  });

  it('does not allow a role twice', () => {
    const { rs, itId } = build();
    expect(() => addRole(rs, 'director of nursing')).toThrow('already listed');
    expect(() => updateRole(rs, itId, { role: 'Director of Nursing' })).toThrow();
    expect(availableRoles(rs)).not.toContain('IT');
    expect(availableRoles(rs, itId)).toContain('IT'); // its own card can keep it
    expect(normalizeResources([...rs, { id: 'r-dup', role: 'IT', custom: false, stages: {} }])).toHaveLength(2);
  });

  it('marks typed-in roles as custom', () => {
    const r = addRole([], 'Resident Services Coordinator', true).resources;
    expect(normalizeResources(r)[0].custom).toBe(true);
  });

  it('hides stages removed from the plan, and unnamed roles', () => {
    const { rs } = build();
    const t = allocationTable(addRole(rs).resources, removeStage(defaultPlan(), 'golive'));
    expect(t.stages.map((s) => s.id)).toEqual(['implementation']);
    expect(t.rows).toHaveLength(2);
    expect(t.total).toBe(14);
  });

  it('describes changes in plain words', () => {
    const { rs, don, itId } = build();
    let b = setEffort(rs, don, 'implementation', { hours: 4 });
    b = removeRole(b, itId);
    b = addRole(b, 'Executive Director').resources;
    expect(resourcesChanges(rs, b, defaultPlan())).toEqual(['removed IT', 'Director of Nursing: Implementation 6 → 4 hrs', 'added Executive Director']);
    expect(resourcesChanges(rs, moveRole(rs, itId, -1), defaultPlan())).toEqual(['roles reordered']);
  });

  it('clamps and cleans input', () => {
    const r = normalizeResources([{ id: 'r-a', role: '  IT ', stages: { kickoff: { hours: -3, note: 'x' }, 'Bad Id': { hours: 2 } } }, 'junk']);
    expect(r).toEqual([{ id: 'r-a', role: 'IT', custom: false, stages: { kickoff: { hours: 0, note: 'x' } } }]);
    expect(normalizeResources(null)).toEqual([]);
  });
});
