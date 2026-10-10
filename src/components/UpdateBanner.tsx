'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, PackageCheck, X } from 'lucide-react';

type UpdateCheck = {
  current: string | null;
  latest: string | null;
  hasUpdate: boolean;
  release: {
    version: string;
    url: string;
    notes: string;
    publishedAt: string | null;
  } | null;
};

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateCheck | null>(null);

  useEffect(() => {
    fetch('/api/update-check')
      .then((r) => r.json())
      .then((data: UpdateCheck) => {
        if (!data.hasUpdate || !data.latest || localStorage.getItem(`release-dismissed:${data.latest}`)) return;
        setUpdate(data);
      })
      .catch(() => {});
  }, []);

  if (!update?.release || !update.latest) return null;
  const release = update.release;
  const latest = update.latest;

  function dismiss() {
    localStorage.setItem(`release-dismissed:${latest}`, '1');
    setUpdate(null);
  }

  return (
    <aside
      aria-label="Application update available"
      className="flex items-start justify-between gap-4 border-b border-blue-500/20 bg-slate-950 px-5 py-2.5 text-slate-100 dark:border-slate-700 dark:bg-slate-900 sm:px-8"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">
          <PackageCheck size={14} aria-hidden="true" />
        </span>
        <div className="min-w-0 text-sm leading-5">
          <span className="font-bold text-white">Version {release.version} is available.</span>{' '}
          <span className="text-slate-400">You’re running {update.current ?? 'an unversioned build'}.</span>
          {release.notes && <span className="hidden text-slate-400 lg:inline"> — {release.notes}</span>}
          <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap">
            <a
              href={release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-300 underline decoration-blue-300/40 underline-offset-4 transition-colors hover:text-blue-200 hover:decoration-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Release notes <ArrowUpRight className="inline-block -mt-0.5" size={13} aria-hidden="true" />
            </a>
            <a
              href="https://github.com/paulmassen/seo-playground#updating-a-release-installation"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-300 underline decoration-slate-500 underline-offset-4 transition-colors hover:text-white hover:decoration-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Update guide
            </a>
          </span>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label={`Dismiss version ${release.version} update notification`}
        className="mt-0.5 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <X size={16} />
      </button>
    </aside>
  );
}
