'use client';

/**
 * A call-out figure in a dark card that the rep can replace with a value of
 * their own (kept as wording, so it doesn't follow the inputs) and put back
 * to the calculated one. Shown in the card's own font and size.
 */
import { useRef, useState } from 'react';
import { useProposalText } from './EditableText';

export function CallOut({ k, children }: { k: string; children: React.ReactNode }) {
  const { editable, edits, set } = useProposalText();
  const key = `cv.${k}`.replace(/[^a-z0-9_.-]+/gi, '_').slice(0, 80);
  const custom = edits[key];
  const [editing, setEditing] = useState(false);
  const shown = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState('');

  if (!editable) return <>{custom ?? children}</>;

  const start = () => {
    setDraft(custom ?? shown.current?.innerText.trim() ?? '');
    setEditing(true);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    });
  };
  const finish = (save: boolean) => {
    const text = (input.current?.innerText ?? '').replace(/\s+/g, ' ').trim();
    setEditing(false);
    if (!save) return;
    const calculated = shown.current?.innerText.trim();
    set(key, !text || (!custom && text === calculated) ? null : text.slice(0, 40));
  };

  return (
    <span className="relative inline-block group/co">
      {editing ? (
        <span
          ref={input}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Custom value"
          className="outline-none rounded-sm ring-2 ring-brand-accent/70 px-0.5 -mx-0.5"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finish(true);
            }
            if (e.key === 'Escape') finish(false);
          }}
          onBlur={() => finish(true)}
        >
          {draft}
        </span>
      ) : custom != null ? (
        <span title="Custom value">{custom}</span>
      ) : (
        <span ref={shown}>{children}</span>
      )}
      {/* The calculated value, measured for comparison while a custom one shows. */}
      {custom != null && !editing && <span ref={shown} className="hidden">{children}</span>}
      {!editing && (
        <span data-edit-ui className="no-print absolute -top-3 left-0 z-10 hidden group-hover/co:flex items-center gap-1 whitespace-nowrap" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
          <button type="button" className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold leading-tight text-teton-ink shadow hover:bg-teton-off-white" onClick={start}>
            {custom != null ? 'Edit custom value' : 'Custom value'}
          </button>
          {custom != null && (
            <button type="button" className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold leading-tight text-teton-ink shadow hover:bg-teton-off-white" onClick={() => set(key, null)} title="Back to the calculated value">
              ↺ Revert to default
            </button>
          )}
        </span>
      )}
    </span>
  );
}
