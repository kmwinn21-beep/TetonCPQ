'use client';

/**
 * Open/closed state for the form's collapsible sections. Everything starts
 * collapsed; a section can be opened individually, or all at once.
 * Without a provider, sections render open.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface SectionsState {
  isOpen: (id: string) => boolean;
  setOpen: (id: string, open: boolean) => void;
  setAll: (open: boolean) => void;
  /** True when every section is open (for the Expand/Collapse all toggle). */
  allOpen: boolean;
}

const Ctx = createContext<SectionsState | null>(null);

export function SectionsProvider({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const [state, setState] = useState<{ base: boolean; overrides: Record<string, boolean> }>({ base: defaultOpen, overrides: {} });
  const isOpen = useCallback((id: string) => state.overrides[id] ?? state.base, [state]);
  const setOpen = useCallback((id: string, open: boolean) => setState((s) => ({ ...s, overrides: { ...s.overrides, [id]: open } })), []);
  const setAll = useCallback((open: boolean) => setState({ base: open, overrides: {} }), []);
  const allOpen = state.base && Object.values(state.overrides).every(Boolean);
  const value = useMemo(() => ({ isOpen, setOpen, setAll, allOpen }), [isOpen, setOpen, setAll, allOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSections(): SectionsState {
  return (
    useContext(Ctx) ?? {
      isOpen: () => true,
      setOpen: () => {},
      setAll: () => {},
      allOpen: true,
    }
  );
}

/**
 * Open the sections containing invalid fields and scroll to the first one.
 * Fields stay mounted while collapsed (just hidden), so they can be found.
 */
export function revealInvalidSections(setOpen: (id: string, open: boolean) => void) {
  const invalid = Array.from(document.querySelectorAll<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]'));
  const ids = Array.from(new Set(invalid.map((el) => el.closest('section[id]')?.id).filter((x): x is string => !!x)));
  // Sections inside a collapsed group (e.g. Assumptions) need the group opened too.
  const groups = new Set(invalid.map((el) => el.closest<HTMLElement>('[data-group]')?.dataset.group).filter((x): x is string => !!x));
  groups.forEach((g) => setOpen(g, true));
  ids.forEach((id) => setOpen(id, true));
  // Wait for a group's open animation before scrolling, so the target is where it'll end up.
  if (ids[0]) setTimeout(() => document.getElementById(ids[0])?.scrollIntoView({ behavior: 'smooth', block: 'start' }), groups.size ? 320 : 16);
}
