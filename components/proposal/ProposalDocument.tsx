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
import { TetonMark } from '@/components/AppShell';
import type { StoredOutputs } from '@/lib/data/quotes';
import type { PriceLine } from '@/lib/pricing/lines';
import { basePackageRows, conversionCreditOf, sensorRows, unitPriceText } from '@/lib/pricing/capex';
import { rangeText } from '@/lib/pricing/finish';
import type { QuoteDraft } from '@/lib/quote/draft';
import { count, dateLabel, monthName, usd } from '@/lib/format';
import { QuarterlyWaterfall } from './QuarterlyWaterfall';
import { T } from './EditableText';
import { renderText } from '@/lib/proposal/text';
import { ProposalSections, RTable, RTbody, V } from './ProposalSections';
import { ImplementationGantt } from '@/components/implementation/ImplementationGantt';
import { weekLabel } from '@/lib/quote/implementationPlan';
import { AddStageCard, RemoveStageButton, StageName } from './StageControls';
import { TermsList } from './TermControls';
import { AddResourcesLink, ResourcesView } from './ResourcesView';
import { buildProposalData } from './proposalData';


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
      <TetonMark className="w-7 h-7" />
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
  const { year1, capexCf, finish, start, kp, cf, sel, capex, showOpex, showCapex, units, anyPilot, pilotEndMonth, credit, oneTime, pilotMonthly, serviceMonthly, termTotal, perCommunity, rateSummary, costOfMoney, caseName, pilotLength, termLength, outcomes, cards, benefits, assumptions, nCommunities, pilots, hasResources, goLivePhrase } = buildProposalData(draft, outputs, lines);
  const implementationBody = pilots.length ? (
    <>
      <p className="mb-3 text-[14px] max-w-prose">
        <T
          k="impl.intro"
          d={pilots.length === 1 ? 'Preliminary path to achieve {goLive} go-live.' : 'Preliminary path to achieve {goLive} go-lives.'}
          v={{ goLive: goLivePhrase }}
        />
      </p>
      <ImplementationGantt groups={pilots} labelWidth={170} />
      {/* Removable (and addable back) like a figure: some proposals want only the timeline. */}
      <V k="stageCards" label="Stage descriptions (implementation)" block>
      <div className="m-stack grid grid-cols-3 gap-2.5 mt-4">
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
      </V>
      {!hasResources && <AddResourcesLink />}
    </>
  ) : null;

  // Terms / Notes: the deal's terms (standard ones written from the deal, plus the rep's edits and notes).
  const termsBody = <TermsList draft={draft} />;

  const summaryBody = (
    <>

      <div className="m-stack grid grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.key} className="rounded-lg border border-teton-pale-gray p-3">
            <p className="text-[11px] font-medium text-teton-dark-gray">
              <T k={`${card.key}.label`} d={card.label} />
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              <V k={card.fig ?? `${card.key}.value`} label={`${card.label} figure`}>{card.value}</V>
            </p>
            <p className="text-[11px] text-teton-dark-gray mt-1 leading-snug">
              <T k={card.noteKey ?? `${card.key}.note`} d={card.note} v={card.v} />
            </p>
          </div>
        ))}
      </div>
    </>
  );

  const scopeBody = (
    <>


      {showOpex && (
        <div className={`m-stack grid gap-3 mb-4 avoid-break ${anyPilot ? 'grid-cols-4' : 'grid-cols-3'}`}>
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

      <RTable className="m-table w-full">
        <thead className="text-[11px] text-teton-dark-gray text-left">
          <tr className="border-b border-teton-pale-gray">
            <th className="font-medium py-1.5"><T k="table.community" d="Community" /></th>
            <th className="font-medium py-1.5 px-2 text-right"><T k="table.beds" d="Beds" /></th>
            <th className="font-medium py-1.5 px-2"><T k="table.goLive" d="Go-live" /></th>
            {showOpex && <th className="font-medium py-1.5 px-2 text-right"><T k="table.monthly" d="Monthly" /></th>}
            {showOpex && <th className="font-medium py-1.5 pl-2 text-right"><T k="table.oneTime" d="One-time" /></th>}
          </tr>
        </thead>
        <RTbody id="sdcomm" name="Communities" outside className="tabular-nums">
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
              <td className="py-1.5 px-2 text-right whitespace-nowrap" data-label="Beds">
                {count(row.units)}
                {row.mix && <span className="block text-[11px] text-teton-dark-gray">{row.mix}</span>}
              </td>
              <td className="py-1.5 px-2 whitespace-nowrap" data-label="Go-live">
                {row.goLive}
                {row.pilotUntil && <span className="block text-[11px] text-teton-dark-gray">pilot to {row.pilotUntil}</span>}
              </td>
              {showOpex && (
                <td className="py-1.5 px-2 text-right whitespace-nowrap" data-label="Monthly">
                  {usd(row.monthly)}
                  {row.pilotMonthly != null && <span className="block text-[11px] text-teton-dark-gray">{usd(row.pilotMonthly)} during pilot</span>}
                  {row.introMonthly != null && <span className="block text-[11px] text-teton-dark-gray">{usd(row.introMonthly)} first {row.introMonths} mo</span>}
                </td>
              )}
              {showOpex && (
                <td className="py-1.5 pl-2 text-right whitespace-nowrap" data-label="One-time">
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
            <td className="py-2 px-2 text-right" data-label="Beds">{count(units)}</td>
            <td className="py-2 px-2 m-hide" />
            {showOpex && <td className="py-2 px-2 text-right" data-label="Monthly">{usd(serviceMonthly)}</td>}
            {showOpex && <td className="py-2 pl-2 text-right" data-label="One-time">{usd(oneTime)}</td>}
          </tr>
        </RTbody>
      </RTable>
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
            <T k="capex.title" d={showOpex ? 'Alternative: equipment purchase (capital expenditure)' : 'Equipment purchase (capital expenditure)'} />
          </p>
          <p className="text-[12px] text-teton-dark-gray mt-1">
            <T
              k="capex.note"
              d="You buy the hardware: title passes to you at install and the embedded license is perpetual. No separate installation charge and no license fee."
            />
          </p>
          <RTable className="w-full mt-3 tabular-nums">
            <RTbody id="sdcapex" name="Equipment purchase" outside>
              {basePackageRows(capex).map((r) => (
                <tr key={r.key} className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k={`capex.base.${r.ecall}`} d={r.ecall === 'none' ? 'Base packages (Edge unit + sensor, installed)' : r.ecall === 'ble' ? 'Base packages with E-Call (pendant and wall-mount pendant)' : 'Base packages with Inovonics E-Call (pendant and wall-mount pull cord)'} />
                    <span className="block text-[11px] text-teton-dark-gray">
                      {count(r.beds)} beds × {unitPriceText(r, (n) => usd(n))}{r.credit ? '*' : ''}
                    </span>
                  </td>
                  <td className="py-1 text-right"><V k={`capex.base.${r.key}.value`} label={`${r.label} amount`}>{usd(r.total)}</V></td>
                </tr>
              ))}
              {sensorRows(capex).map((r) => (
                <tr key={r.key} className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k="capex.sensors" d="Additional sensors" />
                    <span className="block text-[11px] text-teton-dark-gray">
                      {count(r.units)} × {unitPriceText(r, (n) => usd(n))}{r.credit ? '*' : ''}
                    </span>
                  </td>
                  <td className="py-1 text-right"><V k={r.credit ? 'capex.sensors.credited.value' : 'capex.sensors.value'} label="Additional sensors amount">{usd(r.total)}</V></td>
                </tr>
              ))}
              {(capex.ecallDevices ?? 0) > 0 && (
                <tr className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k="capex.ecallDevices" d="Extra E-Call devices" />
                    <span className="block text-[11px] text-teton-dark-gray">
                      {count(capex.ecallDevices ?? 0)} × {usd(Math.max(0, Number(capex.pricing.ecallDevice) || 0))} · beyond one per room or common area
                    </span>
                  </td>
                  <td className="py-1 text-right"><V k="capex.ecallDevices.value" label="Extra E-Call devices amount">{usd(capex.ecallDeviceCost ?? 0)}</V></td>
                </tr>
              )}
              {(capex.items ?? []).filter((x) => x.billing !== 'monthly').map((x) => (
                <tr key={x.sku} className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k={`capex.item.${x.sku}`} d={x.name} />
                    <span className="block text-[11px] text-teton-dark-gray">
                      {count(x.qty)} × {usd(x.perUnit)}
                      {x.billing === 'years' ? `, again every ${x.everyYears ?? 1} years` : ''}
                    </span>
                  </td>
                  <td className="py-1 text-right"><V k={`capex.item.${x.sku}.value`} label={`${x.name} amount`}>{usd(x.total)}</V></td>
                </tr>
              ))}
              <tr className="font-semibold border-b border-teton-off-white">
                <td className="py-1.5"><T k="capex.price" d="One-time equipment cost, paid at install" /></td>
                <td className="py-1.5 text-right"><V k="capex.price.value" label="One-time equipment cost">{usd(capex.equipment)}</V></td>
              </tr>
              {capex.softwareBilling === 'upfront' ? (
                <tr className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k="capex.softwareUpfront" d="Software and services, paid upfront" />
                    <span className="block text-[11px] text-teton-dark-gray">Covers the {capex.ownershipMonths / 12}-year ownership period, paid at install</span>
                  </td>
                  <td className="py-1 text-right"><V k="capex.softwareUpfront.value" label="Software and services, upfront">{usd(capex.softwareUpfront ?? 0)}</V></td>
                </tr>
              ) : (
                <tr className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k="capex.software" d="Software and services, billed monthly" />
                    <span className="block text-[11px] text-teton-dark-gray">
                      {count(capex.beds)} beds × {usd(capex.pricing.softwareRate)} per month
                    </span>
                  </td>
                  <td className="py-1 text-right"><V k="capex.software.value" label="Software and services per month">{usd(capex.softwareMonthly)} / mo</V></td>
                </tr>
              )}
              {(capex.items ?? []).filter((x) => x.billing === 'monthly').map((x) => (
                <tr key={x.sku} className="border-b border-teton-off-white">
                  <td className="py-1">
                    <T k={`capex.item.${x.sku}`} d={x.name} />
                    <span className="block text-[11px] text-teton-dark-gray">
                      {count(x.qty)} × {usd(x.perUnit, { cents: !Number.isInteger(x.perUnit) })} per month
                    </span>
                  </td>
                  <td className="py-1 text-right"><V k={`capex.item.${x.sku}.value`} label={`${x.name} per month`}>{usd(x.total)} / mo</V></td>
                </tr>
              ))}
              {(capex.itemsRenewals ?? 0) > 0 && (
                <tr className="border-b border-teton-off-white">
                  <td className="py-1"><T k="capex.itemRenewals" d="Item renewals within {years} years" v={{ years: String(capex.ownershipMonths / 12) }} /></td>
                  <td className="py-1 text-right"><V k="capex.itemRenewals.value" label="Item renewals amount">{usd(capex.itemsRenewals ?? 0)}</V></td>
                </tr>
              )}
              {capex.renewals > 0 && (
                <tr className="border-b border-teton-off-white">
                  <td className="py-1"><T k="capex.renewals" d="E-Call renewals within {years} years" v={{ years: String(capex.ownershipMonths / 12) }} /></td>
                  <td className="py-1 text-right"><V k="capex.renewals.value" label="E-Call renewals amount">{usd(capex.renewals)}</V></td>
                </tr>
              )}
              {(capex.pilotFees ?? 0) > 0 && (
                <tr className="border-b border-teton-off-white">
                  <td className="py-1"><T k="capex.pilotFees" d="Pilot fees (pilot communities, before the purchase)" /></td>
                  <td className="py-1 text-right"><V k="capex.pilotFees.value" label="Pilot fees amount">{usd(capex.pilotFees ?? 0)}</V></td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-1.5">
                  <T k="capex.ownership" d="{years}-year cost of ownership" v={{ years: capex.ownershipMonths === 48 ? 'Four' : String(capex.ownershipMonths / 12) }} />
                  <span className="block text-[11px] font-normal text-teton-dark-gray">
                    <T k="capex.ownershipNote" d="Equipment plus software over the hardware’s useful life" />
                  </span>
                </td>
                <td className="py-1.5 text-right"><V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal)}</V></td>
              </tr>
            </RTbody>
          </RTable>
          {conversionCreditOf(capex) > 0 && (
            <p className="text-[11px] text-teton-dark-gray mt-1">
              <T k="capex.conversionNote" d="*A {credit} conversion credit has been applied to the per bed Base Package and per additional sensor." v={{ credit: usd(conversionCreditOf(capex)) }} />
            </p>
          )}
          <p className="text-[12px] text-teton-dark-gray mt-2">
            <T k="capex.share" d="About {share} of the total cost is equipment, treated as a capital purchase rather than an operating expense." v={{ share: `${Math.round(capex.equipmentShare * 100)}%` }} />
          </p>
        </div>
      )}

      {finish.concealed && (
        <div className="rounded-lg border border-teton-pale-gray p-4 mt-4 avoid-break">
          <p className="font-semibold">
            <T k="finish.title" d="Optional: concealed installation" />
          </p>
          <p className="text-[12px] text-teton-dark-gray mt-1">
            <T k="finish.note" d="Standard installation (cables in a slim white raceway) is included. For a concealed finish, cables run behind the wall and/or above the ceiling with no raceway showing. Priced per room, pending the site survey; not included in the figures above. Painting is not included." />
          </p>
          <RTable className="w-full mt-3 tabular-nums">
            <RTbody id="sdfinish" name="Concealed installation" outside>
              <tr className="border-b border-teton-off-white">
                <td className="py-1"><T k="finish.price" d="Concealed installation, per room" /></td>
                <td className="py-1 text-right"><V k="finish.price.value" label="Concealed installation per room">{rangeText(finish.low, finish.high, usd)}</V></td>
              </tr>
              <tr className="border-b border-teton-off-white">
                <td className="py-1"><T k="finish.payable" d="Payable after the {credit} standard value is credited" v={{ credit: usd(finish.credit) }} /></td>
                <td className="py-1 text-right"><V k="finish.net.value" label="Concealed installation payable per room">{rangeText(finish.netLow, finish.netHigh, usd)}</V></td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1.5"><T k="finish.total" d="For {rooms} rooms" v={{ rooms: count(finish.rooms) }} /></td>
                <td className="py-1.5 text-right"><V k="finish.total.value" label="Concealed installation total">{rangeText(finish.totalLow, finish.totalHigh, usd)}</V></td>
              </tr>
            </RTbody>
          </RTable>
        </div>
      )}

    </>
  );

  const roiBody = (
    <>

      <div className="m-stack grid grid-cols-[1.15fr_1fr] gap-6 avoid-break">
        <div>
          <p className="text-[12px] text-teton-dark-gray mb-2">
            <T k="roi.benefitsNote" d="Annual benefit once every community is live ({case} case)" v={{ case: caseName }} />
          </p>
          <RTable className="w-full tabular-nums">
            <RTbody id="sdroi" name="Annual benefit" outside>
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
            </RTbody>
          </RTable>
        </div>
        <div>
          <p className="text-[12px] text-teton-dark-gray mb-2">
            <T k="roi.meansNote" d="What that means each year" />
          </p>
          <div className="m-stack grid grid-cols-2 gap-2">
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
            k={capexCf ? 'roi.waterfallNote.capex' : 'roi.waterfallNote'}
            d={`Net benefit by quarter after ${capexCf ? 'the equipment purchase (paid at install) and software & services' : 'Teton fees and installation'}, discounted at your {costOfMoney} cost of money. Each bar starts where the last one ended${year1.payback ? '; the program pays for itself in {payback} and stays paid for.' : '.'}`}
            v={{ costOfMoney, payback: `month ${year1.payback ?? ''}` }}
          />
        </p>
        <QuarterlyWaterfall discountedNet={year1.discountedNet} startDate={start} paybackMonth={year1.payback} pilotEndMonth={pilotEndMonth} />
      </div>
    </>
  );

  const assumptionsBody = (
    <>

      <div className="m-stack grid grid-cols-2 gap-x-8">
        {assumptions.map(([key, l, v]) => (
          <div key={key} className="avoid-break flex justify-between gap-3 border-b border-teton-off-white py-1">
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
          ...(implementationBody ? { implementation: { body: implementationBody, className: 'print-own-page' } } : {}),
          ...(hasResources ? { resources: { body: <ResourcesView draft={draft} />, className: 'avoid-break', titleVars: { company: draft.customerName || 'Customer' } } } : {}),
          // Tall sections may continue onto the next page (their tables, cards and chart stay whole) instead of jumping.
          roi: { body: roiBody },
          assumptions: { body: assumptionsBody },
        }}
      />




    </article>
  );
}
