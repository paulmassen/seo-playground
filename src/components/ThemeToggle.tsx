'use client';

import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

// Subscribe to changes on the <html> class attribute
function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDarkSnapshot = () => document.documentElement.classList.contains('dark');
const isDarkServerSnapshot = () => false;

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, isDarkSnapshot, isDarkServerSnapshot);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
