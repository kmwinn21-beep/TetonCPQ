'use client';

/**
 * Every field of one community, grouped the way a rep thinks about a site:
 * name, beds, timing, coverage & add-ons, pilot, then the per-site overrides.
 * Shown in the panel beside the list, or under its row where there isn't room.
 */
import { SegGroup } from '@/components/form/SegGroup';
import { FloorPlans } from './FloorPlans';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { BED_KEYS, bedsOf, productsOf, scopeOf, type BedKey, type BedProducts, type QuoteDraft } from '@/lib/quote/draft';
import { roomDerived } from '@/lib/quote/roomTypes';
import { communityProblems, ymLabel } from '@/lib/quote/communityRow';
import { monthLabel } from '@/lib/quote/toModelInputs';
import type { ModelInputs, ModelResult } from '@/lib/model';

type CommunityCashFlow = ModelResult['cashFlow']['communities'][number];
import { count } from '@/lib/format';
import { NumInput } from '@/components/form/NumInput';
import { RoomTypesEditor } from './RoomTypesEditor';

const BEDS = [
  ['ilBeds', 'IL', 'il'],
  ['alBeds', 'AL', 'al'],
  ['mcBeds', 'MC', 'mc'],
  ['snfBeds', 'SNF', 'snf'],
] as const;

