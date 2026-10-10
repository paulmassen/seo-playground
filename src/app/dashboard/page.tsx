import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { getCredentials } from '@/lib/db';
import { saveCredentialsAction } from './actions';
import Link from 'next/link';
import { NAV_SECTIONS, NAV_FOOTER, type NavColor } from '@/lib/nav';

// Same list as the sidebar, minus the Dashboard link itself; Spending and Settings close the page
const sections = [
  ...NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.href !== '/dashboard') })),
  { key: 'account', label: 'Account', color: 'slate' as NavColor, items: NAV_FOOTER },
].filter((s) => s.items.length > 0);

const colorMap: Record<NavColor, { badge: string; icon: string; hover: string }> = {
  blue:    { badge: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',    icon: 'text-blue-400',    hover: 'hover:border-blue-200 dark:hover:border-blue-800' },
  violet:  { badge: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400', icon: 'text-violet-400', hover: 'hover:border-violet-200 dark:hover:border-violet-800' },
  emerald: { badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400', icon: 'text-emerald-400', hover: 'hover:border-emerald-200 dark:hover:border-emerald-800' },
  orange:  { badge: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400', icon: 'text-orange-400',  hover: 'hover:border-orange-200 dark:hover:border-orange-800' },
  pink:    { badge: 'bg-pink-50 text-pink-600 dark:bg-pink-950 dark:text-pink-400',    icon: 'text-pink-400',    hover: 'hover:border-pink-200 dark:hover:border-pink-800' },
  yellow:  { badge: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400', icon: 'text-yellow-500',  hover: 'hover:border-yellow-200 dark:hover:border-yellow-800' },
  slate:   { badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: 'text-slate-400',   hover: 'hover:border-slate-300 dark:hover:border-slate-600' },
  indigo:  { badge: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400', icon: 'text-indigo-400', hover: 'hover:border-indigo-200 dark:hover:border-indigo-800' },
};

async function DashboardPage() {
  const creds = getCredentials();

  if (!creds) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-10 max-w-lg mx-auto mt-10">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">DataForSEO Login</h2>
        <p className="text-slate-500 text-sm mb-8">Enter your DataForSEO API credentials to get started. Stored locally only.</p>
        <form action={saveCredentialsAction} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">API Login</label>
            <input type="text" name="login" required className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">API Password</label>
            <input type="password" name="password" required className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl hover:bg-blue-700 transition-colors">
            Save
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Pick a tool to get started.</p>
      </div>

      {sections.map((section) => {
        const c = colorMap[section.color];
        return (
          <div key={section.key}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full ${c.badge}`}>
                {section.label}
              </span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-start gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-150 ${c.hover} hover:shadow-md`}
                  >
                    <div className={`mt-0.5 shrink-0 ${c.icon}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-white leading-tight group-hover:text-inherit truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default withProjectScope(DashboardPage);
