import { requirePageUser } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { getRole } from '@/lib/data/roles';
import { ChangePassword } from '@/components/auth/ChangePassword';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requirePageUser();
  const role = await getRole(await getDb(), user.role);
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <div className="card text-sm space-y-1">
        <p><span className="text-teton-dark-gray">Name:</span> {user.name}</p>
        <p><span className="text-teton-dark-gray">Email:</span> {user.email}</p>
        <p><span className="text-teton-dark-gray">Role:</span> {role?.name ?? user.role}</p>
      </div>
      <ChangePassword />
    </div>
  );
}
