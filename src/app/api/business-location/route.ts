import { NextRequest, NextResponse } from 'next/server';
import {
  completeBusinessLocationForProject, getActiveProject, getBusinessLocationForProject, getCredentials, projectExists,
  saveBusinessLocationPendingForProject, type BusinessLocation,
} from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';

export const dynamic = 'force-dynamic';

// Address pin for a competitor on the Geo-grid map. Local Finder results carry no coordinates, so this
// is a separate, on-demand DataForSEO Business Info call by CID, only ever started by an explicit click.
// Priority queue: ~1 minute for $0.003, against $0.0054 in Live. The result is stored per project, so a
// located business is shown again for free in every monitor.

const STILL_PROCESSING = new Set([40601, 40602]);
const CID = /^\d{1,30}$/;

function auth(credentials: { login: string; pass: string }) {
  return `Basic ${Buffer.from(`${credentials.login}:${credentials.pass}`).toString('base64')}`;
}

function projectFrom(request: NextRequest, requested: unknown): string {
  const value = typeof requested === 'string' ? requested : request.nextUrl.searchParams.get('project');
  return value && projectExists(value) ? value : getActiveProject().id;
}

function view(location: BusinessLocation | null) {
  if (!location) return { status: 'none' as const };
  if (location.status === 'done') return { status: 'done' as const, lat: location.lat, lng: location.lng, address: location.address };
  if (location.status === 'error') return { status: 'error' as const, error: location.error ?? 'The address could not be found.' };
  return { status: 'pending' as const };
}

/** Reads a stored location, collecting a queued lookup when it is ready. Never posts a paid task. */
export async function GET(request: NextRequest) {
  const cid = request.nextUrl.searchParams.get('cid') ?? '';
  if (!CID.test(cid)) return NextResponse.json({ error: 'Invalid cid.' }, { status: 400 });
  const projectId = projectFrom(request, null);
  const location = getBusinessLocationForProject(projectId, cid);
  if (location?.status !== 'pending' || !location.taskId) return NextResponse.json(view(location));

  const credentials = getCredentials();
  if (!credentials) return NextResponse.json({ error: 'DataForSEO credentials are not configured.' }, { status: 503 });

  let data: {
    status_code?: number; status_message?: string;
    tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: Array<{ latitude?: number; longitude?: number; address?: string }> }> }> | null;
  };
  try {
    // No "/advanced" suffix: Business Info only has task_get/{id}.
    const response = await fetch(`https://api.dataforseo.com/v3/business_data/google/my_business_info/task_get/${location.taskId}`, {
      headers: { Authorization: auth(credentials) }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return NextResponse.json({ status: 'pending' });
    data = await response.json();
  } catch {
    return NextResponse.json({ status: 'pending' });
  }

  const task = data.tasks?.[0];
  // A missing task (wrong or expired id) is final; treating it as "still processing" would poll forever.
  if (!task) {
    completeBusinessLocationForProject(projectId, cid, { error: data.status_message ?? 'The lookup task was not found.' });
  } else if (STILL_PROCESSING.has(task.status_code ?? 0)) {
    return NextResponse.json({ status: 'pending' });
  } else if (task.status_code !== 20000) {
    completeBusinessLocationForProject(projectId, cid, { error: task.status_message ?? 'The lookup failed.' });
  } else {
    const item = task.result?.[0]?.items?.[0];
    if (item?.latitude == null || item.longitude == null) {
      completeBusinessLocationForProject(projectId, cid, { error: 'Google has no address for this listing.' });
    } else {
      completeBusinessLocationForProject(projectId, cid, { lat: item.latitude, lng: item.longitude, address: item.address ?? null });
    }
  }
  return NextResponse.json(view(getBusinessLocationForProject(projectId, cid)));
}

/** Posts one paid Business Info lookup, unless the location is already known or already queued. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const cid = typeof body.cid === 'string' ? body.cid.trim() : '';
  if (!CID.test(cid)) return NextResponse.json({ error: 'Invalid cid.' }, { status: 400 });
  const projectId = projectFrom(request, body.project);

  const existing = getBusinessLocationForProject(projectId, cid);
  if (existing && existing.status !== 'error') return NextResponse.json(view(existing));

  const [lat, lng] = (typeof body.center === 'string' ? body.center : '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'Invalid center.' }, { status: 400 });
  const requestedLanguage = typeof body.language === 'string' ? body.language.trim().toLowerCase() : '';
  const language = LANGUAGES.find((item) => item.value.toLowerCase() === requestedLanguage)?.value ?? 'English';

  const credentials = getCredentials();
  if (!credentials) return NextResponse.json({ error: 'DataForSEO credentials are not configured.' }, { status: 503 });

  let data: { tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> };
  try {
    const response = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/task_post', {
      method: 'POST',
      headers: { Authorization: auth(credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword: `cid:${cid}`,
        // The CID pins the exact listing; the location is required by the API but does not narrow the match.
        location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},50000`,
        language_name: language,
        priority: 2,
      }]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return NextResponse.json({ error: `DataForSEO HTTP ${response.status}` }, { status: 502 });
    data = await response.json();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not reach DataForSEO.' }, { status: 502 });
  }
  const task = data.tasks?.[0];
  if (!task?.id || (task.status_code !== 20100 && task.status_code !== 20000)) {
    return NextResponse.json({ error: task?.status_message ?? 'DataForSEO did not accept the lookup.' }, { status: 502 });
  }
  saveBusinessLocationPendingForProject(projectId, cid, task.id, task.cost ?? 0);
  return NextResponse.json({ status: 'pending' });
}
