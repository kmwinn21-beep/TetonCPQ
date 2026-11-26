/**
 * The Resources tab's shapes, shared by the server and the browser: the tab's settings (name, the Your Team page,
 * sections), its cards (resources) and the blocks shown under each one, and how each is checked.
 */
import { resolveEmbed, type Embed } from './embed';

export type ResourceKind = 'file' | 'video' | 'embed' | 'link' | 'onepager' | 'floorplan';
export interface Section {
  id: string;
  name: string;
}
export interface TeamMember {
  userId: number;
  /** Their part on this deal ("Runs your site survey, install and go-live."). */
  line: string | null;
}
export interface RoomSettings {
  enabled: boolean;
  /** The tab's name (default "Resources"). */
  tabName: string;
  /** The Your Team page's heading; {customer} is the customer's name. */
  heading: string;
  /** A note from the main contact, under their card. */
  note: string | null;
  /** The main point of contact (default: the deal's owner). */
  contactUserId: number | null;
  showBooking: boolean;
  team: TeamMember[];
  sections: Section[];
  /** Teton Novelty Mode: cards like the Teton dashboard for the prospect. */
  novelty: boolean;
}

export type Block =
  | { id: string; type: 'moments'; title: string; items: Array<{ t: number; label: string }> }
  | { id: string; type: 'text'; title: string; body: string }
  | { id: string; type: 'quote'; text: string; who: string; at: number | null }
  | { id: string; type: 'button'; title: string; sub: string; label: string; action: 'book' | 'proposal' | 'link'; url: string | null }
  | { id: string; type: 'related'; title: string; ids: number[] }
  | { id: string; type: 'steps'; title: string; items: Array<{ text: string; done: boolean }> }
  | { id: string; type: 'image'; fileId: number | null; caption: string }
  | { id: string; type: 'file'; fileId: number | null; label: string }
  | { id: string; type: 'plan' }
  | { id: string; type: 'summary'; title: string };
export type BlockType = Block['type'];

export interface ResourceFile {
  id: number;
  name: string;
  mime: string;
  size: number;
}
export type CardIconChoice = { pack: string; tint: string } | { image: string; fit: 'fill' | 'fit' };
export interface Resource {
  id: number;
  sectionId: string;
  position: number;
  kind: ResourceKind;
  title: string;
  description: string | null;
  hidden: boolean;
  allowDownload: boolean;
  /** A link or an embed's page address. */
  url: string | null;
  embed: Embed | null;
  file: ResourceFile | null;
  /** A scoped floor plan (floor_plans.id) or a one pager (its business case page id). */
  planId: number | null;
  pageId: string | null;
  /** Floor plans: show room numbers. */
  roomNumbers: boolean;
  /** A video's length in seconds, once known. */
  duration: number | null;
  /** The team suggests starting here (a ★ on the card, and listed on Your Team). */
  recommended: boolean;
  /** The card's icon: one from the pack (with a tile tint), a saved image, or null to choose by type. */
  icon: CardIconChoice | null;
  blocks: Block[];
  updatedAt: string;
}

export const DEFAULT_TAB = 'Resources';
export const DEFAULT_HEADING = '{customer}’s Teton Team';
export const DEFAULT_SECTIONS: Section[] = [
  { id: 'docs', name: 'Decks & documents' },
  { id: 'cases', name: 'Case studies' },
  { id: 'plans', name: 'Floor plans' },
  { id: 'recordings', name: 'Recordings' },
];
/** Where a new card goes by default. */
export const sectionFor = (kind: ResourceKind): string => (kind === 'video' || kind === 'embed' ? 'recordings' : kind === 'floorplan' ? 'plans' : kind === 'link' ? 'cases' : 'docs');

const str = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const line = (v: unknown, max: number) => str(v, max).replace(/\s+/g, ' ');
const id = () => Math.random().toString(36).slice(2, 10);
const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

export function normalizeSections(v: unknown): Section[] {
  const arr = Array.isArray(v) ? v : [];
  const out: Section[] = [];
  for (const s of arr.slice(0, 20)) {
    const sid = line((s as Section)?.id, 40).replace(/[^\w-]/g, '');
    const name = line((s as Section)?.name, 60);
    if (sid && name && !out.some((x) => x.id === sid)) out.push({ id: sid, name });
  }
  // The standard sections are always there (empty ones aren't shown to the prospect).
  for (const d of DEFAULT_SECTIONS) if (!out.some((x) => x.id === d.id)) out.push(d);
  return out;
}

export function normalizeTeam(v: unknown): TeamMember[] {
  const arr = Array.isArray(v) ? v : [];
  const out: TeamMember[] = [];
  for (const m of arr.slice(0, 12)) {
    const userId = Number((m as TeamMember)?.userId);
    if (!Number.isInteger(userId) || userId <= 0 || out.some((x) => x.userId === userId)) continue;
    out.push({ userId, line: line((m as TeamMember)?.line, 160) || null });
  }
  return out;
}

