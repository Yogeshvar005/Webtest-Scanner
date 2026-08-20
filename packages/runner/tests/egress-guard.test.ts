import { describe, expect, test, vi } from 'vitest';
import type { BrowserContext } from 'playwright';
import { installEgressGuard, type BlockedRequest } from '../src/index';

/**
 * Drives the guard without a real browser by capturing the route handler that
 * `installEgressGuard` registers and invoking it with fake routes.
 */
function harness(allowed: string[]) {
  let handler: ((route: unknown) => Promise<void>) | undefined;
  const blocked: BlockedRequest[] = [];

  const context = {
    route: vi.fn(async (_pattern: string, fn: (route: unknown) => Promise<void>) => {
      handler = fn;
    }),
  } as unknown as BrowserContext;

  installEgressGuard(context, allowed, (b) => blocked.push(b));

  async function request(url: string) {
    const route = {
      request: () => ({ url: () => url }),
      continue: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    await handler!(route);
    return route;
  }

  return { request, blocked };
}

const ALLOWED = ['https://app.example.com'];

describe('installEgressGuard', () => {
  test('allows a request to the verified origin', async () => {
    const { request, blocked } = harness(ALLOWED);
    const route = await request('https://app.example.com/dashboard');

    expect(route.continue).toHaveBeenCalled();
    expect(blocked).toHaveLength(0);
  });

  test('blocks an exfiltration attempt to a foreign origin', async () => {
    // This is the control that holds even if every other layer failed.
    const { request, blocked } = harness(ALLOWED);
    const route = await request('https://evil.example/steal?cookie=abc');

    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(blocked[0]!.reason).toContain('not in the verified allowlist');
  });

  test('blocks the cloud metadata endpoint', async () => {
    const { request, blocked } = harness(ALLOWED);
    const route = await request('http://169.254.169.254/latest/meta-data/');

    expect(route.abort).toHaveBeenCalled();
    expect(blocked[0]!.reason).toContain('metadata');
  });

  test('blocks a loopback address even when it looks like the target', async () => {
    const { request, blocked } = harness(ALLOWED);
    await request('http://127.0.0.1:8080/admin');

    expect(blocked).toHaveLength(1);
  });

  test('blocks a private network address', async () => {
    const { request } = harness(ALLOWED);
    const route = await request('http://192.168.1.1/router');

    expect(route.abort).toHaveBeenCalled();
  });

  test('allows inline data and blob URLs', async () => {
    const { request } = harness(ALLOWED);
    const data = await request('data:image/png;base64,iVBORw0KGgo=');
    const blob = await request('blob:https://app.example.com/abc');
    const about = await request('about:blank');

    expect(data.continue).toHaveBeenCalled();
    expect(blob.continue).toHaveBeenCalled();
    expect(about.continue).toHaveBeenCalled();
  });

  test('blocks an unparseable URL rather than letting it through', async () => {
    const { request, blocked } = harness(ALLOWED);
    const route = await request('http://[malformed');

    expect(route.abort).toHaveBeenCalled();
    expect(blocked[0]!.reason).toBe('Unparseable URL');
  });

  test('treats a subdomain as a different origin', async () => {
    const { request, blocked } = harness(ALLOWED);
    await request('https://cdn.app.example.com/script.js');

    expect(blocked).toHaveLength(1);
  });

  test('matches origins case-insensitively and ignores a trailing slash', async () => {
    const { request } = harness(['https://APP.example.com/']);
    const route = await request('https://app.example.com/page');

    expect(route.continue).toHaveBeenCalled();
  });

  test('records a timestamp on every block, for the audit trail', async () => {
    const { request, blocked } = harness(ALLOWED);
    await request('https://evil.example/');

    expect(Date.parse(blocked[0]!.at)).not.toBeNaN();
  });

  test('accepts multiple allowed origins', async () => {
    const { request } = harness(['https://app.example.com', 'https://api.example.com']);
    const route = await request('https://api.example.com/v1/users');

    expect(route.continue).toHaveBeenCalled();
  });
});

describe('allowlist entries that are not parseable URLs', () => {
  test('falls back to string comparison for a bare host entry', () => {
    // A misconfigured allowlist entry must not throw during setup; it simply
    // fails to match a real origin, which fails closed rather than open.
    const { request, blocked } = harness(['app.example.com']);

    return request('https://app.example.com/page').then((route) => {
      expect(route.abort).toHaveBeenCalled();
      expect(blocked).toHaveLength(1);
    });
  });
});
