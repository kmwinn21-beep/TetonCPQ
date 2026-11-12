/**
 * The client-facing proposal, rendered from a saved version only: its stored
 * inputs, stored outputs and stored price lines. Nothing is recalculated here,
 * so the document always matches what the version recorded.
 *
 * Content: summary KPI cards, scope, investment (subscription and/or upfront),
 * return on investment, and the assumptions behind it.
 */
import type { StoredOutputs } from '@/lib/data/quotes';
import type { RoiCase } from '@/lib/model';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { POLICY } from '@/lib/pricing/catalog';
import type { QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { count, dateLabel, monthName, multiple, pct, usd } from '@/lib/format';
import { CumulativeChart, type MonthPoint } from '@/components/results/Charts';

const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export interface ProposalProps {
  draft: QuoteDraft;
  outputs: StoredOutputs;
  lines: PriceLine[];
  versionNo: number;
  savedAt: string | null;
}

function TetonWordmark() {
  return (
    <div className="flex items-center gap-2 text-teton-ink">
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="4.5" r="2.5" />
        <path d="M5 9.5h14v2.2c0 3.9-3.1 7.1-7 7.1s-7-3.2-7-7.1V9.5z" />
      </svg>
      <span className="text-xl font-semibold tracking-tight">Teton</span>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold border-b-2 border-teton-ink pb-1 mb-3">{children}</h2>;
}

export function ProposalDocument({ draft, outputs, lines, versionNo, savedAt }: ProposalProps) {
  const inputs = toModelInputs(draft);
  const start = inputs.schedule.startDate;
  const k = outputs.kpis;
  const cf = outputs.cashFlow;
  const rc = outputs.roiCase;
  const sel = outputs.annual[rc].totals;
  const capex = outputs.capex;
  const showOpex = draft.presentation !== 'capex' || !capex;
  const showCapex = (draft.presentation === 'capex' || draft.presentation === 'both') && !!capex;
  const units = inputs.communities.reduce((s, c) => s + c.units, 0);
  const anyPilot = cf.communities.some((c) => c.inPilot);
  const term = POLICY.serviceTermMonths;
  const credit = draft.commercial.installCreditPct;

  const oneTime = sum(lines.filter((l) => l.billing === 'one_time').map(lineTotal));
  const pilotMonthly = sum(lines.filter((l) => l.billing === 'monthly' && l.description.includes('pilot')).map((l) => l.qty * l.unitNet));
  const serviceMonthly = sum(
    lines.filter((l) => l.billing === 'monthly' && !l.description.includes('pilot') && !l.description.includes('introductory')).map((l) => l.qty * l.unitNet),
  );
  const termTotal = sum(lines.map(lineTotal));

  const points: MonthPoint[] = cf.months.map((m, i) => ({ month: m, label: monthName(start, m), gross: cf.grossBenefit[i], cost: cf.totalCost[i], cumulativeDiscounted: cf.cumulativeDiscountedNet[i] }));

  const cards: Array<[string, string, string]> = [
    ['Total Investment — 12 Mo', usd(k.totalInvestment12), 'Everything paid to Teton in the first 12 months: installation plus monthly subscription.'],
    ['Net Benefit — 12 Mo', usd(k.netBenefit12), 'How much better off your communities are in year one after paying for everything.'],
    ['Gross Return per $1 Invested', multiple(k.grossReturnPerDollar12), `For every $1 spent on Teton in year one, the benefit that comes back.`],
    ['Discounted Payback', k.discountedPaybackMonth ? `Month ${k.discountedPaybackMonth}` : `Beyond month ${k.horizonMonths}`, `When the program has paid for itself and stays paid for, using your ${pct(inputs.cfo.annualDiscountRate, 1)} cost of money.`],
    ['Run-Rate Annual Net Benefit', usd(k.runRateAnnualNetBenefit), 'The yearly value once every community is live and fully ramped, after subscription fees.'],
    ['Net Benefit per Unit per Month', usd(k.netBenefitPerOccupiedUnitMonth), `Per occupied apartment at run rate (${usd(k.netBenefitPerUnitMonth)} per unit across all ${count(inputs.cfo.portfolioUnits)} units).`],
  ];

  const benefits: Array<[string, string]> = [
    ['Recaptured care revenue', usd(sel.recapturedCareRevenue)],
    ['Fall cost avoidance', usd(sel.fallCostAvoidance)],
    ['Revenue from longer length of stay', usd(sel.revenueFromLosIncrease)],
    ['Night shift savings', usd(sel.nightShiftSavings)],
    ['Move-in impact', usd(sel.moveInImpact)],
    ['Tech replacement', usd(sel.techReplacement)],
  ];

  const c = inputs.client;
  const assumptions: Array<[string, string]> = [
    ['Occupancy', pct(c.occupancy)],
    ['Average rent / resident / month', usd(c.avgRent)],
    ['Care revenue / resident / month', usd(c.careRevenuePerResident)],
    ['Care revenue uplift per level-of-care step', `${usd(c.locGapUpliftPerTierStep)} / month`],
    ['Falls per resident per year', String(c.fallsPerResidentYear)],
    ['Falls leading to hospitalization', pct(c.pctFallsHospitalization)],
    ['Cost per hospitalization', usd(c.costPerHospitalization)],
    ['Falls leading to discharge', pct(c.pctFallsDischarge)],
    ['Length-of-stay protected per avoided discharge', `${c.losIncreaseMonths} months`],
    ['Move-ins per month (share of occupied)', pct(c.moveInRatePerMonth)],
    ['Night staffing ratio (residents per staff)', String(c.nightResidentToStaffRatio)],
    ['Night staff hourly wage', usd(c.nightHourlyWage, { cents: true })],
    ['Your discount rate', pct(inputs.cfo.annualDiscountRate)],
    ['Benefits start after go-live', `${inputs.schedule.roiStartDelayMonths} months, ramping over ${inputs.schedule.rampMonths}`],
  ];

  return (
    <article id="proposal" className="proposal-sheet bg-white max-w-[8.5in] mx-auto my-6 p-[0.6in] shadow-lg text-teton-ink text-[13px] leading-relaxed">
      <header className="flex items-start justify-between gap-6 mb-8">
        <TetonWordmark />
        <div className="text-right text-xs text-teton-dark-gray">
          <p>Proposal v{versionNo}</p>
          <p>{dateLabel(savedAt)}</p>
        </div>
      </header>

      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-teton-dark-gray">Proposal for</p>
        <h1 className="text-3xl font-semibold mt-1">{draft.customerName}</h1>
        <p className="mt-3 text-[14px] max-w-prose">
          Teton ambient monitoring for {inputs.communities.length} {inputs.communities.length === 1 ? 'community' : 'communities'} and {count(units)} beds
          {anyPilot ? `, starting with a ${inputs.schedule.pilotLengthMonths}-month pilot` : ''}, going live from {monthName(start, 1)}.
          Figures below use the {CASE_LABEL[rc]} case.
        </p>
      </section>

      <section className="mb-8 avoid-break">
        <H2>Summary</H2>
        <div className="grid grid-cols-3 gap-3">
          {cards.map(([label, value, meaning]) => (
            <div key={label} className="rounded-lg border border-teton-pale-gray p-3">
              <p className="text-[11px] font-medium text-teton-dark-gray">{label}</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{value}</p>
              <p className="text-[11px] text-teton-dark-gray mt-1 leading-snug">{meaning}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 avoid-break">
        <H2>Scope</H2>
        <table className="w-full">
          <thead className="text-[11px] text-teton-dark-gray text-left">
            <tr className="border-b border-teton-pale-gray">
              <th className="font-medium py-1.5">Community</th>
              <th className="font-medium py-1.5">Market</th>
              <th className="font-medium py-1.5 px-2 text-right">Beds</th>
              <th className="font-medium py-1.5 px-2">Coverage</th>
              <th className="font-medium py-1.5 px-2">E-Call</th>
              <th className="font-medium py-1.5 pl-2">Go-live</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {draft.communities.map((dc, i) => {
              const cc = cf.communities[i];
              return (
                <tr key={dc.id} className="border-b border-teton-off-white">
                  <td className="py-1.5">{inputs.communities[i].name}{cc.inPilot && <span className="ml-2 text-[11px] bg-teton-pale-green rounded px-1.5 py-0.5">Pilot</span>}</td>
                  <td className="py-1.5">{dc.market}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{count(inputs.communities[i].units)}{dc.snfBeds ? ` (${dc.snfBeds} SNF)` : ''}</td>
                  <td className="py-1.5 px-2">{dc.coverage === 'full_facility' ? 'Full facility' : 'Resident rooms'}</td>
                  <td className="py-1.5 px-2">{draft.commercial.ecall !== 'none' && dc.ecall ? 'Yes' : '—'}</td>
                  <td className="py-1.5 pl-2">{monthName(start, cc.goLiveMonth)}</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="py-1.5">Total</td>
              <td />
              <td className="py-1.5 px-2 text-right">{count(units)}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-8 page-break">
        <H2>Investment</H2>
        {showOpex && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4 avoid-break">
              <div className="rounded-lg bg-teton-almost-white p-3">
                <p className="text-[11px] text-teton-dark-gray">One-time{credit > 0 ? ', after credits' : ''}</p>
                <p className="text-lg font-semibold tabular-nums">{usd(oneTime)}</p>
              </div>
              <div className="rounded-lg bg-teton-almost-white p-3">
                <p className="text-[11px] text-teton-dark-gray">{anyPilot ? 'Monthly during the pilot' : 'Monthly, first months'}</p>
                <p className="text-lg font-semibold tabular-nums">{anyPilot ? usd(pilotMonthly) : '—'}</p>
              </div>
              <div className="rounded-lg bg-teton-almost-white p-3">
                <p className="text-[11px] text-teton-dark-gray">Monthly, all sites in service</p>
                <p className="text-lg font-semibold tabular-nums">{usd(serviceMonthly)}</p>
              </div>
            </div>
            <table className="w-full mb-2">
              <thead className="text-[11px] text-teton-dark-gray text-left">
                <tr className="border-b border-teton-pale-gray">
                  <th className="font-medium py-1.5">Item</th>
                  <th className="font-medium py-1.5 px-2 text-right">Qty</th>
                  <th className="font-medium py-1.5 px-2 text-right">Rate</th>
                  <th className="font-medium py-1.5 px-2">Billed</th>
                  <th className="font-medium py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              {draft.communities.map((dc, i) => {
                const ls = lines.filter((l) => l.communityPosition === i);
                return (
                  <tbody key={dc.id} className="tabular-nums avoid-break">
                    <tr>
                      <td colSpan={5} className="pt-3 pb-1 font-semibold">{inputs.communities[i].name}</td>
                    </tr>
                    {ls.map((l, j) => (
                      <tr key={j} className="border-b border-teton-off-white">
                        <td className="py-1 pr-2">{l.description}</td>
                        <td className="py-1 px-2 text-right">{count(l.qty)}</td>
                        <td className="py-1 px-2 text-right whitespace-nowrap">
                          {usd(l.unitNet, { cents: !Number.isInteger(l.unitNet) })}
                          {l.unitList > l.unitNet && l.unitNet >= 0 && <span className="block text-[10px] text-teton-ui-gray">list {usd(l.unitList, { cents: !Number.isInteger(l.unitList) })}</span>}
                        </td>
                        <td className="py-1 px-2 text-[12px] text-teton-dark-gray whitespace-nowrap">
                          {l.billing === 'monthly' ? `Monthly, ${monthName(start, l.startMonth)} · ${l.termMonths} mo` : `One-time, ${monthName(start, l.startMonth)}`}
                        </td>
                        <td className="py-1 text-right whitespace-nowrap">{l.billing === 'monthly' ? `${usd(l.qty * l.unitNet)}/mo` : usd(lineTotal(l))}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tbody>
                <tr className="font-semibold border-t-2 border-teton-ink">
                  <td colSpan={4} className="py-2">Total over {anyPilot ? `the pilot and the ${term}-month service term` : `the ${term}-month service term`}</td>
                  <td className="py-2 text-right tabular-nums">{usd(termTotal)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {showCapex && capex && (
          <div className="rounded-lg border border-teton-pale-gray p-4 mt-4 avoid-break">
            <p className="font-semibold">{showOpex ? 'Alternative: pay upfront (capital purchase)' : 'Upfront investment (capital purchase)'}</p>
            <p className="text-[12px] text-teton-dark-gray mt-1">
              The {capex.termMonths}-month service term paid in one payment, priced at its present value ({pct(capex.annualDiscountRate, 1)} a year), plus installation.
            </p>
            <table className="w-full mt-3 tabular-nums">
              <tbody>
                <tr className="border-b border-teton-off-white"><td className="py-1">Installation{credit > 0 && anyPilot ? ' (after pilot credits)' : ''}</td><td className="py-1 text-right">{usd(capex.install)}</td></tr>
                <tr className="border-b border-teton-off-white"><td className="py-1">Service term, paid upfront</td><td className="py-1 text-right">{usd(capex.upfrontSubscription)}</td></tr>
                <tr className="font-semibold"><td className="py-1.5">Upfront price</td><td className="py-1.5 text-right">{usd(capex.capexTotal)}</td></tr>
                {capex.pilotFees > 0 && <tr className="text-teton-dark-gray"><td className="py-1">Plus pilot fees, billed monthly during the pilot</td><td className="py-1 text-right">{usd(capex.pilotFees)}</td></tr>}
              </tbody>
            </table>
            <p className="text-[12px] text-teton-dark-gray mt-2">Saves {usd(capex.upfrontDiscount)} compared with paying the subscription monthly.</p>
          </div>
        )}

        <div className="mt-5 avoid-break">
          <p className="font-semibold mb-1">Terms</p>
          <ul className="list-disc pl-5 space-y-0.5 text-[12px]">
            {anyPilot && (
              <li>
                Pilot: {inputs.schedule.pilotLengthMonths} months at {usd(draft.commercial.pilotRate)} per bed per month{draft.commercial.ecall !== 'none' && draft.commercial.ecallPilotRate === 0 ? ', with E-Call included at no charge' : ''}, converting to a {term}-month service term.
              </li>
            )}
            <li>Service term of {term} months per community, starting {anyPilot ? 'when its pilot ends' : 'at go-live'}. Either party may end it for convenience within the first three months of the service term.</li>
            {credit > 0 && anyPilot && <li>Installation credit of {Math.round(credit * 100)}% on pilot beds{draft.commercial.installClawback ? ', repayable if the pilot does not convert to the service term' : ''}.</li>}
            {draft.commercial.specialRate != null && draft.commercial.specialTermMonths > 0 && <li>Introductory rate of {usd(draft.commercial.specialRate, { cents: true })} per bed for the first {draft.commercial.specialTermMonths} months of the service term.</li>}
            <li>Each community’s installation is billed at its go-live; recurring fees are billed quarterly in advance from go-live.</li>
          </ul>
        </div>
      </section>

      <section className="mb-8 avoid-break">
        <H2>Return on investment</H2>
        <div className="grid grid-cols-[1fr_1.2fr] gap-6">
          <div className="avoid-break">
            <p className="text-[12px] text-teton-dark-gray mb-2">Annual benefit once every community is live ({CASE_LABEL[rc]} case)</p>
            <table className="w-full tabular-nums">
              <tbody>
                {benefits.map(([l, v]) => (
                  <tr key={l} className="border-b border-teton-off-white">
                    <td className="py-1">{l}</td>
                    <td className="py-1 text-right">{v}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-teton-ink">
                  <td className="py-1.5">Total annual benefit</td>
                  <td className="py-1.5 text-right">{usd(sel.annualRoi)}</td>
                </tr>
              </tbody>
            </table>
            <ul className="text-[12px] text-teton-dark-gray mt-3 space-y-0.5">
              <li>{count(sel.residentsRealigned)} residents realigned to the right level of care</li>
              <li>{count(sel.costlyFallsPrevented)} costly falls prevented a year</li>
              <li>Annual NOI impact {usd(sel.annualNetNoiImpact)} · valuation impact {usd(sel.valuationImpact)} at a {pct(inputs.valuation.capRate, 1)} cap rate</li>
            </ul>
          </div>
          <div className="avoid-break">
            <CumulativeChart data={points} paybackMonth={k.discountedPaybackMonth} />
          </div>
        </div>
      </section>

      <section className="avoid-break">
        <H2>Assumptions</H2>
        <div className="grid grid-cols-2 gap-x-8">
          {assumptions.map(([l, v]) => (
            <div key={l} className="flex justify-between gap-3 border-b border-teton-off-white py-1">
              <span>{l}</span>
              <span className="tabular-nums font-medium whitespace-nowrap">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-teton-dark-gray mt-4">
          Benefits are modeled estimates based on the assumptions above and the {CASE_LABEL[rc]} case, not guaranteed results. Prices are in US dollars and exclude applicable taxes.
          Final pricing is set by the order form.
        </p>
      </section>
    </article>
  );
}
