/**
 * Categories of target that this platform refuses to test regardless of how
 * convincingly ownership is proven. A verified government domain is still
 * refused — the denylist is evaluated before, and outranks, verification.
 */
export type DenylistCategory =
  | 'government'
  | 'military'
  | 'cloud-control-plane'
  | 'financial'
  | 'healthcare'
  | 'critical-infrastructure'
  | 'private-network'
  | 'platform-abuse';

export interface DenylistHit {
  category: DenylistCategory;
  reason: string;
}

/** Public-suffix patterns for state and military domains, several countries. */
const GOVERNMENT_SUFFIXES = [
  '.gov', '.mil', '.gov.uk', '.mod.uk', '.gov.au', '.gov.in', '.gc.ca',
  '.gouv.fr', '.bund.de', '.go.jp', '.gov.sg', '.govt.nz', '.gov.za',
];

/** Consoles and metadata endpoints where automation could alter real infrastructure. */
const CLOUD_CONTROL_PLANES = [
  'console.aws.amazon.com', 'signin.aws.amazon.com', 'console.cloud.google.com',
  'portal.azure.com', 'console.cloudflare.com', 'dash.cloudflare.com',
  'metadata.google.internal', 'app.terraform.io', 'console.firebase.google.com',
];

/**
 * Explicitly curated regulated domains. Keyword matching is deliberately NOT
 * used for hard blocking: real banks are `chase.com` and `hsbc.co.uk`, which
 * contain no giveaway keyword, while `burbank.com` and `healthfoods.example`
 * do. A keyword denylist would therefore both under-block the targets that
 * matter and over-block innocent ones. Reliable identification comes from an
 * explicit list, maintained by the platform operator.
 */
const CURATED_REGULATED: Array<[string, DenylistCategory, string]> = [
  ['chase.com', 'financial', 'Curated financial institution'],
  ['hsbc.co.uk', 'financial', 'Curated financial institution'],
  ['paypal.com', 'financial', 'Curated financial institution'],
  ['stripe.com', 'financial', 'Curated financial institution'],
  ['nhs.uk', 'healthcare', 'Curated healthcare provider'],
  ['medicare.gov', 'healthcare', 'Curated healthcare provider'],
];

/**
 * Keyword hints that a target *may* be regulated. These do not block on their
 * own — they raise `requiresManualReview`, which gates elevation to tier 2
 * behind a human looking at the ownership evidence.
 */
const REVIEW_KEYWORDS: Array<[RegExp, DenylistCategory]> = [
  [/(bank|banking|creditunion|payments?|finance|invest)/i, 'financial'],
  [/(hospital|clinic|health|medical|patient|pharma)/i, 'healthcare'],
  [/(scada|powergrid|nuclear|utility|powerplant|waterworks)/i, 'critical-infrastructure'],
];

/** Reserved ranges the browser must never be pointed at (SSRF containment). */
const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^0\./,
];

export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '[::1]') return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^\[?(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/i.test(h)) return true;
  return PRIVATE_IPV4.some((re) => re.test(h));
}

/**
 * Checks a hostname against the hard denylist. `extraBlocked` carries the
 * platform's own abuse blocklist, which operators can extend at runtime.
 */
export function checkDenylist(hostname: string, extraBlocked: string[] = []): DenylistHit | undefined {
  const host = hostname.toLowerCase().replace(/\.$/, '');

  if (isPrivateAddress(host)) {
    return { category: 'private-network', reason: `${hostname} resolves inside a private or reserved network range.` };
  }

  for (const suffix of GOVERNMENT_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) {
      const category: DenylistCategory = suffix.includes('mil') || suffix.includes('mod') ? 'military' : 'government';
      return { category, reason: `${hostname} is a government or military domain.` };
    }
  }

  for (const plane of CLOUD_CONTROL_PLANES) {
    if (host === plane || host.endsWith(`.${plane}`)) {
      return { category: 'cloud-control-plane', reason: `${hostname} is a cloud provider control plane.` };
    }
  }

  for (const [domain, category, reason] of CURATED_REGULATED) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return { category, reason: `${reason}: ${hostname}.` };
    }
  }

  for (const blocked of extraBlocked) {
    const b = blocked.toLowerCase();
    if (host === b || host.endsWith(`.${b}`)) {
      return { category: 'platform-abuse', reason: `${hostname} is on the platform abuse blocklist.` };
    }
  }

  return undefined;
}

/**
 * A soft signal that a target looks regulated. Never blocks by itself — the
 * platform uses it to require human review of the ownership evidence before
 * granting tier 2 (active security testing) on this target.
 */
export function requiresManualReview(hostname: string): DenylistCategory | undefined {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const [pattern, category] of REVIEW_KEYWORDS) {
    if (pattern.test(host)) return category;
  }
  return undefined;
}
