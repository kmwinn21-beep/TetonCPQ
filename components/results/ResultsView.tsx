'use client';

/**
 * Results for one quote: the KPI cards, charts, benefit breakdown, case
 * comparison, opex vs capex, per-community detail and the monthly table.
 *
 * For a saved version, every number shown is the one stored when it was saved.
 * The drill-down is rebuilt from the version's stored inputs; if the engine has
 * changed since and the rebuilt numbers differ, a banner says so.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { computeCapex, runModel, runVendorView, type ModelResult, type RoiCase, type Trace } from '@/lib/model';
import { priceBook, SKU, type Product } from '@/lib/pricing/catalog';
import { evaluateGuardrails, type GuardrailResult } from '@/lib/pricing/guardrails';
import type { QuoteDraft } from '@/lib/quote/draft';
import { monthLabel, toModelInputs } from '@/lib/quote/toModelInputs';
import type { StoredOutputs, VersionSummary } from '@/lib/data/quotes';
import { count, dateLabel, multiple, pct, usd } from '@/lib/format';
import { CumulativeChart, MonthlyBenefitCostChart, type MonthPoint } from './Charts';
import { TraceDrawer } from './TraceDrawer';
import { ImplementationGantt } from '@/components/implementation/ImplementationGantt';
import { pilotPlan } from '@/lib/quote/pilotGoLives';
import { defaultPlan, normalizePlan } from '@/lib/quote/implementationPlan';
import { VersionCompare, type CompareTarget } from './VersionCompare';

const CASES: RoiCase[] = ['stretch', 'target', 'base', 'underperforming'];
const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export interface StoredVersion {
  versionNo: number;
  savedAt: string | null;
  note: string | null;
  engineVersion: string | null;
  savedBy?: string | null;
  outputs: StoredOutputs | null;
  guardrails: GuardrailResult | null;
}

interface Props {
  versionId: number | null;
  compare: CompareTarget | null;
  quoteId: number;
  draft: QuoteDraft;
  stored: StoredVersion | null;
  versions: VersionSummary[];
  draftVersionNo: number;
  products: Product[];
}

export function ResultsView({ versionId, compare, quoteId, draft, stored, versions, draftVersionNo, products }: Props) {
  const router = useRouter();
  const book = useMemo(() => priceBook(products), [products]);
  const [open, setOpen] = useState<Trace | null>(null);

  const model = useMemo(() => {
    const inputs = toModelInputs(draft);
    const live = runModel(inputs);
    const capexLive = computeCapex(inputs, draft.commercial.capexDiscountRate);
    return { inputs, live, capexLive };
  }, [draft]);
  const { inputs, live, capexLive } = model;

  // What to display: the stored numbers for a saved version, live numbers for the draft.
  const out: Omit<ModelResult, 'traces'> = stored?.outputs ?? live;
  const capex = stored?.outputs?.capex ?? capexLive;
  const guardrails = stored?.guardrails ?? evaluateGuardrails(draft, book[SKU.platform]?.list, { ble: book[SKU.ecallBle]?.list ?? 10, inovonics: book[SKU.ecallInovonics]?.list ?? 15 });
  const traces = live.traces;
  const drift =
    stored?.outputs &&
    (Math.abs(stored.outputs.kpis.totalInvestment12 - live.kpis.totalInvestment12) > 0.005 ||
      Math.abs(stored.outputs.kpis.netBenefit12 - live.kpis.netBenefit12) > 0.005 ||
      Math.abs(stored.outputs.kpis.runRateAnnualNetBenefit - live.kpis.runRateAnnualNetBenefit) > 0.005);

  const k = out.kpis;
  const cf = out.cashFlow;
  const sel = out.annual[out.roiCase];
  const caseName = CASE_LABEL[out.roiCase];
  const w = k.kpiWindowMonths;
  const start = inputs.schedule.startDate;
  const show = (id: string) => traces[id] && setOpen(traces[id]);
  // Implementation plan for pilot sites, from the version's own inputs and go-live months.
  const pilots = pilotPlan(draft, start, cf.communities.map((c) => c.goLiveMonth));
  const [today] = useState(() => new Date().toLocaleDateString('en-CA'));

  const points: MonthPoint[] = cf.months.map((m, i) => ({
    month: m,
    label: monthLabel(start, m),
    gross: cf.grossBenefit[i],
    cost: cf.totalCost[i],
    cumulativeDiscounted: cf.cumulativeDiscountedNet[i],
  }));

  const vendor = useMemo(() => runVendorView(inputs), [inputs]);

  const cards: Array<{ id: string; label: string; value: string; caption: string; negative?: boolean }> = [
    { id: 'kpi.totalInvestment12', label: 'Total Investment — Year 1', value: usd(k.totalInvestment12), caption: `Install ${usd(sum(cf.install.slice(0, w)))} · Fees ${usd(sum(cf.recurringFees.slice(0, w)))}${inputs.schedule.includeReimbursement ? ` · Reimb. ${usd(sum(cf.reimbursement.slice(0, w)))}` : ''}` },
    { id: 'kpi.netBenefit12', label: 'Net Benefit — Year 1', value: usd(k.netBenefit12), caption: `${caseName} case · net of all Teton costs`, negative: k.netBenefit12 < 0 },
    { id: 'kpi.grossReturnPerDollar12', label: 'Gross Return per $1 Invested (Year 1)', value: multiple(k.grossReturnPerDollar12), caption: `Stabilized return per $1 invested: ${multiple(sel.totals.returnOnCost, 1)} (${caseName} case return on cost)` },
    { id: 'kpi.discountedPaybackMonth', label: 'Discounted Payback', value: k.discountedPaybackMonth ? `Month ${k.discountedPaybackMonth}` : `Beyond month ${k.horizonMonths}`, caption: `Undiscounted: ${k.undiscountedPaybackMonth ? `month ${k.undiscountedPaybackMonth}` : 'not within horizon'} · first billing month ${k.firstBillingMonth ?? '—'}` },
    { id: 'kpi.runRateAnnualNetBenefit', label: 'Run-Rate Annual Net Benefit', value: usd(k.runRateAnnualNetBenefit), caption: `Month ${k.horizonMonths} net × 12 — every community live and ramped`, negative: k.runRateAnnualNetBenefit < 0 },
    { id: 'kpi.netBenefitPerOccupiedUnitMonth', label: 'Net Benefit per Unit per Month', value: `${usd(k.netBenefitPerOccupiedUnitMonth)} / occupied unit`, caption: `${usd(k.netBenefitPerUnitMonth)} per unit across ${count(inputs.cfo.portfolioUnits)} total units` },
  ];

  const breakdown: Array<[string, string, string]> = [
    ['annual.residentsRealigned', 'Residents realigned', count(sel.totals.residentsRealigned)],
    ['annual.costlyFallsPrevented', 'Costly falls prevented', count(sel.totals.costlyFallsPrevented)],
    ['annual.fallCostAvoidance', 'Fall cost avoidance', usd(sel.totals.fallCostAvoidance)],
    ['annual.revenueFromLosIncrease', 'Revenue from LOS increase', usd(sel.totals.revenueFromLosIncrease)],
    ['annual.nightShiftSavings', 'Night shift savings', usd(sel.totals.nightShiftSavings)],
    ['annual.moveInImpact', 'Move-in impact', usd(sel.totals.moveInImpact)],
    ['annual.recapturedCareRevenue', 'Recaptured care revenue', usd(sel.totals.recapturedCareRevenue)],
    ['annual.techReplacement', 'Tech replacement', usd(sel.totals.techReplacement)],
    ['annual.totalRevenuePerMonth', 'Total revenue / month', usd(sel.totals.totalRevenuePerMonth)],
    ['annual.annualRoi', 'Annual ROI', usd(sel.totals.annualRoi)],
  ];

  const comparison: Array<{ id: string; label: string; fmt: (rc: RoiCase) => string }> = [
    { id: 'annual.annualRoi', label: 'Annual ROI', fmt: (rc) => usd(out.annual[rc].totals.annualRoi, { compact: true }) },
    { id: 'annual.returnOnCost', label: 'Return on cost', fmt: (rc) => multiple(out.annual[rc].totals.returnOnCost, 1) },
    { id: 'annual.breakevenMonths', label: 'Breakeven', fmt: (rc) => `${out.annual[rc].totals.breakevenMonths.toFixed(1)} months` },
    { id: 'annual.netRevpor', label: 'Net RevPOR (annual)', fmt: (rc) => usd(out.annual[rc].totals.netRevpor) },
    { id: 'annual.annualNetNoiImpact', label: 'Annual net NOI impact', fmt: (rc) => usd(out.annual[rc].totals.annualNetNoiImpact, { compact: true }) },
    { id: 'annual.valuationImpact', label: `Valuation impact (${pct(inputs.valuation.capRate, 1)} cap)`, fmt: (rc) => usd(out.annual[rc].totals.valuationImpact, { compact: true }) },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/quotes/${quoteId}`} className="text-xs text-teton-ui-gray hover:underline">← Inputs</Link>
          <h1 className="text-2xl font-semibold mt-1">{draft.customerName}</h1>
          <p className="text-sm text-teton-ui-gray mt-1">
            {stored ? (
              <>Version {stored.versionNo} · saved {dateLabel(stored.savedAt)}{stored.savedBy ? ` by ${stored.savedBy}` : ''}{stored.note ? ` · “${stored.note}”` : ''} · frozen</>
            ) : (
              <>Current draft (v{draftVersionNo}, not saved as a version)</>
            )}
            {' · '}{caseName} case · {guardrails.rung ? `ladder rung ${guardrails.rung}` : 'below the ladder'}
            {guardrails.findings.length > 0 && ` · ${guardrails.findings.length} pricing ${guardrails.findings.length === 1 ? 'note' : 'notes'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {versionId ? (
            <Link href={`/proposal/${versionId}`} className="btn-primary">Proposal</Link>
          ) : versions.length ? (
            <Link href={`/proposal/${versions[0].id}`} className="btn-secondary" title="Proposals are made from saved versions">Proposal (v{versions[0].versionNo})</Link>
          ) : (
            <span className="text-xs text-teton-ui-gray max-w-[12rem]">Save a version to create a proposal.</span>
          )}
          <div>
          <label htmlFor="version" className="label">Showing</label>
          <select
            id="version"
            className="input-field w-64"
            value={stored ? String(versions.find((v) => v.versionNo === stored.versionNo)?.id ?? '') : 'draft'}
            onChange={(e) => router.push(e.target.value === 'draft' ? `/quotes/${quoteId}/results` : `/quotes/${quoteId}/results?v=${e.target.value}`)}
          >
            <option value="draft">Current draft</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNo} · {dateLabel(v.savedAt)}{v.changeNote ? ` · ${v.changeNote}` : ''}
              </option>
            ))}
          </select>
          </div>
        </div>
      </header>

      {drift && (
        <div className="rounded-lg bg-teton-pale-yellow px-4 py-3 text-sm" role="status">
          This version was saved with engine {stored?.engineVersion ?? 'unknown'}; the model is now {live.engineVersion} and gives different numbers for these inputs.
          The figures on this page are the saved ones. Drill-downs show today’s calculation.
        </div>
      )}

      <section aria-labelledby="kpis">
        <h2 id="kpis" className="text-base font-semibold mb-3">Summary — Year 1</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <button key={c.id} type="button" onClick={() => show(c.id)} className="card text-left hover:border-teton-pale-gray hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
              <p className="text-xs font-medium text-teton-dark-gray">{c.label}</p>
              <p className={`text-2xl font-semibold tabular-nums mt-1 ${c.negative ? 'inline-block bg-teton-red/30 rounded px-1' : ''}`}>{c.value}</p>
              <p className="text-xs text-teton-ui-gray mt-1">{c.caption}</p>
              <p className="text-xs text-teton-dark-gray mt-3 underline underline-offset-2">How is this calculated?</p>
            </button>
          ))}
        </div>
      </section>

      <VersionCompare
        currentLabel={stored ? `v${stored.versionNo}` : 'current draft'}
        current={{ inputs: draft, outputs: { ...out, capex } }}
        compare={compare}
        options={versions.filter((v) => v.id !== versionId)}
        onPick={(id) => router.push(`/quotes/${quoteId}/results?${versionId ? `v=${versionId}&` : ''}compare=${id}`)}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Benefit vs cost by month</h2>
          <p className="text-sm text-teton-ui-gray mb-3">Months 1–{k.horizonMonths} from {dateLabel(start)}.</p>
          <MonthlyBenefitCostChart data={points} />
        </div>
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Cumulative discounted net benefit</h2>
          <CumulativeChart data={points} paybackMonth={k.discountedPaybackMonth} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Benefit breakdown — {caseName}, annual</h2>
          <p className="text-sm text-teton-ui-gray mb-3">Steady state, every community live. Click a line for its formula.</p>
          <table className="w-full text-sm">
            <tbody>
              {breakdown.map(([id, label, value]) => (
                <tr key={id} className={`border-t border-teton-off-white ${id === 'annual.annualRoi' ? 'font-semibold' : ''}`}>
                  <td className="py-2">
                    <button type="button" className="hover:underline text-left" onClick={() => show(id)}>{label}</button>
                  </td>
                  <td className="py-2 text-right tabular-nums">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <h2 className="text-base font-semibold mb-1">All four cases</h2>
          <p className="text-sm text-teton-ui-gray mb-3">Every unit at post-pilot price plus full install, as in the workbook’s breakeven table.</p>
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-xs text-teton-dark-gray">
                <th className="text-left font-medium py-1.5" />
                {CASES.map((rc) => (
                  <th key={rc} className={`text-right font-medium py-1.5 px-2 ${rc === out.roiCase ? 'bg-teton-pale-purple rounded-t' : ''}`}>{CASE_LABEL[rc]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.id} className="border-t border-teton-off-white">
                  <td className="py-2">
                    <button type="button" className="hover:underline text-left" onClick={() => show(row.id)} title={`Formula for the ${caseName} case`}>{row.label}</button>
                  </td>
                  {CASES.map((rc) => (
                    <td key={rc} className={`py-2 px-2 text-right tabular-nums ${rc === out.roiCase ? 'bg-teton-pale-purple font-semibold' : ''}`}>
                      {row.fmt(rc)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold">Investment: subscription or upfront</h2>
          <span className="badge-gray">Proposal shows: {draft.presentation === 'both' ? 'both' : draft.presentation === 'capex' ? 'upfront (capex)' : 'subscription (opex)'}</span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <table className="w-full text-sm">
            <caption className="text-left text-xs font-medium text-teton-dark-gray pb-2">Subscription (opex), {capex.termMonths}-month service term</caption>
            <tbody className="tabular-nums">
              <tr className="border-t border-teton-off-white"><td className="py-2">Installation</td><td className="py-2 text-right">{usd(capex.install)}</td></tr>
              <tr className="border-t border-teton-off-white"><td className="py-2">Pilot fees</td><td className="py-2 text-right">{usd(capex.pilotFees)}</td></tr>
              <tr className="border-t border-teton-off-white"><td className="py-2">Subscription, paid monthly</td><td className="py-2 text-right">{usd(capex.nominalSubscription)}</td></tr>
              <tr className="border-t border-teton-off-white font-semibold"><td className="py-2">Total over the term</td><td className="py-2 text-right">{usd(capex.opexTotal)}</td></tr>
            </tbody>
          </table>
          <table className="w-full text-sm">
            <caption className="text-left text-xs font-medium text-teton-dark-gray pb-2">Upfront (capex), discounted at {pct(capex.annualDiscountRate, 1)} a year</caption>
            <tbody className="tabular-nums">
              <tr className="border-t border-teton-off-white"><td className="py-2">Installation</td><td className="py-2 text-right">{usd(capex.install)}</td></tr>
              <tr className="border-t border-teton-off-white">
                <td className="py-2"><button type="button" className="hover:underline text-left" onClick={() => setOpen(capexLive.trace)}>Subscription, paid upfront</button></td>
                <td className="py-2 text-right">{usd(capex.upfrontSubscription)}</td>
              </tr>
              <tr className="border-t border-teton-off-white font-semibold"><td className="py-2">Capex price</td><td className="py-2 text-right">{usd(capex.capexTotal)}</td></tr>
              <tr className="border-t border-teton-off-white text-teton-dark-gray"><td className="py-2">Plus pilot fees (operating)</td><td className="py-2 text-right">{usd(capex.pilotFees)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-teton-ui-gray mt-3">Paying upfront saves {usd(capex.upfrontDiscount)} against monthly payments over the term. Each community’s term starts after its pilot.</p>
      </section>

      {pilots.length > 0 && (
        <section className="card" aria-labelledby="impl-h">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 id="impl-h" className="text-base font-semibold">Implementation</h2>
              <p className="text-sm text-teton-ui-gray">
                Pilot sites · {pilots.reduce((n, g) => n + g.names.length, 0)} {pilots.reduce((n, g) => n + g.names.length, 0) === 1 ? 'community' : 'communities'} · {pilots.length}{' '}
                go-live {pilots.length === 1 ? 'date' : 'dates'} · {pilots[0].schedule.weeksToGoLive} weeks from contract start to go-live
              </p>
            </div>
            <span className="badge-gray">{JSON.stringify(normalizePlan(draft.implementationPlan)) === JSON.stringify(defaultPlan()) ? 'Standard stage lengths' : 'Custom stage lengths'}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <ImplementationGantt groups={pilots} today={today} />
            </div>
          </div>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="text-base font-semibold mb-3">By community</h2>
        <table className="w-full text-sm min-w-[860px]">
          <thead className="text-xs text-teton-dark-gray text-left">
            <tr>
              <th className="font-medium py-1.5">Community</th>
              <th className="font-medium py-1.5 text-right">Units</th>
              <th className="font-medium py-1.5 text-right">Occupied</th>
              <th className="font-medium py-1.5">Go-live</th>
              <th className="font-medium py-1.5 text-right">ROI from</th>
              <th className="font-medium py-1.5 text-right">Annual ROI ({caseName})</th>
              <th className="font-medium py-1.5 text-right">Install</th>
              <th className="font-medium py-1.5 text-right">Fees, mo 1–{w}</th>
              <th className="font-medium py-1.5 text-right">Benefit, mo 1–{w}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {inputs.communities.map((c, i) => {
              const cc = cf.communities[i];
              return (
                <tr key={i} className="border-t border-teton-off-white">
                  <td className="py-2">{c.name}{cc.inPilot && <span className="badge-green ml-2">pilot</span>}</td>
                  <td className="py-2 text-right">{count(c.units)}</td>
                  <td className="py-2 text-right">{count(sel.drivers[i].totalFalls / (inputs.client.fallsPerResidentYear || 1))}</td>
                  <td className="py-2">{monthLabel(start, cc.goLiveMonth)} (m{cc.goLiveMonth})</td>
                  <td className="py-2 text-right">month {cc.roiStartMonth}</td>
                  <td className="py-2 text-right">{usd(sel.communities[i].annualRoi)}</td>
                  <td className="py-2 text-right">{usd(cc.installCost)}</td>
                  <td className="py-2 text-right">{usd(sum(cc.fees.slice(0, w)))}</td>
                  <td className="py-2 text-right">{usd(sum(cc.gross.slice(0, w)))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold mb-1">Monthly cash flow</h2>
        <p className="text-sm text-teton-ui-gray mb-3">The table behind the charts. Scroll sideways for later months.</p>
        <div className="overflow-x-auto">
          <table className="text-xs tabular-nums border-separate border-spacing-0">
            <thead>
              <tr className="text-teton-dark-gray">
                <th className="sticky left-0 bg-white text-left font-medium py-1.5 pr-4 min-w-[190px]">Month</th>
                {cf.months.map((m) => (
                  <th key={m} className="font-medium py-1.5 px-2 text-right whitespace-nowrap">{m}<span className="block font-normal text-teton-ui-gray">{monthLabel(start, m)}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Subscription fees', cf.recurringFees],
                  ['One-time install', cf.install],
                  ...(inputs.schedule.includeReimbursement ? [['Reimbursement', cf.reimbursement] as const] : []),
                  ['Total Teton cost', cf.totalCost],
                  [`Gross benefit (${caseName})`, cf.grossBenefit],
                  ['Net benefit', cf.netBenefit],
                  ['Cumulative net', cf.cumulativeNet],
                  ['Cumulative discounted net', cf.cumulativeDiscountedNet],
                ] as Array<readonly [string, number[]]>
              ).map(([label, row]) => (
                <tr key={label} className={label.startsWith('Total') || label === 'Net benefit' ? 'font-semibold' : ''}>
                  <th scope="row" className={`sticky left-0 bg-white text-left py-1.5 pr-4 border-t border-teton-off-white ${label.startsWith('Total') || label === 'Net benefit' ? 'font-semibold' : 'font-normal'}`}>{label}</th>
                  {row.map((v, i) => (
                    <td key={i} className="py-1.5 px-2 text-right whitespace-nowrap border-t border-teton-off-white">{usd(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card">
        <summary className="cursor-pointer text-base font-semibold">Teton internal — deal margin <span className="badge-yellow ml-2 align-middle">never shown to the customer</span></summary>
        <div className="grid gap-4 sm:grid-cols-3 mt-4 text-sm">
          {[
            ['36-month revenue', usd(vendor.summary.totalRevenue36)],
            ['Gross margin', pct(vendor.summary.grossMarginPct36)],
            ['Net margin after CAC', pct(vendor.summary.netMarginPct36)],
            ['Peak cash outlay', usd(vendor.summary.peakCashOutlay)],
            ['Payback', vendor.summary.paybackMonth === 0 ? 'Immediate' : vendor.summary.paybackMonth ? `Month ${vendor.summary.paybackMonth}` : '> 36 months'],
            ['NPV (36 months)', usd(vendor.summary.npv36)],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-xs text-teton-dark-gray">{l}</p>
              <p className="font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-teton-ui-gray mt-3">Cost-to-serve figures are the workbook’s placeholders ($300 hardware, $50 install labor, $50 CAC per bed; $10/billed bed/month to run) until finance supplies actuals. Always the current calculation.</p>
      </details>

      <TraceDrawer trace={open} onClose={() => setOpen(null)} />
    </div>
  );
}
