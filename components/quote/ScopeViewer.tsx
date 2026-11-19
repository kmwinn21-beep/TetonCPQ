'use client';

/**
 * A community's floor plans on screen, with Scope Mode: click anywhere on the
 * plan to tag a room (a badge sits exactly where you click, no room outlines
 * needed), then save the selection as a room type. The room types layer shows
 * every saved badge in its type's color; click one to change it. Downloads the
 * original file, or a PDF with the badges, a legend on each page and a summary.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { badgeOf, BADGE_COLORS, CARE_LABEL, initialsOf, nextBadgeColor, normalizeAllowance, type CareType, type RoomMark, type RoomType } from '@/lib/quote/roomTypes';
import { openPdf } from '@/lib/client/pdf';
import { NumInput } from '@/components/form/NumInput';
import { count } from '@/lib/format';
import { useRoomTypes } from './useRoomTypes';
import type { FloorPlanItem } from './FloorPlans';

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
const CARES = (Object.keys(CARE_LABEL) as CareType[]).filter((c) => c !== 'custom');
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

interface Pending {
  id: string;
  plan: number;
  page: number;
  x: number;
  y: number;
}
/** A badge with its room type, as drawn. */
interface Placed extends RoomMark {
  typeId: string;
  color: string;
  initials: string;
}

function Toggle({ on, onChange, label, accent = false }: { on: boolean; onChange: (v: boolean) => void; label: string; accent?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium select-none cursor-pointer whitespace-nowrap">
      <span className="relative inline-flex">
        <input type="checkbox" role="switch" className="peer sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className={`w-8 h-[18px] rounded-full bg-teton-pale-gray transition-colors duration-200 motion-reduce:transition-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent ${accent ? 'peer-checked:bg-[#3F8CEA]' : 'peer-checked:bg-teton-near-black'}`} />
        <span className="absolute left-[2px] top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 ease-out motion-reduce:transition-none peer-checked:translate-x-[14px]" />
      </span>
      {label}
    </label>
  );
}

