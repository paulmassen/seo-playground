import { describe, expect, it } from 'vitest';
import {
  clampDepth, countByPeriod, distanceKm, estimateCost, isCovered, isoWeekStart, localDayNumber, dayNumber,
  mergeCoverage, monthPeriods, parseLatLng, parseReviewTimestamp, refreshDepth, relaunchDepth, startOfLocalDay,
  weekPeriods, windowCutoff, zoomForRadius, MAX_DEPTH, INITIAL_DEPTH,
} from './review-velocity';

const PARIS = 'Europe/Paris';
const DAY = 86_400_000;

describe('parseReviewTimestamp', () => {
  it('parses the DataForSEO format with an explicit offset', () => {
    expect(parseReviewTimestamp('2019-11-15 12:57:46 +00:00')).toBe(Date.UTC(2019, 10, 15, 12, 57, 46));
    expect(parseReviewTimestamp('2019-11-15 12:57:46 +02:00')).toBe(Date.UTC(2019, 10, 15, 10, 57, 46));
  });
  it('rejects missing or malformed values', () => {
    expect(parseReviewTimestamp(undefined)).toBeNull();
    expect(parseReviewTimestamp('')).toBeNull();
    expect(parseReviewTimestamp('3 months ago')).toBeNull();
  });
});

describe('calendar in a time zone', () => {
  it('finds the local day around midnight', () => {
    // 23:30 UTC on 31 Mar 2026 is already 1 Apr in Paris (UTC+2).
    expect(localDayNumber(Date.UTC(2026, 2, 31, 23, 30), PARIS)).toBe(dayNumber(2026, 4, 1));
    expect(localDayNumber(Date.UTC(2026, 2, 31, 23, 30), 'UTC')).toBe(dayNumber(2026, 3, 31));
  });

  it('computes local midnight across daylight-saving changes', () => {
    expect(startOfLocalDay(dayNumber(2026, 1, 15), PARIS)).toBe(Date.UTC(2026, 0, 14, 23));
    expect(startOfLocalDay(dayNumber(2026, 7, 15), PARIS)).toBe(Date.UTC(2026, 6, 14, 22));
    // DST starts on 29 Mar 2026 at 02:00: that day starts at UTC+1, the next at UTC+2.
    expect(startOfLocalDay(dayNumber(2026, 3, 29), PARIS)).toBe(Date.UTC(2026, 2, 28, 23));
    expect(startOfLocalDay(dayNumber(2026, 3, 30), PARIS)).toBe(Date.UTC(2026, 2, 29, 22));
  });

  it('starts ISO weeks on Monday, including across a new year', () => {
    expect(isoWeekStart(dayNumber(2026, 1, 1))).toBe(dayNumber(2025, 12, 29)); // Thursday → Monday before
    expect(isoWeekStart(dayNumber(2026, 1, 5))).toBe(dayNumber(2026, 1, 5)); // Monday
    expect(isoWeekStart(dayNumber(2026, 1, 11))).toBe(dayNumber(2026, 1, 5)); // Sunday
  });
});

