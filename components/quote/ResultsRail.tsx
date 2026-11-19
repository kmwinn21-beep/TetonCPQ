'use client';

import Link from 'next/link';
import type { ModelInputs, ModelResult } from '@/lib/model';
import type { PriceBook } from '@/lib/pricing/catalog';
import { previewTotals, type PreviewTotals } from '@/lib/quote/previewTotals';
import type { GuardrailResult, Severity } from '@/lib/pricing/guardrails';
import type { VersionSummary } from '@/lib/data/quotes';
import type { QuoteDraft } from '@/lib/quote/draft';
import { count, dateLabel, usd } from '@/lib/format';

const APPROVER: Record<string, string> = { deal_desk: 'Deal Desk', vp_sales_or_ceo: 'VP Sales or CEO (written)' };
const SEVERITY_CLASS: Record<Severity, string> = { info: 'badge-purple', warning: 'badge-yellow', approval: 'badge-red' };
const SEVERITY_LABEL: Record<Severity, string> = { info: 'Note', warning: 'Warning', approval: 'Needs approval' };

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

/** Pricing checks that need attention (approvals, warnings), when there are any. */
export function GuardrailPanel({ g }: { g: GuardrailResult | null }) {
  if (!g || !g.findings.length) return null;
  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-3">Pricing checks</h2>
      <ul className="space-y-2">
        {g.findings.map((f) => (
          <li key={f.code + f.message} className="text-sm">
            <span className={SEVERITY_CLASS[f.severity]}>{SEVERITY_LABEL[f.severity]}</span>
            <p className="mt-1">{f.message}</p>
            {f.requiredApprover && <p className="text-xs text-teton-dark-gray mt-0.5">Approver: {APPROVER[f.requiredApprover]}. Recorded on save; not blocking yet.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VersionsPanel({ versions, quoteId }: { versions: VersionSummary[]; quoteId: number }) {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-3">Saved versions</h2>
      {versions.length === 0 ? (
        <p className="text-sm text-teton-ui-gray">None yet. “Save version” freezes exactly what you see — inputs and results — so you can always answer “what did we send them?”</p>
      ) : (
        <ul className="divide-y divide-teton-off-white">
          {versions.map((v) => (
            <li key={v.id} className="py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">v{v.versionNo}</span>
                <span className="text-xs text-teton-ui-gray">{dateLabel(v.savedAt)}{v.savedByName ? ` · ${v.savedByName}` : ''}</span>
              </div>
              {v.changeNote && <p className="text-teton-dark-gray">{v.changeNote}</p>}
              <p className="text-xs text-teton-ui-gray tabular-nums">
                Year 1 investment {usd(v.totalInvestment12, { compact: true })} · net {usd(v.netBenefit12, { compact: true })} · {v.rung ? `rung ${v.rung}` : 'below ladder'}
                {v.status === 'sent' && ` · sent ${dateLabel(v.sentAt)}${v.sentByName ? ` by ${v.sentByName}` : ''}`}
              </p>
              <p className="text-xs mt-0.5 space-x-3">
                <Link className="underline" href={`/quotes/${quoteId}/results?v=${v.id}`}>Results</Link>
                <Link className="underline" href={`/proposal/${v.id}`}>Proposal</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
