'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TetonMark } from './AppShell';

const NAV = [
  {
    href: '/deals',
    label: 'Deals',
    icon: 'M3 7h18M3 12h18M3 17h12',
  },
  {
    href: '/catalog',
    label: 'Price book',
    icon: 'M7 7h.01M7 3h5l9 9-7 7-9-9V3z',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const linkClass = (href: string) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
      pathname === href || pathname.startsWith(href + '/')
        ? 'bg-white/10 text-sidebar-font font-medium'
        : 'text-sidebar-font/70 hover:text-sidebar-font hover:bg-white/5'
    }`;
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
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/15 text-sidebar-font/50 text-xs">Internal — Teton reps only</div>
    </aside>
  );
}
