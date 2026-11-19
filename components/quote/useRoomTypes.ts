'use client';

/**
 * A community's room types in the form, and the one way to change them: the
 * beds and additional sensors they imply are written alongside (rooms locked
 * to the floor plan follow their tagged badges).
 */
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { normalizeAllowance, roomDerived, type RoomType } from '@/lib/quote/roomTypes';

/** Rooms counted from the plan follow their badges. */
export const syncRooms = (t: RoomType): RoomType => (t.roomsFromPlan ? { ...t, rooms: (t.marks ?? []).length } : t);

export function useRoomTypes(i: number) {
  const { control, setValue, getValues } = useFormContext<QuoteDraft>();
  const raw = useWatch({ control, name: `communities.${i}.roomTypes` }) as RoomType[] | undefined;
  const types = Array.isArray(raw) ? raw : [];
  const write = (next: RoomType[], pct = normalizeAllowance(getValues(`communities.${i}.sensorAllowancePct`))) => {
    if (i < 0) return;
    const list = next.map(syncRooms);
    setValue(`communities.${i}.roomTypes`, list, { shouldDirty: true });
    // Beds from every room type; extra sensors from the monitored ones (their care type has resident monitoring).
    const s = roomDerived({ ...getValues(`communities.${i}`), roomTypes: list }, pct);
    if (!s) return;
    const opts = { shouldDirty: true } as const;
    setValue(`communities.${i}.ilBeds`, s.beds.il, opts);
    setValue(`communities.${i}.alBeds`, s.beds.al, opts);
    setValue(`communities.${i}.mcBeds`, s.beds.mc, opts);
    setValue(`communities.${i}.snfBeds`, s.beds.snf, opts);
    setValue(`communities.${i}.additionalSensors`, s.additionalSensors, opts);
  };
  /** Always the latest list (for handlers that run after other writes). */
  const current = () => ((i >= 0 ? getValues(`communities.${i}.roomTypes`) : []) ?? []) as RoomType[];
  return { types, write, current };
}
