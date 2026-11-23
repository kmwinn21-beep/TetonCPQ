'use client';

/**
 * Right panel: Deal Details. The operator's legal entity, geography, HubSpot deal link (required), signatories and
 * projected close date — one set for the deal. Empty: a form. Saved: a card with Edit (the whole form) and any
 * value editable in place (Enter or clicking away saves, Esc cancels). Read-only without Edit Inputs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { defaultCloseDate, EMAIL, GEOGRAPHIES, isHubspotUrl, type DealDetails, type Geography, type Signatory } from '@/lib/data/dealDetails';
import { useAccess } from './AccessContext';
import { canAutoFocus } from '@/lib/client/focus';
import { panelElId, usePanelOpener } from './panelNav';

const blankSig = (): Signatory => ({ first: '', last: '', title: '', email: '' });
const fresh = (): DealDetails => ({ legalEntity: '', geography: '', geographyOther: '', hubspotUrl: '', signatories: [], closeDate: defaultCloseDate() });
const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const daysTo = (iso: string) => (iso ? Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null);
const geoText = (d: DealDetails) => (d.geography === 'Other' ? d.geographyOther || 'Other' : d.geography);
const initials = (s: Signatory) => `${s.first[0] ?? ''}${s.last[0] ?? ''}`.toUpperCase() || '?';
const eyebrow = 'block text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray mb-0.5';
/** Close date colours: green, amber within 14 days, red once passed. */
const dateTone = (days: number) => (days < 0 ? 'bg-teton-red/30 text-[#9A2E1C]' : days <= 14 ? 'bg-[#FFF1DC] text-[#8A5A00]' : 'bg-teton-pale-green text-[#256B41]');
const icon = (path: React.ReactNode) => (
  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);
