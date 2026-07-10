import { describe, it, expect } from 'vitest';
import { checkRefreshAuth } from '@/lib/refresh-auth';

describe('checkRefreshAuth', () => {
  it('always allows force-refresh in dev', () => {
    expect(checkRefreshAuth(null, undefined, true)).toBe(true);
    expect(checkRefreshAuth('Bearer whatever', 's', true)).toBe(true);
  });

  it('in prod, allows only the matching CRON_SECRET bearer', () => {
    expect(checkRefreshAuth('Bearer s3cr3t', 's3cr3t', false)).toBe(true);
    expect(checkRefreshAuth('Bearer wrong', 's3cr3t', false)).toBe(false);
    expect(checkRefreshAuth(null, 's3cr3t', false)).toBe(false);
  });

  it('in prod, denies when no secret is configured', () => {
    expect(checkRefreshAuth('Bearer anything', undefined, false)).toBe(false);
    expect(checkRefreshAuth('Bearer ', '', false)).toBe(false);
  });
});
