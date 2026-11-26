'use client';

/**
 * The prospect's table of contents: every page of the proposal, numbered. The page they're on is marked (it follows
 * their scrolling), pages they've passed get a check, and pages with comments show how many (click to read them).
 * Clicking a page glides to it and gives it a short coral pulse so it's clear where they landed.
 *
 * Wide screens (1280px+): a panel on the left that pushes the proposal over, open to begin with. Tablets: the same
 * panel over the proposal. Phones: a bottom sheet that closes, then moves.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useComments } from '@/components/proposal/Comments';

interface Entry {
  id: string;
  title: string;
}
type Mode = 'push' | 'overlay' | 'sheet';
const modeNow = (): Mode => (window.matchMedia('(min-width: 1280px)').matches ? 'push' : window.matchMedia('(min-width: 640px)').matches ? 'overlay' : 'sheet');
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pageEl = (id: string) => document.querySelector<HTMLElement>(`article#proposal [data-bc-page="${CSS.escape(id)}"]`);
const headerH = () => document.querySelector<HTMLElement>('[data-prospect] header')?.offsetHeight ?? 60;

/** The pages, the one in view and the ones passed; and the panel's open state (shared with the header button). */
export function useContents() {
  const [pages, setPages] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('sheet');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const m = modeNow();
    setMode(m);
    setOpen(m === 'push');
    const onResize = () => setMode(modeNow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // The pages as rendered (the ones in this proposal, in order).
  useEffect(() => {
    const art = document.querySelector('article#proposal');
    if (!art) return;
    const read = () => {
      const list = [...art.querySelectorAll<HTMLElement>('[data-bc-page][data-bc-title]')].map((el) => ({ id: el.dataset.bcPage!, title: el.dataset.bcTitle! }));
      setPages((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(art);
    return () => ro.disconnect();
  }, []);
  // Which page is in view: the last one whose top has passed a line a little under the header.
  useEffect(() => {
    if (!pages.length) return;
    let raf = 0;
    const spy = () => {
      raf = 0;
      const line = headerH() + 140;
      let on = pages[0].id;
      for (const p of pages) {
        const el = pageEl(p.id);
        if (el && el.getBoundingClientRect().top <= line) on = p.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) on = pages[pages.length - 1].id;
      setCurrent(on);
      setSeen((s) => {
        const i = pages.findIndex((p) => p.id === on);
        const want = pages.slice(0, i).map((p) => p.id);
        return want.every((id) => s.has(id)) ? s : new Set([...s, ...want]);
      });
    };
    const onScroll = () => (raf ||= requestAnimationFrame(spy));
    spy();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pages]);

  return { pages, current, seen, mode, open, setOpen };
}

/** Glide to a page and pulse it. */
export function goToPage(id: string) {
  const el = pageEl(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - headerH() - 12;
  if (reduced()) return window.scrollTo({ top });
  window.scrollTo({ top, behavior: 'smooth' });
  el.classList.remove('toc-arrive');
  // Pulse once it has (about) arrived.
  window.setTimeout(() => {
    void el.offsetWidth;
    el.classList.add('toc-arrive');
    window.setTimeout(() => el.classList.remove('toc-arrive'), 1200);
  }, 420);
}

export function ContentsButton({ c, className = '' }: { c: ReturnType<typeof useContents>; className?: string }) {
  if (!c.pages.length) return null;
  return (
    <button
      type="button"
      aria-expanded={c.open}
      onClick={() => c.setOpen((o) => !o)}
      className={`${className || 'inline-flex h-9 px-2.5 sm:px-3'} items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-semibold transition-colors duration-200 whitespace-nowrap ${c.open ? 'bg-teton-ink border-teton-ink text-white' : 'bg-white border-[#D5D9DE] text-teton-ink hover:bg-teton-almost-white'}`}
      title="Table of contents"
    >
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
        <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
      </svg>
      <span className="hidden sm:inline">Contents</span>
    </button>
  );
}

export function ContentsPanel({ c }: { c: ReturnType<typeof useContents> }) {
  const comments = useComments();
  const { pages, current, seen, mode, open, setOpen } = c;
  // Keep showing the panel while it slides away.
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [top, setTop] = useState(60);
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => (setShown(false), setLeaving(false)), reduced() ? 0 : 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const h = () => setTop(headerH());
    h();
    const el = document.querySelector('[data-prospect] header');
    const ro = el ? new ResizeObserver(h) : null;
    if (el) ro!.observe(el);
    return () => ro?.disconnect();
  }, []);
  useEffect(() => {
    if (!open || mode === 'push') return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, mode, setOpen]);
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the current page in sight in a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, shown]);

  const go = useCallback(
    (id: string) => {
      if (mode === 'push') return goToPage(id);
      setOpen(false);
      window.setTimeout(() => goToPage(id), reduced() ? 0 : 230);
    },
    [mode, setOpen],
  );
  if (!pages.length || !shown) return null;
  const idx = Math.max(0, pages.findIndex((p) => p.id === current));
  const counts = (id: string) => comments.threads.filter((t) => !t.resolvedAt && t.page === id);

  const list = (
    <>
      <div className="flex items-center px-1.5 mb-2.5">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-teton-ui-gray">Contents</p>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-teton-ui-gray hover:bg-teton-almost-white" aria-label="Close contents">
          {mode === 'push' ? '«' : '✕'}
        </button>
      </div>
      <ol ref={listRef} className="space-y-0.5">
        {pages.map((p, i) => {
          const on = p.id === current;
          const done = !on && seen.has(p.id);
          const here = counts(p.id);
          return (
            <li key={p.id} className="relative">
              {on && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded bg-[#D9553F] [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]" aria-hidden="true" />}
              <button
                type="button"
                data-toc-page={p.id}
                aria-current={on ? 'true' : undefined}
                onClick={() => go(p.id)}
                className={`w-full flex items-center gap-2.5 rounded-[9px] px-2.5 ${mode === 'sheet' ? 'py-3' : 'py-2'} text-left text-[13px] transition-colors duration-200 motion-reduce:transition-none ${on ? 'bg-[#FDF0EE] text-teton-ink font-semibold' : 'text-[#3A4250] hover:bg-[#F4F1EC]'}`}
              >
                <span className={`w-[22px] h-[22px] flex-shrink-0 rounded-md grid place-items-center text-[11px] font-bold transition-colors duration-200 ${on ? 'bg-[#D9553F] text-white' : done ? 'bg-[#E6F2EA] text-[#256B41]' : 'bg-[#F1EEE8] text-teton-ui-gray'}`}>{done ? '✓' : i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                {here.length > 0 && <span className="w-6" aria-hidden="true" />}
              </button>
              {here.length > 0 && (
                <button type="button" onClick={() => comments.open({ threadId: here[0].id })} className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 h-6 px-1.5 rounded-md text-[11px] font-semibold text-[#1F5FB5] hover:bg-[#EEF5FE]" aria-label={`${here.length} comment${here.length === 1 ? '' : 's'} on ${p.title}`}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z" strokeLinejoin="round" /></svg>
                  {here.length}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3.5 mx-1.5 pt-3 border-t border-[#EFECE6] text-[11.5px] text-teton-ui-gray">
        Page {idx + 1} of {pages.length}
        <div className="mt-1.5 h-1 rounded bg-[#EFECE6] overflow-hidden">
          <div className="h-full rounded bg-[#D9553F] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((idx + 1) / pages.length) * 100}%` }} />
        </div>
      </div>
    </>
  );

  if (mode === 'sheet')
    return (
      <div className="no-print fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Contents" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${leaving ? 'opacity-0' : '[animation:fadeIn_.2s_ease-out]'} motion-reduce:[animation:none]`} onClick={() => setOpen(false)} />
        <nav className={`absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto overscroll-contain rounded-t-[18px] bg-white px-[18px] pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,.2)] transition-transform duration-200 motion-reduce:transition-none ${leaving ? 'translate-y-full' : '[animation:sheetUp_.25s_ease-out] motion-reduce:[animation:none]'}`}>
          <div className="w-10 h-1 rounded bg-[#D5D9DE] mx-auto mb-3" aria-hidden="true" />
          {list}
        </nav>
      </div>
    );
  return (
    <>
      {mode === 'overlay' && <div className={`no-print fixed inset-0 z-[24] bg-black/25 transition-opacity duration-200 ${leaving ? 'opacity-0' : '[animation:fadeIn_.2s_ease-out]'}`} style={{ top }} onClick={() => setOpen(false)} />}
      <nav
        aria-label="Contents"
        className={`no-print fixed left-0 bottom-0 z-[25] w-[264px] overflow-y-auto overscroll-contain bg-white border-r border-[#ECE8DF] pl-5 pr-3.5 py-5 shadow-[4px_0_18px_rgba(0,0,0,.04)] transition-transform duration-200 motion-reduce:transition-none ${leaving ? '-translate-x-full' : '[animation:slideFromLeft_.25s_ease-out] motion-reduce:[animation:none]'}`}
        style={{ top, fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {list}
      </nav>
    </>
  );
}
