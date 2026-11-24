'use client';

/**
 * Layout frame, same shape as Parlay's AppShell: a full-height flex row with
 * the sidebar on desktop and a main column that scrolls on its own.
 */
import { usePathname } from 'next/navigation';
import { Sidebar, type ShellUser } from './Sidebar';
import { MobileMenu } from './MobileMenu';
import { InboxProvider } from './Inbox';

const BARE = ['/login', '/setup'];

export function AppShell({ children, user }: { children: React.ReactNode; user: ShellUser | null }) {
  // Sign-in pages stand alone: no app chrome.
  const pathname = usePathname();
  if (!user || BARE.some((p) => pathname.startsWith(p))) return <>{children}</>;
  // The proposal is a client-facing document: on desktop it keeps the sidebar beside it (the document scrolls in its
  // own column); on phones and in print it stands alone, with no app chrome, and the window scrolls as before.
  if (pathname.startsWith('/proposal')) {
    return (
      <InboxProvider>
        <div className="lg:flex lg:h-screen lg:supports-[height:100dvh]:h-dvh lg:overflow-hidden print:block print:h-auto print:overflow-visible">
          <div className="hidden lg:flex print:hidden">
            <Sidebar user={user} />
          </div>
          <main className="lg:flex-1 lg:min-w-0 lg:overflow-y-auto print:overflow-visible">{children}</main>
        </div>
      </InboxProvider>
    );
  }
  return (
    <InboxProvider>
    <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar user={user} />
      </div>
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Phones: the brand bar, padded under the status bar, with the menu. Its height is what sheets stop under. */}
        <header className="lg:hidden flex-none bg-brand-primary text-sidebar-font pt-[env(safe-area-inset-top)] [--mobile-header-h:calc(56px+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 px-4 h-14">
            <TetonMark light />
            <span className="font-semibold flex-1 truncate">Proposal Generator</span>
            <MobileMenu user={user} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
    </InboxProvider>
  );
}

/** The Teton logo symbol (public/teton-logo.png). `light` turns it white for dark backgrounds. */
export function TetonMark({ className = 'w-6 h-6', light = false }: { className?: string; light?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/teton-logo.png" alt="" aria-hidden="true" className={`${className} object-contain ${light ? 'brightness-0 invert' : ''}`} />;
}
