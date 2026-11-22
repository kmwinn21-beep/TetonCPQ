/**
 * A deal's details: the operator's legal entity, geography, HubSpot deal link (required), signatories and
 * projected close date. One set per deal (not per version), kept with the deal.
 */
import type { Client } from '@libsql/client';

export const GEOGRAPHIES = ['UK', 'US', 'CH', 'DK', 'Other'] as const;
export type Geography = (typeof GEOGRAPHIES)[number];

export interface Signatory {
  first: string;
  last: string;
  title: string;
  email: string;
}
export interface DealDetails {
  legalEntity: string;
  geography: Geography | '';
  /** The geography typed in when Other is chosen. */
  geographyOther: string;
  hubspotUrl: string;
  signatories: Signatory[];
  /** YYYY-MM-DD. */
  closeDate: string;
  updatedAt?: string;
}

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isHubspotUrl = (v: string) => /^https:\/\/\S+\.\S+/i.test(v.trim());

/** 45 days from `today`, as YYYY-MM-DD (the default close date). */
export function defaultCloseDate(today = new Date()): string {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 45));
  return d.toISOString().slice(0, 10);
}

export const emptyDetails = (today = new Date()): DealDetails => ({ legalEntity: '', geography: '', geographyOther: '', hubspotUrl: '', signatories: [], closeDate: defaultCloseDate(today) });

/** Clean details; throws a 400 with a plain message when something required is missing or wrong. */
export function cleanDetails(v: unknown): DealDetails {
  const r = (v && typeof v === 'object' ? v : {}) as Partial<DealDetails>;
  const geography = (GEOGRAPHIES as readonly string[]).includes(String(r.geography)) ? (r.geography as Geography) : '';
  const out: DealDetails = {
    legalEntity: text(r.legalEntity, 200),
    geography,
    geographyOther: geography === 'Other' ? text(r.geographyOther, 60) : '',
    hubspotUrl: String(r.hubspotUrl ?? '').trim().slice(0, 500),
    signatories: (Array.isArray(r.signatories) ? r.signatories : []).slice(0, 20).map((s) => {
      const x = (s && typeof s === 'object' ? s : {}) as Partial<Signatory>;
      return { first: text(x.first, 80), last: text(x.last, 80), title: text(x.title, 120), email: text(x.email, 200).toLowerCase() };
    }).filter((s) => s.first || s.last || s.title || s.email),
    closeDate: /^\d{4}-\d{2}-\d{2}$/.test(String(r.closeDate ?? '')) ? String(r.closeDate) : '',
  };
  if (!out.hubspotUrl) throw httpError('The HubSpot deal link is required');
  if (!isHubspotUrl(out.hubspotUrl)) throw httpError('The HubSpot link should be a full web address starting with https://');
  const bad = out.signatories.find((s) => s.email && !EMAIL.test(s.email));
  if (bad) throw httpError(`“${bad.email}” isn’t a valid email address`);
  return out;
}

export async function getDealDetails(db: Client, dealId: number): Promise<DealDetails | null> {
  const r = await db.execute({ sql: 'SELECT details FROM deals WHERE id = ?', args: [dealId] });
  if (!r.rows.length || r.rows[0].details == null) return null;
  try {
    return JSON.parse(String(r.rows[0].details)) as DealDetails;
  } catch {
    return null;
  }
}

export async function saveDealDetails(db: Client, dealId: number, v: unknown): Promise<DealDetails> {
  const d = { ...cleanDetails(v), updatedAt: new Date().toISOString() };
  await db.execute({ sql: "UPDATE deals SET details = ?, updated_at = datetime('now') WHERE id = ?", args: [JSON.stringify(d), dealId] });
  return d;
}
