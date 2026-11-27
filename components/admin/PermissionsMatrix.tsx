'use client';

/**
 * Settings → Roles & permissions: what each role can do. Cells are on / off, or how far a permission reaches on deals
 * (every deal, own + collaborating, own, none). Admin is all on and locked; fixed rows are decisions shown for
 * reference; coming-soon rows preview backlog features (read-only, nothing stored). A dot marks a value that differs
 * from the default.
 *
 * Roles: "+ Add role" adds a column (starting from another role's permissions, or nothing); click a role's name to
 * rename it; its ⋯ menu has description, duplicate, move left / right and delete. Role changes save right away;
 * permission changes wait for Save.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import type { RoleDef } from '@/lib/auth/roles';
import { CAPABILITIES, GROUPS, grantOf, isEditable, valuesOf, type Capability, type Grants, type Value } from '@/lib/auth/permissions';
import type { Matrix } from '@/lib/data/permissions';

const MAX_ROLES = 20;
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
const def = (r: RoleDef, key: string) => grantOf(r.key, key, null, r.builtin ? undefined : r.basedOn);
const usersText = (n: number) => `${n} user${n === 1 ? '' : 's'}`;

async function call(url: string, method: string, body?: unknown): Promise<{ matrix: Matrix; role?: RoleDef }> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? 'Request failed');
  return j;
}

type Dialog = { kind: 'add'; from: string } | { kind: 'describe'; role: RoleDef } | { kind: 'delete'; role: RoleDef } | null;

export function PermissionsMatrix({ initial }: { initial: Matrix }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Record<string, Grants>>(() => structuredClone(initial.roles));
  const [q, setQ] = useState('');
  const [soon, setSoon] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [phoneRole, setPhoneRole] = useState<string>(initial.list[0]?.key ?? 'admin');
  const [open, setOpen] = useState<string | null>(null); // `${layout}|${role}|${key}` (the phone and desktop layouts both exist)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const cols = saved.list;
  const editableCols = cols.filter((r) => r.key !== 'admin');

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
    for (const r of editableCols) for (const c of CAPABILITIES) if (isEditable(c) && draft[r.key]?.[c.key] !== saved.roles[r.key]?.[c.key]) n++;
    return n;
  }, [draft, saved, editableCols]);
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

  /** A role change came back: new roles and order, keeping unsaved permission edits on roles that are still there. */
  const applyMatrix = (m: Matrix) => {
    setSaved(m);
    setDraft((d) => Object.fromEntries(m.list.map((r) => [r.key, d[r.key] ?? structuredClone(m.roles[r.key])])));
    if (!m.list.some((r) => r.key === phoneRole)) setPhoneRole(m.list[0]?.key ?? 'admin');
  };
  const [dialogError, setDialogError] = useState<string | null>(null);
  /** A role change: applied on success; an error shows in the open dialog, or above the matrix. */
  const roleOp = async (fn: () => Promise<{ matrix: Matrix; role?: RoleDef }>, ok?: string) => {
    setStatus(null);
    setDialogError(null);
    try {
      const r = await fn();
      applyMatrix(r.matrix);
      if (ok) setStatus({ ok: true, text: ok });
      return r;
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (dialog) setDialogError(text);
      else setStatus({ ok: false, text });
      return null;
    }
  };
  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };
  const rename = async (r: RoleDef, name: string) => {
    setRenaming(null);
    const n = name.replace(/\s+/g, ' ').trim();
    if (!n || n === r.name) return;
    await roleOp(() => call(`/api/roles/${encodeURIComponent(r.key)}`, 'PATCH', { name: n }), `Renamed “${r.name}” to “${n}”.`);
  };
  const move = (r: RoleDef, dir: -1 | 1) => {
    const keys = editableCols.map((x) => x.key);
    const i = keys.indexOf(r.key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    void roleOp(() => call('/api/roles/order', 'PUT', { keys }));
  };

  const set = (role: string, key: string, v: Value) => {
    setDraft((d) => ({ ...d, [role]: { ...d[role], [key]: v } }));
    setStatus(null);
  };
  const resetDefaults = () => {
    if (!window.confirm('Put every role back to its default permissions? Nothing is saved until you click Save.')) return;
    setDraft(Object.fromEntries(cols.map((r) => [r.key, Object.fromEntries(CAPABILITIES.map((c) => [c.key, def(r, c.key)]))])));
  };
  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/permissions', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roles: Object.fromEntries(editableCols.map((r) => [r.key, draft[r.key]])) }) });
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
  const canAdd = cols.length < MAX_ROLES;
  const gridCols = `minmax(15rem,1fr) repeat(${cols.length}, 8.5rem) 7rem`;
  const phone = cols.find((r) => r.key === phoneRole) ?? cols[0];

  return (
    <div className="max-w-[90rem] mx-auto space-y-4 pb-24">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[16rem]">
          <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
          <p className="text-sm text-teton-ui-gray max-w-2xl">What each role can do. Click a role’s name to rename it, or ⋯ for more. Every permission is checked on the server. Admin has everything and can’t be changed. A dot marks a value that differs from the default.</p>
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
            <div className="inline-flex items-center gap-1.5">
              <SegGroup label="Role" thumbClass="bg-teton-ink" className="inline-flex gap-1 rounded-xl bg-[#F1EEE8] p-1">
                {cols.map((r) => (
                  <button key={r.key} type="button" role="radio" aria-checked={phoneRole === r.key} onClick={() => setPhoneRole(r.key)} className={`px-3 h-9 rounded-md text-[13px] font-semibold whitespace-nowrap transition-colors duration-200 ${phoneRole === r.key ? 'text-white' : 'text-teton-ui-gray'}`}>
                    {r.name}
                  </button>
                ))}
              </SegGroup>
              {canAdd && (
                <button type="button" onClick={() => setDialog({ kind: 'add', from: phone?.key && phone.key !== 'admin' ? phone.key : 'none' })} className="h-11 px-3 rounded-xl border-[1.5px] border-dashed border-[#9CC0EE] text-[13px] font-semibold text-[#1F5FB5] whitespace-nowrap">
                  ＋ Add
                </button>
              )}
            </div>
          </div>
          {phone && (
            <div className="mt-2 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {renaming === `p|${phone.key}` ? (
                  <RenameInput role={phone} onDone={(n) => (n == null ? setRenaming(null) : void rename(phone, n))} />
                ) : (
                  <p className="text-[14px] font-semibold">
                    {phone.name}
                    {fresh.includes(phone.key) && <span className="ml-1.5 rounded-full bg-[#E3F4E8] px-1.5 py-px text-[10px] font-bold text-[#1F6B3A]">New</span>}
                  </p>
                )}
                <p className="text-xs text-teton-ui-gray">{phone.key === 'admin' ? 'Everything · locked' : [phone.description, usersText(phone.users)].filter(Boolean).join(' · ')}</p>
              </div>
              {phone.key !== 'admin' && <RoleMenu role={phone} index={editableCols.indexOf(phone)} count={editableCols.length} canAdd={canAdd} onRename={() => setRenaming(`p|${phone.key}`)} onDescribe={() => setDialog({ kind: 'describe', role: phone })} onDuplicate={() => setDialog({ kind: 'add', from: phone.key })} onMove={(d) => move(phone, d)} onDelete={() => setDialog({ kind: 'delete', role: phone })} />}
            </div>
          )}
        </div>

        {/* Desktop: a column per role, then "+ Add role". */}
        <div className="hidden md:block overflow-x-auto">
          <div style={{ minWidth: `${15 + cols.length * 8.5 + 7}rem` }}>
            <div className="grid sticky top-0 z-10 bg-white border-b border-teton-off-white" style={{ gridTemplateColumns: gridCols }}>
              <div className="px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray self-end">Permission</div>
              {cols.map((r) => (
                <div key={r.key} className={`relative px-1.5 py-2 text-center transition-colors duration-300 ${fresh.includes(r.key) ? 'bg-[#F4FBF6]' : ''}`}>
                  {renaming === `d|${r.key}` ? (
                    <RenameInput role={r} onDone={(n) => (n == null ? setRenaming(null) : void rename(r, n))} />
                  ) : (
                    <div className="flex items-center justify-center gap-0.5">
                      {r.key === 'admin' ? (
                        <span className="text-[12.5px] font-semibold" title="Admin can’t be renamed">{r.name} 🔒</span>
                      ) : (
                        <button type="button" onClick={() => setRenaming(`d|${r.key}`)} title={`Rename ${r.name}`} className="min-w-0 truncate rounded px-1 text-[12.5px] font-semibold hover:bg-[#F1EEE8]">
                          {r.name}
                        </button>
                      )}
                      {r.key !== 'admin' && <RoleMenu role={r} index={editableCols.indexOf(r)} count={editableCols.length} canAdd={canAdd} onRename={() => setRenaming(`d|${r.key}`)} onDescribe={() => setDialog({ kind: 'describe', role: r })} onDuplicate={() => setDialog({ kind: 'add', from: r.key })} onMove={(d) => move(r, d)} onDelete={() => setDialog({ kind: 'delete', role: r })} />}
                    </div>
                  )}
                  <p className="flex flex-wrap items-center justify-center gap-1 text-[10.5px] text-teton-ui-gray" title={r.description || undefined}>
                    {r.key === 'admin' ? 'locked' : usersText(r.users)}
                    {fresh.includes(r.key) ? (
                      <span className="rounded-full bg-[#E3F4E8] px-1.5 text-[9.5px] font-bold text-[#1F6B3A]">New</span>
                    ) : (
                      !r.builtin && <span className="rounded-full bg-[#F0EBFB] px-1.5 text-[9.5px] font-bold text-[#5B3FA8]">Custom</span>
                    )}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-center border-l border-dashed border-[#E2DCD2] px-1.5">
                {canAdd ? (
                  <button type="button" onClick={() => setDialog({ kind: 'add', from: 'rep' })} className="rounded-lg border-[1.5px] border-dashed border-[#9CC0EE] bg-[#F7FAFE] px-2.5 py-1.5 text-[12px] font-bold text-[#1F5FB5] hover:bg-[#EEF5FE]">
                    ＋ Add role
                  </button>
                ) : (
                  <span className="text-[10.5px] text-teton-ui-gray">{MAX_ROLES} roles max</span>
                )}
              </div>
            </div>

            {groups.length === 0 && <p className="px-4 py-10 text-center text-sm text-teton-ui-gray">Nothing matches “{q}”.</p>}
            {groups.map((g) => (
              <GroupBlock key={g.id} g={g} rows={rowsOf(g.id)} folded={!!folded[g.id] && !term} onFold={() => setFolded((f) => ({ ...f, [g.id]: !f[g.id] }))}>
                {rowsOf(g.id).map((c) => (
                  <div key={c.key} className={`grid items-center border-t border-teton-off-white first:border-t-0 ${c.shipped ? '' : 'bg-[#FCFBF9]'}`} style={{ gridTemplateColumns: gridCols }}>
                    <div className="px-4 py-2.5"><RowText c={c} /></div>
                    {cols.map((r) => (
                      <div key={r.key} className={`px-1.5 py-2 flex justify-center ${fresh.includes(r.key) ? 'bg-[#F4FBF6]' : ''}`}>
                        <Cell c={c} role={r} value={draft[r.key]?.[c.key] ?? def(r, c.key)} savedValue={saved.roles[r.key]?.[c.key]} compact={false} open={open === `d|${r.key}|${c.key}`} setOpen={(o) => setOpen(o ? `d|${r.key}|${c.key}` : null)} onSet={(v) => set(r.key, c.key, v)} />
                      </div>
                    ))}
                    <div className="border-l border-dashed border-[#EFEAE2] self-stretch" />
                  </div>
                ))}
              </GroupBlock>
            ))}
          </div>
        </div>

        {/* Phone rows. */}
        <div className="md:hidden">
          {phone &&
            groups.map((g) => (
              <GroupBlock key={g.id} g={g} rows={rowsOf(g.id)} folded={!!folded[g.id] && !term} onFold={() => setFolded((f) => ({ ...f, [g.id]: !f[g.id] }))}>
                {rowsOf(g.id).map((c) => (
                  <div key={c.key} className={`flex items-center gap-3 px-4 py-2.5 border-t border-teton-off-white first:border-t-0 ${c.shipped ? '' : 'bg-[#FCFBF9]'}`}>
                    <div className="flex-1 min-w-0"><RowText c={c} /></div>
                    <Cell c={c} role={phone} value={draft[phone.key]?.[c.key] ?? def(phone, c.key)} savedValue={saved.roles[phone.key]?.[c.key]} compact open={open === `p|${phone.key}|${c.key}`} setOpen={(o) => setOpen(o ? `p|${phone.key}|${c.key}` : null)} onSet={(v) => set(phone.key, c.key, v)} />
                  </div>
                ))}
              </GroupBlock>
            ))}
        </div>
      </div>
      <Legend />

      {dialog?.kind === 'add' && (
        <AddRoleDialog
          roles={editableCols}
          from={dialog.from}
          onClose={closeDialog} error={dialogError}
          onAdd={async (v) => {
            const r = await roleOp(() => call('/api/roles', 'POST', v), `Added “${v.name}”. Its permissions are set; assign people to it on the Users page.`);
            if (r?.role) {
              setFresh((f) => [...f, r.role!.key]);
              setPhoneRole(r.role.key);
              closeDialog();
            }
            return !!r;
          }}
        />
      )}
      {dialog?.kind === 'describe' && (
        <DescribeDialog
          role={dialog.role}
          onClose={closeDialog} error={dialogError}
          onSave={async (d) => {
            const r = await roleOp(() => call(`/api/roles/${encodeURIComponent(dialog.role.key)}`, 'PATCH', { description: d }));
            if (r) closeDialog();
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteRoleDialog
          role={dialog.role}
          others={cols.filter((r) => r.key !== dialog.role.key)}
          onClose={closeDialog} error={dialogError}
          onDelete={async (moveTo) => {
            const r = await roleOp(() => call(`/api/roles/${encodeURIComponent(dialog.role.key)}`, 'DELETE', { moveTo }), `Deleted “${dialog.role.name}”.`);
            if (r) closeDialog();
          }}
        />
      )}
    </div>
  );
}

function GroupBlock({ g, folded, onFold, children }: { g: (typeof GROUPS)[number]; rows: Capability[]; folded: boolean; onFold: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-teton-off-white last:border-b-0">
      <button type="button" aria-expanded={!folded} onClick={onFold} className="w-full flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#F7F4EE] text-left min-h-[44px]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[.9px] text-[#4E5562]">{g.title}</span>
        {g.soon && <span className="rounded-full bg-[#FFF3D6] px-2 py-0.5 text-[10.5px] font-bold text-[#8A5A00]">{g.soon} · preview</span>}
        <svg className={`ml-auto w-3.5 h-3.5 text-teton-light-gray transition-transform duration-300 motion-reduce:transition-none ${folded ? '-rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.2 7.2a.75.75 0 011.06 0L10 10.94l3.74-3.74a.75.75 0 111.06 1.06l-4.27 4.27a.75.75 0 01-1.06 0L5.2 8.26a.75.75 0 010-1.06z" /></svg>
      </button>
      <Collapse open={!folded}>{children}</Collapse>
    </section>
  );
}

function RowText({ c }: { c: Capability }) {
  return (
    <div className="min-w-0">
      <p className={`text-[13px] ${c.shipped ? 'font-medium' : 'text-teton-ui-gray'}`}>
        {c.label}
        {c.fixed && c.shipped && <span className="ml-1.5 align-[1px] rounded bg-[#F1EEE8] px-1.5 py-px text-[10px] font-semibold text-teton-ui-gray" title="Decided for everyone; not adjustable here">Fixed</span>}
      </p>
      {c.sub && <p className="text-[11.5px] text-teton-ui-gray">{c.sub}</p>}
    </div>
  );
}

/** Rename in place: Enter (or leaving the field) keeps it, Escape cancels. */
function RenameInput({ role, onDone }: { role: RoleDef; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(role.name);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      value={v}
      maxLength={40}
      aria-label={`Rename ${role.name}`}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(v)}
      className="w-full h-8 rounded-lg border-2 border-[#3F8CEA] px-2 text-center text-[12.5px] font-semibold outline-none shadow-[0_0_0_3px_rgba(63,140,234,.15)]"
    />
  );
}

function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down);
    };
  }, [open, ref, close]);
}

function RoleMenu({ role, index, count, canAdd, onRename, onDescribe, onDuplicate, onMove, onDelete }: { role: RoleDef; index: number; count: number; canAdd: boolean; onRename: () => void; onDescribe: () => void; onDuplicate: () => void; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  const item = (label: string, icon: string, fn: () => void, opts: { disabled?: boolean; danger?: boolean } = {}) => (
    <button
      type="button"
      role="menuitem"
      disabled={opts.disabled}
      onClick={() => {
        setOpen(false);
        fn();
      }}
      className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-[#F5F8FD] disabled:opacity-35 disabled:hover:bg-transparent ${opts.danger ? 'text-[#B4442C]' : ''}`}
    >
      <span className="w-4 text-center text-teton-light-gray" aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${role.name} options`} onClick={() => setOpen((o) => !o)} className={`w-8 h-8 md:w-6 md:h-6 grid place-items-center rounded-md text-teton-ui-gray font-bold hover:bg-[#F1EEE8] ${open ? 'bg-[#F1EEE8]' : ''}`}>
        ⋯
      </button>
      {open && (
        <div role="menu" aria-label={`${role.name} options`} className="absolute right-0 md:right-auto md:left-1/2 md:-translate-x-1/2 top-[calc(100%+6px)] z-30 w-56 rounded-xl border border-teton-off-white bg-white p-1.5 text-left shadow-[0_14px_34px_rgba(15,23,32,.18)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]">
          {item('Rename', '✎', onRename)}
          {item('Edit description', '¶', onDescribe)}
          {item('Duplicate as a new role', '⧉', onDuplicate, { disabled: !canAdd })}
          {item('Move left', '←', () => onMove(-1), { disabled: index <= 0 })}
          {item('Move right', '→', () => onMove(1), { disabled: index < 0 || index >= count - 1 })}
          <div className="my-1 border-t border-teton-off-white" />
          {item('Delete role…', '✕', onDelete, { danger: true, disabled: count <= 1 })}
        </div>
      )}
    </div>
  );
}

/** A centered dialog (a sheet from the bottom on phones) that fades in. */
function Modal({ title, sub, onClose, children, footer, error }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; error?: string | null }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4 [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl [animation:fadeScale_.18s_ease-out] motion-reduce:[animation:none]">
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          {sub && <p className="text-[12.5px] text-teton-ui-gray mt-0.5">{sub}</p>}
        </div>
        <div className="px-5 py-3 space-y-3">
          {children}
          {error && <p role="alert" className="rounded-lg bg-teton-red/30 px-3 py-2 text-[12.5px]">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-teton-off-white bg-[#FBFAF7] flex justify-end gap-2 pb-[max(.75rem,env(safe-area-inset-bottom))]">{footer}</div>
      </div>
    </div>
  );
}

const eb = 'block text-[10px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray mb-1';

function AddRoleDialog({ roles, from: from0, onClose, onAdd, error }: { roles: RoleDef[]; from: string; onClose: () => void; error?: string | null; onAdd: (v: { name: string; description: string; from: string }) => Promise<boolean> }) {
  const src = roles.find((r) => r.key === from0);
  const [name, setName] = useState(src && from0 !== 'rep' ? `${src.name} (copy)` : '');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState(from0);
  const [busy, setBusy] = useState(false);
  const base = roles.find((r) => r.key === from);
  const baseName = base ? (base.builtin ? base.name : roles.find((r) => r.key === base.basedOn)?.name ?? null) : null;
  return (
    <Modal
      title="Add a role"
      sub="A new column in the matrix. Assign people to it on the Users page."
      onClose={onClose}
      error={error}
      footer={
        <>
          <button type="button" className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary text-sm disabled:opacity-40"
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onAdd({ name: name.trim(), description, from });
              if (!ok) setBusy(false);
            }}
          >
            {busy ? 'Adding…' : 'Add role'}
          </button>
        </>
      }
    >
      <div>
        <label className={eb} htmlFor="role-name">Name</label>
        <input id="role-name" autoFocus className="input-field" value={name} maxLength={40} placeholder="e.g. Sales Engineer" onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className={eb} htmlFor="role-desc">Description (optional)</label>
        <textarea id="role-desc" className="input-field min-h-[3.5rem] resize-y" value={description} maxLength={200} placeholder="What this role does" onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <span className={eb}>Start with the permissions of</span>
        <div role="radiogroup" aria-label="Start with the permissions of" className="space-y-1.5 max-h-56 overflow-y-auto">
          {[...roles.map((r) => ({ key: r.key, name: r.name, sub: `${r.users} user${r.users === 1 ? '' : 's'}${r.builtin ? '' : ' · custom'}` })), { key: 'none', name: 'Nothing', sub: 'Everything off except what everyone gets' }].map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={from === o.key} onClick={() => setFrom(o.key)} className={`w-full grid grid-cols-[16px_1fr] gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors duration-150 ${from === o.key ? 'border-teton-ink shadow-[0_0_0_1px_#0F1720]' : 'border-teton-off-white hover:bg-[#FBFAF7]'}`}>
              <span className={`mt-0.5 w-4 h-4 rounded-full ${from === o.key ? 'border-[5px] border-teton-ink' : 'border-2 border-[#C9C2B6]'}`} aria-hidden="true" />
              <span><b className="block text-[13px] font-semibold">{o.name}</b><small className="text-[11.5px] text-teton-ui-gray">{o.sub}</small></span>
            </button>
          ))}
        </div>
      </div>
      <p className="rounded-lg bg-[#F7F4EE] px-3 py-2 text-[12px] text-teton-ui-gray">
        {baseName ? <>Features added later give this role the same defaults as <b className="text-teton-ink">{baseName}</b>.</> : <>Features added later start off for this role.</>}
      </p>
    </Modal>
  );
}

function DescribeDialog({ role, onClose, onSave, error }: { role: RoleDef; onClose: () => void; error?: string | null; onSave: (d: string) => Promise<void> }) {
  const [d, setD] = useState(role.description);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`${role.name}: description`}
      sub="Shown under the role in the matrix and when picking a role for someone."
      onClose={onClose}
      error={error}
      footer={
        <>
          <button type="button" className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary text-sm disabled:opacity-40" disabled={busy} onClick={async () => (setBusy(true), await onSave(d), setBusy(false))}>Save</button>
        </>
      }
    >
      <textarea autoFocus aria-label="Description" className="input-field min-h-[4rem] resize-y" value={d} maxLength={200} onChange={(e) => setD(e.target.value)} />
    </Modal>
  );
}

