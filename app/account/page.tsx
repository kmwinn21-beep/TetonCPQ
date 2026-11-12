import { requirePageUser } from '@/lib/auth/server';
import { ROLE_LABEL } from '@/lib/auth/roles';
import { ChangePassword } from '@/components/auth/ChangePassword';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requirePageUser();
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <div className="card text-sm space-y-1">
        <p><span className="text-teton-dark-gray">Name:</span> {user.name}</p>
        <p><span className="text-teton-dark-gray">Email:</span> {user.email}</p>
        <p><span className="text-teton-dark-gray">Role:</span> {ROLE_LABEL[user.role]}</p>
      </div>
      <ChangePassword />
    </div>
  );
}
