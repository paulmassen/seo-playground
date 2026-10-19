import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_LAYOUT, cellCoordinate, describeGridLayout, generateGridCoords, gridLayoutFromParams, gridLayoutKey,
  gridLayoutParams, gridPointCount, normalizeGridLayout, normalizeRotation, parseGridLayout, serializeGridLayout,
} from './grid-layout';

describe('grid layout', () => {
  it('keeps every cell of a default square grid', () => {
    expect(gridPointCount(5, DEFAULT_GRID_LAYOUT)).toBe(25);
    expect(gridPointCount(11, DEFAULT_GRID_LAYOUT)).toBe(121);
  });

  it('masks diamond and circle shapes', () => {
    expect(gridPointCount(5, { ...DEFAULT_GRID_LAYOUT, shape: 'diamond' })).toBe(13);
    expect(gridPointCount(7, { ...DEFAULT_GRID_LAYOUT, shape: 'diamond' })).toBe(25);
    // 5×5 circle drops the four corners only.
    expect(gridPointCount(5, { ...DEFAULT_GRID_LAYOUT, shape: 'circle' })).toBe(21);
    expect(gridPointCount(7, { ...DEFAULT_GRID_LAYOUT, shape: 'circle' })).toBe(37);
  });

  it('folds rotation into one canonical value per orientation', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(0);
    expect(normalizeRotation(-90)).toBe(0);
    expect(normalizeRotation(30)).toBe(30);
    expect(normalizeRotation(120)).toBe(30);
    expect(normalizeRotation(45)).toBe(-45);
    expect(normalizeRotation(-30.4)).toBe(-30);
    expect(normalizeRotation('abc')).toBe(0);
  });

  it('drops invalid, out-of-shape and center exclusions and sorts the rest', () => {
    const layout = normalizeGridLayout({ shape: 'diamond', excluded: ['2:2', '0:0', '9:9', 'x', '1:2', '0:2', '1:2'] }, 5);
    // 0:0 is outside the diamond, 2:2 is the center, 9:9 is outside the grid.
    expect(layout.excluded).toEqual(['0:2', '1:2']);
    expect(gridPointCount(5, layout)).toBe(11);
  });

  it('rotates points clockwise around the center', () => {
    const [lat, lng] = [48.8566, 2.3522];
    // The cell directly east of the center ends up directly south after a 90° turn.
    const east = cellCoordinate(lat, lng, 3, 1, 90, 1, 2);
    expect(east.lng).toBeCloseTo(lng, 9);
    expect(east.lat).toBeLessThan(lat);
    // Distances from the center are preserved.
    const plain = cellCoordinate(lat, lng, 5, 1, 0, 0, 4);
    const turned = cellCoordinate(lat, lng, 5, 1, 30, 0, 4);
    const kmFromCenter = (point: { lat: number; lng: number }) => Math.hypot(
      (point.lat - lat) * 111.32, (point.lng - lng) * 111.32 * Math.cos(lat * Math.PI / 180),
    );
    expect(kmFromCenter(turned)).toBeCloseTo(kmFromCenter(plain), 9);
  });

  it('generates the same coordinates as before for the default layout', () => {
    const coords = generateGridCoords(48.8566, 2.3522, 3, 1);
    expect(coords).toHaveLength(9);
    expect(coords[0]).toMatchObject({ row: 0, col: 0 });
    expect(coords[0].lat).toBeCloseTo(48.8566 + 1 / 111.32, 9);
    expect(coords[0].lng).toBeCloseTo(2.3522 - 1 / (111.32 * Math.cos(48.8566 * Math.PI / 180)), 9);
  });

  it('skips excluded cells when generating scan coordinates', () => {
    const layout = normalizeGridLayout({ excluded: ['0:0', '2:2'] }, 3);
    const keys = generateGridCoords(0, 0, 3, 1, layout).map((cell) => `${cell.row}:${cell.col}`);
    expect(keys).toHaveLength(7);
    expect(keys).not.toContain('0:0');
    expect(keys).not.toContain('2:2');
  });

  it('keeps an empty key and NULL storage for the default layout', () => {
    expect(gridLayoutKey(DEFAULT_GRID_LAYOUT)).toBe('');
    expect(serializeGridLayout(DEFAULT_GRID_LAYOUT)).toBeNull();
    expect(parseGridLayout(null, 5)).toEqual(DEFAULT_GRID_LAYOUT);
    expect(gridLayoutParams(DEFAULT_GRID_LAYOUT)).toEqual({});
  });

  it('roundtrips a custom layout through storage and URL parameters', () => {
    const layout = normalizeGridLayout({ shape: 'circle', rotationDeg: 20, excluded: ['0:3', '1:1'] }, 7);
    expect(parseGridLayout(serializeGridLayout(layout), 7)).toEqual(layout);
    expect(gridLayoutFromParams(gridLayoutParams(layout), 7)).toEqual(layout);
    expect(gridLayoutKey(layout)).toBe('circle|20|0:3,1:1');
  });

  it('describes layouts for labels', () => {
    expect(describeGridLayout(5, DEFAULT_GRID_LAYOUT)).toBe('5×5 points');
    expect(describeGridLayout(5, { shape: 'diamond', rotationDeg: 30, excluded: [] })).toBe('5×5 diamond · 13 points · 30°');
    expect(describeGridLayout(3, normalizeGridLayout({ excluded: ['0:0'] }, 3))).toBe('3×3 · 8 points');
  });
});
