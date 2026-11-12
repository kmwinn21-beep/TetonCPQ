import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { countUsers } from '@/lib/data/users';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthForm } from '@/components/auth/AuthForm';

export const dynamic = 'force-dynamic';

/** One-time: creates the first admin. Gone once any account exists. */
export default async function SetupPage() {
  if ((await countUsers(await getDb())) > 0) redirect('/login');
  return (
    <AuthCard title="Create the admin account" subtitle="First-time setup. This account can add the rest of the team.">
      <Suspense>
        <AuthForm
          endpoint="/api/auth/setup"
          submitLabel="Create account"
          fields={[
            { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
            { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
            { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', hint: `At least ${MIN_PASSWORD_LENGTH} characters` },
          ]}
        />
      </Suspense>
    </AuthCard>
  );
}
