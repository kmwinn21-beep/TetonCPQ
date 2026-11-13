/** Small flag marking pilot sites: ink on a pale-green fill. */
export function PilotFlag() {
  return (
    <span className="inline-flex w-4 h-4 flex-shrink-0 items-center justify-center rounded-full bg-teton-pale-green" title="Pilot site" aria-label="Pilot">
      <svg className="w-2.5 h-2.5 text-teton-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 21V4" />
        <path d="M4 4h12l-2.5 4L16 12H4" fill="currentColor" />
      </svg>
    </span>
  );
}
