/**
 * Pricing check (View Results): every total laid out as inputs → formula → result, so it can be checked line by
 * line against the company's pricing workbooks. Pure: built from the deal's inputs, the model result being shown,
 * the equipment-purchase figures and the price book.
 *
 * Subscription and E-Call rows come from the price lines (what the customer is billed), E-Call devices from the
 * room types and common areas, equipment rows from the equipment-purchase result. Self-checks confirm the system
 * agrees with itself: the price lines add up to the model's billing and the cash flow, the Year 1 card matches,
 * and the equipment rows add up to the equipment total.
 */
import type { ModelInputs, ModelResult } from '@/lib/model';
import { subscriptionTotals } from '@/lib/model';
import { basePackageRows, renewalsWithin, sensorRows, type CapexResult } from '@/lib/pricing/capex';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { bedsByCare, scopeOf, type QuoteDraft } from './draft';
import { pendantScope } from './roomTypes';

export type CheckProduct = 'subscription' | 'ecall' | 'capex';
/** Formula pieces: text, or a value from this deal (shown highlighted). */
export type Piece = string | { v: string };
export type ResultUnit = 'usd' | 'usd_mo' | 'count';

export interface CheckInputRow {
  key: string;
  label: string;
  product: CheckProduct | 'terms';
  deal: string;
  /** The price book's figure ('—' where there is none); null when the row has no counterpart. */
  book: string | null;
  differs: boolean;
}

export interface CheckScopeRow {
  name: string;
  pilot: boolean;
  pilotUnits: number;
  ecallOnly: boolean;
  beds: { il: number; al: number; mc: number; snf: number };
  billedBeds: number;
  sensors: number;
  devices: number;
  contingency: number;
  areas: number;
}

export interface CheckRow {
  key: string;
  label: string;
  /** The community, when the row is for one (null: the whole deal). */
  community: string | null;
  formula: Piece[];
  result: number;
  unit: ResultUnit;
  /** A subtotal row. */
  total?: boolean;
  /** Where else the figure appears. */
  alsoOn?: string;
  /** For quantity × price (× months) rows: the numbers, so the download can rebuild them as live formulas. */
  calc?: { qty: number; unit: number; months?: number };
}

export interface CheckGroup {
  key: CheckProduct | 'results';
  title: string;
  note: string;
  rows: CheckRow[];
}

export interface SelfCheck {
  key: string;
  ok: boolean;
  /** Amber: worth a look, not an error. */
  warn?: boolean;
  label: string;
  detail: string;
}

export interface PricingCheck {
  inputs: CheckInputRow[];
  scope: CheckScopeRow[];
  groups: CheckGroup[];
  checks: SelfCheck[];
  communities: string[];
}

