import { getCredentials, getInstantPageHistory, saveInstantPageResult, getInstantPageResult, type InstantPageEntry } from '@/lib/db';
import { redirect } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HTag {
  [tag: string]: string[] | undefined;
}

interface PageMeta {
  title?: string;
  description?: string;
  canonical?: string;
  meta_keywords?: string;
  meta_title?: string;
  generator?: string;
  charset?: number;
  htags?: HTag;
  follow?: boolean;
  internal_links_count?: number;
  external_links_count?: number;
  inbound_links_count?: number;
  images_count?: number;
  images_size?: number;
  scripts_count?: number;
  scripts_size?: number;
  stylesheets_count?: number;
  stylesheets_size?: number;
  title_length?: number;
  description_length?: number;
  render_blocking_scripts_count?: number;
  render_blocking_stylesheets_count?: number;
  cumulative_layout_shift?: number;
  total_dom_size?: number;
}

interface PageTiming {
  time_to_interactive?: number;
  dom_complete?: number;
  largest_contentful_paint?: number;
  first_input_delay?: number;
  connection_time?: number;
  time_to_secure_connection?: number;
  waiting_time?: number;
  download_time?: number;
  duration_time?: number;
}

interface ContentMetrics {
  plain_text_size?: number;
  plain_text_rate?: number;
  plain_text_word_count?: number;
  automated_readability_index?: number;
  flesch_kincaid_readability_index?: number;
  dale_chall_readability_index?: number;
  description_to_content_consistency?: number;
  title_to_content_consistency?: number;
}

interface Checks {
  [key: string]: boolean | undefined;
}

interface PageItem {
  resource_type?: string;
  url?: string;
  status_code?: number;
  onpage_score?: number;
  size?: number;
  encoded_size?: number;
  total_transfer_size?: number;
  fetch_time?: string;
  content_encoding?: string;
  media_type?: string;
  server?: string;
  is_https?: boolean;
  url_length?: number;
  meta?: PageMeta;
  page_timing?: PageTiming;
  content?: ContentMetrics;
  checks?: Checks;
  broken_resources?: boolean;
  broken_links?: boolean;
}

interface ApiResult {
  items?: PageItem[];
  items_count?: number;
}

interface SearchParams {
  url?: string;
  id?: string;
}

// ─── Checks metadata ──────────────────────────────────────────────────────────

type CheckSeverity = 'error' | 'warning' | 'info' | 'good';

