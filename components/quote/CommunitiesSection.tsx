'use client';

/**
 * Communities: a read-only list (one line per community) with an editor
 * panel beside it. Click a community to edit it in the panel; tick several to
 * change them together from the bulk bar. Where there isn't room beside the
 * list, the editor opens under its row instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { bedsOf, newCommunity, type DraftCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { bedMix, communityChips, communityIsValid, MIXED, sharedValue, sortedIndices, ymLabel, type Chip, type SortKey } from '@/lib/quote/communityRow';
import { monthLabel } from '@/lib/quote/toModelInputs';
import { count, pct } from '@/lib/format';
import { Section } from '@/components/form/fields';
import type { SectionProps } from './sections';
import { PasteDialog } from './PasteDialog';
import { StaggerDialog } from './StaggerDialog';
import { CommunityEditor } from './CommunityEditor';
import { BulkBar, type BulkPatch } from './BulkBar';
import { useRailSlot } from './RailSlot';
import { useSections } from '@/components/form/SectionsContext';
import { BottomSheet } from '@/components/form/BottomSheet';

const CHIP_CLASS: Record<Chip['tone'], string> = {
  green: 'badge-green',
  purple: 'badge-purple',
  yellow: 'badge-yellow',
  gray: 'badge-gray',
  red: 'badge bg-teton-red/40',
};

const PilotFlag = () => (
  <svg viewBox="0 0 16 16" className="w-3 h-3 mr-1" fill="currentColor" aria-hidden="true">
    <path d="M3 1.5a.75.75 0 0 1 .75.75V3h8.4a.6.6 0 0 1 .48.96L11 6.25l1.63 2.29a.6.6 0 0 1-.48.96h-8.4v4.75a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 3 1.5Z" />
  </svg>
);

/** Width of the section body at which the editor sits beside the list instead of under the open row. */
const SPLIT_MIN_WIDTH = 760;

