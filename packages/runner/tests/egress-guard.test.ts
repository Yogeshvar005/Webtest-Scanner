import { describe, expect, test, vi } from 'vitest';
import type { BrowserContext } from 'playwright';
import {
  installEgressGuard, registrableDomain,
  type BlockedRequest, type EgressMode,
} from '../src/index';

interface FakeRequest {
  resourceType?: string;
  navigation?: boolean;
}

/**
 * Drives the guard without a real browser by capturing the route handler that
 * `installEgressGuard` registers and invoking it with fake routes.
 */
function harness(allowed: string[], mode: EgressMode = 'balanced') {
  let handler: ((route: unknown) => Promise<void>) | undefined;
  const blocked: BlockedRequest[] = [];
  const thirdParty: Array<{ origin: string; resourceType: string }> = [];

  const context = {
    route: vi.fn(async (_pattern: string, fn: (route: unknown) => Promise<void>) => {
      handler = fn;
    }),
  } as unknown as BrowserContext;

  installEgressGuard(context, {
    allowedOrigins: allowed,
    mode,
    onBlocked: (b) => blocked.push(b),
    onThirdParty: (c) => thirdParty.push(c),
  });

  async function request(url: string, opts: FakeRequest = {}) {
    const route = {
      request: () => ({
        url: () => url,
        resourceType: () => opts.resourceType ?? 'fetch',
        isNavigationRequest: () => opts.navigation ?? false,
      }),
      continue: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    await handler!(route);
    return route;
  }

  return { request, blocked, thirdParty };
}

const ALLOWED = ['https://app.example.com'];

describe('SSRF containment (absolute, both modes)', () => {
  test.each(['balanced', 'strict'] as EgressMode[])('blocks the cloud metadata endpoint in %s mode', async (mode) => {
    const { request, blocked } = harness(ALLOWED, mode);
    const route = await request('http://169.254.169.254/latest/meta-data/');

    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(blocked[0]!.reason).toContain('metadata');
  });

  test('blocks a loopback address', async () => {
    const { request, blocked } = harness(ALLOWED);
    await request('http://127.0.0.1:8080/admin');
    expect(blocked).toHaveLength(1);
  });

  test('blocks a private network address', async () => {
    const { request } = harness(ALLOWED);
    const route = await request('http://192.168.1.1/router');
    expect(route.abort).toHaveBeenCalled();
  });

  test('blocks a private address even for a subresource in balanced mode', async () => {
    const { request, thirdParty } = harness(ALLOWED);
    const route = await request('http://10.0.0.5/logo.png', { resourceType: 'image' });

    expect(route.abort).toHaveBeenCalled();
    expect(thirdParty).toHaveLength(0);
  });
});

describe('the verified target and its own site', () => {
  test('allows the exact origin', async () => {
    const { request, blocked } = harness(ALLOWED);
    const route = await request('https://app.example.com/dashboard', { navigation: true });

    expect(route.continue).toHaveBeenCalled();
    expect(blocked).toHaveLength(0);
  });

  test('allows a sibling subdomain on the same registrable domain', async () => {
    // A site's own CDN subdomain is not a third party.
    const { request, thirdParty } = harness(ALLOWED);
    const route = await request('https://cdn.example.com/app.css', { resourceType: 'stylesheet' });

    expect(route.continue).toHaveBeenCalled();
    expect(thirdParty).toHaveLength(0);
  });

  test('matches origins case-insensitively and ignores a trailing slash', async () => {
    const { request } = harness(['https://APP.example.com/']);
    const route = await request('https://app.example.com/page');
    expect(route.continue).toHaveBeenCalled();
  });

  test('accepts multiple allowed origins', async () => {
    const { request } = harness(['https://app.example.com', 'https://api.other.test']);
    const route = await request('https://api.other.test/v1/users');
    expect(route.continue).toHaveBeenCalled();
  });
});

describe('navigation containment (both modes)', () => {
  test('blocks navigation to a foreign origin', async () => {
    const { request, blocked } = harness(ALLOWED);
    const route = await request('https://evil.example/landing', { navigation: true });

    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(blocked[0]!.reason).toContain('leave the verified target');
  });

  test('blocks foreign navigation even in balanced mode where subresources are allowed', async () => {
    const { request } = harness(ALLOWED, 'balanced');
    const nav = await request('https://evil.example/', { navigation: true });
    const asset = await request('https://cdn.thirdparty.test/x.css', { resourceType: 'stylesheet' });

    expect(nav.abort).toHaveBeenCalled();
    expect(asset.continue).toHaveBeenCalled();
  });
});

describe('balanced mode', () => {
  test('loads a third-party stylesheet so the screenshot is faithful', async () => {
    // This is the bug that made github.com render completely unstyled.
    const { request, thirdParty } = harness(['https://github.com']);
    const route = await request('https://github.githubassets.com/assets/app.css', { resourceType: 'stylesheet' });

    expect(route.continue).toHaveBeenCalled();
    expect(thirdParty[0]).toEqual({ origin: 'https://github.githubassets.com', resourceType: 'stylesheet' });
  });

  test('records every third-party origin rather than allowing silently', async () => {
    const { request, thirdParty } = harness(ALLOWED);
    await request('https://fonts.googleapis.test/css', { resourceType: 'stylesheet' });
    await request('https://analytics.tracker.test/t.js', { resourceType: 'script' });

    expect(thirdParty.map((c) => c.origin)).toEqual([
      'https://fonts.googleapis.test',
      'https://analytics.tracker.test',
    ]);
  });

  test('does not report an allowed third-party request as blocked', async () => {
    const { request, blocked } = harness(ALLOWED);
    await request('https://cdn.thirdparty.test/x.png', { resourceType: 'image' });
    expect(blocked).toHaveLength(0);
  });

  test('works without an onThirdParty callback', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined;
    const context = {
      route: vi.fn(async (_p: string, fn: (route: unknown) => Promise<void>) => { handler = fn; }),
    } as unknown as BrowserContext;

    installEgressGuard(context, { allowedOrigins: ALLOWED, onBlocked: () => undefined });

    const route = {
      request: () => ({ url: () => 'https://cdn.thirdparty.test/x.css', resourceType: () => 'stylesheet', isNavigationRequest: () => false }),
      continue: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    await handler!(route);

    expect(route.continue).toHaveBeenCalled();
  });
});

describe('strict mode', () => {
  test('blocks a third-party subresource', async () => {
    const { request, blocked } = harness(ALLOWED, 'strict');
    const route = await request('https://cdn.thirdparty.test/app.css', { resourceType: 'stylesheet' });

    expect(route.abort).toHaveBeenCalled();
    expect(blocked[0]!.reason).toContain('strict mode');
  });

  test('still allows the target\'s own subdomain', async () => {
    const { request } = harness(ALLOWED, 'strict');
    const route = await request('https://cdn.example.com/app.css', { resourceType: 'stylesheet' });
    expect(route.continue).toHaveBeenCalled();
  });
});

describe('malformed and inline URLs', () => {
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

  test('records a timestamp on every block, for the audit trail', async () => {
    const { request, blocked } = harness(ALLOWED);
    await request('https://evil.example/', { navigation: true });
    expect(Date.parse(blocked[0]!.at)).not.toBeNaN();
  });

  test('falls back to string comparison for a bare host allowlist entry', async () => {
    const { request } = harness(['app.example.com']);
    const route = await request('https://app.example.com/page');

    // The bare entry still resolves to the same registrable domain, so it matches.
    expect(route.continue).toHaveBeenCalled();
  });

  test('a bare host entry does not match an unrelated domain', async () => {
    const { request, blocked } = harness(['app.example.com'], 'strict');
    await request('https://unrelated.test/x.css', { resourceType: 'stylesheet' });

    expect(blocked).toHaveLength(1);
  });
});

describe('registrableDomain', () => {
  test.each([
    ['github.com', 'github.com'],
    ['api.github.com', 'github.com'],
    ['a.b.c.github.com', 'github.com'],
    ['example.co.uk', 'example.co.uk'],
    ['www.example.co.uk', 'example.co.uk'],
    ['shop.example.com.au', 'example.com.au'],
    ['localhost', 'localhost'],
  ])('%s -> %s', (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });

  test('is case-insensitive and tolerates a trailing dot', () => {
    expect(registrableDomain('API.GitHub.com.')).toBe('github.com');
  });

  test('treats githubassets.com as a different site from github.com', () => {
    // Which is why it shows up as a recorded third party rather than as "same site".
    expect(registrableDomain('github.githubassets.com')).not.toBe(registrableDomain('github.com'));
  });
});
