'use client';

import type { BrandStyle } from '@/lib/brand';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GridPoint } from '@/lib/db';
import GridPdfExportButton from './GridPdfExportButton';

type Selection = { activeId: string; setActiveId: (id: string) => void };

const SnapshotSelectionContext = createContext<Selection | null>(null);

/** Shares the snapshot (date) currently displayed on the map between the map panel and the PDF export. */
export function GridSnapshotSelectionProvider({ selectedId, children }: { selectedId: string; children: ReactNode }) {
  const [activeId, setActiveId] = useState(selectedId);
  useEffect(() => setActiveId(selectedId), [selectedId]);
  const value = useMemo(() => ({ activeId, setActiveId }), [activeId]);
  return <SnapshotSelectionContext.Provider value={value}>{children}</SnapshotSelectionContext.Provider>;
}

export function useGridSnapshotSelection(): Selection | null {
  return useContext(SnapshotSelectionContext);
}

type ExportSnapshot = { id: string; ts: number; results: GridPoint[] };

type ExportProps = {
  snapshots: ExportSnapshot[];
  fallbackResults: GridPoint[];
  fallbackTs: number;
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
  mapElementId: string;
};

/** PDF export bound to the snapshot currently selected on the map. */
export function GridSelectedSnapshotExportButton({ snapshots, fallbackResults, fallbackTs, ...rest }: ExportProps) {
  const selection = useGridSnapshotSelection();
  const active = snapshots.find((snapshot) => snapshot.id === selection?.activeId);
  return (
    <GridPdfExportButton
      {...rest}
      results={active?.results ?? fallbackResults}
      searchedAt={active?.ts ?? fallbackTs}
    />
  );
}