export function CommunitiesSection({ inputs, result }: SectionProps) {
  const { control, setValue, getValues, formState, clearErrors } = useFormContext<QuoteDraft>();
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'communities',
    keyName: '_key',
    rules: {
      validate: (all) => (all ?? []).every(communityIsValid) || 'Every community needs a name and at least one bed.',
    },
  });
  const watched = useWatch({ control, name: 'communities' });
  const rows = useMemo(() => watched ?? [], [watched]);
  const ecallOn = useWatch({ control, name: 'commercial.ecall' }) !== 'none';
  const withPilot = !!useWatch({ control, name: 'schedule.withPilot' });
  const desiredGoLive = useWatch({ control, name: 'implementation.desiredGoLive' });
  const horizon = useWatch({ control, name: 'schedule.horizonMonths' });

  const [pasting, setPasting] = useState(false);
  /** null = closed; 'all' = every community; otherwise only these indices. */
  const [staggering, setStaggering] = useState<null | 'all' | number[]>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** What the side panel shows while both a community and a selection exist: whichever was touched last. */
  const [panel, setPanel] = useState<'edit' | 'selection'>('edit');
  const [sort, setSort] = useState<SortKey>('entered');

  // Side-by-side when there's room; otherwise the editor opens in a bottom sheet.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setWide(e.contentRect.width >= SPLIT_MIN_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Where the details panel goes: the editor's right rail on wide screens, beside the list when the
  // section has room, otherwise a bottom sheet (phones).
  const rail = useRailSlot();
  const sectionOpen = useSections().isOpen('communities');
  const mode: 'rail' | 'split' | 'sheet' = rail.el ? 'rail' : wide ? 'split' : 'sheet';

  const start = inputs?.schedule.startDate;
  const totalBeds = rows.reduce((s, c) => s + bedsOf(c), 0);
  const deal = { withPilot, ecallOn };
  const order = useMemo(() => sortedIndices(rows, sort), [rows, sort]);
  const keyAt = (i: number) => fields[i]?._key;
  const indexOf = useCallback((key: string | null) => (key ? fields.findIndex((f) => f._key === key) : -1), [fields]);
  const openIndex = indexOf(openKey);
  const checkedIdx = fields.map((f, i) => (checked.has(f._key) ? i : -1)).filter((i) => i >= 0);
  const showErrors = !!formState.errors.communities?.root;

  // Forget keys of removed communities.
  useEffect(() => {
    const live = new Set(fields.map((f) => f._key));
    if (openKey && !live.has(openKey)) setOpenKey(null);
    setChecked((s) => (Array.from(s).every((k) => live.has(k)) ? s : new Set(Array.from(s).filter((k) => live.has(k)))));
  }, [fields, openKey]);

  // A blocked save flagged missing names/beds: open the first such community; clear the flag once all are fixed.
  const rootError = formState.errors.communities?.root?.message;
  useEffect(() => {
    if (!rootError) return;
    const all = getValues('communities') ?? [];
    const bad = all.findIndex((c) => !communityIsValid(c));
    if (bad < 0) {
      clearErrors('communities');
      return;
    }
    if (openIndex !== bad && !(openIndex >= 0 && !communityIsValid(all[openIndex]))) {
      setOpenKey(fields[bad]?._key ?? null);
      setPanel('edit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootError, rows]);

  function openRow(i: number) {
    setOpenKey(keyAt(i) ?? null);
    setPanel('edit');
  }
  function toggle(i: number) {
    const k = keyAt(i);
    if (!k) return;
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
    setPanel('selection');
  }
  const allChecked = fields.length > 0 && checkedIdx.length === fields.length;
  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(fields.map((f) => f._key)));
    setPanel('selection');
  };

  function applyBulk(patch: BulkPatch) {
    for (const i of checkedIdx) {
      for (const [k, v] of Object.entries(patch)) {
        setValue(`communities.${i}.${k as keyof BulkPatch}`, v as never, { shouldDirty: true });
      }
    }
  }
  function removeChecked() {
    remove(checkedIdx);
    setChecked(new Set());
  }
  const closeSheet = useCallback(() => setOpenKey(null), []);
  function removeOne(i: number) {
    const pos = order.indexOf(i);
    // Move to the next community in the list so removing several in a row is quick.
    const nextIdx = order[pos + 1] ?? order[pos - 1];
    const nextKey = nextIdx != null ? keyAt(nextIdx) : null;
    remove(i);
    // In the phone sheet, removing closes it; elsewhere move to the next community.
    setOpenKey(mode === 'sheet' ? null : nextKey ?? null);
  }
  function addCommunity() {
    const c = newCommunity(fields.length);
    append(c);
    setPanel('edit');
    // The new field's key exists after the append re-renders; open it then.
    pendingOpen.current = c.id;
  }
  const pendingOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingOpen.current) return;
    const i = rows.findIndex((r) => r?.id === pendingOpen.current);
    if (i >= 0 && fields[i]) {
      pendingOpen.current = null;
      setOpenKey(fields[i]._key);
      focusName.current = rows[i].id;
    }
  }, [fields, rows]);
  // Put the cursor in a new community's name once its editor has rendered.
  const focusName = useRef<string | null>(null);
  useEffect(() => {
    if (!focusName.current) return;
    const el = document.getElementById(`ce-${focusName.current}-name`);
    if (el) {
      focusName.current = null;
      el.focus();
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  const goLiveText = (i: number) => {
    const r = rows[i];
    if (r?.goLiveMonth) return `live ${ymLabel(r.goLiveMonth)}`;
    const cf = result?.cashFlow.communities[i];
    return cf && start ? `live ${ymLabel(monthLabel(start, cf.goLiveMonth))} (default)` : 'go-live not set';
  };

  const editorFor = (i: number, onClose?: () => void) => {
    const pos = order.indexOf(i);
    return (
      <CommunityEditor
        index={i}
        position={pos + 1}
        total={order.length}
        inputs={inputs}
        cashFlow={result?.cashFlow.communities[i]}
        showErrors={showErrors}
        onPrev={pos > 0 ? () => openRow(order[pos - 1]) : undefined}
        onNext={pos < order.length - 1 ? () => openRow(order[pos + 1]) : undefined}
        onRemove={() => removeOne(i)}
        onClose={onClose}
      />
    );
  };

  const selectionPanel = () => {
    const sel = checkedIdx.map((i) => rows[i]).filter(Boolean) as DraftCommunity[];
    const shared = <T,>(f: (c: DraftCommunity) => T, show: (v: T) => string) => {
      const v = sharedValue(sel.map(f));
      return v === MIXED ? <span className="italic text-teton-ui-gray">Mixed</span> : v === undefined ? '—' : show(v as T);
    };
    return (
      <div className="text-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{sel.length} {sel.length === 1 ? 'community' : 'communities'} selected</h3>
        </div>
        <p className="text-xs text-teton-ui-gray mt-0.5">Use the bar to change them together. Click a name to edit just that one.</p>
        <ul className="mt-3 max-h-64 overflow-y-auto">
          {checkedIdx.map((i) => (
            <li key={keyAt(i)} className="flex justify-between gap-3 py-1.5 border-b border-teton-off-white">
              <button type="button" className="text-left truncate hover:underline" onClick={() => openRow(i)}>{rows[i]?.name || `Community ${i + 1}`}</button>
              <span className="tabular-nums text-teton-dark-gray whitespace-nowrap">{count(bedsOf(rows[i]))} beds</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between font-semibold py-1.5">
          <span>Total</span>
          <span className="tabular-nums">{count(sel.reduce((s, c) => s + bedsOf(c), 0))} beds</span>
        </p>
        <div className="border-t border-teton-off-white pt-3 mt-1">
          <p className="text-xs font-semibold mb-2">Current values</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {(
              [
                ['Go-live', shared((c) => c.goLiveMonth, (v) => (v ? ymLabel(v) : 'Default'))],
                ['Coverage', shared((c) => c.coverage, (v) => (v === 'full_facility' ? 'Full facility' : 'Rooms only'))],
                ['E-Call', ecallOn ? shared((c) => !!c.ecall, (v) => (v ? 'On' : 'Off')) : 'Not in deal'],
                ['Pilot', withPilot ? shared((c) => !!c.pilot, (v) => (v ? 'Yes' : 'No')) : 'No pilot phase'],
                ['Occupancy', shared((c) => c.occupancy, (v) => (v == null ? 'Deal value' : pct(v)))],
                ['ROI delay', shared((c) => c.roiDelayMonths, (v) => (v == null ? 'Deal value' : `${v} mo`))],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="eyebrow">{label}</dt>
                <dd className="derived py-1.5">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint mt-2">Values that differ show as <i>Mixed</i>; setting one from the bar sets it on all of them.</p>
        </div>
      </div>
    );
  };

  const emptyPanel = () => {
    const by = (k: 'ilBeds' | 'alBeds' | 'mcBeds' | 'snfBeds') => rows.reduce((s, c) => s + (Number(c?.[k]) || 0), 0);
    return (
      <div className="text-sm">
        <h3 className="text-base font-semibold">Portfolio</h3>
        <p className="text-xs text-teton-ui-gray mt-0.5">Click a community to edit it, or tick several to change them together.</p>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {(
            [
              ['IL', by('ilBeds')],
              ['AL', by('alBeds')],
              ['MC', by('mcBeds')],
              ['SNF', by('snfBeds')],
            ] as const
          ).map(([t, n]) => (
            <div key={t} className="rounded-lg bg-teton-almost-white px-2 py-2">
              <p className="eyebrow mb-0">{t}</p>
              <p className="font-semibold tabular-nums">{count(n)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-teton-dark-gray">
          {count(totalBeds)} beds{result ? ` · ${count(result.kpis.totalOccupiedUnits)} occupied at modeled occupancy` : ''}
        </p>
      </div>
    );
  };

  const showSelection = checkedIdx.length > 0 && (panel === 'selection' || openIndex < 0);
  const panelContent = showSelection ? selectionPanel() : openIndex >= 0 ? editorFor(openIndex, mode === 'rail' ? () => setOpenKey(null) : undefined) : emptyPanel();
  const railActive = mode === 'rail' && sectionOpen && (showSelection || openIndex >= 0);
  const { setActive } = rail;
  useEffect(() => {
    setActive(railActive);
    return () => setActive(false);
  }, [railActive, setActive]);

  const pilotCount = rows.filter((r) => r?.pilot).length;
  const staggerIdx = staggering === 'all' ? fields.map((_, i) => i) : staggering ?? [];

  return (
    <Section
      id="communities"
      title="Communities"
      description="Click a community to edit it; tick several to change them together."
      summary={
        fields.length === 0
          ? 'None yet'
          : [
              `${fields.length} ${fields.length === 1 ? 'community' : 'communities'}`,
              `${count(totalBeds)} beds`,
              withPilot && pilotCount > 0 && `${pilotCount} pilot`,
              rows.some((r) => r?.coverage === 'full_facility') && `${rows.filter((r) => r?.coverage === 'full_facility').length} full facility`,
            ]
              .filter(Boolean)
              .join(' · ')
      }
      aside={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setStaggering('all')} disabled={fields.length === 0}>
            Stagger go-live dates
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPasting(true)}>
            Paste communities
          </button>
          <button type="button" className="btn-primary" onClick={addCommunity}>
            Add community
          </button>
        </div>
      }
    >
      <PasteDialog
        open={pasting}
        onClose={() => setPasting(false)}
        existingNames={rows.map((r) => r?.name ?? '')}
        onConfirm={(pasted, mode) => {
          const onlyEmptyStarter = rows.length === 1 && !rows[0]?.name && bedsOf(rows[0]) === 0;
          if (mode === 'replace' || onlyEmptyStarter) {
            // Replacing keeps each existing community's own settings (go-live date, pilot, coverage,
            // e-call, overrides) when the same community comes back in the paste, matched by name.
            const current = getValues('communities') ?? [];
            const byName = new Map(current.filter((c) => c?.name).map((c) => [c.name.trim().toLowerCase(), c]));
            replace(pasted.map((p, k) => ({ ...(byName.get(p.name.trim().toLowerCase()) ?? newCommunity(k)), ...p })));
          } else {
            append(pasted.map((p, k) => ({ ...newCommunity(fields.length + k), ...p })));
          }
          setPasting(false);
        }}
      />
      <StaggerDialog
        open={staggering !== null}
        onClose={() => setStaggering(null)}
        communities={staggerIdx.map((i) => ({ name: rows[i]?.name ?? '', pilot: withPilot && !!rows[i]?.pilot, goLiveMonth: rows[i]?.goLiveMonth ?? null }))}
        defaultFirstMonth={(desiredGoLive ?? '').slice(0, 7)}
        horizonMonths={Number(horizon) || 36}
        onApply={(months) => {
          months.forEach((m, k) => setValue(`communities.${staggerIdx[k]}.goLiveMonth`, m, { shouldDirty: true }));
          setStaggering(null);
        }}
      />

      <div ref={bodyRef} className={`rounded-lg border border-teton-off-white overflow-visible ${mode === 'split' ? 'grid grid-cols-[minmax(0,1fr)_minmax(280px,340px)]' : ''}`}>
        <div className={`min-w-0 ${mode === 'split' ? 'border-r border-teton-off-white' : ''}`}>
          {checkedIdx.length > 0 ? (
            <BulkBar
              selected={checkedIdx.length}
              allChecked={allChecked}
              someChecked={checkedIdx.length > 0}
              onToggleAll={toggleAll}
              onApply={applyBulk}
              onStagger={() => setStaggering(checkedIdx)}
              onRemove={removeChecked}
              onClear={() => setChecked(new Set())}
              ecallOn={ecallOn}
              withPilot={withPilot}
              defaultMonth={(desiredGoLive ?? '').slice(0, 7)}
            />
          ) : (
            <div className="flex items-center gap-3 px-4 py-2.5 min-h-[48px] bg-teton-almost-white border-b border-teton-off-white text-xs text-teton-ui-gray rounded-tl-lg">
              <input type="checkbox" className="h-4 w-4 accent-teton-near-black" checked={false} disabled={fields.length === 0} onChange={toggleAll} aria-label="Select all communities" />
              <span className="flex-1">Tick communities to change several at once</span>
              <label className="flex items-center gap-1">
                <span className="sr-only sm:not-sr-only">Sort</span>
                <select className="bg-transparent text-xs text-teton-dark-gray py-1 pr-1 rounded focus:outline-none focus:ring-2 focus:ring-brand-accent" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort communities">
                  <option value="entered">As entered</option>
                  <option value="golive">Go-live</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
          )}

          {fields.length === 0 ? (
            <p className="text-sm text-teton-ui-gray px-4 py-6">No communities yet. Add one, or paste a list from a spreadsheet or NIC MAP.</p>
          ) : (
            <ul aria-label="Communities">
              {order.map((i) => {
                const r = rows[i];
                const key = keyAt(i);
                if (!r || !key) return null;
                const isChecked = checked.has(key);
                const isOpen = openKey === key && (panel === 'edit' || checkedIdx.length === 0);
                const isPilot = withPilot && !!r.pilot;
                const chips = communityChips(r, deal);
                const invalid = !communityIsValid(r);
                const mix = bedMix(r);
                return (
                  <li
                    key={key}
                    className={`relative flex items-center gap-3 px-4 py-2.5 border-b border-teton-off-white last:border-b-0 ${
                      isOpen ? 'bg-[#F5F8FE] shadow-[inset_3px_0_0_rgb(var(--teton-blue-rgb))]' : isChecked ? 'bg-[#F5F8FE]' : isPilot ? 'bg-teton-pale-green/50' : 'hover:bg-teton-almost-white'
                    }`}
                  >
                    <input type="checkbox" className="h-4 w-4 accent-teton-near-black flex-shrink-0" checked={isChecked} onChange={() => toggle(i)} aria-label={`Select ${r.name || `community ${i + 1}`}`} />
                    <button type="button" className="flex-1 min-w-0 text-left flex items-center gap-3 after:absolute after:inset-0 after:left-10" onClick={() => openRow(i)} aria-current={isOpen || undefined} data-invalid={showErrors && invalid ? 'true' : undefined}>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {r.name || <span className="text-teton-ui-gray font-normal">Unnamed community</span>}
                          {r.market && <span className="font-normal text-teton-ui-gray"> · {r.market}</span>}
                        </span>
                        <span className="block truncate text-xs text-teton-ui-gray mt-0.5">
                          {count(bedsOf(r))} beds{mix ? ` (${mix})` : ''} · {goLiveText(i)}
                          {ecallOn && r.ecall ? ' · E-Call' : ''}
                        </span>
                      </span>
                      <span className="hidden sm:flex flex-wrap justify-end gap-1 max-w-[45%]">
                        {chips.map((c) => (
                          <span key={c.label} className={`${CHIP_CLASS[c.tone]} whitespace-nowrap`}>
                            {c.pilot && <PilotFlag />}
                            {c.label}
                          </span>
                        ))}
                      </span>
                      <span className="text-teton-light-gray" aria-hidden="true">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {fields.length > 0 && (
            <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm border-t border-teton-off-white bg-teton-almost-white rounded-b-lg">
              <span className="font-medium">
                {fields.length} {fields.length === 1 ? 'community' : 'communities'} · {count(totalBeds)} beds{withPilot && pilotCount ? ` · ${pilotCount} pilot` : ''}
              </span>
              <span className="text-teton-ui-gray">{result ? `${count(result.kpis.totalOccupiedUnits)} occupied units at modeled occupancy` : ''}</span>
            </div>
          )}
        </div>

        {mode === 'split' && <aside className="p-4 min-w-0" aria-label="Community details"><div className="sticky top-4">{panelContent}</div></aside>}
        {railActive && rail.el && createPortal(<div aria-label="Community details" role="region">{panelContent}</div>, rail.el)}
        {mode === 'sheet' && (
          <BottomSheet open={openIndex >= 0 && (panel === 'edit' || checkedIdx.length === 0)} onClose={closeSheet} label="Edit community" title="Edit community">
            {openIndex >= 0 && <div aria-label="Community details" role="region">{editorFor(openIndex)}</div>}
          </BottomSheet>
        )}
      </div>
      {showErrors && <p className="text-sm mt-2 rounded bg-teton-red/30 px-2 py-1">{rootError}</p>}

    </Section>
  );
}
