'use client';

import { useState } from 'react';
import { Collapse } from '@/components/form/fields';
import Link from 'next/link';
import type { ModelInputs, ModelResult } from '@/lib/model';
import type { PriceBook } from '@/lib/pricing/catalog';
import { previewTotals, type PreviewTotals } from '@/lib/quote/previewTotals';
import type { VersionSummary } from '@/lib/data/quotes';
import type { QuoteDraft } from '@/lib/quote/draft';
import { count, dateLabel, usd } from '@/lib/format';


/** A titled block of label / value rows in the live preview. */
function Rows({ title, tag, rows }: { title: string; tag?: string; rows: Array<[string, string, boolean?]> }) {
  return (
    <div className="pt-3 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-teton-ui-gray mb-1.5">
        {title}
        {tag && <span className="ml-1.5 normal-case tracking-normal font-normal">{tag}</span>}
      </p>
      <dl className="space-y-1.5">
        {rows.map(([label, value, total]) => (
          <div key={label} className={`flex items-baseline justify-between gap-3 ${total ? 'border-t border-teton-off-white pt-1.5' : ''}`}>
            <dt className={`text-xs ${total ? 'font-semibold text-teton-ink' : 'text-teton-dark-gray'}`}>{label}</dt>
            <dd className={`text-sm tabular-nums text-right ${total ? 'font-semibold' : 'font-medium'}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The totals from the business case as the inputs change: the investment table
 * (every row, even ones removed from a proposal), Edge units and sensors, and
 * the pilot's cost table.
 */
export function KpiPreview({ result, error, draft, inputs, book }: { result: ModelResult | null; error: string | null; draft?: QuoteDraft; inputs?: ModelInputs | null; book?: PriceBook }) {
  if (error) return <div className="card text-sm"><p className="font-medium">Can’t calculate yet</p><p className="text-teton-ui-gray mt-1">{error}</p></div>;
  if (!result || !draft || !inputs || !book) return null;
  let t: PreviewTotals | null = null;
  try {
    t = previewTotals(draft, inputs, result, book);
  } catch {
    t = null; // a half-entered draft
  }
  if (!t) return null;
  const mo = (n: number) => `${usd(n)} / mo`;
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">Live preview</h2>
        <span className="text-xs text-teton-ui-gray">{result.roiCase.charAt(0).toUpperCase() + result.roiCase.slice(1)} case</span>
      </div>
      <div className="divide-y divide-teton-off-white [&>*]:pb-3 [&>*:last-child]:pb-0">
        <Rows title="Scope" rows={[['Edge units', count(t.scope.edgeUnits)], ['Sensors', count(t.scope.sensors)], ['Additional sensors', count(t.scope.additionalSensors)]]} />
        {t.capex && (
          <Rows
            title="Investment"
            tag={t.opex ? '· CapEx' : undefined}
            rows={[
              ['Base packages', usd(t.capex.basePackages)],
              ...(t.capex.ecallUnits > 0 ? ([['E-Call units (E-Call only)', usd(t.capex.ecallUnits)]] as Array<[string, string]>) : []),
              ['Additional sensors', usd(t.capex.sensors)],
              ['One-time equipment cost', usd(t.capex.equipment), true],
              ['Software & services', mo(t.capex.softwareMonthly)],
              ...(t.capex.renewals > 0 ? ([['E-Call renewals', usd(t.capex.renewals)]] as Array<[string, string]>) : []),
              [`${t.capex.years === 4 ? 'Four' : t.capex.years}-year cost of ownership`, usd(t.capex.ownership), true],
            ]}
          />
        )}
        {t.opex && (
          <Rows
            title="Investment"
            tag={t.capex ? '· OpEx' : undefined}
            rows={[
              ['Installation', usd(t.opex.install)],
              ['Additional sensors', usd(t.opex.sensors)],
              ['Monthly cost', mo(t.opex.monthly)],
              ['Total Year 1 investment', usd(t.opex.year1), true],
            ]}
          />
        )}
        {t.finish && <Rows title="Concealed finish" tag="· optional" rows={[['Add-on for the deal', t.finish.low === t.finish.high ? usd(t.finish.low) : `${usd(t.finish.low)}–${usd(t.finish.high)}`]]} />}
        {t.pilot && (
          <Rows
            title="Pilot"
            tag={`· ${t.pilot.months} months`}
            rows={[
              ['Installation', usd(t.pilot.install)],
              ['Additional sensors', usd(t.pilot.sensors)],
              ['Monthly fees', usd(t.pilot.fees)],
              ['Total pilot cost', usd(t.pilot.total), true],
            ]}
          />
        )}
      </div>
    </div>
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg className={`w-4 h-4 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
  </svg>
);

/** One saved version: its name, when and by whom, and (opened) what changed from the version before it. */
function VersionCard({ v, quoteId, active, busy, onMakeActive, onDelete }: { v: VersionSummary; quoteId: number; active: boolean; busy: boolean; onMakeActive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const name = v.changeNote || `v${v.versionNo}`;
  return (
    <li className={`rounded-lg border ${active ? 'border-teton-green/60 bg-teton-pale-green/30' : 'border-teton-off-white'} text-sm`}>
      <button type="button" className="w-full flex items-start gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="mt-0.5"><Chevron open={open} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-medium truncate">{name}</span>
            {v.changeNote && <span className="text-xs text-teton-ui-gray">v{v.versionNo}</span>}
            {active && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-teton-pale-green text-[#256B41]">Active</span>}
          </span>
          <span className="block text-xs text-teton-ui-gray">
            {dateLabel(v.savedAt)}{v.savedByName ? ` · ${v.savedByName}` : ''}
            {v.status === 'sent' && ` · sent ${dateLabel(v.sentAt)}${v.sentByName ? ` by ${v.sentByName}` : ''}`}
          </span>
        </span>
      </button>
      <Collapse open={open}>
        <div className="px-3 pb-2.5 pl-9">
          {v.changes.length ? (
            <ul className="list-disc pl-4 space-y-0.5 text-xs text-teton-dark-gray">
              {v.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-teton-ui-gray">{v.versionNo === 1 ? 'The first version.' : 'No list of changes for this version.'}</p>
          )}
          <p className="text-xs text-teton-ui-gray tabular-nums mt-2">
            Year 1 investment {usd(v.totalInvestment12, { compact: true })} · net {usd(v.netBenefit12, { compact: true })}
          </p>
        </div>
      </Collapse>
      <div className="flex items-center gap-3 px-3 pb-2 pl-9 text-xs">
        <Link className="underline" href={`/quotes/${quoteId}/results?v=${v.id}`}>Results</Link>
        <Link className="underline" href={`/proposal/${v.id}`}>Proposal</Link>
        <span className="ml-auto flex items-center gap-1.5">
          {!active && (
            <button type="button" className="btn-secondary py-0.5 px-2 text-xs" disabled={busy} onClick={onMakeActive}>
              Make Active
            </button>
          )}
          <button type="button" className="py-0.5 px-2 text-xs rounded-md text-teton-dark-gray hover:bg-teton-red/20 hover:text-teton-ink" disabled={busy} onClick={() => setConfirming(true)} aria-label={`Delete ${name}`}>
            Delete
          </button>
        </span>
      </div>
      <Collapse open={confirming}>
        <div className="mx-3 mb-2.5 rounded-md bg-teton-red/20 px-2.5 py-2 text-xs" role="alertdialog" aria-label={`Delete ${name}?`}>
          <p>
            Delete <b>{name}</b>{v.changeNote ? ` (v${v.versionNo})` : ''} for good? Its inputs, results and proposal are removed and can’t be recovered.
          </p>
          <div className="flex gap-2 mt-1.5">
            <button type="button" className="py-1 px-2.5 rounded-md bg-[#C2412D] text-white font-medium disabled:opacity-50" disabled={busy} onClick={() => { setConfirming(false); onDelete(); }}>
              Delete version
            </button>
            <button type="button" className="py-1 px-2.5 rounded-md hover:bg-white/60" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Collapse>
    </li>
  );
}

/**
 * Version History: every saved version, the active one first. Collapsed to its
 * header (with the count and the active version) until opened.
 */
export function VersionsPanel({ versions, quoteId, activeId, busy = false, onMakeActive, onDelete }: { versions: VersionSummary[]; quoteId: number; activeId?: number | null; busy?: boolean; onMakeActive?: (v: VersionSummary) => void; onDelete?: (v: VersionSummary) => void }) {
  const [open, setOpen] = useState(false);
  const active = versions.find((v) => v.id === activeId) ?? null;
  const ordered = active ? [active, ...versions.filter((v) => v !== active)] : versions;
  return (
    <div className="card">
      <button type="button" className="w-full flex items-center gap-2 text-left" aria-expanded={open} aria-controls="version-history" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <h2 className="text-sm font-semibold flex-1">Version History</h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-teton-off-white text-teton-dark-gray whitespace-nowrap">
          {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          {active && ` · v${active.versionNo} active`}
        </span>
      </button>
      <Collapse open={open} id="version-history">
        <div className="pt-3">
          {versions.length === 0 ? (
            <p className="text-sm text-teton-ui-gray">None yet. “Save version” freezes exactly what you see — inputs and results — so you can always answer “what did we send them?”</p>
          ) : (
            <ul className="space-y-2">
              {ordered.map((v) => (
                <VersionCard key={v.id} v={v} quoteId={quoteId} active={v.id === activeId} busy={busy} onMakeActive={() => onMakeActive?.(v)} onDelete={() => onDelete?.(v)} />
              ))}
            </ul>
          )}
        </div>
      </Collapse>
    </div>
  );
}