/** A round badge with initials (or a number while selecting). */
export function Badge({ color, text, size = 22, className = '', style }: { color: string; text: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-extrabold border-[1.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,.35)] leading-none select-none ${className}`}
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * (text.length > 2 ? 0.34 : 0.4)), ...style }}
    >
      {text}
    </span>
  );
}

export function ScopeViewer({
  quoteId,
  communityId,
  plans,
  initialPlanId,
  initialScope = false,
  highlightType,
  onClose,
  onRemovePlan,
}: {
  quoteId: number;
  communityId: string;
  /** This community's floor plans. */
  plans: FloorPlanItem[];
  initialPlanId?: number;
  initialScope?: boolean;
  /** Open with this room type picked out (others faded). */
  highlightType?: string;
  onClose: () => void;
  onRemovePlan: (id: number) => Promise<void>;
}) {
  const { control, getValues } = useFormContext<QuoteDraft>();
  const communities = useWatch({ control, name: 'communities' });
  const index = (communities ?? []).findIndex((c) => c?.id === communityId);
  const community = index >= 0 ? communities[index] : null;
  const { types, write, current } = useRoomTypes(index);
  const planIds = useMemo(() => plans.map((p) => p.id), [plans]);

  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const anyMarks = types.some((t) => (t.marks ?? []).length);
  const [layer, setLayer] = useState(anyMarks || !!highlightType);
  const [scope, setScope] = useState(initialScope);
  const [focusType, setFocusType] = useState<string | null>(highlightType ?? null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [pop, setPop] = useState<{ typeId: string; markId: string } | null>(null);
  const [editType, setEditType] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  // Badges grow as you zoom in (small enough not to cover neighbouring rooms on a whole-page view).
  const size = Math.round(Math.min(24, 14 + zoom * 4));
  const url = plan ? `/api/quotes/${quoteId}/floorplans/${plan.id}` : '';

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pop || editType || saving || menu) {
        setPop(null);
        setEditType(null);
        setSaving(false);
        setMenu(false);
      } else onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, pop, editType, saving, menu]);
  useEffect(() => {
    setPage(1);
    setConfirmRemove(false);
    setPop(null);
  }, [planId]);

  // Badges on this page.
  const placed: Placed[] = useMemo(
    () =>
      types.flatMap((t, k) => {
        const b = badgeOf(t, k);
        return (t.marks ?? []).filter((m) => m.plan === plan?.id && m.page === page).map((m) => ({ ...m, typeId: t.id, color: b.color, initials: b.initials }));
      }),
    [types, plan?.id, page],
  );
  const pendingHere = pending.filter((p) => p.plan === plan?.id && p.page === page);
  const showSaved = layer || scope;

  // ---- changes to the room types ----
  const update = (fn: (list: RoomType[]) => RoomType[]) => write(fn(current()));
  const moveMark = (typeId: string, markId: string, x: number, y: number) =>
    update((list) => list.map((t) => (t.id === typeId ? { ...t, marks: (t.marks ?? []).map((m) => (m.id === markId ? { ...m, x, y } : m)) } : t)));
  const removeMark = (typeId: string, markId: string) => {
    update((list) => list.map((t) => (t.id === typeId ? { ...t, marks: (t.marks ?? []).filter((m) => m.id !== markId) } : t)));
    setPop(null);
  };
  const retypeMark = (from: string, to: string, markId: string) => {
    if (from === to) return;
    update((list) => {
      const m = list.find((t) => t.id === from)?.marks?.find((x) => x.id === markId);
      if (!m) return list;
      return list.map((t) => (t.id === from ? { ...t, marks: (t.marks ?? []).filter((x) => x.id !== markId) } : t.id === to ? { ...t, marks: [...(t.marks ?? []), m] } : t));
    });
    setPop({ typeId: to, markId });
  };
  const labelMark = (typeId: string, markId: string, label: string) =>
    update((list) => list.map((t) => (t.id === typeId ? { ...t, marks: (t.marks ?? []).map((m) => (m.id === markId ? { ...m, label: label.slice(0, 16) || undefined } : m)) } : t)));
  const toMarks = (ps: Pending[]): RoomMark[] => ps.map((p) => ({ id: uid('mk'), plan: p.plan, page: p.page, x: p.x, y: p.y }));
  const saveNew = (t: Omit<RoomType, 'id' | 'rooms' | 'marks'>) => {
    const marks = toMarks(pending);
    update((list) => [...list, { ...t, id: uid('rt'), rooms: marks.length, marks, roomsFromPlan: true }]);
    setPending([]);
    setSaving(false);
    setLayer(true);
  };
  const addToType = (typeId: string) => {
    const marks = toMarks(pending);
    update((list) => list.map((t) => (t.id === typeId ? { ...t, marks: [...(t.marks ?? []), ...marks] } : t)));
    setPending([]);
    setSaving(false);
    setLayer(true);
  };
  const removePlan = async () => {
    // Its badges go; their room types keep their room counts as typed-in numbers.
    const list = current();
    if (list.some((t) => (t.marks ?? []).some((m) => m.plan === plan.id)))
      write(list.map((t) => ((t.marks ?? []).some((m) => m.plan === plan.id) ? { ...t, rooms: t.rooms, roomsFromPlan: undefined, marks: (t.marks ?? []).filter((m) => m.plan !== plan.id) } : t)));
    setPending((p) => p.filter((x) => x.plan !== plan.id));
    await onRemovePlan(plan.id);
  };
  const download = async () => {
    setMenu(false);
    setExporting('Preparing…');
    try {
      const { scopePdf } = await import('@/lib/client/scopePdf');
      const blob = await scopePdf({
        url,
        mime: plan.mime,
        planId: plan.id,
        planName: plan.name,
        communityName: community?.name || 'Community',
        types: current(),
        allowancePct: normalizeAllowance(getValues(`communities.${index}.sensorAllowancePct`)),
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${plan.name.replace(/\.[a-z0-9]+$/i, '')} - scope.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setExporting(null);
    } catch (e) {
      setExporting(e instanceof Error ? `Couldn't make the PDF: ${e.message}` : "Couldn't make the PDF");
    }
  };

  // ---- counts, legend and warnings ----
  const rows = types.map((t, k) => {
    const marks = t.marks ?? [];
    return { t, b: badgeOf(t, k), tagged: marks.filter((m) => planIds.includes(m.plan)).length, here: marks.filter((m) => m.plan === plan?.id).length };
  });
  const taggedTotal = rows.reduce((s, r) => s + r.tagged, 0);
  const sensorsTagged = rows.reduce((s, r) => s + r.tagged * Math.max(1, Number(r.t.sensors) || 1), 0);
  // Typed-in room counts that don't match the rooms tagged for that type.
  const mismatches = rows.filter((r) => r.tagged > 0 && !r.t.roomsFromPlan && (Number(r.t.rooms) || 0) !== r.tagged);
  const lockToTagged = (typeId: string) => update((list) => list.map((t) => (t.id === typeId ? { ...t, roomsFromPlan: true } : t)));

  if (!plan) return null;
  const popType = pop ? types.find((t) => t.id === pop.typeId) : null;
  const popMark = popType?.marks?.find((m) => m.id === pop?.markId) ?? null;
  const btn = 'btn-ghost py-1 text-xs';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-0 sm:p-5" role="dialog" aria-modal="true" aria-label={`Floor plan: ${plan.name}`} onClick={onClose}>
      <div className="relative flex flex-col w-full max-w-6xl h-full sm:max-h-[94dvh] sm:rounded-xl bg-white shadow-xl overflow-hidden [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]" onClick={(e) => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5 border-b border-teton-off-white">
          <p className="font-medium truncate min-w-0 flex-1 basis-40">
            {community?.name || 'Community'} <span className="font-normal text-teton-ui-gray">· {plan.name} · {kb(plan.size)}</span>
          </p>
          <Toggle on={layer} onChange={setLayer} label="Room types" />
          <Toggle on={scope} onChange={(v) => { setScope(v); setPop(null); if (!v) setSaving(false); }} label="Scope Mode" accent />
          <div className="relative">
            <button type="button" className="btn-secondary py-1 text-xs" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              Download ▾
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border border-teton-off-white bg-white p-1 shadow-lg text-xs drawer-in">
                <a role="menuitem" className="block rounded-md px-2.5 py-2 hover:bg-teton-almost-white" href={`${url}?download=1`} onClick={() => setMenu(false)}>
                  Download plan<span className="block text-[11px] text-teton-ui-gray">The original file</span>
                </a>
                <button type="button" role="menuitem" className="block w-full text-left rounded-md px-2.5 py-2 hover:bg-teton-almost-white" onClick={download}>
                  Download with scope badges<span className="block text-[11px] text-teton-ui-gray">PDF · badges and a legend on each page, and a summary page</span>
                </button>
              </div>
            )}
          </div>
          {confirmRemove ? (
            <span className="flex items-center gap-1.5 text-xs">
              Remove this plan{rows.some((r) => r.here) ? ' and its badges' : ''}?
              <button type="button" className="py-1 px-2 rounded-md bg-[#C2412D] text-white font-medium" onClick={removePlan}>Remove</button>
              <button type="button" className="py-1 px-2 rounded-md hover:bg-teton-off-white" onClick={() => setConfirmRemove(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className={btn} onClick={() => setConfirmRemove(true)}>Remove</button>
          )}
          <button type="button" className="btn-ghost py-1" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {/* Plans and pages */}
        {(plans.length > 1 || pages > 1) && (
          <div className="flex flex-wrap items-center gap-1 px-3 sm:px-4 pt-2 text-xs">
            {plans.length > 1 && (
              <select className="input-field py-1 text-xs w-auto max-w-[14rem] mr-2" value={plan.id} onChange={(e) => setPlanId(Number(e.target.value))} aria-label="Floor plan">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {pages > 1 &&
              Array.from({ length: pages }, (_, k) => k + 1).map((n) => {
                const tagged = types.reduce((s, t) => s + (t.marks ?? []).filter((m) => m.plan === plan.id && m.page === n).length, 0);
                return (
                  <button key={n} type="button" onClick={() => { setPage(n); setPop(null); }} aria-pressed={page === n} className={`px-2.5 py-1.5 rounded-t-lg transition-colors duration-200 ${page === n ? 'bg-teton-almost-white font-semibold text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`}>
                    Page {n}{tagged ? <span className="ml-1 text-[10px] text-teton-ui-gray">· {tagged}</span> : null}
                  </button>
                );
              })}
          </div>
        )}

        {/* Typed-in room counts that don't match the tagged rooms */}
        {mismatches.length > 0 && (
          <div className="mx-3 sm:mx-4 mt-2 rounded-lg bg-teton-pale-yellow border border-[#E9D27A] px-3 py-2 text-xs space-y-1 drawer-in" role="status">
            {mismatches.map(({ t, b, tagged }) => {
              const d = (Number(t.rooms) || 0) - tagged;
              return (
                <p key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge color={b.color} text={b.initials} size={18} />
                  <span>
                    <b>{t.name || 'Room type'}</b>: {count(Number(t.rooms) || 0)} rooms entered, {count(tagged)} tagged — the entered count is <b>{count(Math.abs(d))} room{Math.abs(d) === 1 ? '' : 's'} {d > 0 ? 'more' : 'fewer'}</b> than tagged.
                  </span>
                  <button type="button" className="underline text-teton-dark-gray hover:text-teton-ink" onClick={() => lockToTagged(t.id)}>Use the tagged count</button>
                </p>
              );
            })}
          </div>
        )}

        <div className="relative flex-1 min-h-0 flex flex-col">
        <PlanStage
          url={url}
          mime={plan.mime}
          name={plan.name}
          page={page}
          zoom={zoom}
          setZoom={setZoom}
          onPages={setPages}
          scope={scope}
          onTap={(x, y) => {
            if (pop || editType || menu) {
              setPop(null);
              setEditType(null);
              setMenu(false);
              return;
            }
            if (scope && !saving) setPending((p) => [...p, { id: uid('pd'), plan: plan.id, page, x, y }]);
          }}
        >
          {showSaved &&
            placed.map((m) => (
              <PlacedBadge
                key={m.id}
                x={m.x}
                y={m.y}
                color={m.color}
                text={m.initials}
                title={`${types.find((t) => t.id === m.typeId)?.name || 'Room type'}${m.label ? ` · ${m.label}` : ''}`}
                faded={(scope && pendingHere.length > 0) || (!!focusType && focusType !== m.typeId)}
                selected={pop?.markId === m.id}
                size={size}
                onClick={() => { setPop({ typeId: m.typeId, markId: m.id }); setEditType(null); setMenu(false); }}
                onMove={(x, y) => moveMark(m.typeId, m.id, x, y)}
              />
            ))}
          {pendingHere.map((p) => (
            <PlacedBadge
              key={p.id}
              x={p.x}
              y={p.y}
              pending
              size={size}
              text={String(pending.indexOf(p) + 1)}
              title="Selected: click to unselect, drag to move"
              onClick={() => setPending((ps) => ps.filter((x) => x.id !== p.id))}
              onMove={(x, y) => setPending((ps) => ps.map((q) => (q.id === p.id ? { ...q, x, y } : q)))}
            />
          ))}
          {popType && popMark && !editType && (
            <Anchored x={popMark.x} y={popMark.y}>
              <MarkPopover
                key={popMark.id}
                type={popType}
                types={types}
                mark={popMark}
                onRetype={(to) => retypeMark(popType.id, to, popMark.id)}
                onLabel={(l) => labelMark(popType.id, popMark.id, l)}
                onRemove={() => removeMark(popType.id, popMark.id)}
                onEdit={() => setEditType(popType.id)}
                onClose={() => setPop(null)}
              />
            </Anchored>
          )}
          {editType && popMark && (
            <Anchored x={popMark.x} y={popMark.y}>
              <TypeForm
                title={`Edit “${types.find((t) => t.id === editType)?.name || 'Room type'}”`}
                initial={types.find((t) => t.id === editType)}
                index={types.findIndex((t) => t.id === editType)}
                types={types}
                submit="Save"
                onCancel={() => setEditType(null)}
                onSave={(v) => {
                  update((list) => list.map((t) => (t.id === editType ? { ...t, ...v } : t)));
                  setEditType(null);
                }}
              />
            </Anchored>
          )}
        </PlanStage>

        {scope && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 max-w-[calc(100%-1.5rem)]">
            {saving ? (
              <TypeForm
                title="New room type"
                sub={`${pending.length} room${pending.length === 1 ? '' : 's'} selected`}
                types={types}
                index={types.length}
                submit={`Save room type · ${pending.length} room${pending.length === 1 ? '' : 's'}`}
                onCancel={() => setSaving(false)}
                onSave={saveNew}
                onAddTo={types.length ? addToType : undefined}
              />
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-teton-near-black text-white pl-3.5 pr-2 py-2 text-xs shadow-xl whitespace-nowrap drawer-in">
                {pending.length ? (
                  <>
                    <b>{pending.length} room{pending.length === 1 ? '' : 's'} selected</b>
                    <button type="button" className="rounded-md border border-white/30 px-2 py-1 hover:bg-white/10" onClick={() => setPending([])}>Clear</button>
                    <button type="button" className="rounded-md bg-[#3F8CEA] px-2.5 py-1 font-medium hover:brightness-110" onClick={() => setSaving(true)}>Save as room type…</button>
                  </>
                ) : (
                  <span>Click anywhere on the plan to tag a room · drag to move around</span>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2.5 border-t border-teton-off-white text-xs min-h-[3rem]">
          {rows.length === 0 && <span className="text-teton-ui-gray">No room types yet. Turn on Scope Mode and click rooms to tag them.</span>}
          {rows.map(({ t, b, tagged, here }) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFocusType((f) => (f === t.id ? null : t.id))}
              aria-pressed={focusType === t.id}
              title={focusType === t.id ? 'Show every room type' : 'Pick out this room type'}
              className={`inline-flex items-center gap-1.5 rounded-full pr-2 transition-opacity duration-200 ${focusType && focusType !== t.id ? 'opacity-40' : ''}`}
            >
              <Badge color={b.color} text={b.initials} size={20} />
              <span>{t.name || 'Room type'} · {count(here)}{tagged !== here ? <span className="text-teton-ui-gray"> ({count(tagged)} in all)</span> : null}</span>
            </button>
          ))}
          {taggedTotal > 0 && <span className="ml-auto font-semibold">{count(taggedTotal)} rooms tagged · {count(sensorsTagged)} sensors</span>}
          {exporting && <span className={`w-full text-[11px] ${exporting.startsWith('Couldn') ? 'text-[#9A2E1C]' : 'text-teton-ui-gray'}`}>{exporting}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The plan (a PDF page drawn by pdf.js, or the image) in a scrollable, zoomable stage. Drag to pan; a click that
 * doesn't move reports where it landed (0–1 across and down). Ctrl/⌘ + wheel zooms.
 */
function PlanStage({
  url,
  mime,
  name,
  page,
  zoom,
  setZoom,
  onPages,
  scope,
  onTap,
  children,
}: {
  url: string;
  mime: string;
  name: string;
  page: number;
  zoom: number;
  setZoom: (z: number | ((z: number) => number)) => void;
  onPages: (n: number) => void;
  scope: boolean;
  onTap: (x: number, y: number) => void;
  children: React.ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [aspect, setAspect] = useState(11 / 8.5);
  const isPdf = mime === 'application/pdf';
  // Zoom 1 shows the whole page: as wide as the stage allows without being taller than it.
  const [fitW, setFitW] = useState<number | null>(null);
  useLayoutEffect(() => {
    const s = stage.current;
    if (!s) return;
    const fit = () => {
      const pad = window.innerWidth < 640 ? 24 : 32;
      setFitW(Math.max(200, Math.min(s.clientWidth - pad, (s.clientHeight - pad) / aspect)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(s);
    return () => ro.disconnect();
  }, [aspect]);
  const doc = useRef<{ url: string; pdf: Awaited<ReturnType<typeof openPdf>> } | null>(null);

  // Draw the PDF page (once per page, at a resolution that stays sharp when zoomed in).
  useEffect(() => {
    if (!isPdf) return;
    let live = true;
    setState('loading');
    (async () => {
      try {
        if (doc.current?.url !== url) {
          doc.current = { url, pdf: await openPdf(url) };
          onPages(doc.current.pdf.numPages);
        }
        const pg = await doc.current.pdf.getPage(Math.min(page, doc.current.pdf.numPages));
        const base = pg.getViewport({ scale: 1 });
        const scale = Math.min(4, 2600 / Math.max(base.width, base.height));
        const vp = pg.getViewport({ scale });
        const c = canvas.current;
        if (!c || !live) return;
        c.width = Math.round(vp.width);
        c.height = Math.round(vp.height);
        setAspect(vp.height / vp.width);
        await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        if (live) setState('ready');
      } catch {
        if (live) setState('error');
      }
    })();
    return () => {
      live = false;
    };
  }, [url, page, isPdf, onPages]);
  useEffect(() => {
    if (!isPdf) onPages(1);
  }, [isPdf, onPages]);

  // Zoom around a point (keeps what's under the cursor in place).
  const zoomAt = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const s = stage.current;
      if (!s) return setZoom(next);
      setZoom((z) => {
        const nz = Math.min(6, Math.max(1, next === -1 ? z / 1.25 : next === -2 ? z * 1.25 : next));
        const r = s.getBoundingClientRect();
        const px = (cx ?? r.left + r.width / 2) - r.left;
        const py = (cy ?? r.top + r.height / 2) - r.top;
        const fx = (s.scrollLeft + px) / (s.scrollWidth || 1);
        const fy = (s.scrollTop + py) / (s.scrollHeight || 1);
        requestAnimationFrame(() => {
          s.scrollLeft = fx * s.scrollWidth - px;
          s.scrollTop = fy * s.scrollHeight - py;
        });
        return nz;
      });
    },
    [setZoom],
  );
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? -1 : -2, e.clientX, e.clientY);
    };
    s.addEventListener('wheel', wheel, { passive: false });
    return () => s.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  // Drag to pan (mouse and pen; touch scrolls natively), click to tap.
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean; id: number } | null>(null);
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-plan-ui]')) return;
    const s = stage.current!;
    drag.current = { x: e.clientX, y: e.clientY, sl: s.scrollLeft, st: s.scrollTop, moved: false, id: e.pointerId };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    if (e.pointerType === 'touch') return;
    stage.current!.scrollLeft = d.sl - dx;
    stage.current!.scrollTop = d.st - dy;
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.id !== e.pointerId || state !== 'ready') return;
    const r = inner.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onTap(x, y);
  };

  return (
    <div className="relative flex-1 min-h-0 bg-teton-almost-white">
      <div
        ref={stage}
        className={`absolute inset-0 overflow-auto overscroll-contain ${scope ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="p-3 sm:p-4 w-max min-w-full">
          <div ref={inner} className="relative mx-auto bg-white shadow-sm" style={{ width: fitW ? fitW * zoom : '100%', aspectRatio: `1 / ${aspect}` }}>
            {isPdf ? (
              <canvas ref={canvas} className={`block w-full h-full transition-[filter] duration-200 ${scope ? 'grayscale-[.6]' : ''}`} aria-label={name} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={name}
                draggable={false}
                className={`block w-full h-full select-none transition-[filter] duration-200 ${scope ? 'grayscale-[.6]' : ''}`}
                onLoad={(e) => {
                  const im = e.currentTarget;
                  if (im.naturalWidth) setAspect(im.naturalHeight / im.naturalWidth);
                  setState('ready');
                }}
                onError={() => setState('error')}
              />
            )}
            {state === 'ready' && children}
          </div>
        </div>
      </div>
      {state !== 'ready' && (
        <p className="absolute inset-x-0 top-1/3 text-center text-sm text-teton-ui-gray pointer-events-none">{state === 'error' ? 'This file can’t be shown here. Download it to view it.' : 'Loading the floor plan…'}</p>
      )}
      {scope && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#3F8CEA] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white drawer-in">Scope Mode · click to tag</span>}
      <div data-plan-ui className="absolute right-3 top-3 flex flex-col rounded-lg border border-teton-off-white bg-white text-sm shadow-sm">
        <button type="button" className="w-8 h-8 hover:bg-teton-almost-white rounded-t-lg" aria-label="Zoom in" onClick={() => zoomAt(-2)}>+</button>
        <button type="button" className="w-8 h-8 hover:bg-teton-almost-white" aria-label="Zoom out" onClick={() => zoomAt(-1)}>−</button>
        <button type="button" className="w-8 h-8 hover:bg-teton-almost-white rounded-b-lg text-xs" aria-label="Fit to width" onClick={() => setZoom(1)}>⤢</button>
      </div>
    </div>
  );
}

/** A badge on the plan: click it, or drag it to nudge it into place. */
function PlacedBadge({
  x,
  y,
  color = '#3F8CEA',
  text,
  title,
  pending,
  faded,
  selected,
  size = 22,
  onClick,
  onMove,
}: {
  x: number;
  y: number;
  color?: string;
  text: string;
  title: string;
  pending?: boolean;
  faded?: boolean;
  selected?: boolean;
  size?: number;
  onClick: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const d = useRef<{ sx: number; sy: number; moved: boolean; id: number } | null>(null);
  const at = live ?? { x, y };
  const posFrom = (e: React.PointerEvent) => {
    const box = ref.current!.parentElement!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) };
  };
  return (
    <button
      ref={ref}
      type="button"
      data-plan-ui
      title={title}
      aria-label={title}
      className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 rounded-full touch-none transition-opacity duration-200 motion-reduce:transition-none ${faded ? 'opacity-35' : ''} ${selected ? 'ring-[3px] ring-teton-near-black/85 ring-offset-1' : ''}`}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        ref.current!.setPointerCapture(e.pointerId);
        d.current = { sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const g = d.current;
        if (!g || g.id !== e.pointerId) return;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
        g.moved = true;
        setLive(posFrom(e));
      }}
      onPointerUp={(e) => {
        const g = d.current;
        d.current = null;
        if (!g) return;
        if (g.moved) {
          const p = posFrom(e);
          setLive(null);
          onMove(p.x, p.y);
        } else onClick();
      }}
      onPointerCancel={() => {
        d.current = null;
        setLive(null);
      }}
    >
      {pending ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-white text-[#3F8CEA] font-extrabold border-2 border-dashed border-[#3F8CEA] shadow-[0_1px_3px_rgba(0,0,0,.3)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
        >
          {text}
        </span>
      ) : (
        <Badge color={color} text={text} size={size} />
      )}
    </button>
  );
}

/** A popover pinned beside a point on the plan (left of it on the right half), kept inside the plan. */
function Anchored({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const over = r.bottom - Math.min(box.bottom, window.innerHeight - 12);
    setShift(over > 0 ? -over : 0);
  }, [x, y]);
  const right = x > 0.55;
  return (
    <div
      ref={ref}
      data-plan-ui
      className="absolute z-20 w-[17rem] max-w-[80vw] cursor-auto drawer-in"
      style={{ top: `calc(${y * 100}% - 18px + ${shift}px)`, ...(right ? { right: `calc(${(1 - x) * 100}% + 18px)` } : { left: `calc(${x * 100}% + 18px)` }) }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

const card = 'rounded-xl border border-teton-off-white bg-white p-3 text-xs shadow-[0_12px_36px_rgba(0,0,0,.2)]';
const eyebrow = 'block text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray mt-2 mb-1';

/** A tagged room: its room type (move it to another), room number, remove; or edit its type. */
function MarkPopover({ type, types, mark, onRetype, onLabel, onRemove, onEdit, onClose }: { type: RoomType; types: RoomType[]; mark: RoomMark; onRetype: (to: string) => void; onLabel: (l: string) => void; onRemove: () => void; onEdit: () => void; onClose: () => void }) {
  const [label, setLabel] = useState(mark.label ?? '');
  const k = types.findIndex((t) => t.id === type.id);
  const b = badgeOf(type, k);
  return (
    <div className={card} role="dialog" aria-label="Tagged room">
      <div className="flex items-start gap-2">
        <Badge color={b.color} text={b.initials} size={24} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[13px] truncate">{mark.label ? `Room ${mark.label}` : 'Tagged room'}</p>
          <p className="text-[11px] text-teton-ui-gray truncate">{type.name || 'Room type'} · {CARE_LABEL[type.care] ?? 'Custom'} · {type.sensors} sensor{type.sensors === 1 ? '' : 's'}</p>
        </div>
        <button type="button" className="text-teton-ui-gray hover:text-teton-ink" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <label className={eyebrow} htmlFor={`rt-${mark.id}`}>Room type</label>
      <select id={`rt-${mark.id}`} className="input-field py-1.5 text-xs" value={type.id} onChange={(e) => onRetype(e.target.value)}>
        {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
      </select>
      <label className={eyebrow} htmlFor={`rn-${mark.id}`}>Room number (optional)</label>
      <input id={`rn-${mark.id}`} className="input-field py-1.5 text-xs" value={label} placeholder="e.g. 143" maxLength={16} onChange={(e) => setLabel(e.target.value)} onBlur={() => onLabel(label.trim())} onKeyDown={(e) => e.key === 'Enter' && onLabel(label.trim())} />
      <div className="flex items-center justify-between gap-2 mt-3">
        <button type="button" className="text-[11.5px] text-[#B23A26] underline" onClick={onRemove}>Remove this room</button>
        <button type="button" className="btn-secondary py-1 text-xs truncate max-w-[60%]" onClick={onEdit}>Edit “{type.name || 'Room type'}”…</button>
      </div>
    </div>
  );
}

/** A room type's details: name, badge initials, care setting, sensors per room, color. */
function TypeForm({
  title,
  sub,
  initial,
  index,
  types,
  submit,
  onSave,
  onCancel,
  onAddTo,
}: {
  title: string;
  sub?: string;
  initial?: RoomType;
  index: number;
  types: RoomType[];
  submit: string;
  onSave: (v: Omit<RoomType, 'id' | 'rooms' | 'marks'>) => void;
  onCancel: () => void;
  onAddTo?: (typeId: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [initials, setInitials] = useState(initial?.initials ?? '');
  const [care, setCare] = useState<CareType>(initial?.care && initial.care !== 'custom' ? initial.care : initial?.care === 'custom' ? 'custom' : 'al');
  const [sensors, setSensors] = useState<number>(initial?.sensors ?? 1);
  const [color, setColor] = useState(initial ? badgeOf(initial, index).color : nextBadgeColor(types));
  const [addTo, setAddTo] = useState('');
  const auto = initialsOf(name || 'Room type');
  const ok = name.trim().length > 0;
  return (
    <form
      className={`${card} w-[19rem] max-w-full`}
      role="dialog"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSave({
          name: name.trim(),
          care,
          sensors: Math.max(1, Math.min(20, Math.round(sensors) || 1)),
          color,
          ...(initials.trim() ? { initials: initials.trim().toUpperCase().slice(0, 3) } : { initials: undefined }),
          ...(care === 'custom' ? { customCare: initial?.customCare } : {}),
          ...(initial?.roomsFromPlan != null ? { roomsFromPlan: initial.roomsFromPlan } : {}),
        });
      }}
    >
      <p className="font-semibold text-[13px]">{title}</p>
      {sub && <p className="text-[11px] text-teton-ui-gray">{sub}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <div>
          <label className={eyebrow} htmlFor="tf-name">Room type / name</label>
          <input id="tf-name" className="input-field py-1.5 text-xs" value={name} placeholder="e.g. Studio" autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={eyebrow} htmlFor="tf-ini">Badge</label>
          <span className="flex items-center gap-1.5">
            <Badge color={color} text={(initials || auto).slice(0, 3)} size={22} />
            <input id="tf-ini" className="input-field py-1.5 px-1.5 text-xs uppercase min-w-0" value={initials} placeholder={auto} maxLength={3} onChange={(e) => setInitials(e.target.value.replace(/\s/g, ''))} aria-label="Badge initials" />
          </span>
        </div>
        <div>
          <label className={eyebrow} htmlFor="tf-care">Care setting</label>
          <select id="tf-care" className="input-field py-1.5 text-xs" value={care} onChange={(e) => setCare(e.target.value as CareType)}>
            {CARES.map((c) => <option key={c} value={c}>{CARE_LABEL[c]}</option>)}
            {care === 'custom' && <option value="custom">{initial?.customCare || 'Custom'}</option>}
          </select>
        </div>
        <div>
          <label className={eyebrow} htmlFor="tf-sen">Sensors / room</label>
          <NumInput id="tf-sen" value={sensors} onChange={(v) => setSensors(Math.max(1, v ?? 1))} min={1} max={20} aria-label="Sensors per room" />
        </div>
      </div>
      <span className={eyebrow}>Color</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Badge color">
        {BADGE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 border-white transition-shadow duration-150 ${color === c ? 'shadow-[0_0_0_2px_#16181D]' : 'shadow-[0_0_0_1px_#D9DCDF]'}`} style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 mt-3">
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary py-1 text-xs disabled:opacity-40" disabled={!ok}>{submit}</button>
      </div>
      {onAddTo && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-teton-off-white">
          <span className="text-[11px] text-teton-ui-gray whitespace-nowrap">or add to</span>
          <select className="input-field py-1 text-xs min-w-0" value={addTo} onChange={(e) => setAddTo(e.target.value)} aria-label="Add to an existing room type">
            <option value="">Choose a room type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
          </select>
          <button type="button" className="btn-secondary py-1 text-xs disabled:opacity-40" disabled={!addTo} onClick={() => addTo && onAddTo(addTo)}>Add</button>
        </div>
      )}
    </form>
  );
}
