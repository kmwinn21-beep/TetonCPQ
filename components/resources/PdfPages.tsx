'use client';

/**
 * A PDF drawn page by page (with pdf.js, so it looks the same in every browser, phones included), in a scrollable,
 * zoomable frame: − / + / fit, and the page you're on.
 */
import { useEffect, useRef, useState } from 'react';
import { pdfjs } from '@/lib/client/pdf';

export function PdfPages({ url, height = '72vh', label }: { url: string; height?: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Array<{ src: string; w: number; h: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let gone = false;
    setPages([]);
    setError(null);
    void (async () => {
      try {
        // Fetched here (following a redirect to R2 without sending cookies there), then handed to pdf.js.
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Couldn’t load this PDF');
        const data = new Uint8Array(await res.arrayBuffer());
        const doc = await (await pdfjs()).getDocument({ data, isEvalSupported: false, enableXfa: false }).promise;
        const out: Array<{ src: string; w: number; h: number }> = [];
        const width = Math.min(1800, Math.max(900, (box.current?.clientWidth ?? 900) * 2));
        for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
          const p = await doc.getPage(i);
          const v0 = p.getViewport({ scale: 1 });
          const v = p.getViewport({ scale: width / v0.width });
          const c = document.createElement('canvas');
          c.width = Math.round(v.width);
          c.height = Math.round(v.height);
          await p.render({ canvasContext: c.getContext('2d')!, viewport: v }).promise;
          out.push({ src: c.toDataURL('image/jpeg', 0.88), w: v0.width, h: v0.height });
          if (gone) return;
          setPages([...out]);
        }
      } catch (e) {
        if (!gone) setError(e instanceof Error ? e.message : 'Couldn’t show this PDF');
      }
    })();
    return () => {
      gone = true;
    };
  }, [url]);
  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const imgs = [...el.querySelectorAll('img')];
    const mid = el.scrollTop + el.clientHeight / 3;
    const i = imgs.findIndex((im) => im.offsetTop + im.offsetHeight > mid);
    setPage(i < 0 ? imgs.length : i + 1);
  };
  const btn = 'w-8 h-8 rounded-lg grid place-items-center text-[15px] font-semibold hover:bg-teton-almost-white disabled:opacity-30';
  return (
    <div className="relative rounded-2xl bg-[#EDEAE4] overflow-hidden">
      <div ref={box} onScroll={onScroll} className="overflow-auto overscroll-contain p-2 sm:p-4" style={{ height }} aria-label={label}>
        {error ? (
          <p className="h-full grid place-items-center text-[13px] text-teton-ui-gray">{error}</p>
        ) : !pages.length ? (
          <p className="h-full grid place-items-center text-[13px] text-teton-ui-gray">Loading…</p>
        ) : (
          <div className="mx-auto space-y-3 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${zoom * 100}%` }}>
            {pages.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.src} alt={`Page ${i + 1}`} className="block w-full rounded-md bg-white shadow-[0_6px_18px_rgba(0,0,0,.12)]" style={{ aspectRatio: `${p.w}/${p.h}` }} />
            ))}
          </div>
        )}
      </div>
      {pages.length > 0 && (
        <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-[10px] bg-white p-[3px] shadow-[0_4px_14px_rgba(0,0,0,.15)]">
          {pages.length > 1 && <span className="px-2 text-[11.5px] font-semibold text-teton-ui-gray tabular-nums">{page} / {pages.length}</span>}
          <button type="button" className={btn} aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            −
          </button>
          <button type="button" className={btn} aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            ＋
          </button>
          <button type="button" className={btn} aria-label="Fit" disabled={zoom === 1} onClick={() => setZoom(1)}>
            ⤢
          </button>
        </div>
      )}
    </div>
  );
}
