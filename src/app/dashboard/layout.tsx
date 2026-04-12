import Sidebar from '@/components/Sidebar';
import BalanceBadge from '@/components/BalanceBadge';
import ThemeToggle from '@/components/ThemeToggle';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-8 shrink-0">
          <span className="text-sm font-bold text-slate-900 dark:text-white">SEO Playground</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <BalanceBadge />
          </div>
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
