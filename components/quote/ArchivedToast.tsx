'use client';

/** After archiving: "Archived X · Won", with Undo and View archived. Clears itself after a while. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ArchivedToast({ quoteId, name, reason }: { quoteId: number; name: string; reason: string }) {
  const router = useRouter();
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 12000);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  async function undo() {
    setBusy(true);
    const res = await fetch(`/api/quotes/${quoteId}/archive`, { method: 'DELETE' });
    if (res.ok) {
      setShown(false);
      router.replace('/deals');
      router.refresh();
    } else setBusy(false);
  }
  return (
    <div role="status" className="fixed z-40 bottom-4 left-1/2 -translate-x-1/2 w-[min(560px,calc(100vw-2rem))] flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-teton-near-black text-white px-4 py-3 text-sm shadow-xl drawer-in">
      <span className="flex-1 min-w-0">✓ Archived <b>{name}</b> · {reason}. Its shared links are off.</span>
      <button type="button" onClick={() => void undo()} disabled={busy} className="font-semibold text-[#9FC7F2] hover:underline">{busy ? 'Undoing…' : 'Undo'}</button>
      <Link href="/deals?view=archived" className="text-white/70 hover:text-white">View archived</Link>
      <button type="button" aria-label="Dismiss" onClick={() => setShown(false)} className="text-white/60 hover:text-white">✕</button>
    </div>
  );
}
