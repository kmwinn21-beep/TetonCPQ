'use client';

/**
 * Teton's agreement workspace (full screen, from the deal page): rounds on the left (upload, send, activity, people),
 * the selected round in the middle, and its changes on the right to accept or reject, with Teton-only notes and
 * replies the prospect sees. Compare any two rounds. When nothing is open: mark final (a clean Word file), then signed.
 * What each person can do comes from the roles & permissions matrix.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import type { AgreementView, ChangeView, Level, NoteView, PersonView, RoundView, Settings, TeamCaps } from '@/lib/data/agreementDocs';
import { acceptedTextOf, compareRounds } from './compare';
import { ChangeText, DocView, kindLabel } from './DocView';

interface State {
  view: AgreementView;
  notes: NoteView[];
  blockers: string[];
  caps: TeamCaps;
  shared?: boolean;
}

const ago = (s: string) => {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const LEVEL_LABEL: Record<Level, string> = { none: 'No agreement access', view: 'View', comment: 'Comment', redline: 'Redline', lead: 'Lead reviewer' };

export function AgreementWorkspace({ quoteId, dealName, onClose }: { quoteId: number; dealName: string; onClose: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<'round' | 'compare' | 'people'>('round');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/quotes/${quoteId}/agreement-doc`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'Couldn’t load the agreement');
    setSt(j as State);
    return j as State;
  }, [quoteId]);
  useEffect(() => {
    load()
      .then((j) => setRoundId((id) => id ?? j.view.rounds[j.view.rounds.length - 1]?.id ?? null))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [load]);
  // Esc leaves (with the slide-out).
  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, 180);
  }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && !(e.target as HTMLElement)?.closest?.('textarea, input, [role=dialog] [role=dialog]') && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [busy, close]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/quotes/${quoteId}/agreement-doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong');
      setSt((s) => ({ ...(s as State), ...(j as State) }));
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
      const r = await fetch(`/api/quotes/${quoteId}/agreement-doc/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Couldn’t upload that file');
      const s = await load();
      setRoundId(s.view.rounds[s.view.rounds.length - 1]?.id ?? null);
      setMode('round');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const v = st?.view;
  const caps = st?.caps;
  const round = v?.rounds.find((r) => r.id === roundId) ?? v?.rounds[v.rounds.length - 1] ?? null;
  const last = v?.rounds[v.rounds.length - 1] ?? null;
  const live = v ? v.status !== 'final' && v.status !== 'signed' : false;
  const canUpload = !!caps?.upload && live && v?.status !== 'with_prospect';
  const waiting = last && !last.sent ? last : null;

  return createPortal(
    <div className={`fixed inset-0 z-[85] flex flex-col bg-[#F7F4EE] ${leaving ? 'drawer-out' : 'drawer-in'}`} role="dialog" aria-modal="true" aria-label="Agreement">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 bg-[#14191F] text-white">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] truncate">Agreement{v?.title ? ` · ${v.title}` : ''}</b>
          <small className="block text-[12px] text-[#9AA3AE] truncate">{dealName} · {v?.turn ?? 'Loading…'}</small>
        </div>
        {round && (
          <a href={`/api/quotes/${quoteId}/agreement-doc/file?round=${round.id}`} className="inline-flex items-center h-8 px-3 rounded-lg border border-[#3A434E] text-[12.5px] font-semibold hover:bg-white/10">
            ⤓ <span className="hidden sm:inline ml-1">Round {round.no} .docx</span>
          </a>
        )}
        <button type="button" onClick={close} className="inline-flex items-center h-8 px-3.5 rounded-lg bg-white text-teton-ink text-[12.5px] font-bold">Done</button>
      </div>
      {err && <p role="alert" className="mx-4 sm:mx-5 mt-3 rounded-lg bg-[#FDF0EE] px-3 py-2 text-[13px] text-[#B4442C] [animation:fadeIn_.2s_ease-out]">{err}</p>}
      {!v ? (
        <p className="m-auto text-sm text-teton-ui-gray">{err ? '' : 'Loading…'}</p>
      ) : (
        <div className="flex-1 min-h-0 grid md:grid-cols-[270px_minmax(0,1fr)] overflow-hidden">
          {/* Rail */}
          <aside className="overflow-y-auto border-b md:border-b-0 md:border-r border-[#E7E2D9] p-3.5 flex flex-col gap-2 max-md:max-h-[40vh]">
            <Eb>Rounds</Eb>
            {v.rounds.length === 0 && <p className="text-[12.5px] text-teton-ui-gray px-1">No rounds yet. {caps?.upload ? 'Upload Teton’s draft (.docx) to start.' : 'RevOps uploads Teton’s draft to start.'}</p>}
            {[...v.rounds].reverse().map((r) => (
              <button key={r.id} type="button" onClick={() => (setRoundId(r.id), setMode('round'), setSel(null))} className={`text-left rounded-xl bg-white border px-3 py-2.5 transition-colors ${mode === 'round' && round?.id === r.id ? 'border-2 border-teton-ink px-[11px] py-[9px]' : 'border-[#E7E2D9] hover:bg-[#FBFAF7]'}`}>
                <b className="block text-[12.5px]">Round {r.no} · {r.side === 'teton' ? 'Teton' : 'Prospect'}</b>
                <small className="block text-[11.5px] text-teton-ui-gray truncate">{r.uploadedBy} · {ago(r.createdAt)}</small>
                <small className={`block text-[11px] font-semibold mt-0.5 ${!r.sent ? 'text-[#8A5A00]' : r.side === 'prospect' && r.changes.some((c) => !c.decision) && r.id === last?.id ? 'text-[#A63A22]' : 'text-[#1F6B3A]'}`}>
                  {!r.sent ? 'Not sent yet' : r.side === 'prospect' ? `${r.changes.filter((c) => !c.decision).length} of ${r.changes.length} open` : v.prospectAccepted?.round === r.no ? '✓ Accepted by the prospect' : 'Sent'}
                </small>
              </button>
            ))}
            {canUpload && (
              <>
                <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-xl border-[1.5px] border-dashed border-[#CFC8BC] py-2.5 text-[12.5px] font-semibold text-teton-dark-gray hover:bg-white disabled:opacity-50">
                  ⤒ {v.rounds.length ? (waiting?.side === 'teton' ? 'Replace Teton’s round' : 'Upload Teton’s response') : 'Upload Teton’s draft'} (.docx)
                </button>
              </>
            )}
            {v.rounds.length > 1 && (
              <button type="button" onClick={() => setMode('compare')} className={`rounded-xl border px-3 py-2 text-left text-[12.5px] font-semibold ${mode === 'compare' ? 'border-2 border-teton-ink bg-white' : 'border-[#E7E2D9] bg-white hover:bg-[#FBFAF7]'}`}>⇄ Compare rounds</button>
            )}
            <Eb>People</Eb>
            <button type="button" onClick={() => setMode('people')} className={`rounded-xl border bg-white px-3 py-2.5 text-left ${mode === 'people' ? 'border-2 border-teton-ink' : 'border-[#E7E2D9] hover:bg-[#FBFAF7]'}`}>
              <b className="block text-[12.5px]">{v.people.filter((p) => p.level !== 'none').length} with agreement access</b>
              <small className="block text-[11.5px] text-teton-ui-gray truncate">{v.people.filter((p) => p.level !== 'none').map((p) => p.name || p.email).join(', ') || 'Add the signatory in Deal details'}</small>
            </button>
            {v.events.length > 0 && (
              <>
                <Eb>Recent</Eb>
                <ul className="rounded-xl border border-[#E7E2D9] bg-white px-3 py-2 space-y-1.5 text-[11.5px] text-teton-dark-gray">
                  {v.events.slice(0, 6).map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="flex-1 min-w-0"><b className="font-semibold">{e.who}</b> {e.message}</span>
                      <span className="text-teton-light-gray whitespace-nowrap">{ago(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
          {/* Main */}
          <main className="overflow-y-auto p-4 sm:p-6">
            {mode === 'people' ? (
              <People st={st!} act={act} busy={busy} />
            ) : mode === 'compare' ? (
              <Compare rounds={v.rounds} />
            ) : !round ? (
              <Empty canUpload={canUpload} onUpload={() => fileRef.current?.click()} />
            ) : (
              <RoundPanel quoteId={quoteId} st={st!} round={round} last={last} sel={sel} setSel={setSel} act={act} busy={busy} />
            )}
          </main>
        </div>
      )}
    </div>,
    document.body,
  );
}

const Eb = ({ children }: { children: React.ReactNode }) => <p className="mt-1.5 px-1 text-[10.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray">{children}</p>;

function Empty({ canUpload, onUpload }: { canUpload: boolean; onUpload: () => void }) {
  return (
    <div className="max-w-md mx-auto mt-10 text-center">
      <p className="text-[16px] font-semibold">Start the agreement</p>
      <p className="mt-1 text-[13px] text-teton-ui-gray">Upload Teton’s draft as a Word file (.docx). The prospect sees it once it’s sent, on the Agreement tab of the shared proposal link.</p>
      {canUpload && <button type="button" onClick={onUpload} className="btn-primary mt-4">⤒ Upload Teton’s draft</button>}
    </div>
  );
}

function RoundPanel({ quoteId, st, round, last, sel, setSel, act, busy }: { quoteId: number; st: State; round: RoundView; last: RoundView | null; sel: number | null; setSel: (n: number | null) => void; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const { view: v, caps, notes, blockers } = st;
  const isLast = last?.id === round.id;
  const live = v.status !== 'final' && v.status !== 'signed';
  const reviewable = round.side === 'prospect' && isLast && live && round.sent;
  const open = round.changes.filter((c) => !c.decision).length;
  const [confirm, setConfirm] = useState(false);
  const roundNotes = notes.filter((n) => n.roundId === round.id && n.changeId == null);
  const status = !live && isLast
    ? { tone: 'green', title: v.status === 'signed' ? 'Signed' : 'Final: ready to sign', body: v.status === 'signed' ? 'The agreement is signed and the deal is won.' : 'The clean Word file is below. The prospect’s Agreement tab is read-only.' }
    : !round.sent
    ? { tone: 'amber', title: round.side === 'teton' ? 'Not sent yet' : 'The prospect hasn’t sent this yet', body: round.side === 'teton' ? (caps.review ? 'Check it, then send it to the prospect.' : 'Someone who can send rounds (usually the deal owner) sends it.') : 'Their lead reviewer sends it to Teton.' }
    : reviewable
      ? { tone: open ? 'coral' : 'blue', title: open ? `Your turn: ${open} of ${round.changes.length} changes open` : 'Every change is decided', body: open ? 'Accept or reject each change. Download the response with your decisions applied, write any counters in Word, and upload it as Teton’s next round.' : 'Download Teton’s response, add any counters in Word, and upload it as the next round, or mark the agreement final if nothing was rejected.' }
      : round.side === 'teton'
        ? { tone: 'blue', title: v.prospectAccepted?.round === round.no ? 'The prospect accepted this round' : isLast ? 'With the prospect' : 'Teton’s round', body: v.prospectAccepted?.round === round.no ? 'Mark the agreement final when the deal’s active version matches.' : isLast ? 'Waiting for their redlines or their acceptance.' : '' }
        : { tone: 'blue', title: `Round ${round.no} · the prospect’s redlines`, body: 'A later round answers it.' };
  const tone = { amber: 'shadow-[inset_4px_0_0_#B5762A]', coral: 'shadow-[inset_4px_0_0_#E8664A]', blue: 'shadow-[inset_4px_0_0_#3F8CEA]', green: 'shadow-[inset_4px_0_0_#1F6B3A]' }[status.tone];
  return (
    <div className="max-w-[1180px] mx-auto">
      <p className="text-[11px] font-extrabold uppercase tracking-[1.6px] text-[#E8664A]">Round {round.no} · {round.side === 'teton' ? 'Teton' : 'Prospect'} · {round.fileName}</p>
      <h2 className="text-[20px] font-semibold mt-0.5">{v.title || 'Agreement'}</h2>
      <div className={`mt-3 mb-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-white border border-[#E7E2D9] px-3.5 py-3 ${tone}`}>
        <div className="flex-1 min-w-[220px] text-[12.5px] text-teton-dark-gray">
          <b className="block text-[13.5px] text-teton-ink">{status.title}</b>
          {status.body}
        </div>
        {!round.sent && round.side === 'teton' && caps.review && <button type="button" disabled={busy} className="btn-primary text-sm" onClick={() => void act({ action: 'send' })}>Send round {round.no} to the prospect →</button>}
        {!round.sent && round.side === 'teton' && (caps.upload || caps.review) && <button type="button" disabled={busy} className="btn-ghost text-sm" onClick={() => window.confirm(`Remove round ${round.no}? It hasn’t been sent.`) && void act({ action: 'deleteRound' })}>Remove</button>}
        {reviewable && caps.review && open > 0 && (
          <>
            <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => window.confirm(`Accept all ${open} open changes?`) && void act({ action: 'decideAll', roundId: round.id, decision: 'accepted' })}>Accept all</button>
          </>
        )}
        {round.side === 'prospect' && round.sent && (
          <a href={`/api/quotes/${quoteId}/agreement-doc/file?round=${round.id}&decisions=1`} className="btn-secondary text-sm whitespace-nowrap" title="The prospect’s file with your decisions applied (open changes stay tracked)">⤓ Teton response .docx</a>
        )}
      </div>
      {round.side === 'prospect' && round.changes.some((c) => c.kind === 'untracked' && c.decision === 'rejected') && (
        <p className="mb-4 rounded-lg bg-[#FFF3D6] px-3 py-2 text-[12.5px] text-[#5E3E00]">Rejected edits made without Track Changes aren’t undone in the downloaded file: undo them in Word before uploading Teton’s response.</p>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <DocView paragraphs={round.doc.paragraphs} partOf={round.doc.partOf} changes={round.changes} selected={sel} onSelect={setSel} />
        <div className="flex flex-col gap-2.5">
          {round.changes.length === 0 && <p className="rounded-xl bg-white border border-[#E7E2D9] px-3 py-3 text-[12.5px] text-teton-ui-gray">No tracked changes in this round.</p>}
          {round.changes.map((c, i) => (
            <ChangeCard key={c.id} n={i + 1} c={c} notes={notes.filter((x) => x.changeId === c.id)} selected={sel === c.id} onSelect={() => setSel(c.id)} canDecide={reviewable && caps.review} canReply={caps.review && live} canNote={caps.view} act={act} busy={busy} />
          ))}
          {round.doc.comments.length > 0 && (
            <div className="rounded-xl bg-white border border-[#E7E2D9] px-3 py-2.5">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[.8px] text-teton-ui-gray mb-1.5">Comments in the Word file</p>
              {round.doc.comments.map((k) => (
                <div key={k.id} className="py-1.5 border-t border-[#F1EEE7] first:border-t-0 text-[12.5px]">
                  <b className="font-semibold">{k.author}</b> <span className="text-teton-ui-gray">on “{k.anchor.slice(0, 60)}{k.anchor.length > 60 ? '…' : ''}”</span>
                  <p className="text-teton-dark-gray">{k.text}</p>
                </div>
              ))}
            </div>
          )}
          <NotesBox notes={roundNotes} roundId={round.id} canReply={caps.review && live} canNote={caps.view} act={act} busy={busy} label="Notes on this round" />
        </div>
      </div>
      {isLast && (live ? caps.finish : true) && (
        <FinishBox st={st} quoteId={quoteId} confirm={confirm} setConfirm={setConfirm} act={act} busy={busy} />
      )}
    </div>
  );
}

function ChangeCard({ n, c, notes, selected, onSelect, canDecide, canReply, canNote, act, busy }: { n: number; c: ChangeView; notes: NoteView[]; selected: boolean; onSelect: () => void; canDecide: boolean; canReply: boolean; canNote: boolean; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selected]);
  const [noting, setNoting] = useState(false);
  return (
    <div ref={ref} onClick={onSelect} className={`rounded-xl bg-white border px-3 py-2.5 transition-shadow duration-200 ${selected ? 'border-[#3F8CEA] shadow-[0_0_0_3px_rgba(63,140,234,.15)]' : 'border-[#E7E2D9]'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-grid place-items-center w-5 h-5 rounded-full text-[10px] font-extrabold ${c.kind === 'untracked' ? 'border border-dashed border-[#B5762A] text-[#8A5A00] bg-[#FFF3D6]' : c.decision === 'accepted' ? 'bg-[#1F6B3A] text-white' : c.decision === 'rejected' ? 'bg-[#B4442C] text-white' : 'bg-[#E8664A] text-white'}`}>{n}</span>
        <b className="text-[12px]">{kindLabel(c.kind)}</b>
        {c.commercial && <span className="rounded-full bg-[#FDEDE8] px-1.5 py-px text-[10px] font-bold text-[#A63A22]" title="Mentions price, term, pilot or other commercial terms: check it against the price book’s rules">◆ Commercial terms</span>}
        <span className="ml-auto text-[11px] text-teton-ui-gray truncate max-w-[45%]">{c.author}</span>
      </div>
      <p className="mt-1.5"><ChangeText c={c} /></p>
      {(c.before || c.after) && c.kind !== 'untracked' && <p className="mt-1 text-[11px] text-teton-light-gray truncate">…{c.before.slice(-40).trimEnd()} <b className="text-teton-ui-gray">[{n}]</b> {c.after.slice(0, 40).trimStart()}…</p>}
      {c.decision && <p className={`mt-1.5 text-[11.5px] font-semibold ${c.decision === 'accepted' ? 'text-[#1F6B3A]' : 'text-[#B4442C]'}`}>{c.decision === 'accepted' ? '✓ Accepted' : '✕ Rejected'}{c.decidedBy ? ` · ${c.decidedBy}` : ''}</p>}
      {canDecide && (
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button type="button" disabled={busy} onClick={() => void act({ action: 'decide', changeId: c.id, decision: c.decision === 'accepted' ? null : 'accepted' })} className={`h-7 px-2.5 rounded-lg text-[12px] font-semibold border ${c.decision === 'accepted' ? 'bg-[#1F6B3A] border-[#1F6B3A] text-white' : 'border-[#CFE8D7] text-[#1F6B3A] hover:bg-[#E3F4E8]'}`}>Accept</button>
          <button type="button" disabled={busy} onClick={() => void act({ action: 'decide', changeId: c.id, decision: c.decision === 'rejected' ? null : 'rejected' })} className={`h-7 px-2.5 rounded-lg text-[12px] font-semibold border ${c.decision === 'rejected' ? 'bg-[#B4442C] border-[#B4442C] text-white' : 'border-[#F2C5B8] text-[#B4442C] hover:bg-[#FDEDE8]'}`}>Reject</button>
          {canNote && <button type="button" onClick={() => setNoting((x) => !x)} className="h-7 px-2.5 rounded-lg text-[12px] font-semibold border border-[#E7E2D9] hover:bg-[#FBFAF7]">Note{notes.length ? ` (${notes.length})` : ''}</button>}
        </div>
      )}
      {(notes.length > 0 || noting || (!canDecide && canNote)) && (
        <div onClick={(e) => e.stopPropagation()}>
          <Collapse open={notes.length > 0 || noting || (!canDecide && selected)}>
            <NotesBox notes={notes} changeId={c.id} canReply={canReply} canNote={canNote} act={act} busy={busy} compact />
          </Collapse>
        </div>
      )}
    </div>
  );
}

function NotesBox({ notes, roundId, changeId, canReply, canNote, act, busy, compact = false, label }: { notes: NoteView[]; roundId?: number; changeId?: number; canReply: boolean; canNote: boolean; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean; compact?: boolean; label?: string }) {
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<'internal' | 'shared'>('internal');
  if (!canNote && !notes.length) return null;
  return (
    <div className={compact ? 'mt-2 space-y-1.5' : 'rounded-xl bg-white border border-[#E7E2D9] px-3 py-2.5 space-y-1.5'}>
      {label && <p className="text-[10.5px] font-extrabold uppercase tracking-[.8px] text-teton-ui-gray">{label}</p>}
      {notes.map((n) => (
        <div key={n.id} className={`rounded-lg px-2.5 py-1.5 text-[12px] ${n.visibility === 'internal' ? 'bg-[#FFF3D6] text-[#5E3E00]' : n.team ? 'bg-[#E8F1FD] text-[#163F78]' : 'bg-[#F0EBFB] text-[#3B2873]'}`}>
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold">
            {n.author}
            <span className="font-semibold opacity-75">{n.visibility === 'internal' ? '🔒 Teton only' : n.team ? 'Shared with the prospect' : 'Prospect'}</span>
            <span className="ml-auto font-normal opacity-60">{ago(n.createdAt)}</span>
          </span>
          <p className="whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}
      {canNote && (
        <div className="space-y-1.5">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={vis === 'internal' ? 'A note for Teton only' : 'A reply the prospect sees'} maxLength={2000} className="input-field min-h-[2.5rem] text-[12.5px] py-1.5 resize-y" aria-label="Note" />
          <div className="flex items-center gap-1.5">
            {canReply && (
              <SegGroup thumbClass="bg-teton-ink" className="inline-flex rounded-lg bg-[#F1EEE8] p-0.5 gap-0.5" label="Who sees it">
                {(['internal', 'shared'] as const).map((x) => (
                  <button key={x} type="button" role="radio" aria-checked={vis === x} onClick={() => setVis(x)} className={`h-6 px-2 rounded-md text-[11px] font-semibold transition-colors duration-200 ${vis === x ? 'text-white' : 'text-teton-ui-gray'}`}>{x === 'internal' ? '🔒 Teton only' : 'Prospect sees'}</button>
                ))}
              </SegGroup>
            )}
            <span className="flex-1" />
            <button type="button" disabled={!body.trim() || busy} className="btn-primary py-1 px-2.5 text-[12px]" onClick={async () => (await act({ action: 'note', roundId, changeId, visibility: canReply ? vis : 'internal', body })) && setBody('')}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FinishBox({ st, quoteId, confirm, setConfirm, act, busy }: { st: State; quoteId: number; confirm: boolean; setConfirm: (b: boolean) => void; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const { view: v, caps, blockers } = st;
  if (v.status === 'signed') return <Box tone="green" title={`Signed · ${ago(v.signedAt ?? '')}`} body="The deal is marked won."><a className="btn-secondary text-sm" href={`/api/quotes/${quoteId}/agreement-doc/file?final=1`}>⤓ Final .docx</a></Box>;
  if (v.status === 'final')
    return (
      <Box tone="green" title="Final" body="The clean Word file is ready for DocuSign. The Agreement tab is read-only for the prospect.">
        <a className="btn-secondary text-sm" href={`/api/quotes/${quoteId}/agreement-doc/file?final=1`}>⤓ Final .docx</a>
        {caps.finish && <button type="button" disabled={busy} className="btn-primary text-sm" onClick={() => window.confirm('Mark the agreement signed? The deal is marked won.') && void act({ action: 'signed' })}>Mark signed</button>}
        {caps.finish && <button type="button" disabled={busy} className="btn-ghost text-sm" onClick={() => window.confirm('Reopen the agreement? The final file is set aside.') && void act({ action: 'reopen' })}>Reopen</button>}
      </Box>
    );
  return (
    <div className="mt-6 rounded-xl bg-white border border-[#E7E2D9] px-4 py-3.5">
      <p className="text-[13.5px] font-semibold">Mark final</p>
      <ul className="mt-1.5 space-y-1 text-[12.5px]">
        {blockers.length ? blockers.map((b) => <li key={b} className="text-[#8A5A00]">• {b}</li>) : <li className="text-[#1F6B3A]">✓ Nothing open, and the prospect has the latest terms.</li>}
      </ul>
      <label className="mt-2.5 flex items-start gap-2 text-[12.5px] cursor-pointer">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5" />
        <span>The deal’s active version matches the agreed price, term, pilot and rooms (update the deal first if not).</span>
      </label>
      <button type="button" disabled={!!blockers.length || !confirm || busy} className="btn-primary text-sm mt-2.5 disabled:opacity-40" onClick={() => void act({ action: 'final', versionMatches: true })}>Mark final</button>
      <p className="mt-1.5 text-[11.5px] text-teton-ui-gray">Makes a clean Word file (every change applied, comments removed) and locks the Agreement tab.</p>
    </div>
  );
}

const Box = ({ tone, title, body, children }: { tone: 'green'; title: string; body: string; children: React.ReactNode }) => (
  <div className={`mt-6 rounded-xl border px-4 py-3.5 ${tone === 'green' ? 'bg-[#F4FBF6] border-[#CFE8D7]' : ''}`}>
    <p className="text-[13.5px] font-semibold text-[#1F6B3A]">✓ {title}</p>
    <p className="text-[12.5px] text-teton-dark-gray">{body}</p>
    <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
  </div>
);

function Compare({ rounds }: { rounds: RoundView[] }) {
  const [a, setA] = useState(rounds[rounds.length - 2]?.id ?? rounds[0].id);
  const [b, setB] = useState(rounds[rounds.length - 1].id);
  const ra = rounds.find((r) => r.id === a)!;
  const rb = rounds.find((r) => r.id === b)!;
  const rows = useMemo(() => compareRounds(acceptedTextOf(ra.doc.paragraphs), acceptedTextOf(rb.doc.paragraphs)), [ra, rb]);
  const [onlyChanges, setOnly] = useState(true);
  const pick = (val: number, set: (n: number) => void, label: string) => (
    <select aria-label={label} className="input-field py-1 text-[13px] w-auto" value={val} onChange={(e) => set(Number(e.target.value))}>
      {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.no} · {r.side === 'teton' ? 'Teton' : 'Prospect'}</option>)}
    </select>
  );
  const shown = onlyChanges ? rows.filter((r) => r.changed) : rows;
  return (
    <div className="max-w-[1180px] mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-semibold mr-2">Compare rounds</h2>
        {pick(a, setA, 'First round')}
        <span className="text-teton-ui-gray">→</span>
        {pick(b, setB, 'Second round')}
        <span className="flex-1" />
        <SegGroup thumbClass="bg-teton-ink" className="inline-flex rounded-lg bg-[#F1EEE8] p-0.5 gap-0.5" label="Show">
          {([[true, 'Changes only'], [false, 'Everything']] as const).map(([k, l]) => (
            <button key={l} type="button" role="radio" aria-checked={onlyChanges === k} onClick={() => setOnly(k)} className={`h-7 px-2.5 rounded-md text-[12px] font-semibold transition-colors duration-200 ${onlyChanges === k ? 'text-white' : 'text-teton-ui-gray'}`}>{l}</button>
          ))}
        </SegGroup>
      </div>
      <p className="mt-1 text-[12px] text-teton-ui-gray">Each round as it reads with its changes accepted.</p>
      <div className="mt-3 rounded-xl bg-white border border-[#E7E2D9] overflow-hidden">
        {shown.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-teton-ui-gray">No differences.</p>}
        {shown.map((r, i) => (
          <div key={i} className="grid sm:grid-cols-2 border-t border-[#F1EEE7] first:border-t-0 text-[13.5px] leading-[1.65]" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>
            <div className={`px-4 py-2.5 ${r.changed ? 'bg-[#FFFBF4]' : ''}`}>{r.left.map((s, j) => (s.del ? <del key={j} className="bg-[#FBE6E1] text-[#B4442C]">{s.text}</del> : <span key={j}>{s.text}</span>))}</div>
            <div className={`px-4 py-2.5 sm:border-l border-[#F1EEE7] ${r.changed ? 'bg-[#F7FCF8]' : ''}`}>{r.right.map((s, j) => (s.ins ? <ins key={j} className="bg-[#E3F4E8] text-[#1F6B3A] no-underline">{s.text}</ins> : <span key={j}>{s.text}</span>))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function People({ st, act, busy }: { st: State; act: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const { view: v, caps } = st;
  const [email, setEmail] = useState('');
  const can = caps.people;
  const setting = (k: keyof Settings, label: string, sub: string) => (
    <label className="flex items-start gap-3 py-2 border-t border-[#F1EEE7] first:border-t-0 cursor-pointer">
      <span className="flex-1 text-[13px]">{label}<small className="block text-[11.5px] text-teton-ui-gray">{sub}</small></span>
      <Switch on={v.settings[k]} disabled={!can || busy} onChange={(on) => void act({ action: 'settings', settings: { [k]: on } })} label={label} />
    </label>
  );
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-[18px] font-semibold">People and access</h2>
        <p className="text-[12.5px] text-teton-ui-gray">Who on the prospect’s side can see and work on the agreement, and which other tabs of the shared link they see. Signatories (from Deal details) are always lead reviewers.</p>
      </div>
      {!st.shared && <p className="rounded-lg bg-[#FFF3D6] px-3 py-2 text-[12.5px] text-[#5E3E00]">The proposal isn’t shared yet: share it first, so people can open the Agreement tab.</p>}
      <div className="rounded-xl bg-white border border-[#E7E2D9] overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[620px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[.8px] text-teton-ui-gray">
              <th className="px-3 py-2 font-extrabold">Person</th>
              <th className="px-2 py-2 font-extrabold text-center">Proposal</th>
              <th className="px-2 py-2 font-extrabold text-center">Deal room</th>
              <th className="px-2 py-2 font-extrabold">Agreement</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.people.map((p) => (
              <PersonRow key={p.email} p={p} can={can} busy={busy} act={act} />
            ))}
          </tbody>
        </table>
      </div>
      {can && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: 'person', email, level: 'view' })) setEmail('');
          }}
        >
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="someone@prospect.com" className="input-field flex-1 min-w-[200px]" aria-label="Email to give agreement access" />
          <button type="submit" disabled={busy} className="btn-secondary">Give agreement access</button>
        </form>
      )}
      {can && <p className="text-[11.5px] text-teton-ui-gray -mt-2">People also need to be on the shared link to sign in: add them in the Share dialog.</p>}
      <div className="rounded-xl bg-white border border-[#E7E2D9] px-3.5 py-1.5">
        {setting('signatoryCanInvite', 'Signatory can invite reviewers', 'You’re notified and can remove anyone')}
        {setting('inviteesSeeProposal', 'People they invite see the proposal', 'Off: the Agreement tab only')}
        {setting('inviteesSeeResources', 'People they invite see the deal room', 'Off: the Agreement tab only')}
        {setting('signatoryCanGiveTabs', 'The signatory can give them the proposal and deal room', 'When inviting someone')}
      </div>
    </div>
  );
}

function PersonRow({ p, can, busy, act }: { p: PersonView; can: boolean; busy: boolean; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  return (
    <tr className="border-t border-[#F1EEE7]">
      <td className="px-3 py-2">
        <b className="block font-semibold">{p.name || p.email}{p.signatory && <span className="ml-1.5 rounded-full bg-[#F0EBFB] px-1.5 py-px text-[10px] font-bold text-[#5B3FA8]">Signatory</span>}</b>
        <small className="text-teton-ui-gray">{[p.name ? p.email : null, p.organization, p.invitedBy ? `invited by ${p.invitedBy}` : null, p.onLink ? null : 'not on the link'].filter(Boolean).join(' · ')}</small>
      </td>
      <td className="px-2 py-2 text-center"><Switch on={p.showProposal} disabled={!can || busy} onChange={(on) => void act({ action: 'person', email: p.email, showProposal: on })} label={`Proposal for ${p.email}`} /></td>
      <td className="px-2 py-2 text-center"><Switch on={p.showResources} disabled={!can || busy} onChange={(on) => void act({ action: 'person', email: p.email, showResources: on })} label={`Deal room for ${p.email}`} /></td>
      <td className="px-2 py-2">
        <select aria-label={`Agreement access for ${p.email}`} disabled={!can || busy || p.signatory} className="input-field py-1 text-[12.5px]" value={p.level} onChange={(e) => void act({ action: 'person', email: p.email, level: e.target.value })}>
          {(['none', 'view', 'comment', 'redline', 'lead'] as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 text-right">{can && !p.signatory && (p.invitedBy || p.level !== 'none') && <button type="button" disabled={busy} className="text-[12px] text-[#B4442C] hover:underline" onClick={() => window.confirm(`Remove ${p.email}’s agreement access?`) && void act({ action: 'removePerson', email: p.email })}>Remove</button>}</td>
    </tr>
  );
}

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative inline-block w-9 h-5 rounded-full transition-colors duration-200 motion-reduce:transition-none disabled:opacity-50 ${on ? 'bg-teton-ink' : 'bg-[#D5CFC5]'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}
