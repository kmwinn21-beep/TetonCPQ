'use client';

import { useState } from 'react';

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? 'Could not change password' });
    setCurrent('');
    setNext('');
    setMsg({ ok: true, text: 'Password changed.' });
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-base font-semibold">Change password</h2>
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input id="current" type="password" autoComplete="current-password" className="input-field" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input id="next" type="password" autoComplete="new-password" className="input-field" value={next} onChange={(e) => setNext(e.target.value)} required />
        <p className="hint">At least 10 characters</p>
      </div>
      {msg && <p role="status" className={`text-sm rounded px-2 py-1 ${msg.ok ? 'bg-teton-pale-green' : 'bg-teton-red/30'}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}