/** A tick box drawn as a filled square (a real checkbox underneath), with a roomy tap target. */
export function Tick({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className={`inline-flex items-center justify-center w-10 h-10 -my-1 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} title={label}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span
        aria-hidden="true"
        className="relative w-5 h-5 rounded-md border-[1.5px] border-teton-pale-gray bg-white transition-colors duration-200 motion-reduce:transition-none peer-checked:bg-teton-near-black peer-checked:border-teton-near-black peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent [&>svg]:opacity-0 [&>svg]:scale-50 peer-checked:[&>svg]:opacity-100 peer-checked:[&>svg]:scale-100"
      >
        <svg viewBox="0 0 16 16" className="absolute inset-0 m-auto w-3.5 h-3.5 text-white transition duration-200 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
    </label>
  );
}

/** An on/off switch over a checkbox, so it stays a real form control. */
export function Switch({ checked, onChange, disabled, label, id }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; id: string }) {
  return (
    <label htmlFor={id} className={`inline-flex items-center gap-2 text-sm select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="relative inline-flex">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="w-8 h-[18px] rounded-full bg-teton-pale-gray peer-checked:bg-teton-near-black transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent" />
        <span className="absolute left-[2px] top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 ease-out peer-checked:translate-x-[14px]" />
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
  const { control, register, setValue, getValues } = useFormContext<QuoteDraft>();
  const row = useWatch({ control, name: `communities.${i}` });
  const ecallOn = useWatch({ control, name: 'commercial.ecall' }) !== 'none';
  const withPilot = !!useWatch({ control, name: 'schedule.withPilot' });
  if (!row) return null;
  // Room types, when present, set the beds and extra sensors.
  const fromRooms = Array.isArray(row.roomTypes) && row.roomTypes.length > 0;

  const id = (k: string) => `ce-${row.id}-${k}`;
  const problems = showErrors ? communityProblems(row) : [];
  const nameBad = problems.includes('Needs a name');
  const bedsBad = problems.includes('No beds');
  const start = inputs?.schedule.startDate;
  const isPilot = withPilot && !!row.pilot;
  const products = productsOf(row);
  const scope = scopeOf(row, ecallOn);
  // Tick or untick a product for one care type; room types' extra sensors follow (only monitored rooms get sensors).
  const setProduct = (k: BedKey, f: keyof BedProducts, v: boolean) => {
    const cur = productsOf(getValues(`communities.${i}`));
    const next = { ...cur, [k]: { ...cur[k], [f]: v } };
    const opts = { shouldDirty: true } as const;
    setValue(`communities.${i}.products`, next, opts);
    const after = { ...getValues(`communities.${i}`), products: next };
    setValue(`communities.${i}.monitoring`, BED_KEYS.some((t) => next[t].monitoring), opts);
    setValue(`communities.${i}.ecall`, BED_KEYS.some((t) => next[t].ecall), opts);
    const r = roomDerived(after);
    if (r) setValue(`communities.${i}.additionalSensors`, r.additionalSensors, opts);
  };

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

      {/* Site switches and its floor plans, above the name. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span title={withPilot ? undefined : 'The deal has no pilot (Pricing & products)'}>
          <Controller
            control={control}
            name={`communities.${i}.pilot`}
            render={({ field }) => <Switch id={id('pilot')} label="Pilot site" checked={isPilot} disabled={!withPilot} onChange={field.onChange} />}
          />
        </span>
        <FloorPlans communityId={row.id} communityName={row.name} />
      </div>

      <div className="mt-3">
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
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-2 mt-2">
        <div>
          <label className="eyebrow" htmlFor={id('city')}>City</label>
          <input id={id('city')} className="input-field" placeholder="Louisville" aria-label={`Community ${position} city`} {...register(`communities.${i}.city`)} />
        </div>
        <div>
          <label className="eyebrow" htmlFor={id('market')}>State</label>
          <input id={id('market')} className="input-field px-2.5" placeholder="KY" aria-label={`Community ${position} market`} {...register(`communities.${i}.market`)} />
        </div>
      </div>

      <Group title="Beds" note={`${count(bedsOf(row))} total${fromRooms ? ' · set from the room types' : ''}`}>
        {/* Each care type's beds and the products priced on them. */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray">
              <th className="text-left font-semibold pb-1.5 w-12">Care</th>
              <th className="text-left font-semibold pb-1.5">Beds</th>
              <th className="font-semibold pb-1.5 w-[5.5rem] leading-tight">Resident<br />Monitoring</th>
              {ecallOn && <th className="font-semibold pb-1.5 w-[4.5rem]">E-Call</th>}
            </tr>
          </thead>
          <tbody>
            {BEDS.map(([k, label, key]) => {
              const p = products[key];
              const off = !p.monitoring && !(ecallOn && p.ecall);
              return (
                <tr key={k} className="border-t border-teton-off-white">
                  <td className="py-1.5 font-semibold">{label}</td>
                  <td className="py-1.5 pr-2">
                    <div className="max-w-[6.5rem]">
                      <Controller
                        control={control}
                        name={`communities.${i}.${k}`}
                        render={({ field }) => (
                          <NumInput id={id(k)} value={field.value} onChange={field.onChange} onBlur={field.onBlur} min={0} invalid={bedsBad} disabled={fromRooms} className={off && !fromRooms ? '[&_input]:text-teton-ui-gray' : undefined} aria-label={`Community ${position} ${label} beds`} />
                        )}
                      />
                    </div>
                  </td>
                  <td className="py-1.5 text-center">
                    <Tick checked={p.monitoring} onChange={(v) => setProduct(key, 'monitoring', v)} label={`${label} beds: Resident Monitoring`} />
                  </td>
                  {ecallOn && (
                    <td className="py-1.5 text-center">
                      <Tick checked={p.ecall} onChange={(v) => setProduct(key, 'ecall', v)} label={`${label} beds: E-Call`} />
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="border-t-[1.5px] border-teton-near-black font-semibold">
              <td className="py-1.5">Priced</td>
              <td className="py-1.5 text-xs font-normal text-teton-ui-gray">of {count(scope.beds)}</td>
              <td className="py-1.5 text-center tabular-nums">{count(scope.monitored)}</td>
              {ecallOn && <td className="py-1.5 text-center tabular-nums">{count(scope.ecall)}</td>}
            </tr>
          </tbody>
        </table>
        <p className="hint mt-1.5">
          {fromRooms
            ? 'Bed counts come from the room types. Tick products per care type here; each room type follows its care setting.'
            : 'Tick the products priced on each care type’s beds. Beds with neither are left out of the pricing.'}
          {scope.monitored === 0 && scope.priced > 0 && ' E-Call only: no resident monitoring subscription, Edge units or sensors, and no ROI benefits.'}
          {!ecallOn && ' The deal has no E-Call add-on (Pricing & products).'}
        </p>
        {problems.length > 0 && <p className="text-xs mt-1.5 rounded bg-teton-red/30 px-2 py-1">{problems.join(' · ')}</p>}
        <RoomTypesEditor index={i} position={position} />
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

      <Group title="Coverage">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <SegGroup label={`Community ${position} coverage`} thumbClass="bg-teton-near-black" className="inline-flex rounded-lg border border-teton-pale-gray p-0.5">
            {(
              [
                ['rooms_only', 'Rooms only'],
                ['full_facility', 'Full facility'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="cursor-pointer">
                <input type="radio" value={v} className="peer sr-only" {...register(`communities.${i}.coverage`)} />
                <span className="block px-3 py-1.5 rounded-md text-xs text-teton-dark-gray transition-colors duration-200 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent">
                  {label}
                </span>
              </label>
            ))}
          </SegGroup>
        </div>
      </Group>

      {isPilot && (
        <Group title="Pilot">
          <div className="w-28">
            <label className="eyebrow" htmlFor={id('pilotbeds')}>Pilot beds</label>
            <Controller
              control={control}
              name={`communities.${i}.pilotUnits`}
              render={({ field }) => <NumInput id={id('pilotbeds')} value={field.value} onChange={field.onChange} nullable placeholder="All" min={1} aria-label={`Community ${position} pilot units`} />}
            />
          </div>
        </Group>
      )}

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
              render={({ field }) => <NumInput id={id('sensors')} value={field.value} onChange={field.onChange} min={0} disabled={fromRooms} aria-label={`Community ${position} sensors`} />}
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
