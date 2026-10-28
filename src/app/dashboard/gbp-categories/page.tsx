import { withProjectScope } from '@/lib/db';
import {
  getCredentials, getSetting, getCategoryAuditHistory, getCategoryAuditEntry, getCategoryAuditItems, saveCategoryAudit,
  type CategoryAuditEntry,
} from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { LANGUAGES } from '@/lib/geo-options';
import { parseLatLng, zoomForRadius } from '@/lib/review-velocity';
import {
  buildCategoryAudit, isGenericCategory, listingCategories, normalizeMapsListings, parseAuditTarget,
  DEFAULT_LEADER_COUNT, DEFAULT_RADIUS_KM, LEADER_COUNTS, MAX_ADDITIONAL_CATEGORIES, RADIUS_OPTIONS_KM,
  type AuditListing, type AuditTarget, type CategoryAudit, type CategorySuggestion, type MapsSearchItem,
} from '@/lib/category-audit';
import ExportCSVButton from '@/components/ExportCSVButton';
import CategoryAuditForm from './CategoryAuditForm';

export const dynamic = 'force-dynamic';

interface SearchParams {
  keyword?: string;
  center?: string;
  language?: string;
  radius_km?: string;
  depth?: string;
  leaders?: string;
  target_cid?: string;
  target_title?: string;
  target_primary?: string;
  target_additional?: string;
  history_id?: string;
}

const DEPTHS = [20, 40, 100];
const PATH = '/dashboard/gbp-categories';

function pickNumber(value: string | undefined, allowed: readonly number[], fallback: number): number {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
}

function areaLabel(lat: number, lng: number, radiusKm: number) {
  return `${radiusKm} km around ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

async function fetchMapsListings(
  input: { keyword: string; lat: number; lng: number; radiusKm: number; language: string; depth: number },
  creds: { login: string; pass: string },
): Promise<{ items: AuditListing[]; cost?: number; error?: string }> {
  const zoom = zoomForRadius(input.lat, input.radiusKm);
  const { result, cost, error } = await callDataForSeoFirst<{ items?: MapsSearchItem[] | null }>(
    'serp/google/maps/live/advanced',
    {
      keyword: input.keyword,
      location_coordinate: `${input.lat.toFixed(7)},${input.lng.toFixed(7)},${zoom}z`,
      language_name: input.language,
      depth: input.depth,
    },
    creds,
    60_000,
  );
  if (error) return { items: [], cost, error };
  return { items: normalizeMapsListings(result?.items), cost };
}

function auditHref(base: Record<string, string>, overrides: Record<string, string | null>) {
  const params = new URLSearchParams(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) params.delete(key); else params.set(key, value);
  }
  return `${PATH}?${params.toString()}#results`;
}

