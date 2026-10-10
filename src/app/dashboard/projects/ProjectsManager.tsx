'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Project } from '@/lib/db';
import { createProjectAction, deleteProjectAction, updateProjectAction } from './actions';
import LocationPicker from '@/components/LocationPicker';
import ProjectFavicon from '@/components/ProjectFavicon';
import MapPicker from '@/app/dashboard/local-finder/MapPicker';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function ProjectFields({ project, includeName = true }: { project?: Project; includeName?: boolean }) {
  const [coordinates, setCoordinates] = useState(project?.defaultCoordinates ?? '');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {includeName && (
        <label className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Project name</span>
          <input required name="name" defaultValue={project?.name ?? ''} placeholder="e.g. Acme France" className={inputClass} />
        </label>
      )}
      <label className="space-y-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Domain</span>
        <input required name="domain" defaultValue={project?.domain ?? ''} placeholder="example.com" className={inputClass} />
      </label>
      <label className="space-y-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Default location</span>
        <LocationPicker name="default_location" defaultValue={project?.defaultLocation ?? ''} placeholder="e.g. Paris, France" className={inputClass} />
        <span className="block text-[10px] leading-relaxed text-slate-400">Use the precise city or region. Country-only tools automatically use its country.</span>
      </label>
      <label className="space-y-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Default language</span>
        <input name="default_language" defaultValue={project?.defaultLanguage ?? ''} placeholder="e.g. French" className={inputClass} />
      </label>
      <div className="space-y-2 md:col-span-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Default coordinates</span>
        <p className="text-xs leading-relaxed text-slate-400">Search for a place or click the map to set the point used by local tools.</p>
        <MapPicker coordinate={coordinates} onChange={setCoordinates} />
        <input name="default_coordinates" value={coordinates} onChange={(event) => setCoordinates(event.target.value)} placeholder="Click the map or enter lat,lng" className={inputClass} />
      </div>
      <label className="space-y-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rank Tracker depth</span>
        <select name="rank_tracker_depth" defaultValue={project?.rankTrackerDepth ?? '100'} className={inputClass}>
          {['10', '20', '50', '100'].map((depth) => <option key={depth} value={depth}>Top {depth}</option>)}
        </select>
      </label>
    </div>
  );
}

function ExistingProject({ project, active, canDelete, startEditing }: { project: Project; active: boolean; canDelete: boolean; startEditing: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  useEffect(() => setEditing(startEditing), [startEditing]);
  return (
    <section className={`border-b border-slate-100 py-6 last:border-0 dark:border-slate-800 ${active ? 'relative' : ''}`}>
      {editing ? (
        <form action={updateProjectAction} className="space-y-5">
          <input type="hidden" name="id" value={project.id} />
          <ProjectFields project={project} />
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700">Save changes</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ProjectFavicon domain={project.domain} className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">{project.name}</h2>{active && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">Active</span>}</div>
            <p className="mt-0.5 truncate text-xs text-slate-400">{project.domain} · {project.defaultLocation || 'No default location'} · Top {project.rankTrackerDepth}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"><Pencil className="h-3 w-3" /> Edit</button>
            {canDelete && <form action={deleteProjectAction} onSubmit={(event) => { if (!window.confirm(`Delete “${project.name}” and all of its history permanently? This cannot be undone.`)) event.preventDefault(); }}><input type="hidden" name="id" value={project.id} /><button type="submit" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-3 w-3" /> Delete</button></form>}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProjectsManager({ projects, activeProjectId, editingProjectId }: { projects: Project[]; activeProjectId: string; editingProjectId?: string }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-8 pb-12">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Workspace</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">Projects</h1>
        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Each project keeps its own defaults, search history, and results.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white px-7 dark:border-slate-800 dark:bg-slate-900">
        {projects.map((project) => <ExistingProject key={project.id} project={project} active={project.id === activeProjectId} canDelete={projects.length > 1} startEditing={project.id === editingProjectId} />)}
      </div>

      <section id="new-project" className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-7 dark:border-blue-900/70 dark:bg-blue-950/20">
        {creating ? (
          <form action={createProjectAction} className="space-y-5">
            <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900 dark:text-white">New project</h2><p className="mt-0.5 text-xs text-slate-500">Its domain must be unique.</p></div><button type="button" onClick={() => setCreating(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-4 w-4" /></button></div>
            <ProjectFields />
            <button type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700">Create and switch</button>
          </form>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-3 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><Plus className="h-4 w-4" /></span><span><span className="block text-sm font-bold text-slate-900 dark:text-white">Create a project</span><span className="block text-xs text-slate-500">Add a domain and project-specific defaults.</span></span></button>
        )}
      </section>
    </div>
  );
}
