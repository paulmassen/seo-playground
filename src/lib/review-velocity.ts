// Review Velocity — pure calendar, coverage and fetch-sizing helpers (no I/O).
//
// DataForSEO's Google Reviews API has no date filter and no offset: we always fetch the
// newest N reviews and cut at our own date. Everything here works on plain timestamps
// (ms UTC) and an IANA time zone, so weeks and months follow the user's calendar.

export const WINDOW_MONTHS = 3;
/** Complete ISO weeks shown in weekly charts (about three months). */
export const WINDOW_WEEKS = 13;
export const MAX_LISTINGS = 10;
export const INITIAL_DEPTH = 100;
export const MIN_REFRESH_DEPTH = 20;
export const MAX_DEPTH = 4490;
/** Standard queue price, billed per page of 10 reviews actually returned. */
export const PRICE_PER_10_REVIEWS = 0.00075;

const DAY_MS = 86_400_000;

// ─── Parsing ──────────────────────────────────────────────────────────────────

/** Parses DataForSEO's "yyyy-mm-dd hh:mm:ss +00:00" timestamps; null when missing or invalid. */
export function parseReviewTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(?:([+-])(\d{2}):?(\d{2})|Z)?$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!Number.isFinite(utc)) return null;
  const offset = sign ? (Number(oh) * 60 + Number(om)) * 60_000 * (sign === '-' ? -1 : 1) : 0;
  return utc - offset;
}

// ─── Time zone calendar ───────────────────────────────────────────────────────

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of an instant in a time zone. */
function zonedParts(instant: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second };
}

