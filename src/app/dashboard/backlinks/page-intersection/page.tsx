import { getCredentials, getBlPageIntHistory, saveBlPageInt, getBlPageIntResults, type BlPageIntEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import PageIntersectionTable, { type PageIntItem } from './PageIntersectionTable';

interface SearchParams { targets?: string; history_id?: string; }

async function fetchPageInt(targets: string[], login: string, pass: string): Promise<{ items: PageIntItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: PageIntItem[] }>(
    'backlinks/page_intersection/live',
    { targets: targets.map((t) => ({ url: t, type: 'url' })), limit: 500, order_by: ['page_from_rank,desc'] },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function BacklinksPageIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawTargets = params.targets?.trim() ?? '';
  const historyId = params.history_id;

  let items: PageIntItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let targetList: string[] = [];
  let activeEntry: BlPageIntEntry | null = null;

  if (historyId) {
    const saved = getBlPageIntResults<PageIntItem>(historyId);
    if (saved) {
      items = saved;
      activeEntry = getBlPageIntHistory().find((e) => e.id === historyId) ?? null;
      targetList = (activeEntry?.targets ?? '').split(', ');
    } else error = 'Search no longer available.';
  } else if (rawTargets) {
    targetList = rawTargets.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 20);
    if (targetList.length < 2) { error = 'Enter at least 2 targets (one per line).'; }
    else {
      const dedupeId = stableSearchId(['bl-page-intersection', targetList.join(',')]);
      const cached = getBlPageIntResults<PageIntItem>(dedupeId);
      if (cached) {
        items = cached;
        const cachedEntry = getBlPageIntHistory().find((e) => e.id === dedupeId);
        cost = cachedEntry?.cost;
      } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
      else {
        const result = await fetchPageInt(targetList, creds.login, creds.pass);
        items = result.items; cost = result.cost; error = result.error ?? null;
        if (!error && items.length > 0) {
          const entry: BlPageIntEntry = { id: dedupeId, ts: Date.now(), targets: targetList.join(', '), count: items.length, cost };
          saveBlPageInt(entry, items);
        }
      }
    }
  }

  const history = getBlPageIntHistory();

  const csvData = items.map((item) => ({
    url_from: item.url_from ?? '',
    domain_from: item.domain_from ?? '',
    page_from_rank: item.page_from_rank ?? '',
    spam_score: item.backlinks_spam_score ?? '',
    targets_linked: item.url_to?.length ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Page Intersection</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Backlink Page Intersection</h1>
        <p className="text-sm text-slate-400 mt-1">Find external pages that link to multiple of your targets simultaneously.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Find intersection" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Target URLs or domains <span className="normal-case font-normal tracking-normal text-slate-300">(2–20, one per line)</span></label>
          <textarea name="targets" rows={4} defaultValue={activeEntry ? targetList.join('\n') : rawTargets} placeholder={"example.com\nhttps://example.com/page-a\nhttps://other.com"} required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y bg-white dark:bg-slate-800" />
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawTargets) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} pages link to all targets</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'url_from',label:'From URL'},{key:'domain_from',label:'Domain'},{key:'page_from_rank',label:'DR'},{key:'spam_score',label:'Spam'},{key:'targets_linked',label:'Targets Linked'}]} />
                  <ExportCSVButton data={csvData} filename="backlinks-page-intersection.csv" columns={[{key:'url_from',label:'From URL'},{key:'domain_from',label:'Domain'},{key:'page_from_rank',label:'DR'},{key:'spam_score',label:'Spam'},{key:'targets_linked',label:'Targets Linked'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No common linking pages found.</div>
          ) : (
            <PageIntersectionTable items={items} />
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/backlinks/page-intersection?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.targets}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} results{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
