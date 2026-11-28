import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { buildPriceLines } from '@/lib/pricing/lines';
import { allProducts, defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from './draft';
import { termTexts } from './terms';
import { toModelInputs } from './toModelInputs';

const base = () => {
  const d = defaultDraft('Heritage', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.commercial.ecall = 'none';
  d.commercial.sensorPrice = 300;
  d.commercial.installCreditPct = 0.5;
  d.schedule.withPilot = true;
  d.communities = [{ ...newCommunity(0), name: 'A', alBeds: 40, mcBeds: 0, additionalSensors: 10, products: allProducts({ monitoring: true, ecall: false }), pilot: true }];
  return normalizeDraft(d);
};
const credits = (d: QuoteDraft) => buildPriceLines(d, toModelInputs(d), priceBook()).filter((l) => l.concessionCode?.startsWith('SENSOR_CREDIT'));

describe('additional sensor credit (its own setting)', () => {
  it('older deals: the on/off switch carries the install credit over', () => {
    const on = normalizeDraft({ ...base(), commercial: { ...base().commercial, sensorCreditPct: undefined as unknown as number, sensorCredit: true } });
    expect(on.commercial.sensorCreditPct).toBe(0.5);
    expect('sensorCredit' in on.commercial).toBe(false);
    const off = normalizeDraft({ ...base(), commercial: { ...base().commercial, sensorCreditPct: undefined as unknown as number, sensorCredit: false } });
    expect(off.commercial.sensorCreditPct).toBe(0);
  });

  it('credits sensors at its own rate, independent of the install credit', () => {
    const d = base();
    expect(credits(d)).toHaveLength(0);
    d.commercial.sensorCreditPct = 1;
    const [c] = credits(d);
    expect(c).toMatchObject({ qty: 10, unitNet: -300 });
    d.commercial.installCreditPct = 0;
    expect(credits(d)[0]).toMatchObject({ qty: 10, unitNet: -300 });
    expect(toModelInputs(d).pricing.pilotSensorPrice).toBe(0);
  });

  it('describes both credits in the terms', () => {
    const d = base();
    d.commercial.sensorCreditPct = 0.25;
    expect(termTexts(d).join(' ')).toContain('50% on pilot beds and 25% on their additional sensors');
    d.commercial.sensorCreditPct = 0.5;
    expect(termTexts(d).join(' ')).toContain('50% on pilot beds and their additional sensors');
  });
});
