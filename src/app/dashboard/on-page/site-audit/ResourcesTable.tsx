'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface ResourceItem {
  url?: string;
  resource_type?: string;
  status_code?: number;
  size?: number;
  encoded_size?: number;
  fetch_time?: number;
  checks?: { broken_resources?: boolean; is_redirect?: boolean };
  accept_type?: string;
}

type SortKey = 'url' | 'type' | 'status' | 'size' | 'load';
type SortDir = 'asc' | 'desc';

function formatMs(ms?: number) {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function httpBadge(code?: number) {
  if (!code) return null;
  const cls = code < 300 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : code < 400 ? 'bg-blue-50 text-blue-700 border-blue-200'
    : code < 500 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${cls}`}>{code}</span>;
}

function sortValue(item: ResourceItem, key: SortKey): number | string {
  switch (key) {
    case 'url': return item.url?.toLowerCase() ?? '';
    case 'type': return item.resource_type ?? '';
    case 'status': return item.status_code ?? -1;
    case 'size': return item.size ?? -1;
    case 'load': return item.fetch_time ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function ResourcesTable({ resources }: { resources: ResourceItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('size');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...resources].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [resources, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center w-full' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((res) => ({
    url: res.url ?? '',
    type: res.resource_type ?? '',
    status: res.status_code ?? '',
    size_kb: res.size != null ? (res.size / 1024).toFixed(1) : '',
    load_ms: res.fetch_time ?? '',
    broken: res.checks?.broken_resources ? 'yes' : 'no',
  }));
  const columns = [
    { key: 'url', label: 'URL' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'HTTP' },
    { key: 'size_kb', label: 'Size (KB)' },
    { key: 'load_ms', label: 'Load (ms)' },
    { key: 'broken', label: 'Broken' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 flex-wrap text-[11px] font-bold">
          {['image', 'script', 'stylesheet', 'other'].map((type) => (
            <span key={type} className="text-slate-500">
              {resources.filter((r) => (type === 'other' ? !['image', 'script', 'stylesheet'].includes(r.resource_type ?? '') : r.resource_type === type)).length} {type}
            </span>
          ))}
          <span className="text-red-500">{resources.filter((r) => r.checks?.broken_resources).length} broken</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyMarkdownButton data={csvData} columns={columns} />
          <ExportCSVButton data={csvData} filename="site-audit-resources.csv" columns={columns} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Header label="URL" sortK="url" align="left" />
              <Header label="Type" sortK="type" align="center" />
              <Header label="HTTP" sortK="status" align="center" />
              <Header label="Size" sortK="size" align="right" />
              <Header label="Load" sortK="load" align="right" className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((res, i) => {
              const sizeKb = res.size != null ? (res.size / 1024).toFixed(1) : null;
              const typeCls: Record<string, string> = { image: 'bg-blue-50 text-blue-600', script: 'bg-amber-50 text-amber-700', stylesheet: 'bg-violet-50 text-violet-600' };
              const cls = typeCls[res.resource_type ?? ''] ?? 'bg-slate-100 text-slate-500';
              return (
                <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${res.checks?.broken_resources ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-2.5 max-w-[300px]">
                    <a href={res.url} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[10px] text-blue-600 hover:underline truncate block">{res.url ?? '—'}</a>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${cls}`}>{res.resource_type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">{httpBadge(res.status_code)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500">
                    {sizeKb != null ? (
                      <span className={parseFloat(sizeKb) > 500 ? 'text-amber-600 font-bold' : ''}>{sizeKb} KB</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500 hidden md:table-cell">{formatMs(res.fetch_time)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
