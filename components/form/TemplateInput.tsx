'use client';

/**
 * A one-line text box whose figures are locked chips: type around them or
 * delete them, but not change them. Commits the wording (with {tokens}) on
 * blur or Enter; Escape throws the typing away.
 */
import { useEffect, useRef, useState } from 'react';
import { fillTemplate, tidy } from '@/lib/proposal/text';
import { serialize } from '@/components/proposal/EditableText';

export function TemplateInput({
  template,
  vars,
  onCommit,
  ariaLabel,
  placeholder = 'Type here',
  autoFocus = false,
  variant = 'field',
}: {
  template: string;
  vars: Record<string, string>;
  onCommit: (template: string) => void;
  ariaLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** "field": looks like an input box (deal page). "inline": proposal text that highlights on hover. */
  variant?: 'field' | 'inline';
}) {
  const [rev, setRev] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.focus();
    const r = document.createRange();
    r.selectNodeContents(ref.current);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, [autoFocus]);

  const cls =
    variant === 'field'
      ? 'block w-full min-h-[38px] rounded-lg border border-teton-pale-gray bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent'
      : 'proposal-editable rounded-sm outline-none hover:bg-teton-pale-yellow/60 focus:bg-teton-pale-yellow/60 focus:ring-2 focus:ring-brand-accent/60';
  return (
    <span
      ref={ref}
      key={`${rev}:${template}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      className={`${cls} empty:before:content-[attr(data-placeholder)] empty:before:text-teton-light-gray print:empty:before:content-none`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          (e.currentTarget as HTMLElement).dataset.cancel = '1';
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, tidy(e.clipboardData.getData('text/plain')));
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        if (el.dataset.cancel) {
          delete el.dataset.cancel;
          setRev((r) => r + 1);
          return;
        }
        const next = tidy(serialize(el));
        if (next !== tidy(template)) onCommit(next);
      }}
    >
      {fillTemplate(template, vars).map((s, i) =>
        'token' in s ? (
          <span key={i} contentEditable={false} data-token={s.token} className={`proposal-value rounded-sm ${variant === 'field' ? 'bg-teton-off-white px-0.5' : ''}`} title="Calculated from the deal: can be removed, not changed">
            {s.value}
          </span>
        ) : (
          s.text
        ),
      )}
    </span>
  );
}
