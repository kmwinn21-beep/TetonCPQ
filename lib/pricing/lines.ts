/**
 * Price lines for a quote: what the customer is billed, per community, as an
 * order form would list it. Built from the same schedule the cash flow uses,
 * so the lines add up to exactly what the model bills (tested).
 */
import { communitySchedule } from '@/lib/model/cashflow';
import { annualForCase } from '@/lib/model/annual';
import type { ModelInputs } from '@/lib/model';
import type { QuoteDraft } from '@/lib/quote/draft';
import { POLICY, SKU, type PriceBook } from './catalog';

export interface PriceLine {
  communityPosition: number;
  communityName: string;
  sku: string;
  description: string;
  qty: number;
  unitList: number;
  unitNet: number;
  billing: 'monthly' | 'one_time';
  /** Model month the line starts (1 = first month of the cash flow). */
  startMonth: number;
  /** Months billed, for monthly lines. */
  termMonths: number | null;
  concessionCode: string | null;
}

export const lineTotal = (l: PriceLine) => l.qty * l.unitNet * (l.billing === 'monthly' ? (l.termMonths ?? 0) : 1);

export function buildPriceLines(draft: QuoteDraft, inputs: ModelInputs, book: PriceBook, serviceTermMonths = POLICY.serviceTermMonths): PriceLine[] {
  const k = draft.commercial;
  const listPlatform = book[SKU.platform]?.list ?? 99;
  const listInstall = book[SKU.install]?.list ?? 400;
  const ecallSku = k.ecall === 'inovonics' ? SKU.ecallInovonics : SKU.ecallBle;
  const listEcall = book[ecallSku]?.list ?? 10;
  const annual = annualForCase(inputs, inputs.roiCase);
  const lines: PriceLine[] = [];

  draft.communities.forEach((dc, i) => {
    const c = inputs.communities[i];
    const s = communitySchedule(inputs, c, annual.communities[i].annualRoi);
    const mult = dc.coverage === 'full_facility' ? k.fullFacilityMultiplier : 1;
    const cov = dc.coverage === 'full_facility' ? ', full-facility coverage' : '';
    const ecall = k.ecall !== 'none' && dc.ecall;
    const base = { communityPosition: i, communityName: c.name };
    const L = s.firstPostPilotMonth - s.goLiveMonth;
    const special = k.specialRate != null && k.specialTermMonths > 0 ? Math.min(k.specialTermMonths, serviceTermMonths) : 0;

    if (s.inPilot) {
      lines.push({ ...base, sku: SKU.platform, description: `Teton subscription — pilot${cov}`, qty: s.pilotUnits, unitList: POLICY.standardPilotRate * mult, unitNet: k.pilotRate * mult, billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: k.pilotRate < POLICY.standardPilotRate ? 'PILOT_DISCOUNT' : null });
      if (ecall) lines.push({ ...base, sku: ecallSku, description: 'E-Call — pilot', qty: s.pilotUnits, unitList: listEcall, unitNet: k.ecallPilotRate, billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: k.ecallPilotRate < listEcall ? 'ECALL_PILOT' : null });
    }
    if (special > 0) {
      lines.push({ ...base, sku: SKU.platform, description: `Teton subscription — introductory rate${cov}`, qty: c.units, unitList: listPlatform * mult, unitNet: (k.specialRate as number) * mult, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: special, concessionCode: 'INTRO_RATE' });
    }
    lines.push({ ...base, sku: SKU.platform, description: `Teton subscription${cov}`, qty: c.units, unitList: listPlatform * mult, unitNet: k.platformRate * mult, billing: 'monthly', startMonth: s.firstPostPilotMonth + special, termMonths: serviceTermMonths - special, concessionCode: k.platformRate < listPlatform ? 'RATE_DISCOUNT' : null });
    if (ecall) {
      lines.push({ ...base, sku: ecallSku, description: `E-Call (${k.ecall === 'inovonics' ? 'Inovonics' : 'Bluetooth'})`, qty: c.units, unitList: listEcall, unitNet: k.ecallRate, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: serviceTermMonths, concessionCode: k.ecallRate < listEcall ? 'ECALL_DISCOUNT' : null });
    }
    lines.push({ ...base, sku: SKU.install, description: `Installation & implementation${cov}`, qty: c.units, unitList: listInstall * mult, unitNet: k.installRate * mult, billing: 'one_time', startMonth: s.goLiveMonth, termMonths: null, concessionCode: k.installRate < listInstall ? 'INSTALL_DISCOUNT' : null });
    if (s.inPilot && k.installCreditPct > 0) {
      lines.push({ ...base, sku: SKU.install, description: `Install credit (${Math.round(k.installCreditPct * 100)}%)${k.installClawback ? ' — repayable if the pilot does not convert' : ''}`, qty: s.pilotUnits, unitList: 0, unitNet: -k.installRate * mult * k.installCreditPct, billing: 'one_time', startMonth: s.goLiveMonth, termMonths: null, concessionCode: k.installClawback ? 'INSTALL_CREDIT_CLAWBACK' : 'INSTALL_CREDIT' });
    }
    if (c.additionalSensors > 0) {
      lines.push({ ...base, sku: SKU.sensor, description: 'Additional sensors', qty: c.additionalSensors, unitList: book[SKU.sensor]?.list ?? 300, unitNet: k.sensorPrice, billing: 'one_time', startMonth: s.goLiveMonth, termMonths: null, concessionCode: null });
    }
  });
  return lines;
}
