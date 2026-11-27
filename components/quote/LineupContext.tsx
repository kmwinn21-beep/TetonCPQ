'use client';

/** The price book's current core products line-up, for the deal page (a deal prices with its own copy). */
import { createContext, useContext } from 'react';
import { DEFAULT_LINEUP, type Lineup } from '@/lib/pricing/lineup';

export const LineupContext = createContext<Lineup>(DEFAULT_LINEUP);
export const usePriceBookLineup = () => useContext(LineupContext);
