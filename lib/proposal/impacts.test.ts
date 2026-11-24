import { describe, expect, it } from 'vitest';
import { impactLook, impactsFor, sanitizeImpacts } from './impacts';
import { sanitizeLayout } from './layout';

describe('impacts', () => {
  it('uses the defaults until a row is edited', () => {
    expect(impactsFor(undefined, 'roi.benefit.moveIn')).toEqual(['sales', 'revenue']);
    expect(impactsFor({ 'roi.benefit.moveIn': [] }, 'roi.benefit.moveIn')).toEqual([]);
    expect(impactsFor(undefined, 'unknown')).toEqual([]);
  });

  it('keeps departments and well-formed custom entries, and drops the rest', () => {
    const out = sanitizeImpacts({
      'roi.benefit.care': ['revenue', 'nope', { name: '  Marketing  team ', color: 'teal', icon: 'star' }, { name: 'X', color: 'neon', icon: 'star' }, { name: '', color: 'teal', icon: 'star' }, { name: 'Y', color: 'teal', icon: 'skull' }],
      'bad key!': ['sales'],
      'roi.benefit.tech': 'sales',
    });
    expect(out).toEqual({ 'roi.benefit.care': ['revenue', { name: 'Marketing team', color: 'teal', icon: 'star' }] });
    expect(sanitizeImpacts('x')).toBeUndefined();
  });

  it('describes a custom entry by its own name, color and icon', () => {
    expect(impactLook({ name: 'Marketing', color: 'teal', icon: 'star' })).toMatchObject({ name: 'Marketing', ink: '#0E8A8A', icon: 'star' });
    expect(impactLook('care')).toMatchObject({ name: 'Care Staff', icon: 'carer' });
  });

  it('survives the layout sanitizer with the view switches', () => {
    const l = sanitizeLayout({ bcRoiView: 'impacts', bcImpactStyle: 'chips', bcImpacts: { 'roi.benefit.falls': ['clinical'] } }, (h) => h);
    expect([l.bcRoiView, l.bcImpactStyle, l.bcImpacts]).toEqual(['impacts', 'chips', { 'roi.benefit.falls': ['clinical'] }]);
    expect(sanitizeLayout({ bcRoiView: 'x', bcImpactStyle: 'y' }, (h) => h).bcRoiView).toBeUndefined();
  });
});