const ICONS = {
  entity: icon(<><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10" /><path d="M3 21h18" /><path d="M8 7h4M8 11h4M8 15h4" /></>),
  geo: icon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></>),
  signor: icon(<><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /><path d="M3 22c3-1 5-1 7 0s5 1 8-1" /></>),
  close: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  done: (
    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
};

/** Entity · Geo · Signor(s) · Close Date: ✓ and green when done, the field's icon in dashed amber when outstanding. */
function StatusPills({ d, days }: { d: DealDetails; days: number | null }) {
  const items: Array<{ key: keyof typeof ICONS; label: string; done: boolean; value: string; tone?: string }> = [
    { key: 'entity', label: 'Entity', done: !!d.legalEntity.trim(), value: d.legalEntity },
    { key: 'geo', label: 'Geo', done: !!d.geography && (d.geography !== 'Other' || !!d.geographyOther.trim()), value: geoText(d) },
    { key: 'signor', label: 'Signor(s)', done: d.signatories.length > 0, value: d.signatories.map((x) => [x.first, x.last].filter(Boolean).join(' ')).join(', ') },
    { key: 'close', label: 'Close Date', done: !!d.closeDate, value: d.closeDate ? `${fmtDate(d.closeDate)}${days == null ? '' : days < 0 ? ` · ${-days} days ago` : ` · in ${days} days`}` : '', tone: days == null ? undefined : dateTone(days) },
  ];
  return (
    <>
      {items.map((it) => (
        <span
          key={it.key}
          className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors duration-200 ${it.done ? `px-2 py-0.5 ${it.tone ?? 'bg-teton-pale-green text-[#256B41]'}` : 'px-[7px] py-px border border-dashed border-[#E0B04A] bg-white text-[#8A5A00]'}`}
          title={it.done ? `${it.label}: ${it.value}` : `${it.label}: still needed`}
        >
          {it.done ? ICONS.done : ICONS[it.key]}
          {it.label}
        </span>
      ))}
    </>
  );
}
const label = 'block text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray mt-2.5 mb-1';

export function DealDetailsPanel({ quoteId }: { quoteId: number }) {
  const acc = useAccess();
  const canEdit = acc.inputs;
  const [open, setOpen] = useState(false);
  usePanelOpener('deal-details', setOpen);
  const [details, setDetails] = useState<DealDetails | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/quotes/${quoteId}/details`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => live && setDetails(b?.details ?? null))
      .catch(() => live && setDetails(null));
    return () => {
      live = false;
    };
  }, [quoteId]);
  const save = useCallback(
    async (next: DealDetails) => {
      setError(null);
      const r = await fetch(`/api/quotes/${quoteId}/details`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(b.error ?? 'Couldn’t save the details');
        return false;
      }
      setDetails(b.details);
      return true;
    },
    [quoteId],
  );
  if (details === undefined) return null;
  const d = details;
  const days = d ? daysTo(d.closeDate) : null;
  return (
    <section className="card" aria-label="Deal details" id={panelElId('deal-details')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <button type="button" className="flex flex-1 sm:flex-none min-w-0 items-center gap-2 text-left" aria-expanded={open} aria-controls="deal-details" onClick={() => setOpen((o) => !o)}>
        <svg className={`w-4 h-4 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
        <h2 className="text-sm font-semibold whitespace-nowrap">Deal Details</h2>
      </button>
      {/* Edit (while open): beside the title on phones, at the end of the pill row otherwise. */}
      {open && d && canEdit && !editing && (
        <button type="button" className="sm:order-last flex-shrink-0 btn-secondary py-0.5 px-2 text-xs [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]" onClick={() => setEditing(true)}>
          ✎ Edit
        </button>
      )}
      {/* What's done and what's outstanding (display only). Phones: one line under the title that swipes sideways. */}
      {/* Desktop: right of the title, dropping under it (right-aligned) when the panel is too narrow for one row. */}
      <div className="relative max-sm:w-full sm:ml-auto min-w-0">
        <div className="flex items-center gap-1 max-sm:overflow-x-auto no-scrollbar max-sm:pr-6 sm:flex-wrap sm:justify-end" aria-label="Deal details status">
          {d ? <StatusPills d={d} days={days} /> : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF1DC] text-[#8A5A00] whitespace-nowrap">All Details Needed</span>}
        </div>
        <span className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white" aria-hidden="true" />
      </div>
      </div>
      <Collapse open={open} id="deal-details">
        <div className="pt-2">
          {!d && !canEdit ? (
            <p className="text-sm text-teton-ui-gray">No deal details yet.</p>
          ) : !d || editing ? (
            <DetailsForm
              initial={d ?? fresh()}
              canCancel={!!d}
              error={error}
              onCancel={() => {
                setEditing(false);
                setError(null);
              }}
              onSave={async (next) => {
                if (await save(next)) setEditing(false);
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,.8fr)_minmax(0,.9fr)] gap-x-4 gap-y-3 text-[13px] items-start pt-1">
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <span className={eyebrow}>Legal entity</span>
                  <Inline canEdit={canEdit} value={d.legalEntity} display={d.legalEntity || <span className="text-teton-ui-gray italic">Add the legal entity</span>} onSave={(v) => save({ ...d, legalEntity: v })} />
                </div>
                <div className="min-w-0">
                  <span className={eyebrow}>Geography</span>
                  <InlineGeo canEdit={canEdit} d={d} onSave={(g, other) => save({ ...d, geography: g, geographyOther: other })} />
                </div>
                <div className="min-w-0">
                  <span className={eyebrow}>HubSpot</span>
                  <Inline
                    canEdit={canEdit}
                    value={d.hubspotUrl}
                    validate={(v) => (!v.trim() ? 'The HubSpot deal link is required' : !isHubspotUrl(v) ? 'Use the full address, starting with https://' : null)}
                    display={
                      <a href={d.hubspotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#1F5FB5] hover:underline whitespace-nowrap" onClick={(e) => e.stopPropagation()} title="Open the deal in HubSpot (new tab)">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
                          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
                        </svg>
                        Open Deal
                      </a>
                    }
                    onSave={(v) => save({ ...d, hubspotUrl: v })}
                  />
                </div>
              </div>
              <div className="mt-3.5">
                <span className={eyebrow}>Signatories</span>
                {d.signatories.length === 0 && <p className="text-teton-ui-gray italic text-[12.5px]">None yet</p>}
                <div className="divide-y divide-teton-off-white">
                  {d.signatories.map((s, i) => (
                    <InlineSignatory
                      key={i}
                      canEdit={canEdit}
                      s={s}
                      onSave={(next) => save({ ...d, signatories: d.signatories.map((x, j) => (j === i ? next : x)) })}
                      onRemove={() => save({ ...d, signatories: d.signatories.filter((_, j) => j !== i) })}
                    />
                  ))}
                </div>
                {canEdit && <div className="mt-1.5"><AddSignatory onAdd={(s) => save({ ...d, signatories: [...d.signatories, s] })} /></div>}
              </div>
              <div className="mt-3.5 text-[13px]">
                <span className={eyebrow}>Close date</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Inline canEdit={canEdit} type="date" value={d.closeDate} display={fmtDate(d.closeDate) || <span className="text-teton-ui-gray italic">Not set</span>} onSave={(v) => save({ ...d, closeDate: v })} />
                  {days != null && (
                    <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full ${dateTone(days)}`}>
                      {days < 0 ? `${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}
                    </span>
                  )}
                </div>
              </div>
              {error && <p className="mt-2 text-xs text-[#9A2E1C] drawer-in" role="alert">{error}</p>}
            </>
          )}
        </div>
      </Collapse>
    </section>
  );
}

// ---------------------------------------------------------------- the form

function DetailsForm({ initial, canCancel, error, onCancel, onSave }: { initial: DealDetails; canCancel: boolean; error: string | null; onCancel: () => void; onSave: (d: DealDetails) => Promise<void> }) {
  const [f, setF] = useState<DealDetails>(initial);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (p: Partial<DealDetails>) => setF((x) => ({ ...x, ...p }));
  const hubErr = !f.hubspotUrl.trim() ? 'The HubSpot deal link is required' : !isHubspotUrl(f.hubspotUrl) ? 'Use the full address, starting with https://' : null;
  const emailErr = f.signatories.findIndex((s) => s.email.trim() && !EMAIL.test(s.email.trim()));
  // (Not a <form>: the card sits inside the deal page's form, and forms can't nest.)
  const submit = async () => {
    setTried(true);
    if (hubErr || emailErr >= 0) return;
    setBusy(true);
    await onSave(f);
    setBusy(false);
  };
  return (
    <div
      role="group"
      aria-label="Deal details form"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <label className={`${label} !mt-0`} htmlFor="dd-entity">Operator’s legal entity name</label>
      <input id="dd-entity" className="input-field text-sm" value={f.legalEntity} maxLength={200} placeholder="e.g. ABC Senior Living Holdings, LLC" onChange={(e) => set({ legalEntity: e.target.value })} />
      <label className={label} htmlFor="dd-geo">Geography</label>
      <select id="dd-geo" className="input-field text-sm" value={f.geography} onChange={(e) => set({ geography: e.target.value as Geography | '' })}>
        <option value="">Choose…</option>
        {GEOGRAPHIES.map((g) => <option key={g} value={g}>{g === 'Other' ? 'Other…' : g}</option>)}
      </select>
      {f.geography === 'Other' && (
        <input className="input-field text-sm mt-1.5 drawer-in" value={f.geographyOther} maxLength={60} placeholder="Geography" aria-label="Other geography" autoFocus={canAutoFocus()} onChange={(e) => set({ geographyOther: e.target.value })} />
      )}
      <label className={label} htmlFor="dd-hub">HubSpot link <span className="text-[#9A2E1C]">*</span></label>
      <input
        id="dd-hub"
        className={`input-field text-sm ${tried && hubErr ? 'ring-2 ring-teton-red border-transparent' : ''}`}
        value={f.hubspotUrl}
        maxLength={500}
        inputMode="url"
        placeholder="https://app.hubspot.com/contacts/…/deal/…"
        aria-invalid={tried && !!hubErr}
        onChange={(e) => set({ hubspotUrl: e.target.value })}
      />
      {tried && hubErr && <p className="mt-1 text-[11.5px] text-[#9A2E1C] drawer-in">{hubErr}</p>}
      <div className={`${label} flex items-center justify-between`}>
        <span>Signatories</span>
        <button type="button" className="btn-secondary py-0.5 px-2 text-[11px] normal-case tracking-normal" onClick={() => set({ signatories: [...f.signatories, blankSig()] })}>+ Signatory</button>
      </div>
      {f.signatories.map((s, i) => (
        <div key={i} className="mt-1.5 rounded-lg border border-teton-off-white bg-teton-almost-white p-2 drawer-in">
          <div className="flex items-center justify-between text-[11px] text-teton-ui-gray mb-1">
            <b className="text-teton-ink text-xs">Signatory {i + 1}</b>
            <button type="button" className="text-[#B23A26] underline" onClick={() => set({ signatories: f.signatories.filter((_, j) => j !== i) })}>Remove</button>
          </div>
          <SigFields s={s} invalidEmail={tried && emailErr === i} onChange={(n) => set({ signatories: f.signatories.map((x, j) => (j === i ? n : x)) })} />
        </div>
      ))}
      <label className={label} htmlFor="dd-close">Projected close date</label>
      <input id="dd-close" type="date" className="input-field text-sm" value={f.closeDate} onChange={(e) => set({ closeDate: e.target.value })} />
      {error && <p className="mt-2 text-xs text-[#9A2E1C]" role="alert">{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        {canCancel && <button type="button" className="btn-ghost py-1 text-sm" onClick={onCancel}>Cancel</button>}
        <button type="button" className="btn-primary py-1 text-sm disabled:opacity-50" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function SigFields({ s, invalidEmail, onChange }: { s: Signatory; invalidEmail?: boolean; onChange: (s: Signatory) => void }) {
  const cell = 'input-field py-1.5 text-[12.5px]';
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <input className={cell} value={s.first} placeholder="First name" aria-label="First name" maxLength={80} onChange={(e) => onChange({ ...s, first: e.target.value })} />
      <input className={cell} value={s.last} placeholder="Last name" aria-label="Last name" maxLength={80} onChange={(e) => onChange({ ...s, last: e.target.value })} />
      <input className={`${cell} col-span-2`} value={s.title} placeholder="Title" aria-label="Title" maxLength={120} onChange={(e) => onChange({ ...s, title: e.target.value })} />
      <input className={`${cell} col-span-2 ${invalidEmail ? 'ring-2 ring-teton-red border-transparent' : ''}`} type="email" value={s.email} placeholder="Email address" aria-label="Email address" maxLength={200} onChange={(e) => onChange({ ...s, email: e.target.value })} />
      {invalidEmail && <p className="col-span-2 text-[11px] text-[#9A2E1C]">Check this email address</p>}
    </div>
  );
}

// ---------------------------------------------------------------- editing one value in place

function Inline({ canEdit, value, display, type = 'text', validate, onSave }: { canEdit: boolean; value: string; display: React.ReactNode; type?: 'text' | 'date'; validate?: (v: string) => string | null; onSave: (v: string) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(false);
  if (!canEdit) return <span className="block min-w-0 break-words py-0.5">{display}</span>;
  if (!edit)
    return (
      <span
        role="button"
        tabIndex={0}
        className="group/in inline-flex max-w-full items-center gap-1 rounded px-1 -mx-1 py-0.5 cursor-text hover:bg-[#FFF8E0] hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#E0B04A] break-words"
        onClick={() => {
          setV(value);
          setErr(null);
          done.current = false;
          setEdit(true);
        }}
        onKeyDown={(e) => e.key === 'Enter' && setEdit(true)}
        title="Click to edit"
      >
        <span className="min-w-0">{display}</span>
        <span className="text-[10px] text-teton-ui-gray opacity-0 group-hover/in:opacity-100 transition-opacity" aria-hidden="true">✎</span>
      </span>
    );
  const commit = async () => {
    if (done.current) return;
    if (v.trim() === value) return setEdit(false);
    const e = validate?.(v) ?? null;
    if (e) return setErr(e);
    done.current = true;
    if (await onSave(v.trim())) setEdit(false);
    else done.current = false;
  };
  return (
    <span className="block">
      <input
        autoFocus
        type={type}
        className={`input-field py-1 text-[13px] ${err ? 'ring-2 ring-teton-red border-transparent' : ''}`}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setErr(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          }
          if (e.key === 'Escape') {
            done.current = true;
            setEdit(false);
          }
        }}
      />
      <span className={`block text-[10.5px] mt-0.5 ${err ? 'text-[#9A2E1C]' : 'text-teton-ui-gray'}`}>{err ?? 'Enter to save · Esc to cancel'}</span>
    </span>
  );
}

function InlineGeo({ canEdit, d, onSave }: { canEdit: boolean; d: DealDetails; onSave: (g: Geography | '', other: string) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false);
  const [g, setG] = useState<Geography | ''>(d.geography);
  const [other, setOther] = useState(d.geographyOther);
  const shown = geoText(d) ? (
    <>
      {geoText(d)}
      {d.geography === 'Other' && <span className="ml-1.5 text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-teton-off-white text-teton-dark-gray">Other</span>}
    </>
  ) : (
    <span className="text-teton-ui-gray">Choose a geography</span>
  );
  if (!canEdit || !edit)
    return (
      <Inline
        canEdit={false}
        value=""
        display={
          canEdit ? (
            <span role="button" tabIndex={0} className="group/in inline-flex items-center gap-1 rounded px-1 -mx-1 cursor-text hover:bg-[#FFF8E0] hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#E0B04A]" onClick={() => { setG(d.geography); setOther(d.geographyOther); setEdit(true); }} onKeyDown={(e) => e.key === 'Enter' && setEdit(true)} title="Click to edit">
              {shown}
              <span className="text-[10px] text-teton-ui-gray opacity-0 group-hover/in:opacity-100 transition-opacity" aria-hidden="true">✎</span>
            </span>
          ) : (
            shown
          )
        }
        onSave={async () => true}
      />
    );
  const commit = async (ng = g, no = other) => {
    if (ng === d.geography && (ng !== 'Other' || no.trim() === d.geographyOther)) return setEdit(false);
    if (ng === 'Other' && !no.trim()) return;
    if (await onSave(ng, ng === 'Other' ? no.trim() : '')) setEdit(false);
  };
  return (
    <span className="block" onKeyDown={(e) => e.key === 'Escape' && setEdit(false)}>
      <select
        autoFocus
        className="input-field py-1 text-[13px]"
        value={g}
        onChange={(e) => {
          const v = e.target.value as Geography | '';
          setG(v);
          if (v !== 'Other') void commit(v, '');
        }}
        aria-label="Geography"
      >
        <option value="">Choose…</option>
        {GEOGRAPHIES.map((x) => <option key={x} value={x}>{x === 'Other' ? 'Other…' : x}</option>)}
      </select>
      {g === 'Other' && (
        <input autoFocus className="input-field py-1 text-[13px] mt-1" value={other} placeholder="Geography" aria-label="Other geography" onChange={(e) => setOther(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          }
        }} />
      )}
      <span className="block text-[10.5px] mt-0.5 text-teton-ui-gray">Esc to cancel</span>
    </span>
  );
}

function InlineSignatory({ canEdit, s, onSave, onRemove }: { canEdit: boolean; s: Signatory; onSave: (s: Signatory) => Promise<boolean>; onRemove: () => Promise<boolean> }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(s);
  const [bad, setBad] = useState(false);
  // One line: initials, name, title as a pill, email (truncates when long).
  const person = (
    <span className="flex items-center gap-2 min-w-0 py-1.5 text-[12.5px] whitespace-nowrap">
      <span className="w-[22px] h-[22px] flex-shrink-0 rounded-full bg-[#E5EEFC] text-[#2B5BB5] text-[9px] font-bold flex items-center justify-center">{initials(s)}</span>
      <b className="font-semibold flex-shrink-0">{[s.first, s.last].filter(Boolean).join(' ') || 'Unnamed'}</b>
      {s.title && <span className="flex-shrink-0 max-w-[45%] truncate rounded-full bg-[#F1E9FB] px-2 py-px text-[10.5px] font-bold text-[#6A3FB0]">{s.title}</span>}
      {s.email && <a href={`mailto:${s.email}`} className="min-w-0 truncate text-[#1F5FB5] underline" onClick={(e) => e.stopPropagation()}>{s.email}</a>}
    </span>
  );
  if (!canEdit) return person;
  if (!edit)
    return (
      <div role="button" tabIndex={0} className="rounded-md px-1 -mx-1 cursor-pointer hover:bg-[#FFF8E0] hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#E0B04A]" onClick={() => { setV(s); setBad(false); setEdit(true); }} onKeyDown={(e) => e.key === 'Enter' && setEdit(true)} title="Click to edit">
        {person}
      </div>
    );
  return (
    <div className="rounded-lg border border-teton-off-white bg-teton-almost-white p-2 drawer-in" onKeyDown={(e) => e.key === 'Escape' && setEdit(false)}>
      <SigFields s={v} invalidEmail={bad} onChange={(n) => { setV(n); setBad(false); }} />
      <div className="flex items-center justify-between mt-1.5">
        <button type="button" className="text-[11px] text-[#B23A26] underline" onClick={() => void onRemove()}>Remove</button>
        <span className="flex gap-1.5">
          <button type="button" className="btn-ghost py-0.5 text-[11px]" onClick={() => setEdit(false)}>Cancel</button>
          <button
            type="button"
            className="btn-primary py-0.5 px-2.5 text-[11px]"
            onClick={async () => {
              if (v.email.trim() && !EMAIL.test(v.email.trim())) return setBad(true);
              if (await onSave(v)) setEdit(false);
            }}
          >
            Done
          </button>
        </span>
      </div>
    </div>
  );
}

function AddSignatory({ onAdd }: { onAdd: (s: Signatory) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blankSig());
  const [bad, setBad] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn-secondary py-0.5 px-2 text-[11px]" onClick={() => { setV(blankSig()); setOpen(true); }}>
        + Signatory
      </button>
    );
  return (
    <div className="rounded-lg border border-teton-off-white bg-teton-almost-white p-2 drawer-in" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <SigFields s={v} invalidEmail={bad} onChange={(n) => { setV(n); setBad(false); }} />
      <div className="flex justify-end gap-1.5 mt-1.5">
        <button type="button" className="btn-ghost py-0.5 text-[11px]" onClick={() => setOpen(false)}>Cancel</button>
        <button
          type="button"
          className="btn-primary py-0.5 px-2.5 text-[11px] disabled:opacity-40"
          disabled={!(v.first || v.last || v.email)}
          onClick={async () => {
            if (v.email.trim() && !EMAIL.test(v.email.trim())) return setBad(true);
            if (await onAdd(v)) setOpen(false);
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
