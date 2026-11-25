'use client';

/**
 * Share a proposal with prospects: who may open it (each with a first name for the email), whether they verify their
 * email with a 6-digit code, whether they may comment and download a PDF, and when the link expires (30 days by
 * default). Then the email they get: the proposal's name, the opening line ("Hey {first name} - …") and a note, sent
 * from here. The link to copy, who was emailed and who opened it, and a way to turn it off.
 */
import { useEffect, useMemo, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import { EmailPreview, type EmailPart } from './EmailPreview';
import { ResourcesSection } from '@/components/resources/ResourcesSection';
import { ResourcesEditor } from '@/components/resources/ResourcesEditor';
import type { ShareLink } from '@/lib/data/shareLinks';

const DEFAULT_INTRO = 'Hey {first name} - here is your proposal from Teton!';
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
/** "Dana" from "dana.lee@…" (a suggestion, editable). */
const guessFirst = (email: string) => {
  const p = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  return p.length > 1 && /^[a-z]{2,}$/i.test(p[0]) ? p[0][0].toUpperCase() + p[0].slice(1).toLowerCase() : '';
};
interface Person {
  email: string;
  name: string;
}

export function ShareButton({ quoteId, versionId, versionNo, className }: { quoteId: number; versionId: number; versionNo: number; className: string }) {
  const [open, setOpen] = useState(false);
  // Arriving from the deal page's "Deal Room" button (?resources=1): straight into the deal room editor.
  const [room, setRoom] = useState<string | null | false>(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('resources') !== '1') return;
    void fetch(`/api/quotes/${quoteId}/share`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { link?: { token: string } | null } | null) => setRoom(j?.link ? `${window.location.origin}/p/${j.link.token}` : null));
  }, [quoteId]);
  const closeRoom = () => {
    setRoom(false);
    const u = new URL(window.location.href);
    u.searchParams.delete('resources');
    window.history.replaceState(null, '', u.toString());
  };
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Share" title="Share a link to this proposal with your prospect">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M9 7h8v8" /></svg>
        <span data-hide-at="2">Share</span>
      </button>
      {open && <ShareDialog quoteId={quoteId} versionId={versionId} versionNo={versionNo} onClose={() => setOpen(false)} />}
      {room !== false && <ResourcesEditor quoteId={quoteId} versionId={versionId} linkUrl={room} onClose={closeRoom} />}
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
  const [dealName, setDealName] = useState('');
  const [link, setLink] = useState<ShareLink | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [allowPdf, setAllowPdf] = useState(true);
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [expiresOn, setExpiresOn] = useState(isoDay(30));
  const [useThisVersion, setUseThisVersion] = useState(false);
  const [proposalName, setProposalName] = useState('');
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [note, setNote] = useState('');
  const [emailOpen, setEmailOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The email preview: beside the form on wide screens, a second tab on narrower ones.
  const [me, setMe] = useState({ name: '', email: '' });
  const [from, setFrom] = useState('tetonproposals@useparlay.app');
  const [preparedOn, setPreparedOn] = useState<string | null>(null);
  const [focus, setFocus] = useState<EmailPart | null>(null);
  const [tab, setTab] = useState<'form' | 'preview'>('form');

  const fill = (l: ShareLink | null, deal = dealName) => {
    setLink(l);
    if (!l) {
      setProposalName(`${deal} proposal`.trim());
      return;
    }
    setPeople(l.people.map((x) => ({ email: x.email, name: x.name ?? '' })));
    setAllowComments(l.allowComments);
    setAllowPdf(l.allowPdf);
    setVerifyEmail(l.verifyEmail);
    setExpiresOn(l.expiresOn);
    setUseThisVersion(false);
    setProposalName(l.proposalName ?? `${deal} proposal`.trim());
    setIntro(l.intro ?? DEFAULT_INTRO);
    setNote(l.note ?? '');
    setEmailOpen(l.people.some((x) => !x.emailedAt));
  };
  useEffect(() => {
    void fetch(`/api/quotes/${quoteId}/share?version=${versionId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { link: ShareLink | null; canEdit?: boolean; dealName?: string; me?: { name: string; email: string }; from?: string; preparedOn?: string | null }) => {
        setDealName(j.dealName ?? '');
        if (j.me) setMe(j.me);
        if (j.from) setFrom(j.from);
        setPreparedOn(j.preparedOn ?? null);
        fill(j.link, j.dealName ?? '');
        setCanEdit(j.canEdit !== false);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Typed emails (or "Name <email>") become people on Enter, comma or leaving the field.
  const parseDraft = (): Person[] | null => {
    const parts = draft.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const out: Person[] = [];
    for (const t of parts) {
      const m = t.match(/^(.*)<([^>]+)>$/);
      const email = (m ? m[2] : t).trim().toLowerCase();
      if (!EMAIL.test(email)) {
        setError(`“${email}” isn’t an email address`);
        return null;
      }
      const full = m ? m[1].replace(/"/g, '').trim() : '';
      out.push({ email, name: full ? full.split(/\s+/)[0] : guessFirst(email) });
    }
    return out;
  };
  const addDraft = () => {
    const add = parseDraft();
    if (!add) return false;
    setError(null);
    setPeople((list) => [...list, ...add.filter((p) => !list.some((x) => x.email === p.email))]);
    setDraft('');
    return true;
  };
  const allPeople = (): Person[] | null => {
    const add = parseDraft();
    if (!add) return null;
    return [...people, ...add.filter((p) => !people.some((x) => x.email === p.email))];
  };
  const save = async (): Promise<ShareLink | null> => {
    const list = allPeople();
    if (!list) return null;
    setDraft('');
    setPeople(list);
    if (!list.length) {
      setError('Add at least one email');
      return null;
    }
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/quotes/${quoteId}/share`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versionId: !link || useThisVersion ? versionId : link.versionId,
        emails: list.map((p) => ({ email: p.email, name: p.name.trim() || null })),
        allowComments,
        allowPdf,
        verifyEmail,
        expiresOn,
        proposalName,
        intro: intro.trim() === DEFAULT_INTRO ? null : intro,
        note,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { link?: ShareLink; error?: string };
    setBusy(false);
    if (!r.ok || !j.link) {
      setError(j.error ?? 'Couldn’t save. Try again.');
      return null;
    }
    fill(j.link);
    return j.link;
  };
  const send = async (only?: string[]) => {
    const l = changed ? await save() : link;
    if (!l) return;
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/quotes/${quoteId}/share/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(only ? { emails: only } : {}) });
    const j = (await r.json().catch(() => ({}))) as { sent?: string[]; link?: ShareLink; error?: string };
    setBusy(false);
    if (!r.ok) return setError(j.error ?? 'Couldn’t send. Try again.');
    if (j.link) fill(j.link);
    setNotice(j.sent?.length ? `Emailed ${j.sent.length === 1 ? j.sent[0] : `${j.sent.length} people`}` : 'Everyone has the email already');
    setTimeout(() => setNotice(null), 3000);
  };
  const turnOff = async () => {
    if (!window.confirm('Turn this link off? It stops opening for everyone. Their comments stay with the deal.')) return;
    setBusy(true);
    await fetch(`/api/quotes/${quoteId}/share`, { method: 'DELETE' });
    setBusy(false);
    fill(null);
    setPeople([]);
    setExpiresOn(isoDay(30));
    setVerifyEmail(false);
  };
  const url = link ? `${typeof window === 'undefined' ? '' : window.location.origin}/p/${link.token}` : '';
  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const changed =
    !link ||
    useThisVersion ||
    link.allowComments !== allowComments ||
    link.allowPdf !== allowPdf ||
    link.verifyEmail !== verifyEmail ||
    link.expiresOn !== expiresOn ||
    (link.proposalName ?? `${dealName} proposal`.trim()) !== proposalName ||
    (link.intro ?? DEFAULT_INTRO) !== intro ||
    (link.note ?? '') !== note ||
    draft.trim() !== '' ||
    JSON.stringify(link.people.map((x) => [x.email, x.name ?? ''])) !== JSON.stringify(people.map((x) => [x.email, x.name]));
  const notEmailed = link ? people.filter((p) => !link.people.find((x) => x.email === p.email)?.emailedAt).length : people.length;
  const daysLeft = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${isoDay()}T00:00:00Z`)) / DAY);
  const row = 'flex items-center justify-between gap-3 py-2.5 border-t border-teton-off-white text-[13px]';
  const btn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold text-teton-ink hover:bg-teton-almost-white disabled:opacity-50 whitespace-nowrap';
  const dark = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50 whitespace-nowrap';
  const label = 'mb-1.5 text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray';
  const field = 'w-full rounded-[10px] border border-[#D5D9DE] px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15 disabled:bg-teton-almost-white';
  const firstOf = (p: Person) => p.name.trim().split(/\s+/)[0] || 'there';
  const previewEmail = useMemo(
    () => ({ url: url || `${typeof window === 'undefined' ? '' : window.location.origin}/p/…`, proposalName: proposalName.trim() || `${dealName} proposal`.trim(), intro, note, preparedOn, allowComments, allowPdf, verify: verifyEmail, expiresOn }),
    [url, proposalName, dealName, intro, note, preparedOn, allowComments, allowPdf, verifyEmail, expiresOn],
  );
  const preview = <EmailPreview people={people} repName={me.name} replyTo={me.email} from={from} focus={focus} email={previewEmail} />;
  const focusOn = (part: EmailPart) => ({ onFocus: () => setFocus(part), onBlur: () => setFocus((f) => (f === part ? null : f)) });

  return (
    <div className="no-print fixed inset-0 z-[90] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Share this proposal" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className={`absolute inset-0 bg-black/45 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={close} />
      <div
        className={`relative w-full sm:w-[600px] min-[1180px]:w-[1140px] max-h-[92dvh] min-[1180px]:h-[88dvh] flex rounded-t-2xl sm:rounded-2xl bg-white text-teton-ink shadow-[0_24px_60px_rgba(0,0,0,.3)] transition-[opacity,transform] duration-200 motion-reduce:transition-none ${closing ? 'opacity-0 translate-y-3' : 'max-sm:[animation:sheetUp_.25s_ease-out] sm:[animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]'}`}
      >
        <div className="flex flex-col min-w-0 flex-1 min-[1180px]:flex-none min-[1180px]:w-[600px]">
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
        {loaded && (
          <div className="min-[1180px]:hidden px-5 sm:px-6 pt-3">
            <SegGroup className="relative flex rounded-[10px] bg-teton-almost-white p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Settings or email preview">
              {(['form', 'preview'] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tab === t} onClick={() => setTab(t)} className={`relative z-[1] flex-1 h-8 rounded-[8px] text-[12.5px] font-semibold transition-colors duration-200 ${tab === t ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
                  {t === 'form' ? 'Settings' : 'Email preview'}
                </button>
              ))}
            </SegGroup>
          </div>
        )}
        {!loaded ? (
          <p className="px-6 py-10 text-center text-sm text-teton-ui-gray">Loading…</p>
        ) : tab === 'preview' ? (
          <div className="min-[1180px]:hidden flex-1 min-h-[60dvh] flex flex-col [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">{preview}</div>
        ) : null}
        {loaded && (
          <div className={`flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pt-4 pb-2 ${tab === 'preview' ? 'hidden min-[1180px]:block' : ''}`}>
            <p className={label}>Who can open it</p>
            {people.length > 0 && (
              <ul className="mb-2 rounded-[10px] border border-teton-off-white divide-y divide-teton-off-white">
                {people.map((p, i) => {
                  const lp = link?.people.find((x) => x.email === p.email);
                  return (
                    <li key={p.email} className="flex items-center gap-2 px-2.5 py-1.5 [animation:fadeIn_.15s_ease-out]">
                      <input
                        className="w-[110px] h-8 rounded-lg border border-transparent hover:border-[#D5D9DE] focus:border-[#3F8CEA] px-2 text-[13px] font-semibold outline-none"
                        value={p.name}
                        placeholder="First name"
                        aria-label={`First name for ${p.email}`}
                        disabled={!canEdit}
                        onChange={(e) => setPeople((list) => list.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                      />
                      <span className="flex-1 min-w-0 truncate text-[12.5px] text-teton-dark-gray">{p.email}</span>
                      <span className="hidden sm:inline text-[11px] text-teton-ui-gray whitespace-nowrap">{lp?.emailedAt ? `Emailed ${when(lp.emailedAt)}` : link && lp ? 'Not emailed' : ''}</span>
                      {canEdit && (
                        <button type="button" className="w-6 h-6 rounded-md text-teton-ui-gray hover:bg-teton-almost-white text-[11px]" onClick={() => setPeople((list) => list.filter((x) => x.email !== p.email))} aria-label={`Remove ${p.email}`}>
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && (
              <input
                className={`${field} h-10`}
                placeholder={people.length ? 'Add another email…' : 'name@company.com, or Dana Lee <dana@company.com>'}
                value={draft}
                aria-label="Add an email"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addDraft();
                  }
                }}
                onBlur={() => draft && addDraft()}
              />
            )}
            <p className="mt-1.5 text-[11.5px] leading-snug text-teton-ui-gray">They enter their email to open it; it has to be one of these. First names go in the email’s opening line.</p>

            <div className="mt-3">
              <div className={row}>
                <span>
                  Verify their email with a 6-digit code
                  <small className="block text-[11.5px] text-teton-ui-gray">When they open the link, we email them a code to enter</small>
                </span>
                <Toggle on={verifyEmail} onChange={setVerifyEmail} label="Verify their email with a 6-digit code" />
              </div>
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

            {/* The email they get. */}
            <div className="mt-2 rounded-xl border border-teton-off-white">
              <button type="button" className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left" aria-expanded={emailOpen} onClick={() => setEmailOpen((o) => !o)}>
                <span className="text-[13px] font-semibold">The email they get</span>
                <span className="text-[11.5px] text-teton-ui-gray truncate">{proposalName}</span>
                <svg className={`ml-auto w-3.5 h-3.5 text-teton-ui-gray transition-transform duration-300 motion-reduce:transition-none ${emailOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.2 7.2a.75.75 0 011.06 0L10 10.94l3.74-3.74a.75.75 0 111.06 1.06l-4.27 4.27a.75.75 0 01-1.06 0L5.2 8.26a.75.75 0 010-1.06z" clipRule="evenodd" /></svg>
              </button>
              <Collapse open={emailOpen}>
                <div className="px-3.5 pb-3.5 space-y-3 min-w-0">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold">Proposal name</span>
                    <input className={`${field} h-9`} value={proposalName} maxLength={120} disabled={!canEdit} {...focusOn('name')} onChange={(e) => setProposalName(e.target.value)} placeholder="ABC Senior Living proposal" />
                    <span className="mt-1 block text-[11px] text-teton-ui-gray">Shown beside the proposal’s picture, and in the subject line.</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 flex items-baseline gap-2 text-[12px] font-semibold">
                      Opening message
                      {intro !== DEFAULT_INTRO && canEdit && (
                        <button type="button" className="text-[11px] font-medium text-[#1F5FB5] hover:underline" onClick={() => setIntro(DEFAULT_INTRO)}>
                          Use the standard one
                        </button>
                      )}
                    </span>
                    <input className={`${field} h-9`} value={intro} maxLength={300} disabled={!canEdit} {...focusOn('intro')} onChange={(e) => setIntro(e.target.value)} />
                    <span className="mt-1 block text-[11px] leading-snug text-teton-ui-gray whitespace-normal break-words">
                      <code className="rounded bg-teton-almost-white px-1">{'{first name}'}</code> becomes each person’s first name
                      {people[0] ? <> · e.g. “{(intro.trim() || DEFAULT_INTRO).replace(/\{first name\}/gi, firstOf(people[0]))}”</> : null}
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold">
                      Note <span className="font-normal text-teton-ui-gray">(optional, shown above the proposal)</span>
                    </span>
                    <textarea className={`${field} py-2 min-h-[72px] resize-y`} value={note} maxLength={2000} disabled={!canEdit} {...focusOn('note')} onChange={(e) => setNote(e.target.value)} placeholder="Great talking today. Here’s the proposal we discussed…" />
                  </label>
                </div>
              </Collapse>
            </div>

            <ResourcesSection quoteId={quoteId} versionId={versionId} linkUrl={link ? url : null} canEdit={canEdit} />

            {link && (
              <>
                <p className={`${label} mt-4`}>Link</p>
                <div className="flex gap-2">
                  <span className="flex-1 min-w-0 h-9 rounded-[10px] border border-[#D5D9DE] bg-teton-almost-white px-3 flex items-center text-[12.5px] text-teton-dark-gray truncate" title={url}>
                    {url.replace(/^https?:\/\//, '')}
                  </span>
                  <button type="button" className={btn} onClick={() => void copy()}>
                    {copied ? 'Copied ✓' : 'Copy link'}
                  </button>
                </div>
                <p className={`${label} mt-4`}>Activity</p>
                <ul className="rounded-[10px] border border-teton-off-white text-[12px] divide-y divide-teton-off-white">
                  {link.people.map((x) => (
                    <li key={x.email} className="flex items-center gap-2.5 px-3 py-2">
                      <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${x.firstOpenedAt ? 'bg-[#2E9E64]' : 'bg-[#C8CDD3]'}`} />
                      <b className="font-semibold truncate">{x.email}</b>
                      <span className="text-teton-ui-gray whitespace-nowrap">{x.firstOpenedAt ? `opened it · ${x.views} view${x.views === 1 ? '' : 's'}` : x.emailedAt ? 'emailed, not opened yet' : 'not emailed yet'}</span>
                      <span className="ml-auto flex items-center gap-2 text-teton-ui-gray whitespace-nowrap">
                        {when(x.lastOpenedAt)}
                        {canEdit && x.emailedAt && (
                          <button type="button" className="text-[11px] font-semibold text-[#1F5FB5] hover:underline disabled:opacity-50" disabled={busy} onClick={() => void send([x.email])}>
                            Send again
                          </button>
                        )}
                      </span>
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
          <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-3.5 border-t border-teton-off-white bg-[#FAFAFB] rounded-b-2xl min-[1180px]:rounded-br-none pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {link && canEdit && (
              <button type="button" className={`${btn} !text-[#C2412D] !border-[#F3D3CC]`} disabled={busy} onClick={() => void turnOff()}>
                Turn off link
              </button>
            )}
            {notice && <span role="status" className="text-[12px] font-medium text-[#256B41] [animation:fadeIn_.2s_ease-out]">✓ {notice}</span>}
            <span className="flex-1" />
            {canEdit && (!link || changed) && (
              <button type="button" className={btn} disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : link ? 'Save changes' : 'Create link'}
              </button>
            )}
            {canEdit && (notEmailed > 0 || !link) && (
              <button type="button" className={dark} disabled={busy || (!people.length && !draft.trim())} onClick={() => void send()}>
                {busy ? 'Sending…' : `Email the link${notEmailed > 1 ? ` to ${notEmailed}` : ''}`}
              </button>
            )}
            {link && !changed && notEmailed === 0 && (
              <button type="button" className={dark} onClick={close}>
                Done
              </button>
            )}
          </div>
        )}
        </div>
        {loaded && (
          <aside className="hidden min-[1180px]:flex flex-col w-[540px] border-l border-[#ECE7DF] bg-[#F6F4F0] rounded-r-2xl min-h-0" aria-label="Email preview">
            {preview}
          </aside>
        )}
      </div>
    </div>
  );
}
