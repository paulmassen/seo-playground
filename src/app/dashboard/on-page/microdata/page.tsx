import { getCredentials, getOnpageTasks, upsertOnpageTask, getOnpageResult, saveOnpageResult, type OnpageTask } from '@/lib/db';
import { redirect } from 'next/navigation';
import SearchForm from '@/components/SearchForm';

interface TestResult {
  level: 'fatal' | 'error' | 'warning' | 'info';
  message: string;
}

interface MicrodataField {
  name: string;
  types: string[] | null;
  value: string[] | null;
  test_results: TestResult | null;
  fields: MicrodataField[] | null;
}

interface MicrodataItem {
  type: string;
  inspection_info: {
    types: string[];
    fields: MicrodataField[];
  };
}

interface MicrodataResult {
  crawl_progress: 'in_progress' | 'finished';
  crawl_status: { max_crawl_pages: number; pages_in_queue: number; pages_crawled: number };
  test_summary: { fatal: number; error: number; warning: number; info: number };
  items_count: number;
  items: MicrodataItem[];
}

interface SearchParams {
  url?: string;
  task_id?: string;
}

function authHeader(login: string, pass: string) {
  return `Basic ${btoa(`${login}:${pass}`)}`;
}

async function createTask(url: string, login: string, pass: string): Promise<{ taskId: string; cost?: number; error?: string }> {
  const urlObj = new URL(url);
  const target = urlObj.hostname.replace(/^www\./, '');
  const res = await fetch('https://api.dataforseo.com/v3/on_page/task_post', {
    method: 'POST',
    headers: { Authorization: authHeader(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target, start_url: url, max_crawl_pages: 1, validate_micromarkup: true }]),
  });
  if (!res.ok) return { taskId: '', error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> };
  const task = data?.tasks?.[0];
  if (!task) return { taskId: '', error: 'Réponse API vide.' };
  if (task.status_code !== 20100 && task.status_code !== 20000) return { taskId: '', error: `DataForSEO: ${task.status_message}` };
  return { taskId: task.id ?? '', cost: task.cost };
}

async function checkSummary(taskId: string, login: string, pass: string): Promise<'in_progress' | 'finished' | 'error'> {
  const res = await fetch(`https://api.dataforseo.com/v3/on_page/summary/${taskId}`, {
    headers: { Authorization: authHeader(login, pass) },
  });
  if (!res.ok) return 'error';
  const data = await res.json() as { tasks?: Array<{ status_code?: number; result?: Array<{ crawl_progress: string }> }> };
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) return 'error';
  return task.result?.[0]?.crawl_progress === 'finished' ? 'finished' : 'in_progress';
}

async function fetchMicrodata(taskId: string, url: string, login: string, pass: string): Promise<{ result?: MicrodataResult[]; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/on_page/microdata', {
    method: 'POST',
    headers: { Authorization: authHeader(login, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: taskId, url }]),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: MicrodataResult[] }> };
  const task = data?.tasks?.[0];
  if (!task) return { error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) return { error: `DataForSEO: ${task.status_message}` };
  return { result: task.result };
}

function levelStyle(level: string): string {
  switch (level) {
    case 'fatal': return 'text-red-700 bg-red-50 border border-red-200';
    case 'error': return 'text-red-600 bg-red-50 border border-red-100';
    case 'warning': return 'text-amber-600 bg-amber-50 border border-amber-100';
    default: return 'text-blue-600 bg-blue-50 border border-blue-100';
  }
}

