import { getDb } from '@/lib/db/client';
import { requirePageUser } from '@/lib/auth/server';
import { listUsers } from '@/lib/data/users';
import { UsersAdmin } from '@/components/auth/UsersAdmin';
import { listRoles } from '@/lib/data/roles';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requirePageUser({ admin: true });
  const db = await getDb();
  const users = await listUsers(db);
  return <UsersAdmin initial={users} meId={me.id} roles={await listRoles(db)} />;
}
