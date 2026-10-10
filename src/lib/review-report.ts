// Competitive review report — pure ranking of listings on several criteria (no I/O).
// The web view and the PDF export both render the object built here, so they cannot diverge.

import {
  countByPeriod, isCovered, monthPeriods, weekPeriods, windowCutoff,
  type Coverage, type Period,
} from './review-velocity';

const DAY_MS = 86_400_000;
/** Reviews younger than this are not counted against the reply rate: the owner may not have answered yet. */
export const REPLY_GRACE_MS = 7 * DAY_MS;
export const MIN_SAMPLE = 5;
export const MIN_NEGATIVE_SAMPLE = 3;

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface ReportReview {
  publishedAt: number;
  rating: number | null;
  textLength: number;
  photoCount: number;
  ownerAnswered: boolean;
  ownerRepliedAt: number | null;
  localGuide: boolean;
}

export interface ReportListing {
  id: number;
  title: string;
  address?: string | null;
  isSelf: boolean;
  coverage: Coverage;
  googleRating: number | null;
  googleTotal: number | null;
  mapsRank: number | null;
  reviews: ReportReview[];
}

// ─── Criteria ─────────────────────────────────────────────────────────────────

export type CriterionGroup = 'Momentum' | 'Satisfaction' | 'Engagement' | 'Richness' | 'Standing';
export type ValueFormat = 'rate1' | 'percent' | 'signedPercent' | 'days' | 'rating' | 'signedRating' | 'duration' | 'count' | 'position';

export type CriterionId =
  | 'perWeek4' | 'perMonth' | 'momentum' | 'regularity' | 'freshness' | 'shareOfVoice'
  | 'recentRating' | 'ratingTrend' | 'negativeShare'
  | 'replyRate' | 'negativeReplyRate' | 'replyTime'
  | 'textShare' | 'photoShare' | 'localGuideShare'
  | 'googleTotal' | 'mapsRank';

export interface Criterion {
  id: CriterionId;
  label: string;
  /** Column header in the rank matrix. */
  short: string;
  group: CriterionGroup;
  /** 'up': higher is better; 'down': lower is better. */
  direction: 'up' | 'down';
  format: ValueFormat;
  /** Share of the overall score; 0 = ranked and shown but not scored. */
  weight: number;
  description: string;
}

export const CRITERIA: Criterion[] = [
  { id: 'perWeek4', label: 'Reviews per week (last 4 weeks)', short: 'Per week', group: 'Momentum', direction: 'up', format: 'rate1', weight: 25, description: 'Average of the last 4 complete weeks.' },
  { id: 'perMonth', label: 'Reviews per month', short: 'Per month', group: 'Momentum', direction: 'up', format: 'rate1', weight: 0, description: 'Average of the last 3 complete months.' },
  { id: 'momentum', label: 'Momentum', short: 'Momentum', group: 'Momentum', direction: 'up', format: 'signedPercent', weight: 10, description: 'Last 4 complete weeks vs the 4 before.' },
  { id: 'regularity', label: 'Regularity', short: 'Regularity', group: 'Momentum', direction: 'up', format: 'percent', weight: 10, description: 'Share of the last 13 complete weeks with at least one review.' },
  { id: 'freshness', label: 'Days since last review', short: 'Last review', group: 'Momentum', direction: 'down', format: 'days', weight: 0, description: 'Days since the most recent review.' },
  { id: 'shareOfVoice', label: 'Share of new reviews', short: 'Share', group: 'Momentum', direction: 'up', format: 'percent', weight: 0, description: 'Share of all new reviews in this market over the period.' },
  { id: 'recentRating', label: 'Recent rating', short: 'Rating', group: 'Satisfaction', direction: 'up', format: 'rating', weight: 20, description: 'Average rating of the reviews of the period.' },
  { id: 'ratingTrend', label: 'Rating trend', short: 'Rating trend', group: 'Satisfaction', direction: 'up', format: 'signedRating', weight: 0, description: 'Recent rating minus the overall Google rating.' },
  { id: 'negativeShare', label: 'Negative reviews', short: 'Negative', group: 'Satisfaction', direction: 'down', format: 'percent', weight: 0, description: 'Share of reviews rated 3★ or less.' },
  { id: 'replyRate', label: 'Owner reply rate', short: 'Reply rate', group: 'Engagement', direction: 'up', format: 'percent', weight: 15, description: 'Share of reviews older than 7 days with an owner reply.' },
  { id: 'negativeReplyRate', label: 'Reply rate on negative reviews', short: 'Neg. replies', group: 'Engagement', direction: 'up', format: 'percent', weight: 10, description: 'Same, for reviews rated 3★ or less.' },
  { id: 'replyTime', label: 'Median reply time', short: 'Reply time', group: 'Engagement', direction: 'down', format: 'duration', weight: 0, description: 'Median delay between a review and the owner reply.' },
  { id: 'textShare', label: 'Reviews with text', short: 'With text', group: 'Richness', direction: 'up', format: 'percent', weight: 0, description: 'Share of reviews with a written comment.' },
  { id: 'photoShare', label: 'Reviews with photos', short: 'Photos', group: 'Richness', direction: 'up', format: 'percent', weight: 0, description: 'Share of reviews with at least one photo.' },
  { id: 'localGuideShare', label: 'Local Guides', short: 'Local Guides', group: 'Richness', direction: 'up', format: 'percent', weight: 0, description: 'Share of reviews written by Local Guides.' },
  { id: 'googleTotal', label: 'Total Google reviews', short: 'Total', group: 'Standing', direction: 'up', format: 'count', weight: 10, description: 'Review count shown by Google.' },
  { id: 'mapsRank', label: 'Google Maps position', short: 'Maps pos.', group: 'Standing', direction: 'down', format: 'position', weight: 0, description: 'Position in the Google Maps search used to find the listings.' },
];

