'use client';

/**
 * A floor plan as a PDF with its scope badges drawn on: each page of the
 * original (kept as vector, turned upright), a legend band under it, and a
 * summary page at the end. Images become one page each.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type PDFEmbeddedPage, type PDFImage } from 'pdf-lib';
import { AREA_ABBR, AREA_KINDS, areaSensors, badgeOf, CARE_LABEL, isPriced, markEdges, markOverridden, markResidents, markSensors, roomScope, typeEdges, typeResidents, typeSensors, sensorsPerRoom, type CareProducts, type CommonArea, type RoomType } from '@/lib/quote/roomTypes';
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
      const sensors = sensorsPerRoom(t, a.products) ? marks.reduce((n, m) => n + markSensors(t, m), 0) : 0;
      const edges = sensorsPerRoom(t, a.products) ? marks.reduce((n, m) => n + markEdges(t, m), 0) : 0;
      return { b, text: safe(reg, `${t.name || 'Room type'} · ${marks.length} room${marks.length === 1 ? '' : 's'}${((r) => (r !== marks.length ? ` (${r} residents)` : ''))(marks.reduce((n, m) => n + markResidents(t, m), 0))} · ${sensors} sensor${sensors === 1 ? '' : 's'}${edges !== marks.length && edges ? ` · ${edges} Edge units` : ''}`) };
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
    const totS = used.reduce((t, u) => t + (sensorsPerRoom(u.t, a.products) ? u.marks.reduce((n, m) => n + markSensors(u.t, m), 0) : 0), 0);
    const totE = used.reduce((t, u) => t + (sensorsPerRoom(u.t, a.products) ? u.marks.reduce((n, m) => n + markEdges(u.t, m), 0) : 0), 0);
    const nn = (a.notes ?? []).filter((x) => x.page === n).length;
    const tot = safe(reg, `${total} room${total === 1 ? '' : 's'} · ${totS} sensor${totS === 1 ? '' : 's'} · ${totE} Edge unit${totE === 1 ? '' : 's'} tagged on this page${nn ? ` · ${nn} note${nn === 1 ? '' : 's'}` : ''}`);
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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

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
  y -= 22;

  // Two cards: sensors (with how many are additional) and Edge units, for the whole community (what gets priced).
  {
    const mon = types.filter(({ t }) => sensorsPerRoom(t, a.products) > 0 && isPriced(t, a.products) && (Number(t.rooms) || 0) > 0).map(({ t }) => t);
    const rooms = mon.reduce((n, t) => n + (Number(t.rooms) || 0), 0);
    const edges = mon.reduce((n, t) => n + typeEdges(t), 0);
    const sc = roomScope(mon, a.allowancePct);
    const additional = Math.max(0, sc.totalSensors - rooms);
    const plans = new Set(types.flatMap(({ t }) => (t.marks ?? []).map((m) => m.plan)));
    const here = mon.reduce((n, t) => n + (t.marks ?? []).filter((m) => m.plan === a.planId).length, 0);
    const multi = edges - rooms;
    const gap = 12;
    const cw = (W - 2 * M - gap) / 2;
    const twoLines = (Number(a.allowancePct) > 0) || plans.size > 1 || multi > 0;
    const ch = twoLines ? 82 : 70;
    const top = y;
    const card = (x: number, fill: string, border: string, accent: string, label: string, value: number, sub: string, sub2?: string) => {
      const r = 9;
      p.drawSvgPath(`M ${r} 0 H ${cw - r} Q ${cw} 0 ${cw} ${r} V ${ch - r} Q ${cw} ${ch} ${cw - r} ${ch} H ${r} Q 0 ${ch} 0 ${ch - r} V ${r} Q 0 0 ${r} 0 Z`, { x, y: top, color: hex(fill), borderColor: hex(border), borderWidth: 0.8 });
      const at = (s2: string, dy: number, size: number, font: PDFFont, color = INK) => p.drawText(safe(font, s2), { x: x + 14, y: top - dy, size, font, color });
      at(label.toUpperCase(), 18, 7.5, bold, hex(accent));
      at(String(value), 45, 24, bold);
      at(sub, 60, 8.5, reg, MUTED);
      if (sub2) at(sub2, 72, 7.5, reg, MUTED);
    };
    card(M, '#EEF4FD', '#CFE0F7', '#1F5FB5', 'Sensors', sc.totalSensors, `${additional} additional · ${Math.min(rooms, sc.totalSensors)} included with the Edge units`, sc.allowance > 0 ? `Additional includes ${sc.allowance} contingency (${Math.round(a.allowancePct * 1000) / 10}% of ${sc.planSensors})` : undefined);
    card(M + cw + gap, '#F4F0FC', '#DDD3F3', '#5B3FA8', 'Edge units', edges, multi > 0 ? `${rooms} resident rooms · ${multi} more where a room has several` : `One in each of ${rooms} resident room${rooms === 1 ? '' : 's'}`, plans.size > 1 ? `This plan: ${here} room${here === 1 ? '' : 's'} (the community has ${plans.size} plans)` : undefined);
    y = top - ch - 26;
  }

  // Room type and care setting on the left; the numbers right-aligned at these x positions.
  // Residents are billed beds; each room's first sensor comes with its Edge unit, the rest are additional.
  // Sensors read left to right: included (the first in each room, with its Edge unit) + additional = total.
  const cols = [M, 152, 250, 294, 332, 380, 428, 472, 520, W - M];
  const head = ['Room type', 'Care', 'This plan', 'All plans', 'Priced', 'Residents', 'Edge units', 'Included', 'Additional', 'Total'];
  const header = () => {
    // "Sensors" over its three columns.
    const sx0 = cols[6] + 10;
    p.drawText('SENSORS', { x: (sx0 + cols[9]) / 2 - bold.widthOfTextAtSize('SENSORS', 7) / 2, y: y + 12, size: 7, font: bold, color: hex('#1F5FB5') });
    p.drawLine({ start: { x: sx0, y: y + 9 }, end: { x: cols[9], y: y + 9 }, thickness: 0.6, color: hex('#9CB9E6') });
    head.forEach((h, k) => text(h.toUpperCase(), cols[k], 7, bold, k === 9 ? INK : MUTED, k < 2 ? 'l' : 'r'));
    y -= 8;
    p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });
    y -= 18;
  };
  header();
  let here = 0;
  let all = 0;
  let priced = 0;
  let edgeTotal = 0;
  let resTotal = 0;
  let addTotal = 0;
  let monRooms = 0;
  const ownCounts: string[] = [];
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
    // Shared rooms: residents per room after the name (each room still gets one Edge unit).
    let nm = safe(bold, t.name || 'Room type');
    while (nm.length > 4 && bold.widthOfTextAtSize(nm, 10) > cols[1] - M - 34) nm = nm.slice(0, -2) + '…';
    text(nm.replace(/…+$/, '…'), M + 26, 10, bold);
    text(t.care === 'custom' ? t.customCare || 'Custom' : CARE_LABEL[t.care], cols[1], 9);
    text(String(onPlan), cols[2], 10, reg, INK, 'r');
    text(String(total), cols[3], 10, reg, INK, 'r');
    text(`${rooms}${differs ? '*' : ''}`, cols[4], 10, differs ? bold : reg, rooms ? INK : MUTED, 'r');
    // Edge units: one per room (more where a room type or a room says so); none without Resident Monitoring.
    const edges = per && rooms ? typeEdges(t) : 0;
    edgeTotal += edges;
    // Residents and sensors with each tagged room's own counts; the first sensor in each room is included.
    const residents = rooms ? typeResidents(t) : 0;
    const sensors = per && rooms ? typeSensors(t) : 0;
    const additional = per && rooms ? Math.max(0, sensors - rooms) : 0;
    resTotal += residents;
    addTotal += additional;
    if (per && rooms) monRooms += rooms;
    for (const m of t.marks ?? [])
      if (markOverridden(m) && ownCounts.length < 12)
        ownCounts.push(`${m.label ? `Room ${m.label}` : 'A room'} (${t.name || 'room type'}): ${[m.residents != null ? plural(markResidents(t, m), 'resident') : '', m.sensors != null ? plural(markSensors(t, m), 'sensor') : '', m.edges != null ? plural(markEdges(t, m), 'Edge unit') : ''].filter(Boolean).join(', ')}`);
    text(String(residents), cols[5], 10, reg, residents ? INK : MUTED, 'r');
    text(String(edges), cols[6], 10, reg, edges ? INK : MUTED, 'r');
    const included = per && rooms ? rooms : 0;
    text(String(included), cols[7], 10, reg, included ? INK : MUTED, 'r');
    text(String(additional), cols[8], 10, reg, additional ? INK : MUTED, 'r');
    text(String(sensors), cols[9], 10, bold, sensors ? INK : MUTED, 'r');
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
  text(String(resTotal), cols[5], 10.5, bold, INK, 'r');
  text(String(edgeTotal), cols[6], 10.5, bold, INK, 'r');
  text(String(monRooms), cols[7], 10.5, bold, INK, 'r');
  text(String(addTotal), cols[8], 10.5, bold, INK, 'r');
  text(String(s.planSensors), cols[9], 10.5, bold, INK, 'r');
  y -= 22;
  if (s.allowance > 0) {
    // The contingency is a percentage of every sensor (included + additional); its sensors are all additional.
    text(`Site-conditions contingency (${Math.round(a.allowancePct * 1000) / 10}% of ${s.planSensors}, rounded up)`, M, 9.5, reg, MUTED);
    text('-', cols[7], 10, reg, MUTED, 'r');
    text(`+${s.allowance}`, cols[8], 10, reg, INK, 'r');
    text(`+${s.allowance}`, cols[9], 10, reg, INK, 'r');
    y -= 8;
    p.drawLine({ start: { x: cols[6] + 10, y }, end: { x: W - M, y }, thickness: 0.6, color: INK });
    y -= 14;
    text('Total sensors', M, 10.5, bold);
    text(String(monRooms), cols[7], 10.5, bold, INK, 'r');
    text(String(Math.max(0, s.totalSensors - monRooms)), cols[8], 10.5, bold, INK, 'r');
    text(String(s.totalSensors), cols[9], 11.5, bold, INK, 'r');
    y -= 22;
  }
  y -= 8;
  text('"This plan" and "All plans" count the rooms tagged on the floor plans; "Priced" is the room count used for pricing.', M, 8.5, reg, MUTED);
  y -= 13;
  text('Each room\'s first sensor comes with its Edge unit; the rest are additional sensors on the same Edge unit.', M, 8.5, reg, MUTED);
  if (ownCounts.length) {
    y -= 13;
    text('Rooms set individually:', M, 8.5, bold, MUTED);
    for (const line of ownCounts) {
      y -= 12;
      text(`· ${line}`, M + 6, 8.5, reg, MUTED);
    }
  }
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
