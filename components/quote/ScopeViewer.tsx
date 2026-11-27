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
import { productsOf, type EcallOption, type QuoteDraft } from '@/lib/quote/draft';
import { Counter } from '@/components/form/Counter';
import { SegGroup } from '@/components/form/SegGroup';
import { AREA_COLOR, AreaForm, AreaMarker, type AreaFormValue } from './CommonAreasLayer';
import { describeScope, scopeChanges } from '@/lib/quote/scopeWork';
import { AREA_ABBR, areaSensors, normalizeCommonAreas, type CommonArea, badgeOf, BADGE_COLORS, bedKeyOf, CARE_LABEL, devicesLabel, careLabel, duplicateRoomNumbers, sensorsPerRoom, type CareProducts, initialsOf, roomTypeKey, nextBadgeColor, normalizeAllowance, type CareType, type RoomMark, type RoomType } from '@/lib/quote/roomTypes';
import { openPdf } from '@/lib/client/pdf';
import { NumInput } from '@/components/form/NumInput';
import { count } from '@/lib/format';
import { useRoomTypes } from './useRoomTypes';
import type { FloorPlanItem } from './FloorPlans';
import { useFloorPlans } from './FloorPlans';
import { useAccess } from './AccessContext';
import { NoteEditor, NoteMarker, NoteOnPlan, NotesDrawer, nextNoteColor, usePlanNotes, type NoteDraft } from './PlanNotes';
import type { PlanNote } from '@/lib/data/planNotes';
import { NOTE_DOT, TagCard, TagNoteSection, useTagNotes } from './TagNotes';
import { BulkEditTags, type BulkResult } from './BulkEditTags';
import { ScopeSummary } from './ScopeSummary';
import { matchNumbers, type NumberMatch, type PlanLabels } from '@/lib/quote/roomNumbers';
import { canAutoFocus } from '@/lib/client/focus';
import { careFromName, fillOf, groupByColor, labelsToTag, legendNames, nearestBadge, skippedWords, type Box, type PlanWord, type RGB } from '@/lib/quote/autoTag';
import { AutoDraftMarker, AutoTagPanel, type AutoState } from './AutoTag';

