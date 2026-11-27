'use client';

/**
 * A floor plan as a PDF with its scope badges drawn on: each page of the
 * original (kept as vector, turned upright), a legend band under it, and a
 * summary page at the end. Images become one page each.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type PDFEmbeddedPage, type PDFImage } from 'pdf-lib';
import { AREA_ABBR, AREA_KINDS, areaSensors, badgeOf, CARE_LABEL, isPriced, roomScope, sensorsPerRoom, type CareProducts, type CommonArea, type RoomType } from '@/lib/quote/roomTypes';
import type { PlanNote } from '@/lib/data/planNotes';
import type { TagNote } from '@/lib/data/tagNotes';

interface Args {
  url: string;
  mime: string;
  planId: number;
  planName: string;
  communityName: string;
  types: RoomType[];
  allowancePct: number;
  /** The plan's notes: those shown on the plan print on their page; every note is listed on the summary page. */
  notes?: PlanNote[];
  /** Notes on tagged rooms: an amber dot on those badges, and a table of them on the summary page. */
  tagNotes?: TagNote[];
  /** The community's products by care type: rooms without resident monitoring get no sensors, rooms without products aren't priced. */
  products?: CareProducts;
  /** The community's common areas: tagged ones print as square markers on their page and are listed on the summary. */
  areas?: CommonArea[];
  /** What E-Call devices are called on the deal ("pendants" / "pull-cords"); none: no E-Call. */
  devices?: string | null;
}

const AREA = '#0F7C80';
/** A common area's marker: a rounded square with its kind's letters. */
function areaMark(page: PDFPage, font: PDFFont, cx: number, cy: number, r: number, text: string) {
  const s = r * 2.1;
  page.drawRectangle({ x: cx - s / 2, y: cy - s / 2, width: s, height: s, color: hex(AREA), borderColor: rgb(1, 1, 1), borderWidth: Math.max(0.6, r * 0.14) });
  const t = safe(font, text);
  const size = r * 0.72;
  page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: cy - size * 0.36, size, font, color: rgb(1, 1, 1) });
}

const DOT = '#F0B429';

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

/** Words wrapped into lines no wider than `max`. */
function wrap(font: PDFFont, text: string, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of safe(font, text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
      // A single word wider than the line: cut it.
      while (font.widthOfTextAtSize(line, size) > max && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), size) > max) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line);
  }
  return out;
}

/** A note's numbered triangle, centred on (cx, cy). */
function triangle(page: PDFPage, font: PDFFont, cx: number, cy: number, size: number, color: string, n: number) {
  const h = size * 0.88;
  page.drawSvgPath(`M ${size / 2} 0 L ${size} ${h} L 0 ${h} Z`, { x: cx - size / 2, y: cy + h * 0.6, color: hex(color), borderColor: rgb(1, 1, 1), borderWidth: Math.max(0.5, size * 0.07) });
  const t = String(n);
  const fs = size * (t.length > 1 ? 0.36 : 0.44);
  page.drawText(t, { x: cx - font.widthOfTextAtSize(t, fs) / 2, y: cy - h * 0.28, size: fs, font, color: rgb(1, 1, 1) });
}

