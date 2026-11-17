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
import { Children, isValidElement, type ReactElement } from 'react';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { basePackageRows } from '@/lib/pricing/capex';
import { SKU } from '@/lib/pricing/catalog';
import type { StoredOutputs } from '@/lib/data/quotes';
import type { QuoteDraft } from '@/lib/quote/draft';
import { count, dateLabel, multiple, usd } from '@/lib/format';
import { weekLabel } from '@/lib/quote/implementationPlan';
import { allocationTable } from '@/lib/quote/resources';
import { stageColor, longDate } from '@/components/implementation/ImplementationGantt';
import { T, useProposalText } from './EditableText';
import { CustomTitle, RichBody, V } from './ProposalSections';
import { BC_PAGE_TITLES, bcPagesOf, insertBcPage, moveBcPage, removeBcPage } from '@/lib/proposal/bcPages';
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

/** A movable section of a business-case page (rendered by Blocks, in the page's saved order). */
interface BProps {
  id: string;
  /** Names the section in its move controls. */
  label: string;
  children: React.ReactNode;
}
function B(_props: BProps): null {
  return null;
}

/**
 * The sections of one page, in the order the rep chose (new sections go after the saved ones, in their
 * default order). Hover a section for ↑ / ↓ to move it within the page.
 */
function Blocks({ page, children }: { page: string; children: React.ReactNode }) {
  const { editable, layout, setLayout } = useProposalText();
  const items = Children.toArray(children).filter((c): c is ReactElement<BProps> => isValidElement(c) && c.type === B);
  const ids = items.map((c) => c.props.id);
  const saved = (layout.bcBlocks?.[page] ?? []).filter((id) => ids.includes(id));
  const order = [...saved, ...ids.filter((id) => !saved.includes(id))];
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setLayout((l) => ({ ...l, bcBlocks: { ...(l.bcBlocks ?? {}), [page]: next } }));
  };
  const btn = 'w-6 h-6 flex items-center justify-center rounded-md text-[12px] hover:bg-white/15 disabled:opacity-30';
  return (
    <>
      {order.map((id, i) => {
        const c = byId.get(id)!;
        return (
          <div key={id} className="bc-block group/bcb" data-bc-block={id}>
            {editable && order.length > 1 && (
              <div data-edit-ui className="no-print bc-block-controls opacity-0 group-hover/bcb:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" className={btn} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${c.props.label} up`} title={`Move ${c.props.label} up`}>
                  ↑
                </button>
                <button type="button" className={btn} disabled={i === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${c.props.label} down`} title={`Move ${c.props.label} down`}>
                  ↓
                </button>
              </div>
            )}
            {c.props.children}
          </div>
        );
      })}
    </>
  );
}

