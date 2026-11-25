'use client';

/**
 * One Resources card, shown in full: its header, the thing itself (a PDF, image, video, embedded video, link, one pager
 * or scoped floor plan) and the blocks under it (key moments, text, quote, button, related cards, next steps, image,
 * file, the floor plan and its room summary). The same view is the prospect's, the editor's preview, and — with `edit`
 * — the editor's Page mode, where every block can be changed, moved or removed and new ones added.
 */
import { useEffect, useRef, useState } from 'react';
import { badgeOf, sensorsPerRoom } from '@/lib/quote/roomTypes';
import { BLOCK_TYPES, newBlock, type Block, type BlockType, type Resource } from '@/lib/resources/model';
import { fmtTime, parseTime, type Embed } from '@/lib/resources/embed';
import type { FloorPlanInfo } from '@/lib/data/dealRooms';
import { PdfPages } from './PdfPages';

export const KIND_META: Record<Resource['kind'], { icon: string; bg: string; fg?: string; label: string }> = {
  file: { icon: '▤', bg: '#E7E2FB', label: 'Document' },
  video: { icon: '▶', bg: '#1C2430', fg: '#fff', label: 'Recording' },
  embed: { icon: '▶', bg: '#1C2430', fg: '#fff', label: 'Video' },
  link: { icon: '↗', bg: '#FFF4D6', label: 'Link' },
  onepager: { icon: '✓', bg: '#EEF8F1', label: 'One pager' },
  floorplan: { icon: '▦', bg: '#EEF5FE', fg: '#1F5FB5', label: 'Floor plan' },
};
export const fileKind = (r: Resource) => (r.file?.mime === 'application/pdf' ? 'PDF' : r.file?.mime.startsWith('image/') ? 'Image' : r.file?.mime.startsWith('video/') ? 'Video' : r.file ? (r.file.name.split('.').pop() ?? 'File').toUpperCase() : null);
export const sizeOf = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export interface ViewCtx {
  mode: 'prospect' | 'rep';
  fileUrl: (r: Resource, o?: { dl?: boolean; f?: number }) => string;
  planUrl: (planId: number) => string;
  goUrl: (r: Resource, blockId?: string) => string;
  resources: Resource[];
  plans: FloorPlanInfo[];
  /** For "Book a meeting" buttons. */
  booking: string | null;
  onSelect?: (id: number) => void;
  onOpenProposal?: (pageId?: string | null) => void;
  /** The prospect's engagement (video seconds watched, floor plan downloads). */
  track?: (e: { kind: 'video' | 'download'; value?: number; detail?: string }) => void;
  /** The editor: a video's length, once its player knows it. */
  onDuration?: (sec: number) => void;
  /** The editor's Page mode. */
  edit?: { onBlocks: (b: Block[]) => void; upload: (f: File) => Promise<number | null> } | null;
}

/** An embedded player's address, starting at a time. */
function seekSrc(e: Embed, t: number): string {
  const s = Math.max(0, Math.round(t));
  if (e.provider === 'youtube') return `${e.src}&start=${s}&autoplay=1`;
  if (e.provider === 'vimeo') return `${e.src}${e.src.includes('?') ? '&' : '?'}autoplay=1#t=${s}s`;
  if (e.provider === 'loom') return `${e.src}?t=${s}&autoplay=1`;
  return `${e.src}?time=${s}s&autoplay=true`;
}

export function planRows(info: FloorPlanInfo) {
  return info.types
    .map((t, k) => ({ t, b: badgeOf(t, k), rooms: t.marks?.length ?? 0, per: sensorsPerRoom(t, info.products) }))
    .filter((x) => x.rooms > 0);
}

