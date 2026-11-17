// Shared by the server page and the client table (no 'use client' here).

export interface WhoisMetricsBlock {
  pos_1?: number; pos_2_3?: number; pos_4_10?: number; pos_11_20?: number; pos_21_30?: number;
  pos_31_40?: number; pos_41_50?: number; pos_51_60?: number; pos_61_70?: number; pos_71_80?: number;
  pos_81_90?: number; pos_91_100?: number;
  etv?: number; impressions_etv?: number; count?: number; estimated_paid_traffic_cost?: number;
}

export interface WhoisBacklinksInfo {
  referring_domains?: number;
  referring_main_domains?: number;
  referring_pages?: number;
  dofollow?: number;
  backlinks?: number;
  time_update?: string;
  /** Not returned by the API as of Nov 2026; kept for older saved results. */
  rank?: number;
  main_domain_rank?: number;
}

export interface WhoisResult {
  domain?: string;
  tld?: string;
  registered?: boolean;
  created_datetime?: string;
  changed_datetime?: string;
  expiration_datetime?: string;
  updated_datetime?: string;
  first_seen?: string;
  registrar?: string;
  epp_status_codes?: string[];
  nameservers?: string[];
  metrics?: { organic?: WhoisMetricsBlock; paid?: WhoisMetricsBlock };
  backlinks_info?: WhoisBacklinksInfo;
}

/**
 * whois/overview is billed like a premium database query. Measured on a real call (Nov 2026):
 * 3 items → $0.1236, i.e. $0.12 per task + $0.0012 per returned domain.
 */
export const WHOIS_PRICE_PER_TASK = 0.12;
export const WHOIS_PRICE_PER_ITEM = 0.0012;

export function whoisCost(items: number) {
  return WHOIS_PRICE_PER_TASK + WHOIS_PRICE_PER_ITEM * items;
}

export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr.replace(' +00:00', 'Z').replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export function parseApiDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(' +00:00', 'Z').replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(s?: string) {
  const d = parseApiDate(s);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export function ageYears(s?: string): number | null {
  const d = parseApiDate(s);
  return d ? (Date.now() - d.getTime()) / (365.25 * 86_400_000) : null;
}
