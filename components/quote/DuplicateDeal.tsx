'use client';

/**
 * Duplicate a deal (your own or someone else's): a new deal you own, with the chosen version's inputs and formatted
 * proposal, and optionally its deal room content and questions for prospects. People, floor plans, signatories and
 * anything tied to the prospect stay with the original.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Collapse } from '@/components/form/fields';
import type { DuplicateInfo } from '@/lib/data/duplicateDeal';

const COPIED = ['Terms, products, pricing, pilot', 'Communities, room types, common areas', 'Stages, roles, terms & notes', 'The formatted proposal: wording, layout, pages, sections'];
const LEFT = ['Collaborators', 'Floor plans and their notes', 'Legal entity and signatories (geography is kept)', 'Share links, prospect comments, activity', 'Tasks, comments, version history', 'Agreement requests'];

const savedLabel = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export function DuplicateDealDialog({ quoteId, onClose }: { quoteId: number; onClose: () => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<DuplicateInfo | null>(null);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('active');
  const [room, setRoom] = useState(true);
  const [questions, setQuestions] = useState(true);
  const [lists, setLists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/quotes/${quoteId}/duplicate`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Couldn’t load the deal');
        if (!live) return;
        const i = j as DuplicateInfo;
        setInfo(i);
        setName(`${i.name} (copy)`);
        setFrom(i.versions.find((v) => v.active) ? 'active' : 'draft');
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [quoteId]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);
  // Desktop shows the lists open; phones fold them under "What comes along".
  useEffect(() => setLists(window.matchMedia('(min-width: 640px)').matches), []);

  async function duplicate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/duplicate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, from, room, questions }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Couldn’t duplicate the deal');
      router.push(`/quotes/${j.quoteId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const active = info?.versions.find((v) => v.active);
  const box = 'rounded-xl border px-3 py-2.5';
  const check = (on: boolean, set: (v: boolean) => void, label: string, sub: string, n: number) => (
    <button type="button" role="checkbox" aria-checked={on} onClick={() => set(!on)} className="w-full flex items-start gap-2.5 py-1.5 text-left min-h-[40px]">
      <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 grid place-items-center text-[10px] text-white transition-colors duration-150 ${on ? 'bg-teton-ink' : 'border-2 border-[#C9C2B6]'}`} aria-hidden="true">{on ? '✓' : ''}</span>
      <span className="text-[13px]">
        {label} <span className="text-teton-ui-gray">({n})</span>
        <small className="block text-[11.5px] text-teton-ui-gray">{sub}</small>
      </span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 sm:p-3 [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" role="dialog" aria-modal="true" aria-label="Duplicate deal" onClick={() => !busy && onClose()}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]" onClick={(e) => e.stopPropagation()}>
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-teton-pale-gray" aria-hidden="true" />
        <div className="px-5 pt-4">
          <p className="text-[16px] font-semibold">Duplicate deal</p>
          <p className="text-[12.5px] text-teton-ui-gray">A new deal you own. The original isn’t changed.</p>
        </div>
        <div className="px-5 py-3 space-y-3">
          {!info && !err && <p className="py-6 text-center text-sm text-teton-ui-gray">Loading…</p>}
          {info && (
            <>
              <div className="flex items-center gap-2.5 rounded-xl bg-[#F7F4EE] px-3 py-2.5">
                <span className="w-8 h-8 rounded-full bg-teton-ink text-white grid place-items-center text-[11px] font-bold flex-shrink-0" aria-hidden="true">⧉</span>
                <span className="min-w-0">
                  <b className="block text-[13.5px] truncate">{info.name}</b>
                  <small className="text-[12px] text-teton-ui-gray">{info.owner ? `${info.owner}’s deal · ` : ''}{info.communities} communit{info.communities === 1 ? 'y' : 'ies'}</small>
                </span>
              </div>
              <div>
                <label className="label" htmlFor="dup-name">New deal name</label>
                <input id="dup-name" autoFocus className="input-field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && void duplicate()} />
              </div>
              <div>
                <label className="label" htmlFor="dup-from">Copy from</label>
                <select id="dup-from" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {active && <option value="active">v{active.no} (active) · saved {savedLabel(active.savedAt)} · with its formatted proposal</option>}
                  {(info.draftChanged || !active) && <option value="draft">Unsaved changes (not in a version yet){active ? ` · formatting from v${active.no}` : ''}</option>}
                  {info.versions.filter((v) => !v.active).map((v) => (
                    <option key={v.id} value={String(v.id)}>v{v.no} · saved {savedLabel(v.savedAt)} · with its formatted proposal</option>
                  ))}
                </select>
              </div>
              <div>
                <button type="button" aria-expanded={lists} onClick={() => setLists(!lists)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1F5FB5] min-h-[32px]">
                  What comes along
                  <svg className={`w-3 h-3 transition-transform duration-300 motion-reduce:transition-none ${lists ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.2 7.2a.75.75 0 011.06 0L10 10.94l3.74-3.74a.75.75 0 111.06 1.06l-4.27 4.27a.75.75 0 01-1.06 0L5.2 8.26a.75.75 0 010-1.06z" /></svg>
                </button>
                <Collapse open={lists}>
                  <div className="grid sm:grid-cols-2 gap-2.5 pt-1.5">
                    <div className={`${box} border-[#CFE8D7]`}>
                      <p className="text-[10.5px] font-extrabold uppercase tracking-[.8px] text-[#1F6B3A] mb-1">Comes along</p>
                      <ul className="space-y-1 text-[12.5px]">{COPIED.map((t) => <li key={t}><span className="text-[#1F6B3A] font-bold">✓</span> {t}</li>)}</ul>
                    </div>
                    <div className={`${box} border-teton-off-white`}>
                      <p className="text-[10.5px] font-extrabold uppercase tracking-[.8px] text-teton-ui-gray mb-1">Stays with the original</p>
                      <ul className="space-y-1 text-[12.5px] text-teton-dark-gray">{LEFT.map((t) => <li key={t}><span className="text-teton-light-gray">–</span> {t}</li>)}</ul>
                    </div>
                  </div>
                </Collapse>
              </div>
              {(info.roomItems > 0 || info.questions > 0) && (
                <div>
                  {info.roomItems > 0 && check(room, setRoom, 'Deal room content', 'Decks, documents, case studies, recordings and team shown (not what prospects viewed)', info.roomItems)}
                  {info.questions > 0 && check(questions, setQuestions, 'Questions for prospects', 'The questions, not anyone’s answers', info.questions)}
                </div>
              )}
              <p className="rounded-lg bg-[#FFF3D6] px-3 py-2 text-[12px] text-[#5E3E00]">Floor plans aren’t copied, so room types keep their counts but lose their tags on the plans. Scope figures stay the same.</p>
            </>
          )}
          {err && <p role="alert" className="rounded-lg bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t border-[#F1EEE7] bg-[#FBFAF7] flex flex-wrap justify-end gap-2 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <button type="button" className="btn-ghost py-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary py-2 flex-1 sm:flex-none" disabled={!info || !name.trim() || busy} onClick={() => void duplicate()}>
            {busy ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
