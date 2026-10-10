// jsPDF drawing helpers shared by every white-label PDF export.
// Browser-only: they receive an already created jsPDF document from the caller.
import type { jsPDF } from 'jspdf';
import { footerPalette, footerSegments, headerPolygon, type BrandHeaderStyle, type BrandStyle, type Rgb } from './brand';

/** Standard PDF fonts only cover WinAnsi, so anything else is replaced before drawing. */
export function pdfSafeText(value: string): string {
  return value
    .replace(/\s?★/g, ' stars')
    .replace(/[·•]/g, '|')
    .replace(/[–—]/g, '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

/** Paints the report header band, straight or wavy, in the brand colour. */
export function drawHeaderBand(pdf: jsPDF, width: number, height: number, style: BrandHeaderStyle, fill: Rgb) {
  const points = headerPolygon(width, height, style);
  const [originX, originY] = points[0];
  // jsPDF draws polylines from relative vectors, so convert the absolute vertices.
  const vectors = points.slice(1).map((point, index): [number, number] => [point[0] - points[index][0], point[1] - points[index][1]]);
  pdf.setFillColor(fill[0], fill[1], fill[2]);
  pdf.lines(vectors, originX, originY, [1, 1], 'F', true);
}

type FooterOptions = {
  text: string;
  style: Pick<BrandStyle, 'footerTextColor' | 'footerLinkColor' | 'footerBackground'>;
  pageWidth: number;
  pageHeight: number;
  /** Left margin of the footer text, in millimetres. */
  margin: number;
  /** Baseline of the footer text. */
  baseline: number;
  /** Top of the footer band. The band runs from here to the bottom of the page. */
  bandTop: number;
  /** Width kept free on the right for a page number or label. */
  reservedRight?: number;
};

/** Paints the footer band and writes the footer text, colouring and linking URLs and e-mail addresses. */
export function drawFooter(pdf: jsPDF, options: FooterOptions) {
  const colors = footerPalette(options.style);
  pdf.setFillColor(colors.background[0], colors.background[1], colors.background[2]);
  pdf.rect(0, options.bandTop, options.pageWidth, options.pageHeight - options.bandTop, 'F');

  const text = pdfSafeText(options.text);
  const maxWidth = options.pageWidth - options.margin * 2 - (options.reservedRight ?? 0);
  pdf.setFont('helvetica', 'normal');
  let fontSize = 7;
  pdf.setFontSize(fontSize);
  // Shrink long footers instead of letting them run into the page number.
  while (fontSize > 5.5 && pdf.getTextWidth(text) > maxWidth) {
    fontSize -= 0.25;
    pdf.setFontSize(fontSize);
  }

  let cursor = options.margin;
  for (const segment of footerSegments(text)) {
    const color = segment.href ? colors.link : colors.text;
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(segment.text, cursor, options.baseline);
    const width = pdf.getTextWidth(segment.text);
    if (segment.href) pdf.link(cursor, options.baseline - 2.6, width, 3.4, { url: segment.href });
    cursor += width;
  }
}
