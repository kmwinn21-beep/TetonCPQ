'use client';

/**
 * Which of the deal's communities have a floor plan uploaded (as of now, not
 * as of the saved version), for the business case's "Missing Floor Plans" pill.
 */
import { createContext, useContext } from 'react';
import { T } from './EditableText';
import { V } from './ProposalSections';

const PlansCtx = createContext<Set<string> | null>(null);

export function FloorPlanStatusProvider({ communityIds, children }: { communityIds: string[]; children: React.ReactNode }) {
  return <PlansCtx.Provider value={new Set(communityIds)}>{children}</PlansCtx.Provider>;
}

/**
 * A red pill beside a community's city when it has no floor plan. The wording
 * is editable (one wording for every row) and each row's pill can be removed.
 */
export function MissingPlanPill({ communityId, name }: { communityId: string; name: string }) {
  const withPlans = useContext(PlansCtx);
  if (!withPlans || withPlans.has(communityId)) return null;
  return (
    <V k={`fp.missing.${communityId.replace(/[^a-z0-9_-]/gi, '_')}`} label={`Missing floor plans pill · ${name || 'community'}`}>
      <span className="bc-fp-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
        <T k="bc.fp.missing" d="Missing Floor Plans - Needed for Accurate Pricing" />
      </span>
    </V>
  );
}
