import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { buildPriceLines, lineTotal } from '@/lib/pricing/lines';
import { defaultDraft, newCommunity } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { commonAreaColumns, installColumns, installMath } from './costMath';

const book = priceBook();
const deal = (credit: number) => {
  const d = defaultDraft('CA credit', book, new Date('2026-11-01T00:00:00Z'));
  d.schedule.withPilot = true;
  d.commercial.installCreditPct = credit;
  d.communities = [{ ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, commonAreaSensors: 15 }];
  return buildPriceLines(d, toModelInputs(d), book);
};

describe('installation and common-area setup with the pilot install credit', () => {
  it('each nets with its own credit: a 100% credit leaves both at $0 (not −$3,000 on installation)', () => {
    const ls = deal(1);
    const ins = installMath(ls);
    expect(ins.gross - ins.credit).toBe(0);
    expect(installColumns(ls).total).toBe(0);
    const ca = commonAreaColumns(ls);
    expect(ca).toMatchObject({ units: 15, minPer: 200, creditUnits: 15, creditMin: 200, total: 0 });
    // Everything one-time still adds up across the two rows.
    expect(ins.gross - ins.credit + ca.total).toBeCloseTo(ls.filter((l) => l.billing === 'one_time' && (l.sku === 'TETON-INSTALL' || l.sku === 'COMMON-AREA-SETUP')).reduce((t, l) => t + lineTotal(l), 0), 6);
  });
  it('a 50% credit leaves half of each', () => {
    const ls = deal(0.5);
    const ins = installMath(ls);
    expect(ins.gross - ins.credit).toBe(100 * 400 * 0.5);
    expect(commonAreaColumns(ls).total).toBe(15 * 200 * 0.5);
  });
});

describe('the live preview’s pilot cost', () => {
  it('is $0 with a 100% credit and common-area sensors at the pilot site', async () => {
    const { previewTotals } = await import('@/lib/quote/previewTotals');
    const { runModel } = await import('@/lib/model');
    const d = defaultDraft('CA preview', book, new Date('2026-11-01T00:00:00Z'));
    d.schedule.withPilot = true;
    d.commercial.installCreditPct = 1;
    d.commercial.pilotRate = 0;
    d.communities = [{ ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, commonAreaSensors: 15 }];
    const inputs = toModelInputs(d);
    const p = previewTotals(d, inputs, runModel(inputs), book);
    expect(p.pilot).toMatchObject({ install: 0, total: 0 });
  });
});
