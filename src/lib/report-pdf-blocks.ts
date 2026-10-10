// Visual blocks for white-label PDF reports: status cards (cited / not cited / error) and a
// weekly calendar heat-map. Types are pure; the draw functions receive an existing jsPDF document.
import type { jsPDF } from 'jspdf';
import { pdfSafeText } from './brand-pdf';
import type { Rgb } from './brand';

export type PdfStatus = 'cited' | 'not-cited' | 'error' | 'none';

/** One card: a status icon, a title (+ optional subtitle), a status pill and an optional note under the pill. */
export type StatusItem = { status: PdfStatus; title: string; subtitle?: string; badge: string; note?: string };

/** One calendar row (a week). `null` days are outside the checked range and are not drawn. */
export type CalendarRow = { label: string; days: Array<{ day: number; status: PdfStatus | null } | null> };

export type PdfCalendar = { weeks: CalendarRow[] };

export const STATUS_COLORS: Record<PdfStatus, { solid: Rgb; tint: Rgb; text: Rgb }> = {
  cited: { solid: [22, 163, 74], tint: [220, 252, 231], text: [21, 128, 61] },
  'not-cited': { solid: [148, 163, 184], tint: [241, 245, 249], text: [71, 85, 105] },
  error: { solid: [220, 38, 38], tint: [254, 226, 226], text: [185, 28, 28] },
  none: { solid: [203, 213, 225], tint: [248, 250, 252], text: [100, 116, 139] },
};

const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [100, 116, 139];
const CARD_BG: Rgb = [248, 250, 252];

export type BlockContext = {
  pdf: jsPDF;
  margin: number;
  contentWidth: number;
  /** Lowest y a block may reach before a new page is needed. */
  bottom: number;
  /** Draws the footer, starts a new page and returns the y to continue from. */
  newPage: () => number;
};

function setFill(pdf: jsPDF, color: Rgb) { pdf.setFillColor(color[0], color[1], color[2]); }
function setText(pdf: jsPDF, color: Rgb) { pdf.setTextColor(color[0], color[1], color[2]); }

/** Filled round icon: a tick for cited, a cross for not cited, "!" for error, a dash otherwise. */
export function drawStatusIcon(pdf: jsPDF, cx: number, cy: number, radius: number, status: PdfStatus) {
  setFill(pdf, STATUS_COLORS[status].solid);
  pdf.circle(cx, cy, radius, 'F');
  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(radius * 0.32);
  pdf.setLineCap('round');
  pdf.setLineJoin('round');
  const r = radius;
  if (status === 'cited') {
    pdf.line(cx - r * 0.45, cy + r * 0.02, cx - r * 0.12, cy + r * 0.38);
    pdf.line(cx - r * 0.12, cy + r * 0.38, cx + r * 0.5, cy - r * 0.34);
  } else if (status === 'not-cited') {
    pdf.line(cx - r * 0.34, cy - r * 0.34, cx + r * 0.34, cy + r * 0.34);
    pdf.line(cx + r * 0.34, cy - r * 0.34, cx - r * 0.34, cy + r * 0.34);
  } else if (status === 'error') {
    pdf.line(cx, cy - r * 0.5, cx, cy + r * 0.1);
    pdf.line(cx, cy + r * 0.48, cx, cy + r * 0.5);
  } else {
    pdf.line(cx - r * 0.38, cy, cx + r * 0.38, cy);
  }
  pdf.setLineCap('butt');
}

/** Rounded tinted pill with centred text. Returns its width. */
function drawPill(pdf: jsPDF, text: string, right: number, y: number, status: PdfStatus, minWidth: number): number {
  const colors = STATUS_COLORS[status];
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.8);
  const label = pdfSafeText(text).toUpperCase();
  const width = Math.max(minWidth, pdf.getTextWidth(label) + 6);
  const height = 5.4;
  setFill(pdf, colors.tint);
  pdf.roundedRect(right - width, y, width, height, height / 2, height / 2, 'F');
  setText(pdf, colors.text);
  pdf.text(label, right - width / 2, y + 3.75, { align: 'center' });
  return width;
}

