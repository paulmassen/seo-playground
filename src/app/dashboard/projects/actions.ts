'use server';

import { createProject, deleteProject, setActiveProject, updateProject } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function projectInput(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    domain: String(formData.get('domain') ?? ''),
    defaultLocation: String(formData.get('default_location') ?? ''),
    defaultLanguage: String(formData.get('default_language') ?? ''),
    defaultCoordinates: String(formData.get('default_coordinates') ?? ''),
    rankTrackerDepth: String(formData.get('rank_tracker_depth') ?? '100'),
  };
}

function refreshProjects() {
  revalidatePath('/dashboard', 'layout');
  revalidatePath('/dashboard/projects');
  revalidatePath('/dashboard/settings');
}

/**
 * Switching projects keeps the current tool open. Only the path is kept: query strings
 * point at the previous project's history entries and domains.
 */
function returnPath(formData: FormData) {
  const path = String(formData.get('return_to') ?? '');
  return /^\/dashboard(\/[a-z0-9-]+)*$/.test(path) ? path : '/dashboard';
}

export async function createProjectAction(formData: FormData) {
  const project = createProject(projectInput(formData));
  setActiveProject(project.id);
  refreshProjects();
  redirect('/dashboard');
}

export async function updateProjectAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Project not found.');
  updateProject(id, projectInput(formData));
  refreshProjects();
}

export async function selectProjectAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  setActiveProject(id);
  refreshProjects();
  redirect(returnPath(formData));
}

export async function deleteProjectAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  deleteProject(id);
  refreshProjects();
  redirect('/dashboard/projects');
}
