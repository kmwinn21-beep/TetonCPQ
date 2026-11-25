import { requirePageUser } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { getProfile } from '@/lib/data/profiles';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { ChangePassword } from '@/components/auth/ChangePassword';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your profile — Teton' };

export default async function ProfilePage() {
  const user = await requirePageUser();
  const profile = (await getProfile(await getDb(), user.id))!;
  return (
    <div className="max-w-[1180px]">
      <ProfileForm initial={profile} />
      <div className="mt-8 max-w-[640px]">
        <ChangePassword />
      </div>
    </div>
  );
}
