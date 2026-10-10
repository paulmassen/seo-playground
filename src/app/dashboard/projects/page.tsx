export const dynamic = 'force-dynamic';

import { getActiveProject, getProjects } from '@/lib/db';
import ProjectsManager from './ProjectsManager';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const activeProject = getActiveProject();
  return <ProjectsManager projects={getProjects()} activeProjectId={activeProject.id} editingProjectId={edit} />;
}