function targetParams(target: AuditTarget | AuditListing | null): Record<string, string | null> {
  // An empty target_cid explicitly clears the comparison saved with the audit.
  if (!target) return { target_cid: '', target_title: null, target_primary: null, target_additional: null };
  return {
    target_cid: target.cid,
    target_title: target.title,
    target_primary: target.primary ?? '',
    target_additional: target.additional.join('|'),
  };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function fmt(value: number | null, digits = 0) {
  return value === null ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden';
const cardHead = 'px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2';
const h2 = 'text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';

function Badge({ label, primary, highlight }: { label: string; primary?: boolean; highlight?: 'missing' | 'shared' }) {
  const tone = primary
    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
    : highlight === 'missing'
      ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

const KIND_META: Record<CategorySuggestion['kind'], { title: string; hint: string; tone: string }> = {
  add: { title: 'Add', hint: 'Widely used by the leaders and missing from your profile.', tone: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' },
  consider: { title: 'Consider', hint: 'Used by some leaders. Only if you really offer the service.', tone: 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30' },
  keep: { title: 'Already in place', hint: 'Yours, and used by competitors too.', tone: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40' },
  uncommon: { title: 'Unusual here', hint: 'Yours, but no competitor in these results uses it.', tone: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900' },
};

function Recommendations({ audit }: { audit: CategoryAudit }) {
  const { primary, target, suggestedSet, leaders } = audit;
  return (
    <div className={card}>
      <div className={cardHead}>
        <h2 className={h2}>Recommendations</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">Based on the top {leaders} of {audit.total} listings</span>
      </div>
      <div className="p-6 space-y-6">
        {primary && (
          <div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Primary category</p>
            <div className="flex flex-wrap items-center gap-3">
              <Badge label={primary.label} primary />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Primary for {primary.leaderCount} of the top {leaders} ({primary.count} of {audit.total} overall).
              </span>
            </div>
            {target && primary.matchesTarget === false && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Your primary is <strong>{target.primary ?? 'not set'}</strong>.
                {primary.targetUsesAsAdditional
                  ? ` You already have “${primary.label}” as an additional category: making it your primary is the most direct test, if it describes your core business.`
                  : ` If “${primary.label}” describes your core business, consider making it your primary: it is the strongest category signal.`}
              </p>
            )}
            {target && primary.matchesTarget === true && (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">Your primary already matches. ✓</p>
            )}
          </div>
        )}

        {target ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(['add', 'consider', 'keep', 'uncommon'] as const).map((kind) => {
              const items = audit.suggestions.filter((s) => s.kind === kind);
              if (!items.length) return null;
              const meta = KIND_META[kind];
              return (
                <div key={kind} className={`rounded-xl border p-4 ${meta.tone}`}>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{meta.title} <span className="font-normal text-slate-500">· {items.length}</span></p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{meta.hint}</p>
                  <ul className="space-y-2">
                    {items.map((s) => (
                      <li key={s.stat.label}>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.stat.label}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{s.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Suggested additional categories</p>
            {suggestedSet.length ? (
              <ol className="space-y-1.5">
                {suggestedSet.map((stat, i) => (
                  <li key={stat.label} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="w-5 text-right text-xs font-black text-slate-400">{i + 1}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{stat.label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {stat.leaderCount}/{leaders} leaders · {stat.count}/{audit.total} overall
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">No additional category is shared by enough listings to recommend one.</p>
            )}
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Pick your listing with “Compare” in the table below to see what you are missing.
            </p>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
          Google limits a profile to 1 primary + {MAX_ADDITIONAL_CATEGORIES} additional categories and requires them to describe the business.
          These are leads to validate, not a list to copy: a category being common among the leaders does not prove it is why they rank.
        </p>
      </div>
    </div>
  );
}

function GapCheckPanel({ audit }: { audit: CategoryAudit }) {
  const { gap, target } = audit;
  if (!gap || !target || gap.benchmarkSize === 0) return null;
  const rows: Array<[string, string, string]> = [
    ['Rank in these results', target.rank ? `#${target.rank}` : 'Not in results', '#1–3'],
    ['Rating', fmt(gap.targetRating, 1), fmt(gap.avgRating, 1)],
    ['Reviews', fmt(gap.targetReviews), `${fmt(gap.avgReviews)} avg · ${fmt(gap.maxReviews)} max`],
    ['Categories', String(gap.targetCategories), fmt(gap.avgCategories, 1)],
  ];
  return (
    <div className={card}>
      <div className={cardHead}>
        <h2 className={h2}>{target.title} vs. top {gap.benchmarkSize}</h2>
      </div>
      <div className="p-6 grid gap-6 lg:grid-cols-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
              <th className="pb-2 font-bold" />
              <th className="pb-2 font-bold">You</th>
              <th className="pb-2 font-bold">Top {gap.benchmarkSize}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(([label, mine, theirs]) => (
              <tr key={label}>
                <td className="py-2 text-slate-600 dark:text-slate-400">{label}</td>
                <td className="py-2 font-bold tabular-nums text-slate-900 dark:text-white">{mine}</td>
                <td className="py-2 tabular-nums text-slate-700 dark:text-slate-300">{theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Shared by the top {gap.benchmarkSize}, missing from yours</p>
          {gap.missingFromTop.length ? (
            <div className="flex flex-wrap gap-1.5">{gap.missingFromTop.map((label) => <Badge key={label} label={label} highlight="missing" />)}</div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">Nothing: you already cover the categories they share.</p>
          )}
          {target.rank === null && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Your listing is not in these results, so rating and reviews are unknown and its categories come from the business search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

async function GbpCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const creds = getCredentials();
  const defaultLanguage = getSetting('default_language') ?? 'English';
  const defaultCoordinates = getSetting('default_coordinates') ?? '';

  let entry: CategoryAuditEntry | null = null;
  let listings: AuditListing[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let fromHistory = false;

  if (params.history_id) {
    entry = getCategoryAuditEntry(params.history_id);
    const saved = entry ? getCategoryAuditItems<AuditListing>(entry.id) : null;
    if (entry && saved) {
      listings = saved;
      fromHistory = true;
    } else {
      error = 'Audit not found.';
      entry = null;
    }
  }

  // Search params of the audit; leaders and target may be changed for free on a saved audit.
  const base = entry?.params ?? {};
  const keyword = (entry?.keyword ?? params.keyword ?? '').trim();
  const centerRaw = (base.center ?? params.center ?? '').trim();
  const language = LANGUAGES.find((l) => l.value === (base.language ?? params.language))?.value ?? defaultLanguage;
  const radiusKm = pickNumber(base.radius_km ?? params.radius_km, RADIUS_OPTIONS_KM, DEFAULT_RADIUS_KM);
  const depth = pickNumber(base.depth ?? params.depth, DEPTHS, 100);
  const leaders = pickNumber(params.leaders ?? base.leaders, LEADER_COUNTS, DEFAULT_LEADER_COUNT);
  const hasTargetParam = params.target_cid !== undefined;
  const target = parseAuditTarget(hasTargetParam ? params : base);

  if (!entry && keyword && !error) {
    const center = parseLatLng(centerRaw);
    if (!creds) error = 'DataForSEO credentials missing. Configure them in Settings.';
    else if (!center) error = 'Pick the area center on the map (or type lat,lng).';
    else {
      const id = stableSearchId(['gbp-categories', keyword, center.lat.toFixed(5), center.lng.toFixed(5), radiusKm, language, depth]);
      const existing = getCategoryAuditEntry(id);
      const existingItems = existing ? getCategoryAuditItems<AuditListing>(id) : null;
      if (existing && existingItems) {
        entry = existing;
        listings = existingItems;
        fromHistory = true;
      } else {
        const result = await fetchMapsListings({ keyword, ...center, radiusKm, language, depth }, creds);
        listings = result.items;
        cost = result.cost;
        error = result.error ?? null;
        if (!error) {
          entry = {
            id, ts: Date.now(), keyword, area: areaLabel(center.lat, center.lng, radiusKm), count: listings.length, cost,
            params: Object.fromEntries(Object.entries({
              keyword, center: centerRaw, language, radius_km: String(radiusKm), depth: String(depth), leaders: String(leaders),
              ...(target ? targetParams(target) : {}),
            }).filter((pair): pair is [string, string] => typeof pair[1] === 'string')),
          };
          saveCategoryAudit(entry, listings);
        }
      }
    }
  }

  const audit = entry && listings.length ? buildCategoryAudit(listings, { leaderCount: leaders, target }) : null;
  const linkBase: Record<string, string> = entry
    ? { history_id: entry.id, leaders: String(leaders), ...Object.fromEntries(Object.entries(targetParams(target)).filter((p): p is [string, string] => p[1] !== null)) }
    : {};
  const targetKeys = new Set(target ? listingCategories(audit?.target ?? target).map((l) => l.toLocaleLowerCase()) : []);
  const history = getCategoryAuditHistory();

  const formDefaults = {
    keyword,
    center: centerRaw || defaultCoordinates,
    language,
    radiusKm: String(radiusKm),
    depth: String(depth),
    leaders: String(leaders),
    target: target ? { cid: target.cid, title: target.title, primary: target.primary ?? '', additional: target.additional.join('|') } : null,
  };
  const fileStem = `gbp-categories-${keyword.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'audit'}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">GBP Category Audit</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Primary and additional Google Business Profile categories of every listing ranking on Google Maps for a keyword, with the ones to use.
        </p>
      </div>

      <CategoryAuditForm key={entry?.id ?? 'new'} defaults={formDefaults} />

      {error && <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {entry && !error && (
        <div id="results" className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-200">{entry.keyword}</span>
            <span>{entry.area}</span>
            <span>{listings.length} listings</span>
            {fromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">Saved {formatDate(entry.ts)}</span>}
            {(cost ?? entry.cost) !== undefined && <span className="font-mono">cost: ${(cost ?? entry.cost)!.toFixed(4)}</span>}
            <span className="flex items-center gap-1">
              Leaders:
              {LEADER_COUNTS.map((n) => (
                <a key={n} href={auditHref(linkBase, { leaders: String(n) })}
                  className={`rounded-md px-1.5 py-0.5 font-bold ${n === leaders ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {n}
                </a>
              ))}
            </span>
            {target && <a href={auditHref(linkBase, targetParams(null))} className="font-bold hover:text-red-700">Remove comparison</a>}
          </div>

          {!audit ? (
            <div className={`${card} px-6 py-12 text-center text-sm text-slate-500`}>No Google Maps listing found for this search.</div>
          ) : (
            <>
              <Recommendations audit={audit} />
              <GapCheckPanel audit={audit} />

              <div className={card}>
                <div className={cardHead}>
                  <h2 className={h2}>Categories · {audit.stats.length}</h2>
                  <ExportCSVButton
                    filename={`${fileStem}-categories.csv`}
                    columns={[
                      { key: 'label', label: 'Category' }, { key: 'id', label: 'Category ID' },
                      { key: 'count', label: 'Listings' }, { key: 'primaryCount', label: 'As primary' }, { key: 'additionalCount', label: 'As additional' },
                      { key: 'leaderCount', label: `In top ${audit.leaders}` }, { key: 'bestRank', label: 'Best rank' }, { key: 'avgRank', label: 'Average rank' },
                    ]}
                    data={audit.stats.map((s) => ({ ...s, id: s.id ?? '', avgRank: s.avgRank.toFixed(1) }))}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-6 py-2.5 font-bold">Category</th>
                        <th className="px-3 py-2.5 font-bold">Top {audit.leaders}</th>
                        <th className="px-3 py-2.5 font-bold">All {audit.total}</th>
                        <th className="px-3 py-2.5 font-bold">Primary / additional</th>
                        <th className="px-3 py-2.5 font-bold">Best rank</th>
                        {target && <th className="px-3 py-2.5 font-bold">Yours</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {audit.stats.map((s) => (
                        <tr key={s.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-2.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{s.label}</span>
                            {isGenericCategory(s.label) && <span className="ml-2 text-[10px] text-slate-500" title="A Google place type shown on Maps, not a category you can select in your profile">generic type, not selectable</span>}
                            {s.id && <span className="ml-2 font-mono text-[10px] text-slate-400">{s.id}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: pct(s.leaderShare) }} />
                              </div>
                              <span className="tabular-nums text-xs text-slate-700 dark:text-slate-300">{s.leaderCount} · {pct(s.leaderShare)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-xs text-slate-700 dark:text-slate-300">{s.count} · {pct(s.share)}</td>
                          <td className="px-3 py-2.5 tabular-nums text-xs text-slate-700 dark:text-slate-300">{s.primaryCount} / {s.additionalCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-xs text-slate-700 dark:text-slate-300">#{s.bestRank}</td>
                          {target && <td className="px-3 py-2.5 text-xs">{targetKeys.has(s.label.toLocaleLowerCase()) ? <span className="font-bold text-emerald-700 dark:text-emerald-400">✓</span> : <span className="text-slate-300">—</span>}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={card}>
                <div className={cardHead}>
                  <h2 className={h2}>Listings · {listings.length}</h2>
                  <ExportCSVButton
                    filename={`${fileStem}-listings.csv`}
                    columns={[
                      { key: 'rank', label: 'Rank' }, { key: 'title', label: 'Business' }, { key: 'primary', label: 'Primary category' },
                      { key: 'additional', label: 'Additional categories' }, { key: 'categoryCount', label: 'Category count' },
                      { key: 'rating', label: 'Rating' }, { key: 'reviews', label: 'Reviews' }, { key: 'phone', label: 'Phone' },
                      { key: 'url', label: 'Website' }, { key: 'address', label: 'Address' }, { key: 'claimed', label: 'Claimed' }, { key: 'cid', label: 'CID' },
                    ]}
                    data={listings.map((l) => ({
                      ...l, primary: l.primary ?? '', additional: l.additional.join(' | '), categoryCount: listingCategories(l).length,
                      rating: l.rating ?? '', reviews: l.reviews ?? '', phone: l.phone ?? '', url: l.url ?? '', address: l.address ?? '',
                      claimed: l.claimed === null ? '' : l.claimed ? 'yes' : 'no',
                    }))}
                  />
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {listings.map((l) => {
                    const isTarget = target?.cid === l.cid;
                    return (
                      <div key={l.cid} className={`px-6 py-4 ${isTarget ? 'bg-blue-50/70 dark:bg-blue-950/30' : l.rank <= audit.leaders ? '' : 'opacity-80'}`}>
                        <div className="flex items-start gap-4">
                          <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${l.rank <= audit.leaders ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{l.rank}</span>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <a href={`https://www.google.com/maps?cid=${l.cid}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-900 dark:text-white hover:text-blue-700">{l.title}</a>
                                {isTarget && <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">You</span>}
                                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                  {l.rating !== null ? `${l.rating.toFixed(1)}★` : 'No rating'} · {fmt(l.reviews)} reviews · {listingCategories(l).length} categories
                                </span>
                              </div>
                              {!isTarget && (
                                <a href={auditHref(linkBase, targetParams(l))} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-700">
                                  Compare as mine
                                </a>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {l.primary ? <Badge label={l.primary} primary /> : <span className="text-xs text-slate-400">No primary category</span>}
                              {l.additional.map((label) => (
                                <Badge key={label} label={label} highlight={target && !isTarget && !targetKeys.has(label.toLocaleLowerCase()) ? 'missing' : undefined} />
                              ))}
                              {l.additional.length === 0 && <span className="text-xs text-slate-400">no additional category shown</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {target && (
                  <p className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200 align-middle mr-1" /> Additional categories you do not have.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className={card}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800"><h2 className={h2}>History</h2></div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((h) => (
              <a key={h.id} href={`${PATH}?history_id=${h.id}#results`}
                className={`flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${h.id === entry?.id ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{h.keyword}</p>
                  <p className="text-[11px] text-slate-500 truncate">{h.area} · {h.count} listings{h.cost !== undefined ? ` · $${h.cost.toFixed(4)}` : ''}</p>
                </div>
                <span className="text-[11px] text-slate-500">{formatDate(h.ts)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(GbpCategoriesPage);
