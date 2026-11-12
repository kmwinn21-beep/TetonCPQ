'use client';

import { useState } from 'react';
import { ROLE_LABEL, ROLES, type Role, type User } from '@/lib/auth/roles';
import { dateLabel } from '@/lib/format';

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export function UsersAdmin({ initial, meId }: { initial: User[]; meId: number }) {
  const [users, setUsers] = useState(initial);
  const [form, setForm] = useState({ name: '', email: '', role: 'rep' as Role, password: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const replace = (u: User) => setUsers((us) => us.map((x) => (x.id === u.id ? u : x)));
  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-teton-ui-gray">Add the team, set roles, and switch people off when they leave. Share the starting password with them directly; they can change it under their account.</p>
      </div>
      {msg && <p role="status" className={`text-sm rounded px-3 py-2 ${msg.ok ? 'bg-teton-pale-green' : 'bg-teton-red/30'}`}>{msg.text}</p>}

      <form
        className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_9rem_1fr_auto] items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const u = await call('/api/users', 'POST', form);
            setUsers((us) => [...us, u]);
            setForm({ name: '', email: '', role: 'rep', password: '' });
            setMsg({ ok: true, text: `Added ${u.name}.` });
          });
        }}
      >
        <div>
          <label className="label" htmlFor="nu-name">Name</label>
          <input id="nu-name" className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="nu-email">Email</label>
          <input id="nu-email" type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="nu-role">Role</label>
          <select id="nu-role" className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nu-pw">Starting password</label>
          <input id="nu-pw" type="text" autoComplete="off" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
        </div>
        <button className="btn-primary">Add user</button>
      </form>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Added</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-teton-off-white ${u.active ? '' : 'text-teton-ui-gray'}`}>
                <td className="px-4 py-3">
                  <p className="font-medium">{u.name}{u.id === meId && <span className="badge-gray ml-2">you</span>}</p>
                  <p className="text-xs text-teton-ui-gray">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Role for ${u.name}`}
                    className="input-field py-1"
                    value={u.role}
                    onChange={(e) => run(async () => replace(await call(`/api/users/${u.id}`, 'PATCH', { role: e.target.value })))}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">{u.active ? <span className="badge-green">Active</span> : <span className="badge-gray">Deactivated</span>}</td>
                <td className="px-4 py-3 text-teton-ui-gray">{dateLabel(u.createdAt)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      const pw = window.prompt(`New password for ${u.name} (at least 10 characters)`);
                      if (pw) run(async () => { await call(`/api/users/${u.id}`, 'PATCH', { password: pw }); setMsg({ ok: true, text: `Password reset for ${u.name}.` }); });
                    }}
                  >
                    Reset password
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => run(async () => replace(await call(`/api/users/${u.id}`, 'PATCH', { active: !u.active })))}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
