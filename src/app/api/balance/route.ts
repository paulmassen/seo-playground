import { getCredentials } from '@/lib/db';
import { NextResponse } from 'next/server';

interface DFUserResponse {
  tasks?: Array<{ result?: Array<{ money?: { balance?: number } }> }>;
}

let cachedBalance: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const now = Date.now();
  if (cachedBalance !== null && now < cacheExpiry) {
    return NextResponse.json({ balance: cachedBalance });
  }

  const creds = getCredentials();
  if (!creds) return NextResponse.json({ balance: null });

  try {
    const auth = btoa(`${creds.login}:${creds.pass}`);
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.ok) {
      const data = await res.json() as DFUserResponse;
      const balance = (data.tasks?.[0]?.result?.[0]?.money?.balance ?? 0).toFixed(2);
      cachedBalance = balance;
      cacheExpiry = now + CACHE_TTL;
      return NextResponse.json({ balance });
    }
  } catch {
    // fall through
  }

  return NextResponse.json({ balance: '0.00' });
}