/** The scoped plan: the floor plan with its badges and legend (drawn into a PDF in the browser), zoomable. */
export function FloorPlanView({ info, url, allowDownload, onDownload }: { info: FloorPlanInfo; url: string; allowDownload: boolean; onDownload?: () => void }) {
  const [pdf, setPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    let made: string | null = null;
    setPdf(null);
    setError(null);
    void import('@/lib/client/scopePdf')
      .then(({ scopePdf }) => scopePdf({ url, mime: info.mime, planId: info.planId, planName: info.name, communityName: info.communityName, types: info.types, allowancePct: info.allowancePct, products: info.products }))
      .then((b) => {
        made = URL.createObjectURL(b);
        if (!gone) setPdf(made);
      })
      .catch((e: unknown) => !gone && setError(e instanceof Error ? e.message : 'Couldn’t draw the floor plan'));
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [info, url]);
  const rows = planRows(info);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {rows.map((x) => (
          <span key={x.t.id} className="inline-flex items-center gap-1.5 h-[26px] pl-1 pr-2.5 rounded-full border border-[#E8E4DC] bg-white text-[12px] text-[#3A4250]">
            <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[8.5px] font-extrabold border-[1.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,.3)]" style={{ background: x.b.color }}>
              {x.b.initials}
            </span>
            {x.t.name} <b className="text-teton-ink">{x.rooms}</b>
          </span>
        ))}
        {allowDownload && pdf && (
          <a href={pdf} download={`${info.name} - scope.pdf`} onClick={onDownload} className="ml-auto h-8 px-3 rounded-[9px] border border-[#D5D9DE] bg-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-teton-almost-white">
            ⤓ Download PDF
          </a>
        )}
      </div>
      <div className="mt-3">
        {pdf ? (
          <PdfPages url={pdf} height="min(64vh, 640px)" label={`${info.name} floor plan`} />
        ) : (
          <p className="h-[360px] grid place-items-center rounded-2xl bg-[#EDEAE4] text-[13px] text-teton-ui-gray">{error ?? 'Drawing the floor plan…'}</p>
        )}
      </div>
    </div>
  );
}

export function PlanSummary({ info, title }: { info: FloorPlanInfo; title: string }) {
  const rows = planRows(info);
  const rooms = rows.reduce((s, x) => s + x.rooms, 0);
  const sensors = rows.reduce((s, x) => s + x.rooms * x.per, 0);
  return (
    <div className="rounded-[15px] border border-[#E8E4DC] bg-white px-4 py-3.5 overflow-x-auto">
      <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-teton-ui-gray">{title}</p>
      {rows.length ? (
        <table className="w-full min-w-[420px] text-[12.5px] border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-[1px] text-teton-ui-gray">
              <th className="text-left font-bold pb-2 pr-2">Room type</th>
              <th className="text-left font-bold pb-2 px-2">Care</th>
              <th className="text-right font-bold pb-2 px-2">Rooms</th>
              <th className="text-right font-bold pb-2 px-2">Sensors / room</th>
              <th className="text-right font-bold pb-2 pl-2">Sensors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.t.id} className="border-t border-[#F1EEE7]">
                <td className="py-2 pr-2">
                  <span className="inline-grid w-5 h-5 mr-2 rounded-full place-items-center text-white text-[8.5px] font-extrabold align-[-5px] border-[1.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,.3)]" style={{ background: x.b.color }}>
                    {x.b.initials}
                  </span>
                  {x.t.name}
                </td>
                <td className="py-2 px-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${x.t.care === 'mc' ? 'bg-[#FCE7F0] text-[#B23A6E]' : 'bg-[#E7E2FB] text-[#6A5BC7]'}`}>{({ il: 'Independent living', al: 'Assisted living', mc: 'Memory care', snf: 'Skilled nursing' } as Record<string, string>)[x.t.care] ?? x.t.care}</span>
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{x.rooms}</td>
                <td className="py-2 px-2 text-right tabular-nums">{x.per}</td>
                <td className="py-2 pl-2 text-right tabular-nums font-bold">{x.rooms * x.per}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-teton-ink font-bold">
              <td className="py-2 pr-2">Total</td>
              <td />
              <td className="py-2 px-2 text-right tabular-nums">{rooms}</td>
              <td />
              <td className="py-2 pl-2 text-right tabular-nums">{sensors}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-[12.5px] text-teton-ui-gray">No rooms are tagged on this plan yet.</p>
      )}
    </div>
  );
}

const textBody = (body: string) => {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="list-disc pl-5 space-y-0.5">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>);
    list = [];
  };
  for (const l of body.split('\n')) {
    if (/^\s*[-•*]\s+/.test(l)) list.push(l.replace(/^\s*[-•*]\s+/, ''));
    else {
      flush();
      if (l.trim()) out.push(<p key={out.length}>{l}</p>);
    }
  }
  flush();
  return out;
};

