'use client';

/**
 * Floor plans per community: the deal's list (shared by the drawer and the
 * community cards), uploads in chunks with progress, a preview with download,
 * and removal.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FloorPlanItem {
  id: number;
  communityId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}
interface Uploading {
  key: string;
  communityId: string;
  name: string;
  pct: number;
  error?: string;
}
interface Ctx {
  quoteId: number;
  plans: FloorPlanItem[];
  uploading: Uploading[];
  upload: (communityId: string, files: FileList | File[]) => void;
  remove: (id: number) => Promise<void>;
  dismiss: (key: string) => void;
}

const CHUNK = 3 * 1024 * 1024;
const MAX = 40 * 1024 * 1024;
const OK = /^(application\/pdf|image\/(png|jpe?g|gif|webp|heic|heif))$/;
const FloorPlansCtx = createContext<Ctx | null>(null);
export const useFloorPlans = () => useContext(FloorPlansCtx);

export function FloorPlansProvider({ quoteId, children }: { quoteId: number; children: React.ReactNode }) {
  const [plans, setPlans] = useState<FloorPlanItem[]>([]);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`/api/quotes/${quoteId}/floorplans`)
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((b) => live && setPlans(b.plans ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [quoteId]);

  const patch = (key: string, p: Partial<Uploading>) => setUploading((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const one = useCallback(
    async (communityId: string, file: File) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploading((u) => [...u, { key, communityId, name: file.name, pct: 0 }]);
      try {
        const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
        if (!OK.test(mime)) throw new Error('Floor plans must be a PDF or an image');
        if (file.size > MAX) throw new Error(`Up to ${MAX / 1024 / 1024} MB`);
        const start = await fetch(`/api/quotes/${quoteId}/floorplans`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, name: file.name, mime, size: file.size }),
        });
        const s = await start.json();
        if (!start.ok) throw new Error(s.error);
        for (let i = 0; i < s.chunks; i++) {
          const part = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
          const r = await fetch(`/api/quotes/${quoteId}/floorplans/${s.id}/chunks/${i}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: part });
          if (!r.ok) throw new Error((await r.json()).error ?? 'Upload failed');
          patch(key, { pct: Math.round(((i + 1) / s.chunks) * 100) });
        }
        const done = await fetch(`/api/quotes/${quoteId}/floorplans/${s.id}/complete`, { method: 'POST' });
        const d = await done.json();
        if (!done.ok) throw new Error(d.error);
        setPlans((p) => [...p, d.plan]);
        setUploading((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        patch(key, { error: e instanceof Error ? e.message : 'Upload failed' });
      }
    },
    [quoteId],
  );
  const upload = useCallback((communityId: string, files: FileList | File[]) => {
    Array.from(files).forEach((f) => void one(communityId, f));
  }, [one]);
  const remove = useCallback(
    async (id: number) => {
      const r = await fetch(`/api/quotes/${quoteId}/floorplans/${id}`, { method: 'DELETE' });
      if (r.ok) setPlans((p) => p.filter((x) => x.id !== id));
    },
    [quoteId],
  );
  const dismiss = (key: string) => setUploading((u) => u.filter((x) => x.key !== key));
  return <FloorPlansCtx.Provider value={{ quoteId, plans, uploading, upload, remove, dismiss }}>{children}</FloorPlansCtx.Provider>;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const PlanIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16v14H4zM4 11h7V5M11 15h9" />
  </svg>
);

/** In the community drawer: "+ Floor Plan", a badge per uploaded file (opens the preview), uploads in progress. */
export function FloorPlans({ communityId, communityName }: { communityId: string; communityName: string }) {
  const ctx = useFloorPlans();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<FloorPlanItem | null>(null);
  if (!ctx) return null;
  const mine = ctx.plans.filter((p) => p.communityId === communityId);
  const busy = ctx.uploading.filter((u) => u.communityId === communityId);
  return (
    <>
      <button type="button" className="btn-secondary py-1 px-2.5 text-xs whitespace-nowrap" onClick={() => input.current?.click()}>
        + Floor Plan
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="sr-only"
        aria-label={`Upload floor plans for ${communityName || 'this community'}`}
        onChange={(e) => {
          if (e.target.files?.length) ctx.upload(communityId, e.target.files);
          e.target.value = '';
        }}
      />
      {mine.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPreview(p)}
          title={`${p.name} · ${kb(p.size)} — preview or download`}
          className="drawer-in inline-flex items-center gap-1.5 max-w-[11rem] rounded-full bg-teton-pale-green px-2.5 py-1 text-[11px] font-medium text-[#256B41] hover:brightness-95"
        >
          <PlanIcon />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
      {busy.map((u) => (
        <span key={u.key} className={`inline-flex items-center gap-1.5 max-w-[13rem] rounded-full px-2.5 py-1 text-[11px] ${u.error ? 'bg-teton-red/30' : 'bg-teton-off-white text-teton-dark-gray'}`}>
          <span className="truncate">{u.error ? `${u.name}: ${u.error}` : `Uploading ${u.name}`}</span>
          {u.error ? (
            <button type="button" aria-label="Dismiss" className="font-bold" onClick={() => ctx.dismiss(u.key)}>×</button>
          ) : (
            <span className="tabular-nums">{u.pct}%</span>
          )}
        </span>
      ))}
      {preview && <FloorPlanPreview plan={preview} quoteId={ctx.quoteId} siblings={mine} onPick={setPreview} onClose={() => setPreview(null)} onRemove={async () => { await ctx.remove(preview.id); setPreview(null); }} />}
    </>
  );
}

