import { describe, expect, it } from 'vitest';
import {
  buildComparisonReport, formatValue, normalize, rankColor, rankValues, weightedScore, CRITERIA,
  type ReportListing, type ReportReview,
} from './review-report';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 15, 10); // Saturday 15 Aug 2026
const TZ = 'UTC';

function review(daysAgo: number, overrides: Partial<ReportReview> = {}): ReportReview {
  return { publishedAt: NOW - daysAgo * DAY, rating: 5, textLength: 40, photoCount: 0, ownerAnswered: false, ownerRepliedAt: null, localGuide: false, ...overrides };
}

/** `perWeek` reviews every week for the last `weeks` weeks (Wednesday of each week). */
function steady(perWeek: number, weeks = 14, overrides: Partial<ReportReview> = {}): ReportReview[] {
  const out: ReportReview[] = [];
  for (let w = 0; w < weeks; w++) for (let i = 0; i < perWeek; i++) out.push(review(3 + w * 7 + i * 0.01, overrides));
  return out;
}

function listing(id: number, reviews: ReportReview[], overrides: Partial<ReportListing> = {}): ReportListing {
  return { id, title: `Listing ${id}`, isSelf: false, coverage: { complete: true, from: null }, googleRating: 4.5, googleTotal: 100, mapsRank: id, reviews, ...overrides };
}

