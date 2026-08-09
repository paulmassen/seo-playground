import {
  getCredentials, getSiteAuditHistory, getSiteAuditTask, upsertSiteAuditTask,
  saveSiteAuditResult, getSiteAuditSummary, getSiteAuditPages,
  type SiteAuditEntry,
} from '@/lib/db';
import { redirect } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import SiteAuditPagesTable from './SiteAuditPagesTable';
import KeywordDensityTable from './KeywordDensityTable';
import LinksTable from './LinksTable';
import ResourcesTable from './ResourcesTable';
import NonIndexableTable from './NonIndexableTable';
import AutoRefresh from '@/components/AutoRefresh';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryResult {
  crawl_progress: 'in_progress' | 'finished';
  crawl_status: { max_crawl_pages: number; pages_in_queue: number; pages_crawled: number };
  domain_info?: {
    name?: string;
    ip?: string;
    server?: string;
    cms?: string;
    ssl_info?: {
      valid_certificate?: boolean;
      certificate_issuer?: string;
      certificate_expiration_date?: string;
    };
    checks?: Record<string, boolean | undefined>;
  };
  page_metrics?: {
    onpage_score?: number;
    internal_links_count?: number;
    external_links_count?: number;
    broken_links?: number;
    duplicate_content?: number;
    duplicate_description?: number;
    duplicate_title?: number;
    non_indexable?: number;
    checks?: Record<string, number | undefined>;
  };
}

interface AuditPage {
  url?: string;
  resource_type?: string;
  status_code?: number;
  onpage_score?: number;
  size?: number;
  meta?: {
    title?: string;
    description?: string;
    title_length?: number;
    description_length?: number;
    internal_links_count?: number;
    external_links_count?: number;
    images_count?: number;
  };
  page_timing?: { duration_time?: number; waiting_time?: number };
  content?: { plain_text_word_count?: number };
  checks?: Record<string, boolean | undefined>;
}

interface SearchParams {
  target?: string;
  task_id?: string;
  view?: string;
  kw_len?: string;
}

interface KwDensityItem {
  keyword?: string;
  frequency?: number;
  density?: number;
  url_count?: number;
  emphasized_keyword_frequency?: number;
}

interface LinkItem {
  link_from?: string;
  link_to?: string;
  domain_from?: string;
  domain_to?: string;
  type?: string;
  is_broken?: boolean;
  is_nofollowed?: boolean;
  anchor?: string;
  direction?: 'internal' | 'external';
}

interface ResourceItem {
  url?: string;
  resource_type?: string;
  status_code?: number;
  size?: number;
  encoded_size?: number;
  fetch_time?: number;
  checks?: { broken_resources?: boolean; is_redirect?: boolean };
  accept_type?: string;
}

interface DuplicateTagPage { url?: string; meta?: { title?: string; description?: string } }
interface DuplicateTagItem {
  type?: string;
  tag?: string;
  pages?: DuplicateTagPage[];
  pages_count?: number;
}

// ─── Checks metadata ──────────────────────────────────────────────────────────

type Sev = 'error' | 'warning' | 'info' | 'good';

const PAGE_CHECKS: Record<string, { label: string; sev: Sev }> = {
  no_title: { label: 'Missing title', sev: 'error' },
  no_description: { label: 'Missing description', sev: 'error' },
  no_h1_tag: { label: 'Missing H1', sev: 'error' },
  is_4xx_code: { label: '4XX error', sev: 'error' },
  is_5xx_code: { label: '5XX error', sev: 'error' },
  is_broken: { label: 'Broken', sev: 'error' },
  duplicate_title_tag: { label: 'Duplicate title', sev: 'error' },
  has_micromarkup_errors: { label: 'Microdata errors', sev: 'error' },
  high_loading_time: { label: 'High load time', sev: 'warning' },
  high_waiting_time: { label: 'High TTFB', sev: 'warning' },
  https_to_http_links: { label: 'HTTPS→HTTP links', sev: 'warning' },
  no_image_alt: { label: 'Missing alt text', sev: 'warning' },
  no_favicon: { label: 'No favicon', sev: 'warning' },
  title_too_long: { label: 'Title too long', sev: 'warning' },
  title_too_short: { label: 'Title too short', sev: 'warning' },
  low_content_rate: { label: 'Low text rate', sev: 'warning' },
  has_render_blocking_resources: { label: 'Render-blocking', sev: 'warning' },
  large_page_size: { label: 'Large page', sev: 'warning' },
  low_character_count: { label: 'Low char count', sev: 'warning' },
  deprecated_html_tags: { label: 'Deprecated HTML', sev: 'warning' },
  duplicate_meta_tags: { label: 'Duplicate meta', sev: 'warning' },
  no_encoding_meta_tag: { label: 'Missing charset', sev: 'warning' },
  irrelevant_description: { label: 'Irrelevant desc.', sev: 'warning' },
  irrelevant_title: { label: 'Irrelevant title', sev: 'warning' },
  is_https: { label: 'HTTPS', sev: 'good' },
  has_html_doctype: { label: 'DOCTYPE', sev: 'good' },
  has_micromarkup: { label: 'Structured data', sev: 'good' },
  seo_friendly_url: { label: 'SEO URL', sev: 'good' },
  canonical: { label: 'Canonical set', sev: 'info' },
  is_redirect: { label: 'Has redirect', sev: 'info' },
};

