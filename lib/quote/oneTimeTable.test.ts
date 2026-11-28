import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { buildPriceLines } from '@/lib/pricing/lines';
import { allProducts, defaultDraft, newCommunity, normalizeDraft } from './draft';
import { oneTimeTable } from './oneTimeTable';
import { toModelInputs } from './toModelInputs';

describe('one-time charges by community', () => {
  it('shows installation and extra sensors, the pilot credits and what is due, per community and in total', () => {
    const d = defaultDraft('Heritage', priceBook(), new Date(Date.UTC(2026, 10, 12)));
    d.commercial.ecall = 'none';
    d.commercial.installRate = 400;
    d.commercial.sensorPrice = 300;
    d.commercial.installCreditPct = 0.5;
    d.commercial.sensorCreditPct = 0.5;
    d.schedule.withPilot = true;
    const p = allProducts({ monitoring: true, ecall: false });
    d.communities = [
      { ...newCommunity(0), name: 'Blue Springs', alBeds: 45, mcBeds: 30, additionalSensors: 57, products: p, pilot: true },
      { ...newCommunity(1), name: 'Lenexa', alBeds: 44, mcBeds: 29, additionalSensors: 52, products: p, pilot: true },
    ];
    const n = normalizeDraft(d);
    const t = oneTimeTable(n, buildPriceLines(n, toModelInputs(n), priceBook()))!;
    expect(t.rows[0]).toMatchObject({ community: 'Blue Springs', beds: 75, install: 30000, installCredit: -15000, installDue: 15000, sensors: 57, sensorAmount: 17100, sensorCredit: -8550, sensorDue: 8550, total: 23550 });
    expect(t.rows[1]).toMatchObject({ beds: 73, installDue: 14600, sensorDue: 7800, total: 22400 });
    expect(t.total).toMatchObject({ beds: 148, installDue: 29600, sensorDue: 16350, total: 45950 });
    expect(t).toMatchObject({ installPrice: 400, installCreditEach: -200, sensorPrice: 300, sensorCreditEach: -150, showInstalls: false });
  });
});
