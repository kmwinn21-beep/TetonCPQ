import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import { completeFloorPlan, getPlanLabels, putFloorPlanChunk, savePlanLabels, startFloorPlan } from './floorPlans';

let db: Client;
let dir: string;
let quoteId: number;
let planId: number;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-labels-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  quoteId = (await createDeal(db, 'Acme')).quoteId;
  const s = await startFloorPlan(db, quoteId, { communityId: 'c1', name: 'plan.png', mime: 'image/png', size: 4 }, null);
  await putFloorPlanChunk(db, quoteId, s.id, 0, new Uint8Array([1, 2, 3, 4]));
  planId = (await completeFloorPlan(db, quoteId, s.id)).id;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('room numbers saved with a floor plan', () => {
  it('is empty until read, then keeps clean numbers by page', async () => {
    expect(await getPlanLabels(db, quoteId, planId)).toBeNull();
    await savePlanLabels(db, quoteId, planId, {
      pages: { '1': { aspect: 1.29, labels: [{ t: '1a37', x: 0.2, y: 1.4, sure: true }, { t: '', x: 0, y: 0 }, { t: '139', x: -1, y: 0.5, sure: 'yes' }] }, zero: { labels: [] } },
    });
    const l = await getPlanLabels(db, quoteId, planId);
    expect(Object.keys(l!.pages)).toEqual(['1']);
    expect(l!.pages['1']).toEqual({ aspect: 1.29, labels: [{ t: '137', x: 0.2, y: 1, sure: true }, { t: '139', x: 0, y: 0.5, sure: false }] });
    expect(l!.readAt).toMatch(/^\d{4}-/);
    await expect(savePlanLabels(db, quoteId, 9999, { pages: {} })).rejects.toThrow(/not found/);
  });
});
