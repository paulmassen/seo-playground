'use client';

// Deletes a Geo-grid monitor (every snapshot plus its schedule).
import { deleteGridMonitor } from '../geo-grid/actions';

export default function DeleteMonitorButton({ runId, compact = false }: { runId: string; compact?: boolean }) {
  return (
    <form
      action={deleteGridMonitor}
      onSubmit={(event) => {
        if (!window.confirm('Delete this monitor? Its schedule and every snapshot will be removed. This cannot be undone.')) event.preventDefault();
      }}
    >
      <input type="hidden" name="run_id" value={runId} />
      <button
        type="submit"
        title="Delete this monitor"
        className={compact
          ? 'text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-red-600'
          : 'inline-flex items-center rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950'}
      >
        Delete
      </button>
    </form>
  );
}
