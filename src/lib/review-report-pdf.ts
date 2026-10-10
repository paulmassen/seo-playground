// Turns a ComparisonReport into the sections of the white-label PDF (A4 landscape).
import type { ReportMetric, ReportSection } from '@/components/ReportPdfExportButton';
import type { PdfCell } from './report-pdf-blocks';
import {
  CRITERIA, CRITERION_GROUPS, formatCriterion, rankColor, seriesColors, type ComparisonReport, type CriterionId, type ListingResult,
} from './review-report';

const MUTED_CELL: PdfCell = { text: 'n/a', color: [148, 163, 184] };

function formatDay(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(ms));
}

function listingLabel(listing: ListingResult): string {
  return `${listing.title}${listing.isSelf ? ' (you)' : ''}${listing.partial ? ' *' : ''}`;
}

function rankCell(rank: number | null, count: number): PdfCell {
  if (rank === null) return MUTED_CELL;
  return { text: String(rank), fill: rankColor(rank, count) };
}

function valueWithRank(listing: ListingResult, id: CriterionId): PdfCell {
  const rank = listing.ranks[id];
  if (rank === null) return MUTED_CELL;
  // A position already is a rank: do not repeat it.
  if (id === 'mapsRank') return { text: formatCriterion(id, listing.metrics[id]), bold: rank === 1 };
  return { text: `${formatCriterion(id, listing.metrics[id])}  #${rank}`, bold: rank === 1 };
}

export function comparisonReportMetrics(report: ComparisonReport): ReportMetric[] {
  return report.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, detail: kpi.detail }));
}

export function comparisonReportSections(report: ComparisonReport, context: { keyword: string; area: string }): ReportSection[] {
  const n = report.listings.length;
  const colors = seriesColors(report.listings);
  const partialNote = report.listings.some((l) => l.partial)
    ? '* The data for this listing does not reach back to the start of the period (more than 4,490 recent reviews or a fetch still in progress).'
    : undefined;
  const sections: ReportSection[] = [];

  sections.push({ title: 'Summary', rows: [], paragraphs: report.summary.headline });
  if (report.summary.targets.length) sections.push({ title: 'Targets and gaps', rows: [], paragraphs: report.summary.targets });
  // Five of each keeps the first page self-contained; the web view lists them all.
  const strengths = report.summary.strengths.slice(0, 5);
  const weaknesses = report.summary.weaknesses.slice(0, 5);
  if (strengths.length || weaknesses.length) {
    sections.push({
      title: 'Strengths and weaknesses',
      rows: [],
      table: {
        columns: [{ label: 'Strengths: top third of the market' }, { label: 'Weaknesses: bottom third of the market' }],
        rows: Array.from({ length: Math.max(strengths.length, weaknesses.length) }, (_, i) => ({
          cells: [
            strengths[i] ? { text: strengths[i], color: [21, 128, 61] as [number, number, number] } : '',
            weaknesses[i] ? { text: weaknesses[i], color: [185, 28, 28] as [number, number, number] } : '',
          ],
        })),
      },
    });
  }

  sections.push({
    title: 'Overall ranking',
    rows: [],
    pageBreakBefore: true,
    table: {
      columns: [
        { label: '#', width: 0.5, align: 'center' }, { label: 'Listing', width: 4 }, { label: 'Score', width: 1, align: 'right' },
        { label: 'Reviews / week', width: 1.3, align: 'right' }, { label: 'Per month', width: 1.1, align: 'right' },
        { label: 'Momentum', width: 1.1, align: 'right' }, { label: 'Recent rating', width: 1.2, align: 'right' },
        { label: 'Reply rate', width: 1.1, align: 'right' }, { label: 'Google total', width: 1.1, align: 'right' },
      ],
      rows: report.listings.map((l) => ({
        highlight: l.isSelf,
        cells: [
          rankCell(l.overallRank, n), listingLabel(l), l.score === null ? 'n/a' : `${Math.round(l.score)}/100`,
          formatCriterion('perWeek4', l.metrics.perWeek4), formatCriterion('perMonth', l.metrics.perMonth),
          formatCriterion('momentum', l.metrics.momentum), formatCriterion('recentRating', l.metrics.recentRating),
          formatCriterion('replyRate', l.metrics.replyRate), formatCriterion('googleTotal', l.metrics.googleTotal),
        ],
      })),
      note: [
        'Score: weighted average of min-max scores (0 = worst, 100 = best in this market). Weights: ' +
          CRITERIA.filter((c) => c.weight > 0).map((c) => `${c.short} ${c.weight}%`).join(', ') + '. Missing values are left out and their weight redistributed.',
        partialNote,
      ].filter(Boolean).join(' '),
    },
  });

  sections.push({
    title: 'Rank matrix (1 = best)',
    rows: [],
    table: {
      columns: [{ label: 'Listing', width: 2.6 }, ...CRITERIA.map((c) => ({ label: c.short, width: 1, align: 'center' as const }))],
      rows: report.listings.map((l) => ({ highlight: l.isSelf, cells: [listingLabel(l), ...CRITERIA.map((c) => rankCell(l.ranks[c.id], n))] })),
    },
  });

  for (const group of CRITERION_GROUPS) {
    const criteria = CRITERIA.filter((c) => c.group === group);
    sections.push({
      title: group,
      rows: [],
      table: {
        columns: [{ label: 'Listing', width: 2.6 }, ...criteria.map((c) => ({ label: c.label, width: 1.4, align: 'right' as const }))],
        rows: report.listings.map((l) => ({ highlight: l.isSelf, cells: [listingLabel(l), ...criteria.map((c) => valueWithRank(l, c.id))] })),
        note: criteria.map((c) => `${c.label}: ${c.description}`).join(' '),
      },
    });
  }

  const completeWeeks = report.weeks.slice(0, -1);
  sections.push({
    title: 'New reviews per week',
    rows: [],
    chart: {
      kind: 'line',
      labels: completeWeeks.map((w) => w.label),
      series: report.listings.map((l) => ({ name: l.title, values: l.weekly.slice(0, -1), color: colors.get(l.id)!, emphasis: l.isSelf })),
      height: 70,
    },
  });
  sections.push({
    title: 'Average reviews per week, last 4 complete weeks',
    rows: [],
    chart: {
      kind: 'bar',
      bars: [...report.listings]
        .sort((a, b) => (b.metrics.perWeek4 ?? -1) - (a.metrics.perWeek4 ?? -1))
        .map((l) => ({ label: listingLabel(l), value: l.metrics.perWeek4, display: formatCriterion('perWeek4', l.metrics.perWeek4), color: colors.get(l.id), emphasis: l.isSelf })),
    },
  });

  sections.push({
    title: 'Methodology',
    rows: [
      ['Market', `${context.keyword} · ${context.area}`],
      ['Period analysed', `${formatDay(report.periodStart, report.timeZone)} – ${formatDay(report.periodEnd, report.timeZone)} (${report.timeZone})`],
      ['Listings compared', String(n)],
      ['Reviews analysed', report.listings.map((l) => `${l.title}: ${l.reviewsInPeriod}`).join(' · ')],
      ['Source', 'Google reviews via DataForSEO, newest first, dated by publication time'],
      ['Weeks', 'ISO weeks (Monday to Sunday); the current week and month are excluded from averages'],
      ['Reply rate', 'Counts reviews older than 7 days only, so recent reviews are not held against the owner'],
      ['Minimum sample', 'Ratings and shares need at least 5 reviews in the period (3 negative reviews for the negative reply rate)'],
    ],
  });
  return sections;
}
