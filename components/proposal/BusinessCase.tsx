'use client';

/**
 * The business-case format: an alternative to the standard proposal with a
 * cover page and one full page per topic (the investment, the return, year 1,
 * cash flow, implementation, the customer's team, terms and assumptions), in
 * the style of a capital-request business case.
 *
 * Same figures as the standard proposal (buildProposalData); wording is
 * editable (<T>, keys prefixed "bc."), figures can be clicked to change their
 * inputs or removed (<V>, the same keys as the standard format). Pages follow
 * the sections the rep keeps: a removed section drops its page.
 */
import type { PriceLine } from '@/lib/pricing/lines';
import type { StoredOutputs } from '@/lib/data/quotes';
import type { QuoteDraft } from '@/lib/quote/draft';
import { count, dateLabel, multiple, usd } from '@/lib/format';
import { weekLabel } from '@/lib/quote/implementationPlan';
import { allocationTable } from '@/lib/quote/resources';
import { stageColor, longDate } from '@/components/implementation/ImplementationGantt';
import { T, useProposalText } from './EditableText';
import { V } from './ProposalSections';
import { QuarterlyWaterfall } from './QuarterlyWaterfall';
import { TermsList } from './TermControls';
import { buildProposalData } from './proposalData';

const Logo = () => (
  <span className="bc-logo">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M5 9.5h14v2.2c0 3.9-3.1 7.1-7 7.1s-7-3.2-7-7.1V9.5z" />
    </svg>
    Teton
  </span>
);

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

function Page({ crumb, no, children }: { crumb: React.ReactNode; no: number; children: React.ReactNode }) {
  return (
    <section className="bc-page">
      <div className="bc-pad">
        <div className="bc-top">
          <Logo />
          <span className="bc-crumb">{crumb}</span>
        </div>
        {children}
      </div>
      <div className="bc-foot">
        <span>TETON.AI</span>
        <span>{String(no).padStart(2, '0')}</span>
      </div>
    </section>
  );
}

function Stat({ value, children }: { value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bc-dark">
      <b>{value}</b>
      <span>{children}</span>
    </div>
  );
}

