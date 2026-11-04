import { describe, expect, it } from 'vitest';
import { GRID_SIZES, formatDistance, normalizeDistanceUnit, normalizeGridSize, normalizePinStyle, spacingOptions, unitToKm } from './grid-preferences';

describe('grid preferences', () => {
  it('falls back to km and squares for missing or unknown values', () => {
    expect(normalizeDistanceUnit(null)).toBe('km');
    expect(normalizeDistanceUnit('miles')).toBe('km');
    expect(normalizeDistanceUnit('mi')).toBe('mi');
    expect(normalizePinStyle(undefined)).toBe('square');
    expect(normalizePinStyle('hexagon')).toBe('square');
    expect(normalizePinStyle('circle')).toBe('circle');
    expect(normalizePinStyle('dot')).toBe('dot');
  });

  it('formats kilometre values in the chosen unit', () => {
    expect(formatDistance(2, 'km')).toBe('2 km');
    expect(formatDistance(1, 'mi')).toBe('0.62 mi');
    expect(formatDistance(unitToKm(3, 'mi'), 'mi')).toBe('3 mi');
    expect(formatDistance(unitToKm(0.25, 'mi') * 4, 'mi', 1)).toBe('1 mi');
  });

  it('offers mile presets as exact kilometre values', () => {
    const options = spacingOptions('mi');
    expect(options.map((option) => option.label)).toEqual([
      '0.05 mi', '0.1 mi', '0.15 mi', '0.2 mi', '0.25 mi', '0.3 mi', '0.4 mi', '0.5 mi', '0.75 mi',
      '1 mi', '1.5 mi', '2 mi', '2.5 mi', '3 mi', '4 mi', '5 mi', '7.5 mi', '10 mi', '15 mi',
    ]);
    expect(options.find((option) => option.label === '1 mi')?.km).toBe(1.609344);
  });

  it('keeps a non-preset spacing so reruns reuse the same grid', () => {
    const options = spacingOptions('mi', 1);
    expect(options.some((option) => option.km === 1 && option.label === '0.62 mi')).toBe(true);
    expect(options.map((option) => option.km)).toEqual([...options.map((option) => option.km)].sort((a, b) => a - b));
    expect(spacingOptions('km', 2)).toHaveLength(spacingOptions('km').length);
  });

  it('offers fine spacing steps down to 100 m', () => {
    expect(spacingOptions('km').slice(0, 3).map((option) => option.km)).toEqual([0.1, 0.2, 0.25]);
  });

  it('offers grids up to 15×15 and keeps sizes odd and in range', () => {
    expect(GRID_SIZES).toEqual([3, 5, 7, 9, 11, 13, 15]);
    expect(normalizeGridSize('13')).toBe(13);
    expect(normalizeGridSize('15')).toBe(15);
    expect(normalizeGridSize('99')).toBe(15);
    expect(normalizeGridSize('1')).toBe(3);
    expect(normalizeGridSize('12')).toBe(13);
    expect(normalizeGridSize('abc')).toBe(5);
  });
});
