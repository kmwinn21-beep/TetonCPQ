'use client';

/**
 * The customer's estimated resource allocation: which of their roles take
 * part in each implementation stage, for how many hours, doing what. Shown on
 * the proposal as its own section, "[Company] Estimated Resource Allocation".
 */
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { allocationTable, fmtHours, normalizeResources } from '@/lib/quote/resources';
import { Section } from '@/components/form/fields';
import { ResourcesEditor } from '@/components/implementation/ResourcesEditor';
import type { SectionProps } from './sections';

export function ResourcesSection(_props: SectionProps) {
  const { control } = useFormContext<QuoteDraft>();
  const plan = useWatch({ control, name: 'implementationPlan' });
  const company = useWatch({ control, name: 'customerName' }) || 'Customer';
  const resources = normalizeResources(useWatch({ control, name: 'resources' }));
  const t = allocationTable(resources, plan);
  return (
    <Section
      id="resources"
      title="Estimated Resource Allocation"
      description={`Who at ${company} takes part in each implementation stage, for roughly how many hours, and what they do. Each role is listed once. Shown on the proposal as “${company} Estimated Resource Allocation”.`}
      summary={t.rows.length ? `${t.rows.length} ${t.rows.length === 1 ? 'role' : 'roles'} · ${fmtHours(t.total)}` : 'None yet'}
    >
      <Controller control={control} name="resources" render={({ field }) => <ResourcesEditor resources={field.value ?? []} plan={plan} onChange={field.onChange} />} />
    </Section>
  );
}
