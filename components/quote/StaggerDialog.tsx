'use client';

/**
 * Fill go-live dates in batches: N communities every M months from a first
 * month, in list order (optionally pilot sites first). Leftovers when the
 * count doesn't divide evenly form a final batch at the next increment.
 * Shows the schedule before applying; nothing changes until "Apply".
 */
import { useEffect, useMemo, useState } from 'react';
import { monthName } from '@/lib/format';
import { pilotFirstOrder, staggerBatches } from '@/lib/quote/stagger';
import { monthIndex } from '@/lib/quote/toModelInputs';

interface Props {
  open: boolean;
  onClose: () => void;
  communities: Array<{ name: string; pilot: boolean; goLiveMonth: string | null }>;
  /** 'yyyy-mm' to start from by default (the deal's desired go-live month). */
  defaultFirstMonth: string;
  horizonMonths: number;
  onApply: (months: Array<string | null>) => void;
}

const ymToDate = (ym: string) => `${ym}-01`;

export function StaggerDialog({ open, onClose, communities, defaultFirstMonth, horizonMonths, onApply }: Props) {
  const [first, setFirst] = useState(defaultFirstMonth);
  const [gap, setGap] = useState(3);
  const [per, setPer] = useState(3);
  const anyPilot = communities.some((c) => c.pilot);
  const [pilotFirst, setPilotFirst] = useState(true);

  useEffect(() => {
    if (open) setFirst(defaultFirstMonth);
  }, [open, defaultFirstMonth]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const valid = /^\d{4}-\d{2}$/.test(first) && gap >= 1 && per >= 1 && communities.length > 0;
  const order = useMemo(() => (anyPilot && pilotFirst ? pilotFirstOrder(communities.map((c) => c.pilot)) : communities.map((_, i) => i)), [anyPilot, pilotFirst, communities]);
  const batches = useMemo(() => (valid ? staggerBatches(order, { firstMonth: first, monthsBetween: gap, perBatch: per }) : []), [valid, order, first, gap, per]);
  const overwrites = communities.filter((c) => c.goLiveMonth).length;
  const last = batches[batches.length - 1];
  const lastMonthNo = last ? monthIndex(ymToDate(first), last.month) : 0;
  const remainder = communities.length % per;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="stagger-title">
      <button type="button" className="absolute inset-0 bg-teton-ink/40" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl max-h-[100dvh] sm:max-h-[90dvh] flex flex-col sm:rounded-xl shadow-xl">
        <div className="px-5 py-4 border-b border-teton-off-white flex items-start justify-between gap-4">
          <div>
            <h2 id="stagger-title" className="text-lg font-semibold">Stagger go-live dates</h2>
            <p className="text-sm text-teton-ui-gray">Go live in batches, a set number of months apart, in the order the communities are listed.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="stagger-first">First go-live</label>
              <input id="stagger-first" type="month" className="input-field px-2" value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="stagger-gap">Months between go-lives</label>
              <input id="stagger-gap" type="number" min={1} step={1} className="input-field" value={gap} onChange={(e) => setGap(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            </div>
            <div>
              <label className="label" htmlFor="stagger-per">Communities per go-live</label>
              <input id="stagger-per" type="number" min={1} step={1} className="input-field" value={per} onChange={(e) => setPer(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            </div>
          </div>
          {anyPilot && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-teton-near-black" checked={pilotFirst} onChange={(e) => setPilotFirst(e.target.checked)} />
              Put pilot sites in the first go-live
            </label>
          )}

          {valid ? (
            <div>
              <p className="text-sm font-medium mb-2">
                {batches.length} go-live {batches.length === 1 ? 'date' : 'dates'} for {communities.length} communities
                {remainder > 0 && communities.length > per && (
                  <span className="font-normal text-teton-dark-gray"> — the {remainder} left over go{remainder === 1 ? 'es' : ''} last, {gap} months after the previous batch</span>
                )}
              </p>
              <ol className="space-y-2">
                {batches.map((b, k) => (
                  <li key={b.month} className="rounded-lg border border-teton-off-white px-3 py-2">
                    <p className="text-sm font-semibold">
                      {monthName(ymToDate(b.month), 1)}
                      <span className="font-normal text-teton-dark-gray"> · {b.indices.length} {b.indices.length === 1 ? 'community' : 'communities'}{k === batches.length - 1 && remainder > 0 && communities.length > per ? ' (remainder)' : ''}</span>
                    </p>
                    <p className="text-xs text-teton-dark-gray mt-0.5">
                      {b.indices.map((i) => communities[i].name || `Community ${i + 1}`).join(', ')}
                    </p>
                  </li>
                ))}
              </ol>
              {lastMonthNo > horizonMonths && (
                <p className="text-sm bg-teton-pale-yellow rounded px-2 py-1 mt-3">
                  The last batch goes live in month {lastMonthNo}, after the {horizonMonths}-month model horizon, so it won’t show in the results. Shorten the gap or raise the horizon in Timeline.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm bg-teton-pale-yellow rounded px-2 py-1">Choose a first month and use at least 1 month and 1 community per go-live.</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-teton-off-white flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-teton-dark-gray">{overwrites > 0 ? `Replaces ${overwrites} go-live ${overwrites === 1 ? 'date' : 'dates'} already set.` : ''}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost py-2" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={!valid}
              onClick={() => {
                const months: Array<string | null> = communities.map(() => null);
                batches.forEach((b) => b.indices.forEach((i) => (months[i] = b.month)));
                onApply(months);
              }}
            >
              Apply to {communities.length} {communities.length === 1 ? 'community' : 'communities'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
