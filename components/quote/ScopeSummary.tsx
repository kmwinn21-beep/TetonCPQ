'use client';

/**
 * The scope summary page(s) as the download prints them: the same PDF code makes them, drawn here with
 * pdf.js and redrawn when the room types or notes change. "With notes" matches the download with notes.
 */
import { useEffect, useRef, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import type { PlanNote } from '@/lib/data/planNotes';
import type { TagNote } from '@/lib/data/tagNotes';
import type { RoomType } from '@/lib/quote/roomTypes';
import { openPdf } from '@/lib/client/pdf';

export function ScopeSummary({
  planId,
  planName,
  communityName,
  types,
  notes,
  tagNotes,
  allowancePct,
}: {
  planId: number;
  planName: string;
  communityName: string;
  types: RoomType[];
  notes: PlanNote[];
  tagNotes: TagNote[];
  allowancePct: number;
}) {
  const [withNotes, setWithNotes] = useState(true);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const box = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([planId, planName, communityName, types, withNotes ? notes : [], withNotes ? tagNotes : [], allowancePct]);
  useEffect(() => {
    let live = true;
    // Typing in a room type redraws once it settles.
    const t = setTimeout(async () => {
      try {
        const { scopeSummaryPdf } = await import('@/lib/client/scopePdf');
        const blob = await scopeSummaryPdf({ planId, planName, communityName, types, notes: withNotes ? notes : [], tagNotes: withNotes ? tagNotes : [], allowancePct });
        const url = URL.createObjectURL(blob);
        try {
          const pdf = await openPdf(url);
          const el = box.current;
          if (!el || !live) return;
          const canvases: HTMLCanvasElement[] = [];
          for (let n = 1; n <= pdf.numPages; n++) {
            const pg = await pdf.getPage(n);
            const base = pg.getViewport({ scale: 1 });
            const vp = pg.getViewport({ scale: Math.min(3, 1700 / base.width) });
            const c = document.createElement('canvas');
            c.width = Math.round(vp.width);
            c.height = Math.round(vp.height);
            c.className = 'block w-full h-auto bg-white shadow-sm rounded-sm';
            c.setAttribute('aria-label', `Scope summary, page ${n} of ${pdf.numPages}`);
            await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
            canvases.push(c);
          }
          if (!live) return;
          el.replaceChildren(...canvases);
          setState('ready');
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch {
        if (live) setState('error');
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // `key` stands for everything drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="absolute inset-0 z-[35] overflow-auto overscroll-contain bg-teton-almost-white drawer-in" role="region" aria-label="Scope summary">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 bg-teton-almost-white/95 backdrop-blur-sm border-b border-teton-off-white text-xs">
        <span className="text-teton-ui-gray mr-auto">As printed on the summary page of the scope download</span>
        <SegGroup label="Notes in the summary" thumbClass="bg-white" className="flex rounded-lg bg-teton-off-white p-0.5 text-[11.5px]">
          <button type="button" role="radio" aria-checked={withNotes} className={`px-2.5 py-1 ${withNotes ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} onClick={() => setWithNotes(true)}>With notes</button>
          <button type="button" role="radio" aria-checked={!withNotes} className={`px-2.5 py-1 ${!withNotes ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} onClick={() => setWithNotes(false)}>No notes</button>
        </SegGroup>
      </div>
      {state !== 'ready' && <p className="pt-16 text-center text-sm text-teton-ui-gray">{state === 'error' ? 'The summary couldn’t be drawn.' : 'Drawing the summary…'}</p>}
      <div ref={box} className={`mx-auto w-full max-w-[820px] space-y-4 p-3 sm:p-4 transition-opacity duration-200 ${state === 'ready' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`} />
    </div>
  );
}
