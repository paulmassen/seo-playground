'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { SIDEBAR_COLLAPSED_COOKIE } from '@/lib/sidebar';
import { NAV_SECTIONS as sections, NAV_FOOTER as footerItems, type NavItem } from '@/lib/nav';
import type { Project } from '@/lib/db';
import ProjectSwitcher from './ProjectSwitcher';

// The single most specific item for this path, so /dashboard/on-page/content-parsing
// highlights Content Parsing only, not On Page as well.
function findActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of [...sections.flatMap((s) => s.items), ...footerItems]) {
    const matches = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
    if (matches && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-150 ${
        active
          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-semibold'
          : 'text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
      }`}
    >
      <item.icon className={`mr-2.5 h-[15px] w-[15px] shrink-0 transition-colors ${
        active
          ? 'text-blue-500 dark:text-blue-400'
          : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400'
      }`} />
      {item.name}
    </Link>
  );
}

function saveCollapsed(keys: Set<string>) {
  // A cookie (not localStorage) so the server renders sections already collapsed, without a flash
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${encodeURIComponent([...keys].join(','))}; path=/; max-age=31536000; samesite=lax`;
}

export default function Sidebar({ initialCollapsed = [], projects, activeProject }: { initialCollapsed?: string[]; projects: Project[]; activeProject: Project }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set(initialCollapsed));
  const inputRef = useRef<HTMLInputElement>(null);
  const activeHref = findActiveHref(pathname);

  const toggleSection = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveCollapsed(next);
      return next;
    });
  };

  // Opening a page inside a collapsed section (via the filter, a link, back button) expands that section
  useEffect(() => {
    const activeSection = sections.find((s) => s.items.some((i) => i.href === activeHref));
    if (!activeSection) return;
    setCollapsed((prev) => {
      if (!prev.has(activeSection.key)) return prev;
      const next = new Set(prev);
      next.delete(activeSection.key);
      saveCollapsed(next);
      return next;
    });
  }, [activeHref]);

  // "/" focuses the filter from anywhere, unless the user is already typing somewhere
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const q = query.trim().toLowerCase();
  // A section label match keeps the whole section (e.g. "backlinks"); otherwise match tool names
  const filtered = q
    ? sections
        .map((section) => ({
          ...section,
          items: section.label.toLowerCase().includes(q)
            ? section.items
            : section.items.filter((item) => item.name.toLowerCase().includes(q)),
        }))
        .filter((section) => section.items.length > 0)
    : sections;
  const allCollapsed = sections.every((s) => collapsed.has(s.key));

  return (
    <div className="flex h-full w-60 flex-col border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 select-none shrink-0">
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

      <ProjectSwitcher projects={projects} activeProject={activeProject} />

      {/* Filter */}
      <div className="px-3 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 dark:text-slate-600 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              } else if (e.key === 'Enter' && filtered[0]?.items[0]) {
                router.push(filtered[0].items[0].href);
                setQuery('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Filter tools"
            aria-label="Filter tools"
            className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 select-text"
          />
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded px-1.5 leading-4 pointer-events-none">/</kbd>
          )}
        </div>
        {!q && (
          <div className="flex justify-end mt-1.5 -mb-1">
            <button
              type="button"
              onClick={() => {
                const next = new Set(allCollapsed ? [] : sections.map((s) => s.key));
                saveCollapsed(next);
                setCollapsed(next);
              }}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1 transition-colors"
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-1">
        {filtered.length === 0 && (
          <p className="px-3 text-xs text-slate-400">No tool matches &ldquo;{query.trim()}&rdquo;.</p>
        )}
        {filtered.map((section) => {
          // While filtering, every matching section is shown open regardless of its saved state
          const isOpen = q !== '' || !collapsed.has(section.key);
          const hasActive = section.items.some((i) => i.href === activeHref);
          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                disabled={q !== ''}
                aria-expanded={isOpen}
                aria-controls={`nav-section-${section.key}`}
                className="group w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:hover:text-slate-400 dark:disabled:hover:text-slate-500 transition-colors"
              >
                <span className="truncate">{section.label}</span>
                {!isOpen && hasActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" aria-label="Contains the current page" />}
                {!isOpen && (
                  <span className="ml-auto text-[10px] font-mono tracking-normal text-slate-300 dark:text-slate-600">{section.items.length}</span>
                )}
                <ChevronRight className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90 ml-auto' : ''} ${q ? 'invisible' : ''}`} />
              </button>
              <div
                id={`nav-section-${section.key}`}
                inert={!isOpen}
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-px pt-0.5 pb-2">
                    {section.items.map((item) => (
                      <NavLink key={item.href} item={item} active={item.href === activeHref} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-px">
        {footerItems.map((item) => (
          <NavLink key={item.href} item={item} active={item.href === activeHref} />
        ))}
      </div>
    </div>
  );
}