/** The uploaded file on screen (PDF or image), with download and remove. */
function FloorPlanPreview({ plan, quoteId, siblings, onPick, onClose, onRemove }: { plan: FloorPlanItem; quoteId: number; siblings: FloorPlanItem[]; onPick: (p: FloorPlanItem) => void; onClose: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  useEffect(() => setConfirm(false), [plan.id]);
  const url = `/api/quotes/${quoteId}/floorplans/${plan.id}`;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Floor plan: ${plan.name}`} onClick={onClose}>
      <div className="flex flex-col w-full max-w-5xl h-full max-h-[92dvh] rounded-xl bg-white shadow-xl overflow-hidden [animation:fadeScale_.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-teton-off-white">
          <PlanIcon className="w-4 h-4 text-teton-ui-gray" />
          <p className="font-medium truncate min-w-0 flex-1">{plan.name} <span className="text-xs font-normal text-teton-ui-gray">· {kb(plan.size)}</span></p>
          {siblings.length > 1 && (
            <select className="input-field py-1 text-xs w-auto max-w-[12rem]" value={plan.id} onChange={(e) => onPick(siblings.find((s) => s.id === Number(e.target.value))!)} aria-label="Other floor plans for this community">
              {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <a className="btn-primary py-1 text-xs" href={`${url}?download=1`}>Download</a>
          {confirm ? (
            <span className="flex items-center gap-1.5 text-xs">
              Remove it?
              <button type="button" className="py-1 px-2 rounded-md bg-[#C2412D] text-white font-medium" onClick={onRemove}>Remove</button>
              <button type="button" className="py-1 px-2 rounded-md hover:bg-teton-off-white" onClick={() => setConfirm(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setConfirm(true)}>Remove</button>
          )}
          <button type="button" className="btn-ghost py-1" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 min-h-0 bg-teton-almost-white">
          {plan.mime === 'application/pdf' ? (
            <iframe key={plan.id} src={url} title={plan.name} className="w-full h-full" />
          ) : (
            <div className="w-full h-full overflow-auto flex items-start justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={plan.id} src={url} alt={plan.name} className="max-w-full h-auto" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** On a community card: red with a warning icon until a floor plan is uploaded, then green with a check. */
export function FloorPlanPill({ communityId }: { communityId: string }) {
  const ctx = useFloorPlans();
  if (!ctx) return null;
  const n = ctx.plans.filter((p) => p.communityId === communityId).length;
  return n ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-teton-pale-green px-2 py-0.5 text-[11px] font-medium text-[#256B41] whitespace-nowrap" title={`${n} floor plan${n === 1 ? '' : 's'} uploaded`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      Floor Plan(s)
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-teton-red/30 px-2 py-0.5 text-[11px] font-medium text-[#9A2E1C] whitespace-nowrap" title="No floor plan uploaded yet">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
      Floor Plan(s)
    </span>
  );
}
