'use client';

import { useMemo, useState } from 'react';

/** Free-text technology field with autocomplete from DataForSEO's technology list. */
export default function TechNameInput({ names, name, defaultValue, className, id }: { names: string[]; name: string; defaultValue: string; className: string; id: string }) {
  const [value, setValue] = useState(defaultValue);
  // A datalist of ~7,000 options is slow, so only the closest matches are offered.
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const starts = names.filter((n) => n.toLowerCase().startsWith(q));
    const contains = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 40);
  }, [names, value]);
  const known = !value.trim() || names.some((n) => n.toLowerCase() === value.trim().toLowerCase());

  return (
    <>
      <input id={id} type="text" name={name} list={`${id}-list`} required autoComplete="off" value={value}
        onChange={(e) => setValue(e.target.value)} placeholder="e.g. WordPress, Shopify, HubSpot…" className={className} />
      <datalist id={`${id}-list`}>
        {suggestions.map((n) => <option key={n} value={n} />)}
      </datalist>
      {!known && <p className="text-[11px] text-amber-600 mt-1">Not in DataForSEO&apos;s technology list. Pick one of the suggestions: the name must match exactly.</p>}
    </>
  );
}
