'use client';

import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary } from './grid-insights';
import { brandPalette, fitBox, footerPalette, imageSize, resolveBrandStyle, type BrandStyle } from '@/lib/brand';
import { drawFooter, drawHeaderBand } from '@/lib/brand-pdf';

type Props = {
  results: GridPoint[];
  gridSize: number;
  spacingKm: number;
  keyword: string;
  target: string;
  language: string;
  searchedAt: number;
  brandName: string;
  brandLogoUrl?: string;
  /** White-label header colour (hex). Defaults to the standard report ink. */
  brandColor?: string;
  /** White-label footer text. When blank, the footer reads "Prepared by <brand name>". */
  brandFooter?: string;
  /** Header shape and footer colours (background, text, links). */
  brandStyle?: Partial<BrandStyle>;
  /** Id of the live Leaflet map that must be embedded in this report. */
  mapElementId?: string;
};

const palette = {
  ink: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  line: [226, 232, 240] as const,
  panel: [248, 250, 252] as const,
};

function rankColor(rank: number | null): [number, number, number] {
  if (rank === null) return [203, 213, 225];
  if (rank === 1) return [5, 150, 105];
  if (rank <= 3) return [16, 185, 129];
  if (rank <= 7) return [20, 184, 166];
  if (rank <= 10) return [59, 130, 246];
  if (rank <= 15) return [245, 158, 11];
  if (rank <= 20) return [249, 115, 22];
  return [239, 68, 68];
}

function pdfText(value: string, max = 90): string {
  // Standard PDF fonts are WinAnsi-based. This keeps the report robust when a
  // project name or listing contains characters outside that character set.
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?').slice(0, max);
}

async function logoDataUrl(url: string): Promise<string | null> {
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
  } catch {
    // A remote logo without CORS permission should never prevent an export.
    return null;
  }
}

type MapCapture = { dataUrl: string; width: number; height: number };

