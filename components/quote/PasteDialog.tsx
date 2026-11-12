'use client';

/**
 * Two steps, nothing touches the form until the last click:
 *   1. Paste — from the NIC MAP portal (building cards) or any spreadsheet.
 *      The format is detected; for spreadsheets the columns can be re-mapped.
 *   2. Review — every community as an editable row: include or skip, fix
 *      name / market / beds / SNF beds, see what NIC said (city, operator,
 *      care mix), and choose to add to or replace the communities already in
 *      the deal. Communities already in the deal are flagged and skipped by default.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { looksLikeNicCopy, parseNicCopy, type CareType } from '@/lib/quote/nic';
import { parsePaste, type ColumnMap, type PastedCommunity } from '@/lib/quote/paste';
import { count } from '@/lib/format';
import { NumInput } from '@/components/form/NumInput';

interface ReviewRow extends PastedCommunity {
  key: number;
  include: boolean;
  duplicate: boolean;
  detail: string;
}

export type PasteMode = 'append' | 'replace';

const CARE_ORDER: CareType[] = ['IL', 'AL', 'MC', 'NC', 'AA'];
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function PasteDialog({
  open,
  onClose,
  existingNames,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  existingNames: string[];
  onConfirm: (rows: PastedCommunity[], mode: PasteMode) => void;
}) {
  const [step, setStep] = useState<'paste' | 'review'>('paste');
  const [text, setText] = useState('');
  const [cols, setCols] = useState<Partial<ColumnMap>>({});
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [mode, setMode] = useState<PasteMode>('append');
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep('paste');
    setText('');
    setCols({});
    setRows([]);
    setMode('append');
    setTimeout(() => textRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const isNic = looksLikeNicCopy(text);
  const nic = useMemo(() => (isNic ? parseNicCopy(text) : null), [isNic, text]);
  const table = useMemo(() => (!isNic && text.trim() ? parsePaste(text, cols) : null), [isNic, text, cols]);
  const found: PastedCommunity[] = nic ? nic.buildings : table ? table.communities : [];
  const skipped = nic ? nic.skipped : table?.skipped ?? 0;
  const existing = useMemo(() => new Set(existingNames.filter(Boolean).map(norm)), [existingNames]);

  function toReview() {
    setRows(
      (nic ? nic.buildings : found).map((c, key) => {
        const b = nic?.buildings[key];
        const mix = b ? CARE_ORDER.filter((t) => (b.careMix[t] ?? 0) > 0).map((t) => `${t} ${b.careMix[t]}`).join(' · ') : '';
        const detail = b ? [b.city && `${b.city}, ${b.state}`, b.operator, mix].filter(Boolean).join(' — ') : '';
        const duplicate = existing.has(norm(c.name));
        return { name: c.name, market: c.market, beds: c.beds, snfBeds: c.snfBeds, key, include: !duplicate, duplicate, detail };
      }),
    );
    setStep('review');
  }

  const update = (key: number, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const included = rows.filter((r) => r.include);
  const invalid = included.filter((r) => !r.name.trim() || (Number(r.beds) || 0) + (Number(r.snfBeds) || 0) <= 0);
  const totalBeds = included.reduce((s, r) => s + (Number(r.beds) || 0) + (Number(r.snfBeds) || 0), 0);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="paste-title">
      <button type="button" className="absolute inset-0 bg-teton-ink/40" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="relative bg-white w-full max-w-5xl max-h-[100dvh] sm:max-h-[90dvh] flex flex-col sm:rounded-xl shadow-xl">
        <div className="px-5 py-4 border-b border-teton-off-white flex items-start justify-between gap-4">
          <div>
            <h2 id="paste-title" className="text-lg font-semibold">{step === 'paste' ? 'Paste communities' : 'Review communities'}</h2>
            <p className="text-sm text-teton-ui-gray">
              {step === 'paste'
                ? 'Step 1 of 2 — paste from the NIC MAP portal or a spreadsheet.'
                : 'Step 2 of 2 — check and fix anything before it goes into the deal. Nothing has been added yet.'}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === 'paste' ? (
          <div className="p-5 overflow-y-auto space-y-4">
            <div>
              <label htmlFor="paste-text" className="label">
                In NIC MAP (Industry → Buildings → List), select the buildings and copy, or copy rows from Excel. Either works.
              </label>
              <textarea
                id="paste-text"
                ref={textRef}
                className="input-field font-mono text-xs h-56"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setCols({});
                }}
                placeholder={'Maple Alcove at Elmwood\nExample Senior Living\n1108 Regency Way\nElmwood, KY 42701\nTotal Units\t29\nAA\tIL\tAL\tMC\tNC\n0\t0\t10\t19\t0\n\n— or spreadsheet rows —\n#\tCommunity Name\tMarket\tTotal Units\n1\tMaple Grove\tCO\t137'}
              />
            </div>

            {text.trim() && (
              <div className={`rounded-lg px-3 py-2 text-sm ${found.length ? 'bg-teton-pale-green' : 'bg-teton-pale-yellow'}`} role="status">
                {isNic ? 'NIC MAP portal copy detected' : 'Spreadsheet rows detected'} — {found.length} {found.length === 1 ? 'community' : 'communities'} found
                {found.length > 0 && `, ${count(found.reduce((s, c) => s + c.beds + c.snfBeds, 0))} units`}
                {skipped > 0 && ` · ${skipped} skipped (no name or no units)`}
                {!found.length && !isNic && ' — choose the name and units columns below.'}
              </div>
            )}

            {table && (
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                {(
                  [
                    ['name', 'Community name'],
                    ['market', 'Market'],
                    ['units', 'Beds / units'],
                    ['snf', 'SNF beds'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="label" htmlFor={`paste-${key}`}>{label} column</label>
                    <select
                      id={`paste-${key}`}
                      className="input-field py-1.5"
                      value={table.columns[key] ?? ''}
                      onChange={(e) => setCols((c) => ({ ...c, [key]: e.target.value === '' ? null : Number(e.target.value) }))}
                    >
                      <option value="">{key === 'name' || key === 'units' ? 'Not found — choose' : 'None'}</option>
                      {table.columnLabels.map((l, ci) => (
                        <option key={ci} value={ci}>{`Column ${ci + 1}: ${l}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-y-auto">
            <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-3 text-sm">
                <button type="button" className="btn-ghost" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}>Include all</button>
                <button type="button" className="btn-ghost" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}>Include none</button>
              </div>
              {existing.size > 0 && (
                <fieldset className="flex flex-wrap gap-4 text-sm">
                  <legend className="sr-only">Add or replace</legend>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="paste-mode" className="accent-teton-near-black" checked={mode === 'append'} onChange={() => setMode('append')} />
                    Add to the {existing.size} already in this deal
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="paste-mode" className="accent-teton-near-black" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                    Replace them
                  </label>
                </fieldset>
              )}
            </div>
            <div className="px-5 py-3 overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-xs text-teton-dark-gray text-left">
                  <tr>
                    <th className="font-medium py-1.5 w-10"><span className="sr-only">Include</span></th>
                    <th className="font-medium py-1.5 pr-2">Community</th>
                    <th className="font-medium py-1.5 pr-2 w-24">Market</th>
                    <th className="font-medium py-1.5 pr-2 w-24">Beds</th>
                    <th className="font-medium py-1.5 pr-2 w-24">SNF beds</th>
                    <th className="font-medium py-1.5">From the source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bad = r.include && (!r.name.trim() || (Number(r.beds) || 0) + (Number(r.snfBeds) || 0) <= 0);
                    return (
                      <tr key={r.key} className={`border-t border-teton-off-white align-top ${r.include ? '' : 'opacity-50'}`}>
                        <td className="py-2">
                          <input type="checkbox" className="h-4 w-4 mt-2 accent-teton-near-black" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={`Include ${r.name || 'row'}`} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input className={`input-field ${bad && !r.name.trim() ? 'ring-2 ring-teton-red border-transparent' : ''}`} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} aria-label="Community name" disabled={!r.include} />
                          {r.duplicate && <span className="badge-yellow mt-1">Already in this deal</span>}
                        </td>
                        <td className="py-1.5 pr-2">
                          <input className="input-field" value={r.market} onChange={(e) => update(r.key, { market: e.target.value })} aria-label={`Market for ${r.name}`} disabled={!r.include} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <NumInput value={r.beds} onChange={(v) => update(r.key, { beds: v ?? 0 })} min={0} invalid={bad} aria-label={`Beds for ${r.name}`} disabled={!r.include} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <NumInput value={r.snfBeds} onChange={(v) => update(r.key, { snfBeds: v ?? 0 })} min={0} aria-label={`SNF beds for ${r.name}`} disabled={!r.include} />
                        </td>
                        <td className="py-2 text-xs text-teton-dark-gray">{r.detail || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {nic && <p className="hint mt-2">NIC nursing-care (NC) units are counted as SNF beds; everything else as beds. Beds + SNF beds = NIC’s Total Units.</p>}
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-t border-teton-off-white flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-teton-dark-gray">
            {step === 'review' &&
              (invalid.length
                ? `${invalid.length} included ${invalid.length === 1 ? 'row needs' : 'rows need'} a name and beds.`
                : `${mode === 'replace' ? 'Replacing with' : 'Adding'} ${included.length} ${included.length === 1 ? 'community' : 'communities'} · ${count(totalBeds)} beds`)}
          </p>
          <div className="flex gap-2">
            {step === 'review' && <button type="button" className="btn-secondary" onClick={() => setStep('paste')}>Back</button>}
            <button type="button" className="btn-ghost py-2" onClick={onClose}>Cancel</button>
            {step === 'paste' ? (
              <button type="button" className="btn-primary" disabled={!found.length} onClick={toReview}>
                Review {found.length || ''} {found.length === 1 ? 'community' : 'communities'} →
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={!included.length || invalid.length > 0}
                onClick={() => onConfirm(included.map(({ name, market, beds, snfBeds }) => ({ name: name.trim(), market: market.trim(), beds: Number(beds) || 0, snfBeds: Number(snfBeds) || 0 })), mode)}
              >
                {mode === 'replace' ? 'Replace with' : 'Add'} {included.length} {included.length === 1 ? 'community' : 'communities'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
