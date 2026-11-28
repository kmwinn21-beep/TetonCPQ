/**
 * Installation finish. Standard installation (sensor on the ceiling, Edge unit
 * near an outlet, cables in a slim white raceway) is included. A concealed
 * finish (cables behind the wall and/or above the ceiling, no raceway) is an
 * add-on, quoted as a range per room pending the site survey:
 *
 *   payable per room = concealed price − standard installation credit
 *   total            = rooms × payable per room   (low and high ends)
 *
 * It isn't part of the equipment price, the ROI or the term totals: it's shown
 * beside them as an optional range.
 */
import { SEED_PRODUCTS, SKU } from './catalog';
import type { QuoteDraft } from '@/lib/quote/draft';
import { pricedBedsOf } from '@/lib/quote/draft';
import { pricedDraft } from './lineup';
import { sharedResidents } from '@/lib/quote/roomTypes';

export interface FinishSetting {
  /** true = the customer is considering the concealed finish. */
  concealed: boolean;
  /** Concealed price per room, low and high ends of the range. */
  low: number;
  high: number;
  /** Value of the standard installation, credited per room. */
  credit: number;
}

const seed = (sku: string, fb: number) => SEED_PRODUCTS.find((p) => p.sku === sku)?.list ?? fb;

export function finishFrom(list: (sku: string) => number | undefined): FinishSetting {
  return {
    concealed: false,
    low: list(SKU.finishConcealedLow) ?? seed(SKU.finishConcealedLow, 700),
    high: list(SKU.finishConcealedHigh) ?? seed(SKU.finishConcealedHigh, 1000),
    credit: list(SKU.finishStandardCredit) ?? seed(SKU.finishStandardCredit, 400),
  };
}
export const DEFAULT_FINISH: FinishSetting = finishFrom(() => undefined);

export function normalizeFinish(v: unknown): FinishSetting {
  const f = (v && typeof v === 'object' ? v : {}) as Partial<FinishSetting>;
  const num = (x: unknown, fb: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : fb);
  const low = num(f.low, DEFAULT_FINISH.low);
  return { concealed: f.concealed === true, low, high: Math.max(low, num(f.high, DEFAULT_FINISH.high)), credit: num(f.credit, DEFAULT_FINISH.credit) };
}

export interface FinishResult extends FinishSetting {
  rooms: number;
  /** Payable per room after the credit (never below zero). */
  netLow: number;
  netHigh: number;
  totalLow: number;
  totalHigh: number;
}

export function computeFinish(draft: QuoteDraft): FinishResult {
  draft = pricedDraft(draft); // the line-up's removed items are free
  const f = normalizeFinish(draft.commercial.finish);
  // Rooms getting an installation (beds with a product; residents sharing a room share its finish).
  const rooms = draft.communities.reduce((s, c) => s + pricedBedsOf(c, draft.commercial.ecall !== 'none') - sharedResidents(c, draft.commercial.ecall !== 'none').priced, 0);
  const netLow = Math.max(0, f.low - f.credit);
  const netHigh = Math.max(0, f.high - f.credit);
  return { ...f, rooms, netLow, netHigh, totalLow: rooms * netLow, totalHigh: rooms * netHigh };
}

/** "$300 to $600" (or one figure when the ends match). */
export const rangeText = (lo: number, hi: number, fmt: (n: number) => string) => (lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`);
