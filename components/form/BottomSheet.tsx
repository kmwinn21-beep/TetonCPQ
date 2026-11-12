'use client';

/**
 * A full-height sheet that slides up from the bottom of the viewport (phones),
 * and slides back down when closed. Content stays rendered during the exit
 * animation. The page behind doesn't scroll while it's open.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DURATION_MS = 300;

export function BottomSheet({ open, onClose, label, title, children }: { open: boolean; onClose: () => void; label: string; title?: React.ReactNode; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  // Keep the last content so it doesn't vanish mid-slide when the parent clears it on close.
  const last = useRef(children);
  if (open) last.current = children;

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: mount off-screen first, then transition in.
      let id2 = 0;
      const id = requestAnimationFrame(() => (id2 = requestAnimationFrame(() => setShown(true))));
      return () => {
        cancelAnimationFrame(id);
        cancelAnimationFrame(id2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), DURATION_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`absolute inset-0 bg-teton-ink/40 transition-opacity duration-300 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
      <div
        className={`absolute inset-x-0 bottom-0 h-[100dvh] flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex-none flex items-center gap-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] border-b border-teton-off-white">
          <div className="flex-1 min-w-0 text-sm font-semibold truncate">{title}</div>
          <button type="button" className="btn-primary py-1.5" onClick={onClose}>Done</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{last.current}</div>
      </div>
    </div>,
    document.body,
  );
}
