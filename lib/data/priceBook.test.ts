import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { SKU } from '@/lib/pricing/catalog';
import { cleanListPrice, listPriceBookRows, setListPrice, setMarketPrice } from './priceBook';
import { createDeal, getQuoteEditor } from './quotes';

let db: Client;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-pb-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('price book editing', () => {
  it('starts at the standard prices', async () => {
    const platform = (await listPriceBookRows(db)).find((r) => r.sku === SKU.platform)!;
    expect(platform.list).toBe(99);
    expect(platform.defaultList).toBe(99);
  });

  it('changes a list price, which new deals pick up, and keeps it through a re-migrate', async () => {
    expect((await setListPrice(db, SKU.platform, 105, null)).list).toBe(105);
    await migrate(db); // seeding never overwrites
    expect((await listPriceBookRows(db)).find((r) => r.sku === SKU.platform)!.list).toBe(105);
    const { quoteId } = await createDeal(db, 'Price test');
    expect((await getQuoteEditor(db, quoteId))!.draft.commercial.platformRate).toBe(105);
  });

  it('resets to the default', async () => {
    expect((await setListPrice(db, SKU.platform, 'default', null)).list).toBe(99);
  });

  it('rejects bad values', async () => {
    expect(() => cleanListPrice('multiplier', 5)).toThrow('1× to 3×');
    expect(() => cleanListPrice('per_bed_month', -1)).toThrow();
    expect(() => cleanListPrice('per_bed_month', '')).toThrow('Enter a number');
    expect(cleanListPrice('per_bed_once', 399.999)).toBe(400);
    await expect(setListPrice(db, 'NOPE', 1, null)).rejects.toThrow('not found');
  });
});

describe('reference prices outside the US', () => {
  it('seeds the official sheet’s prices, edits them, marks one not sold, and puts it back', async () => {
    let row = (await listPriceBookRows(db)).find((r) => r.sku === SKU.platform)!;
    expect(row.markets.UK).toEqual({ price: 70, notSold: false });
    expect(row.markets.IS).toEqual({ price: 16000, notSold: false });
    expect((await listPriceBookRows(db)).find((r) => r.sku === SKU.snf)!.markets.DK).toEqual({ price: null, notSold: true });
    row = await setMarketPrice(db, SKU.platform, 'UK', 72.5, null);
    expect(row.markets.UK).toEqual({ price: 72.5, notSold: false });
    row = await setMarketPrice(db, SKU.platform, 'UK', 'not_sold', null);
    expect(row.markets.UK.notSold).toBe(true);
    row = await setMarketPrice(db, SKU.platform, 'UK', 'default', null);
    expect(row.markets.UK).toEqual({ price: 70, notSold: false });
    // Edits survive a re-migrate (seeding only fills what's missing).
    await setMarketPrice(db, SKU.platform, 'DE', 77, null);
    await migrate(db);
    expect((await listPriceBookRows(db)).find((r) => r.sku === SKU.platform)!.markets.DE.price).toBe(77);
    await expect(setMarketPrice(db, SKU.platform, 'US', 1, null)).rejects.toThrow('Unknown market');
    await expect(setMarketPrice(db, SKU.platform, 'UK', -3, null)).rejects.toThrow('Enter a price');
  });
});
