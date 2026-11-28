/**
 * Price lines for a quote: what the customer is billed, per community, as an
 * order form would list it. Built from the same schedule the cash flow uses,
 * so the lines add up to exactly what the model bills (tested).
 */
import { communitySchedule } from '@/lib/model/cashflow';
import { annualForCase } from '@/lib/model/annual';
import type { ModelInputs } from '@/lib/model';
import { extraDevicePrice, scopeOf, type QuoteDraft } from '@/lib/quote/draft';
import { pricingAdjustments } from '@/lib/quote/toModelInputs';
import { ecallBilled, pendantScope } from '@/lib/quote/roomTypes';
import { POLICY, SKU, type PriceBook } from './catalog';
import { isRemoved, pricedDraft, removedRoles } from './lineup';
import { itemPrice, itemQty, itemsOn } from './items';

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

const money = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export const lineTotal = (l: PriceLine) => l.qty * l.unitNet * (l.billing === 'monthly' ? (l.termMonths ?? 0) : 1);

export function buildPriceLines(draft: QuoteDraft, inputs: ModelInputs, book: PriceBook, serviceTermMonths = POLICY.serviceTermMonths): PriceLine[] {
  // Priced with the deal's line-up: items it takes away are free, and their lines are left out (not part of the offer).
  draft = pricedDraft(draft);
  const removed = removedRoles(draft.lineup);
  const gone = (role: Parameters<typeof isRemoved>[1], sku?: string) => removed.size > 0 && isRemoved(removed, role, sku);
  const k = draft.commercial;
  const generic = itemsOn(draft, 'subscription');
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
    // Products: the same for every priced bed, or differing by care type (then the units are the monitored
    // beds, E-Call goes on its own beds, and beds with E-Call only get the E-Call installation price).
    const sc = scopeOf(dc, k.ecall !== 'none');
    const mixed = !sc.uniform;
    // E-Call monthly: per room (rooms + common areas with devices) or per device (before the contingency); per room,
    // devices beyond the rooms are one-time extras.
    const billed = ecallBilled(pendantScope(dc, k.ecall !== 'none'), k.ecallBilling);
    const ecallDevices = billed.monthly;
    const ecall = ecallDevices > 0;
    const perUnit = k.ecallBilling === 'device' ? 'per device' : 'per room';
    // One-time charges: at go-live, or at pilot completion for pilot sites.
    const once = s.oneTimeMonth;
    const base = { communityPosition: i, communityName: c.name };
    const L = s.firstPostPilotMonth - s.goLiveMonth;
    const special = k.specialRate != null && k.specialTermMonths > 0 ? Math.min(k.specialTermMonths, serviceTermMonths) : 0;

    // E-Call only: no monitoring subscription or sensors; E-Call fees and the E-Call installation price.
    const mon = mixed || sc.uniform?.monitoring !== false;
    if (s.inPilot) {
      if (mon && !gone('platform')) lines.push({ ...base, sku: SKU.platform, description: `Teton subscription — pilot${cov}`, qty: s.pilotUnits, unitList: POLICY.standardPilotRate * mult, unitNet: k.pilotRate * mult, billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: k.pilotRate < POLICY.standardPilotRate ? 'PILOT_DISCOUNT' : null });
      if (ecall && !gone('ecallFee', ecallSku)) lines.push({ ...base, sku: ecallSku, description: `E-Call — pilot, ${perUnit}`, qty: ecallDevices, unitList: listEcall, unitNet: k.ecallPilotRate, billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: k.ecallPilotRate < listEcall ? 'ECALL_PILOT' : null });
    }
    if (mon && special > 0 && !gone('platform')) {
      lines.push({ ...base, sku: SKU.platform, description: `Teton subscription — introductory rate${cov}`, qty: c.units, unitList: listPlatform * mult, unitNet: (k.specialRate as number) * mult, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: special, concessionCode: 'INTRO_RATE' });
    }
    if (mon && !gone('platform')) lines.push({ ...base, sku: SKU.platform, description: `Teton subscription${cov}`, qty: c.units, unitList: listPlatform * mult, unitNet: k.platformRate * mult, billing: 'monthly', startMonth: s.firstPostPilotMonth + special, termMonths: serviceTermMonths - special, concessionCode: k.platformRate < listPlatform ? 'RATE_DISCOUNT' : null });
    if (ecall && !gone('ecallFee', ecallSku)) {
      lines.push({ ...base, sku: ecallSku, description: `E-Call (${k.ecall === 'inovonics' ? 'Inovonics' : 'Bluetooth'}), ${perUnit}`, qty: ecallDevices, unitList: listEcall, unitNet: k.ecallRate, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: serviceTermMonths, concessionCode: k.ecallRate < listEcall ? 'ECALL_DISCOUNT' : null });
    }
    const ecallInstall = Number(k.ecallInstallRate) || 0;
    const install = (monitoring: boolean, qty: number, pilotQty: number) => {
      if (gone(monitoring ? 'install' : 'ecallInstall')) return;
      const per = monitoring ? k.installRate * mult : ecallInstall;
      lines.push({ ...base, sku: SKU.install, description: monitoring ? `Installation & implementation${cov}` : 'E-Call installation', qty, unitList: monitoring ? listInstall * mult : per, unitNet: per, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: monitoring && k.installRate < listInstall ? 'INSTALL_DISCOUNT' : null });
      if (s.inPilot && k.installCreditPct > 0 && per > 0 && pilotQty > 0) {
        lines.push({ ...base, sku: SKU.install, description: `Install credit (${Math.round(k.installCreditPct * 100)}%)${k.installClawback ? ' — repayable if the pilot does not convert' : ''}`, qty: pilotQty, unitList: 0, unitNet: -per * k.installCreditPct, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: k.installClawback ? 'INSTALL_CREDIT_CLAWBACK' : 'INSTALL_CREDIT' });
      }
    };
    // Per Edge unit (one per room): residents sharing a room share its installation.
    install(mon, s.edgeUnits, s.inPilot ? s.pilotEdgeUnits : 0);
    if (mixed && sc.ecallOnly > 0) install(false, sc.ecallOnly, sc.ecallOnly);
    // Per room: devices beyond the rooms, each one-time (the pilot install credit applies at pilot sites).
    if (billed.extra > 0 && !gone('ecallDevice', k.ecall === 'inovonics' ? SKU.ecallInoPullcord : SKU.ecallBleButton)) {
      const each = extraDevicePrice(k);
      const devSku = k.ecall === 'inovonics' ? SKU.ecallInoPullcord : SKU.ecallBleButton;
      const what = k.ecall === 'inovonics' ? 'pull-cords' : 'buttons';
      lines.push({ ...base, sku: devSku, description: `Additional E-Call devices (${what})`, qty: billed.extra, unitList: book[devSku]?.list ?? each, unitNet: each, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: null });
      if (s.inPilot && k.installCreditPct > 0 && each > 0) {
        lines.push({ ...base, sku: devSku, description: `Device credit (${Math.round(k.installCreditPct * 100)}%)${k.installClawback ? ' — repayable if the pilot does not convert' : ''}`, qty: billed.extra, unitList: 0, unitNet: -each * k.installCreditPct, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: k.installClawback ? 'DEVICE_CREDIT_CLAWBACK' : 'DEVICE_CREDIT' });
      }
    }
    // Adjustments (the same figures the model bills): skilled nursing rate, bundle discount, common-area sensors.
    for (const a of pricingAdjustments(draft, dc)) {
      const r = a.rates;
      if (a.kind === 'snf') {
        const snfList = book[SKU.snf]?.list ?? 49;
        const what = (rate: number) => `Skilled nursing beds at ${money(Math.min(k.snfRate ?? rate, rate))} / bed`;
        if (s.inPilot && (a.pilotBeds ?? 0) > 0 && r.pilotFeePerBedMonth !== 0) {
          lines.push({ ...base, sku: SKU.snf, description: `${what(k.pilotRate)} during the pilot (adjustment)`, qty: a.pilotBeds as number, unitList: 0, unitNet: (r.pilotFeePerBedMonth * a.units) / (a.pilotBeds as number), billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: null });
        }
        if (special > 0) {
          const sp = r.specialFeePerBedMonth ?? r.postPilotFeePerBedMonth;
          if (sp !== 0) lines.push({ ...base, sku: SKU.snf, description: `${what(k.specialRate ?? k.platformRate)} at the introductory rate (adjustment)`, qty: a.units, unitList: 0, unitNet: sp, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: special, concessionCode: null });
        }
        if (r.postPilotFeePerBedMonth !== 0) {
          lines.push({ ...base, sku: SKU.snf, description: `${what(k.platformRate)} (adjustment)`, qty: a.units, unitList: snfList - listPlatform, unitNet: r.postPilotFeePerBedMonth, billing: 'monthly', startMonth: s.firstPostPilotMonth + special, termMonths: serviceTermMonths - special, concessionCode: null });
        }
      } else if (a.kind === 'bundle') {
        const name = `Teton One + E-Call (${k.ecall === 'inovonics' ? 'Inovonics' : 'Bluetooth'}) bundle discount`;
        const bsku = k.ecall === 'inovonics' ? SKU.bundleInovonics : SKU.bundleBle;
        if (s.inPilot && r.pilotFeePerBedMonth !== 0) lines.push({ ...base, sku: bsku, description: `${name} during the pilot`, qty: a.units, unitList: 0, unitNet: r.pilotFeePerBedMonth, billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: null });
        if (r.postPilotFeePerBedMonth !== 0) lines.push({ ...base, sku: bsku, description: name, qty: a.units, unitList: 0, unitNet: r.postPilotFeePerBedMonth, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: serviceTermMonths, concessionCode: null });
      } else {
        const setup = r.postPilotInstallPerBed;
        if (!gone('commonAreaMonthly')) lines.push({ ...base, sku: SKU.commonAreaMonthly, description: 'Common-area sensors', qty: a.units, unitList: book[SKU.commonAreaMonthly]?.list ?? 50, unitNet: r.postPilotFeePerBedMonth, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: serviceTermMonths, concessionCode: null });
        if (gone('commonAreaSetup')) continue;
        lines.push({ ...base, sku: SKU.commonAreaSetup, description: 'Common-area sensor setup', qty: a.units, unitList: book[SKU.commonAreaSetup]?.list ?? 200, unitNet: setup, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: null });
        if (s.inPilot && k.installCreditPct > 0 && setup > 0) {
          lines.push({ ...base, sku: SKU.commonAreaSetup, description: `Common-area setup credit (${Math.round(k.installCreditPct * 100)}%)${k.installClawback ? ' — repayable if the pilot does not convert' : ''}`, qty: a.units, unitList: 0, unitNet: -setup * k.installCreditPct, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: k.installClawback ? 'INSTALL_CREDIT_CLAWBACK' : 'INSTALL_CREDIT' });
        }
      }
    }
    if (c.additionalSensors > 0 && !gone('sensor')) {
      lines.push({ ...base, sku: SKU.sensor, description: 'Additional sensors', qty: c.additionalSensors, unitList: book[SKU.sensor]?.list ?? 300, unitNet: k.sensorPrice, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: null });
      if (s.inPilot && k.sensorCredit && k.installCreditPct > 0 && k.sensorPrice > 0) {
        lines.push({ ...base, sku: SKU.sensor, description: `Sensor credit (${Math.round(k.installCreditPct * 100)}%)${k.installClawback ? ' — repayable if the pilot does not convert' : ''}`, qty: c.additionalSensors, unitList: 0, unitNet: -k.sensorPrice * k.installCreditPct, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: k.installClawback ? 'SENSOR_CREDIT_CLAWBACK' : 'SENSOR_CREDIT' });
      }
    }
    // Generic items sold with the subscription (the same figures the model bills, see genericExtras).
    for (const it of generic) {
      const qty = itemQty(dc, k.ecall !== 'none', it.spec.counted);
      if (!qty) continue;
      const p = itemPrice(draft, it.sku, it.spec);
      const name = it.spec.name;
      const disc = p < it.spec.list ? 'ITEM_DISCOUNT' : null;
      if (it.spec.billing === 'monthly') {
        if (s.inPilot && it.spec.pilot === 'charged' && L > 0) lines.push({ ...base, sku: it.sku, description: `${name} — pilot`, qty, unitList: it.spec.list, unitNet: p, billing: 'monthly', startMonth: s.goLiveMonth, termMonths: L, concessionCode: disc });
        lines.push({ ...base, sku: it.sku, description: name, qty, unitList: it.spec.list, unitNet: p, billing: 'monthly', startMonth: s.firstPostPilotMonth, termMonths: serviceTermMonths, concessionCode: disc });
        continue;
      }
      lines.push({ ...base, sku: it.sku, description: name, qty, unitList: it.spec.list, unitNet: p, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: disc });
      if (s.inPilot && it.spec.pilot === 'credited' && k.installCreditPct > 0 && p > 0) {
        lines.push({ ...base, sku: it.sku, description: `${name} credit (${Math.round(k.installCreditPct * 100)}%)${k.installClawback ? ' — repayable if the pilot does not convert' : ''}`, qty, unitList: 0, unitNet: -p * k.installCreditPct, billing: 'one_time', startMonth: once, termMonths: null, concessionCode: k.installClawback ? 'INSTALL_CREDIT_CLAWBACK' : 'INSTALL_CREDIT' });
      }
      // Every N years: charged again inside the service term.
      if (it.spec.billing === 'years') {
        const every = (it.spec.everyYears ?? 1) * 12;
        for (let m = once + every; m <= s.firstPostPilotMonth + serviceTermMonths - 1; m += every) {
          lines.push({ ...base, sku: it.sku, description: `${name} (renewal)`, qty, unitList: it.spec.list, unitNet: p, billing: 'one_time', startMonth: m, termMonths: null, concessionCode: disc });
        }
      }
    }
  });
  return lines;
}
