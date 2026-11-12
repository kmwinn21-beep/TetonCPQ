/**
 * Parse buildings copied straight from the NIC MAP portal (Industry → Buildings,
 * List view). Selecting the results and copying gives, per building:
 *
 *   Aspen Alcove at Elizabethtown          ← community name
 *   Triple Crown Senior Living             ← operator
 *   1108 Regency Way                       ← street
 *   Elizabethtown, KY 42701                ← city, state ZIP
 *   Total Units  29
 *   AA  IL  AL  MC  NC                     ← care types
 *   0   0   10  19  0                      ← units per care type
 *
 * with blank lines and sometimes "View Details" in between. Each building is
 * anchored on its "Total Units" line; the four lines above it are read
 * backwards from the City, ST ZIP line, so stray text before a building
 * doesn't shift anything.
 *
 * Care mix maps to the bed fields: IL (+ AA, active adult), AL, MC, and NC
 * (nursing care) as SNF. The four always add up to NIC's Total Units.
 */
import type { PastedCommunity } from './paste';

export type CareType = 'AA' | 'IL' | 'AL' | 'MC' | 'NC';

export interface NicBuilding extends PastedCommunity {
  operator: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  totalUnits: number;
  careMix: Partial<Record<CareType, number>>;
}

const TOTAL_UNITS = /^total\s+units\b[\s:]*([\d,]+)?/i;
const CITY_STATE_ZIP = /^(.+?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/;
const NOISE = /^(view details|list|map|buildings|construction|contacts|operators|export buildings|results matching your search)$/i;
const toInt = (s: string | undefined) => {
  const t = (s ?? '').replace(/,/g, '').trim();
  if (t === '') return NaN; // missing, not zero
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** True when the text looks like a NIC MAP portal copy (has "Total Units" building lines). */
export function looksLikeNicCopy(text: string): boolean {
  return /^\s*total\s+units\b/im.test(text);
}

export function parseNicCopy(text: string): { buildings: NicBuilding[]; skipped: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter((l) => l !== '' && !NOISE.test(l));

  const buildings: NicBuilding[] = [];
  let skipped = 0;
  let chunkStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = TOTAL_UNITS.exec(lines[i]);
    if (!m) continue;

    // Total may be on the same line ("Total Units\t29") or the next one.
    let total = toInt(m[1]);
    let after = i + 1;
    if (Number.isNaN(total) && /^[\d,]+$/.test(lines[after] ?? '')) {
      total = toInt(lines[after]);
      after++;
    }

    // Care mix: a header line of care types followed by a line of numbers.
    const careMix: Partial<Record<CareType, number>> = {};
    const header = (lines[after] ?? '').split(/\s+/);
    if (header.length > 0 && header.every((h) => /^(AA|IL|AL|MC|NC)$/.test(h))) {
      const values = (lines[after + 1] ?? '').split(/\s+/);
      if (values.length === header.length && values.every((v) => /^[\d,]+$/.test(v))) {
        header.forEach((h, k) => (careMix[h as CareType] = toInt(values[k])));
        after += 2;
      } else after += 1;
    }

    const chunk = lines.slice(chunkStart, i);
    chunkStart = after;
    i = after - 1;

    const cityIdx = chunk.map((l) => CITY_STATE_ZIP.test(l)).lastIndexOf(true);
    let name = '';
    let operator = '';
    let street = '';
    let city = '';
    let state = '';
    let zip = '';
    if (cityIdx >= 0) {
      const cm = CITY_STATE_ZIP.exec(chunk[cityIdx])!;
      city = cm[1].trim();
      state = cm[2];
      zip = cm[3];
      street = chunk[cityIdx - 1] ?? '';
      const before = chunk.slice(0, Math.max(0, cityIdx - 1));
      if (before.length >= 2) {
        name = before[before.length - 2];
        operator = before[before.length - 1];
      } else {
        name = before[0] ?? '';
      }
    } else {
      name = chunk[0] ?? '';
      operator = chunk[1] ?? '';
    }

    if (!name || Number.isNaN(total) || total <= 0) {
      skipped++;
      continue;
    }
    // Care mix → bed fields. NC (nursing care) is SNF; AA (active adult) counts as IL; anything the mix
    // doesn't account for (or no mix at all) is AL, so the four always add up to NIC's Total Units.
    const snfBeds = Math.min(careMix.NC ?? 0, total);
    const ilBeds = Math.min((careMix.IL ?? 0) + (careMix.AA ?? 0), total - snfBeds);
    const mcBeds = Math.min(careMix.MC ?? 0, total - snfBeds - ilBeds);
    const alBeds = total - snfBeds - ilBeds - mcBeds;
    buildings.push({ name, market: state, ilBeds, alBeds, mcBeds, snfBeds, operator, street, city, state, zip, totalUnits: total, careMix });
  }
  return { buildings, skipped };
}
