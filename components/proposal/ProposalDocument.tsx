/**
 * The client-facing proposal, rendered from a saved version only: its stored
 * inputs, stored outputs and stored price lines. Nothing is recalculated here,
 * so the document always matches what the version recorded.
 *
 * Prose is wrapped in <T> so a rep can reword it on screen (see EditableText);
 * figures are never editable.
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
import { T } from './EditableText';
import { renderText } from '@/lib/proposal/text';
import { ProposalSections, V } from './ProposalSections';
import { ImplementationGantt, longDate } from '@/components/implementation/ImplementationGantt';
import { pilotPlan } from '@/lib/quote/pilotGoLives';
import { weekLabel } from '@/lib/quote/implementationPlan';
import { AddStageCard, RemoveStageButton, StageName } from './StageControls';
import { TermsList } from './TermControls';

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
  // The pilot phase ends when the last pilot site converts to the service term.
  const pilotEndMonth = anyPilot ? Math.max(...cf.communities.filter((c) => c.inPilot).map((c) => c.firstPostPilotMonth - 1)) : null;
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
  const rateSummary: Array<{ key: string; label: string; value: string; list?: string }> = [
    { key: 'rate.subscription', label: 'Teton subscription', value: `${money(k.platformRate)}/bed/mo`, list: platformList != null && platformList > k.platformRate ? money(platformList) : undefined },
    ...(k.ecall !== 'none' && draft.communities.some((dc) => dc.ecall)
      ? [{ key: 'rate.ecall', label: `E-Call (${k.ecall === 'ble' ? 'Bluetooth' : 'Inovonics'})`, value: `${money(k.ecallRate)}/bed/mo`, list: ecallList != null && ecallList > k.ecallRate ? money(ecallList) : undefined }]
      : []),
    { key: 'rate.install', label: 'Installation', value: `${money(k.installRate)}/bed one-time`, list: installList != null && installList > k.installRate ? money(installList) : undefined },
    ...(anyFull ? [{ key: 'rate.fullFacility', label: 'Full-facility coverage', value: `${k.fullFacilityMultiplier}× subscription and install` }] : []),
  ];

  // Values that can appear inside editable sentences. They render from the stored version and can't be retyped.
  const capRate = pct(inputs.valuation.capRate, 1);
  const costOfMoney = pct(inputs.cfo.annualDiscountRate, 1);
  const caseName = CASE_LABEL[rc];
  const pilotLength = `${inputs.schedule.pilotLengthMonths}-month`;
  const termLength = `${term}-month`;

  const outcomes: Array<{ key: string; value: string; label: string; v?: Record<string, string> }> = [
    { key: 'roi.outcome.realigned', value: count(sel.residentsRealigned), label: 'residents realigned to the right level of care' },
    { key: 'roi.outcome.falls', value: count(sel.costlyFallsPrevented), label: 'costly falls prevented' },
    { key: 'roi.outcome.noi', value: usd(sel.annualNetNoiImpact, { compact: true }), label: 'annual net operating income impact' },
    { key: 'roi.outcome.valuation', value: usd(sel.valuationImpact, { compact: true }), label: 'Asset Value Added at a {capRate} cap rate (one-time)', v: { capRate } },
  ];

  const cards: Array<{ key: string; label: string; value: string; note: string; v?: Record<string, string> }> = [
    { key: 'card.investment', label: 'Total Investment — Year 1', value: usd(kp.totalInvestment12), note: 'Everything paid to Teton in the first 12 months: installation plus monthly subscription.' },
    { key: 'card.net', label: 'Net Benefit — Year 1', value: usd(kp.netBenefit12), note: 'How much better off your communities are in year one after paying for everything.' },
    {
      key: 'card.gross',
      label: 'Gross Return per $1 Invested (Year 1)',
      value: multiple(kp.grossReturnPerDollar12),
      note: 'Stabilized return per $1 invested: {stabilized}, once every community is live and fully ramped.',
      v: { stabilized: multiple(sel.returnOnCost, 1) },
    },
    {
      key: 'card.payback',
      label: 'Discounted Payback',
      value: kp.discountedPaybackMonth ? `Month ${kp.discountedPaybackMonth}` : `Beyond month ${kp.horizonMonths}`,
      note: 'When the program has paid for itself and stays paid for, using your {costOfMoney} cost of money.',
      v: { costOfMoney },
    },
    { key: 'card.runRate', label: 'Run-Rate Annual Net Benefit', value: usd(kp.runRateAnnualNetBenefit), note: 'The yearly value once every community is live and fully ramped, after subscription fees.' },
    {
      key: 'card.perUnit',
      label: 'Net Benefit per Unit per Month',
      value: usd(kp.netBenefitPerOccupiedUnitMonth),
      note: 'Per occupied apartment at run rate ({perUnit} per unit across all {units}).',
      v: { perUnit: usd(kp.netBenefitPerUnitMonth), units: `${count(inputs.cfo.portfolioUnits)} units` },
    },
  ];

  const benefits: Array<[string, string, string]> = [
    ['roi.benefit.care', 'Recaptured care revenue', usd(sel.recapturedCareRevenue)],
    ['roi.benefit.falls', 'Fall cost avoidance', usd(sel.fallCostAvoidance)],
    ['roi.benefit.los', 'Revenue from longer length of stay', usd(sel.revenueFromLosIncrease)],
    ['roi.benefit.staffing', 'Night shift savings', usd(sel.nightShiftSavings)],
    ['roi.benefit.moveIn', 'Move-in impact', usd(sel.moveInImpact)],
    ['roi.benefit.tech', 'Tech replacement', usd(sel.techReplacement)],
  ];

  const c = inputs.client;
  const assumptions: Array<[string, string, string]> = [
    ['assume.occupancy', 'Occupancy', pct(c.occupancy)],
    ['assume.rent', 'Average rent / resident / month', usd(c.avgRent)],
    ['assume.care', 'Care revenue / resident / month', usd(c.careRevenuePerResident)],
    ['assume.locUplift', 'Care revenue uplift per level-of-care step', `${usd(c.locGapUpliftPerTierStep)} / month`],
    ['assume.falls', 'Falls per resident per year', String(c.fallsPerResidentYear)],
    ['assume.hospitalization', 'Falls leading to hospitalization', pct(c.pctFallsHospitalization)],
    ['assume.hospitalCost', 'Cost per hospitalization', usd(c.costPerHospitalization)],
    ['assume.discharge', 'Falls leading to discharge', pct(c.pctFallsDischarge)],
    ['assume.los', 'Length-of-stay protected per avoided discharge', `${c.losIncreaseMonths} months`],
    ['assume.moveIns', 'Move-ins per month (share of occupied)', pct(c.moveInRatePerMonth)],
    ['assume.nightRatio', 'Night staffing ratio (residents per staff)', String(c.nightResidentToStaffRatio)],
    ['assume.wage', 'Night staff hourly wage', usd(c.nightHourlyWage, { cents: true })],
    ['assume.discountRate', 'Your discount rate', pct(inputs.cfo.annualDiscountRate)],
    ['assume.benefitStart', 'Benefits start after go-live', `${inputs.schedule.roiStartDelayMonths} months, ramping over ${inputs.schedule.rampMonths}`],
  ];

  const ecallFreeInPilot = draft.commercial.ecall !== 'none' && draft.commercial.ecallPilotRate === 0;
  const nCommunities = inputs.communities.length;

  // Implementation plan for pilot sites (only shown when the deal has pilot communities).
  const pilots = pilotPlan(draft, start, cf.communities.map((c) => c.goLiveMonth));
  const pilotDates = pilots.map((g) => `${longDate(g.goLive)} (${g.names.join(', ')})`);
  const pilotDatesText = pilotDates.length <= 1 ? pilotDates.join('') : `${pilotDates.slice(0, -1).join(', ')} and ${pilotDates[pilotDates.length - 1]}`;
  const pilotCount = pilots.reduce((n, g) => n + g.names.length, 0);
  const implementationBody = pilots.length ? (
    <>
      <p className="mb-3 text-[14px] max-w-prose">
        <T
          k="impl.intro"
          d={
            pilotCount === 1
              ? 'Your pilot community goes live on {dates}. Working back from that date, here is the path to go-live.'
              : 'Your pilot communities go live on {dates}. Working back from those dates, here is the path to go-live.'
          }
          v={{ dates: pilotDatesText }}
        />
      </p>
      <ImplementationGantt groups={pilots} labelWidth={170} />
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        {pilots[0].schedule.stages
          .filter((st) => st.weeks > 0)
          .map((st) => (
            <div key={st.id} className="relative group/stage rounded-lg border border-teton-pale-gray p-2.5 avoid-break">
              <RemoveStageButton plan={draft.implementationPlan} id={st.id} name={st.name} />
              <p className="text-[10.5px] text-teton-ui-gray">
                <V k={`impl.${st.id}.weeks`} label={`${st.name} timing`}>
                  {st.weeks} {st.weeks === 1 ? 'week' : 'weeks'} · {weekLabel(st, true).toLowerCase()}
                </V>
              </p>
              <p className="text-[12px] font-semibold">
                <StageName plan={draft.implementationPlan} id={st.id} name={st.name} />
              </p>
              {st.description && (
                <p className="text-[11px] text-teton-dark-gray mt-1 leading-snug">
                  <T k={`impl.${st.id}.note`} d={st.description} />
                </p>
              )}
            </div>
          ))}
        <AddStageCard plan={draft.implementationPlan} />
      </div>
      <p className="text-[11px] text-teton-dark-gray mt-2">
        <T k="impl.footnote" d="Dates assume the order form is signed by the end of Evaluation & Contracting. Non-pilot communities follow the same path ahead of their go-live dates." />
      </p>
    </>
  ) : null;

  // Terms / Notes: the deal's terms (standard ones written from the deal, plus the rep's edits and notes).
  const termsBody = <TermsList draft={draft} />;

  const summaryBody = (
    <>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.key} className="rounded-lg border border-teton-pale-gray p-3">
            <p className="text-[11px] font-medium text-teton-dark-gray">
              <T k={`${card.key}.label`} d={card.label} />
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              <V k={`${card.key}.value`} label={`${card.label} figure`}>{card.value}</V>
            </p>
            <p className="text-[11px] text-teton-dark-gray mt-1 leading-snug">
              <T k={`${card.key}.note`} d={card.note} v={card.v} />
            </p>
          </div>
        ))}
      </div>
    </>
  );

  const scopeBody = (
    <>


      {showOpex && (
        <div className={`grid gap-3 mb-4 avoid-break ${anyPilot ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div className="rounded-lg bg-teton-almost-white p-3">
            <p className="text-[11px] text-teton-dark-gray">
              <T k="scope.oneTime" d={`One-time${credit > 0 && anyPilot ? ', after credits' : ''}`} />
            </p>
            <p className="text-lg font-semibold tabular-nums"><V k="scope.oneTime.value" label="One-time amount">{usd(oneTime)}</V></p>
          </div>
          {anyPilot && (
            <div className="rounded-lg bg-teton-almost-white p-3">
              <p className="text-[11px] text-teton-dark-gray">
                <T k="scope.pilotMonthly" d="Monthly (Pilot)" />
              </p>
              <p className="text-lg font-semibold tabular-nums"><V k="scope.pilotMonthly.value" label="Monthly during the pilot amount">{usd(pilotMonthly)}</V></p>
            </div>
          )}
          <div className="rounded-lg bg-teton-almost-white p-3">
            <p className="text-[11px] text-teton-dark-gray">
              <T k="scope.serviceMonthly" d="Monthly (post-pilot)" />
            </p>
            <p className="text-lg font-semibold tabular-nums"><V k="scope.serviceMonthly.value" label="Monthly in service amount">{usd(serviceMonthly)}</V></p>
          </div>
          <div className="rounded-lg bg-teton-almost-white p-3">
            <p className="text-[11px] text-teton-dark-gray">
              <T k="scope.total" d="Total Cost Over Term" />
            </p>
            <p className="text-lg font-semibold tabular-nums"><V k="scope.total.value" label="Term total amount">{usd(termTotal)}</V></p>
          </div>
        </div>
      )}

      <p className="text-[12px] text-teton-dark-gray mb-2">
        {rateSummary.map((r, i) => (
          <span key={r.key}>
            {i > 0 && ' · '}
            <T k={r.key} d={r.label} />{' '}
            <V k={`${r.key}.value`} label={`${r.label} rate`}>
              <span className="font-medium text-teton-ink">{r.value}</span>
              {r.list && <span className="text-teton-ui-gray"> (list {r.list})</span>}
            </V>
          </span>
        ))}
      </p>

      <table className="w-full">
        <thead className="text-[11px] text-teton-dark-gray text-left">
          <tr className="border-b border-teton-pale-gray">
            <th className="font-medium py-1.5"><T k="table.community" d="Community" /></th>
            <th className="font-medium py-1.5 px-2 text-right"><T k="table.beds" d="Beds" /></th>
            <th className="font-medium py-1.5 px-2"><T k="table.goLive" d="Go-live" /></th>
            {showOpex && <th className="font-medium py-1.5 px-2 text-right"><T k="table.monthly" d="Monthly" /></th>}
            {showOpex && <th className="font-medium py-1.5 pl-2 text-right"><T k="table.oneTime" d="One-time" /></th>}
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
          <PilotIcon />
          <span>
            <T k="scope.pilotNote" d="Pilot site — starts with a {pilotLength} pilot, then converts to the {term} service term." v={{ pilotLength, term: termLength }} />
          </span>
        </p>
      )}

      {showCapex && capex && (
        <div className="rounded-lg border border-teton-pale-gray p-4 mt-4 avoid-break">
          <p className="font-semibold">
            <T k="capex.title" d={showOpex ? 'Alternative: pay upfront (capital purchase)' : 'Upfront investment (capital purchase)'} />
          </p>
          <p className="text-[12px] text-teton-dark-gray mt-1">
            <T
              k="capex.note"
              d="The {term} service term paid in one payment, priced at its present value ({rate} a year), plus installation."
              v={{ term: `${capex.termMonths}-month`, rate: pct(capex.annualDiscountRate, 1) }}
            />
          </p>
          <table className="w-full mt-3 tabular-nums">
            <tbody>
              <tr className="border-b border-teton-off-white">
                <td className="py-1"><T k="capex.install" d={`Installation${credit > 0 && anyPilot ? ' (after pilot credits)' : ''}`} /></td>
                <td className="py-1 text-right"><V k="capex.install.value" label="Upfront installation amount">{usd(capex.install)}</V></td>
              </tr>
              <tr className="border-b border-teton-off-white">
                <td className="py-1"><T k="capex.service" d="Service term, paid upfront" /></td>
                <td className="py-1 text-right"><V k="capex.service.value" label="Service term upfront amount">{usd(capex.upfrontSubscription)}</V></td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1.5"><T k="capex.price" d="Upfront price" /></td>
                <td className="py-1.5 text-right"><V k="capex.price.value" label="Upfront price">{usd(capex.capexTotal)}</V></td>
              </tr>
              {capex.pilotFees > 0 && (
                <tr className="text-teton-dark-gray">
                  <td className="py-1"><T k="capex.pilotFees" d="Plus pilot fees, billed monthly during the pilot" /></td>
                  <td className="py-1 text-right"><V k="capex.pilotFees.value" label="Pilot fees amount">{usd(capex.pilotFees)}</V></td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[12px] text-teton-dark-gray mt-2">
            <T k="capex.saves" d="Saves {saving} compared with paying the subscription monthly." v={{ saving: usd(capex.upfrontDiscount) }} />
          </p>
        </div>
      )}

    </>
  );

  const roiBody = (
    <>

      <div className="grid grid-cols-[1.15fr_1fr] gap-6 avoid-break">
        <div>
          <p className="text-[12px] text-teton-dark-gray mb-2">
            <T k="roi.benefitsNote" d="Annual benefit once every community is live ({case} case)" v={{ case: caseName }} />
          </p>
          <table className="w-full tabular-nums">
            <tbody>
              {benefits.map(([key, l, v]) => (
                <tr key={key} className="border-b border-teton-off-white">
                  <td className="py-1"><T k={key} d={l} /></td>
                  <td className="py-1 text-right"><V k={`${key}.value`} label={`${l} amount`}>{v}</V></td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2 border-teton-ink">
                <td className="py-1.5"><T k="roi.total" d="Total annual benefit" /></td>
                <td className="py-1.5 text-right"><V k="roi.total.value" label="Total annual benefit amount">{usd(sel.annualRoi)}</V></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[12px] text-teton-dark-gray mb-2">
            <T k="roi.meansNote" d="What that means each year" />
          </p>
          <div className="grid grid-cols-2 gap-2">
            {outcomes.map((o) => (
              <div key={o.key} className="rounded-lg bg-teton-almost-white p-3">
                <p className="text-lg font-semibold tabular-nums leading-tight"><V k={`${o.key}.value`} label={`${renderText(o.label, o.v)} figure`}>{o.value}</V></p>
                <p className="text-[11px] text-teton-dark-gray mt-1 leading-snug">
                  <T k={o.key} d={o.label} v={o.v} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 avoid-break">
        <p className="text-[12px] text-teton-dark-gray mb-2">
          <T
            k="roi.waterfallNote"
            d={`Net benefit by quarter after Teton fees and installation, discounted at your {costOfMoney} cost of money. Each bar starts where the last one ended${kp.discountedPaybackMonth ? '; the program pays for itself in {payback} and stays paid for.' : '.'}`}
            v={{ costOfMoney, payback: `month ${kp.discountedPaybackMonth ?? ''}` }}
          />
        </p>
        <QuarterlyWaterfall discountedNet={cf.discountedNet} startDate={start} paybackMonth={kp.discountedPaybackMonth} pilotEndMonth={pilotEndMonth} />
      </div>
    </>
  );

  const assumptionsBody = (
    <>

      <div className="grid grid-cols-2 gap-x-8">
        {assumptions.map(([key, l, v]) => (
          <div key={key} className="flex justify-between gap-3 border-b border-teton-off-white py-1">
            <span><T k={key} d={l} /></span>
            <span className="tabular-nums font-medium whitespace-nowrap"><V k={`${key}.value`} label={`${l} value`}>{v}</V></span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-teton-dark-gray mt-4">
        <T
          k="assume.disclaimer"
          d="Benefits are modeled estimates based on the assumptions above and the {case} case, not guaranteed results. Prices are in US dollars and exclude applicable taxes. Final pricing is set by the order form."
          v={{ case: caseName }}
        />
      </p>
    </>
  );

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
        <p className="text-xs uppercase tracking-widest text-teton-dark-gray">
          <T k="eyebrow" d="Proposal for" />
        </p>
        <h1 className="text-3xl font-semibold mt-1">
          <T k="customer" d={draft.customerName} />
        </h1>
        <p className="mt-3 text-[14px] max-w-prose">
          <T
            k="intro"
            d={
              anyPilot
                ? 'Teton ambient monitoring for {communities} and {beds}, starting with a {pilotLength} pilot, going live from {goLive}. Figures below use the {case} case.'
                : 'Teton ambient monitoring for {communities} and {beds}, going live from {goLive}. Figures below use the {case} case.'
            }
            v={{ communities: `${nCommunities} ${nCommunities === 1 ? 'community' : 'communities'}`, beds: `${count(units)} beds`, pilotLength, goLive: monthName(start, 1), case: caseName }}
          />
        </p>
      </section>

      <ProposalSections
        sections={{
          summary: { body: summaryBody, className: 'avoid-break' },
          scope: { body: scopeBody },
          terms: { body: termsBody, className: 'avoid-break' },
          ...(implementationBody ? { implementation: { body: implementationBody } } : {}),
          roi: { body: roiBody, className: 'avoid-break' },
          assumptions: { body: assumptionsBody, className: 'avoid-break' },
        }}
      />




    </article>
  );
}
