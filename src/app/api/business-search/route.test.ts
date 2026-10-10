import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ getCredentials: () => ({ login: 'login', pass: 'pass' }) }));

import { POST } from './route';

afterEach(() => vi.unstubAllGlobals());

function request(body: unknown) {
  return new NextRequest('http://localhost/api/business-search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('business-search route', () => {
  it('requires POST JSON and forwards a paid search only from the body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tasks: [{ status_code: 20000, result: [{ items: [{ type: 'maps_search', cid: '1', latitude: 48.1, longitude: 2.1, title: 'Cafe' }] }] }],
    }), { status: 200 })));

    const res = await POST(request({ q: 'Cafe', location_coordinate: '48.1,2.1,12', language: 'French' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [expect.objectContaining({ title: 'Cafe', cid: '1' })] });
    expect(fetch).toHaveBeenCalledOnce();
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)[0]).toMatchObject({ keyword: 'Cafe', location_coordinate: '48.1000000,2.1000000,12z', language_name: 'French' });
  });

  it('does not call DataForSEO when the location is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await POST(request({ q: 'Cafe' }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