export function ResourceView({ r, ctx, actions }: { r: Resource; ctx: ViewCtx; actions?: React.ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const [seek, setSeek] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const meta = KIND_META[r.kind];
  const info = r.kind === 'floorplan' ? ctx.plans.find((p) => p.planId === r.planId) ?? null : null;
  const jump = (t: number) => {
    if (video.current) {
      video.current.currentTime = t;
      void video.current.play().catch(() => {});
    } else if (r.embed) setSeek(t);
  };
  // The prospect: seconds of an uploaded video actually played, sent every 15 seconds.
  const played = useRef(0);
  useEffect(() => {
    if (r.kind !== 'video' || !ctx.track) return;
    const t = setInterval(() => {
      if (played.current >= 1) {
        ctx.track!({ kind: 'video', value: Math.round(played.current) });
        played.current = 0;
      }
    }, 15000);
    return () => {
      clearInterval(t);
      if (played.current >= 1) ctx.track!({ kind: 'video', value: Math.round(played.current) });
      played.current = 0;
    };
  }, [r.id, r.kind, ctx]);
  const last = useRef<number | null>(null);
  const sub = [r.kind === 'file' && fileKind(r), r.file && sizeOf(r.file.size), r.duration && `${Math.round(r.duration / 60)} min`, info && `${info.communityName} · ${info.roomsTagged} rooms tagged`].filter(Boolean).join(' · ');
  const hasPlanBlock = r.blocks.some((b) => b.type === 'plan');

  return (
    <div className="[animation:fadeUp_.25s_ease-out] motion-reduce:[animation:none]">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[3px] text-[#D9553F]">{meta.label}</p>
          <h1 className="mt-1 text-[26px] sm:text-[30px] font-semibold leading-tight tracking-[-.5px] break-words">{r.title}</h1>
          {(r.description || sub) && <p className="mt-1.5 text-[14px] text-[#5A6270]">{[r.description, sub].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.file && r.allowDownload && (
            <a href={ctx.fileUrl(r, { dl: true })} className="h-[38px] px-4 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-black">
              ⤓ Download
            </a>
          )}
          {actions}
        </div>
      </div>

      {/* The thing itself. */}
      <div className="mt-5">
        {r.kind === 'file' && r.file?.mime === 'application/pdf' && <PdfPages url={ctx.fileUrl(r)} label={r.title} />}
        {r.kind === 'file' && r.file?.mime.startsWith('image/') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctx.fileUrl(r)} alt="" className="w-full rounded-2xl border border-[#E8E4DC] bg-white" />
        )}
        {r.kind === 'file' && r.file && r.file.mime !== 'application/pdf' && !r.file.mime.startsWith('image/') && (
          <div className="rounded-2xl border border-[#E8E4DC] bg-white px-5 py-6 flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl grid place-items-center text-[18px]" style={{ background: meta.bg }}>
              {meta.icon}
            </span>
            <div className="min-w-0">
              <p className="font-semibold break-words">{r.file.name}</p>
              <p className="text-[12.5px] text-teton-ui-gray">{fileKind(r)} · {sizeOf(r.file.size)} · download it to open</p>
            </div>
          </div>
        )}
        {r.kind === 'video' && r.file && (
          <video
            ref={video}
            src={ctx.fileUrl(r)}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-2xl bg-black aspect-video"
            onLoadedMetadata={(e) => ctx.onDuration?.(e.currentTarget.duration)}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setNow(t);
              if (last.current != null && !e.currentTarget.paused && t > last.current && t - last.current < 2) played.current += t - last.current;
              last.current = t;
            }}
            onSeeking={() => (last.current = null)}
          />
        )}
        {r.kind === 'embed' && r.embed && (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black">
            <iframe title={r.title} src={seek == null ? r.embed.src : seekSrc(r.embed, seek)} key={seek ?? 'start'} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
          </div>
        )}
        {r.kind === 'link' && r.url && (
          <a href={ctx.goUrl(r)} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-2xl border border-[#E8E4DC] bg-white px-5 py-5 hover:border-teton-ink transition-colors">
            <span className="w-12 h-12 rounded-xl grid place-items-center text-[20px] bg-[#FFF4D6]">↗</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Open the page</span>
              <span className="block text-[12.5px] text-teton-ui-gray truncate">{new URL(r.url).hostname.replace(/^www\./, '')} · opens in a new tab</span>
            </span>
            <span className="text-[20px] text-teton-ui-gray group-hover:text-teton-ink transition-colors">→</span>
          </a>
        )}
        {r.kind === 'onepager' && (
          <div className="rounded-2xl border border-[#E8E4DC] bg-white px-5 py-5 flex flex-wrap items-center gap-4">
            <span className="w-12 h-12 rounded-xl grid place-items-center text-[18px] bg-[#EEF8F1]">✓</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Part of your proposal</span>
              <span className="block text-[12.5px] text-teton-ui-gray">Always current with the proposal you’re reading.</span>
            </span>
            {ctx.onOpenProposal && (
              <button type="button" onClick={() => ctx.onOpenProposal!(r.pageId)} className="h-[38px] px-4 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold">
                Open it in the proposal →
              </button>
            )}
          </div>
        )}
        {r.kind === 'floorplan' && !info && <p className="rounded-2xl border border-[#E8E4DC] bg-white px-5 py-6 text-[13px] text-teton-ui-gray">This floor plan isn’t available any more.</p>}
        {r.kind === 'floorplan' && info && !hasPlanBlock && !ctx.edit && <FloorPlanView info={info} url={ctx.planUrl(info.planId)} allowDownload={r.allowDownload} onDownload={() => ctx.track?.({ kind: 'download', detail: 'floor plan' })} />}
      </div>

      <Blocks r={r} ctx={ctx} info={info} jump={jump} now={now} canSeek={!!video.current || !!r.embed} />
    </div>
  );
}

