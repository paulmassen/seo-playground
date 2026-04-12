'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Search, Globe, Settings, MapPin, FileSearch2,
  TrendingUp, Link2, Users, BarChart2, Map, Activity, GitMerge, Clock, FolderKanban, Anchor,
  Gauge, Lightbulb,
} from 'lucide-react';

const sections = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
      { name: 'Rank Tracker', href: '/dashboard/rank-tracker', icon: Activity },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Ranked Keywords', href: '/dashboard/ranked-keywords', icon: TrendingUp },
      { name: 'Keyword Overview', href: '/dashboard/keyword-overview', icon: BarChart2 },
      { name: 'Competitors', href: '/dashboard/competitors', icon: Users },
      { name: 'Domain Intersection', href: '/dashboard/domain-intersection', icon: GitMerge },
      { name: 'Historical Rank', href: '/dashboard/historical-rank', icon: Clock },
      { name: 'Related Keywords', href: '/dashboard/related-keywords', icon: Lightbulb },
    ],
  },
  {
    label: 'Backlinks',
    items: [
      { name: 'Backlinks', href: '/dashboard/backlinks', icon: Link2, exact: true },
      { name: 'Referring Domains', href: '/dashboard/backlinks/referring-domains', icon: FolderKanban },
      { name: 'Anchors', href: '/dashboard/backlinks/anchors', icon: Anchor },
    ],
  },
  {
    label: 'SERP',
    items: [
      { name: 'SERP Checker', href: '/dashboard/serp', icon: Globe },
      { name: 'Maps SERP', href: '/dashboard/maps', icon: Map },
      { name: 'Local Finder', href: '/dashboard/local-finder', icon: MapPin },
    ],
  },
  {
    label: 'Tools',
    items: [
      { name: 'Keyword Data', href: '/dashboard/keyword-data', icon: Search },
      { name: 'Keyword Difficulty', href: '/dashboard/keyword-difficulty', icon: Gauge },
      { name: 'On Page', href: '/dashboard/on-page', icon: FileSearch2 },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none overflow-y-auto shrink-0">
      <div className="flex h-16 items-center px-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <Link href="/dashboard">
          <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">SEO Playground</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em] px-4 mb-1.5">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
                      isActive
                        ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xl shadow-slate-200 dark:shadow-none'
                        : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <item.icon className={`mr-3 h-4 w-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-blue-400'
                        : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400'
                    }`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