/**
 * Stack of status cards. Returns the y below the last card. Long titles wrap (3 lines max) so a full
 * prompt stays readable without making the row grow unbounded.
 */
export function drawStatusItems(ctx: BlockContext, items: StatusItem[], startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  let y = startY;
  const gap = 1.8;
  const badgeMin = 22;
  const textX = margin + 13;
  const textWidth = contentWidth - 13 - badgeMin - 9;

  for (const item of items) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    const titleLines = (pdf.splitTextToSize(pdfSafeText(item.title), textWidth) as string[]).slice(0, 3);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const subtitleLines = item.subtitle ? (pdf.splitTextToSize(pdfSafeText(item.subtitle), textWidth) as string[]).slice(0, 3) : [];

    const textHeight = titleLines.length * 4 + subtitleLines.length * 3.3;
    const height = Math.max(item.note ? 14 : 10.5, textHeight + 6.4);
    if (y + height > ctx.bottom) y = ctx.newPage();

    const colors = STATUS_COLORS[item.status];
    setFill(pdf, CARD_BG);
    pdf.roundedRect(margin, y, contentWidth, height, 2, 2, 'F');
    setFill(pdf, colors.solid);
    pdf.roundedRect(margin, y + 1.6, 1.1, height - 3.2, 0.55, 0.55, 'F');
    drawStatusIcon(pdf, margin + 7, y + height / 2, 3, item.status);

    const blockTop = y + (height - textHeight) / 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    setText(pdf, INK);
    titleLines.forEach((line, i) => pdf.text(line, textX, blockTop + 3 + i * 4));
    if (subtitleLines.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      setText(pdf, MUTED);
      subtitleLines.forEach((line, i) => pdf.text(line, textX, blockTop + titleLines.length * 4 + 2.4 + i * 3.3));
    }

    const right = margin + contentWidth - 4;
    const pillY = item.note ? y + height / 2 - 5.2 : y + (height - 5.4) / 2;
    drawPill(pdf, item.badge, right, pillY, item.status, badgeMin);
    if (item.note) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      setText(pdf, MUTED);
      pdf.text(pdfSafeText(item.note), right, pillY + 9, { align: 'right' });
    }
    y += height + gap;
  }
  return y;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LEGEND: Array<[PdfStatus, string]> = [['cited', 'Cited'], ['not-cited', 'Not cited'], ['error', 'Error'], ['none', 'No check']];

/** Weekly heat-map: one coloured cell per day, numbered with the day of the month. */
export function drawCalendar(ctx: BlockContext, calendar: PdfCalendar, startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  const labelWidth = 28;
  const gap = 1.6;
  const cellWidth = (contentWidth - labelWidth - gap * 6) / 7;
  const cellHeight = 7.4;
  let y = startY;

  if (y + 14 + cellHeight > ctx.bottom) y = ctx.newPage();

  // Legend
  let lx = margin;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8);
  for (const [status, label] of LEGEND) {
    if (status === 'none') {
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(lx, y - 2.5, 3.2, 3.2, 0.8, 0.8, 'S');
    } else {
      setFill(pdf, STATUS_COLORS[status].solid);
      pdf.roundedRect(lx, y - 2.5, 3.2, 3.2, 0.8, 0.8, 'F');
    }
    setText(pdf, MUTED);
    pdf.text(label, lx + 4.6, y);
    lx += 4.6 + pdf.getTextWidth(label) + 7;
  }
  y += 5;

  const drawWeekdays = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.2);
    setText(pdf, MUTED);
    WEEKDAYS.forEach((name, i) => pdf.text(name.toUpperCase(), margin + labelWidth + i * (cellWidth + gap) + cellWidth / 2, y + 2.5, { align: 'center' }));
    y += 5;
  };
  drawWeekdays();

  for (const week of calendar.weeks) {
    if (y + cellHeight > ctx.bottom) { y = ctx.newPage(); drawWeekdays(); }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    setText(pdf, MUTED);
    pdf.text(pdfSafeText(week.label), margin, y + cellHeight / 2 + 1);
    week.days.forEach((day, i) => {
      if (!day) return;
      const x = margin + labelWidth + i * (cellWidth + gap);
      const status = day.status ?? 'none';
      const colors = STATUS_COLORS[status];
      if (status === 'none') {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.25);
        pdf.roundedRect(x, y, cellWidth, cellHeight, 1.4, 1.4, 'S');
        setText(pdf, [148, 163, 184]);
      } else {
        setFill(pdf, colors.solid);
        pdf.roundedRect(x, y, cellWidth, cellHeight, 1.4, 1.4, 'F');
        pdf.setTextColor(255, 255, 255);
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(String(day.day), x + cellWidth / 2, y + cellHeight / 2 + 1, { align: 'center' });
    });
    y += cellHeight + gap;
  }
  return y;
}

