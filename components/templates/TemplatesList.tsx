'use client';

/**
 * The Templates page: business case layouts for different readers (personas), as cards with a strip of page
 * previews. New template, and each card: Open (the editor), Duplicate, Delete.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { BcTemplate } from '@/lib/data/bcTemplates';
import { BC_PAGES } from '@/lib/proposal/layout';
import { SegGroup } from '@/components/form/SegGroup';
import { Dialog, PERSONAS, personaTone } from '@/components/proposal/TemplateMenu';

const day = (s: string) => new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Tiny page thumbnails: the template's pages in order (the standard set when it hasn't arranged them). */
function PageStrip({ t }: { t: BcTemplate }) {
  const pages = (t.layout.bcPages ?? BC_PAGES.filter((p) => p !== 'contents')).slice(0, 7);
  return (
    <div className="h-[104px] bg-[#e9ebee] flex gap-1.5 p-2.5 overflow-hidden" aria-hidden="true">
      {pages.map((p, i) => {
        const custom = p.startsWith('bcpage-');
        return (
          <div key={p + i} className="w-[54px] flex-shrink-0 rounded-[3px] bg-[#FAF7F2] p-1.5 shadow-[0_1px_2px_rgba(0,0,0,.1)]">
            {p === 'cover' ? (
              <div className="h-full rounded-sm bg-[#E8775A]/80" />
            ) : (
              <>
                <i className="block h-[3px] w-3/5 rounded bg-[#D45533]" />
                <i className={`block mt-1 rounded ${custom ? 'h-[3px] bg-[#cfc6b8]' : 'h-[11px] bg-[#101821]'}`} />
                <i className="block mt-1 h-[3px] rounded bg-[#e2dbcf]" />
                <i className="block mt-1 h-[3px] w-4/5 rounded bg-[#e2dbcf]" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TemplatesList({ initial }: { initial: BcTemplate[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    const r = await fetch('/api/templates', { cache: 'no-store' });
    if (r.ok) setList(((await r.json()) as { templates: BcTemplate[] }).templates);
  };
  const duplicate = async (t: BcTemplate) => {
    const r = await fetch(`/api/templates/${t.id}/duplicate`, { method: 'POST' });
    if (r.ok) void refresh();
    else setError('Couldn’t duplicate that template');
  };
  const remove = async (t: BcTemplate) => {
    if (!window.confirm(`Delete “${t.name}”? Business cases already formatted from it keep their layout.`)) return;
    const r = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
    if (r.ok) setList((l) => l.filter((x) => x.id !== t.id));
    else setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Couldn’t delete that template');
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Business case templates</h1>
          <p className="text-sm text-teton-ui-gray">Layouts for different readers. Pick one from the Template menu on any deal’s business case; that deal’s figures fill it in.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          ＋ New template
        </button>
      </div>
      {error && <p className="mb-3 rounded-md bg-teton-red/30 px-3 py-2 text-sm" role="alert">{error}</p>}
      {list.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-medium">No templates yet</p>
          <p className="text-sm text-teton-ui-gray mt-1">Make one here, or save a deal’s business case from its Template menu.</p>
        </div>
      ) : (
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <li key={t.id} className="rounded-xl border border-teton-off-white bg-white shadow-sm overflow-hidden flex flex-col drawer-in">
              <Link href={`/templates/${t.id}`} className="block hover:opacity-90">
                <PageStrip t={t} />
              </Link>
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start gap-2">
                  <Link href={`/templates/${t.id}`} className="min-w-0 flex-1 font-semibold leading-snug hover:underline">
                    {t.name}
                  </Link>
                  <CardMenu t={t} onDuplicate={() => void duplicate(t)} onDelete={() => void remove(t)} />
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.persona && <span className={`rounded-full px-2 py-px text-[10.5px] font-bold ${personaTone(t.persona)}`}>{t.persona}</span>}
                  {!t.shared && <span className="rounded-full bg-teton-almost-white px-2 py-px text-[10.5px] font-bold text-teton-ui-gray">Just me</span>}
                </div>
                {t.description && <p className="mt-1.5 text-xs text-teton-dark-gray line-clamp-2">{t.description}</p>}
                <p className="mt-auto pt-2 text-[11px] text-teton-ui-gray">
                  {t.pages ? `${t.pages} pages` : 'Standard pages'} · {t.usage ? `used in ${t.usage} business case${t.usage === 1 ? '' : 's'}` : 'not used yet'} · {(t.updatedBy ?? t.owner).initials}, {day(t.updatedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewTemplateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/templates/${id}`)}
        />
      )}
    </>
  );
}

function CardMenu({ t, onDuplicate, onDelete }: { t: BcTemplate; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" className="w-7 h-7 -mr-1 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label={`More for ${t.name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-teton-off-white bg-white py-1 shadow-lg [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]">
          <Link href={`/templates/${t.id}`} className="block px-3 py-1.5 text-sm hover:bg-teton-almost-white">
            {t.canEdit ? 'Open' : 'View'}
          </Link>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-teton-almost-white" onClick={() => (setOpen(false), onDuplicate())}>
            Duplicate
          </button>
          {t.canDelete && (
            <button type="button" className="block w-full px-3 py-1.5 text-left text-sm text-[#B23A26] hover:bg-teton-almost-white" onClick={() => (setOpen(false), onDelete())}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewTemplateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [persona, setPersona] = useState<string>('CFO');
  const [other, setOther] = useState('');
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    const r = await fetch('/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, persona: persona === 'Other' ? other : persona, shared }) });
    const j = (await r.json().catch(() => ({}))) as { id?: number; error?: string };
    setBusy(false);
    if (!r.ok || !j.id) return setError(j.error ?? 'Couldn’t create the template');
    onCreated(j.id);
  };
  const eyebrow = 'block text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray mb-1 mt-3';
  return (
    <Dialog onClose={onClose} label="New template">
      <h3 className="text-base font-semibold">New template</h3>
      <p className="mt-0.5 text-xs text-teton-ui-gray">Starts from the standard business case. Arrange it in the editor with sample figures or a real deal’s.</p>
      <label className={eyebrow} htmlFor="nt-name">Name</label>
      <input id="nt-name" className="input-field w-full" value={name} maxLength={80} placeholder="e.g. Clinical leader" onChange={(e) => setName(e.target.value)} />
      <span className={eyebrow}>Persona</span>
      <div className="flex flex-wrap gap-1.5">
        {[...PERSONAS, 'Other'].map((p) => (
          <button key={p} type="button" aria-pressed={persona === p} className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${persona === p ? 'bg-teton-ink border-teton-ink text-white' : 'border-teton-pale-gray hover:bg-teton-almost-white'}`} onClick={() => setPersona(p)}>
            {p === 'Other' ? '+ Other' : p}
          </button>
        ))}
      </div>
      {persona === 'Other' && <input className="input-field w-full mt-1.5 drawer-in" value={other} maxLength={40} placeholder="Persona (e.g. Board)" aria-label="Other persona" onChange={(e) => setOther(e.target.value)} />}
      <span className={eyebrow}>Who can use it</span>
      <SegGroup role="group" label="Who can use it" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
        {(
          [
            [false, 'Just me'],
            [true, 'Everyone'],
          ] as const
        ).map(([v, label]) => (
          <button key={label} type="button" aria-pressed={shared === v} className={`flex-1 px-2 py-1.5 rounded-md font-semibold transition-colors duration-200 ${shared === v ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setShared(v)}>
            {label}
          </button>
        ))}
      </SegGroup>
      {error && <p className="mt-2 text-xs text-[#9A2E1C]" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary disabled:opacity-40" disabled={!name.trim() || busy || (persona === 'Other' && !other.trim())} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create and edit'}
        </button>
      </div>
    </Dialog>
  );
}
