'use client';

import { Download } from 'lucide-react';

export type ExportColumn = { key: string; label: string };
export type ExportSheet = {
  name: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
};

function xml(value: unknown) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  // Avoid formula execution when a workbook is opened in Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function worksheet(sheet: ExportSheet) {
  const rows = [
    `<Row>${sheet.columns.map((column) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xml(column.label)}</Data></Cell>`).join('')}</Row>`,
    ...sheet.data.map((row) => `<Row>${sheet.columns.map((column) => `<Cell><Data ss:Type="String">${xml(row[column.key])}</Data></Cell>`).join('')}</Row>`),
  ];
  return `<Worksheet ss:Name="${xml(sheet.name).slice(0, 31)}"><Table>${rows.join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}

/**
 * Exports Excel's XML Spreadsheet 2003 format. It opens natively in Excel,
 * LibreOffice and Numbers, and supports multiple worksheets without a heavy
 * client-side dependency.
 */
export default function ExportExcelButton({ sheets, filename }: { sheets: ExportSheet[]; filename: string }) {
  function download() {
    const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style></Styles>${sheets.filter((sheet) => sheet.columns.length > 0).map(worksheet).join('')}</Workbook>`;
    const blob = new Blob(['\ufeff', workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} disabled={sheets.every((sheet) => sheet.data.length === 0)}
      className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 disabled:opacity-40 disabled:hover:text-slate-500 transition-colors"
      title="Export to Excel">
      <Download className="w-3.5 h-3.5" /> Excel
    </button>
  );
}
