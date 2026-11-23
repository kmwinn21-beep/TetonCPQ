'use client';

/**
 * Phones: the ☰ beside Expand all opens a drawer listing the deal's input sections and the panel cards. Picking one
 * closes the drawer, then opens that section (or card) and scrolls to it.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openPanel, PANELS, panelElId, type PanelId } from './panelNav';

export function SectionsMenu({ inputs, assumptions, onInput }: { inputs: ReadonlyArray<readonly [string, string]>; assumptions: ReadonlyArray<readonly [string, string]>; onInput: (id: string, inAssumptions: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [panels, setPanels] = useState<Array<readonly [PanelId, string]>>([]);
  const close = (then?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      then?.();
    }, 200);
  };
  useEffect(() => {
    if (!open) return;
    // Only the cards on the page right now (Notifications shows only when there's something new).
    setPanels(PANELS.filter(([id]) => document.getElementById(panelElId(id))));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const row = 'flex w-full items-center h-11 px-4 text-left text-[15px] rounded-lg active:bg-teton-almost-white hover:bg-teton-almost-white';
  const heading = 'px-4 pt-4 pb-1 text-[10px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray';
  return (
    <>
      <button type="button" className="sm:hidden w-10 h-10 -mr-2 flex items-center justify-center rounded-lg text-teton-dark-gray hover:bg-teton-off-white" aria-label="Jump to a section" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="sm:hidden fixed inset-0 z-[80] no-print" role="dialog" aria-modal="true" aria-label="Sections">
            <button type="button" tabIndex={-1} aria-label="Close" className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={() => close()} />
            <nav
              className={`absolute inset-y-0 right-0 w-[min(320px,86vw)] bg-white shadow-[-12px_0_32px_rgba(0,0,0,.2)] flex flex-col pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-in motion-reduce:transition-none [animation:panelIn_.25s_ease-out] motion-reduce:[animation:none] ${closing ? 'translate-x-full' : ''}`}
            >
              <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-teton-off-white">
                <h2 className="text-[15px] font-semibold">Sections</h2>
                <button type="button" className="ml-auto w-9 h-9 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label="Close sections" onClick={() => close()}>
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className={heading}>Deal inputs</p>
                {inputs.map(([id, label]) => (
                  <button key={id} type="button" className={row} onClick={() => close(() => onInput(id, false))}>
                    {label}
                  </button>
                ))}
                <p className="px-4 pt-2 pb-0.5 text-[13px] font-semibold text-teton-ink">Assumptions</p>
                <div className="ml-4 pl-1 border-l border-teton-off-white">
                  {assumptions.map(([id, label]) => (
                    <button key={id} type="button" className={`${row} h-10 text-[14px]`} onClick={() => close(() => onInput(id, true))}>
                      {label}
                    </button>
                  ))}
                </div>
                {panels.length > 0 && (
                  <>
                    <p className={heading}>Panel</p>
                    {panels.map(([id, label]) => (
                      <button key={id} type="button" className={row} onClick={() => close(() => openPanel(id))}>
                        {label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
