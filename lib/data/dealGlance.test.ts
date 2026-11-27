import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import { dealGlance, markDealSeen, newCommentsByDeal } from './dealGlance';

let db: Client;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-glance-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

it('counts comments by others (and prospects) since the deal was last opened', async () => {
  const ids = [];
  for (const n of ['own', 'other']) ids.push(Number((await db.execute({ sql: "INSERT INTO users (email, name, role) VALUES (?, ?, 'rep') RETURNING id", args: [`${n}@x.test`, n] })).rows[0].id));
  const [own, other] = ids;
  const { dealId, quoteId } = await createDeal(db, 'Acme', { userId: own });
  await markDealSeen(db, own, dealId);
  const add = (author: number, prospect: string | null, ago: string) =>
    db.execute({ sql: `INSERT INTO proposal_comments (deal_id, body, author_id, area, prospect_email, created_at) VALUES (?, 'Hi', ?, 'inputs', ?, datetime('now', ?))`, args: [dealId, author, prospect, ago] });
  await add(other, null, '-1 hour'); // before the deal was opened: not new
  await add(other, null, '+1 minute');
  await add(own, 'dana@prospect.test', '+2 minutes'); // a prospect's comment (stored under the owner)
  await add(own, null, '+3 minutes'); // my own: not new
  const n = (await newCommentsByDeal(db, own)).get(dealId);
  expect(n?.count).toBe(2);
  expect(n?.authors).toEqual(['dana@prospect.test (prospect)', 'other']);
  const g = await dealGlance(db, quoteId, own);
  expect(g.comments.filter((c) => c.isNew)).toHaveLength(2);
  await db.execute({ sql: "UPDATE deal_seen SET seen_at = datetime('now', '+10 minutes') WHERE user_id = ?", args: [own] });
  expect((await newCommentsByDeal(db, own)).get(dealId)).toBeUndefined();
});
