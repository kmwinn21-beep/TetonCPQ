'use client';

/** Shared state for the business case's options panel (Inspector.tsx), kept apart so any component can read it. */
import { createContext, useContext } from 'react';

export type InspTab = 'table' | 'section' | 'page' | 'removed';
export interface InspSel {
  tab: InspTab;
  /** The page slot (data-bc-page) and its title. */
  page: string | null;
  pageTitle: string;
  /** The section: its id, the Blocks it belongs to (its page key) and its name. */
  block: string | null;
  blocksPage: string | null;
  blockLabel: string | null;
  /** The table (data-rtable) and its name. */
  table: string | null;
  tableName: string | null;
}

interface Ctx {
  on: boolean;
  sel: InspSel | null;
  select: (s: InspSel | null) => void;
  /** Where sections and pages put their options. */
  main: HTMLElement | null;
  sections: HTMLElement | null;
  foot: HTMLElement | null;
  pageDisplay: HTMLElement | null;
}
export const InspectorCtx = createContext<Ctx>({ on: false, sel: null, select: () => {}, main: null, sections: null, foot: null, pageDisplay: null });
export const useInspector = () => useContext(InspectorCtx);
/** True inside the panel (a view switch there shows as a panel row). */
export const InPanelCtx = createContext(false);
/** Inside a section: where its display options go while it's selected (else null). */
export const BlockDisplayCtx = createContext<{ el: HTMLElement | null } | null>(null);


/** Open the panel on everything removed (the toolbar's Removed button). */
export const openInspectorRemoved = () => window.dispatchEvent(new CustomEvent('bc-inspector', { detail: 'removed' }));
