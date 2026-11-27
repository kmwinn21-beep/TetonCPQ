/**
 * The Deals page: new comments per deal for the person looking (comments by others since they last opened the deal,
 * prospects' comments included), and the side panel's quick look at one deal.
 */
import type { Client } from '@libsql/client';
import { runModel } from '@/lib/model';
import { normalizeDraft, scopeOf, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { previewTotals } from '@/lib/quote/previewTotals';
import { dealProducts } from '@/lib/quote/products';
import { loadPriceBook } from './quotes';
import { pricedDraft } from '@/lib/pricing/lineup';

/** Opening a deal marks its comments as seen (for the Deals page bubble). */
export async function markDealSeen(db: Client, userId: number, dealId: number): Promise<void> {
  await db.execute({
    sql: "INSERT INTO deal_seen (user_id, deal_id, seen_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id, deal_id) DO UPDATE SET seen_at = excluded.seen_at",
    args: [userId, dealId],
  });
}

const NEW_FOR = `c.deal_id = d.id AND (c.author_id <> ? OR c.prospect_email IS NOT NULL)
  AND c.created_at > COALESCE((SELECT s.seen_at FROM deal_seen s WHERE s.user_id = ? AND s.deal_id = d.id), '0')`;

/** New comments on every deal for this person: how many, and who wrote them (first two names). */
export async function newCommentsByDeal(db: Client, userId: number): Promise<Map<number, { count: number; authors: string[] }>> {
  const rs = await db.execute({
    sql: `SELECT d.id AS deal_id, COALESCE(c.prospect_name, c.prospect_email, u.name) AS who, c.prospect_email IS NOT NULL AS prospect
          FROM deals d JOIN proposal_comments c ON ${NEW_FOR} JOIN users u ON u.id = c.author_id ORDER BY c.id DESC`,
    args: [userId, userId],
  });
  const out = new Map<number, { count: number; authors: string[] }>();
  for (const r of rs.rows) {
    const k = Number(r.deal_id);
    const e = out.get(k) ?? { count: 0, authors: [] };
    e.count++;
    const who = `${String(r.who ?? 'Someone')}${Number(r.prospect) === 1 ? ' (prospect)' : ''}`;
    if (!e.authors.includes(who) && e.authors.length < 3) e.authors.push(who);
    out.set(k, e);
  }
  return out;
}

export interface DealGlance {
  quoteId: number;
  versionNo: number;
  activeVersionId: number | null;
  products: string[];
  pricing: Array<[string, string]>;
  contract: { value: number; months: number } | null;
  communities: Array<{ name: string; place: string; beds: number; pilot: boolean }>;
  agreement: { who: string; at: string } | null;
  comments: Array<{ id: number; who: string; prospect: boolean; label: string; body: string; at: string; isNew: boolean }>;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The side panel's quick look: pricing, communities, the open agreement request and recent comments. */
export async function dealGlance(db: Client, quoteId: number, userId: number): Promise<DealGlance> {
  const q = (await db.execute({ sql: 'SELECT deal_id, active_version_id FROM quotes WHERE id = ?', args: [quoteId] })).rows[0];
  if (!q) throw Object.assign(new Error('Deal not found'), { status: 404 });
  const dealId = Number(q.deal_id);
  const v = (await db.execute({ sql: "SELECT version_no, inputs_json FROM quote_versions WHERE quote_id = ? AND status = 'draft'", args: [quoteId] })).rows[0];
  const d = normalizeDraft(JSON.parse(String(v?.inputs_json ?? '{}')) as QuoteDraft);
  const ps = dealProducts(d);
  const k = pricedDraft(d).commercial;
  const names: Record<string, string> = { subscription: 'Subscription', capex: 'Equipment purchase', ecall: 'E-Call', snf: 'Skilled nursing', sensor: 'Additional sensors', commonArea: 'Common areas', finish: 'Concealed finish' };
  const pricing: Array<[string, string]> = [];
  if (ps.includes('subscription')) pricing.push(['Teton subscription', `${money(k.platformRate)} / bed / mo`]);
  if (ps.includes('capex')) pricing.push(['Base package', `${money(k.capex.basePrice)} / bed`]);
  if (ps.includes('ecall')) pricing.push([`E-Call (${k.ecall === 'inovonics' ? 'Inovonics' : 'Bluetooth'})`, `${money(k.ecallRate)} / ${k.ecallBilling === 'device' ? 'device' : 'room'} / mo`]);
  if (d.schedule?.withPilot && ps.length) pricing.push(['Pilot', `${d.schedule.pilotLengthMonths} months${Number(k.pilotRate) === 0 ? ', free' : `, ${money(k.pilotRate)} / bed`}`]);
  let contract: DealGlance['contract'] = null;
  try {
    if (ps.length && d.communities.length) {
      const { book } = await loadPriceBook(db);
      const inputs = toModelInputs(d);
      const t = previewTotals(d, inputs, runModel(inputs), book);
      if (t.opex) contract = { value: Math.round(t.opex.contract), months: t.opex.termMonths };
      else if (t.capex) {
        contract = { value: Math.round(t.capex.ownership), months: t.capex.years * 12 };
      }
    }
  } catch {
    contract = null; // a half-entered draft
  }
  const ecallOn = k.ecall !== 'none';
  const communities = d.communities.map((c, i) => ({ name: c.name || `Community ${i + 1}`, place: [c.city, c.market].filter(Boolean).join(', '), beds: scopeOf(c, ecallOn).beds, pilot: !!c.pilot }));
  const ag = (await db.execute({ sql: 'SELECT COALESCE(name, email) AS who, created_at FROM agreement_requests WHERE deal_id = ? AND sent_at IS NULL ORDER BY id DESC LIMIT 1', args: [dealId] })).rows[0];
  const seen = (await db.execute({ sql: 'SELECT seen_at FROM deal_seen WHERE user_id = ? AND deal_id = ?', args: [userId, dealId] })).rows[0];
  const cs = await db.execute({
    sql: `SELECT c.id, c.body, c.created_at, c.target_label, c.author_id, c.prospect_email, COALESCE(c.prospect_name, c.prospect_email, u.name) AS who
          FROM proposal_comments c JOIN users u ON u.id = c.author_id WHERE c.deal_id = ? ORDER BY c.id DESC LIMIT 6`,
    args: [dealId],
  });
  const seenAt = seen ? String(seen.seen_at) : '0';
  return {
    quoteId,
    versionNo: Number(v?.version_no ?? 1),
    activeVersionId: q.active_version_id == null ? null : Number(q.active_version_id),
    products: ps.map((p) => names[p]),
    pricing,
    contract,
    communities,
    agreement: ag ? { who: String(ag.who), at: String(ag.created_at) } : null,
    comments: cs.rows.map((c) => {
      const prospect = c.prospect_email != null;
      return {
        id: Number(c.id),
        who: String(c.who ?? 'Someone'),
        prospect,
        label: String(c.target_label ?? 'General'),
        body: String(c.body).replace(/\s+/g, ' ').slice(0, 220),
        at: String(c.created_at),
        isNew: (prospect || Number(c.author_id) !== userId) && String(c.created_at) > seenAt,
      };
    }),
  };
}
