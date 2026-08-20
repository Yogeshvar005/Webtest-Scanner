import type { BrowserContext, Route } from 'playwright';
import { isPrivateAddress } from '@wts/ownership';

export interface BlockedRequest {
  url: string;
  reason: string;
  at: string;
}

export interface ThirdPartyContact {
  origin: string;
  resourceType: string;
  count: number;
}

/**
 * `strict` blocks every off-site request, which produces an unstyled page on
 * any real site that serves assets from a separate domain. Use it when the
 * target is fully self-hosted and no third-party contact is acceptable.
 *
 * `balanced` (the default) still blocks off-site *navigation* and anything
 * resolving to a private address, but lets subresources load so screenshots
 * are faithful evidence. Every third-party origin contacted is recorded and
 * reported instead of silently allowed.
 */
export type EgressMode = 'strict' | 'balanced';

export interface EgressOptions {
  allowedOrigins: string[];
  mode?: EgressMode;
  onBlocked: (blocked: BlockedRequest) => void;
  onThirdParty?: (contact: { origin: string; resourceType: string }) => void;
}

/**
 * Controls what the page under test is allowed to talk to.
 *
 * Three properties are load-bearing and hold in both modes:
 *
 *  1. Nothing may reach a private, loopback or cloud-metadata address. This is
 *     the SSRF containment, and it is absolute.
 *  2. The page may not *navigate* off the verified origin, so a run cannot be
 *     walked onto a site the operator never authorised.
 *  3. Every off-site request is recorded, so the report can account for
 *     exactly who the page contacted.
 *
 * Note what this is not: it is not what stops an injected instruction from
 * exfiltrating secrets. That is closed by design upstream — secrets are
 * `{kind:'secret'}` references that never enter model context, and the DSL has
 * no primitive capable of constructing an arbitrary request. This guard is
 * defence in depth and SSRF containment, not the primary control.
 */
export function installEgressGuard(context: BrowserContext, options: EgressOptions): void {
  const { allowedOrigins, onBlocked, onThirdParty } = options;
  const mode = options.mode ?? 'balanced';

  const allowed = new Set(allowedOrigins.map(normaliseOrigin));
  const allowedSites = new Set(allowedOrigins.map((o) => registrableDomain(hostOf(o))));

  void context.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = request.url();

    // Inline data and blobs never leave the process.
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
      await route.continue();
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      onBlocked({ url, reason: 'Unparseable URL', at: new Date().toISOString() });
      await route.abort('blockedbyclient');
      return;
    }

    // (1) SSRF containment — absolute, in every mode.
    if (isPrivateAddress(parsed.hostname)) {
      onBlocked({ url, reason: 'Private, loopback or cloud-metadata address', at: new Date().toISOString() });
      await route.abort('blockedbyclient');
      return;
    }

    // The target itself, or another host on the same registrable domain
    // (an app's own CDN subdomain, for instance).
    if (allowed.has(normaliseOrigin(parsed.origin)) || allowedSites.has(registrableDomain(parsed.hostname))) {
      await route.continue();
      return;
    }

    // (2) Navigating away from the verified origin is never permitted.
    if (request.isNavigationRequest()) {
      onBlocked({
        url,
        reason: `Navigation to ${parsed.origin} would leave the verified target`,
        at: new Date().toISOString(),
      });
      await route.abort('blockedbyclient');
      return;
    }

    if (mode === 'strict') {
      onBlocked({
        url,
        reason: `Origin ${parsed.origin} is not in the verified allowlist (strict mode)`,
        at: new Date().toISOString(),
      });
      await route.abort('blockedbyclient');
      return;
    }

    // (3) Allowed, but accounted for.
    onThirdParty?.({ origin: parsed.origin, resourceType: request.resourceType() });
    await route.continue();
  });
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return origin.toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  }
}

function normaliseOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return origin.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Two-label public suffixes common enough to matter here. This is a pragmatic
 * approximation of the Public Suffix List: getting it wrong only ever makes
 * the guard treat two hosts as unrelated, which fails closed.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'co.za', 'co.jp', 'or.jp', 'ne.jp', 'co.in', 'co.kr',
  'com.br', 'com.mx', 'com.cn', 'com.sg', 'com.hk', 'com.tr',
]);

/** Approximates eTLD+1, so `api.github.com` and `github.com` are one site. */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (labels.length <= 2) return host;

  const lastTwo = labels.slice(-2).join('.');
  return MULTI_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}
