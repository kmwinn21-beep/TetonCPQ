'use client';

/**
 * Reads the room numbers printed on a floor plan, in the browser.
 *
 * Scanned plans have no text inside, so the numbers are read from the picture. Reading a whole page at once
 * fails (the walls confuse OCR), so this finds number-shaped marks first: small blobs the height of a digit,
 * grouped left to right into something 1–4 digits wide. Each group is cut out with everything else blanked,
 * read a few ways (sizes, stroke widths), and the reading the variants agree on wins. A PDF that has real text
 * (a CAD export) gives its numbers directly, with no OCR. The OCR engine and English data load from this
 * site (/ocr), the first time only.
 */
import { cleanReads, type PlanLabels, type PlanPageLabels, type RawRead } from '@/lib/quote/roomNumbers';
import { openPdf } from './pdf';

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let worker: Promise<Worker> | null = null;
function ocr(): Promise<Worker> {
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr' });
      await w.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' as never });
      return w;
    })();
    worker.catch(() => (worker = null));
  }
  return worker;
}

/** Long side of a page as read, in pixels (about 300 dpi for a letter page). */
const LONG = 3300;

interface Gray {
  w: number;
  h: number;
  px: Uint8ClampedArray;
}

function grayOf(c: HTMLCanvasElement): Gray {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  const px = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; j < px.length; i += 4, j++) px[j] = d[i + 3] < 128 ? 255 : (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return { w: c.width, h: c.height, px };
}

/** The page turned a quarter (1) or three quarters (3) clockwise. */
function turn(g: Gray, q: 1 | 3): Gray {
  const px = new Uint8ClampedArray(g.px.length);
  const w = g.h;
  const h = g.w;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const [nx, ny] = q === 1 ? [g.h - 1 - y, x] : [y, g.w - 1 - x];
      px[ny * w + nx] = g.px[y * g.w + x];
    }
  return { w, h, px };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dark blobs (8-connected) with their boxes and sizes. */
function blobs(g: Gray): Array<Box & { a: number }> {
  const { w, h, px } = g;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Array<Box & { a: number }> = [];
  for (let s = 0; s < px.length; s++) {
    if (seen[s] || px[s] >= 150) continue;
    let top = 0;
    stack[top++] = s;
    seen[s] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, a = 0;
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i / w) | 0;
      a++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const j = ny * w + nx;
          if (!seen[j] && px[j] < 150) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
      }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, a });
  }
  return out;
}

/** Groups of digit-sized blobs side by side, as wide as a 2–4 digit number. */
function numberShapes(g: Gray): Box[][] {
  const k = Math.max(g.w, g.h) / LONG;
  const comps = blobs(g)
    .filter((c) => c.h >= 15 * k && c.h <= 45 * k && c.w >= 3 * k && c.w <= c.h * 3.6 && c.a >= 20 * k * k && c.a / (c.w * c.h) < 0.7)
    .sort((a, b) => a.x - b.x);
  const used = new Uint8Array(comps.length);
  const groups: Box[][] = [];
  for (let i = 0; i < comps.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const grp: Box[] = [comps[i]];
    for (;;) {
      const l = grp[grp.length - 1];
      let best = -1;
      for (let j = i + 1; j < comps.length; j++) {
        const d = comps[j];
        if (used[j]) continue;
        if (d.x > l.x + l.w + 0.6 * l.h) break;
        const gap = d.x - (l.x + l.w);
        if (gap >= -2 && Math.abs(d.y + d.h / 2 - (l.y + l.h / 2)) < 0.25 * l.h && d.h / l.h > 0.75 && d.h / l.h < 1.33) {
          best = j;
          break;
        }
      }
      if (best < 0) break;
      used[best] = 1;
      grp.push(comps[best]);
    }
    const x0 = Math.min(...grp.map((c) => c.x));
    const wid = Math.max(...grp.map((c) => c.x + c.w)) - x0;
    const hh = Math.max(...grp.map((c) => c.h));
    if (grp.length <= 4 && wid >= 1.1 * hh && wid <= 3.8 * hh) groups.push(grp);
  }
  return groups;
}

/** A group cut out (only its own blobs), scaled to `height`, black and white, strokes thinned by `thin`. */
function cutOut(g: Gray, grp: Box[], height: number, thin: number): HTMLCanvasElement {
  const x0 = Math.min(...grp.map((c) => c.x));
  const y0 = Math.min(...grp.map((c) => c.y));
  const w = Math.max(...grp.map((c) => c.x + c.w)) - x0;
  const h = Math.max(...grp.map((c) => c.y + c.h)) - y0;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d')!;
  const img = sctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = grp.some((c) => x + x0 >= c.x && x + x0 < c.x + c.w && y + y0 >= c.y && y + y0 < c.y + c.h);
      const v = inside ? g.px[(y + y0) * g.w + x + x0] : 255;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  sctx.putImageData(img, 0, 0);
  const s = height / Math.max(8, h);
  const pad = 24;
  const out = document.createElement('canvas');
  out.width = Math.round(w * s) + pad * 2;
  out.height = Math.round(h * s) + pad * 2;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, pad, pad, Math.round(w * s), Math.round(h * s));
  const d = ctx.getImageData(0, 0, out.width, out.height);
  // Otsu threshold, then thin dark strokes by spreading white `thin` pixels.
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.data.length; i += 4) hist[d.data[i]]++;
  const total = d.data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sb = 0, wb = 0, best = 0, cut = 128;
  for (let t = 0; t < 256; t++) {
    wb += hist[t];
    if (!wb || wb === total) continue;
    sb += t * hist[t];
    const mb = sb / wb;
    const mf = (sum - sb) / (total - wb);
    const v = wb * (total - wb) * (mb - mf) ** 2;
    if (v > best) {
      best = v;
      cut = t;
    }
  }
  const W = out.width;
  let bw = new Uint8Array(total);
  for (let i = 0; i < total; i++) bw[i] = d.data[i * 4] > cut ? 1 : 0;
  for (let n = 0; n < thin; n++) {
    const nb = bw.slice();
    for (let i = 0; i < total; i++) if (!bw[i] && ((i % W > 0 && bw[i - 1]) || (i % W < W - 1 && bw[i + 1]) || bw[i - W] || bw[i + W])) nb[i] = 1;
    bw = nb;
  }
  for (let i = 0; i < total; i++) d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = bw[i] ? 255 : 0;
  ctx.putImageData(d, 0, 0);
  return out;
}

