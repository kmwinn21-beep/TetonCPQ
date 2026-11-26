'use client';

/**
 * Teton Novelty Mode: the Resources panel's cards drawn like the Teton dashboard's bed cards. Upright cards, three
 * to a row in each section, showing only the main icon and its badges:
 * - fill: opened (white), new (purple, with "z z"), needs you (red glow), selected (black ring);
 * - top right: a status sticker (To do, NEW), with Recommended ★ fanned behind it (or alone);
 * - bottom left: the conversation (blue with a red dot: a reply they haven't seen; white with a count: seen);
 * - bottom: viewed (green check) or part-watched (blue play, with a bar);
 * - over the icon: "→ link".
 * Hovering (or focusing) a card shows its details underneath, lined up with it. Phones get one sideways row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FloorPlanInfo, ProspectRoom } from '@/lib/data/dealRooms';
import type { Resource } from '@/lib/resources/model';
import { fileKind, metaOf } from '@/components/resources/Viewers';
import type { ItemReplies, ResourcesTab } from './ProspectResources';
import type { AgreementState } from './ProspectAgreement';

// ---------------------------------------------------------------- icons

const stroke = { fill: 'none', stroke: '#3F3F46', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 64 64" className="w-[46px] h-[46px]" aria-hidden="true">
    {children}
  </svg>
);
const I = {
  deck: (
    <Svg>
      <rect x="6" y="12" width="52" height="34" rx="4" {...stroke} fill="#fff" />
      <path d="M32 46v8M22 56h20" {...stroke} />
      <path d="M16 36l9-9 7 6 10-12 6 6" {...stroke} stroke="#7C6FF0" />
    </Svg>
  ),
  doc: (
    <Svg>
      <rect x="14" y="6" width="36" height="50" rx="4" {...stroke} fill="#fff" />
      <path d="M22 18h20M22 26h20M22 34h20M22 42h12" {...stroke} />
    </Svg>
  ),
  one: (
    <Svg>
      <rect x="14" y="6" width="36" height="50" rx="4" {...stroke} fill="#fff" />
      <path d="M22 16h20M22 44h14" {...stroke} />
      <rect x="22" y="24" width="20" height="12" rx="2" {...stroke} fill="#E4E0FF" />
    </Svg>
  ),
  file: (tag: string) => (
    <Svg>
      <path d="M16 6h22l12 12v38a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" {...stroke} fill="#fff" />
      <path d="M38 6v12h12" {...stroke} />
      <rect x="17" y="32" width="26" height="12" rx="3" fill="#D9553F" />
      <text x="30" y="41.3" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="8.5" fill="#fff">
        {tag.slice(0, 4)}
      </text>
    </Svg>
  ),
  play: (
    <Svg>
      <circle cx="32" cy="32" r="24" {...stroke} fill="#fff" />
      <path d="M27 22l15 10-15 10V22z" fill="#3F3F46" />
    </Svg>
  ),
  link: (
    <Svg>
      <circle cx="32" cy="32" r="22" {...stroke} fill="#fff" />
      <path d="M10 32h44M32 10c7 7 7 37 0 44M32 10c-7 7-7 37 0 44" {...stroke} />
    </Svg>
  ),
  chart: (
    <Svg>
      <path d="M12 52V32M26 52V22M40 52V36M54 52V14M8 56h50" {...stroke} strokeWidth={3.5} />
    </Svg>
  ),
  shield: (
    <Svg>
      <path d="M32 6l20 8v14c0 13-9 22-20 28C21 50 12 41 12 28V14l20-8z" {...stroke} fill="#fff" />
      <path d="M23 31l6 6 12-12" {...stroke} />
    </Svg>
  ),
  plan: (
    <Svg>
      <rect x="8" y="10" width="48" height="44" rx="3" {...stroke} fill="#fff" />
      <path d="M8 32h20v22M28 10v12M40 32h16M40 32v10" {...stroke} />
      {[
        [18, 21],
        [46, 21],
        [18, 44],
        [48, 45],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="3" fill="#46A951" />
      ))}
    </Svg>
  ),
  sign: (
    <Svg>
      <rect x="12" y="8" width="32" height="44" rx="4" {...stroke} fill="#fff" />
      <path d="M19 20h18M19 28h18M19 36h10" {...stroke} />
      <path d="M36 50l14-14 5 5-14 14h-5v-5z" {...stroke} fill="#E5484D" />
    </Svg>
  ),
};
/** "Zzz": three bold Z's rising, in purple (not opened yet). */
export function Zzz({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 22" className={className} aria-hidden="true">
      <path d="M2 13h7l-7 7h7" fill="none" stroke="#7C6FF0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8h6l-6 6h6" fill="none" stroke="#7C6FF0" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3h5l-5 5h5" fill="none" stroke="#7C6FF0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const CHECK = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <path d="M5.5 12.5l4.2 4.2L18.5 7.8" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PLAY = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.9l9-5.8c.6-.4.6-1.3 0-1.7l-9-5.8c-.7-.5-1.6 0-1.6.8z" fill="#fff" />
  </svg>
);
const BANG = (
  <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" aria-hidden="true">
    <rect x="9.6" y="3.2" width="4.8" height="12" rx="2.4" fill="#fff" />
    <circle cx="12" cy="19.4" r="2.6" fill="#fff" />
  </svg>
);
const DOTS = (c: string) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    {[7, 12, 17].map((x) => (
      <circle key={x} cx={x} cy="12" r="2.1" fill={c} />
    ))}
  </svg>
);

