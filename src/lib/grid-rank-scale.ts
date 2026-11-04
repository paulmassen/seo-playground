/**
 * One rank scale for every Geo-grid surface: map pins, legend, trend chart, PDF report and Settings preview.
 *
 * Five buckets, read as an ordered good→bad ramp: dark green, lime, yellow, red, then neutral grey for
 * "not in the top 20". Lightness carries the order as much as hue does, so the scale survives
 * colour-vision deficiencies and greyscale printing, and every pin keeps its rank number as text.
 * Each fill has its own label colour chosen for at least 4.5:1 contrast.
 */

export type RankBandKey = 'top3' | 'top4To7' | 'top8To10' | 'top11Plus' | 'notFound';

export interface RankBand {
  key: RankBandKey;
  label: string;
  /** Pin / swatch / chart fill. */
  fill: string;
  /** Text drawn on top of `fill` (≥4.5:1). */
  ink: string;
  /** Same band as text on a white surface (≥4.5:1), e.g. ranks in popups. */
  onWhite: string;
}

export const RANK_BANDS: readonly RankBand[] = [
  { key: 'top3', label: 'Top 3', fill: '#15803d', ink: '#ffffff', onWhite: '#166534' },
  { key: 'top4To7', label: '#4–7', fill: '#84cc16', ink: '#1a2e05', onWhite: '#3f6212' },
  { key: 'top8To10', label: '#8–10', fill: '#facc15', ink: '#422006', onWhite: '#854d0e' },
  { key: 'top11Plus', label: '#11+', fill: '#dc2626', ink: '#ffffff', onWhite: '#b91c1c' },
  { key: 'notFound', label: 'Not found', fill: '#cbd5e1', ink: '#334155', onWhite: '#475569' },
];

export function rankBandKey(rank: number | null): RankBandKey {
  if (rank === null) return 'notFound';
  if (rank <= 3) return 'top3';
  if (rank <= 7) return 'top4To7';
  if (rank <= 10) return 'top8To10';
  return 'top11Plus';
}

export function rankBand(rank: number | null): RankBand {
  const key = rankBandKey(rank);
  return RANK_BANDS.find((band) => band.key === key)!;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}

/**
 * Visibility is a 0–100 score, so its colour follows thresholds rather than always reading as success.
 * Returns literal Tailwind classes so the compiler keeps them.
 */
export function visibilityTone(score: number): { text: string; bar: string } {
  if (score >= 60) return { text: 'text-green-700 dark:text-green-400', bar: 'bg-green-600' };
  if (score >= 30) return { text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' };
  if (score > 0) return { text: 'text-red-700 dark:text-red-400', bar: 'bg-red-500' };
  return { text: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-300 dark:bg-slate-600' };
}
