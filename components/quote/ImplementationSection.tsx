'use client';

/**
 * Implementation plan inputs: how long each stage from contract to go-live
 * takes for this deal, and how much it overlaps the stage before. The plan is
 * worked back from each pilot community's go-live date; this section checks
 * the earliest one against today.
 */
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { defaultPlan, earliestGoLive, normalizePlan, scheduleFor, STAGES, weekLabel, weeksToGoLive } from '@/lib/quote/implementationPlan';
import { pilotPlan } from '@/lib/quote/pilotGoLives';
import { Section } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import { STAGE_COLORS, longDate } from '@/components/implementation/ImplementationGantt';
import type { SectionProps } from './sections';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ImplementationSection({ inputs, result }: SectionProps) {
  const { control, setValue, getValues } = useFormContext<QuoteDraft>();
  const raw = useWatch({ control, name: 'implementationPlan' });
  const plan = normalizePlan(raw);
  const draft = getValues();
  // Re-read the parts the pilot dates depend on so this section updates with them.
  useWatch({ control, name: ['communities', 'schedule.withPilot', 'implementation.desiredGoLive'] });

  const total = weeksToGoLive(plan);
  const example = scheduleFor('2027-01-04', plan); // only for week labels, date-independent
  const groups = pilotPlan(draft, inputs?.schedule.startDate ?? null, (result?.cashFlow.communities ?? []).map((c) => c.goLiveMonth));
  const first = groups[0];
  const today = todayIso();
  const late = first && first.schedule.contractStart < today;
  const changed = JSON.stringify(plan) !== JSON.stringify(defaultPlan());

  return (
    <Section
      id="implplan"
      title="Implementation timeline"
      description="How long each stage takes for this deal. Worked back from each pilot community’s go-live date; overlap starts a stage before the previous one ends."
      summary={[
        `${total} weeks from contract start to go-live`,
        changed ? 'custom stage lengths' : 'standard stage lengths',
        first ? `contract by ${longDate(first.schedule.contractStart)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      aside={
        changed ? (
          <button type="button" className="btn-ghost" onClick={() => setValue('implementationPlan', defaultPlan(), { shouldDirty: true })}>
            Reset to standard
          </button>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[440px]">
          <thead>
            <tr className="border-b border-teton-off-white text-left">
              <th className="text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray py-2 pr-2">Stage</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray py-2 px-2">Length</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray py-2 px-2">Overlaps previous</th>
              <th className="text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray py-2 pl-2">Runs</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s, i) => {
              const sched = example.stages[i];
              const std = s.weeks !== plan[s.key].weeks || s.overlapWeeks !== plan[s.key].overlapWeeks;
              return (
                <tr key={s.key} className="border-b border-teton-off-white">
                  <td className="py-2 pr-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-[-1px]" style={{ background: STAGE_COLORS[s.key] }} />
                    <span className="font-medium">{s.name}</span>
                    {std && <span className="hint block ml-[18px] mt-0">Standard: {s.weeks} wk{s.canOverlap && s.overlapWeeks ? `, ${s.overlapWeeks} wk overlap` : ''}</span>}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <Controller
                        control={control}
                        name={`implementationPlan.${s.key}.weeks`}
                        render={({ field }) => (
                          <NumInput className="w-16 text-right" value={field.value ?? s.weeks} onChange={(v) => field.onChange(v ?? 0)} min={0} max={52} aria-label={`${s.name} length in weeks`} />
                        )}
                      />
                      <span className="text-teton-ui-gray">wk</span>
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    {s.canOverlap ? (
                      <div className="flex items-center gap-1.5">
                        <Controller
                          control={control}
                          name={`implementationPlan.${s.key}.overlapWeeks`}
                          render={({ field }) => (
                            <NumInput
                              className="w-14 text-right"
                              value={field.value ?? s.overlapWeeks}
                              onChange={(v) => field.onChange(v ?? 0)}
                              min={0}
                              max={plan[STAGES[i - 1].key].weeks}
                              aria-label={`${s.name} overlap with ${STAGES[i - 1].name} in weeks`}
                            />
                          )}
                        />
                        <span className="text-teton-ui-gray">wk</span>
                      </div>
                    ) : (
                      <span className="text-teton-light-gray">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-teton-dark-gray whitespace-nowrap">{weekLabel(sched)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mt-4">
        <div>
          <span className="label">Contract start to go-live</span>
          <div className="derived">{total} weeks</div>
        </div>
        <div>
          <span className="label">Earliest pilot go-live</span>
          <div className="derived">{first ? `${longDate(first.goLive)}${first.names.length > 1 ? ` (${first.names.length} sites)` : ''}` : '—'}</div>
        </div>
        <div>
          <span className="label">Contracting must start by</span>
          <div className="derived">{first ? longDate(first.schedule.contractStart) : '—'}</div>
        </div>
      </div>
      {!first && <p className="hint mt-2">The timeline is drawn for pilot communities. Mark a community as a pilot site (with a pilot in Timeline) to see its dates here and in the results and proposal.</p>}
      {late && (
        <p role="status" className="mt-3 rounded-lg bg-teton-pale-yellow px-3 py-2 text-sm">
          For a <b>{longDate(first.goLive)}</b> go-live, Evaluation &amp; Contracting needed to start by <b>{longDate(first.schedule.contractStart)}</b>. Shorten a stage, or move the pilot go-live to{' '}
          <b>{longDate(earliestGoLive(today, plan))}</b> or later.
        </p>
      )}
    </Section>
  );
}
