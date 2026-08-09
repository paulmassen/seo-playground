import {
  getCredentials,
  getBacklinksHistory,
  saveBacklinksSearch,
  getBacklinksResult,
  getBacklinksLinks,
  type BacklinksSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import BacklinksTable from './BacklinksTable';

// ---- Types ----

interface LinkTypes {
  anchor?: number;
  image?: number;
  redirect?: number;
  canonical?: number;
  alternate?: number;
  hreflang?: number;
  nofollow_link?: number;
  form?: number;
  frame?: number;
  comment?: number;
}

interface BacklinksSummary {
  target?: string;
  rank?: number;
  backlinks?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  new_referring_domains?: number;
  lost_referring_domains?: number;
  referring_ips?: number;
  referring_subnets?: number;
  referring_pages?: number;
  broken_backlinks?: number;
  broken_pages?: number;
  spam_score?: number;
  referring_links_types?: LinkTypes;
  referring_links_tld?: Record<string, number>;
}

export interface BacklinkItem {
  type?: string;
  domain_from?: string;
  url_from?: string;
  domain_to?: string;
  url_to?: string;
  page_from_rank?: number;
  domain_from_rank?: number;
  anchor?: string;
  alt?: string;
  image_url?: string;
  dofollow?: boolean;
  original?: boolean;
  is_broken?: boolean;
  url_to_status_code?: number;
  attributes?: string[];
  first_seen?: string;
  last_seen?: string;
}

interface SearchParams {
  target?: string;
  limit?: string;
  order_by?: string;
  dofollow?: string;
  history_id?: string;
}

// ---- API ----

function cleanTarget(t: string) {
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function fetchSummary(target: string, auth: string): Promise<{ result?: BacklinksSummary; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target }]),
  });
  if (!res.ok) return { error: `Error API summary ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: BacklinksSummary[] }> };
  const task = data?.tasks?.[0];
  if (!task) return { error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { error: `DataForSEO: ${task.status_message}` };
  return { result: task.result?.[0], cost: task.cost };
}

async function fetchLinks(
  target: string,
  auth: string,
  limit: number,
  orderBy: string,
  dofollow: boolean | null,
): Promise<{ items: BacklinkItem[]; total: number; cost?: number; error?: string }> {
  const body: Record<string, unknown> = {
    target,
    limit,
    include_subdomains: true,
    order_by: [orderBy],
  };
  if (dofollow !== null) {
    body.filters = ['dofollow', '=', dofollow];
  }
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  if (!res.ok) return { items: [], total: 0, error: `Error API links ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ total_count?: number; items?: BacklinkItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], total: 0, error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], total: 0, error: `DataForSEO: ${task.status_message}` };
  const result = task.result?.[0];
  return { items: result?.items ?? [], total: result?.total_count ?? 0, cost: task.cost };
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString("en-GB");
}

function SpamBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-slate-300">—</span>;
  const color = score >= 60 ? 'text-red-600 bg-red-50 border-red-200'
    : score >= 30 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-emerald-600 bg-emerald-50 border-emerald-200';
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${color}`}>{score} / 100</span>;
}

function Delta({ value, invert = false }: { value?: number; invert?: boolean }) {
  if (!value) return null;
  const positive = invert ? value < 0 : value > 0;
  return (
    <span className={`text-[10px] font-black ml-1 ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
      {value > 0 ? '+' : ''}{fmt(value)}
    </span>
  );
}

