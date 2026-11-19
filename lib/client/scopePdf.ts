'use client';

/**
 * A floor plan as a PDF with its scope badges drawn on: each page of the
 * original (kept as vector, turned upright), a legend band under it, and a
 * summary page at the end. Images become one page each.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type PDFEmbeddedPage, type PDFImage } from 'pdf-lib';
import { badgeOf, CARE_LABEL, roomScope, type RoomType } from '@/lib/quote/roomTypes';

interface Args {
  url: string;
  mime: string;
  planId: number;
  planName: string;
  communityName: string;
  types: RoomType[];
  allowancePct: number;
}

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = rgb(0.086, 0.094, 0.114);
const MUTED = rgb(0.45, 0.47, 0.5);
const LINE = rgb(0.88, 0.89, 0.88);

/** Text the standard fonts can draw (anything else becomes "?"). */
const safe = (font: PDFFont, s: string) => {
  try {
    font.encodeText(s);
    return s;
  } catch {
    return Array.from(s).map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  }
};

/** An image file's bytes as PNG or JPEG for pdf-lib (others go through a canvas). */
async function imageFor(doc: PDFDocument, bytes: ArrayBuffer, mime: string): Promise<PDFImage> {
  if (mime === 'image/png') return doc.embedPng(bytes);
  if (mime === 'image/jpeg' || mime === 'image/jpg') return doc.embedJpg(bytes);
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  const png = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Could not read the image'))), 'image/png'));
  return doc.embedPng(await png.arrayBuffer());
}

function badge(page: PDFPage, font: PDFFont, cx: number, cy: number, r: number, color: string, text: string) {
  page.drawCircle({ x: cx, y: cy, size: r, color: hex(color), borderColor: rgb(1, 1, 1), borderWidth: Math.max(0.6, r * 0.14) });
  const t = safe(font, text);
  const size = r * (t.length > 2 ? 0.78 : 0.95);
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: cx - w / 2, y: cy - size * 0.36, size, font, color: rgb(1, 1, 1) });
}