async function mapDataUrl(elementId?: string): Promise<MapCapture | null> {
  if (!elementId) return null;
  const element = document.getElementById(elementId);
  if (!element) return null;
  try {
    // The map is mounted asynchronously. Do not produce a report until Leaflet
    // has placed the rank markers (or until a short, bounded wait expires).
    for (let attempt = 0; attempt < 20 && !element.querySelector('.leaflet-marker-icon'); attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (!element.querySelector('.leaflet-marker-icon')) return null;
    const { toPng } = await import('html-to-image');
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return null;
    const dataUrl = await toPng(element, {
      width: Math.round(width),
      height: Math.round(height),
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#e2e8f0',
      // Leaflet's controls/panes use transforms that are already fully rendered;
      // capturing the root preserves both the basemap tiles and the rank markers.
      style: { borderRadius: '0' },
    });
    return { dataUrl, width, height };
  } catch {
    return null;
  }
}

function filenamePart(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'report';
}

export default function GridPdfExportButton(props: Props) {
  const [isExporting, setIsExporting] = useState(false);

  const exportReport = async () => {
    setIsExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      const margin = 16;
      const summary = computeGridSummary(props.results);
      const logo = props.brandLogoUrl ? await logoDataUrl(props.brandLogoUrl) : null;
      const logoSize = logo ? await imageSize(logo) : null;
      const brand = brandPalette(props.brandColor);
      const style = resolveBrandStyle(props.brandStyle);
      const mapImage = await mapDataUrl(props.mapElementId);
      const formatDate = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'long', timeStyle: 'short',
      }).format(new Date(props.searchedAt));

      const text = (value: string, x: number, y: number, options?: Parameters<typeof pdf.text>[3]) =>
        pdf.text(pdfText(value), x, y, options);
      const setColor = (color: readonly [number, number, number]) => pdf.setTextColor(color[0], color[1], color[2]);
      const fill = (color: readonly [number, number, number]) => pdf.setFillColor(color[0], color[1], color[2]);

      drawHeaderBand(pdf, width, 38, style.headerStyle, brand.fill);
      let logoAdded = false;
      if (logo && logoSize) {
        // Keep the logo's aspect ratio inside a 28 x 18 mm box instead of stretching it.
        const box = fitBox(logoSize.width, logoSize.height, 28, 18);
        try {
          pdf.addImage(logo, margin, 10 + (18 - box.height) / 2, box.width, box.height);
          logoAdded = true;
        } catch {
          // The text mark below remains the reliable brand fallback.
        }
      }
      if (!logoAdded) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.setTextColor(...brand.text);
        text(props.brandName, margin, 21);
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...brand.subtle);
      text('LOCAL SEARCH INTELLIGENCE', width - margin, 15, { align: 'right' });
      pdf.setFontSize(16);
      pdf.setTextColor(...brand.text);
      text('Geo-grid ranking report', width - margin, 24, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...brand.subtle);
      text(formatDate, width - margin, 30, { align: 'right' });

      setColor(palette.ink);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(19);
      text(props.keyword, margin, 53);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      setColor(palette.muted);
      text(`Target: ${props.target}  /  ${props.gridSize} x ${props.gridSize} points  /  ${props.spacingKm} km spacing  /  ${props.language}`, margin, 60);

      const metrics = [
        ['ATO SCORE', `${summary.ato}%`, 'Local visibility'],
        ['AVERAGE RANK', summary.avgRank == null ? '-' : `#${summary.avgRank}`, `${summary.foundCount}/${summary.totalPoints} points found`],
        ['TOP 3', `${summary.top3Count}`, `of ${summary.totalPoints} points`],
        ['TOP 10', `${summary.top10Count}`, `of ${summary.totalPoints} points`],
      ];
      const cardGap = 3;
      const cardWidth = (width - margin * 2 - cardGap * 3) / 4;
      const cardY = 68;
      metrics.forEach(([label, value, detail], index) => {
        const x = margin + index * (cardWidth + cardGap);
        fill(palette.panel);
        pdf.roundedRect(x, cardY, cardWidth, 25, 2.5, 2.5, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        setColor(palette.muted);
        text(label, x + 3, cardY + 6);
        pdf.setFontSize(15);
        setColor(index === 0 || index === 2 ? [5, 150, 105] : palette.ink);
        text(value, x + 3, cardY + 15);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        setColor(palette.muted);
        text(detail, x + 3, cardY + 21);
      });

      const gridY = 106;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      setColor(palette.ink);
      text(mapImage ? 'Ranking map' : 'Ranking coverage', margin, gridY);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      setColor(palette.muted);
      text(mapImage ? 'Map markers mirror the selected Geo-grid snapshot. The dashed marker is the center.' : 'Each square represents one local search point. The dashed square is the center.', margin, gridY + 5);

      const gridTop = gridY + 11;
      let legendY = gridTop;
      let mapAdded = false;
      if (mapImage) {
        try {
          // Preserve the captured map's aspect ratio (no stretching), centred in the content area.
          const maxW = width - margin * 2;
          const maxH = 120;
          const ratio = mapImage.width / mapImage.height;
          const drawW = Math.min(maxW, maxH * ratio);
          const drawH = drawW / ratio;
          pdf.addImage(mapImage.dataUrl, 'PNG', margin + (maxW - drawW) / 2, gridTop, drawW, drawH, undefined, 'FAST');
          legendY = gridTop + drawH + 7;
          mapAdded = true;
        } catch {
          // Use the vector fallback below if a browser rejects a map tile image.
        }
      }
      if (!mapAdded) {
        const gridDisplaySize = Math.min(102, width - margin * 2);
        const cell = gridDisplaySize / props.gridSize;
        const gridX = (width - gridDisplaySize) / 2;
        const pointByCell = new Map(props.results.map((point) => [`${point.row}:${point.col}`, point]));
        const middle = Math.floor(props.gridSize / 2);
        for (let row = 0; row < props.gridSize; row += 1) {
          for (let col = 0; col < props.gridSize; col += 1) {
            const point = pointByCell.get(`${row}:${col}`);
            const color = rankColor(point?.rank ?? null);
            const x = gridX + col * cell;
            const y = gridTop + row * cell;
            fill(color);
            pdf.rect(x + 0.5, y + 0.5, cell - 1, cell - 1, 'F');
            if (row === middle && col === middle) {
              pdf.setDrawColor(255, 255, 255);
              pdf.setLineDashPattern([1, 0.7], 0);
              pdf.rect(x + 1.25, y + 1.25, cell - 2.5, cell - 2.5, 'S');
              pdf.setLineDashPattern([], 0);
            }
            if (cell >= 10) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(Math.min(8, cell * 0.45));
              pdf.setTextColor(255, 255, 255);
              text(point?.rank == null ? '-' : `#${point.rank}`, x + cell / 2, y + cell / 2 + 1.5, { align: 'center' });
            }
          }
        }
        legendY = gridTop + gridDisplaySize + 7;
      }

      const legend = [
        ['#1', [5, 150, 105]], ['#2-3', [16, 185, 129]], ['#4-7', [20, 184, 166]],
        ['#8-10', [59, 130, 246]], ['#11-15', [245, 158, 11]], ['#16-20', [249, 115, 22]],
        ['#21+', [239, 68, 68]], ['Not found', [203, 213, 225]],
      ] as const;
      let legendX = margin;
      legend.forEach(([label, color]) => {
        fill(color);
        pdf.roundedRect(legendX, legendY - 2.5, 3.5, 3.5, 0.6, 0.6, 'F');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        setColor(palette.muted);
        text(label, legendX + 5, legendY);
        legendX += label.length > 7 ? 21 : 15;
      });

      let y = legendY + 15;
      // Only as many rows as fit above the footer band, so the table never runs into it.
      const rowsThatFit = Math.floor((height - 18 - (y + 11 + 7)) / 7.2);
      const competitors = computeCompetitors(props.results).slice(0, Math.max(0, Math.min(5, rowsThatFit)));
      if (competitors.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        setColor(palette.ink);
        text('Competitive landscape', margin, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        setColor(palette.muted);
        text('The businesses most frequently visible in the local pack.', margin, y + 5);
        y += 11;
        const columns = [margin, margin + 9, margin + 76, margin + 112, margin + 143, width - margin];
        fill(palette.ink);
        pdf.roundedRect(margin, y, width - margin * 2, 7, 1.5, 1.5, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(255, 255, 255);
        text('#', columns[0] + 3, y + 4.6);
        text('BUSINESS', columns[1], y + 4.6);
        text('PRESENCE', columns[2], y + 4.6);
        text('AVG. RANK', columns[3], y + 4.6);
        text('VISIBILITY', columns[4], y + 4.6);
        y += 7;
        competitors.forEach((competitor, index) => {
          if (index % 2 === 0) {
            fill(palette.panel);
            pdf.rect(margin, y, width - margin * 2, 7.2, 'F');
          }
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
          setColor(palette.ink);
          text(String(index + 1), columns[0] + 3, y + 4.7);
          text(competitor.name, columns[1], y + 4.7, { maxWidth: 63 });
          text(`${competitor.appearances}/${competitor.totalPoints}`, columns[2], y + 4.7);
          text(`#${competitor.avgRank}`, columns[3], y + 4.7);
          text(`${competitor.visibilityScore}%`, columns[4], y + 4.7);
          y += 7.2;
        });
      }

      drawFooter(pdf, {
        text: props.brandFooter?.trim() || `Prepared by ${props.brandName}`,
        style,
        pageWidth: width,
        pageHeight: height,
        margin,
        baseline: height - 9,
        bandTop: height - 12,
        reservedRight: 60,
      });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      const footerText = footerPalette(style).text;
      pdf.setTextColor(footerText[0], footerText[1], footerText[2]);
      text('Geo-grid ranking report', width - margin, height - 9, { align: 'right' });
      pdf.save(`geo-grid-${filenamePart(props.keyword)}-${new Date(props.searchedAt).toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={exportReport}
      disabled={isExporting}
      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {isExporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {isExporting ? 'Preparing PDF…' : 'Export PDF'}
    </button>
  );
}
