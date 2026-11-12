/**
 * The client-facing proposal, rendered from a saved version only: its stored
 * inputs, stored outputs and stored price lines. Nothing is recalculated here,
 * so the document always matches what the version recorded.
 *
 * Content: summary KPI cards, scope & investment in one table (subscription and/or upfront),
 * return on investment, and the assumptions behind it.
 */
import type { StoredOutputs } from '@/lib/data/quotes';
import type { RoiCase } from '@/lib/model';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { POLICY } from '@/lib/pricing/catalog';
import type { QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { count, dateLabel, monthName, multiple, pct, usd } from '@/lib/format';
import { QuarterlyWaterfall } from './QuarterlyWaterfall';

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

/** A small flag marking pilot sites. Ink on a pale-green fill (fills carry the tint, never text). */
function PilotIcon() {
  return (
    <span className="inline-flex w-4 h-4 mt-0.5 flex-shrink-0 items-center justify-center rounded-full bg-teton-pale-green" title="Pilot site" aria-hidden="true">
      <svg className="w-2.5 h-2.5 text-teton-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 21V4" />
        <path d="M4 4h12l-2.5 4L16 12H4" fill="currentColor" />
      </svg>
    </span>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold border-b-2 border-teton-ink pb-1 mb-3">{children}</h2>;
}

export function ProposalDocument({ draft, outputs, lines, versionNo, savedAt }: ProposalProps) {
  const inputs = toModelInputs(draft);
  const start = inputs.schedule.startDate;
  const kp = outputs.kpis;
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

  // One row per community: monthly once in service, pilot / intro monthly, one-time net of credits.
  const isPilotLine = (l: PriceLine) => l.billing === 'monthly' && l.description.includes('— pilot');
  const isIntroLine = (l: PriceLine) => l.billing === 'monthly' && l.description.includes('introductory');
  const perCommunity = draft.communities.map((dc, i) => {
    const ls = lines.filter((l) => l.communityPosition === i);
    const cc = cf.communities[i];
    const pilotLines = ls.filter(isPilotLine);
    const introLines = ls.filter(isIntroLine);
    // During the intro term, the intro platform line replaces the regular one; other monthly lines (e-call) still apply.
    const introMonthly = introLines.length
      ? sum(introLines.map((l) => l.qty * l.unitNet)) + sum(ls.filter((l) => l.billing === 'monthly' && !isPilotLine(l) && !isIntroLine(l) && !l.description.startsWith('Teton subscription')).map((l) => l.qty * l.unitNet))
      : null;
    const coverage = dc.coverage === 'full_facility' ? 'Full facility' : 'Resident rooms';
    const hasEcall = draft.commercial.ecall !== 'none' && dc.ecall;
    return {
      key: dc.id,
      name: inputs.communities[i].name,
      pilot: cc.inPilot,
      detail: [dc.market, coverage, hasEcall ? 'E-Call' : null].filter(Boolean).join(' · '),
      units: inputs.communities[i].units,
      // Care-type mix under the total, e.g. "AL 10 · MC 19" (zeros left out).
      mix: (
        [
          ['IL', dc.ilBeds],
          ['AL', dc.alBeds],
          ['MC', dc.mcBeds],
          ['SNF', dc.snfBeds],
        ] as const
      )
        .filter(([, n]) => (Number(n) || 0) > 0)
        .map(([t, n]) => `${t} ${count(Number(n))}`)
        .join(' · '),
      goLive: monthName(start, cc.goLiveMonth),
      pilotUntil: cc.inPilot ? monthName(start, cc.firstPostPilotMonth - 1) : null,
      monthly: sum(ls.filter((l) => l.billing === 'monthly' && !isPilotLine(l) && !isIntroLine(l)).map((l) => l.qty * l.unitNet)),
      pilotMonthly: pilotLines.length ? sum(pilotLines.map((l) => l.qty * l.unitNet)) : null,
      introMonthly,
      introMonths: introLines[0]?.termMonths ?? 0,
      oneTime: sum(ls.filter((l) => l.billing === 'one_time').map(lineTotal)),
      credit: -sum(ls.filter((l) => l.concessionCode?.startsWith('INSTALL_CREDIT')).map(lineTotal)),
    };
  });

  // Per-bed rates, stated once. List price shown only where the rate is discounted.
  const k = draft.commercial;
  const firstLine = (pred: (l: PriceLine) => boolean) => lines.find(pred);
  const listOf = (pred: (l: PriceLine) => boolean, mult = 1) => {
    const l = firstLine(pred);
    return l ? l.unitList / mult : null;
  };
  const anyFull = draft.communities.some((dc) => dc.coverage === 'full_facility');
  const platformList =
    listOf((l) => l.description === 'Teton subscription') ?? listOf((l) => l.description === 'Teton subscription, full-facility coverage', k.fullFacilityMultiplier);
  const installList =
    listOf((l) => l.description === 'Installation & implementation') ?? listOf((l) => l.description === 'Installation & implementation, full-facility coverage', k.fullFacilityMultiplier);
  const ecallList = listOf((l) => l.description.startsWith('E-Call (') );
  const money = (n: number) => usd(n, { cents: !Number.isInteger(n) });
  const rateSummary: Array<{ label: string; value: string; list?: string }> = [
    { label: 'Teton subscription', value: `${money(k.platformRate)}/bed/mo`, list: platformList != null && platformList > k.platformRate ? money(platformList) : undefined },
    ...(k.ecall !== 'none' && draft.communities.some((dc) => dc.ecall)
      ? [{ label: `E-Call (${k.ecall === 'ble' ? 'Bluetooth' : 'Inovonics'})`, value: `${money(k.ecallRate)}/bed/mo`, list: ecallList != null && ecallList > k.ecallRate ? money(ecallList) : undefined }]
      : []),
    { label: 'Installation', value: `${money(k.installRate)}/bed one-time`, list: installList != null && installList > k.installRate ? money(installList) : undefined },
    ...(anyFull ? [{ label: 'Full-facility coverage', value: `${k.fullFacilityMultiplier}× subscription and install` }] : []),
  ];

  const outcomes: Array<[string, string]> = [
    [count(sel.residentsRealigned), 'residents realigned to the right level of care'],
    [count(sel.costlyFallsPrevented), 'costly falls prevented'],
    [usd(sel.annualNetNoiImpact, { compact: true }), 'annual net operating income impact'],
    [usd(sel.valuationImpact, { compact: true }), `valuation impact at a ${pct(inputs.valuation.capRate, 1)} cap rate`],
  ];

  const cards: Array<[string, string, string]> = [
    ['Total Investment — 12 Mo', usd(kp.totalInvestment12), 'Everything paid to Teton in the first 12 months: installation plus monthly subscription.'],
    ['Net Benefit — 12 Mo', usd(kp.netBenefit12), 'How much better off your communities are in year one after paying for everything.'],
    ['Gross Return per $1 Invested', multiple(kp.grossReturnPerDollar12), `For every $1 spent on Teton in year one, the benefit that comes back.`],
    ['Discounted Payback', kp.discountedPaybackMonth ? `Month ${kp.discountedPaybackMonth}` : `Beyond month ${kp.horizonMonths}`, `When the program has paid for itself and stays paid for, using your ${pct(inputs.cfo.annualDiscountRate, 1)} cost of money.`],
    ['Run-Rate Annual Net Benefit', usd(kp.runRateAnnualNetBenefit), 'The yearly value once every community is live and fully ramped, after subscription fees.'],
    ['Net Benefit per Unit per Month', usd(kp.netBenefitPerOccupiedUnitMonth), `Per occupied apartment at run rate (${usd(kp.netBenefitPerUnitMonth)} per unit across all ${count(inputs.cfo.portfolioUnits)} units).`],
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

      <section className="mb-8">
        <H2>Scope &amp; investment</H2>

        {showOpex && (
          <div className={`grid gap-3 mb-4 avoid-break ${anyPilot ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <div className="rounded-lg bg-teton-almost-white p-3">
              <p className="text-[11px] text-teton-dark-gray">One-time{credit > 0 && anyPilot ? ', after credits' : ''}</p>
              <p className="text-lg font-semibold tabular-nums">{usd(oneTime)}</p>
            </div>
            {anyPilot && (
              <div className="rounded-lg bg-teton-almost-white p-3">
                <p className="text-[11px] text-teton-dark-gray">Monthly during the pilot</p>
                <p className="text-lg font-semibold tabular-nums">{usd(pilotMonthly)}</p>
              </div>
            )}
            <div className="rounded-lg bg-teton-almost-white p-3">
              <p className="text-[11px] text-teton-dark-gray">Monthly, all sites in service</p>
              <p className="text-lg font-semibold tabular-nums">{usd(serviceMonthly)}</p>
            </div>
            <div className="rounded-lg bg-teton-almost-white p-3">
              <p className="text-[11px] text-teton-dark-gray">Total over {anyPilot ? 'pilot + ' : ''}{term}-month term</p>
              <p className="text-lg font-semibold tabular-nums">{usd(termTotal)}</p>
            </div>
          </div>
        )}

        <p className="text-[12px] text-teton-dark-gray mb-2">
          {rateSummary.map((r, i) => (
            <span key={r.label}>
              {i > 0 && ' · '}
              {r.label} <span className="font-medium text-teton-ink">{r.value}</span>
              {r.list && <span className="text-teton-ui-gray"> (list {r.list})</span>}
            </span>
          ))}
        </p>

        <table className="w-full">
          <thead className="text-[11px] text-teton-dark-gray text-left">
            <tr className="border-b border-teton-pale-gray">
              <th className="font-medium py-1.5">Community</th>
              <th className="font-medium py-1.5 px-2 text-right">Beds</th>
              <th className="font-medium py-1.5 px-2">Go-live</th>
              {showOpex && <th className="font-medium py-1.5 px-2 text-right">Monthly</th>}
              {showOpex && <th className="font-medium py-1.5 pl-2 text-right">One-time</th>}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {perCommunity.map((row) => (
              <tr key={row.key} className="border-b border-teton-off-white avoid-break align-top">
                <td className="py-1.5 pr-2">
                  <span className="flex items-start gap-1.5">
                    {row.pilot ? <PilotIcon /> : <span className="w-4 flex-shrink-0" aria-hidden="true" />}
                    <span>
                      {row.name}
                      {row.pilot && <span className="sr-only"> (pilot site)</span>}
                      <span className="block text-[11px] text-teton-dark-gray">{row.detail}</span>
                    </span>
                  </span>
                </td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">
                  {count(row.units)}
                  {row.mix && <span className="block text-[11px] text-teton-dark-gray">{row.mix}</span>}
                </td>
                <td className="py-1.5 px-2 whitespace-nowrap">
                  {row.goLive}
                  {row.pilotUntil && <span className="block text-[11px] text-teton-dark-gray">pilot to {row.pilotUntil}</span>}
                </td>
                {showOpex && (
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    {usd(row.monthly)}
                    {row.pilotMonthly != null && <span className="block text-[11px] text-teton-dark-gray">{usd(row.pilotMonthly)} during pilot</span>}
                    {row.introMonthly != null && <span className="block text-[11px] text-teton-dark-gray">{usd(row.introMonthly)} first {row.introMonths} mo</span>}
                  </td>
                )}
                {showOpex && (
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                    {usd(row.oneTime)}
                    {row.credit > 0 && <span className="block text-[11px] text-teton-dark-gray">after {usd(row.credit)} credit</span>}
                  </td>
                )}
              </tr>
            ))}
            <tr className="font-semibold border-t-2 border-teton-ink avoid-break">
              <td className="py-2">
                {perCommunity.length} {perCommunity.length === 1 ? 'community' : 'communities'}
              </td>
              <td className="py-2 px-2 text-right">{count(units)}</td>
              <td className="py-2 px-2" />
              {showOpex && <td className="py-2 px-2 text-right">{usd(serviceMonthly)}</td>}
              {showOpex && <td className="py-2 pl-2 text-right">{usd(oneTime)}</td>}
            </tr>
          </tbody>
        </table>
        {anyPilot && (
          <p className="text-[11px] text-teton-dark-gray mt-2 flex items-center gap-1.5">
            <PilotIcon /> Pilot site — starts with a {inputs.schedule.pilotLengthMonths}-month pilot, then converts to the {term}-month service term.
          </p>
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
        <div className="grid grid-cols-[1.15fr_1fr] gap-6 avoid-break">
          <div>
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
          </div>
          <div>
            <p className="text-[12px] text-teton-dark-gray mb-2">What that means each year</p>
            <div className="grid grid-cols-2 gap-2">
              {outcomes.map(([value, label]) => (
                <div key={label} className="rounded-lg bg-teton-almost-white p-3">
                  <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
                  <p className="text-[11px] text-teton-dark-gray mt-1 leading-snug">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 avoid-break">
          <p className="text-[12px] text-teton-dark-gray mb-2">
            Net benefit by quarter after Teton fees and installation, discounted at your {pct(inputs.cfo.annualDiscountRate, 1)} cost of money. Each bar starts where the last one ended
            {kp.discountedPaybackMonth ? `; the program pays for itself in month ${kp.discountedPaybackMonth} and stays paid for.` : '.'}
          </p>
          <QuarterlyWaterfall discountedNet={cf.discountedNet} startDate={start} paybackMonth={kp.discountedPaybackMonth} />
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
