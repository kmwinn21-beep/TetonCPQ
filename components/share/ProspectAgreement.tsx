'use client';

/**
 * "Request Agreement for Review" on the shared link. Desktop: a round button in the bottom-right corner (the Teton
 * mark) that grows to show its label on hover. Phones: a round button beside the Proposal / Resources switch; a tap
 * grows it over the switch (it shrinks back after 3 seconds), a second tap opens the form. A red dot shows until
 * they've sent a request. The form lets them confirm or correct the legal entity, the signatory and the pilot
 * communities (each optional) and add a note; the deal's owner is told.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import type { AgreementCommunity, AgreementPayload, AgreementRequestInfo } from '@/lib/data/agreements';
import type { Signatory } from '@/lib/data/dealDetails';

interface Info {
  entity: string;
  signatory: Signatory | null;
  pilot: boolean;
  communities: AgreementCommunity[];
  requestedAt: string | null;
  /** The deal's latest request, anyone's on the link. */
  latest: AgreementRequestInfo | null;
  /** The signed-in person's email. */
  me: string;
  ownerName: string;
  ownerEmail: string;
}

export interface AgreementState {
  info: Info | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  sent: AgreementPayload | null;
  submit: (body: unknown) => Promise<string | null>;
  resetSent: () => void;
}

