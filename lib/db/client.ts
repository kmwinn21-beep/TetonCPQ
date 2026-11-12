/**
 * The one database client. Server-only.
 *
 * TURSO_DATABASE_URL may be the Turso URL (with TURSO_AUTH_TOKEN) or, for
 * local development and tests, a file: URL.
 */
import 'server-only';
import { createClient, type Client } from '@libsql/client';
import { migrate } from './migrate';

let client: Client | null = null;
let ready: Promise<void> | null = null;

export async function getDb(): Promise<Client> {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('TURSO_DATABASE_URL is not set (use file:local.db for local development)');
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  if (!ready) ready = migrate(client).catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  return client;
}
