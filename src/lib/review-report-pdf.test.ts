import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { buildComparisonReport, type ReportListing, type ReportReview } from './review-report';
import { comparisonReportMetrics, comparisonReportSections } from './review-report-pdf';
import { drawBarChart, drawLineChart, drawParagraphs, drawTable, niceMax, type BlockContext } from './report-pdf-blocks';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 15, 10);

function reviews(perWeek: number, seed: number): ReportReview[] {
  return Array.from({ length: 14 * perWeek }, (_, i) => ({
    publishedAt: NOW - (2 + (i / perWeek) * 7) * DAY,
    rating: (i + seed) % 5 === 0 ? 2 : 5,
    textLength: i % 3 ? 30 : 0, photoCount: i % 4 ? 0 : 1,
    ownerAnswered: (i + seed) % 2 === 0, ownerRepliedAt: null, localGuide: i % 5 === 0,
  }));
}

function tenListings(): ReportListing[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    title: i === 3 ? 'A very long business name that will never fit in a narrow table column, Lyon 3e arrondissement' : `Plumber ${i + 1}`,
    isSelf: i === 3,
    coverage: i === 9 ? { complete: false, from: NOW - 20 * DAY } : { complete: true, from: null },
    googleRating: 4 + (i % 10) / 10, googleTotal: 50 + i * 37, mapsRank: i + 1,
    reviews: reviews((i % 4) + 1, i),
  }));
}

describe('competitive report PDF', () => {
  it('maps the report to sections with KPIs, a ranking, a rank matrix, per-axis tables and charts', () => {
    const report = buildComparisonReport({ now: NOW, timeZone: 'Europe/Paris', listings: tenListings() });
    const sections = comparisonReportSections(report, { keyword: 'plombier', area: '5 km around Lyon' });
    expect(comparisonReportMetrics(report)).toHaveLength(4);
    const titles = sections.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(['Summary', 'Overall ranking', 'Rank matrix (1 = best)', 'Momentum', 'Engagement', 'New reviews per week', 'Methodology']));
    const matrix = sections.find((s) => s.title.startsWith('Rank matrix'))!.table!;
    expect(matrix.columns).toHaveLength(18); // listing + 17 criteria
    expect(matrix.rows).toHaveLength(10);
    expect(matrix.rows.filter((r) => r.highlight)).toHaveLength(1);
    const ranking = sections.find((s) => s.title === 'Overall ranking')!.table!;
    expect(ranking.note).toMatch(/does not reach back/); // a partial listing is explained
  });

  it('draws every section on A4 landscape across several pages', () => {
    const report = buildComparisonReport({ now: NOW, timeZone: 'Europe/Paris', listings: tenListings() });
    const sections = comparisonReportSections(report, { keyword: 'plombier', area: '5 km around Lyon' });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    const ctx: BlockContext = { pdf, margin: 16, contentWidth: 265, bottom: 192, newPage: () => { pdf.addPage(); return 48; } };
    let y = 50;
    for (const section of sections) {
      if (section.paragraphs) y = drawParagraphs(ctx, section.paragraphs, y);
      if (section.table) y = drawTable(ctx, section.table, y);
      if (section.chart) y = section.chart.kind === 'line' ? drawLineChart(ctx, section.chart, y) : drawBarChart(ctx, section.chart, y);
      expect(y).toBeLessThanOrEqual(ctx.bottom + 12);
    }
    expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('rounds chart axes to readable bounds', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(23)).toBe(25);
  });
});
