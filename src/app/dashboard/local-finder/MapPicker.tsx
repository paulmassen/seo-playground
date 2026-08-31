'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  coordinate: string;
  onChange: (coord: string) => void;
  showGrid?: boolean;
  gridSize?: number;
  spacingKm?: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function calcGridCoords(
  centerLat: number, centerLng: number, gridSize: number, spacingKm: number,
) {
  const latDeg = spacingKm / 111.32;
  const lngDeg = spacingKm / (111.32 * Math.cos(centerLat * Math.PI / 180));
  const half = Math.floor(gridSize / 2);
  const coords: { row: number; col: number; lat: number; lng: number; isCenter: boolean }[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      coords.push({
        row, col,
        lat: centerLat + (half - row) * latDeg,
        lng: centerLng + (col - half) * lngDeg,
        isCenter: row === half && col === half,
      });
    }
  }
  return coords;
}

export default function MapPicker({ coordinate, onChange, showGrid, gridSize, spacingKm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const gridLayerRef = useRef<import('leaflet').LayerGroup | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [geocoding, setGeocodng] = useState(false);
  const [geoError, setGeoError] = useState('');

  const mapHeight = expanded ? 420 : 260;

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const [defaultLat, defaultLng] = coordinate
        ? coordinate.split(',').map(Number)
        : [48.8566, 2.3522];

      const map = L.map(containerRef.current!).setView([defaultLat, defaultLng], 12);
      mapRef.current = map;
      gridLayerRef.current = L.layerGroup().addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (coordinate) {
        markerRef.current = L.marker([defaultLat, defaultLng]).addTo(map);
      }

      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        const rounded = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng]).addTo(map);
        }
        onChange(rounded);
        setExpanded(true);
      });
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        gridLayerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Invalidate map size on height change ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => mapRef.current?.invalidateSize(), 200);
  }, [expanded]);

  // ── Sync pin when coordinate changes externally ───────────────────────────
  useEffect(() => {
    if (!mapRef.current || !coordinate) return;
    const [lat, lng] = coordinate.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) return;
    import('leaflet').then((L) => {
      if (!mapRef.current) return;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng]).addTo(mapRef.current!);
      }
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    });
  }, [coordinate]);

  // ── Draw grid overlay ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !gridLayerRef.current) return;
    gridLayerRef.current.clearLayers();

    if (!showGrid || !coordinate || !gridSize || !spacingKm) return;

    const [centerLat, centerLng] = coordinate.split(',').map(Number);
    if (isNaN(centerLat) || isNaN(centerLng)) return;

    import('leaflet').then((L) => {
      if (!mapRef.current || !gridLayerRef.current) return;
      const coords = calcGridCoords(centerLat, centerLng, gridSize, spacingKm);
      const bounds: [number, number][] = [];

      coords.forEach(({ lat, lng, isCenter }) => {
        bounds.push([lat, lng]);
        L.circleMarker([lat, lng], {
          radius: isCenter ? 9 : 6,
          fillColor: isCenter ? '#3b82f6' : '#94a3b8',
          color: isCenter ? '#1d4ed8' : '#475569',
          weight: 1.5,
          opacity: 0.9,
          fillOpacity: isCenter ? 0.7 : 0.35,
        }).addTo(gridLayerRef.current!);
      });

      if (bounds.length > 1) {
        const llBounds = L.latLngBounds(bounds);
        mapRef.current!.fitBounds(llBounds, { padding: [28, 28], maxZoom: 15 });
        setExpanded(true);
      }
    });
  }, [showGrid, coordinate, gridSize, spacingKm]);

  // ── Geocoding ─────────────────────────────────────────────────────────────
  async function handleGeocode() {
    if (!query.trim() || !mapRef.current) return;
    setGeocodng(true);
    setGeoError('');
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results: NominatimResult[] = await res.json();
      if (!results.length) { setGeoError('Location not found.'); return; }
      const { lat, lon } = results[0];
      const coord = `${parseFloat(lat).toFixed(6)},${parseFloat(lon).toFixed(6)}`;
      const L = await import('leaflet');
      const latN = parseFloat(lat), lngN = parseFloat(lon);
      if (markerRef.current) {
        markerRef.current.setLatLng([latN, lngN]);
      } else {
        markerRef.current = L.marker([latN, lngN]).addTo(mapRef.current!);
      }
      mapRef.current.setView([latN, lngN], 13);
      onChange(coord);
      setExpanded(true);
    } catch {
      setGeoError('Geocoding failed. Try again.');
    } finally {
      setGeocodng(false);
    }
  }

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />

      {/* Geocoding search — div to avoid nested <form> */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGeocode(); } }}
          placeholder="Search a city, address, place…"
          className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleGeocode}
          disabled={geocoding || !query.trim()}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {geocoding ? '…' : 'Find'}
        </button>
      </div>
      {geoError && <p className="text-[11px] text-red-500 -mt-1">{geoError}</p>}

      {/* Map */}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-300"
        style={{ height: mapHeight }}
      />
      {showGrid && coordinate && gridSize && spacingKm && (
        <p className="text-[11px] text-slate-400 -mt-1">
          {gridSize}×{gridSize} grid · {spacingKm < 1 ? `${spacingKm * 1000} m` : `${spacingKm} km`} spacing · {gridSize ** 2} points
        </p>
      )}
    </>
  );
}
