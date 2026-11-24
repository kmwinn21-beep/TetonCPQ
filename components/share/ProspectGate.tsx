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

export function ProspectGate({ token, dealName, ownerName, needsCode }: { token: string; dealName: string; ownerName: string; ownerEmail?: string; /** The link verifies emails: a 6-digit code is emailed to them. */ needsCode: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/share/${token}/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; needCode?: boolean };
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? 'Something went wrong. Try again.');
      return null;
    }
    return j;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const j = await post(step === 'code' ? { email, name, code } : { email, name });
    if (!j) return;
    if (j.needCode) {
      setStep('code');
      setInfo(null);
      return;
    }
    setBusy(true);
    router.refresh();
  };
  const resend = async () => {
    setCode('');
    if (await post({ email, name, resend: true })) setInfo('We sent a new code.');
  };
  const input = 'w-full h-11 rounded-[11px] border border-[#D5D9DE] px-3.5 text-[14px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15';
  return (
    <Card>
      <p className="mt-6 text-[10.5px] font-extrabold uppercase tracking-[2.5px] text-[#D9553F]">{step === 'code' ? 'Check your email' : 'Proposal'}</p>
      <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-.3px] text-teton-ink">{step === 'code' ? 'Enter the 6-digit code' : dealName}</h1>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#5A6270]">
        {step === 'code' ? (
          <>
            We sent a code to <b className="text-teton-ink">{email.trim().toLowerCase()}</b>. It works for 10 minutes.
          </>
        ) : (
          <>
            {ownerName} shared this proposal with you. Enter your email to open it{needsCode ? '; we’ll email you a code to confirm it’s you' : ''}.
          </>
        )}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {step === 'email' ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-teton-ink">Your work email</span>
              <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-teton-ink">
                Your name <span className="font-normal text-teton-ui-gray">(optional, shown on your comments)</span>
              </span>
              <input className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
            </label>
          </>
        ) : (
          <label className="block [animation:fadeIn_.2s_ease-out]">
            <span className="mb-1.5 block text-[12px] font-semibold text-teton-ink">Code</span>
            <input className={`${input} tracking-[8px] text-[20px] font-semibold text-center`} inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" aria-label="6-digit code" />
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-[9px] bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C] [animation:fadeIn_.2s_ease-out]">
            {error}
          </p>
        )}
        {info && !error && <p className="text-[12.5px] text-[#256B41]">{info}</p>}
        <button type="submit" disabled={busy} className="w-full h-11 rounded-[11px] bg-teton-ink text-white text-[14px] font-semibold hover:bg-black disabled:opacity-60">
          {busy ? (step === 'code' ? 'Checking…' : needsCode ? 'Sending a code…' : 'Checking…') : step === 'code' ? 'Open the proposal' : needsCode ? 'Continue' : 'Open the proposal'}
        </button>
        {step === 'code' && (
          <p className="text-center text-[12px] text-teton-ui-gray">
            Didn’t get it?{' '}
            <button type="button" className="font-semibold text-[#1F5FB5] hover:underline" disabled={busy} onClick={() => void resend()}>
              Send a new code
            </button>{' '}
            ·{' '}
            <button type="button" className="font-semibold text-[#1F5FB5] hover:underline" onClick={() => (setStep('email'), setCode(''), setError(null), setInfo(null))}>
              Use a different email
            </button>
          </p>
        )}
      </form>
      <p className="mt-5 pt-4 border-t border-[#F1EEE7] flex items-center gap-2.5 text-[12.5px] text-[#5A6270]">
        <span className="text-[11px] font-semibold uppercase tracking-[.6px] text-teton-ui-gray">Sent by:</span>
        <span className="w-[30px] h-[30px] flex-shrink-0 rounded-full bg-teton-ink text-white grid place-items-center text-[11px] font-bold">{ownerName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0 truncate">{ownerName} · Teton</span>
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
