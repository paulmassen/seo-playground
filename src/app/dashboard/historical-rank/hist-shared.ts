// Shared by the server page and the client components (no 'use client' here).

export interface RankMetrics {
  count?: number;
  etv?: number;
  estimated_paid_traffic_cost?: number;
  pos_1?: number;
  pos_2_3?: number;
  pos_4_10?: number;
  pos_11_20?: number;
  pos_21_30?: number;
  pos_31_40?: number;
  pos_41_50?: number;
  pos_51_60?: number;
  pos_61_70?: number;
  pos_71_80?: number;
  pos_81_90?: number;
  pos_91_100?: number;
  is_new?: number;
  is_up?: number;
  is_down?: number;
  is_lost?: number;
}

export interface HistRankItem {
  se_type?: string;
  year: number;
  month: number;
  metrics: { organic?: RankMetrics; paid?: RankMetrics };
}

/** One domain's monthly series, oldest month first. */
export interface DomainSeries {
  target: string;
  items: HistRankItem[];
}

export const HISTORICAL_RANK_START = '2020-10-01';

/**
 * historical_rank_overview is billed far above standard Labs rates. Measured on real calls (Nov 2026):
 * 6 months → $0.1272, 72 months → $0.2064, i.e. $0.12 per task + $0.0012 per monthly item.
 */
export const HIST_PRICE_PER_TASK = 0.12;
export const HIST_PRICE_PER_MONTH = 0.0012;

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function histCost(from: string, to: string): number {
  return HIST_PRICE_PER_TASK + HIST_PRICE_PER_MONTH * monthsBetween(from, to);
}

export function top3(m?: RankMetrics) { return (m?.pos_1 ?? 0) + (m?.pos_2_3 ?? 0); }
export function top10(m?: RankMetrics) { return top3(m) + (m?.pos_4_10 ?? 0); }

export function monthKey(i: { year: number; month: number }) {
  return `${i.year}-${String(i.month).padStart(2, '0')}`;
}

export function formatMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function sortSeries(items: HistRankItem[]): HistRankItem[] {
  return [...items].sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

/** Percentage change, or null when the base is zero/missing. */
export function pctChange(from?: number, to?: number): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

export type TrendMetric = 'etv' | 'count' | 'top10' | 'top3' | 'value' | 'paid_etv' | 'paid_count';

export const TREND_METRICS: Array<{ key: TrendMetric; label: string; hint: string }> = [
  { key: 'etv', label: 'Organic traffic (ETV)', hint: 'Estimated organic visits per month.' },
  { key: 'count', label: 'Ranked keywords', hint: 'Keywords ranking in the organic top 100.' },
  { key: 'top10', label: 'Top 10 keywords', hint: 'Keywords on page one (positions 1–10).' },
  { key: 'top3', label: 'Top 3 keywords', hint: 'Keywords in positions 1–3.' },
  { key: 'value', label: 'Traffic value ($)', hint: 'What the organic traffic would cost in Google Ads.' },
  { key: 'paid_etv', label: 'Paid traffic (ETV)', hint: 'Estimated visits from Google Ads.' },
  { key: 'paid_count', label: 'Paid keywords', hint: 'Keywords the domain bids on in Google Ads.' },
];

export function metricValue(item: HistRankItem, metric: TrendMetric): number {
  const o = item.metrics.organic;
  const p = item.metrics.paid;
  switch (metric) {
    case 'etv': return o?.etv ?? 0;
    case 'count': return o?.count ?? 0;
    case 'top10': return top10(o);
    case 'top3': return top3(o);
    case 'value': return o?.estimated_paid_traffic_cost ?? 0;
    case 'paid_etv': return p?.etv ?? 0;
    case 'paid_count': return p?.count ?? 0;
  }
}