const VARIANTS: Array<[number, number]> = [
  [40, 0],
  [56, 1],
  [72, 2],
  [56, 0],
];

async function readShapes(g: Gray, q: 0 | 1 | 3, origW: number, origH: number, stop: () => boolean): Promise<RawRead[]> {
  const w = await ocr();
  const out: RawRead[] = [];
  for (const grp of numberShapes(g)) {
    if (stop()) break;
    const votes = new Map<string, number[]>();
    for (const [hgt, thin] of VARIANTS) {
      const { data } = await w.recognize(cutOut(g, grp, hgt, thin));
      const t = data.text.replace(/\s/g, '');
      if (/^\d{1,4}$/.test(t) && data.confidence >= 55) votes.set(t, [...(votes.get(t) ?? []), data.confidence]);
    }
    const best = [...votes.entries()].sort((a, b) => b[1].length - a[1].length || Math.max(...b[1]) - Math.max(...a[1]))[0];
    if (!best) continue;
    const x0 = Math.min(...grp.map((c) => c.x));
    const y0 = Math.min(...grp.map((c) => c.y));
    const x1 = Math.max(...grp.map((c) => c.x + c.w));
    const y1 = Math.max(...grp.map((c) => c.y + c.h));
    let cx = (x0 + x1) / 2;
    let cy = (y0 + y1) / 2;
    // Back to the page as shown.
    if (q === 1) [cx, cy] = [cy, g.w - 1 - cx];
    if (q === 3) [cx, cy] = [g.h - 1 - cy, cx];
    out.push({ text: best[0], conf: Math.max(...best[1]), x: cx / origW, y: cy / origH, ratio: (x1 - x0) / Math.max(1, y1 - y0) });
  }
  return out;
}

async function pageCanvas(url: string, mime: string, page: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  if (mime === 'application/pdf') {
    const pdf = await openPdf(url);
    const pg = await pdf.getPage(page);
    const base = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: LONG / Math.max(base.width, base.height) });
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }
  const img = new Image();
  img.crossOrigin = 'use-credentials';
  img.src = url;
  await img.decode();
  const s = Math.min(1.5, LONG / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Numbers from a PDF's own text (CAD exports), if it has any. */
async function textNumbers(url: string, page: number): Promise<PlanPageLabels | null> {
  const pdf = await openPdf(url);
  const pg = await pdf.getPage(page);
  const vp = pg.getViewport({ scale: 1 });
  const tc = await pg.getTextContent();
  const labels = tc.items.flatMap((it) => {
    if (!('str' in it)) return [];
    const t = it.str.trim();
    if (!/^\d{3,4}[A-Z]?$/i.test(t)) return [];
    const [x, y] = vp.convertToViewportPoint(it.transform[4] + it.width / 2, it.transform[5] + it.height / 2);
    return [{ t: t.replace(/\D/g, ''), x: x / vp.width, y: y / vp.height, sure: true }];
  });
  return labels.length >= 3 ? { aspect: vp.height / vp.width, labels } : null;
}

/**
 * Read every page. `onProgress` gets (page, pages); `stop` cancels between numbers. Pages that can't be read
 * (rotated drawings, very small print) just come back with no numbers.
 */
export async function readRoomNumbers(a: { url: string; mime: string; pages: number; onProgress?: (page: number, pages: number) => void; stop?: () => boolean }): Promise<PlanLabels> {
  const stop = a.stop ?? (() => false);
  const out: PlanLabels = { pages: {}, readAt: new Date().toISOString() };
  for (let p = 1; p <= a.pages && !stop(); p++) {
    a.onProgress?.(p, a.pages);
    if (a.mime === 'application/pdf') {
      const fromText = await textNumbers(a.url, p).catch(() => null);
      if (fromText) {
        out.pages[String(p)] = fromText;
        continue;
      }
    }
    const c = await pageCanvas(a.url, a.mime, p);
    const g = grayOf(c);
    let raw = await readShapes(g, 0, g.w, g.h, stop);
    // Hardly anything: the drawing may be sideways.
    if (cleanReads(raw).length < 5 && !stop()) {
      for (const q of [1, 3] as const) {
        const more = await readShapes(turn(g, q), q, g.w, g.h, stop);
        if (cleanReads(more).length > cleanReads(raw).length) raw = more;
      }
    }
    out.pages[String(p)] = { aspect: g.h / g.w, labels: cleanReads(raw) };
  }
  return out;
}
