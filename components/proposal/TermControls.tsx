'use client';

/**
 * Terms / Notes on the proposal. On the proposal page each term can be
 * reworded inline (figures stay locked), removed, or a note added; these
 * change the deal's terms, so they're unsaved input changes until "Save all
 * changes". Elsewhere (e.g. the sent copy) it's a plain list.
 */
import { addTerm, editTerm, removeTerm, resolveTerms } from '@/lib/quote/terms';
import { renderText } from '@/lib/proposal/text';
import type { QuoteDraft } from '@/lib/quote/draft';
import { TemplateInput } from '@/components/form/TemplateInput';
import { useWhatIf } from './WhatIf';

export function TermsList({ draft }: { draft: QuoteDraft }) {
  const w = useWhatIf();
  const terms = resolveTerms(draft);
  const editable = !!w?.enabled;
  const shown = editable ? terms : terms.filter((t) => renderText(t.template, t.vars).trim());
  return (
    <div>
      <ul className="list-disc pl-5 space-y-0.5 text-[12px]">
        {shown.map((t, i) => (
          <li key={t.id} className="relative group/term pr-6">
            {editable ? (
              <>
                <TemplateInput
                  variant="inline"
                  template={t.template.trim()}
                  vars={t.vars}
                  ariaLabel={`Term ${i + 1}`}
                  placeholder="Type a note"
                  autoFocus={t.custom && !t.template.trim()}
                  onCommit={(next) => w!.setChange('terms', editTerm(draft, t.id, next))}
                />
                <button
                  type="button"
                  data-edit-ui
                  className="no-print absolute right-0 top-0 hidden group-hover/term:flex w-4 h-4 items-center justify-center rounded-full bg-teton-near-black text-white text-[10px]"
                  title="Remove this term (an unsaved change until you save)"
                  aria-label={`Remove term ${i + 1}`}
                  onClick={() => w!.setChange('terms', removeTerm(draft, t.id))}
                >
                  ✕
                </button>
              </>
            ) : (
              renderText(t.template, t.vars)
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <button type="button" data-edit-ui className="no-print mt-1.5 text-[12px] text-teton-dark-gray hover:text-teton-ink underline-offset-2 hover:underline" onClick={() => w!.setChange('terms', addTerm(draft).terms)}>
          + Add a note
        </button>
      )}
    </div>
  );
}
