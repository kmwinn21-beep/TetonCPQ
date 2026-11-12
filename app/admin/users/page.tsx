import { getDb } from '@/lib/db/client';
import { requirePageUser } from '@/lib/auth/server';
import { listUsers } from '@/lib/data/users';
import { UsersAdmin } from '@/components/auth/UsersAdmin';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requirePageUser({ admin: true });
  const users = await listUsers(await getDb());
  return <UsersAdmin initial={users} meId={me.id} />;
}
