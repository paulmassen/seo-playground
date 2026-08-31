import Link from 'next/link';
import { FileSearch2, Globe, Code2, Link2, Package, Tags, EyeOff, ScanText } from 'lucide-react';

const tools = [
  {
    name: 'Site Audit',
    description: 'Full site crawl — global score, all pages, SEO issues, SSL, CMS, sitemap, broken links.',
    href: '/dashboard/on-page/site-audit',
    icon: Globe,
    badge: 'Async',
    badgeCls: 'text-blue-600 bg-blue-50 border-blue-100',
  },
  {
    name: 'Instant Pages',
    description: 'Full on-page audit of a single URL: metadata, performance, SEO checks, content metrics.',
    href: '/dashboard/on-page/instant-pages',
    icon: FileSearch2,
    badge: 'Live',
    badgeCls: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  },
  {
    name: 'Microdata',
    description: 'Validate JSON-LD and Microdata structured data (schema.org) for a page.',
    href: '/dashboard/on-page/microdata',
    icon: Code2,
    badge: 'Async',
    badgeCls: 'text-blue-600 bg-blue-50 border-blue-100',
  },
  {
    name: 'Content Parsing',
    description: 'Extract and structure all text content from a URL: headings, paragraphs, word count.',
    href: '/dashboard/on-page/content-parsing',
    icon: ScanText,
    badge: 'Live',
    badgeCls: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  },
];

const auditTabs = [
  {
    name: 'Links',
    description: 'All links found during a crawl — internal, external, broken, nofollowed.',
    href: '/dashboard/on-page/site-audit',
    icon: Link2,
    note: 'Select a finished audit → Links tab',
  },
  {
    name: 'Resources',
    description: 'Images, scripts, stylesheets — size, HTTP status, load time.',
    href: '/dashboard/on-page/site-audit',
    icon: Package,
    note: 'Select a finished audit → Resources tab',
  },
  {
    name: 'Duplicate Tags',
    description: 'Pages sharing identical title or description tags.',
    href: '/dashboard/on-page/site-audit',
    icon: Tags,
    note: 'Select a finished audit → Dup. Tags tab',
  },
  {
    name: 'Non-indexable',
    description: 'Pages excluded from indexing: noindex, canonical, 4xx, redirects.',
    href: '/dashboard/on-page/site-audit',
    icon: EyeOff,
    note: 'Select a finished audit → Non-indexable tab',
  },
];

export default function OnPageHub() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">On Page</h1>
        <p className="text-sm text-slate-400 mt-1">On-page analysis tools via the DataForSEO OnPage API.</p>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Standalone tools</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href + tool.name} href={tool.href}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <Icon className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${tool.badgeCls}`}>{tool.badge}</span>
                </div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">{tool.name}</h2>
                <p className="text-xs text-slate-500 leading-relaxed">{tool.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Crawl-based (within Site Audit)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {auditTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link key={tab.name} href={tab.href}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                <Icon className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors mb-3" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1">{tab.name}</h2>
                <p className="text-xs text-slate-500 leading-relaxed mb-2">{tab.description}</p>
                <p className="text-[10px] text-slate-300 font-mono">{tab.note}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
