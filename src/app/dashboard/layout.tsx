import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_FAVORITES_COOKIE, parseCollapsedSections, parseFavorites } from '@/lib/sidebar';
import BalanceBadge from '@/components/BalanceBadge';
import ThemeToggle from '@/components/ThemeToggle';
import UpdateBanner from '@/components/UpdateBanner';
import GridTaskCenter from '@/components/GridTaskCenter';
import ProjectSync from '@/components/ProjectSync';
import AccountMenu from '@/components/AccountMenu';
import { getSession } from '@/lib/auth';
import { authEnabled } from '@/lib/auth-config';
import { getActiveProject, getProjects } from '@/lib/db';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The middleware already rejects anonymous requests; this is the authoritative check and gives us the email.
  let accountEmail: string | null = null;
  if (authEnabled()) {
    const session = await getSession(await headers());
    if (!session) redirect('/login');
    accountEmail = session.user.email;
  }
  const cookieStore = await cookies();
  const collapsed = parseCollapsedSections(cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value);
  const favorites = parseFavorites(cookieStore.get(SIDEBAR_FAVORITES_COOKIE)?.value);
  const activeProject = getActiveProject();
  const projects = getProjects();

  return (
    <div className="flex h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <Sidebar initialCollapsed={collapsed} initialFavorites={favorites} projects={projects} activeProject={activeProject} />
      <ProjectSync projectId={activeProject.id} projectName={activeProject.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <UpdateBanner />
        <header className="h-14 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end px-6 shrink-0 gap-3">
          <GridTaskCenter />
          <ThemeToggle />
          <BalanceBadge />
          {accountEmail && <AccountMenu email={accountEmail} />}
        </header>

        <div className="flex-1 overflow-hidden">
          <main className="h-full overflow-y-auto p-8">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
