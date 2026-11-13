'use client';

/**
 * Click-to-edit wording on the proposal. Every piece of prose is a <T> with a
 * key and a default template. Calculated values inside a sentence are {tokens}
 * rendered as locked chips: they can be deleted with the text around them,
 * but not retyped. Edits save for this version a moment after typing stops.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fillTemplate, renderText, tidy, type TextEdits } from '@/lib/proposal/text';

type SaveState = 'saved' | 'saving' | 'error';

interface Ctx {
  editable: boolean;
  edits: TextEdits;
  set: (key: string, template: string | null) => void;
  resetAll: () => void;
  state: SaveState;
  error: string | null;
}

const ProposalTextContext = createContext<Ctx>({ editable: false, edits: {}, set: () => {}, resetAll: () => {}, state: 'saved', error: null });
export const useProposalText = () => useContext(ProposalTextContext);

export function ProposalTextProvider({ versionId, initial, editable = true, children }: { versionId: number; initial: TextEdits; editable?: boolean; children: React.ReactNode }) {
  const [edits, setEdits] = useState<TextEdits>(initial);
  const [state, setState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(edits);

  const save = useCallback(
    async (next: TextEdits) => {
      setState('saving');
      try {
        const res = await fetch(`/api/versions/${versionId}/text`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edits: next }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Could not save the wording');
        // Only mark saved if nothing changed while this request was in flight.
        if (latest.current === next) setState('saved');
        setError(null);
      } catch (e) {
        setState('error');
        setError(e instanceof Error ? e.message : 'Could not save the wording');
      }
    },
    [versionId],
  );

  const schedule = useCallback(
    (next: TextEdits) => {
      latest.current = next;
      setEdits(next);
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next), 500);
    },
    [save],
  );

  const set = useCallback(
    (key: string, template: string | null) => {
      const next = { ...latest.current };
      if (template == null) delete next[key];
      else next[key] = template;
      schedule(next);
    },
    [schedule],
  );
  const resetAll = useCallback(() => schedule({}), [schedule]);

  // Don't lose a pending save when the tab closes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  const value = useMemo(() => ({ editable, edits, set, resetAll, state, error }), [editable, edits, set, resetAll, state, error]);
  return <ProposalTextContext.Provider value={value}>{children}</ProposalTextContext.Provider>;
}

/** Read an edited element back into a template: locked value chips become {token}. */
function serialize(el: HTMLElement): string {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? '';
    else if (n instanceof HTMLElement) {
      if (n.dataset.token) out += `{${n.dataset.token}}`;
      else if (n.tagName === 'BR') out += ' ';
      else out += serialize(n);
    }
  });
  return out;
}

/**
 * Editable text. `d` is the default wording; `v` holds the values for its
 * {tokens}. Without a provider (or when not editable) it renders plain text.
 */
export function T({ k, d, v }: { k: string; d: string; v?: Record<string, string> }) {
  const { editable, edits, set } = useProposalText();
  // Bumped to throw away typing (Escape) by remounting the element.
  const [rev, setRev] = useState(0);
  const template = edits[k] ?? d;
  const vars = v ?? {};
  if (!editable) return <>{renderText(template, vars)}</>;

  const segments = fillTemplate(template, vars);
  return (
    <span
      // Remount whenever the stored wording changes, so React and the edited DOM never disagree.
      key={`${rev}:${template}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Edit text"
      spellCheck
      data-edit-key={k}
      data-placeholder="Add text"
      className="proposal-editable rounded-sm outline-none decoration-dotted underline-offset-4 hover:bg-teton-pale-yellow/60 focus:bg-teton-pale-yellow/60 focus:ring-2 focus:ring-brand-accent/60 empty:inline-block empty:min-w-[3rem] empty:before:content-[attr(data-placeholder)] empty:before:text-teton-light-gray print:empty:before:content-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          // Discard this round of typing.
          const el = e.currentTarget as HTMLElement;
          el.dataset.cancel = '1';
          el.blur();
        }
      }}
      onPaste={(e) => {
        // Plain text only: no fonts or links from wherever it was copied.
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
        if (next === template) return;
        set(k, next === d ? null : next);
      }}
    >
      {segments.map((s, i) =>
        'token' in s ? (
          <span key={i} contentEditable={false} data-token={s.token} className="proposal-value rounded-sm" title="Calculated value — can be removed, not changed">
            {s.value}
          </span>
        ) : (
          s.text
        ),
      )}
    </span>
  );
}