function DeleteRoleDialog({ role, others, onClose, onDelete, error }: { role: RoleDef; others: RoleDef[]; onClose: () => void; error?: string | null; onDelete: (moveTo: string | null) => Promise<void> }) {
  const [moveTo, setMoveTo] = useState(others.find((r) => r.key !== 'admin')?.key ?? '');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const has = role.users > 0;
  const ok = typed.trim().toLowerCase() === role.name.toLowerCase() && (!has || !!moveTo);
  const target = others.find((r) => r.key === moveTo);
  return (
    <Modal
      title={`Delete “${role.name}”?`}
      sub={has ? 'Its permissions are deleted. Its people need another role first.' : 'Its permissions are deleted. Nobody has this role.'}
      onClose={onClose}
      error={error}
      footer={
        <>
          <button type="button" className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="text-sm font-semibold rounded-lg border border-[#F2C5B8] px-3 py-1.5 text-[#B4442C] hover:bg-[#FDEDE8] disabled:opacity-40" disabled={!ok || busy} onClick={async () => (setBusy(true), await onDelete(has ? moveTo : null), setBusy(false))}>
            {busy ? 'Deleting…' : 'Delete role'}
          </button>
        </>
      }
    >
      {has && (
        <div>
          <label className={eb} htmlFor="role-move">{role.users} {role.users === 1 ? 'person has' : 'people have'} this role. Move them to</label>
          <select id="role-move" className="input-field" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
          {target && <p className="mt-2 rounded-lg bg-[#FFF3D6] px-3 py-2 text-[12px] text-[#5E3E00]">They get {target.name}’s permissions right away{target.key === 'admin' ? ', which is everything' : ''}.</p>}
        </div>
      )}
      <div>
        <label className={eb} htmlFor="role-confirm">Type the role’s name to confirm</label>
        <input id="role-confirm" className="input-field" value={typed} placeholder={role.name} onChange={(e) => setTyped(e.target.value)} />
      </div>
    </Modal>
  );
}