// ---------------------------------------------------------------- blocks

function Blocks({ r, ctx, info, jump, now, canSeek }: { r: Resource; ctx: ViewCtx; info: FloorPlanInfo | null; jump: (t: number) => void; now: number; canSeek: boolean }) {
  const [menu, setMenu] = useState<number | null>(null);
  const edit = ctx.edit;
  const blocks = r.blocks;
  const set = (i: number, b: Block) => edit?.onBlocks(blocks.map((x, k) => (k === i ? b : x)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    edit?.onBlocks(next);
  };
  const add = (at: number, type: BlockType) => {
    const next = [...blocks];
    next.splice(at, 0, newBlock(type));
    edit?.onBlocks(next);
    setMenu(null);
  };
  const types = BLOCK_TYPES.filter((t) => !t.kinds || t.kinds.includes(r.kind));
  // Side by side on wide screens: key moments next to a text block, as in the mock.
  const addMenu = (at: number) => (
    <div className="my-4">
      <div className="flex items-center gap-3 text-[12px] font-semibold text-teton-ui-gray before:flex-1 before:border-t before:border-dashed before:border-[#C9CDD3] after:flex-1 after:border-t after:border-dashed after:border-[#C9CDD3]">
        <button type="button" aria-expanded={menu === at} onClick={() => setMenu(menu === at ? null : at)} className="h-7 px-3 rounded-full border border-[#C9CDD3] bg-white text-teton-ink hover:border-teton-ink">
          ＋ Add a block
        </button>
      </div>
      {menu === at && (
        <div className="mx-auto mt-2 max-w-[560px] grid sm:grid-cols-2 gap-0.5 rounded-[14px] border border-[#ECE8DF] bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,.16)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]">
          {types.map((t) => (
            <button key={t.type} type="button" onClick={() => add(at, t.type)} className="flex gap-2.5 items-start rounded-[9px] px-2.5 py-2 text-left hover:bg-[#F3F7FD]">
              <span className="mt-0.5 w-7 h-7 rounded-lg grid place-items-center bg-[#F1EEE8] text-[12px] flex-shrink-0">{BLOCK_ICON[t.type]}</span>
              <span>
                <b className="block text-[12.5px]">{t.name}</b>
                <small className="block text-[11px] text-teton-ui-gray leading-snug">{t.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  if (!edit && !blocks.length) return null;
  return (
    <div className="mt-4">
      {edit && blocks.length === 0 && addMenu(0)}
      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map((b, i) => {
          const span = b.type === 'moments' || (b.type === 'text' && (blocks[i - 1]?.type === 'moments' || blocks[i + 1]?.type === 'moments')) ? '' : 'lg:col-span-2';
          return (
            <div key={b.id} className={`${span} min-w-0`}>
              {edit ? (
                <div className="group/blk relative rounded-[16px] outline outline-[1.5px] outline-dashed outline-transparent outline-offset-[6px] hover:outline-[#C9D3DF] focus-within:outline-[#3F8CEA] transition-[outline-color] duration-150 mt-9">
                  <div className="absolute right-0 -top-9 z-[2] flex items-center gap-0.5 rounded-[9px] bg-teton-ink p-[3px] opacity-0 group-hover/blk:opacity-100 group-focus-within/blk:opacity-100 transition-opacity duration-150">
                    <span className="px-2 text-[11.5px] font-semibold text-[#A9ADB4] border-r border-[#3A3D44]">{BLOCK_TYPES.find((t) => t.type === b.type)?.name}</span>
                    {[
                      ['↑', 'Move up', () => move(i, -1)],
                      ['↓', 'Move down', () => move(i, 1)],
                      ['⧉', 'Duplicate', () => edit.onBlocks([...blocks.slice(0, i + 1), { ...structuredClone(b), id: Math.random().toString(36).slice(2, 10) } as Block, ...blocks.slice(i + 1)])],
                      ['✕', 'Remove', () => edit.onBlocks(blocks.filter((_, k) => k !== i))],
                    ].map(([ic, label, fn]) => (
                      <button key={label as string} type="button" aria-label={label as string} title={label as string} onClick={fn as () => void} className="w-[26px] h-[26px] rounded-md grid place-items-center text-white text-[12px] hover:bg-white/15">
                        {ic as string}
                      </button>
                    ))}
                  </div>
                  <BlockEdit b={b} set={(nb) => set(i, nb)} r={r} ctx={ctx} info={info} now={now} canSeek={canSeek} />
                </div>
              ) : (
                <BlockView b={b} r={r} ctx={ctx} info={info} jump={jump} />
              )}
            </div>
          );
        })}
      </div>
      {edit && blocks.length > 0 && addMenu(blocks.length)}
    </div>
  );
}

const BLOCK_ICON: Record<BlockType, string> = { moments: '⏱', text: '¶', quote: '❝', button: '▸', related: '▤', steps: '☑', image: '🖼', file: '⤓', plan: '▦', summary: '▥' };
const box = 'rounded-[15px] border border-[#E8E4DC] bg-white px-4 py-3.5';
const boxTitle = 'mb-2 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-teton-ui-gray';

function BlockView({ b, r, ctx, info, jump }: { b: Block; r: Resource; ctx: ViewCtx; info: FloorPlanInfo | null; jump: (t: number) => void }) {
  switch (b.type) {
    case 'moments':
      return b.items.length ? (
        <div className={box}>
          <p className={boxTitle}>{b.title}</p>
          {b.items.map((m, k) => (
            <button key={k} type="button" onClick={() => jump(m.t)} className={`w-full grid grid-cols-[56px_1fr] gap-2 py-2 text-left text-[13px] ${k ? 'border-t border-[#F1EEE7]' : ''} hover:text-[#1F5FB5]`}>
              <b className="font-semibold text-[#1F5FB5] tabular-nums">{fmtTime(m.t)}</b>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      ) : null;
    case 'text':
      return b.title || b.body ? (
        <div className={box}>
          {b.title && <p className={boxTitle}>{b.title}</p>}
          <div className="space-y-1.5 text-[13.5px] leading-relaxed text-[#3A4250]">{textBody(b.body)}</div>
        </div>
      ) : null;
    case 'quote':
      return b.text ? (
        <figure className="rounded-r-[14px] border-l-[3px] border-[#D9553F] bg-white/60 px-5 py-4">
          <blockquote className="text-[16px] leading-snug font-medium tracking-[-.2px]">“{b.text.replace(/^“|”$/g, '')}”</blockquote>
          {(b.who || b.at != null) && (
            <figcaption className="mt-2 text-[12px] text-teton-ui-gray">
              {b.who}
              {b.at != null && (
                <>
                  {b.who ? ' · ' : ''}
                  {(r.kind === 'video' || r.kind === 'embed') ? (
                    <button type="button" className="text-[#1F5FB5] hover:underline" onClick={() => jump(b.at!)}>
                      {fmtTime(b.at)} in the video
                    </button>
                  ) : (
                    fmtTime(b.at)
                  )}
                </>
              )}
            </figcaption>
          )}
        </figure>
      ) : null;
    case 'button': {
      const href = b.action === 'book' ? ctx.booking : b.action === 'link' && b.url ? ctx.goUrl(r, b.id) : null;
      if (b.action === 'book' && !ctx.booking) return null;
      const inner = (
        <>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">{b.title}</b>
            {b.sub && <small className="block text-[12px] text-[#A9ADB4] mt-0.5">{b.sub}</small>}
          </span>
          <span className="h-[38px] px-4 rounded-[10px] bg-white text-teton-ink text-[13px] font-semibold inline-flex items-center whitespace-nowrap">{b.action === 'book' ? '📅 ' : ''}{b.label}</span>
        </>
      );
      const cls = 'flex flex-wrap items-center gap-3 rounded-[15px] bg-[#16181D] text-white px-[18px] py-4';
      return b.action === 'proposal' ? (
        <button type="button" className={`${cls} w-full text-left`} onClick={() => ctx.onOpenProposal?.(null)}>
          {inner}
        </button>
      ) : (
        <a href={href ?? '#'} target="_blank" rel="noopener noreferrer" className={cls}>
          {inner}
        </a>
      );
    }
    case 'related': {
      const items = b.ids.map((id) => ctx.resources.find((x) => x.id === id && !x.hidden)).filter((x): x is Resource => !!x);
      return items.length ? (
        <div>
          <p className={boxTitle}>{b.title}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {items.map((x) => (
              <button key={x.id} type="button" onClick={() => ctx.onSelect?.(x.id)} className="flex items-center gap-3 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2.5 text-left hover:border-teton-ink transition-colors">
                <span className="w-[34px] h-[34px] rounded-[9px] grid place-items-center flex-shrink-0" style={{ background: KIND_META[x.kind].bg, color: KIND_META[x.kind].fg }}>
                  {KIND_META[x.kind].icon}
                </span>
                <span className="min-w-0">
                  <b className="block text-[13px] truncate">{x.title}</b>
                  {x.description && <span className="block text-[12px] text-teton-ui-gray truncate">{x.description}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null;
    }
    case 'steps':
      return b.items.length ? (
        <div className={box}>
          <p className={boxTitle}>{b.title}</p>
          {b.items.map((s, k) => (
            <p key={k} className={`flex gap-2.5 py-1.5 text-[13px] ${k ? 'border-t border-[#F1EEE7]' : ''}`}>
              <span className={`mt-px w-[18px] h-[18px] rounded-[5px] grid place-items-center text-[11px] font-bold flex-shrink-0 ${s.done ? 'bg-[#2E9E5B] text-white' : 'border-[1.5px] border-[#B9BFC7]'}`}>{s.done ? '✓' : ''}</span>
              <span className={s.done ? 'text-teton-ui-gray line-through' : ''}>{s.text}</span>
            </p>
          ))}
        </div>
      ) : null;
    case 'image':
      return b.fileId ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ctx.fileUrl(r, { f: b.fileId })} alt={b.caption} className="w-full rounded-[15px] border border-[#E8E4DC] bg-white" />
          {b.caption && <figcaption className="mt-1.5 text-[12px] text-teton-ui-gray">{b.caption}</figcaption>}
        </figure>
      ) : null;
    case 'file':
      return b.fileId ? (
        <a href={ctx.fileUrl(r, { f: b.fileId, dl: true })} className="flex items-center gap-3 rounded-xl border border-[#E8E4DC] bg-white px-4 py-3 hover:border-teton-ink transition-colors">
          <span className="w-[34px] h-[34px] rounded-[9px] grid place-items-center bg-[#F1EEE8]">⤓</span>
          <b className="text-[13px]">{b.label || 'Download'}</b>
        </a>
      ) : null;
    case 'plan':
      return info ? <FloorPlanView info={info} url={ctx.planUrl(info.planId)} allowDownload={r.allowDownload} onDownload={() => ctx.track?.({ kind: 'download', detail: 'floor plan' })} /> : null;
    case 'summary':
      return info ? <PlanSummary info={info} title={b.title} /> : null;
  }
}

const inp = 'w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-[#D5D9DE] focus:border-[#3F8CEA] focus:bg-[#F3F7FD]';

function BlockEdit({ b, set, r, ctx, info, now, canSeek }: { b: Block; set: (b: Block) => void; r: Resource; ctx: ViewCtx; info: FloorPlanInfo | null; now: number; canSeek: boolean }) {
  const [busy, setBusy] = useState(false);
  const upload = async (f: File | undefined, apply: (id: number) => void) => {
    if (!f || !ctx.edit) return;
    setBusy(true);
    const id = await ctx.edit.upload(f);
    setBusy(false);
    if (id) apply(id);
  };
  const title = (v: string, on: (s: string) => void, ph = 'Heading') => <input className={`${inp} text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-teton-ui-gray`} value={v} onChange={(e) => on(e.target.value)} placeholder={ph} aria-label="Block heading" />;
  switch (b.type) {
    case 'moments':
      return (
        <div className={box}>
          {title(b.title, (s) => set({ ...b, title: s }))}
          {b.items.map((m, k) => (
            <div key={k} className="grid grid-cols-[72px_1fr_24px] gap-1.5 items-center py-1 border-t border-[#F1EEE7] first-of-type:border-0">
              <TimeInput value={m.t} onChange={(t) => set({ ...b, items: b.items.map((x, j) => (j === k ? { ...x, t: t ?? 0 } : x)) })} />
              <input className={`${inp} text-[13px]`} value={m.label} placeholder="What happens here" onChange={(e) => set({ ...b, items: b.items.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} aria-label="Moment" />
              <button type="button" className="text-teton-ui-gray hover:text-[#C2412D]" aria-label="Remove moment" onClick={() => set({ ...b, items: b.items.filter((_, j) => j !== k) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="mt-2 h-[30px] px-3 rounded-[9px] bg-[#EEF5FE] text-[12px] font-semibold text-[#1F5FB5]" onClick={() => set({ ...b, items: [...b.items, { t: Math.round(now), label: '' }] })}>
            ＋ Add a moment{canSeek && now > 0 ? ` at ${fmtTime(now)}` : ''}
            {canSeek && <span className="font-medium text-teton-ui-gray"> {now > 0 ? '(where the video is)' : '(play the video, pause, then add)'}</span>}
          </button>
        </div>
      );
    case 'text':
      return (
        <div className={box}>
          {title(b.title, (s) => set({ ...b, title: s }))}
          <textarea className={`${inp} min-h-[90px] text-[13.5px] leading-relaxed resize-y`} value={b.body} placeholder={'A paragraph, or bullets:\n- Two AL/MC communities…\n- IT review before install…'} onChange={(e) => set({ ...b, body: e.target.value })} aria-label="Text" />
          <p className="px-1.5 text-[11px] text-teton-ui-gray">Start a line with “- ” for a bullet.</p>
        </div>
      );
    case 'quote':
      return (
        <div className="rounded-r-[14px] border-l-[3px] border-[#D9553F] bg-white px-4 py-3">
          <textarea className={`${inp} min-h-[56px] text-[16px] font-medium resize-y`} value={b.text} placeholder="Something the customer said" onChange={(e) => set({ ...b, text: e.target.value })} aria-label="Quote" />
          <div className="mt-1 grid grid-cols-[1fr_96px] gap-2">
            <input className={`${inp} text-[12.5px]`} value={b.who} placeholder="Who said it (name, title)" onChange={(e) => set({ ...b, who: e.target.value })} aria-label="Who said it" />
            <TimeInput value={b.at} onChange={(t) => set({ ...b, at: t })} placeholder="time" />
          </div>
        </div>
      );
    case 'button':
      return (
        <div className="rounded-[15px] bg-[#16181D] text-white px-4 py-3 space-y-1.5">
          <input className={`${inp} text-[15px] font-bold text-white focus:bg-white/10 hover:border-white/30`} value={b.title} placeholder="Ready for next steps?" onChange={(e) => set({ ...b, title: e.target.value })} aria-label="Button heading" />
          <input className={`${inp} text-[12px] text-[#C9CDD3] focus:bg-white/10 hover:border-white/30`} value={b.sub} placeholder="A line under it (optional)" onChange={(e) => set({ ...b, sub: e.target.value })} aria-label="Button subtext" />
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <input className="h-8 w-[150px] rounded-lg bg-white text-teton-ink px-2.5 text-[12.5px] font-semibold" value={b.label} onChange={(e) => set({ ...b, label: e.target.value })} aria-label="Button label" />
            <select className="h-8 rounded-lg bg-white/10 border border-white/25 px-2 text-[12.5px]" value={b.action} onChange={(e) => set({ ...b, action: e.target.value as 'book' | 'proposal' | 'link' })} aria-label="Button does">
              <option value="book">Book a meeting (main contact’s link)</option>
              <option value="proposal">Open the proposal</option>
              <option value="link">Open a link</option>
            </select>
            {b.action === 'link' && <input className="h-8 flex-1 min-w-[180px] rounded-lg bg-white/10 border border-white/25 px-2.5 text-[12.5px]" value={b.url ?? ''} placeholder="https://…" onChange={(e) => set({ ...b, url: e.target.value })} aria-label="Link" />}
          </div>
          {b.action === 'book' && !ctx.booking && <p className="text-[11.5px] text-[#F0B429]">The main contact has no scheduling link in their profile, so this button stays hidden.</p>}
        </div>
      );
    case 'related':
      return (
        <div className={box}>
          {title(b.title, (s) => set({ ...b, title: s }))}
          <div className="grid sm:grid-cols-2 gap-1.5 mt-1">
            {ctx.resources
              .filter((x) => x.id !== r.id)
              .map((x) => {
                const on = b.ids.includes(x.id);
                return (
                  <label key={x.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] cursor-pointer ${on ? 'border-[#3F8CEA] bg-[#F6FAFF]' : 'border-[#E8E4DC]'}`}>
                    <input type="checkbox" checked={on} onChange={() => set({ ...b, ids: on ? b.ids.filter((i) => i !== x.id) : [...b.ids, x.id] })} />
                    <span className="truncate">{x.title}</span>
                  </label>
                );
              })}
          </div>
        </div>
      );
    case 'steps':
      return (
        <div className={box}>
          {title(b.title, (s) => set({ ...b, title: s }))}
          {b.items.map((s, k) => (
            <div key={k} className="flex items-center gap-2 py-1 border-t border-[#F1EEE7] first-of-type:border-0">
              <input type="checkbox" checked={s.done} aria-label="Done" onChange={() => set({ ...b, items: b.items.map((x, j) => (j === k ? { ...x, done: !x.done } : x)) })} />
              <input className={`${inp} text-[13px]`} value={s.text} placeholder="Who does what, by when" onChange={(e) => set({ ...b, items: b.items.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} aria-label="Step" />
              <button type="button" className="text-teton-ui-gray hover:text-[#C2412D]" aria-label="Remove step" onClick={() => set({ ...b, items: b.items.filter((_, j) => j !== k) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="mt-2 text-[12px] font-semibold text-[#1F5FB5]" onClick={() => set({ ...b, items: [...b.items, { text: '', done: false }] })}>
            ＋ Add a step
          </button>
        </div>
      );
    case 'image':
    case 'file':
      return (
        <div className={box}>
          {b.fileId && b.type === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.fileUrl(r, { f: b.fileId })} alt="" className="mb-2 max-h-[280px] rounded-lg border border-[#E8E4DC]" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="h-8 px-3 rounded-lg border border-[#D5D9DE] bg-white text-[12.5px] font-semibold inline-flex items-center cursor-pointer hover:bg-teton-almost-white">
              {busy ? 'Uploading…' : b.fileId ? 'Replace' : b.type === 'image' ? 'Upload an image' : 'Upload a file'}
              <input type="file" className="hidden" accept={b.type === 'image' ? 'image/*' : undefined} disabled={busy} onChange={(e) => void upload(e.target.files?.[0], (id) => set({ ...b, fileId: id }))} />
            </label>
            {b.type === 'image' ? (
              <input className={`${inp} flex-1 text-[12.5px]`} value={b.caption} placeholder="Caption (optional)" onChange={(e) => set({ ...b, caption: e.target.value })} aria-label="Caption" />
            ) : (
              <input className={`${inp} flex-1 text-[12.5px]`} value={b.label} placeholder="Button text, e.g. Download the network checklist" onChange={(e) => set({ ...b, label: e.target.value })} aria-label="File label" />
            )}
          </div>
        </div>
      );
    case 'plan':
      return info ? <FloorPlanView info={info} url={ctx.planUrl(info.planId)} allowDownload={r.allowDownload} /> : <p className={box}>Floor plan</p>;
    case 'summary':
      return (
        <div>
          <input className={`${inp} mb-1 text-[12px] font-semibold`} value={b.title} onChange={(e) => set({ ...b, title: e.target.value })} aria-label="Summary heading" />
          {info ? <PlanSummary info={info} title={b.title} /> : null}
        </div>
      );
  }
}

/** mm:ss in a small field. */
function TimeInput({ value, onChange, placeholder = '0:00' }: { value: number | null; onChange: (t: number | null) => void; placeholder?: string }) {
  const [text, setText] = useState(value == null ? '' : fmtTime(value));
  useEffect(() => setText(value == null ? '' : fmtTime(value)), [value]);
  return (
    <input
      className={`${inp} text-[13px] font-semibold text-[#1F5FB5] tabular-nums`}
      value={text}
      placeholder={placeholder}
      inputMode="numeric"
      aria-label="Time"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim() ? parseTime(text) : null;
        if (t == null && text.trim()) setText(value == null ? '' : fmtTime(value));
        else onChange(t);
      }}
    />
  );
}
