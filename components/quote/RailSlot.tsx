'use client';

/**
 * Lets a section borrow the editor's right-hand rail (where the live results
 * sit on wide screens) for a details panel. While a section is using it, the
 * rail shows that panel instead of the results.
 */
import { createContext, useContext } from 'react';

export interface RailSlot {
  /** Element to portal into; null when the rail isn't beside the form (narrow screens). */
  el: HTMLElement | null;
  setActive: (active: boolean) => void;
}

export const RailSlotContext = createContext<RailSlot>({ el: null, setActive: () => {} });
export const useRailSlot = () => useContext(RailSlotContext);
