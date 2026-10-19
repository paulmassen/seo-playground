'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistance, type DistanceUnit } from '@/lib/grid-preferences';
import { DEFAULT_GRID_LAYOUT, gridLayoutCoords, gridPointCount, type GridLayout } from '@/lib/grid-layout';

export interface BusinessResult {
  title: string;
  address: string;
  lat: number;
  lng: number;
  cid: string;
  domain: string;
  category: string;
  rating: number | null;
  reviews: number | null;
}

interface Props {
  coordinate: string;
  onChange: (coord: string) => void;
  showGrid?: boolean;
  gridSize?: number;
  spacingKm?: number;
  /** Shape, rotation and skipped points of the grid preview. */
  gridLayout?: GridLayout;
  /** When set, clicking a preview point (other than the center) toggles it in or out of the scan. */
  onToggleCell?: (row: number, col: number) => void;
  /** Unit used to label the spacing (Settings → Geo-grid). */
  distanceUnit?: DistanceUnit;
  /** Language name from the form (e.g. "French"); used for the Google Maps business search. */
  language?: string;
  /** Called when a Google listing is picked from the search results. */
  onBusinessSelect?: (business: BusinessResult) => void;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export default function MapPicker({ coordinate, onChange, showGrid, gridSize, spacingKm, gridLayout = DEFAULT_GRID_LAYOUT, onToggleCell, distanceUnit = 'km', language, onBusinessSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const gridLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  // Marker click handlers outlive renders; read the latest callback through a ref.
  const toggleCellRef = useRef(onToggleCell);
  useEffect(() => { toggleCellRef.current = onToggleCell; }, [onToggleCell]);
  /** Geometry last fitted into view: toggling a point must not re-zoom the map. */
  const fittedGeometryRef = useRef<string | null>(null);
  /** Bounds of the drawn grid, re-fitted when the map container changes size. */
  const gridBoundsRef = useRef<import('leaflet').LatLngBounds | null>(null);

  const [expanded, setExpanded] = useState(false);
  // Leaflet loads asynchronously: effects that need the map re-run once it exists.
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState('');
  const [geocoding, setGeocodng] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [businesses, setBusinesses] = useState<BusinessResult[]>([]);

  const mapHeight = expanded ? 420 : 260;

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;

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
        // OSM's tile policy requires a Referer. Some reverse proxies (Cloudron) send `Referrer-Policy: same-origin`,
        // which strips it and gets the tiles blocked; a per-tile policy overrides the page's.
        referrerPolicy: 'strict-origin-when-cross-origin',
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

      // The form can mount this map inside a closed <details> (zero size) and later grow it;
      // Leaflet only tracks window resizes, so refresh its size and keep the grid framed.
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize({ animate: false });
          if (gridBoundsRef.current) map.fitBounds(gridBoundsRef.current, { padding: [28, 28], maxZoom: 15, animate: false });
        });
        resizeObserver.observe(containerRef.current!);
      }

      setMapReady(true);
    });

    return () => {
      isMounted = false;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        gridLayerRef.current = null;
      }
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Invalidate map size on height change ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => mapRef.current?.invalidateSize(), 200);
  }, [expanded, mapReady]);

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

    if (!showGrid || !coordinate || !gridSize || !spacingKm) {
      fittedGeometryRef.current = null;
      gridBoundsRef.current = null;
      return;
    }

    const [centerLat, centerLng] = coordinate.split(',').map(Number);
    if (isNaN(centerLat) || isNaN(centerLng)) return;

    import('leaflet').then((L) => {
      if (!mapRef.current || !gridLayerRef.current) return;
      // Effects can resolve out of order; a newer run may already have drawn the grid.
      gridLayerRef.current.clearLayers();
      const coords = gridLayoutCoords(centerLat, centerLng, gridSize, spacingKm, gridLayout);
      const bounds: [number, number][] = [];
      const toggleable = !!toggleCellRef.current;

      coords.forEach(({ row, col, lat, lng, isCenter, excluded }) => {
        bounds.push([lat, lng]);
        const marker = L.circleMarker([lat, lng], isCenter ? {
          radius: 9, fillColor: '#3b82f6', color: '#1d4ed8', weight: 1.5, opacity: 0.9, fillOpacity: 0.7,
        } : excluded ? {
          // Skipped points stay visible as dashed rings so they can be added back.
          radius: 6, fillColor: '#ffffff', color: '#94a3b8', weight: 1.5, opacity: 0.9, fillOpacity: 0.15, dashArray: '2 3',
          bubblingMouseEvents: false,
        } : {
          radius: 6, fillColor: '#94a3b8', color: '#475569', weight: 1.5, opacity: 0.9, fillOpacity: 0.35,
          // Without this, the map's own click handler would also move the grid center here.
          bubblingMouseEvents: !toggleable,
        });
        if (!isCenter && toggleable) marker.on('click', () => toggleCellRef.current?.(row, col));
        marker.addTo(gridLayerRef.current!);
      });

      const geometry = `${coordinate}|${gridSize}|${spacingKm}|${gridLayout.shape}|${gridLayout.rotationDeg}`;
      const llBounds = bounds.length > 1 ? L.latLngBounds(bounds) : null;
      gridBoundsRef.current = llBounds;
      if (llBounds && fittedGeometryRef.current !== geometry) {
        fittedGeometryRef.current = geometry;
        mapRef.current!.fitBounds(llBounds, { padding: [28, 28], maxZoom: 15 });
        setExpanded(true);
      }
    });
  }, [mapReady, showGrid, coordinate, gridSize, spacingKm, gridLayout]);

  // ── Business / address search ──────────────────────────────────────────────
  // Search Google Maps (DataForSEO) first so a business can be picked by name and
  // matched on its exact listing; fall back to OpenStreetMap for plain addresses.
  async function placeMarker(latN: number, lngN: number) {
    if (!mapRef.current) return;
    const L = await import('leaflet');
    if (markerRef.current) {
      markerRef.current.setLatLng([latN, lngN]);
    } else {
      markerRef.current = L.marker([latN, lngN]).addTo(mapRef.current!);
    }
    mapRef.current.setView([latN, lngN], 13);
    onChange(`${latN.toFixed(6)},${lngN.toFixed(6)}`);
    setExpanded(true);
  }

  async function selectBusiness(business: BusinessResult) {
    setBusinesses([]);
    setQuery(business.title);
    await placeMarker(business.lat, business.lng);
    onBusinessSelect?.(business);
  }

  async function geocodeAddress(text: string): Promise<boolean> {
    const cleaned = text
      .replace(/\s*(#|\b(?:suite|ste\.?|unit|apt\.?|bldg|building|floor|fl\.?)\b)\s*[\w-]+/gi, '')
      .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim();
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleaned)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, referrerPolicy: 'strict-origin-when-cross-origin' });
    const results: NominatimResult[] = await res.json();
    if (!results.length) return false;
    await placeMarker(parseFloat(results[0].lat), parseFloat(results[0].lon));
    return true;
  }

  async function handleGeocode() {
    if (!query.trim() || !mapRef.current) return;
    setGeocodng(true);
    setGeoError('');
    setBusinesses([]);
    try {
      let found: BusinessResult[] = [];
      try {
        // Bias the Google Maps search to the area currently shown on the map, in the form's language.
        const center = mapRef.current.getCenter();
        const params = new URLSearchParams({
          q: query.trim(),
          location_coordinate: `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${mapRef.current.getZoom()}`,
        });
        if (language) params.set('language', language);
        const res = await fetch('/api/business-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(params)),
        });
        const data = await res.json() as { results?: BusinessResult[] };
        found = data.results ?? [];
      } catch {
        found = [];
      }
      if (found.length > 0) {
        setBusinesses(found);
        return;
      }
      if (!(await geocodeAddress(query))) setGeoError('No Google listing or address found. Try the business name plus city, or type lat,lng below.');
    } catch {
      setGeoError('Search failed. Try again.');
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
          placeholder="Search a business name (e.g. Best Plumbing Austin) or an address…"
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
      {businesses.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-800">Google Maps listings · pick one</p>
          {businesses.map((business) => (
            <button
              key={business.cid}
              type="button"
              onClick={() => selectBusiness(business)}
              className="block w-full border-t border-slate-100 px-3 py-2 text-left transition-colors hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-blue-950"
            >
              <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{business.title}</span>
              <span className="block text-[11px] text-slate-400">
                {[business.category, business.address].filter(Boolean).join(' · ')}
                {business.rating != null ? ` · ${business.rating}★ (${business.reviews ?? 0})` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-300"
        style={{ height: mapHeight }}
      />
      {showGrid && coordinate && gridSize && spacingKm && (
        <p className="text-[11px] text-slate-400 -mt-1">
          {gridSize}×{gridSize} {gridLayout.shape === 'square' ? 'grid' : gridLayout.shape}
          {gridLayout.rotationDeg !== 0 ? ` · ${gridLayout.rotationDeg}° rotation` : ''}
          {' · '}{distanceUnit === 'km' && spacingKm < 1 ? `${spacingKm * 1000} m` : formatDistance(spacingKm, distanceUnit)} spacing · {gridPointCount(gridSize, gridLayout)} points
          {onToggleCell ? ' · click a point to skip it' : ''}
        </p>
      )}
    </>
  );
}
