'use client';

/**
 * The prospect's way into a shared proposal: their email (one the rep listed), and the 6-digit code when the rep
 * turned that on. And the page shown when a link is turned off, expired or doesn't exist.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen min-h-dvh bg-[#FBF8F3] flex items-center justify-center px-4 py-10" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="w-full max-w-[420px] rounded-[18px] border border-[#ECE7DF] bg-white px-6 sm:px-8 pt-7 pb-6 shadow-[0_10px_30px_rgba(0,0,0,.06)] [animation:fadeUp_.3s_ease-out] motion-reduce:[animation:none]">
        <p className="flex items-center gap-2 text-[20px] font-bold text-teton-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/teton-logo.png" alt="" className="w-[26px] h-[26px] object-contain" />
          Teton
        </p>
        {children}
      </div>
    </main>
  );
}

export function ProspectGate({ token, dealName, ownerName, ownerEmail, needsCode }: { token: string; dealName: string; ownerName: string; ownerEmail: string; needsCode: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/share/${token}/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name, code }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setBusy(false);
      setError(j.error ?? 'Something went wrong. Try again.');
      return;
    }
    router.refresh();
  };
  const input = 'w-full h-11 rounded-[11px] border border-[#D5D9DE] px-3.5 text-[14px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15';
  return (
    <Card>
      <p className="mt-6 text-[10.5px] font-extrabold uppercase tracking-[2.5px] text-[#D9553F]">Proposal</p>
      <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-.3px] text-teton-ink">{dealName}</h1>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#5A6270]">
        {ownerName} shared this proposal with you. Enter your email{needsCode ? ' and the code they gave you' : ''} to open it.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3.5">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-teton-ink">Your work email</span>
          <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        {needsCode && (
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-teton-ink">6-digit code</span>
            <input className={`${input} tracking-[6px] text-[18px] font-semibold`} inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-teton-ink">
            Your name <span className="font-normal text-teton-ui-gray">(optional, shown on your comments)</span>
          </span>
          <input className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
        </label>
        {error && (
          <p role="alert" className="rounded-[9px] bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C] [animation:fadeIn_.2s_ease-out]">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full h-11 rounded-[11px] bg-teton-ink text-white text-[14px] font-semibold hover:bg-black disabled:opacity-60">
          {busy ? 'Checking…' : 'Open the proposal'}
        </button>
      </form>
      <p className="mt-5 pt-4 border-t border-[#F1EEE7] flex items-center gap-2.5 text-[12.5px] text-[#5A6270]">
        <span className="w-[30px] h-[30px] rounded-full bg-teton-ink text-white grid place-items-center text-[11px] font-bold">{ownerName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0 truncate">
          {ownerName} · Teton{ownerEmail ? ` · ${ownerEmail}` : ''}
        </span>
      </p>
    </Card>
  );
}

export function ProspectClosed({ reason, ownerName, ownerEmail, expiresOn }: { reason: 'missing' | 'revoked' | 'expired'; ownerName: string; ownerEmail: string; expiresOn?: string }) {
  const title = reason === 'expired' ? 'This link has expired' : reason === 'revoked' ? 'This link has been turned off' : 'This link doesn’t work';
  const why = reason === 'expired' && expiresOn ? `It was open until ${longDay(expiresOn)}.` : reason === 'revoked' ? 'The person who shared it turned it off.' : 'Check that you copied the whole link.';
  return (
    <Card>
      <h1 className="mt-6 text-[22px] font-semibold leading-tight text-teton-ink">{title}</h1>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#5A6270]">
        {why} {ownerName ? <>Ask {ownerName}{ownerEmail ? <> (<a className="text-[#1F5FB5] underline" href={`mailto:${ownerEmail}`}>{ownerEmail}</a>)</> : ''} for a new link.</> : null}
      </p>
    </Card>
  );
}
