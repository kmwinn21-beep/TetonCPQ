'use client';

/**
 * Terms / Notes: the bullet points under Terms on the proposal. Starts with
 * the standard terms written from the deal; reword, remove, reorder or add
 * notes. Grey chips are figures from the deal, kept up to date.
 */
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { addTerm, editTerm, isStandardTerms, moveTerm, removedTerms, removeTerm, resolveTerms, restoreTerm, TERM_LABEL, type StandardTermId, type TermsSetting } from '@/lib/quote/terms';
import { Section } from '@/components/form/fields';
import { TemplateInput } from '@/components/form/TemplateInput';
import type { SectionProps } from './sections';

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink disabled:opacity-30 disabled:hover:bg-transparent';

export function TermsSection(_props: SectionProps) {
  const { control, getValues, setValue } = useFormContext<QuoteDraft>();
  // Terms read pricing, pilot and community settings; re-render when any of them change.
  useWatch({ control, name: ['terms', 'commercial', 'schedule', 'communities'] });
  const draft = getValues();
  const terms = resolveTerms(draft);
  const removed = removedTerms(draft);
  const standard = isStandardTerms(draft);
  const [focusId, setFocusId] = useState<string | null>(null);
  const set = (t: TermsSetting | null) => setValue('terms', t, { shouldDirty: true });

  return (
    <Section
      id="terms"
      title="Terms / Notes"
      description="The bullet points under Terms on the proposal. Reword, remove, reorder or add notes. Grey figures come from the deal and stay up to date."
      summary={`${terms.length} ${terms.length === 1 ? 'term' : 'terms'} · ${standard ? 'standard' : 'customized'}`}
      aside={
        !standard ? (
          <button type="button" className="btn-ghost" onClick={() => window.confirm('Put the terms back to the standard ones? Your notes and wording changes will be removed.') && set(null)}>
            Reset to standard
          </button>
        ) : undefined
      }
    >
      <ol className="divide-y divide-teton-off-white border-y border-teton-off-white">
        {terms.map((t, i) => (
          <li key={t.id} className="flex items-start gap-2 py-2" data-term={t.id}>
            <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-teton-ink flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <TemplateInput
                template={t.template.trim()}
                vars={t.vars}
                ariaLabel={t.custom ? `Note ${i + 1}` : `${TERM_LABEL[t.id as StandardTermId]} term`}
                placeholder="Type a note for the proposal"
                autoFocus={focusId === t.id}
                onCommit={(next) => {
                  setFocusId(null);
                  set(editTerm(getValues(), t.id, next));
                }}
              />
              <p className="hint mt-0.5">
                {t.custom ? 'Your note' : `${TERM_LABEL[t.id as StandardTermId]} · ${t.edited ? 'reworded' : 'standard wording'}`}
                {t.edited && (
                  <>
                    {' · '}
                    <button type="button" className="underline" onClick={() => set(editTerm(getValues(), t.id, t.standard!))}>
                      Use standard wording
                    </button>
                  </>
                )}
              </p>
            </div>
            <span className="flex items-center pt-1">
              <button type="button" className={iconBtn} disabled={i === 0} onClick={() => set(moveTerm(getValues(), t.id, -1))} aria-label={`Move term ${i + 1} up`} title="Move up">
                ↑
              </button>
              <button type="button" className={iconBtn} disabled={i === terms.length - 1} onClick={() => set(moveTerm(getValues(), t.id, 1))} aria-label={`Move term ${i + 1} down`} title="Move down">
                ↓
              </button>
              <button type="button" className={iconBtn} onClick={() => set(removeTerm(getValues(), t.id))} aria-label={`Remove term ${i + 1}`} title={t.custom ? 'Remove this note' : 'Remove this term (you can add it back)'}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      {terms.length === 0 && <p className="hint mt-2">No terms: the proposal’s Terms / Notes section will be empty.</p>}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          onClick={() => {
            const r = addTerm(getValues());
            setFocusId(r.id);
            set(r.terms);
          }}
        >
          + Add a note
        </button>
        {removed.length > 0 && <span className="text-xs text-teton-ui-gray">Add back:</span>}
        {removed.map((id) => (
          <button key={id} type="button" className="badge-gray hover:bg-teton-pale-gray" onClick={() => set(restoreTerm(getValues(), id))}>
            + {TERM_LABEL[id]}
          </button>
        ))}
      </div>
    </Section>
  );
}
