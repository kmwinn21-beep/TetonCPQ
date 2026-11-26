/**
 * How a resource card's main icon looks: the rep's pick from the icon pack (standard: a line icon on a tinted tile;
 * Novelty Mode: the same icon in the illustrated style), one of their saved images, or, by default, an icon for its type.
 */
import type { Resource } from '@/lib/resources/model';
import { isDeckEmbed } from '@/lib/resources/embed';
import { GROUP_TINT, TINTS, packIcon, type PackIcon } from '@/lib/resources/iconPack';
import { cardImageUrl } from '@/lib/resources/cardImageUrl';

/** The standard line icon (fills its box; colour from `currentColor`). */
export function PackSvg({ icon, className = 'w-[55%] h-[55%]' }: { icon: PackIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icon.d} />
    </svg>
  );
}

const ACCENT: Record<string, string> = { p: '#7C6FF0', r: '#D9553F', g: '#46A951', b: '#3F8CEA', y: '#E3A500', o: '#F97316', k: '#3F3F46' };
const FILL: Record<string, string> = { p: '#E4E0FF', r: '#FFD9D3', g: '#CFEFD4', b: '#D6E8FD', y: '#FDE68A', o: '#FED7AA', k: '#3F3F46' };

/** The Novelty Mode drawing of a pack icon: dark outline, white body, one colour accent (see `PackIcon.nv`). */
export function NoveltySvg({ icon, className = 'w-[46px] h-[46px]' }: { icon: PackIcon; className?: string }) {
  const white = new Set<number>();
  const accent = new Set<number>();
  const tint: Record<number, string> = {};
  let c = 'p';
  for (const t of icon.nv.split(' ').filter(Boolean)) {
    const k = t[0];
    const v = t.slice(1);
    if (k === 'c') c = v;
    else if (k === 'f') for (const x of v.split(',')) tint[parseInt(x, 10)] = x.replace(/\d+/, '');
    else for (const x of v.split(',')) (k === 'b' ? white : accent).add(Number(x));
  }
  const parts = icon.d
    .split(/(?=M)/)
    .map((d, i) => ({ d, fill: tint[i] != null ? FILL[tint[i]] : white.has(i) ? '#fff' : 'none', stroke: accent.has(i) ? ACCENT[c] : '#3F3F46' }))
    // Filled shapes first, so lines drawn over them stay visible.
    .sort((a, b) => Number(a.fill === 'none') - Number(b.fill === 'none'));
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="translate(32 32) scale(2.3) translate(-12 -12)" strokeWidth={3 / 2.3} strokeLinecap="round" strokeLinejoin="round">
        {parts.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} />
        ))}
      </g>
    </svg>
  );
}

/** The icon a card gets by its type (until the rep picks one). */
export function autoIcon(r: Pick<Resource, 'kind' | 'embed' | 'file'>): { id: string; tint: string } {
  const m = r.file?.mime ?? '';
  switch (r.kind) {
    case 'file':
      return { id: m === 'application/pdf' ? 'pdf' : m.startsWith('image/') ? 'image' : /sheet|excel/.test(m) ? 'spreadsheet' : /presentation|powerpoint/.test(m) ? 'slides' : 'document', tint: 'lilac' };
    case 'video':
      return { id: 'recording', tint: 'ink' };
    case 'embed':
      return isDeckEmbed(r.embed) ? { id: 'slides', tint: 'lilac' } : { id: 'play', tint: 'ink' };
    case 'onepager':
      return { id: 'one-pager', tint: 'mint' };
    case 'floorplan':
      return { id: 'floor-plan', tint: 'sky' };
    default:
      return { id: 'open-link', tint: 'sand' };
  }
}

export const defaultTint = (id: string) => GROUP_TINT[packIcon(id)?.group ?? ''] ?? 'sand';

/** A standard card's tile: what goes inside, and its colours. */
export function cardLook(r: Pick<Resource, 'kind' | 'embed' | 'file' | 'icon'>): { node: React.ReactNode; bg: string; fg: string } {
  const c = r.icon;
  if (c && 'image' in c) {
    // eslint-disable-next-line @next/next/no-img-element
    const img = <img src={cardImageUrl(c.image)} alt="" className={c.fit === 'fit' ? 'w-[72%] h-[72%] object-contain' : 'w-full h-full object-cover'} />;
    return { node: img, bg: c.fit === 'fit' ? '#F1EEE7' : '#fff', fg: '#1C2430' };
  }
  const pick = c && 'pack' in c ? { id: c.pack, tint: c.tint } : autoIcon(r);
  const icon = packIcon(pick.id) ?? packIcon('document')!;
  const t = TINTS[pick.tint] ?? TINTS.sand;
  return { node: <PackSvg icon={icon} />, bg: t.bg, fg: t.fg };
}

/** A Novelty Mode card's art for a picked icon or image; null means "by type" (the hand-drawn defaults). */
export function noveltyArt(r: Pick<Resource, 'icon'>): React.ReactNode | null {
  const c = r.icon;
  if (!c) return null;
  if ('image' in c) {
    return (
      <span className={`w-[40px] h-[40px] rounded-[10px] overflow-hidden grid place-items-center shadow-[0_0_0_2.5px_#3F3F46] ${c.fit === 'fit' ? 'bg-white' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardImageUrl(c.image)} alt="" className={c.fit === 'fit' ? 'w-[76%] h-[76%] object-contain' : 'w-full h-full object-cover'} />
      </span>
    );
  }
  const icon = packIcon(c.pack);
  return icon ? <NoveltySvg icon={icon} /> : null;
}
