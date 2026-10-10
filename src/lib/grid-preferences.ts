/**
 * Display preferences for the Geo-grid tracker, chosen in Settings.
 *
 * Distances are always stored and sent to DataForSEO in kilometres (`spacing_km`); the unit
 * preference only changes how they are shown and which spacing presets the form offers.
 * Pure module: safe to import from server and client components.
 */

export const GRID_PREFERENCE_KEYS = {
  distanceUnit: 'grid_distance_unit',
  pinStyle: 'grid_pin_style',
} as const;

export const DISTANCE_UNITS = ['km', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const PIN_STYLES = ['square', 'circle', 'dot'] as const;
export type PinStyle = (typeof PIN_STYLES)[number];

export type GridPreferences = { distanceUnit: DistanceUnit; pinStyle: PinStyle };

export const DEFAULT_GRID_PREFERENCES: GridPreferences = { distanceUnit: 'km', pinStyle: 'square' };

export const KM_PER_MILE = 1.609344;

export function normalizeDistanceUnit(value: string | null | undefined): DistanceUnit {
  return value === 'mi' ? 'mi' : 'km';
}

export function normalizePinStyle(value: string | null | undefined): PinStyle {
  return (PIN_STYLES as readonly string[]).includes(value ?? '') ? (value as PinStyle) : DEFAULT_GRID_PREFERENCES.pinStyle;
}

/** Converts kilometres to the display unit. */
export function kmToUnit(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? km / KM_PER_MILE : km;
}

/** Converts a value in the display unit to kilometres, rounded to 6 decimals (exact for the mile presets). */
export function unitToKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? Math.round(value * KM_PER_MILE * 1e6) / 1e6 : value;
}

/** "1.5 km", "0.62 mi". Values are rounded to at most `decimals` decimals, trailing zeros dropped. */
export function formatDistance(km: number, unit: DistanceUnit, decimals = 2): string {
  const factor = 10 ** decimals;
  const value = Math.round(kmToUnit(km, unit) * factor) / factor;
  return `${value} ${unit}`;
}

/** Spacing presets offered by the Geo-grid form, in the display unit. */
const SPACING_PRESETS: Record<DistanceUnit, number[]> = {
  km: [0.5, 1, 2, 3, 5, 10],
  mi: [0.25, 0.5, 1, 2, 3, 5],
};

export type SpacingOption = { km: number; label: string };

/**
 * Spacing options for the form, as kilometre values labelled in the display unit. A current value
 * that is not a preset (e.g. a monitor created in km, rerun after switching to miles) is kept so a
 * rerun reuses the exact same grid and stays in the same monitor series.
 */
export function spacingOptions(unit: DistanceUnit, currentKm?: number): SpacingOption[] {
  const options = SPACING_PRESETS[unit].map((value) => ({ km: unitToKm(value, unit), label: `${value} ${unit}` }));
  if (currentKm != null && Number.isFinite(currentKm) && currentKm > 0 && !options.some((option) => Math.abs(option.km - currentKm) < 1e-6)) {
    options.push({ km: currentKm, label: formatDistance(currentKm, unit) });
    options.sort((a, b) => a.km - b.km);
  }
  return options;
}
