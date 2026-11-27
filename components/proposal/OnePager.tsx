'use client';

/**
 * A one pager (budgetary quote) in the business case: who it's for, the project scope, what gets installed, the
 * pilot (when the deal has one), the pricing (purchase and / or subscription; both E-Call systems where E-Call is in
 * scope), the options to choose from, and the fine print. Every line of text is editable, sections move up / down
 * and can be removed (and added back), and table rows can be removed.
 */
import { Fragment, useMemo } from 'react';
import { count, usd } from '@/lib/format';
import type { QuoteDraft } from '@/lib/quote/draft';
import { onePagerCounts, onePagerParts, purchaseTable, subscriptionTable, type OnePagerId, type OpRow, type OpSys, type OpTable } from '@/lib/proposal/onePager';
import { T, useProposalText } from './EditableText';
import { RTable, RTbody } from './ProposalSections';
import { CallOut } from './CallOut';
import { ViewSwitch } from './ViewSwitch';

type BlocksT = (p: { page: string; children: React.ReactNode }) => React.ReactNode;
type BT = (p: { id: string; label: string; onRemove?: () => void; view?: React.ReactNode; children: React.ReactNode }) => null;

export interface OnePagerPilot {
  months: number;
  install: number;
  monthly: number;
  total: number;
  creditPct: number;
}

const SYS_WORD: Record<OpSys, string> = { ble: 'Bluetooth', inov: 'Inovonics' };
const money = (n: number) => usd(n, { cents: !Number.isInteger(Math.round(n * 100) / 100) });
const per = (r: OpRow) => (r.min === r.max ? money(r.min) : `${money(r.min)}–${money(r.max)}`);

