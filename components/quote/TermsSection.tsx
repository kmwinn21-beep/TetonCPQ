'use client';

/**
 * Terms / Notes: the bullet points under Terms on the proposal. Starts with
 * the standard terms written from the deal; reword, remove, reorder or add
 * notes. Grey chips are figures from the deal, kept up to date.
 */
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { addTerm, editTerm, isStandardTerms, itemLabel, moveTerm, removedTerms, removeTerm, resolveTerms, restoreTerm, type ListKind, type TermsSetting } from '@/lib/quote/terms';
import { ResetDefaults, Section } from '@/components/form/fields';
import { TemplateInput } from '@/components/form/TemplateInput';
import type { SectionProps } from './sections';

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink disabled:opacity-30 disabled:hover:bg-transparent';

export function TermsSection(_props: SectionProps) {
  const { control, getValues, setValue } = useFormContext<QuoteDraft>();
  // Terms read pricing, pilot and community settings; re-render when any of them change.
  useWatch({ control, name: ['terms', 'nextSteps', 'commercial', 'schedule', 'communities'] });
  const draft = getValues();
  const terms = resolveTerms(draft);
  const steps = resolveTerms(draft, 'nextSteps');
  const standard = isStandardTerms(draft) && isStandardTerms(draft, 'nextSteps');

  return (
    <Section
      id="terms"
      title="Terms / Notes"
      description="The bullet points under Terms on the proposal, and the Next Steps on the business case. Reword, remove, reorder or add your own. Grey figures come from the deal and stay up to date."
      summary={`${terms.length} ${terms.length === 1 ? 'term' : 'terms'} · ${steps.length} next ${steps.length === 1 ? 'step' : 'steps'} · ${standard ? 'standard' : 'customized'}`}
      reset={
        !standard ? (
          <ResetDefaults
            onClick={() => {
              if (!window.confirm('Put the terms and next steps back to the defaults? Your notes and wording changes will be removed.')) return;
              setValue('terms', null, { shouldDirty: true });
              setValue('nextSteps', null, { shouldDirty: true });
            }}
          />
        ) : undefined
      }
    >
      <h3 className="text-sm font-semibold mb-2">Terms</h3>
      <ItemList kind="terms" />
      <h3 className="text-sm font-semibold mt-6 mb-2">Next steps</h3>
      <ItemList kind="nextSteps" />
    </Section>
  );
}

/** One editable list: the terms or the next steps. */
function ItemList({ kind }: { kind: ListKind }) {
  const { getValues, setValue } = useFormContext<QuoteDraft>();
  const draft = getValues();
  const terms = resolveTerms(draft, kind);
  const removed = removedTerms(draft, kind);
  const noun = kind === 'terms' ? 'term' : 'step';
  const [focusId, setFocusId] = useState<string | null>(null);
  const set = (t: TermsSetting | null) => setValue(kind, t, { shouldDirty: true });
  return (
    <>
      <ol className="divide-y divide-teton-off-white border-y border-teton-off-white">
        {terms.map((t, i) => (
          <li key={t.id} className="flex items-start gap-2 py-2" data-term={t.id}>
            <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-teton-ink flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <TemplateInput
                template={t.template.trim()}
                vars={t.vars}
                ariaLabel={t.custom ? `${kind === 'terms' ? 'Note' : 'Step'} ${i + 1}` : `${itemLabel(kind, t.id)} ${noun}`}
                placeholder={kind === 'terms' ? 'Type a note for the proposal' : 'Type a next step'}
                autoFocus={focusId === t.id}
                onCommit={(next) => {
                  setFocusId(null);
                  set(editTerm(getValues(), t.id, next, kind));
                }}
              />
              <p className="hint mt-0.5">
                {t.custom ? (kind === 'terms' ? 'Your note' : 'Your step') : `${itemLabel(kind, t.id)} · ${t.edited ? 'reworded' : 'standard wording'}`}
                {t.edited && (
                  <>
                    {' · '}
                    <button type="button" className="underline" onClick={() => set(editTerm(getValues(), t.id, t.standard!, kind))}>
                      Use standard wording
                    </button>
                  </>
                )}
              </p>
            </div>
            <span className="flex items-center pt-1">
              <button type="button" className={iconBtn} disabled={i === 0} onClick={() => set(moveTerm(getValues(), t.id, -1, kind))} aria-label={`Move ${noun} ${i + 1} up`} title="Move up">
                ↑
              </button>
              <button type="button" className={iconBtn} disabled={i === terms.length - 1} onClick={() => set(moveTerm(getValues(), t.id, 1, kind))} aria-label={`Move ${noun} ${i + 1} down`} title="Move down">
                ↓
              </button>
              <button type="button" className={iconBtn} onClick={() => set(removeTerm(getValues(), t.id, kind))} aria-label={`Remove ${noun} ${i + 1}`} title={t.custom ? 'Remove this note' : 'Remove this term (you can add it back)'}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      {terms.length === 0 && <p className="hint mt-2">{kind === 'terms' ? 'No terms: the proposal’s Terms / Notes section will be empty.' : 'No next steps: the business case’s Next Steps section will be empty.'}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          onClick={() => {
            const r = addTerm(getValues(), '', kind);
            setFocusId(r.id);
            set(r.terms);
          }}
        >
          {kind === 'terms' ? '+ Add a note' : '+ Add a step'}
        </button>
        {removed.length > 0 && <span className="text-xs text-teton-ui-gray">Add back:</span>}
        {removed.map((id) => (
          <button key={id} type="button" className="badge-gray hover:bg-teton-pale-gray" onClick={() => set(restoreTerm(getValues(), id, kind))}>
            + {itemLabel(kind, id)}
          </button>
        ))}
      </div>
    </>
  );
}
