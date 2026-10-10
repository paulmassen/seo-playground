'use client';

import { Globe2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ProjectFavicon({ domain, className = 'h-7 w-7' }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [domain]);

  if (!domain || failed) {
    return <span className={`grid shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 ${className}`}><Globe2 className="h-3.5 w-3.5" /></span>;
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=64`;
  return (
    // Google provides the favicon service; the fallback keeps domains without an icon legible.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={faviconUrl} alt="" onError={() => setFailed(true)} referrerPolicy="no-referrer" className={`shrink-0 rounded-lg bg-slate-100 object-contain dark:bg-slate-800 ${className}`} />
  );
}
