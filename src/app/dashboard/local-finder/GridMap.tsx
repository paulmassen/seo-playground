'use client';

import { useEffect, useRef, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import type { PinStyle } from '@/lib/grid-preferences';
import { competitorKey } from './grid-insights';
import { useGridPreferences } from './GridPreferences';
import { rankBand } from '@/lib/grid-rank-scale';

interface Props {
  points: GridPoint[];
  gridSize: number;
  target: string;
  /** When set, markers show this competitor's rank at each point instead of the target's. */
  highlightKey?: string;
  highlightName?: string;
  /** Previous snapshot, used to show the per-marker movement in timeline mode. */
  previousPoints?: GridPoint[] | null;
  /** A stable DOM id allows the PDF export to capture this exact map. */
  captureId?: string;
  /** Real address of the highlighted competitor, drawn above the rank pins. */
  businessLocation?: { lat: number; lng: number; address: string | null } | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function buildPopupHtml(point: GridPoint, target: string, highlightKey?: string): string {
  const items = point.items ?? [];

  const itemRows = items.slice(0, 20).map((item) => {
    const isHighlighted = !item.is_target && !!highlightKey && competitorKey(item) === highlightKey;
    const nameStyle = item.is_target
      ? 'font-weight:700;color:#166534'
      : isHighlighted
        ? 'font-weight:700;color:#1d4ed8'
        : 'font-weight:400;color:#334155';
    const rankColor_ = rankBand(item.rank_group).onWhite;
    const stars = item.rating_value != null
      ? `<span style="color:#b45309;font-size:11px" aria-hidden="true">★</span><span style="font-size:11px;color:#475569"> ${item.rating_value.toFixed(1)}${item.rating_votes != null ? ` (${item.rating_votes.toLocaleString()})` : ''}</span>`
      : '';
    const rowBg = item.is_target
      ? 'background:#f0fdf4;padding-left:5px;margin-left:-5px;border-radius:4px;'
      : isHighlighted
        ? 'background:#eff6ff;padding-left:5px;margin-left:-5px;border-radius:4px;'
        : '';
    const mapsHref = item.cid
      ? `https://www.google.com/maps?cid=${item.cid}`
      : `https://www.google.com/maps/search/${encodeURIComponent(item.title)}`;
    const mapsLink = `<a href="${mapsHref}" target="_blank" rel="noopener noreferrer" style="font-size:11px;font-weight:700;color:#1d4ed8;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;margin-top:2px;display:inline-block">Open in Google Maps<span class="sr-only"> (new tab)</span></a>`;
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f9;${rowBg}">
        <span style="font-size:12px;font-weight:900;min-width:24px;color:${rankColor_}">#${item.rank_group}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;${nameStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${escapeHtml(item.title)}</div>
          ${item.domain ? `<div style="font-size:11px;color:#475569;margin-top:1px">${escapeHtml(item.domain)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${stars ? `<div style="margin-top:1px">${stars}</div>` : ''}
            ${mapsLink}
          </div>
        </div>
      </div>`;
  }).join('');

  const emptyMsg = items.length === 0
    ? '<p style="color:#475569;font-size:12px;margin:8px 0">No local results came back for this point.</p>'
    : '';

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:230px;max-width:260px">
      <p style="font-size:11px;color:#475569;margin:0 0 6px">
        Target: <span style="font-weight:700;color:#0f172a">${escapeHtml(target)}</span>
      </p>
      ${itemRows}${emptyMsg}
    </div>`;
}

/**
 * Bulky 5-point star in a 100×100 viewBox. The inner radius is fatter than a classic star
 * (0.52 vs 0.38) and the stroke uses round joins to soften the tips — clip-path can't round
 * polygon corners, hence SVG.
 */
const STAR_PATH = (() => {
  const cx = 50, cy = 53, outer = 44, inner = 23;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
})();

function starMarkerHtml(size: number, fontSize: number, color: string, ink: string, label: string, isCenter: boolean, movement = '', movementColor = '#065f46'): string {
  // The center point loses its dashed border as a star, so a white halo keeps the "grid center" cue.
  const halo = isCenter
    ? `<path d="${STAR_PATH}" fill="white" stroke="white" stroke-width="20" stroke-linejoin="round"/>`
    : '';
  return `
    <div style="
      position:relative;width:${size}px;height:${size}px;
      cursor:pointer;transition:transform 0.1s;
      filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));
    " onmouseenter="this.style.transform='scale(1.12)'" onmouseleave="this.style.transform='scale(1)'">
      <!-- z-index:0 overrides Leaflet's ".leaflet-map-pane svg { z-index: 200 }", which would hide the label -->
      <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="position:absolute;inset:0;z-index:0;overflow:visible">
        ${halo}
        <path d="${STAR_PATH}" fill="${color}" stroke="${color}" stroke-width="8" stroke-linejoin="round"/>
      </svg>
      <div style="
        position:absolute;inset:0;z-index:1;padding-top:${Math.round(size * 0.06)}px;
        display:flex;align-items:center;justify-content:center;
        font-size:${fontSize}px;font-weight:900;color:${ink};
        font-family:inherit;font-variant-numeric:tabular-nums;
      ">${label}</div>
      ${movement ? `<span style="position:absolute;bottom:-5px;left:50%;z-index:2;transform:translateX(-50%);border-radius:99px;background:rgba(255,255,255,0.96);padding:1px 3px;font-size:10px;line-height:12px;font-weight:900;color:${movementColor};box-shadow:0 1px 2px rgba(15,23,42,0.22)">${movement}</span>` : ''}
    </div>`;
}

/** Marker and label sizes for a grid, per pin style. Circles and dots leave more of the basemap visible. */
function markerMetrics(gridSize: number, pinStyle: PinStyle) {
  const cellPx = gridSize <= 3 ? 52 : gridSize <= 5 ? 44 : gridSize <= 7 ? 38 : 32;
  const fontSize = gridSize <= 5 ? 15 : 13;
  if (pinStyle === 'circle') return { size: Math.round(cellPx * 0.9), fontSize: fontSize - 1, starScale: 1.3 };
  if (pinStyle === 'dot') return { size: Math.max(22, Math.round(cellPx * 0.6)), fontSize: gridSize <= 5 ? 11 : 10, starScale: 1.45 };
  return { size: cellPx, fontSize, starScale: 1.3 };
}

function shapeMarkerHtml(pinStyle: PinStyle, size: number, fontSize: number, color: string, ink: string, label: string, isCenter: boolean, movement: string, movementColor: string): string {
  const round = pinStyle !== 'square';
  const radius = round ? '50%' : `${Math.round(size * 0.22)}px`;
  // A crisp white ring keeps light fills (lime, yellow, grey) readable on pale map tiles;
  // the grid center swaps it for a dark dashed ring.
  const border = isCenter
    ? `border: ${pinStyle === 'dot' ? 2 : 3}px dashed #0f172a;`
    : `border: ${pinStyle === 'dot' ? 1.5 : 2}px solid #ffffff;`;
  const shadow = pinStyle === 'dot' ? '0 1px 4px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.35)';
  // Movement badges shrink with dots so they don't outweigh the pin itself.
  const badgeSize = pinStyle === 'dot' ? 'bottom:-7px;padding:0 3px;font-size:9px;line-height:11px;' : 'bottom:-8px;padding:1px 4px;font-size:10px;line-height:12px;';
  const badge = movement
    ? `<span style="position:absolute;left:50%;transform:translateX(-50%);border-radius:99px;background:rgba(255,255,255,0.96);${badgeSize}font-weight:900;color:${movementColor};box-shadow:0 1px 2px rgba(15,23,42,0.22);white-space:nowrap">${movement}</span>`
    : '';
  return `<div style="position:relative;box-sizing:border-box;width:${size}px;height:${size}px;background:${color};border-radius:${radius};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:900;color:${ink};font-family:inherit;font-variant-numeric:tabular-nums;${border}box-shadow:${shadow};cursor:pointer;transition:transform 0.1s" onmouseenter="this.style.transform='scale(1.12)'" onmouseleave="this.style.transform='scale(1)'"><span>${label}</span>${badge}</div>`;
}

/** Resolves the rank to display at a point, given whether a competitor is being highlighted. */
function pointRank(point: GridPoint, highlightKey?: string): number | null {
  if (!highlightKey) return point.rank;
  const match = (point.items ?? []).find((i) => !i.is_target && competitorKey(i) === highlightKey);
  return match ? match.rank_group : null;
}

const BUSINESS_PIN_HTML = `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1d4ed8;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center"><div style="width:9px;height:9px;border-radius:50%;background:#ffffff"></div></div>`;

export default function GridMap({ points, gridSize, target, highlightKey, highlightName, previousPoints, captureId, businessLocation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markerLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const businessLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const boundsSignatureRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const { pinStyle } = useGridPreferences();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isMounted = true;

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

      // The basemap is intentionally initialized only once. Snapshot changes use
      // the marker layer below, keeping the exact same geographic context in view.
      const map = L.map(containerRef.current!, { zoomControl: true }).setView([0, 0], 2);
      mapRef.current = map;
      leafletRef.current = L;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        crossOrigin: true,
        // See MapPicker: keep the Referer that OSM's tile usage policy asks for behind strict proxies.
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      businessLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!mapReady || !L || !map || !markerLayer) return;

    const geoPoints = points.filter((point) => point.lat != null && point.lng != null);
    if (geoPoints.length === 0) return;
    const half = Math.floor(gridSize / 2);
    const previousByPoint = new Map((previousPoints ?? []).map((point) => [`${point.row}:${point.col}`, point]));
    const { size, fontSize, starScale } = markerMetrics(gridSize, pinStyle);

    // Only the dynamic layer changes when selecting a different date.
    markerLayer.clearLayers();
    geoPoints.forEach((point) => {
      const isCenter = point.row === half && point.col === half;
      const rank = pointRank(point, highlightKey);
      const band = rankBand(rank);
      const label = rank != null ? String(rank) : '—';
      const before = pointRank(previousByPoint.get(`${point.row}:${point.col}`) ?? { ...point, rank: null }, highlightKey);
      // Without a previous snapshot there is no movement to show (not "new" on every ranked pin).
      const movement = !previousPoints || (before === null && rank === null) ? ''
        : before === null ? 'new'
          : rank === null ? 'lost'
            : before - rank === 0 ? ''
              : `${before - rank > 0 ? '+' : ''}${before - rank}`;
      const movementColor = before === null || (rank !== null && before > rank) ? '#166534' : '#991b1b';
      const markerPx = rank === 1 ? Math.round(size * starScale) : size;
      const html = rank === 1
        ? starMarkerHtml(markerPx, fontSize, band.fill, band.ink, label, isCenter, movement, movementColor)
        : shapeMarkerHtml(pinStyle, size, fontSize, band.fill, band.ink, label, isCenter, movement, movementColor);
      const icon = L.divIcon({ html, className: 'grid-rank-pin', iconSize: [markerPx, markerPx], iconAnchor: [markerPx / 2, markerPx / 2] });
      const marker = L.marker([point.lat!, point.lng!], { icon, keyboard: true }).addTo(markerLayer);
      // Leaflet makes each pin a focusable role=button whose only text is the visual label ("7", "—").
      // Give it the full reading so keyboard and screen-reader users get rank and movement.
      const movementText = movement === 'new' ? ', newly in the top 20' : movement === 'lost' ? ', dropped out of the top 20'
        : movement ? `, ${movement.startsWith('+') ? 'up' : 'down'} ${movement.replace(/^[+-]/, '')} since the previous snapshot` : '';
      const pinElement = marker.getElement();
      if (pinElement) {
        pinElement.setAttribute('aria-label', `Row ${point.row + 1}, column ${point.col + 1}${isCenter ? ' (grid center)' : ''}: ${rank != null ? `rank ${rank}` : 'not in the top 20'}${movementText}. Press Enter for the local results.`);
        pinElement.firstElementChild?.setAttribute('aria-hidden', 'true');
      }
      marker.bindPopup(buildPopupHtml(point, target, highlightKey), {
        maxWidth: 260, maxHeight: 240, className: 'grid-popup', autoPan: true, keepInView: true,
        autoPanPadding: [28, 28], closeButton: true, closeOnClick: true,
      });
    });

    const signature = geoPoints.map((point) => `${point.lat}:${point.lng}`).join('|');
    if (boundsSignatureRef.current !== signature) {
      boundsSignatureRef.current = signature;
      map.fitBounds(L.latLngBounds(geoPoints.map((point) => [point.lat!, point.lng!] as [number, number])), { padding: [48, 48] });
    }
  }, [mapReady, points, gridSize, target, highlightKey, previousPoints, pinStyle]);

  // The highlighted competitor's real address, above every rank pin, so the map shows where its ranks come from.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = businessLayerRef.current;
    if (!mapReady || !L || !map || !layer) return;
    layer.clearLayers();
    if (!businessLocation) return;
    const name = highlightName ?? 'Competitor';
    const marker = L.marker([businessLocation.lat, businessLocation.lng], {
      icon: L.divIcon({ html: BUSINESS_PIN_HTML, className: 'grid-business-pin', iconSize: [30, 30], iconAnchor: [15, 30] }),
      zIndexOffset: 10_000,
      keyboard: true,
      title: `${name} address`,
    }).addTo(layer);
    marker.getElement()?.setAttribute('aria-label', `${name}: business address${businessLocation.address ? `, ${businessLocation.address}` : ''}`);
    marker.bindPopup(
      `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;max-width:220px"><p style="margin:0;font-weight:700;color:#0f172a">${escapeHtml(name)}</p>${businessLocation.address ? `<p style="margin:2px 0 0;color:#475569">${escapeHtml(businessLocation.address)}</p>` : ''}</div>`,
      { className: 'grid-popup', closeButton: true },
    );
    // Bring the address into view when it lies outside the grid, without zooming in on it.
    const bounds = map.getBounds();
    if (!bounds.contains([businessLocation.lat, businessLocation.lng])) {
      map.fitBounds(bounds.extend([businessLocation.lat, businessLocation.lng]), { padding: [48, 48] });
    }
  }, [mapReady, businessLocation, highlightName]);

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
        .grid-rank-pin:focus-visible {
          outline: 3px solid #1d4ed8;
          outline-offset: 3px;
          border-radius: 6px;
        }
      `}</style>
      <div id={captureId} className="relative bg-slate-100">
        {highlightKey && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-[80%] truncate bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            Showing {highlightName ?? 'a competitor'}’s ranks
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
          style={{ height: 'clamp(340px, 62vh, 600px)' }}
          role="region"
          aria-label="Ranking map. Each pin is a grid point; Tab moves between pins."
        />
      </div>
    </>
  );
}
