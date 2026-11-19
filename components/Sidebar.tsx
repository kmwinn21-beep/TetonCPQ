'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TetonMark } from './AppShell';

export interface ShellUser {
  name: string;
  email: string;
  role: string;
}

export const NAV = [
  { href: '/deals', label: 'Deals', icon: 'M3 7h18M3 12h18M3 17h12' },
  { href: '/catalog', label: 'Price book', icon: 'M7 7h.01M7 3h5l9 9-7 7-9-9V3z' },
];
export const ADMIN_NAV = [{ href: '/admin/users', label: 'Users', icon: 'M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z' }];

/** Collapsed (icons only) or open, remembered per browser; collapsed by default. */
export function usePersistedOpen(key: string, fallback = false) {
  const [open, setOpen] = useState(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v != null) setOpen(v === '1');
    } catch {}
  }, [key]);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {}
  };
  return [open, set] as const;
}

export function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = usePersistedOpen('teton.sidebar.open');
  // Text that fades and folds away when the sidebar collapses to icons.
  const fold = `whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300 ${open ? 'opacity-100 max-w-[12rem]' : 'opacity-0 max-w-0'}`;
  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      pathname === href || pathname.startsWith(href + '/') ? 'bg-white/10 text-sidebar-font font-medium' : 'text-sidebar-font/70 hover:text-sidebar-font hover:bg-white/5'
    }`;
  const item = (n: (typeof NAV)[number]) => (
    <Link key={n.href} href={n.href} className={linkClass(n.href)} title={open ? undefined : n.label} aria-label={open ? undefined : n.label}>
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={n.icon} />
      </svg>
      <span className={fold}>{n.label}</span>
    </Link>
  );
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  const heading = (t: string) => (
    <p className={`text-sidebar-font/40 text-[10px] font-bold uppercase tracking-widest px-3 pt-3 pb-1 h-7 ${fold}`} aria-hidden={!open}>{t}</p>
  );
  return (
    <aside className={`bg-brand-primary flex flex-col flex-shrink-0 h-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${open ? 'w-60' : 'w-[68px]'}`}>
      <div className="px-[18px] border-b border-white/15 min-h-[76px] flex items-center gap-3 text-sidebar-font">
        <TetonMark light className="w-6 h-6 flex-shrink-0" />
        <div className={fold}>
          <p className="font-semibold leading-tight">Teton</p>
          <p className="text-sidebar-font/60 text-xs">Proposal Generator</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {heading('Sales')}
        {NAV.map(item)}
        {user.role === 'admin' && (
          <>
            {heading('Admin')}
            {ADMIN_NAV.map(item)}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-white/15 text-sidebar-font">
        <Link href="/account" className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-white/5" title={open ? undefined : `${user.name} · account`}>
          <span className="w-8 h-8 flex-shrink-0 rounded-full bg-white/15 flex items-center justify-center text-xs font-semibold" aria-hidden="true">
            {user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <span className={`min-w-0 ${fold}`}>
            <span className="block text-sm font-medium truncate">{user.name}</span>
            <span className="block text-xs text-sidebar-font/60 truncate">{user.email}</span>
          </span>
        </Link>
        <button type="button" onClick={signOut} title="Sign out" className="mt-1 w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-sidebar-font/70 hover:text-sidebar-font hover:bg-white/5">
          <svg className="w-4 h-4 flex-shrink-0 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H3m0 0l4-4m-4 4l4 4m6-12h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" /></svg>
          <span className={fold}>Sign out</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Collapse the sidebar' : 'Expand the sidebar'}
          title={open ? 'Collapse' : 'Expand'}
          className="mt-1 w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs text-sidebar-font/70 hover:text-sidebar-font hover:bg-white/5"
        >
          <svg className={`w-4 h-4 flex-shrink-0 ml-0.5 transition-transform duration-300 ${open ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          <span className={fold}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
