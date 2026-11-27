'use client';

/**
 * The Agreement tab on the shared link: rounds, people and files on the left; the round's document and Teton's replies
 * on the right; a line on top saying whose turn it is. What someone can do depends on their level: view (read and
 * download), comment, redline (upload a redlined Word file), lead reviewer (send it to Teton, accept Teton's changes).
 * Signatories are lead reviewers and can invite reviewers when Teton allows it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collapse } from '@/components/form/fields';
import type { AgreementView, Level, NoteView, RoundView } from '@/lib/data/agreementDocs';
import { ChangeText, DocView, kindLabel } from '@/components/agreement/DocView';

export interface AgreementTabData {
  access: boolean;
  ready?: boolean;
  view?: AgreementView;
  notes?: NoteView[];
  me?: { email: string; name: string | null; level: Level; signatory: boolean };
  team?: boolean;
  tabs: { proposal: boolean; resources: boolean };
}

/** The tab's data (loaded once; refreshed after each action). */
export function useAgreementTab(token: string) {
  const [data, setData] = useState<AgreementTabData | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/share/${token}/agreement-doc`, { cache: 'no-store' });
    if (!r.ok) return setData({ access: false, tabs: { proposal: true, resources: true } });
    setData((await r.json()) as AgreementTabData);
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, load, ready: !!data?.ready };
}
export type AgreementTab = ReturnType<typeof useAgreementTab>;

const LEVEL_LABEL: Record<Level, string> = { none: '', view: 'View', comment: 'Comment', redline: 'Redline', lead: 'Lead reviewer' };
const ago = (s: string) => {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function ProspectAgreementTab({ token, a }: { token: string; a: AgreementTab }) {
  const d = a.data!;
  const v = d.view!;
  const me = d.me!;
  const notes = d.notes ?? [];
  const [roundId, setRoundId] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const round = v.rounds.find((r) => r.id === roundId) ?? v.rounds[v.rounds.length - 1];
  const last = v.rounds[v.rounds.length - 1];
  const live = v.status !== 'final' && v.status !== 'signed';
  const myTurn = v.status === 'with_prospect';
  const draft = last && last.side === 'prospect' && !last.sent ? last : null;
  const canAccept = !d.team && me.level === 'lead' && myTurn && !draft && last?.side === 'teton' && last.sent;
  const canUpload = !d.team && myTurn && (me.level === 'redline' || me.level === 'lead');
  const canComment = !d.team && live && (me.level === 'comment' || me.level === 'redline' || me.level === 'lead');

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/share/${token}/agreement-doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong');
      await a.load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(f: File) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/share/${token}/agreement-doc/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Couldn’t upload that file');
      await a.load();
      setRoundId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const status = !live
    ? v.status === 'signed'
      ? { title: 'Signed', body: 'Thank you. The final agreement is below.' }
      : { title: 'The agreement is final', body: 'Teton is sending it for signature. You can download the final copy.' }
    : draft
      ? { title: 'Your redlines are ready to send', body: me.level === 'lead' ? 'Send them to Teton, or upload a newer file to replace them.' : 'A lead reviewer sends them to Teton.' }
      : myTurn
        ? { title: last?.side === 'teton' && last.no > 1 ? 'Your turn: Teton responded to your redlines' : 'Your turn: review Teton’s draft', body: canUpload ? 'Download the Word file, redline it with Track Changes on, and upload it here. Or accept Teton’s changes if they’re all fine.' : 'Download and read it; your reviewers upload redlines.' }
        : { title: 'With Teton', body: v.prospectAccepted ? 'You accepted Teton’s changes. Teton will prepare the final agreement.' : 'Teton is reviewing your redlines.' };
  const changesOf = (r: RoundView) => r.changes;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[270px_minmax(0,1fr)] min-h-[calc(100vh-60px)] bg-[#F7F4EE]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <aside className="border-b md:border-b-0 md:border-r border-[#E7E2D9] p-3.5 flex flex-col gap-2">
        <Eb>Rounds</Eb>
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible no-scrollbar">
          {[...v.rounds].reverse().map((r) => (
            <button key={r.id} type="button" onClick={() => (setRoundId(r.id), setSel(null))} className={`flex-shrink-0 text-left rounded-xl bg-white border px-3 py-2.5 min-w-[180px] md:min-w-0 ${round?.id === r.id ? 'border-2 border-teton-ink px-[11px] py-[9px]' : 'border-[#E7E2D9] hover:bg-[#FBFAF7]'}`}>
              <b className="block text-[12.5px]">Round {r.no} · {r.side === 'teton' ? 'Teton' : r.uploadedBy === me.email ? 'Your redlines' : 'Your side'}</b>
              <small className="block text-[11.5px] text-teton-ui-gray truncate">{r.uploadedBy} · {ago(r.createdAt)}</small>
              {!r.sent && <small className="block text-[11px] font-semibold text-[#8A5A00]">Not sent to Teton yet</small>}
            </button>
          ))}
        </div>
        <Eb>People</Eb>
        <div className="rounded-xl bg-white border border-[#E7E2D9] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <p className="flex-1 min-w-0 text-[12px] text-teton-dark-gray">{v.people.map((p) => p.name || p.email).join(', ')}</p>
            {me.signatory && v.settings.signatoryCanInvite && live && <button type="button" className="btn-secondary py-0.5 px-2 text-[11.5px]" onClick={() => setInviting(true)}>Invite</button>}
          </div>
          <p className="mt-1 text-[11px] text-teton-ui-gray">You: {me.signatory ? 'Signatory · lead reviewer' : LEVEL_LABEL[me.level]}</p>
        </div>
        <Eb>Files</Eb>
        {round && (
          <a href={`/api/share/${token}/agreement-doc/file?round=${round.id}`} className="rounded-xl bg-white border border-[#E7E2D9] px-3 py-2.5 text-[12.5px] hover:bg-[#FBFAF7]">
            <b className="block">⤓ Download round {round.no}</b>
            <small className="text-teton-ui-gray">Word file with its tracked changes</small>
          </a>
        )}
        {v.final && (
          <a href={`/api/share/${token}/agreement-doc/file?final=1`} className="rounded-xl bg-white border border-[#CFE8D7] px-3 py-2.5 text-[12.5px] hover:bg-[#F4FBF6]">
            <b className="block text-[#1F6B3A]">⤓ Final agreement</b>
            <small className="text-teton-ui-gray">Clean Word file</small>
          </a>
        )}
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-xl border-[1.5px] border-dashed border-[#CFC8BC] py-2.5 text-[12.5px] font-semibold text-teton-dark-gray hover:bg-white disabled:opacity-50">
              ⤒ {draft ? 'Replace your redlined file' : 'Upload a redlined Word file'}
            </button>
          </>
        )}
      </aside>
      <main className="p-4 sm:p-6 min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[1.6px] text-[#E8664A]">Agreement</p>
        <h2 className="text-[20px] font-semibold">{v.title || 'Agreement'}</h2>
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-white border border-[#E7E2D9] px-3.5 py-3 shadow-[inset_4px_0_0_#E8664A]">
          <div className="flex-1 min-w-[220px] text-[12.5px] text-teton-dark-gray">
            <b className="block text-[13.5px] text-teton-ink">{status.title}</b>
            {status.body}
          </div>
          {draft && me.level === 'lead' && <button type="button" disabled={busy} className="btn-primary text-sm" onClick={() => void act({ action: 'send' })}>Send redlines to Teton →</button>}
          {draft && (me.level === 'redline' || me.level === 'lead') && <button type="button" disabled={busy} className="btn-ghost text-sm" onClick={() => window.confirm('Remove your uploaded redlines? They haven’t been sent.') && void act({ action: 'deleteRound' })}>Remove</button>}
          {canAccept && <button type="button" disabled={busy} className="btn-primary text-sm" onClick={() => window.confirm('Accept Teton’s changes as they are? Teton will then prepare the final agreement.') && void act({ action: 'accept' })}>Accept Teton’s changes</button>}
        </div>
        {err && <p role="alert" className="mb-3 rounded-lg bg-[#FDF0EE] px-3 py-2 text-[13px] text-[#B4442C]">{err}</p>}
        {d.team && <p className="mb-3 rounded-lg bg-[#EEF5FE] px-3 py-2 text-[12.5px] text-[#1F4F96]">You’re viewing as the Teton team: this is what the prospect sees. Work on the agreement from the deal page.</p>}
        {round && (
          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <DocView paragraphs={round.doc.paragraphs} partOf={round.doc.partOf} changes={changesOf(round)} selected={sel} onSelect={setSel} />
            <div className="flex flex-col gap-2.5">
              {changesOf(round).map((c, i) => {
                const cn = notes.filter((n) => n.changeId === c.id);
                return (
                  <div key={c.id} onClick={() => setSel(c.id)} className={`rounded-xl bg-white border px-3 py-2.5 transition-shadow duration-200 ${sel === c.id ? 'border-[#3F8CEA] shadow-[0_0_0_3px_rgba(63,140,234,.15)]' : 'border-[#E7E2D9]'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-grid place-items-center w-5 h-5 rounded-full text-[10px] font-extrabold text-white ${c.decision === 'accepted' ? 'bg-[#1F6B3A]' : c.decision === 'rejected' ? 'bg-[#B4442C]' : 'bg-[#E8664A]'}`}>{i + 1}</span>
                      <b className="text-[12px]">{kindLabel(c.kind)}</b>
                      <span className="ml-auto text-[11px] text-teton-ui-gray truncate max-w-[50%]">{c.author}</span>
                    </div>
                    <p className="mt-1.5"><ChangeText c={c} /></p>
                    {c.decision && <p className={`mt-1 text-[11.5px] font-semibold ${c.decision === 'accepted' ? 'text-[#1F6B3A]' : 'text-[#B4442C]'}`}>{c.decision === 'accepted' ? '✓ Accepted by Teton' : '✕ Not accepted by Teton'}</p>}
                    {cn.map((n) => <NoteBubble key={n.id} n={n} />)}
                    {canComment && <Collapse open={sel === c.id}><Composer onSend={(body) => act({ action: 'note', changeId: c.id, body })} busy={busy} /></Collapse>}
                  </div>
                );
              })}
              <div className="rounded-xl bg-white border border-[#E7E2D9] px-3 py-2.5">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[.8px] text-teton-ui-gray mb-1">Comments on round {round.no}</p>
                {notes.filter((n) => n.roundId === round.id && n.changeId == null).map((n) => <NoteBubble key={n.id} n={n} />)}
                {canComment ? <Composer onSend={(body) => act({ action: 'note', roundId: round.id, body })} busy={busy} /> : <p className="text-[12px] text-teton-ui-gray">No comments.</p>}
              </div>
            </div>
          </div>
        )}
      </main>
      {inviting && <InviteDialog token={token} settings={v.settings} onClose={() => setInviting(false)} onDone={() => (setInviting(false), void a.load())} />}
    </div>
  );
}

const Eb = ({ children }: { children: React.ReactNode }) => <p className="mt-1 px-1 text-[10.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray">{children}</p>;

function NoteBubble({ n }: { n: NoteView }) {
  return (
    <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${n.team ? 'bg-[#E8F1FD] text-[#163F78]' : 'bg-[#F0EBFB] text-[#3B2873]'}`}>
      <span className="flex text-[10.5px] font-bold">{n.author}{n.team && <span className="ml-1 font-semibold opacity-75">· Teton</span>}<span className="ml-auto font-normal opacity-60">{ago(n.createdAt)}</span></span>
      <p className="whitespace-pre-wrap">{n.body}</p>
    </div>
  );
}