const DOMAIN_CHECKS: Record<string, string> = {
  sitemap: 'Sitemap.xml',
  robots_txt: 'Robots.txt',
  ssl: 'SSL Certificate',
  is_https: 'HTTPS',
  http2: 'HTTP/2',
  www_redirect: 'WWW redirect',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function auth(login: string, pass: string) { return `Basic ${btoa(`${login}:${pass}`)}`; }

function fmt(n?: number) { return n !== undefined && n !== null ? n.toLocaleString('en-GB') : '—'; }

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function scoreColor(score?: number) {
  if (!score) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score?: number) {
  if (!score) return 'bg-slate-100 border-slate-200 text-slate-500';
  if (score >= 80) return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (score >= 50) return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-red-50 border-red-200 text-red-700';
}

function countPageIssues(page: AuditPage) {
  if (!page.checks) return { errors: 0, warnings: 0 };
  let errors = 0, warnings = 0;
  for (const [k, v] of Object.entries(page.checks)) {
    if (!v) continue;
    const sev = PAGE_CHECKS[k]?.sev;
    if (sev === 'error') errors++;
    else if (sev === 'warning') warnings++;
  }
  return { errors, warnings };
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function createAuditTask(
  target: string, startUrl: string | undefined, maxPages: number, login: string, pass: string
): Promise<{ taskId: string; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target, max_crawl_pages: maxPages };
  if (startUrl) body.start_url = startUrl;
  const res = await fetch('https://api.dataforseo.com/v3/on_page/task_post', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { taskId: '', error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> };
  const task = data?.tasks?.[0];
  if (!task) return { taskId: '', error: 'Empty API response.' };
  if (task.status_code !== 20100 && task.status_code !== 20000) return { taskId: '', error: `DataForSEO: ${task.status_message}` };
  return { taskId: task.id ?? '', cost: task.cost };
}

async function fetchSummary(taskId: string, login: string, pass: string): Promise<{ summary?: SummaryResult; error?: string }> {
  const res = await fetch(`https://api.dataforseo.com/v3/on_page/summary/${taskId}`, {
    headers: { Authorization: auth(login, pass) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: SummaryResult[] }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { summary: task.result?.[0] };
}

async function fetchPages(taskId: string, login: string, pass: string): Promise<{ pages?: AuditPage[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/pages', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      id: taskId,
      limit: 1000,
      filters: [['resource_type', '=', 'html']],
    }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: AuditPage[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { pages: task.result?.[0]?.items ?? [] };
}

async function fetchKeywordDensity(taskId: string, keywordLength: number, login: string, pass: string): Promise<{ items?: KwDensityItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/keyword_density', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, keyword_length: keywordLength, limit: 200, order_by: [['frequency', 'desc']] }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: KwDensityItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { items: task.result?.[0]?.items ?? [] };
}

async function fetchLinks(taskId: string, login: string, pass: string): Promise<{ items?: LinkItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/links', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, limit: 1000 }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: LinkItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { items: task.result?.[0]?.items ?? [] };
}

async function fetchResources(taskId: string, login: string, pass: string): Promise<{ items?: ResourceItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/resources', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, limit: 1000 }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: ResourceItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { items: task.result?.[0]?.items ?? [] };
}

async function fetchDuplicateTags(taskId: string, login: string, pass: string): Promise<{ items?: DuplicateTagItem[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/duplicate_tags', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, limit: 200 }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: DuplicateTagItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { items: task.result?.[0]?.items ?? [] };
}

async function fetchNonIndexable(taskId: string, login: string, pass: string): Promise<{ items?: AuditPage[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/pages', {
    method: 'POST',
    headers: { Authorization: auth(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      id: taskId,
      limit: 1000,
      filters: [['resource_type', '=', 'html'], 'and', ['non_indexable', '=', true]],
    }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: AuditPage[] }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return { error: `DataForSEO: ${task?.status_message}` };
  return { items: task.result?.[0]?.items ?? [] };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ?? 'bg-slate-50 border-slate-100'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-lg font-black text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function IssueRow({ label, count, sev }: { label: string; count: number; sev: Sev }) {
  const bar = sev === 'error' ? 'bg-red-400' : sev === 'warning' ? 'bg-amber-400' : 'bg-blue-300';
  const text = sev === 'error' ? 'text-red-600' : sev === 'warning' ? 'text-amber-600' : 'text-blue-500';
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className={`text-[10px] font-black uppercase tracking-widest w-12 text-right tabular-nums ${text}`}>{count}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, (count / 5) * 100)}%` }} />
      </div>
      <span className="text-xs text-slate-600 flex-1">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SiteAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const view = params.view ?? 'overview';
  const kwLen = parseInt(params.kw_len ?? '1', 10) || 1;

  let createError: string | null = null;

  // Step 1: create task from ?target=
  if (params.target?.trim() && !params.task_id) {
    const target = params.target.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!target) {
      createError = 'Invalid domain.';
    } else if (!creds) {
      createError = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const maxPages = 50;
      const { taskId, cost, error } = await createAuditTask(target, undefined, maxPages, creds.login, creds.pass);
      if (error || !taskId) {
        createError = error ?? 'Failed to create task.';
      } else {
        upsertSiteAuditTask({ id: taskId, ts: Date.now(), target, maxCrawlPages: maxPages, status: 'pending', cost });
        redirect(`/dashboard/on-page/site-audit?task_id=${taskId}`);
      }
    }
  }

  // Step 2: load/poll task
  let activeTask: SiteAuditEntry | null = null;
  let summary: SummaryResult | null = null;
  let auditPages: AuditPage[] | null = null;
  const taskError: string | null = null;

  if (params.task_id) {
    activeTask = getSiteAuditTask(params.task_id);

    if (activeTask?.status === 'finished') {
      summary = getSiteAuditSummary<SummaryResult>(params.task_id);
      auditPages = getSiteAuditPages<AuditPage>(params.task_id);
    } else if (creds && activeTask && activeTask.status !== 'error') {
      const { summary: fetchedSummary, error: sumErr } = await fetchSummary(params.task_id, creds.login, creds.pass);
      if (sumErr) {
        // Transient failure — task is likely still queued. Keep as in_progress, don't mark error.
        activeTask = { ...activeTask, status: 'in_progress' };
        upsertSiteAuditTask(activeTask);
      } else if (fetchedSummary) {
        const pagesCrawled = fetchedSummary.crawl_status.pages_crawled;
        if (fetchedSummary.crawl_progress === 'finished') {
          const { pages, error: pagesErr } = await fetchPages(params.task_id, creds.login, creds.pass);
          if (pagesErr) {
            // Pages not ready yet — keep in_progress, user will retry
            activeTask = { ...activeTask, status: 'in_progress', pagesCrawled };
            upsertSiteAuditTask(activeTask);
          } else {
            summary = fetchedSummary;
            auditPages = pages ?? [];
            saveSiteAuditResult(params.task_id, fetchedSummary, auditPages, pagesCrawled);
            activeTask = { ...activeTask, status: 'finished', pagesCrawled };
          }
        } else {
          activeTask = { ...activeTask, status: 'in_progress', pagesCrawled };
          upsertSiteAuditTask(activeTask);
        }
      }
    }
  }

  // Keyword density — fetched live only when that tab is active
  let kwDensityItems: KwDensityItem[] | null = null;
  let kwDensityError: string | null = null;
  if (view === 'keyword_density' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchKeywordDensity(params.task_id, kwLen, creds.login, creds.pass);
    if (error) kwDensityError = error;
    else kwDensityItems = items ?? [];
  }

  let linkItems: LinkItem[] | null = null;
  let linksError: string | null = null;
  if (view === 'links' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchLinks(params.task_id, creds.login, creds.pass);
    if (error) linksError = error;
    else linkItems = items ?? [];
  }

  let resourceItems: ResourceItem[] | null = null;
  let resourcesError: string | null = null;
  if (view === 'resources' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchResources(params.task_id, creds.login, creds.pass);
    if (error) resourcesError = error;
    else resourceItems = items ?? [];
  }

  let dupTagItems: DuplicateTagItem[] | null = null;
  let dupTagsError: string | null = null;
  if (view === 'duplicate_tags' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchDuplicateTags(params.task_id, creds.login, creds.pass);
    if (error) dupTagsError = error;
    else dupTagItems = items ?? [];
  }

  let nonIndexItems: AuditPage[] | null = null;
  let nonIndexError: string | null = null;
  if (view === 'non_indexable' && params.task_id && creds && activeTask?.status === 'finished') {
    const { items, error } = await fetchNonIndexable(params.task_id, creds.login, creds.pass);
    if (error) nonIndexError = error;
    else nonIndexItems = items ?? [];
  }

  const history = getSiteAuditHistory();
  const score = summary?.page_metrics?.onpage_score;
  const isFinished = activeTask?.status === 'finished' && summary;

  // Build issues breakdown from summary checks
  const issuesList: Array<{ key: string; count: number; label: string; sev: Sev }> = [];
  if (summary?.page_metrics?.checks) {
    for (const [k, count] of Object.entries(summary.page_metrics.checks)) {
      if (!count || count === 0) continue;
      const meta = PAGE_CHECKS[k];
      if (!meta) continue;
      issuesList.push({ key: k, count, label: meta.label, sev: meta.sev });
    }
    issuesList.sort((a, b) => {
      const sevOrder: Record<Sev, number> = { error: 0, warning: 1, info: 2, good: 3 };
      if (sevOrder[a.sev] !== sevOrder[b.sev]) return sevOrder[a.sev] - sevOrder[b.sev];
      return b.count - a.count;
    });
  }

  const errors = issuesList.filter((i) => i.sev === 'error');
  const warnings = issuesList.filter((i) => i.sev === 'warning');

  // CSV for pages
  const csvData = (auditPages ?? []).map((p) => {
    const { errors: e, warnings: w } = countPageIssues(p);
    return {
      url: p.url ?? '',
      status_code: p.status_code ?? '',
      onpage_score: p.onpage_score?.toFixed(1) ?? '',
      title: p.meta?.title ?? '',
      title_length: p.meta?.title_length ?? '',
      description: p.meta?.description ?? '',
      errors: e,
      warnings: w,
      load_time_ms: p.page_timing?.duration_time ?? '',
      word_count: p.content?.plain_text_word_count ?? '',
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/on-page" className="hover:text-slate-600 transition-colors">On Page</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Site Audit</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Site Audit</h1>
        <p className="text-sm text-slate-400 mt-1">Full site crawl — global score, all pages, SEO issues, SSL, sitemap, links.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel="Start audit"
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Target domain</label>
            <input
              type="text" name="target"
              placeholder="example.com"
              required
              defaultValue={activeTask?.target ?? ''}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800"
            />
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-100 dark:border-amber-900 rounded-xl px-4 py-3">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Cost: <span className="font-black">~$0.003/page crawled</span> — 50 pages max by default → estimated <span className="font-black">~$0.15</span>.
            The crawl can take a few minutes depending on site size.
          </p>
        </div>
      </SearchForm>

      {/* Errors */}
      {(createError || taskError) && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">
          {createError ?? taskError}
        </div>
      )}

      {/* Task status */}
      {params.task_id && activeTask && !taskError && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">

          {/* Task header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={activeTask.status} />
                <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{activeTask.target}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Started {formatDate(activeTask.ts)}
                {activeTask.cost !== undefined && ` · creation $${activeTask.cost.toFixed(5)}`}
                {activeTask.pagesCrawled !== undefined && ` · ${activeTask.pagesCrawled} pages crawled`}
              </p>
            </div>
            {activeTask.status !== 'finished' && (
              <a href={`/dashboard/on-page/site-audit?task_id=${activeTask.id}`}
                className="shrink-0 text-[11px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 border border-blue-100 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-all bg-blue-50 dark:bg-blue-950">
                Refresh ↺
              </a>
            )}
          </div>

          {/* In progress */}
          {activeTask.status !== 'finished' && (
            <div className="px-6 py-12 text-center space-y-3">
              <AutoRefresh intervalMs={15000} />
              <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Crawling in progress…
              </div>
              {activeTask.pagesCrawled !== undefined && (
                <p className="text-xs text-slate-400">{activeTask.pagesCrawled} / {activeTask.maxCrawlPages} pages crawled</p>
              )}
              <p className="text-xs text-slate-400">Checking automatically every 15 seconds.</p>
            </div>
          )}

          {/* Results: tab navigation */}
          {isFinished && (
            <>
              <div className="px-4 pt-3 flex gap-0.5 flex-wrap border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
                {([
                  ['overview',       'Overview'],
                  ['pages',          `Pages (${auditPages?.length ?? 0})`],
                  ['links',          'Links'],
                  ['resources',      'Resources'],
                  ['duplicate_tags', 'Dup. Tags'],
                  ['non_indexable',  'Non-indexable'],
                  ['keyword_density','Keyword Density'],
                ] as const).map(([t, label]) => (
                  <a key={t} href={`/dashboard/on-page/site-audit?task_id=${activeTask!.id}&view=${t}`}
                    className={`px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-t-lg transition-colors whitespace-nowrap ${
                      view === t
                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}>
                    {label}
                  </a>
                ))}
              </div>

              {/* ── Overview tab ── */}
              {view === 'overview' && summary && (
                <div className="p-6 space-y-6">
                  {/* Score + crawl stats */}
                  <div className="flex gap-4 items-start flex-wrap">
                    {score !== undefined && (
                      <div className={`shrink-0 rounded-2xl border-2 px-8 py-5 text-center ${scoreBg(score)}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">OnPage Score</p>
                        <p className={`text-4xl font-black ${scoreColor(score)}`}>{score.toFixed(1)}</p>
                        <p className="text-[11px] text-slate-400">/ 100</p>
                      </div>
                    )}
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <StatCard label="Pages crawled" value={fmt(summary.crawl_status.pages_crawled)} sub={`/ ${fmt(summary.crawl_status.max_crawl_pages)} max`} />
                      {summary.page_metrics?.broken_links !== undefined && (
                        <StatCard label="Broken links" value={fmt(summary.page_metrics.broken_links)}
                          accent={summary.page_metrics.broken_links > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'} />
                      )}
                      {summary.page_metrics?.non_indexable !== undefined && (
                        <StatCard label="Non-indexable" value={fmt(summary.page_metrics.non_indexable)} />
                      )}
                      {summary.page_metrics?.duplicate_title !== undefined && (
                        <StatCard label="Duplicate titles" value={fmt(summary.page_metrics.duplicate_title)} />
                      )}
                      {summary.page_metrics?.duplicate_description !== undefined && (
                        <StatCard label="Duplicate desc." value={fmt(summary.page_metrics.duplicate_description)} />
                      )}
                      {summary.page_metrics?.internal_links_count !== undefined && (
                        <StatCard label="Internal links" value={fmt(summary.page_metrics.internal_links_count)} />
                      )}
                    </div>
                  </div>

                  {/* Domain health */}
                  {summary.domain_info && (
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Domain health</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {summary.domain_info.server && (
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Server</p>
                            <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">{summary.domain_info.server}</p>
                          </div>
                        )}
                        {summary.domain_info.cms && (
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">CMS</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-0.5">{summary.domain_info.cms}</p>
                          </div>
                        )}
                        {summary.domain_info.ip && (
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">IP</p>
                            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-0.5">{summary.domain_info.ip}</p>
                          </div>
                        )}
                        {summary.domain_info.ssl_info && (
                          <div className={`rounded-xl border px-4 py-3 ${summary.domain_info.ssl_info.valid_certificate ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">SSL</p>
                            <p className={`text-sm font-bold mt-0.5 ${summary.domain_info.ssl_info.valid_certificate ? 'text-emerald-700' : 'text-red-700'}`}>
                              {summary.domain_info.ssl_info.valid_certificate ? '✓ Valid' : '✕ Invalid'}
                            </p>
                            {summary.domain_info.ssl_info.certificate_expiration_date && (
                              <p className="text-[10px] text-slate-400 mt-0.5">Exp: {summary.domain_info.ssl_info.certificate_expiration_date.slice(0, 10)}</p>
                            )}
                          </div>
                        )}
                        {summary.domain_info.checks && Object.entries(DOMAIN_CHECKS).map(([k, label]) => {
                          const val = summary!.domain_info!.checks![k];
                          if (val === undefined) return null;
                          return (
                            <div key={k} className={`rounded-xl border px-4 py-3 ${val ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                              <p className={`text-sm font-bold mt-0.5 ${val ? 'text-emerald-700' : 'text-slate-500'}`}>{val ? '✓ Present' : '✕ Absent'}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {issuesList.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {errors.length > 0 && (
                        <div>
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-3">Critical errors</h3>
                          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-2">
                            {errors.map((i) => <IssueRow key={i.key} label={i.label} count={i.count} sev={i.sev} />)}
                          </div>
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <div>
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-3">Warnings</h3>
                          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-2">
                            {warnings.slice(0, 15).map((i) => <IssueRow key={i.key} label={i.label} count={i.count} sev={i.sev} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Keyword Density tab ── */}
              {view === 'keyword_density' && (
                <div>
                  {/* N-gram selector */}
                  <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">N-gram</span>
                    {[1, 2, 3].map((n) => (
                      <a key={n}
                        href={`/dashboard/on-page/site-audit?task_id=${activeTask!.id}&view=keyword_density&kw_len=${n}`}
                        className={`px-3 py-1 text-[11px] font-black uppercase tracking-widest rounded-lg border transition-colors ${
                          kwLen === n
                            ? 'bg-slate-900 dark:bg-slate-700 text-white border-slate-900'
                            : 'text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}>
                        {n === 1 ? 'Unigram' : n === 2 ? 'Bigram' : 'Trigram'}
                      </a>
                    ))}
                    {kwDensityItems && (
                      <span className="ml-auto text-[11px] text-slate-400">{kwDensityItems.length} keywords</span>
                    )}
                  </div>

                  {kwDensityError && (
                    <div className="px-6 py-4 text-sm text-red-600">{kwDensityError}</div>
                  )}

                  {!kwDensityItems && !kwDensityError && (
                    <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>
                  )}

                  {kwDensityItems && kwDensityItems.length === 0 && (
                    <div className="px-6 py-12 text-center text-sm text-slate-400">No results.</div>
                  )}

                  {kwDensityItems && kwDensityItems.length > 0 && (
                    <KeywordDensityTable items={kwDensityItems} />
                  )}
                </div>
              )}

              {/* ── Pages tab ── */}
              {view === 'pages' && auditPages && (
                <div>
                  <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-400">{auditPages.length} page{auditPages.length !== 1 ? 's' : ''} HTML</span>
                    {auditPages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <CopyMarkdownButton
                          data={csvData}
                          columns={[
                            { key: 'url', label: 'URL' },
                            { key: 'status_code', label: 'Status' },
                            { key: 'onpage_score', label: 'Score' },
                            { key: 'title', label: 'Title' },
                            { key: 'title_length', label: 'Title Length' },
                            { key: 'description', label: 'Description' },
                            { key: 'errors', label: 'Errors' },
                            { key: 'warnings', label: 'Warnings' },
                            { key: 'load_time_ms', label: 'Load Time (ms)' },
                            { key: 'word_count', label: 'Word Count' },
                          ]}
                        />
                        <ExportCSVButton
                          data={csvData}
                          filename={`site-audit-${activeTask!.target}.csv`}
                          columns={[
                            { key: 'url', label: 'URL' },
                            { key: 'status_code', label: 'Status' },
                            { key: 'onpage_score', label: 'Score' },
                            { key: 'title', label: 'Title' },
                            { key: 'title_length', label: 'Title Length' },
                            { key: 'description', label: 'Description' },
                            { key: 'errors', label: 'Errors' },
                            { key: 'warnings', label: 'Warnings' },
                            { key: 'load_time_ms', label: 'Load Time (ms)' },
                            { key: 'word_count', label: 'Word Count' },
                          ]}
                        />
                      </div>
                    )}
                  </div>
                  {auditPages.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-slate-400">No HTML pages found.</div>
                  ) : (
                    <SiteAuditPagesTable pages={auditPages} />
                  )}
                </div>
              )}
              {/* ── Links tab ── */}
              {view === 'links' && (
                <div>
                  {linksError && <div className="px-6 py-4 text-sm text-red-600">{linksError}</div>}
                  {!linkItems && !linksError && <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>}
                  {linkItems && (
                    linkItems.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-slate-400">No links found.</div>
                    ) : (
                      <LinksTable links={linkItems} />
                    )
                  )}
                </div>
              )}

              {/* ── Resources tab ── */}
              {view === 'resources' && (
                <div>
                  {resourcesError && <div className="px-6 py-4 text-sm text-red-600">{resourcesError}</div>}
                  {!resourceItems && !resourcesError && <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>}
                  {resourceItems && (
                    resourceItems.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-slate-400">No resources found.</div>
                    ) : (
                      <ResourcesTable resources={resourceItems} />
                    )
                  )}
                </div>
              )}

              {/* ── Duplicate Tags tab ── */}
              {view === 'duplicate_tags' && (
                <div>
                  {dupTagsError && <div className="px-6 py-4 text-sm text-red-600">{dupTagsError}</div>}
                  {!dupTagItems && !dupTagsError && <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>}
                  {dupTagItems && dupTagItems.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <p className="text-emerald-600 font-bold text-sm">No duplicate tags found.</p>
                      <p className="text-slate-400 text-xs mt-1">All pages have unique title and description tags.</p>
                    </div>
                  )}
                  {dupTagItems && dupTagItems.length > 0 && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dupTagItems.map((group, i) => (
                        <div key={i} className="px-6 py-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                              {group.type === 'duplicate_title' ? 'Duplicate Title' : 'Duplicate Description'}
                            </span>
                            <span className="text-[11px] text-slate-400">{group.pages?.length ?? 0} pages</span>
                          </div>
                          {group.tag && (
                            <p className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg mb-3 truncate">
                              &ldquo;{group.tag}&rdquo;
                            </p>
                          )}
                          <div className="space-y-1">
                            {group.pages?.map((page, pi) => (
                              <a key={pi} href={page.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[11px] font-mono text-blue-600 hover:underline truncate block">
                                {page.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Non-indexable tab ── */}
              {view === 'non_indexable' && (
                <div>
                  {nonIndexError && <div className="px-6 py-4 text-sm text-red-600">{nonIndexError}</div>}
                  {!nonIndexItems && !nonIndexError && <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>}
                  {nonIndexItems && nonIndexItems.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <p className="text-emerald-600 font-bold text-sm">No non-indexable pages found.</p>
                      <p className="text-slate-400 text-xs mt-1">All crawled pages appear to be indexable.</p>
                    </div>
                  )}
                  {nonIndexItems && nonIndexItems.length > 0 && (
                    <NonIndexableTable pages={nonIndexItems} />
                  )}
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === params.task_id;
              return (
                <a key={entry.id} href={`/dashboard/on-page/site-audit?task_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={entry.status} />
                      <p className={`text-sm font-medium truncate font-mono ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {entry.target}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.pagesCrawled !== undefined ? `${entry.pagesCrawled} pages crawled` : `${entry.maxCrawlPages} max`}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(5)}` : ''}
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

function StatusBadge({ status }: { status: SiteAuditEntry['status'] }) {
  const map: Record<SiteAuditEntry['status'], string> = {
    pending: 'text-slate-400 bg-slate-100 dark:bg-slate-800',
    in_progress: 'text-blue-500 bg-blue-50 dark:bg-blue-950 border border-blue-100',
    finished: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100',
    error: 'text-red-500 bg-red-50 dark:bg-red-950 border border-red-100',
  };
  const labels: Record<SiteAuditEntry['status'], string> = {
    pending: 'Pending', in_progress: 'In progress', finished: 'Finished', error: 'Error',
  };
  return <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${map[status]}`}>{labels[status]}</span>;
}