describe('periods and window', () => {
  const now = Date.UTC(2026, 7, 15, 10); // Saturday 15 Aug 2026

  it('returns 13 complete weeks plus the current one, oldest first', () => {
    const weeks = weekPeriods(now, PARIS);
    expect(weeks).toHaveLength(14);
    expect(weeks[13].current).toBe(true);
    expect(weeks[13].key).toBe('2026-08-10');
    expect(weeks[0].key).toBe('2026-05-11');
    expect(weeks.slice(0, -1).every((w) => !w.current)).toBe(true);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i].start).toBe(weeks[i - 1].end);
  });

  it('returns 3 complete months plus the current one', () => {
    const months = monthPeriods(now, PARIS);
    expect(months.map((m) => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08']);
    expect(months[0].start).toBe(Date.UTC(2026, 3, 30, 22)); // 1 May 00:00 Paris
    expect(months[3].current).toBe(true);
  });

  it('handles month periods across a year boundary', () => {
    const months = monthPeriods(Date.UTC(2026, 1, 10), 'UTC');
    expect(months.map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('takes the earliest of the month and week windows as the cutoff', () => {
    const cutoff = windowCutoff(now, PARIS);
    expect(cutoff).toBe(Math.min(monthPeriods(now, PARIS)[0].start, weekPeriods(now, PARIS)[0].start));
    expect(cutoff).toBe(Date.UTC(2026, 3, 30, 22)); // 1 May is before Mon 11 May
  });
});

describe('coverage', () => {
  const weeks = weekPeriods(Date.UTC(2026, 7, 15, 10), 'UTC');

  it('never reports 0 for a period that was not fetched', () => {
    const from = weeks[10].start + DAY; // data only reaches into week 10
    const counts = countByPeriod([weeks[12].start + DAY, weeks[11].start + DAY], weeks, { complete: false, from });
    expect(counts.slice(0, 11).every((c) => c === null)).toBe(true);
    expect(counts[11]).toBe(1);
    expect(counts[12]).toBe(1);
    expect(counts[13]).toBe(0);
  });

  it('treats a complete history as covering every period', () => {
    expect(isCovered({ complete: true, from: null }, 0)).toBe(true);
    expect(countByPeriod([], weeks, { complete: true, from: null }).every((c) => c === 0)).toBe(true);
    expect(isCovered({ complete: false, from: null }, Date.now())).toBe(false);
  });

  it('is complete when the API returned fewer reviews than requested', () => {
    const result = mergeCoverage({ complete: false, from: null, lastFetchAt: null }, { timestamps: [1000, 2000], exhausted: true, fetchedAt: 3000 });
    expect(result).toEqual({ complete: true, from: null });
  });

  it('starts at the oldest review of a first, truncated fetch', () => {
    const result = mergeCoverage({ complete: false, from: null, lastFetchAt: null }, { timestamps: [5000, 4000, 3000], exhausted: false, fetchedAt: 6000 });
    expect(result).toEqual({ complete: false, from: 3000 });
  });

  it('extends coverage when a refresh reaches back to the previous fetch', () => {
    const result = mergeCoverage({ complete: false, from: 1000, lastFetchAt: 5000 }, { timestamps: [9000, 7000, 4500], exhausted: false, fetchedAt: 10_000 });
    expect(result).toEqual({ complete: false, from: 1000 });
    const kept = mergeCoverage({ complete: true, from: null, lastFetchAt: 5000 }, { timestamps: [9000, 4900], exhausted: false, fetchedAt: 10_000 });
    expect(kept).toEqual({ complete: true, from: null });
  });

  it('restarts coverage when a refresh leaves a gap', () => {
    const result = mergeCoverage({ complete: true, from: null, lastFetchAt: 5000 }, { timestamps: [9000, 8000, 7000], exhausted: false, fetchedAt: 10_000 });
    expect(result).toEqual({ complete: false, from: 7000 });
  });
});

describe('fetch sizing', () => {
  it('rounds depths to tens within the API limits', () => {
    expect(clampDepth(1)).toBe(10);
    expect(clampDepth(101)).toBe(110);
    expect(clampDepth(100_000)).toBe(MAX_DEPTH);
  });

  it('extrapolates the relaunch depth from the observed pace', () => {
    const now = 100 * DAY;
    // 100 reviews covered 20 days; the window is 90 days → 450 × 1.2 = 540.
    expect(relaunchDepth(100, now - 20 * DAY, now - 90 * DAY, now, 100)).toBe(540);
    // Never less than double the previous depth.
    expect(relaunchDepth(100, now - 80 * DAY, now - 90 * DAY, now, 100)).toBe(200);
  });

  it('sizes refreshes from the pace since the last fetch', () => {
    const now = 100 * DAY;
    expect(refreshDepth({ lastFetchAt: null, reviewsInWindow: 0, windowStart: 0, now })).toBe(INITIAL_DEPTH);
    // 90 reviews in 90 days, 7 days since last fetch → 7 × 1.5 + 10 = 20.5 → 30.
    expect(refreshDepth({ lastFetchAt: now - 7 * DAY, reviewsInWindow: 90, windowStart: now - 90 * DAY, now })).toBe(30);
    expect(refreshDepth({ lastFetchAt: now - DAY, reviewsInWindow: 0, windowStart: now - 90 * DAY, now })).toBe(20);
  });

  it('estimates the maximum cost per page of ten reviews', () => {
    expect(estimateCost([100, 100])).toBeCloseTo(0.015, 6);
    expect(estimateCost([25])).toBeCloseTo(0.00225, 6);
  });
});

describe('geometry', () => {
  it('measures distances and picks a zoom from the radius', () => {
    expect(distanceKm(48.8566, 2.3522, 45.764, 4.8357)).toBeGreaterThan(390);
    expect(distanceKm(48.8566, 2.3522, 45.764, 4.8357)).toBeLessThan(395);
    expect(zoomForRadius(45, 5)).toBe(13);
    expect(zoomForRadius(45, 50)).toBe(10);
    expect(zoomForRadius(45, 0.5)).toBe(16);
  });
  it('parses lat,lng pairs', () => {
    expect(parseLatLng('45.76, 4.83')).toEqual({ lat: 45.76, lng: 4.83 });
    expect(parseLatLng('100,4')).toBeNull();
    expect(parseLatLng('abc')).toBeNull();
  });
});
