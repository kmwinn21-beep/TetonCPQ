'use client';

/**
 * Every business-case section the deal has, by "<sections page>:<section id>", read from the pages as built for this
 * deal (so a section the deal doesn't have, e.g. an E-Call one on a monitoring-only deal, isn't there to copy, and a
 * copy of it doesn't show). Shared with the sections lists (to show copies) and the Add menu (to offer them).
 */
import { createContext, useContext, type ReactElement } from 'react';

export interface BcSection {
  /** The business-case page it is on. */
  page: string;
  /** Its sections list ("Blocks") on that page. */
  blocksPage: string;
  id: string;
  label: string;
  /** The section as its page builds it. */
  el: ReactElement;
}

export interface BcRegistry {
  sections: Map<string, BcSection>;
  /** Each page's sections lists, in page order (a copy goes in the first). */
  blocksOf: Record<string, string[]>;
  /** A page's name (added pages by their title). */
  titleOf: (page: string) => string;
}

export const BcRegistryContext = createContext<BcRegistry | null>(null);
export const useBcRegistry = () => useContext(BcRegistryContext);

/** The page a sections list belongs to. */
export function pageOfBlocks(reg: BcRegistry, blocksPage: string): string {
  for (const [page, bps] of Object.entries(reg.blocksOf)) if (bps.includes(blocksPage)) return page;
  return blocksPage;
}
