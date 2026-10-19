/**
 * Geo-grid layout: which cells of the N×N lattice are scanned, and how the lattice is oriented.
 *
 * A layout is fixed when a monitor is created and is part of the monitor's identity (series id),
 * so every scheduled run scans exactly the same points and runs stay comparable cell by cell.
 * Pure module: shared by the form preview (client) and the API / cron code (server).
 */

export type GridShape = 'square' | 'diamond' | 'circle';

export const GRID_SHAPES: { value: GridShape; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' },
];

export interface GridLayout {
  shape: GridShape;
  /** Clockwise rotation of the lattice around its center, in whole degrees within [-45, 44]. */
  rotationDeg: number;
  /** Cells skipped by the user, as sorted "row:col" keys. Never contains the center cell. */
  excluded: string[];
}

export const DEFAULT_GRID_LAYOUT: GridLayout = { shape: 'square', rotationDeg: 0, excluded: [] };

export interface GridCell {
  row: number;
  col: number;
  isCenter: boolean;
  /** Inside the shape but unchecked by the user: shown in previews, never scanned. */
  excluded: boolean;
}

export interface GridCoord {
  row: number;
  col: number;
  lat: number;
  lng: number;
}

export function gridCellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * A square lattice looks identical every 90°, so any angle folds into [-45, 45).
 * Keeping one canonical value per orientation keeps the series id stable.
 */
export function normalizeRotation(value: unknown): number {
  const deg = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(deg)) return 0;
  const folded = ((Math.round(deg) + 45) % 90 + 90) % 90 - 45;
  return folded === 0 ? 0 : folded; // avoid -0
}

/** Whether a cell belongs to the shape, independent of user exclusions. */
export function cellInShape(shape: GridShape, gridSize: number, row: number, col: number): boolean {
  const half = Math.floor(gridSize / 2);
  const dr = row - half;
  const dc = col - half;
  if (shape === 'diamond') return Math.abs(dr) + Math.abs(dc) <= half;
  // The extra quarter cell rounds the outline: 7×7 keeps (3,1) and (2,2) but drops (3,2).
  if (shape === 'circle') return dr * dr + dc * dc <= (half + 0.25) ** 2;
  return true;
}

/** Validates any (possibly untrusted) input into a canonical layout for this grid size. */
export function normalizeGridLayout(input: Partial<GridLayout> | null | undefined, gridSize: number): GridLayout {
  const shape: GridShape = GRID_SHAPES.some((option) => option.value === input?.shape) ? input!.shape! : 'square';
  const rotationDeg = normalizeRotation(input?.rotationDeg ?? 0);
  const half = Math.floor(gridSize / 2);
  const excluded = new Set<string>();
  for (const key of Array.isArray(input?.excluded) ? input!.excluded! : []) {
    const match = /^(\d+):(\d+)$/.exec(String(key));
    if (!match) continue;
    const row = Number(match[1]);
    const col = Number(match[2]);
    if (row >= gridSize || col >= gridSize) continue;
    if (row === half && col === half) continue; // the center is the monitor's anchor
    if (!cellInShape(shape, gridSize, row, col)) continue;
    excluded.add(gridCellKey(row, col));
  }
  return { shape, rotationDeg, excluded: [...excluded].sort(compareCellKeys) };
}

function compareCellKeys(a: string, b: string): number {
  const [ar, ac] = a.split(':').map(Number);
  const [br, bc] = b.split(':').map(Number);
  return ar - br || ac - bc;
}

export function isDefaultGridLayout(layout: GridLayout): boolean {
  return layout.shape === 'square' && layout.rotationDeg === 0 && layout.excluded.length === 0;
}

/**
 * Stable text form used in ids. Empty for the default layout so monitors created before
 * layouts existed keep their series id (and therefore their whole history).
 */
export function gridLayoutKey(layout: GridLayout): string {
  if (isDefaultGridLayout(layout)) return '';
  return `${layout.shape}|${layout.rotationDeg}|${layout.excluded.join(',')}`;
}

/** Database form: NULL for the default layout, JSON otherwise. */
export function serializeGridLayout(layout: GridLayout | undefined): string | null {
  if (!layout || isDefaultGridLayout(layout)) return null;
  return JSON.stringify(layout);
}

