'use client';

/**
 * Implementation plan inputs: how long each stage from contract to go-live
 * takes for this deal, and how much it overlaps the stage before. The plan is
 * worked back from each pilot community's go-live date; this section checks
 * the earliest one against today.
 */
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { defaultPlan, earliestGoLive, isDefaultPlan, normalizePlan, weeksToGoLive } from '@/lib/quote/implementationPlan';
import { pilotPlan } from '@/lib/quote/pilotGoLives';
import { Section } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import { longDate } from '@/components/implementation/ImplementationGantt';
import { StagesEditor } from '@/components/implementation/StagesEditor';
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
  const groups = pilotPlan(draft, inputs?.schedule.startDate ?? null, (result?.cashFlow.communities ?? []).map((c) => c.goLiveMonth));
  const first = groups[0];
  const today = todayIso();
  const late = first && first.schedule.contractStart < today;
  const firstStage = plan.stages[plan.order[0]]?.name ?? 'The first stage';
  const changed = !isDefaultPlan(plan);

  return (
    <Section
      id="implplan"
      title="Implementation timeline"
      description="The stages from contract to go-live for this deal: change lengths and overlaps, remove or reorder stages, or add your own. Worked back from each pilot community’s go-live date."
      summary={[
        `${total} weeks from contract start to go-live`,
        changed ? `${plan.order.length} stages, customized` : 'standard stages',
        first ? `start by ${longDate(first.schedule.contractStart)}` : null,
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
      <Controller control={control} name="implementationPlan" render={({ field }) => <StagesEditor plan={field.value} onChange={field.onChange} />} />

      <div className="grid gap-4 sm:grid-cols-3 mt-4">
        <div>
          <span className="label">First stage to go-live</span>
          <div className="derived">{total} weeks</div>
        </div>
        <div>
          <span className="label">Earliest pilot go-live</span>
          <div className="derived">{first ? `${longDate(first.goLive)}${first.names.length > 1 ? ` (${first.names.length} sites)` : ''}` : '—'}</div>
        </div>
        <div>
          <span className="label">{firstStage} must start by</span>
          <div className="derived">{first ? longDate(first.schedule.contractStart) : '—'}</div>
        </div>
      </div>
      {!first && <p className="hint mt-2">The timeline is drawn for pilot communities. Mark a community as a pilot site (with a pilot in Timeline) to see its dates here and in the results and proposal.</p>}
      {late && (
        <p role="status" className="mt-3 rounded-lg bg-teton-pale-yellow px-3 py-2 text-sm">
          For a <b>{longDate(first.goLive)}</b> go-live, {firstStage} needed to start by <b>{longDate(first.schedule.contractStart)}</b>. Shorten a stage, or move the pilot go-live to{' '}
          <b>{longDate(earliestGoLive(today, plan))}</b> or later.
        </p>
      )}
    </Section>
  );
}
