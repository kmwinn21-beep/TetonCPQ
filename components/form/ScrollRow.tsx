'use client';

/**
 * A row of buttons that, on phones, scrolls sideways instead of making the page wider: no scrollbar, and a ‹ / ›
 * at each end while there's more that way (the buttons slide under them). Wider screens: a plain row.
 */
import { useEffect, useRef, useState } from 'react';

export function ScrollRow({ children, className = '', label }: { children: React.ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [children]);
  const go = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const chevron = (dir: -1 | 1, on: boolean) => (
    <div
      className={`sm:hidden pointer-events-none absolute inset-y-0 ${dir < 0 ? 'left-0 bg-gradient-to-r pr-6' : 'right-0 bg-gradient-to-l pl-6'} from-teton-almost-white from-55% to-teton-almost-white/0 flex items-center transition-opacity duration-200 motion-reduce:transition-none ${on ? 'opacity-100' : 'opacity-0'}`}
      aria-hidden={!on}
    >
      <button
        type="button"
        tabIndex={on ? 0 : -1}
        className={`w-8 h-8 rounded-full bg-white border border-teton-pale-gray shadow-sm flex items-center justify-center text-teton-dark-gray ${on ? 'pointer-events-auto' : ''}`}
        onClick={() => go(dir)}
        aria-label={dir < 0 ? 'Show earlier buttons' : 'Show more buttons'}
      >
        <svg className={`w-4 h-4 ${dir < 0 ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
  return (
    <div className={`relative min-w-0 ${className}`} role="group" aria-label={label}>
      <div ref={ref} className="flex items-start gap-2 max-sm:overflow-x-auto no-scrollbar max-sm:[&>*]:flex-none max-sm:[&>*]:whitespace-nowrap">
        {children}
      </div>
      {chevron(-1, edge.left)}
      {chevron(1, edge.right)}
    </div>
  );
}
