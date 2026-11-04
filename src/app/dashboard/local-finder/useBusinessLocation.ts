'use client';

import { useCallback, useEffect, useState } from 'react';

export type BusinessLocationState = {
  status: 'idle' | 'loading' | 'done' | 'error';
  location: { lat: number; lng: number; address: string | null } | null;
  error: string | null;
  /** Starts the paid lookup. Only ever called from an explicit click. */
  locate: () => void;
};

type ApiView =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'done'; lat: number; lng: number; address: string | null }
  | { status: 'error'; error: string }
  | { error: string; status?: undefined };

const POLL_MS = 15_000;

/**
 * Address pin of a competitor listing. Reading a stored result is free; a new lookup is one Business Info
 * call in the Priority queue (~1 min), started by `locate()` only.
 */
export function useBusinessLocation(cid: string | undefined, center: string, language: string): BusinessLocationState {
  const [view, setView] = useState<ApiView>({ status: 'none' });
  // Tied to the listing that was clicked, so switching competitor can never re-send a paid request.
  const [request, setRequest] = useState<{ cid: string; nonce: number } | null>(null);
  const paidRequest = request && request.cid === cid ? request.nonce : 0;

  // Read what is already known for this listing, then follow a queued lookup until it settles.
  useEffect(() => {
    setView({ status: 'none' });
    if (!cid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = async () => {
      try {
        const response = await fetch(`/api/business-location?cid=${encodeURIComponent(cid)}`, { cache: 'no-store' });
        const data = await response.json() as ApiView;
        if (cancelled) return;
        setView(data);
        if (data.status === 'pending') timer = setTimeout(read, POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(read, POLL_MS);
      }
    };

    if (paidRequest === 0) {
      void read();
    } else {
      setView({ status: 'pending' });
      fetch('/api/business-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, center, language }),
      })
        .then((response) => response.json() as Promise<ApiView>)
        .then((data) => {
          if (cancelled) return;
          setView(data);
          if (data.status === 'pending') timer = setTimeout(read, POLL_MS);
        })
        .catch(() => { if (!cancelled) setView({ status: 'error', error: 'Could not start the lookup.' }); });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cid, center, language, paidRequest]);

  const locate = useCallback(() => {
    if (cid) setRequest((current) => ({ cid, nonce: (current?.nonce ?? 0) + 1 }));
  }, [cid]);

  if (view.status === 'done') {
    return { status: 'done', location: { lat: view.lat, lng: view.lng, address: view.address }, error: null, locate };
  }
  if (view.status === 'pending') return { status: 'loading', location: null, error: null, locate };
  if (view.status === 'error' || ('error' in view && view.error)) {
    return { status: 'error', location: null, error: view.error ?? 'The address could not be found.', locate };
  }
  return { status: 'idle', location: null, error: null, locate };
}
