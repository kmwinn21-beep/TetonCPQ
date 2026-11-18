'use client';

/**
 * The app menu on a phone: a button in the header that opens a sheet from the
 * header's bottom edge, with the same pages as the sidebar plus the account
 * and sign out. Rows are full width and 48px tall, sized for a thumb.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_NAV, NAV, type ShellUser } from './Sidebar';

export function MobileMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const items = [...NAV, ...(user.role === 'admin' ? ADMIN_NAV : [])];
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/');
  return (
    <>
      <button
        type="button"
        className={`-mr-2 w-11 h-11 flex items-center justify-center rounded-lg ${open ? 'bg-white text-brand-primary' : 'text-sidebar-font'}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          {open ? <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 flex flex-col justify-end" style={{ top: 'var(--mobile-header-h, 56px)' }} role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" className="absolute inset-0 bg-teton-ink/40" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
            <nav className="sheet-or-dialog relative bg-white rounded-t-2xl shadow-2xl max-h-full overflow-y-auto pb-safe">
              <div className="sheet-handle" />
              <ul className="px-2 pt-1">
                {items.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className={`flex items-center gap-3 h-12 px-3 rounded-lg text-base ${active(n.href) ? 'bg-teton-almost-white font-semibold' : ''}`}>
                      <svg className="w-5 h-5 text-teton-dark-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={n.icon} />
                      </svg>
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mx-4 my-2 border-t border-teton-off-white" />
              <Link href="/account" className="flex flex-col justify-center min-h-12 mx-2 px-3 py-2 rounded-lg">
                <span className="text-base font-medium">{user.name}</span>
                <span className="text-sm text-teton-ui-gray">{user.email}</span>
              </Link>
              <button type="button" onClick={signOut} className="flex items-center h-12 mx-2 px-3 rounded-lg text-base text-teton-dark-gray w-[calc(100%-1rem)] text-left">
                Sign out
              </button>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