// ─── Tables, charts and bullet paragraphs ────────────────────────────────────

/** A plain string, or a cell with a coloured background chip / text colour. */
export type PdfCell = string | { text: string; fill?: Rgb; color?: Rgb; bold?: boolean };

export type PdfTable = {
  /** `width` is relative (defaults to 1); columns share the content width. */
  columns: Array<{ label: string; width?: number; align?: 'left' | 'right' | 'center' }>;
  rows: Array<{ cells: PdfCell[]; highlight?: boolean }>;
  /** Small print under the table. */
  note?: string;
};

export type PdfLineChart = {
  kind: 'line';
  labels: string[];
  series: Array<{ name: string; values: Array<number | null>; color: Rgb; emphasis?: boolean }>;
  height?: number;
};

export type PdfBarChart = {
  kind: 'bar';
  bars: Array<{ label: string; value: number | null; display: string; color?: Rgb; emphasis?: boolean }>;
};

export type PdfChart = PdfLineChart | PdfBarChart;

const HEADER_BG: Rgb = [241, 245, 249];
const HIGHLIGHT_BG: Rgb = [239, 246, 255];
const RULE: Rgb = [226, 232, 240];

/** Truncates to the width with an ellipsis, measured in the current font. */
function fitText(pdf: jsPDF, value: string, width: number): string {
  const text = pdfSafeText(value);
  if (pdf.getTextWidth(text) <= width) return text;
  let end = text.length;
  while (end > 0 && pdf.getTextWidth(`${text.slice(0, end)}...`) > width) end--;
  return end > 0 ? `${text.slice(0, end)}...` : '';
}