export const CRITERION_GROUPS: CriterionGroup[] = ['Momentum', 'Satisfaction', 'Engagement', 'Richness', 'Standing'];

export function criterion(id: CriterionId): Criterion {
  return CRITERIA.find((c) => c.id === id)!;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export type Metrics = Record<CriterionId, number | null>;

export interface ListingResult {
  id: number;
  title: string;
  address: string | null;
  isSelf: boolean;
  googleRating: number | null;
  googleTotal: number | null;
  reviewsInPeriod: number;
  coverage: Coverage;
  /** The data does not reach back to the start of the period. */
  partial: boolean;
  metrics: Metrics;
  ranks: Record<CriterionId, number | null>;
  /** 0–100 weighted score; null when no scored criterion has a value. */
  score: number | null;
  overallRank: number | null;
  weekly: Array<number | null>;
  monthly: Array<number | null>;
}

export interface Kpi { label: string; value: string; detail?: string }

export interface ComparisonReport {
  generatedAt: number;
  timeZone: string;
  periodStart: number;
  periodEnd: number;
  criteria: Criterion[];
  /** Sorted by overall rank (unscored listings last). */
  listings: ListingResult[];
  weeks: Period[];
  months: Period[];
  selfId: number | null;
  kpis: Kpi[];
  summary: { headline: string[]; strengths: string[]; weaknesses: string[]; targets: string[] };
}

// ─── Statistics helpers ───────────────────────────────────────────────────────

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function share(part: number, total: number, min: number): number | null {
  return total >= min ? (part / total) * 100 : null;
}

/** Mean of the given trailing periods, only when every one of them is covered. */
function trailingMean(counts: Array<number | null>, count: number, skipFromEnd = 0): number | null {
  const slice = counts.slice(counts.length - skipFromEnd - count, counts.length - skipFromEnd);
  if (slice.length < count || slice.some((v) => v === null)) return null;
  return mean(slice as number[]);
}

// ─── Metrics per listing ──────────────────────────────────────────────────────

function computeMetrics(listing: ReportListing, weeks: Period[], months: Period[], cutoff: number, now: number) {
  const inPeriod = listing.reviews.filter((r) => r.publishedAt >= cutoff && r.publishedAt <= now);
  const timestamps = listing.reviews.map((r) => r.publishedAt);
  const weekly = countByPeriod(timestamps, weeks, listing.coverage);
  const monthly = countByPeriod(timestamps, months, listing.coverage);
  // Complete periods only: drop the current one (last entry).
  const completeWeeks = weekly.slice(0, -1);
  const completeMonths = monthly.slice(0, -1);

  const last4 = trailingMean(completeWeeks, 4);
  const prev4 = trailingMean(completeWeeks, 4, 4);
  const coveredMonths = completeMonths.filter((v): v is number => v !== null);
  const coveredWeeks = completeWeeks.filter((v): v is number => v !== null);

  const rated = inPeriod.filter((r) => r.rating !== null);
  const ratings = rated.map((r) => r.rating as number);
  const recentRating = ratings.length >= MIN_SAMPLE ? mean(ratings) : null;
  const negatives = rated.filter((r) => (r.rating as number) <= 3);

  const eligible = inPeriod.filter((r) => r.publishedAt <= now - REPLY_GRACE_MS);
  const eligibleNegatives = eligible.filter((r) => r.rating !== null && r.rating <= 3);
  const delays = inPeriod
    .filter((r) => r.ownerRepliedAt !== null && r.ownerRepliedAt >= r.publishedAt)
    .map((r) => (r.ownerRepliedAt as number) - r.publishedAt);

  const newest = timestamps.length ? Math.max(...timestamps) : null;

  const metrics: Metrics = {
    perWeek4: last4,
    perMonth: coveredMonths.length ? mean(coveredMonths) : null,
    momentum: last4 !== null && prev4 !== null && prev4 > 0 ? ((last4 - prev4) / prev4) * 100 : null,
    regularity: coveredWeeks.length >= 4 ? (coveredWeeks.filter((v) => v > 0).length / coveredWeeks.length) * 100 : null,
    freshness: newest !== null ? Math.max(0, Math.floor((now - newest) / DAY_MS)) : null,
    shareOfVoice: null, // needs every listing; filled in afterwards
    recentRating,
    ratingTrend: recentRating !== null && listing.googleRating !== null ? recentRating - listing.googleRating : null,
    negativeShare: share(negatives.length, rated.length, MIN_SAMPLE),
    replyRate: share(eligible.filter((r) => r.ownerAnswered).length, eligible.length, MIN_SAMPLE),
    negativeReplyRate: share(eligibleNegatives.filter((r) => r.ownerAnswered).length, eligibleNegatives.length, MIN_NEGATIVE_SAMPLE),
    replyTime: delays.length >= MIN_SAMPLE ? median(delays) : null,
    textShare: share(inPeriod.filter((r) => r.textLength > 0).length, inPeriod.length, MIN_SAMPLE),
    photoShare: share(inPeriod.filter((r) => r.photoCount > 0).length, inPeriod.length, MIN_SAMPLE),
    localGuideShare: share(inPeriod.filter((r) => r.localGuide).length, inPeriod.length, MIN_SAMPLE),
    googleTotal: listing.googleTotal,
    mapsRank: listing.mapsRank,
  };
  return { metrics, weekly, monthly, inPeriod };
}

// ─── Ranking & scoring ────────────────────────────────────────────────────────

/** Competition ranking (1, 2, 2, 4): rank = 1 + number of strictly better values. */
export function rankValues(values: Array<number | null>, direction: 'up' | 'down'): Array<number | null> {
  return values.map((value) => {
    if (value === null) return null;
    const better = values.filter((other) => other !== null && (direction === 'up' ? other > value : other < value)).length;
    return better + 1;
  });
}

/** Min-max score 0–100 in the criterion's direction; ties across the board score 100. */
export function normalize(values: Array<number | null>, direction: 'up' | 'down'): Array<number | null> {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return values.map(() => null);
  const min = Math.min(...present), max = Math.max(...present);
  return values.map((value) => {
    if (value === null) return null;
    if (max === min) return 100;
    const ratio = (value - min) / (max - min);
    return (direction === 'up' ? ratio : 1 - ratio) * 100;
  });
}

/** Weighted mean of the scored criteria a listing has values for; missing weights are redistributed. */
export function weightedScore(scores: Partial<Record<CriterionId, number | null>>): number | null {
  let total = 0, weights = 0;
  for (const c of CRITERIA) {
    const value = scores[c.id];
    if (c.weight <= 0 || value === null || value === undefined) continue;
    total += value * c.weight;
    weights += c.weight;
  }
  return weights > 0 ? total / weights : null;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatValue(format: ValueFormat, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  switch (format) {
    case 'rate1': return value.toFixed(1);
    case 'percent': return `${Math.round(value)}%`;
    case 'signedPercent': return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
    case 'days': return value === 0 ? 'today' : `${value} d`;
    case 'rating': return `${value.toFixed(2)}★`;
    case 'signedRating': return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
    case 'duration': {
      const hours = value / 3_600_000;
      return hours < 48 ? `${Math.max(1, Math.round(hours))} h` : `${Math.round(hours / 24)} d`;
    }
    case 'count': return Math.round(value).toLocaleString('en-US');
    case 'position': return `#${Math.round(value)}`;
  }
}

export function formatCriterion(id: CriterionId, value: number | null): string {
  return formatValue(criterion(id).format, value);
}

/** Green (1st) → amber → red (last). */
export function rankColor(rank: number, count: number): [number, number, number] {
  const green: [number, number, number] = [22, 163, 74];
  const amber: [number, number, number] = [245, 158, 11];
  const red: [number, number, number] = [220, 38, 38];
  if (count <= 1) return green;
  const t = Math.min(1, Math.max(0, (rank - 1) / (count - 1)));
  const [from, to, local] = t < 0.5 ? [green, amber, t * 2] : [amber, red, (t - 0.5) * 2];
  return from.map((c, i) => Math.round(c + (to[i] - c) * local)) as [number, number, number];
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export function buildComparisonReport(input: { listings: ReportListing[]; now: number; timeZone: string }): ComparisonReport {
  const { now, timeZone } = input;
  const weeks = weekPeriods(now, timeZone);
  const months = monthPeriods(now, timeZone);
  const cutoff = windowCutoff(now, timeZone);

  const computed = input.listings.map((listing) => ({ listing, ...computeMetrics(listing, weeks, months, cutoff, now) }));

  // Share of new reviews needs the market total.
  const marketTotal = computed.reduce((sum, c) => sum + c.inPeriod.length, 0);
  for (const c of computed) c.metrics.shareOfVoice = marketTotal > 0 ? (c.inPeriod.length / marketTotal) * 100 : null;

  const ranks = new Map<number, Record<CriterionId, number | null>>();
  const scores = new Map<number, Partial<Record<CriterionId, number | null>>>();
  for (const c of computed) { ranks.set(c.listing.id, {} as Record<CriterionId, number | null>); scores.set(c.listing.id, {}); }
  for (const crit of CRITERIA) {
    const values = computed.map((c) => c.metrics[crit.id]);
    const r = rankValues(values, crit.direction);
    const s = normalize(values, crit.direction);
    computed.forEach((c, i) => { ranks.get(c.listing.id)![crit.id] = r[i]; scores.get(c.listing.id)![crit.id] = s[i]; });
  }

  const overall = computed.map((c) => weightedScore(scores.get(c.listing.id)!));
  const overallRanks = rankValues(overall, 'up');

  const listings: ListingResult[] = computed.map((c, i) => ({
    id: c.listing.id,
    title: c.listing.title,
    address: c.listing.address ?? null,
    isSelf: c.listing.isSelf,
    googleRating: c.listing.googleRating,
    googleTotal: c.listing.googleTotal,
    reviewsInPeriod: c.inPeriod.length,
    coverage: c.listing.coverage,
    partial: !isCovered(c.listing.coverage, cutoff),
    metrics: c.metrics,
    ranks: ranks.get(c.listing.id)!,
    score: overall[i],
    overallRank: overallRanks[i],
    weekly: c.weekly,
    monthly: c.monthly,
  })).sort((a, b) => (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity) || a.title.localeCompare(b.title));

  const self = listings.find((l) => l.isSelf) ?? null;
  return {
    generatedAt: now,
    timeZone,
    periodStart: cutoff,
    periodEnd: now,
    criteria: CRITERIA,
    listings,
    weeks,
    months,
    selfId: self?.id ?? null,
    kpis: buildKpis(listings, self),
    summary: buildSummary(listings, self, computed.find((c) => c.listing.isSelf)?.inPeriod ?? [], now),
  };
}

function bestFor(listings: ListingResult[], id: CriterionId): ListingResult | null {
  return listings.filter((l) => l.ranks[id] === 1).sort((a, b) => a.title.localeCompare(b.title))[0] ?? null;
}

function marketMedian(listings: ListingResult[], id: CriterionId): number | null {
  return median(listings.map((l) => l.metrics[id]).filter((v): v is number => v !== null));
}

function buildKpis(listings: ListingResult[], self: ListingResult | null): Kpi[] {
  const leader = bestFor(listings, 'perWeek4');
  const leaderPace = leader?.metrics.perWeek4 ?? null;
  if (self) {
    return [
      { label: 'Overall rank', value: self.overallRank ? `#${self.overallRank} of ${listings.length}` : 'n/a', detail: self.score !== null ? `Score ${Math.round(self.score)}/100` : undefined },
      { label: 'Reviews per week', value: formatCriterion('perWeek4', self.metrics.perWeek4), detail: leader && leader.id !== self.id ? `Leader: ${formatCriterion('perWeek4', leaderPace)} (${leader.title})` : 'Market leader' },
      { label: 'Owner reply rate', value: formatCriterion('replyRate', self.metrics.replyRate), detail: `Market median: ${formatCriterion('replyRate', marketMedian(listings, 'replyRate'))}` },
      { label: 'Recent rating', value: formatCriterion('recentRating', self.metrics.recentRating), detail: `Market median: ${formatCriterion('recentRating', marketMedian(listings, 'recentRating'))}` },
    ];
  }
  return [
    { label: 'Listings compared', value: String(listings.length) },
    { label: 'Fastest pace', value: formatCriterion('perWeek4', leaderPace), detail: leader ? `${leader.title} · per week` : undefined },
    { label: 'Median pace', value: formatCriterion('perWeek4', marketMedian(listings, 'perWeek4')), detail: 'Reviews per week' },
    { label: 'Median reply rate', value: formatCriterion('replyRate', marketMedian(listings, 'replyRate')) },
  ];
}

function buildSummary(listings: ListingResult[], self: ListingResult | null, selfReviews: ReportReview[], now: number): ComparisonReport['summary'] {
  const n = listings.length;
  const headline: string[] = [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const targets: string[] = [];

  const leader = bestFor(listings, 'perWeek4');
  if (!self) {
    if (leader) headline.push(`${leader.title} gains the most reviews: ${formatCriterion('perWeek4', leader.metrics.perWeek4)} per week over the last 4 weeks.`);
    const top = listings[0];
    if (top?.overallRank === 1) headline.push(`${top.title} leads the overall ranking with a score of ${Math.round(top.score ?? 0)}/100.`);
    headline.push('Mark one listing as "My listing" to get a personalised comparison and targets.');
    return { headline, strengths, weaknesses, targets };
  }

  if (self.overallRank) headline.push(`You rank ${ordinal(self.overallRank)} of ${n} overall, with a score of ${Math.round(self.score ?? 0)}/100.`);
  const paceRank = self.ranks.perWeek4;
  if (paceRank) {
    headline.push(paceRank === 1
      ? `You gain reviews faster than every competitor: ${formatCriterion('perWeek4', self.metrics.perWeek4)} per week.`
      : `You are ${ordinal(paceRank)} on review pace: ${formatCriterion('perWeek4', self.metrics.perWeek4)} per week vs ${formatCriterion('perWeek4', leader?.metrics.perWeek4 ?? null)} for ${leader?.title}.`);
  }
  const replyRank = self.ranks.replyRate;
  if (replyRank) headline.push(`You are ${ordinal(replyRank)} on owner replies (${formatCriterion('replyRate', self.metrics.replyRate)} of reviews answered).`);

  // Strengths and weaknesses: top / bottom third of the field on each ranked criterion.
  // Scored criteria first (heaviest weight first), so a short list keeps what matters most.
  const band = Math.max(1, Math.floor(n / 3));
  if (n >= 2) {
    const byWeight = [...CRITERIA].sort((a, b) => b.weight - a.weight);
    for (const crit of byWeight) {
      const rank = self.ranks[crit.id];
      if (rank === null) continue;
      const entry = `${crit.label} (${ordinal(rank)}, ${formatCriterion(crit.id, self.metrics[crit.id])})`;
      if (rank <= band) strengths.push(entry);
      else if (rank > n - band) weaknesses.push(entry);
    }
  }

  // Pace targets.
  const pace = self.metrics.perWeek4;
  const paces = listings.map((l) => l.metrics.perWeek4).filter((v): v is number => v !== null).sort((a, b) => b - a);
  if (pace !== null && paceRank !== null && paceRank > 1 && leader) {
    targets.push(`+${(paces[0] - pace + 0.1).toFixed(1)} reviews per week to overtake ${leader.title} and lead on pace.`);
    if (paceRank > 3 && paces.length >= 3) targets.push(`+${(paces[2] - pace + 0.1).toFixed(1)} reviews per week to enter the top 3.`);
  }

  // Unanswered negative reviews.
  const unanswered = selfReviews.filter((r) => r.rating !== null && r.rating <= 3 && !r.ownerAnswered && r.publishedAt <= now - REPLY_GRACE_MS).length;
  if (unanswered > 0) targets.push(`${plural(unanswered, 'negative review')} from the period still ${unanswered === 1 ? 'has' : 'have'} no owner reply.`);

  const bestReply = bestFor(listings, 'replyRate');
  if (bestReply && bestReply.id !== self.id && self.metrics.replyRate !== null) {
    targets.push(`Reply rate: ${formatCriterion('replyRate', self.metrics.replyRate)} vs ${formatCriterion('replyRate', bestReply.metrics.replyRate)} for ${bestReply.title}.`);
  }

  // Catch-up on total reviews, at the current monthly pace.
  const selfTotal = self.googleTotal, selfMonth = self.metrics.perMonth;
  if (selfTotal !== null && selfMonth !== null) {
    const above = listings
      .filter((l) => l.id !== self.id && l.googleTotal !== null && l.googleTotal > selfTotal && l.metrics.perMonth !== null)
      .sort((a, b) => (a.googleTotal as number) - (b.googleTotal as number))[0];
    if (above) {
      const gap = (above.googleTotal as number) - selfTotal;
      const gain = selfMonth - (above.metrics.perMonth as number);
      targets.push(gain > 0
        ? `At the current pace you overtake ${above.title}'s review count in about ${Math.ceil(gap / gain)} months (gap: ${gap}).`
        : `${above.title} has ${gap} more reviews and gains ${(-gain).toFixed(1)} more per month: the gap keeps growing.`);
    }
    const chaser = listings
      .filter((l) => l.id !== self.id && l.googleTotal !== null && l.googleTotal <= selfTotal && l.metrics.perMonth !== null && (l.metrics.perMonth as number) > selfMonth)
      .sort((a, b) => (b.googleTotal as number) - (a.googleTotal as number))[0];
    if (chaser) {
      const gap = selfTotal - (chaser.googleTotal as number);
      const gain = (chaser.metrics.perMonth as number) - selfMonth;
      targets.push(`${chaser.title} is catching up: at its pace it overtakes your review count in about ${Math.max(1, Math.ceil(gap / gain))} months.`);
    }
  }

  return { headline, strengths, weaknesses, targets };
}

// ─── Series colours (shared by the web charts and the PDF) ───────────────────

export const SELF_COLOR: [number, number, number] = [37, 99, 235];
const PALETTE: Array<[number, number, number]> = [
  [249, 115, 22], [16, 185, 129], [139, 92, 246], [236, 72, 153], [234, 179, 8],
  [146, 64, 14], [100, 116, 139], [244, 63, 94], [132, 204, 22], [14, 165, 233],
];

/** "My listing" is always blue; competitors get distinct colours in report order. */
export function seriesColors(listings: Array<{ id: number; isSelf: boolean }>): Map<number, [number, number, number]> {
  const colors = new Map<number, [number, number, number]>();
  let next = 0;
  for (const listing of listings) colors.set(listing.id, listing.isSelf ? SELF_COLOR : PALETTE[next++ % PALETTE.length]);
  return colors;
}

export function rgbCss([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}
