import { getCredentials } from '@/lib/db';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';

interface ContentBlock {
  type?: string;
  content?: string;
  level?: number;
}

interface ContentInfo {
  content_quality_score?: number;
  sentence_count?: number;
  word_count?: number;
  character_count?: number;
  automated_readability_index?: number;
  coleman_liau_index?: number;
}

interface ParsedPage {
  url?: string;
  title?: string;
  description?: string;
  content?: {
    plain_text?: string;
    title?: string;
    description?: string;
    blocks?: ContentBlock[];
  };
  content_info?: ContentInfo;
  meta?: { title?: string; description?: string; robots?: string; canonical?: string };
  page_category?: Array<{ code?: number; name?: string; confidence?: number }>;
}

interface SearchParams { url?: string }

async function fetchContentParsing(url: string, login: string, pass: string): Promise<{ result?: ParsedPage; error?: string }> {
  return callDataForSeoFirst<ParsedPage>('on_page/content_parsing/live', { url }, { login, pass }, 30_000);
}

const BLOCK_STYLES: Record<string, { tag: string; cls: string }> = {
  title:     { tag: 'h1', cls: 'text-2xl font-black text-slate-900 dark:text-white mb-3' },
  heading_1: { tag: 'h1', cls: 'text-xl font-black text-slate-900 dark:text-white mt-6 mb-2' },
  heading_2: { tag: 'h2', cls: 'text-lg font-bold text-slate-800 dark:text-slate-200 mt-5 mb-2' },
  heading_3: { tag: 'h3', cls: 'text-base font-bold text-slate-700 dark:text-slate-300 mt-4 mb-1' },
  heading_4: { tag: 'h4', cls: 'text-sm font-bold text-slate-700 dark:text-slate-300 mt-3 mb-1' },
  paragraph: { tag: 'p',  cls: 'text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2' },
  list_item: { tag: 'li', cls: 'text-sm text-slate-600 dark:text-slate-400 leading-relaxed ml-4 list-disc' },
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ?? 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-lg font-black text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function scoreLabel(score?: number) {
  if (score == null) return null;
  if (score >= 80) return { label: 'Good', cls: 'text-emerald-600' };
  if (score >= 50) return { label: 'Average', cls: 'text-amber-500' };
  return { label: 'Poor', cls: 'text-red-500' };
}

export default async function ContentParsingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawUrl = params.url?.trim() ?? '';

  let result: ParsedPage | null = null;
  let error: string | null = null;

  if (rawUrl) {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const r = await fetchContentParsing(url, creds.login, creds.pass);
      if (r.error) error = r.error;
      else result = r.result ?? null;
    }
  }

  const blocks = result?.content?.blocks ?? [];
  const info = result?.content_info;
  const sc = scoreLabel(info?.content_quality_score);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/on-page" className="hover:text-slate-600 transition-colors">On Page</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Content Parsing</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Content Parsing</h1>
        <p className="text-sm text-slate-400 mt-1">Extract and structure all content from a URL — headings, paragraphs, readability, categories.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Parse page" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors" disabled={!creds}>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Page URL</label>
          <input type="text" name="url" defaultValue={rawUrl} placeholder="https://example.com/page" required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
        </div>
        {!creds && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Configure DataForSEO credentials in Settings to use this tool.</p>
        )}
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {result && (
        <div className="space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {info?.word_count != null && <StatCard label="Words" value={info.word_count.toLocaleString('en-GB')} />}
            {info?.sentence_count != null && <StatCard label="Sentences" value={info.sentence_count} />}
            {info?.content_quality_score != null && (
              <StatCard
                label="Quality score"
                value={`${info.content_quality_score.toFixed(0)} ${sc?.label ?? ''}`}
                accent={info.content_quality_score >= 80 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800' : info.content_quality_score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}
              />
            )}
            {info?.automated_readability_index != null && (
              <StatCard label="Readability (ARI)" value={info.automated_readability_index.toFixed(1)} sub="grade level" />
            )}
          </div>

          {/* Meta */}
          {result.meta && (
            <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Meta</h2>
              </div>
              <div className="p-6 space-y-3 text-sm">
                {result.meta.title && (
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Title</span>
                    <p className="text-slate-900 dark:text-slate-200 font-medium">{result.meta.title}</p>
                  </div>
                )}
                {result.meta.description && (
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Description</span>
                    <p className="text-slate-600 dark:text-slate-400">{result.meta.description}</p>
                  </div>
                )}
                <div className="flex gap-4 flex-wrap pt-1">
                  {result.meta.robots && (
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Robots</span>
                      <code className="text-xs font-mono text-slate-600 dark:text-slate-400">{result.meta.robots}</code>
                    </div>
                  )}
                  {result.meta.canonical && (
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Canonical</span>
                      <a href={result.meta.canonical} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 hover:underline truncate block max-w-xs">{result.meta.canonical}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Categories */}
          {result.page_category && result.page_category.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Page categories</h2>
              <div className="flex gap-2 flex-wrap">
                {result.page_category.map((cat, i) => (
                  <span key={i} className="text-[11px] font-semibold px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900">
                    {cat.name ?? cat.code}
                    {cat.confidence != null && <span className="ml-1 text-blue-400">{(cat.confidence * 100).toFixed(0)}%</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Content blocks */}
          {blocks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Content structure</h2>
                <span className="text-[11px] text-slate-400">{blocks.length} blocks</span>
              </div>
              <div className="p-6 max-h-[600px] overflow-y-auto scrollbar-thin">
                {blocks.map((block, i) => {
                  const style = BLOCK_STYLES[block.type ?? ''];
                  if (!style || !block.content) return null;
                  return (
                    <div key={i} className={style.cls}>{block.content}</div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
