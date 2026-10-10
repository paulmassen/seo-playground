'use client';

import { Download } from 'lucide-react';
import { csvRows } from '@/lib/csv';

interface CsvReview {
  rating?: { value?: number };
  review_text?: string;
  timestamp?: string;
  time_ago?: string;
  profile_name?: string;
  local_guide?: boolean;
  reviews_count?: number;
  owner_answer?: string;
  owner_time_ago?: string;
}

const stripBreaks = (t?: string) => (t ?? '').replace(/<br\s*\/?>/gi, '\n');

export default function DownloadCsvButton({ reviews, filename }: { reviews: CsvReview[]; filename: string }) {
  function handleDownload() {
    const headers = ['Date', 'Rating', 'Author', 'Local guide', 'Author review count', 'Review', 'Owner response', 'Owner replied'];
    const rows = reviews.map((r) => [
      r.timestamp ?? r.time_ago ?? '',
      r.rating?.value ?? '',
      r.profile_name ?? '',
      r.local_guide ? 'yes' : 'no',
      r.reviews_count ?? '',
      stripBreaks(r.review_text),
      stripBreaks(r.owner_answer),
      r.owner_time_ago ?? '',
    ]);

    // Prepend BOM so Excel reads UTF-8 (accents) correctly.
    const csv = '﻿' + csvRows([headers, ...rows], '\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={reviews.length === 0}
      className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 disabled:opacity-40 disabled:hover:text-slate-500 transition-colors"
      title="Download all reviews as CSV"
    >
      <Download className="w-3.5 h-3.5" /> CSV
    </button>
  );
}