function Cell({ c, role, value, savedValue, compact, open, setOpen, onSet }: { c: Capability; role: RoleDef; value: Value; savedValue?: Value; compact: boolean; open: boolean; setOpen: (o: boolean) => void; onSet: (v: Value) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const admin = role.key === 'admin';
  const locked = admin || !isEditable(c);
  const dflt = def(role, c.key);
  const changedFromDefault = !admin && isEditable(c) && value !== dflt;
  const unsaved = savedValue !== undefined && value !== savedValue;
  useDismiss(open, ref, () => setOpen(false));
  const why = admin ? 'Admin has everything' : !c.shipped ? 'Preview: arrives with its feature' : c.fixed ? 'Decided for everyone' : undefined;
  const chip = `relative inline-flex items-center justify-center gap-1 ${compact ? 'min-w-[5.5rem]' : 'min-w-[6.5rem]'} h-8 md:h-7 px-2 rounded-lg border text-[11.5px] font-bold whitespace-nowrap ${TONE[value]} ${admin && value !== 'off' ? '!bg-[#2B3440] !border-[#2B3440]' : ''} ${!c.shipped ? 'opacity-55 border-dashed' : ''}`;
  if (locked)
    return (
      <span className={chip} title={why} aria-label={`${role.name}: ${LABEL[value]} (${why})`}>
        {compact ? SHORT[value] : LABEL[value]}
        {admin && <LockIcon />}
      </span>
    );
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${role.name} · ${c.label}: ${LABEL[value]}. Change`} onClick={() => setOpen(!open)} className={`${chip} hover:ring-2 hover:ring-[#3F8CEA]/40 focus-visible:ring-2 focus-visible:ring-[#3F8CEA] outline-none ${open ? 'ring-2 ring-[#3F8CEA]' : ''}`}>
        {compact ? SHORT[value] : LABEL[value]}
        {(changedFromDefault || unsaved) && <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${unsaved ? 'bg-[#3F8CEA]' : 'bg-[#E8664A]'}`} aria-hidden="true" title={unsaved ? 'Not saved yet' : 'Differs from the default'} />}
      </button>
      {open && (
        <div role="menu" aria-label={`${role.name} · ${c.label}`} className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-teton-off-white bg-white p-1.5 text-left shadow-[0_14px_34px_rgba(15,23,32,.18)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]">
          <p className="px-2 pt-1 pb-1.5 text-[11.5px] font-semibold">{role.name} · {c.label}</p>
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
                <span className="block text-[12.5px] font-medium">{LABEL[v]}{v === dflt && <span className="ml-1 text-[10.5px] font-normal text-teton-ui-gray">default</span>}</span>
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
