import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, EDITABLE_ROLES, allowed, changedFromDefaults, grantOf, grantsFor, isEditable, reaches, valuesOf } from './permissions';

describe('permission defaults', () => {
  it('keep today’s behavior, plus the agreed RevOps changes', () => {
    for (const r of EDITABLE_ROLES) {
      expect(grantOf(r, 'deal.view')).toBe('all');
      expect(grantOf(r, 'deal.inputs')).toBe('collab');
      expect(grantOf(r, 'deal.manage')).toBe('own');
      expect(grantOf(r, 'deal.delete')).toBe('own');
      expect(grantOf(r, 'pricebook.delete')).toBe('off');
      expect(grantOf(r, 'pricebook.lineup')).toBe('off');
      expect(grantOf(r, 'notes.moderate')).toBe('off');
    }
    // RevOps scopes any deal and edits prices and items.
    expect(grantOf('deal_desk', 'deal.scope')).toBe('all');
    expect(grantOf('deal_desk', 'pricebook.edit')).toBe('on');
    expect(grantOf('rep', 'deal.scope')).toBe('collab');
    expect(grantOf('rep', 'pricebook.edit')).toBe('off');
  });

  it('admin has everything', () => {
    for (const c of CAPABILITIES) expect(grantOf('admin', c.key)).toBe(c.kind === 'flag' ? 'on' : 'all');
    expect(allowed({ role: 'admin', grants: { 'pricebook.lineup': 'off' } }, 'pricebook.lineup')).toBe(true);
  });

  it('every default is a value its permission allows', () => {
    for (const c of CAPABILITIES) for (const r of EDITABLE_ROLES) expect(valuesOf(c)).toContain(c.defaults[r]);
  });
});

describe('saved values', () => {
  it('apply only to editable, built permissions with valid values', () => {
    expect(grantOf('rep', 'pricebook.edit', { 'pricebook.edit': 'on' })).toBe('on');
    expect(grantOf('rep', 'deal.view', { 'deal.view': 'own' })).toBe('all'); // fixed
    expect(grantOf('rep', 'approve.tier1', { 'approve.tier1': 'all' })).toBe('off'); // not built yet
    expect(grantOf('rep', 'deal.manage', { 'deal.manage': 'collab' })).toBe('own'); // collab doesn't apply
    expect(grantOf('rep', 'pricebook.edit', { 'pricebook.edit': 'all' })).toBe('off'); // not a flag value
    expect(grantOf('stranger', 'deal.inputs')).toBe('collab'); // unknown roles read as reps
  });

  it('only changes from the defaults are stored', () => {
    expect(changedFromDefaults('rep', { ...grantsFor('rep'), 'pricebook.edit': 'on', 'approve.tier1': 'all', 'deal.view': 'own' })).toEqual({ 'pricebook.edit': 'on' });
    expect(changedFromDefaults('admin', { 'pricebook.edit': 'off' })).toEqual({});
  });
});

describe('reach on a deal', () => {
  const deal = (isOwner: boolean, collaboratorSwitch: boolean) => ({ isOwner, collaboratorSwitch });
  it('all / collab / own / off', () => {
    const rep = { role: 'rep', grants: grantsFor('rep', { 'deal.share': 'own', 'deal.room': 'off' }) };
    expect(reaches(rep, 'deal.inputs', deal(false, true))).toBe(true);
    expect(reaches(rep, 'deal.inputs', deal(false, false))).toBe(false);
    expect(reaches(rep, 'deal.share', deal(false, true))).toBe(false);
    expect(reaches(rep, 'deal.share', deal(true, false))).toBe(true);
    expect(reaches(rep, 'deal.room', deal(true, true))).toBe(false);
    expect(reaches({ role: 'deal_desk' }, 'deal.scope', deal(false, false))).toBe(true);
    expect(reaches({ role: 'admin' }, 'deal.delete', deal(false, false))).toBe(true);
  });
});

// Every built permission an admin can change must be checked somewhere outside this module: a switch that does
// nothing would look enforced but not be.
describe('every editable permission is checked', () => {
  const root = path.resolve(__dirname, '../..');
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !p.endsWith(path.join('auth', 'permissions.ts')) && !p.includes(path.join('components', 'admin'))) files.push(p);
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'lib'));
  const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const c of CAPABILITIES.filter(isEditable))
    it(c.key, () => {
      expect(source.includes(`'${c.key}'`) || source.includes(`"${c.key}"`)).toBe(true);
    });
});