/** Multi-column table; the header row repeats after a page break and the highlighted row is tinted. */
export function drawTable(ctx: BlockContext, table: PdfTable, startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  const weights = table.columns.map((c) => c.width ?? 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => (w / totalWeight) * contentWidth);
  const xs = widths.map((_, i) => margin + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const rowHeight = 6.2;
  const pad = 1.6;
  let y = startY;

  // Header labels wrap onto two lines at word boundaries; a word too long for its column
  // shrinks the font (down to 4.2 pt) instead of being cut in the middle.
  pdf.setFont('helvetica', 'bold');
  const headers = table.columns.map((column, i) => {
    const label = pdfSafeText(column.label.toUpperCase());
    const available = widths[i] - pad * 2;
    let size = 5.8;
    pdf.setFontSize(size);
    while (size > 4.2 && label.split(/\s+/).some((word) => pdf.getTextWidth(word) > available)) {
      size -= 0.2;
      pdf.setFontSize(size);
    }
    const lines = pdf.splitTextToSize(label, available) as string[];
    return { size, lines: lines.length > 2 ? [lines[0], fitText(pdf, lines.slice(1).join(' '), available)] : lines };
  });
  const headerHeight = Math.max(...headers.map((h) => h.lines.length)) > 1 ? 9 : 6.5;

  const drawHeader = () => {
    setFill(pdf, HEADER_BG);
    pdf.rect(margin, y, contentWidth, headerHeight, 'F');
    pdf.setFont('helvetica', 'bold');
    setText(pdf, MUTED);
    table.columns.forEach((column, i) => {
      const align = column.align ?? 'left';
      const x = align === 'right' ? xs[i] + widths[i] - pad : align === 'center' ? xs[i] + widths[i] / 2 : xs[i] + pad;
      const { lines, size } = headers[i];
      pdf.setFontSize(size);
      const top = y + headerHeight / 2 - (lines.length - 1) * 1.25 + 1.2;
      lines.forEach((line, n) => pdf.text(line, x, top + n * 2.5, { align }));
    });
    y += headerHeight;
  };

  if (y + headerHeight + rowHeight > ctx.bottom) y = ctx.newPage();
  drawHeader();

  for (const row of table.rows) {
    if (y + rowHeight > ctx.bottom) { y = ctx.newPage(); drawHeader(); }
    if (row.highlight) { setFill(pdf, HIGHLIGHT_BG); pdf.rect(margin, y, contentWidth, rowHeight, 'F'); }
    pdf.setDrawColor(RULE[0], RULE[1], RULE[2]);
    pdf.setLineWidth(0.15);
    pdf.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);
    row.cells.forEach((cell, i) => {
      const column = table.columns[i];
      if (!column) return;
      const spec = typeof cell === 'string' ? { text: cell } : cell;
      const align = column.align ?? 'left';
      pdf.setFont('helvetica', spec.bold || row.highlight ? 'bold' : 'normal');
      pdf.setFontSize(6.8);
      if (spec.fill) {
        const chipWidth = Math.min(widths[i] - pad * 2, Math.max(7, pdf.getTextWidth(pdfSafeText(spec.text)) + 3));
        const chipX = align === 'right' ? xs[i] + widths[i] - pad - chipWidth : align === 'center' ? xs[i] + (widths[i] - chipWidth) / 2 : xs[i] + pad;
        setFill(pdf, spec.fill);
        pdf.roundedRect(chipX, y + 1.1, chipWidth, rowHeight - 2.2, 1, 1, 'F');
        setText(pdf, spec.color ?? [255, 255, 255]);
        pdf.text(fitText(pdf, spec.text, chipWidth - 1), chipX + chipWidth / 2, y + 4.2, { align: 'center' });
        return;
      }
      setText(pdf, spec.color ?? INK);
      const text = fitText(pdf, spec.text, widths[i] - pad * 2);
      const x = align === 'right' ? xs[i] + widths[i] - pad : align === 'center' ? xs[i] + widths[i] / 2 : xs[i] + pad;
      pdf.text(text, x, y + 4.2, { align });
    });
    y += rowHeight;
  }

  if (table.note) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.3);
    setText(pdf, MUTED);
    const lines = pdf.splitTextToSize(pdfSafeText(table.note), contentWidth) as string[];
    if (y + 2 + lines.length * 3 > ctx.bottom) y = ctx.newPage();
    lines.forEach((line, i) => pdf.text(line, margin, y + 3.5 + i * 3));
    y += 2 + lines.length * 3;
  }
  return y + 1;
}

/** Bulleted sentences, wrapped to the content width. */
export function drawParagraphs(ctx: BlockContext, paragraphs: string[], startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  let y = startY;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  for (const paragraph of paragraphs) {
    const lines = pdf.splitTextToSize(pdfSafeText(paragraph), contentWidth - 5) as string[];
    const height = lines.length * 3.9 + 1.4;
    if (y + height > ctx.bottom) y = ctx.newPage();
    setFill(pdf, MUTED);
    pdf.circle(margin + 1.2, y + 1.9, 0.55, 'F');
    setText(pdf, INK);
    lines.forEach((line, i) => pdf.text(line, margin + 4.5, y + 2.9 + i * 3.9));
    y += height;
  }
  return y;
}

