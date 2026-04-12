'use client';

import { Download } from 'lucide-react';

interface Column {
  key: string;
  label: string;
}

export default function ExportCSVButton({
  data,
  filename,
  columns,
}: {
  data: Record<string, unknown>[];
  filename: string;
  columns: Column[];
}) {
  const handleExport = () => {
    const escape = (val: unknown) => {
      const s = String(val ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const rows = [
      columns.map((c) => escape(c.label)).join(','),
      ...data.map((row) => columns.map((c) => escape(row[c.key])).join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </button>
  );
}
