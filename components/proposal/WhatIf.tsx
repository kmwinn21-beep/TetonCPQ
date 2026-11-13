'use client';

/**
 * Changing deal inputs from the proposal. Click a calculated figure to see the
 * inputs behind it in a panel on the right; edit them and the proposal
 * recalculates in the browser straight away. Nothing is saved until "Save all
 * changes", which saves the deal as its next version (with this proposal's
 * wording and layout) and opens that version's proposal. Until then an amber
 * bar stays up, printing and "Record as sent" are off, and leaving asks first.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { runModel, type Trace } from '@/lib/model';
import { priceBook, type Product } from '@/lib/pricing/catalog';
import type { PriceLine } from '@/lib/pricing/lines';
import type { QuoteDraft } from '@/lib/quote/draft';
import { computeOutputs, type StoredOutputs } from '@/lib/quote/outputs';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { allFields, applyChanges, effectiveChanges, fieldByPath, figureSpec, formatField, getPath, traceFields, type Changes, type WhatIfField } from '@/lib/proposal/whatIf';
import { NumInput } from '@/components/form/NumInput';

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface WhatIfCtx {
  enabled: boolean;
  /** Valid changes, as applied to the preview. */
  changes: Changes;
  dirty: boolean;
  setChange: (path: string, v: number | null | undefined) => void;
  discard: () => void;
  selected: { key: string; label: string } | null;
  select: (key: string, label: string) => void;
  close: () => void;
  /** Text each figure showed in the saved version, by figure key. */
  baseline: React.MutableRefObject<Record<string, string>>;
}

const Ctx = createContext<WhatIfCtx | null>(null);
export const useWhatIf = () => useContext(Ctx);

/**
 * Wiring for one figure: whether it's clickable, selected or changed, and what
 * it showed in the saved version. Used by V in ProposalSections.
 */
export function useFigure(k: string, label: string) {
  const w = useContext(Ctx);
  const ref = useRef<HTMLSpanElement>(null);
  const [was, setWas] = useState<string | null>(null);
  const spec = useMemo(() => figureSpec(k), [k]);
  // Runs after every render on purpose: it reads the figure's text from the page. setWas only fires when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!w || !ref.current) return;
    const text = (ref.current.querySelector('[data-fig-value]')?.textContent ?? '').trim();
    if (!w.dirty) {
      w.baseline.current[k] = text;
      if (was !== null) setWas(null);
      return;
    }
    const base = w.baseline.current[k];
    const next = base != null && base !== text ? base : null;
    if (next !== was) setWas(next);
  });
  if (!w || !w.enabled || !spec) return { ref, clickable: false as const };
  return {
    ref,
    clickable: true as const,
    selected: w.selected?.key === k,
    was,
    open: () => w.select(k, label),
  };
}

/* ------------------------------------------------------------------ */
/* Workspace: preview state, panel, amber bar, leave guard             */
/* ------------------------------------------------------------------ */

const storageKey = (versionId: number) => `teton-proposal-changes-${versionId}`;
const readStored = (versionId: number): Changes => {
  try {
    const raw = window.localStorage.getItem(storageKey(versionId));
    return raw ? (JSON.parse(raw) as Changes) : {};
  } catch {
    return {};
  }
};
const writeStored = (versionId: number, c: Changes) => {
  try {
    if (Object.keys(c).length) window.localStorage.setItem(storageKey(versionId), JSON.stringify(c));
    else window.localStorage.removeItem(storageKey(versionId));
  } catch {
    /* private mode etc.: changes just aren't kept across reloads */
  }
};

export interface PreviewData {
  draft: QuoteDraft;
  outputs: StoredOutputs;
  lines: PriceLine[];
}