export interface PricingCheckArgs {
  draft: QuoteDraft;
  inputs: ModelInputs;
  /** The model result being shown (stored for a saved version). */
  out: Omit<ModelResult, 'traces'>;
  capex: Omit<CapexResult, 'trace'>;
  /** Equipment-purchase figures recomputed from the inputs (to confirm a saved version's still match). */
  capexLive?: Omit<CapexResult, 'trace'>;
  lines: PriceLine[];
  book: PriceBook;
  /** The summary cards show the equipment purchase (so the subscription figures here aren't on them). */
  capexSummary?: boolean;
  money: (n: number, cents?: boolean) => string;
  count: (n: number) => string;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const ECALL_SKUS = new Set<string>([SKU.ecallBle, SKU.ecallInovonics]);
const isEcallLine = (l: PriceLine) => ECALL_SKUS.has(l.sku) || l.description === 'E-Call installation';

/** What a line bills in months 1..m (inclusive). */
export function lineBilledThrough(l: PriceLine, m: number): number {
  if (l.startMonth > m) return 0;
  if (l.billing === 'one_time') return l.qty * l.unitNet;
  const months = Math.max(0, Math.min(l.startMonth + (l.termMonths ?? 0) - 1, m) - l.startMonth + 1);
  return l.qty * l.unitNet * months;
}

export function buildPricingCheck(a: PricingCheckArgs): PricingCheck {
  const { draft, inputs, out, capex, lines, book, money, count } = a;
  const k = draft.commercial;
  const ecallOn = k.ecall !== 'none';
  const sys = k.ecall === 'inovonics' ? 'Inovonics' : 'Bluetooth';
  const cents = (n: number) => money(n, !Number.isInteger(n));
  const cf = out.cashFlow;
  const names = inputs.communities.map((c) => c.name);

  // ---- Inputs, next to the price book
  const list = (sku: string) => book[sku]?.list;
  const inRows: CheckInputRow[] = [];
  const price = (key: string, label: string, product: CheckInputRow['product'], deal: number | null | undefined, bookVal: number | undefined | null, fmt = cents) => {
    if (deal == null) return;
    inRows.push({ key, label, product, deal: fmt(deal), book: bookVal == null ? '—' : fmt(bookVal), differs: bookVal != null && !near(deal, bookVal) });
  };
  const anyMonitoring = draft.communities.some((c) => scopeOf(c, ecallOn).monitored > 0 || (scopeOf(c, ecallOn).beds === 0 && scopeOf(c, ecallOn).uniform?.monitoring));
  const anyFull = draft.communities.some((c) => c.coverage === 'full_facility');
  const anyEcallOnly = draft.communities.some((c) => scopeOf(c, ecallOn).ecallOnly > 0);
  const anyPilot = cf.communities.some((c) => c.inPilot);
  if (anyMonitoring) {
    price('platform', 'Subscription per bed / month', 'subscription', k.platformRate, list(SKU.platform));
    if (anyPilot) inRows.push({ key: 'pilotRate', label: 'Pilot rate per bed / month', product: 'subscription', deal: cents(k.pilotRate), book: `${cents(POLICY.standardPilotRate)} standard`, differs: false });
    if (k.specialRate != null && k.specialTermMonths > 0) inRows.push({ key: 'intro', label: 'Introductory rate per bed / month', product: 'subscription', deal: `${cents(k.specialRate)} × ${k.specialTermMonths} mo`, book: '—', differs: false });
    price('install', 'Installation per bed', 'subscription', k.installRate, list(SKU.install));
    if (anyPilot) inRows.push({ key: 'credit', label: `Install credit (pilot sites)${k.sensorCredit ? ', also on sensors' : ''}`, product: 'subscription', deal: `${Math.round(k.installCreditPct * 100)}%`, book: '—', differs: false });
    price('sensor', 'Additional sensor, each', 'subscription', k.sensorPrice, list(SKU.sensor));
    if (anyFull) price('full', 'Full-facility coverage multiplier', 'subscription', k.fullFacilityMultiplier, list(SKU.fullFacility), (n) => `${n}×`);
  }
  if (ecallOn) {
    price('ecall', `E-Call (${sys}) per device / month`, 'ecall', k.ecallRate, list(k.ecall === 'inovonics' ? SKU.ecallInovonics : SKU.ecallBle));
    if (anyPilot) inRows.push({ key: 'ecallPilot', label: 'E-Call pilot rate per device / month', product: 'ecall', deal: cents(k.ecallPilotRate), book: '—', differs: false });
    if (anyEcallOnly) inRows.push({ key: 'ecallInstall', label: 'E-Call installation per bed (E-Call only)', product: 'ecall', deal: cents(Number(k.ecallInstallRate) || 0), book: '—', differs: false });
  }
  const p = capex.pricing;
  if (anyMonitoring) {
    price('cxBase', 'Equipment: base package per bed', 'capex', p.basePrice, list(SKU.capexBase));
    if (ecallOn) price('cxBaseEc', `Equipment: base package + E-Call (${sys}) per bed`, 'capex', k.ecall === 'inovonics' ? p.inovonicsBasePrice : p.bleBasePrice, list(k.ecall === 'inovonics' ? SKU.capexBaseInovonics : SKU.capexBaseBle));
    price('cxSensor', 'Equipment: additional sensor, each', 'capex', p.sensorPrice, list(SKU.capexSensor));
    price('cxSoftware', 'Equipment: software & services per bed / month', 'capex', p.softwareRate, list(SKU.capexSoftware));
    if (ecallOn) price('cxRenewal', `Equipment: E-Call renewal per bed (${sys})`, 'capex', k.ecall === 'inovonics' ? p.inovonicsRenewal : p.bleRenewal, list(k.ecall === 'inovonics' ? SKU.capexInovonicsRenewal : SKU.capexBleRenewal));
    const conv = Math.max(0, Number(p.conversionCredit) || 0);
    if (conv > 0) inRows.push({ key: 'cxConv', label: 'Equipment: conversion credit per bed and sensor (pilot sites)', product: 'capex', deal: cents(conv), book: '—', differs: false });
  }
  if (anyEcallOnly) {
    price('cxEo', `Equipment: E-Call only per bed (${sys})`, 'capex', k.ecall === 'inovonics' ? p.ecallInstallInovonics : p.ecallInstallBle, list(k.ecall === 'inovonics' ? SKU.capexEcallInstallInovonics : SKU.capexEcallInstallBle));
    price('cxEoSw', 'Equipment: E-Call software per bed / month', 'capex', p.ecallSoftware ?? 5, list(SKU.capexEcallSoftware));
  }
  inRows.push({
    key: 'terms',
    label: `${anyPilot ? 'Pilot · ' : ''}service term · ownership · horizon`,
    product: 'terms',
    deal: `${anyPilot ? `${inputs.schedule.pilotLengthMonths} · ` : ''}${POLICY.serviceTermMonths} · ${capex.ownershipMonths} · ${cf.months.length} mo`,
    book: null,
    differs: false,
  });

  // ---- Scope per community
  const scope: CheckScopeRow[] = draft.communities.map((dc, i) => {
    const sc = scopeOf(dc, ecallOn);
    const ps = pendantScope(dc, ecallOn);
    const cc = cf.communities[i];
    const c = inputs.communities[i];
    return {
      name: c?.name ?? dc.name,
      pilot: !!cc?.inPilot,
      pilotUnits: cc?.pilotUnits ?? 0,
      ecallOnly: sc.monitored === 0 && sc.ecallOnly > 0,
      beds: bedsByCare(dc),
      billedBeds: c?.units ?? 0,
      sensors: c?.additionalSensors ?? 0,
      devices: ps.plan,
      contingency: ps.total - ps.plan,
      areas: ps.areas,
    };
  });

  // ---- Price-line rows: one per line, or with every community, lines that share a description, price and term
  // summed (the quantity shows each community's part).
  const lineRows = (ls: PriceLine[], prefix: string): CheckRow[] => {
    const groups = new Map<string, PriceLine[]>();
    for (const l of ls) {
      const key = `${l.description}|${l.unitNet}|${l.billing}|${l.termMonths ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    return Array.from(groups.values()).flatMap((g) => {
      const l0 = g[0];
      const per = g.map((l) => ({ community: l.communityName, qty: l.qty, total: lineTotal(l) }));
      const row = (community: string | null, qtys: number[], total: number, idx: string): CheckRow => {
        const qty: Piece[] = qtys.length > 1 ? ['(', ...qtys.flatMap((q, j) => (j ? [' + ', { v: count(q) }] : [{ v: count(q) }])), ')'] : [{ v: count(qtys[0]) }];
        const what = l0.sku === SKU.sensor ? 'sensors' : ECALL_SKUS.has(l0.sku) ? 'devices' : 'beds';
        const unitWord = l0.billing === 'monthly' ? 'rate' : 'price';
        // Credits: −(quantity × price × credit %), from the line's net (−price × credit).
        const pct = k.installCreditPct;
        const formula: Piece[] =
          l0.unitNet < 0 && pct > 0
            ? [`−(${what} × ${l0.sku === SKU.sensor ? 'sensor price' : 'install'} × credit) = −`, ...qty, ' × ', { v: cents(-l0.unitNet / pct) }, ' × ', { v: `${Math.round(pct * 100)}%` }]
            : l0.billing === 'monthly'
            ? [`${what} × ${unitWord} × months = `, ...qty, ' × ', { v: cents(l0.unitNet) }, ' × ', { v: count(l0.termMonths ?? 0) }]
            : [`${what} × ${unitWord} = `, ...qty, ' × ', { v: cents(l0.unitNet) }];
        return { key: `${prefix}.${idx}`, label: l0.description, community, formula, result: total, unit: 'usd', calc: { qty: sum(qtys), unit: l0.unitNet, ...(l0.billing === 'monthly' ? { months: l0.termMonths ?? 0 } : {}) } };
      };
      // One row for the deal, plus one per community (the view filters by community).
      return [
        row(null, per.map((x) => x.qty), sum(per.map((x) => x.total)), `${l0.description}.${l0.unitNet}.${l0.termMonths}`),
        ...per.map((x, j) => row(x.community, [x.qty], x.total, `${l0.description}.${l0.unitNet}.${l0.termMonths}.c${j}`)),
      ];
    });
  };
  // Subtotals: one for the deal and one per community.
  const subtotals = (ls: PriceLine[], prefix: string, label: string, alsoOn?: string): CheckRow[] => {
    const mk = (community: string | null, xs: PriceLine[]): CheckRow => {
      const monthly = sum(xs.filter((l) => l.billing === 'monthly').map(lineTotal));
      const once = sum(xs.filter((l) => l.billing === 'one_time').map(lineTotal));
      return { key: `${prefix}.total${community ? `.${community}` : ''}`, label, community, formula: ['monthly fees ', { v: money(monthly) }, ' + one-time ', { v: money(once) }], result: monthly + once, unit: 'usd', total: true, alsoOn };
    };
    return [mk(null, ls), ...names.map((n, i) => mk(n, ls.filter((l) => l.communityPosition === i)))].filter((r) => r.community == null || ls.some((l) => l.communityName === r.community));
  };

  const groups: CheckGroup[] = [];
  const subLines = lines.filter((l) => !isEcallLine(l));
  if (subLines.length) {
    groups.push({
      key: 'subscription',
      title: 'Teton One',
      note: `Subscription · pilot + ${POLICY.serviceTermMonths}-month service term`,
      rows: [...lineRows(subLines, 'sub'), ...subtotals(subLines, 'sub', `Subscription over pilot + ${POLICY.serviceTermMonths} months`, 'Investment page')],
    });
  }

  const ecLines = lines.filter(isEcallLine);
  if (ecallOn && (ecLines.length || scope.some((s) => s.devices > 0))) {
    const devRows: CheckRow[] = [];
    const devTotal = sum(scope.map((s) => s.devices));
    draft.communities.forEach((dc, i) => {
      const ps = pendantScope(dc, ecallOn);
      if (ps.plan <= 0) return;
      devRows.push({
        key: `ec.dev.c${i}`,
        label: 'Devices billed',
        community: scope[i].name,
        formula: ['room devices + common-area devices = ', { v: count(ps.roomPendants) }, ' + ', { v: count(ps.areaPendants) }, ...(ps.total > ps.plan ? [` (contingency +${count(ps.total - ps.plan)} not billed)`] : [])],
        result: ps.plan,
        unit: 'count',
        alsoOn: 'Scope page',
      });
    });
    const withDev = scope.filter((s) => s.devices > 0);
    devRows.unshift({
      key: 'ec.dev',
      label: 'Devices billed',
      community: null,
      formula: withDev.length > 1 ? ['Σ communities = ', ...withDev.flatMap((s, j) => (j ? [' + ', { v: count(s.devices) }] : [{ v: count(s.devices) }]))] : ['room devices + common-area devices (before the contingency)'],
      result: devTotal,
      unit: 'count',
      alsoOn: 'Scope page',
    });
    groups.push({
      key: 'ecall',
      title: sys,
      note: 'Per device, per month · devices = pendants / pull-cords in rooms and common areas',
      rows: [...devRows, ...lineRows(ecLines, 'ec'), ...(ecLines.length ? subtotals(ecLines, 'ec', `E-Call over pilot + ${POLICY.serviceTermMonths} months`, 'Investment page') : [])],
    });
  }

  // ---- Equipment purchase
  const cx: CheckRow[] = [];
  for (const r of basePackageRows(capex)) {
    cx.push({
      key: `cx.base.${r.key}`,
      label: r.credit > 0 ? `${r.label} (pilot sites, after the credit)` : r.label,
      community: null,
      formula: ['beds × price = ', { v: count(r.beds) }, ' × ', ...(r.credit > 0 ? ['(', { v: cents(r.list) }, ' − ', { v: cents(r.credit) }, ')'] : [{ v: cents(r.perBed) }] as Piece[])],
      result: r.total,
      unit: 'usd',
      calc: { qty: r.beds, unit: r.perBed },
    });
  }
  for (const r of sensorRows(capex)) {
    cx.push({
      key: `cx.sensor.${r.key}`,
      label: 'Additional sensors',
      community: null,
      formula: ['sensors × price = ', { v: count(r.units) }, ' × ', ...(r.credit > 0 ? ['(', { v: cents(r.list) }, ' − ', { v: cents(r.credit) }, ')'] : [{ v: cents(r.perUnit) }] as Piece[])],
      result: r.total,
      unit: 'usd',
      calc: { qty: r.units, unit: r.perUnit },
    });
  }
  capex.communities.forEach((c, i) => {
    if (!c.equipment && !c.softwareMonthly) return;
    const parts = c.parts ?? [];
    cx.push({
      key: `cx.eq.c${i}`,
      label: 'Equipment',
      community: c.name,
      formula: [
        ...parts.flatMap((pt, j) => [...(j ? [' + '] : []), { v: count(pt.beds) }, ' × ', { v: cents(pt.perBed) }] as Piece[]),
        ...(c.sensors > 0 ? [parts.length ? ' + ' : '', { v: count(c.sensors) }, ' sensors × ', { v: cents(c.sensorPrice ?? p.sensorPrice) }] : []),
      ],
      result: c.equipment,
      unit: 'usd',
    });
  });
  cx.push({ key: 'cx.equipment', label: 'One-time equipment', community: null, formula: ['base packages + E-Call units + sensors = ', { v: money(capex.basePackages) }, ' + ', { v: money(capex.sensorCost) }], result: capex.equipment, unit: 'usd', total: true, alsoOn: 'Investment page' });
  const mon = sum(draft.communities.map((dc) => scopeOf(dc, ecallOn).monitored));
  const eo = sum(draft.communities.map((dc) => scopeOf(dc, ecallOn).ecallOnly));
  cx.push({
    key: 'cx.swMonthly',
    label: 'Software & services, monthly',
    community: null,
    formula: ['monitored beds × rate', ...(eo ? [' + E-Call-only beds × E-Call software'] : []), ' = ', { v: count(mon) }, ' × ', { v: cents(p.softwareRate) }, ...(eo ? [' + ', { v: count(eo) }, ' × ', { v: cents(p.ecallSoftware ?? 5) }] : [])],
    result: capex.softwareMonthly,
    unit: 'usd_mo',
  });
  cx.push({ key: 'cx.sw', label: `Software & services over ${capex.ownershipMonths} months`, community: null, formula: ['monthly × months = ', { v: money(capex.softwareMonthly) }, ' × ', { v: count(capex.ownershipMonths) }], result: capex.software, unit: 'usd' });
  if (ecallOn) {
    const years = k.ecall === 'inovonics' ? POLICY.capexInovonicsRenewalYears : POLICY.capexBleRenewalYears;
    const n = renewalsWithin(capex.ownershipMonths, years);
    const beds = sum(capex.communities.flatMap((c) => (c.parts ?? []).filter((pt) => pt.monitoring && pt.ecall !== 'none').map((pt) => pt.beds)));
    cx.push({
      key: 'cx.renewals',
      label: `E-Call renewals in ${capex.ownershipMonths} months`,
      community: null,
      formula: [`beds with E-Call × renewal × renewals (every ${years} years) = `, { v: count(beds) }, ' × ', { v: cents(k.ecall === 'inovonics' ? p.inovonicsRenewal : p.bleRenewal) }, ' × ', { v: count(n) }],
      result: capex.renewals,
      unit: 'usd',
    });
  }
  cx.push({ key: 'cx.own', label: `${capex.ownershipMonths / 12}-year cost of ownership`, community: null, formula: ['equipment + software + renewals = ', { v: money(capex.equipment) }, ' + ', { v: money(capex.software) }, ' + ', { v: money(capex.renewals) }], result: capex.ownershipTotal, unit: 'usd', total: true, alsoOn: 'Investment page' });
  groups.push({ key: 'capex', title: '', note: `Title passes at install · ${capex.ownershipMonths}-month cost of ownership`, rows: cx });

  // ---- Results on this page (subscription view, from the cash flow being shown)
  const w = out.kpis.kpiWindowMonths;
  const fees12 = sum(cf.recurringFees.slice(0, w));
  const inst12 = sum(cf.install.slice(0, w));
  const reimb12 = sum(cf.reimbursement.slice(0, w));
  const gross12 = sum(cf.grossBenefit.slice(0, w));
  const H = cf.months.length;
  const card = a.capexSummary ? undefined : 'Summary card';
  const res: CheckRow[] = [
    { key: 'r.inv', label: `Total investment, months 1–${w}`, community: null, formula: ['fees + install', ...(inputs.schedule.includeReimbursement ? [' + reimbursement'] : []), ' = ', { v: money(fees12) }, ' + ', { v: money(inst12) }, ...(inputs.schedule.includeReimbursement ? [' + ', { v: money(reimb12) }] : [])], result: out.kpis.totalInvestment12, unit: 'usd', alsoOn: card },
    { key: 'r.net', label: `Net benefit, months 1–${w}`, community: null, formula: ['gross benefit − investment = ', { v: money(gross12) }, ' − ', { v: money(out.kpis.totalInvestment12) }], result: out.kpis.netBenefit12, unit: 'usd', alsoOn: card },
    { key: 'r.rr', label: 'Run-rate annual net benefit', community: null, formula: [`month ${H} net × 12 = `, { v: money(cf.netBenefit[H - 1] ?? 0) }, ' × ', { v: '12' }], result: out.kpis.runRateAnnualNetBenefit, unit: 'usd', alsoOn: card },
  ];
  groups.push({ key: 'results', title: 'On this page', note: `Subscription pricing · ${out.roiCase} case`, rows: res });

  // ---- Self-checks
  const checks: SelfCheck[] = [];
  const linesTerm = sum(lines.map(lineTotal));
  const model = subscriptionTotals(inputs, POLICY.serviceTermMonths);
  checks.push({
    key: 'lines-model',
    ok: near(linesTerm, model.total),
    label: `Price lines add up to the model (pilot + ${POLICY.serviceTermMonths} months)`,
    detail: `Price lines ${money(linesTerm)} · model ${money(model.total)}`,
  });
  const linesH = sum(lines.map((l) => lineBilledThrough(l, H)));
  const cfH = sum(cf.recurringFees) + sum(cf.install);
  checks.push({
    key: 'lines-cf',
    ok: near(linesH, cfH),
    label: `Price lines match the cash flow (months 1–${H})`,
    detail: `Price lines ${money(linesH)} · cash flow ${money(cfH)}`,
  });
  const linesW = sum(lines.map((l) => lineBilledThrough(l, w))) + (inputs.schedule.includeReimbursement ? reimb12 : 0);
  checks.push({
    key: 'year1',
    ok: near(linesW, out.kpis.totalInvestment12),
    label: a.capexSummary ? `Year 1 subscription investment matches the model` : 'Year 1 investment matches the summary card',
    detail: `Price lines ${money(linesW)} · ${a.capexSummary ? 'model' : 'card'} ${money(out.kpis.totalInvestment12)}`,
  });
  const eqRows = sum(basePackageRows(capex).map((r) => r.total)) + sum(sensorRows(capex).map((r) => r.total));
  const eqOk = near(eqRows, capex.equipment) && near(capex.equipment + capex.software + capex.renewals, capex.ownershipTotal);
  const live = a.capexLive;
  const liveOk = !live || (near(live.equipment, capex.equipment) && near(live.ownershipTotal, capex.ownershipTotal));
  checks.push({
    key: 'equipment',
    ok: eqOk && liveOk,
    label: 'Equipment rows add up to the equipment total',
    detail: !liveOk && live ? `Saved ${money(capex.ownershipTotal)} · recomputed from the inputs ${money(live.ownershipTotal)}` : `Rows ${money(eqRows)} · total ${money(capex.equipment)}`,
  });
  const diff = inRows.filter((r) => r.differs).length;
  checks.push({
    key: 'book',
    ok: diff === 0,
    warn: diff > 0,
    label: diff === 0 ? 'Every price matches the price book' : `${diff} ${diff === 1 ? 'price differs' : 'prices differ'} from the price book`,
    detail: diff === 0 ? 'No deal-specific prices' : inRows.filter((r) => r.differs).map((r) => r.label).join(' · '),
  });

  return { inputs: inRows, scope, groups, checks, communities: names };
}
