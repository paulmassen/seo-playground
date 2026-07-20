export const dynamic = 'force-dynamic';

import {
  getCredentials, getTrackedKeywords, getRankHistory, getLatestRankCheck,
  getSetting, getTargetDomains,
} from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import {
  addKeywordAction, removeKeywordAction, checkOneAction, checkAllAction,
  saveDepthAction, addDomainAction, removeDomainAction, checkDomainAction,
} from './actions';
import KeywordRow from './KeywordRow';
import PendingButton from '@/components/PendingButton';
import LocationPicker from '@/components/LocationPicker';

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchParams = { domain?: string };

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 text-sm font-medium transition-all';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RankTrackerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const creds = getCredentials();
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const rankDepth = getSetting('rank_tracker_depth') ?? '100';

  // Merge target_domains table with unique domains from tracked keywords
  const savedDomains = getTargetDomains();
  const allKeywords = getTrackedKeywords();
  const kwDomains = [...new Set(allKeywords.map((k) => k.domain))];
  const domains = [...new Set([...savedDomains, ...kwDomains])];

  // Active domain from URL, or first available
  const activeDomain = params.domain ?? domains[0] ?? null;

  // Keywords for the active domain
  const keywords = activeDomain ? allKeywords.filter((k) => k.domain === activeDomain) : [];

  const rows = keywords.map((kw) => {
    const history = getRankHistory(kw.id, 30);
    const latest = getLatestRankCheck(kw.id);
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
    return { kw, history, latest, previous };
  });

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Rank Tracker</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            {allKeywords.length} keyword{allKeywords.length !== 1 ? 's' : ''} across {domains.length} domain{domains.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <form action={saveDepthAction} className="flex items-center gap-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Top</label>
            <select
              name="rank_tracker_depth"
              defaultValue={rankDepth}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
            >
              {['10', '20', '50', '100'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button type="submit" className="px-3 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">
              Save
            </button>
          </form>

          {allKeywords.length > 0 && creds && (
            <form action={checkAllAction}>
              <input type="hidden" name="domain" value={activeDomain ?? ''} />
              <PendingButton
                type="submit"
                className="px-5 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 dark:shadow-none"
                pendingClassName="px-5 py-3 bg-slate-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-xl shadow-slate-200 dark:shadow-none cursor-not-allowed"
                pendingChildren={`Checking ${allKeywords.length}…`}
              >
                Check All ({allKeywords.length})
              </PendingButton>
            </form>
          )}
        </div>
      </div>

      {!creds && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-6 py-4 text-sm font-medium">
          Configure your DataForSEO credentials in Settings to enable rank checking.
        </div>
      )}

      {/* ── Domain tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {domains.map((domain) => {
          const isActive = domain === activeDomain;
          const kwCount = allKeywords.filter((k) => k.domain === domain).length;
          return (
            <div key={domain} className="flex items-center gap-0.5">
              <a
                href={`/dashboard/rank-tracker?domain=${encodeURIComponent(domain)}`}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200 dark:shadow-none'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {domain}
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {kwCount}
                </span>
              </a>
              <form action={removeDomainAction}>
                <input type="hidden" name="domain" value={domain} />
                <button
                  type="submit"
                  title="Remove domain"
                  className={`px-1.5 py-2 text-[10px] rounded-lg transition-all ${
                    isActive
                      ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                      : 'text-slate-300 hover:text-red-400 hover:bg-red-50'
                  }`}
                >
                  ×
                </button>
              </form>
            </div>
          );
        })}

        {/* Add domain inline form */}
        <form action={addDomainAction} className="flex items-center gap-2 ml-2">
          <input
            name="domain"
            type="text"
            placeholder="newdomain.com"
            className="px-3 py-2 bg-white border border-dashed border-slate-300 rounded-xl text-xs font-medium text-slate-700 placeholder-slate-300 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none w-40 transition-all"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-white border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
          >
            + Add
          </button>
        </form>
      </div>

      {/* ── Empty state: no domains ─────────────────────────────────────────── */}
      {domains.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-16 text-center">
          <div className="text-3xl mb-3">🎯</div>
          <p className="font-bold text-slate-700 mb-1">No domains yet</p>
          <p className="text-slate-400 text-sm">Add a domain above to start tracking keyword rankings.</p>
        </div>
      )}

      {/* ── Domain view ────────────────────────────────────────────────────── */}
      {activeDomain && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Keywords table */}
          <div className="xl:col-span-2">
            {rows.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center">
                <p className="text-slate-500 font-semibold mb-1">No keywords for {activeDomain}</p>
                <p className="text-slate-400 text-xs">Add some keywords using the form on the right.</p>
              </div>
            ) : (
              <div id="results" className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {activeDomain} — {rows.length} keyword{rows.length !== 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-300 hidden sm:block">Click a row to see history</span>
                    {creds && (
                      <form action={checkDomainAction}>
                        <input type="hidden" name="domain" value={activeDomain} />
                        <PendingButton
                          type="submit"
                          className="px-3 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                          pendingClassName="px-3 py-1.5 bg-blue-300 text-white text-[9px] font-black uppercase tracking-widest rounded-lg cursor-not-allowed"
                          pendingChildren={`Checking ${rows.length}…`}
                        >
                          Check {rows.length}
                        </PendingButton>
                      </form>
                    )}
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Keyword</th>
                      <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pos.</th>
                      <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trend</th>
                      <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">14d</th>
                      <th className="text-left px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Checked</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map(({ kw, history, latest, previous }) => (
                      <KeywordRow
                        key={kw.id}
                        kw={kw}
                        history={history}
                        latest={latest}
                        previous={previous}
                        hasCreds={!!creds}
                        checkAction={checkOneAction}
                        removeAction={removeKeywordAction}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add keywords form */}
          <div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sticky top-6">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1">Add Keywords</h2>
              <p className="text-[10px] text-slate-400 font-medium mb-5">for {activeDomain}</p>
              <form action={addKeywordAction} className="space-y-4">
                <input type="hidden" name="domain" value={activeDomain} />

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Keywords <span className="text-slate-300 normal-case font-normal tracking-normal">(one per line, max 50)</span>
                  </label>
                  <textarea
                    name="keywords"
                    required
                    rows={5}
                    placeholder={"plombier paris\nplombier urgence\ndébouchage canalisation"}
                    className={`${inputCls} resize-y font-mono`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</label>
                  <LocationPicker name="location" defaultValue={defaultLocation} className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Language</label>
                  <select name="language" defaultValue={defaultLanguage} className={inputCls}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                <PendingButton
                  type="submit"
                  disabled={!creds}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  pendingClassName="w-full bg-blue-400 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-blue-100 cursor-not-allowed"
                  pendingChildren="Checking rankings…"
                >
                  Add &amp; Check
                </PendingButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
