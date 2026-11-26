'use client';

/**
 * The Resources editor (full screen, from the Share dialog): the tab's name; on the left the cards as the prospect sees
 * them — drag to reorder or move between sections, ⋯ to hide, move or delete, rename sections, how much each card has
 * been looked at — and "+ Add to Resources" (upload a file or video, embed a video, add a link, a one pager, scoped
 * floor plans, a new section). On the right, Your Team (heading, note, main contact, teammates) or the selected card:
 * Settings (title, section, description, source, download, shown or hidden, who's looked at it) or Page (the card as
 * the prospect sees it, with its blocks editable). Changes save as you go.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegGroup } from '@/components/form/SegGroup';
import { Collapse } from '@/components/form/fields';
import { SwipeSheet, usePhone } from '@/components/form/SwipeSheet';
import { isOnePager } from '@/lib/proposal/onePager';
import { uploadResourceFile } from '@/lib/resources/upload';
import { DEFAULT_HEADING, type Block, type Resource, type RoomSettings, type Section } from '@/lib/resources/model';
import type { Activity, FloorPlanInfo } from '@/lib/data/dealRooms';
import type { Profile } from '@/lib/data/profiles';
import { PersonPhoto } from './Person';
import { KIND_META, ResourceView, fileKind, metaOf, sizeOf, type ViewCtx } from './Viewers';
import { ActivityView, engagementLine, fmtDur } from './ActivityView';
import { IconPicker } from './IconPicker';
import { cardLook } from './CardIcon';

interface Data {
  settings: RoomSettings;
  resources: Resource[];
  profiles: Profile[];
  plans: FloorPlanInfo[];
  customer: string;
  me: number;
  ownerId: number | null;
  canEdit: boolean;
  r2: boolean;
  hasLink: boolean;
}
type Sel = 'team' | number;

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative w-[34px] h-5 flex-shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none disabled:opacity-40 ${on ? 'bg-[#3F8CEA]' : 'bg-[#D5D9DE]'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[14px]' : ''}`} />
    </button>
  );
}

/** Teton Novelty Mode in the header: the prospect sees the cards like the Teton dashboard. Off by default. */
function NoveltyToggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const [tip, setTip] = useState(false);
  return (
    <span className="relative">
      <span className={`flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-[10px] border text-[13px] font-semibold transition-colors duration-200 motion-reduce:transition-none ${on ? 'border-[#F5C518] bg-[#F5C518]/[.08]' : 'border-[#4A4E56]'}`}>
        <span className="hidden sm:inline">Teton Novelty Mode</span>
        <span className="sm:hidden">Novelty</span>
        <button type="button" aria-label="What is Teton Novelty Mode?" aria-expanded={tip} onClick={() => setTip(!tip)} onBlur={() => setTip(false)} className="w-4 h-4 rounded-full border border-[#6B7078] text-[#A9ADB4] text-[10px] font-bold grid place-items-center hover:text-white">
          ?
        </button>
        <button type="button" role="switch" aria-checked={on} aria-label="Teton Novelty Mode" disabled={disabled} onClick={() => onChange(!on)} className={`relative w-9 h-[21px] rounded-full transition-colors duration-200 motion-reduce:transition-none disabled:opacity-40 ${on ? 'bg-[#F5C518]' : 'bg-[#4A4E56]'}`}>
          <span className={`absolute top-[2.5px] left-[2.5px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[15px]' : ''}`} />
        </button>
      </span>
      {tip && (
        <span role="tooltip" className="absolute right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 top-[calc(100%+8px)] z-10 w-[280px] rounded-xl bg-white p-3.5 text-left text-[12.5px] font-normal leading-normal text-teton-ink shadow-[0_14px_34px_rgba(0,0,0,.25)] [animation:fadeUp_.18s_ease-out] motion-reduce:[animation:none]">
          <b className="block mb-1 text-[13px] font-semibold">Teton Novelty Mode</b>
          The prospect sees their resources as cards like the Teton dashboard: colors for new and needs-you, stickers, and a viewed check. Hovering a card shows its details.
        </span>
      )}
    </span>
  );
}

/** Calls the Resources API; returns the JSON, or throws its error message. */
async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? 'Something went wrong. Try again.');
  return j;
}

