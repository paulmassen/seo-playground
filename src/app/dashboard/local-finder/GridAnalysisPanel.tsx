'use client';

import type { BrandStyle } from '@/lib/brand';

import { useEffect, useMemo, useState } from 'react';
import GridResults from './GridResults';
import { useGridSnapshotSelection } from './GridSnapshotSelection';
import GridSnapshotMapPanel, { type GridMapSnapshot } from './GridSnapshotMapPanel';
import type { GridPositionTrendPoint } from './GridPositionTrend';

type Props = {
  snapshots: GridMapSnapshot[];
  selectedId: string;
  gridSize: number;
  spacingKm: number;
  keyword: string;
  target: string;
  language: string;
  brandName: string;
  brandLogoUrl?: string;
  brandColor?: string;
  brandFooter?: string;
  brandStyle?: Partial<BrandStyle>;
  captureId: string;
  trend: GridPositionTrendPoint[];
};

export default function GridAnalysisPanel({ snapshots, selectedId, gridSize, spacingKm, keyword, target, language, brandName, brandLogoUrl, brandColor, brandFooter, brandStyle, captureId, trend }: Props) {
  const selection = useGridSnapshotSelection();
  const [localId, setLocalId] = useState(selectedId);
  useEffect(() => setLocalId(selectedId), [selectedId]);
  // Shared with the PDF export button when a provider is mounted.
  const activeId = selection?.activeId ?? localId;
  const setActiveId = selection?.setActiveId ?? setLocalId;

  const activeSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === activeId) ?? snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0],
    [activeId, selectedId, snapshots],
  );

  if (!activeSnapshot) return null;

  return (
    <>
      <GridSnapshotMapPanel
        snapshots={snapshots}
        selectedId={activeSnapshot.id}
        onSelectedIdChange={setActiveId}
        gridSize={gridSize}
        target={target}
        captureId={captureId}
        trend={trend}
      />
      <section className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Detailed analysis</p>
            <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-white">Map and competitive landscape</h3>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Selected snapshot</span>
        </div>
        <GridResults
          key={activeSnapshot.id}
          results={activeSnapshot.results}
          gridSize={gridSize}
          spacingKm={spacingKm}
          keyword={keyword}
          target={target}
          cost={activeSnapshot.cost}
          language={language}
          searchedAt={activeSnapshot.ts}
          snapshotDate={activeSnapshot.ts}
          brandName={brandName}
          brandLogoUrl={brandLogoUrl}
          brandColor={brandColor}
          brandFooter={brandFooter} brandStyle={brandStyle}
        />
      </section>
    </>
  );
}
