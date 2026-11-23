'use client';

/**
 * Collaborators: the deal's owner and the people they've given permissions to
 * (Edit Inputs, Edit Scope, Edit Deliverables). The owner and admins add,
 * change and remove collaborators, and can hand the deal over. Everyone else
 * sees who's on it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { usePersistedOpen } from '@/components/Sidebar';
import type { Collaborator, DealAccess, Perms } from '@/lib/data/access';
import { useFloorPlans } from './FloorPlans';
import { panelElId, usePanelOpener } from './panelNav';

const TONES = ['bg-[#E5EEFC] text-[#2B5BB5]', 'bg-[#FCE8EF] text-[#A23A63]', 'bg-[#E6F4EC] text-[#2B7A4B]', 'bg-[#F1E9FB] text-[#6A3FB0]', 'bg-[#FFF1DC] text-[#8A5A00]', 'bg-[#E3F4F6] text-[#1C6E7C]'];
const PERMS = [
  ['inputs', 'Edit Inputs', 'Pricing, communities, implementation, resources, terms, assumptions; upload floor plans; save versions.', 'bg-[#E5EEFC] text-[#2B5BB5]'],
  ['scope', 'Edit Scope', 'Use Scope Mode and the room type cards: tag rooms, save and edit room types; save versions.', 'bg-[#E6F4EC] text-[#2B7A4B]'],
  ['deliverables', 'Edit Deliverables', 'Reword, reorder, add and remove pages and sections in the proposal; record as sent.', 'bg-[#FFF1DC] text-[#8A5A00]'],
] as const;
type Key = (typeof PERMS)[number][0];

function Avatar({ id, initials, className = '' }: { id: number; initials: string; className?: string }) {
  return <span className={`inline-flex w-7 h-7 flex-shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-extrabold ${TONES[id % TONES.length]} ${className}`}>{initials}</span>;
}

function Tick({ on, onChange, label, children }: { on: boolean; onChange: (v: boolean) => void; label: string; children?: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span aria-hidden="true" className="mt-0.5 relative w-[18px] h-[18px] flex-shrink-0 rounded-[5px] border-[1.5px] border-teton-pale-gray bg-white transition-colors duration-200 peer-checked:bg-teton-near-black peer-checked:border-teton-near-black peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent after:absolute after:left-[5px] after:top-[1.5px] after:w-[5px] after:h-[9px] after:border-white after:border-r-2 after:border-b-2 after:rotate-45 after:opacity-0 peer-checked:after:opacity-100" />
      <span className="min-w-0">{children ?? label}</span>
    </label>
  );
}

export function CollaboratorsPanel() {
  const fp = useFloorPlans();
  const quoteId = fp?.quoteId;
  const [open, setOpen] = usePersistedOpen('teton.collaborators.open', true);
  usePanelOpener('collaborators', setOpen);
  const [data, setData] = useState<{ access: DealAccess; collaborators: Collaborator[]; candidates: Array<{ id: number; name: string; email: string }> } | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ userId: string } & Required<Perms>>({ userId: '', inputs: false, scope: false, deliverables: false });

  const load = useCallback(async () => {
    if (!quoteId) return;
    const r = await fetch(`/api/quotes/${quoteId}/collaborators`, { cache: 'no-store' });
    if (r.ok) setData(await r.json());
  }, [quoteId]);
  useEffect(() => {
    void load();
  }, [load]);
  const call = async (url: string, method: string, body?: unknown) => {
    setError(null);
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error ?? 'Something went wrong');
      return false;
    }
    await load();
    return true;
  };
  // Close the ⋯ menu on an outside click.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu == null) return;
    const down = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(null);
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [menu]);

  if (!data || !quoteId) return null;
  const { access, collaborators, candidates } = data;
  const owner = access.owner;
  const people = [...(owner ? [{ id: owner.id, initials: owner.initials }] : []), ...collaborators.map((c) => ({ id: c.user.id, initials: c.user.initials }))];
  const base = `/api/quotes/${quoteId}/collaborators`;
  const setPerm = (c: Collaborator, k: Key, v: boolean) => void call(`${base}/${c.user.id}`, 'PATCH', { inputs: c.inputs, scope: c.scope, deliverables: c.deliverables, [k]: v });
  const add = async () => {
    if (!form.userId) return;
    if (await call(base, 'POST', { ...form, userId: Number(form.userId) })) {
      setAdding(false);
      setForm({ userId: '', inputs: false, scope: false, deliverables: false });
      fp?.toast('Collaborator added');
    }
  };

  return (
    <section className="card" aria-label="Collaborators" id={panelElId('collaborators')}>
      <div className="flex items-center gap-2">
        <button type="button" className="flex flex-1 min-w-0 items-center gap-2 text-left" aria-expanded={open} aria-controls="collaborators-body" onClick={() => setOpen(!open)}>
          <svg className={`w-4 h-4 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          <h2 className="text-sm font-semibold">Collaborators</h2>
          <span className="flex">
            {people.slice(0, 5).map((p, k) => <Avatar key={p.id} id={p.id} initials={p.initials} className={`w-6 h-6 text-[8.5px] ${k ? '-ml-1.5' : ''}`} />)}
          </span>
        </button>
        {access.canManage && (
          <button type="button" className="btn-secondary py-1 px-2.5 text-xs whitespace-nowrap" onClick={() => { setOpen(true); setAdding(true); }}>
            + Collaborator(s)
          </button>
        )}
      </div>
      <Collapse open={open} id="collaborators-body">
        <div className="pt-1">
          <Collapse open={adding}>
            <div className="mt-2 rounded-xl border border-[#C9D9F5] bg-[#F7FAFF] p-3 text-sm">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray mb-1" htmlFor="collab-user">Add a collaborator</label>
              <select id="collab-user" className="input-field py-1.5 text-sm" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">Choose someone…</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}
              </select>
              <p className="mt-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray">Permissions</p>
              <div className="space-y-2">
                {PERMS.map(([k, label, desc]) => (
                  <Tick key={k} on={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} label={label}>
                    <b className="text-xs">{label}</b>
                    <span className="block text-[11px] text-teton-ui-gray leading-snug">{desc}</span>
                  </Tick>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-teton-ui-gray">Nothing ticked: view only (they can still add notes and comments).</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setAdding(false)}>Cancel</button>
                <button type="button" className="btn-primary py-1 text-xs disabled:opacity-40" disabled={!form.userId} onClick={add}>
                  Add {candidates.find((c) => String(c.id) === form.userId)?.name.split(' ')[0] ?? ''}
                </button>
              </div>
            </div>
          </Collapse>

          {owner && (
            <div className="flex items-center gap-2.5 py-2.5 border-b border-teton-off-white">
              <Avatar id={owner.id} initials={owner.initials} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate">{owner.name}{access.isOwner && <span className="font-normal text-teton-ui-gray"> (you)</span>}</p>
                <span className="inline-block mt-0.5 rounded-full bg-teton-near-black px-2 py-px text-[10px] font-bold text-white">Owner</span>
              </div>
            </div>
          )}
          {collaborators.map((c) => {
            const on = PERMS.filter(([k]) => c[k]);
            return (
              <div key={c.user.id} className="relative flex items-start gap-2.5 py-2.5 border-b border-teton-off-white last:border-b-0">
                <Avatar id={c.user.id} initials={c.user.initials} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate">{c.user.name}</p>
                  <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wider text-teton-light-gray">Permissions</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {on.length ? on.map(([k, label, , tone]) => <span key={k} className={`rounded-full px-1.5 py-px text-[10px] font-bold ${tone}`}>{label}</span>) : <span className="rounded-full bg-teton-almost-white px-1.5 py-px text-[10px] font-bold text-teton-ui-gray">View only</span>}
                  </div>
                </div>
                {access.canManage && (
                  <div className="relative" ref={menu === c.user.id ? menuRef : undefined}>
                    <button type="button" className="btn-ghost px-1.5 py-0.5 text-base leading-none text-teton-ui-gray" aria-label={`Change ${c.user.name}`} aria-haspopup="menu" aria-expanded={menu === c.user.id} onClick={() => setMenu(menu === c.user.id ? null : c.user.id)}>
                      ⋯
                    </button>
                    {menu === c.user.id && (
                      <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-teton-off-white bg-white p-2 text-xs shadow-lg drawer-in space-y-2">
                        {PERMS.map(([k, label]) => <Tick key={k} on={c[k]} onChange={(v) => setPerm(c, k, v)} label={label} />)}
                        <div className="border-t border-teton-off-white pt-1.5 space-y-0.5">
                          <button
                            type="button"
                            className="block w-full text-left rounded px-1.5 py-1 hover:bg-teton-almost-white"
                            onClick={async () => {
                              if (!window.confirm(`Make ${c.user.name} the owner of this deal? ${owner ? `${owner.name} stays on as a collaborator with every permission.` : ''}`)) return;
                              if (await call(`/api/quotes/${quoteId}/owner`, 'POST', { userId: c.user.id })) window.location.reload();
                            }}
                          >
                            Make owner…
                          </button>
                          <button type="button" className="block w-full text-left rounded px-1.5 py-1 text-[#B23A26] hover:bg-[#FDF1EE]" onClick={() => window.confirm(`Remove ${c.user.name} from this deal?`) && void call(`${base}/${c.user.id}`, 'DELETE').then(() => setMenu(null))}>
                            Remove from deal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <p className="mt-2 text-[11px] text-teton-ui-gray">Everyone else can view this deal and add floor plan notes and comments. Admins can edit everything.</p>
          {error && <p className="mt-2 rounded bg-teton-red/25 px-2 py-1 text-[11px] text-[#9A2E1C]">{error}</p>}
        </div>
      </Collapse>
    </section>
  );
}