export function ResourcesEditor({ quoteId, versionId, linkUrl, onClose, startWithActivity = false }: { quoteId: number; versionId: number; linkUrl: string | null; onClose: () => void; startWithActivity?: boolean }) {
  const base = `/api/quotes/${quoteId}/resources`;
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<Sel>('team');
  const [mode, setMode] = useState<'settings' | 'page'>('page');
  const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [showActivity, setShowActivity] = useState(startWithActivity);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  // Phones: the header's extras fold away, and a card's fields open in a sheet from the bottom.
  const phone = usePhone();
  const [headOpen, setHeadOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  // The shared link, opening on this tab.
  const copyLink = async () => {
    if (!linkUrl) return;
    const url = `${linkUrl}?tab=resources`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy the link:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    void api<Data>(`${base}?version=${versionId}`).then(setD, (e: Error) => setError(e.message));
    void api<{ activity: Activity }>(`${base}/activity?days=90`).then((j) => setActivity(j.activity), () => {});
  }, [base, versionId]);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);
  useEffect(() => {
    // Esc closes the editor (or the picker over it), never the Share dialog behind it. The Activity view handles its own.
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-label="Activity"][data-res-modal]')) return;
      e.stopImmediatePropagation();
      if (!document.querySelector('[data-res-modal]')) close();
    };
    window.addEventListener('keydown', k, true);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k, true);
      document.body.style.overflow = '';
    };
  }, [close]);

  // Save as you go: settings and card changes are sent after a short pause.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const later = useCallback((key: string, fn: () => Promise<unknown>) => {
    setState('saving');
    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        fn().then(
          () => !timers.current.size && setState('saved'),
          (e: Error) => (setState('error'), setError(e.message)),
        );
      }, 650),
    );
  }, []);
  const setSettings = (patch: Partial<RoomSettings>) => {
    setD((x) => (x ? { ...x, settings: { ...x.settings, ...patch } } : x));
    later('settings', () => api(base, 'PUT', patch));
  };
  const setResource = (id: number, patch: Partial<Resource> & { fileId?: number }) => {
    setD((x) => (x ? { ...x, resources: x.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : x));
    later(`r${id}:${Object.keys(patch).sort().join(',')}`, () => api<{ resource: Resource }>(`${base}/items/${id}`, 'PATCH', patch).then((j) => 'fileId' in patch && setD((x) => (x ? { ...x, resources: x.resources.map((r) => (r.id === id ? j.resource : r)) } : x))));
  };
  const addResource = async (body: Record<string, unknown>) => {
    setError(null);
    try {
      const j = await api<{ resource: Resource }>(`${base}/items`, 'POST', body);
      setD((x) => (x ? { ...x, resources: [...x.resources, j.resource] } : x));
      setSel(j.resource.id);
      setSheet(true);
      setMode(j.resource.kind === 'file' || j.resource.kind === 'link' ? 'settings' : 'page');
      return j.resource;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add it');
      return null;
    }
  };
  const removeResource = async (r: Resource) => {
    if (!window.confirm(`Delete “${r.title}”? ${r.file ? 'Its file is deleted too.' : ''}`)) return;
    await api(`${base}/items/${r.id}`, 'DELETE').catch((e: Error) => setError(e.message));
    setD((x) => (x ? { ...x, resources: x.resources.filter((y) => y.id !== r.id) } : x));
    setSel('team');
    setSheet(false);
  };
  const reorder = (next: Resource[]) => {
    setD((x) => (x ? { ...x, resources: next } : x));
    const order = (d?.settings.sections ?? []).map((s) => ({ sectionId: s.id, ids: next.filter((r) => r.sectionId === s.id).map((r) => r.id) }));
    later('order', () => api(`${base}/items`, 'PUT', { order }));
  };
  const upload = useCallback(async (f: File) => {
    try {
      return (await uploadResourceFile(quoteId, f)).id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      return null;
    }
  }, [quoteId]);

  if (typeof document === 'undefined') return null;
  const r = d && sel !== 'team' ? d.resources.find((x) => x.id === sel) ?? null : null;
  // Novelty, copy, preview and activity: in the header row on wider screens, folded under the header's ⌄ on phones.
  const extras = (
    <>
        {d && <NoveltyToggle on={d.settings.novelty} disabled={!d.canEdit} onChange={(v) => setSettings({ novelty: v })} />}
        {linkUrl && (
          <button type="button" onClick={() => void copyLink()} title="Copy the shared link (it opens on this tab)" className={`h-9 px-3.5 rounded-[10px] border text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors duration-200 motion-reduce:transition-none ${copied ? 'border-[#2E9E5B] bg-[#2E9E5B] text-white' : 'border-[#4A4E56] hover:bg-white/10'}`}>
            {copied ? '✓ Copied' : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" /><path d="M10.5 5.5V3.6c0-.6-.5-1.1-1.1-1.1H3.6c-.6 0-1.1.5-1.1 1.1v5.8c0 .6.5 1.1 1.1 1.1h1.9" /></svg>
                Copy link
              </>
            )}
          </button>
        )}
        {linkUrl ? (
          <a href={`${linkUrl}?tab=resources`} target="_blank" rel="noopener noreferrer" className="h-9 px-3.5 rounded-[10px] border border-[#4A4E56] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-white/10" title="Opens the shared link (sign in with one of its emails)">
            👁 Preview<span className="hidden sm:inline"> as prospect</span>
          </a>
        ) : (
          <span className="hidden sm:inline text-[12px] text-[#A9ADB4]">Create the link to preview</span>
        )}
        <button type="button" onClick={() => setShowActivity(true)} className="h-9 px-3.5 rounded-[10px] border border-[#4A4E56] text-[13px] font-semibold hover:bg-white/10">
          Activity
        </button>
    </>
  );
  return createPortal(
    <div className={`no-print fixed inset-0 z-[95] flex flex-col bg-[#FBF8F3] text-teton-ink ${closing ? 'opacity-0 transition-opacity duration-200' : '[animation:fadeIn_.2s_ease-out]'} motion-reduce:[animation:none] motion-reduce:transition-none`} role="dialog" aria-modal="true" aria-label="Resources editor" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="flex-shrink-0 bg-[#16181D] text-white px-4 md:px-5 py-2">
        <div className="flex items-center gap-3 min-h-[48px] md:min-h-[48px]">
          <div className="min-w-0 flex-1 md:flex-none">
            <b className="text-[15px]">Resources</b>
            <span className="block text-[12px] text-[#A9ADB4] truncate">{d ? `${d.customer} · on the shared link` : 'Loading…'}</span>
          </div>
          {d && (
            <label className="hidden md:flex items-center gap-2 ml-4 text-[12px] text-[#A9ADB4]">
              Tab name
              <input className="h-8 w-[180px] rounded-lg border border-[#3A3D44] bg-[#22252B] px-2.5 text-[13px] font-semibold text-white outline-none focus:border-[#3F8CEA]" value={d.settings.tabName} maxLength={30} disabled={!d.canEdit} onChange={(e) => setSettings({ tabName: e.target.value })} />
            </label>
          )}
          <span className="hidden md:block flex-1" />
          <span className={`text-[12px] whitespace-nowrap ${state === 'error' ? 'text-[#F2A091]' : 'text-[#A9ADB4]'}`} role="status">
            {state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : d ? <><span className="md:hidden">Saved</span><span className="hidden md:inline">All changes saved</span></> : ''}
          </span>
          <div className="hidden md:flex items-center gap-3">{extras}</div>
          <button type="button" aria-expanded={headOpen} aria-label={headOpen ? 'Fewer options' : 'More options'} onClick={() => setHeadOpen((o) => !o)} className="md:hidden w-9 h-9 flex-shrink-0 rounded-[10px] border border-[#4A4E56] grid place-items-center hover:bg-white/10">
            <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform duration-300 motion-reduce:transition-none ${headOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button type="button" onClick={close} className="h-9 px-4 flex-shrink-0 rounded-[10px] bg-white text-teton-ink text-[13px] font-semibold">
            Done
          </button>
        </div>
        <Collapse open={headOpen} className="md:hidden">
          <div className="grid grid-cols-2 gap-2 pt-2 pb-1.5 [&>*]:w-full [&>*]:justify-center [&>button]:h-10 [&>a]:h-10">{extras}</div>
          {d && (
            <label className="flex items-center gap-2 pb-1.5 text-[12px] text-[#A9ADB4]">
              Tab name
              <input className="h-9 flex-1 min-w-0 rounded-lg border border-[#3A3D44] bg-[#22252B] px-2.5 text-[14px] font-semibold text-white outline-none focus:border-[#3F8CEA]" value={d.settings.tabName} maxLength={30} disabled={!d.canEdit} onChange={(e) => setSettings({ tabName: e.target.value })} />
            </label>
          )}
        </Collapse>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-3 bg-[#FDF0EE] px-5 py-2 text-[12.5px] text-[#B4442C]">
          {error}
          <button type="button" className="ml-auto font-semibold underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      {!d ? (
        <p className="p-10 text-center text-sm text-teton-ui-gray">{error ? '' : 'Loading…'}</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <CardList d={d} sel={sel} setSel={(s) => (setSel(s), setMode(s === 'team' ? 'page' : mode), setSheet(true))} activity={activity} reorder={reorder} setSettings={setSettings} setResource={setResource} removeResource={removeResource} addResource={addResource} upload={upload} />
          {phone ? (
            <SwipeSheet open={sheet} onClose={() => setSheet(false)} eyebrow={sel === 'team' || !r ? 'Start here' : d.settings.sections.find((s) => s.id === r.sectionId)?.name ?? metaOf(r).label} title={sel === 'team' || !r ? 'Your Team' : r.title}>
            <div className="max-w-[920px] mx-auto">
              {sel === 'team' || !r ? (
                <TeamEditor d={d} setSettings={setSettings} />
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="hidden md:block min-w-0 flex-1">
                      <p className="text-[10.5px] font-extrabold uppercase tracking-[2px] text-teton-ui-gray">{d.settings.sections.find((s) => s.id === r.sectionId)?.name ?? metaOf(r).label}</p>
                      <h2 className="mt-1 text-[22px] font-semibold tracking-[-.3px] break-words">{r.title}</h2>
                      <p className="mt-1 text-[13px] text-teton-ui-gray">{mode === 'page' ? 'Click anything below the main view to change it; hover a block to move or remove it.' : 'The card and where it comes from.'}</p>
                    </div>
                    <SegGroup className="relative flex md:inline-flex w-full md:w-auto rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Settings or page">
                      {(['settings', 'page'] as const).map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`relative z-[1] flex-1 md:flex-none h-9 md:h-8 px-4 rounded-[8px] text-[12.5px] font-semibold transition-colors duration-200 ${mode === m ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
                          {m === 'settings' ? 'Settings' : 'Page'}
                        </button>
                      ))}
                    </SegGroup>
                  </div>
                  {mode === 'settings' ? (
                    <ItemSettings key={r.id} d={d} r={r} quoteId={quoteId} activity={activity} setResource={setResource} remove={() => void removeResource(r)} upload={upload} />
                  ) : (
                    <div className="mt-4 rounded-[18px] border border-[#E8E4DC] bg-white px-4 sm:px-6 pt-5 pb-6">
                      <ResourceView
                        key={r.id}
                        r={r}
                        ctx={{
                          mode: 'rep',
                          fileUrl: (x, o) => `${base}/files/${o?.f ?? x.file?.id}${o?.dl ? '?dl=1' : ''}`,
                          planUrl: (pid) => `/api/quotes/${quoteId}/floorplans/${pid}`,
                          goUrl: (x, b) => (b ? (x.blocks.find((y) => y.id === b && y.type === 'button') as Extract<Block, { type: 'button' }> | undefined)?.url ?? '#' : x.url ?? '#'),
                          resources: d.resources,
                          plans: d.plans,
                          booking: d.settings.showBooking ? d.profiles.find((p) => p.userId === d.settings.contactUserId)?.schedulingUrl ?? null : null,
                          onSelect: (id) => setSel(id),
                          onDuration: (sec) => r.duration !== Math.round(sec) && Number.isFinite(sec) && setResource(r.id, { duration: Math.round(sec) }),
                          edit: d.canEdit ? { onBlocks: (blocks) => setResource(r.id, { blocks }), upload } : null,
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            </SwipeSheet>
          ) : (
            <main className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-4 sm:px-8 pt-6 pb-16">
            <div className="max-w-[920px] mx-auto">
              {sel === 'team' || !r ? (
                <TeamEditor d={d} setSettings={setSettings} />
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="hidden md:block min-w-0 flex-1">
                      <p className="text-[10.5px] font-extrabold uppercase tracking-[2px] text-teton-ui-gray">{d.settings.sections.find((s) => s.id === r.sectionId)?.name ?? metaOf(r).label}</p>
                      <h2 className="mt-1 text-[22px] font-semibold tracking-[-.3px] break-words">{r.title}</h2>
                      <p className="mt-1 text-[13px] text-teton-ui-gray">{mode === 'page' ? 'Click anything below the main view to change it; hover a block to move or remove it.' : 'The card and where it comes from.'}</p>
                    </div>
                    <SegGroup className="relative flex md:inline-flex w-full md:w-auto rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Settings or page">
                      {(['settings', 'page'] as const).map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`relative z-[1] flex-1 md:flex-none h-9 md:h-8 px-4 rounded-[8px] text-[12.5px] font-semibold transition-colors duration-200 ${mode === m ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
                          {m === 'settings' ? 'Settings' : 'Page'}
                        </button>
                      ))}
                    </SegGroup>
                  </div>
                  {mode === 'settings' ? (
                    <ItemSettings key={r.id} d={d} r={r} quoteId={quoteId} activity={activity} setResource={setResource} remove={() => void removeResource(r)} upload={upload} />
                  ) : (
                    <div className="mt-4 rounded-[18px] border border-[#E8E4DC] bg-white px-4 sm:px-6 pt-5 pb-6">
                      <ResourceView
                        key={r.id}
                        r={r}
                        ctx={{
                          mode: 'rep',
                          fileUrl: (x, o) => `${base}/files/${o?.f ?? x.file?.id}${o?.dl ? '?dl=1' : ''}`,
                          planUrl: (pid) => `/api/quotes/${quoteId}/floorplans/${pid}`,
                          goUrl: (x, b) => (b ? (x.blocks.find((y) => y.id === b && y.type === 'button') as Extract<Block, { type: 'button' }> | undefined)?.url ?? '#' : x.url ?? '#'),
                          resources: d.resources,
                          plans: d.plans,
                          booking: d.settings.showBooking ? d.profiles.find((p) => p.userId === d.settings.contactUserId)?.schedulingUrl ?? null : null,
                          onSelect: (id) => setSel(id),
                          onDuration: (sec) => r.duration !== Math.round(sec) && Number.isFinite(sec) && setResource(r.id, { duration: Math.round(sec) }),
                          edit: d.canEdit ? { onBlocks: (blocks) => setResource(r.id, { blocks }), upload } : null,
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            </main>
          )}
        </div>
      )}
      {showActivity && (
        <ActivityView
          quoteId={quoteId}
          customer={d?.customer ?? ''}
          onClose={() => setShowActivity(false)}
          onPick={(key) => {
            setShowActivity(false);
            if (key.startsWith('r')) (setSel(Number(key.slice(1))), setMode('settings'), setSheet(true));
            else if (key === 'team') (setSel('team'), setSheet(true));
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- the list on the left

function CardList({
  d,
  sel,
  setSel,
  activity,
  reorder,
  setSettings,
  setResource,
  removeResource,
  addResource,
  upload,
}: {
  d: Data;
  sel: Sel;
  setSel: (s: Sel) => void;
  activity: Activity | null;
  reorder: (next: Resource[]) => void;
  setSettings: (p: Partial<RoomSettings>) => void;
  setResource: (id: number, p: Partial<Resource>) => void;
  removeResource: (r: Resource) => Promise<void>;
  addResource: (b: Record<string, unknown>) => Promise<Resource | null>;
  upload: (f: File) => Promise<number | null>;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Sections start collapsed (every time); the selected card's section opens, and dragging over one opens it.
  const [openSecs, setOpenSecs] = useState<Set<string>>(() => new Set());
  const openSec = (id: string) => setOpenSecs((o) => (o.has(id) ? o : new Set([...o, id])));
  const selSection = typeof sel === 'number' ? d.resources.find((x) => x.id === sel)?.sectionId ?? null : null;
  useEffect(() => {
    if (selSection) openSec(selSection);
  }, [selSection]);
  const allOpen = d.settings.sections.every((s) => openSecs.has(s.id));
  const edit = d.canEdit;
  const drop = (sectionId: string, beforeId: number | null) => {
    if (drag == null) return;
    const moving = d.resources.find((x) => x.id === drag);
    setDrag(null);
    setOver(null);
    if (!moving || beforeId === drag) return;
    const rest = d.resources.filter((x) => x.id !== drag);
    const at = beforeId == null ? rest.length : rest.findIndex((x) => x.id === beforeId);
    rest.splice(at < 0 ? rest.length : at, 0, { ...moving, sectionId });
    // Keep the list grouped by section in section order.
    const grouped = d.settings.sections.flatMap((s) => rest.filter((x) => x.sectionId === s.id));
    reorder(grouped);
  };
  const team = [d.settings.contactUserId, ...d.settings.team.map((t) => t.userId)].filter((n): n is number => n != null);
  const stats = (r: Resource) => (activity ? engagementLine(activity, `r${r.id}`) : null);
  return (
    <aside className="flex-1 md:flex-none min-h-0 md:w-[340px] md:flex-shrink-0 md:border-r border-[#ECE8DF] bg-[#F6F3EE] overflow-y-auto overscroll-contain px-3.5 py-4 pb-10 md:pb-4">
      <p className="md:hidden mx-1 mb-3 text-[12px] text-[#6B7380]">Tap a card to edit it.</p>
      <p className="mx-1 mb-2 text-[10px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]">Start here</p>
      <button type="button" onClick={() => setSel('team')} className={`w-full flex gap-2.5 items-start rounded-xl border bg-white p-2.5 text-left ${sel === 'team' ? 'border-[#3F8CEA] shadow-[0_0_0_3px_rgba(63,140,234,.15)]' : 'border-[#E8E4DC]'}`}>
        <span className="w-[34px] h-[34px] rounded-[9px] grid place-items-center bg-[#FDF0EE] flex-shrink-0">👋</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[12.5px]">Your Team</b>
          <small className="block text-[11px] text-[#6B7380]">Always first · the landing page</small>
          <span className="mt-1.5 flex">
            {team.slice(0, 5).map((id, i) => {
              const p = d.profiles.find((x) => x.userId === id);
              return p ? <span key={id} className={i ? '-ml-1.5' : ''}><PersonPhoto name={p.name} photoUrl={p.photoUrl} size={22} className="border-2 border-white" /></span> : null;
            })}
          </span>
        </span>
      </button>
      <div className="flex justify-end mx-1 mt-2 -mb-1">
        <button type="button" className="text-[11.5px] font-semibold text-[#1F5FB5] hover:underline" onClick={() => setOpenSecs(allOpen ? new Set() : new Set(d.settings.sections.map((x) => x.id)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {d.settings.sections.map((s, si) => {
        const list = d.resources.filter((x) => x.sectionId === s.id);
        const moveSection = (by: -1 | 1) => {
          const next = [...d.settings.sections];
          [next[si], next[si + by]] = [next[si + by], next[si]];
          setSettings({ sections: next });
        };
        const custom = !['docs', 'cases', 'plans', 'recordings'].includes(s.id);
        const isOpen = openSecs.has(s.id);
        return (
          <div key={s.id} onDragOver={(e) => drag != null && (e.preventDefault(), setOver(s.id), openSec(s.id))} onDrop={() => drop(s.id, null)} className={`mt-1 rounded-xl transition-colors duration-150 ${over === s.id && drag != null ? 'bg-[#EEF5FE]' : ''}`}>
            <div className="flex items-center gap-1.5 mx-0.5 mt-1.5 mb-1 min-h-[36px]">
              {renaming === s.id ? (
                <input
                  autoFocus
                  className="flex-1 h-7 rounded-md border border-[#3F8CEA] px-2 text-[11px] font-bold uppercase tracking-[1px]"
                  defaultValue={s.name}
                  onBlur={(e) => (setRenaming(null), e.target.value.trim() && setSettings({ sections: d.settings.sections.map((x) => (x.id === s.id ? { ...x, name: e.target.value.trim() } : x)) }))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  aria-label="Section name"
                />
              ) : (
                <button type="button" aria-expanded={isOpen} onClick={() => setOpenSecs((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} className="flex-1 min-w-0 flex items-center gap-2 rounded-[9px] px-1 py-1.5 text-left hover:bg-white/70">
                  <span className={`w-5 h-5 grid place-items-center text-[10px] text-[#6B7380] transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                  <span className="flex-1 min-w-0 truncate text-[10.5px] font-extrabold uppercase tracking-[1.4px] text-[#5A6270]">{s.name}</span>
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#E9E5DE] text-[11px] font-bold text-[#5A6270] grid place-items-center">{list.length}</span>
                </button>
              )}
              {edit && renaming !== s.id && (
                <button type="button" aria-label={`Rename ${s.name}`} title="Rename section" className="w-6 h-6 rounded-md grid place-items-center text-[12px] text-[#5A6270] hover:bg-white" onClick={() => setRenaming(s.id)}>
                  ✎
                </button>
              )}
              {edit && renaming !== s.id && (
                <span className="flex items-center">
                  <button type="button" aria-label={`Move ${s.name} up`} title="Move section up" disabled={si === 0} onClick={() => moveSection(-1)} className="w-6 h-6 rounded-md grid place-items-center text-[11px] text-[#5A6270] hover:bg-white disabled:opacity-25">
                    ▲
                  </button>
                  <button type="button" aria-label={`Move ${s.name} down`} title="Move section down" disabled={si === d.settings.sections.length - 1} onClick={() => moveSection(1)} className="w-6 h-6 rounded-md grid place-items-center text-[11px] text-[#5A6270] hover:bg-white disabled:opacity-25">
                    ▼
                  </button>
                </span>
              )}
              {edit && custom && !list.length && (
                <button type="button" className="text-[11.5px] font-semibold text-[#C2412D]" onClick={() => setSettings({ sections: d.settings.sections.filter((x) => x.id !== s.id) })}>
                  Remove
                </button>
              )}
            </div>
            <Collapse open={isOpen}>
              <div className="pb-1">
            {!list.length && <p className="mx-1 mb-1 text-[11px] text-[#A9ADB4]">{drag != null ? 'Drop here' : 'Empty: hidden from the prospect'}</p>}
            {list.map((x) => {
              const m = cardLook(x);
              const st = stats(x);
              return (
                <div
                  key={x.id}
                  draggable={edit}
                  onDragStart={() => setDrag(x.id)}
                  onDragEnd={() => (setDrag(null), setOver(null))}
                  onDragOver={(e) => drag != null && e.preventDefault()}
                  onDrop={(e) => (e.stopPropagation(), drop(s.id, x.id))}
                  className={`relative mb-[7px] flex gap-2 items-start rounded-xl border bg-white py-2.5 pl-1.5 pr-2 transition-opacity ${sel === x.id ? 'border-[#3F8CEA] shadow-[0_0_0_3px_rgba(63,140,234,.15)]' : 'border-[#E8E4DC]'} ${x.hidden ? 'opacity-55' : ''} ${drag === x.id ? 'opacity-40' : ''}`}
                >
                  {edit && <span className="cursor-grab select-none text-[13px] leading-[34px] text-[#B9BFC7]" aria-hidden="true">⋮⋮</span>}
                  <button type="button" onClick={() => setSel(x.id)} className="flex gap-2.5 items-start min-w-0 flex-1 text-left">
                    <span className="w-[34px] h-[34px] rounded-[9px] grid place-items-center flex-shrink-0 text-[14px] overflow-hidden" style={{ background: m.bg, color: m.fg }}>
                      {m.node}
                    </span>
                    <span className="min-w-0">
                      <b className="block text-[12.5px] leading-snug break-words">{x.title}</b>
                      <small className="block text-[11px] text-[#6B7380]">{x.hidden ? 'Hidden from the prospect' : [x.kind === 'embed' ? `Embedded · ${({ canva: 'Canva', gslides: 'Google Slides', pitch: 'Pitch', youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', wistia: 'Wistia' } as Record<string, string>)[x.embed?.provider ?? ''] ?? 'video'}` : x.kind === 'link' ? 'Link' : x.kind === 'floorplan' ? 'Scoped floor plan' : x.kind === 'onepager' ? 'From the proposal' : `Uploaded ${fileKind(x) ?? ''}`, x.file && sizeOf(x.file.size)].filter(Boolean).join(' · ')}</small>
                      {st && <small className={`block mt-1 text-[10.5px] ${st.hot ? 'font-semibold text-[#256B41]' : 'text-[#5A6270]'}`}>{st.text}</small>}
                    </span>
                  </button>
                  {edit && (
                    <span className="relative">
                      <button type="button" aria-label={`Options for ${x.title}`} aria-expanded={menu === x.id} onClick={() => setMenu(menu === x.id ? null : x.id)} className="w-7 h-7 rounded-md text-[#8A919C] hover:bg-teton-almost-white">
                        ⋯
                      </button>
                      {menu === x.id && (
                        <span className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-[#ECE8DF] bg-white py-1 shadow-lg [animation:fadeScale_.12s_ease-out]" onMouseLeave={() => setMenu(null)}>
                          <button type="button" className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-teton-almost-white" onClick={() => (setMenu(null), setResource(x.id, { hidden: !x.hidden }))}>
                            {x.hidden ? 'Show to the prospect' : 'Hide from the prospect'}
                          </button>
                          <span className="block px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-[1px] text-[#8A919C]">Move to</span>
                          {d.settings.sections
                            .filter((y) => y.id !== x.sectionId)
                            .map((y) => (
                              <button key={y.id} type="button" className="block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-teton-almost-white" onClick={() => (setMenu(null), reorder(d.settings.sections.flatMap((z) => [...d.resources.filter((q) => q.id !== x.id), { ...x, sectionId: y.id }].filter((q) => q.sectionId === z.id))))}>
                                {y.name}
                              </button>
                            ))}
                          <button type="button" className="block w-full px-3 py-1.5 text-left text-[12.5px] text-[#B23A26] hover:bg-teton-almost-white border-t border-[#F1EEE7] mt-1" onClick={() => (setMenu(null), void removeResource(x))}>
                            Delete
                          </button>
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
              </div>
            </Collapse>
          </div>
        );
      })}
      {edit && <AddMenu d={d} addResource={addResource} setSettings={setSettings} upload={upload} />}
    </aside>
  );
}

// ---------------------------------------------------------------- + Add to Resources

function AddMenu({ d, addResource, setSettings, upload }: { d: Data; addResource: (b: Record<string, unknown>) => Promise<Resource | null>; setSettings: (p: Partial<RoomSettings>) => void; upload: (f: File) => Promise<number | null> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<null | 'embed' | 'deck' | 'link' | 'onepager' | 'section'>(null);
  const [plans, setPlans] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu opens in the list, above the button: bring all of it into view.
  useEffect(() => {
    if (open) menuRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [open, form]);
  const reset = () => (setOpen(false), setForm(null), setUrl(''), setTitle(''));
  const onePagers = useMemo(
    () => (form === 'onepager' ? [...document.querySelectorAll<HTMLElement>('article#proposal [data-bc-page][data-bc-title]')].filter((el) => isOnePager(el.dataset.bcPage!)).map((el) => ({ id: el.dataset.bcPage!, title: el.dataset.bcTitle! })) : []),
    [form],
  );
  const items: Array<[string, string, string, string, () => void]> = [
    ['⤒', '#E7E2FB', 'Upload a file', `PDF, deck, document, image, or a video (MP4, MOV) up to ${d.r2 ? '500' : '60'} MB.`, () => fileRef.current?.click()],
    ['▤', '#E7E2FB', 'Embed a deck', 'A Canva, Google Slides or Pitch link (or Canva’s embed code); it shows right on the page.', () => setForm('deck')],
    ['▶', '#1C2430', 'Embed a video', 'A YouTube, Vimeo, Loom or Wistia link; it plays right on the page.', () => setForm('embed')],
    ['↗', '#FFF4D6', 'Add a link', 'Any web page (a case study, an article). Opens in a new tab.', () => setForm('link')],
    ['✓', '#EEF8F1', 'Add a one pager', 'One of this proposal’s one pagers, always current.', () => setForm('onepager')],
    ['▦', '#EEF5FE', 'Add scoped floor plans', 'Plans tagged in Scope Mode, with their room summary.', () => (setOpen(false), setPlans(true))],
    ['＋', '#F1EEE8', 'New section', 'Group cards under your own heading.', () => setForm('section')],
  ];
  const field = 'w-full h-9 rounded-[9px] border border-[#D5D9DE] px-2.5 text-[12.5px] outline-none focus:border-[#3F8CEA]';
  return (
    <div className="mt-2 flex flex-col-reverse">
      {busy && <p className="mb-2 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-[12px] text-[#5A6270]">{busy}</p>}
      <button type="button" aria-expanded={open} onClick={() => (open ? reset() : setOpen(true))} className="w-full h-10 rounded-[10px] border border-dashed border-[#B9BFC7] text-[13px] font-semibold text-[#5A6270] hover:bg-white">
        + Add to Resources
      </button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="application/pdf,video/mp4,video/quicktime,video/webm,image/*,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          reset();
          setBusy(`Uploading ${f.name}…`);
          const id = await upload(f);
          if (id) await addResource({ kind: 'file', fileId: id });
          setBusy(null);
        }}
      />
      {open && (
        <div ref={menuRef} className="mb-2 rounded-[13px] border border-[#ECE8DF] bg-white p-1.5 shadow-[0_16px_40px_rgba(0,0,0,.18)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]">
          {!form &&
            items.map(([ic, bg, name, hint, fn]) => (
              <button key={name} type="button" onClick={fn} className="w-full flex gap-2.5 items-start rounded-[9px] px-2.5 py-2 text-left hover:bg-[#F3F7FD]">
                <span className="w-[30px] h-[30px] rounded-lg grid place-items-center flex-shrink-0 text-[13px]" style={{ background: bg, color: bg === '#1C2430' ? '#fff' : undefined }}>
                  {ic}
                </span>
                <span>
                  <b className="block text-[12.5px]">{name}</b>
                  <small className="block text-[11px] leading-snug text-teton-ui-gray">{hint}</small>
                </span>
              </button>
            ))}
          {(form === 'embed' || form === 'deck' || form === 'link') && (
            <form
              className="p-2 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await addResource({ kind: form === 'deck' ? 'embed' : form, url, title });
                if (ok) reset();
              }}
            >
              <b className="block text-[12.5px]">{form === 'embed' ? 'Embed a video' : form === 'deck' ? 'Embed a deck' : 'Add a link'}</b>
              <input autoFocus className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={form === 'embed' ? 'https://www.loom.com/share/… or a YouTube / Vimeo link' : form === 'deck' ? 'https://www.canva.com/design/…/view?embed' : 'https://…'} aria-label="Link" />
              {form === 'deck' && <p className="text-[11px] leading-snug text-teton-ui-gray">In Canva: Share → More → Embed, and copy the smart embed link (or the HTML). The design has to be shared with “Anyone with the link”.</p>}
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Title" />
              <div className="flex justify-end gap-2">
                <button type="button" className="h-8 px-3 rounded-lg border border-[#D5D9DE] text-[12.5px] font-semibold" onClick={() => setForm(null)}>
                  Back
                </button>
                <button type="submit" className="h-8 px-3 rounded-lg bg-teton-ink text-white text-[12.5px] font-semibold disabled:opacity-50" disabled={!url.trim()}>
                  Add
                </button>
              </div>
            </form>
          )}
          {form === 'onepager' && (
            <div className="p-2">
              <b className="block text-[12.5px] mb-1.5">Add a one pager</b>
              {onePagers.length ? (
                onePagers.map((o) => (
                  <button key={o.id} type="button" disabled={d.resources.some((x) => x.pageId === o.id)} onClick={async () => (await addResource({ kind: 'onepager', pageId: o.id, title: o.title })) && reset()} className="w-full text-left rounded-lg px-2.5 py-2 text-[12.5px] hover:bg-[#F3F7FD] disabled:opacity-40">
                    {o.title}
                    {d.resources.some((x) => x.pageId === o.id) ? ' · added' : ''}
                  </button>
                ))
              ) : (
                <p className="text-[12px] text-teton-ui-gray">This proposal has no one pagers. Add one with the Add button on the proposal first.</p>
              )}
              <button type="button" className="mt-1 h-8 px-3 rounded-lg border border-[#D5D9DE] text-[12.5px] font-semibold" onClick={() => setForm(null)}>
                Back
              </button>
            </div>
          )}
          {form === 'section' && (
            <form
              className="p-2 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim()) return;
                setSettings({ sections: [...d.settings.sections, { id: `s${Date.now().toString(36)}`, name: title.trim() } as Section] });
                reset();
              }}
            >
              <b className="block text-[12.5px]">New section</b>
              <input autoFocus className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. For your IT team" aria-label="Section name" />
              <div className="flex justify-end gap-2">
                <button type="button" className="h-8 px-3 rounded-lg border border-[#D5D9DE] text-[12.5px] font-semibold" onClick={() => setForm(null)}>
                  Back
                </button>
                <button type="submit" className="h-8 px-3 rounded-lg bg-teton-ink text-white text-[12.5px] font-semibold">
                  Add section
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {plans && <PlanPicker d={d} onClose={() => setPlans(false)} add={async (ids, opts) => {
        setPlans(false);
        for (const id of ids) await addResource({ kind: 'floorplan', planId: id, allowDownload: opts.download, blocks: opts.summary ? [{ type: 'plan' }, { type: 'summary' }] : [{ type: 'plan' }] });
      }} />}
    </div>
  );
}

function PlanPicker({ d, onClose, add }: { d: Data; onClose: () => void; add: (ids: number[], o: { summary: boolean; download: boolean }) => void }) {
  const [picked, setPicked] = useState<number[]>(() => d.plans.filter((p) => p.roomsTagged > 0 && !d.resources.some((r) => r.planId === p.planId)).map((p) => p.planId));
  const [summary, setSummary] = useState(true);
  const [download, setDownload] = useState(true);
  const communities = [...new Set(d.plans.map((p) => p.communityName))];
  return createPortal(
    <div data-res-modal className="fixed inset-0 z-[120] grid place-items-center bg-black/35 p-4 [animation:fadeIn_.15s_ease-out]" onClick={onClose} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-label="Add scoped floor plans" className="w-full max-w-[640px] max-h-[88dvh] flex flex-col rounded-[18px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.3)] [animation:fadeScale_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-[#F1EEE7]">
          <b className="text-[17px]">Add scoped floor plans</b>
          <p className="mt-0.5 text-[12.5px] text-teton-ui-gray">Plans tagged in Scope Mode for this deal. Each one becomes a card under Floor plans.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!d.plans.length && <p className="py-6 text-center text-[13px] text-teton-ui-gray">No floor plans uploaded yet. Upload them on the deal’s communities, then tag rooms in Scope Mode.</p>}
          {communities.map((c) => (
            <div key={c}>
              <p className="mt-2 mb-2 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-teton-ui-gray">{c}</p>
              {d.plans
                .filter((p) => p.communityName === c)
                .map((p) => {
                  const on = picked.includes(p.planId);
                  const added = d.resources.some((r) => r.planId === p.planId);
                  return (
                    <label key={p.planId} className={`mb-2 flex items-center gap-3 rounded-xl border px-3 py-2.5 ${added ? 'opacity-50' : 'cursor-pointer'} ${on ? 'border-[#3F8CEA] bg-[#F6FAFF]' : 'border-[#E8E4DC]'}`}>
                      <input type="checkbox" checked={on} disabled={added} onChange={() => setPicked((x) => (on ? x.filter((i) => i !== p.planId) : [...x, p.planId]))} />
                      <span className="min-w-0 flex-1">
                        <b className="block text-[13px]">{p.name}</b>
                        <small className="text-[11.5px] text-teton-ui-gray">{p.roomsTagged ? `${p.roomsTagged} rooms tagged` : 'Not tagged yet'}{added ? ' · already added' : ''}</small>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.roomsTagged ? 'bg-[#F1EEE8] text-[#5A6270]' : 'bg-[#FFF4D6] text-[#8A5A00]'}`}>{p.roomsTagged ? 'Scoped' : 'Not scoped'}</span>
                    </label>
                  );
                })}
            </div>
          ))}
          <div className="mt-3 border-t border-[#F1EEE7]">
            <div className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span>Show the room summary under each plan</span>
              <Switch on={summary} onChange={setSummary} label="Room summary" />
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5 text-[13px] border-t border-[#F1EEE7]">
              <span>Let them download it (PDF with badges)</span>
              <Switch on={download} onChange={setDownload} label="Let them download" />
            </div>
            <p className="text-[11.5px] text-teton-ui-gray">Your team’s plan notes stay internal.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[#F1EEE7] bg-[#FAFAFB] rounded-b-[18px]">
          <span className="text-[12px] text-teton-ui-gray">{picked.length} selected</span>
          <span className="flex-1" />
          <button type="button" className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] text-[13px] font-semibold" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="h-9 px-3.5 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold disabled:opacity-50" disabled={!picked.length} onClick={() => add(picked, { summary, download })}>
            Add {picked.length || ''} floor plan{picked.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Your Team

function TeamEditor({ d, setSettings }: { d: Data; setSettings: (p: Partial<RoomSettings>) => void }) {
  const [q, setQ] = useState('');
  const s = d.settings;
  const edit = d.canEdit;
  const contact = d.profiles.find((p) => p.userId === s.contactUserId) ?? null;
  const [changing, setChanging] = useState(false);
  const inTeam = new Set([s.contactUserId, ...s.team.map((t) => t.userId)]);
  const matches = q.trim() ? d.profiles.filter((p) => !inTeam.has(p.userId) && `${p.name} ${p.title ?? ''} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const sec = 'mt-3.5 rounded-[15px] border border-[#E8E4DC] bg-white px-[18px] py-4';
  const h = 'mb-2.5 flex items-center text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]';
  const field = 'w-full rounded-[10px] border border-[#D5D9DE] px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15 disabled:bg-teton-almost-white';
  return (
    <div>
      <p className="text-[10.5px] font-extrabold uppercase tracking-[2px] text-teton-ui-gray">Your Team · landing page</p>
      <h2 className="mt-1 text-[22px] font-semibold tracking-[-.3px]">{(s.heading || DEFAULT_HEADING).replace(/\{customer\}/gi, d.customer)}</h2>
      <p className="mt-1 text-[13px] text-teton-ui-gray">The page they see first on the {s.tabName} tab.</p>
      <div className={sec}>
        <p className={h}>Page</p>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold">Heading</span>
          <input className={`${field} h-[38px]`} value={s.heading} disabled={!edit} maxLength={120} onChange={(e) => setSettings({ heading: e.target.value })} />
          <span className="mt-1 block text-[11.5px] text-teton-ui-gray">{'{customer}'} becomes “{d.customer}”.</span>
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-semibold">
            Note from {contact?.name.split(/\s+/)[0] ?? 'the main contact'} <span className="font-normal text-teton-ui-gray">(optional, under their card)</span>
          </span>
          <textarea className={`${field} min-h-[70px] py-2 resize-y`} value={s.note ?? ''} disabled={!edit} maxLength={1000} onChange={(e) => setSettings({ note: e.target.value })} placeholder="Great talking today. Everything we discussed is in here." />
        </label>
      </div>
      <div className={sec}>
        <p className={h}>
          Main point of contact
          <a href="/profile" target="_blank" rel="noopener" className="ml-auto normal-case tracking-normal font-semibold text-[12px] text-[#1F5FB5]">
            Edit your profile ↗
          </a>
        </p>
        {contact && (
          <div className="flex flex-wrap items-center gap-3.5">
            <PersonPhoto name={contact.name} photoUrl={contact.photoUrl} size={72} square />
            <div className="min-w-0 flex-1">
              <b className="text-[15px]">{contact.name}</b>
              <p className="text-[12.5px] text-[#6B7380] break-words">{[contact.title ?? 'No title in their profile yet', contact.email, contact.showPhone ? contact.phone : null].filter(Boolean).join(' · ')}</p>
              <p className="text-[11.5px] text-teton-ui-gray">From their profile (photo, title, phone).{contact.userId === d.ownerId ? ' The deal owner.' : ''}</p>
            </div>
            {edit && (
              <button type="button" className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] text-[13px] font-semibold" onClick={() => setChanging((c) => !c)}>
                Change
              </button>
            )}
          </div>
        )}
        {changing && (
          <select className={`${field} h-[38px] mt-3`} value={s.contactUserId ?? ''} onChange={(e) => (setSettings({ contactUserId: Number(e.target.value), team: s.team.filter((t) => t.userId !== Number(e.target.value)) }), setChanging(false))} aria-label="Main point of contact">
            {d.profiles.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
                {p.title ? ` · ${p.title}` : ''}
              </option>
            ))}
          </select>
        )}
        <div className="mt-3 pt-3 border-t border-[#F1EEE7] flex items-center justify-between gap-3 text-[13px]">
          <span>
            Show “Book a meeting”
            <small className="block text-[11.5px] text-teton-ui-gray">{contact?.schedulingUrl ? `Their scheduling link: ${contact.schedulingUrl.replace(/^https?:\/\//, '')}` : 'Add a scheduling link to their profile first'}</small>
          </span>
          <Switch on={s.showBooking && !!contact?.schedulingUrl} disabled={!edit || !contact?.schedulingUrl} onChange={(v) => setSettings({ showBooking: v })} label="Show Book a meeting" />
        </div>
      </div>
      <div className={sec}>
        <p className={h}>Also on their team</p>
        {!s.team.length && <p className="text-[12.5px] text-teton-ui-gray">Add teammates the prospect will work with (implementation, clinical, IT…).</p>}
        {s.team.map((t, i) => {
          const p = d.profiles.find((x) => x.userId === t.userId);
          if (!p) return null;
          return (
            <div key={t.userId} className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-2.5 border-t border-[#F1EEE7] first-of-type:border-0">
              <span className="flex flex-col">
                <button type="button" aria-label="Move up" disabled={!edit || i === 0} className="text-[11px] text-[#8A919C] disabled:opacity-30" onClick={() => setSettings({ team: s.team.map((x, k) => (k === i - 1 ? s.team[i] : k === i ? s.team[i - 1] : x)) })}>
                  ▲
                </button>
                <button type="button" aria-label="Move down" disabled={!edit || i === s.team.length - 1} className="text-[11px] text-[#8A919C] disabled:opacity-30" onClick={() => setSettings({ team: s.team.map((x, k) => (k === i + 1 ? s.team[i] : k === i ? s.team[i + 1] : x)) })}>
                  ▼
                </button>
              </span>
              <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={42} />
              <span className="w-[160px] min-w-0">
                <b className="block text-[13px] truncate">{p.name}</b>
                <small className="block text-[11.5px] text-teton-ui-gray truncate">{p.title ?? 'No title yet'}</small>
              </span>
              <input className={`${field} h-9 flex-1 min-w-[180px]`} value={t.line ?? ''} disabled={!edit} maxLength={160} placeholder="Their part on this deal" onChange={(e) => setSettings({ team: s.team.map((x, k) => (k === i ? { ...x, line: e.target.value } : x)) })} aria-label={`${p.name}’s part`} />
              {edit && (
                <button type="button" aria-label={`Remove ${p.name}`} className="w-7 h-7 rounded-md text-[#8A919C] hover:bg-teton-almost-white" onClick={() => setSettings({ team: s.team.filter((x) => x.userId !== t.userId) })}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {edit && (
          <div className="relative mt-2">
            <input className={`${field} h-[38px] border-dashed`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Add a teammate…" aria-label="Add a teammate" />
            {matches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-[#E3DFD8] bg-white p-1 shadow-[0_10px_26px_rgba(0,0,0,.1)]">
                {matches.map((p) => (
                  <button key={p.userId} type="button" className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[#F3F7FD]" onClick={() => (setSettings({ team: [...s.team, { userId: p.userId, line: null }] }), setQ(''))}>
                    <PersonPhoto name={p.name} photoUrl={p.photoUrl} size={30} />
                    <span className="min-w-0">
                      <b className="block text-[12.5px]">{p.name}</b>
                      <small className="block text-[11px] text-teton-ui-gray truncate">{[p.title, p.email].filter(Boolean).join(' · ')}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11.5px] text-teton-ui-gray">Name, title, photo and contact come from each person’s profile. The line beside them is just for this deal.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- a card's settings

function ItemSettings({ d, r, activity, setResource, remove, upload }: { d: Data; r: Resource; quoteId: number; activity: Activity | null; setResource: (id: number, p: Partial<Resource> & { fileId?: number }) => void; remove: () => void; upload: (f: File) => Promise<number | null> }) {
  const [busy, setBusy] = useState(false);
  const edit = d.canEdit;
  const sec = 'mt-3.5 rounded-[15px] border border-[#E8E4DC] bg-white px-[18px] py-4';
  const h = 'mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]';
  const field = 'w-full h-[38px] rounded-[10px] border border-[#D5D9DE] px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15 disabled:bg-teton-almost-white';
  const row = 'flex items-center justify-between gap-3 py-2.5 border-t border-[#F1EEE7] text-[13px]';
  const info = r.kind === 'floorplan' ? d.plans.find((p) => p.planId === r.planId) : null;
  const who = activity ? activity.people.map((p) => ({ p, c: activity.cells[`r${r.id}|${p.email}`] })).filter((x) => x.c) : [];
  return (
    <div>
      <div className={sec}>
        <p className={h}>Details</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-[12px] font-semibold">Title</span>
            <input className={field} value={r.title} disabled={!edit} maxLength={160} onChange={(e) => setResource(r.id, { title: e.target.value })} />
          </label>
          <label>
            <span className="mb-1 block text-[12px] font-semibold">Section</span>
            <select className={field} value={r.sectionId} disabled={!edit} onChange={(e) => setResource(r.id, { sectionId: e.target.value })}>
              {d.settings.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-semibold">Short description (on the card)</span>
          <input className={field} value={r.description ?? ''} disabled={!edit} maxLength={240} placeholder={r.kind === 'video' ? 'Nov 12 · Kevin, Dana Lee, Chris Fox' : 'A line about it'} onChange={(e) => setResource(r.id, { description: e.target.value })} />
        </label>
        <div className="mt-3">
          <IconPicker r={r} edit={edit} onChange={(icon) => setResource(r.id, { icon })} />
        </div>
        <span className="mt-3 mb-1 block text-[12px] font-semibold">Source</span>
        <div className="flex flex-wrap items-center gap-3 rounded-[11px] border border-[#E3DFD8] bg-[#FBF8F3] px-3 py-2.5">
          <span className="w-[34px] h-[34px] rounded-[9px] grid place-items-center flex-shrink-0" style={{ background: metaOf(r).bg, color: metaOf(r).fg }}>
            {metaOf(r).icon}
          </span>
          <span className="min-w-0 flex-1">
            {r.file ? (
              <>
                <b className="block text-[13px] break-words">{r.file.name}</b>
                <small className="text-[11.5px] text-teton-ui-gray">{[sizeOf(r.file.size), r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : null, r.kind === 'video' ? 'plays on the page' : null].filter(Boolean).join(' · ')}</small>
              </>
            ) : r.kind === 'link' || r.kind === 'embed' ? (
              <input className={`${field} bg-white`} value={r.url ?? ''} disabled={!edit} onChange={(e) => setResource(r.id, { url: e.target.value })} aria-label="Link" />
            ) : r.kind === 'floorplan' ? (
              <>
                <b className="block text-[13px]">{info ? `${info.communityName} · ${info.name}` : 'Floor plan'}</b>
                <small className="text-[11.5px] text-teton-ui-gray">{info ? `${info.roomsTagged} rooms tagged · badges and counts come from Scope Mode` : 'This plan was removed from the deal'}</small>
              </>
            ) : (
              <>
                <b className="block text-[13px]">One pager from the proposal</b>
                <small className="text-[11.5px] text-teton-ui-gray">Opens that page of the proposal, always current</small>
              </>
            )}
          </span>
          {edit && r.file && (
            <label className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold inline-flex items-center cursor-pointer">
              {busy ? 'Uploading…' : 'Replace'}
              <input
                type="file"
                className="hidden"
                accept={r.kind === 'video' ? 'video/*' : undefined}
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setBusy(true);
                  const id = await upload(f);
                  setBusy(false);
                  if (id) setResource(r.id, { fileId: id });
                }}
              />
            </label>
          )}
        </div>
        {(r.file || r.kind === 'floorplan') && (
          <div className={`${row} mt-3`}>
            <span>Let them download it{r.kind === 'floorplan' ? ' (PDF with badges)' : ''}</span>
            <Switch on={r.allowDownload} disabled={!edit} onChange={(v) => setResource(r.id, { allowDownload: v })} label="Let them download it" />
          </div>
        )}
        <div className={row}>
          <span>Show this card to the prospect</span>
          <Switch on={!r.hidden} disabled={!edit} onChange={(v) => setResource(r.id, { hidden: !v })} label="Show this card to the prospect" />
        </div>
        <div className={row}>
          <span>
            <b className="font-semibold">★ Recommend this</b>
            <small className="block text-[11.5px] leading-snug text-teton-ui-gray">Puts a Recommended star on the card, and lists it under Recommended on Your Team.</small>
          </span>
          <Switch on={r.recommended} disabled={!edit} onChange={(v) => setResource(r.id, { recommended: v })} label="Recommend this" />
        </div>
      </div>
      <div className={sec}>
        <p className={h}>Who’s looked at it</p>
        {!who.length ? (
          <p className="text-[12.5px] text-teton-ui-gray">No one yet.</p>
        ) : (
          who.map(({ p, c }) => {
            const watched = r.duration && c.video ? Math.min(1, c.video / r.duration) : null;
            return (
              <div key={p.email} className="grid grid-cols-[30px_1fr_auto] gap-2.5 items-center py-2 border-t border-[#F1EEE7] first-of-type:border-0 text-[12.5px]">
                <PersonPhoto name={p.name || p.email} photoUrl={null} size={30} />
                <div className="min-w-0">
                  <b>{p.name || p.email}</b>{' '}
                  {[c.video ? `watched ${fmtDur(c.video)}${r.duration ? ` of ${fmtDur(r.duration)}` : ''}` : null, c.time ? `${fmtDur(c.time)} on it` : null, c.opens ? `${c.opens} visit${c.opens === 1 ? '' : 's'}` : null, c.downloads ? 'downloaded it' : null, c.clicks ? `${c.clicks} click${c.clicks === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'opened it'}
                  {watched != null && (
                    <div className="mt-1 h-1.5 rounded bg-[#EFECE6] overflow-hidden">
                      <i className="block h-full bg-[#2E9E5B]" style={{ width: `${watched * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <p className="mt-2 text-[11.5px] text-teton-ui-gray">From who’s signed in to the link. {r.kind === 'embed' ? (metaOf(r).label === 'Deck' ? 'Embedded decks show time on the card.' : 'Embedded videos show time on the card, not how much was played.') : ''}</p>
      </div>
      {edit && (
        <div className="mt-4 flex justify-end">
          <button type="button" className="h-9 px-3.5 rounded-[10px] text-[13px] font-semibold text-[#C2412D] hover:bg-[#FDF0EE]" onClick={remove}>
            Delete this card
          </button>
        </div>
      )}
    </div>
  );
}

export type { ViewCtx };
