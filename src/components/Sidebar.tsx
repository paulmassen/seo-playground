'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Search, Globe, Settings, MapPin, FileSearch2,
  TrendingUp, Link2, Users, BarChart2, Activity, GitMerge, Clock, FolderKanban, Anchor,
  Gauge, Lightbulb, BrainCircuit, MessageSquare, Star, Flame, Cpu, ShieldCheck, Grid3X3,
  Sparkles, Target, Layers, Network, LineChart, Tag, ScanText,
  History, Copy, BarChart3, BookOpen, Server, Bot, Radar, Eye, Waypoints,
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
      { name: 'Top Searches', href: '/dashboard/top-searches', icon: Flame },
    ],
  },
  {
    label: 'Domain Analytics',
    items: [
      { name: 'Technologies', href: '/dashboard/domain-analytics/technologies', icon: Cpu },
      { name: 'Whois', href: '/dashboard/domain-analytics/whois', icon: ShieldCheck },
      { name: 'Categories', href: '/dashboard/domain-analytics/categories', icon: Tag },
    ],
  },
  {
    label: 'Labs',
    items: [
      { name: 'Keyword Ideas', href: '/dashboard/keyword-ideas', icon: Sparkles },
      { name: 'Search Intent', href: '/dashboard/search-intent', icon: Target },
      { name: 'Page Intersection', href: '/dashboard/page-intersection', icon: Layers },
      { name: 'Subdomains', href: '/dashboard/subdomains', icon: Network },
      { name: 'Traffic Estimation', href: '/dashboard/traffic-estimation', icon: LineChart },
    ],
  },
  {
    label: 'Backlinks',
    items: [
      { name: 'Backlinks', href: '/dashboard/backlinks', icon: Link2, exact: true },
      { name: 'Referring Domains', href: '/dashboard/backlinks/referring-domains', icon: FolderKanban },
      { name: 'Anchors', href: '/dashboard/backlinks/anchors', icon: Anchor },
      { name: 'Referring Networks', href: '/dashboard/backlinks/referring-networks', icon: Server },
      { name: 'Page Intersection', href: '/dashboard/backlinks/page-intersection', icon: Copy },
      { name: 'Domain Intersection', href: '/dashboard/backlinks/domain-intersection', icon: BookOpen },
      { name: 'History', href: '/dashboard/backlinks/history', icon: History },
      { name: 'Bulk Backlinks', href: '/dashboard/backlinks/bulk-backlinks', icon: BarChart3 },
      { name: 'Bulk Ref. Domains', href: '/dashboard/backlinks/bulk-referring-domains', icon: Layers },
    ],
  },
  {
    label: 'SERP',
    items: [
      { name: 'SERP Checker', href: '/dashboard/serp', icon: Globe },
      { name: 'Local Finder', href: '/dashboard/local-finder', icon: MapPin },
      { name: 'Geo-Grid Ranking', href: '/dashboard/geo-grid', icon: Grid3X3 },
    ],
  },
  {
    label: 'AI',
    items: [
      { name: 'AI Optimization', href: '/dashboard/ai-optimization', icon: BrainCircuit },
      { name: 'AI Visibility', href: '/dashboard/ai-visibility', icon: Eye },
      { name: 'AI Prompt Test', href: '/dashboard/llm-responses', icon: Bot },
      { name: 'AI Keyword Data', href: '/dashboard/ai-keyword-data', icon: Radar },
      { name: 'Query Fan-Out', href: '/dashboard/query-fan-out', icon: Waypoints },
    ],
  },
  {
    label: 'Business',
    items: [
      { name: 'Google Reviews', href: '/dashboard/google-reviews', icon: Star },
    ],
  },
  {
    label: 'Social Media',
    items: [
      { name: 'Reddit', href: '/dashboard/social-media/reddit', icon: MessageSquare },
    ],
  },
  {
    label: 'Tools',
    items: [
      { name: 'Keyword Data', href: '/dashboard/keyword-data', icon: Search },
      { name: 'Keyword Difficulty', href: '/dashboard/keyword-difficulty', icon: Gauge },
      { name: 'On Page', href: '/dashboard/on-page', icon: FileSearch2 },
      { name: 'Content Parsing', href: '/dashboard/on-page/content-parsing', icon: ScanText },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-60 flex-col border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 select-none overflow-y-auto shrink-0 scrollbar-thin">
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10 L5 4 L8 8 L10 5 L13 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">SEO Playground</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-slate-300 dark:text-slate-600 uppercase tracking-[0.15em] px-3 mb-1">
              {section.label}
            </p>
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
                        : 'text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
                    }`}
                  >
                    <item.icon className={`mr-2.5 h-[15px] w-[15px] shrink-0 transition-colors ${
                      isActive
                        ? 'text-blue-500 dark:text-blue-400'
                        : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400'
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
