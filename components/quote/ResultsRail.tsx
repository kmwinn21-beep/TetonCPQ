'use client';

import Link from 'next/link';
import type { ModelResult } from '@/lib/model';
import { LADDER, type GuardrailResult, type Severity } from '@/lib/pricing/guardrails';
import type { VersionSummary } from '@/lib/data/quotes';
import { dateLabel, multiple, usd } from '@/lib/format';

const APPROVER: Record<string, string> = { deal_desk: 'Deal Desk', vp_sales_or_ceo: 'VP Sales or CEO (written)' };
const SEVERITY_CLASS: Record<Severity, string> = { info: 'badge-purple', warning: 'badge-yellow', approval: 'badge-red' };
const SEVERITY_LABEL: Record<Severity, string> = { info: 'Note', warning: 'Warning', approval: 'Needs approval' };

export function KpiPreview({ result, error }: { result: ModelResult | null; error: string | null }) {
  if (error) return <div className="card text-sm"><p className="font-medium">Can’t calculate yet</p><p className="text-teton-ui-gray mt-1">{error}</p></div>;
  if (!result) return null;
  const k = result.kpis;
  const items: Array<[string, string, string?]> = [
    ['Total Investment — 12 Mo', usd(k.totalInvestment12)],
    ['Net Benefit — 12 Mo', usd(k.netBenefit12)],
    ['Gross Return per $1 Invested', multiple(k.grossReturnPerDollar12)],
    ['Discounted Payback', k.discountedPaybackMonth ? `Month ${k.discountedPaybackMonth}` : `Beyond month ${k.horizonMonths}`],
    ['Run-Rate Annual Net Benefit', usd(k.runRateAnnualNetBenefit, { compact: true })],
    ['Net Benefit / Unit / Month', `${usd(k.netBenefitPerOccupiedUnitMonth)} occ. · ${usd(k.netBenefitPerUnitMonth)} all`],
  ];
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">Live preview</h2>
        <span className="text-xs text-teton-ui-gray">{result.roiCase.charAt(0).toUpperCase() + result.roiCase.slice(1)} case</span>
      </div>
      <dl className="space-y-2.5">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-teton-dark-gray">{label}</dt>
            <dd className={`text-sm font-semibold tabular-nums text-right ${label.startsWith('Net Benefit — ') && k.netBenefit12 < 0 ? 'bg-teton-red/30 rounded px-1' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-teton-ui-gray mt-3">Full results, charts and the “where does this number come from” drill-down come with the results view.</p>
    </div>
  );
}

export function GuardrailPanel({ g }: { g: GuardrailResult | null }) {
  if (!g) return null;
  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-3">Concession ladder</h2>
      <ol className="space-y-1.5">
        {LADDER.map((r) => {
          const current = g.rung === r.rung;
          return (
            <li key={r.rung} className={`rounded-lg px-3 py-2 text-sm ${current ? 'bg-teton-pale-green' : 'text-teton-ui-gray'}`} aria-current={current ? 'step' : undefined}>
              <span className="font-medium text-teton-ink">Rung {r.rung}</span> · {r.title}
              {current && <p className="text-xs text-teton-dark-gray mt-0.5">{r.terms}</p>}
            </li>
          );
        })}
        <li className={`rounded-lg px-3 py-2 text-sm ${g.rung === null ? 'bg-teton-red text-teton-ink' : 'text-teton-ui-gray'}`}>
          <span className="font-medium">Below the ladder</span> · free or deeper-discount pilot
        </li>
      </ol>
      {g.rungDetail && (
        <div className="mt-3">
          <p className="text-xs font-medium text-teton-dark-gray mb-1">Ask for in return</p>
          <ul className="list-disc pl-5 text-sm space-y-0.5">
            {g.rungDetail.ask.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}
      {g.findings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {g.findings.map((f) => (
            <li key={f.code + f.message} className="text-sm">
              <span className={SEVERITY_CLASS[f.severity]}>{SEVERITY_LABEL[f.severity]}</span>
              <p className="mt-1">{f.message}</p>
              {f.requiredApprover && <p className="text-xs text-teton-dark-gray mt-0.5">Approver: {APPROVER[f.requiredApprover]}. Recorded on save; not blocking yet.</p>}
            </li>
          ))}
        </ul>
      )}
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
                12-mo investment {usd(v.totalInvestment12, { compact: true })} · net {usd(v.netBenefit12, { compact: true })} · {v.rung ? `rung ${v.rung}` : 'below ladder'}
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
