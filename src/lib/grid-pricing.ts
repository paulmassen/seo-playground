/**
 * DataForSEO Local Finder SERP API pricing, checked on 2026-10-27 against
 * https://dataforseo.com/pricing/google-serp/google-local-finder-serp-api
 *
 * The billing unit is one SERP of 10 results; `depth` adds one base price per extra page of 10
 * (refunded when Google returns fewer results). Saved queued runs match this: $0.0012 (Standard)
 * and $0.0024 (Priority) per point at depth 20. Live runs at depth 20 were billed a flat $0.002
 * per point, so Live is estimated as one SERP whatever the depth. The real billed cost is stored
 * with every run, so these figures are only shown as estimates.
 */
export type GridQueueModeOption = 'live' | 'priority' | 'standard';

/** Local Finder results requested per grid point. */
export type GridDepth = 10 | 20;

export const GRID_DEPTHS: readonly GridDepth[] = [10, 20];

/** Monitors created before the depth choice always requested 20 results. */
export const LEGACY_GRID_DEPTH: GridDepth = 20;

/** New monitors: the top 10 costs half as much in the queues and covers the visible local results. */
export const DEFAULT_GRID_DEPTH: GridDepth = 10;

export const GRID_QUEUE_MODES: { value: GridQueueModeOption; label: string; costPerSerp: number; billedPerPage: boolean; wait: string }[] = [
  { value: 'live', label: 'Live', costPerSerp: 0.002, billedPerPage: false, wait: 'Waits on this page' },
  { value: 'priority', label: 'Priority', costPerSerp: 0.0012, billedPerPage: true, wait: '~1 min, in background' },
  { value: 'standard', label: 'Standard', costPerSerp: 0.0006, billedPerPage: true, wait: '5–45 min, in background' },
];

export function parseGridQueueMode(value: unknown, fallback: GridQueueModeOption = 'standard'): GridQueueModeOption {
  return value === 'live' || value === 'priority' || value === 'standard' ? value : fallback;
}

export function parseGridDepth(value: unknown, fallback: GridDepth = DEFAULT_GRID_DEPTH): GridDepth {
  const number = typeof value === 'string' ? Number(value) : value;
  return number === 10 || number === 20 ? number : fallback;
}

export function estimateGridCostPerPoint(mode: GridQueueModeOption, depth: GridDepth = LEGACY_GRID_DEPTH): number {
  const option = GRID_QUEUE_MODES.find((item) => item.value === mode);
  if (!option) return 0;
  return option.billedPerPage ? option.costPerSerp * Math.ceil(depth / 10) : option.costPerSerp;
}

export function estimateGridCost(points: number, mode: GridQueueModeOption, depth: GridDepth = LEGACY_GRID_DEPTH): number {
  return points * estimateGridCostPerPoint(mode, depth);
}

/** "$0.06", "$0.015", "$0.0006": as many decimals as the amount needs, never trailing zeros past cents. */
export function formatUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  const fixed = amount.toFixed(4).replace(/0+$/, '');
  const [, decimals = ''] = fixed.split('.');
  return `$${decimals.length < 2 ? amount.toFixed(2) : fixed}`;
}
