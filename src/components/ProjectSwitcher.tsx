'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown, FolderKanban, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/db';
import { selectProjectAction } from '@/app/dashboard/projects/actions';
import ProjectFavicon from './ProjectFavicon';

export default function ProjectSwitcher({ projects, activeProject }: { projects: Project[]; activeProject: Project }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={rootRef} className="relative px-3 pt-3 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-blue-900 dark:hover:bg-blue-950/30"
      >
        <ProjectFavicon domain={activeProject.domain} className="h-7 w-7 shadow-sm shadow-blue-200 dark:shadow-none" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{activeProject.name}</span>
          <span className="block truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">{activeProject.domain}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute left-3 right-3 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
          <p className="px-3 pb-1.5 pt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Projects</p>
          <div className="max-h-52 overflow-y-auto px-1.5 scrollbar-thin">
            {projects.map((project) => (
              <form key={project.id} action={selectProjectAction}>
                <input type="hidden" name="id" value={project.id} />
                <input type="hidden" name="return_to" value={pathname} />
                <div className={`flex items-center rounded-lg transition-colors ${project.id === activeProject.id ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <ProjectFavicon domain={project.domain} className="h-6 w-6" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{project.name}</span>
                      <span className="block truncate text-[10px] opacity-65">{project.domain}</span>
                    </span>
                    {project.id === activeProject.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                  <Link
                    href={`/dashboard/projects?edit=${encodeURIComponent(project.id)}`}
                    onClick={() => setOpen(false)}
                    aria-label={`Edit ${project.name} settings`}
                    title="Project settings"
                    className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-300"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </form>
            ))}
          </div>
          <div className="mt-1 border-t border-slate-100 px-1.5 pt-1.5 dark:border-slate-800">
            <Link href="/dashboard/projects" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300">
              <FolderKanban className="h-3.5 w-3.5" /> Manage projects
            </Link>
            <Link href="/dashboard/projects#new-project" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40">
              <Plus className="h-3.5 w-3.5" /> Create project
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
