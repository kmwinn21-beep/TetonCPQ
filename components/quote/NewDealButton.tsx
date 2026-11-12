'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function NewDealButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerName: name }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? 'Could not create the deal');
      setBusy(false);
      return;
    }
    router.push(`/quotes/${body.quoteId}`);
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        New deal
      </button>
    );
  }
  return (
    <form onSubmit={create} className="flex flex-wrap items-start gap-2">
      <div>
        <input
          autoFocus
          className="input-field w-64"
          placeholder="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Customer name"
        />
        {error && <p className="text-xs mt-1 text-teton-ink bg-teton-red/30 rounded px-2 py-1">{error}</p>}
      </div>
      <button className="btn-primary" disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create'}
      </button>
      <button type="button" className="btn-ghost py-2" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