function FieldTree({ fields, depth = 0 }: { fields: MicrodataField[]; depth?: number }) {
  if (!fields?.length) return null;
  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-slate-100 pl-3 mt-2 space-y-3' : 'space-y-3'}>
      {fields.map((field, i) => (
        <div key={i}>
          <div className="flex items-start gap-2 flex-wrap">
            <code className="text-[11px] font-mono font-bold text-slate-500 shrink-0 mt-0.5 bg-slate-100 px-1.5 py-0.5 rounded">{field.name}</code>
            {field.types?.length ? <span className="text-[10px] font-mono text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded shrink-0">{field.types.join(' | ')}</span> : null}
            {field.value?.length ? <span className="text-xs text-slate-700 break-all leading-relaxed">{field.value.join(', ')}</span> : null}
          </div>
          {field.test_results && (
            <div className={`mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg ${levelStyle(field.test_results.level)}`}>
              <span className="font-black uppercase text-[9px] tracking-widest mr-1.5">{field.test_results.level}</span>
              {field.test_results.message}
            </div>
          )}
          {field.fields?.length ? <FieldTree fields={field.fields} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  );
}

function TestSummary({ summary }: { summary: MicrodataResult['test_summary'] }) {
  const badges = [
    { key: 'fatal' as const, label: 'Fatal', cls: 'text-red-700 bg-red-100 border-red-200' },
    { key: 'error' as const, label: 'Error', cls: 'text-red-600 bg-red-50 border-red-100' },
    { key: 'warning' as const, label: 'Warning', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
    { key: 'info' as const, label: 'Info', cls: 'text-blue-500 bg-blue-50 border-blue-100' },
  ];
  const total = badges.reduce((acc, { key }) => acc + summary[key], 0);
  if (total === 0) return <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">No errors</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {badges.filter(({ key }) => summary[key] > 0).map(({ key, label, cls }) => (
        <span key={key} className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${cls}`}>{summary[key]} {label}</span>
      ))}
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: OnpageTask['status']) {
  const map: Record<OnpageTask['status'], string> = {
    pending: 'text-slate-400 bg-slate-100',
    in_progress: 'text-blue-500 bg-blue-50 border border-blue-100',
    finished: 'text-emerald-600 bg-emerald-50 border border-emerald-100',
    error: 'text-red-500 bg-red-50 border border-red-100',
  };
  const labels: Record<OnpageTask['status'], string> = { pending: 'Pending', in_progress: 'In progress', finished: 'Finished', error: 'Error' };
  return <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${map[status]}`}>{labels[status]}</span>;
}

export default async function MicrodataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;

  let createError: string | null = null;

  // Step 1: create task from ?url=
  if (params.url?.trim() && !params.task_id) {
    let rawUrl = params.url.trim();
    if (!rawUrl.startsWith('http')) rawUrl = `https://${rawUrl}`;
    let validUrl = false;
    try { new URL(rawUrl); validUrl = true; } catch { /* noop */ }

    if (!validUrl) {
      createError = 'URL invalide.';
    } else if (!creds) {
      createError = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const { taskId, cost, error } = await createTask(rawUrl, creds.login, creds.pass);
      if (error || !taskId) {
        createError = error ?? 'Impossible de créer la tâche.';
      } else {
        const urlObj = new URL(rawUrl);
        upsertOnpageTask({ id: taskId, ts: Date.now(), url: rawUrl, target: urlObj.hostname, status: 'pending', cost });
        redirect(`/dashboard/on-page/microdata?task_id=${taskId}`);
      }
    }
  }

  // Step 2: load task results from ?task_id=
  let activeTask: OnpageTask | null = null;
  let microdataResults: MicrodataResult[] | null = null;
  let taskError: string | null = null;

  if (params.task_id) {
    const index = getOnpageTasks();
    activeTask = index.find((e) => e.id === params.task_id) ?? null;
    const cached = getOnpageResult<MicrodataResult[]>(params.task_id);

    if (cached) {
      microdataResults = cached;
      if (activeTask && activeTask.status !== 'finished') {
        activeTask = { ...activeTask, status: 'finished' };
        upsertOnpageTask(activeTask);
      }
    } else if (creds && activeTask) {
      const status = await checkSummary(params.task_id, creds.login, creds.pass);
      if (status === 'error') {
        taskError = 'Error lors de la vérification du statut.';
        activeTask = { ...activeTask, status: 'error', errorMessage: taskError };
        upsertOnpageTask(activeTask);
      } else if (status === 'finished') {
        const { result, error: mdError } = await fetchMicrodata(params.task_id, activeTask.url, creds.login, creds.pass);
        if (mdError) {
          taskError = mdError;
        } else if (result) {
          microdataResults = result;
          saveOnpageResult(params.task_id, result);
        }
        activeTask = { ...activeTask, status: 'finished' };
        upsertOnpageTask(activeTask);
      } else {
        if (activeTask.status === 'pending') {
          activeTask = { ...activeTask, status: 'in_progress' };
          upsertOnpageTask(activeTask);
        }
      }
    }
  }

  const historyIndex = getOnpageTasks();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <span>On Page</span><span className="text-slate-200">/</span><span className="text-slate-600">Microdata</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Microdata Analysis</h1>
        <p className="text-sm text-slate-400 mt-1">JSON-LD and Microdata structured data validation for a page.</p>
      </div>

      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-2.5 rounded-xl hover:bg-blue-600 transition-colors">
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">URL to analyze</label>
        <input type="url" name="url" placeholder="https://exemple.com/ma-page" required
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
      </SearchForm>

      {(createError || taskError) && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{createError ?? taskError}</div>
      )}

      {params.task_id && activeTask && !taskError && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {statusBadge(activeTask.status)}
                <span className="text-xs text-slate-400 font-mono truncate max-w-md">{activeTask.url}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Lancé le {formatDate(activeTask.ts)}
                {activeTask.cost !== undefined && ` · cost $${activeTask.cost.toFixed(5)}`}
                {' · '}<span className="font-mono">{activeTask.id}</span>
              </p>
            </div>
            {activeTask.status !== 'finished' && (
              <a href={`/dashboard/on-page/microdata?task_id=${activeTask.id}`}
                className="shrink-0 text-[11px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 border border-blue-100 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-all bg-blue-50">
                Refresh ↺
              </a>
            )}
          </div>

          {activeTask.status !== 'finished' && !microdataResults && (
            <div className="px-6 py-12 text-center space-y-3">
              <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Crawling…
              </div>
              <p className="text-xs text-slate-400">Refresh in a few moments.</p>
            </div>
          )}

          {microdataResults?.map((res, ri) => (
            <div key={ri}>
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">{res.items_count} block{res.items_count !== 1 ? 's' : ''} detected{res.items_count !== 1 ? 's' : ''}</span>
                  <TestSummary summary={res.test_summary} />
                </div>
                <div className="text-[11px] text-slate-400">{res.crawl_status.pages_crawled} page{res.crawl_status.pages_crawled !== 1 ? 's' : ''} crawled{res.crawl_status.pages_crawled !== 1 ? 's' : ''}</div>
              </div>
              {res.items_count === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-400">No structured data detected.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {res.items.map((item, ii) => (
                    <div key={ii} className="px-6 py-5">
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{item.type}</span>
                        {item.inspection_info.types.map((t) => (
                          <span key={t} className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-0.5 rounded-md">{t}</span>
                        ))}
                      </div>
                      <FieldTree fields={item.inspection_info.fields} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {historyIndex.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Analysis history</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {historyIndex.map((entry) => {
              const isActive = entry.id === params.task_id;
              return (
                <a key={entry.id} href={`/dashboard/on-page/microdata?task_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(entry.status)}
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.target}</p>
                    </div>
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
