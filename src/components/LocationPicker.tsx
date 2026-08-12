'use client';

import { useEffect, useRef, useState } from 'react';
import { LABS_LOCATIONS } from '@/lib/geo-options';

interface Suggestion {
  code: number;
  name: string;
  countryIso: string;
  type: string;
}

interface Props {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Fires on every keystroke/selection with the current text — for callers that need to react
   * to the location live (e.g. filtering a paired Language field to what that country supports). */
  onChange?: (value: string) => void;
  /**
   * 'serp' (default) searches DataForSEO's full city/region/country dataset — use for SERP,
   * Local Finder, and Business Data endpoints. 'labs' restricts to the ~94 countries DataForSEO
   * Labs / AI Optimization endpoints actually support — use for those, since a city/region value
   * there fails outright.
   */
  scope?: 'serp' | 'labs';
}

const LABS_SUGGESTIONS: Suggestion[] = LABS_LOCATIONS.map((l) => ({
  code: l.code, name: l.name, countryIso: l.iso, type: 'Country',
}));

const DEFAULT_CLASS =
  'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800';

function isoToFlag(iso: string): string {
  if (iso.length !== 2) return '';
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

export default function LocationPicker({ name, defaultValue = '', placeholder, required, disabled, className, scope = 'serp', onChange }: Props) {
  const [text, setText] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  function fetchSuggestions(query: string) {
    if (scope === 'labs') {
      const q = query.trim().toLowerCase();
      setSuggestions(q ? LABS_SUGGESTIONS.filter((s) => s.name.toLowerCase().includes(q)) : LABS_SUGGESTIONS);
      setActiveIndex(-1);
      return;
    }
    const requestId = ++requestIdRef.current;
    fetch(`/api/locations?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data: { results: Suggestion[] }) => {
        if (requestId !== requestIdRef.current) return;
        setSuggestions(data.results ?? []);
        setActiveIndex(-1);
      })
      .catch(() => {});
  }

  function handleChange(value: string) {
    setText(value);
    onChange?.(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  }

  function handleFocus() {
    setOpen(true);
    if (suggestions.length === 0) fetchSuggestions(text);
  }

  function selectSuggestion(s: Suggestion) {
    setText(s.name);
    onChange?.(s.name);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      } else {
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        name={name}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? (scope === 'labs' ? 'e.g. France' : 'e.g. Paris, France')}
        required={required}
        disabled={disabled}
        autoComplete="off"
        className={className ?? DEFAULT_CLASS}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1">
          {suggestions.map((s, i) => (
            <li key={`${s.code}-${s.name}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                {s.countryIso && <span className="shrink-0">{isoToFlag(s.countryIso)}</span>}
                <span className="flex-1 truncate text-slate-800 dark:text-slate-200">{s.name}</span>
                <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-700 rounded px-1.5 py-0.5">
                  {s.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
