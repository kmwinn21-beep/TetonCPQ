'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { TetonMark } from './AppShell';

export interface ShellUser {
  name: string;
  email: string;
  role: string;
}

const NAV = [
  { href: '/deals', label: 'Deals', icon: 'M3 7h18M3 12h18M3 17h12' },
  { href: '/catalog', label: 'Price book', icon: 'M7 7h.01M7 3h5l9 9-7 7-9-9V3z' },
];
const ADMIN_NAV = [{ href: '/admin/users', label: 'Users', icon: 'M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z' }];

export function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const linkClass = (href: string) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
      pathname === href || pathname.startsWith(href + '/') ? 'bg-white/10 text-sidebar-font font-medium' : 'text-sidebar-font/70 hover:text-sidebar-font hover:bg-white/5'
    }`;
  const item = (n: (typeof NAV)[number]) => (
    <Link key={n.href} href={n.href} className={linkClass(n.href)}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={n.icon} />
      </svg>
      {n.label}
    </Link>
  );
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <aside className="w-60 bg-brand-primary flex flex-col flex-shrink-0 h-full">
      <div className="p-5 border-b border-white/15 min-h-[76px] flex items-center gap-3 text-sidebar-font">
        <TetonMark />
        <div>
          <p className="font-semibold leading-tight">Teton</p>
          <p className="text-sidebar-font/60 text-xs">Proposal Generator</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <p className="text-sidebar-font/40 text-[10px] font-bold uppercase tracking-widest px-4 pt-2 pb-1">Sales</p>
        {NAV.map(item)}
        {user.role === 'admin' && (
          <>
            <p className="text-sidebar-font/40 text-[10px] font-bold uppercase tracking-widest px-4 pt-4 pb-1">Admin</p>
            {ADMIN_NAV.map(item)}
          </>
        )}
      </nav>
      <div className="p-4 border-t border-white/15 text-sidebar-font">
        <Link href="/account" className="block rounded-lg px-2 py-1.5 hover:bg-white/5">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <p className="text-xs text-sidebar-font/60 truncate">{user.email}</p>
        </Link>
        <button type="button" onClick={signOut} className="mt-1 w-full text-left px-2 py-1.5 rounded-lg text-xs text-sidebar-font/70 hover:text-sidebar-font hover:bg-white/5">
          Sign out
        </button>
      </div>
    </aside>
  );
}
