import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { signSession, verifySession } from '@/lib/auth/session';
import { authenticate, changeOwnPassword, countUsers, createFirstAdmin, createUser, setPassword, updateUser } from './users';
import { createDeal, getQuoteEditor, getVersion, listDeals, markSent, saveVersion } from './quotes';

let db: Client;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-users-'));
  db = createClient({ url: `file:${path.join(dir, 'u.db')}` });
  await migrate(db);
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('users', () => {
  it('first account becomes admin; setup is refused after that', async () => {
    expect(await countUsers(db)).toBe(0);
    const admin = await createFirstAdmin(db, { email: ' Kevin@Teton.ai ', name: 'Kevin', password: 'correct horse battery' });
    expect(admin).toMatchObject({ email: 'kevin@teton.ai', role: 'admin', active: true });
    await expect(createFirstAdmin(db, { email: 'x@teton.ai', name: 'X', password: 'correct horse battery' })).rejects.toThrow(/already complete/);
  });

  it('authenticates by email (case-insensitive) and password; rejects wrong password and short passwords', async () => {
    expect(await authenticate(db, 'KEVIN@teton.ai', 'correct horse battery')).toMatchObject({ name: 'Kevin' });
    expect(await authenticate(db, 'kevin@teton.ai', 'wrong password!!')).toBeNull();
    expect(await authenticate(db, 'nobody@teton.ai', 'correct horse battery')).toBeNull();
    await expect(createUser(db, { email: 'rep@teton.ai', name: 'Rep', role: 'rep', password: 'short' })).rejects.toThrow(/at least 10/);
  });

  it('deactivated users can’t sign in; the last admin can’t be removed', async () => {
    const rep = await createUser(db, { email: 'rep@teton.ai', name: 'Riley Rep', role: 'rep', password: 'rep password 123' });
    await updateUser(db, 1, rep.id, { active: false });
    expect(await authenticate(db, 'rep@teton.ai', 'rep password 123')).toBeNull();
    await updateUser(db, 1, rep.id, { active: true });
    expect(await authenticate(db, 'rep@teton.ai', 'rep password 123')).not.toBeNull();
    await expect(updateUser(db, 1, 1, { role: 'rep' })).rejects.toThrow(/own admin/);
    const other = await createUser(db, { email: 'ops@teton.ai', name: 'Ops', role: 'deal_desk', password: 'ops password 123' });
    await expect(updateUser(db, other.id, 1, { active: false })).rejects.toThrow(/at least one active admin/);
  });

  it('password change requires the current password; admin reset doesn’t', async () => {
    await expect(changeOwnPassword(db, 2, 'nope nope nope', 'new password 456')).rejects.toThrow(/incorrect/);
    await changeOwnPassword(db, 2, 'rep password 123', 'new password 456');
    expect(await authenticate(db, 'rep@teton.ai', 'new password 456')).not.toBeNull();
    await setPassword(db, 2, 'reset password 789');
    expect(await authenticate(db, 'rep@teton.ai', 'reset password 789')).not.toBeNull();
  });

  it('session tokens round-trip and reject tampering', async () => {
    const t = await signSession({ uid: 2, role: 'rep' });
    expect(await verifySession(t)).toEqual({ uid: 2, role: 'rep' });
    expect(await verifySession(t.slice(0, -2) + 'xx')).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
});

describe('attribution', () => {
  it('records deal owner, who saved a version, and who sent it', async () => {
    const { quoteId } = await createDeal(db, 'Owned SL', { userId: 2 });
    expect((await listDeals(db)).find((d) => d.quoteId === quoteId)?.ownerName).toBe('Riley Rep');
    const { versionId } = await saveVersion(db, quoteId, 'v1', 2);
    expect((await getQuoteEditor(db, quoteId))!.versions[0].savedByName).toBe('Riley Rep');
    await markSent(db, versionId, 'CFO', '<html>' + 'x'.repeat(200) + '</html>', 1);
    const v = (await getVersion(db, versionId))!;
    expect(v.sentByName).toBe('Kevin');
  });
});
