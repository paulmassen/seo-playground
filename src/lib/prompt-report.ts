import type { PromptCheck, TrackedPrompt } from '@/lib/db';
import { PLATFORM_LABELS } from '@/lib/llm-options';
import type { PdfCalendar, PdfStatus, StatusItem } from '@/lib/report-pdf-blocks';

// Pure report building for Prompt Tracker: status dots, the calendar grid and the markdown/PDF
// content. Used by the page (PDF sections, dots) and by the markdown export route.

export type CheckStatus = 'cited' | 'not-cited' | 'error';

export const STATUS_LABEL: Record<CheckStatus, string> = { cited: 'Cited', 'not-cited': 'Not cited', error: 'Error' };
export const STATUS_EMOJI: Record<CheckStatus | 'none', string> = { cited: '🟢', 'not-cited': '⚪', error: '🔴', none: '⬜' };

export function checkStatus(check: Pick<PromptCheck, 'error' | 'mentioned'>): CheckStatus {
  if (check.error) return 'error';
  return check.mentioned ? 'cited' : 'not-cited';
}

export function formatRate(total: number, mentioned: number): string {
  if (total === 0) return '—';
  return `${mentioned} / ${total} (${Math.round((mentioned / total) * 100)}%)`;
}

export function formatCost(cost: number | null): string {
  return cost === null ? '—' : `$${cost.toFixed(4)}`;
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function excerpt(answer: string | null, max = 140): string {
  if (!answer) return '';
  const oneLine = answer.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Latest check of each UTC day, keyed by YYYY-MM-DD (the `date` column). */
function latestPerDay(checks: PromptCheck[]): Map<string, PromptCheck> {
  const byDay = new Map<string, PromptCheck>();
  for (const check of checks) {
    const current = byDay.get(check.date);
    if (!current || check.checkedAt > current.checkedAt) byDay.set(check.date, check);
  }
  return byDay;
}

const DAY_MS = 86_400_000;

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing the given UTC date. */
function mondayOf(date: Date): Date {
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY_MS);
}

export interface CalendarDay { date: string; status: CheckStatus | null; inRange: boolean }
export interface CalendarWeek { monday: string; days: CalendarDay[] }

/**
 * Weeks (Monday to Sunday) covering every check. Each day carries the status of its latest check,
 * or null when it is inside the range but was not checked. Days outside the range are inRange: false.
 */
export function calendarWeeks(checks: PromptCheck[]): CalendarWeek[] {
  if (checks.length === 0) return [];
  const byDay = latestPerDay(checks);
  const days = [...byDay.keys()].sort();
  const first = utcDate(days[0]);
  const last = utcDate(days[days.length - 1]);

  const weeks: CalendarWeek[] = [];
  for (let monday = mondayOf(first); monday.getTime() <= last.getTime(); monday = new Date(monday.getTime() + 7 * DAY_MS)) {
    const week: CalendarWeek = { monday: isoDay(monday), days: [] };
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(monday.getTime() + i * DAY_MS);
      const key = isoDay(day);
      const inRange = day.getTime() >= first.getTime() && day.getTime() <= last.getTime();
      const check = inRange ? byDay.get(key) : undefined;
      week.days.push({ date: key, status: check ? checkStatus(check) : null, inRange });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Weekly calendar grid in markdown: one row per week, one cell per day. */
export function calendarMarkdown(checks: PromptCheck[]): string {
  if (checks.length === 0) return '_No checks yet._';
  const header = '| Week | Mon | Tue | Wed | Thu | Fri | Sat | Sun |';
  const divider = '|---|---|---|---|---|---|---|---|';
  const rows = calendarWeeks(checks).map((week) => {
    const cells = [week.monday, ...week.days.map((d) => {
      if (!d.inRange) return '';
      const emoji = d.status ? STATUS_EMOJI[d.status] : STATUS_EMOJI.none;
      return `${emoji} ${Number(d.date.slice(8))}`;
    })];
    return `| ${cells.join(' | ')} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/** Dot strip of the most recent checks, oldest first. */
export function recentStrip(checks: PromptCheck[], count = 14): string {
  const recent = [...checks].sort((a, b) => a.checkedAt - b.checkedAt).slice(-count);
  return recent.map((c) => STATUS_EMOJI[checkStatus(c)]).join('');
}

export function legendMarkdown(): string {
  return `${STATUS_EMOJI.cited} cited · ${STATUS_EMOJI['not-cited']} not cited · ${STATUS_EMOJI.error} error · ${STATUS_EMOJI.none} no check`;
}

export interface PromptReportInput {
  prompt: TrackedPrompt;
  checks: PromptCheck[];
  total: number;
  mentioned: number;
  generatedAt: number;
}

function generatedLine(ts: number): string {
  return `_Generated ${new Date(ts).toISOString().replace('T', ' ').slice(0, 16)} UTC_`;
}

/** Markdown report for one prompt: settings, calendar of mentions and check history. */
export function promptMarkdown(input: PromptReportInput): string {
  const { prompt, checks, total, mentioned, generatedAt } = input;
  const target = [prompt.brand && `brand "${prompt.brand}"`, prompt.domain && `domain ${prompt.domain}`].filter(Boolean).join(' and ');
  const history = [...checks].sort((a, b) => b.checkedAt - a.checkedAt);

  const lines = [
    `# Prompt report`,
    '',
    `> ${prompt.prompt}`,
    '',
    `- **Platform:** ${PLATFORM_LABELS[prompt.platform] ?? prompt.platform} · ${prompt.model}${prompt.webSearch ? ' · web search on' : ''}${prompt.countryCode ? ` · ${prompt.countryCode}` : ''}`,
    `- **Looking for:** ${target || '—'}`,
    `- **Mention rate:** ${formatRate(total, mentioned)}`,
    `- **Checks:** ${total} successful${checks.length > total ? `, ${checks.length - total} failed` : ''}`,
    '',
    generatedLine(generatedAt),
    '',
    '## Calendar',
    '',
    legendMarkdown(),
    '',
    calendarMarkdown(checks),
    '',
    '## History',
    '',
    '| Date | Status | Brand mentions | Domain cited | Cost | Answer |',
    '|---|---|---|---|---|---|',
    ...history.map((c) => {
      const status = `${STATUS_EMOJI[checkStatus(c)]} ${c.error ? 'Error' : c.mentioned ? 'Cited' : 'Not cited'}`;
      return `| ${cell(c.date)} | ${cell(status)} | ${c.error ? '—' : c.brandMentions} | ${c.error ? '—' : c.domainCited ? 'yes' : 'no'} | ${formatCost(c.cost)} | ${cell(c.error ?? excerpt(c.answer))} |`;
    }),
    '',
  ];
  return lines.join('\n');
}

export interface OverviewItem {
  prompt: TrackedPrompt;
  checks: PromptCheck[];
  total: number;
  mentioned: number;
  latest: PromptCheck | undefined;
}

/** Markdown overview of every tracked prompt: latest status, rate and a dot strip of recent checks. */
export function overviewMarkdown(items: OverviewItem[], generatedAt: number): string {
  const lines = [
    '# Prompt Tracker overview',
    '',
    `${items.length} prompt${items.length === 1 ? '' : 's'} tracked · ${generatedLine(generatedAt).slice(1, -1)}`,
    '',
    legendMarkdown(),
    '',
    '| Prompt | Model | Looking for | Latest | Mention rate | Recent checks |',
    '|---|---|---|---|---|---|',
    ...items.map(({ prompt, checks, total, mentioned, latest }) => {
      const target = [prompt.brand, prompt.domain].filter(Boolean).join(' · ');
      const latestLabel = latest ? `${STATUS_EMOJI[checkStatus(latest)]} ${latest.error ? 'Error' : latest.mentioned ? 'Cited' : 'Not cited'}` : `${STATUS_EMOJI.none} Not checked`;
      return `| ${cell(prompt.prompt)} | ${cell(`${PLATFORM_LABELS[prompt.platform] ?? prompt.platform} ${prompt.model}`)} | ${cell(target)} | ${cell(latestLabel)} | ${cell(formatRate(total, mentioned))} | ${recentStrip(checks) || '—'} |`;
    }),
    '',
  ];
  return lines.join('\n');
}

// ---- PDF content (plain ASCII text: the jsPDF standard fonts cannot draw emoji) ----

export interface PdfMetric { label: string; value: string; detail?: string; status?: PdfStatus }
export interface PdfSection { title: string; rows: Array<[string, string]>; statusItems?: StatusItem[]; calendar?: PdfCalendar }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-10-08" -> "8 Oct 2026", or "Thu 8 Oct 2026" with the weekday. Pure UTC, no locale. */
export function formatDay(date: string, withWeekday = false): string {
  const d = utcDate(date);
  const label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAY_NAMES[d.getUTCDay()]} ${label}` : label;
}

function pdfStatus(check: PromptCheck | undefined): PdfStatus {
  return check ? checkStatus(check) : 'none';
}

function pdfBadge(check: PromptCheck | undefined): string {
  if (!check) return 'Not checked';
  if (check.error) return 'Error';
  return check.mentioned ? 'Cited' : 'Not cited';
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function modelLabel(prompt: TrackedPrompt): string {
  return `${PLATFORM_LABELS[prompt.platform] ?? prompt.platform} ${prompt.model}`;
}

function targetText(prompt: TrackedPrompt): string {
  return [prompt.brand, prompt.domain].filter(Boolean).join(' / ');
}

/** One-line result of a check, shown under its date in the history. */
function checkDetail(check: PromptCheck): string {
  if (check.error) return check.error;
  const mentions = check.brandMentions > 0 ? plural(check.brandMentions, 'brand mention') : 'no brand mention';
  return `${mentions} - domain ${check.domainCited ? 'cited' : 'not cited'}`;
}

/** Weekly heat-map rows, Monday first, one coloured day per check (the latest of each day). */
function pdfCalendar(checks: PromptCheck[]): PdfCalendar {
  return {
    weeks: calendarWeeks(checks).map((week) => ({
      label: `Week of ${formatDay(week.monday).replace(/ \d{4}$/, '')}`,
      days: week.days.map((d) => (d.inRange ? { day: Number(d.date.slice(8)), status: d.status } : null)),
    })),
  };
}

/** PDF for one prompt: latest result, mention calendar and a card per check, newest first. */
export function promptPdf(input: PromptReportInput): { metrics: PdfMetric[]; sections: PdfSection[] } {
  const { prompt, checks, total, mentioned } = input;
  const history = [...checks].sort((a, b) => b.checkedAt - a.checkedAt);
  const latest = history[0];
  const settings: Array<[string, string]> = [
    ['Looking for', targetText(prompt) || '-'],
    ['Web search', prompt.webSearch ? 'On' : 'Off'],
  ];
  if (prompt.countryCode) settings.push(['Country', prompt.countryCode]);

  const sections: PdfSection[] = [{ title: 'Settings', rows: settings }];
  if (checks.length > 0) {
    sections.push({ title: 'Calendar', rows: [], calendar: pdfCalendar(checks) });
    sections.push({
      title: 'Check history',
      rows: [],
      statusItems: history.map((c): StatusItem => ({
        status: pdfStatus(c),
        title: formatDay(c.date, true),
        subtitle: checkDetail(c),
        badge: pdfBadge(c),
      })),
    });
  }

  return {
    metrics: [
      { label: 'Latest result', value: pdfBadge(latest), detail: latest ? formatDay(latest.date) : 'No check yet', status: pdfStatus(latest) },
      { label: 'Mention rate', value: total ? `${Math.round((mentioned / total) * 100)}%` : '-', detail: `${mentioned} of ${plural(total, 'check')}` },
      { label: 'Checks', value: String(total), detail: checks.length > total ? `${checks.length - total} failed` : 'None failed' },
      { label: 'Model', value: PLATFORM_LABELS[prompt.platform] ?? prompt.platform, detail: prompt.model },
    ],
    sections,
  };
}

/** PDF overview: only the latest result of each prompt, with a visual cited / not cited marker. */
export function overviewPdf(items: OverviewItem[]): { metrics: PdfMetric[]; sections: PdfSection[] } {
  const cited = items.filter((i) => i.latest && !i.latest.error && i.latest.mentioned).length;
  const notCited = items.filter((i) => i.latest && !i.latest.error && !i.latest.mentioned).length;
  const other = items.length - cited - notCited;
  return {
    metrics: [
      { label: 'Prompts tracked', value: String(items.length) },
      { label: 'Cited', value: `${cited} / ${items.length}`, detail: 'in the latest check', status: 'cited' },
      { label: 'Not cited', value: `${notCited} / ${items.length}`, detail: other > 0 ? `${other} error or unchecked` : 'in the latest check', status: 'not-cited' },
    ],
    sections: [
      {
        title: 'Latest results',
        rows: [],
        statusItems: items.map(({ prompt, latest }): StatusItem => ({
          status: pdfStatus(latest),
          title: prompt.prompt,
          subtitle: [modelLabel(prompt), targetText(prompt) && `Looking for ${targetText(prompt)}`].filter(Boolean).join(' - '),
          badge: pdfBadge(latest),
          note: latest ? formatDay(latest.date) : undefined,
        })),
      },
    ],
  };
}