// ---------------------------------------------------------------- what a card shows

type Fill = 'opened' | 'new' | 'act';
interface CardModel {
  key: string;
  icon: React.ReactNode;
  fill: Fill;
  on: boolean;
  sticker: 'todo' | 'new' | 'mine' | null;
  rec: boolean;
  zz: boolean;
  out: string | null;
  bubble: 'ok' | 'play' | null;
  progress: number | null;
  talk: ItemReplies | null;
  /** The details shown on hover: [icon, bold line, small line]. */
  tip: Array<[React.ReactNode, string, React.ReactNode]>;
  /** Videos: how many key moments (the yellow count, bottom right). */
  moments: number | null;
  label: string;
  onOpen: () => void;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const shortDate = (at: string) => {
  const d = new Date(at.includes('T') ? at : `${at.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const ago = (at: string) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(at.includes('T') ? at : `${at.replace(' ', 'T')}Z`)) / 60000));
  if (mins < 60) return mins < 2 ? 'just now' : `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : shortDate(at);
};

function iconOf(r: Resource) {
  if (r.kind === 'floorplan') return I.plan;
  if (r.kind === 'onepager') return I.one;
  if (r.kind === 'video' || (r.kind === 'embed' && metaOf(r).label !== 'Deck')) return I.play;
  if (r.kind === 'embed') return I.deck;
  if (r.kind === 'file') return I.file(fileKind(r) || 'FILE');
  if (r.sectionId === 'cases') return I.chart;
  if (/trust|security|hipaa|privacy|soc/i.test(`${r.url ?? ''} ${r.title}`)) return I.shield;
  return I.link;
}
function kindLine(r: Resource, plans: FloorPlanInfo[]) {
  if (r.kind === 'floorplan') {
    const p = plans.find((x) => x.planId === r.planId);
    return p ? `Floor plan · ${p.roomsTagged} rooms scoped` : 'Floor plan';
  }
  if (r.kind === 'link') {
    try {
      return `Opens ${new URL(r.url ?? '').hostname.replace(/^www\./, '')}`;
    } catch {
      return 'Link';
    }
  }
  const parts = [metaOf(r).label, r.duration ? `${Math.round(r.duration / 60)} min` : null, r.description].filter(Boolean);
  return parts.join(' · ');
}

function cardFor(r: Resource, rt: ResourcesTab, plans: FloorPlanInfo[], talk: ItemReplies | null, owner: string): CardModel {
  const isNew = rt.isNew(r);
  const seen = rt.everSeen(r);
  const vid = r.kind === 'video' && r.duration ? Math.min(1, (rt.watched[String(r.id)] ?? 0) / r.duration) : null;
  const part = vid != null && vid > 0.02 && vid < 0.9;
  const isVideo = r.kind === 'video' || (r.kind === 'embed' && metaOf(r).label !== 'Deck');
  const moments = isVideo ? r.blocks.reduce((n, b) => n + (b.type === 'moments' ? b.items.length : 0), 0) : 0;
  const sub: React.ReactNode = moments ? (
    <span className="flex items-center gap-1.5 mt-0.5 font-medium text-[#3F3F46]">
      <MomentsBadge n={moments} small />
      Key moments{r.duration ? ` · ${Math.round(r.duration / 60)} min` : ''}
    </span>
  ) : (
    kindLine(r, plans)
  );
  const tip: CardModel['tip'] = [[<span key="k" className="text-[15px]">{r.kind === 'floorplan' ? '▦' : metaOf(r).icon}</span>, r.title, sub]];
  if (r.recommended) tip.push([<span key="r" className="text-[#7C6FF0]">★</span>, `Recommended by ${owner}`, 'A good place to start']);
  if (talk && talk.at) tip.push([<span key="t">💬</span>, `${talk.who} replied · ${ago(talk.at)}`, talk.body ? `“${talk.body.length > 90 ? `${talk.body.slice(0, 88)}…` : talk.body}”` : '']);
  else if (talk && talk.count) tip.push([<span key="t">💬</span>, `${talk.count} message${talk.count === 1 ? '' : 's'}`, 'Open it to read them']);
  if (part && vid != null && r.duration) tip.push([<span key="w" className="text-[#3F8CEA]">◔</span>, `Watched ${mmss(vid * r.duration)} of ${mmss(r.duration)}`, 'Pick up where you left off']);
  else if (!seen) tip.push([<Zzz key="z" className="w-[22px] h-[16px]" />, 'Not opened yet', `Shared ${shortDate(r.updatedAt)}`]);
  else if (isNew) tip.push([<span key="u">↻</span>, 'Updated since you opened it', shortDate(r.updatedAt)]);
  else tip.push([<span key="v" className="text-[#2E9A5B]">✓</span>, 'Viewed', 'You’ve opened it']);
  return {
    key: `r${r.id}`,
    icon: iconOf(r),
    fill: isNew ? 'new' : 'opened',
    on: rt.sel === r.id,
    sticker: !seen && rt.returning ? 'new' : null,
    rec: r.recommended,
    zz: !seen,
    out: r.kind === 'link' ? '→ link' : null,
    bubble: part ? 'play' : seen ? 'ok' : null,
    progress: part ? vid : null,
    talk,
    tip,
    moments: moments || null,
    label: r.title,
    onOpen: () => rt.select(r.id),
  };
}

// ---------------------------------------------------------------- the panel

export function NoveltyPanel({ rt, room, replies, agreement }: { rt: ResourcesTab; room: ProspectRoom; replies: (id: number) => ItemReplies | null; agreement?: AgreementState | null }) {
  const owner = room.contact?.name.split(/\s+/)[0] ?? 'your team';
  const people = [room.contact, ...room.team].filter((p): p is NonNullable<typeof p> => !!p);
  const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const tones = ['#18181B', '#7C6FF0', '#D9553F'];
  const team: CardModel = {
    key: 'team',
    icon: (
      <span className="flex flex-wrap justify-center w-12" aria-hidden="true">
        {(people.length ? people : [{ name: 'Teton' }]).slice(0, 3).map((p, i) => (
          <b key={p.name} className="w-6 h-6 -m-[3px] rounded-full border-2 border-white grid place-items-center text-[8px] font-bold text-white" style={{ background: tones[i % 3] }}>
            {initials(p.name)}
          </b>
        ))}
      </span>
    ),
    fill: 'opened',
    on: rt.sel === 'team',
    sticker: 'mine',
    rec: false,
    zz: false,
    out: null,
    bubble: rt.returning ? 'ok' : null,
    progress: null,
    talk: null,
    moments: null,
    tip: [
      [<span key="t">👋</span>, 'Your Team', `${people.length} ${people.length === 1 ? 'person' : 'people'}${room.contact ? ` · ${owner} is your main contact` : ''}`],
      [<span key="s" className="text-[#B7791F]">★</span>, 'Start here', 'Who’s working with you, and how to reach them'],
    ],
    label: 'Your Team',
    onOpen: () => rt.select('team'),
  };
  // The agreement: a "needs you" card until someone on the link has asked for it.
  const ai = agreement?.info;
  const ask: CardModel | null =
    ai && agreement
      ? {
          key: 'agreement',
          icon: I.sign,
          fill: ai.latest ? 'opened' : 'act',
          on: false,
          sticker: ai.latest ? null : 'todo',
          rec: false,
          zz: false,
          out: null,
          bubble: ai.latest ? 'ok' : null,
          progress: null,
          talk: null,
          moments: null,
          tip: ai.latest
            ? [
                [<span key="a">✍</span>, 'Agreement', ai.latest.sentAt ? `Sent for review ${shortDate(ai.latest.sentAt)}` : `Requested by ${ai.latest.who} · ${shortDate(ai.latest.createdAt)}`],
                [<span key="b" className="text-[#2E9A5B]">✓</span>, ai.latest.sentAt ? 'Check your inbox' : `${owner} is preparing it`, 'Open to send an update'],
              ]
            : [
                [<span key="a">✍</span>, 'Request the agreement', 'Confirm a few details · about 2 minutes'],
                [<span key="b" className="text-[#E5484D]">!</span>, 'Needs you', `${owner} prepares it once you ask`],
              ],
          label: ai.latest ? 'Agreement' : 'Request the agreement',
          onOpen: () => agreement.setOpen(true),
        }
      : null;
  const groups: Array<{ id: string; name: string; cards: CardModel[] }> = [
    { id: 'start', name: 'Start here', cards: [team, ...(ask ? [ask] : [])] },
    ...room.sections.map((s) => ({
      id: s.id,
      name: s.name,
      cards: room.resources.filter((x) => x.sectionId === s.id).map((x) => cardFor(x, rt, rt.plans, replies(x.id), owner)),
    })),
  ].filter((g) => g.cards.length);

  return (
    <>
      {/* Wider screens: a box per section, three cards to a row; no scrollbar, but chevrons, fades and section dots. */}
      <ScrollPanel names={groups.map((g) => g.name)}>
        <div className="flex flex-col gap-3.5 pl-3 pr-7 pt-3 pb-8">
          <Legend />
          {groups.map((g) => (
            <section key={g.id} data-nv-sec className="rounded-[24px] border border-[#E4E4E7] bg-[#FAFAFA] shadow-[0_2px_10px_rgba(24,24,27,.05)] px-3 pt-2.5 pb-[22px]" aria-label={g.name}>
              <h3 className="text-center text-[14px] font-medium text-teton-ink mb-3">{g.name}</h3>
              <div className="grid grid-cols-[repeat(3,78px)] justify-center gap-x-[11px] gap-y-[30px]">
                {g.cards.map((c, i) => (
                  <NoveltyCard key={c.key} c={c} col={(i % 3) as 0 | 1 | 2} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollPanel>
      {/* Phones: one sideways row, a label over each section and a thin line between them. */}
      <div className="sm:hidden pt-2">
        <div className="px-4">
          <Legend />
        </div>
        <div className="flex gap-3.5 overflow-x-auto px-4 pt-3 pb-6 overscroll-x-contain">
          {groups.map((g, k) => (
            <div key={g.id} className="flex flex-shrink-0 gap-3.5">
              {k > 0 && <span className="w-px self-stretch bg-[#DDD7CC] mt-5" aria-hidden="true" />}
              <div className="flex flex-col">
                <p className="mb-2.5 ml-0.5 whitespace-nowrap text-[9.5px] font-extrabold uppercase tracking-[1.4px] text-[#6B7380]">{g.name}</p>
                <div className="flex gap-[11px]">
                  {g.cards.map((c) => (
                    <NoveltyCard key={c.key} c={c} col={0} noTip />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Legend() {
  const item = (cls: string, t: string) => (
    <span className="flex items-center gap-1.5">
      <i className={`inline-block w-2.5 h-2.5 rounded-[3px] ${cls}`} />
      {t}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10.5px] font-medium text-[#6B7380]">
      {item('bg-[#E2DDFF] shadow-[0_0_0_1.5px_#C7C0FF]', 'New')}
      {item('bg-[#EFEFF2] shadow-[0_0_0_1.5px_#E4E4E7]', 'Opened')}
      {item('bg-[#FFDCD8] shadow-[0_0_0_1.5px_#E5484D]', 'Needs you')}
      {item('bg-[#46A951] !rounded-full', 'Viewed')}
    </div>
  );
}

function NoveltyCard({ c, col, noTip = false }: { c: CardModel; col: 0 | 1 | 2; noTip?: boolean }) {
  const [tip, setTip] = useState(false);
  // Near the bottom of the panel (or window), the details open above the card instead.
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const show = () => {
    if (noTip) return;
    const card = box.current?.getBoundingClientRect();
    const area = (box.current?.closest('[data-nv-scroll]') as HTMLElement | null)?.getBoundingClientRect();
    const h = (tipEl.current?.offsetHeight ?? 240) + 24;
    if (card) {
      const floor = Math.min(area?.bottom ?? window.innerHeight, window.innerHeight);
      const ceil = Math.max(area?.top ?? 0, 0);
      setUp(card.bottom + h > floor && card.top - ceil > floor - card.bottom);
    }
    setTip(true);
  };
  const fill =
    c.fill === 'act'
      ? 'bg-gradient-to-b from-[#FFF1F0] to-[#FFDCD8] shadow-[0_0_0_2.5px_#E5484D,0_0_16px_rgba(229,72,77,.3)]'
      : c.fill === 'new'
        ? 'bg-gradient-to-b from-[#F1EFFF] to-[#E2DDFF] shadow-[0_0_0_2px_#C7C0FF]'
        : 'bg-gradient-to-b from-white to-[#EFEFF2] shadow-[0_0_0_2px_#E4E4E7]';
  const ring = c.on ? '!shadow-[0_0_0_2.5px_#18181B,0_8px_18px_rgba(0,0,0,.1)]' : tip ? '!shadow-[0_0_0_2px_#A1A1AA,0_8px_20px_rgba(0,0,0,.12)]' : '';
  const stk = (cls: string, inner: React.ReactNode, extra = '') => (
    <span className={`absolute z-[2] grid place-items-center w-[26px] h-[26px] rounded-lg drop-shadow-[0_3px_4px_rgba(0,0,0,.25)] ${cls} ${extra}`} aria-hidden="true">
      {inner}
    </span>
  );
  const at = '-top-[9px] -right-2 rotate-[16deg]';
  const status = c.sticker === 'todo' ? stk('bg-[#E5484D]', BANG, at) : c.sticker === 'new' ? stk('bg-[#F97316] text-white text-[8px] font-extrabold', 'NEW', at) : c.sticker === 'mine' ? stk('bg-[#F5C518] text-teton-ink text-[12px]', '★', at) : null;
  const align = `${col === 0 ? 'left-0' : col === 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${up ? (col === 0 ? 'origin-bottom-left' : col === 2 ? 'origin-bottom-right' : 'origin-bottom') : col === 0 ? 'origin-top-left' : col === 2 ? 'origin-top-right' : 'origin-top'}`;
  const words = [c.label, c.moments ? `${c.moments} key moments` : '', c.tip.slice(1).map((t) => t[1]).join(', ')].filter(Boolean).join('. ');
  return (
    <div ref={box} className="relative w-[78px] h-[136px]" onMouseEnter={show} onMouseLeave={() => setTip(false)}>
      <button
        type="button"
        onClick={() => (setTip(false), c.onOpen())}
        onFocus={show}
        onBlur={() => setTip(false)}
        aria-current={c.on ? 'true' : undefined}
        aria-label={words}
        className={`absolute inset-0 rounded-[18px] grid place-items-center overflow-hidden transition-shadow duration-200 motion-reduce:transition-none ${fill} ${ring}`}
      >
        <span className="relative grid place-items-center">
          {c.icon}
          {c.out && <span className="absolute left-1/2 top-[calc(100%+8px)] -translate-x-1/2 whitespace-nowrap rounded-md border border-[#D4D4D8] bg-[#F4F4F5]/90 px-1.5 pb-px text-[11px] font-semibold text-teton-ink">{c.out}</span>}
        </span>
        {c.zz && <Zzz className="absolute left-2.5 top-3 w-[24px] h-[18px]" />}
        {c.progress != null && <span className="absolute left-0 bottom-0 h-[3px] bg-[#3F8CEA]" style={{ width: `${Math.round(c.progress * 100)}%` }} aria-hidden="true" />}
      </button>
      {c.rec && stk('bg-[#8B5CF6] text-white text-[12px]', '★', status ? '-top-[11px] right-[14px] -rotate-12 !z-[1]' : '-top-[9px] -right-2 rotate-[16deg]')}
      {status}
      {c.talk && (c.talk.unread || c.talk.count > 0) && (
        <span className="absolute -bottom-[9px] -left-2 z-[2] drop-shadow-[0_3px_4px_rgba(0,0,0,.2)]" aria-hidden="true">
          <span className={`relative grid place-items-center w-7 h-[26px] rounded-[9px_9px_9px_3px] ${c.talk.unread ? 'bg-[#3F8CEA]' : 'bg-white shadow-[0_0_0_1.5px_#D4D4D8]'}`}>
            {DOTS(c.talk.unread ? '#fff' : '#3F3F46')}
            {c.talk.unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E5484D] border-2 border-white" />}
          </span>
          {!c.talk.unread && c.talk.count > 0 && <em className="absolute -top-1.5 -right-[7px] min-w-[15px] h-[15px] px-[3px] rounded-full bg-teton-ink text-white text-[9px] font-bold leading-[15px] text-center not-italic">{c.talk.count}</em>}
        </span>
      )}
      {c.moments != null && (
        <span className="absolute -bottom-[9px] -right-2 z-[2]" aria-hidden="true">
          <MomentsBadge n={c.moments} />
        </span>
      )}
      {c.bubble && (
        <span className="absolute -bottom-[15px] left-1/2 -translate-x-1/2 z-[2] w-[30px] h-[30px] rounded-full bg-[#F4F4F5] grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,.12)]" aria-hidden="true">
          <span className={`w-[25px] h-[25px] rounded-full grid place-items-center ${c.bubble === 'play' ? 'bg-[#3F8CEA]' : 'bg-[#46A951]'}`}>{c.bubble === 'play' ? PLAY : CHECK}</span>
        </span>
      )}
      {!noTip && (
        <div
          ref={tipEl}
          role="tooltip"
          className={`absolute ${up ? 'bottom-[calc(100%+16px)]' : 'top-[calc(100%+20px)]'} ${align} z-[40] w-[236px] rounded-2xl bg-white px-1 py-1.5 text-left shadow-[0_0_0_1px_#E4E4E7,0_16px_36px_rgba(24,24,27,.18)] transition-[opacity,transform] motion-reduce:transition-opacity ${
            tip ? 'opacity-100 translate-y-0 scale-100 duration-200 ease-out' : `opacity-0 ${up ? 'translate-y-1.5' : '-translate-y-1.5'} scale-[.97] pointer-events-none duration-150 ease-in`
          }`}
        >
          {c.tip.map(([icon, b, small], i) => (
            <div key={i} className={`flex gap-2.5 items-start px-2.5 py-2 ${i ? 'border-t border-[#F1F1F3]' : ''}`}>
              <span className="w-[22px] flex-shrink-0 grid place-items-center text-[14px] leading-5">{icon}</span>
              <span className="min-w-0">
                <b className="block text-[13px] font-semibold leading-snug text-teton-ink">{b}</b>
                {small && <span className="block text-[11.5px] leading-snug text-[#71717A]">{small}</span>}
              </span>
            </div>
          ))}
          <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => (setTip(false), c.onOpen())} className="mx-2.5 mt-1 mb-1.5 block w-[calc(100%-20px)] h-[30px] rounded-[9px] bg-teton-ink text-white text-[12px] font-semibold">
            Open
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- scrolling without a scrollbar

/**
 * The panel's scroll area: no scrollbar. The edges fade where there's more to see, a ⌃ / ⌄ button jumps a section
 * up or down, and dots on the right show (and jump to) each section. The wheel and trackpad still scroll it.
 */
function ScrollPanel({ names, children }: { names: string[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ top: true, bottom: true, cur: 0 });
  const secs = () => [...(ref.current?.querySelectorAll<HTMLElement>('[data-nv-sec]') ?? [])];
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const y = el.scrollTop;
    const list = secs();
    let cur = 0;
    list.forEach((s, i) => {
      if (s.offsetTop - 60 <= y) cur = i;
    });
    const bottom = y + el.clientHeight >= el.scrollHeight - 4;
    if (bottom) cur = list.length - 1;
    setSt({ top: y <= 4, bottom, cur });
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure, names.length]);
  const go = (i: number) => {
    const el = ref.current;
    const list = secs();
    if (!el || !list.length) return;
    const k = Math.max(0, Math.min(list.length - 1, i));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: k === 0 ? 0 : list[k].offsetTop - 48, behavior: reduce ? 'auto' : 'smooth' });
  };
  const fits = st.top && st.bottom;
  const chev = (dir: 'up' | 'down', show: boolean) => (
    <button
      type="button"
      aria-label={dir === 'up' ? 'Scroll up a section' : 'Scroll down a section'}
      tabIndex={show ? 0 : -1}
      onClick={() => go(dir === 'up' ? st.cur - 1 : st.cur + 1)}
      className={`absolute left-[calc(50%-10px)] -translate-x-1/2 z-[45] w-[46px] h-[30px] rounded-full border border-[#E4E4E7] bg-white/95 shadow-[0_4px_12px_rgba(24,24,27,.12)] grid place-items-center text-teton-ink hover:bg-teton-ink hover:border-teton-ink hover:text-white transition-[opacity,background-color,color] duration-200 motion-reduce:transition-none ${dir === 'up' ? 'top-2' : 'bottom-2.5'} ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <path d={dir === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  return (
    <div className="hidden sm:block relative h-full">
      <div ref={ref} onScroll={measure} data-nv-scroll className="h-full overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain">
        {children}
      </div>
      <span className={`pointer-events-none absolute inset-x-0 top-0 h-12 z-[44] bg-gradient-to-b from-[#F6F3EE] to-transparent transition-opacity duration-200 ${st.top ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true" />
      <span className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 z-[44] bg-gradient-to-t from-[#F6F3EE] to-transparent transition-opacity duration-200 ${st.bottom ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true" />
      {chev('up', !st.top)}
      {chev('down', !st.bottom)}
      {!fits && names.length > 1 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-[45] flex flex-col items-center gap-2" role="group" aria-label="Sections">
          {names.map((n, i) => (
            <button
              key={n}
              type="button"
              title={n}
              aria-label={`Go to ${n}`}
              aria-current={i === st.cur ? 'true' : undefined}
              onClick={() => go(i)}
              className={`w-2 rounded-full transition-[height,background-color] duration-200 motion-reduce:transition-none ${i === st.cur ? 'h-5 bg-teton-ink' : 'h-2 bg-[#D4CFC6] hover:bg-[#A8A196]'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Key moments in a video: Teton yellow, the count in black over a little timeline. */
function MomentsBadge({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span className={`relative inline-grid place-items-center flex-shrink-0 bg-[#F5C518] text-teton-ink font-extrabold leading-none ${small ? 'w-5 h-5 rounded-md text-[10px]' : 'w-[26px] h-[26px] rounded-lg text-[12px] drop-shadow-[0_3px_4px_rgba(0,0,0,.25)]'}`}>
      <svg viewBox="0 0 26 26" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <path d="M6 20.5h14" stroke="#18181B" strokeOpacity=".35" strokeWidth="1.6" strokeLinecap="round" />
        {[8, 13, 18].map((x) => (
          <circle key={x} cx={x} cy="20.5" r="1.6" fill="#18181B" />
        ))}
      </svg>
      <b className={`relative ${small ? '-top-0.5' : '-top-[3px]'}`}>{n}</b>
    </span>
  );
}
