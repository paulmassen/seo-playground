import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawFooter, drawHeaderBand } from './brand-pdf';
import { drawCalendar, drawStatusItems, type BlockContext, type PdfStatus } from './report-pdf-blocks';

// A 1x1 transparent PNG, enough to exercise addImage.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function newDoc() {
  return new jsPDF({ unit: 'mm', format: 'a4', compress: true });
}

describe('PDF drawing helpers render with the installed jsPDF', () => {
  it('draws the header band, footer, images and links without throwing', () => {
    const pdf = newDoc();
    for (const style of ['solid', 'wave'] as const) drawHeaderBand(pdf, 210, 30, style, [37, 99, 235]);
    drawFooter(pdf, {
      text: 'Acme SEO · hello@acme.test · https://acme.test',
      style: { footerTextColor: '#ffffff', footerLinkColor: '#93c5fd', footerBackground: '#0f172a' },
      pageWidth: 210, pageHeight: 297, margin: 14, baseline: 289, bandTop: 283,
    });
    pdf.addImage(PNG, 'PNG', 14, 8, 20, 10);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.setLineCap('round');
    pdf.setLineJoin('round');
    pdf.circle(50, 50, 5, 'FD');
    pdf.roundedRect(10, 60, 40, 20, 2, 2, 'FD');
    expect(pdf.splitTextToSize('A long sentence that has to wrap over several lines in the report.', 40).length).toBeGreaterThan(1);
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it('lays out status cards and the calendar across pages and produces a valid PDF', () => {
    const pdf = newDoc();
    const ctx: BlockContext = {
      pdf, margin: 14, contentWidth: 182, bottom: 270,
      newPage: () => { pdf.addPage(); return 20; },
    };
    const statuses: PdfStatus[] = ['cited', 'not-cited', 'error', 'none'];
    const items = Array.from({ length: 30 }, (_, i) => ({
      status: statuses[i % 4], title: `Prompt ${i} about local SEO`, subtitle: 'ChatGPT · 2026-10-01', badge: 'Cited', note: 'Mentioned in the second paragraph.',
    }));
    drawStatusItems(ctx, items, 20);
    drawCalendar(ctx, { weeks: [{ label: 'W40', days: [{ day: 1, status: 'cited' }, null, { day: 3, status: 'error' }, null, null, null, null] }] }, 20);

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
