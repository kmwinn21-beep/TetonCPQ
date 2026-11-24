'use client';

/**
 * Share a proposal with a prospect: the emails that may open it (and, optionally, a 6-digit code as well), whether
 * they may comment and download a PDF, when the link expires (30 days by default), and which saved version it shows.
 * Then the link to copy, who has opened it, and a way to turn it off.
 */
import { useEffect, useState } from 'react';
import type { ShareLink } from '@/lib/data/shareLinks';

const DAY = 86400000;
const isoDay = (plus = 0) => new Date(Date.now() + plus * DAY).toISOString().slice(0, 10);
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const when = (iso: string | null) => {
  if (!iso) return '';
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return m < 1 ? 'just now' : `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareButton({ quoteId, versionId, versionNo, className }: { quoteId: number; versionId: number; versionNo: number; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" title="Share a link to this proposal with your prospect">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M9 7h8v8" /></svg>
        Share
      </button>
      {open && <ShareDialog quoteId={quoteId} versionId={versionId} versionNo={versionNo} onClose={() => setOpen(false)} />}
    </>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-[34px] h-5 flex-shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? 'bg-[#3F8CEA]' : 'bg-[#D5D9DE]'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[14px]' : ''}`} />
    </button>
  );
}

function ShareDialog({ quoteId, versionId, versionNo, onClose }: { quoteId: number; versionId: number; versionNo: number; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [allowPdf, setAllowPdf] = useState(true);
  const [expiresOn, setExpiresOn] = useState(isoDay(30));
  const [requireCode, setRequireCode] = useState(false);
  const [useThisVersion, setUseThisVersion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  const fill = (l: ShareLink | null) => {
    setLink(l);
    if (!l) return;
    setEmails(l.people.map((x) => x.email));
    setAllowComments(l.allowComments);
    setAllowPdf(l.allowPdf);
    setExpiresOn(l.expiresOn);
    setRequireCode(!!l.accessCode);
    setUseThisVersion(false);
  };
  useEffect(() => {
    void fetch(`/api/quotes/${quoteId}/share`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { link: ShareLink | null; canEdit?: boolean }) => {
        fill(j.link);
        setCanEdit(j.canEdit !== false);
        setLoaded(true);
      });
  }, [quoteId]);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typed emails become chips on Enter, comma, space or leaving the field.
  const addDraft = () => {
    const parts = draft.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return true;
    const bad = parts.find((x) => !EMAIL.test(x));
    if (bad) {
      setError(`“${bad}” isn’t an email address`);
      return false;
    }
    setError(null);
    setEmails((list) => [...new Set([...list, ...parts])]);
    setDraft('');
    return true;
  };
  const save = async (extra: { newCode?: boolean } = {}) => {
    if (!addDraft()) return;
    const list = [...new Set([...emails, ...draft.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)])];
    if (!list.length) return setError('Add at least one email');
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/quotes/${quoteId}/share`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionId: !link || useThisVersion ? versionId : link.versionId, emails: list, allowComments, allowPdf, expiresOn, requireCode, ...extra }),
    });
    const j = (await r.json().catch(() => ({}))) as { link?: ShareLink; error?: string };
    setBusy(false);
    if (!r.ok || !j.link) return setError(j.error ?? 'Couldn’t save. Try again.');
    fill(j.link);
  };
  const turnOff = async () => {
    if (!window.confirm('Turn this link off? It stops opening for everyone. Their comments stay with the deal.')) return;
    setBusy(true);
    await fetch(`/api/quotes/${quoteId}/share`, { method: 'DELETE' });
    setBusy(false);
    fill(null);
    setEmails([]);
    setExpiresOn(isoDay(30));
    setRequireCode(false);
  };
  const url = link ? `${typeof window === 'undefined' ? '' : window.location.origin}/p/${link.token}` : '';
  const copy = async (what: 'link' | 'code', text: string) => {
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
  };
  const changed =
    !link ||
    useThisVersion ||
    link.allowComments !== allowComments ||
    link.allowPdf !== allowPdf ||
    link.expiresOn !== expiresOn ||
    !!link.accessCode !== requireCode ||
    draft.trim() !== '' ||
    link.people.map((x) => x.email).join() !== emails.join();
  const daysLeft = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${isoDay()}T00:00:00Z`)) / DAY);
  const row = 'flex items-center justify-between gap-3 py-2.5 border-t border-teton-off-white text-[13px]';
  const btn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold text-teton-ink hover:bg-teton-almost-white disabled:opacity-50 whitespace-nowrap';
  const dark = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50 whitespace-nowrap';

  return (
    <div className="no-print fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Share this proposal" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className={`absolute inset-0 bg-black/45 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={close} />
      <div
        className={`relative w-full sm:w-[560px] max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white text-teton-ink shadow-[0_24px_60px_rgba(0,0,0,.3)] transition-[opacity,transform] duration-200 motion-reduce:transition-none ${closing ? 'opacity-0 translate-y-3' : 'max-sm:[animation:sheetUp_.25s_ease-out] sm:[animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]'}`}
      >
        <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-3.5 border-b border-teton-off-white">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold">Share this proposal</h2>
            <p className="mt-0.5 text-[12.5px] text-teton-ui-gray">
              {link ? `The link shows v${link.versionNo}` : `A link to v${versionNo}`} · only the people you list can open it
            </p>
          </div>
          <button type="button" className="ml-auto w-8 h-8 flex-shrink-0 rounded-lg border border-teton-pale-gray text-teton-ui-gray hover:bg-teton-almost-white text-xs" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {!loaded ? (
          <p className="px-6 py-10 text-center text-sm text-teton-ui-gray">Loading…</p>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pt-4 pb-2">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray">Who can open it</p>
            <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-[10px] border border-[#D5D9DE] px-2 py-1.5 focus-within:border-[#3F8CEA] focus-within:ring-[3px] focus-within:ring-[#3F8CEA]/15">
              {emails.map((e) => (
                <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF5FE] py-1 pl-2.5 pr-1 text-[12.5px] font-medium text-[#1F4F96] [animation:fadeIn_.15s_ease-out]">
                  {e}
                  {canEdit && (
                    <button type="button" className="w-4 h-4 rounded-full bg-[#1F4F96]/10 grid place-items-center text-[10px] hover:bg-[#1F4F96]/20" onClick={() => setEmails((l) => l.filter((x) => x !== e))} aria-label={`Remove ${e}`}>
                      ✕
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <input
                  className="flex-1 min-w-[180px] h-7 px-1 text-[13px] outline-none bg-transparent"
                  placeholder={emails.length ? 'Add another email…' : 'name@company.com'}
                  value={draft}
                  aria-label="Add an email"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault();
                      addDraft();
                    } else if (e.key === 'Backspace' && !draft && emails.length) setEmails((l) => l.slice(0, -1));
                  }}
                  onBlur={() => draft && addDraft()}
                />
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-teton-ui-gray">They enter their email to open it; it has to be one of these{requireCode ? ', and they enter the code below too' : ''}.</p>

            <div className="mt-3">
              <div className={row}>
                <span>
                  Also require a 6-digit code
                  <small className="block text-[11.5px] text-teton-ui-gray">Extra security: you send them the code yourself</small>
                </span>
                <Toggle on={requireCode} onChange={setRequireCode} label="Require a 6-digit code" />
              </div>
              {requireCode && link?.accessCode && (
                <div className="flex items-center gap-2 pb-2.5 [animation:fadeIn_.2s_ease-out]">
                  <span className="h-9 px-3 rounded-[10px] bg-teton-almost-white border border-teton-off-white grid place-items-center text-[17px] font-bold tracking-[5px] tabular-nums">{link.accessCode}</span>
                  <button type="button" className={btn} onClick={() => void copy('code', link.accessCode!)}>
                    {copied === 'code' ? 'Copied' : 'Copy code'}
                  </button>
                  <button type="button" className={btn} disabled={busy || !canEdit} onClick={() => window.confirm('Make a new code? The old one stops working, and anyone using it has to enter the new one.') && void save({ newCode: true })}>
                    New code
                  </button>
                </div>
              )}
              {requireCode && !link?.accessCode && <p className="pb-2.5 text-[11.5px] text-teton-ui-gray">A code is made when you save.</p>}
              <div className={row}>
                <span>
                  Allow comments
                  <small className="block text-[11.5px] text-teton-ui-gray">On a page, a section, or the whole proposal; you’re notified</small>
                </span>
                <Toggle on={allowComments} onChange={setAllowComments} label="Allow comments" />
              </div>
              <div className={row}>
                <span>Allow PDF download</span>
                <Toggle on={allowPdf} onChange={setAllowPdf} label="Allow PDF download" />
              </div>
              <div className={row}>
                <span>
                  Link expires
                  <small className="block text-[11.5px] text-teton-ui-gray">{daysLeft < 0 ? 'That date has passed' : daysLeft === 0 ? 'Last day: today' : `${longDay(expiresOn)} · in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</small>
                </span>
                <input type="date" className="h-9 rounded-[9px] border border-[#D5D9DE] px-2.5 text-[13px] font-medium" value={expiresOn} min={isoDay()} max={isoDay(365)} onChange={(e) => e.target.value && setExpiresOn(e.target.value)} aria-label="Expiry date" disabled={!canEdit} />
              </div>
              {link && link.versionId !== versionId && (
                <div className={row}>
                  <span>
                    Shows v{link.versionNo}
                    <small className="block text-[11.5px] text-teton-ui-gray">You’re viewing v{versionNo}. Switch the link to it?</small>
                  </span>
                  <Toggle on={useThisVersion} onChange={setUseThisVersion} label={`Show v${versionNo} instead`} />
                </div>
              )}
            </div>

            {link && (
              <>
                <p className="mt-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray">Link</p>
                <div className="flex gap-2">
                  <span className="flex-1 min-w-0 h-9 rounded-[10px] border border-[#D5D9DE] bg-teton-almost-white px-3 flex items-center text-[12.5px] text-teton-dark-gray truncate" title={url}>
                    {url.replace(/^https?:\/\//, '')}
                  </span>
                  <button type="button" className={dark} onClick={() => void copy('link', url)}>
                    {copied === 'link' ? 'Copied ✓' : 'Copy link'}
                  </button>
                </div>
                <p className="mt-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray">Activity</p>
                <ul className="rounded-[10px] border border-teton-off-white text-[12px] divide-y divide-teton-off-white">
                  {link.people.map((x) => (
                    <li key={x.email} className="flex items-center gap-2.5 px-3 py-2">
                      <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${x.firstOpenedAt ? 'bg-[#2E9E64]' : 'bg-[#C8CDD3]'}`} />
                      <b className="font-semibold truncate">{x.email}</b>
                      <span className="text-teton-ui-gray whitespace-nowrap">{x.firstOpenedAt ? `opened it · ${x.views} view${x.views === 1 ? '' : 's'}` : 'hasn’t opened it yet'}</span>
                      <span className="ml-auto text-teton-ui-gray whitespace-nowrap">{when(x.lastOpenedAt) || '—'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-[9px] bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">
                {error}
              </p>
            )}
            <div className="h-3" />
          </div>
        )}
        {loaded && (
          <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-3.5 border-t border-teton-off-white bg-[#FAFAFB] rounded-b-2xl pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {link && canEdit && (
              <button type="button" className={`${btn} !text-[#C2412D] !border-[#F3D3CC] mr-auto`} disabled={busy} onClick={() => void turnOff()}>
                Turn off link
              </button>
            )}
            <span className="flex-1" />
            {canEdit && (!link || changed) && (
              <button type="button" className={dark} disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : link ? 'Save changes' : 'Create link'}
              </button>
            )}
            {link && !changed && (
              <button type="button" className={dark} onClick={close}>
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
