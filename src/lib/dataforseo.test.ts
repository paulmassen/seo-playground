import { describe, it, expect, vi, afterEach } from 'vitest';
import { callDataForSeo, callDataForSeoFirst } from './dataforseo';

const creds = { login: 'user', pass: 'pass' };

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('callDataForSeo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the task result array and cost on a successful call', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 20000, cost: 0.05, result: [{ foo: 'bar' }] }],
    }), { status: 200 }));

    const res = await callDataForSeo<{ foo: string }>('some/endpoint/live', { keyword: 'x' }, creds);
    expect(res).toEqual({ result: [{ foo: 'bar' }], cost: 0.05 });
  });

  it('sends a Basic auth header built from the given credentials', async () => {
    let capturedHeaders: HeadersInit | undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', { a: 1 }, { login: 'me', pass: 'secret' });
    const headers = capturedHeaders as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa('me:secret')}`);
  });

  it('wraps a non-array body in a single-element task array', async () => {
    let capturedBody: string | undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedBody = init.body as string;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', { keyword: 'x' }, creds);
    expect(JSON.parse(capturedBody!)).toEqual([{ keyword: 'x' }]);
  });

  it('returns an error when DataForSEO reports a non-20000 status_code', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 40501, status_message: 'Invalid Field: location_name.' }],
    }), { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('DataForSEO: Invalid Field: location_name.');
    expect(res.result).toBeUndefined();
  });

  it('returns an error on a non-OK HTTP response instead of throwing', async () => {
    mockFetchOnce(() => new Response('', { status: 502, statusText: 'Bad Gateway' }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('API error 502: Bad Gateway');
  });

  it('returns an error instead of throwing when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Network error: getaddrinfo ENOTFOUND');
  });

  it('returns a clear timeout error instead of throwing when the request exceeds timeoutMs', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds, 20_000);
    expect(res.error).toBe('Request timed out after 20000ms.');
  });

  it('passes an AbortSignal.timeout(timeoutMs) through to fetch when timeoutMs is given', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedSignal = init.signal ?? undefined;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', {}, creds, 5_000);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('does not set a signal at all when timeoutMs is omitted', async () => {
    let capturedSignal: AbortSignal | null | undefined = 'unset' as unknown as undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedSignal = init.signal;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', {}, creds);
    expect(capturedSignal).toBeUndefined();
  });

  it('returns an error instead of throwing when the response body is not valid JSON', async () => {
    mockFetchOnce(() => new Response('<html>not json</html>', { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Invalid API response (not JSON).');
  });

  it('returns an error when the response has no tasks', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Empty API response.');
  });
});

describe('callDataForSeoFirst', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwraps result[0] instead of returning the raw array', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 20000, cost: 0.01, result: [{ items: [1, 2, 3] }] }],
    }), { status: 200 }));

    const res = await callDataForSeoFirst<{ items: number[] }>('some/endpoint/live', {}, creds);
    expect(res).toEqual({ result: { items: [1, 2, 3] }, cost: 0.01 });
  });

  it('propagates an error the same way as callDataForSeo', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 40400, status_message: 'Not Found.' }],
    }), { status: 200 }));

    const res = await callDataForSeoFirst('some/endpoint/live', {}, creds);
    expect(res.error).toBe('DataForSEO: Not Found.');
    expect(res.result).toBeUndefined();
  });
});
