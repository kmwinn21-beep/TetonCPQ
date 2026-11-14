'use client';

/**
 * "[Company] Estimated Resource Allocation" on the proposal: hours by role
 * and stage (stage colors as in the chart), totals, then what each role does
 * in each stage. On the proposal page an "Edit roles & hours" button opens
 * the inputs panel; changes are unsaved until "Save all changes".
 */
import type { QuoteDraft } from '@/lib/quote/draft';
import { normalizePlan } from '@/lib/quote/implementationPlan';
import { allocationTable } from '@/lib/quote/resources';
import { stageColor } from '@/components/implementation/ImplementationGantt';
import { T } from './EditableText';
import { useWhatIf } from './WhatIf';

const num = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));

export function ResourcesView({ draft }: { draft: QuoteDraft }) {
  const w = useWhatIf();
  const plan = normalizePlan(draft.implementationPlan);
  const t = allocationTable(draft.resources ?? [], plan);
  return (
    <div className="relative">
      {w?.enabled && (
        <button
          type="button"
          data-edit-ui
          className="m-inline no-print absolute -top-11 right-0 rounded-md border border-teton-pale-gray bg-white px-2 py-0.5 text-[11px] text-teton-dark-gray hover:text-teton-ink"
          onClick={() => w.select('resources.edit', 'Estimated resource allocation')}
        >
          Edit roles &amp; hours
        </button>
      )}
      <p className="text-[12.5px] text-teton-dark-gray mb-2">
        <T k="resources.intro" d="Estimated hours from your team by stage. Teton’s implementation and customer success team leads each stage." />
      </p>
      <table className="m-table w-full text-[12px] tabular-nums">
        <thead>
          <tr className="border-b border-teton-pale-gray text-[10.5px] text-teton-dark-gray">
            <th className="text-left font-medium py-1.5 pr-2 align-bottom w-[26%]">Role</th>
            {t.stages.map((s) => (
              <th key={s.id} className="text-right font-medium py-1.5 px-1.5 align-bottom leading-tight">
                <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: stageColor(s.id, plan.order) }} aria-hidden="true" />
                {s.name}
              </th>
            ))}
            <th className="text-right font-medium py-1.5 pl-1.5 align-bottom">Total</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.id} className="border-b border-teton-off-white">
              <td className="py-1.5 pr-2">{r.role}</td>
              {t.stages.map((s) => (
                <td key={s.id} data-label={s.name} className={`py-1.5 px-1.5 text-right ${s.id in r.hours ? '' : 'm-hide text-teton-light-gray'}`}>
                  {s.id in r.hours ? num(r.hours[s.id]) : '–'}
                </td>
              ))}
              <td className="py-1.5 pl-1.5 text-right font-semibold" data-label="Total">{num(r.total)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-teton-ink font-semibold">
            <td className="py-1.5 pr-2">Total hours</td>
            {t.stages.map((s) => (
              <td key={s.id} className="py-1.5 px-1.5 text-right" data-label={s.name}>
                {num(t.stageTotals[s.id])}
              </td>
            ))}
            <td className="py-1.5 pl-1.5 text-right" data-label="Total">{num(t.total)}</td>
          </tr>
        </tbody>
      </table>
      {t.rows.some((r) => r.notes.some((n) => n.note)) && (
        <div className="m-cols-1 mt-3 columns-2 gap-6">
          {t.rows
            .filter((r) => r.notes.some((n) => n.note))
            .map((r) => (
              <div key={r.id} className="break-inside-avoid mb-2.5 text-[11.5px]">
                <p className="text-[12px] font-semibold">{r.role}</p>
                <ul className="list-disc pl-4 text-teton-dark-gray">
                  {r.notes
                    .filter((n) => n.note)
                    .map((n) => (
                      <li key={n.stage}>
                        <i>{n.stage}:</i> {n.note}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** On the proposal page, when the deal has no roles yet: a way to start one. */
export function AddResourcesLink() {
  const w = useWhatIf();
  if (!w?.enabled) return null;
  return (
    <button type="button" data-edit-ui className="no-print mt-3 text-[12px] text-teton-dark-gray hover:text-teton-ink hover:underline" onClick={() => w.select('resources.edit', 'Estimated resource allocation')}>
      + Add your team’s estimated hours (resource allocation)
    </button>
  );
}