/** A note on the plan: its box, triangle left of the text, author initials, and the text (shortened to fit). */
function drawNote(page: PDFPage, bold: PDFFont, reg: PDFFont, n: PlanNote, w: number, h: number, typeName: string | null) {
  const bx = n.box.x * w;
  const bw = Math.max(40, n.box.w * w);
  const top = (1 - n.box.y) * h;
  const bh = Math.max(22, n.box.h * h);
  const fs = Math.max(5.5, Math.min(9, w / 95));
  const pad = fs * 0.6;
  const tri = fs * 1.5;
  page.drawRectangle({ x: bx, y: top - bh, width: bw, height: bh, color: rgb(1, 1, 1), borderColor: hex(n.color), borderWidth: Math.max(0.8, fs * 0.13), opacity: 0.97 });
  triangle(page, bold, bx + pad + tri / 2, top - pad - tri * 0.45, tri, n.color, n.number);
  const tx = bx + pad + tri + pad * 0.8;
  const tw = bx + bw - pad - tx;
  // Author initials, top right.
  const ini = safe(bold, n.author.initials);
  const iw = bold.widthOfTextAtSize(ini, fs * 0.8) + fs * 0.8;
  page.drawRectangle({ x: bx + bw - pad - iw, y: top - pad - fs * 1.05, width: iw, height: fs * 1.15, color: rgb(0.9, 0.93, 0.99) });
  page.drawText(ini, { x: bx + bw - pad - iw + fs * 0.4, y: top - pad - fs * 0.78, size: fs * 0.8, font: bold, color: rgb(0.17, 0.36, 0.71) });
  page.drawText(safe(bold, typeName ?? 'General note'), { x: tx, y: top - pad - fs * 0.8, size: fs * 0.78, font: bold, color: MUTED });
  const lh = fs * 1.25;
  const room = Math.max(1, Math.floor((bh - pad * 2 - fs * 1.2) / lh));
  let lines = wrap(reg, n.body, fs, tw);
  if (lines.length > room) {
    // Shortened: the full note is on the summary page.
    const tail = ` (note ${n.number})`;
    lines = lines.slice(0, room);
    let last = lines[room - 1];
    while (last.length && reg.widthOfTextAtSize(`${last}…${tail}`, fs) > tw) last = last.slice(0, -1);
    lines[room - 1] = `${last.trimEnd()}…${tail}`;
  }
  lines.forEach((l, k) => page.drawText(l, { x: tx, y: top - pad - fs * 1.2 - lh * (k + 0.85), size: fs, font: reg, color: INK }));
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

  // Each page: a legend band on top, then the plan with its badges.
  srcs.forEach((s, k) => {
    const n = k + 1;
    const here = types.map(({ t, b }) => ({ t, b, marks: (t.marks ?? []).filter((m) => m.plan === a.planId && m.page === n) }));
    const r = Math.max(4.5, Math.min(s.w, s.h) * 0.011);
    const fs = Math.max(7, Math.min(11, s.w / 70));
    const used = here.filter((x) => x.marks.length);
    // Lay out the legend items in rows to find the band's height.
    const pad = fs * 1.4;
    const items: Array<{ b: { color: string; initials: string } | null; text: string }> = used.map(({ t, b, marks }) => {
      const sensors = marks.length * sensorsPerRoom(t, a.products);
      return { b, text: safe(reg, `${t.name || 'Room type'} · ${marks.length} room${marks.length === 1 ? '' : 's'} · ${sensors} sensor${sensors === 1 ? '' : 's'}`) };
    });
    const areasHere = (a.areas ?? []).filter((x) => x.mark && x.mark.plan === a.planId && x.mark.page === n);
    if (areasHere.length) {
      const sen = areaSensors(areasHere);
      const dev = areasHere.reduce((t, x) => t + x.pendants, 0);
      items.push({ b: null, text: safe(reg, `Common areas · ${areasHere.length} · ${sen} sensor${sen === 1 ? '' : 's'}${dev && a.devices ? ` · ${dev} ${a.devices}` : ''}`) });
    }
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
    s.draw(p, 0);
    p.drawRectangle({ x: 0, y: s.h, width: s.w, height: band, color: rgb(1, 1, 1) });
    p.drawLine({ start: { x: 0, y: s.h }, end: { x: s.w, y: s.h }, thickness: 0.6, color: LINE });
    const noted = new Set((a.tagNotes ?? []).flatMap((t) => t.markIds));
    for (const x of areasHere) areaMark(p, bold, x.mark!.x * s.w, (1 - x.mark!.y) * s.h, r, AREA_ABBR[x.kind]);
    for (const { b, marks } of here)
      for (const m of marks) {
        badge(p, bold, m.x * s.w, (1 - m.y) * s.h, r, b.color, b.initials);
        if (noted.has(m.id)) p.drawCircle({ x: m.x * s.w + r * 0.72, y: (1 - m.y) * s.h + r * 0.72, size: r * 0.4, color: hex(DOT), borderColor: rgb(1, 1, 1), borderWidth: Math.max(0.5, r * 0.1) });
      }
    // Every note's triangle on its spot; the box (where it was placed) only for notes shown on the plan.
    const notesHere = (a.notes ?? []).filter((x) => x.page === n);
    for (const note of notesHere) {
      triangle(p, bold, note.x * s.w, (1 - note.y) * s.h, r * 2.2, note.color, note.number);
      if (note.onPlan) drawNote(p, bold, reg, note, s.w, s.h, note.roomTypeId ? a.types.find((t) => t.id === note.roomTypeId)?.name || 'Room type' : null);
    }
    let y = s.h + band - pad - fs * 0.4;
    p.drawText(head, { x: pad, y, size: fs, font: bold, color: INK });
    const total = used.reduce((t, u) => t + u.marks.length, 0);
    const totS = used.reduce((t, u) => t + u.marks.length * sensorsPerRoom(u.t, a.products), 0);
    const nn = (a.notes ?? []).filter((x) => x.page === n).length;
    const tot = safe(reg, `${total} room${total === 1 ? '' : 's'} · ${totS} sensor${totS === 1 ? '' : 's'} tagged on this page${nn ? ` · ${nn} note${nn === 1 ? '' : 's'}` : ''}`);
    p.drawText(tot, { x: Math.max(pad, s.w - pad - reg.widthOfTextAtSize(tot, fs)), y, size: fs, font: reg, color: MUTED });
    y -= line;
    if (!items.length) p.drawText(safe(reg, 'Nothing tagged on this page.'), { x: pad, y, size: fs, font: reg, color: MUTED });
    for (const row of rowsOf) {
      let lx = pad;
      for (const it of row) {
        if (it.b) badge(p, bold, lx + fs * 0.6, y + fs * 0.32, fs * 0.62, it.b.color, it.b.initials);
        else areaMark(p, bold, lx + fs * 0.6, y + fs * 0.32, fs * 0.5, '');
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

/** Just the summary page(s), exactly as the download prints them (for the viewer's Summary tab). */
export async function scopeSummaryPdf(a: Omit<Args, 'url' | 'mime'>): Promise<Blob> {
  const out = await PDFDocument.create();
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const reg = await out.embedFont(StandardFonts.Helvetica);
  summary(out, bold, reg, { ...a, url: '', mime: '' }, a.types.map((t, k) => ({ t, b: badgeOf(t, k) })));
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
  let noSensors = false;
  for (const { t, b } of types) {
    if (y < M + 80) {
      p = out.addPage([W, H]);
      y = H - M;
      header();
    }
    const onPlan = (t.marks ?? []).filter((m) => m.plan === a.planId).length;
    const total = (t.marks ?? []).length;
    const entered = Number(t.rooms) || 0;
    // Rooms in a care setting with no products aren't priced; without resident monitoring they get no sensors.
    const rooms = isPriced(t, a.products) ? entered : 0;
    const per = sensorsPerRoom(t, a.products);
    const differs = entered !== total && total > 0;
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
    text(`${rooms}${differs ? '*' : ''}`, cols[4], 10, differs ? bold : reg, rooms ? INK : MUTED, 'r');
    text(String(per), cols[5], 10, reg, per ? INK : MUTED, 'r');
    text(String(rooms * per), cols[6], 10, bold, rooms * per ? INK : MUTED, 'r');
    noSensors ||= per === 0;
    y -= 10;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: LINE });
    y -= 16;
  }
  const s = roomScope(
    types.map(({ t }) => t).filter((t) => sensorsPerRoom(t, a.products) > 0),
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
  if (noSensors) {
    y -= 13;
    text('Care settings without Resident Monitoring get no sensors; those with no products are not priced.', M, 8.5, reg, MUTED);
  }

  // Common areas tagged on this plan: one row per space, with its page, sensors and E-Call devices.
  const tagged = (a.areas ?? []).filter((x) => x.mark);
  const onThis = tagged.filter((x) => x.mark!.plan === a.planId);
  if (onThis.length) {
    y -= 34;
    const AC = { mark: M, name: M + 24, type: 300, page: 400, sen: 470, dev: W - M };
    const areaHead = () => {
      text('COMMON AREAS', M, 9, bold, MUTED);
      y -= 18;
      text('COMMON AREA', AC.name, 7.5, bold, MUTED);
      text('TYPE', AC.type, 7.5, bold, MUTED);
      text('PAGE', AC.page, 7.5, bold, MUTED, 'r');
      text('SENSORS', AC.sen, 7.5, bold, MUTED, 'r');
      text(a.devices ? safe(bold, `E-CALL ${a.devices.toUpperCase()}`) : 'E-CALL', AC.dev, 7.5, bold, MUTED, 'r');
      y -= 8;
      p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });
      y -= 16;
    };
    if (y < M + 120) {
      p = out.addPage([W, H]);
      y = H - M;
    }
    areaHead();
    for (const x of onThis) {
      if (y < M + 40) {
        p = out.addPage([W, H]);
        y = H - M;
        areaHead();
      }
      areaMark(p, bold, AC.mark + 8, y + 3.5, 6.5, AREA_ABBR[x.kind]);
      let nm = safe(bold, x.name || AREA_KINDS[x.kind]);
      while (nm.length > 4 && bold.widthOfTextAtSize(nm, 10) > AC.type - AC.name - 12) nm = nm.slice(0, -2) + '…';
      text(nm, AC.name, 10, bold);
      text(AREA_KINDS[x.kind], AC.type, 9);
      text(String(x.mark!.page), AC.page, 10, reg, INK, 'r');
      text(String(x.sensors ?? 0), AC.sen, 10, reg, x.sensors ? INK : MUTED, 'r');
      text(a.devices ? String(x.pendants) : '-', AC.dev, 10, reg, x.pendants && a.devices ? INK : MUTED, 'r');
      y -= 10;
      p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: LINE });
      y -= 16;
    }
    y -= 2;
    text(`${onThis.length} area${onThis.length === 1 ? '' : 's'}`, M, 10.5, bold);
    text(String(areaSensors(onThis)), AC.sen, 10.5, bold, INK, 'r');
    if (a.devices) text(String(onThis.reduce((t, x) => t + x.pendants, 0)), AC.dev, 10.5, bold, INK, 'r');
    const elsewhere = tagged.length - onThis.length;
    if (elsewhere > 0) {
      y -= 16;
      text(`${elsewhere} more common area${elsewhere === 1 ? '' : 's'} tagged on the community's other floor plans.`, M, 8.5, reg, MUTED);
    }
  }

  // Notes: every note (on the plan or not) with its room type, author and page.
  const notes = a.notes ?? [];
  if (notes.length) {
  y -= 34;
  const NC = { tri: M, note: M + 24, type: 392, author: 476, page: W - M };
  const noteW = NC.type - NC.note - 14;
  const notesHead = () => {
    text('NOTES', M, 9, bold, MUTED);
    y -= 18;
    text('#', NC.tri, 7.5, bold, MUTED);
    text('NOTE', NC.note, 7.5, bold, MUTED);
    text('ROOM TYPE', NC.type, 7.5, bold, MUTED);
    text('AUTHOR', NC.author, 7.5, bold, MUTED);
    text('PAGE', NC.page, 7.5, bold, MUTED, 'r');
    y -= 8;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });
    y -= 16;
  };
  if (y < M + 120) {
    p = out.addPage([W, H]);
    y = H - M;
  }
  notesHead();
  for (const n of notes) {
    const lines = wrap(reg, n.body, 9.5, noteW);
    const rowH = Math.max(1, lines.length) * 12.5;
    if (y - rowH < M + 20) {
      p = out.addPage([W, H]);
      y = H - M;
      notesHead();
    }
    triangle(p, bold, NC.tri + 7, y + 3, 12, n.color, n.number);
    lines.forEach((l, k) => p.drawText(l, { x: NC.note, y: y - k * 12.5, size: 9.5, font: reg, color: INK }));
    const tn = n.roomTypeId ? types.find(({ t }) => t.id === n.roomTypeId)?.t.name || 'Room type' : 'General';
    text(tn, NC.type, 9, reg, n.roomTypeId ? INK : MUTED);
    const ini = safe(bold, n.author.initials);
    p.drawRectangle({ x: NC.author, y: y - 3, width: bold.widthOfTextAtSize(ini, 8) + 9, height: 12.5, color: rgb(0.9, 0.93, 0.99) });
    text(n.author.initials, NC.author + 4.5, 8, bold, rgb(0.17, 0.36, 0.71));
    // Notes hidden on the plan still have their triangle there.
    text(n.onPlan ? String(n.page) : `${n.page} (tag only)`, NC.page, 9, reg, n.onPlan ? INK : MUTED, 'r');
    y -= rowH - 12.5 + 8;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: LINE });
    y -= 16;
  }
  }

  // Room notes: each note on tagged rooms of this plan, with the rooms it's on.
  const markOf = new Map<string, { t: RoomType; b: { color: string; initials: string }; label?: string }>();
  for (const x of types) for (const m of x.t.marks ?? []) if (m.plan === a.planId) markOf.set(m.id, { ...x, label: m.label });
  const tagNotes = (a.tagNotes ?? []).map((n) => ({ n, rooms: n.markIds.map((id) => markOf.get(id)).filter((v): v is NonNullable<typeof v> => !!v) })).filter((x) => x.rooms.length);
  if (!tagNotes.length) return;
  y -= notes.length ? 18 : 34;
  const TC = { note: M + 16, rooms: 330, author: W - M - 30 };
  const tagHead = () => {
    text('ROOM NOTES', M, 9, bold, MUTED);
    y -= 18;
    text('NOTE', TC.note, 7.5, bold, MUTED);
    text('ROOMS', TC.rooms, 7.5, bold, MUTED);
    text('BY', TC.author, 7.5, bold, MUTED);
    y -= 8;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });
    y -= 16;
  };
  if (y < M + 120) {
    p = out.addPage([W, H]);
    y = H - M;
  }
  tagHead();
  for (const { n, rooms } of tagNotes) {
    const lines = wrap(reg, n.body, 9.5, TC.rooms - TC.note - 14);
    // Room chips ("ST 137"), wrapped to the column.
    const chips = rooms.map((x) => safe(reg, `${x.b.initials}${x.label ? ` ${x.label}` : ''}`));
    const chipRows: string[][] = [[]];
    let cx = 0;
    const maxW = TC.author - TC.rooms - 12;
    for (const c of chips) {
      const w = reg.widthOfTextAtSize(c, 8.5) + 16;
      if (cx + w > maxW && chipRows[chipRows.length - 1].length) {
        chipRows.push([]);
        cx = 0;
      }
      chipRows[chipRows.length - 1].push(c);
      cx += w;
    }
    const rowH = Math.max(lines.length, chipRows.length) * 12.5;
    if (y - rowH < M + 20) {
      p = out.addPage([W, H]);
      y = H - M;
      tagHead();
    }
    p.drawCircle({ x: M + 4, y: y + 3, size: 3.5, color: hex(DOT) });
    lines.forEach((l, k) => p.drawText(l, { x: TC.note, y: y - k * 12.5, size: 9.5, font: reg, color: INK }));
    chipRows.forEach((row, k) => {
      let x = TC.rooms;
      for (const c of row) {
        const w = reg.widthOfTextAtSize(c, 8.5);
        p.drawRectangle({ x, y: y - k * 12.5 - 3, width: w + 8, height: 11.5, color: rgb(0.945, 0.95, 0.955) });
        p.drawText(c, { x: x + 4, y: y - k * 12.5, size: 8.5, font: reg, color: INK });
        x += w + 16;
      }
    });
    const ini = safe(bold, n.author.initials);
    p.drawRectangle({ x: TC.author, y: y - 3, width: bold.widthOfTextAtSize(ini, 8) + 9, height: 12.5, color: rgb(0.9, 0.93, 0.99) });
    text(n.author.initials, TC.author + 4.5, 8, bold, rgb(0.17, 0.36, 0.71));
    y -= rowH - 12.5 + 8;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: LINE });
    y -= 16;
  }
}
