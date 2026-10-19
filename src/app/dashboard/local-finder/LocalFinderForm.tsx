'use client';

import { useMemo, useState, lazy, Suspense } from 'react';
import { LANGUAGES } from '@/lib/geo-options';
import { formatBusinessTarget } from '@/lib/grid-target';
import { formatDistance, spacingOptions, type DistanceUnit } from '@/lib/grid-preferences';
import {
  DEFAULT_GRID_LAYOUT, GRID_SHAPES, gridCellKey, gridLayoutCells, gridLayoutParams, gridPointCount, normalizeGridLayout,
  normalizeRotation, type GridLayout, type GridShape,
} from '@/lib/grid-layout';
import { useGridPreferences } from './GridPreferences';

const MapPicker = lazy(() => import('./MapPicker'));

interface Props {
  defaults: {
    keyword: string;
    location: string;
    locationCoordinate: string;
    defaultCenter: string;
    language: string;
    device: string;
    os: string;
    depth: string;
    minRating: string;
    timeFilter: string;
    gridMode?: boolean;
    forceGridMode?: boolean;
    gridSize?: string;
    spacingKm?: string;
    gridTarget?: string;
    queueMode?: string;
    gridLayout?: GridLayout;
  };
}

// DataForSEO Local Finder SERP API pricing (checked against their pricing page — they revise this periodically).
type QueueMode = 'live' | 'priority' | 'standard';

const QUEUE_MODES: { value: QueueMode; label: string; costPerPoint: number; wait: string }[] = [
  { value: 'live', label: 'Live', costPerPoint: 0.002, wait: 'Blocks the page' },
  { value: 'priority', label: 'Priority', costPerPoint: 0.0012, wait: '~1 min avg, background' },
  { value: 'standard', label: 'Standard', costPerPoint: 0.0006, wait: '5–45 min, background' },
];

// Live requests are throttled to 6 in flight; each point currently takes ~8-10s on DataForSEO's side.
const LIVE_SECONDS_PER_BATCH = 9;
const LIVE_CONCURRENCY = 6;

function formatCost(n: number) {
  return `$${n.toFixed(4)}`;
}

