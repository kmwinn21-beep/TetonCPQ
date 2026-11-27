'use client';

/**
 * Settings → Roles & permissions: what each role can do. Cells are on / off, or how far a permission reaches on deals
 * (every deal, own + collaborating, own, none). Admin is all on and locked; fixed rows are decisions shown for
 * reference; coming-soon rows preview backlog features (read-only, nothing stored). A dot marks a value that differs
 * from the default.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import { ROLE_LABEL } from '@/lib/auth/roles';
import { CAPABILITIES, EDITABLE_ROLES, GROUPS, grantOf, isEditable, valuesOf, type Capability, type Grants, type Value } from '@/lib/auth/permissions';
import type { Matrix } from '@/lib/data/permissions';

const ROLE_COLS = [...EDITABLE_ROLES, 'admin'] as const;
type Col = (typeof ROLE_COLS)[number];
const ROLE_SUB: Record<Col, string> = { rep: 'Owns deals, builds proposals', deal_desk: 'Scoping, agreements, approvals', vp_sales: 'Sales leadership', ceo: 'Top-tier approvals', admin: 'Everything · locked' };

const LABEL: Record<Value, string> = { all: 'All deals', collab: '+ Collaborating', own: 'Own deals', off: 'Off', on: 'On' };
const SHORT: Record<Value, string> = { all: 'All', collab: '+ Collab.', own: 'Own', off: 'Off', on: 'On' };
const HELP: Record<Value, string> = {
  all: 'Every deal, no invite needed',
  collab: 'Deals they own, and ones they’re added to with that switch on',
  own: 'Only deals they own',
  off: 'Not allowed',
  on: 'Allowed',
};
const TONE: Record<Value, string> = {
  all: 'bg-teton-ink text-white border-teton-ink',
  on: 'bg-teton-ink text-white border-teton-ink',
  collab: 'bg-[#E8F1FD] text-[#1F5FB5] border-[#CADDF7]',
  own: 'bg-[#E3F4E8] text-[#1F6B3A] border-[#CFE8D7]',
  off: 'bg-[#F4F1EB] text-[#B6B0A6] border-[#F4F1EB]',
};

const SOON_KEY = 'perm-show-soon';

export function PermissionsMatrix({ initial, counts }: { initial: Matrix; counts: Record<string, number> }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Record<string, Grants>>(() => structuredClone(initial.roles));
  const [q, setQ] = useState('');
  const [soon, setSoon] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [phoneRole, setPhoneRole] = useState<Col>('rep');
  const [open, setOpen] = useState<string | null>(null); // `${layout}|${role}|${key}` (the phone and desktop layouts both exist)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setSoon(localStorage.getItem(SOON_KEY) === '1');
    } catch {
      /* private mode */
    }
  }, []);
  const toggleSoon = () =>
    setSoon((s) => {
      try {
        localStorage.setItem(SOON_KEY, s ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !s;
    });

  const changes = useMemo(() => {
    let n = 0;
    for (const r of EDITABLE_ROLES) for (const c of CAPABILITIES) if (isEditable(c) && draft[r]?.[c.key] !== saved.roles[r]?.[c.key]) n++;
    return n;
  }, [draft, saved]);
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!changes) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes]);

  const set = (role: string, key: string, v: Value) => {
    setDraft((d) => ({ ...d, [role]: { ...d[role], [key]: v } }));
    setStatus(null);
  };
  const resetDefaults = () => {
    if (!window.confirm('Put every role back to the default permissions? Nothing is saved until you click Save.')) return;
    setDraft(Object.fromEntries(ROLE_COLS.map((r) => [r, Object.fromEntries(CAPABILITIES.map((c) => [c.key, grantOf(r, c.key)]))])));
  };
  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/permissions', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roles: Object.fromEntries(EDITABLE_ROLES.map((r) => [r, draft[r]])) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Couldn’t save');
      setSaved(j as Matrix);
      setDraft(structuredClone((j as Matrix).roles));
      setStatus({ ok: true, text: 'Saved. People see the change on their next page load.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const term = q.trim().toLowerCase();
  const rowsOf = (g: string) => CAPABILITIES.filter((c) => c.group === g && (soon || c.shipped) && (!term || `${c.label} ${c.sub ?? ''}`.toLowerCase().includes(term)));
  const groups = GROUPS.filter((g) => rowsOf(g.id).length);
  const hiddenSoon = CAPABILITIES.filter((c) => !c.shipped).length;

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-24">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[16rem]">
          <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
          <p className="text-sm text-teton-ui-gray max-w-2xl">What each role can do. Every permission is checked on the server. Admin has everything and can’t be changed. A dot marks a value that differs from the default.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={resetDefaults}>Reset to defaults</button>
          <button type="button" className="btn-primary text-sm disabled:opacity-40" disabled={!changes || busy} onClick={save}>
            {busy ? 'Saving…' : changes ? `Save ${changes} change${changes === 1 ? '' : 's'}` : 'Saved'}
          </button>
        </div>
      </div>
      {status && <p role="status" className={`text-sm rounded-lg px-3 py-2 ${status.ok ? 'bg-teton-pale-green' : 'bg-teton-red/30'}`}>{status.text}</p>}

      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-teton-off-white bg-[#FBFAF7]">
          <label className="flex items-center gap-2 h-9 min-w-0 w-full sm:w-64 rounded-lg border border-teton-pale-gray bg-white px-2.5 text-sm focus-within:border-[#3F8CEA]">
            <svg className="w-3.5 h-3.5 text-teton-light-gray" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" strokeLinecap="round" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search permissions" aria-label="Search permissions" className="flex-1 min-w-0 bg-transparent outline-none" />
          </label>
          <button type="button" role="switch" aria-checked={soon} onClick={toggleSoon} className="flex items-center gap-2 text-sm font-medium min-h-[36px]">
            <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 motion-reduce:transition-none ${soon ? 'bg-teton-ink' : 'bg-[#D5CFC5]'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${soon ? 'translate-x-4' : ''}`} />
            </span>
            Show coming soon <span className="text-teton-ui-gray font-normal">({hiddenSoon})</span>
          </button>
          <span className="flex-1" />
          {saved.updatedAt && <span className="text-xs text-teton-ui-gray">Last changed{saved.updatedBy ? ` by ${saved.updatedBy}` : ''} · {new Date(saved.updatedAt.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
        </div>

        {/* Phone: one role at a time. */}
        <div className="md:hidden px-3 pt-3">
          <div className="overflow-x-auto no-scrollbar">
            <SegGroup label="Role" thumbClass="bg-teton-ink" className="inline-flex gap-1 rounded-xl bg-[#F1EEE8] p-1">
              {ROLE_COLS.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={phoneRole === r} onClick={() => setPhoneRole(r)} className={`px-3 h-9 rounded-md text-[13px] font-semibold whitespace-nowrap transition-colors duration-200 ${phoneRole === r ? 'text-white' : 'text-teton-ui-gray'}`}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </SegGroup>
          </div>
          <p className="mt-2 text-xs text-teton-ui-gray">{ROLE_SUB[phoneRole]} · {counts[phoneRole] ?? 0} active user{(counts[phoneRole] ?? 0) === 1 ? '' : 's'}</p>
        </div>

        {/* Desktop: a column per role. */}
        <div className="hidden md:grid sticky top-0 z-10 bg-white border-b border-teton-off-white" style={{ gridTemplateColumns: 'minmax(16rem,1fr) repeat(5, 8.5rem)' }}>
          <div className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray self-end">Permission</div>
          {ROLE_COLS.map((r) => (
            <div key={r} className="px-2 py-2.5 text-center">
              <p className="text-[12.5px] font-semibold">{ROLE_LABEL[r]}</p>
              <p className="text-[10.5px] text-teton-ui-gray">{r === 'admin' ? 'locked' : `${counts[r] ?? 0} user${(counts[r] ?? 0) === 1 ? '' : 's'}`}</p>
            </div>
          ))}
        </div>

        {groups.length === 0 && <p className="px-4 py-10 text-center text-sm text-teton-ui-gray">Nothing matches “{q}”.</p>}
        {groups.map((g) => {
          const rows = rowsOf(g.id);
          const isFolded = !!folded[g.id] && !term;
          return (
            <section key={g.id} className="border-b border-teton-off-white last:border-b-0">
              <button type="button" aria-expanded={!isFolded} onClick={() => setFolded((f) => ({ ...f, [g.id]: !isFolded }))} className="w-full flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#F7F4EE] text-left min-h-[44px]">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[.9px] text-[#4E5562]">{g.title}</span>
                {g.soon && <span className="rounded-full bg-[#FFF3D6] px-2 py-0.5 text-[10.5px] font-bold text-[#8A5A00]">{g.soon} · preview</span>}
                <svg className={`ml-auto w-3.5 h-3.5 text-teton-light-gray transition-transform duration-300 motion-reduce:transition-none ${isFolded ? '-rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.2 7.2a.75.75 0 011.06 0L10 10.94l3.74-3.74a.75.75 0 111.06 1.06l-4.27 4.27a.75.75 0 01-1.06 0L5.2 8.26a.75.75 0 010-1.06z" /></svg>
              </button>
              <Collapse open={!isFolded}>
                {rows.map((c) => (
                  <Row key={c.key} c={c} draft={draft} saved={saved.roles} phoneRole={phoneRole} open={open} setOpen={setOpen} onSet={set} />
                ))}
              </Collapse>
            </section>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Row({ c, draft, saved, phoneRole, open, setOpen, onSet }: { c: Capability; draft: Record<string, Grants>; saved: Record<string, Grants>; phoneRole: Col; open: string | null; setOpen: (k: string | null) => void; onSet: (role: string, key: string, v: Value) => void }) {
  const cell = (r: Col, compact = false) => (
    <Cell key={r} c={c} role={r} value={draft[r]?.[c.key] ?? grantOf(r, c.key)} savedValue={saved[r]?.[c.key]} compact={compact} open={open === `${compact ? 'p' : 'd'}|${r}|${c.key}`} setOpen={(o) => setOpen(o ? `${compact ? 'p' : 'd'}|${r}|${c.key}` : null)} onSet={(v) => onSet(r, c.key, v)} />
  );
  const text = (
    <div className="min-w-0">
      <p className={`text-[13px] ${c.shipped ? 'font-medium' : 'text-teton-ui-gray'}`}>
        {c.label}
        {c.fixed && c.shipped && <span className="ml-1.5 align-[1px] rounded bg-[#F1EEE8] px-1.5 py-px text-[10px] font-semibold text-teton-ui-gray" title="Decided for everyone; not adjustable here">Fixed</span>}
      </p>
      {c.sub && <p className="text-[11.5px] text-teton-ui-gray">{c.sub}</p>}
    </div>
  );
  return (
    <>
      <div className={`hidden md:grid items-center border-t border-teton-off-white first:border-t-0 ${c.shipped ? '' : 'bg-[#FCFBF9]'}`} style={{ gridTemplateColumns: 'minmax(16rem,1fr) repeat(5, 8.5rem)' }}>
        <div className="px-4 py-2.5">{text}</div>
        {ROLE_COLS.map((r) => (
          <div key={r} className="px-2 py-2 flex justify-center">{cell(r)}</div>
        ))}
      </div>
      <div className={`md:hidden flex items-center gap-3 px-4 py-2.5 border-t border-teton-off-white first:border-t-0 ${c.shipped ? '' : 'bg-[#FCFBF9]'}`}>
        <div className="flex-1 min-w-0">{text}</div>
        {cell(phoneRole, true)}
      </div>
    </>
  );
}

function Cell({ c, role, value, savedValue, compact, open, setOpen, onSet }: { c: Capability; role: Col; value: Value; savedValue?: Value; compact: boolean; open: boolean; setOpen: (o: boolean) => void; onSet: (v: Value) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const locked = role === 'admin' || !isEditable(c);
  const changedFromDefault = role !== 'admin' && isEditable(c) && value !== grantOf(role, c.key);
  const unsaved = savedValue !== undefined && value !== savedValue;
  // Esc or a click elsewhere closes the picker.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down);
    };
  }, [open, setOpen]);
  const why = role === 'admin' ? 'Admin has everything' : !c.shipped ? 'Preview: arrives with its feature' : c.fixed ? 'Decided for everyone' : undefined;
  const chip = `relative inline-flex items-center justify-center gap-1 ${compact ? 'min-w-[5.5rem]' : 'min-w-[6.5rem]'} h-8 md:h-7 px-2 rounded-lg border text-[11.5px] font-bold whitespace-nowrap ${TONE[value]} ${role === 'admin' && value !== 'off' ? '!bg-[#2B3440] !border-[#2B3440]' : ''} ${!c.shipped ? 'opacity-55 border-dashed' : ''}`;
  if (locked)
    return (
      <span className={chip} title={why} aria-label={`${ROLE_LABEL[role]}: ${LABEL[value]} (${why})`}>
        {compact ? SHORT[value] : LABEL[value]}
        {role === 'admin' && <LockIcon />}
      </span>
    );
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${ROLE_LABEL[role]} · ${c.label}: ${LABEL[value]}. Change`} onClick={() => setOpen(!open)} className={`${chip} hover:ring-2 hover:ring-[#3F8CEA]/40 focus-visible:ring-2 focus-visible:ring-[#3F8CEA] outline-none ${open ? 'ring-2 ring-[#3F8CEA]' : ''}`}>
        {compact ? SHORT[value] : LABEL[value]}
        {(changedFromDefault || unsaved) && <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${unsaved ? 'bg-[#3F8CEA]' : 'bg-[#E8664A]'}`} aria-hidden="true" title={unsaved ? 'Not saved yet' : 'Differs from the default'} />}
      </button>
      {open && (
        <div role="menu" aria-label={`${ROLE_LABEL[role]} · ${c.label}`} className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-teton-off-white bg-white p-1.5 text-left shadow-[0_14px_34px_rgba(15,23,32,.18)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]">
          <p className="px-2 pt-1 pb-1.5 text-[11.5px] font-semibold">{ROLE_LABEL[role]} · {c.label}</p>
          {valuesOf(c).map((v) => (
            <button
              key={v}
              type="button"
              role="menuitemradio"
              aria-checked={value === v}
              onClick={() => {
                onSet(v);
                setOpen(false);
              }}
              className={`w-full grid grid-cols-[16px_1fr] gap-2 rounded-lg px-2 py-2 text-left hover:bg-[#F5F8FD] ${value === v ? 'bg-[#EEF5FE]' : ''}`}
            >
              <span className={`mt-0.5 w-3.5 h-3.5 rounded-full ${value === v ? 'border-[4px] border-[#1F5FB5]' : 'border-2 border-[#C9C2B6]'}`} aria-hidden="true" />
              <span>
                <span className="block text-[12.5px] font-medium">{LABEL[v]}{v === grantOf(role, c.key) && <span className="ml-1 text-[10.5px] font-normal text-teton-ui-gray">default</span>}</span>
                <span className="block text-[11px] text-teton-ui-gray">{HELP[v]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LockIcon = () => (
  <svg className="w-3 h-3 opacity-70" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a4 4 0 00-4 4v2H5a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4z" /></svg>
);

function Legend() {
  const item = (v: Value, text: string) => (
    <span className="flex items-center gap-2">
      <span className={`inline-flex items-center justify-center h-6 px-2 rounded-md border text-[11px] font-bold ${TONE[v]}`}>{LABEL[v]}</span>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-teton-ui-gray px-1">
      {item('all', 'Every deal')}
      {item('collab', 'Own deals, plus ones they collaborate on (with the owner’s switch for it on)')}
      {item('own', 'Only deals they own')}
      {item('off', 'Not allowed')}
      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#E8664A]" />Differs from the default</span>
      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#3F8CEA]" />Not saved yet</span>
    </div>
  );
}
