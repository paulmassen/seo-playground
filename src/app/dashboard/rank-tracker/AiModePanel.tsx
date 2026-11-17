'use client';

import { useState } from 'react';
import type { AiModeCheckDetail } from '@/lib/db';
import { rankHost } from '@/lib/rank-serp';
import MarkdownAnswer from '@/components/MarkdownAnswer';

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function StatusLine({ check, domain }: { check: AiModeCheckDetail; domain: string }) {
  if (check.status === 'cited') {
    return <p className="text-xs text-slate-700 dark:text-slate-300"><span className="font-black text-violet-700 dark:text-violet-300">Cited #{check.citationPosition}</span> of {check.sources.length} cited site{check.sources.length === 1 ? '' : 's'}.</p>;
  }
  if (check.status === 'not_cited') {
    return <p className="text-xs text-slate-700 dark:text-slate-300"><span className="font-black text-red-600 dark:text-red-400">{domain} not cited.</span> AI Mode answered with {check.sources.length} other site{check.sources.length === 1 ? '' : 's'}.</p>;
  }
  return <p className="text-xs text-slate-600 dark:text-slate-400">No AI Mode answer came back for this keyword and location.</p>;
}

interface Props {
  checks: AiModeCheckDetail[] | null;
  failed: boolean;
  trackedDomain: string;
  enabled: boolean;
}

/** Saved Google AI Mode checks of one keyword: the citation, the cited sites and the answer itself. */
export default function AiModePanel({ checks, failed, trackedDomain, enabled }: Props) {
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const title = <div className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-2">Google AI Mode</div>;

  if (failed) return <div className="mt-5">{title}<p className="text-xs text-slate-400">Could not load the AI Mode checks.</p></div>;
  if (checks === null) return <div className="mt-5">{title}<p className="text-xs text-slate-400">Loading…</p></div>;
  if (checks.length === 0) {
    return (
      <div className="mt-5">
        {title}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {enabled ? 'AI Mode is tracked for this keyword. Its first answer arrives with the next check.' : 'Not tracked. Turn on AI Mode in this row to see whether Google AI Mode cites this domain.'}
        </p>
      </div>
    );
  }

  const current = checks.find((check) => check.date === pickedDate) ?? checks[0];
  const index = checks.indexOf(current);
  const previous = checks[index + 1] ?? null;
  const mine = rankHost(trackedDomain);
  const previousDomains = new Set(previous?.sources.map((source) => source.domain) ?? []);
  const currentDomains = new Set(current.sources.map((source) => source.domain));
  const dropped = previous ? previous.sources.filter((source) => !currentDomains.has(source.domain)) : [];
  const citedDays = checks.filter((check) => check.status === 'cited').length;
  const answeredDays = checks.filter((check) => check.status !== 'no_answer').length;

  return (
    <div className="mt-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        {title}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">Cited on {citedDays}/{answeredDays} answered check{answeredDays === 1 ? '' : 's'}</span>
          {checks.length > 1 ? (
            <select
              value={current.date}
              onChange={(e) => { setPickedDate(e.target.value); setShowAnswer(false); }}
              aria-label="AI Mode check date"
              className="text-[10px] font-bold text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1"
            >
              {checks.map((check) => (
                <option key={check.date} value={check.date}>
                  {formatDay(check.date)} · {check.status === 'cited' ? `#${check.citationPosition}` : check.status === 'not_cited' ? 'not cited' : 'no answer'}
                </option>
              ))}
            </select>
          ) : <span className="text-[10px] font-bold text-slate-500">{formatDay(current.date)}</span>}
        </div>
      </div>

      <StatusLine check={current} domain={trackedDomain} />

      {current.sources.length > 0 && (
        <ol className="mt-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-50 dark:divide-slate-800 overflow-hidden">
          {current.sources.map((source, i) => {
            const isMine = source.domain === mine || source.domain.endsWith(`.${mine}`);
            return (
              <li key={source.domain} className={`flex items-center gap-3 px-3 py-1.5 ${isMine ? 'bg-violet-50/70 dark:bg-violet-950/30' : ''}`}>
                <span className="w-6 text-[11px] font-black tabular-nums text-slate-400">#{i + 1}</span>
                <a
                  href={source.url || `https://${source.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.title ? `${source.title}\n${source.url}` : source.url}
                  className={`min-w-0 flex-1 truncate text-[11px] hover:underline ${isMine ? 'font-black text-violet-700 dark:text-violet-300' : 'font-semibold text-slate-700 dark:text-slate-200'}`}
                >
                  {source.domain}
                  {source.title && <span className="ml-2 font-normal text-slate-400">{source.title}</span>}
                </a>
                {previous && !previousDomains.has(source.domain) && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">New</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {previous && (
        <p className="mt-2 text-[10px] text-slate-400">
          <span className="font-semibold">vs {formatDay(previous.date)}.</span>
          {dropped.length > 0
            ? <> No longer cited: {dropped.map((source, i) => <span key={source.domain}>{i > 0 && ', '}<span className="font-bold text-slate-600 dark:text-slate-300">{source.domain}</span></span>)}</>
            : ' No cited site dropped out.'}
        </p>
      )}

      {current.answer && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAnswer((v) => !v)}
            aria-expanded={showAnswer}
            className="text-[10px] font-bold text-violet-700 dark:text-violet-300 hover:underline"
          >
            {showAnswer ? 'Hide the AI Mode answer' : 'Show the AI Mode answer'}
          </button>
          {showAnswer && (
            <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <MarkdownAnswer>{current.answer}</MarkdownAnswer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
