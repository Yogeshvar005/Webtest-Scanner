import type { OwnershipTier } from '@wts/policy';

/** What a target may be subjected to at each proven-ownership tier. */
export interface TierCapabilities {
  tier: OwnershipTier;
  label: string;
  maxRequestsPerSecond: number;
  maxRequestsPerRun: number;
  allowedHttpMethods: string[];
  honorRobotsTxt: boolean;
  allowAuthentication: boolean;
  allowFormSubmission: boolean;
  allowActiveSecurityProbes: boolean;
  description: string;
}

export const TIERS: Record<OwnershipTier, TierCapabilities> = {
  0: {
    tier: 0,
    label: 'Unverified',
    maxRequestsPerSecond: 1,
    maxRequestsPerRun: 200,
    allowedHttpMethods: ['GET', 'HEAD'],
    honorRobotsTxt: true,
    allowAuthentication: false,
    allowFormSubmission: false,
    allowActiveSecurityProbes: false,
    description:
      'Observation only: screenshots, accessibility audit, rendering checks, and passive inspection of response headers, cookies and TLS.',
  },
  1: {
    tier: 1,
    label: 'Domain verified',
    maxRequestsPerSecond: 5,
    maxRequestsPerRun: 5_000,
    allowedHttpMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    honorRobotsTxt: false,
    allowAuthentication: true,
    allowFormSubmission: true,
    allowActiveSecurityProbes: false,
    description:
      'Full functional testing: forms, CRUD workflows, authenticated journeys, API tests, mocks and the compatibility matrix.',
  },
  2: {
    tier: 2,
    label: 'Verified and attested',
    maxRequestsPerSecond: 10,
    maxRequestsPerRun: 20_000,
    allowedHttpMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    honorRobotsTxt: false,
    allowAuthentication: true,
    allowFormSubmission: true,
    allowActiveSecurityProbes: true,
    description:
      'Everything in tier 1 plus active security testing: injection payload probing, the authorization matrix, IDOR checks, session probes and rate-limit behaviour.',
  },
};

export function capabilitiesFor(tier: OwnershipTier): TierCapabilities {
  return TIERS[tier];
}

/** Whether a tier permits an HTTP method at all. */
export function methodAllowed(tier: OwnershipTier, method: string): boolean {
  return TIERS[tier].allowedHttpMethods.includes(method.toUpperCase());
}

/**
 * Resolves the effective tier at evaluation time. Verification and attestation
 * both expire, and an expired proof degrades the target rather than failing
 * open — a lapsed attestation drops tier 2 to tier 1, not to tier 2.
 */
export function effectiveTier(
  recorded: OwnershipTier,
  opts: { ownershipExpiresAt?: string; attestationExpiresAt?: string; now?: Date } = {},
): OwnershipTier {
  const now = opts.now ?? new Date();
  const expired = (iso: string | undefined): boolean => {
    if (iso === undefined) return false;
    const at = Date.parse(iso);
    return Number.isNaN(at) || at <= now.getTime();
  };

  if (recorded === 0) return 0;
  if (expired(opts.ownershipExpiresAt)) return 0;
  if (recorded === 2 && expired(opts.attestationExpiresAt)) return 1;
  return recorded;
}
