import { getSetting } from './db';
import { GRID_PREFERENCE_KEYS, normalizeDistanceUnit, normalizePinStyle, type GridPreferences } from './grid-preferences';

/** Geo-grid display preferences from Settings (app-wide, like the white-label settings). */
export function getGridPreferences(): GridPreferences {
  return {
    distanceUnit: normalizeDistanceUnit(getSetting(GRID_PREFERENCE_KEYS.distanceUnit)),
    pinStyle: normalizePinStyle(getSetting(GRID_PREFERENCE_KEYS.pinStyle)),
  };
}
