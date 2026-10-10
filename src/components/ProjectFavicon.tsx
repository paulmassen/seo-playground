'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'loading' | 'ready' | 'fallback';

// Google's favicon service never truly fails: for unknown domains it answers with a 16×16 generic globe
// (with a 404 status that browsers still render). Anything that small would be upscaled into a blurry
// blob, so we treat it as "no favicon" and render a crisp monogram instead.
const MIN_FAVICON_SIZE = 32;

const MONOGRAM_COLORS = [
  'bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300',
  'bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
  'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  'bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300',
  'bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300',
  'bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300',
];

function monogramFor(domain: string) {
  const name = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const letter = name.match(/[a-z0-9]/)?.[0]?.toUpperCase() ?? '?';
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { letter, color: MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length] };
}

function Monogram({ domain, className }: { domain: string; className: string }) {
  const { letter, color } = monogramFor(domain);
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden rounded-lg ${color} ${className}`}>
      {/* SVG text scales with the tile, so the letter stays proportional at every size. */}
      <svg viewBox="0 0 24 24" className="h-full w-full">
        <text x="12" y="12" dy="0.35em" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" fontFamily="inherit">
          {letter}
        </text>
      </svg>
    </span>
  );
}

export default function ProjectFavicon({ domain, className = 'h-7 w-7' }: { domain: string; className?: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  const evaluate = (img: HTMLImageElement) => setStatus(img.naturalWidth < MIN_FAVICON_SIZE ? 'fallback' : 'ready');

  useEffect(() => {
    setStatus('loading');
    // A cached image can finish loading before hydration, in which case onLoad never fires.
    const img = imgRef.current;
    if (img?.complete) {
      if (img.naturalWidth === 0) setStatus('fallback');
      else evaluate(img);
    }
  }, [domain]);

  if (!domain || status === 'fallback') return <Monogram domain={domain} className={className} />;

  const faviconUrl = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=64`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={faviconUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setStatus('fallback')}
      onLoad={(event) => evaluate(event.currentTarget)}
      className={`shrink-0 rounded-lg bg-slate-100 object-contain transition-opacity dark:bg-slate-800 ${status === 'ready' ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  );
}
