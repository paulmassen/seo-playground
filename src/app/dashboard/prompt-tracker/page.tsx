import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getTrackedPrompts, getLatestPromptChecks, getPromptCheckTotals, getPromptChecks,
  getPromptTrackerSchedule, type PromptCheck, type TrackedPrompt,
} from '@/lib/db';
import { PLATFORM_LABELS } from '@/lib/llm-options';
import { getBrandSettings } from '@/lib/brand-server';
import {
  checkStatus, formatCost, formatRate, legendMarkdown, overviewPdf, promptPdf, STATUS_LABEL, type OverviewItem,
} from '@/lib/prompt-report';
import {
  addPromptAction, removePromptAction, checkPromptAction, checkAllPromptsAction, savePromptScheduleAction,
} from './actions';
import PromptTrackerForm from './PromptTrackerForm';
import PromptScheduleControl from './PromptScheduleControl';
import PromptCalendar from './PromptCalendar';
import DotStrip from './DotStrip';
import StatusDot from './StatusDot';
import PendingButton from '@/components/PendingButton';
import MarkdownAnswer from '@/components/MarkdownAnswer';
import ReportPdfExportButton from '@/components/ReportPdfExportButton';
import CopyMarkdownLink from '@/components/CopyMarkdownLink';

type SearchParams = { prompt?: string };

// Checks loaded per prompt for the accordion. The calendar and markdown export read the full history.
const HISTORY_SHOWN = 50;
// Full history for the calendar and the PDF; the markdown export reads the same range.
const FULL_HISTORY = 366;

const BUTTON_SECONDARY = 'rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-40';
const BUTTON_DANGER = 'rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40';

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function targetLabel(prompt: TrackedPrompt) {
  return [prompt.brand, prompt.domain].filter(Boolean).join(' · ');
}

function StatusBadge({ check }: { check: PromptCheck | undefined }) {
  if (!check) return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-400">Not checked</span>;
  const status = checkStatus(check);
  const tone = status === 'cited'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    : status === 'error'
      ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{value}</p>
    </div>
  );
}

