export const dynamic = 'force-dynamic';

import { getCredentials, getTrackedKeywords, getRankHistory, getLatestRankCheck, getSetting } from '@/lib/db';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import { addKeywordAction, removeKeywordAction, checkOneAction, checkAllAction } from './actions';
import type { RankCheck } from '@/lib/db';
import PendingButton from '@/components/PendingButton';

// ─── UI helpers ───────────────────────────────────────────────────────────────

function PositionBadge({ pos }: { pos: number | null }) {
  if (pos === null) return <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-red-50 text-red-400 border border-red-100">—</span>;
  const cls = pos <= 3
    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : pos <= 10
    ? 'bg-blue-50 text-blue-600 border-blue-200'
    : pos <= 30
    ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black border tabular-nums ${cls}`}>#{pos}</span>;
}

function TrendBadge({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null && previous === null) return null;
  if (previous === null || current === null) return <span className="text-[10px] font-bold text-slate-300">new</span>;
  const diff = previous - current;
  if (diff === 0) return <span className="text-[11px] text-slate-300">—</span>;
  if (diff > 0) return <span className="text-[10px] font-black text-emerald-500">↑{diff}</span>;
  return <span className="text-[10px] font-black text-red-400">↓{Math.abs(diff)}</span>;
}

function Sparkline({ history }: { history: RankCheck[] }) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last14 = sorted.slice(-14);
  if (last14.length < 2) return <span className="text-[10px] text-slate-300">—</span>;

  const positions = last14.map((c) => c.position);
  const definedPositions = positions.filter((p): p is number => p !== null);
  if (definedPositions.length < 2) return <span className="text-[10px] text-slate-300">—</span>;

  const maxPos = Math.max(...definedPositions, 10);
  const minPos = Math.min(...definedPositions, 1);
  const range = Math.max(maxPos - minPos, 5);

  const W = 80, H = 24;
  const xStep = W / (last14.length - 1);
  const toY = (p: number) => ((p - minPos) / range) * (H - 4) + 2;

  const points: { x: number; y: number }[] = [];
  last14.forEach((c, i) => {
    if (c.position !== null) points.push({ x: i * xStep, y: toY(c.position) });
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const latest = positions[positions.length - 1];
  const stroke = latest !== null && latest <= 10 ? '#3b82f6' : '#94a3b8';

  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={stroke} />
      )}
    </svg>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 text-sm font-medium transition-all';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RankTrackerPage() {
  const creds = getCredentials();
  const keywords = getTrackedKeywords();
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const defaultDomain = getSetting('default_domain') ?? '';

  const rows = keywords.map((kw) => {
    const history = getRankHistory(kw.id, 30);
    const latest = getLatestRankCheck(kw.id);
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
    return { kw, history, latest, previous };
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Rank Tracker</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">{keywords.length} keyword{keywords.length !== 1 ? 's' : ''} suivis</p>
        </div>
        {keywords.length > 0 && creds && (
          <form action={checkAllAction}>
            <PendingButton
              type="submit"
              className="px-5 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all shadow-xl shadow-slate-200"
              pendingClassName="px-5 py-3 bg-slate-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-xl shadow-slate-200 cursor-not-allowed"
              pendingChildren={`Checking ${keywords.length}…`}
            >
              Check All ({keywords.length})
            </PendingButton>
          </form>
        )}
      </div>

      {!creds && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-6 py-4 text-sm font-medium">
          Configurez vos identifiants DataForSEO dans les Paramètres.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Keywords table */}
        <div className="xl:col-span-2">
          {rows.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
              <p className="text-slate-400 font-medium text-sm">No keywords tracked.</p>
              <p className="text-slate-300 text-xs mt-1">Ajoutez un keyword via le formulaire.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Keyword</th>
                    <th className="text-left px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain</th>
                    <th className="text-center px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pos.</th>
                    <th className="text-center px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Évol.</th>
                    <th className="text-center px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">History</th>
                    <th className="text-left px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vérifié</th>
                    <th className="px-3 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map(({ kw, history, latest, previous }) => (
                    <tr key={kw.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{kw.keyword}</div>
                        <div className="text-[10px] text-slate-400">{kw.location} · {kw.language}</div>
                      </td>
                      <td className="px-3 py-3.5 text-slate-500 font-medium">{kw.domain}</td>
                      <td className="px-3 py-3.5 text-center">
                        <PositionBadge pos={latest?.position ?? null} />
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <TrendBadge current={latest?.position ?? null} previous={previous?.position ?? null} />
                      </td>
                      <td className="px-3 py-3.5 flex justify-center">
                        <Sparkline history={history} />
                      </td>
                      <td className="px-3 py-3.5 text-slate-400 text-[10px] whitespace-nowrap">
                        {latest ? formatDate(latest.checkedAt) : '—'}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex gap-1.5">
                          {creds && (
                            <form action={checkOneAction}>
                              <input type="hidden" name="id" value={kw.id} />
                              <input type="hidden" name="keyword" value={kw.keyword} />
                              <input type="hidden" name="domain" value={kw.domain} />
                              <input type="hidden" name="location" value={kw.location} />
                              <input type="hidden" name="language" value={kw.language} />
                              <PendingButton
                                type="submit"
                                className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                                pendingClassName="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-blue-100 text-blue-300 cursor-not-allowed animate-spin"
                              >
                                ↻
                              </PendingButton>
                            </form>
                          )}
                          <form action={removeKeywordAction}>
                            <input type="hidden" name="id" value={kw.id} />
                            <button type="submit" className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all">
                              ✕
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Keywords Form */}
        <div>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sticky top-6">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-5">Ajouter des keywords</h2>
            <form action={addKeywordAction} className="space-y-4">

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Keywords <span className="text-slate-300 normal-case font-normal tracking-normal">(un par ligne, max 50)</span>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain</label>
                <input
                  name="domain"
                  type="text"
                  required
                  defaultValue={defaultDomain}
                  placeholder="example.com"
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pays</label>
                <select name="location" defaultValue={defaultLocation} className={inputCls}>
                  {LOCATIONS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
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
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                pendingClassName="w-full bg-blue-400 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-blue-100 cursor-not-allowed"
                pendingChildren="Vérification en cours…"
              >
                Ajouter &amp; vérifier
              </PendingButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