const CHECK_META: Record<string, { label: string; severity: CheckSeverity }> = {
  no_title: { label: 'Missing title tag', severity: 'error' },
  no_description: { label: 'Missing meta description', severity: 'error' },
  no_h1_tag: { label: 'Missing H1 tag', severity: 'error' },
  duplicate_title_tag: { label: 'Duplicate title tags', severity: 'error' },
  is_4xx_code: { label: '4XX status code', severity: 'error' },
  is_5xx_code: { label: '5XX status code', severity: 'error' },
  is_broken: { label: 'Broken page', severity: 'error' },
  no_doctype: { label: 'Missing DOCTYPE', severity: 'error' },
  has_micromarkup_errors: { label: 'Microdata errors', severity: 'error' },
  high_loading_time: { label: 'High loading time (>3s)', severity: 'warning' },
  high_waiting_time: { label: 'High TTFB (>1.5s)', severity: 'warning' },
  https_to_http_links: { label: 'HTTPS page links to HTTP', severity: 'warning' },
  no_image_alt: { label: 'Images missing alt text', severity: 'warning' },
  no_image_title: { label: 'Images missing title text', severity: 'warning' },
  no_favicon: { label: 'No favicon', severity: 'warning' },
  title_too_long: { label: 'Title too long (>65 chars)', severity: 'warning' },
  title_too_short: { label: 'Title too short (<30 chars)', severity: 'warning' },
  low_content_rate: { label: 'Low text-to-size ratio', severity: 'warning' },
  high_content_rate: { label: 'High text-to-size ratio', severity: 'warning' },
  has_render_blocking_resources: { label: 'Render-blocking resources', severity: 'warning' },
  size_greater_than_3mb: { label: 'Page > 3 MB', severity: 'warning' },
  large_page_size: { label: 'Large page size (>1 MB)', severity: 'warning' },
  low_character_count: { label: 'Low character count (<1024)', severity: 'warning' },
  deprecated_html_tags: { label: 'Deprecated HTML tags', severity: 'warning' },
  duplicate_meta_tags: { label: 'Duplicate meta tags', severity: 'warning' },
  no_encoding_meta_tag: { label: 'Missing charset meta tag', severity: 'warning' },
  has_meta_refresh_redirect: { label: 'Meta refresh redirect', severity: 'warning' },
  flash: { label: 'Flash elements detected', severity: 'warning' },
  frame: { label: 'Frame/iframe elements', severity: 'warning' },
  lorem_ipsum: { label: 'Lorem ipsum text found', severity: 'warning' },
  has_misspelling: { label: 'Spelling errors', severity: 'warning' },
  irrelevant_description: { label: 'Description irrelevant to content', severity: 'warning' },
  irrelevant_title: { label: 'Title irrelevant to content', severity: 'warning' },
  is_https: { label: 'HTTPS', severity: 'good' },
  has_html_doctype: { label: 'HTML DOCTYPE present', severity: 'good' },
  has_micromarkup: { label: 'Structured data present', severity: 'good' },
  seo_friendly_url: { label: 'SEO-friendly URL', severity: 'good' },
  is_redirect: { label: 'Contains redirect (3XX)', severity: 'info' },
  is_www: { label: 'WWW subdomain', severity: 'info' },
  is_http: { label: 'HTTP (not HTTPS)', severity: 'info' },
  canonical: { label: 'Canonical tag set', severity: 'info' },
  has_meta_title: { label: 'Meta title tag present', severity: 'info' },
  seo_friendly_url_characters_check: { label: 'URL uses valid characters', severity: 'info' },
  seo_friendly_url_dynamic_check: { label: 'No dynamic URL parameters', severity: 'info' },
  seo_friendly_url_keywords_check: { label: 'URL matches title keywords', severity: 'info' },
  seo_friendly_url_relative_length_check: { label: 'URL length under 120 chars', severity: 'info' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeader(login: string, pass: string) {
  return `Basic ${btoa(`${login}:${pass}`)}`;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreColor(score?: number): string {
  if (!score) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score?: number): string {
  if (!score) return 'bg-slate-100';
  if (score >= 80) return 'bg-emerald-50 border-emerald-100';
  if (score >= 50) return 'bg-amber-50 border-amber-100';
  return 'bg-red-50 border-red-100';
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchInstantPage(url: string, login: string, pass: string): Promise<{ result?: ApiResult; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/instant_pages', {
    method: 'POST',
    headers: { Authorization: authHeader(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ url, load_resources: false, enable_javascript: false }]),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: ApiResult[];
    }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { error: `DataForSEO: ${task.status_message}` };
  return { result: task.result?.[0], cost: task.cost };
}

// ─── UI components ────────────────────────────────────────────────────────────

function MetaRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-black uppercase tracking-widest text-slate-400 w-40 shrink-0 mt-0.5">{label}</span>
      <span className={`text-sm text-slate-800 break-all leading-relaxed ${mono ? 'font-mono text-xs' : ''}`}>{String(value)}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-lg font-black text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CheckBadge({ severity, label }: { severity: CheckSeverity; label: string }) {
  const cls: Record<CheckSeverity, string> = {
    error: 'text-red-600 bg-red-50 border-red-100',
    warning: 'text-amber-600 bg-amber-50 border-amber-100',
    info: 'text-blue-500 bg-blue-50 border-blue-100',
    good: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${cls[severity]}`}>
      {severity === 'error' && '✕ '}
      {severity === 'warning' && '⚠ '}
      {severity === 'good' && '✓ '}
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InstantPagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;

  let createError: string | null = null;

  // Step 1: submit ?url= → call API → save → redirect to ?id=
  if (params.url?.trim() && !params.id) {
    let rawUrl = params.url.trim();
    if (!rawUrl.startsWith('http')) rawUrl = `https://${rawUrl}`;
    let validUrl = false;
    try { new URL(rawUrl); validUrl = true; } catch { /* noop */ }

    if (!validUrl) {
      createError = 'Invalid URL.';
    } else if (!creds) {
      createError = 'DataForSEO credentials missing. Configure them in settings.';
    } else {
      const { result, cost, error } = await fetchInstantPage(rawUrl, creds.login, creds.pass);
      if (error || !result) {
        createError = error ?? 'API call failed.';
      } else {
        const id = randomUUID();
        saveInstantPageResult<ApiResult>({ id, ts: Date.now(), url: rawUrl, cost }, result);
        redirect(`/dashboard/on-page/instant-pages?id=${id}`);
      }
    }
  }

  // Step 2: load cached result from ?id=
  let activeEntry: InstantPageEntry | null = null;
  let pageResult: ApiResult | null = null;

  if (params.id) {
    const history = getInstantPageHistory();
    activeEntry = history.find((e) => e.id === params.id) ?? null;
    pageResult = getInstantPageResult<ApiResult>(params.id);
  }

  const history = getInstantPageHistory();
  const page = pageResult?.items?.[0];

  const flaggedChecks = page?.checks
    ? Object.entries(page.checks).filter(([, val]) => val === true)
    : [];

  const errors = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'error');
  const warnings = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'warning');
  const goods = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'good');
  const infos = flaggedChecks.filter(([k]) => CHECK_META[k]?.severity === 'info');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <span>On Page</span><span className="text-slate-200">/</span><span className="text-slate-600">Instant Pages</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Instant Page Analysis</h1>
        <p className="text-sm text-slate-400 mt-1">Full on-page audit of a URL — metadata, performance, checks, and content metrics.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3"
        btnLabel="Analyze"
        btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-2.5 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Page URL</label>
        <input
          type="url"
          name="url"
          placeholder="https://example.com/page"
          required
          defaultValue={activeEntry?.url ?? ''}
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
      </SearchForm>

      {/* Error */}
      {createError && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{createError}</div>
      )}

      {/* Results */}
      {activeEntry && pageResult && page && (
        <div className="space-y-4">
          {/* Entry header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-mono text-slate-500 truncate max-w-lg">{activeEntry.url}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {formatDate(activeEntry.ts)}
                {activeEntry.cost !== undefined && ` · $${activeEntry.cost.toFixed(5)}`}
                {page.status_code !== undefined && ` · HTTP ${page.status_code}`}
                {page.server && ` · ${page.server}`}
              </p>
            </div>
            {/* OnPage score */}
            {page.onpage_score !== undefined && (
              <div className={`shrink-0 rounded-2xl border px-5 py-3 text-center ${scoreBg(page.onpage_score)}`}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">OnPage Score</p>
                <p className={`text-3xl font-black ${scoreColor(page.onpage_score)}`}>{page.onpage_score.toFixed(1)}</p>
                <p className="text-[10px] text-slate-400">/ 100</p>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Page size" value={formatBytes(page.size)} sub={page.total_transfer_size ? `${formatBytes(page.total_transfer_size)} compressed` : undefined} />
            <StatCard label="URL length" value={page.url_length ?? '—'} sub="characters" />
            <StatCard label="Internal links" value={page.meta?.internal_links_count ?? '—'} />
            <StatCard label="External links" value={page.meta?.external_links_count ?? '—'} />
          </div>

          {/* Checks */}
          {flaggedChecks.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Checks</h2>
              </div>
              <div className="px-6 py-5 space-y-4">
                {errors.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-2">Errors</p>
                    <div className="flex flex-wrap gap-2">
                      {errors.map(([k]) => <CheckBadge key={k} severity="error" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
                {warnings.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">Warnings</p>
                    <div className="flex flex-wrap gap-2">
                      {warnings.map(([k]) => <CheckBadge key={k} severity="warning" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
                {goods.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">Good</p>
                    <div className="flex flex-wrap gap-2">
                      {goods.map(([k]) => <CheckBadge key={k} severity="good" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
                {infos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Info</p>
                    <div className="flex flex-wrap gap-2">
                      {infos.map(([k]) => <CheckBadge key={k} severity="info" label={CHECK_META[k]?.label ?? k} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Page Metadata</h2>
            </div>
            <div className="px-6 py-2">
              <MetaRow label="Title" value={page.meta?.title} />
              {page.meta?.title_length !== undefined && (
                <MetaRow label="Title length" value={`${page.meta.title_length} chars`} />
              )}
              <MetaRow label="Description" value={page.meta?.description} />
              {page.meta?.description_length !== undefined && (
                <MetaRow label="Desc. length" value={`${page.meta.description_length} chars`} />
              )}
              <MetaRow label="Canonical" value={page.meta?.canonical} mono />
              <MetaRow label="Meta title" value={page.meta?.meta_title} />
              <MetaRow label="Meta keywords" value={page.meta?.meta_keywords} />
              <MetaRow label="Generator" value={page.meta?.generator} />
              <MetaRow label="Charset" value={page.meta?.charset} />
              <MetaRow label="DOM nodes" value={page.meta?.total_dom_size} />
            </div>
          </div>

          {/* Headings */}
          {page.meta?.htags && Object.keys(page.meta.htags).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Headings</h2>
              </div>
              <div className="px-6 py-4 space-y-3">
                {(['h1', 'h2', 'h3', 'h4'] as const).map((tag) => {
                  const values = page.meta?.htags?.[tag];
                  if (!values?.length) return null;
                  return (
                    <div key={tag}>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">{tag.toUpperCase()}</span>
                      <span className="text-[10px] text-slate-300 mr-3">({values.length})</span>
                      <div className="mt-1.5 space-y-1">
                        {values.slice(0, 5).map((v, i) => (
                          <p key={i} className="text-sm text-slate-700 pl-2 border-l-2 border-slate-100">{v}</p>
                        ))}
                        {values.length > 5 && <p className="text-xs text-slate-400 pl-2">+{values.length - 5} more</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance */}
          {page.page_timing && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Performance</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
                <StatCard label="LCP" value={formatMs(page.page_timing.largest_contentful_paint)} sub="Largest Contentful Paint" />
                <StatCard label="TTFB" value={formatMs(page.page_timing.waiting_time)} sub="Time to First Byte" />
                <StatCard label="TTI" value={formatMs(page.page_timing.time_to_interactive)} sub="Time to Interactive" />
                <StatCard label="Total" value={formatMs(page.page_timing.duration_time)} sub="Full load time" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 pb-4">
                <StatCard label="DOM complete" value={formatMs(page.page_timing.dom_complete)} />
                <StatCard label="Download" value={formatMs(page.page_timing.download_time)} />
                <StatCard label="Connect" value={formatMs(page.page_timing.connection_time)} />
                <StatCard label="TLS" value={formatMs(page.page_timing.time_to_secure_connection)} sub="Secure connection" />
              </div>
            </div>
          )}

          {/* Resources */}
          {page.meta && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Resources</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-6 py-4">
                <StatCard label="Images" value={page.meta.images_count ?? '—'} sub={formatBytes(page.meta.images_size)} />
                <StatCard label="Scripts" value={page.meta.scripts_count ?? '—'} sub={formatBytes(page.meta.scripts_size)} />
                <StatCard label="Stylesheets" value={page.meta.stylesheets_count ?? '—'} sub={formatBytes(page.meta.stylesheets_size)} />
                {page.meta.render_blocking_scripts_count !== undefined && (
                  <StatCard label="Blocking scripts" value={page.meta.render_blocking_scripts_count} />
                )}
                {page.meta.render_blocking_stylesheets_count !== undefined && (
                  <StatCard label="Blocking CSS" value={page.meta.render_blocking_stylesheets_count} />
                )}
                {page.meta.cumulative_layout_shift !== undefined && (
                  <StatCard label="CLS" value={page.meta.cumulative_layout_shift.toFixed(3)} sub="Cumulative Layout Shift" />
                )}
              </div>
            </div>
          )}

          {/* Content */}
          {page.content && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Content Metrics</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
                {page.content.plain_text_word_count !== undefined && (
                  <StatCard label="Word count" value={Math.round(page.content.plain_text_word_count)} />
                )}
                {page.content.plain_text_size !== undefined && (
                  <StatCard label="Text size" value={formatBytes(page.content.plain_text_size)} />
                )}
                {page.content.plain_text_rate !== undefined && (
                  <StatCard label="Text rate" value={`${page.content.plain_text_rate}%`} sub="Text to page size" />
                )}
                {page.content.flesch_kincaid_readability_index !== undefined && (
                  <StatCard label="Flesch-Kincaid" value={page.content.flesch_kincaid_readability_index.toFixed(1)} sub="Readability" />
                )}
                {page.content.title_to_content_consistency !== undefined && (
                  <StatCard label="Title consistency" value={`${(page.content.title_to_content_consistency * 100).toFixed(0)}%`} sub="Title ↔ content" />
                )}
                {page.content.description_to_content_consistency !== undefined && (
                  <StatCard label="Desc. consistency" value={`${(page.content.description_to_content_consistency * 100).toFixed(0)}%`} sub="Description ↔ content" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No result yet */}
      {params.id && !pageResult && !createError && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
          Result not found.
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Analysis history</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map((entry) => {
              const isActive = entry.id === params.id;
              return (
                <a
                  key={entry.id}
                  href={`/dashboard/on-page/instant-pages?id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                      {new URL(entry.url).hostname}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate font-mono">{entry.url}</p>
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
