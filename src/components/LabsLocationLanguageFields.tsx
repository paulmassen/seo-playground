'use client';

import { useState } from 'react';
import LocationPicker from './LocationPicker';
import { labsLanguagesFor } from '@/lib/geo-options';

interface Props {
  defaultLocation: string;
  defaultLanguage: string;
  className: string;
  locationName?: string;
  languageName?: string;
  wrapperClassName?: string;
  labelClassName?: string;
}

const DEFAULT_LABEL_CLASS = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

/**
 * Paired Location + Language fields for Labs/AI Optimization pages. Each country only supports a
 * fixed subset of languages (see labsLanguagesFor) — this narrows the Language dropdown to match
 * whatever's typed into Location, live, and falls back to the current selection if it's still
 * valid for the new country, or the first supported one otherwise.
 */
export default function LabsLocationLanguageFields({
  defaultLocation, defaultLanguage, className, locationName = 'location', languageName = 'language',
  wrapperClassName, labelClassName = DEFAULT_LABEL_CLASS,
}: Props) {
  const [location, setLocation] = useState(defaultLocation);
  const [language, setLanguage] = useState(defaultLanguage);

  const options = labsLanguagesFor(location);
  const selected = options.some((l) => l.value === language) ? language : options[0]?.value ?? language;

  return (
    <>
      <div className={wrapperClassName}>
        <label className={labelClassName}>Location</label>
        <LocationPicker name={locationName} defaultValue={defaultLocation} onChange={setLocation} className={className} scope="labs" />
      </div>
      <div className={wrapperClassName}>
        <label className={labelClassName}>Language</label>
        <select name={languageName} value={selected} onChange={(e) => setLanguage(e.target.value)} className={className}>
          {options.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
    </>
  );
}
