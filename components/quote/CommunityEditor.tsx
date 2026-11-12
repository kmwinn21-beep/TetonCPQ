'use client';

/**
 * Every field of one community, grouped the way a rep thinks about a site:
 * name, beds, timing, coverage & add-ons, pilot, then the per-site overrides.
 * Shown in the panel beside the list, or under its row where there isn't room.
 */
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { bedsOf, type QuoteDraft } from '@/lib/quote/draft';
import { communityProblems, ymLabel } from '@/lib/quote/communityRow';
import { monthLabel } from '@/lib/quote/toModelInputs';
import type { ModelInputs, ModelResult } from '@/lib/model';

type CommunityCashFlow = ModelResult['cashFlow']['communities'][number];
import { count } from '@/lib/format';
import { NumInput } from '@/components/form/NumInput';

const BEDS = [
  ['ilBeds', 'IL'],
  ['alBeds', 'AL'],
  ['mcBeds', 'MC'],
  ['snfBeds', 'SNF'],
] as const;

/** An on/off switch over a checkbox, so it stays a real form control. */
export function Switch({ checked, onChange, disabled, label, id }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; id: string }) {
  return (
    <label htmlFor={id} className={`inline-flex items-center gap-2 text-sm select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="relative inline-flex">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="w-8 h-[18px] rounded-full bg-teton-pale-gray peer-checked:bg-teton-near-black transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent" />
        <span className="absolute left-[2px] top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform peer-checked:translate-x-[14px]" />
      </span>
      {label}
    </label>
  );
}

function Group({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-teton-off-white pt-3 mt-3">
      <p className="text-xs font-semibold mb-2">
        {title}
        {note && <span className="font-normal text-teton-ui-gray"> · {note}</span>}
      </p>
      {children}
    </div>
  );
}

export function CommunityEditor({
  index: i,
  position,
  total,
  inputs,
  cashFlow,
  showErrors,
  onPrev,
  onNext,
  onRemove,
  onClose,
}: {
  index: number;
  /** 1-based place in the list as displayed. */
  position: number;
  total: number;
  inputs: ModelInputs | null;
  cashFlow?: CommunityCashFlow;
  /** A save was blocked: highlight what's missing. */
  showErrors: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onRemove: () => void;
  onClose?: () => void;
}) {
  const { control, register } = useFormContext<QuoteDraft>();
  const row = useWatch({ control, name: `communities.${i}` });
  const ecallOn = useWatch({ control, name: 'commercial.ecall' }) !== 'none';
  const withPilot = !!useWatch({ control, name: 'schedule.withPilot' });
  if (!row) return null;

  const id = (k: string) => `ce-${row.id}-${k}`;
  const problems = showErrors ? communityProblems(row) : [];
  const nameBad = problems.includes('Needs a name');
  const bedsBad = problems.includes('No beds');
  const start = inputs?.schedule.startDate;
  const isPilot = withPilot && !!row.pilot;

  return (
    <div className="text-sm" aria-label={`Edit ${row.name || `community ${position}`}`} role="group">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold truncate min-w-0 flex-1">{row.name || <span className="text-teton-ui-gray">Unnamed community</span>}</h3>
        <button type="button" className="btn-ghost text-teton-dark-gray" onClick={onRemove}>Remove</button>
        {onClose && (
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close editor">✕</button>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-teton-ui-gray mt-0.5">
        <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-40" onClick={onPrev} disabled={!onPrev} aria-label="Previous community">‹ Prev</button>
        <span className="tabular-nums">{position} of {total}</span>
        <button type="button" className="btn-ghost px-1.5 py-0.5 text-xs disabled:opacity-40" onClick={onNext} disabled={!onNext} aria-label="Next community">Next ›</button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-2 mt-3">
        <div>
          <label className="eyebrow" htmlFor={id('name')}>Community</label>
          <input
            id={id('name')}
            className={`input-field ${nameBad ? 'ring-2 ring-teton-red border-transparent' : ''}`}
            placeholder="Community name"
            aria-label={`Community ${position} name`}
            aria-invalid={nameBad || undefined}
            {...register(`communities.${i}.name`)}
          />
        </div>
        <div>
          <label className="eyebrow" htmlFor={id('market')}>State</label>
          <input id={id('market')} className="input-field px-2.5" placeholder="CO" aria-label={`Community ${position} market`} {...register(`communities.${i}.market`)} />
        </div>
      </div>

      <Group title="Beds" note={`${count(bedsOf(row))} total`}>
        <div className="grid grid-cols-4 gap-2">
          {BEDS.map(([k, label]) => (
            <div key={k}>
              <label className="eyebrow" htmlFor={id(k)}>{label}</label>
              <Controller
                control={control}
                name={`communities.${i}.${k}`}
                render={({ field }) => (
                  <NumInput id={id(k)} value={field.value} onChange={field.onChange} onBlur={field.onBlur} min={0} invalid={bedsBad} aria-label={`Community ${position} ${label} beds`} />
                )}
              />
            </div>
          ))}
        </div>
        {problems.length > 0 && <p className="text-xs mt-1.5 rounded bg-teton-red/30 px-2 py-1">{problems.join(' · ')}</p>}
      </Group>

      <Group title="Timing">
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
          <div>
            <label className="eyebrow" htmlFor={id('golive')}>Go-live</label>
            <input
              id={id('golive')}
              type="month"
              className="input-field px-2"
              aria-label={`Community ${position} go-live month`}
              {...register(`communities.${i}.goLiveMonth`, { setValueAs: (v) => (v ? v : null) })}
            />
          </div>
          <div>
            <label className="eyebrow" htmlFor={id('delay')}>ROI delay (mo)</label>
            <Controller
              control={control}
              name={`communities.${i}.roiDelayMonths`}
              render={({ field }) => (
                <NumInput id={id('delay')} value={field.value} onChange={field.onChange} nullable placeholder={inputs ? `${inputs.schedule.roiStartDelayMonths} (deal)` : ''} min={0} aria-label={`Community ${position} ROI delay`} />
              )}
            />
          </div>
        </div>
        {!row.goLiveMonth && <p className="hint">Blank = month 1, or right after the pilot for non-pilot sites.</p>}
      </Group>

      <Group title="Coverage & add-ons">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div role="radiogroup" aria-label={`Community ${position} coverage`} className="inline-flex rounded-lg border border-teton-pale-gray p-0.5">
            {(
              [
                ['rooms_only', 'Rooms only'],
                ['full_facility', 'Full facility'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="cursor-pointer">
                <input type="radio" value={v} className="peer sr-only" {...register(`communities.${i}.coverage`)} />
                <span className="block px-3 py-1.5 rounded-md text-xs text-teton-dark-gray peer-checked:bg-teton-near-black peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent">
                  {label}
                </span>
              </label>
            ))}
          </div>
          <Controller
            control={control}
            name={`communities.${i}.ecall`}
            render={({ field }) => <Switch id={id('ecall')} label="E-Call" checked={!!field.value && ecallOn} disabled={!ecallOn} onChange={field.onChange} />}
          />
        </div>
        {!ecallOn && <p className="hint">The deal has no E-Call add-on (Commercial terms).</p>}
      </Group>

      <Group title="Pilot">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <div className="pb-2">
            <Controller
              control={control}
              name={`communities.${i}.pilot`}
              render={({ field }) => <Switch id={id('pilot')} label="Pilot site" checked={isPilot} disabled={!withPilot} onChange={field.onChange} />}
            />
          </div>
          {isPilot && (
            <div className="w-28">
              <label className="eyebrow" htmlFor={id('pilotbeds')}>Pilot beds</label>
              <Controller
                control={control}
                name={`communities.${i}.pilotUnits`}
                render={({ field }) => <NumInput id={id('pilotbeds')} value={field.value} onChange={field.onChange} nullable placeholder="All" min={1} aria-label={`Community ${position} pilot units`} />}
              />
            </div>
          )}
        </div>
        {!withPilot && <p className="hint">The deal has no pilot phase (Timeline).</p>}
      </Group>

      <Group title="Advanced" note="blank uses the deal values">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="eyebrow" htmlFor={id('occ')}>Occupancy</label>
            <Controller
              control={control}
              name={`communities.${i}.occupancy`}
              render={({ field }) => (
                <NumInput id={id('occ')} value={field.value} onChange={field.onChange} nullable scale={100} suffix="%" placeholder={inputs ? `${Number((inputs.client.occupancy * 100).toFixed(4))} (deal)` : ''} min={0} max={1} aria-label={`Community ${position} occupancy`} />
              )}
            />
          </div>
          <div>
            <label className="eyebrow" htmlFor={id('sensors')}>Extra sensors</label>
            <Controller
              control={control}
              name={`communities.${i}.additionalSensors`}
              render={({ field }) => <NumInput id={id('sensors')} value={field.value} onChange={field.onChange} min={0} aria-label={`Community ${position} sensors`} />}
            />
          </div>
        </div>
      </Group>

      {cashFlow && start && (
        <p className="text-xs text-teton-dark-gray mt-3 rounded-lg bg-teton-almost-white px-3 py-2">
          Live {ymLabel(monthLabel(start, cashFlow.goLiveMonth))} (month {cashFlow.goLiveMonth}{row.goLiveMonth ? '' : ', default'})
          {cashFlow.inPilot ? ` · pilot to month ${cashFlow.firstPostPilotMonth - 1}` : ''} · ROI from month {cashFlow.roiStartMonth}
        </p>
      )}
    </div>
  );
}