async function PromptTrackerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;

  const prompts = getTrackedPrompts();
  const latest = getLatestPromptChecks();
  const totals = getPromptCheckTotals();
  const schedule = getPromptTrackerSchedule();
  const selectedId = Number(params.prompt);

  // Everything the accordion needs, loaded once. Checks come newest first, reversed for the dot strip.
  const items: OverviewItem[] = prompts.map((prompt) => {
    const t = totals.get(prompt.id) ?? { total: 0, mentioned: 0 };
    return {
      prompt,
      checks: getPromptChecks(prompt.id, FULL_HISTORY),
      total: t.total,
      mentioned: t.mentioned,
      latest: latest.get(prompt.id),
    };
  });

  const checksRun = items.reduce((sum, i) => sum + i.total, 0);
  const mentionsFound = items.reduce((sum, i) => sum + i.mentioned, 0);
  const promptsMentioned = items.filter((i) => i.latest?.mentioned).length;
  const overall = checksRun > 0 ? `${Math.round((mentionsFound / checksRun) * 100)}%` : '—';

  const overviewReport = overviewPdf(items);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Prompt Tracker</h1>
        <p className="text-sm text-slate-400 mt-1">
          Save a prompt, re-run it whenever you want or every day, and see whether your brand or domain shows up in the answer.
        </p>
      </div>

      {!creds && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      <PromptTrackerForm action={addPromptAction} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Prompts tracked" value={String(prompts.length)} />
        <StatTile label="Mentioned in latest check" value={`${promptsMentioned} / ${prompts.length}`} />
        <StatTile label="Checks run" value={String(checksRun)} />
        <StatTile label="Overall mention rate" value={overall} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[16rem]">
          <PromptScheduleControl schedule={schedule} saveAction={savePromptScheduleAction} />
        </div>
        <form action={checkAllPromptsAction}>
          <PendingButton
            type="submit"
            disabled={!creds || prompts.length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-violet-600 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-violet-500 dark:hover:text-white"
            pendingClassName="rounded-xl bg-slate-400 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white dark:bg-slate-600"
            pendingChildren="Checking all…"
          >
            Check all now
          </PendingButton>
        </form>
      </div>

      {prompts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center">
          <p className="text-slate-400 text-sm">No prompts tracked yet. Add one above, then run it to see whether your brand appears.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><StatusDot status="cited" size="sm" /> Cited</span>
              <span className="flex items-center gap-1.5"><StatusDot status="not-cited" size="sm" /> Not cited</span>
              <span className="flex items-center gap-1.5"><StatusDot status="error" size="sm" /> Error</span>
              <span className="flex items-center gap-1.5"><StatusDot status={null} size="sm" /> No check</span>
            </div>
            <div className="flex items-center gap-2">
              <CopyMarkdownLink href="/api/prompt-tracker/export" label="Copy overview as Markdown" />
              <ReportPdfExportButton
                brandName={brandName}
                brandLogoUrl={brandLogoUrl}
                brandColor={brand.color}
                brandFooter={brand.footer}
                brandStyle={brand}
                filename="prompt-tracker-overview.pdf"
                title="Prompt Tracker overview"
                subject={`${prompts.length} prompt${prompts.length === 1 ? '' : 's'}`}
                generatedAt={Date.now()}
                metrics={overviewReport.metrics}
                sections={overviewReport.sections}
              />
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const { prompt, checks, total, mentioned, latest: last } = item;
              const isOpen = selectedId === prompt.id;
              const rate = formatRate(total, mentioned);
              const report = promptPdf({ prompt, checks, total, mentioned, generatedAt: Date.now() });
              return (
                <details
                  key={prompt.id}
                  open={isOpen}
                  className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
                    <span className="text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
                    <div className="min-w-0 flex-1 basis-72">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{prompt.prompt}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {PLATFORM_LABELS[prompt.platform] ?? prompt.platform} · {prompt.model} · {targetLabel(prompt)}
                      </p>
                    </div>
                    <DotStrip checks={checks} />
                    <div className="flex items-center gap-3 text-xs">
                      <StatusBadge check={last} />
                      <span className="tabular-nums font-semibold text-slate-600 dark:text-slate-300">{rate}</span>
                    </div>
                  </summary>

                  <div className="space-y-6 border-t border-slate-100 dark:border-slate-800 px-5 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={checkPromptAction}>
                        <input type="hidden" name="id" value={prompt.id} />
                        <PendingButton type="submit" disabled={!creds} className={BUTTON_SECONDARY} pendingClassName={`${BUTTON_SECONDARY} opacity-60`} pendingChildren="Checking…">
                          Check now
                        </PendingButton>
                      </form>
                      <CopyMarkdownLink href={`/api/prompt-tracker/export?id=${prompt.id}`} />
                      <ReportPdfExportButton
                        brandName={brandName}
                        brandLogoUrl={brandLogoUrl}
                        brandColor={brand.color}
                        brandFooter={brand.footer}
                        brandStyle={brand}
                        filename={`prompt-${prompt.id}-report.pdf`}
                        title="Prompt report"
                        subject={prompt.prompt}
                        generatedAt={Date.now()}
                        metrics={report.metrics}
                        sections={report.sections}
                      />
                      <form action={removePromptAction} className="ml-auto">
                        <input type="hidden" name="id" value={prompt.id} />
                        <PendingButton type="submit" className={BUTTON_DANGER} pendingChildren="Removing…">Remove</PendingButton>
                      </form>
                    </div>

                    <section className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Calendar</p>
                      <PromptCalendar checks={checks} />
                    </section>

                    <section className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Check history {checks.length > HISTORY_SHOWN && <span className="normal-case font-normal tracking-normal">(latest {HISTORY_SHOWN} of {checks.length})</span>}
                      </p>
                      {checks.length === 0 ? (
                        <p className="text-sm text-slate-400">Not checked yet. Use “Check now” to run this prompt.</p>
                      ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {checks.slice(0, HISTORY_SHOWN).map((check) => (
                            <li key={check.id} className="py-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <StatusDot status={checkStatus(check)} />
                                <StatusBadge check={check} />
                                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(check.checkedAt)}</span>
                                {!check.error && (
                                  <span className="text-[11px] text-slate-400">
                                    {check.brandMentions} brand mention{check.brandMentions === 1 ? '' : 's'} · domain {check.domainCited ? 'cited' : 'not cited'}
                                  </span>
                                )}
                                <span className="ml-auto font-mono text-[11px] text-slate-400">{formatCost(check.cost)}</span>
                              </div>

                              {check.error && <p className="text-xs text-red-600 dark:text-red-400">{check.error}</p>}

                              {check.answer && (
                                <details>
                                  <summary className="cursor-pointer text-xs font-semibold text-violet-600 dark:text-violet-400">Show answer</summary>
                                  <div className="mt-2">
                                    <MarkdownAnswer>{check.answer}</MarkdownAnswer>
                                  </div>
                                </details>
                              )}

                              {check.sources.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {check.sources.map((source, i) => (
                                    <a
                                      key={`${source.url}-${i}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={source.title ?? source.url}
                                      className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 px-2 py-0.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors max-w-[220px] truncate"
                                    >
                                      {source.title ?? source.url}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </details>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Legend for exports: {legendMarkdown()}</p>
        </>
      )}

      <p className="text-slate-300 dark:text-slate-600 text-xs">Powered by DataForSEO LLM Responses API. Each check is billed like an AI Prompt Test run.</p>
    </div>
  );
}

export default withProjectScope(PromptTrackerPage);
