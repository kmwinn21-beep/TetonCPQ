'use client';

/**
 * In the Share dialog: one person's access, under their row: which tabs of the link they see (Proposal, Deal room)
 * and what they can do on the agreement (none, view, comment, redline, lead reviewer). Saved right away. Needs
 * "Manage prospect reviewers" in roles & permissions; signatories are always lead reviewers.
 */
import { useCallback, useEffect, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import type { Level, PersonView } from '@/lib/data/agreementDocs';

const LEVELS: Array<[Level, string]> = [['none', 'No agreement'], ['view', 'Agreement: view'], ['comment', 'Agreement: comment'], ['redline', 'Agreement: redline'], ['lead', 'Agreement: lead reviewer']];

/** Everyone's access for the deal (null: this user can't manage it). */
export function usePeopleAccess(quoteId: number) {
  const [people, setPeople] = useState<PersonView[] | null>(null);
  const [can, setCan] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/quotes/${quoteId}/agreement-doc`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { view: { people: PersonView[] }; caps: { people: boolean } };
    setPeople(j.view.people);
    setCan(j.caps.people);
  }, [quoteId]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch(`/api/quotes/${quoteId}/agreement-doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'person', ...body }) });
      const j = await r.json();
      if (r.ok) setPeople((j as { view: { people: PersonView[] } }).view.people);
      return r.ok ? null : String(j.error ?? 'Couldn’t save');
    },
    [quoteId],
  );
  return { people, can, save, load };
}
export type PeopleAccess = ReturnType<typeof usePeopleAccess>;

export function PersonAccess({ email, pa }: { email: string; pa: PeopleAccess }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!pa.people || !pa.can) return null;
  const p = pa.people.find((x) => x.email === email.toLowerCase()) ?? { email, level: 'none' as Level, showProposal: true, showResources: true, signatory: false };
  const summary = [p.showProposal ? 'Proposal' : null, p.showResources ? 'Deal room' : null, p.level !== 'none' ? (p.signatory ? 'Agreement: signatory' : LEVELS.find((l) => l[0] === p.level)?.[1]) : null].filter(Boolean).join(' · ') || 'Nothing';
  const save = async (b: Record<string, unknown>) => setErr(await pa.save({ email, ...b }));
  const sw = (on: boolean, label: string, key: 'showProposal' | 'showResources') => (
    <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
      <button type="button" role="switch" aria-checked={on} aria-label={`${label} for ${email}`} onClick={() => void save({ [key]: !on })} className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? 'bg-teton-ink' : 'bg-[#D5CFC5]'}`}>
        <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[14px]' : ''}`} />
      </button>
      {label}
    </label>
  );
  return (
    <div className="w-full">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-[11px] text-[#1F5FB5] hover:underline">
        Sees: {summary} {open ? '▴' : '▾'}
      </button>
      <Collapse open={open}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1.5 pb-0.5">
          {sw(p.showProposal, 'Proposal', 'showProposal')}
          {sw(p.showResources, 'Deal room', 'showResources')}
          <select aria-label={`Agreement access for ${email}`} disabled={p.signatory} className="h-7 rounded-lg border border-[#D5D9DE] px-1.5 text-[12px]" value={p.level} onChange={(e) => void save({ level: e.target.value })}>
            {LEVELS.map(([l, t]) => <option key={l} value={l}>{p.signatory && l === 'lead' ? 'Agreement: signatory (lead)' : t}</option>)}
          </select>
        </div>
        {err && <p role="alert" className="text-[11.5px] text-[#B4442C]">{err}</p>}
      </Collapse>
    </div>
  );
}