export function BusinessCaseDocument({ draft, outputs, lines, versionNo, savedAt }: { draft: QuoteDraft; outputs: StoredOutputs; lines: PriceLine[]; versionNo: number; savedAt: string | null }) {
  const { layout } = useProposalText();
  const d = buildProposalData(draft, outputs, lines);
  const { kp, cf, sel, capex, inputs, units, anyPilot, pilots, hasResources, costOfMoney, capRate, caseName, term } = d;
  const shown = (id: string) => !layout.hiddenSections.includes(id);
  const customer = draft.customerName || 'Customer';
  const site = inputs.communities.length === 1 ? inputs.communities[0].name || customer : customer;
  const sites = inputs.communities.length === 1 ? site : `${inputs.communities.length} communities`;
  const capexShown = draft.presentation !== 'opex';
  const vars = { customer, site, sites, beds: `${count(units)} beds`, case: caseName, costOfMoney, capRate };

  // Equipment purchase split: the AI platform (base package, sensors, software) and E-Call (its price premium and renewals).
  const basePrice = capex.pricing.basePrice;
  const ecallEquipment = sum(capex.communities.map((c) => (c.ecall === 'none' ? 0 : (c.basePerBed - basePrice) * c.beds)));
  const platformEquipment = capex.equipment - ecallEquipment;
  const platform = platformEquipment + capex.software;
  const ecall = ecallEquipment + capex.renewals;

  const net = cf.discountedNet;
  const horizon = net.length;
  const pilotLen = anyPilot ? inputs.schedule.pilotLengthMonths : 0;
  const windows = [
    { key: 'pilot', from: 1, to: pilotLen, label: `Months 1–${pilotLen}`, note: 'The pilot, before benefits begin' },
    { key: 'y1', from: pilotLen + 1, to: Math.min(12, horizon), label: `Months ${pilotLen + 1}–12`, note: 'Benefits ramp up after the pilot' },
    { key: 'rest', from: 13, to: horizon, label: `Months 13–${horizon}`, note: 'At run rate, discounted' },
  ].filter((w) => w.to >= w.from);
  const total36 = sum(net);

  const benefitRows: Array<{ key: string; label: string; value: number; means: string; sub: string; v?: Record<string, string> }> = [
    { key: 'roi.benefit.care', label: 'Recaptured care revenue', value: sel.recapturedCareRevenue, means: '{n} residents realigned to the right level of care', sub: 'Care needs seen sooner, billed at the right tier', v: { n: count(sel.residentsRealigned) } },
    { key: 'roi.benefit.moveIn', label: 'Move-in impact', value: sel.moveInImpact, means: 'Faster fill of open apartments', sub: 'Monitoring as a reason families choose the community' },
    { key: 'roi.benefit.staffing', label: 'Night shift savings', value: sel.nightShiftSavings, means: 'Fewer routine night checks', sub: 'Staff go where they are needed' },
    { key: 'roi.benefit.los', label: 'Longer length of stay', value: sel.revenueFromLosIncrease, means: 'Fewer move-outs after a fall', sub: 'Revenue kept from residents who stay longer' },
    { key: 'roi.benefit.tech', label: 'Tech replacement', value: sel.techReplacement, means: 'Systems Teton replaces', sub: 'Spend that no longer recurs' },
    { key: 'roi.benefit.falls', label: 'Fall cost avoidance', value: sel.fallCostAvoidance, means: '{n} costly falls prevented', sub: 'Hospital transfers and their costs avoided', v: { n: count(sel.costlyFallsPrevented) } },
  ]
    .filter((b) => b.value !== 0)
    .sort((a, b) => b.value - a.value);

  const team = allocationTable(draft.resources ?? [], draft.implementationPlan);
  const stages = pilots[0]?.schedule.stages.filter((s) => s.weeks > 0) ?? [];
  const goLive = pilots[0] ? longDate(pilots[0].goLive) : null;
  const contractEnd = stages.find((s) => s.id === 'evaluation');

  const pages: Array<(no: number) => React.ReactNode> = [];

  // ---------- The investment ----------
  if (shown('scope')) {
    pages.push((no) => (
      <Page key="scope" no={no} crumb={<T k="bc.crumb" d="{customer} · Proposal" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.scope.eyebrow" d="The investment" /></p>
        {capexShown ? (
          <>
            <h1 className="bc-h1">
              <T k="bc.scope.title.capex" d="{equipment} of equipment, returned through {site}’s operating income." v={{ ...vars, equipment: usd(capex.equipment) }} />
            </h1>
            <p className="bc-lede">
              <T k="bc.scope.lede.capex" d="{customer} buys the hardware outright: title passes at install and the embedded license is perpetual, so nearly all of the cost is a capital purchase. This document sets out the investment, what it returns, and how quickly it pays for itself." v={vars} />
            </p>
            <div className="bc-card bc-req">
              {ecall === 0 && (
                <>
                  <div className="bc-req-row">
                    <div className="bc-req-name"><T k="bc.scope.equipment" d="Equipment" /></div>
                    <div className="bc-req-desc">
                      <T k="bc.scope.equipmentNote" d="Edge units and sensors installed in all {beds}{sensors}. Paid once at install; title passes to {customer}." v={{ ...vars, sensors: capex.sensors ? `, plus ${count(capex.sensors)} additional sensors` : '' }} />
                    </div>
                    <div className="bc-req-amt"><V k="capex.price.value" label="One-time equipment cost">{usd(capex.equipment)}</V></div>
                    <div className="bc-req-pct">{pctOf(capex.equipment, capex.ownershipTotal)}</div>
                  </div>
                  <div className="bc-req-row">
                    <div className="bc-req-name"><T k="bc.scope.software" d="Software and services" /></div>
                    <div className="bc-req-desc">
                      <T k="bc.scope.softwareNote" d="{monthly} a month, four years, billed monthly." v={{ monthly: usd(capex.softwareMonthly) }} />
                    </div>
                    <div className="bc-req-amt"><V k="capex.software4.value" label="Software and services over four years">{usd(capex.software)}</V></div>
                    <div className="bc-req-pct">{pctOf(capex.software, capex.ownershipTotal)}</div>
                  </div>
                </>
              )}
              {ecall > 0 && (
              <div className="bc-req-row">
                <div className="bc-req-name"><T k="bc.scope.platform" d="AI Platform" /></div>
                <div className="bc-req-desc">
                  <T k="bc.scope.platformNote" d="Edge units and sensors in all {beds}{sensors}. Equipment {equipment}, plus software and services for four years, {software}." v={{ ...vars, sensors: capex.sensors ? `, plus ${count(capex.sensors)} additional sensors` : '', equipment: usd(platformEquipment), software: usd(capex.software) }} />
                </div>
                <div className="bc-req-amt"><V k="capex.platform.value" label="AI Platform amount">{usd(platform)}</V></div>
                <div className="bc-req-pct">{pctOf(platform, capex.ownershipTotal)}</div>
              </div>
              )}
              {ecall > 0 && (
                <div className="bc-req-row">
                  <div className="bc-req-name"><T k="bc.scope.ecall" d="E-Call" /></div>
                  <div className="bc-req-desc">
                    <T k="bc.scope.ecallNote" d="E-Call pendants and wall-mount devices for every bed with E-Call. Equipment {equipment}{renewals}." v={{ equipment: usd(ecallEquipment), renewals: capex.renewals ? `, plus renewals within four years, ${usd(capex.renewals)}` : '' }} />
                  </div>
                  <div className="bc-req-amt"><V k="capex.ecall.value" label="E-Call amount">{usd(ecall)}</V></div>
                  <div className="bc-req-pct">{pctOf(ecall, capex.ownershipTotal)}</div>
                </div>
              )}
              <div className="bc-req-row bc-req-total">
                <div className="bc-req-name"><T k="bc.scope.total" d="Complete solution" /></div>
                <div className="bc-req-desc">
                  <T k="bc.scope.totalNote" d="One-time equipment cost {equipment}, paid at install. Software and services {monthly} a month. No separate installation charge and no license fee." v={{ equipment: usd(capex.equipment), monthly: usd(capex.softwareMonthly) }} />
                </div>
                <div className="bc-req-amt"><V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal)}</V></div>
                <div className="bc-req-pct">100%</div>
              </div>
            </div>
            {ecall > 0 && capex.ownershipTotal > 0 && (
              <div className="bc-split">
                <div style={{ flex: platform, background: 'var(--bc-lav)' }}>AI Platform · {pctOf(platform, capex.ownershipTotal)} of four-year cost</div>
                <div style={{ flex: Math.max(ecall, capex.ownershipTotal * 0.1), background: 'var(--bc-sage)' }}>E-Call · {pctOf(ecall, capex.ownershipTotal)}</div>
              </div>
            )}
            {draft.presentation === 'both' && (
              <p className="bc-note">
                <T k="bc.scope.orSubscription" d="Or by subscription: {oneTime} one-time installation, then {monthly} a month, {total} over the {term}-month service term." v={{ oneTime: usd(d.oneTime), monthly: usd(d.serviceMonthly), total: usd(d.termTotal), term: String(term) }} />
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="bc-h1">
              <T k="bc.scope.title.opex" d="{total} over the {term}-month term, returned through {site}’s operating income." v={{ ...vars, total: usd(d.termTotal), term: String(term) }} />
            </h1>
            <p className="bc-lede">
              <T k="bc.scope.lede.opex" d="Teton ambient monitoring for {sites} and {beds}, by subscription. This document sets out the investment, what it returns, and how quickly it pays for itself." v={vars} />
            </p>
            <div className="bc-card bc-req">
              <div className="bc-req-row">
                <div className="bc-req-name"><T k="bc.scope.install" d="Installation" /></div>
                <div className="bc-req-desc"><T k="bc.scope.installNote" d="Professional installation in every bed, billed at each community’s go-live." /></div>
                <div className="bc-req-amt"><V k="scope.oneTime.value" label="One-time amount">{usd(d.oneTime)}</V></div>
                <div className="bc-req-pct">{pctOf(d.oneTime, d.termTotal)}</div>
              </div>
              <div className="bc-req-row">
                <div className="bc-req-name"><T k="bc.scope.subscription" d="Subscription" /></div>
                <div className="bc-req-desc">
                  <T k="bc.scope.subscriptionNote" d="{monthly} a month once in service{pilot}. Platform, support and analytics; no title transfer." v={{ monthly: usd(d.serviceMonthly), pilot: anyPilot ? `, after a ${inputs.schedule.pilotLengthMonths}-month pilot at ${usd(d.pilotMonthly)} a month` : '' }} />
                </div>
                <div className="bc-req-amt">{usd(d.termTotal - d.oneTime)}</div>
                <div className="bc-req-pct">{pctOf(d.termTotal - d.oneTime, d.termTotal)}</div>
              </div>
              <div className="bc-req-row bc-req-total">
                <div className="bc-req-name"><T k="bc.scope.totalOpex" d="Total over the term" /></div>
                <div className="bc-req-desc"><T k="bc.scope.totalOpexNote" d="Installation, pilot and {term} months of subscription." v={{ term: String(term) }} /></div>
                <div className="bc-req-amt"><V k="scope.total.value" label="Total cost over the term">{usd(d.termTotal)}</V></div>
                <div className="bc-req-pct">100%</div>
              </div>
            </div>
          </>
        )}

        {shown('roi') && (
          <>
            <p className="bc-eyebrow bc-gray"><T k="bc.scope.three" d="The case in three numbers" /></p>
            <div className="bc-three">
              <Stat value={<V k="roi.total.value" label="Total annual benefit amount">{usd(sel.annualRoi)}</V>}>
                <T k="bc.stat.benefit" d="projected annual benefit once {site} is live, {case} case" v={vars} />
              </Stat>
              <Stat value={<V k="roi.outcome.realigned.value" label="residents realigned figure">{count(sel.residentsRealigned)}</V>}>
                <T k="bc.stat.realigned" d="residents a year realigned to the right level of care" />
              </Stat>
              <Stat value={<V k="roi.outcome.valuation.value" label="Asset Value Impact figure">{usd(sel.valuationImpact, { compact: true })}</V>}>
                <T k="bc.stat.valuation" d="asset value impact: one year of added net operating income at a {capRate} cap rate" v={vars} />
              </Stat>
            </div>
          </>
        )}
      </Page>
    ));
  }

  // ---------- The return ----------
  if (shown('roi')) {
    pages.push((no) => (
      <Page key="roi" no={no} crumb={<T k="bc.roi.crumb" d="What the program returns" />}>
        <p className="bc-eyebrow"><T k="bc.roi.eyebrow" d="What the program returns" /></p>
        <h1 className="bc-h1"><T k="bc.roi.title" d="{benefit} a year, once every bed is live." v={{ benefit: usd(sel.annualRoi) }} /></h1>
        <p className="bc-lede">
          <T k="bc.roi.lede" d="The sources of value, modeled for {site}’s {beds} on the {case} case. Each is valued from {customer}’s own occupancy, rates and staffing assumptions." v={vars} />
        </p>
        <div className="bc-card bc-tbl">
          <table>
            <thead>
              <tr>
                <th>Source of value</th>
                <th>What it means each year</th>
                <th>Share of the benefit</th>
                <th className="bc-hl bc-r">Annual benefit</th>
              </tr>
            </thead>
            <tbody>
              {benefitRows.map((b) => (
                <tr key={b.key}>
                  <td className="bc-m"><T k={b.key} d={b.label} /></td>
                  <td>
                    <T k={`bc.${b.key}.means`} d={b.means} v={b.v} />
                    <small><T k={`bc.${b.key}.sub`} d={b.sub} /></small>
                  </td>
                  <td>
                    {pctOf(b.value, sel.annualRoi)}
                    <div className="bc-bar"><i style={{ width: pctOf(Math.max(0, b.value), sel.annualRoi) }} /></div>
                  </td>
                  <td className="bc-hl bc-big bc-r"><V k={`${b.key}.value`} label={`${b.label} amount`}>{usd(b.value)}</V></td>
                </tr>
              ))}
              <tr className="bc-tot">
                <td className="bc-m"><T k="roi.total" d="Total annual benefit" /></td>
                <td />
                <td>100%</td>
                <td className="bc-hl bc-big bc-r"><V k="roi.total.value" label="Total annual benefit amount">{usd(sel.annualRoi)}</V></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bc-callout">
          <b><V k="roi.outcome.valuation.value" label="Asset Value Impact figure">{usd(sel.valuationImpact, { compact: true })}</V></b>
          <div>
            <span className="bc-chip"><T k="bc.roi.chip" d="Asset value · {capRate} cap" v={vars} /></span>
            <p><T k="bc.roi.callout" d="of asset value from {noi} a year of added net operating income, capitalized once at a {capRate} cap rate: the figure an owner or REIT partner sees on the community’s valuation." v={{ ...vars, noi: usd(sel.annualNetNoiImpact, { compact: true }) }} /></p>
          </div>
        </div>
      </Page>
    ));
  }

  // ---------- Year 1 and cash flow ----------
  if (shown('summary')) {
    const basis = capexShown ? (
      <p className="bc-note"><T k="bc.y1.basis" d="Year 1 figures and the cash flow use the subscription pricing." /></p>
    ) : null;
    pages.push((no) => (
      <Page key="summary" no={no} crumb={<T k="bc.y1.crumb" d="Year 1 financial summary" />}>
        <p className="bc-eyebrow"><T k="bc.y1.eyebrow" d="Year 1 financial summary" /></p>
        <h1 className="bc-h1"><T k="bc.y1.title" d="{net} better off in the first year, after paying for everything." v={{ net: usd(kp.netBenefit12) }} /></h1>
        <p className="bc-lede"><T k="bc.y1.lede" d="The first twelve months at {site}: what goes in, what comes back, and how quickly it pays for itself, discounted at {customer}’s {costOfMoney} cost of money." v={vars} /></p>
        <div className="bc-three">
          <Stat value={<V k="card.net.value" label="Net Benefit — Year 1 figure">{usd(kp.netBenefit12)}</V>}>
            <T k="bc.y1.net" d="net benefit in year one, after everything paid to Teton" />
          </Stat>
          <Stat value={<V k="card.gross.value" label="Gross Return per $1 Invested (Year 1) figure">{multiple(kp.grossReturnPerDollar12)}</V>}>
            <T k="bc.y1.gross" d="gross return per $1 invested in year one; {stabilized} once fully ramped" v={{ stabilized: multiple(sel.returnOnCost, 1) }} />
          </Stat>
          <Stat value={<V k="card.payback.value" label="Discounted Payback figure">{kp.discountedPaybackMonth ? `Month ${kp.discountedPaybackMonth}` : `> ${kp.horizonMonths} mo`}</V>}>
            <T k="bc.y1.payback" d="discounted payback: when the program has paid for itself and stays paid for" />
          </Stat>
        </div>
        <div className="bc-card bc-tbl" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Measure</th>
                <th>What it means</th>
                <th className="bc-hl bc-r">Year 1</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="bc-m"><T k="bc.y1.investment" d="Total investment" /></td>
                <td><T k="card.investment.note" d="Everything paid to Teton in the first 12 months: installation plus monthly subscription." /></td>
                <td className="bc-hl bc-big bc-r"><V k="card.investment.value" label="Total Investment — Year 1 figure">{usd(kp.totalInvestment12)}</V></td>
              </tr>
              <tr>
                <td className="bc-m"><T k="bc.y1.netRow" d="Net benefit" /></td>
                <td><T k="card.net.note" d="How much better off your communities are in year one after paying for everything." /></td>
                <td className="bc-hl bc-big bc-r"><V k="card.net.value" label="Net Benefit — Year 1 figure">{usd(kp.netBenefit12)}</V></td>
              </tr>
              <tr>
                <td className="bc-m"><T k="bc.y1.runRate" d="Run-rate annual net benefit" /></td>
                <td><T k="card.runRate.note" d="The yearly value once every community is live and fully ramped, after subscription fees." /></td>
                <td className="bc-hl bc-big bc-r"><V k="card.runRate.value" label="Run-Rate Annual Net Benefit figure">{usd(kp.runRateAnnualNetBenefit)}</V></td>
              </tr>
              <tr>
                <td className="bc-m"><T k="bc.y1.perUnit" d="Net benefit per unit" /></td>
                <td>
                  <T k="bc.y1.perUnitNote" d="Per occupied apartment per month at run rate" />
                  <small>{usd(kp.netBenefitPerUnitMonth)} per unit across all {count(inputs.cfo.portfolioUnits)} units</small>
                </td>
                <td className="bc-hl bc-big bc-r"><V k="card.perUnit.value" label="Net Benefit per Unit per Month figure">{usd(kp.netBenefitPerOccupiedUnitMonth)}</V></td>
              </tr>
            </tbody>
          </table>
        </div>
        {kp.totalInvestment12 > 0 && (
          <div className="bc-callout">
            <b><V k="card.runRate.value" label="Run-Rate Annual Net Benefit figure">{usd(kp.runRateAnnualNetBenefit)}</V></b>
            <div>
              <span className="bc-chip"><T k="bc.y1.chip" d="Every year at run rate" /></span>
              <p><T k="bc.y1.callout" d="Once {site} is fully ramped, the program returns this much a year after Teton’s fees: about {ratio} times the first year’s total investment." v={{ ...vars, ratio: (kp.runRateAnnualNetBenefit / kp.totalInvestment12).toFixed(1) }} /></p>
            </div>
          </div>
        )}
        {basis}
      </Page>
    ));
    pages.push((no) => (
      <Page key="cashflow" no={no} crumb={<T k="bc.cf.crumb" d="Cash flow over the term" />}>
        <p className="bc-eyebrow"><T k="bc.cf.eyebrow" d="Cash flow over the term" /></p>
        <h1 className="bc-h1">
          {kp.discountedPaybackMonth ? (
            <T k="bc.cf.title" d="Paid back in month {payback}, {total} ahead by month {horizon}." v={{ payback: String(kp.discountedPaybackMonth), total: usd(total36, { compact: true }), horizon: String(horizon) }} />
          ) : (
            <T k="bc.cf.titleNoPayback" d="{total} by month {horizon}." v={{ total: usd(total36, { compact: true }), horizon: String(horizon) }} />
          )}
        </h1>
        <p className="bc-lede"><T k="bc.cf.lede" d="Net benefit by quarter after Teton’s fees and installation, discounted at {customer}’s {costOfMoney} cost of money. Each bar starts where the last one ended." v={vars} /></p>
        <div className="bc-card bc-chart">
          <QuarterlyWaterfall discountedNet={net} startDate={inputs.schedule.startDate} paybackMonth={kp.discountedPaybackMonth} pilotEndMonth={d.pilotEndMonth} />
        </div>
        <div className="bc-three" style={{ marginTop: 16 }}>
          {windows.map((w) => {
            const v = sum(net.slice(w.from - 1, w.to));
            return (
              <div key={w.key} className="bc-card bc-mini">
                <span className="bc-crumb">{w.label}</span>
                <b>{v >= 0 ? '+' : '−'}{usd(Math.abs(v), { compact: true })}</b>
                <span><T k={`bc.cf.${w.key}`} d={w.note} /></span>
              </div>
            );
          })}
        </div>
        {basis}
      </Page>
    ));
  }

  // ---------- Implementation ----------
  if (shown('implementation') && stages.length) {
    pages.push((no) => (
      <Page key="implementation" no={no} crumb={<T k="bc.impl.crumb" d="Implementation · {site}" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.impl.eyebrow" d="Implementation" /></p>
        <h1 className="bc-h1"><T k="bc.impl.title" d="Live at {site} on {goLive}." v={{ ...vars, goLive: goLive ?? '' }} /></h1>
        <p className="bc-lede"><T k="bc.impl.lede" d="A preliminary path from a signed order form to go-live. Teton’s implementation and customer success team leads each stage." /></p>
        <div className="bc-grid2">
          {stages.map((st, i) => (
            <div key={st.id} className="bc-card bc-num">
              <span className="bc-n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{st.name}</h3>
                <p className="bc-when">
                  <V k={`impl.${st.id}.weeks`} label={`${st.name} timing`}>
                    {st.weeks} {st.weeks === 1 ? 'week' : 'weeks'} · {weekLabel(st, true)} · {longDate(st.start).replace(/, \d{4}$/, '')} – {longDate(st.end).replace(/, \d{4}$/, '')}
                  </V>
                </p>
                {st.description && <p><T k={`impl.${st.id}.note`} d={st.description} /></p>}
              </div>
            </div>
          ))}
        </div>
        <p className="bc-eyebrow bc-gray"><T k="bc.impl.band" d="Where the pilot sits in the project" /></p>
        <div className="bc-phase">
          <div>
            <span className="bc-k"><T k="bc.impl.p1k" d="Before kick-off" /></span>
            <h4><T k="bc.impl.p1" d="Order form signed" /></h4>
            <p><T k="bc.impl.p1note" d="Dates assume the order form is signed by {date}." v={{ date: contractEnd ? longDate(contractEnd.end) : 'the end of contracting' }} /></p>
          </div>
          <div>
            <span className="bc-k">{goLive}</span>
            <h4><T k="bc.impl.p2" d={anyPilot ? 'Go-live and pilot' : 'Go-live'} /></h4>
            <p>
              <T k="bc.impl.p2note" d={anyPilot ? 'A {pilot}-month pilot before the service term.' : 'Teton is live in every bed from day one.'} v={{ pilot: String(inputs.schedule.pilotLengthMonths) }} />
            </p>
          </div>
          <div>
            <span className="bc-k"><T k="bc.impl.p3k" d={anyPilot ? 'After the pilot' : 'After go-live'} /></span>
            <h4><T k="bc.impl.p3" d="{term}-month service term" v={{ term: String(term) }} /></h4>
            <p><T k="bc.impl.p3note" d="Results are measured against the baseline collected before go-live." /></p>
          </div>
        </div>
      </Page>
    ));
  }

  // ---------- The customer's team ----------
  if (shown('resources') && hasResources) {
    pages.push((no) => (
      <Page key="resources" no={no} crumb={<T k="bc.team.crumb" d="Your team" />}>
        <p className="bc-eyebrow"><T k="bc.team.eyebrow" d="Estimated resource allocation" /></p>
        <h1 className="bc-h1"><T k="bc.team.title" d="{hours} hours from {customer}’s team." v={{ ...vars, hours: count(team.total) }} /></h1>
        <p className="bc-lede"><T k="resources.intro" d="Estimated hours from your team by stage. Teton’s implementation and customer success team leads each stage." /></p>
        <div className="bc-card bc-tbl bc-hrs">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                {team.stages.map((s) => (
                  <th key={s.id}>
                    <span className="bc-dot" style={{ background: stageColor(s.id, draft.implementationPlan.order) }} />
                    {s.name}
                  </th>
                ))}
                <th className="bc-hl">Total</th>
              </tr>
            </thead>
            <tbody>
              {team.rows.map((r) => (
                <tr key={r.id}>
                  <td className="bc-m">
                    {r.role}
                    {!layout.hiddenValues.includes('roleNotes') && r.notes.some((n) => n.note) && (
                      <small className="bc-clamp">{r.notes.filter((n) => n.note).map((n) => `${n.stage}: ${n.note}`).join(' · ')}</small>
                    )}
                  </td>
                  {team.stages.map((s) => (
                    <td key={s.id}>{s.id in r.hours ? count(r.hours[s.id]) : '–'}</td>
                  ))}
                  <td className="bc-hl bc-big">{count(r.total)}</td>
                </tr>
              ))}
              <tr className="bc-tot">
                <td className="bc-m">Total hours</td>
                {team.stages.map((s) => (
                  <td key={s.id}>{count(team.stageTotals[s.id])}</td>
                ))}
                <td className="bc-hl bc-big">{count(team.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Page>
    ));
  }

  // ---------- Terms, notes and assumptions ----------
  const customIds = layout.order.filter((id) => id.startsWith('custom-') && layout.custom[id]);
  if (shown('terms') || shown('assumptions') || customIds.length) {
    pages.push((no) => (
      <Page key="terms" no={no} crumb={<T k="bc.terms.crumb" d="Terms and assumptions" />}>
        <p className="bc-eyebrow"><T k="bc.terms.eyebrow" d="Terms and assumptions" /></p>
        <h1 className="bc-h1"><T k="bc.terms.title" d="What the figures assume." /></h1>
        {shown('terms') && (
          <>
            <p className="bc-eyebrow bc-gray"><T k="bc.terms.terms" d="Terms and notes" /></p>
            <div className="bc-card bc-terms">
              <TermsList draft={draft} />
            </div>
          </>
        )}
        {customIds.map((id) => (
          <div key={id}>
            <p className="bc-eyebrow bc-gray">{layout.custom[id].title}</p>
            {/* Added sections are sanitized on save; they're edited in the standard format. */}
            <div className="bc-card bc-terms proposal-rich" dangerouslySetInnerHTML={{ __html: layout.custom[id].html }} />
          </div>
        ))}
        {shown('assumptions') && (
          <>
            <p className="bc-eyebrow bc-gray"><T k="assume.title" d="Assumptions" /></p>
            <div className="bc-card bc-assume">
              {d.assumptions.map(([key, label, value]) => (
                <div key={key}>
                  <span><T k={key} d={label} /></span>
                  <b><V k={`${key}.value`} label={`${label} value`}>{value}</V></b>
                </div>
              ))}
            </div>
            <p className="bc-note">
              <T k="assume.disclaimer" d="Benefits are modeled estimates based on the assumptions above and the {case} case, not guaranteed results. Prices are in US dollars and exclude applicable taxes. Final pricing is set by the order form." v={{ case: caseName }} />
            </p>
          </>
        )}
        {capexShown && (
          <div className="bc-callout">
            <b><V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal, { compact: capex.ownershipTotal >= 10_000_000 })}</V></b>
            <div>
              <span className="bc-chip"><T k="bc.terms.chip" d="Four-year cost of ownership" /></span>
              <p><T k="bc.terms.callout" d="{equipment} of equipment paid once at install, plus {software} of software and services over four years, the useful life of the hardware. About {share} of it is equipment." v={{ equipment: usd(capex.equipment), software: usd(capex.software), share: `${Math.round(capex.equipmentShare * 100)}%` }} /></p>
            </div>
          </div>
        )}
      </Page>
    ));
  }

  return (
    <article id="proposal" className="bc-doc" data-format="businessCase">
      <section className="bc-page bc-cover">
        <div className="bc-blob1" />
        <div className="bc-blob2" />
        <div className="bc-cover-top">
          <Logo />
          <span className="bc-pill"><T k="bc.cover.pill" d="Prepared for {customer}" v={vars} /></span>
        </div>
        <div className="bc-cover-main">
          <p className="bc-kicker"><T k="bc.cover.kicker" d="Proposal" /></p>
          <h1 className="bc-title"><T k="customer" d={customer} /></h1>
          <p className="bc-sub">
            <T k="bc.cover.sub" d="Teton ambient monitoring for {site}’s {beds}: the investment, what it returns once live, and how quickly it pays for itself." v={vars} />
          </p>
        </div>
        <div className="bc-cover-bottom">
          <p className="bc-sig">
            <b>Proposal v{versionNo} · {sites}</b>
            <br />
            {dateLabel(savedAt)}
          </p>
          {shown('roi') && (
            <div className="bc-stat">
              <b><V k="roi.total.value" label="Total annual benefit amount">{usd(sel.annualRoi)}</V></b>
              <span><T k="bc.cover.stat" d="projected annual benefit once {site} is live ({case} case)" v={vars} /></span>
            </div>
          )}
        </div>
        <div className="bc-band"><T k="bc.cover.band" d="Prevention becomes measurable once the environment becomes observable." /></div>
      </section>
      {pages.map((render, i) => render(i + 2))}
    </article>
  );
}
