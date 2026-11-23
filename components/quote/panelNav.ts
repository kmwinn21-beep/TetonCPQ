'use client';

/** The deal page's right-panel cards: open one and scroll to it (from the phone sections menu). */
import { useEffect } from 'react';

export const OPEN_PANEL = 'teton:open-panel';
export const PANELS = [
  ['collaborators', 'Collaborators'],
  ['deal-details', 'Deal Details'],
  ['tasks', 'Tasks'],
  ['floor-plans', 'Floor Plans'],
  ['notifications', 'Notifications'],
  ['live-preview', 'Live preview'],
  ['version-history', 'Version History'],
] as const;
export type PanelId = (typeof PANELS)[number][0];
export const panelElId = (id: PanelId) => `panel-${id}`;

/** A panel card opens when asked. */
export function usePanelOpener(id: PanelId, setOpen: (open: boolean) => void) {
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<string>).detail === id && setOpen(true);
    window.addEventListener(OPEN_PANEL, on);
    return () => window.removeEventListener(OPEN_PANEL, on);
  }, [id, setOpen]);
}

/** Open a panel and bring it into view. */
export function openPanel(id: PanelId) {
  window.dispatchEvent(new CustomEvent(OPEN_PANEL, { detail: id }));
  setTimeout(() => document.getElementById(panelElId(id))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
}