describe('ranking primitives', () => {
  it('uses competition ranking with ties and respects the direction', () => {
    expect(rankValues([5, 3, 5, null, 1], 'up')).toEqual([1, 3, 1, null, 4]);
    expect(rankValues([5, 3, 5, null, 1], 'down')).toEqual([3, 2, 3, null, 1]);
  });

  it('normalises without dividing by zero', () => {
    expect(normalize([2, 4, 6], 'up')).toEqual([0, 50, 100]);
    expect(normalize([2, 4, 6], 'down')).toEqual([100, 50, 0]);
    expect(normalize([3, 3], 'up')).toEqual([100, 100]);
    expect(normalize([null, null], 'up')).toEqual([null, null]);
  });

  it('redistributes the weight of missing criteria', () => {
    expect(weightedScore({ perWeek4: 100, recentRating: 0 })).toBeCloseTo((100 * 25) / 45, 6);
    expect(weightedScore({ perWeek4: 80 })).toBe(80);
    expect(weightedScore({ perMonth: 100 })).toBeNull(); // unscored criterion only
  });

  it('has scored weights that sum to 100', () => {
    expect(CRITERIA.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it('formats values and colours ranks', () => {
    expect(formatValue('percent', null)).toBe('n/a');
    expect(formatValue('signedPercent', 12.4)).toBe('+12%');
    expect(formatValue('duration', 5 * 3_600_000)).toBe('5 h');
    expect(formatValue('duration', 3 * DAY)).toBe('3 d');
    expect(rankColor(1, 5)).toEqual([22, 163, 74]);
    expect(rankColor(5, 5)).toEqual([220, 38, 38]);
    expect(rankColor(1, 1)).toEqual([22, 163, 74]);
  });
});

describe('buildComparisonReport', () => {
  it('ranks the faster listing first on pace and computes weekly averages', () => {
    const report = buildComparisonReport({
      now: NOW, timeZone: TZ,
      listings: [listing(1, steady(1)), listing(2, steady(3)), listing(3, steady(2), { isSelf: true })],
    });
    const byId = new Map(report.listings.map((l) => [l.id, l]));
    expect(byId.get(2)!.metrics.perWeek4).toBe(3);
    expect(byId.get(2)!.ranks.perWeek4).toBe(1);
    expect(byId.get(3)!.ranks.perWeek4).toBe(2);
    expect(byId.get(1)!.ranks.perWeek4).toBe(3);
    expect(byId.get(1)!.metrics.regularity).toBe(100);
    expect(report.weeks).toHaveLength(14);
    expect(byId.get(2)!.weekly.slice(0, -1).every((c) => c === 3)).toBe(true);
    expect(report.selfId).toBe(3);
    expect(report.summary.targets[0]).toMatch(/\+1\.1 reviews per week to overtake Listing 2/);
  });

  it('does not penalise reviews too recent to have an answer yet', () => {
    const answeredOld = Array.from({ length: 6 }, (_, i) => review(10 + i, { ownerAnswered: true }));
    const fresh = Array.from({ length: 6 }, (_, i) => review(1 + i * 0.5));
    const report = buildComparisonReport({ now: NOW, timeZone: TZ, listings: [listing(1, [...answeredOld, ...fresh])] });
    expect(report.listings[0].metrics.replyRate).toBe(100);
  });

  it('returns n/a below the minimum sample and keeps the listing unpenalised', () => {
    const few = [review(10, { ownerAnswered: true }), review(12)];
    const report = buildComparisonReport({ now: NOW, timeZone: TZ, listings: [listing(1, few), listing(2, steady(1))] });
    const sparse = report.listings.find((l) => l.id === 1)!;
    expect(sparse.metrics.replyRate).toBeNull();
    expect(sparse.metrics.recentRating).toBeNull();
    expect(sparse.ranks.replyRate).toBeNull();
    expect(sparse.score).not.toBeNull();
  });

  it('computes negative-review reply rate, median reply time and shares', () => {
    const reviews = [
      ...Array.from({ length: 3 }, (_, i) => review(20 + i, { rating: 2, ownerAnswered: true, ownerRepliedAt: NOW - (20 + i) * DAY + 2 * 3_600_000 })),
      ...Array.from({ length: 3 }, (_, i) => review(30 + i, { rating: 5, ownerAnswered: true, ownerRepliedAt: NOW - (30 + i) * DAY + 4 * 3_600_000, photoCount: 1, localGuide: true })),
      ...Array.from({ length: 4 }, (_, i) => review(40 + i, { rating: 4, textLength: 0 })),
    ];
    const m = buildComparisonReport({ now: NOW, timeZone: TZ, listings: [listing(1, reviews, { googleRating: 4.0 })] }).listings[0].metrics;
    expect(m.negativeReplyRate).toBe(100);
    expect(m.negativeShare).toBe(30);
    expect(m.replyRate).toBe(60);
    expect(m.replyTime).toBe(3 * 3_600_000);
    expect(m.photoShare).toBe(30);
    expect(m.localGuideShare).toBe(30);
    expect(m.textShare).toBe(60);
    expect(m.recentRating).toBeCloseTo(3.7, 6);
    expect(m.ratingTrend).toBeCloseTo(-0.3, 6);
  });

  it('keeps partial listings but flags them and leaves uncovered periods null', () => {
    const report = buildComparisonReport({
      now: NOW, timeZone: TZ,
      listings: [listing(1, steady(30, 3), { coverage: { complete: false, from: NOW - 20 * DAY } })],
    });
    const result = report.listings[0];
    expect(result.partial).toBe(true);
    expect(result.weekly[0]).toBeNull();
    expect(result.metrics.perWeek4).toBeNull(); // the 4th week back is not fully covered
  });

  it('computes momentum and the share of new reviews', () => {
    // Week 0 is the current week; weeks 1–4 are the last 4 complete ones (2/week), weeks 5–8 the 4 before (1/week).
    const growing = Array.from({ length: 14 }, (_, w) => Array.from({ length: w <= 4 ? 2 : 1 }, (_, i) => review(3 + w * 7 + i * 0.01))).flat();
    const report = buildComparisonReport({ now: NOW, timeZone: TZ, listings: [listing(1, growing), listing(2, steady(1))] });
    const one = report.listings.find((l) => l.id === 1)!;
    expect(one.metrics.momentum).toBe(100);
    const shares = report.listings.map((l) => l.metrics.shareOfVoice as number);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('writes a market summary when no listing is marked as mine', () => {
    const report = buildComparisonReport({ now: NOW, timeZone: TZ, listings: [listing(1, steady(1)), listing(2, steady(2))] });
    expect(report.selfId).toBeNull();
    expect(report.summary.headline.join(' ')).toMatch(/Listing 2 gains the most reviews/);
    expect(report.kpis[0].label).toBe('Listings compared');
  });

  it('projects when the self listing catches up on total reviews', () => {
    const report = buildComparisonReport({
      now: NOW, timeZone: TZ,
      listings: [
        listing(1, steady(3), { isSelf: true, googleTotal: 100 }),
        listing(2, steady(1), { googleTotal: 160 }),
      ],
    });
    expect(report.summary.targets.join(' ')).toMatch(/overtake Listing 2's review count in about \d+ months/);
  });
});
