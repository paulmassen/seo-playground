import type { ComponentType } from 'react';
import {
  LayoutDashboard, Search, Globe, Settings, MapPin, FileSearch2,
  TrendingUp, Link2, Users, BarChart2, Activity, GitMerge, Clock, FolderKanban, Anchor,
  Gauge, Lightbulb, BrainCircuit, Star, Flame, Cpu, ShieldCheck, Grid3X3,
  Sparkles, Target, Layers, Network, LineChart, Tag, ScanText,
  History, Copy, BarChart3, BookOpen, Server, Bot, Radar, Eye, Waypoints, Megaphone, Wallet, CalendarCheck, Unlink,
} from 'lucide-react';

// Single source of truth for the tool list: the Sidebar and the Dashboard home both render from it.

export interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  desc: string;
  exact?: boolean;
}

export type NavColor = 'blue' | 'violet' | 'indigo' | 'emerald' | 'orange' | 'pink' | 'yellow' | 'slate';

export interface NavSection {
  /** Stable id, stored in the sidebar collapsed-state cookie. */
  key: string;
  label: string;
  color: NavColor;
  items: NavItem[];
}

// Grouped by task rather than by DataForSEO API.
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: 'Overview',
    color: 'blue',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, desc: 'All tools at a glance', exact: true },
      { name: 'Rank Tracker', href: '/dashboard/rank-tracker', icon: Activity, desc: 'Track keyword positions over time' },
    ],
  },
  {
    key: 'keywords',
    label: 'Keywords',
    color: 'indigo',
    items: [
      { name: 'Keyword Overview', href: '/dashboard/keyword-overview', icon: BarChart2, desc: 'Volume and metrics per keyword' },
      { name: 'Keyword Ideas', href: '/dashboard/keyword-ideas', icon: Sparkles, desc: 'Keyword ideas from a seed with intent' },
      { name: 'Related Keywords', href: '/dashboard/related-keywords', icon: Lightbulb, desc: 'Related keyword suggestions' },
      { name: 'Keyword Data', href: '/dashboard/keyword-data', icon: Search, desc: 'Google Ads & Bing search volume and CPC' },
      { name: 'Keyword Difficulty', href: '/dashboard/keyword-difficulty', icon: Gauge, desc: 'Bulk SEO difficulty scores' },
      { name: 'Search Intent', href: '/dashboard/search-intent', icon: Target, desc: 'Classify keywords by search intent' },
      { name: 'Top Searches', href: '/dashboard/top-searches', icon: Flame, desc: 'Most searched keywords in a market' },
    ],
  },
  {
    key: 'domains',
    label: 'Domains & Competitors',
    color: 'violet',
    items: [
      { name: 'Ranked Keywords', href: '/dashboard/ranked-keywords', icon: TrendingUp, desc: 'Keywords a domain ranks for' },
      { name: 'Competitors', href: '/dashboard/competitors', icon: Users, desc: 'Domains competing in the same SERPs' },
      { name: 'Domain Intersection', href: '/dashboard/domain-intersection', icon: GitMerge, desc: 'Keywords shared between two domains' },
      { name: 'Page Intersection', href: '/dashboard/page-intersection', icon: Layers, desc: 'Keywords shared between multiple pages' },
      { name: 'Historical Rank', href: '/dashboard/historical-rank', icon: Clock, desc: 'Ranking history over time' },
      { name: 'Subdomains', href: '/dashboard/subdomains', icon: Network, desc: 'Subdomains ranked by organic traffic' },
      { name: 'Traffic Estimation', href: '/dashboard/traffic-estimation', icon: LineChart, desc: 'Bulk organic traffic for a domain list' },
      { name: 'Technologies', href: '/dashboard/domain-analytics/technologies', icon: Cpu, desc: 'Tech stack used by domains' },
      { name: 'Whois', href: '/dashboard/domain-analytics/whois', icon: ShieldCheck, desc: 'Domain registration info' },
      { name: 'Categories', href: '/dashboard/domain-analytics/categories', icon: Tag, desc: 'Thematic categories for a domain' },
    ],
  },
  {
    key: 'backlinks',
    label: 'Backlinks',
    color: 'emerald',
    items: [
      { name: 'Backlinks', href: '/dashboard/backlinks', icon: Link2, desc: 'Incoming links list', exact: true },
      { name: 'Referring Domains', href: '/dashboard/backlinks/referring-domains', icon: FolderKanban, desc: 'Domains linking to you' },
      { name: 'Broken Backlinks', href: '/dashboard/backlinks/broken', icon: Unlink, desc: 'Links pointing to 4xx/5xx pages to reclaim' },
      { name: 'Anchors', href: '/dashboard/backlinks/anchors', icon: Anchor, desc: 'Anchor texts in use' },
      { name: 'Referring Networks', href: '/dashboard/backlinks/referring-networks', icon: Server, desc: 'IP subnets sending backlinks' },
      { name: 'Page Intersection', href: '/dashboard/backlinks/page-intersection', icon: Copy, desc: 'Pages linking to multiple targets' },
      { name: 'Domain Intersection', href: '/dashboard/backlinks/domain-intersection', icon: BookOpen, desc: 'Domains linking to you and a competitor' },
      { name: 'History', href: '/dashboard/backlinks/history', icon: History, desc: 'Backlink evolution over time' },
      { name: 'Bulk Backlinks', href: '/dashboard/backlinks/bulk-backlinks', icon: BarChart3, desc: 'Backlink summary for a domain list' },
      { name: 'Bulk Ref. Domains', href: '/dashboard/backlinks/bulk-referring-domains', icon: Layers, desc: 'Referring domains for a domain list' },
    ],
  },
  {
    key: 'serp-local',
    label: 'SERP & Local',
    color: 'orange',
    items: [
      { name: 'SERP Checker', href: '/dashboard/serp', icon: Globe, desc: 'Live Google organic results' },
      { name: 'Local Finder', href: '/dashboard/local-finder', icon: MapPin, desc: 'Local pack results for any location' },
      { name: 'Geo-Grid Ranking', href: '/dashboard/geo-grid', icon: Grid3X3, desc: 'Ranking heatmap across a grid of points' },
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    color: 'pink',
    items: [
      { name: 'AI Optimization', href: '/dashboard/ai-optimization', icon: BrainCircuit, desc: 'Visibility in AI-generated answers' },
      { name: 'AI Visibility', href: '/dashboard/ai-visibility', icon: Eye, desc: 'How often LLMs mention a domain or brand' },
      { name: 'AI Prompt Test', href: '/dashboard/llm-responses', icon: Bot, desc: 'See what ChatGPT, Claude, Gemini answer' },
      { name: 'AI Keyword Data', href: '/dashboard/ai-keyword-data', icon: Radar, desc: 'Keyword volume in AI tools' },
      { name: 'Query Fan-Out', href: '/dashboard/query-fan-out', icon: Waypoints, desc: 'Hidden sub-queries behind AI answers' },
      { name: 'Prompt Tracker', href: '/dashboard/prompt-tracker', icon: CalendarCheck, desc: 'Re-run prompts and track brand mentions over time' },
    ],
  },
  {
    key: 'business',
    label: 'Business',
    color: 'yellow',
    items: [
      { name: 'Google Reviews', href: '/dashboard/google-reviews', icon: Star, desc: 'Google reviews and rating goals' },
      { name: 'Web Mentions', href: '/dashboard/web-mentions', icon: Megaphone, desc: 'Brand mentions and sentiment across the web' },
    ],
  },
  {
    key: 'site-audit',
    label: 'Site Audit',
    color: 'slate',
    items: [
      { name: 'On Page', href: '/dashboard/on-page', icon: FileSearch2, desc: 'Site crawl, instant page audit, microdata' },
      { name: 'Content Parsing', href: '/dashboard/on-page/content-parsing', icon: ScanText, desc: 'Extract and structure a page’s content' },
    ],
  },
];

// Pinned at the bottom of the sidebar, outside the filter
export const NAV_FOOTER: NavItem[] = [
  { name: 'Spending', href: '/dashboard/spending', icon: Wallet, desc: 'What your DataForSEO calls cost, by tool' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, desc: 'Credentials and report identity' },
];
