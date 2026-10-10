import { describe, expect, it } from 'vitest';
import { safeNextPath } from './auth-config';

describe('safeNextPath', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNextPath('/dashboard/rank-tracker?x=1')).toBe('/dashboard/rank-tracker?x=1');
  });
  it('rejects external or protocol-relative targets', () => {
    expect(safeNextPath('https://evil.test')).toBe('/dashboard');
    expect(safeNextPath('//evil.test')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.test')).toBe('/dashboard');
  });
  it('avoids redirect loops and the API', () => {
    expect(safeNextPath('/login')).toBe('/dashboard');
    expect(safeNextPath('/api/auth/get-session')).toBe('/dashboard');
  });
  it('falls back when missing', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath(['/a', '/b'])).toBe('/a');
  });
});
