'use client';

import { Check, ClipboardCopy, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

// Fetches a markdown export and puts it on the clipboard, so the report can be pasted straight into a
// doc or a message without saving a file first.

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard API is refused outside secure contexts (plain http on another machine): fall through.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  if (!copied) throw new Error('Copy failed');
}

export default function CopyMarkdownLink({ href, label = 'Copy as Markdown' }: { href: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');

  async function copy() {
    setState('loading');
    try {
      const response = await fetch(href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await writeClipboard(await response.text());
      setState('copied');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 1800);
  }

  const text = state === 'loading' ? 'Copying…' : state === 'copied' ? 'Copied' : state === 'error' ? 'Copy failed' : label;
  return (
    <button
      type="button"
      onClick={copy}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {state === 'loading' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : state === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {text}
    </button>
  );
}
