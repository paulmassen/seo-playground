import { STATUS_LABEL, type CheckStatus } from '@/lib/prompt-report';

const DOT: Record<CheckStatus | 'none', string> = {
  cited: 'bg-emerald-500 border-emerald-500',
  'not-cited': 'bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600',
  error: 'bg-red-500 border-red-500',
  none: 'bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700',
};

/** One check result: green = cited, white = not cited, red = error, grey = no check that day. */
export default function StatusDot({ status, title, size = 'md' }: { status: CheckStatus | null; title?: string; size?: 'sm' | 'md' }) {
  const key = status ?? 'none';
  const dimension = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return (
    <span
      title={title ?? (status ? STATUS_LABEL[status] : 'No check')}
      className={`inline-block shrink-0 rounded-full border ${dimension} ${DOT[key]}`}
      aria-label={title ?? (status ? STATUS_LABEL[status] : 'No check')}
    />
  );
}
