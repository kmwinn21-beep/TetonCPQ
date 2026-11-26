'use client';

import { useEffect, useRef, useState } from 'react';

/** True on phone-width screens (below Tailwind's `md`). */
export function usePhone(query = '(max-width: 767px)') {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return m;
}

/**
 * A sheet that slides up from the bottom over a dimmed backdrop (phones). Close it with ✕, the backdrop, Escape, or by
 * dragging the handle (or the header) down. It keeps showing its content while it slides away.
 */
export function SwipeSheet({ open, onClose, eyebrow, title, children }: { open: boolean; onClose: () => void; eyebrow?: string; title: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [up, setUp] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDy(0);
      // Next frame, so it slides in from below.
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setUp(true)));
      return () => cancelAnimationFrame(f);
    }
    setUp(false);
    const t = setTimeout(() => (setMounted(false), setDy(0)), 320);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  if (!mounted) return null;
  const grab = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      start.current = { y: e.clientY, t: Date.now() };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      setDy(Math.max(0, e.clientY - start.current.y));
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!start.current) return;
      const d = Math.max(0, e.clientY - start.current.y);
      const v = d / Math.max(1, Date.now() - start.current.t);
      start.current = null;
      setDragging(false);
      if (d > 110 || (d > 30 && v > 0.6)) onClose();
      else setDy(0);
    },
    onPointerCancel: () => ((start.current = null), setDragging(false), setDy(0)),
  };
  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      <div className={`absolute inset-0 bg-[#0F141C]/40 transition-opacity duration-300 motion-reduce:transition-none ${up ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 h-[90dvh] flex flex-col rounded-t-[20px] bg-[#FBF8F3] shadow-[0_-10px_30px_rgba(0,0,0,.18)] ${dragging ? '' : 'transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none'}`}
        style={{ transform: up ? `translateY(${dy}px)` : 'translateY(100%)' }}
      >
        <div {...grab} className="flex-shrink-0 touch-none select-none cursor-grab active:cursor-grabbing border-b border-[#ECE8DF]">
          <div className="pt-2 pb-1 flex justify-center" aria-hidden="true">
            <span className="w-10 h-[5px] rounded-full bg-[#D4CFC6]" />
          </div>
          <div className="flex items-center gap-3 px-4 pt-1 pb-3">
            <div className="min-w-0 flex-1">
              {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C] truncate">{eyebrow}</p>}
              <b className="block text-[16px] font-semibold truncate">{title}</b>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex-shrink-0 rounded-full bg-[#EEEAE3] text-[15px] text-[#5A6270] grid place-items-center hover:bg-[#E4DFD6]">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 pb-10">{children}</div>
      </div>
    </div>
  );
}
