'use client';

/**
 * Room types from a community's floor plans. Optional: once a room type is
 * added, the community's beds and additional sensors are worked out from them
 * (Σ rooms × sensors per room, plus the allowance, less one sensor per
 * each room) and those fields stop being typed in.
 */
import { useFormContext, useWatch } from 'react-hook-form';
import { productsOf, type QuoteDraft } from '@/lib/quote/draft';
import { AREA_KINDS, badgeOf, bedKeyOf, commonAreaFromPlan, devicesLabel, duplicateRoomTypes, CARE_LABEL, DEFAULT_ALLOWANCE, DEFAULT_PENDANT_ALLOWANCE, newCommonArea, newRoomType, nextBadgeColor, residentsOf, MAX_RESIDENTS, edgesOf, MAX_EDGES, SENSORS_PER_EDGE, normalizeAllowance, normalizeCommonAreas, normalizePendantAllowance, pendantScope, roomDerived, type AreaKind, type CareType, type CommonArea, type RoomType } from '@/lib/quote/roomTypes';
import { useFloorPlans } from './FloorPlans';
import { Badge } from './ScopeViewer';
import { useRoomTypes } from './useRoomTypes';
import { Counter } from '@/components/form/Counter';
import { NumInput } from '@/components/form/NumInput';
import { count } from '@/lib/format';
import { canAutoFocus } from '@/lib/client/focus';

const iconBtn = 'w-7 h-9 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink';
const eyebrow = 'block text-[10px] font-semibold uppercase tracking-wider text-teton-ui-gray mb-1 truncate';
/** For narrow number fields: wraps onto two lines rather than cutting off. */
const eyebrowWrap = 'block text-[10px] font-semibold uppercase tracking-wider leading-tight text-teton-ui-gray mb-1';

