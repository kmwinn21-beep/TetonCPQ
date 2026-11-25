/**
 * A pasted video link → how it plays in the page: an <iframe> for YouTube, Vimeo, Loom and Wistia (their players), or
 * null when the site can't be embedded (then it opens in a new tab). Adapted from Parlay's lib/videoEmbed.ts.
 */
export interface Embed {
  provider: 'youtube' | 'vimeo' | 'loom' | 'wistia' | 'canva' | 'gslides' | 'pitch';
  src: string;
}
/** Decks and slides (shown in a slide frame, under Decks & documents), not videos. */
export const isDeckEmbed = (e: Embed | null | undefined) => !!e && (e.provider === 'canva' || e.provider === 'gslides' || e.provider === 'pitch');

/** A pasted link, or the embed code a site gives (<iframe src="…">): the address in it. */
export function embedInput(v: string): string {
  const m = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(v);
  return (m ? m[1] : v).replace(/&amp;/g, '&').trim();
}

export function resolveEmbed(raw: string): Embed | null {
  let u: URL;
  try {
    u = new URL(embedInput(raw));
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id = host === 'youtu.be' ? u.pathname.slice(1) : u.pathname.startsWith('/embed/') ? u.pathname.split('/embed/')[1] : u.pathname.startsWith('/shorts/') ? u.pathname.split('/shorts/')[1] : u.searchParams.get('v') ?? '';
    id = (id ?? '').split(/[/?&]/)[0];
    return /^[\w-]{6,}$/.test(id) ? { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&enablejsapi=1` } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    const hash = parts[parts.indexOf(id ?? '') + 1];
    return id ? { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}${hash && /^[a-f0-9]+$/.test(hash) ? `?h=${hash}` : ''}` } : null;
  }
  if (host === 'loom.com') {
    const id = u.pathname.match(/\/(?:share|embed)\/([a-f0-9]{16,})/)?.[1];
    return id ? { provider: 'loom', src: `https://www.loom.com/embed/${id}` } : null;
  }
  if (host.endsWith('wistia.com') || host.endsWith('wistia.net') || host.endsWith('wi.st')) {
    const id = u.pathname.match(/\/(?:medias|iframe)\/([a-z0-9]{6,})/i)?.[1];
    return id ? { provider: 'wistia', src: `https://fast.wistia.net/embed/iframe/${id}` } : null;
  }
  // Canva: a design's share, view or embed link → its embed view (the design must be shared "Anyone with the link").
  if (host === 'canva.com' || host.endsWith('.canva.com') || host === 'canva.site') {
    const m = u.pathname.match(/\/design\/([A-Za-z0-9_-]{6,})(?:\/([A-Za-z0-9_-]{4,}))?/);
    if (m) return { provider: 'canva', src: `https://www.canva.com/design/${m[1]}/${m[2] && !/^(view|edit|watch)$/.test(m[2]) ? `${m[2]}/` : ''}view?embed` };
    return null;
  }
  // Google Slides: any presentation link → its embed (published to the web, or shared with them).
  if (host === 'docs.google.com') {
    const id = u.pathname.match(/\/presentation\/d\/(e\/)?([A-Za-z0-9_-]{10,})/);
    return id ? { provider: 'gslides', src: `https://docs.google.com/presentation/d/${id[1] ?? ''}${id[2]}/${id[1] ? 'pub' : 'embed'}?start=false&loop=false` } : null;
  }
  if (host === 'pitch.com') {
    const id = u.pathname.match(/\/(?:v|public|embed)\/([A-Za-z0-9-]{8,})(?:\/([A-Za-z0-9-]+))?/);
    return id ? { provider: 'pitch', src: `https://pitch.com/embed/${id[1]}${id[2] ? `/${id[2]}` : ''}` } : null;
  }
  return null;
}

/** "13:02" or "1:02:05" → seconds (null when it isn't a time). */
export function parseTime(s: string): number | null {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/.exec(s) ?? /^\s*(\d+)\s*$/.exec(s);
  if (!m) return null;
  if (m.length === 2) return Number(m[1]);
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}
export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
