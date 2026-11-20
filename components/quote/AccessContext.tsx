'use client';

/** What the signed-in user may change on this deal (from the server; the server checks every change too). */
import { createContext, useContext } from 'react';
import type { DealAccess } from '@/lib/data/access';

const FULL: DealAccess = { dealId: 0, quoteId: 0, owner: null, isOwner: true, isAdmin: false, inputs: true, scope: true, deliverables: true, canManage: true, isCollaborator: false };
export const AccessContext = createContext<DealAccess>(FULL);
export const useAccess = () => useContext(AccessContext);
