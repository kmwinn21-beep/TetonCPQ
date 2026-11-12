import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { getSessionUser } from '@/lib/auth/server';

export const metadata: Metadata = {
  title: 'Teton Proposal Generator',
  description: 'Deal assumptions, ROI model, pricing guardrails and proposals for Teton sales.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppShell user={user ? { name: user.name, email: user.email, role: user.role } : null}>{children}</AppShell>
      </body>
    </html>
  );
}
