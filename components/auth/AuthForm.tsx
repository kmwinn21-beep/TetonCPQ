'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface Field {
  name: string;
  label: string;
  type: 'email' | 'password' | 'text';
  autoComplete: string;
  hint?: string;
}

/** Posts the fields as JSON; on success goes to ?next= (same-site paths only) or /deals. */
export function AuthForm({ endpoint, fields, submitLabel }: { endpoint: string; fields: Field[]; submitLabel: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Something went wrong');
      setBusy(false);
      return;
    }
    const next = params.get('next');
    router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/deals');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">{f.label}</label>
          <input
            id={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            className="input-field"
            required
            value={values[f.name] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          />
          {f.hint && <p className="hint">{f.hint}</p>}
        </div>
      ))}
      {error && <p role="alert" className="text-sm bg-teton-red/30 rounded px-2 py-1">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : submitLabel}</button>
    </form>
  );
}
