'use client';

/**
 * The prospect's Resources tab (beside the proposal): a panel of cards — Your Team first, then the team's decks,
 * documents, case studies, floor plans and recordings, grouped in sections — and the selected one on the right. New
 * cards (since their last visit on this device) get a dot. What they open and how long they spend is recorded (from
 * the email they signed in with), as are proposal pages, so the team can follow up.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { useComments } from '@/components/proposal/Comments';
import { PersonPhoto } from '@/components/resources/Person';
import { ResourceView, fileKind, metaOf, sizeOf, type ViewCtx } from '@/components/resources/Viewers';
import type { FloorPlanInfo, ProspectRoom, RoomPerson } from '@/lib/data/dealRooms';
import type { Resource } from '@/lib/resources/model';

type Sel = 'team' | number;
type Target = { target: 'team' | 'proposal' | 'item'; resourceId?: number; detail?: string | null };

/** Batched engagement events: sent every 15 seconds, and when the page is hidden. */
function useEvents(token: string) {
  const queue = useRef<Array<Record<string, unknown>>>([]);
  const flush = useCallback(
    (beacon = false) => {
      if (!queue.current.length) return;
      const body = JSON.stringify({ events: queue.current.splice(0, 20) });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(`/api/share/${token}/events`, new Blob([body], { type: 'application/json' }));
      else void fetch(`/api/share/${token}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    },
    [token],
  );
  useEffect(() => {
    const t = setInterval(() => flush(), 15000);
    const hide = () => document.visibilityState === 'hidden' && flush(true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', () => flush(true));
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [flush]);
  return useCallback((e: Record<string, unknown>) => queue.current.push(e), []);
}

/** Time on what they're looking at: a heartbeat every 15 seconds while the page is visible. */
function useHeartbeat(push: (e: Record<string, unknown>) => void, target: Target | null) {
  const key = target ? `${target.target}:${target.resourceId ?? ''}:${target.detail ?? ''}` : '';
  const since = useRef(Date.now());
  const cur = useRef(target);
  cur.current = target;
  useEffect(() => {
    since.current = Date.now();
    const beat = () => {
      const t = cur.current;
      const sec = Math.min(60, Math.round((Date.now() - since.current) / 1000));
      since.current = Date.now();
      if (t && sec >= 2 && document.visibilityState === 'visible') push({ ...t, kind: 'time', value: sec });
    };
    const iv = setInterval(beat, 15000);
    const vis = () => (document.visibilityState === 'visible' ? (since.current = Date.now()) : beat());
    document.addEventListener('visibilitychange', vis);
    return () => {
      beat();
      clearInterval(iv);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [key, push]);
}

export function useResourcesTab(token: string, proposalPage: string | null, team = false) {
  const [room, setRoom] = useState<ProspectRoom | null>(null);
  const [plans, setPlans] = useState<FloorPlanInfo[]>([]);
  const [tab, setTabState] = useState<'proposal' | 'resources'>('proposal');
  const [sel, setSel] = useState<Sel>('team');
  const [seen, setSeen] = useState<Record<string, string>>({});
  const send = useEvents(token);
  // The deal's own team looking at the link: nothing is recorded.
  const push = useCallback((e: Record<string, unknown>) => (team ? 0 : send(e)), [team, send]);
  useEffect(() => {
    void fetch(`/api/share/${token}/resources`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { room: ProspectRoom | null; plans?: FloorPlanInfo[] } | null) => {
        if (!j?.room) return;
        setRoom(j.room);
        setPlans(j.plans ?? []);
        try {
          setSeen(JSON.parse(localStorage.getItem(`teton-seen-${token}`) ?? '{}') as Record<string, string>);
        } catch {
          /* private mode */
        }
        if (new URLSearchParams(window.location.search).get('tab') === 'resources') setTabState('resources');
      });
  }, [token]);
  const isNew = useCallback((r: Resource) => seen[r.id] !== r.updatedAt, [seen]);
  const markSeen = useCallback(
    (r: Resource) =>
      setSeen((s) => {
        const next = { ...s, [r.id]: r.updatedAt };
        try {
          localStorage.setItem(`teton-seen-${token}`, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      }),
    [token],
  );
  const select = useCallback(
    (s: Sel) => {
      setSel(s);
      push(s === 'team' ? { target: 'team', kind: 'open' } : { target: 'item', resourceId: s, kind: 'open' });
      if (s !== 'team') {
        const r = room?.resources.find((x) => x.id === s);
        if (r) markSeen(r);
      }
      document.querySelector('[data-res-main]')?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    },
    [push, room, markSeen],
  );
  const setTab = useCallback(
    (t: 'proposal' | 'resources') => {
      setTabState(t);
      if (t === 'resources') push(sel === 'team' ? { target: 'team', kind: 'open' } : { target: 'item', resourceId: sel, kind: 'open' });
      window.scrollTo({ top: 0 });
    },
    [push, sel],
  );
  // Proposal pages they move to (after a few seconds there), for "keeps coming back to pricing".
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== 'proposal' || !proposalPage || proposalPage === lastPage.current) return;
    const t = setTimeout(() => {
      lastPage.current = proposalPage;
      push({ target: 'proposal', kind: 'page', detail: proposalPage });
    }, 4000);
    return () => clearTimeout(t);
  }, [tab, proposalPage, push]);
  useHeartbeat(push, tab === 'proposal' ? { target: 'proposal', detail: proposalPage } : sel === 'team' ? { target: 'team' } : { target: 'item', resourceId: sel });
  const newCount = room ? room.resources.filter(isNew).length : 0;
  return { room, plans, tab, setTab, sel, select, isNew, newCount, push };
}
export type ResourcesTab = ReturnType<typeof useResourcesTab>;

export function TabSwitch({ rt, className = '' }: { rt: ResourcesTab; className?: string }) {
  if (!rt.room) return null;
  return (
    <SegGroup className={`relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5 ${className}`} thumbClass="bg-white shadow-sm rounded-[8px]" label="Proposal or resources">
      {(['proposal', 'resources'] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={rt.tab === t} onClick={() => rt.setTab(t)} className={`relative z-[1] flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-[8px] text-[13px] font-semibold whitespace-nowrap transition-colors duration-200 ${rt.tab === t ? 'text-teton-ink' : 'text-[#6B7380]'}`}>
          {t === 'proposal' ? 'Proposal' : rt.room!.tabName}
          {t === 'resources' && rt.newCount > 0 && <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-[#3F8CEA] text-white text-[10px] font-bold grid place-items-center">{rt.newCount}</span>}
        </button>
      ))}
    </SegGroup>
  );
}

const chip = 'inline-flex items-center h-[19px] px-[7px] rounded-full bg-[#F1EEE8] text-[#5A6270] text-[10.5px] font-semibold';

function Card({ on, icon, bg, fg, title, sub, chips, fresh, onClick }: { on: boolean; icon: React.ReactNode; bg: string; fg?: string; title: string; sub: string | null; chips: string[]; fresh: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? 'true' : undefined} className={`relative sm:w-full flex-[0_0_236px] sm:flex-none flex gap-[11px] items-start text-left rounded-[13px] border bg-white px-3 py-[11px] sm:mb-2 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none ${on ? 'border-teton-ink shadow-[0_0_0_1px_#1C2430,0_6px_16px_rgba(0,0,0,.07)]' : 'border-[#E8E4DC] hover:border-[#C9CDD3]'}`}>
      {on && <span className="hidden sm:block absolute -left-[15px] top-3 bottom-3 w-[3px] rounded bg-[#D9553F] [animation:fadeIn_.2s_ease-out]" aria-hidden="true" />}
      {fresh && <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#3F8CEA]" title="New" />}
      <span className="w-[38px] h-[38px] rounded-[10px] grid place-items-center flex-shrink-0 text-[16px] overflow-hidden" style={{ background: bg, color: fg }}>
        {icon}
      </span>
      <span className="min-w-0">
        <b className="block text-[13px] leading-snug pr-3">{title}</b>
        {sub && <small className="block text-[11.5px] leading-snug text-[#6B7380] mt-0.5 line-clamp-2">{sub}</small>}
        {chips.length > 0 && <span className="flex flex-wrap gap-1.5 mt-1.5">{chips.map((c) => <span key={c} className={chip}>{c}</span>)}</span>}
      </span>
    </button>
  );
}

export function ResourcesView({ rt, token, allowComments }: { rt: ResourcesTab; token: string; allowComments: boolean }) {
  const comments = useComments();
  const room = rt.room!;
  const booking = room.showBooking ? room.contact?.schedulingUrl ?? null : null;
  const ctx: ViewCtx = useMemo(
    () => ({
      mode: 'prospect',
      fileUrl: (r, o) => `/api/share/${token}/resources/${r.id}/file?${o?.f ? `f=${o.f}&` : ''}${o?.dl ? 'dl=1' : ''}`,
      planUrl: (pid) => `/api/share/${token}/floorplans/${pid}`,
      goUrl: (r, b) => `/api/share/${token}/resources/${r.id}/go${b ? `?b=${encodeURIComponent(b)}` : ''}`,
      resources: room.resources,
      plans: rt.plans,
      booking,
      onSelect: (id) => rt.select(id),
      onOpenProposal: (pageId) => {
        rt.setTab('proposal');
        if (pageId) setTimeout(() => void import('./ProspectContents').then((m) => m.goToPage(pageId)), 80);
      },
      track: (e) => rt.sel !== 'team' && rt.push({ target: 'item', resourceId: rt.sel, ...e }),
    }),
    [token, room, rt, booking],
  );
  const people = [room.contact, ...room.team].filter((p): p is RoomPerson => !!p);
  const r = rt.sel === 'team' ? null : room.resources.find((x) => x.id === rt.sel) ?? null;
  const icon = (x: Resource) => (x.kind === 'floorplan' ? '▦' : metaOf(x).icon);
  const chipsOf = (x: Resource) => {
    const info = x.kind === 'floorplan' ? rt.plans.find((p) => p.planId === x.planId) : null;
    if (info) return [`${info.roomsTagged} rooms`];
    return [fileKind(x), x.file && x.file.mime !== 'video/mp4' && !x.file.mime.startsWith('video/') ? sizeOf(x.file.size) : null, x.duration ? `${Math.round(x.duration / 60)} min` : null, x.kind === 'link' ? 'Link' : null, x.kind === 'embed' && metaOf(x).label === 'Deck' ? 'Deck' : null, x.file && x.allowDownload && x.kind === 'file' ? '⤓ Download' : null].filter((c): c is string => !!c);
  };
  return (
    <div className="sm:flex min-h-[calc(100dvh-61px)] bg-[#FBF8F3] [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <aside className="no-print sm:w-[316px] flex-shrink-0 sm:border-r border-b sm:border-b-0 border-[#ECE8DF] bg-[#F6F3EE] sm:sticky sm:top-[61px] sm:h-[calc(100dvh-61px)] overflow-x-auto sm:overflow-x-hidden sm:overflow-y-auto overscroll-contain">
        <nav aria-label={room.tabName} className="flex sm:block gap-[9px] px-3.5 sm:pl-[18px] sm:pr-3.5 py-3 sm:py-[18px]">
          <p className="hidden sm:block text-[10px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C] mx-1.5 mb-2">Start here</p>
          <Card
            on={rt.sel === 'team'}
            icon="👋"
            bg="#FDF0EE"
            title="Your Team"
            sub={`Who’s working on your ${room.resources.length ? 'project' : 'proposal'}, and how to reach us`}
            chips={people.length ? [`${people.length} ${people.length === 1 ? 'person' : 'people'}`] : []}
            fresh={false}
            onClick={() => rt.select('team')}
          />
          {room.sections.map((s) => (
            <div key={s.id} className="contents sm:block">
              <p className="hidden sm:block text-[10px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C] mx-1.5 mt-4 mb-2">{s.name}</p>
              {room.resources
                .filter((x) => x.sectionId === s.id)
                .map((x) => (
                  <Card key={x.id} on={rt.sel === x.id} icon={icon(x)} bg={metaOf(x).bg} fg={metaOf(x).fg} title={x.title} sub={x.description} chips={chipsOf(x)} fresh={rt.isNew(x)} onClick={() => rt.select(x.id)} />
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <main data-res-main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-11 pt-6 sm:pt-8 pb-16">
        <div className="max-w-[920px] mx-auto">
          {r ? (
            <ResourceView
              key={r.id}
              r={r}
              ctx={ctx}
              actions={
                allowComments ? (
                  <button type="button" onClick={() => comments.open({ target: { page: null, block: null, label: r.title } })} className="h-[38px] px-4 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-teton-almost-white">
                    💬 Comment
                  </button>
                ) : null
              }
            />
          ) : (
            <TeamView room={room} />
          )}
        </div>
      </main>
    </div>
  );
}

function Contact({ p, size = 13 }: { p: RoomPerson; size?: number }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 mt-2" style={{ fontSize: size }}>
      <a href={`mailto:${p.email}`} className="inline-flex gap-1.5 items-center hover:underline">
        <span className="text-[#8A919C]">✉</span>
        {p.email}
      </a>
      {p.phone && (
        <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="inline-flex gap-1.5 items-center hover:underline">
          <span className="text-[#8A919C]">☏</span>
          {p.phone}
        </a>
      )}
      {p.linkedin && (
        <a href={p.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on LinkedIn`} title={`${p.name} on LinkedIn`} className="inline-flex items-center rounded-[4px] transition-opacity hover:opacity-80">
          <svg viewBox="0 0 24 24" width={size + 5} height={size + 5} aria-hidden="true">
            <rect width="24" height="24" rx="4" fill="#0A66C2" />
            <path fill="#fff" d="M6.94 9.5H4.56V19h2.38V9.5ZM5.75 5.5a1.38 1.38 0 1 0 0 2.76 1.38 1.38 0 0 0 0-2.76ZM19.44 13.6c0-2.56-.55-4.3-3.52-4.3-1.43 0-2.39.78-2.78 1.53h-.04V9.5H10.8V19h2.37v-4.7c0-1.24.24-2.44 1.77-2.44 1.51 0 1.53 1.42 1.53 2.52V19h2.38v-5.4Z" />
          </svg>
        </a>
      )}
    </p>
  );
}

