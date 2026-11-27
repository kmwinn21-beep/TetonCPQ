'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A drawer that folds to a slim strip on the right (clicking outside it) instead of closing, so the work in it is
 * kept. `leaving` is true while the full drawer slides out before the strip shows.
 */
export function useFold(ms = 200) {
  const [folded, setFolded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);
  const fold = useCallback(() => {
    if (t.current) return;
    setLeaving(true);
    t.current = setTimeout(() => {
      t.current = null;
      setLeaving(false);
      setFolded(true);
    }, ms);
  }, [ms]);
  const unfold = useCallback(() => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
    setLeaving(false);
    setFolded(false);
  }, []);
  return { folded, leaving, fold, unfold };
}

/** Calls `onOutside` for a pointer press outside `ref` (and outside anything matching `ignore`), while `active`. */
export function useOutsidePress(ref: React.RefObject<HTMLElement>, active: boolean, onOutside: () => void, ignore = '[data-fold-ignore],[role="dialog"],[role="listbox"]') {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el || !el.isConnected || ref.current?.contains(el) || el.closest(ignore)) return;
      cb.current();
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [active, ref, ignore]);
}

/** The strip a folded drawer leaves behind: « to open it again, and what's in it. */
export function FoldStrip({ label, dot, onExpand, className = '' }: { label: string; dot?: boolean; onExpand: () => void; className?: string }) {
  return (
    <div className={`w-11 flex-shrink-0 border-l border-[#ECE8DF] bg-white flex flex-col items-center gap-3.5 pt-4 drawer-in ${className}`}>
      <button type="button" onClick={onExpand} aria-label={`Open ${label} again`} title="Open again" className="relative w-[30px] h-[30px] rounded-[9px] border border-[#E4E0D6] grid place-items-center text-[#5A6270] hover:bg-[#F6F3EE]">
        «
        {dot && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E39B2D] ring-2 ring-white" aria-label="Unsaved changes" />}
      </button>
      <button type="button" onClick={onExpand} className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold uppercase tracking-[.14em] text-[#8A919C] max-h-[60vh] truncate hover:text-teton-ink">
        {label}
      </button>
    </div>
  );
}