/** Rounds a maximum up to a readable axis bound (1, 2, 5 × 10^n). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

function drawLegend(ctx: BlockContext, items: Array<{ name: string; color: Rgb; emphasis?: boolean }>, startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  let x = margin;
  let y = startY;
  pdf.setFontSize(6.5);
  for (const item of items) {
    pdf.setFont('helvetica', item.emphasis ? 'bold' : 'normal');
    const label = fitText(pdf, item.name, 60);
    const width = 5 + pdf.getTextWidth(label) + 5;
    if (x + width > margin + contentWidth) { x = margin; y += 4; }
    setFill(pdf, item.color);
    pdf.roundedRect(x, y - 2.2, 3, 2.6, 0.5, 0.5, 'F');
    setText(pdf, item.emphasis ? INK : MUTED);
    pdf.text(label, x + 4.2, y);
    x += width;
  }
  return y + 3;
}

export function drawLineChart(ctx: BlockContext, chart: PdfLineChart, startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  const height = chart.height ?? 62;
  const legendRows = Math.ceil(chart.series.length / 5);
  let y = startY;
  if (y + height + 6 + legendRows * 4 > ctx.bottom) y = ctx.newPage();

  const axisWidth = 9;
  const left = margin + axisWidth;
  const width = contentWidth - axisWidth;
  const plotTop = y + 2;
  const plotHeight = height - 9;
  const values = chart.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(1, ...values));
  const n = Math.max(1, chart.labels.length);
  const xAt = (i: number) => (n === 1 ? left + width / 2 : left + (i / (n - 1)) * width);
  const yAt = (v: number) => plotTop + plotHeight - (v / max) * plotHeight;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  for (let t = 0; t <= 4; t++) {
    const value = (max / 4) * t;
    const gy = yAt(value);
    pdf.setDrawColor(RULE[0], RULE[1], RULE[2]);
    pdf.setLineWidth(0.15);
    pdf.line(left, gy, left + width, gy);
    setText(pdf, MUTED);
    pdf.text(Number.isInteger(value) ? String(value) : value.toFixed(1), left - 1.5, gy + 1, { align: 'right' });
  }
  const every = Math.max(1, Math.ceil(n / 14));
  chart.labels.forEach((label, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    pdf.text(pdfSafeText(label), xAt(i), plotTop + plotHeight + 4, { align: 'center' });
  });

  // Muted series first so the emphasised one is drawn on top.
  const ordered = [...chart.series].sort((a, b) => Number(Boolean(a.emphasis)) - Number(Boolean(b.emphasis)));
  for (const series of ordered) {
    pdf.setDrawColor(series.color[0], series.color[1], series.color[2]);
    pdf.setLineWidth(series.emphasis ? 0.9 : 0.4);
    let previous: { x: number; y: number } | null = null;
    series.values.forEach((value, i) => {
      if (value === null) { previous = null; return; }
      const point = { x: xAt(i), y: yAt(value) };
      if (previous) pdf.line(previous.x, previous.y, point.x, point.y);
      if (series.emphasis) { setFill(pdf, series.color); pdf.circle(point.x, point.y, 0.7, 'F'); }
      previous = point;
    });
  }
  return drawLegend(ctx, chart.series, y + height + 1) + 1;
}

export function drawBarChart(ctx: BlockContext, chart: PdfBarChart, startY: number): number {
  const { pdf, margin, contentWidth } = ctx;
  const labelWidth = Math.min(70, contentWidth * 0.3);
  const valueWidth = 16;
  const barArea = contentWidth - labelWidth - valueWidth;
  const barHeight = 4.4;
  const gap = 1.8;
  const max = Math.max(0, ...chart.bars.map((b) => b.value ?? 0)) || 1;
  let y = startY;
  for (const bar of chart.bars) {
    if (y + barHeight + gap > ctx.bottom) y = ctx.newPage();
    pdf.setFont('helvetica', bar.emphasis ? 'bold' : 'normal');
    pdf.setFontSize(7);
    setText(pdf, INK);
    pdf.text(fitText(pdf, bar.label, labelWidth - 3), margin, y + 3.3);
    setFill(pdf, HEADER_BG);
    pdf.roundedRect(margin + labelWidth, y, barArea, barHeight, 1, 1, 'F');
    if (bar.value !== null && bar.value > 0) {
      setFill(pdf, bar.color ?? [100, 116, 139]);
      pdf.roundedRect(margin + labelWidth, y, Math.max(1.5, (bar.value / max) * barArea), barHeight, 1, 1, 'F');
    }
    setText(pdf, bar.value === null ? MUTED : INK);
    pdf.text(pdfSafeText(bar.display), margin + contentWidth, y + 3.3, { align: 'right' });
    y += barHeight + gap;
  }
  return y;
}