const Icon = ({ k }: { k: 'res' | 's' | 'e' | 'dv' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {k === 'res' && <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.3c2.3 0 4.2 1.6 4.8 4.7" /></>}
    {k === 's' && <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>}
    {k === 'e' && <><rect x="5" y="4" width="14" height="16" rx="3" /><circle cx="12" cy="12" r="3" /></>}
    {k === 'dv' && <><path d="M12 3v9" /><circle cx="12" cy="16" r="4" /></>}
  </svg>
);

const HW: Record<'sensor' | 'edge' | OpSys, { src: string; name: string; desc: string; contain?: boolean }> = {
  sensor: { src: '/Teton_Sensor.png', name: 'Teton Sensor', desc: 'Installed centrally on the ceiling of resident rooms & living areas' },
  edge: { src: '/Teton_ComputeUnit.png', name: 'Teton Edge Unit', desc: 'Mounted to a wall within each resident room' },
  ble: { src: '/Bluetooth_Pendant.png', name: 'Teton Bluetooth pendant', desc: 'Wearable or wall button · Bluetooth gateways · Not UL certified', contain: true },
  inov: { src: '/Inovonics_Pullcord.png', name: 'Teton Inovonics pull-cord', desc: 'UL certified · Radio network · Battery backup', contain: true },
};

export function OnePagerBody({
  id,
  draft,
  customer,
  community,
  quoteDate,
  pilot,
  pilotTable,
  Blocks,
  B,
}: {
  id: OnePagerId;
  draft: QuoteDraft;
  customer: string;
  community: string;
  quoteDate: string;
  pilot: OnePagerPilot | null;
  /** The pilot community table (Resident Monitoring one pagers, when the rep adds it). */
  pilotTable: React.ReactNode | null;
  Blocks: BlocksT;
  B: BT;
}) {
  const { layout, setLayout, editable } = useProposalText();
  const { scope, mode } = onePagerParts(id);
  const systems: Array<OpSys | null> = scope === 'rm' ? [null] : ['ble', 'inov'];
  const two = systems.length === 2;
  const showP = mode !== 'opex';
  const showS = mode !== 'capex';
  const single = scope === 'rm' && mode !== 'both';
  const dense = two && mode === 'both';
  const k = (s: string) => `bc.${id}.${s}`;
  const tables = useMemo(() => {
    const out: { p: Partial<Record<string, OpTable>>; s: Partial<Record<string, OpTable>> } = { p: {}, s: {} };
    for (const sys of systems) {
      const key = sys ?? 'rm';
      if (showP) out.p[key] = purchaseTable(draft, sys);
      if (showS) out.s[key] = subscriptionTable(draft, sys);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, id]);
  const n = useMemo(() => onePagerCounts(draft), [draft]);
  const sysLabel = (s: OpSys) => (scope === 'both' ? `Teton w/ ${SYS_WORD[s]} E-Call` : `Teton ${SYS_WORD[s]}`);
  const pill = (s: OpSys) => (
    <span className={`bc-sys bc-sys-${s}`}>
      <T k={`bc.op.sys.${scope}.${s}`} d={sysLabel(s)} />
    </span>
  );

  // ---------- Project scope: the condensed total cards ----------
  const strip: Array<{ k: 'res' | 's' | 'e' | 'dv'; v: number; label: string }> = [
    ...(scope !== 'both' ? [{ k: 'res' as const, v: n.beds, label: 'Residents' }] : []),
    ...(scope !== 'ec' ? [{ k: 's' as const, v: n.sensors, label: n.caSensors > 0 ? `Sensors (${n.caSensors.toLocaleString('en-US')} common area)` : 'Sensors' }, { k: 'e' as const, v: n.edges, label: 'Edge units' }] : []),
    ...(scope !== 'rm' ? [{ k: 'dv' as const, v: n.devices, label: 'E-Call devices' }] : []),
  ];

  // ---------- What gets installed ----------
  const hw = (h: keyof typeof HW) => (
    <figure key={h} className={`bc-op-hw ${HW[h].contain ? 'bc-op-hw-fit' : ''}`}>
      <div className="bc-op-hwi">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HW[h].src} alt={HW[h].name} />
      </div>
      <figcaption>
        <b><T k={`bc.site.hw.${h}`} d={HW[h].name} /></b>
        <span><T k={`bc.op.hw.${h}.desc`} d={HW[h].desc} /></span>
      </figcaption>
    </figure>
  );
  const or = <span className="bc-op-hwor"><T k="bc.op.or" d="or" /></span>;

  // ---------- Pricing tables ----------
  const table = (kind: 'p' | 's') => {
    const by = kind === 'p' ? tables.p : tables.s;
    const keys = systems.map((s) => s ?? 'rm');
    // Rows in the first system's order, with any the other has added after them.
    const rowKeys: string[] = [];
    for (const sk of keys) for (const r of by[sk]?.rows ?? []) if (!rowKeys.includes(r.key)) rowKeys.push(r.key);
    const rowOf = (sk: string, rk: string) => by[sk]?.rows.find((r) => r.key === rk);
    const heading = kind === 'p' ? (two ? 'Purchase (CapEx)' : 'Purchase') : two ? 'Subscription (OpEx)' : 'Subscription';
    const col = (s: OpSys | null) => (s ? `bc-op-col-${s}` : 'bc-op-col-rm');
    return (
      <div className={`bc-card bc-tbl bc-op-tbl ${two ? 'bc-op-two' : ''}`}>
        <RTable>
          <thead>
            {two && (
              <tr className="bc-op-pills">
                <td />
                <td />
                {systems.map((s) => (
                  <td key={s} colSpan={2} className={col(s)}>{pill(s as OpSys)}</td>
                ))}
              </tr>
            )}
            <tr>
              <th className="bc-op-sech"><T k={k(`${kind}.head`)} d={heading} /></th>
              <th className="bc-r"><T k="bc.op.qty" d="Qty" /></th>
              {systems.map((s) => (
                <Fragment key={s ?? 'rm'}>
                  <th className={`bc-r ${col(s)}`}><T k={`bc.op.unit${s ? `.${s}` : ''}`} d="Unit" /></th>
                  <th className={`bc-r ${col(s)}`}><T k={`bc.op.total${s ? `.${s}` : ''}`} d="Total" /></th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <RTbody id={`${id}-${kind}`} name={`${heading} · One pager`}>
            {rowKeys.map((rk) => {
              const first = keys.map((sk) => rowOf(sk, rk)).find(Boolean)!;
              const tot = first.kind === 'total';
              return (
                <tr key={rk} className={tot ? 'bc-op-tot' : ''}>
                  <td className="bc-m">{first.label}</td>
                  <td className="bc-r">{first.qty == null ? '' : count(first.qty)}</td>
                  {systems.map((s) => {
                    const r = rowOf(s ?? 'rm', rk);
                    const c = col(s);
                    if (!r) return <Fragment key={s ?? 'rm'}><td className={`bc-r ${c}`}>–</td><td className={`bc-r ${c}`}>–</td></Fragment>;
                    return tot ? (
                      <Fragment key={s ?? 'rm'}>
                        <td className={c} />
                        <td className={`bc-r bc-op-big ${c}`}>{usd(r.total)}</td>
                      </Fragment>
                    ) : (
                      <Fragment key={s ?? 'rm'}>
                        <td className={`bc-r ${c}`}>{per(r)}</td>
                        <td className={`bc-r bc-op-strong ${c}`}>
                          {money(r.total)}
                          {r.kind === 'monthly' && <small> / mo</small>}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </RTbody>
        </RTable>
      </div>
    );
  };

  // ---------- Option cards ----------
  const opts: Array<{ key: string; sys: OpSys | null; kind: 'p' | 's'; t: OpTable }> = [];
  for (const s of systems) {
    const sk = s ?? 'rm';
    if (showP && tables.p[sk]) opts.push({ key: `${sk}.p`, sys: s, kind: 'p', t: tables.p[sk]! });
    if (showS && tables.s[sk]) opts.push({ key: `${sk}.s`, sys: s, kind: 's', t: tables.s[sk]! });
  }
  // A system pill over each system's cards (both products, or E-Call with both options); the cards then say which option.
  const pillBar = scope === 'both' || (scope === 'ec' && mode === 'both');
  const optName = (o: (typeof opts)[number]) => {
    const what = o.kind === 'p' ? 'Purchase' : 'Subscription';
    if (pillBar) return o.kind === 'p' ? 'Purchase (CapEx)' : 'Subscription (OpEx)';
    return o.sys ? `${SYS_WORD[o.sys]}, ${what.toLowerCase()}` : what;
  };

  const foot =
    scope === 'rm'
      ? 'Installation covers one sensor and Edge Unit per bed; additional sensors cover larger rooms and living areas.'
      : draft.commercial.ecallBilling === 'device'
        ? 'E-Call subscription is per device. Purchase base packages include E-Call per bed.'
        : `E-Call subscription is per room${n.areas ? ` (common areas count as rooms)` : ''}, one device each included; devices beyond that are one-time. Purchase base packages include E-Call per bed.`;
  const pilotShown = !!pilot;
  const tableShown = scope === 'rm' && !!pilotTable && (layout.bcOpPilotTable ?? []).includes(id);
  // What gets installed: condensed cards (whole photo, name only) or large ones (bigger photo and the description).
  // Until the rep picks one, the page's own fit decides: condensed where space is tight.
  const hwAuto: 'condensed' | 'large' = scope === 'both' || (!single && (pilotShown || tableShown)) ? 'condensed' : 'large';
  const hwSize = layout.bcOpHw?.[id] ?? hwAuto;
  const setHwSize = (v: 'condensed' | 'large') =>
    setLayout((l) => {
      const next = { ...(l.bcOpHw ?? {}) };
      if (v === hwAuto) delete next[id];
      else next[id] = v;
      return { ...l, bcOpHw: Object.keys(next).length ? next : undefined };
    });
  const hideTable = () => setLayout((l) => ({ ...l, bcOpPilotTable: (l.bcOpPilotTable ?? []).filter((x) => x !== id) }));

  return (
    <div className={`bc-op ${single ? 'bc-op-single' : ''} ${dense ? 'bc-op-dense' : ''} ${pilotShown ? 'bc-op-withpilot' : ''} ${tableShown ? 'bc-op-withtable' : ''}`}>
      <div className="bc-op-top">
        <div className="min-w-0">
          <p className="bc-eyebrow"><T k={k('eyebrow')} d="Budgetary quote" /></p>
          <h1 className="bc-h1">
            <T k={k('title')} d={scope === 'rm' ? 'Teton Resident Monitoring' : scope === 'ec' ? 'Teton E\u2011Call' : 'Teton Resident Monitoring + E\u2011Call'} />
          </h1>
          <p className="bc-lede">
            <T
              k={k('lede')}
              d={`${scope === 'rm' ? 'Budgetary pricing for AI resident monitoring and fall prevention' : scope === 'ec' ? 'Budgetary pricing for a full nurse call system replacement' : 'Budgetary pricing for resident monitoring with a full nurse call replacement'}, shown ${two ? 'for both hardware options ' : ''}${mode === 'both' ? 'as a purchase or a subscription' : mode === 'opex' ? 'as a subscription' : 'as a purchase'}.`}
            />
          </p>
        </div>
        <div className="bc-card bc-op-pf">
          <p className="bc-op-pfh"><T k="bc.op.pf" d="Prepared for" /></p>
          <RTable>
            <RTbody id={`${id}-pf`} name="Prepared for · One pager">
              <tr key="customer"><td>Customer</td><td>{customer}</td></tr>
              <tr key="community"><td>Community</td><td>{community}</td></tr>
              <tr key="date"><td>Quote date</td><td>{quoteDate}</td></tr>
            </RTbody>
          </RTable>
        </div>
      </div>
      <Blocks page={id}>
        <B id="scope" label="Project scope">
          <p className="bc-eyebrow bc-gray"><T k={k('scope')} d="Project scope" /></p>
          <div className="bc-sitetot bc-op-strip" style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}>
            {strip.map((it) => (
              <div key={it.k} className={`bc-sitetot-c bc-sitetot-${it.k === 'res' ? 'r' : it.k}`}>
                <div className="bc-sitetot-top">
                  <span className="bc-sitetot-ic" aria-hidden="true"><Icon k={it.k} /></span>
                  <b className="bc-sitetot-v"><CallOut k={`${id}.n.${it.k}`}>{count(it.v)}</CallOut></b>
                  <span className="bc-sitetot-k"><T k={`bc.op.n.${it.k}`} d={it.label} /></span>
                </div>
              </div>
            ))}
          </div>
        </B>
        <B
          id="installed"
          label="What gets installed"
          view={
            editable ? (
              <ViewSwitch
                field={`bcOpHw.${id}`}
                position="relative mx-0.5"
                hover="!opacity-100"
                label="Pictures shown"
                options={[['condensed', 'Condensed'], ['large', 'Large']] as const}
                value={hwSize}
                onChange={setHwSize}
              />
            ) : null
          }
        >
          <p className="bc-eyebrow bc-gray"><T k={k('installed')} d="What gets installed" /></p>
          {scope === 'rm' ? (
            <div className={`bc-op-hws bc-op-hws-2 bc-op-hw-${hwSize}`}>{[hw('sensor'), hw('edge')]}</div>
          ) : scope === 'ec' ? (
            <div className={`bc-op-hws bc-op-hws-ec bc-op-hw-${hwSize}`}>{hw('ble')}{or}{hw('inov')}</div>
          ) : (
            <div className={`bc-op-hws bc-op-hws-both bc-op-hw-${hwSize}`}>
              {hw('sensor')}
              {hw('edge')}
              <span className="bc-op-hwplus" aria-hidden="true">+</span>
              {hw('ble')}
              {or}
              {hw('inov')}
            </div>
          )}
        </B>
        {pilot ? (
          <B id="pilot" label="The pilot">
            <p className="bc-eyebrow bc-gray"><T k={k('pilot')} d="The pilot · {months} months" v={{ months: String(pilot.months) }} /></p>
            <div className="bc-card bc-op-pcost">
              <div>
                <span><T k="bc.op.p.install" d="Installation" /></span>
                <b><CallOut k={`${id}.pilot.install`}>{usd(pilot.install)}</CallOut></b>
                <small><T k="bc.op.p.install.sub" d={pilot.creditPct > 0 ? `one-time, ${Math.round(pilot.creditPct * 100)}% credited` : 'one-time'} /></small>
              </div>
              <div>
                <span><T k="bc.op.p.fees" d="Monthly fees" /></span>
                <b><CallOut k={`${id}.pilot.fees`}>{pilot.monthly > 0 ? `${money(pilot.monthly)} / mo` : usd(0)}</CallOut></b>
                <small><T k="bc.op.p.fees.sub" d="during the pilot" /></small>
              </div>
              <div className="bc-op-pcost-tot">
                <span><T k="bc.op.p.total" d="Total pilot cost" /></span>
                <b><CallOut k={`${id}.pilot.total`}>{usd(pilot.total)}</CallOut></b>
                <small><T k="bc.op.p.total.sub" d={pilot.total > 0 ? 'everything paid during the pilot' : 'no one-time or monthly fees'} /></small>
              </div>
            </div>
          </B>
        ) : null}
        {tableShown ? (
          <B id="pilottable" label="Pilot community table" onRemove={hideTable}>
            <div className="bc-op-ptbl">{pilotTable}</div>
          </B>
        ) : null}
        <B id="pricing" label="Pricing">
          <p className="bc-eyebrow bc-gray">
            <T k={k(pilot ? 'pricing.after' : 'pricing')} d={pilot ? 'Pricing after the pilot' : two ? 'Pricing by hardware option' : 'Pricing'} />
          </p>
          {showP && table('p')}
          {showP && showS && (
            <div className="bc-op-or" aria-hidden="true">
              <span><T k="bc.op.or" d="or" /></span>
            </div>
          )}
          {showS && table('s')}
          <p className="bc-op-fn"><T k={k('foot')} d={foot} /></p>
        </B>
        {!single ? (
          <B id="options" label="Select an option">
            <p className="bc-eyebrow bc-gray"><T k={k('options')} d="Select an option" /></p>
            {pillBar && (
              <div className="bc-op-pbar" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {(['ble', 'inov'] as const).map((s) => (
                  <Fragment key={s}>{pill(s)}</Fragment>
                ))}
              </div>
            )}
            <div className="bc-op-cards" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
              {opts.map((o) => (
                <div key={o.key} className={`bc-op-oc bc-op-oc-${o.sys ?? 'rm'}`}>
                  <p className="bc-op-ot">
                    <span className="bc-op-cb" aria-hidden="true" />
                    <T k={`bc.op.opt.${pillBar ? 'bar' : scope}.${o.key}`} d={optName(o)} />
                    {/* Phones: the cards stack under no pill bar, so each names its system. */}
                    {pillBar && o.sys && <span className="bc-op-ot-sys">· {SYS_WORD[o.sys]}</span>}
                  </p>
                  <b><CallOut k={`${id}.opt.${o.key}.up`}>{usd(o.t.upfront)}</CallOut></b>
                  <span className="bc-op-ou"><T k="bc.op.upfront" d="upfront" /></span>
                  <b><CallOut k={`${id}.opt.${o.key}.mo`}>{money(o.t.monthly)}</CallOut></b>
                  <span className="bc-op-ou"><T k="bc.op.permonth" d="per month" /></span>
                </div>
              ))}
            </div>
          </B>
        ) : null}
        <B id="fine" label="Fine print">
          <p className="bc-op-fine">
            <T k={k('fine')} d="Budgetary estimate for planning, based on the scope above. Not a binding order; final pricing is confirmed in a formal quote. Includes training, support, device monitoring, and end-of-life replacement of network infrastructure." />
          </p>
        </B>
      </Blocks>
    </div>
  );
}