function StatCard({ label, value, new: newVal, lost }: { label: string; value?: number; new?: number; lost?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{fmt(value)}</p>
      {(newVal !== undefined || lost !== undefined) && (
        <p className="text-[11px] mt-0.5 text-slate-400">
          {newVal !== undefined && <><Delta value={newVal} /> new</>}
          {newVal !== undefined && lost !== undefined && ' · '}
          {lost !== undefined && <><Delta value={-lost} invert /> lost</>}
        </p>
      )}
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function BacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const target = params.target?.trim() ?? '';
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const orderBy = params.order_by ?? 'domain_from_rank,desc';
  const dofollowParam = params.dofollow;
  const dofollowFilter = dofollowParam === 'true' ? true : dofollowParam === 'false' ? false : null;

  let summary: BacklinksSummary | null = null;
  let links: BacklinkItem[] = [];
  let linksTotal = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: BacklinksSearchEntry | null = null;

  if (historyId) {
    const savedSummary = getBacklinksResult<BacklinksSummary>(historyId);
    const savedLinks = getBacklinksLinks<BacklinkItem>(historyId);
    if (savedSummary) {
      summary = savedSummary;
      links = savedLinks ?? [];
      isFromHistory = true;
      const history = getBacklinksHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      linksTotal = activeEntry?.linksTotal ?? links.length;
    } else {
      error = 'This search is no longer available.';
    }
  }

  if (!historyId && target) {
    const clean = cleanTarget(target);
    const dedupeId = stableSearchId(['backlinks', clean, limit, orderBy, dofollowFilter]);
    const cachedSummary = getBacklinksResult<BacklinksSummary>(dedupeId);

    if (cachedSummary) {
      summary = cachedSummary;
      links = getBacklinksLinks<BacklinkItem>(dedupeId) ?? [];
      const cachedEntry = getBacklinksHistory().find((e) => e.id === dedupeId);
      linksTotal = cachedEntry?.linksTotal ?? links.length;
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const auth = btoa(`${creds.login}:${creds.pass}`);

      const [summaryRes, linksRes] = await Promise.all([
        fetchSummary(clean, auth),
        fetchLinks(clean, auth, limit, orderBy, dofollowFilter),
      ]);

      if (summaryRes.error || linksRes.error) {
        error = summaryRes.error ?? linksRes.error ?? 'Unknown error.';
      } else {
        summary = summaryRes.result ?? null;
        links = linksRes.items;
        linksTotal = linksRes.total;
        cost = (summaryRes.cost ?? 0) + (linksRes.cost ?? 0);

        if (summary || links.length > 0) {
          const entry: BacklinksSearchEntry = {
            id: dedupeId,
            ts: Date.now(),
            target: clean,
            cost,
            linksTotal,
          };
          saveBacklinksSearch(entry, summary ?? {}, links, linksTotal);
        }
      }
    }
  }

  const history = getBacklinksHistory();
  const hasQuery = historyId || target;
  const displayTarget = activeEntry?.target ?? cleanTarget(target);

  const linkTypeEntries = summary?.referring_links_types
    ? Object.entries(summary.referring_links_types).filter(([, v]) => v && v > 0).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    : [];

  const tldEntries = summary?.referring_links_tld
    ? Object.entries(summary.referring_links_tld).sort(([, a], [, b]) => b - a).slice(0, 8)
    : [];
  const tldTotal = tldEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Backlinks</h1>
        <p className="text-sm text-slate-400 mt-1">Inbound link profile of a domain via DataForSEO.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Target domain</label>
            <input
              type="text" name="target"
              defaultValue={displayTarget}
              placeholder="e.g. example.com"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Sort by</label>
            <select name="order_by" defaultValue={orderBy}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="domain_from_rank,desc">Source domain DR (high)</option>
              <option value="page_from_rank,desc">Source page rank (high)</option>
              <option value="first_seen,desc">Most recent</option>
              <option value="first_seen,asc">Oldest</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Filter</label>
            <select name="dofollow" defaultValue={dofollowParam ?? ''}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">All links</option>
              <option value="true">Dofollow only</option>
              <option value="false">Nofollow only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Number of links</label>
            <select name="limit" defaultValue={String(limit)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && (summary || links.length > 0) && (
        <>
          {/* Header */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Domain</span>
              <span className="font-mono font-bold text-slate-900">{displayTarget}</span>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            {summary?.rank !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">DR</span>
                <span className="font-mono font-bold text-slate-900">{summary.rank}</span>
              </div>
            )}
            {summary?.spam_score !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Spam</span>
                <SpamBadge score={summary.spam_score} />
              </div>
            )}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>

          {/* Summary stats */}
          {summary && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Backlinks" value={summary.backlinks} new={summary.new_backlinks} lost={summary.lost_backlinks} />
                <StatCard label="Referring domains" value={summary.referring_domains} new={summary.new_referring_domains} lost={summary.lost_referring_domains} />
                <StatCard label="Referring IPs" value={summary.referring_ips} />
                <StatCard label="Referring pages" value={summary.referring_pages} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Broken backlinks" value={summary.broken_backlinks} />
                <StatCard label="Broken pages" value={summary.broken_pages} />
                <StatCard label="Referring subnets" value={summary.referring_subnets} />
              </div>

              {/* Link types + TLD */}
              {(linkTypeEntries.length > 0 || tldEntries.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linkTypeEntries.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Link types</h2>
                      <div className="space-y-2">
                        {linkTypeEntries.map(([type, count]) => {
                          const pct = Math.round(((count ?? 0) / (summary.backlinks ?? 1)) * 100);
                          return (
                            <div key={type}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-slate-600 capitalize">{type.replace(/_/g, ' ')}</span>
                                <span className="text-xs font-mono text-slate-500">{fmt(count)} <span className="text-slate-300">({pct}%)</span></span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {tldEntries.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Referring domains TLD</h2>
                      <div className="space-y-2">
                        {tldEntries.map(([tld, count]) => {
                          const pct = Math.round((count / tldTotal) * 100);
                          return (
                            <div key={tld}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-mono font-bold text-slate-600">.{tld}</span>
                                <span className="text-xs font-mono text-slate-500">{fmt(count)} <span className="text-slate-300">({pct}%)</span></span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Backlinks list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Backlinks list</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400">
                  {links.length} shown
                  {linksTotal > links.length && <span className="text-slate-300"> / {fmt(linksTotal)} total</span>}
                </span>
                {links.length > 0 && (
                  <>
                    <CopyMarkdownButton
                      data={links.map((l) => ({
                        source: l.url_from,
                        domain_from: l.domain_from,
                        anchor: l.anchor,
                        target: l.url_to,
                        dr: l.domain_from_rank,
                        dofollow: l.dofollow ? 'yes' : 'no',
                        broken: l.is_broken ? 'yes' : 'no',
                        first_seen: l.first_seen?.split('T')[0] ?? '',
                      }))}
                      columns={[
                        { key: 'source', label: 'Source URL' },
                        { key: 'domain_from', label: 'Source Domain' },
                        { key: 'anchor', label: 'Anchor' },
                        { key: 'target', label: 'Target URL' },
                        { key: 'dr', label: 'DR' },
                        { key: 'dofollow', label: 'Dofollow' },
                        { key: 'broken', label: 'Broken' },
                        { key: 'first_seen', label: 'First Seen' },
                      ]}
                    />
                    <ExportCSVButton
                      data={links.map((l) => ({
                        source: l.url_from,
                        domain_from: l.domain_from,
                        anchor: l.anchor,
                        target: l.url_to,
                        dr: l.domain_from_rank,
                        dofollow: l.dofollow ? 'yes' : 'no',
                        broken: l.is_broken ? 'yes' : 'no',
                        first_seen: l.first_seen?.split('T')[0] ?? '',
                      }))}
                      filename={`backlinks-${target}.csv`}
                      columns={[
                        { key: 'source', label: 'Source URL' },
                        { key: 'domain_from', label: 'Source Domain' },
                        { key: 'anchor', label: 'Anchor' },
                        { key: 'target', label: 'Target URL' },
                        { key: 'dr', label: 'DR' },
                        { key: 'dofollow', label: 'Dofollow' },
                        { key: 'broken', label: 'Broken' },
                        { key: 'first_seen', label: 'First Seen' },
                      ]}
                    />
                  </>
                )}
              </div>
            </div>

            {links.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-400">No backlinks found.</div>
            ) : (
              <BacklinksTable links={links} />
            )}
          </div>
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/backlinks?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold font-mono truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.linksTotal !== undefined ? `${fmt(entry.linksTotal)} backlinks` : ''}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
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
