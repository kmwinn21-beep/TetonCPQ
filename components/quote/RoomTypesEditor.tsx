'use client';

/**
 * Room types from a community's floor plans. Optional: once a room type is
 * added, the community's beds and additional sensors are worked out from them
 * (Σ rooms × sensors per room, plus the allowance, less the first sensor in
 * each room) and those fields stop being typed in.
 */
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { CARE_LABEL, DEFAULT_ALLOWANCE, newRoomType, normalizeAllowance, normalizeRoomTypes, roomScope, type CareType, type RoomType } from '@/lib/quote/roomTypes';
import { NumInput } from '@/components/form/NumInput';
import { count } from '@/lib/format';

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink';

export function RoomTypesEditor({ index: i, position }: { index: number; position: number }) {
  const { control, setValue, getValues } = useFormContext<QuoteDraft>();
  const raw = useWatch({ control, name: `communities.${i}.roomTypes` }) as RoomType[] | undefined;
  const allowance = useWatch({ control, name: `communities.${i}.sensorAllowancePct` });
  const types = Array.isArray(raw) ? raw : [];

  // Write the room types, and the beds and additional sensors they imply.
  const write = (next: RoomType[], pct = normalizeAllowance(getValues(`communities.${i}.sensorAllowancePct`))) => {
    setValue(`communities.${i}.roomTypes`, next, { shouldDirty: true });
    const clean = normalizeRoomTypes(next);
    if (!clean.length) return;
    const s = roomScope(clean, pct);
    const opts = { shouldDirty: true } as const;
    setValue(`communities.${i}.ilBeds`, s.beds.il, opts);
    setValue(`communities.${i}.alBeds`, s.beds.al, opts);
    setValue(`communities.${i}.mcBeds`, s.beds.mc, opts);
    setValue(`communities.${i}.snfBeds`, s.beds.snf, opts);
    setValue(`communities.${i}.additionalSensors`, s.additionalSensors, opts);
  };
  const patch = (id: string, p: Partial<RoomType>) => write(types.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const scope = types.length ? roomScope(normalizeRoomTypes(types), normalizeAllowance(allowance)) : null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Room types from the floor plans (optional)</span>
        {types.length > 0 && (
          <button type="button" className="text-xs text-teton-ui-gray underline hover:text-teton-ink" onClick={() => window.confirm('Remove the room types? Beds and extra sensors stay at their current numbers and can be typed in again.') && setValue(`communities.${i}.roomTypes`, [], { shouldDirty: true })}>
            Clear
          </button>
        )}
      </div>
      {types.length > 0 && (
        <div className="mt-1 space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem_1.75rem] gap-x-1.5 text-[10.5px] text-teton-ui-gray px-2">
            <span>Care</span>
            <span>Rooms</span>
            <span>Sensors per Room</span>
            <span />
          </div>
          {types.map((t, k) => (
            <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem_1.75rem] gap-x-1.5 gap-y-1 items-end rounded-lg border border-teton-off-white p-2">
              <input className="input-field px-2 py-1.5 col-span-4" value={t.name} placeholder="e.g. Studio" aria-label={`Community ${position} room type ${k + 1} name`} onChange={(e) => patch(t.id, { name: e.target.value })} />
              {t.care === 'custom' ? (
                <span className="flex items-center gap-1">
                  <input
                    className="input-field px-1.5 py-1.5 text-xs min-w-0"
                    value={t.customCare ?? ''}
                    placeholder="Care type"
                    autoFocus={!t.customCare}
                    aria-label={`Community ${position} room type ${k + 1} custom care type`}
                    onChange={(e) => patch(t.id, { customCare: e.target.value })}
                  />
                  <button type="button" className="text-[11px] text-teton-ui-gray underline flex-shrink-0" title="Choose from the list" onClick={() => patch(t.id, { care: 'al', customCare: undefined })}>
                    List
                  </button>
                </span>
              ) : (
              <select className="input-field px-1.5 py-1.5 text-xs self-end" value={t.care} aria-label={`Community ${position} room type ${k + 1} care`} onChange={(e) => patch(t.id, { care: e.target.value as CareType })}>
                {(Object.keys(CARE_LABEL) as CareType[]).map((c) => (
                  <option key={c} value={c}>
                    {CARE_LABEL[c]}
                  </option>
                ))}
              </select>
              )}
              <NumInput value={t.rooms} onChange={(v) => patch(t.id, { rooms: v ?? 0 })} min={0} aria-label={`Community ${position} room type ${k + 1} rooms`} />
              <NumInput value={t.sensors} onChange={(v) => patch(t.id, { sensors: Math.max(1, v ?? 1) })} min={1} aria-label={`Community ${position} room type ${k + 1} sensors per room`} />
              <button type="button" className={iconBtn} onClick={() => write(types.filter((x) => x.id !== t.id))} aria-label={`Remove room type ${k + 1}`} title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <button type="button" className="btn-secondary py-1 text-xs" onClick={() => write([...types, newRoomType()])}>
          + Add room type
        </button>
        {types.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-teton-dark-gray">
            Allowance
            <span className="w-20">
              <NumInput
                value={allowance ?? DEFAULT_ALLOWANCE}
                scale={100}
                suffix="%"
                min={0}
                max={0.5}
                onChange={(v) => {
                  const pct = normalizeAllowance(v ?? DEFAULT_ALLOWANCE);
                  setValue(`communities.${i}.sensorAllowancePct`, pct, { shouldDirty: true });
                  write(types, pct);
                }}
                aria-label={`Community ${position} sensor allowance`}
              />
            </span>
          </label>
        )}
      </div>
      {scope && (
        <p className="text-xs text-teton-dark-gray mt-2 rounded-lg bg-teton-almost-white px-3 py-2">
          {types.some((t) => t.care === 'custom') && <span className="block mb-1">Custom care types count as assisted living beds.</span>}
          {count(scope.rooms)} rooms · {count(scope.planSensors)} sensors from the plan + {count(scope.allowance)} allowance = <b>{count(scope.totalSensors)} sensors</b>, so{' '}
          <b>{count(scope.additionalSensors)} extra</b> beyond the first in each room. Beds and extra sensors are set from these.
        </p>
      )}
    </div>
  );
}
