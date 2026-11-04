'use client';

// Deletes a Geo-grid monitor (every snapshot plus its schedule).
import { Trash2 } from 'lucide-react';
import PendingButton from '@/components/PendingButton';
import { deleteGridMonitor } from '../geo-grid/actions';

export default function DeleteMonitorButton({ runId, keyword, snapshotCount, compact = false }: { runId: string; keyword?: string; snapshotCount?: number; compact?: boolean }) {
  const what = keyword ? `"${keyword}"` : 'this monitor';
  const snapshots = snapshotCount != null ? `${snapshotCount} paid snapshot${snapshotCount === 1 ? '' : 's'}` : 'every paid snapshot';
  return (
    <form
      action={deleteGridMonitor}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${what}? Its schedule and ${snapshots} will be removed from this machine. This cannot be undone.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="run_id" value={runId} />
      <PendingButton
        type="submit"
        aria-label={`Delete monitor ${keyword ?? ''}`.trim()}
        title="Delete this monitor"
        pendingChildren={compact ? <Trash2 className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" /> : 'Deleting…'}
        className={compact
          ? 'grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-950'
          : 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-300'}
      >
        {compact ? <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> : <><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete</>}
      </PendingButton>
    </form>
  );
}
