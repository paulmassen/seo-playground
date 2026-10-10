'use client';

import { useState } from 'react';
import LocationPicker from '@/components/LocationPicker';
import { labsLanguagesFor } from '@/lib/geo-options';

interface Props {
  defaultPlatform: string;
  defaultLocation: string;
  defaultLanguage: string;
}

const FIELD_CLASS = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';
const CHAT_GPT_LANGUAGE_OPTIONS = [{ value: 'English', label: 'English' }];

/** Locale controls shared by the current-snapshot LLM Mentions endpoints. */
export default function MentionTargetingFields({ defaultPlatform, defaultLocation, defaultLanguage }: Props) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const [location, setLocation] = useState(defaultLocation);
  const [language, setLanguage] = useState(defaultLanguage);
  const isChatGpt = platform === 'chat_gpt';
  const languageOptions = isChatGpt ? CHAT_GPT_LANGUAGE_OPTIONS : labsLanguagesFor(location);
  const selectedLanguage = isChatGpt
    ? 'English'
    : languageOptions.some((item) => item.value === language) ? language : languageOptions[0]?.value ?? language;

  return (
    <>
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Platform</label>
        <select name="platform" value={platform} onChange={(event) => setPlatform(event.target.value)} className={FIELD_CLASS}>
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
        {isChatGpt && <p className="text-[11px] text-slate-400 mt-1">United States only for ChatGPT.</p>}
      </div>
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
        <select name="language" value={selectedLanguage} onChange={(event) => setLanguage(event.target.value)} disabled={isChatGpt} className={FIELD_CLASS}>
          {languageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {isChatGpt && <p className="text-[11px] text-slate-400 mt-1">English only for ChatGPT.</p>}
      </div>
    </>
  );
}
