'use client';

import { Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { brandPalette, fitBox, footerPalette, imageSize, resolveBrandStyle, type BrandStyle } from '@/lib/brand';
import { drawFooter, drawHeaderBand, pdfSafeText } from '@/lib/brand-pdf';
import {
  drawBarChart, drawCalendar, drawLineChart, drawParagraphs, drawStatusItems, drawTable, STATUS_COLORS,
  type BlockContext, type PdfCalendar, type PdfChart, type PdfStatus, type PdfTable, type StatusItem,
} from '@/lib/report-pdf-blocks';

/** `status` colours the value (green cited, grey not cited, red error). */
export type ReportMetric = { label: string; value: string; detail?: string; status?: PdfStatus };
/**
 * Plain label/value rows, optionally followed by bullet paragraphs, a table, a chart, a weekly calendar
 * heat-map and status cards (drawn in that order). `pageBreakBefore` starts the section on a new page.
 */
export type ReportSection = {
  title: string;
  rows: Array<[string, string]>;
  paragraphs?: string[];
  table?: PdfTable;
  chart?: PdfChart;
  statusItems?: StatusItem[];
  calendar?: PdfCalendar;
  pageBreakBefore?: boolean;
};

type Props = {
  brandName: string;
  brandLogoUrl?: string;
  /** White-label header colour (hex). Defaults to the standard report ink. */
  brandColor?: string;
  /** White-label footer text. When blank, the footer shows the brand name and report title. */
  brandFooter?: string;
  /** Header shape and footer colours (background, text, links). */
  brandStyle?: Partial<BrandStyle>;
  filename: string;
  title: string;
  subject: string;
  generatedAt?: number;
  metrics: ReportMetric[];
  sections: ReportSection[];
  /** Landscape suits wide comparison tables. Defaults to portrait. */
  orientation?: 'portrait' | 'landscape';
  /** Small caption above the title in the header. Defaults to "SEO REPORT". */
  kicker?: string;
  /** Button label. Defaults to "PDF". */
  label?: string;
  /** Locale of the generation date in the header. Defaults to the browser locale. */
  locale?: string;
  /** 'link' (default): discreet text button. 'solid': the dark export button used by the Geo-grid report. */
  variant?: 'link' | 'solid';
};

const ink = [15, 23, 42] as const;
const muted = [100, 116, 139] as const;

function textForPdf(value: string, max = 110) {
  return pdfSafeText(value).slice(0, max);
}

async function readLogo(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(png|jpe?g|webp)$/i.test(blob.type)) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export default function ReportPdfExportButton(props: Props) {
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: props.orientation ?? 'portrait', compress: true });
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      const margin = 16;
      const logo = await readLogo(props.brandLogoUrl);
      const logoSize = logo ? await imageSize(logo) : null;
      const palette = brandPalette(props.brandColor);
      const style = resolveBrandStyle(props.brandStyle);
      const footerText = props.brandFooter?.trim() || `${props.brandName} · ${props.title}`;
      const date = new Intl.DateTimeFormat(props.locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(props.generatedAt ?? Date.now()));
      const contentWidth = width - margin * 2;
      const write = (value: string, x: number, y: number, options?: Parameters<typeof pdf.text>[3]) => pdf.text(textForPdf(value, 1000), x, y, options);
      const pageHeader = () => {
        drawHeaderBand(pdf, width, 34, style.headerStyle, palette.fill);
        let imageAdded = false;
        if (logo && logoSize) {
          // Keep the logo's aspect ratio inside a 30 x 18 mm box instead of stretching it.
          const box = fitBox(logoSize.width, logoSize.height, 30, 18);
          try { pdf.addImage(logo, margin, 8 + (18 - box.height) / 2, box.width, box.height); imageAdded = true; } catch { /* fall back to the configured name */ }
        }
        if (!imageAdded) { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(...palette.text); write(props.brandName, margin, 20); }
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...palette.subtle); write((props.kicker ?? 'SEO REPORT').toUpperCase(), width - margin, 13, { align: 'right' });
        pdf.setFontSize(14); pdf.setTextColor(...palette.text); write(props.title, width - margin, 21, { align: 'right' });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...palette.subtle); write(date, width - margin, 27, { align: 'right' });
      };
      const footer = () => {
        drawFooter(pdf, { text: footerText, style, pageWidth: width, pageHeight: height, margin, baseline: height - 8, bandTop: height - 12, reservedRight: 12 });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
        const number = footerPalette(style).text;
        pdf.setTextColor(number[0], number[1], number[2]);
        write(String(pdf.getNumberOfPages()), width - margin, height - 8, { align: 'right' });
      };
      const newPage = () => { footer(); pdf.addPage(); pageHeader(); return 48; };

      const blocks: BlockContext = { pdf, margin, contentWidth, bottom: height - 18, newPage };
      pageHeader();
      pdf.setTextColor(...ink); pdf.setFont('helvetica', 'bold');
      // Measure at the size it is drawn at: try the large size first, then fall back to a smaller two-line size.
      pdf.setFontSize(18);
      let subjectLines = pdf.splitTextToSize(textForPdf(props.subject, 400), contentWidth) as string[];
      if (subjectLines.length > 1) {
        pdf.setFontSize(13);
        subjectLines = (pdf.splitTextToSize(textForPdf(props.subject, 400), contentWidth) as string[]).slice(0, 2);
      }
      subjectLines.forEach((line, n) => write(line, margin, 47 + n * 6.5));
      let y = Math.max(55, 47 + (subjectLines.length - 1) * 6.5 + 8);
      const cols = Math.min(Math.max(props.metrics.length, 1), 4);
      const gap = 3; const cardWidth = (width - margin * 2 - gap * (cols - 1)) / cols;
      props.metrics.forEach((metric, index) => {
        const x = margin + (index % cols) * (cardWidth + gap);
        pdf.setFillColor(248, 250, 252); pdf.roundedRect(x, y, cardWidth, 23, 2.5, 2.5, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.3); pdf.setTextColor(...muted); write(metric.label.toUpperCase(), x + 3, y + 6);
        pdf.setFontSize(13); { const c = metric.status ? STATUS_COLORS[metric.status].text : ink; pdf.setTextColor(c[0], c[1], c[2]); } write(pdf.splitTextToSize(textForPdf(metric.value, 200), cardWidth - 6)[0] ?? '', x + 3, y + 14);
        if (metric.detail) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.3); pdf.setTextColor(...muted); write(pdf.splitTextToSize(textForPdf(metric.detail, 200), cardWidth - 6)[0] ?? '', x + 3, y + 19); }
      });
      y += 32;
      const hasContent = (entry: ReportSection) => entry.rows.length > 0 || Boolean(entry.paragraphs?.length || entry.table?.rows.length || entry.chart
        || entry.statusItems?.length || entry.calendar?.weeks.length);
      for (const section of props.sections.filter(hasContent)) {
        // Keep a section title with the start of its table or chart.
        const firstBlock = section.chart ? (section.chart.kind === 'line' ? (section.chart.height ?? 62) + 12 : 16) : section.table ? 22 : 0;
        if (y > height - 45 || (section.pageBreakBefore && y > 60) || y + 5 + firstBlock > height - 18) y = newPage();
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...ink); write(section.title, margin, y); y += 5;
        const labelWidth = contentWidth * 0.42;
        const valueWidth = contentWidth * 0.52;
        const lineHeight = 3.6;
        for (const [label, value] of section.rows) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
          const labelLines = pdf.splitTextToSize(textForPdf(label, 1000), labelWidth) as string[];
          pdf.setFont('helvetica', 'bold');
          const valueLines = pdf.splitTextToSize(textForPdf(value, 1000), valueWidth) as string[];
          const rowHeight = Math.max(labelLines.length, valueLines.length, 1) * lineHeight + 3;
          if (y + rowHeight > height - 18) y = newPage();
          pdf.setDrawColor(226, 232, 240); pdf.line(margin, y + rowHeight - 1.5, width - margin, y + rowHeight - 1.5);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...muted);
          labelLines.forEach((line, i) => write(line, margin, y + 2.6 + i * lineHeight));
          pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ink);
          valueLines.forEach((line, i) => write(line, width - margin, y + 2.6 + i * lineHeight, { align: 'right' }));
          y += rowHeight;
        }
        if (section.paragraphs?.length) y = drawParagraphs(blocks, section.paragraphs, y);
        if (section.table?.rows.length) y = drawTable(blocks, section.table, y);
        if (section.chart) y = section.chart.kind === 'line' ? drawLineChart(blocks, section.chart, y + 1) : drawBarChart(blocks, section.chart, y + 1);
        if (section.calendar?.weeks.length) y = drawCalendar(blocks, section.calendar, y + 2);
        if (section.statusItems?.length) y = drawStatusItems(blocks, section.statusItems, y + (section.rows.length ? 1 : 0));
        y += 4;
      }
      footer();
      pdf.save(props.filename.endsWith('.pdf') ? props.filename : `${props.filename}.pdf`);
    } finally { setExporting(false); }
  }

  return (
    <button type="button" onClick={exportPdf} disabled={exporting}
      className={props.variant === 'solid'
        ? 'inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
        : 'inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-600 disabled:opacity-50 transition-colors'}
      title="Export PDF report">
      {exporting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {exporting ? (props.variant === 'solid' ? 'Preparing PDF…' : 'PDF…') : props.label ?? 'PDF'}
    </button>
  );
}
