import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import { cleanDetails, defaultCloseDate, getDealDetails, saveDealDetails } from './dealDetails';

let db: Client;
let dir: string;
let dealId: number;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-details-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  const d = await createDeal(db, 'Acme');
  dealId = Number((await db.execute({ sql: 'SELECT deal_id FROM quotes WHERE id = ?', args: [d.quoteId] })).rows[0].deal_id);
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const ok = { legalEntity: ' ABC Holdings, LLC ', geography: 'Other', geographyOther: 'Ireland', hubspotUrl: 'https://app.hubspot.com/contacts/1/deal/2', signatories: [{ first: 'Jane', last: 'Smith', title: 'COO', email: 'Jane@ABC.com' }, { first: '', last: '', title: '', email: '' }], closeDate: '2027-01-06' };

describe('deal details', () => {
  it('needs a HubSpot link (a full https address) and valid signatory emails', () => {
    expect(() => cleanDetails({ ...ok, hubspotUrl: '' })).toThrow(/required/);
    expect(() => cleanDetails({ ...ok, hubspotUrl: 'hubspot.com/deal' })).toThrow(/https/);
    expect(() => cleanDetails({ ...ok, signatories: [{ first: 'A', last: 'B', title: '', email: 'nope' }] })).toThrow(/valid email/);
  });

  it('cleans what it keeps: trimmed text, empty signatories dropped, Other only with Other', () => {
    const d = cleanDetails(ok);
    expect(d).toMatchObject({ legalEntity: 'ABC Holdings, LLC', geography: 'Other', geographyOther: 'Ireland', closeDate: '2027-01-06' });
    expect(d.signatories).toEqual([{ first: 'Jane', last: 'Smith', title: 'COO', email: 'jane@abc.com' }]);
    expect(cleanDetails({ ...ok, geography: 'US' }).geographyOther).toBe('');
    expect(cleanDetails({ ...ok, geography: 'Mars' }).geography).toBe('');
  });

  it('defaults the close date to 45 days out and saves one set per deal', async () => {
    expect(defaultCloseDate(new Date(2026, 10, 22))).toBe('2027-01-06');
    expect(await getDealDetails(db, dealId)).toBeNull();
    await saveDealDetails(db, dealId, ok);
    expect(await getDealDetails(db, dealId)).toMatchObject({ legalEntity: 'ABC Holdings, LLC', hubspotUrl: ok.hubspotUrl });
  });
});
