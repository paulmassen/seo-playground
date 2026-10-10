'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, MapPin, Plus, Search, Star } from 'lucide-react';
import { LANGUAGES } from '@/lib/geo-options';
import { distanceKm, estimateCost, INITIAL_DEPTH, MAX_LISTINGS } from '@/lib/review-velocity';
import type { DiscoveredListing } from '@/lib/review-velocity-discovery';
import { createBenchmarkAction, discoverListingsAction } from './actions';

interface Props {
  defaultCenter: string;
  defaultLanguage: string;
  hasCredentials: boolean;
}

type Candidate = DiscoveredListing & { manual?: boolean };

interface BusinessSearchResult {
  title: string; address: string; lat: number; lng: number; cid: string; category: string; rating: number | null; reviews: number | null;
}

const RADII = [1, 2, 3, 5, 10, 15, 25, 50];
const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

function parseCenter(value: string): [number, number] | null {
  const [lat, lng] = value.split(',').map((part) => Number(part.trim()));
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

function markerHtml(label: string, state: 'selected' | 'self' | 'idle' | 'outside') {
  const colors = { selected: '#2563eb', self: '#f59e0b', idle: '#0f172a', outside: '#94a3b8' }[state];
  return `<div style="width:24px;height:24px;border-radius:9999px;background:${colors};color:#fff;font:700 11px/24px system-ui;text-align:center;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(15,23,42,.35)">${label}</div>`;
}

export default function BenchmarkBuilder({ defaultCenter, defaultLanguage, hasCredentials }: Props) {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(LANGUAGES.some((l) => l.value === defaultLanguage) ? defaultLanguage : 'English');
  const [center, setCenter] = useState(parseCenter(defaultCenter) ? defaultCenter : '');
  const [radiusKm, setRadiusKm] = useState(5);
  const [depth, setDepth] = useState(40);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selfCid, setSelfCid] = useState<string | null>(null);
  const [showOutside, setShowOutside] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [discoveryCost, setDiscoveryCost] = useState<number | null>(null);
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();
  const [addressQuery, setAddressQuery] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [nameResults, setNameResults] = useState<BusinessSearchResult[]>([]);
  const [nameSearching, setNameSearching] = useState(false);
  const [areaLabel, setAreaLabel] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const centerMarkerRef = useRef<import('leaflet').CircleMarker | null>(null);
  const circleRef = useRef<import('leaflet').Circle | null>(null);
  const resultsLayerRef = useRef<import('leaflet').LayerGroup | null>(null);

  const visible = useMemo(() => candidates.filter((c) => showOutside || c.insideRadius || c.manual || selected.includes(c.cid)), [candidates, showOutside, selected]);
  const outsideCount = candidates.filter((c) => !c.insideRadius && !c.manual).length;
  const full = selected.length >= MAX_LISTINGS;

  // ── Map setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let alive = true;
    import('leaflet').then((L) => {
      if (!alive || !containerRef.current || mapRef.current) return;
      const start = parseCenter(center) ?? [48.8566, 2.3522];
      const map = L.map(containerRef.current).setView(start, 12);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      resultsLayerRef.current = L.layerGroup().addTo(map);
      map.on('click', (event) => setCenter(`${event.latlng.lat.toFixed(6)},${event.latlng.lng.toFixed(6)}`));
      setCenter((value) => value); // trigger the circle effect once the map exists
    });
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
      centerMarkerRef.current = null;
      circleRef.current = null;
      resultsLayerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Centre + circle ──────────────────────────────────────────────────────
  useEffect(() => {
    const point = parseCenter(center);
    if (!point) return;
    import('leaflet').then((L) => {
      const map = mapRef.current;
      if (!map) return;
      if (centerMarkerRef.current) centerMarkerRef.current.setLatLng(point);
      else centerMarkerRef.current = L.circleMarker(point, { radius: 5, color: '#1d4ed8', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map);
      if (circleRef.current) { circleRef.current.setLatLng(point); circleRef.current.setRadius(radiusKm * 1000); }
      else circleRef.current = L.circle(point, { radius: radiusKm * 1000, color: '#2563eb', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.07, interactive: false }).addTo(map);
      map.fitBounds(circleRef.current.getBounds(), { padding: [24, 24] });
    });
  }, [center, radiusKm]);

  // ── Place name of the centre (OpenStreetMap), shown under the map and in the report ──
  useEffect(() => {
    const point = parseCenter(center);
    setAreaLabel(null);
    if (!point) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${point[0]}&lon=${point[1]}&format=json&zoom=14`, {
          headers: { 'Accept-Language': 'en' }, referrerPolicy: 'strict-origin-when-cross-origin', signal: controller.signal,
        });
        const data = await res.json() as { address?: Record<string, string> };
        const a = data.address ?? {};
        const place = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
        const district = a.city_district ?? a.suburb ?? a.borough;
        setAreaLabel([district, place].filter(Boolean).join(', ') || null);
      } catch { /* the coordinates are used instead */ }
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [center]);

  // ── Result markers ───────────────────────────────────────────────────────
  useEffect(() => {
    import('leaflet').then((L) => {
      const layer = resultsLayerRef.current;
      if (!layer) return;
      layer.clearLayers();
      visible.forEach((candidate, index) => {
        const state = candidate.cid === selfCid ? 'self' : selected.includes(candidate.cid) ? 'selected' : candidate.insideRadius || candidate.manual ? 'idle' : 'outside';
        const marker = L.marker([candidate.lat, candidate.lng], {
          icon: L.divIcon({ html: markerHtml(String(index + 1), state), className: '', iconSize: [24, 24], iconAnchor: [12, 12] }),
          title: candidate.title,
        });
        marker.on('click', () => toggle(candidate.cid));
        marker.addTo(layer);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selected, selfCid]);

  function toggle(cid: string) {
    setSelected((current) => {
      if (current.includes(cid)) {
        if (selfCid === cid) setSelfCid(null);
        return current.filter((c) => c !== cid);
      }
      return current.length >= MAX_LISTINGS ? current : [...current, cid];
    });
  }

  function markSelf(cid: string) {
    if (selfCid === cid) { setSelfCid(null); return; }
    setSelfCid(cid);
    setSelected((current) => (current.includes(cid) || current.length >= MAX_LISTINGS ? current : [...current, cid]));
  }

  function findListings() {
    setError('');
    startSearch(async () => {
      const response = await discoverListingsAction({ keyword, center, radiusKm, language, depth });
      setSearched(true);
      setDiscoveryCost(response.cost);
      if (response.error) { setError(response.error); return; }
      setCandidates((current) => {
        const manual = current.filter((c) => c.manual && !response.results.some((r) => r.cid === c.cid));
        return [...response.results, ...manual];
      });
      // Keep earlier picks that are still listed; pre-select nothing so the choice stays deliberate.
      setSelected((current) => current.filter((cid) => response.results.some((r) => r.cid === cid) || candidates.some((c) => c.manual && c.cid === cid)));
    });
  }

  async function goToAddress() {
    if (!addressQuery.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressQuery.trim())}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'en' }, referrerPolicy: 'strict-origin-when-cross-origin',
      });
      const found = await res.json() as Array<{ lat: string; lon: string }>;
      if (found[0]) setCenter(`${Number(found[0].lat).toFixed(6)},${Number(found[0].lon).toFixed(6)}`);
      else setError('Address not found. Click the map instead.');
    } catch {
      setError('Address search failed. Click the map instead.');
    }
  }

  async function searchByName() {
    const point = parseCenter(center);
    if (!nameQuery.trim() || !point) return;
    setNameSearching(true);
    try {
      const zoom = mapRef.current?.getZoom() ?? 12;
      const res = await fetch('/api/business-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: nameQuery.trim(), location_coordinate: `${point[0]},${point[1]},${zoom}`, language }),
      });
      const data = await res.json() as { results?: BusinessSearchResult[]; error?: string };
      setNameResults(data.results ?? []);
      if (!data.results?.length) setError(data.error ?? 'No listing found with that name.');
    } catch {
      setError('Listing search failed.');
    } finally {
      setNameSearching(false);
    }
  }

  function addManual(result: BusinessSearchResult) {
    const point = parseCenter(center);
    setCandidates((current) => current.some((c) => c.cid === result.cid) ? current : [...current, {
      cid: result.cid, placeId: null, title: result.title, address: result.address, category: result.category,
      lat: result.lat, lng: result.lng, rating: result.rating, totalReviews: result.reviews, mapsRank: 0,
      distanceKm: point ? Math.round(distanceKm(point[0], point[1], result.lat, result.lng) * 10) / 10 : 0,
      insideRadius: true, manual: true,
    }]);
    setSelected((current) => (current.includes(result.cid) || current.length >= MAX_LISTINGS ? current : [...current, result.cid]));
    setNameResults([]);
    setNameQuery('');
  }

  function start() {
    setError('');
    startCreate(async () => {
      const chosen = candidates.filter((c) => selected.includes(c.cid));
      const response = await createBenchmarkAction({
        name, keyword, center, radiusKm, areaLabel, language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        listings: chosen.map((c) => ({
          cid: c.cid, placeId: c.placeId, title: c.title, address: c.address, category: c.category, lat: c.lat, lng: c.lng,
          mapsRank: c.manual ? null : c.mapsRank, totalReviews: c.totalReviews, rating: c.rating, isSelf: c.cid === selfCid,
        })),
      });
      if (response.error || !response.id) { setError(response.error ?? 'Could not start the analysis.'); return; }
      router.push(`/dashboard/review-velocity?id=${response.id}`);
    });
  }

  const canSearch = hasCredentials && keyword.trim().length > 0 && parseCenter(center) !== null && !searching;
  const maxCost = estimateCost(selected.map(() => INITIAL_DEPTH));

  return (
    <div className="space-y-6">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />

      {/* Step 1 — market */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-black text-slate-900 dark:text-white">1 · Define the market</h2>
          <span className="text-[11px] text-slate-400">Click the map to set the centre</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-3">
            <label className={labelCls} htmlFor="rv-keyword">Keyword <span className="text-red-400">*</span></label>
            <input id="rv-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. plumber" className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSearch) { e.preventDefault(); findListings(); } }} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelCls} htmlFor="rv-name">Analysis name</label>
            <input id="rv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the keyword" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="rv-language">Language</label>
            <select id="rv-language" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="rv-radius">Radius</label>
            <select id="rv-radius" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className={inputCls}>
              {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="rv-depth">Google Maps results</label>
            <select id="rv-depth" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className={inputCls}>
              <option value={20}>Top 20</option>
              <option value={40}>Top 40</option>
              <option value={100}>Top 100</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <input value={addressQuery} onChange={(e) => setAddressQuery(e.target.value)} placeholder="Jump to a city or address…" className={inputCls}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goToAddress(); } }} />
          <button type="button" onClick={goToAddress} disabled={!addressQuery.trim()}
            className="px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 disabled:opacity-40" aria-label="Go to address">
            <MapPin className="w-4 h-4" />
          </button>
        </div>
        <div ref={containerRef} className="w-full h-[380px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 z-0" />
        <p className="text-[11px] text-slate-400 -mt-3">
          {parseCenter(center) ? <>Centre: <span className="font-semibold text-slate-600 dark:text-slate-300">{areaLabel ?? center}</span> · {radiusKm} km radius</> : 'No centre yet: click the map.'}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={findListings} disabled={!canSearch}
            className="inline-flex items-center gap-2 bg-slate-900 text-white font-black uppercase tracking-widest text-xs px-5 py-2.5 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-40">
            {searching ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {searching ? 'Searching Google Maps…' : searched ? 'Search again' : 'Find listings'}
          </button>
          <span className="text-[11px] text-slate-400">
            One Google Maps search{discoveryCost !== null ? ` · last one cost $${discoveryCost.toFixed(4)}` : ' (about $0.002)'}.
          </span>
        </div>
        {!hasCredentials && <p className="text-xs text-amber-600">Configure your DataForSEO credentials in Settings first.</p>}
      </section>

      {/* Step 2 — pick listings */}
      {(searched || candidates.length > 0) && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">2 · Pick up to {MAX_LISTINGS} listings</h2>
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              {outsideCount > 0 && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={showOutside} onChange={(e) => setShowOutside(e.target.checked)} className="accent-blue-600" />
                  Show {outsideCount} outside the circle
                </label>
              )}
              <span className={`tabular-nums font-bold ${full ? 'text-amber-600' : 'text-slate-500'}`}>{selected.length}/{MAX_LISTINGS} selected</span>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-400">No listing found in this circle. Widen the radius, show results outside the circle, or add a listing by name below.</p>
          ) : (
            <ul className="divide-y divide-slate-50 dark:divide-slate-800">
              {visible.map((c, index) => {
                const isSelected = selected.includes(c.cid);
                const isSelf = selfCid === c.cid;
                return (
                  <li key={c.cid} className={`flex items-center gap-3 px-6 py-3 ${isSelected ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''} ${!c.insideRadius && !c.manual ? 'opacity-60' : ''}`}>
                    <button type="button" onClick={() => toggle(c.cid)} disabled={!isSelected && full} aria-pressed={isSelected} aria-label={`Select ${c.title}`}
                      className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors disabled:opacity-30 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <span className="w-6 text-[11px] font-black text-slate-400 tabular-nums">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {c.title}
                        {c.manual && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Added</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {[c.category, c.address].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="hidden sm:block text-right text-[11px] text-slate-500 tabular-nums w-28">
                      {c.rating !== null ? <span className="font-bold text-slate-700 dark:text-slate-200">{c.rating.toFixed(1)}★</span> : '—'}
                      <span className="text-slate-400"> · {c.totalReviews ?? 0} reviews</span>
                    </div>
                    <div className="hidden md:block text-right text-[11px] text-slate-400 tabular-nums w-20">
                      {c.manual ? '' : `#${c.mapsRank} · `}{c.distanceKm} km
                    </div>
                    <button type="button" onClick={() => markSelf(c.cid)} disabled={!isSelected && full && !isSelf}
                      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border transition-colors disabled:opacity-30 ${isSelf ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-transparent text-slate-400 hover:text-amber-600'}`}>
                      <Star className={`w-3 h-3 ${isSelf ? 'fill-amber-400 text-amber-500' : ''}`} /> {isSelf ? 'My listing' : 'Mine?'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Missing a listing? Add it by name</p>
            <div className="flex gap-2">
              <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="Business name" className={inputCls}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchByName(); } }} />
              <button type="button" onClick={searchByName} disabled={!nameQuery.trim() || nameSearching || !parseCenter(center)}
                className="px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-slate-400 disabled:opacity-40">
                {nameSearching ? '…' : 'Find'}
              </button>
            </div>
            {nameResults.length > 0 && (
              <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {nameResults.map((r) => (
                  <li key={r.cid}>
                    <button type="button" onClick={() => addManual(r)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-950">
                      <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{r.title}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{[r.category, r.address].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {/* Step 3 — launch */}
      {selected.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 text-white rounded-2xl px-6 py-4">
          <div className="text-sm">
            <p className="font-black">{selected.length} listing{selected.length > 1 ? 's' : ''} · last 3 months</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Up to ${maxCost.toFixed(4)} for the first fetch (100 newest reviews each). Busy listings are refetched once automatically to cover 3 months.
              {!selfCid && ' Tip: mark your own listing to get targets.'}
            </p>
          </div>
          <button type="button" onClick={start} disabled={creating}
            className="inline-flex items-center gap-2 bg-white text-slate-900 font-black uppercase tracking-widest text-xs px-5 py-2.5 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50">
            {creating && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
            {creating ? 'Starting…' : 'Start analysis'}
          </button>
        </section>
      )}
    </div>
  );
}
