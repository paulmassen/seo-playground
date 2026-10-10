import { describe, expect, it } from 'vitest';
import { serverOptions } from './server-options.mjs';

describe('Node listener', () => {
  it('binds only loopback by default, ignoring the container HOSTNAME', () => {
    expect(serverOptions({ HOSTNAME: 'public-host' })).toEqual({ port: '3000', hostname: '127.0.0.1' });
  });
  it('requires an explicit override to listen publicly', () => {
    expect(serverOptions({ SEO_PLAYGROUND_BIND: ' 0.0.0.0 ', PORT: ' 4000 ' })).toEqual({ port: '4000', hostname: '0.0.0.0' });
  });
  it('treats empty settings as local defaults', () => {
    expect(serverOptions({ SEO_PLAYGROUND_BIND: ' ', PORT: '' })).toEqual(serverOptions({}));
  });
});