/** A link: https only (http is upgraded), or null. */
export function safeUrl(v: unknown): string | null {
  const s = line(v, 800);
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

export function normalizeBlocks(v: unknown): Block[] {
  const arr = Array.isArray(v) ? v : [];
  const out: Block[] = [];
  for (const raw of arr.slice(0, 40)) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const bid = line(b.id, 20).replace(/[^\w-]/g, '') || id();
    switch (b.type) {
      case 'moments':
        out.push({
          id: bid,
          type: 'moments',
          title: line(b.title, 80) || 'Key moments',
          items: (Array.isArray(b.items) ? b.items : [])
            .slice(0, 50)
            .map((x) => ({ t: Math.max(0, Math.round(Number((x as { t?: unknown }).t) || 0)), label: line((x as { label?: unknown }).label, 160) }))
            .filter((x) => x.label)
            .sort((a, c) => a.t - c.t),
        });
        break;
      case 'text':
        out.push({ id: bid, type: 'text', title: line(b.title, 80), body: str(b.body, 4000) });
        break;
      case 'quote':
        out.push({ id: bid, type: 'quote', text: str(b.text, 600), who: line(b.who, 120), at: num(b.at) });
        break;
      case 'button': {
        const action = b.action === 'book' || b.action === 'proposal' ? b.action : 'link';
        out.push({ id: bid, type: 'button', title: line(b.title, 120), sub: line(b.sub, 200), label: line(b.label, 40) || 'Open', action, url: action === 'link' ? safeUrl(b.url) : null });
        break;
      }
      case 'related':
        out.push({ id: bid, type: 'related', title: line(b.title, 80) || 'Related', ids: (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 12) });
        break;
      case 'steps':
        out.push({
          id: bid,
          type: 'steps',
          title: line(b.title, 80) || 'Next steps',
          items: (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((x) => ({ text: line((x as { text?: unknown }).text, 200), done: (x as { done?: unknown }).done === true })).filter((x) => x.text),
        });
        break;
      case 'image':
        out.push({ id: bid, type: 'image', fileId: num(b.fileId), caption: line(b.caption, 200) });
        break;
      case 'file':
        out.push({ id: bid, type: 'file', fileId: num(b.fileId), label: line(b.label, 120) });
        break;
      case 'plan':
        out.push({ id: bid, type: 'plan' });
        break;
      case 'summary':
        out.push({ id: bid, type: 'summary', title: line(b.title, 80) || 'Rooms on this floor' });
        break;
    }
  }
  return out;
}

/** A new block of a type, ready to fill in. */
export function newBlock(type: BlockType): Block {
  const bid = id();
  switch (type) {
    case 'moments':
      return { id: bid, type, title: 'Key moments', items: [] };
    case 'text':
      return { id: bid, type, title: 'What we heard', body: '' };
    case 'quote':
      return { id: bid, type, text: '', who: '', at: null };
    case 'button':
      return { id: bid, type, title: 'Ready for next steps?', sub: '', label: 'Book a meeting', action: 'book', url: null };
    case 'related':
      return { id: bid, type, title: 'Related', ids: [] };
    case 'steps':
      return { id: bid, type, title: 'Next steps', items: [] };
    case 'image':
      return { id: bid, type, fileId: null, caption: '' };
    case 'file':
      return { id: bid, type, fileId: null, label: '' };
    case 'plan':
      return { id: bid, type };
    case 'summary':
      return { id: bid, type, title: 'Rooms on this floor' };
  }
}

/** Card kinds a block type makes sense under. */
export const BLOCK_TYPES: Array<{ type: BlockType; name: string; hint: string; kinds?: ResourceKind[] }> = [
  { type: 'moments', name: 'Key moments', hint: 'Times that jump the video', kinds: ['video', 'embed'] },
  { type: 'text', name: 'Text', hint: 'A heading and a paragraph or bullets' },
  { type: 'quote', name: 'Quote', hint: 'Something the customer said' },
  { type: 'button', name: 'Button', hint: 'Book a meeting, open the proposal, any link' },
  { type: 'related', name: 'Related resources', hint: 'Point to other cards on this tab' },
  { type: 'steps', name: 'Next steps', hint: 'A short checklist' },
  { type: 'image', name: 'Image', hint: 'A screenshot or photo, with a caption' },
  { type: 'file', name: 'File', hint: 'A download that goes with this card' },
  { type: 'plan', name: 'Floor plan', hint: 'The scoped plan with its badges', kinds: ['floorplan'] },
  { type: 'summary', name: 'Room summary', hint: 'Room types, rooms and sensors', kinds: ['floorplan'] },
];

export const embedOf = (url: string | null) => (url ? resolveEmbed(url) : null);
export const fillHeading = (heading: string, customer: string) => (heading || DEFAULT_HEADING).replace(/\{customer\}/gi, customer);
