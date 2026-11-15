'use client';

import { Trash2 } from 'lucide-react';
import PendingButton from '@/components/PendingButton';
import { deleteHistoryEntryAction } from '@/app/dashboard/history-actions';
import type { DeletableHistoryTable } from '@/lib/db';

interface Props {
  table: DeletableHistoryTable;
  id: string;
  /** Tool page, e.g. "/dashboard/subdomains". Reopened empty when the deleted search is the one on screen. */
  path: string;
  /** Shown in the confirmation, e.g. the keyword or domain. */
  label?: string;
  className?: string;
}

/** Trash icon that removes one saved search from a tool's history, after confirmation. */
export default function DeleteHistoryButton({ table, id, path, label, className = '' }: Props) {
  const short = label && label.length > 80 ? `${label.slice(0, 80)}…` : label;
  const what = short ? `“${short}”` : 'this search';
  return (
    <form
      action={deleteHistoryEntryAction}
      className={`shrink-0 ${className}`}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${what} from the history? Its saved results will be removed from this machine. This cannot be undone.`)) {
          event.preventDefault();
          return;
        }
        const returnTo = event.currentTarget.elements.namedItem('return_to');
        if (returnTo instanceof HTMLInputElement) returnTo.value = window.location.pathname + window.location.search + window.location.hash;
      }}
    >
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="path" value={path} />
      <input type="hidden" name="return_to" defaultValue="" />
      <PendingButton
        type="submit"
        title="Delete from history"
        aria-label={`Delete ${label ?? 'this search'} from history`}
        pendingChildren={<Trash2 className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />}
        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </PendingButton>
    </form>
  );
}
