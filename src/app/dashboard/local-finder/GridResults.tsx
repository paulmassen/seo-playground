'use client';

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary, computeRingStats, type CompetitorSummary } from './grid-insights';
import { formatDistance } from '@/lib/grid-preferences';
import { useGridPreferences } from './GridPreferences';
import { DEFAULT_GRID_LAYOUT, type GridLayout } from '@/lib/grid-layout';
import { RANK_BANDS, rankBand, visibilityTone } from '@/lib/grid-rank-scale';
import { LEGACY_GRID_DEPTH, type GridDepth } from '@/lib/grid-pricing';
import { useBusinessLocation } from './useBusinessLocation';

const GridMap = lazy(() => import('./GridMap'));

interface Props {
  results: GridPoint[];
  previousResults: GridPoint[] | null;
  gridSize: number;
  layout?: GridLayout;
  spacingKm: number;
  target: string;
  /** DOM id the PDF export captures. */
  captureId: string;
  /** Results checked per point. */
  depth?: GridDepth;
  /** Monitor center "lat,lng" and language, sent with a competitor address lookup. */
  center: string;
  language: string;
}

function RankLegend({ swatchShape, showMovement, showBusiness }: { swatchShape: string; showMovement: boolean; showBusiness: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300" aria-label="Map legend">
      {RANK_BANDS.map((band) => (
        <li key={band.key} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 ${swatchShape} ring-1 ring-slate-900/15`} style={{ backgroundColor: band.fill }} aria-hidden="true" />
          {band.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className={`h-3 w-3 ${swatchShape} border-2 border-dashed border-slate-900 dark:border-slate-200`} aria-hidden="true" />
        Grid center
      </li>
      {showMovement && (
        <li className="flex items-center gap-1.5">
          <span className="rounded-full bg-white px-1 text-[11px] font-black text-green-800 ring-1 ring-slate-900/15">+3</span>
          moved up since the previous snapshot
        </li>
      )}
      {showBusiness && (
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white bg-blue-700 ring-1 ring-slate-900/15" aria-hidden="true" />
          Business address
        </li>
      )}
    </ul>
  );
}

/** Coverage · ARP · SoLV, the same three figures for you and every competitor. */
function MetricCells({ coverage, arp, solv, strong = false }: { coverage: number; arp: number | null; solv: number; strong?: boolean }) {
  const tone = strong ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-800 dark:text-slate-200';
  return (
    <>
      <td className={`py-2.5 pr-3 text-right tabular-nums ${tone}`}>{coverage}%</td>
      <td className={`py-2.5 pr-3 text-right tabular-nums ${tone}`}>{arp == null ? '—' : `#${arp}`}</td>
      <td className={`py-2.5 pr-3 text-right tabular-nums ${tone}`}>{solv}%</td>
    </>
  );
}

export default function GridResults({ results, previousResults, gridSize, layout = DEFAULT_GRID_LAYOUT, spacingKm, target, captureId, depth = LEGACY_GRID_DEPTH, center, language }: Props) {
  const [highlight, setHighlight] = useState<CompetitorSummary | null>(null);
  const businessLocation = useBusinessLocation(highlight?.cid, center, language);
  const mapCardRef = useRef<HTMLDivElement>(null);
  const { distanceUnit, pinStyle } = useGridPreferences();
  const swatchShape = pinStyle === 'square' ? 'rounded-sm' : 'rounded-full';

  /** Shows a competitor (or the target, with null) on the map; from the table below, also brings the map into view. */
  function showOnMap(competitor: CompetitorSummary | null, reveal = false) {
    setHighlight(competitor);
    if (!reveal || !mapCardRef.current) return;
    const { top, bottom } = mapCardRef.current.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) mapCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // A competitor key belongs to one snapshot. Clear it when the timeline moves to another run.
  useEffect(() => setHighlight(null), [results]);

  const summary = computeGridSummary(results);
  const { ato } = summary;
  const competitors = useMemo(() => computeCompetitors(results), [results]);
  const topCompetitors = competitors.slice(0, 5);
  const ringStats = useMemo(() => computeRingStats(results, gridSize, spacingKm, layout.shape), [results, gridSize, spacingKm, layout.shape]);
  const hasGeo = results.some((point) => point.lat != null && point.lng != null);

  return (
    <div className="space-y-8">
      <section ref={mapCardRef} aria-labelledby="ranking-map-title" className="scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h3 id="ranking-map-title" className="text-sm font-bold text-slate-900 dark:text-white">
            {highlight ? <>Ranks of {highlight.name}</> : 'Ranking map'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">Select a pin to see the full local pack at that point.</p>
        </div>

        {topCompetitors.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Business shown on the map">
            <button
              type="button"
              role="radio"
              aria-checked={!highlight}
              onClick={() => showOnMap(null)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                !highlight
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-300 bg-white text-slate-800 hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              You <span className="tabular-nums font-normal">{ato}%</span>
            </button>
            {topCompetitors.map((c) => {
              const isActive = highlight?.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => showOnMap(isActive ? null : c)}
                  title={`${c.name} · ${c.appearances}/${c.totalPoints} points · avg #${c.avgRank}`}
                  className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    isActive
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-blue-500 hover:text-blue-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="tabular-nums font-normal">{c.visibilityScore}%</span>
                </button>
              );
            })}
          </div>
        )}

        {hasGeo ? (
          <Suspense fallback={
            <div className="flex w-full items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800" style={{ height: 'clamp(340px, 62vh, 600px)' }}>
              <p className="text-sm text-slate-600 dark:text-slate-400">Loading map…</p>
            </div>
          }>
            <GridMap
              key={highlight?.key ?? 'target'}
              points={results}
              previousPoints={highlight ? null : previousResults}
              gridSize={gridSize}
              target={target}
              highlightKey={highlight?.key}
              highlightName={highlight?.name}
              businessLocation={businessLocation.location}
              captureId={captureId}
            />
          </Suspense>
        ) : (
          /* Older snapshots stored without coordinates: draw the lattice instead of a map. */
          <div className="inline-grid gap-1 rounded-xl bg-slate-100 p-3 dark:bg-slate-800" style={{ gridTemplateColumns: `repeat(${gridSize}, 2.5rem)` }}>
            {results.map((point, index) => {
              const band = rankBand(point.rank);
              const isCenter = point.row === Math.floor(gridSize / 2) && point.col === Math.floor(gridSize / 2);
              return (
                <div
                  key={index}
                  role="img"
                  aria-label={`Row ${point.row + 1}, column ${point.col + 1}: ${point.rank != null ? `rank ${point.rank}` : 'not in the top 20'}`}
                  className={`grid h-10 w-10 place-items-center rounded-md text-sm font-black tabular-nums ${isCenter ? 'outline-2 outline-dashed outline-slate-900' : ''}`}
                  style={{ background: band.fill, color: band.ink, gridColumn: point.col + 1, gridRow: point.row + 1 }}
                >
                  {point.rank ?? '—'}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <RankLegend swatchShape={swatchShape} showMovement={!!previousResults && !highlight} showBusiness={!!businessLocation.location} />
          {highlight?.cid && hasGeo && (
            <div className="flex items-center gap-2 text-xs">
              {businessLocation.status === 'error' && (
                <span role="alert" className="text-red-700 dark:text-red-400">{businessLocation.error}</span>
              )}
              {businessLocation.status !== 'done' && (
                <button
                  type="button"
                  onClick={businessLocation.locate}
                  disabled={businessLocation.status === 'loading'}
                  title="One DataForSEO Business Info call, Priority queue, about $0.003"
                  className="whitespace-nowrap rounded-md border border-slate-300 px-2 py-1 font-bold text-blue-700 transition-colors hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:text-blue-300"
                >
                  {businessLocation.status === 'loading' ? 'Locating… (~1 min)' : `Show ${highlight.name}’s address · ≈$0.003`}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {topCompetitors.length > 0 && (
        <section aria-labelledby="competitors-title">
          <h3 id="competitors-title" className="text-sm font-bold text-slate-900 dark:text-white">Who takes the local pack</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Businesses in the top {depth} across this grid, ranked by how often they appear. Coverage: share of points where it appears.
            ARP: average rank where found. SoLV: share of all points where it is in the top 3.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-600 dark:text-slate-400">
                <th scope="col" className="pb-2 pl-3 pr-3 text-left font-bold">Business</th>
                <th scope="col" className="hidden pb-2 pr-3 text-left font-bold sm:table-cell"><span className="sr-only">Presence and rating</span></th>
                <th scope="col" className="pb-2 pr-3 text-right font-bold">Coverage</th>
                <th scope="col" className="pb-2 pr-3 text-right font-bold">ARP</th>
                <th scope="col" className="pb-2 pr-3 text-right font-bold">SoLV</th>
                <th scope="col" className="pb-2 pr-3"><span className="sr-only">Map</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <td className="py-2.5 pl-3 pr-3">
                  <p className="font-bold text-slate-900 dark:text-white">You</p>
                  <p className="max-w-[24rem] truncate text-xs text-slate-600 dark:text-slate-400" title={target}>{target}</p>
                </td>
                <td className="hidden py-2.5 pr-3 text-xs tabular-nums text-slate-700 dark:text-slate-300 sm:table-cell">
                  {summary.foundCount}/{summary.totalPoints} points · visibility <span className={`font-bold ${visibilityTone(ato).text}`}>{ato}%</span>
                </td>
                <MetricCells coverage={summary.coverage} arp={summary.arp} solv={summary.solv} strong />
                <td className="py-2.5 pr-3" />
              </tr>
              {topCompetitors.map((c) => {
                const isActive = highlight?.key === c.key;
                return (
                  <tr key={c.key} className={isActive ? 'bg-blue-50 dark:bg-blue-950/50' : ''}>
                    <td className="py-2.5 pl-3 pr-3">
                      <p className="max-w-[24rem] truncate font-bold text-slate-900 dark:text-white" title={c.name}>{c.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 sm:hidden">
                        {c.appearances}/{c.totalPoints} points · avg #{c.avgRank}
                      </p>
                    </td>
                    <td className="hidden py-2.5 pr-3 text-xs tabular-nums text-slate-700 dark:text-slate-300 sm:table-cell">
                      {c.appearances}/{c.totalPoints} points · visibility {c.visibilityScore}%
                      {c.avgRating != null && <> · {c.avgRating.toFixed(1)}<span aria-hidden="true">★</span><span className="sr-only"> stars</span></>}
                    </td>
                    <MetricCells coverage={c.coverage} arp={c.arp} solv={c.solv} />
                    <td className="py-2.5 pr-3 text-right">
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => showOnMap(isActive ? null : c, true)}
                        className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:bg-blue-950"
                      >
                        {isActive ? 'Shown on map' : 'Show on map'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {ringStats.length > 1 && (
        <section aria-labelledby="rings-title">
          <h3 id="rings-title" className="text-sm font-bold text-slate-900 dark:text-white">Visibility by distance from the center</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-600 dark:text-slate-400">Where the target stops showing up: the real edge of its service area.</p>
          <dl className="space-y-2">
            {ringStats.map((r) => {
              const foundPct = Math.round((r.foundCount / r.pointCount) * 100);
              const bar = r.avgRank == null ? 'bg-transparent' : r.avgRank <= 3 ? 'bg-green-700' : r.avgRank <= 7 ? 'bg-lime-500' : r.avgRank <= 10 ? 'bg-yellow-400' : 'bg-red-600';
              return (
                <div key={r.ring} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
                  <dt className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300">
                    {r.ring === 0 ? 'Center' : `~${formatDistance(r.distanceKm, distanceUnit, 1)}`}
                  </dt>
                  <dd className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
                    <div className={`h-full ${bar}`} style={{ width: `${foundPct}%` }} />
                  </dd>
                  <dd className="w-44 text-right text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {r.foundCount}/{r.pointCount} points{r.avgRank != null ? ` · avg #${r.avgRank}` : ' · not found'}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}
    </div>
  );
}