export function WhatIfWorkspace({
  versionId,
  versionNo,
  nextVersionNo,
  pendingDealChanges,
  draft,
  outputs,
  lines,
  products,
  children,
}: {
  versionId: number;
  versionNo: number;
  nextVersionNo: number;
  /** Changes on the deal since this version, which a save also includes. */
  pendingDealChanges: number;
  draft: QuoteDraft;
  outputs: StoredOutputs;
  lines: PriceLine[];
  products: Product[];
  /** Renders the toolbar and document from the (possibly previewed) data; `banner` goes under the toolbar. */
  children: (data: PreviewData, banner: React.ReactNode) => React.ReactNode;
}) {
  const [raw, setRaw] = useState<Changes>({});
  const [selected, setSelected] = useState<{ key: string; label: string } | null>(null);
  const [restore, setRestore] = useState<Changes | null>(null);
  const [leaving, setLeaving] = useState<null | { href: string } | { back: true }>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const baseline = useRef<Record<string, string>>({});
  const book = useMemo(() => priceBook(products), [products]);

  // Valid, real changes only; out-of-range entries stay in `raw` (shown in the panel) but don't apply.
  const { changes, invalid } = useMemo(() => {
    const ok: Changes = {};
    const bad: Record<string, string> = {};
    for (const [p, v] of Object.entries(effectiveChanges(draft, raw))) {
      try {
        applyChanges(draft, { [p]: v });
        ok[p] = v;
      } catch (e) {
        bad[p] = e instanceof Error ? e.message : 'Invalid';
      }
    }
    return { changes: ok, invalid: bad };
  }, [draft, raw]);
  const dirty = Object.keys(changes).length > 0;

  const preview = useMemo<PreviewData>(() => {
    if (!dirty) return { draft, outputs, lines };
    const d = applyChanges(draft, changes);
    const c = computeOutputs(d, book);
    return { draft: d, outputs: c.outputs, lines: c.lines };
  }, [dirty, draft, outputs, lines, changes, book]);
  const traces = useMemo(() => (selected ? runModel(toModelInputs(preview.draft)).traces : null), [selected, preview.draft]);

  // Offer back unsaved changes from an earlier visit.
  useEffect(() => {
    const stored = effectiveChanges(draft, readStored(versionId));
    if (Object.keys(stored).length) setRestore(stored);
  }, [draft, versionId]);
  useEffect(() => {
    if (restore) return; // don't overwrite what's on offer until it's restored or dismissed
    writeStored(versionId, effectiveChanges(draft, raw));
  }, [raw, draft, versionId, restore]);

  const setChange = useCallback(
    (path: string, v: number | null | undefined) =>
      setRaw((r) => {
        const next = { ...r };
        if (v === undefined || (getPath(draft, path) ?? null) === v) delete next[path];
        else next[path] = v;
        return next;
      }),
    [draft],
  );
  const discard = useCallback(() => setRaw({}), []);

  // ---- leave guard ----
  const dirtyRef = useRef(dirty);
  const guardPushed = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.hash)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving({ href: url.pathname + url.search + url.hash });
    };
    // Browser back: one placeholder history entry (added once per visit) keeps Back on the page so it can ask first.
    if (!guardPushed.current) {
      window.history.pushState({ tetonGuard: true }, '', window.location.href);
      guardPushed.current = true;
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
  useEffect(() => {
    const onPop = () => {
      if (!guardPushed.current) return;
      if (dirtyRef.current) {
        // Back with unsaved changes: stay (restore the placeholder) and ask.
        window.history.pushState({ tetonGuard: true }, '', window.location.href);
        setLeaving({ back: true });
      } else {
        // Back with nothing to save: the placeholder was just left, so take the step the user asked for.
        guardPushed.current = false;
        window.history.back();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (target: { href: string } | { back: true }) => {
    dirtyRef.current = false;
    if ('href' in target) window.location.assign(target.href);
    else window.history.back(); // leaves the placeholder; the popstate handler then takes the real step back
  };

  async function saveAll(): Promise<{ versionId: number } | null> {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/versions/${versionId}/changes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not save the changes');
      writeStored(versionId, {});
      return { versionId: body.versionId };
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the changes');
      return null;
    } finally {
      setSaving(false);
    }
  }

  const ctx = useMemo<WhatIfCtx>(
    () => ({
      enabled: true,
      changes,
      dirty,
      setChange,
      discard,
      selected,
      select: (key, label) => setSelected({ key, label }),
      close: () => setSelected(null),
      baseline,
    }),
    [changes, dirty, setChange, discard, selected],
  );

  const count = Object.keys(changes).length;
  const banner = (dirty || restore) ? (
      <div className="no-print text-teton-ink">
          {restore && !dirty && (
            <div className="flex flex-wrap items-center gap-3 border-b border-[#EBC46B] bg-[#FFF1CC] px-4 py-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#D99A13]" aria-hidden="true" />
              <span>
                You have {Object.keys(restore).length} unsaved {Object.keys(restore).length === 1 ? 'change' : 'changes'} to this proposal’s inputs from earlier.
              </span>
              <span className="ml-auto flex gap-2">
                <button type="button" className="btn-secondary py-1" onClick={() => { writeStored(versionId, {}); setRestore(null); }}>
                  Discard
                </button>
                <button type="button" className="btn-primary py-1" onClick={() => { setRaw(restore); setRestore(null); }}>
                  Restore them
                </button>
              </span>
            </div>
          )}
          {dirty && (
            <AmberBar
              count={count}
              nextVersionNo={nextVersionNo}
              versionNo={versionNo}
              pendingDealChanges={pendingDealChanges}
              draft={draft}
              changes={changes}
              saving={saving}
              error={saveError}
              onUndo={(p) => setChange(p, undefined)}
              onDiscard={() => window.confirm(`Discard ${count} unsaved ${count === 1 ? 'change' : 'changes'}?`) && discard()}
              onSave={async () => {
                const r = await saveAll();
                if (r) {
                  dirtyRef.current = false;
                  window.location.assign(`/proposal/${r.versionId}`);
                }
              }}
            />
          )}
        </div>
  ) : null;

  return (
    <Ctx.Provider value={ctx}>
      <div className={selected ? 'lg:pr-[380px] transition-[padding] duration-200' : 'transition-[padding] duration-200'}>
        {children(preview, banner)}
      </div>

      {selected && traces && (
        <FigurePanel
          figure={selected}
          draft={draft}
          raw={raw}
          invalid={invalid}
          traces={traces}
          changesCount={count}
          onChange={setChange}
          onClose={() => setSelected(null)}
        />
      )}

      {leaving && (
        <LeaveDialog
          draft={draft}
          changes={changes}
          nextVersionNo={nextVersionNo}
          saving={saving}
          error={saveError}
          onStay={() => setLeaving(null)}
          onDiscard={() => {
            writeStored(versionId, {});
            go(leaving);
          }}
          onSave={async () => {
            const r = await saveAll();
            if (r) go(leaving);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function ChangeList({ draft, changes, onUndo }: { draft: QuoteDraft; changes: Changes; onUndo?: (path: string) => void }) {
  return (
    <ul className="divide-y divide-teton-off-white rounded-lg border border-teton-off-white text-sm">
      {Object.entries(changes).map(([p, v]) => {
        const f = fieldByPath(draft, p);
        if (!f) return null;
        return (
          <li key={p} className="flex items-center gap-3 px-3 py-1.5">
            <span className="flex-1 min-w-0">{f.label}</span>
            <span className="whitespace-nowrap tabular-nums">
              <s className="text-teton-ui-gray">{formatField(f, getPath(draft, p))}</s> → <b>{formatField(f, v)}</b>
            </span>
            {onUndo && (
              <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs" onClick={() => onUndo(p)} aria-label={`Undo ${f.label}`} title="Undo">
                ↺
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AmberBar({
  count,
  versionNo,
  nextVersionNo,
  pendingDealChanges,
  draft,
  changes,
  saving,
  error,
  onUndo,
  onDiscard,
  onSave,
}: {
  count: number;
  versionNo: number;
  nextVersionNo: number;
  pendingDealChanges: number;
  draft: QuoteDraft;
  changes: Changes;
  saving: boolean;
  error: string | null;
  onUndo: (path: string) => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const [review, setReview] = useState(false);
  return (
    <div role="status" aria-live="polite" className="relative border-b border-[#EBC46B] bg-[#FFF1CC] px-4 py-2 text-sm text-teton-ink shadow-sm">
      <div className="max-w-[1400px] mx-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-2 h-2 rounded-full bg-[#D99A13] flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <b>
            {count} unsaved {count === 1 ? 'change' : 'changes'}.
          </b>{' '}
          The figures are a preview: they aren’t saved, and v{versionNo} still has the old numbers. Save to create v{nextVersionNo}.
          {pendingDealChanges > 0 && (
            <span className="text-teton-dark-gray">
              {' '}
              v{nextVersionNo} will also include {pendingDealChanges} {pendingDealChanges === 1 ? 'change' : 'changes'} made on the deal since v{versionNo}.
            </span>
          )}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-secondary py-1" aria-expanded={review} onClick={() => setReview((r) => !r)}>
            Review ({count})
          </button>
          <button type="button" className="btn-secondary py-1" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="btn-primary py-1" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : `Save all changes as v${nextVersionNo}`}
          </button>
        </span>
        {error && <p className="w-full rounded bg-teton-red/30 px-2 py-1">{error}</p>}
      </div>
      {review && (
        <div className="absolute right-4 top-full mt-1 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-teton-pale-gray bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold mb-2">Unsaved changes</p>
          <ChangeList draft={draft} changes={changes} onUndo={onUndo} />
        </div>
      )}
    </div>
  );
}

function LeaveDialog({
  draft,
  changes,
  nextVersionNo,
  saving,
  error,
  onStay,
  onDiscard,
  onSave,
}: {
  draft: QuoteDraft;
  changes: Changes;
  nextVersionNo: number;
  saving: boolean;
  error: string | null;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const n = Object.keys(changes).length;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onStay();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onStay]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <button type="button" className="absolute inset-0 bg-teton-ink/45" aria-label="Keep editing" tabIndex={-1} onClick={onStay} />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="leave-title" className="text-lg font-semibold">Save your changes before leaving?</h2>
        <p className="text-sm text-teton-dark-gray mt-1">
          You changed {n} {n === 1 ? 'input' : 'inputs'} on this proposal. Saving creates <b>v{nextVersionNo}</b> with the new figures; your wording and layout carry over to it.
        </p>
        <div className="my-3">
          <ChangeList draft={draft} changes={changes} />
        </div>
        {error && <p className="mb-3 rounded bg-teton-red/30 px-2 py-1 text-sm">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost py-2" onClick={onStay} autoFocus>
            Keep editing
          </button>
          <button type="button" className="btn-secondary" onClick={onDiscard}>
            Discard changes
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : `Save as v${nextVersionNo} and leave`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ f, draft, raw, error, onChange }: { f: WhatIfField; draft: QuoteDraft; raw: Changes; error?: string; onChange: (path: string, v: number | null | undefined) => void }) {
  const saved = (getPath(draft, f.path) as number | null | undefined) ?? null;
  const changed = f.path in raw;
  const value = changed ? raw[f.path] : saved;
  const scale = f.kind === 'pct' ? 100 : 1;
  const suffix = { pct: '%', months: 'mo', weeks: 'wk', mult: '×', usd: undefined, usd2: undefined, num: undefined }[f.kind];
  const prefix = f.kind === 'usd' || f.kind === 'usd2' ? '$' : undefined;
  const id = `wi-${f.path.replace(/\W/g, '-')}`;
  return (
    <div className="py-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_1.5rem] items-center gap-2">
        <label htmlFor={id} className="text-[13px] leading-snug">
          {f.label}
        </label>
        <NumInput
          id={id}
          className={changed ? '[&_input]:border-[#E2A72B] [&_input]:bg-[#FFFBEF]' : ''}
          value={value}
          onChange={(v) => onChange(f.path, v)}
          scale={scale}
          prefix={prefix}
          suffix={suffix}
          nullable={f.nullable}
          placeholder={f.nullable ? 'Default' : undefined}
          min={f.min}
          max={f.max}
          aria-label={f.label}
        />
        {changed ? (
          <button type="button" className="text-teton-ui-gray hover:text-teton-ink text-sm" onClick={() => onChange(f.path, undefined)} title="Back to the saved value" aria-label={`Undo ${f.label}`}>
            ↺
          </button>
        ) : (
          <span />
        )}
      </div>
      {changed && <p className="text-[11px] text-[#8A5A00] mt-0.5">Saved value: {formatField(f, saved)}</p>}
      {error && <p className="text-[11px] mt-0.5 rounded bg-teton-red/30 px-1.5">{error}</p>}
    </div>
  );
}

function FigurePanel({
  figure,
  draft,
  raw,
  invalid,
  traces,
  changesCount,
  onChange,
  onClose,
}: {
  figure: { key: string; label: string };
  draft: QuoteDraft;
  raw: Changes;
  invalid: Record<string, string>;
  traces: Record<string, Trace>;
  changesCount: number;
  onChange: (path: string, v: number | null | undefined) => void;
  onClose: () => void;
}) {
  const w = useWhatIf();
  const [showAll, setShowAll] = useState(false);
  const spec = figureSpec(figure.key);
  const trace = spec?.trace ? traces[spec.trace] : undefined;
  const fields = useMemo(() => {
    const all = allFields(draft);
    const paths = new Set([...(trace ? traceFields(trace, draft) : []), ...(spec?.fields ?? [])]);
    return all.filter((f) => paths.has(f.path));
  }, [draft, trace, spec]);
  const others = useMemo(() => allFields(draft).filter((f) => !fields.includes(f)), [draft, fields]);

  // Current text of the figure on the page, and what it was in the saved version.
  const [now, setNow] = useState('');
  // After every render (the figure re-renders when inputs change); only updates when the text differs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = document.querySelector(`[data-fig="${CSS.escape(figure.key)}"] [data-fig-value]`);
    const t = (el?.textContent ?? '').trim();
    if (t !== now) setNow(t);
  });
  const was = w?.baseline.current[figure.key];
  const groups = (list: WhatIfField[]) => {
    const by = new Map<string, WhatIfField[]>();
    list.forEach((f) => by.set(f.group, [...(by.get(f.group) ?? []), f]));
    return Array.from(by.entries());
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('input') && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <aside
      className="no-print fixed right-0 bottom-0 z-20 w-full sm:w-[380px] overflow-y-auto border-l border-teton-off-white bg-white px-4 pb-6 pt-4 shadow-xl"
      style={{ top: 'var(--proposal-chrome-h, 64px)' }}
      aria-label={`Inputs behind ${figure.label}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray">What drives this figure</p>
          <h2 className="text-base font-semibold leading-snug mt-0.5">{figure.label.replace(/ (figure|amount|value|rate|timing)$/i, '')}</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums">{now || '—'}</span>
        {was && now && was !== now && <span className="badge bg-[#FFF1CC]">was {was}</span>}
      </p>
      <p className="mt-2 rounded-lg bg-teton-almost-white px-3 py-2 text-[12px] text-teton-dark-gray">= {trace?.formula && trace.formula !== 'Input' ? trace.formula : spec?.formula}</p>

      {fields.length === 0 && <p className="hint mt-3">This figure doesn’t depend on deal-level inputs that can be changed here. Change it on the deal page.</p>}
      {groups(fields).map(([g, list]) => (
        <section key={g} className="border-t border-teton-off-white mt-3 pt-2">
          <p className="flex justify-between text-xs font-semibold">
            {g}
            <span className="font-normal text-teton-ui-gray">{list[0].where}</span>
          </p>
          {list.map((f) => (
            <FieldRow key={f.path} f={f} draft={draft} raw={raw} error={invalid[f.path]} onChange={onChange} />
          ))}
        </section>
      ))}

      <div className="border-t border-teton-off-white mt-3 pt-2">
        <button type="button" className="text-xs underline text-teton-dark-gray" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
          {showAll ? 'Hide other inputs' : `Show all ${others.length} other inputs`}
        </button>
        {showAll &&
          groups(others).map(([g, list]) => (
            <section key={g} className="mt-2">
              <p className="text-xs font-semibold text-teton-dark-gray">{g}</p>
              {list.map((f) => (
                <FieldRow key={f.path} f={f} draft={draft} raw={raw} error={invalid[f.path]} onChange={onChange} />
              ))}
            </section>
          ))}
      </div>

      <p className={`mt-4 text-xs ${changesCount ? 'text-[#8A5A00]' : 'text-teton-ui-gray'}`}>
        {changesCount
          ? `${changesCount} ${changesCount === 1 ? 'change' : 'changes'} on this proposal, not saved. Use “Save all changes” in the amber bar.`
          : 'Changes update the proposal as you type. Nothing is saved until “Save all changes”.'}
      </p>
    </aside>
  );
}
