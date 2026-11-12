'use client';

/**
 * Layout frame, same shape as Parlay's AppShell: a full-height flex row with
 * the sidebar on desktop and a main column that scrolls on its own.
 */
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  // The proposal is a client-facing document: no app chrome, normal page scrolling, prints cleanly.
  if (usePathname().startsWith('/proposal')) return <>{children}</>;
  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-brand-primary text-sidebar-font">
          <TetonMark />
          <span className="font-semibold">Proposal Generator</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function TetonMark({ className = 'w-6 h-6' }: { className?: string }) {
  // Simple person-and-dot glyph after the Teton wordmark; replace with the official SVG when available.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M5 9.5h14v2.2c0 3.9-3.1 7.1-7 7.1s-7-3.2-7-7.1V9.5z" />
    </svg>
  );
}
