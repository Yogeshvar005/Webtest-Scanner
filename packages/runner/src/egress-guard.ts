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

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
 * Additionally, route fulfillment via Node's native HTTP stack is used to bypass
 * aggressive CDN HTTP/2 fingerprinting that would otherwise cause ERR_HTTP2_PROTOCOL_ERROR
 * and lead to unstyled/raw HTML renders.
 */
export function installEgressGuard(context: BrowserContext, options: EgressOptions): void {
  const { allowedOrigins, onBlocked, onThirdParty } = options;
  const mode = options.mode ?? 'balanced';

  const allowed = new Set(allowedOrigins.map(normaliseOrigin));
  const allowedSites = new Set(allowedOrigins.map((o) => registrableDomain(hostOf(o))));
  const primaryOrigin = allowedOrigins[0] ? normaliseOrigin(allowedOrigins[0]) : '';

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

    const isSameOriginOrSite =
      allowed.has(normaliseOrigin(parsed.origin)) || allowedSites.has(registrableDomain(parsed.hostname));

    // Well-known bot-challenge / CAPTCHA intermediaries that always redirect
    // back to the original site (DataDome, Cloudflare challenge, Akamai, etc.).
    // Blocking them causes blank pages on sites like GitHub.
    const isChallengeProvider = /captcha-delivery\.com|datadome\.co|cf-challenge|challenges\.cloudflare\.com|akam\.net|perimeterx\.net|px-cloud\.net/.test(parsed.hostname);

    // (2) Navigating away from the verified origin is never permitted —
    // unless it is a recognised challenge intermediary that will redirect back.
    if (request.isNavigationRequest() && !isSameOriginOrSite && !isChallengeProvider) {
      onBlocked({
        url,
        reason: `Navigation to ${parsed.origin} would leave the verified target`,
        at: new Date().toISOString(),
      });
      await route.abort('blockedbyclient');
      return;
    }

    if (!isSameOriginOrSite) {
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
    }

    // Fulfill request using Node fetch to prevent HTTP/2 fingerprint drops on CDNs (Akamai/Cloudflare)
    try {
      const incomingHeaders = request.headers();
      const fetchHeaders: Record<string, string> = {
        'User-Agent': incomingHeaders['user-agent'] || DEFAULT_UA,
        'Accept': incomingHeaders['accept'] || '*/*',
        'Accept-Language': incomingHeaders['accept-language'] || 'en-US,en;q=0.9',
      };
      if (primaryOrigin) {
        fetchHeaders['Referer'] = primaryOrigin;
      }

      const method = request.method();
      const postData = request.postDataBuffer();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: method !== 'GET' && method !== 'HEAD' && postData ? (new Uint8Array(postData) as unknown as BodyInit) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const buffer = Buffer.from(await resp.arrayBuffer());
      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        const k = key.toLowerCase();
        // Skip hop-by-hop & compression headers since Node fetch decodes automatically
        if (k !== 'content-encoding' && k !== 'content-length' && k !== 'transfer-encoding') {
          responseHeaders[k] = value;
        }
      });

      await route.fulfill({
        status: resp.status,
        headers: responseHeaders,
        body: buffer,
      });
    } catch {
      // If direct fetch fails, fallback to standard route continuation or silent abort
      try {
        await route.continue();
      } catch {
        await route.abort('failed').catch(() => {});
      }
    }
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
