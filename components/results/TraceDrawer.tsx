'use client';

/**
 * "Where does that number come from?" A side panel that shows a figure's
 * formula and the inputs behind it, each expandable down to what the rep typed.
 */
import { useEffect, useRef, useState } from 'react';
import type { Trace } from '@/lib/model';
import { count, pct, usd } from '@/lib/format';

export function formatTraceValue(t: Pick<Trace, 'value' | 'unit'>): string {
  const v = t.value;
  if (v == null) return t.unit === 'months' ? 'Not within horizon' : '—';
  switch (t.unit) {
    case 'usd':
      return usd(v, { cents: Math.abs(v) < 1000 && !Number.isInteger(v) });
    case 'usd_per_month':
      return `${usd(v, { cents: Math.abs(v) < 1000 && !Number.isInteger(v) })}/mo`;
    case 'percent':
      return pct(v, 2);
    case 'ratio':
    case 'multiple':
      return Number(v.toFixed(2)).toString() + (t.unit === 'multiple' ? '×' : '');
    case 'months':
      return Number.isInteger(v) ? `${v} mo` : `${v.toFixed(1)} mo`;
    default:
      return Number.isInteger(v) ? count(v) : Number(v.toFixed(2)).toLocaleString('en-US');
  }
}

function TraceNode({ t, depth }: { t: Trace; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = t.inputs.length > 0;
  return (
    <li className={depth > 0 ? 'border-l border-teton-off-white pl-3 ml-1' : ''}>
      <div className="py-1.5">
        <button
          type="button"
          onClick={() => hasKids && setOpen((o) => !o)}
          className={`w-full flex items-baseline justify-between gap-3 text-left ${hasKids ? 'cursor-pointer hover:bg-teton-almost-white rounded' : 'cursor-default'}`}
          aria-expanded={hasKids ? open : undefined}
        >
          <span className="text-sm min-w-0">
            {hasKids && <span className="inline-block w-3 text-teton-ui-gray" aria-hidden="true">{open ? '▾' : '▸'}</span>}
            {!hasKids && <span className="inline-block w-3" />}
            {t.label}
          </span>
          <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{formatTraceValue(t)}</span>
        </button>
        {(open || !hasKids) && (
          <p className="text-xs text-teton-ui-gray pl-3">
            {t.formula === 'Input' ? 'Entered assumption' : `= ${t.formula}`}
            {t.workbookRef && <span className="ml-1 text-teton-light-gray">· workbook {t.workbookRef}</span>}
          </p>
        )}
      </div>
      {open && hasKids && (
        <ul>
          {t.inputs.map((c, i) => (
            <TraceNode key={`${c.id}-${i}`} t={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TraceDrawer({ trace, onClose }: { trace: Trace | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!trace) return;
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [trace, onClose]);
  if (!trace) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`How ${trace.label} is calculated`}>
      <button type="button" className="absolute inset-0 bg-teton-ink/30" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div className="relative w-full max-w-xl h-full bg-white shadow-xl flex flex-col">
        <div className="p-5 border-b border-teton-off-white flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-teton-ui-gray">Where this number comes from</p>
            <h2 className="text-lg font-semibold">{trace.label}</h2>
            <p className="text-2xl font-semibold tabular-nums mt-1">{formatTraceValue(trace)}</p>
          </div>
          <button ref={closeRef} type="button" className="btn-ghost" onClick={onClose} aria-label="Close drill-down">
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <p className="text-sm bg-teton-almost-white rounded-lg px-3 py-2 mb-4">
            <span className="font-medium">Formula:</span> {trace.formula}
          </p>
          <p className="text-xs text-teton-ui-gray mb-2">Expand any line to see its inputs, down to the assumptions entered on the form.</p>
          <ul>
            {trace.inputs.map((c, i) => (
              <TraceNode key={`${c.id}-${i}`} t={c} depth={1} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
