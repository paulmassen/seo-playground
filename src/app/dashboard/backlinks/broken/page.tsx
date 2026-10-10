import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getBlBrokenHistory, saveBlBroken, getBlBrokenResults, type BlBrokenEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import BrokenBacklinksTable from './BrokenBacklinksTable';
import { groupByBrokenPage, type BrokenLink } from './group';

interface SearchParams { target?: string; limit?: string; dofollow?: string; history_id?: string; }

const LIMITS = [100, 500, 1000];

// A domain is sent bare (example.com); a page keeps its absolute URL, as the Backlinks API expects.
function normalizeTarget(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const hasPath = (u.pathname && u.pathname !== '/') || u.search;
    return hasPath ? `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}${u.search}` : host;
  } catch {
    return t.toLowerCase();
  }
}

async function fetchBroken(
  target: string,
  limit: number,
  dofollowOnly: boolean,
  login: string,
  pass: string,
): Promise<{ items: BrokenLink[]; total: number; cost?: number; error?: string }> {
  // is_broken = the link points to a page answering 4xx/5xx (url_to_status_code holds the exact code).
  const broken = ['is_broken', '=', true];
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: BrokenLink[] }>(
    'backlinks/backlinks/live',
    {
      target,
      limit,
      mode: 'as_is',
      include_subdomains: true,
      backlinks_status_type: 'live',
      filters: dofollowOnly ? [broken, 'and', ['dofollow', '=', true]] : broken,
      order_by: ['domain_from_rank,desc'],
    },
    { login, pass },
  );
  if (error) return { items: [], total: 0, error };
  // Keep only what the page uses: the raw backlink objects are large and stored as-is in history.
  const items = (result?.items ?? []).map((l) => ({
    type: l.type,
    domain_from: l.domain_from,
    url_from: l.url_from,
    url_to: l.url_to,
    url_to_status_code: l.url_to_status_code,
    domain_from_rank: l.domain_from_rank,
    page_from_rank: l.page_from_rank,
    anchor: l.anchor,
    image_url: l.image_url,
    dofollow: l.dofollow,
    first_seen: l.first_seen,
    last_seen: l.last_seen,
  }));
  return { items, total: result?.total_count ?? items.length, cost };
}

function fmt(n?: number) { return n === undefined ? '—' : n.toLocaleString('en-GB'); }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

