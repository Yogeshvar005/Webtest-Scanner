import type { BrowserContext, Route } from 'playwright';
import { isPrivateAddress } from '@wts/ownership';

export interface BlockedRequest {
  url: string;
  reason: string;
  at: string;
}

/**
 * Aborts any request the page makes to a host outside the verified allowlist.
 *
 * This is the containment that does not depend on the model behaving. Even if
 * an injected instruction were somehow to survive the DSL's closed action
 * vocabulary, the browser physically cannot reach an off-allowlist origin to
 * exfiltrate anything.
 */
export function installEgressGuard(
  context: BrowserContext,
  allowedOrigins: string[],
  onBlocked: (blocked: BlockedRequest) => void,
): void {
  const allowed = new Set(allowedOrigins.map(normaliseOrigin));

  void context.route('**/*', async (route: Route) => {
    const url = route.request().url();

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

    if (isPrivateAddress(parsed.hostname)) {
      onBlocked({ url, reason: 'Private, loopback or cloud-metadata address', at: new Date().toISOString() });
      await route.abort('blockedbyclient');
      return;
    }

    if (!allowed.has(normaliseOrigin(parsed.origin))) {
      onBlocked({
        url,
        reason: `Origin ${parsed.origin} is not in the verified allowlist`,
        at: new Date().toISOString(),
      });
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });
}

function normaliseOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return origin.toLowerCase().replace(/\/$/, '');
  }
}