function Composer({ onSend, busy }: { onSend: (body: string) => Promise<boolean>; busy: boolean }) {
  const [body, setBody] = useState('');
  return (
    <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comment for Teton" maxLength={2000} aria-label="Comment" className="input-field min-h-[2.25rem] text-[12.5px] py-1.5 resize-y flex-1" />
      <button type="button" disabled={!body.trim() || busy} className="btn-primary py-1 px-2.5 text-[12px] self-end" onClick={async () => (await onSend(body)) && setBody('')}>Send</button>
    </div>
  );
}

function InviteDialog({ token, settings, onClose, onDone }: { token: string; settings: AgreementView['settings']; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', organization: '', level: 'lead' as Level, showProposal: settings.inviteesSeeProposal, showResources: settings.inviteesSeeResources });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);
  const opt = (l: Level, title: string, sub: string) => (
    <button key={l} type="button" role="radio" aria-checked={f.level === l} onClick={() => setF({ ...f, level: l })} className={`w-full grid grid-cols-[16px_1fr] gap-2.5 rounded-xl border px-3 py-2 text-left ${f.level === l ? 'border-teton-ink shadow-[0_0_0_1px_#0F1720]' : 'border-[#E7E2D9]'}`}>
      <span className={`mt-0.5 w-4 h-4 rounded-full ${f.level === l ? 'border-[5px] border-teton-ink' : 'border-2 border-[#C9C2B6]'}`} aria-hidden="true" />
      <span><b className="block text-[13px] font-semibold">{title}</b><small className="text-[11.5px] text-teton-ui-gray">{sub}</small></span>
    </button>
  );
  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/share/${token}/agreement-doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'invite', ...f }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Couldn’t invite them');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  const link = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 sm:p-3 [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" role="dialog" aria-modal="true" aria-label="Invite a reviewer" onClick={() => !busy && onClose()} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]" onClick={(e) => e.stopPropagation()}>
        <p className="text-[16px] font-semibold">Invite a reviewer</p>
        <p className="text-[12.5px] text-teton-ui-gray">They sign in to this link with their email. Teton is told who you invited.</p>
        <div className="mt-3 space-y-2.5">
          <div><label className="label" htmlFor="inv-name">Name</label><input id="inv-name" className="input-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="inv-email">Email</label><input id="inv-email" type="email" className="input-field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label" htmlFor="inv-org">Organization or role</label><input id="inv-org" className="input-field" placeholder="e.g. Outside counsel" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} /></div>
          <div role="radiogroup" aria-label="What can they do?" className="space-y-1.5">
            <span className="label">What can they do?</span>
            {opt('comment', 'Comment', 'Read and ask questions')}
            {opt('redline', 'Redline', 'Upload redlines; you send them to Teton')}
            {opt('lead', 'Lead reviewer', 'Upload redlines and send them to Teton for you')}
          </div>
          {settings.signatoryCanGiveTabs && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.showProposal} onChange={(e) => setF({ ...f, showProposal: e.target.checked })} /> Also let them see the proposal</label>
              <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.showResources} onChange={(e) => setF({ ...f, showResources: e.target.checked })} /> Also let them see the deal room</label>
            </div>
          )}
          <p className="rounded-lg bg-[#F7F4EE] px-3 py-2 text-[11.5px] text-teton-dark-gray break-all">Send them this link: <b>{link}</b></p>
          {err && <p role="alert" className="rounded-lg bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">{err}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost py-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary py-2" disabled={busy || !f.email.trim()} onClick={() => void send()}>{busy ? 'Inviting…' : 'Send invite'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
