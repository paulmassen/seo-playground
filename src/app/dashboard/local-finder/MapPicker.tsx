'use client';

import { useEffect, useRef } from 'react';

interface Props {
  coordinate: string; // "lat,lng"
  onChange: (coord: string) => void;
}

export default function MapPicker({ coordinate, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Fix default icon paths broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const [defaultLat, defaultLng] = coordinate
        ? coordinate.split(',').map(Number)
        : [48.8566, 2.3522]; // Paris par défaut

      const map = L.map(containerRef.current!).setView([defaultLat, defaultLng], 12);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (coordinate) {
        const marker = L.marker([defaultLat, defaultLng]).addTo(map);
        markerRef.current = marker;
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
      });
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when coordinate changes externally (e.g. form reset)
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

  return (
    <>
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-slate-200"
        style={{ height: 260 }}
      />
    </>
  );
}
