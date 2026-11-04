import tzLookup from '@photostructure/tz-lookup';

/** Resolve the map center to an IANA time zone, without silently accepting malformed coordinates. */
export function gridTimeZone(center: string): string | null {
  const parts = center.split(',');
  if (parts.length !== 2 || parts.some((part) => !part.trim())) return null;
  const [lat, lng] = parts.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  try {
    const zone = tzLookup(lat, lng);
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
    return zone;
  } catch {
    return null;
  }
}