export function parseGridLayout(value: string | null | undefined, gridSize: number): GridLayout {
  if (!value) return DEFAULT_GRID_LAYOUT;
  try {
    return normalizeGridLayout(JSON.parse(value) as Partial<GridLayout>, gridSize);
  } catch {
    return DEFAULT_GRID_LAYOUT;
  }
}

/** Every cell of the shape, including the ones the user unchecked (for previews). */
export function gridLayoutCells(gridSize: number, layout: GridLayout): GridCell[] {
  const half = Math.floor(gridSize / 2);
  const excluded = new Set(layout.excluded);
  const cells: GridCell[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (!cellInShape(layout.shape, gridSize, row, col)) continue;
      cells.push({ row, col, isCenter: row === half && col === half, excluded: excluded.has(gridCellKey(row, col)) });
    }
  }
  return cells;
}

/** Number of points actually scanned (and billed) per run. */
export function gridPointCount(gridSize: number, layout: GridLayout): number {
  return gridLayoutCells(gridSize, layout).filter((cell) => !cell.excluded).length;
}

/** Geographic position of a lattice cell once the layout rotation is applied. */
export function cellCoordinate(
  centerLat: number, centerLng: number, gridSize: number, spacingKm: number, rotationDeg: number, row: number, col: number,
): { lat: number; lng: number } {
  const half = Math.floor(gridSize / 2);
  const east = (col - half) * spacingKm;
  const north = (half - row) * spacingKm;
  // Clockwise rotation as seen on a north-up map: east turns toward south.
  const theta = rotationDeg * Math.PI / 180;
  const rotatedEast = east * Math.cos(theta) + north * Math.sin(theta);
  const rotatedNorth = -east * Math.sin(theta) + north * Math.cos(theta);
  return {
    lat: centerLat + rotatedNorth / 111.32,
    lng: centerLng + rotatedEast / (111.32 * Math.cos(centerLat * Math.PI / 180)),
  };
}

/** Coordinates of every cell in the shape, with exclusion flags (for previews). */
export function gridLayoutCoords(
  centerLat: number, centerLng: number, gridSize: number, spacingKm: number, layout: GridLayout,
): Array<GridCell & { lat: number; lng: number }> {
  return gridLayoutCells(gridSize, layout).map((cell) => ({
    ...cell,
    ...cellCoordinate(centerLat, centerLng, gridSize, spacingKm, layout.rotationDeg, cell.row, cell.col),
  }));
}

/** Coordinates of the points to scan: the shape minus the user's exclusions. */
export function generateGridCoords(
  centerLat: number, centerLng: number, gridSize: number, spacingKm: number, layout: GridLayout = DEFAULT_GRID_LAYOUT,
): GridCoord[] {
  return gridLayoutCoords(centerLat, centerLng, gridSize, spacingKm, layout)
    .filter((cell) => !cell.excluded)
    .map(({ row, col, lat, lng }) => ({ row, col, lat, lng }));
}

/** Short human label, e.g. "5×5 points" or "7×7 circle · 33 points · 30°". */
export function describeGridLayout(gridSize: number, layout: GridLayout): string {
  if (isDefaultGridLayout(layout)) return `${gridSize}×${gridSize} points`;
  const shape = layout.shape === 'square' ? '' : ` ${layout.shape}`;
  const parts = [`${gridSize}×${gridSize}${shape}`, `${gridPointCount(gridSize, layout)} points`];
  if (layout.rotationDeg !== 0) parts.push(`${layout.rotationDeg}°`);
  return parts.join(' · ');
}

/** URL parameters carrying a layout (form submission and "Run now" links). */
export function gridLayoutParams(layout: GridLayout): Record<string, string> {
  if (isDefaultGridLayout(layout)) return {};
  const params: Record<string, string> = { grid_shape: layout.shape, grid_rotation: String(layout.rotationDeg) };
  if (layout.excluded.length > 0) params.grid_excluded = layout.excluded.join(',');
  return params;
}

export function gridLayoutFromParams(
  params: { grid_shape?: string; grid_rotation?: string; grid_excluded?: string }, gridSize: number,
): GridLayout {
  return normalizeGridLayout({
    shape: params.grid_shape as GridShape | undefined,
    rotationDeg: Number(params.grid_rotation ?? 0),
    excluded: params.grid_excluded ? params.grid_excluded.split(',') : [],
  }, gridSize);
}