/** Where to look for a room's fill color around its number (0–1 of the page across, down). */
const FILL_SPOTS: Array<[number, number]> = [[-0.022, 0], [0.022, 0], [-0.014, 0.009], [0.014, 0.009], [-0.014, -0.009], [0.014, -0.009], [0, 0.012], [0, -0.012], [-0.03, 0.004], [0.03, 0.004]];
type Sampler = (x: number, y: number) => RGB | null;

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
  initialNotes = false,
  focusNote,
  onClose: closeViewer,
  onRemovePlan,
  onScopeChange,
}: {
  quoteId: number;
  communityId: string;
  /** This community's floor plans. */
  plans: FloorPlanItem[];
  initialPlanId?: number;
  initialScope?: boolean;
  /** Open with this room type picked out (others faded). */
  highlightType?: string;
  /** Open with the Notes drawer showing. */
  initialNotes?: boolean;
  /** Open the drawer at this note (null: general comments) and comment. */
  focusNote?: { noteId: number | null; commentId?: number };
  onClose: () => void;
  onRemovePlan: (id: number) => Promise<void>;
  /** Closing after scope counts changed: what changed, in words (to offer saving a version). */
  onScopeChange?: (text: string) => void;
}) {
  const { control, getValues, setValue } = useFormContext<QuoteDraft>();
  const communities = useWatch({ control, name: 'communities' });
  const index = (communities ?? []).findIndex((c) => c?.id === communityId);
  const community = index >= 0 ? communities[index] : null;
  const { types, write, current } = useRoomTypes(index);
  // The community's scope when the viewer opened: closing after counts changed offers to save a version.
  // (A copy: the form edits its values in place.)
  const [openedCopy] = useState(() => (community ? (JSON.parse(JSON.stringify(community)) as typeof community) : null));
  const opened = useRef(openedCopy);
  const onClose = useCallback(() => {
    const now = index >= 0 ? getValues(`communities.${index}`) : null;
    const ch = opened.current && now ? scopeChanges({ communities: [opened.current] } as QuoteDraft, { communities: [now] } as QuoteDraft)[0] : undefined;
    if (ch) onScopeChange?.(describeScope(ch));
    closeViewer();
  }, [index, getValues, onScopeChange, closeViewer]);
  // Products by care setting: rooms without resident monitoring get no sensors.
  // (E-Call counts only when the deal offers it.)
  const ecallSys = (useWatch({ control, name: 'commercial.ecall' }) ?? 'none') as EcallOption;
  const ecallOn = ecallSys !== 'none';
  const products = useMemo(() => {
    const p = productsOf(community ?? {});
    return ecallOn ? p : (Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, ecall: false }])) as CareProducts);
  }, [community, ecallOn]);
  const planIds = useMemo(() => plans.map((p) => p.id), [plans]);
  // ---- common areas (tagged ones are on a plan; others were typed in, in the community drawer) ----
  const areas = useMemo(() => normalizeCommonAreas(community?.commonAreas), [community?.commonAreas]);
  const ecallHere = ecallOn && (['il', 'al', 'mc', 'snf'] as const).some((k) => products[k].ecall);
  const writeAreas = (next: CommonArea[]) => index >= 0 && setValue(`communities.${index}.commonAreas`, next, { shouldDirty: true });
  const saveArea = (v: AreaFormValue) => {
    const d = areaDraft;
    if (!d) return;
    const base = { name: v.name, kind: v.kind, count: 1, pendants: v.pendants, ...(v.sensors ? { sensors: v.sensors } : {}), ...(v.note ? { note: v.note } : {}) };
    if (d.id) writeAreas(areas.map((a) => (a.id === d.id ? { id: a.id, ...base, ...(a.mark ? { mark: a.mark } : {}) } : a)));
    else writeAreas([...areas, { id: uid('ca'), ...base, mark: { plan: d.plan, page: d.page, x: d.x, y: d.y } }]);
    setAreaDraft(null);
  };

  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const anyMarks = types.some((t) => (t.marks ?? []).length);
  const [layer, setLayer] = useState(anyMarks || !!highlightType);
  const [scope, setScope] = useState(initialScope);
  const [focusType, setFocusType] = useState<string | null>(highlightType ?? null);
  const [pending, setPending] = useState<Pending[]>([]);
  // What a click tags in Scope Mode: rooms (badges for room types) or common areas (one square marker per space).
  const [tagWhat, setTagWhat] = useState<'rooms' | 'areas'>('rooms');
  // A common area being added (where it was clicked) or edited (its id).
  const [areaDraft, setAreaDraft] = useState<{ id?: string; plan: number; page: number; x: number; y: number } | null>(null);
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

  // ---- notes ----
  const fp = useFloorPlans();
  const acc = useAccess();
  const notesApi = usePlanNotes(quoteId, plan?.id);
  const [notesOpen, setNotesOpen] = useState(initialNotes || !!focusNote);
  const [noteMode, setNoteMode] = useState(false);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [drawerFocus, setDrawerFocus] = useState<{ noteId: number | null; commentId?: number; key: number } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  // ---- notes on tagged rooms, and the hover card ----
  const tagApi = useTagNotes(quoteId);
  const [pendingNote, setPendingNote] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [noteFilter, setNoteFilter] = useState(false);
  // The card was opened by a tap (phones): it takes taps and has an Edit button.
  const hoverTouch = useRef(false);
  // ---- selecting many tags (box or Shift-click) and editing them together ----
  const [selectTool, setSelectTool] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  // The Summary tab (next to the page tabs): the printed summary page instead of the plan.
  const [summaryOpen, setSummaryOpen] = useState(false);
  // The panel folded down to its header (a click on the plan does this, so nothing typed is lost).
  const [bulkMin, setBulkMin] = useState(false);
  const [rowHover, setRowHover] = useState<string | null>(null);
  // A row picked in the Edit tags panel: its tag stays bright, every other tag dims.
  const [rowActive, setRowActive] = useState<string | null>(null);
  // A duplicated room number picked out from the warning: only its tags stay bright.
  const [dupFocus, setDupFocus] = useState<string | null>(null);
  // The page to open when switching plans (to show a duplicate's tags there).
  const openAtPage = useRef<number | null>(null);
  // ---- room numbers read from the plan (once someone runs "Fill numbers from plan") ----
  const [planLabels, setPlanLabels] = useState<PlanLabels | null>(null);
  // ---- auto-tag: drag a box, tag every room number inside it ----
  const [autoTool, setAutoTool] = useState(false);
  const [auto, setAuto] = useState<AutoState | null>(null);
  const [autoUndo, setAutoUndo] = useState<{ marks: Set<string>; types: Set<string>; n: number } | null>(null);
  const sampler = useRef<Sampler | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [fillMsg, setFillMsg] = useState<string | null>(null);
  // Arriving from a notification: go to the note's page and open it in the drawer.
  const focused = useRef(false);
  useEffect(() => {
    if (!focusNote || focused.current) return;
    if (focusNote.noteId == null) {
      focused.current = true;
      setDrawerFocus({ noteId: null, commentId: focusNote.commentId, key: Date.now() });
      return;
    }
    const n = notesApi.notes.find((x) => x.id === focusNote.noteId);
    if (!n) return;
    focused.current = true;
    setPage(n.page);
    setDrawerFocus({ noteId: n.id, commentId: focusNote.commentId, key: Date.now() });
  }, [focusNote, notesApi.notes]);
  // Every note's triangle shows on its page; only notes set to show on the plan show their box.
  const notesHere = notesApi.notes.filter((n) => n.page === page && n.id !== noteDraft?.id);
  const startNote = (x: number, y: number) => {
    const w = 0.26;
    const h = 0.09;
    setNoteDraft({ page, x, y, box: { x: Math.min(1 - w, Math.max(0, x + 0.025)), y: Math.min(1 - h, Math.max(0, y - 0.02)), w, h }, body: '', roomTypeId: null, color: nextNoteColor(notesApi.notes), onPlan: true });
    setNoteMode(false);
  };
  const editNote = (n: PlanNote) => {
    setPage(n.page);
    setNoteDraft({ id: n.id, page: n.page, x: n.x, y: n.y, box: n.box, body: n.body, roomTypeId: n.roomTypeId, color: n.color, onPlan: n.onPlan });
    setNotesOpen(false);
  };
  const openNote = (n: PlanNote) => {
    setNotesOpen(true);
    setDrawerFocus({ noteId: n.id, key: Date.now() });
  };
  const saveNote = async () => {
    if (!noteDraft) return;
    setNoteSaving(true);
    try {
      if (noteDraft.id) await notesApi.update(noteDraft.id, noteDraft);
      else await notesApi.create(noteDraft);
      setNoteDraft(null);
    } catch {
      /* the error shows in the drawer */
    } finally {
      setNoteSaving(false);
    }
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmRemove) setConfirmRemove(false);
      else if (auto) setAuto(null);
      else if (bulk && !bulkMin) setBulkMin(true);
      else if (dupFocus) setDupFocus(null);
      else if (picked.size) setPicked(new Set());
      else if (noteDraft || noteMode) {
        setNoteDraft(null);
        setNoteMode(false);
      } else if (pop || editType || saving || menu || hover) {
        setPop(null);
        setHover(null);
        setEditType(null);
        setSaving(false);
        setMenu(false);
      } else onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, pop, editType, saving, menu, confirmRemove, noteDraft, noteMode, hover, bulk, bulkMin, picked, dupFocus, auto]);
  useEffect(() => {
    setPage(openAtPage.current ?? 1);
    openAtPage.current = null;
    setConfirmRemove(false);
    setPop(null);
    setHover(null);
    setNoteDraft(null);
    setPicked(new Set());
    setBulk(false);
    setFillMsg(null);
    setSummaryOpen(false);
    setAuto(null);
    setAutoUndo(null);
  }, [planId]);
  useEffect(() => {
    let live = true;
    setPlanLabels(null);
    if (!plan?.id) return;
    void fetch(`/api/quotes/${quoteId}/floorplans/${plan.id}/labels`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => live && setPlanLabels(b?.labels ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [quoteId, plan?.id]);

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
  const areasTaggedAll = areas.filter((a) => a.mark && planIds.includes(a.mark.plan));
  const areasHere = areas.filter((a) => a.mark && a.mark.plan === plan?.id && a.mark.page === page);
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
  const toMarks = (ps: Pending[]): RoomMark[] => {
    const at = new Date().toISOString().slice(0, 10);
    const by = notesApi.me?.name;
    const marks: RoomMark[] = ps.map((p) => ({ id: uid('mk'), plan: p.plan, page: p.page, x: p.x, y: p.y, at, ...(by ? { by } : {}) }));
    // Once the plan's numbers have been read, new tags take theirs (only clear, unambiguous ones).
    const m = numbersFor(marks);
    return marks.map((x) => (m.get(x.id)?.sure ? { ...x, label: m.get(x.id)!.t } : x));
  };
  // One note for every room just tagged (optional).
  const noteOnNew = (marks: RoomMark[]) => {
    const body = pendingNote.trim();
    setPendingNote('');
    if (body && marks.length) void tagApi.create(marks.map((m) => m.id), body).catch(() => {});
  };
  const saveNew = (t: Omit<RoomType, 'id' | 'rooms' | 'marks'>) => {
    const marks = toMarks(pending);
    update((list) => [...list, { ...t, id: uid('rt'), rooms: marks.length, marks, roomsFromPlan: true }]);
    noteOnNew(marks);
    setPending([]);
    setSaving(false);
    setLayer(true);
  };
  const addToType = (typeId: string) => {
    const marks = toMarks(pending);
    update((list) => list.map((t) => (t.id === typeId ? { ...t, marks: [...(t.marks ?? []), ...marks] } : t)));
    noteOnNew(marks);
    setPending([]);
    setSaving(false);
    setLayer(true);
  };
  /**
   * Remove this plan. With tagged rooms on it the rep chooses: keep the room types and their counts (as typed-in
   * numbers, the badges go) or discard every room type of the community (beds and extra sensors cleared too).
   */
  const removePlan = async (tagged: 'keep' | 'discard' | null) => {
    const list = current();
    if (tagged === 'keep')
      write(
        list.map((t) =>
          (t.marks ?? []).some((m) => m.plan === plan.id)
            ? { ...t, rooms: t.roomsFromPlan ? (t.marks ?? []).length : Number(t.rooms) || 0, roomsFromPlan: undefined, marks: (t.marks ?? []).filter((m) => m.plan !== plan.id) }
            : t,
        ),
      );
    if (tagged === 'discard' && index >= 0) {
      const opts = { shouldDirty: true } as const;
      setValue(`communities.${index}.roomTypes`, [], opts);
      for (const k of ['ilBeds', 'alBeds', 'mcBeds', 'snfBeds', 'additionalSensors'] as const) setValue(`communities.${index}.${k}`, 0, opts);
    }
    setPending((p) => p.filter((x) => x.plan !== plan.id));
    await onRemovePlan(plan.id);
  };
  const download = async (withNotes: boolean) => {
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
        notes: withNotes ? notesApi.notes : [],
        tagNotes: withNotes ? liveTagNotes : [],
        allowancePct: normalizeAllowance(getValues(`communities.${index}.sensorAllowancePct`)),
        products,
        areas,
        devices: ecallHere ? devicesLabel(ecallSys).toLowerCase() : null,
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${plan.name.replace(/\.[a-z0-9]+$/i, '')} - scope${withNotes ? ' with notes' : ''}.pdf`;
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
  const taggedHere = rows.reduce((s, r) => s + r.here, 0);
  const sensorsTagged = rows.reduce((s, r) => s + r.tagged * sensorsPerRoom(r.t, products), 0);
  // Typed-in room counts that don't match the rooms tagged for that type.
  const mismatches = rows.filter((r) => r.tagged > 0 && !r.t.roomsFromPlan && (Number(r.t.rooms) || 0) !== r.tagged);
  // Tagged rooms' numbers (for "also 126, 128"), and the notes on rooms that still exist.
  const markInfo = useMemo(() => {
    const m = new Map<string, { label: string | null; typeId: string }>();
    for (const t of types) for (const x of t.marks ?? []) m.set(x.id, { label: x.label ?? null, typeId: t.id });
    return m;
  }, [types]);
  const labelOf = useCallback((id: string) => markInfo.get(id)?.label ?? null, [markInfo]);
  const liveTagNotes = tagApi.notes.map((n) => ({ ...n, markIds: n.markIds.filter((id) => markInfo.has(id)) })).filter((n) => n.markIds.length);
  const notedMarks = new Set(liveTagNotes.flatMap((n) => n.markIds));
  const notesOfMark = (id: string) => liveTagNotes.filter((n) => n.markIds.includes(id));

  // ---- room numbers from the plan ----
  /** The number each of these tags (on this plan, without a number) would take from what was read. */
  function numbersFor(marks: RoomMark[], labels: PlanLabels | null = planLabels): Map<string, NumberMatch> {
    const out = new Map<string, NumberMatch>();
    if (!labels || !plan) return out;
    const all = current().flatMap((t) => t.marks ?? []).filter((m) => m.plan === plan.id);
    const taken = new Set(all.map((m) => m.label?.trim()).filter(Boolean) as string[]);
    const want = marks.filter((m) => m.plan === plan.id && !m.label?.trim());
    for (const pg of new Set(want.map((m) => m.page))) {
      const lp = labels.pages[String(pg)];
      if (!lp) continue;
      for (const [k, v] of matchNumbers(want.filter((m) => m.page === pg), lp, taken)) out.set(k, v);
    }
    return out;
  }
  /** Read the plan's numbers (the first time) and save them with the plan. */
  const ensureLabels = async (): Promise<PlanLabels | null> => {
    if (planLabels) return planLabels;
    try {
      const { readRoomNumbers } = await import('@/lib/client/readRoomNumbers');
      setReading('Loading the number reader…');
      const labels = await readRoomNumbers({ url, mime: plan.mime, pages, onProgress: (p, n) => setReading(`Reading room numbers · page ${p} of ${n}…`) });
      const r = await fetch(`/api/quotes/${quoteId}/floorplans/${plan.id}/labels`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(labels) });
      const saved = r.ok ? ((await r.json()).labels as PlanLabels) : labels;
      setPlanLabels(saved);
      return saved;
    } catch {
      setFillMsg('Couldn’t read the numbers on this plan');
      return null;
    } finally {
      setReading(null);
    }
  };
  const fromPlanFor = async (ids: string[]): Promise<Map<string, NumberMatch> | null> => {
    const labels = await ensureLabels();
    if (!labels) return null;
    const set = new Set(ids);
    return numbersFor(current().flatMap((t) => t.marks ?? []).filter((m) => set.has(m.id)), labels);
  };
  /** Fill every tag on this plan that has no number with a clear match; the rest are left for the rep. */
  const fillFromPlan = async () => {
    setFillMsg(null);
    const marks = current().flatMap((t) => t.marks ?? []).filter((m) => m.plan === plan.id && !m.label?.trim());
    if (!marks.length) return setFillMsg('Every tagged room on this plan already has a number.');
    const m = await fromPlanFor(marks.map((x) => x.id));
    if (!m) return;
    const sure = new Map([...m].filter(([, v]) => v.sure).map(([k, v]) => [k, v.t]));
    if (sure.size) update((list) => list.map((t) => ({ ...t, marks: t.marks?.map((x) => (sure.has(x.id) ? { ...x, label: sure.get(x.id) } : x)) })));
    const check = m.size - sure.size;
    const none = marks.length - m.size;
    setFillMsg(`${count(sure.size)} filled from the plan${check ? ` · ${count(check)} to check (click a tag to see)` : ''}${none ? ` · ${count(none)} not found` : ''}`);
  };

  // ---- auto-tag ----
  /** The words on this page of a PDF with text (for the legend's names and what was skipped); none for scans. */
  const pageWords = async (): Promise<PlanWord[]> => {
    if (plan.mime !== 'application/pdf') return [];
    try {
      const pdf = await openPdf(url);
      const pg = await pdf.getPage(page);
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      const out: PlanWord[] = [];
      for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
        if (!it.str?.trim() || !it.transform) continue;
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = Math.hypot(it.transform[2], it.transform[3]) || 8;
        out.push({ str: it.str, x: x / vp.width, y: (y - h / 2) / vp.height, h: h / vp.height });
      }
      return out;
    } catch {
      return [];
    }
  };
  const runAuto = async (box: Box) => {
    setAutoUndo(null);
    setPop(null);
    setHover(null);
    setAuto({ page, busy: planLabels ? 'Finding room numbers…' : 'Reading the room numbers on this plan…', items: [], groups: [], skipped: [], exact: false });
    const labels = await ensureLabels();
    if (!labels) return setAuto(null);
    const lp = labels.pages[String(page)];
    const all = current().flatMap((t) => t.marks ?? []).filter((m) => m.plan === plan.id);
    const taken = new Set(all.map((m) => m.label?.trim()).filter(Boolean) as string[]);
    const found = lp ? labelsToTag(lp, box, all.filter((m) => m.page === page), taken) : [];
    const sample = sampler.current;
    const colored = found.map((l, i) => ({ ...l, id: `af${i}`, color: sample ? fillOf(FILL_SPOTS.map(([dx, dy]) => sample(l.x + dx, l.y + dy))) : null }));
    const { items, groups } = groupByColor(colored);
    // Hardly any colored rooms: treat them all as one group (a plan without a color legend).
    const colorful = groups.filter((g) => g.color).reduce((n, g) => n + g.count, 0);
    const oneGroup = colorful < Math.max(2, items.length * 0.4);
    const words = await pageWords();
    const swatched = sample ? words.map((w) => ({ ...w, swatch: sample(w.x - Math.max(0.006, w.h * 0.9), w.y), beyond: sample(w.x - Math.max(0.02, w.h * 2.8), w.y), bg: sample(w.x + 0.003, w.y - w.h * 0.85) })) : [];
    const names = oneGroup ? {} : legendNames(swatched, groups);
    const byName = (n: string) => current().find((t) => (t.name || '').trim().toLowerCase() === n.trim().toLowerCase());
    const finalGroups = (oneGroup ? [{ key: 'all', color: null, count: items.length }] : groups).map((g, k) => {
      const name = names[g.key] ?? null;
      const match = name ? byName(name) : undefined;
      return {
        key: g.key,
        color: g.color,
        name,
        target: match ? match.id : g.key === 'none' && types.length ? types[0].id : 'new',
        newName: name ?? (oneGroup || g.key === 'none' ? '' : `Room type ${k + 1}`),
        care: careFromName(name ?? ''),
        sensors: 1,
      };
    });
    setAuto({
      page,
      busy: null,
      items: items.map((i) => ({ ...i, group: oneGroup ? 'all' : i.group })),
      groups: finalGroups,
      skipped: skippedWords(words, box, new Set(Object.values(names).map((n) => n.toLowerCase()))),
      exact: words.length > 0 && found.length > 0 && found.every((l) => l.sure),
    });
  };
  const placeAuto = () => {
    if (!auto) return;
    const at = new Date().toISOString().slice(0, 10);
    const by = notesApi.me?.name;
    let next = [...current()];
    const ids = new Set<string>();
    const created = new Set<string>();
    const used = next.map((t, k) => badgeOf(t, k).color);
    for (const g of auto.groups) {
      if (g.target === 'skip') continue;
      const its = auto.items.filter((i) => i.group === g.key && !i.off);
      if (!its.length) continue;
      const marks: RoomMark[] = its.map((i) => ({ id: uid('mk'), plan: plan.id, page: auto.page, x: i.x, y: i.y, at, ...(by ? { by } : {}), ...(i.sure ? { label: i.t } : {}) }));
      marks.forEach((m) => ids.add(m.id));
      let to = g.target;
      if (to === 'new') {
        const name = g.newName.trim().slice(0, 60) || 'Room type';
        const same = next.find((t) => roomTypeKey(t) === roomTypeKey({ name, care: g.care }));
        if (same) to = same.id;
        else {
          const color = nearestBadge(g.color, used);
          used.push(color);
          const t: RoomType = { id: uid('rt'), name, care: g.care, rooms: marks.length, sensors: Number.isFinite(g.sensors) ? g.sensors : 1, marks, roomsFromPlan: true, color };
          created.add(t.id);
          next = [...next, t];
          continue;
        }
      }
      next = next.map((t) => (t.id === to ? { ...t, marks: [...(t.marks ?? []), ...marks] } : t));
    }
    write(next);
    setAutoUndo({ marks: ids, types: created, n: ids.size });
    setAuto(null);
    setLayer(true);
  };
  const undoAuto = () => {
    if (!autoUndo) return;
    write(
      current()
        .map((t) => ({ ...t, marks: (t.marks ?? []).filter((m) => !autoUndo.marks.has(m.id)) }))
        .filter((t) => !(autoUndo.types.has(t.id) && !(t.marks ?? []).length)),
    );
    setAutoUndo(null);
  };

  // ---- many tags at once ----
  const pickBox = (b: { x0: number; y0: number; x1: number; y1: number; rx: number; ry: number }, add: boolean) => {
    const hit = placed.filter((m) => !(focusType && focusType !== m.typeId) && m.x + b.rx >= b.x0 && m.x - b.rx <= b.x1 && m.y + b.ry >= b.y0 && m.y - b.ry <= b.y1).map((m) => m.id);
    setPicked((p) => new Set(add ? [...p, ...hit] : hit));
    setPop(null);
    setHover(null);
  };
  const applyBulk = (r: BulkResult) => {
    const gone = new Set(r.remove.map((x) => x.id));
    const ch = new Map(r.marks.map((x) => [x.id, x]));
    update((list) => {
      const moving: Array<{ to: string; mark: RoomMark }> = [];
      const kept = list.map((t) => ({
        ...t,
        marks: (t.marks ?? []).flatMap((m) => {
          if (gone.has(m.id)) return [];
          const c = ch.get(m.id);
          if (!c) return [m];
          const next = { ...m, label: c.label || undefined };
          if (c.typeId !== t.id) {
            moving.push({ to: c.typeId, mark: next });
            return [];
          }
          return [next];
        }),
      }));
      return kept.map((t) => ({ ...t, marks: [...(t.marks ?? []), ...moving.filter((x) => x.to === t.id).map((x) => x.mark)] }));
    });
    if (gone.size) setPicked(new Set());
  };
  const pickedRows = types.flatMap((t) => (t.marks ?? []).filter((m) => picked.has(m.id)).map((mark) => ({ mark, typeId: t.id }))).sort((a, b) => a.mark.page - b.mark.page || a.mark.y - b.mark.y || a.mark.x - b.mark.x);
  const popSuggest = pop && !bulk ? (() => {
    const m = types.find((t) => t.id === pop.typeId)?.marks?.find((x) => x.id === pop.markId);
    return m && !m.label ? numbersFor([m]).get(m.id)?.t : undefined;
  })() : undefined;
  // The same room number on two or more tagged rooms (any of this community's plans).
  const dups = useMemo(() => duplicateRoomNumbers(types, planIds), [types, planIds]);
  const dupShown = dups.find((d) => d.label === dupFocus) ?? null;
  const dupIds = dupShown ? new Set(dupShown.marks.map((m) => m.id)) : null;
  /** Where a duplicate's tags are: "Page 1 and Page 3", with the plan's name when it's another plan. */
  const whereDup = (d: (typeof dups)[number]) => {
    const spots = [...new Set(d.marks.map((m) => `${m.plan}:${m.page}`))].map((k) => {
      const [pl, pg] = k.split(':').map(Number);
      const name = pl === plan?.id ? '' : `${plans.find((x) => x.id === pl)?.name ?? 'another plan'} · `;
      return `${name}Page ${pg}`;
    });
    if (spots.length === 1) return `all on ${spots[0]}`;
    return `on ${spots.slice(0, -1).join(', ')} and ${spots[spots.length - 1]}`;
  };
  const showDup = (label: string | null) => {
    setDupFocus(label);
    const d = dups.find((x) => x.label === label);
    if (!d) return;
    setLayer(true);
    setSummaryOpen(false);
    // Go to its tags when none are on the page showing.
    if (!d.marks.some((m) => m.plan === plan?.id && m.page === page)) {
      const m = d.marks.find((x) => x.plan === plan?.id) ?? d.marks[0];
      if (m.plan !== plan?.id) {
        openAtPage.current = m.page;
        setPlanId(m.plan);
      } else setPage(m.page);
    }
  };
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
          {showSaved && tagWhat === 'rooms' && (
            <button
              type="button"
              aria-pressed={selectTool}
              title="Drag a box over tags to edit them together (or hold Shift and drag)"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 drawer-in ${selectTool ? 'bg-[#E8F1FD] border-[#3F8CEA] text-[#1F5FB5]' : 'border-teton-pale-gray bg-white hover:bg-teton-almost-white'}`}
              onClick={() => { setSelectTool((v) => !v); setAutoTool(false); setAuto(null); setNoteMode(false); setPop(null); }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="2.5 2" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5" /></svg>
              Select
            </button>
          )}
          {scope && acc.scope && tagWhat === 'rooms' && (
            <button
              type="button"
              aria-pressed={autoTool}
              title="Drag a box over part of the plan to tag every room number inside it"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 drawer-in ${autoTool ? 'bg-[#E8F1FD] border-[#3F8CEA] text-[#1F5FB5]' : 'border-teton-pale-gray bg-white hover:bg-teton-almost-white'}`}
              onClick={() => { setAutoTool((v) => !v); setSelectTool(false); setNoteMode(false); setPending([]); setSaving(false); setPop(null); setAuto(null); }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5" strokeDasharray="2.5 2" /><path d="M8 4.5l.9 1.9 2.1.3-1.5 1.5.4 2.1L8 9.3l-1.9 1 .4-2.1L5 6.7l2.1-.3z" fill="currentColor" stroke="none" /></svg>
              Auto-tag
            </button>
          )}
          {acc.scope && <Toggle on={scope} onChange={(v) => { setScope(v); setPop(null); setAreaDraft(null); if (!v) { setSaving(false); setNoteMode(false); setNoteDraft(null); setAutoTool(false); setAuto(null); setTagWhat('rooms'); } }} label="Scope Mode" accent />}
          {scope && acc.scope && (
            <span className="drawer-in">
              <SegGroup className="relative inline-flex rounded-lg bg-teton-almost-white p-0.5" thumbClass="bg-white rounded-md shadow-[0_1px_2px_rgba(0,0,0,.12)]" label="What a click tags">
                {(
                  [
                    ['rooms', 'Rooms'],
                    ['areas', 'Common areas'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={tagWhat === v}
                    onClick={() => { setTagWhat(v); setPending([]); setSaving(false); setPop(null); setAreaDraft(null); setAutoTool(false); setAuto(null); setSelectTool(false); setNoteMode(false); }}
                    className={`relative z-[1] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-200 ${tagWhat === v ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`}
                  >
                    {v === 'areas' && <span className="mr-1" style={{ color: AREA_COLOR }} aria-hidden="true">◆</span>}
                    {l}
                  </button>
                ))}
              </SegGroup>
            </span>
          )}
          {/* Notes: with Scope Mode on, or always for people who can't use Scope Mode (anyone can add notes). */}
          {(scope || !acc.scope) && (
            <button
              type="button"
              aria-pressed={noteMode}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors duration-200 drawer-in ${noteMode ? 'bg-[#E0A21B] border-[#E0A21B] text-white' : 'bg-[#FFF6DD] border-[#E9C46A] text-[#8A5A00] hover:bg-[#FFEFC2]'}`}
              onClick={() => { setNoteMode((m) => !m); setAutoTool(false); setAuto(null); setNoteDraft(null); setPending([]); setSaving(false); setPop(null); }}
            >
              + Note
            </button>
          )}
          <button type="button" className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 ${notesOpen ? 'bg-teton-near-black border-teton-near-black text-white' : 'border-teton-pale-gray bg-white hover:bg-teton-almost-white'}`} aria-pressed={notesOpen} onClick={() => setNotesOpen((o) => !o)}>
            Notes
            <span className="inline-flex min-w-[16px] h-4 px-1 items-center justify-center rounded-full bg-[#3F8CEA] text-white text-[9.5px] font-bold leading-none">{notesApi.notes.length}</span>
          </button>
          <div className="relative">
            <button type="button" className="btn-secondary py-1 text-xs" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              Download ▾
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full mt-1 z-[45] w-64 rounded-lg border border-teton-off-white bg-white p-1 shadow-lg text-xs drawer-in">
                <a role="menuitem" className="block rounded-md px-2.5 py-2 hover:bg-teton-almost-white" href={`${url}?download=1`} onClick={() => setMenu(false)}>
                  Download plan<span className="block text-[11px] text-teton-ui-gray">The original file</span>
                </a>
                <button type="button" role="menuitem" className="block w-full text-left rounded-md px-2.5 py-2 hover:bg-teton-almost-white" onClick={() => void download(true)}>
                  Download with scope badges and notes<span className="block text-[11px] text-teton-ui-gray">PDF · badges, note tags and notes on each page; a summary page with the notes table</span>
                </button>
                <button type="button" role="menuitem" className="block w-full text-left rounded-md px-2.5 py-2 hover:bg-teton-almost-white" onClick={() => void download(false)}>
                  Download with scope badges, no notes<span className="block text-[11px] text-teton-ui-gray">PDF · badges and a legend on each page, and a summary page; no notes anywhere</span>
                </button>
              </div>
            )}
          </div>
          {(acc.inputs || acc.scope) && <button type="button" className={btn} onClick={() => setConfirmRemove(true)}>Remove</button>}
          <button type="button" className="btn-ghost py-1" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {confirmRemove && (
          <RemoveDialog
            planName={plan.name}
            communityName={community?.name || 'this community'}
            tagged={rows.reduce((n, r) => n + r.here, 0)}
            typeCount={types.length}
            onCancel={() => setConfirmRemove(false)}
            onRemove={removePlan}
          />
        )}

        {/* Plans and pages */}
        {(
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
                  <button key={n} type="button" onClick={() => { setPage(n); setPop(null); setSummaryOpen(false); }} aria-pressed={page === n && !summaryOpen} className={`px-2.5 py-1.5 rounded-t-lg transition-colors duration-200 ${page === n && !summaryOpen ? 'bg-teton-almost-white font-semibold text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`}>
                    Page {n}{tagged ? <span className="ml-1 text-[10px] text-teton-ui-gray">· {tagged}</span> : null}
                  </button>
                );
              })}
            {pages <= 1 && (
              <button type="button" onClick={() => setSummaryOpen(false)} aria-pressed={!summaryOpen} className={`px-2.5 py-1.5 rounded-t-lg transition-colors duration-200 ${!summaryOpen ? 'bg-teton-almost-white font-semibold text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`}>
                Plan
              </button>
            )}
            <button
              type="button"
              onClick={() => { setSummaryOpen(true); setPop(null); setHover(null); setBulkMin(true); }}
              aria-pressed={summaryOpen}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-t-lg transition-colors duration-200 ${summaryOpen ? 'bg-teton-almost-white font-semibold text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Summary
            </button>
          </div>
        )}

        {/* The same room number on more than one tag */}
        {dups.length > 0 && (
          <div className="mx-3 sm:mx-4 mt-2 rounded-lg bg-[#FFF4DC] border border-[#F0C770] px-3 py-2 text-xs space-y-1 drawer-in" role="status" aria-label="Possible duplicate room numbers">
            {dups.map((d) => {
              const on = dupFocus === d.label;
              return (
                <p key={d.label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#6B4A00]">
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#C98A00]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M8.26 3.1c.77-1.33 2.7-1.33 3.47 0l6.28 10.9c.77 1.33-.2 3-1.73 3H3.72c-1.54 0-2.5-1.67-1.73-3l6.27-10.9zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                  <span>
                    <b>Possible duplicate:</b> room <b>{d.label}</b> is on {d.marks.length} tags, {whereDup(d)}.
                  </span>
                  <button type="button" aria-pressed={on} className={`rounded-md border px-2 py-0.5 font-medium transition-colors duration-200 ${on ? 'bg-[#6B4A00] border-[#6B4A00] text-white' : 'border-[#E0B04A] bg-white hover:bg-[#FFF8E6]'}`} onClick={() => showDup(on ? null : d.label)}>
                    {on ? 'Show all tags' : 'Show them'}
                  </button>
                </p>
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
        {summaryOpen && (
          <ScopeSummary
            planId={plan.id}
            planName={plan.name}
            communityName={community?.name || 'Community'}
            types={types}
            notes={notesApi.notes}
            tagNotes={liveTagNotes}
            allowancePct={normalizeAllowance(community?.sensorAllowancePct)}
            products={products}
            areas={areas}
            devices={ecallHere ? devicesLabel(ecallSys).toLowerCase() : null}
          />
        )}
        <PlanStage
          url={url}
          mime={plan.mime}
          name={plan.name}
          page={page}
          zoom={zoom}
          setZoom={setZoom}
          onPages={setPages}
          scope={scope}
          modeLabel={noteMode ? 'Note · click the spot it’s about' : undefined}
          marquee={(selectTool && showSaved) || (autoTool && scope)}
          marqueeLabel={autoTool ? 'Auto-tag · drag a box over rooms' : undefined}
          sampler={sampler}
          onBox={(b, add) => {
            if (autoTool && scope) {
              if (!auto?.busy) void runAuto(b);
              return;
            }
            // The tags being edited stay as they are while the panel is open.
            if (bulk) return setBulkMin(true);
            if (showSaved) pickBox(b, add);
          }}
          onTap={(x, y) => {
            if (noteDraft) return;
            if (autoTool && scope) return;
            if (bulk && !bulkMin) {
              setBulkMin(true);
              return;
            }
            if (selectTool) {
              if (bulk) return;
              setPicked(new Set());
              return;
            }
            if (hover && hoverTouch.current) {
              setHover(null);
              return;
            }
            if (noteMode) return startNote(x, y);
            if (areaDraft) return setAreaDraft(null);
            if (scope && tagWhat === 'areas') {
              setPop(null);
              setEditType(null);
              setMenu(false);
              return setAreaDraft({ plan: plan.id, page, x, y });
            }
            if (pop || editType || menu) {
              setPop(null);
              setEditType(null);
              setMenu(false);
              return;
            }
            if (scope && !saving) setPending((p) => [...p, { id: uid('pd'), plan: plan.id, page, x, y }]);
          }}
        >
          {notesHere.map((n) => (
            <NoteMarker key={`m${n.id}`} color={n.color} n={n.number} x={n.x} y={n.y} size={size} onClick={() => openNote(n)} />
          ))}
          {notesHere.filter((n) => n.onPlan).map((n) => (
            <NoteOnPlan
              key={`n${n.id}`}
              note={n}
              types={types}
              size={size}
              highlight={flash === n.id}
              onOpen={() => (n.mine ? editNote(n) : openNote(n))}
              onMove={(box) => void notesApi.update(n.id, { box })}
            />
          ))}
          {noteDraft && noteDraft.page === page && (
            <>
              <NoteMarker color={noteDraft.color} n={noteDraft.id ? notesApi.notes.find((x) => x.id === noteDraft.id)?.number ?? '' : (notesApi.notes.reduce((m, x) => Math.max(m, x.number), 0) + 1)} x={noteDraft.x} y={noteDraft.y} size={size} />
              <NoteEditor
                draft={noteDraft}
                number={noteDraft.id ? notesApi.notes.find((x) => x.id === noteDraft.id)?.number ?? 0 : notesApi.notes.reduce((m, x) => Math.max(m, x.number), 0) + 1}
                me={notesApi.me}
                types={types}
                size={size}
                saving={noteSaving}
                onChange={setNoteDraft}
                onCancel={() => setNoteDraft(null)}
                onSave={saveNote}
                onDelete={noteDraft.id ? () => void notesApi.remove(noteDraft.id as number).then(() => setNoteDraft(null)) : undefined}
              />
            </>
          )}
          {showSaved &&
            placed.map((m) => (
              <PlacedBadge
                key={m.id}
                x={m.x}
                y={m.y}
                color={m.color}
                text={m.initials}
                title={`${types.find((t) => t.id === m.typeId)?.name || 'Room type'}${m.label ? ` · ${m.label}` : ''}`}
                faded={rowActive ? rowActive !== m.id : dupIds ? !dupIds.has(m.id) : (scope && tagWhat === 'areas') || (scope && pendingHere.length > 0) || (!!focusType && focusType !== m.typeId) || (noteFilter && !notedMarks.has(m.id))}
                selected={pop?.markId === m.id}
                size={size}
                dot={notedMarks.has(m.id)}
                picked={picked.has(m.id) || rowHover === m.id}
                onHover={(on) => {
                  hoverTouch.current = false;
                  setHover((h) => (on ? m.id : h === m.id ? null : h));
                }}
                onClick={(touch, shift) => {
                  if (bulk && !bulkMin) {
                    setBulkMin(true);
                    return;
                  }
                  // Select tool or Shift-click: add it to (or take it out of) the selection (not while editing it).
                  if ((selectTool || shift) && !bulk) {
                    setPicked((p) => {
                      const n = new Set(p);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    });
                    setPop(null);
                    setHover(null);
                    return;
                  }
                  // On a phone the first tap shows the details card; its Edit button opens the popover.
                  if (touch && hover !== m.id && pop?.markId !== m.id) {
                    hoverTouch.current = true;
                    setPop(null);
                    setHover(m.id);
                    return;
                  }
                  setHover(null);
                  setPop({ typeId: m.typeId, markId: m.id });
                  setEditType(null);
                  setMenu(false);
                }}
                onMove={(x, y) => acc.scope && moveMark(m.typeId, m.id, x, y)}
              />
            ))}
          {auto && auto.page === page &&
            auto.items.map((i) => (
              <AutoDraftMarker
                key={i.id}
                item={i}
                color={auto.groups.find((g) => g.key === i.group)?.color ?? null}
                onToggle={() => setAuto((a) => (a ? { ...a, items: a.items.map((x) => (x.id === i.id ? { ...x, off: !x.off } : x)) } : a))}
              />
            ))}
          {(showSaved || tagWhat === 'areas') &&
            areasHere.map((a) => (
              <AreaMarker
                key={a.id}
                area={a}
                x={a.mark!.x}
                y={a.mark!.y}
                size={size}
                faded={scope && tagWhat === 'rooms'}
                selected={areaDraft?.id === a.id}
                onClick={() => {
                  setPop(null);
                  setEditType(null);
                  setHover(null);
                  setAreaDraft({ id: a.id, plan: a.mark!.plan, page: a.mark!.page, x: a.mark!.x, y: a.mark!.y });
                }}
                onMove={acc.scope ? (x, y) => writeAreas(areas.map((z) => (z.id === a.id && z.mark ? { ...z, mark: { ...z.mark, x, y } } : z))) : undefined}
              />
            ))}
          {areaDraft && areaDraft.plan === plan.id && areaDraft.page === page && (
            <>
              {!areaDraft.id && (
                <span data-plan-ui className="absolute -translate-x-1/2 -translate-y-1/2 z-10 rounded-[5px] border-2 border-dashed bg-white [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]" style={{ left: `${areaDraft.x * 100}%`, top: `${areaDraft.y * 100}%`, width: size, height: size, borderColor: AREA_COLOR }} />
              )}
              <Anchored x={areaDraft.x} y={areaDraft.y}>
                <AreaForm
                  key={areaDraft.id ?? `${areaDraft.x},${areaDraft.y}`}
                  initial={areaDraft.id ? areas.find((a) => a.id === areaDraft.id) : undefined}
                  ecall={ecallSys}
                  ecallHere={ecallHere}
                  readOnly={!acc.scope}
                  onSave={saveArea}
                  onRemove={areaDraft.id ? () => { writeAreas(areas.filter((a) => a.id !== areaDraft.id)); setAreaDraft(null); } : undefined}
                  onCancel={() => setAreaDraft(null)}
                />
              </Anchored>
            </>
          )}
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
                readOnly={!acc.scope}
                onRetype={(to) => retypeMark(popType.id, to, popMark.id)}
                onLabel={(l) => labelMark(popType.id, popMark.id, l)}
                onRemove={() => removeMark(popType.id, popMark.id)}
                onEdit={() => setEditType(popType.id)}
                onClose={() => setPop(null)}
                suggest={popSuggest}
                products={products}
              >
                <TagNoteSection api={tagApi} markId={popMark.id} me={notesApi.me} labelOf={labelOf} />
              </MarkPopover>
            </Anchored>
          )}
          {showSaved && hover && hover !== pop?.markId && !editType && (() => {
            const m = placed.find((x) => x.id === hover);
            const k = m ? types.findIndex((t) => t.id === m.typeId) : -1;
            if (!m || k < 0) return null;
            const t = types[k];
            return (
              <Anchored x={m.x} y={m.y} passive={!hoverTouch.current}>
                <TagCard
                  type={t}
                  index={k}
                  mark={m}
                  community={community}
                  taggedOfType={(t.marks ?? []).filter((x) => planIds.includes(x.plan)).length}
                  notes={notesOfMark(m.id)}
                  labelOf={labelOf}
                  onEdit={hoverTouch.current ? () => { setHover(null); setPop({ typeId: m.typeId, markId: m.id }); } : undefined}
                />
              </Anchored>
            );
          })()}
          {editType && popMark && (
            <Anchored x={popMark.x} y={popMark.y}>
              <TypeForm
                products={products}
                ecall={ecallSys}
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

        <NotesDrawer
          api={notesApi}
          types={types}
          pages={pages}
          open={notesOpen}
          focus={drawerFocus}
          onClose={() => setNotesOpen(false)}
          onEdit={editNote}
          onGoTo={(n) => {
            setPage(n.page);
            setFlash(n.id);
            setTimeout(() => setFlash(null), 1800);
          }}
        />
        {/* Tags picked with the box or Shift-click */}
        {picked.size > 0 && !bulk && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 max-w-[calc(100%-1.5rem)]">
            <div className="flex items-center gap-2 rounded-xl bg-teton-near-black text-white pl-3.5 pr-2 py-2 text-xs shadow-xl whitespace-nowrap drawer-in">
              <b>{count(picked.size)} tag{picked.size === 1 ? '' : 's'} selected</b>
              <button type="button" className="rounded-md border border-white/30 px-2 py-1 hover:bg-white/10" onClick={() => setPicked(new Set())}>Clear</button>
              <button type="button" className="rounded-md bg-[#3F8CEA] px-2.5 py-1 font-medium hover:brightness-110" onClick={() => { setBulk(true); setBulkMin(false); setPop(null); setHover(null); }}>Edit {count(picked.size)} tag{picked.size === 1 ? '' : 's'}…</button>
            </div>
          </div>
        )}
        {bulk && pickedRows.length > 0 && (
          <BulkEditTags
            rows={pickedRows}
            types={types}
            notes={tagApi}
            canScope={acc.scope}
            busy={reading}
            onFromPlan={fromPlanFor}
            onHover={setRowHover}
            active={rowActive}
            onActive={(id) => {
              setRowActive(id);
              // Its tag may be on another page of the plan.
              const m = id ? pickedRows.find((r) => r.mark.id === id)?.mark : null;
              if (m && m.page !== page) setPage(m.page);
            }}
            onSave={applyBulk}
            onClose={() => { setBulk(false); setBulkMin(false); setRowHover(null); setRowActive(null); }}
            minimized={bulkMin}
            onMinimize={setBulkMin}
          />
        )}
        {scope && auto && (
          <div className="absolute right-3 bottom-3 z-30 max-w-[calc(100%-1.5rem)]">
            <AutoTagPanel state={auto} types={types} onChange={setAuto} onPlace={placeAuto} onCancel={() => setAuto(null)} />
          </div>
        )}
        {scope && !auto && !noteMode && !noteDraft && !picked.size && !bulk && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 max-w-[calc(100%-1.5rem)]">
            {autoUndo ? (
              <div className="flex items-center gap-2 rounded-xl bg-teton-near-black text-white pl-3.5 pr-2 py-2 text-xs shadow-xl whitespace-nowrap drawer-in" role="status">
                <b>Placed {count(autoUndo.n)} tag{autoUndo.n === 1 ? '' : 's'}</b>
                <button type="button" className="rounded-md border border-white/30 px-2 py-1 hover:bg-white/10" onClick={undoAuto}>Undo</button>
                <button type="button" className="text-white/60 hover:text-white px-1" aria-label="Dismiss" onClick={() => setAutoUndo(null)}>✕</button>
              </div>
            ) : autoTool ? (
              <div className="flex items-center gap-2 rounded-xl bg-teton-near-black text-white pl-3.5 pr-3 py-2 text-xs shadow-xl whitespace-nowrap drawer-in">
                <span className="truncate">{reading ?? 'Drag a box over rooms: every room number inside gets a tag to review'}</span>
              </div>
            ) : tagWhat === 'areas' ? (
              areaDraft ? null : (
                <div className="flex items-center gap-2 rounded-xl text-white pl-3.5 pr-3 py-2 text-xs shadow-xl whitespace-nowrap drawer-in" style={{ background: AREA_COLOR }}>
                  <span className="truncate">Click a space to tag it as a common area · drag a marker to move it</span>
                </div>
              )
            ) : saving ? (
              <TypeForm
                products={products}
                ecall={ecallSys}
                title="New room type"
                sub={`${pending.length} room${pending.length === 1 ? '' : 's'} selected`}
                types={types}
                index={types.length}
                submit={`Save room type · ${pending.length} room${pending.length === 1 ? '' : 's'}`}
                onCancel={() => setSaving(false)}
                onSave={saveNew}
                onAddTo={types.length ? addToType : undefined}
                note={pendingNote}
                onNote={setPendingNote}
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
                  <>
                    <span className="truncate">{reading ?? fillMsg ?? 'Click anywhere on the plan to tag a room · drag to move around'}</span>
                    {fillMsg && !reading && <button type="button" className="text-white/60 hover:text-white" aria-label="Dismiss" onClick={() => setFillMsg(null)}>✕</button>}
                    {!reading && !fillMsg && taggedHere > 0 && (
                      <button type="button" className="rounded-md bg-[#3F8CEA] px-2.5 py-1 font-medium hover:brightness-110" onClick={() => void fillFromPlan()} title="Read the room numbers printed on this plan and give them to tagged rooms without a number">
                        Fill numbers from plan
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2.5 border-t border-teton-off-white text-xs min-h-[3rem]">
          {rows.length === 0 && areasTaggedAll.length === 0 && <span className="text-teton-ui-gray">No room types yet. Turn on Scope Mode and click rooms to tag them.</span>}
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
          {liveTagNotes.length > 0 && (
            <button
              type="button"
              onClick={() => setNoteFilter((f) => !f)}
              aria-pressed={noteFilter}
              title={noteFilter ? 'Show every room' : 'Pick out the rooms with notes'}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[#8A6A12] transition-colors duration-200 ${noteFilter ? 'bg-[#FFF1CC]' : 'hover:bg-[#FFF8E6]'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: NOTE_DOT }} />
              {count(liveTagNotes.length)} room note{liveTagNotes.length === 1 ? '' : 's'} · {count(notedMarks.size)} room{notedMarks.size === 1 ? '' : 's'}
            </button>
          )}
          {areasTaggedAll.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-[4px] grid place-items-center text-white text-[7px] font-extrabold" style={{ background: AREA_COLOR }} aria-hidden="true">◆</span>
              <b>Common areas · {count(areasHere.length)}{areasHere.length !== areasTaggedAll.length ? <span className="font-normal text-teton-ui-gray"> ({count(areasTaggedAll.length)} in all)</span> : null} · {count(areaSensors(areasTaggedAll))} sensor{areaSensors(areasTaggedAll) === 1 ? '' : 's'}</b>
            </span>
          )}
          {(taggedTotal > 0 || areasTaggedAll.length > 0) && (
            <span className="ml-auto font-semibold">
              {taggedTotal > 0 ? `${count(taggedTotal)} rooms tagged · ${count(sensorsTagged)} sensors` : ''}
              {taggedTotal > 0 && areasTaggedAll.length > 0 ? ' · ' : ''}
              {areasTaggedAll.length > 0 ? `${count(areaSensors(areasTaggedAll))} common area sensor${areaSensors(areasTaggedAll) === 1 ? '' : 's'}` : ''}
            </span>
          )}
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
  modeLabel,
  marquee,
  marqueeLabel,
  sampler,
  onBox,
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
  /** Replaces the "Scope Mode · click to tag" label (e.g. while placing a note). */
  modeLabel?: string;
  onTap: (x: number, y: number) => void;
  /** Dragging draws a selection box (the Select tool; Shift + drag does it any time). */
  marquee?: boolean;
  /** Replaces the Select tool's label while the box is for something else (auto-tag). */
  marqueeLabel?: string;
  /** Set to a function that reads the plan's color at a spot (0–1 across and down), once the plan is drawn. */
  sampler?: React.MutableRefObject<((x: number, y: number) => [number, number, number] | null) | null>;
  /** The box (0–1 of the page) and how far a badge reaches (rx, ry); add: Shift held (add to the selection). */
  onBox?: (b: { x0: number; y0: number; x1: number; y1: number; rx: number; ry: number }, add: boolean) => void;
  children: React.ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxing = useRef<{ x: number; y: number; id: number; add: boolean } | null>(null);
  const frac = (e: React.PointerEvent) => {
    const r = inner.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
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
        await pg.render({ canvasContext: c.getContext('2d', { willReadFrequently: true })!, viewport: vp }).promise;
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
  // Colors on the plan as drawn (auto-tag reads each room's fill). An image is copied to a canvas once.
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!sampler) return;
    if (state !== 'ready') {
      sampler.current = null;
      return;
    }
    let src: HTMLCanvasElement | null = isPdf ? canvas.current : null;
    if (!isPdf && img.current?.naturalWidth) {
      const im = img.current;
      const c = document.createElement('canvas');
      const k = Math.min(1, 2600 / Math.max(im.naturalWidth, im.naturalHeight));
      c.width = Math.round(im.naturalWidth * k);
      c.height = Math.round(im.naturalHeight * k);
      try {
        c.getContext('2d', { willReadFrequently: true })!.drawImage(im, 0, 0, c.width, c.height);
        src = c;
      } catch {
        src = null;
      }
    }
    const ctx = src?.getContext('2d', { willReadFrequently: true });
    sampler.current =
      src && ctx
        ? (x, y) => {
            if (x < 0 || y < 0 || x > 1 || y > 1) return null;
            try {
              const d = ctx.getImageData(Math.min(src!.width - 1, Math.round(x * src!.width)), Math.min(src!.height - 1, Math.round(y * src!.height)), 1, 1).data;
              return [d[0], d[1], d[2]];
            } catch {
              return null;
            }
          }
        : null;
  }, [state, isPdf, page, url, sampler]);

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
    if (onBox && state === 'ready' && (marquee || e.shiftKey)) {
      const f = frac(e);
      boxing.current = { ...f, id: e.pointerId, add: e.shiftKey };
      stage.current!.setPointerCapture(e.pointerId);
      setBox({ x0: f.x, y0: f.y, x1: f.x, y1: f.y });
      return;
    }
    const s = stage.current!;
    drag.current = { x: e.clientX, y: e.clientY, sl: s.scrollLeft, st: s.scrollTop, moved: false, id: e.pointerId };
  };
  const move = (e: React.PointerEvent) => {
    const b = boxing.current;
    if (b && b.id === e.pointerId) {
      const f = frac(e);
      setBox({ x0: Math.min(b.x, f.x), y0: Math.min(b.y, f.y), x1: Math.max(b.x, f.x), y1: Math.max(b.y, f.y) });
      return;
    }
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
    const b = boxing.current;
    if (b && b.id === e.pointerId) {
      boxing.current = null;
      const f = frac(e);
      const bx = { x0: Math.min(b.x, f.x), y0: Math.min(b.y, f.y), x1: Math.max(b.x, f.x), y1: Math.max(b.y, f.y) };
      setBox(null);
      const r = inner.current!.getBoundingClientRect();
      // A click without a drag: a tap (clears the selection) unless Shift was held.
      if ((bx.x1 - bx.x0) * r.width < 4 && (bx.y1 - bx.y0) * r.height < 4) {
        if (!b.add) onTap(f.x, f.y);
        return;
      }
      // A badge counts when the box touches it (its radius, about 11 px).
      onBox?.({ ...bx, rx: 11 / r.width, ry: 11 / r.height }, b.add);
      return;
    }
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
        className={`absolute inset-0 overflow-auto overscroll-contain ${scope || marquee ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null;
          boxing.current = null;
          setBox(null);
        }}
        style={marquee ? { touchAction: 'pinch-zoom' } : undefined}
      >
        <div className="p-3 sm:p-4 w-max min-w-full">
          <div ref={inner} className="relative mx-auto bg-white shadow-sm" style={{ width: fitW ? fitW * zoom : '100%', aspectRatio: `1 / ${aspect}` }}>
            {isPdf ? (
              <canvas ref={canvas} className={`block w-full h-full transition-[filter] duration-200 ${scope ? 'grayscale-[.6]' : ''}`} aria-label={name} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={img}
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
            {box && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-30 rounded border-2 border-dashed border-[#3F8CEA] bg-[#3F8CEA]/10"
                style={{ left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`, width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%` }}
              />
            )}
          </div>
        </div>
      </div>
      {state !== 'ready' && (
        <p className="absolute inset-x-0 top-1/3 text-center text-sm text-teton-ui-gray pointer-events-none">{state === 'error' ? 'This file can’t be shown here. Download it to view it.' : 'Loading the floor plan…'}</p>
      )}
      {marquee && <span className="pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white bg-[#3F8CEA] drawer-in">{marqueeLabel ?? 'Select · drag a box over tags'}</span>}
      {scope && !marquee && <span className={`pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white drawer-in ${modeLabel ? 'bg-[#E0A21B]' : 'bg-[#3F8CEA]'}`}>{modeLabel ?? 'Scope Mode · click to tag'}</span>}
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
  dot,
  picked,
  onHover,
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
  /** Has a note: a small amber dot on the badge. */
  dot?: boolean;
  /** In the selection (a blue ring). */
  picked?: boolean;
  onHover?: (on: boolean) => void;
  /** touch: the tap came from a finger (no hover on phones); shift: Shift was held. */
  onClick: (touch: boolean, shift: boolean) => void;
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
      title={onHover ? undefined : title}
      aria-label={title}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover?.(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 rounded-full touch-none transition-opacity duration-200 motion-reduce:transition-none ${faded ? 'opacity-35' : ''} ${selected ? 'ring-[3px] ring-teton-near-black/85 ring-offset-1' : picked ? 'ring-[3px] ring-[#3F8CEA] ring-offset-1' : ''}`}
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
        } else onClick(e.pointerType !== 'mouse', e.shiftKey);
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
      {dot && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 rounded-full border-[1.5px] border-white" style={{ background: NOTE_DOT, width: Math.max(8, Math.round(size * 0.42)), height: Math.max(8, Math.round(size * 0.42)) }} />
      )}
    </button>
  );
}

/** A popover pinned beside a point on the plan (left of it on the right half), kept inside the plan. */
function Anchored({ x, y, passive, children }: { x: number; y: number; passive?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const sx = shift.x;
    const sy = shift.y;
    // Keep it on screen: up from the bottom of the plan, and in from the sides of the window (phones).
    const over = r.bottom - sy - Math.min(box.bottom, window.innerHeight - 12);
    const right = r.right - sx - (window.innerWidth - 8);
    const left = 8 - (r.left - sx);
    const nx = right > 0 ? -right : left > 0 ? left : 0;
    const ny = over > 0 ? -over : 0;
    if (nx !== sx || ny !== sy) setShift({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);
  const right = x > 0.55;
  return (
    <div
      ref={ref}
      data-plan-ui
      className={`absolute z-20 w-[17rem] max-w-[calc(100vw-16px)] cursor-auto drawer-in ${passive ? 'pointer-events-none' : ''}`}
      style={{ top: `calc(${y * 100}% - 18px + ${shift.y}px)`, ...(right ? { right: `calc(${(1 - x) * 100}% + 18px - ${shift.x}px)` } : { left: `calc(${x * 100}% + 18px + ${shift.x}px)` }) }}
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
function MarkPopover({ type, types, mark, readOnly, suggest, products, onRetype, onLabel, onRemove, onEdit, onClose, children }: { type: RoomType; types: RoomType[]; mark: RoomMark; readOnly?: boolean; suggest?: string; products: CareProducts; onRetype: (to: string) => void; onLabel: (l: string) => void; onRemove: () => void; onEdit: () => void; onClose: () => void; children?: React.ReactNode }) {
  const [label, setLabel] = useState(mark.label ?? '');
  const k = types.findIndex((t) => t.id === type.id);
  const b = badgeOf(type, k);
  return (
    <div className={card} role="dialog" aria-label="Tagged room">
      <div className="flex items-start gap-2">
        <Badge color={b.color} text={b.initials} size={24} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[13px] truncate">{mark.label ? `Room ${mark.label}` : 'Tagged room'}</p>
          <p className="text-[11px] text-teton-ui-gray truncate">{type.name || 'Room type'} · {careLabel(type)} · {sensorsPerRoom(type, products) || 'no'} sensor{sensorsPerRoom(type, products) === 1 ? '' : 's'}</p>
        </div>
        <button type="button" className="text-teton-ui-gray hover:text-teton-ink" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      {!readOnly && (
      <>
      <label className={eyebrow} htmlFor={`rt-${mark.id}`}>Room type</label>
      <select id={`rt-${mark.id}`} className="input-field py-1.5 text-xs" value={type.id} onChange={(e) => onRetype(e.target.value)}>
        {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
      </select>
      <label className={eyebrow} htmlFor={`rn-${mark.id}`}>Room number (optional)</label>
      <input id={`rn-${mark.id}`} className="input-field py-1.5 text-xs" value={label} placeholder="e.g. 143" maxLength={16} onChange={(e) => setLabel(e.target.value)} onBlur={() => onLabel(label.trim())} onKeyDown={(e) => e.key === 'Enter' && onLabel(label.trim())} />
      {suggest && !label.trim() && (
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#FFF1DC] px-2 py-0.5 text-[11px] font-semibold text-[#8A5A00] drawer-in"
          title="Read from the floor plan, but not certain"
          onClick={() => {
            setLabel(suggest);
            onLabel(suggest);
          }}
        >
          From the plan: use {suggest}?
        </button>
      )}
      {children}
      <div className="flex items-center justify-between gap-2 mt-3">
        <button type="button" className="text-[11.5px] text-[#B23A26] underline" onClick={onRemove}>Remove this room</button>
        <button type="button" className="btn-secondary py-1 text-xs truncate max-w-[60%]" onClick={onEdit}>Edit “{type.name || 'Room type'}”…</button>
      </div>
      </>
      )}
      {readOnly && (
        <>
          {children}
          <p className="mt-2 text-[10.5px] text-teton-ui-gray">🔒 Changing room types needs Edit Scope.</p>
        </>
      )}
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
  note,
  onNote,
  products,
  ecall,
}: {
  products: CareProducts;
  /** The deal's E-Call system: names the device counter (pendants / pull-cords); none disables it. */
  ecall: EcallOption;
  title: string;
  sub?: string;
  initial?: RoomType;
  index: number;
  types: RoomType[];
  submit: string;
  onSave: (v: Omit<RoomType, 'id' | 'rooms' | 'marks'>) => void;
  onCancel: () => void;
  onAddTo?: (typeId: string) => void;
  /** A note for the selected rooms (only when tagging a selection). */
  note?: string;
  onNote?: (v: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [initials, setInitials] = useState(initial?.initials ?? '');
  const [care, setCare] = useState<CareType>(initial?.care ?? 'al');
  // A care setting of the rep's own (counts as assisted living beds), as in the community drawer.
  const [customCare, setCustomCare] = useState(initial?.customCare ?? '');
  const [sensors, setSensors] = useState<number>(initial?.sensors ?? 1);
  const [pendants, setPendants] = useState<number>(Math.max(1, initial?.pendants ?? 1));
  const [color, setColor] = useState(initial ? badgeOf(initial, index).color : nextBadgeColor(types));
  const [addTo, setAddTo] = useState('');
  const auto = initialsOf(name || 'Room type');
  // A room type's name must be unique within its care setting (ignoring case and extra spaces); the same name
  // in another care setting is fine.
  const key = roomTypeKey({ name, care, customCare });
  const clash = name.trim() ? types.find((t) => t.id !== initial?.id && roomTypeKey(t) === key) : undefined;
  const ok = name.trim().length > 0 && !clash && (care !== 'custom' || customCare.trim().length > 0);
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
          pendants: pendants !== 1 ? Math.max(1, Math.min(20, Math.round(pendants) || 1)) : undefined,
          color,
          ...(initials.trim() ? { initials: initials.trim().toUpperCase().slice(0, 3) } : { initials: undefined }),
          customCare: care === 'custom' ? customCare.replace(/\s+/g, ' ').trim().slice(0, 40) : undefined,
          ...(initial?.roomsFromPlan != null ? { roomsFromPlan: initial.roomsFromPlan } : {}),
        });
      }}
    >
      {/* Add the selection to a room type that already exists, or make a new one below the line. */}
      {onAddTo && (
        <div className="flex items-center gap-1.5 mb-2.5 pb-2.5 border-b border-teton-off-white">
          <span className="text-[11px] font-medium text-teton-dark-gray whitespace-nowrap">Add To</span>
          <select className="input-field py-1 text-xs min-w-0" value={addTo} onChange={(e) => setAddTo(e.target.value)} aria-label="Add to an existing room type">
            <option value="">Choose a room type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
          </select>
          <button type="button" className="btn-secondary py-1 text-xs disabled:opacity-40" disabled={!addTo} onClick={() => addTo && onAddTo(addTo)}>Add</button>
        </div>
      )}
      {onNote && (
        <div className="mb-2.5 pb-2.5 border-b border-teton-off-white">
          <label className={`${eyebrow} !mt-0`} htmlFor="tf-note">Note for {sub ? 'these rooms' : 'this room'} (optional)</label>
          <textarea id="tf-note" className="input-field py-1.5 text-xs min-h-[2.75rem] resize-y" value={note ?? ''} maxLength={2000} placeholder="Shows on every room you’re tagging" onChange={(e) => onNote(e.target.value)} />
        </div>
      )}
      <p className="font-semibold text-[13px]">{title}</p>
      {sub && <p className="text-[11px] text-teton-ui-gray">{sub}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <div>
          <label className={eyebrow} htmlFor="tf-name">Room type / name</label>
          <input id="tf-name" className={`input-field py-1.5 text-xs ${clash ? 'ring-2 ring-teton-red border-transparent' : ''}`} aria-invalid={!!clash || undefined} aria-describedby={clash ? 'tf-clash' : undefined} value={name} placeholder="e.g. Studio" autoFocus={canAutoFocus()} onChange={(e) => setName(e.target.value)} />
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
          {care === 'custom' ? (
            <span className="flex items-center gap-1 drawer-in">
              <input id="tf-care" className="input-field py-1.5 px-1.5 text-xs min-w-0" value={customCare} placeholder="Care type" maxLength={40} autoFocus={!customCare && canAutoFocus()} aria-label="Custom care setting" onChange={(e) => setCustomCare(e.target.value)} />
              <button type="button" className="text-[11px] text-teton-ui-gray underline flex-shrink-0" title="Choose from the list" onClick={() => setCare('al')}>List</button>
            </span>
          ) : (
            <select id="tf-care" className="input-field py-1.5 text-xs" value={care} onChange={(e) => setCare(e.target.value as CareType)}>
              {CARES.map((c) => <option key={c} value={c}>{CARE_LABEL[c]}</option>)}
              <option value="custom">{CARE_LABEL.custom}</option>
            </select>
          )}
        </div>
      </div>
      {/* Sensors and E-Call devices per room. No resident monitoring in this care setting: no sensors (0, locked);
          no E-Call on the deal or in this care setting: no devices (0, locked). */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={eyebrow} htmlFor="tf-sen">Sensors / room</label>
          {products[bedKeyOf({ care })].monitoring ? (
            <Counter id="tf-sen" size="sm" value={sensors} onChange={setSensors} min={1} max={20} aria-label="Sensors per room" />
          ) : (
            <Counter id="tf-sen" size="sm" value={0} onChange={() => {}} disabled reason="No Resident Monitoring in this care setting" aria-label="Sensors per room (none: no Resident Monitoring)" />
          )}
        </div>
        <div>
          <label className={`${eyebrow} ${ecall === 'none' || !products[bedKeyOf({ care })].ecall ? '!text-[#B4AFA6]' : ''}`} htmlFor="tf-pend">{devicesLabel(ecall)} / room</label>
          {ecall === 'none' ? (
            <Counter id="tf-pend" size="sm" value={0} onChange={() => {}} disabled reason="E-Call isn’t part of this deal" aria-label={`${devicesLabel(ecall)} per room (none: no E-Call on the deal)`} />
          ) : !products[bedKeyOf({ care })].ecall ? (
            <Counter id="tf-pend" size="sm" value={0} onChange={() => {}} disabled reason="No E-Call in this care setting" aria-label={`${devicesLabel(ecall)} per room (none: no E-Call in this care setting)`} />
          ) : (
            <Counter id="tf-pend" size="sm" value={pendants} onChange={setPendants} min={1} max={20} aria-label={`${devicesLabel(ecall)} per room`} />
          )}
        </div>
      </div>
      {clash && (
        <p id="tf-clash" role="alert" className="mt-2 rounded bg-teton-red/25 px-2 py-1 text-[11px] text-[#9A2E1C] drawer-in">
          “{clash.name}” already exists in {care === 'custom' ? customCare.trim() || 'this care setting' : CARE_LABEL[care]}. Use a different name or care setting{onAddTo ? ', or add these rooms to it with Add To above' : ''}.
        </p>
      )}
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
    </form>
  );
}

/** Confirm removing a floor plan; with tagged rooms on it, keep the room types (as typed-in counts) or discard them. */
function RemoveDialog({ planName, communityName, tagged, typeCount, onCancel, onRemove }: { planName: string; communityName: string; tagged: number; typeCount: number; onCancel: () => void; onRemove: (t: 'keep' | 'discard' | null) => void }) {
  const [busy, setBusy] = useState(false);
  const go = (t: 'keep' | 'discard' | null) => {
    setBusy(true);
    onRemove(t);
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl text-sm [animation:fadeScale_.18s_ease-out] motion-reduce:[animation:none]" role="alertdialog" aria-modal="true" aria-label="Remove floor plan" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold text-base">Remove {planName}?</p>
        {tagged > 0 ? (
          <>
            <p className="mt-1.5 text-teton-dark-gray">
              {tagged} room{tagged === 1 ? ' is' : 's are'} tagged on this plan. Keep {communityName}&rsquo;s room types and their room counts, or discard them?
            </p>
            <div className="mt-3 space-y-2">
              <button type="button" disabled={busy} className="w-full text-left rounded-lg border border-teton-pale-gray px-3 py-2.5 hover:bg-teton-almost-white disabled:opacity-50" onClick={() => go('keep')}>
                <b>Keep room types and counts</b>
                <span className="block text-xs text-teton-ui-gray mt-0.5">The badges go; each room type keeps its room count as a typed-in number.</span>
              </button>
              <button type="button" disabled={busy} className="w-full text-left rounded-lg border border-[#E7B7AC] px-3 py-2.5 hover:bg-[#FDF1EE] disabled:opacity-50" onClick={() => go('discard')}>
                <b className="text-[#9A2E1C]">Discard room types and counts</b>
                <span className="block text-xs text-teton-ui-gray mt-0.5">Removes {typeCount === 1 ? 'the room type' : `all ${typeCount} room types`} from {communityName} and clears its bed counts and extra sensors.</span>
              </button>
            </div>
            <div className="mt-3 text-right">
              <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
            <button type="button" disabled={busy} className="py-1 px-3 rounded-md bg-[#C2412D] text-white text-xs font-medium disabled:opacity-50" onClick={() => go(null)}>Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}
