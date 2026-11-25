/**
 * A pasted video link → how it plays in the page: an <iframe> for YouTube, Vimeo, Loom and Wistia (their players), or
 * null when the site can't be embedded (then it opens in a new tab). Adapted from Parlay's lib/videoEmbed.ts.
 */
export interface Embed {
  provider: 'youtube' | 'vimeo' | 'loom' | 'wistia';
  src: string;
}

export function resolveEmbed(url: string): Embed | null {
  let u: URL;
  try {
    u = new URL(url.trim());
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
