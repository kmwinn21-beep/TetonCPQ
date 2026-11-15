import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { SKU } from '@/lib/pricing/catalog';
import { cleanListPrice, listPriceBookRows, setListPrice } from './priceBook';
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
