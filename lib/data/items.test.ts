import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { SKU } from '@/lib/pricing/catalog';
import { pricedRoles } from '@/lib/pricing/lineup';
import { createItem, nextFreeCode, openDealsWith, updateItemDetails } from './items';
import { getLineup } from './lineup';

let db: Client;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-items-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const base = { name: 'Wall-mount sensor kit', itemCode: 'TT-CAP-015', category: 'Capital purchase', sub: 'Components', billing: 'once', per: 'sensor', counted: 'commonAreaSensors', list: 450, description: 'Bought outright and installed.' };

describe('adding items', () => {
  it('suggests the next free SKU in a series', async () => {
    expect(await nextFreeCode(db, 'TT-CAP')).toBe('TT-CAP-015');
    expect(await nextFreeCode(db, 'TT-ADD-')).toBe('TT-ADD-010');
    expect(await nextFreeCode(db, 'TT-NEW')).toBe('TT-NEW-001');
  });
  it('ships the equipment-purchase common area sensor, in no core product yet', async () => {
    const { listPriceBookRows } = await import('./priceBook');
    const ca = (await listPriceBookRows(db)).find((r) => r.sku === 'CAPEX-COMMON-AREA')!;
    expect(ca).toMatchObject({ itemCode: 'TT-CAP-014', generic: true, billing: 'once', counted: 'commonAreaSensors', pilotRule: 'none', category: 'Capital purchase', list: 450 });
    expect(JSON.stringify((await getLineup(db)).lineup)).not.toContain('CAPEX-COMMON-AREA');
  });
  it('refuses duplicate names and SKUs (lower case, spaces ignored) and pilot words', async () => {
    await expect(createItem(db, { ...base, name: '  teton   SUBSCRIPTION ' }, null)).rejects.toThrow(/already exists/);
    await expect(createItem(db, { ...base, itemCode: 'tt-cap-004' }, null)).rejects.toThrow(/already used by Additional sensor/);
    await expect(createItem(db, { ...base, name: 'Pilot kit' }, null)).rejects.toThrow(/Leave “pilot”/);
    await expect(createItem(db, { ...base, billing: 'years' }, null)).rejects.toThrow(/Every how many years/);
  });
  it('adds an item straight into a core product, turning that way to buy on', async () => {
    const { item, lineup } = await createItem(db, { ...base, addTo: { core: 'commonArea', side: 'capex' } }, null);
    expect(item).toMatchObject({ name: base.name, itemCode: 'TT-CAP-015', generic: true, billing: 'once', counted: 'commonAreaSensors', pilotRule: 'credited', category: 'Capital purchase', pricingModel: 'per_unit_once' });
    const ca = lineup!.lineup.cores.find((c) => c.id === 'commonArea')!;
    expect(ca.sides.capex.offered).toBe(true);
    expect(ca.sides.capex.items).toEqual([{ sku: item.sku, item: { name: base.name, code: 'TT-CAP-015', list: 450, billing: 'once', counted: 'commonAreaSensors', pilot: 'credited' } }]);
    expect(lineup!.lineup.version).toBe(1);
  });
});

describe('editing item details', () => {
  it('a generic item: billing and pilot rule change, and the line-up’s copy follows (a new version)', async () => {
    const sku = (await getLineup(db)).lineup.cores.find((c) => c.id === 'commonArea')!.sides.capex.items[0].sku;
    const { item, lineup } = await updateItemDetails(db, sku, { billing: 'years', everyYears: 5 }, null);
    expect(item).toMatchObject({ billing: 'years', everyYears: 5, pilotRule: 'credited' });
    expect(lineup!.lineup.version).toBe(2);
    expect(lineup!.lineup.cores.find((c) => c.id === 'commonArea')!.sides.capex.items[0].item).toMatchObject({ billing: 'years', everyYears: 5 });
    const again = await updateItemDetails(db, sku, { billing: 'monthly' }, null);
    expect(again.item).toMatchObject({ billing: 'monthly', everyYears: null, pilotRule: 'free' });
    expect(again.item.history[0]).toMatchObject({ field: expect.any(String) });
  });
  it('built-in items keep their pricing rules; convertible ones can switch, and back', async () => {
    await expect(updateItemDetails(db, SKU.platform, { billing: 'once' }, null)).rejects.toThrow(/built-in pricing rules/);
    await expect(updateItemDetails(db, SKU.platform, { category: 'Add-ons' }, null)).rejects.toThrow(/stay in their place/);
    expect((await updateItemDetails(db, SKU.platform, { description: 'Platform, per bed.' }, null)).item.description).toBe('Platform, per bed.');
    await expect(updateItemDetails(db, SKU.commonAreaMonthly, { billing: 'once' }, null)).rejects.toThrow(/Switch it/);
    const sw = await updateItemDetails(db, SKU.commonAreaMonthly, { generic: true }, null);
    expect(sw.item).toMatchObject({ generic: true, billing: 'monthly', counted: 'commonAreaSensors', pilotRule: 'free' });
    const entry = sw.lineup!.lineup.cores.find((c) => c.id === 'commonArea')!.sides.subscription.items.find((e) => e.sku === SKU.commonAreaMonthly)!;
    expect(entry.item).toMatchObject({ billing: 'monthly', counted: 'commonAreaSensors', list: 50 });
    // Its built-in role is no longer priced (the generic copy prices it instead).
    expect(Array.from(pricedRoles(sw.lineup!.lineup)).some((k) => k.includes('commonAreaMonthly'))).toBe(false);
    const back = await updateItemDetails(db, SKU.commonAreaMonthly, { generic: false }, null);
    expect(back.item.generic).toBe(false);
    expect(back.lineup!.lineup.cores.find((c) => c.id === 'commonArea')!.sides.subscription.items.find((e) => e.sku === SKU.commonAreaMonthly)!.item).toBeUndefined();
    expect(await openDealsWith(db, SKU.commonAreaMonthly)).toBe(0);
  });
});

describe('item icons', () => {
  it('a new item can have an icon from the library; unknown icons are refused', async () => {
    const { item } = await createItem(db, { ...base, name: 'Icon test kit', itemCode: 'TT-ICO-001', icon: 'call-bell', iconTint: 'coral' }, null);
    expect([item.icon, item.iconTint]).toEqual(['call-bell', 'coral']);
    await expect(createItem(db, { ...base, name: 'Icon test kit 2', itemCode: 'TT-ICO-002', icon: 'not-an-icon' }, null)).rejects.toThrow(/icon from the library/);
    const { item: plain } = await createItem(db, { ...base, name: 'Icon test kit 3', itemCode: 'TT-ICO-003' }, null);
    expect([plain.icon, plain.iconTint]).toEqual([null, null]);
  });
  it('any item, built-in too, can change its icon or go back to automatic; each change is in its history', async () => {
    const { setItemIcon } = await import('./items');
    const a = await setItemIcon(db, SKU.platform, 'folder', 'nope', null);
    expect([a.icon, a.iconTint]).toEqual(['folder', null]);
    const b = await setItemIcon(db, SKU.platform, null, null, null);
    expect([b.icon, b.iconTint]).toEqual([null, null]);
    expect(b.history.filter((h) => h.field === 'icon').map((h) => h.newValue)).toEqual(expect.arrayContaining(['Folder', 'Automatic']));
  });
});
