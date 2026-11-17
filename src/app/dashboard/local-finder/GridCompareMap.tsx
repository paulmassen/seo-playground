'use client';

import { useEffect, useRef, useState } from 'react';
import type { GridLocalItem } from '@/lib/db';
import { rankBand } from '@/lib/grid-rank-scale';
import { useGridPreferences } from './GridPreferences';
import { CHANGE_STYLES, changeLabel, type PointComparison } from './grid-compare';

export type CompareMapView = 'change' | 'before' | 'after';

interface Props {
  points: PointComparison[];
  gridSize: number;
  view: CompareMapView;
  beforeLabel: string;
  afterLabel: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function rankText(rank: number | null) {
  return rank === null ? 'not found' : `#${rank}`;
}

function packHtml(title: string, items: GridLocalItem[]) {
  const rows = items.filter((item) => item.rank_group <= 3).slice(0, 3).map((item) => `
    <div style="display:flex;gap:6px;padding:2px 0;font-size:12px">
      <span style="font-weight:900;min-width:20px;color:${rankBand(item.rank_group).onWhite}">#${item.rank_group}</span>
      <span style="${item.is_target ? 'font-weight:700;color:#166534' : 'color:#334155'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${escapeHtml(item.title)}</span>
    </div>`).join('');
  return `<p style="margin:8px 0 2px;font-size:11px;font-weight:700;color:#475569">${escapeHtml(title)}</p>${rows || '<p style="margin:0;font-size:12px;color:#475569">No local results.</p>'}`;
}

function popupHtml(point: PointComparison, beforeLabel: string, afterLabel: string) {
  const style = CHANGE_STYLES[point.change];
  const entered = point.enteredPack.length > 0
    ? `<p style="margin:8px 0 0;font-size:11px;color:#334155"><strong>Entered the top 3:</strong> ${point.enteredPack.map((b) => escapeHtml(b.name)).join(', ')}</p>` : '';
  const left = point.leftPack.length > 0
    ? `<p style="margin:4px 0 0;font-size:11px;color:#334155"><strong>Left the top 3:</strong> ${point.leftPack.map((b) => escapeHtml(b.name)).join(', ')}</p>` : '';
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:220px;max-width:250px">
      <p style="margin:0;font-size:13px;font-weight:900;color:${style.onWhite}">${style.label}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#0f172a;font-variant-numeric:tabular-nums">${rankText(point.before)} → ${rankText(point.after)}</p>
      ${entered}${left}
      ${packHtml(`Top 3 · ${beforeLabel}`, point.beforeItems)}
      ${packHtml(`Top 3 · ${afterLabel}`, point.afterItems)}
    </div>`;
}

function markerSize(gridSize: number) {
  return gridSize <= 3 ? 48 : gridSize <= 5 ? 42 : gridSize <= 7 ? 36 : gridSize <= 11 ? 30 : gridSize <= 13 ? 27 : 24;
}

/** One map for a pair of snapshots: each pin shows the rank change, or the before / after rank. */
export default function GridCompareMap({ points, gridSize, view, beforeLabel, afterLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const boundsRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const { pinStyle } = useGridPreferences();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let mounted = true;
    import('leaflet').then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true }).setView([0, 0], 2);
      mapRef.current = map;
      leafletRef.current = L;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        crossOrigin: true,
        // OSM's tile usage policy requires a Referer, even behind proxies that strip it.
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    const geo = points.filter((point) => point.lat != null && point.lng != null);
    if (geo.length === 0) return;
    const size = markerSize(gridSize);
    const fontSize = gridSize <= 5 ? 13 : gridSize <= 11 ? 11 : 10;
    const radius = pinStyle === 'square' ? `${Math.round(size * 0.22)}px` : '50%';
    const half = Math.floor(gridSize / 2);

    layer.clearLayers();
    for (const point of geo) {
      const rank = view === 'before' ? point.before : point.after;
      const colors = view === 'change' ? CHANGE_STYLES[point.change] : rankBand(rank);
      const label = view === 'change' ? changeLabel(point) : rank === null ? '—' : String(rank);
      const isCenter = point.row === half && point.col === half;
      const border = isCenter ? 'border:3px dashed #0f172a;' : 'border:2px solid #ffffff;';
      const html = `<div style="box-sizing:border-box;width:${size}px;height:${size}px;border-radius:${radius};background:${colors.fill};color:${colors.ink};display:flex;align-items:center;justify-content:center;font:900 ${fontSize}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;${border}box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer">${label}</div>`;
      const marker = L.marker([point.lat!, point.lng!], {
        icon: L.divIcon({ html, className: 'grid-rank-pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        keyboard: true,
      }).addTo(layer);
      const element = marker.getElement();
      if (element) {
        element.setAttribute('aria-label', `Row ${point.row + 1}, column ${point.col + 1}${isCenter ? ' (grid center)' : ''}: ${CHANGE_STYLES[point.change].label.toLowerCase()}, ${rankText(point.before)} on ${beforeLabel}, ${rankText(point.after)} on ${afterLabel}. Press Enter for details.`);
        element.firstElementChild?.setAttribute('aria-hidden', 'true');
      }
      marker.bindPopup(popupHtml(point, beforeLabel, afterLabel), { maxWidth: 260, maxHeight: 280, className: 'grid-popup', autoPanPadding: [28, 28] });
    }

    const signature = geo.map((point) => `${point.lat}:${point.lng}`).join('|');
    if (boundsRef.current !== signature) {
      boundsRef.current = signature;
      map.fitBounds(L.latLngBounds(geo.map((point) => [point.lat!, point.lng!] as [number, number])), { padding: [48, 48] });
    }
  }, [ready, points, gridSize, view, pinStyle, beforeLabel, afterLabel]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <style>{`
        .grid-popup .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 0; }
        .grid-popup .leaflet-popup-content { margin: 12px 14px; overflow-y: auto; }
        .grid-rank-pin:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 3px; border-radius: 6px; }
      `}</style>
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800"
        style={{ height: 'clamp(340px, 62vh, 600px)' }}
        role="region"
        aria-label="Comparison map. Each pin is a grid point; Tab moves between pins."
      />
    </>
  );
}
