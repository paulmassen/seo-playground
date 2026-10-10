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