export function RoomTypesEditor({ index: i, position }: { index: number; position: number }) {
  const { control, setValue, getValues } = useFormContext<QuoteDraft>();
  const raw = useWatch({ control, name: `communities.${i}.roomTypes` }) as RoomType[] | undefined;
  const allowance = useWatch({ control, name: `communities.${i}.sensorAllowancePct` });
  const types = Array.isArray(raw) ? raw : [];
  const productsRaw = useWatch({ control, name: `communities.${i}.products` });
  const legacy = useWatch({ control, name: [`communities.${i}.monitoring`, `communities.${i}.ecall`] });
  const ecallOption = useWatch({ control, name: 'commercial.ecall' });
  const ecallOn = ecallOption !== 'none';
  const products = productsOf({ products: productsRaw, monitoring: legacy[0], ecall: legacy[1] });
  // E-Call devices: pendants (Bluetooth) or pull-cords (Inovonics), per room and in common areas.
  const anyEcall = ecallOn && (['il', 'al', 'mc', 'snf'] as const).some((k) => products[k].ecall);
  const dev = ecallOption === 'inovonics' ? { rm: 'Cords / rm', each: 'Pull-cords each', many: 'pull-cords', one: 'pull-cord' } : { rm: 'Pendants / rm', each: 'Pendants each', many: 'pendants', one: 'pendant' };
  const areasRaw = useWatch({ control, name: `communities.${i}.commonAreas` }) as CommonArea[] | undefined;
  const areas = Array.isArray(areasRaw) ? areasRaw : [];
  const pendantPct = useWatch({ control, name: `communities.${i}.pendantAllowancePct` });
  const bedsW = useWatch({ control, name: [`communities.${i}.ilBeds`, `communities.${i}.alBeds`, `communities.${i}.mcBeds`, `communities.${i}.snfBeds`] });
  const pend = pendantScope({ roomTypes: types, products: productsRaw, monitoring: legacy[0], ecall: legacy[1], commonAreas: areas, pendantAllowancePct: pendantPct, ilBeds: bedsW[0], alBeds: bedsW[1], mcBeds: bedsW[2], snfBeds: bedsW[3] }, ecallOn);
  const writeAreas = (next: CommonArea[]) => {
    setValue(`communities.${i}.commonAreas`, next, { shouldDirty: true });
    const ca = commonAreaFromPlan({ ...getValues(`communities.${i}`), commonAreas: next });
    if (ca != null) setValue(`communities.${i}.commonAreaSensors`, ca, { shouldDirty: true });
  };
  const patchArea = (id: string, p: Partial<CommonArea>) => writeAreas(areas.map((a) => (a.id === id ? { ...a, ...p } : a)));
  // Room type cards: a pendants column when the community has E-Call; no sensors column when it has no Resident Monitoring.
  const anyMon = (['il', 'al', 'mc', 'snf'] as const).some((k) => products[k].monitoring);
  const showSensors = anyMon || !anyEcall;
  // Name across the top; care setting, rooms and remove; then the sensors / devices counters.
  const cols = 'grid-cols-[minmax(0,1fr)_5.5rem_1.75rem]';
  const span = 'col-span-3';

  // Room types and the beds and additional sensors they imply, written together.
  const { write } = useRoomTypes(i);
  const fp = useFloorPlans();
  const communityId = useWatch({ control, name: `communities.${i}.id` });
  const plans = fp ? fp.plans.filter((p) => p.communityId === communityId) : [];
  const planIds = plans.map((p) => p.id);
  // A later room type that repeats an earlier one's name in the same care setting is flagged (saving is blocked).
  const dupes = duplicateRoomTypes(types.map((t) => ({ ...t, name: t.name ?? '' })));
  const anyTagged = types.some((t) => (t.marks ?? []).some((m) => planIds.includes(m.plan)));
  const patch = (id: string, p: Partial<RoomType>) => write(types.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const derived = types.length ? roomDerived({ roomTypes: types, products: productsRaw, monitoring: legacy[0], ecall: legacy[1] }, normalizeAllowance(allowance)) : null;
  const scope = derived?.monitored ?? null;
  const unmonitored = derived ? derived.all.rooms - derived.monitored.rooms : 0;

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
          {types.map((t, k) => (
            <div key={t.id} className={`grid ${cols} gap-x-1.5 gap-y-2 items-end rounded-lg border border-teton-off-white p-2`}>
              <div className={span}>
                <span className={eyebrow}>Room Type/Name</span>
                <span className="flex items-center gap-2">
                  {/* Its badge on the floor plans. */}
                  <Badge color={badgeOf(t, k).color} text={badgeOf(t, k).initials} size={26} occ={residentsOf(t)} className="flex-shrink-0" />
                  <input
                    className={`input-field px-2 py-1.5 ${dupes.has(t.id) ? 'ring-2 ring-teton-red border-transparent' : ''}`}
                    value={t.name}
                    placeholder="e.g. Studio"
                    aria-invalid={dupes.has(t.id) || undefined}
                    aria-label={`Community ${position} room type ${k + 1} name`}
                    onChange={(e) => patch(t.id, { name: e.target.value })}
                  />
                </span>
                {dupes.has(t.id) && (
                  <p role="alert" className="mt-1 rounded bg-teton-red/25 px-2 py-1 text-[11px] text-[#9A2E1C] drawer-in">
                    “{dupes.get(t.id)!.name}” already exists in {t.care === 'custom' ? t.customCare || 'this care type' : CARE_LABEL[t.care]}. Rename it or change its care setting.
                  </p>
                )}
              </div>
              <div className="min-w-0">
              <span className={eyebrow}>Care Setting</span>
              {t.care === 'custom' ? (
                <span className="flex items-center gap-1">
                  <input
                    className="input-field px-1.5 text-xs min-w-0"
                    value={t.customCare ?? ''}
                    placeholder="Care type"
                    autoFocus={!t.customCare && canAutoFocus()}
                    aria-label={`Community ${position} room type ${k + 1} custom care type`}
                    onChange={(e) => patch(t.id, { customCare: e.target.value })}
                  />
                  <button type="button" className="text-[11px] text-teton-ui-gray underline flex-shrink-0" title="Choose from the list" onClick={() => patch(t.id, { care: 'al', customCare: undefined })}>
                    List
                  </button>
                </span>
              ) : (
              // Same height as the number boxes, with room before its own chevron.
              <span className="relative block">
                <select className="input-field appearance-none pl-2 pr-8 text-xs truncate" value={t.care} aria-label={`Community ${position} room type ${k + 1} care`} onChange={(e) => patch(t.id, { care: e.target.value as CareType })}>
                  {(Object.keys(CARE_LABEL) as CareType[]).map((c) => (
                    <option key={c} value={c}>
                      {CARE_LABEL[c]}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-teton-ui-gray" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </span>
              )}
              </div>
              <div>
                <span className={eyebrow}>Rooms</span>
                {/* Counted from the tagged badges unless overridden. */}
                <NumInput
                  value={t.roomsFromPlan ? (t.marks ?? []).length : t.rooms}
                  onChange={(v) => patch(t.id, { rooms: v ?? 0 })}
                  min={0}
                  disabled={!!t.roomsFromPlan}
                  aria-label={`Community ${position} room type ${k + 1} rooms`}
                />
              </div>
              <button
                type="button"
                className={iconBtn}
                onClick={() => {
                  const n = (t.marks ?? []).length;
                  if (n && !window.confirm(`Remove ${t.name || 'this room type'} and its ${n} badge${n === 1 ? '' : 's'} on the floor plans?`)) return;
                  write(types.filter((x) => x.id !== t.id));
                }}
                aria-label={`Remove room type ${k + 1}`}
                title="Remove"
              >
                ✕
              </button>
              {/* Sensors and E-Call devices per room: counters, locked at 0 (with why) where the care setting or the deal
                  has none. */}
              <div className={`${span} grid grid-cols-2 gap-2`}>
                {/* Residents sharing each room (companion suites, semi-private): each is a billed bed; the room keeps one
                    Edge unit. Sensors and devices follow the residents until changed by hand. */}
                <div>
                  <span className={eyebrowWrap}>Residents / room</span>
                  <Counter
                    size="sm"
                    value={residentsOf(t)}
                    min={1}
                    max={MAX_RESIDENTS}
                    onChange={(v) => {
                      const was = residentsOf(t);
                      patch(t.id, {
                        residents: v > 1 ? v : undefined,
                        ...(t.sensors === was ? { sensors: v } : {}),
                        ...(t.pendants === v ? { pendants: undefined } : {}),
                      });
                    }}
                    aria-label={`Community ${position} room type ${k + 1} residents per room`}
                  />
                </div>
                {showSensors && (
                  <div>
                    <span className={`${eyebrowWrap} ${products[bedKeyOf(t)].monitoring ? '!text-[#5B3FA8]' : ''}`}>Edge units / room</span>
                    {products[bedKeyOf(t)].monitoring ? (
                      <Counter size="sm" value={edgesOf(t)} onChange={(v) => patch(t.id, { edges: v > 1 ? v : undefined })} min={1} max={MAX_EDGES} aria-label={`Community ${position} room type ${k + 1} Edge units per room`} />
                    ) : (
                      <Counter size="sm" value={0} onChange={() => {}} disabled reason="No Resident Monitoring in this care setting" aria-label={`Community ${position} room type ${k + 1} Edge units per room (none: no Resident Monitoring)`} />
                    )}
                  </div>
                )}
                {showSensors && (
                  <div>
                    <span className={eyebrowWrap}>Sensors / room</span>
                    {products[bedKeyOf(t)].monitoring ? (
                      <Counter size="sm" value={t.sensors} onChange={(v) => patch(t.id, { sensors: v })} min={1} max={20} aria-label={`Community ${position} room type ${k + 1} sensors per room`} />
                    ) : (
                      <Counter size="sm" value={0} onChange={() => {}} disabled reason="No Resident Monitoring in this care setting" aria-label={`Community ${position} room type ${k + 1} sensors per room (none: no Resident Monitoring)`} />
                    )}
                  </div>
                )}
                <div>
                  <span className={`${eyebrowWrap} ${ecallOn && products[bedKeyOf(t)].ecall ? '!text-[#C2492F]' : '!text-[#B4AFA6]'}`}>{devicesLabel(ecallOption)} / room</span>
                  {!ecallOn ? (
                    <Counter size="sm" value={0} onChange={() => {}} disabled reason="E-Call isn’t part of this deal" aria-label={`Community ${position} room type ${k + 1} ${dev.many} per room (none: no E-Call on the deal)`} />
                  ) : products[bedKeyOf(t)].ecall ? (
                    <Counter size="sm" value={t.pendants ?? residentsOf(t)} onChange={(v) => patch(t.id, { pendants: v === residentsOf(t) ? undefined : v })} min={1} max={20} aria-label={`Community ${position} room type ${k + 1} ${dev.many} per room`} />
                  ) : (
                    <Counter size="sm" value={0} onChange={() => {}} disabled reason="No E-Call in this care setting" aria-label={`Community ${position} room type ${k + 1} ${dev.many} per room (none: no E-Call)`} />
                  )}
                </div>
              </div>
              {/* Room size (recorded only; no calculation uses it yet). */}
              <div className={`${span} flex items-center gap-2`}>
                <span className={`${eyebrowWrap} !mb-0`}>Size (SF)</span>
                <span className="w-28">
                  <NumInput value={t.sqft ?? null} nullable placeholder="Optional" suffix="SF" min={1} max={100000} onChange={(v) => patch(t.id, { sqft: v != null && v >= 1 ? Math.round(v) : undefined })} aria-label={`Community ${position} room type ${k + 1} size in square feet`} />
                </span>
              </div>
              {/* The products this room type gets: its care setting's ticks in the Beds grid above. */}
              <div className={`${span} -mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-teton-ui-gray`}>
                Products
                <ProductPill on={products[bedKeyOf(t)].monitoring} tone="lav">Monitoring</ProductPill>
                {ecallOn && <ProductPill on={products[bedKeyOf(t)].ecall} tone="coral">E-Call</ProductPill>}
                <span>· from {bedKeyOf(t).toUpperCase()} above</span>
              </div>
              <PlanLine
                span={span}
                t={t}
                tagged={(t.marks ?? []).filter((m) => planIds.includes(m.plan)).length}
                hasPlans={plans.length > 0}
                warn={anyTagged}
                onLock={(on) => patch(t.id, on ? { roomsFromPlan: true, rooms: (t.marks ?? []).length } : { roomsFromPlan: undefined, rooms: (t.marks ?? []).length })}
                onShow={() => fp?.openViewer(communityId, { typeId: t.id, planId: (t.marks ?? []).find((m) => planIds.includes(m.plan))?.plan })}
                onTag={() => fp?.openViewer(communityId, { scope: true })}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <button type="button" className="btn-secondary py-1 text-xs" onClick={() => write([...types, { ...newRoomType(), color: nextBadgeColor(types) }])}>
          + Add room type
        </button>
        {types.length > 0 && showSensors && (
          <label className="flex items-center gap-1.5 text-xs text-teton-dark-gray">
            {anyEcall ? 'Sensor contingency' : 'Contingency'}
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
                aria-label={`Community ${position} sensor contingency`}
              />
            </span>
          </label>
        )}
      </div>
      {scope && showSensors && (
        <p className="text-xs text-teton-dark-gray mt-2 rounded-lg bg-teton-almost-white px-3 py-2">
          {types.some((t) => t.care === 'custom') && <span className="block mb-1">Custom care types count as assisted living beds.</span>}
          {unmonitored > 0 && <span className="block mb-1">{count(unmonitored)} rooms without Resident Monitoring get no Edge units or sensors.</span>}
          {scope.residents > scope.rooms && (
            <span className="block mb-1">
              Shared rooms: <b>{count(scope.residents)} residents</b> (billed beds) in {count(scope.rooms)} rooms, one Edge unit per room.
            </span>
          )}
          {scope.edges !== scope.rooms && (
            <span className="block mb-1">
              <b>{count(scope.edges)} Edge units</b> in {count(scope.rooms)} monitored rooms (some rooms need more than one).
            </span>
          )}
          {products && Object.values(products).some((x) => x.monitoring) && types.some((t) => products[bedKeyOf(t)].monitoring && t.sensors > edgesOf(t) * SENSORS_PER_EDGE) && (
            <span className="block mb-1 text-[#8A5A00]">One Edge unit handles up to {SENSORS_PER_EDGE} sensors: a room type has more sensors than its Edge units can take.</span>
          )}
          {count(scope.rooms)} monitored rooms · {count(scope.planSensors)} sensors from the plan + {count(scope.allowance)} contingency = <b>{count(scope.totalSensors)} sensors</b>, so{' '}
          <b>{count(scope.additionalSensors)} extra</b> beyond one per resident. Beds and extra sensors are set from these.
        </p>
      )}
      {anyEcall && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Common areas (optional)</span>
            <span className="text-[11px] text-teton-ui-gray">E-Call · billed per area, per month</span>
          </div>
          {areas.length > 0 && (
            <div className="mt-1 space-y-1.5">
              {areas.map((a, k) => (
                <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_1.75rem] gap-x-1.5 gap-y-2 items-end rounded-lg border border-teton-off-white p-2">
                  <div className="col-span-2">
                    <span className={eyebrow}>Area name</span>
                    <input className="input-field px-2 py-1.5" value={a.name} placeholder="e.g. Communal bathroom" aria-label={`Community ${position} common area ${k + 1} name`} onChange={(e) => patchArea(a.id, { name: e.target.value })} />
                  </div>
                  <div className="min-w-0">
                    <span className={eyebrow}>Kind</span>
                    <span className="relative block">
                      <select className="input-field appearance-none pl-2 pr-7 text-xs truncate" value={a.kind} aria-label={`Community ${position} common area ${k + 1} kind`} onChange={(e) => patchArea(a.id, { kind: e.target.value as AreaKind })}>
                        {(Object.keys(AREA_KINDS) as AreaKind[]).map((x) => (
                          <option key={x} value={x}>{AREA_KINDS[x]}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-teton-ui-gray" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </div>
                  <button type="button" className={iconBtn} onClick={() => writeAreas(areas.filter((x) => x.id !== a.id))} aria-label={`Remove common area ${k + 1}`} title="Remove">
                    ✕
                  </button>
                  <div className="col-span-2 grid grid-cols-2 gap-2">
                    <div>
                      <span className={eyebrowWrap}>How many</span>
                      {a.mark ? (
                        <Counter size="sm" value={1} onChange={() => {}} disabled reason={`Tagged on a floor plan (page ${a.mark.page})`} aria-label={`Community ${position} common area ${k + 1} how many (tagged on a floor plan)`} />
                      ) : (
                        <Counter size="sm" value={a.count} onChange={(v) => patchArea(a.id, { count: v })} min={0} max={500} aria-label={`Community ${position} common area ${k + 1} how many`} />
                      )}
                    </div>
                    <div>
                      <span className={`${eyebrowWrap} !text-[#C2492F]`}>{dev.each}</span>
                      <Counter size="sm" value={a.pendants} onChange={(v) => patchArea(a.id, { pendants: v })} min={0} max={20} aria-label={`Community ${position} common area ${k + 1} ${dev.many} each`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => writeAreas([...normalizeCommonAreas(areas), newCommonArea()])}>
              + Add common area
            </button>
            <label className="flex items-center gap-1.5 text-xs text-teton-dark-gray">
              {dev.one === 'pull-cord' ? 'Pull-cord' : 'Pendant'} contingency
              <span className="w-20">
                <NumInput
                  value={pendantPct ?? DEFAULT_PENDANT_ALLOWANCE}
                  scale={100}
                  suffix="%"
                  min={0}
                  max={0.5}
                  onChange={(v) => setValue(`communities.${i}.pendantAllowancePct`, normalizePendantAllowance(v ?? DEFAULT_PENDANT_ALLOWANCE), { shouldDirty: true })}
                  aria-label={`Community ${position} ${dev.one} contingency`}
                />
              </span>
            </label>
          </div>
          <p className="text-xs mt-2 rounded-lg bg-[#FDF1EE] text-[#9A2E1C] px-3 py-2">
            {count(pend.plan)} {dev.many} from the plan ({count(pend.roomPendants)} in {count(pend.rooms)} rooms{pend.areaPendants ? ` + ${count(pend.areaPendants)} in ${count(pend.areas)} common area${pend.areas === 1 ? '' : 's'}` : ''}) + {count(pend.allowance)} contingency = <b>{count(pend.total)} {dev.many}</b>.
            {pend.areas > 0 && ` Billed per month: ${count(pend.rooms)} beds + ${count(pend.areas)} common area${pend.areas === 1 ? '' : 's'}.`}
          </p>
        </div>
      )}
    </div>
  );
}

/** A product a room type gets (filled) or doesn't (outlined); read-only, set per care type in the Beds grid. */
function ProductPill({ on, tone, children }: { on: boolean; tone: 'lav' | 'coral'; children: React.ReactNode }) {
  const fill = tone === 'lav' ? 'bg-[#E7E2FB] border-[#E7E2FB] text-[#3B3270]' : 'bg-[#FDE3DD] border-[#FDE3DD] text-[#9A2E1C]';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-px text-[10.5px] font-semibold transition-colors duration-200 motion-reduce:transition-none ${on ? fill : 'border-teton-pale-gray text-teton-ui-gray bg-white'}`}>
      {children}
    </span>
  );
}

/**
 * A room type's link to the floor plans: how many rooms are tagged, whether Rooms follows them (locked) or is typed
 * in (an override), and how far a typed-in count is from the tagged one.
 */
function PlanLine({ span, t, tagged, hasPlans, warn, onLock, onShow, onTag }: { span: string; t: RoomType; tagged: number; hasPlans: boolean; warn: boolean; onLock: (on: boolean) => void; onShow: () => void; onTag: () => void }) {
  if (!hasPlans && !tagged) return null;
  const rooms = Number(t.rooms) || 0;
  const d = rooms - tagged;
  const link = 'underline text-teton-dark-gray hover:text-teton-ink';
  return (
    <div className={`${span} -mt-0.5 text-[11px] text-teton-ui-gray space-y-1`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {tagged > 0 ? (
          <>
            <span>📍 {count(tagged)} room{tagged === 1 ? '' : 's'} tagged on the floor plan</span>
            {hasPlans && <button type="button" className={link} onClick={onShow}>Show on plan</button>}
          </>
        ) : (
          <>
            <span>Not tagged on a floor plan</span>
            {hasPlans && <button type="button" className={link} onClick={onTag}>Tag on plan</button>}
          </>
        )}
        {tagged > 0 && (
          <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none" title={t.roomsFromPlan ? 'Rooms follow the tagged badges. Turn off to type a number in.' : 'Rooms are typed in. Turn on to count the tagged badges.'}>
            <span className="relative inline-flex">
              <input type="checkbox" role="switch" className="peer sr-only" checked={!!t.roomsFromPlan} onChange={(e) => onLock(e.target.checked)} />
              <span className="w-7 h-4 rounded-full bg-teton-pale-gray peer-checked:bg-teton-near-black transition-colors duration-200 motion-reduce:transition-none" />
              <span className="absolute left-[2px] top-[2px] w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none peer-checked:translate-x-3" />
            </span>
            Count from plan
          </label>
        )}
      </div>
      {warn && tagged > 0 && !t.roomsFromPlan && d !== 0 && (
        <p className="rounded bg-teton-pale-yellow px-2 py-1 text-teton-dark-gray drawer-in">
          {count(rooms)} entered is {count(Math.abs(d))} room{Math.abs(d) === 1 ? '' : 's'} {d > 0 ? 'more' : 'fewer'} than the {count(tagged)} tagged.
        </p>
      )}
    </div>
  );
}