export function useAgreement(token: string, team: boolean): AgreementState {
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<AgreementPayload | null>(null);
  useEffect(() => {
    if (team) return;
    let live = true;
    void fetch(`/api/share/${token}/agreement`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setInfo(j as Info))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [token, team]);
  const submit = useCallback(
    async (body: unknown) => {
      const r = await fetch(`/api/share/${token}/agreement`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as Info & { error?: string; payload?: AgreementPayload };
      if (!r.ok) return j.error ?? 'Couldn’t send. Try again.';
      setInfo((i) => ({ ...(i as Info), ...j }));
      setSent(j.payload ?? null);
      return null;
    },
    [token],
  );
  return { info, open, setOpen, sent, submit, resetSent: () => setSent(null) };
}

const LABEL = 'Request Agreement for Review';
const Mark = ({ className }: { className: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/TetonWhiteSymbol.png" alt="" className={`${className} object-contain flex-shrink-0`} />
);

/** Desktop: the corner button. */
export function AgreementFab({ a }: { a: AgreementState }) {
  if (!a.info) return null;
  const dot = !a.info.latest;
  return (
    <div className="no-print hidden sm:block fixed right-6 bottom-6 z-40 group" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <button
        type="button"
        onClick={() => a.setOpen(true)}
        aria-label={LABEL}
        className="flex items-center h-[54px] max-w-[54px] group-hover:max-w-[340px] group-focus-within:max-w-[340px] pl-[14px] pr-[14px] group-hover:pr-[22px] group-focus-within:pr-[22px] gap-0 group-hover:gap-[11px] group-focus-within:gap-[11px] rounded-full bg-teton-ink text-white text-[14px] font-semibold whitespace-nowrap overflow-hidden shadow-[0_10px_28px_rgba(28,36,48,.28),0_2px_6px_rgba(28,36,48,.18)] transition-[max-width,gap,padding] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
      >
        <Mark className="w-[26px] h-[26px]" />
        <span className="opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 transition duration-200 group-hover:delay-75 motion-reduce:transition-none">{LABEL}</span>
      </button>
      {dot && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#E5484D] border-[2.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,.25)] pointer-events-none" aria-label="New" />}
    </div>
  );
}

/**
 * Phones: the row under the header. `toggle` is the Proposal / Resources switch (or nothing). A tap widens the
 * button over the switch; with no second tap within 3 seconds it shrinks back.
 */
export function AgreementPhoneRow({ a, toggle }: { a: AgreementState; toggle: React.ReactNode }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!wide) return;
    const t = setTimeout(() => setWide(false), 3000);
    return () => clearTimeout(t);
  }, [wide]);
  if (!a.info) return toggle ? <div className="sm:hidden px-3 pb-2 pt-0.5">{toggle}</div> : null;
  const dot = !a.info.latest;
  return (
    <div className="no-print sm:hidden flex items-center px-3 pb-2 pt-0.5">
      {toggle && (
        <div className={`flex-1 min-w-0 overflow-hidden transition-[opacity,margin] duration-300 motion-reduce:transition-none ${wide ? 'opacity-0 mr-0' : 'opacity-100 mr-2'}`} {...((wide ? { inert: '' } : {}) as Record<string, string>)}>
          {toggle}
        </div>
      )}
      <div className={`relative flex-shrink-0 transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none ${toggle ? '' : 'ml-auto'} ${wide ? 'w-full' : 'w-[38px]'}`}>
        <button
          type="button"
          aria-label={LABEL}
          aria-expanded={wide}
          onClick={() => {
            if (wide) {
              setWide(false);
              a.setOpen(true);
            } else setWide(true);
          }}
          className={`w-full h-[38px] flex items-center rounded-full bg-teton-ink text-white text-[14px] font-semibold whitespace-nowrap overflow-hidden shadow-[0_4px_12px_rgba(28,36,48,.22)] transition-[gap,padding] duration-300 motion-reduce:transition-none ${wide ? 'gap-2.5 pl-3 pr-4' : 'gap-0 px-2'}`}
        >
          <Mark className="w-[22px] h-[22px]" />
          <span className={`min-w-0 truncate transition-opacity duration-200 ${wide ? 'opacity-100 delay-100' : 'opacity-0'}`}>{LABEL}</span>
          <span className={`ml-auto text-[18px] leading-none transition-opacity duration-200 ${wide ? 'opacity-100 delay-100' : 'opacity-0'}`} aria-hidden="true">
            ›
          </span>
        </button>
        {dot && <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#E5484D] border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,.25)] pointer-events-none transition-opacity duration-200 ${wide ? 'opacity-0' : 'opacity-100'}`} aria-label="New" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the form

type Mode = 'idle' | 'ok' | 'edit';
const input = 'w-full h-10 rounded-[10px] border border-[#D5D9DE] bg-white px-3 text-[14px] text-teton-ink outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15';
const blankInput = `${input} border-dashed bg-[#FFFCF7]`;
const lab = 'block text-[11.5px] font-semibold text-[#5A6270] mt-2 mb-1';
const eyebrow = 'text-[10px] font-extrabold uppercase tracking-[1.4px] text-[#8A919C]';
const sigName = (s: Signatory | null) => (s ? `${s.first} ${s.last}`.trim() : '');

function Actions({ mode, onOk, onEdit, onUndo, okLabel = '✓ Confirmed' }: { mode: Mode; onOk: () => void; onEdit: () => void; onUndo: () => void; okLabel?: string }) {
  if (mode === 'edit') return null;
  if (mode === 'ok')
    return (
      <span className="ml-auto flex-shrink-0 flex items-center gap-2.5 text-[12px] font-semibold [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
        <span className="text-[#256B41]">{okLabel}</span>
        <button type="button" className="text-[#1F5FB5] hover:underline" onClick={onUndo}>
          Undo
        </button>
      </span>
    );
  return (
    <span className="ml-auto flex-shrink-0 flex gap-1.5">
      <button type="button" onClick={onOk} title="Looks right" aria-label="Looks right" className="w-[38px] h-[34px] rounded-[10px] border border-[#D5D9DE] bg-white text-[16px] text-[#2E9A5B] grid place-items-center hover:bg-[#F5FBF7] hover:border-[#BFE3CC] transition-colors">
        ✓
      </button>
      <button type="button" onClick={onEdit} className="h-[34px] px-2.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[12.5px] font-semibold text-teton-ink hover:bg-teton-almost-white transition-colors">
        ✎ Edit
      </button>
    </span>
  );
}

const rowCls = (mode: Mode) =>
  `rounded-[14px] border px-3.5 py-3 mt-2.5 transition-[background-color,border-color,box-shadow] duration-200 ${mode === 'ok' ? 'border-[#BFE3CC] bg-[#F5FBF7]' : mode === 'edit' ? 'border-teton-ink shadow-[0_0_0_1px_#1C2430] bg-white' : 'border-[#E8E4DC] bg-white'}`;

export function AgreementDialog({ a }: { a: AgreementState }) {
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (a.open) {
      setShown(true);
      setClosing(false);
    } else if (shown) {
      setClosing(true);
      const t = setTimeout(() => (setShown(false), setClosing(false), a.resetSent()), 220);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.open]);
  useEffect(() => {
    if (!a.open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && a.setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [a]);
  if (!shown || !a.info) return null;
  return (
    <div className="no-print fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Request the agreement" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <button type="button" tabIndex={-1} aria-label="Close" className={`absolute inset-0 bg-[rgba(20,24,30,.45)] transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={() => a.setOpen(false)} />
      <div
        className={`relative w-full sm:w-[560px] max-h-[92dvh] sm:max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain bg-white rounded-t-[18px] sm:rounded-[18px] shadow-[0_24px_60px_rgba(0,0,0,.25)] transition-[transform,opacity] duration-200 ease-in motion-reduce:transition-none ${
          closing ? 'translate-y-full sm:translate-y-0 sm:scale-[.97] sm:opacity-0' : '[animation:sheetUp_.28s_cubic-bezier(.2,.8,.2,1)] sm:[animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]'
        }`}
      >
        <div className="sm:hidden w-[38px] h-1 rounded bg-[#D5D9DE] mx-auto mt-2" aria-hidden="true" />
        {a.sent ? <Sent a={a} p={a.sent} /> : <Form a={a} />}
      </div>
    </div>
  );
}

function Form({ a }: { a: AgreementState }) {
  const info = a.info!;
  const first = info.ownerName.split(/\s+/)[0] || 'We';
  // Someone already asked: the form says who and when, and sending becomes an update.
  const state: 'new' | 'sent' | 'me' | 'other' = !info.latest ? 'new' : info.latest.sentAt ? 'sent' : info.latest.email === info.me ? 'me' : 'other';
  const sig0 = info.signatory;
  // Entity: blank shows an input straight away.
  const [eMode, setEMode] = useState<Mode>('idle');
  const [entity, setEntity] = useState(info.entity);
  // Signatory: none shows the fields; a missing field (title, email) shows just that input.
  const [sMode, setSMode] = useState<Mode>('idle');
  const [sig, setSig] = useState<Signatory>(sig0 ?? { first: '', last: '', title: '', email: '' });
  const gaps = sig0 ? (['title', 'email'] as const).filter((k) => !sig0[k]) : [];
  const [cMode, setCMode] = useState<Mode>('idle');
  const [change, setChange] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  const entityDone = eMode === 'ok' || (eMode === 'edit' ? false : !info.entity && !!entity.trim());
  const sigChanged = JSON.stringify(sig) !== JSON.stringify(sig0 ?? { first: '', last: '', title: '', email: '' });
  const sigDone = sMode === 'ok' || (sMode !== 'edit' && (!sig0 ? !!(sig.first || sig.last) : gaps.length > 0 && sigChanged));
  const parts = info.communities.length ? 3 : 2;
  const done = [entityDone, sigDone, info.communities.length ? cMode === 'ok' : false].filter(Boolean).length;

  const send = async () => {
    setBusy(true);
    setErr(null);
    const body = {
      entity: eMode === 'ok' && entity !== info.entity ? { value: entity } : eMode === 'ok' ? { confirmed: true } : !info.entity && entity.trim() ? { value: entity } : {},
      signatory: (sMode === 'ok' || (sMode === 'idle' && (!sig0 || gaps.length > 0))) && sigChanged ? { value: sig } : sMode === 'ok' ? { confirmed: true } : {},
      communities: cMode === 'ok' ? { confirmed: true, change: change.trim() || null } : {},
      note,
    };
    const e = await a.submit(body);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <>
      <div className="relative px-4 sm:px-6 pt-5 sm:pt-[22px] pb-1.5">
        <button type="button" className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 w-8 h-8 rounded-[9px] border border-[#E3E6EA] bg-white text-[#5A6270] grid place-items-center hover:bg-teton-almost-white" aria-label="Close" onClick={() => a.setOpen(false)}>
          ✕
        </button>
        <p className="text-[10.5px] font-extrabold uppercase tracking-[2px] text-[#D9553F]">Next step</p>
        <h2 className="text-[21px] font-bold leading-tight text-teton-ink mt-1.5 mb-1.5 pr-10">{state === 'sent' ? 'The agreement is on its way' : state === 'me' ? 'Update your request' : 'Request the agreement'}</h2>
        <p className="text-[13.5px] leading-normal text-[#5A6270]">
          {state === 'sent'
            ? 'Need a change? Each one below is optional.'
            : state === 'me'
              ? `${first} has your request. Each change below is optional.`
              : state === 'other'
                ? 'Confirm the details below so the agreement is right the first time. Each one is optional.'
                : `${first} will prepare the ${info.pilot ? 'pilot ' : ''}agreement for your review. If you like, confirm the details below so it’s right the first time. Each one is optional.`}
        </p>
        {info.latest && <AlreadyAsked r={info.latest} state={state as 'sent' | 'me' | 'other'} owner={first} sentTo={info.signatory?.email ?? null} />}
        <div className="mt-3.5 flex items-center gap-2.5 text-[12px] font-semibold text-[#5A6270]">
          <div className="flex-1 h-1.5 rounded-full bg-[#EEF0F2] overflow-hidden">
            <div className="h-full rounded-full bg-[#2E9A5B] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(done / parts) * 100}%` }} />
          </div>
          {done} of {parts} confirmed
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-1 pb-1">
        {/* Legal entity */}
        <div className={rowCls(eMode)}>
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <p className={eyebrow}>Legal entity name</p>
              {info.entity ? <p className="text-[14.5px] font-semibold leading-snug text-teton-ink mt-0.5 break-words">{eMode === 'ok' ? entity : info.entity}</p> : <p className="text-[12.5px] text-[#5A6270] mt-0.5">The company that signs the agreement.</p>}
            </div>
            {info.entity && <Actions mode={eMode} onOk={() => setEMode('ok')} onEdit={() => (setEMode('edit'), setTimeout(() => firstField.current?.focus(), 50))} onUndo={() => (setEMode('idle'), setEntity(info.entity))} />}
          </div>
          {!info.entity && <input className={`${blankInput} mt-2.5`} placeholder="e.g. Forest Hills Senior Living, LLC" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Legal entity name" />}
          <Collapse open={eMode === 'edit'}>
            <div className="pt-1">
              <input ref={firstField} className={`${input} mt-2`} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Legal entity name" />
              <EditButtons onCancel={() => (setEMode('idle'), setEntity(info.entity))} onSave={() => setEMode('ok')} disabled={!entity.trim()} />
            </div>
          </Collapse>
        </div>

        {/* Signatory */}
        <div className={rowCls(sMode)}>
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <p className={eyebrow}>Signatory</p>
              {sig0 ? (
                <>
                  <p className="text-[14.5px] font-semibold leading-snug text-teton-ink mt-0.5">{sigName(sMode === 'ok' ? sig : sig0)}</p>
                  <p className="text-[12.5px] leading-normal text-[#5A6270] break-words">
                    {(sMode === 'ok' ? sig : sig0).title}
                    {(sMode === 'ok' ? sig : sig0).title && (sMode === 'ok' ? sig : sig0).email ? <br /> : null}
                    {(sMode === 'ok' ? sig : sig0).email}
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-[#5A6270] mt-0.5">Who signs for {info.entity || 'your company'}. We’ll send the agreement to this email.</p>
              )}
            </div>
            {sig0 && <Actions mode={sMode} onOk={() => setSMode('ok')} onEdit={() => setSMode('edit')} onUndo={() => (setSMode('idle'), setSig(sig0))} />}
          </div>
          {sig0 && sMode === 'idle' && gaps.length > 0 && (
            <div>
              {gaps.map((k) => (
                <div key={k}>
                  <label className="block"><span className={lab}>{k === 'title' ? 'Title' : 'Email'}</span>
                  <input className={blankInput} type={k === 'email' ? 'email' : 'text'} placeholder={k === 'title' ? 'e.g. VP of Operations' : 'name@company.com'} value={sig[k]} onChange={(e) => setSig({ ...sig, [k]: e.target.value })} /></label>
                </div>
              ))}
            </div>
          )}
          {!sig0 && <SigFields sig={sig} setSig={setSig} blank />}
          <Collapse open={sMode === 'edit'}>
            <div className="pt-0.5">
              <p className="text-[12.5px] text-[#5A6270] mt-1.5">Who signs for {info.entity || 'your company'}. We’ll send the agreement to this email.</p>
              <SigFields sig={sig} setSig={setSig} />
              <EditButtons onCancel={() => (setSMode('idle'), setSig(sig0 ?? sig))} onSave={() => setSMode('ok')} disabled={!(sig.first || sig.last)} />
            </div>
          </Collapse>
        </div>

        {/* Communities */}
        {info.communities.length > 0 && (
          <div className={rowCls(cMode === 'ok' && change.trim() ? 'ok' : cMode)}>
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <p className={eyebrow}>{info.pilot ? 'Pilot communities' : 'Communities'}</p>
                <p className="text-[14.5px] font-semibold leading-snug text-teton-ink mt-0.5">
                  {info.communities.length} {info.communities.length === 1 ? 'community' : 'communities'}
                  {info.communities.some((c) => c.beds) && ` · ${info.communities.reduce((s, c) => s + c.beds, 0).toLocaleString()} beds`}
                </p>
              </div>
              <Actions mode={cMode} okLabel={change.trim() ? '✎ Change noted' : '✓ Confirmed'} onOk={() => setCMode('ok')} onEdit={() => setCMode('edit')} onUndo={() => (setCMode('idle'), setChange(''))} />
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {info.communities.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-[10px] bg-[#FBF8F3] px-2.5 py-2">
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    <b className="font-semibold text-teton-ink">{c.name}</b> <span className="text-[12px] text-[#8A919C]">{[c.place, c.beds ? `${c.beds} beds` : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${c.hasPlan ? 'bg-teton-pale-green text-[#256B41]' : 'bg-teton-red/30 text-[#9A2E1C]'}`}>{c.hasPlan ? '✓ Floor plan' : 'Floor plans needed'}</span>
                </div>
              ))}
            </div>
            {cMode === 'ok' && change.trim() && <p className="mt-2 text-[12.5px] text-[#3A3F47]">Change: “{change.trim()}”</p>}
            <Collapse open={cMode === 'edit'}>
              <div className="pt-1">
                <label className="block"><span className={lab}>What should change?</span>
                <textarea className={`${input} h-auto min-h-[70px] py-2 resize-none`} placeholder="Add a community, take one out, change the beds…" value={change} onChange={(e) => setChange(e.target.value)} /></label>
                <EditButtons onCancel={() => (setCMode('idle'), setChange(''))} onSave={() => setCMode('ok')} disabled={!change.trim()} label="Save" />
              </div>
            </Collapse>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 pt-1.5">
        <label className="block text-[11.5px] font-semibold text-[#5A6270] mt-3 mb-1.5" htmlFor="ag-note">
          Anything else {first} should know? <span className="font-normal text-[#8A919C]">(optional)</span>
        </label>
        <textarea id="ag-note" className="w-full min-h-[64px] rounded-xl border border-[#D5D9DE] px-3 py-2.5 text-[14px] leading-snug text-teton-ink outline-none resize-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15" placeholder="Target start date, who else should review…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <p className="px-4 sm:px-6 mt-2 text-[12.5px] text-[#B23A26]">{err}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-4 sm:px-6 pt-3.5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-5 border-t border-[#F0EDE7] mt-3.5">
        <p className="flex-1 text-[12px] leading-snug text-[#8A919C]">Anything you skip, {first} will confirm with you before sending.</p>
        <button type="button" disabled={busy || eMode === 'edit' || sMode === 'edit' || cMode === 'edit'} onClick={() => void send()} className="h-11 px-5 rounded-[10px] bg-teton-ink text-white text-[14px] font-semibold disabled:opacity-50 transition-opacity">
          {busy ? 'Sending…' : state === 'sent' ? `Send changes to ${first}` : state === 'me' ? 'Send update' : state === 'other' ? 'Send an update' : 'Request agreement'}
        </button>
      </div>
    </>
  );
}

function SigFields({ sig, setSig, blank }: { sig: Signatory; setSig: (s: Signatory) => void; blank?: boolean }) {
  const c = blank ? blankInput : input;
  return (
    <div className="mt-1">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block"><span className={lab}>First name</span>
          <input className={c} value={sig.first} onChange={(e) => setSig({ ...sig, first: e.target.value })} autoComplete="given-name" /></label>
        </div>
        <div>
          <label className="block"><span className={lab}>Last name</span>
          <input className={c} value={sig.last} onChange={(e) => setSig({ ...sig, last: e.target.value })} autoComplete="family-name" /></label>
        </div>
      </div>
      <label className="block"><span className={lab}>Title</span>
      <input className={c} value={sig.title} onChange={(e) => setSig({ ...sig, title: e.target.value })} placeholder="e.g. VP of Operations" autoComplete="organization-title" /></label>
      <label className="block"><span className={lab}>Email</span>
      <input className={c} type="email" value={sig.email} onChange={(e) => setSig({ ...sig, email: e.target.value })} placeholder="name@company.com" autoComplete="email" /></label>
    </div>
  );
}

function EditButtons({ onCancel, onSave, disabled, label = 'Save & confirm' }: { onCancel: () => void; onSave: () => void; disabled?: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-1.5 mt-2.5 mb-0.5">
      <button type="button" className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold text-teton-ink hover:bg-teton-almost-white" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="h-9 px-3.5 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold disabled:opacity-50" onClick={onSave} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

function Sent({ a, p }: { a: AgreementState; p: AgreementPayload }) {
  const info = a.info!;
  const first = info.ownerName.split(/\s+/)[0] || 'We';
  const st = (s: string) => (s === 'confirmed' ? <em className="not-italic ml-auto font-semibold text-[12px] text-[#256B41]">✓ Confirmed</em> : s === 'updated' ? <em className="not-italic ml-auto font-semibold text-[12px] text-[#1F5FB5]">✎ Updated</em> : <em className="not-italic ml-auto font-semibold text-[12px] text-[#8A919C]">Not confirmed</em>);
  const rows: Array<[string, string]> = [
    ['Legal entity name', p.entity.status],
    ['Signatory', p.signatory.status],
    ...(p.communities.list.length ? ([[p.communities.pilot ? 'Pilot communities' : 'Communities', p.communities.status]] as Array<[string, string]>) : []),
  ];
  return (
    <div className="px-6 sm:px-7 pt-8 pb-[max(24px,env(safe-area-inset-bottom))] sm:pb-6 text-center [animation:fadeUp_.25s_ease-out] motion-reduce:[animation:none]">
      <div className="w-16 h-16 rounded-full bg-teton-pale-green text-[#2E9A5B] text-[30px] grid place-items-center mx-auto mb-3.5">✓</div>
      <h2 className="text-[21px] font-bold text-teton-ink">Request sent</h2>
      <p className="text-[13.5px] leading-normal text-[#5A6270] mt-1.5">{first} has your request and will send the agreement for your review.</p>
      <div className="mt-4 text-left rounded-xl border border-[#ECE8DF] px-3.5 py-1">
        {rows.map(([k, s], i) => (
          <div key={k} className={`flex gap-2.5 py-2.5 text-[13px] text-[#3A3F47] ${i ? 'border-t border-[#F3F0EA]' : ''}`}>
            {k}
            {st(s)}
          </div>
        ))}
      </div>
      {info.ownerEmail && (
        <p className="mt-4 text-[13px] text-[#5A6270]">
          Questions? Email {first} at{' '}
          <a className="font-semibold text-teton-ink hover:underline" href={`mailto:${info.ownerEmail}`}>
            {info.ownerEmail}
          </a>
        </p>
      )}
      <button type="button" className="mt-4 w-full h-11 rounded-[10px] bg-teton-ink text-white text-[14px] font-semibold" onClick={() => a.setOpen(false)}>
        Done
      </button>
    </div>
  );
}

const askedWhen = (at: string) => {
  const d = new Date(`${at.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const initialsOf = (who: string) => (who.includes('@') ? who.slice(0, 2) : who.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase();

/** Who already asked for the agreement, when, from which version, what they confirmed, and how far along it is. */
function AlreadyAsked({ r, state, owner, sentTo }: { r: AgreementRequestInfo; state: 'sent' | 'me' | 'other'; owner: string; sentTo: string | null }) {
  const tone = state === 'sent' ? 'border-[#BFE3CC] bg-[#F2FAF5]' : state === 'me' ? 'border-[#CFE0F8] bg-[#F1F7FE]' : 'border-[#F1D68A] bg-[#FFF8E6]';
  const who = r.who.includes('@') ? r.who : r.who;
  const firstName = who.includes('@') ? who : who.split(/\s+/)[0];
  const p = r.payload;
  const chip = (st: string, label: string) => {
    const cls = st === 'confirmed' ? 'bg-teton-pale-green text-[#256B41]' : st === 'updated' ? 'bg-[#E4EFFD] text-[#1F5FB5]' : 'bg-[#EEF0F2] text-[#5A6270]';
    const t = st === 'confirmed' ? `✓ ${label} confirmed` : st === 'updated' ? `✎ ${label} updated` : `${label} not confirmed`;
    return <span key={label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{t}</span>;
  };
  const step = state === 'sent' ? 3 : 2;
  const Step = ({ n, label }: { n: number; label: string }) => {
    const done = n < step || (n === 3 && step === 3);
    const now = n === step && step !== 3;
    return (
      <span className={`flex items-center gap-1.5 whitespace-nowrap ${done ? 'text-teton-ink' : now ? 'text-[#B7791F]' : 'text-[#8A919C]'}`}>
        <b className={`w-4 h-4 rounded-full grid place-items-center text-[9px] ${done ? 'bg-[#2E9A5B] text-white' : now ? 'bg-[#F5B53F] text-white' : 'bg-[#E3E6EA] text-[#5A6270]'}`}>{done ? '✓' : n}</b>
        {label}
      </span>
    );
  };
  return (
    <div className={`mt-3.5 rounded-[14px] border px-3.5 py-3 [animation:fadeUp_.25s_ease-out] motion-reduce:[animation:none] ${tone}`} role="status">
      <div className="flex items-start gap-2.5">
        <span className="relative w-[34px] h-[34px] flex-shrink-0 rounded-full bg-teton-ink text-white text-[12px] font-bold grid place-items-center" aria-hidden="true">
          {state === 'sent' ? initialsOf(owner) : initialsOf(who)}
          <span className={`absolute -right-1 -bottom-1 w-[18px] h-[18px] rounded-full border-2 border-white text-[9px] grid place-items-center ${state === 'sent' ? 'bg-[#2E9A5B]' : 'bg-[#D9553F]'}`}>{state === 'sent' ? '✓' : '✍'}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-snug text-teton-ink">{state === 'sent' ? `${owner} sent the agreement for review` : state === 'me' ? 'You requested the agreement' : `${who} already requested the agreement`}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-[#5A6270]">
            {state === 'sent'
              ? `${r.sentAt ? askedWhen(r.sentAt) : ''}${sentTo ? ` · to ${sentTo}` : ''} · requested by ${who} on ${askedWhen(r.createdAt).replace(/,? \d.*$/, '')}`
              : `${askedWhen(r.createdAt)}${r.versionNo ? ` · from proposal v${r.versionNo}` : ''}`}
          </p>
          {state !== 'sent' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chip(p.entity.status, 'Entity')}
              {chip(p.signatory.status, 'Signatory')}
              {p.communities.list.length > 0 && chip(p.communities.status, 'Communities')}
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-semibold">
            <Step n={1} label="Requested" />
            <span className="flex-1 min-w-3 border-t-[1.5px] border-dashed border-[#D5D9DE]" aria-hidden="true" />
            <Step n={2} label={`${owner} preparing`} />
            <span className="flex-1 min-w-3 border-t-[1.5px] border-dashed border-[#D5D9DE]" aria-hidden="true" />
            <Step n={3} label="Sent for review" />
          </div>
          <p className="mt-2.5 border-t border-black/[.06] pt-2 text-[12.5px] leading-snug text-[#3A3F47]">
            {state === 'sent'
              ? `Check your inbox for the agreement. Something to change? Send it below and ${owner} will revise it.`
              : state === 'me'
                ? `${owner} is preparing it. Change anything below and send it as an update.`
                : `The details below include ${firstName}’s changes. You don’t need to send another request; if something’s still wrong, fix it here and ${owner} gets your update too.`}
          </p>
        </div>
      </div>
    </div>
  );
}