function TeamView({ room }: { room: ProspectRoom }) {
  const c = room.contact;
  const first = c?.name.split(/\s+/)[0];
  return (
    <div className="[animation:fadeUp_.25s_ease-out] motion-reduce:[animation:none]">
      <p className="text-[11px] font-extrabold uppercase tracking-[3px] text-[#D9553F]">Your Teton team</p>
      <h1 className="mt-1.5 text-[26px] sm:text-[30px] font-semibold leading-tight tracking-[-.5px]">{room.heading}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#5A6270] max-w-[620px]">The people working with you. Reach any of us directly{first ? `; ${first} is your main point of contact` : ''}.</p>
      {c && (
        <div className="mt-5 grid sm:grid-cols-[150px_1fr] gap-4 sm:gap-[22px] rounded-[18px] border border-[#E8E4DC] bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <PersonPhoto name={c.name} photoUrl={c.photoUrl} size={150} square className="max-sm:!w-24 max-sm:!h-24" />
          <div className="min-w-0">
            <span className="inline-block rounded-full bg-[#FDF0EE] px-2 py-0.5 text-[11px] font-semibold text-[#B4442C]">Your main point of contact</span>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-.3px]">{c.name}</h2>
            <p className="text-[13.5px] text-[#5A6270]">{c.title ? `${c.title} · ` : ''}Teton</p>
            <Contact p={c} />
            {c.bio && <p className="mt-2 text-[12.5px] leading-relaxed text-[#5A6270]">{c.bio}</p>}
            {room.note && <p className="mt-3 rounded-r-[10px] border-l-[3px] border-[#D9553F] bg-[#FBF8F3] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#3A4250] whitespace-pre-wrap">{room.note}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`mailto:${c.email}`} className="h-[38px] px-4 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold inline-flex items-center gap-1.5">
                ✉ Email {first}
              </a>
              {room.showBooking && c.schedulingUrl && (
                <a href={c.schedulingUrl} target="_blank" rel="noopener noreferrer" className="h-[38px] px-4 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-teton-almost-white">
                  📅 Book a meeting
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="h-[38px] px-4 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-teton-almost-white">
                  ☏ Call
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {room.team.length > 0 && (
        <>
          <p className="mt-7 mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]">Also on your team</p>
          <div className="grid gap-3 md:grid-cols-2">
            {room.team.map((m) => (
              <div key={m.userId} className="flex gap-3.5 rounded-[15px] border border-[#E8E4DC] bg-white p-3.5">
                <PersonPhoto name={m.name} photoUrl={m.photoUrl} size={54} />
                <div className="min-w-0">
                  <b className="block text-[14px]">{m.name}</b>
                  {m.title && <p className="text-[12px] text-[#5A6270]">{m.title}</p>}
                  {m.line && <p className="mt-1.5 text-[12px] leading-snug text-[#5A6270]">{m.line}</p>}
                  <Contact p={m} size={12} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