/** "+ Add page" in the gap before a page (or after the last one): inserts a page of formatted text. */
function AddPageZone({ at }: { at: string | null }) {
  const { editable, setLayout } = useProposalText();
  if (!editable) return null;
  return (
    <div data-edit-ui className="no-print bc-addzone group/add">
      <div className="bc-addband">
      <button
        type="button"
        className="opacity-0 group-hover/add:opacity-100 focus:opacity-100 transition-opacity rounded-full bg-white border border-teton-blue/60 text-teton-ink text-[11px] font-medium px-3 py-1 shadow-sm"
        onClick={() => {
          const id = `bcpage-${Date.now().toString(36)}`;
          setLayout((l) => {
            const pages = bcPagesOf(l);
            const i = at ? pages.indexOf(at) : -1;
            return { ...l, bcPages: insertBcPage(pages, i < 0 ? pages.length : i, id), bcCustom: { ...(l.bcCustom ?? {}), [id]: { title: 'New page', html: '' } } };
          });
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-custom-title="${id}"]`);
            if (!el) return;
            el.scrollIntoView({ block: 'center' });
            el.focus();
            const r = document.createRange();
            r.selectNodeContents(el);
            getSelection()?.removeAllRanges();
            getSelection()?.addRange(r);
          }, 60);
        }}
      >
        + Add page
      </button>
      </div>
    </div>
  );
}

/** A page with its screen-only controls: move earlier / later, remove. */
function PageSlot({ id, index, order, children }: { id: string; index: number; order: string[]; children: React.ReactNode }) {
  const { editable, layout, setLayout } = useProposalText();
  const custom = layout.bcCustom?.[id];
  const title = custom ? custom.title || 'Added page' : (BC_PAGE_TITLES as Record<string, string>)[id] ?? id;
  const move = (dir: -1 | 1) => setLayout((l) => ({ ...l, bcPages: moveBcPage(bcPagesOf(l), id, dir, order) }));
  const remove = () => {
    if (custom && (custom.html.replace(/<[^>]*>/g, '').trim() || (custom.title && custom.title !== 'New page')) && !window.confirm('Delete this page and its text?')) return;
    setLayout((l) => {
      const bcCustom = { ...(l.bcCustom ?? {}) };
      delete bcCustom[id];
      return { ...l, bcPages: removeBcPage(bcPagesOf(l), id), bcCustom };
    });
  };
  const btn = 'w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <>
      <AddPageZone at={id} />
      <div className={`bc-slot group/bcp ${index === order.length - 1 ? 'bc-last' : ''}`} data-bc-page={id}>
        {editable && (
          <div data-edit-ui className="no-print bc-controls opacity-0 group-hover/bcp:opacity-100 focus-within:opacity-100 transition-opacity">
            <span className="px-2 text-[11px] font-medium">
              Page {index + 1} · {title}
            </span>
            <button type="button" className={btn} disabled={index === 0} onClick={() => move(-1)} aria-label={`Move ${title} earlier`} title="Move earlier">
              ↑
            </button>
            <button type="button" className={btn} disabled={index === order.length - 1} onClick={() => move(1)} aria-label={`Move ${title} later`} title="Move later">
              ↓
            </button>
            <button type="button" className={btn} onClick={remove} aria-label={`Remove page ${title}`} title={custom ? 'Delete this page' : 'Remove this page (you can add it back)'}>
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}

/** "119 beds × $400" (+ more groups when rates differ by community), from one-time install lines. */
function installMath(ls: PriceLine[]): { gross: number; credit: number; text: string } {
  const install = ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.install && !l.concessionCode?.startsWith('INSTALL_CREDIT'));
  const credit = -sum(ls.filter((l) => l.concessionCode?.startsWith('INSTALL_CREDIT')).map(lineTotal));
  const groups = new Map<number, number>();
  install.forEach((l) => groups.set(l.unitNet, (groups.get(l.unitNet) ?? 0) + l.qty));
  const parts = Array.from(groups.entries()).map(([unit, qty]) => `${count(qty)} beds × ${usd(unit, { cents: !Number.isInteger(unit) })}`);
  const gross = sum(install.map(lineTotal));
  const text = (parts.join(' + ') || 'No installation') + (credit > 0 ? ` − ${usd(credit)} pilot credit` : '');
  return { gross, credit, text };
}

/** "50 sensors × $300", from one-time sensor lines. */
/**
 * "50 sensors × $300", at list price, less any discount shown as a credit ("− $15,000 pilot credit"
 * when the discounted sensors are all at pilot sites), so free or discounted sensors read like the install credit.
 */
function sensorMath(ls: PriceLine[], isPilot: (position: number | null | undefined) => boolean = () => false): { total: number; text: string } {
  const sensors = ls.filter((l) => l.billing === 'one_time' && l.sku === SKU.sensor && l.qty > 0);
  const groups = new Map<number, number>();
  sensors.forEach((l) => {
    const unit = Math.max(l.unitList, l.unitNet);
    groups.set(unit, (groups.get(unit) ?? 0) + l.qty);
  });
  const parts = Array.from(groups.entries()).map(([unit, qty]) => `${count(qty)} ${qty === 1 ? 'sensor' : 'sensors'} × ${usd(unit)}`);
  const discounted = sensors.filter((l) => l.unitList > l.unitNet);
  const credit = sum(discounted.map((l) => l.qty * (l.unitList - l.unitNet)));
  const label = discounted.length && discounted.every((l) => isPilot(l.communityPosition)) ? 'pilot credit' : 'credit';
  const text = (parts.join(' + ') || 'None included') + (credit > 0 ? ` − ${usd(credit)} ${label}` : '');
  return { total: sum(sensors.map(lineTotal)), text };
}

/** What's in scope, as pills: filled when included, dimmed when not. */
function ScopePills({ ecall, rates }: { ecall: boolean; rates?: { monitoring: string; ecall: string } }) {
  return (
    <div className="bc-pills">
      <span className="bc-pill-col">
        <span className="bc-pill-on bc-pill-lav"><T k="bc.scope.pill.monitoring" d="AI Resident Monitoring & Fall Prevention/Detection" /></span>
        {rates && <span className="bc-pill-rate"><T k="bc.scope.pill.monitoringRate" d="({rate} per bed, per month)" v={{ rate: rates.monitoring }} /></span>}
      </span>
      <span className="bc-pill-col">
        <span className={ecall ? 'bc-pill-on bc-pill-coral' : 'bc-pill-off'}>
          <T k="bc.scope.pill.ecall" d="Teton E-Call / Nurse Call" />
        </span>
        {rates && ecall && <span className="bc-pill-rate"><T k="bc.scope.pill.ecallRate" d="({rate} per bed, per month)" v={{ rate: rates.ecall }} /></span>}
      </span>
    </div>
  );
}

function ScopeRow({ ecall, rates }: { ecall: boolean; rates?: { monitoring: string; ecall: string } }) {
  return (
    <div className="bc-req-row">
      <div className="bc-req-name"><T k="bc.scope.scope" d="Scope" /></div>
      <div className="bc-req-span"><ScopePills ecall={ecall} rates={rates} /></div>
    </div>
  );
}

/** A cost line: a name with an optional "(one-time)" under it, the math, and the amount. */
function CostRow({ name, sub, desc, amount, pct, total }: { name: React.ReactNode; sub?: React.ReactNode; desc: React.ReactNode; amount: React.ReactNode; pct?: string; total?: boolean }) {
  return (
    <div className={`bc-req-row ${total ? 'bc-req-total' : ''}`}>
      <div className="bc-req-name">
        {name}
        {sub && <span className="bc-req-sub">{sub}</span>}
      </div>
      <div className="bc-req-desc">{desc}</div>
      <div className="bc-req-amt">{amount}</div>
      <div className="bc-req-pct">{pct ?? ''}</div>
    </div>
  );
}

/** A community's beds by care type. */
const bedsOf = (dc: QuoteDraft['communities'][number]) => ({
  il: Number(dc.ilBeds) || 0,
  al: Number(dc.alBeds) || 0,
  mc: Number(dc.mcBeds) || 0,
  snf: Number(dc.snfBeds) || 0,
});

const ECALL_NAME = { ble: 'Teton E-Call', inovonics: 'Inovonics E-Call', none: '' } as const;

export function BusinessCaseDocument({ draft, outputs, lines, versionNo, savedAt }: { draft: QuoteDraft; outputs: StoredOutputs; lines: PriceLine[]; versionNo: number; savedAt: string | null }) {
  const { layout } = useProposalText();
  const d = buildProposalData(draft, outputs, lines);
  const { kp, cf, sel, capex, inputs, units, anyPilot, pilots, hasResources, costOfMoney, capRate, caseName, term } = d;
  // Until the rep arranges the pages, a removed standard section also drops its part of a page.
  const shown = (id: string) => !!layout.bcPages || !layout.hiddenSections.includes(id);
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

  // Each page, by id; a page with nothing to show (no implementation plan, no roles) has no entry.
  const defs: Record<string, (no: number) => React.ReactNode> = {};

  // ---------- The pilot ----------
  // Pilot sites' costs from the price lines: pilot fees for the pilot months, and their installation net of credits.
  const pilotSites = draft.communities
    .map((dc, i) => ({ dc, i, row: d.perCommunity[i] }))
    .filter((x) => x.row?.pilot);
  if (pilotSites.length) {
    const pos = new Set(pilotSites.map((x) => x.i));
    const siteLines = lines.filter((l) => l.communityPosition != null && pos.has(l.communityPosition));
    const pilotFeeLines = siteLines.filter((l) => l.billing === 'monthly' && l.description.includes('— pilot'));
    const pilotFees = sum(pilotFeeLines.map(lineTotal));
    const pilotMonthlyTotal = sum(pilotFeeLines.map((l) => l.qty * l.unitNet));
    const pIns = installMath(siteLines);
    const pSen = sensorMath(siteLines, (pos) => pos != null && !!d.perCommunity[pos]?.pilot);
    const install = pIns.gross - pIns.credit;
    const pilotTotal = pilotFees + install + pSen.total;
    const pilotEcall = draft.commercial.ecall !== 'none' && pilotSites.some((x) => x.dc.ecall);
    const months = inputs.schedule.pilotLengthMonths;
    const beds = bedsOf;
    const pilotName = pilotSites.length === 1 ? d.perCommunity[pilotSites[0].i].name || customer : `${pilotSites.length} pilot communities`;
    const pvars = { ...vars, pilot: pilotName, months: String(months), term: String(term) };
    defs.pilot = (no) => (
      <Page key="pilot" no={no} crumb={<T k="bc.pilot.crumb" d="The pilot" />}>
        <p className="bc-eyebrow"><T k="bc.pilot.eyebrow" d="The pilot" /></p>
        <h1 className="bc-h1">
          <T k="bc.pilot.title" d="A {months}-month pilot at {pilot}, {total} all in." v={{ ...pvars, total: usd(pilotTotal) }} />
        </h1>
        <p className="bc-lede">
          <T k="bc.pilot.lede" d="It runs for {months} months from go-live, then converts to the {term}-month service term." v={pvars} />
        </p>
        <Blocks page="pilot">
        <B id="costs" label="Pilot costs">
        <div className="bc-card bc-req">
          <ScopeRow ecall={pilotEcall} />
          <CostRow
            name={<T k="bc.pilot.install" d="Installation" />}
            sub={<T k="bc.oneTime" d="(one-time)" />}
            desc={<T k="bc.pilot.installMath" d="{math}" v={{ math: pIns.text }} />}
            amount={<V k="bc.pilot.install.value" label="Pilot installation amount">{usd(install)}</V>}
            pct={pctOf(install, pilotTotal)}
          />
          <CostRow
            name={<T k="bc.sensors" d="Additional Sensors" />}
            sub={<T k="bc.oneTime" d="(one-time)" />}
            desc={<T k="bc.pilot.sensorMath" d="{math}" v={{ math: pSen.text }} />}
            amount={<V k="bc.pilot.sensors.value" label="Pilot additional sensors amount">{usd(pSen.total)}</V>}
            pct={pctOf(pSen.total, pilotTotal)}
          />
          <CostRow
            name={<T k="bc.pilot.fees" d="Monthly Fees" />}
            desc={
              <T
                k="bc.pilot.feesNote"
                d="{monthly} per month for {months} months. Includes Teton Resident Monitoring{ecall}."
                v={{ monthly: usd(pilotMonthlyTotal), months: String(months), ecall: pilotEcall ? ` and E-Call (${ECALL_NAME[draft.commercial.ecall]})` : '' }}
              />
            }
            amount={<V k="bc.pilot.fees.value" label="Pilot fees amount">{usd(pilotFees)}</V>}
            pct={pctOf(pilotFees, pilotTotal)}
          />
          <div className="bc-req-row bc-req-total">
            <div className="bc-req-name"><T k="bc.pilot.total" d="Total pilot cost" /></div>
            <div className="bc-req-desc">
              <T k="bc.pilot.totalNote" d={pilotSites.length === 1 ? 'Everything paid during the {months}-month pilot. After it, the community converts to the {term}-month service term.' : 'Everything paid during the {months}-month pilot. After it, the communities convert to the {term}-month service term.'} v={pvars} />
            </div>
            <div className="bc-req-amt"><V k="bc.pilot.total.value" label="Total pilot cost">{usd(pilotTotal)}</V></div>
            <div className="bc-req-pct">100%</div>
          </div>
        </div>
        </B>
        <B id="communities" label="Pilot communities">
        <p className="bc-eyebrow bc-gray"><T k="bc.pilot.where" d={pilotSites.length === 1 ? 'Where the pilot runs' : 'Where the pilots run'} /></p>
        {/* Every pilot community in one table: beds by care type and what its pilot costs. */}
          <div className="bc-card bc-tbl bc-hrs bc-pilot-tbl">
            <table>
              <thead>
                <tr>
                  <th>Community</th>
                  <th>AL beds</th>
                  <th>MC beds</th>
                  <th>SNF beds</th>
                  <th>Pilot / month</th>
                  <th className="bc-hl">Pilot cost</th>
                </tr>
              </thead>
              <tbody>
                {pilotSites.map(({ dc, i }) => {
                  const b = beds(dc);
                  const ls = siteLines.filter((l) => l.communityPosition === i);
                  const fees = ls.filter((l) => l.billing === 'monthly' && l.description.includes('— pilot'));
                  const cost = sum(fees.map(lineTotal)) + sum(ls.filter((l) => l.billing === 'one_time').map(lineTotal));
                  return (
                    <tr key={dc.id}>
                      <td className="bc-m">
                        {d.perCommunity[i].name}
                        <small>{d.perCommunity[i].detail}</small>
                      </td>
                      <td>{count(b.al)}</td>
                      <td>{count(b.mc)}</td>
                      <td>{count(b.snf)}</td>
                      <td>{usd(sum(fees.map((l) => l.qty * l.unitNet)))}</td>
                      <td className="bc-hl bc-big">{usd(cost)}</td>
                    </tr>
                  );
                })}
                <tr className="bc-tot">
                  <td className="bc-m">{pilotSites.length === 1 ? 'Total' : `${pilotSites.length} communities`}</td>
                  <td>{count(sum(pilotSites.map((x) => beds(x.dc).al)))}</td>
                  <td>{count(sum(pilotSites.map((x) => beds(x.dc).mc)))}</td>
                  <td>{count(sum(pilotSites.map((x) => beds(x.dc).snf)))}</td>
                  <td>{usd(pilotMonthlyTotal)}</td>
                  <td className="bc-hl bc-big">{usd(pilotTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- The investment ----------
  // Investment page (subscription): the math behind each line, and all-in cost per bed per month over each community's pilot and term.
  const allIns = installMath(lines);
  const allSen = sensorMath(lines, (pos) => pos != null && !!d.perCommunity[pos]?.pilot);
  const anyEcall = draft.commercial.ecall !== 'none' && draft.communities.some((c) => c.ecall);
  const perBed = units > 0 ? d.serviceMonthly / units : 0;
  const perBedMonthly = usd(perBed, { cents: !Number.isInteger(Math.round(perBed * 100) / 100) });
  const money = (n: number) => usd(n, { cents: !Number.isInteger(Math.round(n * 100) / 100) });
  // Year 1: one-time charges and monthly fees billed in the first 12 months (they add up to the Year 1 investment).
  const y1OneTime = sum(cf.install.slice(0, 12));
  const y1Monthly = kp.totalInvestment12 - y1OneTime;
  {
    defs.scope = (no) => (
      <Page key="scope" no={no} crumb={<T k="bc.crumb" d="{customer} · Proposal" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.scope.eyebrow" d="The investment" /></p>
        {capexShown ? (
          <>
            <h1 className="bc-h1">
              <T k="bc.scope.title.capex" d="{equipment} of equipment, returned through {site}’s operating income." v={{ ...vars, equipment: usd(capex.equipment) }} />
            </h1>
            <p className="bc-lede">
              <T k="bc.scope.lede.capex" d="{customer} buys the hardware outright: title passes at install and the embedded license is perpetual, so nearly all of the cost is a capital purchase." v={vars} />
            </p>
          </>
        ) : (
          <>
            <h1 className="bc-h1">
              <T k="bc.scope.title.opex" d="{total} over the {term}-month term, returned through {site}’s operating income." v={{ ...vars, total: usd(d.termTotal), term: String(term) }} />
            </h1>
            <p className="bc-lede">
              <T k="bc.scope.lede.opex" d="Teton ambient monitoring for {sites} and {beds}, by subscription." v={vars} />
            </p>
          </>
        )}
        {capexShown ? (
          <Blocks page="scope-capex">
            <B id="costs" label="Equipment purchase">
            <div className="bc-card bc-req bc-req-tight">
              <ScopeRow ecall={anyEcall} />
              {basePackageRows(capex).map((r) => (
                <CostRow
                  key={r.ecall}
                  name={<T k={`bc.capex.base.${r.ecall}`} d="Base packages" />}
                  sub={<T k="bc.oneTime" d="(one-time)" />}
                  desc={
                    <T
                      k={`bc.capex.base.${r.ecall}.math`}
                      d={r.ecall === 'none' ? '{math}. Edge unit + sensor, installed.' : r.ecall === 'ble' ? '{math}. Edge unit + sensor, installed, with E-Call pendant and wall-mount pendant.' : '{math}. Edge unit + sensor, installed, with Inovonics E-Call pendant and wall-mount pull cord.'}
                      v={{ math: `${count(r.beds)} beds × ${usd(r.perBed)}` }}
                    />
                  }
                  amount={<V k={`capex.base.${r.ecall}.value`} label={`${r.label} amount`}>{usd(r.total)}</V>}
                />
              ))}
              <CostRow
                name={<T k="bc.sensors" d="Additional Sensors" />}
                sub={<T k="bc.oneTime" d="(one-time)" />}
                desc={<T k="bc.capex.sensorMath" d="{math}" v={{ math: capex.sensors ? `${count(capex.sensors)} ${capex.sensors === 1 ? 'sensor' : 'sensors'} × ${usd(capex.pricing.sensorPrice)}` : 'None included' }} />}
                amount={<V k="capex.sensors.value" label="Additional sensors amount">{usd(capex.sensorCost)}</V>}
              />
              <CostRow
                total
                name={<T k="capex.price" d="One-time equipment cost" />}
                desc={<T k="bc.capex.equipmentNote" d="Paid at install. No separate installation charge and no license fee." />}
                amount={<V k="capex.price.value" label="One-time equipment cost">{usd(capex.equipment)}</V>}
              />
              <CostRow
                name={<T k="bc.capex.software" d="Software and services" />}
                sub={<T k="bc.capex.billedMonthly" d="(billed monthly)" />}
                desc={<T k="bc.capex.softwareMath" d="{beds} beds × {rate} per month." v={{ beds: count(capex.beds), rate: usd(capex.pricing.softwareRate, { cents: !Number.isInteger(capex.pricing.softwareRate) }) }} />}
                amount={<V k="capex.software.value" label="Software and services per month">{usd(capex.softwareMonthly)} / mo</V>}
              />
              {capex.renewals > 0 && (
                <CostRow
                  name={<T k="capex.renewals" d="E-Call renewals" />}
                  desc={<T k="bc.capex.renewalsNote" d="Renewals that fall within the {years} years." v={{ years: String(capex.ownershipMonths / 12) }} />}
                  amount={<V k="capex.renewals.value" label="E-Call renewals amount">{usd(capex.renewals)}</V>}
                />
              )}
              <CostRow
                total
                name={<T k="bc.capex.ownership" d="{years}-year cost of ownership" v={{ years: capex.ownershipMonths === 48 ? 'Four' : String(capex.ownershipMonths / 12) }} />}
                desc={<T k="bc.capex.ownershipNote" d="Equipment plus software over the hardware’s useful life. About {share} is equipment, a capital purchase rather than an operating expense." v={{ share: `${Math.round(capex.equipmentShare * 100)}%` }} />}
                amount={<V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal)}</V>}
              />
            </div>
            {ecall > 0 && capex.ownershipTotal > 0 && (
              <div className="bc-split">
                <div style={{ flex: platform, background: 'var(--bc-lav)' }}>
                  <T k="bc.split.platform" d="AI Resident Monitoring & Fall Prevention/Detection" /> · {pctOf(platform, capex.ownershipTotal)} of four-year cost
                </div>
                <div style={{ flex: Math.max(ecall, capex.ownershipTotal * 0.12), background: 'var(--bc-sage)' }}>E-Call · {pctOf(ecall, capex.ownershipTotal)}</div>
              </div>
            )}
            {draft.presentation === 'both' && (
              <p className="bc-note">
                <T k="bc.scope.orSubscription" d="Or by subscription: {oneTime} one-time installation, then {monthly} a month, {total} over the {term}-month service term." v={{ oneTime: usd(d.oneTime), monthly: usd(d.serviceMonthly), total: usd(d.termTotal), term: String(term) }} />
              </p>
            )}
            </B>
            {shown('roi') && (
              <B id="numbers" label="The case in three numbers">
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
              </B>
            )}
          </Blocks>
        ) : (
          <Blocks page="scope">
            <B id="overview" label="Overview">
            <p className="bc-eyebrow bc-gray"><T k="bc.scope.overview" d="Overview" /></p>
            <div className="bc-three bc-three-compact">
              <Stat value={<V k="scope.total.value" label="Total cost over the term">{usd(d.termTotal)}</V>}>
                <T k="bc.overview.total" d="Total Cost Over {term}-month Term" v={{ term: String(term) }} />
              </Stat>
              <Stat value={<V k="bc.overview.perBed.value" label="Total cost per bed per month">{perBedMonthly}</V>}>
                <T k="bc.overview.perBed" d="Total Cost per Bed, Per Month" />
              </Stat>
              <Stat value={<>{term} months</>}>
                <T k="bc.overview.term" d="Post-Pilot Term Length" />
              </Stat>
            </div>
            </B>
            <B id="costs" label="Costs">
            <div className="bc-card bc-req bc-req-tight">
              <ScopeRow ecall={anyEcall} rates={{ monitoring: money(draft.commercial.platformRate), ecall: money(draft.commercial.ecallRate) }} />
              <CostRow
                name={<T k="bc.scope.install" d="Installation" />}
                sub={<T k="bc.oneTime" d="(one-time)" />}
                desc={<T k="bc.scope.installMath" d="{math}" v={{ math: allIns.text }} />}
                amount={<V k="scope.install.value" label="Installation amount">{usd(allIns.gross - allIns.credit)}</V>}
              />
              <CostRow
                name={<T k="bc.sensors" d="Additional Sensors" />}
                sub={<T k="bc.oneTime" d="(one-time)" />}
                desc={<T k="bc.scope.sensorMath" d="{math}" v={{ math: allSen.text }} />}
                amount={<V k="scope.sensors.value" label="Additional sensors amount">{usd(allSen.total)}</V>}
              />
              <CostRow
                name={<T k="bc.scope.subscription" d="Monthly Cost" />}
                desc={
                  <T
                    k="bc.scope.monthlyMath"
                    d={anyPilot ? '{beds} × {perBed} after {pilot}-month pilot.' : '{beds} × {perBed} per bed per month.'}
                    v={{ beds: `${count(units)} beds`, perBed: perBedMonthly, pilot: String(inputs.schedule.pilotLengthMonths) }}
                  />
                }
                amount={<V k="scope.serviceMonthly.value" label="Monthly once in service amount">{usd(d.serviceMonthly)}</V>}
              />
              <CostRow
                total
                name={<T k="bc.scope.year1" d="Total Year 1 Investment" />}
                desc={<T k="bc.scope.year1Note" d="{oneTime} one-time + {monthly} in monthly fees over the first 12 months." v={{ oneTime: usd(y1OneTime), monthly: usd(y1Monthly) }} />}
                amount={<V k="card.investment.value" label="Total Investment — Year 1 figure">{usd(kp.totalInvestment12)}</V>}
              />
            </div>
            </B>
            <B id="communities" label="Communities">
            <p className="bc-eyebrow bc-gray"><T k="bc.scope.where" d={draft.communities.length === 1 ? 'The community' : 'By community'} /></p>
            <div className="bc-card bc-tbl bc-hrs bc-pilot-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Community</th>
                    <th>AL beds</th>
                    <th>MC beds</th>
                    <th>SNF beds</th>
                    <th className="bc-hl">Total cost</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.communities.map((dc, i) => {
                    const b = bedsOf(dc);
                    const row = d.perCommunity[i];
                    return (
                      <tr key={dc.id}>
                        <td className="bc-m">
                          {row.name}
                          <small>{row.detail}</small>
                        </td>
                        <td>{count(b.al)}</td>
                        <td>{count(b.mc)}</td>
                        <td>{count(b.snf)}</td>
                        <td className="bc-hl bc-big">
                          {usd(row.monthly)} / mo
                          <small>({usd(row.oneTime)} one-time)</small>
                        </td>
                      </tr>
                    );
                  })}
                  {draft.communities.length > 1 && (
                  <tr className="bc-tot">
                    <td className="bc-m">{`${draft.communities.length} communities`}</td>
                    <td>{count(sum(draft.communities.map((c) => bedsOf(c).al)))}</td>
                    <td>{count(sum(draft.communities.map((c) => bedsOf(c).mc)))}</td>
                    <td>{count(sum(draft.communities.map((c) => bedsOf(c).snf)))}</td>
                    <td className="bc-hl bc-big">
                      {usd(d.serviceMonthly)} / mo
                      <small>({usd(d.oneTime)} one-time)</small>
                    </td>
                  </tr>
                  )}
                </tbody>
              </table>
            </div>
            </B>
          </Blocks>
        )}
      </Page>
    );
  }

  // ---------- The return ----------
  {
    defs.roi = (no) => (
      <Page key="roi" no={no} crumb={<T k="bc.roi.crumb" d="What the program returns" />}>
        <p className="bc-eyebrow"><T k="bc.roi.eyebrow" d="What the program returns" /></p>
        <h1 className="bc-h1"><T k="bc.roi.title" d="{benefit} a year, once every bed is live." v={{ benefit: usd(sel.annualRoi) }} /></h1>
        <p className="bc-lede">
          <T k="bc.roi.lede" d="The sources of value, modeled for {site}’s {beds} on the {case} case. Each is valued from {customer}’s own occupancy, rates and staffing assumptions." v={vars} />
        </p>
        <Blocks page="roi">
        <B id="table" label="Sources of value">
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
        </B>
        <B id="callout" label="Asset value">
        <div className="bc-callout">
          <b><V k="roi.outcome.valuation.value" label="Asset Value Impact figure">{usd(sel.valuationImpact, { compact: true })}</V></b>
          <div>
            <span className="bc-chip"><T k="bc.roi.chip" d="Asset value · {capRate} cap" v={vars} /></span>
            <p><T k="bc.roi.callout" d="of asset value from {noi} a year of added net operating income, capitalized once at a {capRate} cap rate: the figure an owner or REIT partner sees on the community’s valuation." v={{ ...vars, noi: usd(sel.annualNetNoiImpact, { compact: true }) }} /></p>
          </div>
        </div>
        </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- Year 1 and cash flow ----------
  {
    const basis = capexShown ? (
      <p className="bc-note"><T k="bc.y1.basis" d="Year 1 figures and the cash flow use the subscription pricing." /></p>
    ) : null;
    defs.summary = (no) => (
      <Page key="summary" no={no} crumb={<T k="bc.y1.crumb" d="Year 1 financial summary" />}>
        <p className="bc-eyebrow"><T k="bc.y1.eyebrow" d="Year 1 financial summary" /></p>
        <h1 className="bc-h1"><T k="bc.y1.title" d="{net} better off in the first year, after paying for everything." v={{ net: usd(kp.netBenefit12) }} /></h1>
        <p className="bc-lede"><T k="bc.y1.lede" d="The first twelve months at {site}: what goes in, what comes back, and how quickly it pays for itself, discounted at {customer}’s {costOfMoney} cost of money." v={vars} /></p>
        <Blocks page="summary">
        <B id="stats" label="Key figures">
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
        </B>
        <B id="table" label="Year 1 table">
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
        </B>
        <B id="callout" label="Run-rate callout">
        {kp.totalInvestment12 > 0 && (
          <div className="bc-callout">
            <b><V k="card.runRate.value" label="Run-Rate Annual Net Benefit figure">{usd(kp.runRateAnnualNetBenefit)}</V></b>
            <div>
              <span className="bc-chip"><T k="bc.y1.chip" d="Every year at run rate" /></span>
              <p><T k="bc.y1.callout" d="Once {site} is fully ramped, the program returns this much a year after Teton’s fees: about {ratio} times the first year’s total investment." v={{ ...vars, ratio: (kp.runRateAnnualNetBenefit / kp.totalInvestment12).toFixed(1) }} /></p>
            </div>
          </div>
        )}
        </B>
        {basis && <B id="note" label="Pricing note">{basis}</B>}
        </Blocks>
      </Page>
    );
    defs.cashflow = (no) => (
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
        <Blocks page="cashflow">
        <B id="chart" label="Chart">
        <div className="bc-card bc-chart">
          <QuarterlyWaterfall discountedNet={net} startDate={inputs.schedule.startDate} paybackMonth={kp.discountedPaybackMonth} pilotEndMonth={d.pilotEndMonth} />
        </div>
        </B>
        <B id="periods" label="By period">
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
        </B>
        {basis && <B id="note" label="Pricing note">{basis}</B>}
        </Blocks>
      </Page>
    );
  }

  // ---------- Implementation ----------
  if (stages.length) {
    defs.implementation = (no) => (
      <Page key="implementation" no={no} crumb={<T k="bc.impl.crumb" d="Implementation · {site}" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.impl.eyebrow" d="Implementation" /></p>
        <h1 className="bc-h1"><T k="bc.impl.title" d="Live at {site} on {goLive}." v={{ ...vars, goLive: goLive ?? '' }} /></h1>
        <p className="bc-lede"><T k="bc.impl.lede" d="A preliminary path from a signed order form to go-live. Teton’s implementation and customer success team leads each stage." /></p>
        <Blocks page="implementation">
        <B id="stages" label="Stages">
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
        </B>
        <B id="band" label="Where the pilot sits">
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
        </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- The customer's team ----------
  if (hasResources) {
    defs.resources = (no) => (
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
    );
  }

  // ---------- Terms, notes and assumptions ----------
  {
    defs.terms = (no) => (
      <Page key="terms" no={no} crumb={<T k="bc.terms.crumb" d="Terms and assumptions" />}>
        <p className="bc-eyebrow"><T k="bc.terms.eyebrow" d="Terms and assumptions" /></p>
        <h1 className="bc-h1"><T k="bc.terms.title" d="What the figures assume." /></h1>
        <Blocks page="terms">
        {shown('terms') && (
          <B id="terms" label="Terms and notes">
            <p className="bc-eyebrow bc-gray"><T k="bc.terms.terms" d="Terms and notes" /></p>
            <div className="bc-card bc-terms">
              <TermsList draft={draft} />
            </div>
          </B>
        )}
        {shown('assumptions') && (
          <B id="assumptions" label="Assumptions">
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
          </B>
        )}
        {capexShown && (
          <B id="callout" label="Cost of ownership">
          <div className="bc-callout">
            <b><V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal, { compact: capex.ownershipTotal >= 10_000_000 })}</V></b>
            <div>
              <span className="bc-chip"><T k="bc.terms.chip" d="Four-year cost of ownership" /></span>
              <p><T k="bc.terms.callout" d="{equipment} of equipment paid once at install, plus {software} of software and services over four years, the useful life of the hardware. About {share} of it is equipment." v={{ equipment: usd(capex.equipment), software: usd(capex.software), share: `${Math.round(capex.equipmentShare * 100)}%` }} /></p>
            </div>
          </div>
          </B>
        )}
        </Blocks>
      </Page>
    );
  }

  defs.cover = () => (
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
  );

  const custom = layout.bcCustom ?? {};
  const order = bcPagesOf(layout).filter((id) => defs[id] || custom[id]);
  return (
    <article id="proposal" className="bc-doc" data-format="businessCase">
      {order.map((id, i) => (
        <PageSlot key={id} id={id} index={i} order={order}>
          {custom[id] ? (
            <Page no={i + 1} crumb={custom[id].title || 'Added page'}>
              <h1 className="bc-h1 bc-custom-title">
                <CustomTitle id={id} title={custom[id].title} store="bcCustom" />
              </h1>
              <RichBody id={id} html={custom[id].html} store="bcCustom" className="proposal-rich bc-rich" />
            </Page>
          ) : (
            defs[id](i + 1)
          )}
        </PageSlot>
      ))}
      <AddPageZone at={null} />
    </article>
  );
}
