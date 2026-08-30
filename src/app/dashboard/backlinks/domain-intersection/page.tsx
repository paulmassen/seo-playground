import { getCredentials, getSetting, getBlDomIntHistory, saveBlDomInt, getBlDomIntResults, type BlDomIntEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import DomainIntersectionTable from './DomainIntersectionTable';

interface DomIntItem {
  domain_from?: string;
  domain_from_rank?: number;
  backlinks_from_target1?: number;
  backlinks_from_target2?: number;
  first_seen?: string;
  last_seen?: string;
}

interface SearchParams { target1?: string; target2?: string; history_id?: string; }

async function fetchDomInt(target1: string, target2: string, login: string, pass: string): Promise<{ items: DomIntItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: DomIntItem[] }>(
    'backlinks/domain_intersection/live',
    { target1, target2, limit: 500, order_by: ['domain_from_rank,desc'] },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function DomainIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const rawTarget1 = params.target1?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const rawTarget2 = params.target2?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const historyId = params.history_id;

  let items: DomIntItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlDomIntEntry | null = null;

  if (historyId) {
    const saved = getBlDomIntResults<DomIntItem>(historyId);
    if (saved) { items = saved; activeEntry = getBlDomIntHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget1 && rawTarget2) {
    const dedupeId = stableSearchId(['bl-domain-intersection', rawTarget1, rawTarget2]);
    const cached = getBlDomIntResults<DomIntItem>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlDomIntHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchDomInt(rawTarget1, rawTarget2, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlDomIntEntry = { id: dedupeId, ts: Date.now(), target1: rawTarget1, target2: rawTarget2, count: items.length, cost };
        saveBlDomInt(entry, items);
      }
    }
  }

  const history = getBlDomIntHistory();
  const t1 = activeEntry?.target1 ?? rawTarget1;
  const t2 = activeEntry?.target2 ?? rawTarget2;

  const csvData = items.map((item) => ({
    domain_from: item.domain_from ?? '',
    domain_from_rank: item.domain_from_rank ?? '',
    backlinks_to_target1: item.backlinks_from_target1 ?? '',
    backlinks_to_target2: item.backlinks_from_target2 ?? '',
    first_seen: item.first_seen ?? '',
    last_seen: item.last_seen ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Domain Intersection</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Domain Intersection</h1>
        <p className="text-sm text-slate-400 mt-1">Domains that link to both your site and a competitor simultaneously.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Compare" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Your domain</label>
            <input type="text" name="target1" defaultValue={t1 || defaultDomain} placeholder="yourdomain.com" required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Competitor domain</label>
            <input type="text" name="target2" defaultValue={t2} placeholder="competitor.com" required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || (rawTarget1 && rawTarget2)) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} shared linking domains</span>
              {t1 && t2 && (
                <span className="text-[11px] text-slate-400">
                  <span className="font-mono text-blue-600">{t1}</span> ∩ <span className="font-mono text-violet-600">{t2}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && <CopyMarkdownButton data={csvData} columns={[{key:'domain_from',label:'Linking Domain'},{key:'domain_from_rank',label:'DR'},{key:'backlinks_to_target1',label:`BL → ${t1}`},{key:'backlinks_to_target2',label:`BL → ${t2}`},{key:'first_seen',label:'First Seen'},{key:'last_seen',label:'Last Seen'}]} />}
              {items.length > 0 && <ExportCSVButton data={csvData} filename={`domain-intersection-${t1}-${t2}.csv`} columns={[{key:'domain_from',label:'Linking Domain'},{key:'domain_from_rank',label:'DR'},{key:'backlinks_to_target1',label:`BL → ${t1}`},{key:'backlinks_to_target2',label:`BL → ${t2}`},{key:'first_seen',label:'First Seen'},{key:'last_seen',label:'Last Seen'}]} />}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No common linking domains found.</div>
          ) : (
            <DomainIntersectionTable items={items} t1={t1} t2={t2} />
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
                <a key={entry.id} href={`/dashboard/backlinks/domain-intersection?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {entry.target1} ∩ {entry.target2}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} common domains{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