/** Offset (ms) of the time zone at an instant: local wall clock − UTC. */
function zoneOffset(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Days since 1970-01-01 of a calendar date (no time zone involved). */
export function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function dateOfDayNumber(n: number) {
  const date = new Date(n * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Local calendar day (day number) of an instant. */
export function localDayNumber(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return dayNumber(p.year, p.month, p.day);
}

/** Instant of local midnight at the start of a calendar day, DST-aware. */
export function startOfLocalDay(n: number, timeZone: string): number {
  const guess = n * DAY_MS;
  let instant = guess - zoneOffset(guess, timeZone);
  // A second pass settles days where the offset changes between the guess and the answer.
  instant = guess - zoneOffset(instant, timeZone);
  return instant;
}

/** Monday (day number) of the ISO week containing day n. */
export function isoWeekStart(n: number): number {
  return n - (((n + 3) % 7) + 7) % 7;
}

export function isoDateLabel(n: number): string {
  const { year, month, day } = dateOfDayNumber(n);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthStartDay(year: number, month: number): number {
  const normalized = new Date(Date.UTC(year, month - 1, 1));
  return dayNumber(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, 1);
}

// ─── Periods ──────────────────────────────────────────────────────────────────

export type Granularity = 'week' | 'month';

export interface Period {
  /** "2026-05-04" for a week (its Monday), "2026-05" for a month. */
  key: string;
  /** Short display label: "4 May" / "May 2026". */
  label: string;
  /** Inclusive start / exclusive end, ms UTC. */
  start: number;
  end: number;
  /** The current, not yet finished period. */
  current: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last `count` complete weeks plus the current one, oldest first. */
export function weekPeriods(now: number, timeZone: string, count = WINDOW_WEEKS): Period[] {
  const currentStart = isoWeekStart(localDayNumber(now, timeZone));
  const periods: Period[] = [];
  for (let i = count; i >= 0; i--) {
    const startDay = currentStart - i * 7;
    const { month, day } = dateOfDayNumber(startDay);
    periods.push({
      key: isoDateLabel(startDay),
      label: `${day} ${MONTHS[month - 1]}`,
      start: startOfLocalDay(startDay, timeZone),
      end: startOfLocalDay(startDay + 7, timeZone),
      current: i === 0,
    });
  }
  return periods;
}

/** The last `count` complete calendar months plus the current one, oldest first. */
export function monthPeriods(now: number, timeZone: string, count = WINDOW_MONTHS): Period[] {
  const today = dateOfDayNumber(localDayNumber(now, timeZone));
  const periods: Period[] = [];
  for (let i = count; i >= 0; i--) {
    const startDay = monthStartDay(today.year, today.month - i);
    const { year, month } = dateOfDayNumber(startDay);
    periods.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${MONTHS[month - 1]} ${year}`,
      start: startOfLocalDay(startDay, timeZone),
      end: startOfLocalDay(monthStartDay(year, month + 1), timeZone),
      current: i === 0,
    });
  }
  return periods;
}

/**
 * Oldest instant the analysis needs: the start of the 3rd complete month back, or of the
 * 13th complete week back when that is earlier (so both charts are fully covered).
 */
export function windowCutoff(now: number, timeZone: string): number {
  return Math.min(monthPeriods(now, timeZone)[0].start, weekPeriods(now, timeZone)[0].start);
}

/** Counts reviews per period; a period the data does not fully cover is null, never 0. */
export function countByPeriod(timestamps: number[], periods: Period[], coverage: Coverage): Array<number | null> {
  return periods.map((period) => {
    if (!isCovered(coverage, period.start)) return null;
    let count = 0;
    for (const ts of timestamps) if (ts >= period.start && ts < period.end) count++;
    return count;
  });
}

// ─── Coverage ─────────────────────────────────────────────────────────────────

/**
 * What the stored reviews reliably represent. `complete`: every review of the listing was
 * fetched. Otherwise reviews are continuous from `from` (the oldest trusted one) to now.
 */
export interface Coverage {
  complete: boolean;
  from: number | null;
}

/** A period starting at `start` is complete only when every review since `start` was fetched. */
export function isCovered(coverage: Coverage, start: number): boolean {
  if (coverage.complete) return true;
  return coverage.from !== null && start >= coverage.from;
}

export interface FetchOutcome {
  /** Timestamps of the reviews this fetch returned. */
  timestamps: number[];
  /** True when the API returned fewer reviews than requested: there is nothing older. */
  exhausted: boolean;
  /** When this fetch ran. */
  fetchedAt: number;
}

/**
 * Coverage after merging a fetch (newest-first) into what was already stored.
 * The two ranges join only when the new batch reaches back to the previous fetch time;
 * otherwise reviews published in between may be missing, so continuity restarts.
 */
export function mergeCoverage(previous: Coverage & { lastFetchAt: number | null }, fetch: FetchOutcome): Coverage {
  const oldest = fetch.timestamps.length > 0 ? Math.min(...fetch.timestamps) : null;
  const joins = previous.lastFetchAt !== null && (oldest === null || oldest <= previous.lastFetchAt);
  // Fewer reviews than requested: the batch holds every review the listing has.
  if (fetch.exhausted) return { complete: true, from: null };
  if (oldest === null) return { complete: previous.complete, from: previous.from };
  if (joins) {
    if (previous.complete) return { complete: true, from: null };
    return { complete: false, from: previous.from === null ? oldest : Math.min(previous.from, oldest) };
  }
  return { complete: false, from: oldest };
}

// ─── Fetch sizing ─────────────────────────────────────────────────────────────

export function roundUpToTen(value: number): number {
  return Math.ceil(value / 10) * 10;
}

export function clampDepth(depth: number, min = 10): number {
  return Math.min(MAX_DEPTH, Math.max(min, roundUpToTen(depth)));
}

/**
 * Depth for the single automatic relaunch when a first fetch did not reach the cutoff:
 * extrapolate the observed pace over the full window, plus a 20 % margin.
 */
export function relaunchDepth(fetchedCount: number, oldest: number, cutoff: number, now: number, previousDepth: number): number {
  const covered = Math.max(now - oldest, DAY_MS);
  const needed = fetchedCount * ((now - cutoff) / covered) * 1.2;
  return clampDepth(Math.max(needed, previousDepth * 2));
}

/** True when a fetch stopped before the cutoff and more reviews exist: the window is not covered. */
export function needsRelaunch(coverage: Coverage, cutoff: number): boolean {
  return !isCovered(coverage, cutoff);
}

/**
 * Depth for a manual or scheduled refresh: the reviews expected since the last fetch
 * (×1.5 margin, +10). Without a last fetch, or without continuity, fall back to a full backfill.
 */
export function refreshDepth(input: { lastFetchAt: number | null; reviewsInWindow: number; windowStart: number; now: number }): number {
  if (input.lastFetchAt === null) return INITIAL_DEPTH;
  const windowMs = Math.max(input.now - input.windowStart, DAY_MS);
  const perMs = input.reviewsInWindow / windowMs;
  const expected = perMs * Math.max(input.now - input.lastFetchAt, 0) * 1.5 + 10;
  return clampDepth(expected, MIN_REFRESH_DEPTH);
}

/** Upper-bound cost of fetching `depth` reviews (standard queue). */
export function estimateCost(depths: number[]): number {
  return depths.reduce((sum, depth) => sum + Math.ceil(depth / 10) * PRICE_PER_10_REVIEWS, 0);
}

// ─── Geometry (discovery circle) ──────────────────────────────────────────────

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Google Maps zoom whose ~1000 px viewport spans the circle's diameter. */
export function zoomForRadius(lat: number, radiusKm: number): number {
  const worldKm = 40_075 * Math.cos((lat * Math.PI) / 180);
  const zoom = Math.log2((worldKm * 1000) / (256 * Math.max(radiusKm, 0.2) * 2));
  return Math.min(18, Math.max(9, Math.floor(zoom)));
}

export function parseLatLng(value: string): { lat: number; lng: number } | null {
  const [latRaw, lngRaw] = value.split(',').map((part) => part.trim());
  const lat = Number(latRaw), lng = Number(lngRaw);
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