function formatLiveDuration(totalPoints: number) {
  const seconds = Math.ceil(totalPoints / LIVE_CONCURRENCY) * LIVE_SECONDS_PER_BATCH;
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.ceil(seconds / 60)} min`;
}

function ShapeIcon({ shape }: { shape: GridShape }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {shape === 'square' && <rect x="2.5" y="2.5" width="11" height="11" rx="1" />}
      {shape === 'diamond' && <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" strokeLinejoin="round" />}
      {shape === 'circle' && <circle cx="8" cy="8" r="6" />}
    </svg>
  );
}

/** Schematic of the scanned points. Clicking a point skips it (or adds it back); the center always stays. */
function GridPreview({ size, spacingKm, unit, layout, onToggle, onResetSkipped }: {
  size: number; spacingKm: number; unit: DistanceUnit; layout: GridLayout;
  onToggle: (row: number, col: number) => void; onResetSkipped: () => void;
}) {
  const cells = new Map(gridLayoutCells(size, layout).map((cell) => [gridCellKey(cell.row, cell.col), cell]));
  const cellPx = size <= 5 ? 20 : size <= 7 ? 17 : 14;
  const pointCount = gridPointCount(size, layout);
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* Padding leaves room for the corners once the lattice is rotated. */}
      <div className="p-3">
        <div
          className="inline-grid gap-1 transition-transform duration-200"
          style={{ gridTemplateColumns: `repeat(${size}, ${cellPx}px)`, transform: `rotate(${layout.rotationDeg}deg)` }}
        >
          {Array.from({ length: size * size }).map((_, i) => {
            const row = Math.floor(i / size);
            const col = i % size;
            const cell = cells.get(gridCellKey(row, col));
            if (!cell) return <span key={i} style={{ width: cellPx, height: cellPx }} aria-hidden="true" />;
            if (cell.isCenter) {
              return <span key={i} title="Grid center (always scanned)" className="rounded-sm bg-blue-500 ring-2 ring-blue-300" style={{ width: cellPx, height: cellPx }} />;
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => onToggle(row, col)}
                aria-pressed={!cell.excluded}
                aria-label={`${cell.excluded ? 'Add back' : 'Skip'} point row ${row + 1}, column ${col + 1}`}
                title={cell.excluded ? 'Skipped — click to scan this point' : 'Click to skip this point'}
                className={`rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  cell.excluded
                    ? 'border border-dashed border-slate-300 bg-transparent hover:border-blue-400 dark:border-slate-600'
                    : 'bg-slate-300 hover:bg-red-300 dark:bg-slate-600 dark:hover:bg-red-400/60'
                }`}
                style={{ width: cellPx, height: cellPx }}
              />
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 font-medium text-center">
        {pointCount} points · {formatDistance(spacingKm, unit)} spacing · ~{formatDistance((size - 1) * spacingKm, unit, 1)} coverage
        {layout.excluded.length > 0 && (
          <>
            {' · '}{layout.excluded.length} skipped{' '}
            <button type="button" onClick={onResetSkipped} className="font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Reset</button>
          </>
        )}
      </p>
      <p className="text-[10px] text-slate-400 -mt-2">Click a point here or on the map to skip it — skipped points are not billed.</p>
    </div>
  );
}

export default function LocalFinderForm({ defaults }: Props) {
  const isGrid = defaults.forceGridMode === true;

  const [device, setDevice] = useState(defaults.device || 'desktop');
  const [coordinate, setCoordinate] = useState(defaults.locationCoordinate || defaults.defaultCenter);
  const [isLoading, setIsLoading] = useState(false);
  const [gridSize, setGridSize] = useState(parseInt(defaults.gridSize ?? '5', 10));
  const [spacingKm, setSpacingKm] = useState(parseFloat(defaults.spacingKm ?? '1'));
  const [queueMode, setQueueMode] = useState<QueueMode>((defaults.queueMode as QueueMode) || 'live');
  const [language, setLanguage] = useState(defaults.language || 'English');
  const [gridTarget, setGridTarget] = useState(defaults.gridTarget ?? '');
  const initialLayout = defaults.gridLayout ?? DEFAULT_GRID_LAYOUT;
  const [gridShape, setGridShape] = useState<GridShape>(initialLayout.shape);
  const [rotationDeg, setRotationDeg] = useState(initialLayout.rotationDeg);
  const [excludedCells, setExcludedCells] = useState<string[]>(initialLayout.excluded);
  // The layout is fixed at creation: shape, rotation and skipped points become part of the monitor.
  const gridLayout = useMemo(
    () => normalizeGridLayout({ shape: gridShape, rotationDeg, excluded: excludedCells }, gridSize),
    [gridShape, rotationDeg, excludedCells, gridSize],
  );
  const pointCount = gridPointCount(gridSize, gridLayout);

  function toggleCell(row: number, col: number) {
    const key = gridCellKey(row, col);
    setExcludedCells((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }
  const { distanceUnit } = useGridPreferences();
  const spacingChoices = spacingOptions(distanceUnit, spacingKm);

  const osOptions =
    device === 'mobile'
      ? [{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }]
      : [{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }];

  const defaultOs = osOptions.some((o) => o.value === defaults.os) ? defaults.os : osOptions[0].value;

  return (
    <form method="GET" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" onSubmit={() => setIsLoading(true)}>
      {/* Keyword */}
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Keyword to monitor <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          name="keyword"
          defaultValue={defaults.keyword}
          placeholder="e.g. plumber, italian restaurant, dentist…"
          required
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:bg-slate-800"
        />
      </div>

      {/* Language */}
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Language <span className="text-red-400">*</span>
        </label>
        <select
          name="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
        >
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Map */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400">
            {isGrid ? 'Location to monitor (map)' : 'Location (map)'} <span className="text-red-400">*</span>
          </label>
          {coordinate && (
            <button
              type="button"
              onClick={() => setCoordinate('')}
              className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-2">
          <Suspense fallback={<div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
            <MapPicker
              coordinate={coordinate}
              onChange={setCoordinate}
              showGrid={isGrid && !!coordinate}
              gridSize={isGrid ? gridSize : undefined}
              spacingKm={isGrid ? spacingKm : undefined}
              gridLayout={isGrid ? gridLayout : undefined}
              onToggleCell={isGrid ? toggleCell : undefined}
              distanceUnit={distanceUnit}
              language={language}
              onBusinessSelect={isGrid ? (business) => setGridTarget(formatBusinessTarget(business.title, business.cid)) : undefined}
            />
          </Suspense>
          <input
            type="text"
            name="location_coordinate"
            value={coordinate}
            onChange={(e) => setCoordinate(e.target.value)}
            placeholder="Click on the map to set a point — or type lat,lng"
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-700 dark:text-slate-300 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800"
          />
          {coordinate && (
            <p className="text-[11px] text-blue-600">
              {isGrid ? 'Grid will be centered on this point.' : 'Coordinates active — search will be centered on this point.'}
            </p>
          )}
        </div>
      </div>

      {isGrid ? (
        /* Grid-specific fields */
        <>
          {/* Target business */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Target domain or business <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="grid_target"
              value={gridTarget}
              onChange={(e) => setGridTarget(e.target.value)}
              placeholder="Pick a Google listing above, or enter a domain / business name"
              required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:bg-slate-800"
            />
            <p className="text-[11px] text-slate-400 mt-1">Picking a listing from the map search matches that exact Google listing. A domain matches with or without https:// and www; a name matches partially.</p>
          </div>

          {/* Grid size + spacing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Grid size</label>
              <select
                name="grid_size"
                value={gridSize}
                onChange={(e) => {
                  setGridSize(parseInt(e.target.value, 10));
                  // Skipped cells are row/column positions, which mean other places on another grid size.
                  setExcludedCells([]);
                }}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {[3, 5, 7, 9, 11].map((size) => (
                  <option key={size} value={size}>
                    {size}×{size} ({gridPointCount(size, { shape: gridShape, rotationDeg: 0, excluded: [] })} points)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Spacing ({distanceUnit})</label>
              {/* Values are always kilometres; only the labels follow the Settings distance unit. */}
              <select
                name="spacing_km"
                value={spacingKm}
                onChange={(e) => setSpacingKm(parseFloat(e.target.value))}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {spacingChoices.map((option) => <option key={option.km} value={option.km}>{option.label}</option>)}
              </select>
            </div>
          </div>

          {/* Grid shape + rotation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Grid shape</label>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Grid shape">
                {GRID_SHAPES.map((option) => {
                  const active = gridShape === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setGridShape(option.value);
                        setExcludedCells([]);
                      }}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border text-xs font-black transition-all ${
                        active
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <ShapeIcon shape={option.value} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="grid-rotation" className="block text-xs font-black uppercase tracking-widest text-slate-400">Rotation</label>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-black tabular-nums text-slate-700 dark:text-slate-200">{rotationDeg}°</span>
                  {rotationDeg !== 0 && (
                    <button type="button" onClick={() => setRotationDeg(0)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors">
                      Reset
                    </button>
                  )}
                </span>
              </div>
              <input
                id="grid-rotation"
                type="range"
                min={-45}
                max={44}
                step={1}
                value={rotationDeg}
                onChange={(e) => setRotationDeg(normalizeRotation(Number(e.target.value)))}
                className="w-full accent-blue-600 mt-2"
              />
              <p className="text-[11px] text-slate-400 mt-1">Align the grid with the street layout or coastline.</p>
            </div>
          </div>
          {Object.entries(gridLayoutParams(gridLayout)).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {/* Grid preview */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 text-center">Grid preview</p>
            <GridPreview
              size={gridSize}
              spacingKm={spacingKm}
              unit={distanceUnit}
              layout={gridLayout}
              onToggle={toggleCell}
              onResetSkipped={() => setExcludedCells([])}
            />
          </div>

          {/* Queue mode */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">API mode</label>
            <input type="hidden" name="queue_mode" value={queueMode} />
            <div className="grid grid-cols-3 gap-2">
              {QUEUE_MODES.map((mode) => {
                const active = queueMode === mode.value;
                const estCost = formatCost(pointCount * mode.costPerPoint);
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setQueueMode(mode.value)}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className={`text-xs font-black ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {mode.label}
                    </span>
                    <span className={`text-[10px] font-mono ${active ? 'text-blue-500' : 'text-slate-400'}`}>{estCost}</span>
                    <span className="text-[10px] text-slate-400">{mode.wait}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              {queueMode === 'live' ? (
                <>Blocks the page for {formatLiveDuration(pointCount)} — DataForSEO’s live endpoint has slowed down, so large grids can take several minutes.</>
              ) : queueMode === 'priority' ? (
                <>Tasks are queued with DataForSEO’s high-priority flag. The page will auto-refresh every 10 seconds until results are ready.</>
              ) : (
                <>Tasks are queued for standard background processing. The page will check every 30 seconds — or you can come back later.</>
              )}
            </p>
          </div>
        </>
      ) : (
        /* Standard local finder fields */
        <>
          {/* Device / OS / Depth */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Device</label>
              <select
                name="device"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">OS</label>
              <select
                name="os"
                defaultValue={defaultOs}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                {osOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Depth</label>
              <select
                name="depth"
                defaultValue={defaults.depth || '20'}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Minimum rating</label>
              <select
                name="min_rating"
                defaultValue={defaults.minRating || ''}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="">No filter</option>
                <option value="3.5">3.5+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Hours filter</label>
              <select
                name="time_filter"
                defaultValue={defaults.timeFilter || ''}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
              >
                <option value="">None</option>
                <option value="open_now">Open now</option>
                <option value="24_hours">Open 24/7</option>
              </select>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {isGrid ? 'Running grid…' : 'Searching…'}
          </span>
        ) : (isGrid ? 'Create monitor & run' : 'Search')}
      </button>
    </form>
  );
}
