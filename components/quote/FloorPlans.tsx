'use client';

/**
 * Floor plans per community: the deal's list (shared by the drawer and the
 * community cards), uploads in chunks with progress, a preview with download,
 * and removal.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ScopeViewer } from './ScopeViewer';

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
  /** Open a community's floor plans (optionally a plan, in Scope Mode, or with a room type picked out). */
  openViewer: (communityId: string, opts?: ViewerOpts) => void;
}
export interface ViewerOpts {
  planId?: number;
  scope?: boolean;
  typeId?: string;
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
  const [viewer, setViewer] = useState<(ViewerOpts & { communityId: string; key: number }) | null>(null);
  const openViewer = useCallback((communityId: string, opts: ViewerOpts = {}) => setViewer({ communityId, ...opts, key: Date.now() }), []);
  const viewerPlans = viewer ? plans.filter((p) => p.communityId === viewer.communityId) : [];
  return (
    <FloorPlansCtx.Provider value={{ quoteId, plans, uploading, upload, remove, dismiss, openViewer }}>
      {children}
      {viewer && viewerPlans.length > 0 && (
        <ScopeViewer
          key={viewer.key}
          quoteId={quoteId}
          communityId={viewer.communityId}
          plans={viewerPlans}
          initialPlanId={viewer.planId}
          initialScope={viewer.scope}
          highlightType={viewer.typeId}
          onClose={() => setViewer(null)}
          onRemovePlan={async (id) => {
            await remove(id);
            if (viewerPlans.length <= 1) setViewer(null);
          }}
        />
      )}
    </FloorPlansCtx.Provider>
  );
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
          onClick={() => ctx.openViewer(communityId, { planId: p.id })}
          title={`${p.name} · ${kb(p.size)} — view, scope or download`}
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
    </>
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