export async function scopePdf(a: Args): Promise<Blob> {
  const res = await fetch(a.url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('the floor plan could not be downloaded');
  const bytes = await res.arrayBuffer();
  const out = await PDFDocument.create();
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const reg = await out.embedFont(StandardFonts.Helvetica);
  const types = a.types.map((t, k) => ({ t, b: badgeOf(t, k) }));

  // The source pages, upright: [width, height, draw(page, y0)].
  type Src = { w: number; h: number; draw: (p: PDFPage, y0: number) => void };
  const srcs: Src[] = [];
  if (a.mime === 'application/pdf') {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    for (const sp of src.getPages()) {
      const box = sp.getCropBox();
      const rot = (((sp.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
      const emb: PDFEmbeddedPage = await out.embedPage(sp, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
      const w = rot % 180 ? box.height : box.width;
      const h = rot % 180 ? box.width : box.height;
      srcs.push({
        w,
        h,
        draw: (p, y0) => {
          // Rotated pages are drawn turned the way a viewer shows them.
          if (rot === 0) p.drawPage(emb, { x: 0, y: y0 });
          else if (rot === 90) p.drawPage(emb, { x: 0, y: y0 + h, rotate: degrees(-90) });
          else if (rot === 180) p.drawPage(emb, { x: w, y: y0 + h, rotate: degrees(-180) });
          else p.drawPage(emb, { x: w, y: y0, rotate: degrees(90) });
        },
      });
    }
  } else {
    const img = await imageFor(out, bytes, a.mime);
    const s = Math.min(1, 1600 / Math.max(img.width, img.height));
    const w = img.width * s;
    const h = img.height * s;
    srcs.push({ w, h, draw: (p, y0) => p.drawImage(img, { x: 0, y: y0, width: w, height: h }) });
  }

  // Each page: the plan, its badges, and a legend band underneath.
  srcs.forEach((s, k) => {
    const n = k + 1;
    const here = types.map(({ t, b }) => ({ t, b, marks: (t.marks ?? []).filter((m) => m.plan === a.planId && m.page === n) }));
    const r = Math.max(4.5, Math.min(s.w, s.h) * 0.011);
    const fs = Math.max(7, Math.min(11, s.w / 70));
    const used = here.filter((x) => x.marks.length);
    // Lay out the legend items in rows to find the band's height.
    const pad = fs * 1.4;
    const items = used.map(({ t, b, marks }) => ({ b, text: safe(reg, `${t.name || 'Room type'} · ${marks.length} room${marks.length === 1 ? '' : 's'}`) }));
    const rowsOf: (typeof items)[] = [[]];
    let x = pad;
    const head = safe(bold, `Scope · ${a.communityName} · ${a.planName}${srcs.length > 1 ? ` · page ${n}` : ''}`);
    const itemW = (it: (typeof items)[number]) => fs * 1.5 + reg.widthOfTextAtSize(it.text, fs) + fs * 1.4;
    for (const it of items) {
      if (x + itemW(it) > s.w - pad && rowsOf[rowsOf.length - 1].length) {
        rowsOf.push([]);
        x = pad;
      }
      rowsOf[rowsOf.length - 1].push(it);
      x += itemW(it);
    }
    const line = fs * 1.9;
    const band = pad + fs * 1.3 + (items.length ? rowsOf.length * line : line) + pad * 0.6;
    const p = out.addPage([s.w, s.h + band]);
    p.drawRectangle({ x: 0, y: 0, width: s.w, height: band, color: rgb(1, 1, 1) });
    s.draw(p, band);
    p.drawLine({ start: { x: 0, y: band }, end: { x: s.w, y: band }, thickness: 0.6, color: LINE });
    for (const { b, marks } of here) for (const m of marks) badge(p, bold, m.x * s.w, band + (1 - m.y) * s.h, r, b.color, b.initials);
    let y = band - pad - fs * 0.4;
    p.drawText(head, { x: pad, y, size: fs, font: bold, color: INK });
    const total = used.reduce((t, u) => t + u.marks.length, 0);
    const tot = safe(reg, `${total} room${total === 1 ? '' : 's'} tagged on this page`);
    p.drawText(tot, { x: Math.max(pad, s.w - pad - reg.widthOfTextAtSize(tot, fs)), y, size: fs, font: reg, color: MUTED });
    y -= line;
    if (!items.length) p.drawText(safe(reg, 'No rooms tagged on this page.'), { x: pad, y, size: fs, font: reg, color: MUTED });
    for (const row of rowsOf) {
      let lx = pad;
      for (const it of row) {
        badge(p, bold, lx + fs * 0.6, y + fs * 0.32, fs * 0.62, it.b.color, it.b.initials);
        p.drawText(it.text, { x: lx + fs * 1.5, y, size: fs, font: reg, color: INK });
        lx += itemW(it);
      }
      y -= line;
    }
  });

  // Summary page.
  summary(out, bold, reg, a, types);
  const pdf = await out.save();
  return new Blob([pdf.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
}

function summary(out: PDFDocument, bold: PDFFont, reg: PDFFont, a: Args, types: Array<{ t: RoomType; b: { color: string; initials: string } }>) {
  const W = 612;
  const H = 792;
  const M = 48;
  let p = out.addPage([W, H]);
  let y = H - M;
  const text = (s: string, x: number, size = 10, font = reg, color = INK, align: 'l' | 'r' = 'l') => {
    const t = safe(font, s);
    p.drawText(t, { x: align === 'r' ? x - font.widthOfTextAtSize(t, size) : x, y, size, font, color });
  };
  text('SCOPE SUMMARY', M, 9, bold, rgb(0.83, 0.33, 0.2));
  y -= 24;
  text(a.communityName, M, 20, bold);
  y -= 18;
  text(`${a.planName} · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, M, 10, reg, MUTED);
  y -= 30;

  // Room type and care setting on the left; the numbers right-aligned at these x positions.
  const cols = [M, 222, 345, 400, 455, 505, W - M];
  const head = ['Room type', 'Care setting', 'This plan', 'All plans', 'Priced', 'Per room', 'Sensors'];
  const header = () => {
    head.forEach((h, k) => text(h.toUpperCase(), cols[k], 7.5, bold, MUTED, k < 2 ? 'l' : 'r'));
    y -= 8;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });
    y -= 18;
  };
  header();
  let here = 0;
  let all = 0;
  let priced = 0;
  let mismatch = false;
  for (const { t, b } of types) {
    if (y < M + 80) {
      p = out.addPage([W, H]);
      y = H - M;
      header();
    }
    const onPlan = (t.marks ?? []).filter((m) => m.plan === a.planId).length;
    const total = (t.marks ?? []).length;
    const rooms = Number(t.rooms) || 0;
    const differs = rooms !== total && total > 0;
    mismatch ||= differs;
    here += onPlan;
    all += total;
    priced += rooms;
    badge(p, bold, M + 9, y + 3.5, 8.5, b.color, b.initials);
    // Long names are cut to fit before the care setting column.
    let nm = safe(bold, t.name || 'Room type');
    while (nm.length > 4 && bold.widthOfTextAtSize(nm, 10) > cols[1] - M - 34) nm = nm.slice(0, -2) + '…';
    text(nm.replace(/…+$/, '…'), M + 26, 10, bold);
    text(t.care === 'custom' ? t.customCare || 'Custom' : CARE_LABEL[t.care], cols[1], 9);
    text(String(onPlan), cols[2], 10, reg, INK, 'r');
    text(String(total), cols[3], 10, reg, INK, 'r');
    text(`${rooms}${differs ? '*' : ''}`, cols[4], 10, differs ? bold : reg, INK, 'r');
    text(String(t.sensors), cols[5], 10, reg, INK, 'r');
    text(String(rooms * (Number(t.sensors) || 1)), cols[6], 10, bold, INK, 'r');
    y -= 10;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: LINE });
    y -= 16;
  }
  const s = roomScope(
    types.map(({ t }) => t),
    a.allowancePct,
  );
  y -= 2;
  text('Total', M, 10.5, bold);
  text(String(here), cols[2], 10.5, bold, INK, 'r');
  text(String(all), cols[3], 10.5, bold, INK, 'r');
  text(String(priced), cols[4], 10.5, bold, INK, 'r');
  text(String(s.planSensors), cols[6], 10.5, bold, INK, 'r');
  y -= 22;
  if (s.allowance > 0) {
    text(`Site-conditions allowance (${Math.round(a.allowancePct * 1000) / 10}%, rounded up)`, M, 9.5, reg, MUTED);
    text(`+${s.allowance}`, cols[6], 10, reg, INK, 'r');
    y -= 16;
    text('Total sensors', M, 10.5, bold);
    text(String(s.totalSensors), cols[6], 10.5, bold, INK, 'r');
    y -= 22;
  }
  y -= 8;
  text('"This plan" and "All plans" count the rooms tagged on the floor plans; "Priced" is the room count used for pricing.', M, 8.5, reg, MUTED);
  if (mismatch) {
    y -= 13;
    text('* Entered by hand: differs from the number of rooms tagged.', M, 8.5, reg, MUTED);
  }
}
