import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { SKU } from '@/lib/pricing/catalog';
import { DEFAULT_LINEUP, sameLineup } from '@/lib/pricing/lineup';
import { getLineup, saveLineup } from './lineup';

let db: Client;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-lineup-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('saving the line-up', () => {
  it('starts as the default (version 0)', async () => {
    const { lineup, savedAt } = await getLineup(db);
    expect(lineup.version).toBe(0);
    expect(sameLineup(lineup, DEFAULT_LINEUP)).toBe(true);
    expect(savedAt).toBeNull();
  });
  it('saves a new version; saving the same rules again changes nothing', async () => {
    const l = structuredClone(DEFAULT_LINEUP);
    l.cores.find((c) => c.id === 'ecall')!.sides.subscription.items = l.cores.find((c) => c.id === 'ecall')!.sides.subscription.items.filter((e) => e.sku !== SKU.ecallBleButton);
    const saved = await saveLineup(db, l, null, 0);
    expect(saved.lineup.version).toBe(1);
    expect(saved.lineup.cores.find((c) => c.id === 'ecall')!.sides.subscription.items.some((e) => e.sku === SKU.ecallBleButton)).toBe(false);
    expect((await saveLineup(db, saved.lineup, null, 1)).lineup.version).toBe(1);
  });
  it('refuses a save started from an older version', async () => {
    await expect(saveLineup(db, DEFAULT_LINEUP, null, 0)).rejects.toMatchObject({ status: 409 });
  });
  it('refuses unknown items and built-in items on the wrong side', async () => {
    const l = structuredClone((await getLineup(db)).lineup);
    l.cores[0].sides.subscription.items.push({ sku: 'NOPE' });
    await expect(saveLineup(db, l, null, 1)).rejects.toThrow(/isn’t in the price book/);
    const m = structuredClone((await getLineup(db)).lineup);
    m.cores[0].sides.capex.items.push({ sku: SKU.platform });
    await expect(saveLineup(db, m, null, 1)).rejects.toThrow(/can’t go under equipment purchase/);
  });
});

describe('a deal’s copy of the line-up', () => {
  it('must be a version the price book saved', async () => {
    const { assertKnownLineup } = await import('./lineup');
    const saved = (await getLineup(db)).lineup;
    await expect(assertKnownLineup(db, {})).resolves.toBeUndefined();
    await expect(assertKnownLineup(db, { lineup: structuredClone(DEFAULT_LINEUP) })).resolves.toBeUndefined();
    await expect(assertKnownLineup(db, { lineup: saved })).resolves.toBeUndefined();
    const forged = structuredClone(saved);
    forged.cores[0].sides.subscription.items = [];
    await expect(assertKnownLineup(db, { lineup: forged })).rejects.toThrow(/don’t match the price book/);
    await expect(assertKnownLineup(db, { lineup: { ...saved, version: 99 } })).rejects.toThrow();
  });
});
