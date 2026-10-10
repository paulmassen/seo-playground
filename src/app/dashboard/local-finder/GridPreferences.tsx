'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_GRID_PREFERENCES, type GridPreferences } from '@/lib/grid-preferences';

const GridPreferencesContext = createContext<GridPreferences>(DEFAULT_GRID_PREFERENCES);

/** Shares the Settings → Geo-grid display preferences (distance unit, pin style) with the grid components. */
export function GridPreferencesProvider({ value, children }: { value: GridPreferences; children: ReactNode }) {
  return <GridPreferencesContext.Provider value={value}>{children}</GridPreferencesContext.Provider>;
}

export function useGridPreferences(): GridPreferences {
  return useContext(GridPreferencesContext);
}