async function BrokenBacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const target = normalizeTarget(params.target ?? '');
  const limit = LIMITS.includes(Number(params.limit)) ? Number(params.limit) : 500;
  const dofollowOnly = params.dofollow === 'true';
  const historyId = params.history_id;

  let items: BrokenLink[] = [];
  let total = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlBrokenEntry | null = null;

  if (historyId) {
    const saved = getBlBrokenResults<BrokenLink>(historyId);
    if (saved) {
      items = saved;
      activeEntry = getBlBrokenHistory().find((e) => e.id === historyId) ?? null;
      total = activeEntry?.total ?? items.length;
      cost = activeEntry?.cost;
    } else error = 'Search no longer available.';
  } else if (target) {
    const dedupeId = stableSearchId(['bl-broken', target, limit, dofollowOnly]);
    const cached = getBlBrokenResults<BrokenLink>(dedupeId);
    if (cached) {
      items = cached;
      activeEntry = getBlBrokenHistory().find((e) => e.id === dedupeId) ?? null;
      total = activeEntry?.total ?? items.length;
      cost = activeEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchBroken(target, limit, dofollowOnly, creds.login, creds.pass);
      if (res.error) error = res.error;
      else {
        items = res.items; total = res.total; cost = res.cost;
        // Saved even when empty: "no broken backlinks" is a useful, paid-for answer.
        saveBlBroken({ id: dedupeId, ts: Date.now(), target, dofollowOnly, count: items.length, total, cost }, items);
      }
    }
  }

  const history = getBlBrokenHistory();
  const displayTarget = activeEntry?.target ?? target;
  const displayDofollow = activeEntry?.dofollowOnly ?? dofollowOnly;
  const pages = groupByBrokenPage(items);
  const domains = new Set(items.map((l) => l.domain_from).filter(Boolean)).size;
  const dofollowCount = items.filter((l) => l.dofollow).length;
  const fileSlug = displayTarget.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '-');

  const linksCsv = items.map((l) => ({
    broken_page: l.url_to ?? '',
    status: l.url_to_status_code ?? '',
    source: l.url_from ?? '',
    domain_from: l.domain_from ?? '',
    dr: l.domain_from_rank ?? '',
    anchor: l.anchor ?? '',
    dofollow: l.dofollow ? 'yes' : 'no',
    first_seen: l.first_seen?.split(' ')[0]?.split('T')[0] ?? '',
  }));
  const pagesMd = pages.map((p) => ({
    page: p.url,
    status: p.statuses.join(', '),
    links: p.links.length,
    domains: p.domains,
    dofollow: p.dofollow,
    best_dr: p.bestDr ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</a>
          <span className="text-slate-200 dark:text-slate-700">/</span>
          <span className="text-slate-600 dark:text-slate-300">Broken Backlinks</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Broken Backlinks</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Live backlinks pointing to pages that answer 4xx or 5xx. On your own site, 301-redirect or restore those pages to reclaim the links.
          On a competitor, each broken page is a broken link building opportunity: offer your content to the sites still linking to it.
        </p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Find broken backlinks" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors" disabled={!creds}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="bb-target" className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domain or page</label>
            <input id="bb-target" type="text" name="target" defaultValue={displayTarget || defaultDomain} placeholder="example.com" required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label htmlFor="bb-dofollow" className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Links</label>
            <select id="bb-dofollow" name="dofollow" defaultValue={displayDofollow ? 'true' : ''}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              <option value="">All broken links</option>
              <option value="true">Dofollow only</option>
            </select>
          </div>
          <div>
            <label htmlFor="bb-limit" className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Max links</label>
            <select id="bb-limit" name="limit" defaultValue={String(limit)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        {!creds && <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Configure API credentials in Settings first.</p>}
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || target) && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Broken backlinks" value={fmt(total)} hint={total > items.length ? `${fmt(items.length)} loaded` : undefined} />
            <Stat label="Broken pages" value={fmt(pages.length)} hint={total > items.length ? 'in loaded links' : undefined} />
            <Stat label="Referring domains" value={fmt(domains)} />
            <Stat label="Dofollow" value={fmt(dofollowCount)} hint={items.length ? `${Math.round((dofollowCount / items.length) * 100)}% of links` : undefined} />
          </div>

          <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                {displayTarget}{displayDofollow && ' · dofollow only'}
              </span>
              <div className="flex items-center gap-3">
                {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CopyMarkdownButton data={pagesMd} columns={[
                      { key: 'page', label: 'Broken page' }, { key: 'status', label: 'Status' }, { key: 'links', label: 'Links' },
                      { key: 'domains', label: 'Ref. domains' }, { key: 'dofollow', label: 'Dofollow' }, { key: 'best_dr', label: 'Best DR' },
                    ]} />
                    <ExportCSVButton data={linksCsv} filename={`broken-backlinks-${fileSlug}.csv`} columns={[
                      { key: 'broken_page', label: 'Broken page' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Source URL' },
                      { key: 'domain_from', label: 'Source domain' }, { key: 'dr', label: 'DR' }, { key: 'anchor', label: 'Anchor' },
                      { key: 'dofollow', label: 'Dofollow' }, { key: 'first_seen', label: 'First seen' },
                    ]} />
                  </div>
                )}
              </div>
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-400">
                No broken backlinks found{displayDofollow ? ' among dofollow links' : ''}. Every live link to this target lands on a working page.
              </div>
            ) : (
              <BrokenBacklinksTable links={items} />
            )}
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === (historyId ?? activeEntry?.id);
              return (
                <a key={entry.id} href={`/dashboard/backlinks/broken?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {fmt(entry.total ?? entry.count)} broken backlinks{entry.dofollowOnly ? ' · dofollow only' : ''}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(BrokenBacklinksPage);
