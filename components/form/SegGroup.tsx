'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A row of mutually exclusive buttons with a selection pill that slides to the
 * chosen one. Children are plain buttons marked aria-checked / aria-pressed
 * (or radio inputs followed by their label span); the chosen one should have
 * no background of its own, since the pill supplies it.
 */
export function SegGroup({ className = '', thumbClass = 'bg-brand-secondary', label, role = 'radiogroup', children }: { className?: string; thumbClass?: string; label?: string; role?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"], input:checked + *');
      if (!on) return setBox(null);
      const a = el.getBoundingClientRect();
      const b = on.getBoundingClientRect();
      setBox((prev) => {
        const next = { left: b.left - a.left - el.clientLeft, top: b.top - a.top - el.clientTop, width: b.width, height: b.height };
        return prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    place();
    // Animate only after the first placement, so the pill doesn't slide in on load.
    const t = requestAnimationFrame(() => setReady(true));
    const ro = new ResizeObserver(place);
    ro.observe(el);
    const mo = new MutationObserver(place);
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'aria-pressed', 'class'] });
    el.addEventListener('change', place);
    return () => {
      cancelAnimationFrame(t);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('change', place);
    };
  });

  return (
    <div ref={ref} role={role} aria-label={label} className={`relative isolate ${className}`}>
      {box && (
        <span
          aria-hidden="true"
          className={`absolute -z-10 rounded-md shadow-sm ${thumbClass} ${ready ? 'transition-all duration-200 ease-out motion-reduce:transition-none' : ''}`}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      {children}
    </div>
  );
}
