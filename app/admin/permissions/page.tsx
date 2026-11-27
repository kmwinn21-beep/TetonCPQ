import { getDb } from '@/lib/db/client';
import { requirePageUser } from '@/lib/auth/server';
import { getMatrix } from '@/lib/data/permissions';
import { PermissionsMatrix } from '@/components/admin/PermissionsMatrix';

export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  await requirePageUser({ admin: true });
  const db = await getDb();
  return <PermissionsMatrix initial={await getMatrix(db)} />;
}
