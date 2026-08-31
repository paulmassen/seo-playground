'use client';

import { useEffect, useRef } from 'react';
import type { GridPoint } from '@/lib/db';
import { competitorKey } from './grid-insights';

interface Props {
  points: GridPoint[];
  gridSize: number;
  target: string;
  /** When set, markers show this competitor's rank at each point instead of the target's. */
  highlightKey?: string;
  highlightName?: string;
}

function rankColor(rank: number | null): string {
  if (rank === null) return '#94a3b8';
  if (rank === 1)    return '#059669';
  if (rank <= 3)     return '#10b981';
  if (rank <= 7)     return '#14b8a6';
  if (rank <= 10)    return '#3b82f6';
  if (rank <= 15)    return '#f59e0b';
  if (rank <= 20)    return '#f97316';
  return '#ef4444';
}

function rankTextColor(rank: number): string {
  if (rank <= 3)  return '#059669';
  if (rank <= 10) return '#2563eb';
  if (rank <= 20) return '#d97706';
  return '#dc2626';
}

function buildPopupHtml(point: GridPoint, target: string, highlightKey?: string): string {
  const items = point.items ?? [];

  const itemRows = items.slice(0, 20).map((item) => {
    const isHighlighted = !item.is_target && !!highlightKey && competitorKey(item) === highlightKey;
    const nameStyle = item.is_target
      ? 'font-weight:700;color:#059669'
      : isHighlighted
        ? 'font-weight:700;color:#2563eb'
        : 'font-weight:400;color:#334155';
    const rankColor_ = rankTextColor(item.rank_group);
    const stars = item.rating_value != null
      ? `<span style="color:#f59e0b;font-size:10px">★</span><span style="font-size:10px;color:#64748b"> ${item.rating_value.toFixed(1)}${item.rating_votes != null ? ` (${item.rating_votes.toLocaleString()})` : ''}</span>`
      : '';
    const rowBg = item.is_target
      ? 'background:#f0fdf4;border-left:3px solid #10b981;padding-left:5px;margin-left:-5px;border-radius:2px;'
      : isHighlighted
        ? 'background:#eff6ff;border-left:3px solid #3b82f6;padding-left:5px;margin-left:-5px;border-radius:2px;'
        : '';
    const mapsHref = item.cid
      ? `https://www.google.com/maps?cid=${item.cid}`
      : `https://www.google.com/maps/search/${encodeURIComponent(item.title)}`;
    const mapsLink = `<a href="${mapsHref}" target="_blank" rel="noopener noreferrer" style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;color:#3b82f6;text-decoration:none;white-space:nowrap;margin-top:2px;display:inline-block">Maps ↗</a>`;
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f9;${rowBg}">
        <span style="font-size:12px;font-weight:900;min-width:24px;color:${rankColor_}">#${item.rank_group}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;${nameStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${item.title}</div>
          ${item.domain ? `<div style="font-size:10px;color:#94a3b8;margin-top:1px">${item.domain}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${stars ? `<div style="margin-top:1px">${stars}</div>` : ''}
            ${mapsLink}
          </div>
        </div>
      </div>`;
  }).join('');

  const emptyMsg = items.length === 0
    ? '<p style="color:#94a3b8;font-size:12px;margin:8px 0">No results at this point.</p>'
    : '';

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:230px;max-width:260px">
      <p style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin:0 0 6px">
        Target: <span style="color:#334155">${target}</span>
      </p>
      ${itemRows}${emptyMsg}
    </div>`;
}

/** Resolves the rank to display at a point, given whether a competitor is being highlighted. */
function pointRank(point: GridPoint, highlightKey?: string): number | null {
  if (!highlightKey) return point.rank;
  const match = (point.items ?? []).find((i) => !i.is_target && competitorKey(i) === highlightKey);
  return match ? match.rank_group : null;
}

export default function GridMap({ points, gridSize, target, highlightKey, highlightName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const half = Math.floor(gridSize / 2);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isMounted = true;

    // Filter points that have coordinates
    const geoPoints = points.filter((p) => p.lat != null && p.lng != null);
    if (geoPoints.length === 0) return;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Fix bundler icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Init map
      const map = L.map(containerRef.current!, { zoomControl: true }).setView(
        [geoPoints[0].lat!, geoPoints[0].lng!], 13
      );
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Cell size based on grid
      const cellPx = gridSize <= 3 ? 52 : gridSize <= 5 ? 44 : gridSize <= 7 ? 38 : 32;
      const fontSize = gridSize <= 5 ? 15 : 13;

      geoPoints.forEach((point) => {
        const isCenter = point.row === half && point.col === half;
        const rank = pointRank(point, highlightKey);
        const color = rankColor(rank);
        const label = rank != null ? String(rank) : '—';

        const border = isCenter
          ? `border: 3px dashed rgba(255,255,255,0.85);`
          : `border: 2px solid rgba(255,255,255,0.4);`;

        const shadow = `box-shadow: 0 2px 8px rgba(0,0,0,0.35);`;

        const html = `
          <div style="
            width:${cellPx}px;height:${cellPx}px;
            background:${color};
            border-radius:${Math.round(cellPx * 0.22)}px;
            display:flex;align-items:center;justify-content:center;
            font-size:${fontSize}px;font-weight:900;color:white;
            font-family:system-ui,sans-serif;
            ${border}${shadow}
            cursor:pointer;
            transition:transform 0.1s;
          " onmouseenter="this.style.transform='scale(1.12)'" onmouseleave="this.style.transform='scale(1)'">
            ${label}
          </div>`;

        const icon = L.divIcon({
          html,
          className: '',
          iconSize: [cellPx, cellPx],
          iconAnchor: [cellPx / 2, cellPx / 2],
        });

        const marker = L.marker([point.lat!, point.lng!], { icon }).addTo(map);

        // Popup with full local pack list
        const popupContent = buildPopupHtml(point, target, highlightKey);
        marker.bindPopup(popupContent, {
          maxWidth: 280,
          maxHeight: 260,
          className: 'grid-popup',
          autoPan: false,
        });
      });

      // Fit map to all grid points
      const bounds = L.latLngBounds(geoPoints.map((p) => [p.lat!, p.lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48] });
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <style>{`
        .grid-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          padding: 0;
        }
        .grid-popup .leaflet-popup-content {
          margin: 12px 14px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .grid-popup .leaflet-popup-content::-webkit-scrollbar {
          width: 4px;
        }
        .grid-popup .leaflet-popup-content::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .grid-popup .leaflet-popup-tip {
          background: white;
        }
      `}</style>
      <div className="relative">
        {highlightKey && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-lg">
            Showing: {highlightName ?? 'competitor'}
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
          style={{ height: 520 }}
        />
      </div>
    </>
  );
}
