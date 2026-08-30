'use client';

import { useState } from 'react';
import LocationPicker from '@/components/LocationPicker';
import { labsLanguagesFor } from '@/lib/geo-options';

interface Props {
  defaultPlatform: string;
  defaultLocation: string;
  defaultLanguage: string;
  defaultDateFrom: string;
  defaultDateTo: string;
}

const FIELD_CLASS = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';

const CHAT_GPT_LANGUAGE_OPTIONS = [{ value: 'English', label: 'English' }];

export default function HistoricalTargetingFields({
  defaultPlatform, defaultLocation, defaultLanguage, defaultDateFrom, defaultDateTo,
}: Props) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const [location, setLocation] = useState(defaultLocation);
  const [language, setLanguage] = useState(defaultLanguage);
  const isChatGpt = platform === 'chat_gpt';

  const languageOptions = isChatGpt ? CHAT_GPT_LANGUAGE_OPTIONS : labsLanguagesFor(location);
  const selectedLanguage = isChatGpt
    ? 'English'
    : languageOptions.some((l) => l.value === language) ? language : languageOptions[0]?.value ?? language;

  return (
    <>
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Platform</label>
        <select name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={FIELD_CLASS}>
          <option value="chat_gpt">ChatGPT</option>
          <option value="google">Google AI</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
        <LocationPicker
          key={isChatGpt ? 'us-locked' : 'user'}
          name="location"
          defaultValue={isChatGpt ? 'United States' : defaultLocation}
          onChange={setLocation}
          disabled={isChatGpt}
          className={FIELD_CLASS}
          scope="labs"
        />
        {isChatGpt && <p className="text-[11px] text-slate-400 mt-1">Always United States for ChatGPT.</p>}
      </div>

      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
        <select
          name="language"
          value={selectedLanguage}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={isChatGpt}
          className={FIELD_CLASS}
        >
          {languageOptions.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        {isChatGpt && <p className="text-[11px] text-slate-400 mt-1">Always English for ChatGPT.</p>}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">From</label>
          <input type="date" name="date_from" defaultValue={defaultDateFrom} min="2025-08-01" className={FIELD_CLASS} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">To</label>
          <input type="date" name="date_to" defaultValue={defaultDateTo} min="2025-08-01" className={FIELD_CLASS} />
        </div>
      </div>
    </>
  );
}
