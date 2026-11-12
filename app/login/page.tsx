import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { countUsers } from '@/lib/data/users';
import { getSessionUser } from '@/lib/auth/server';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthForm } from '@/components/auth/AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if ((await countUsers(await getDb())) === 0) redirect('/setup');
  if (await getSessionUser()) redirect('/deals');
  return (
    <AuthCard title="Sign in" subtitle="Teton reps only. Ask an admin if you need an account.">
      <Suspense>
        <AuthForm
          endpoint="/api/auth/login"
          submitLabel="Sign in"
          fields={[
            { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
            { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
          ]}
        />
      </Suspense>
    </AuthCard>
  );
}
