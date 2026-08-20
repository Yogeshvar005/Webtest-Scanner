import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TXT_RECORD_PREFIX = 'webtest-scanner-site-verification=';
export const TXT_RECORD_NAME = '_webtest-scanner';

export interface OwnershipChallenge {
  apexDomain: string;
  orgId: string;
  nonce: string;
  recordName: string;
  recordValue: string;
  createdAt: string;
  expiresAt: string;
}

/** Challenge tokens stay valid for 30 days while the operator arranges DNS. */
const CHALLENGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(orgId: string, apexDomain: string, nonce: string, key: string): string {
  return createHmac('sha256', key)
    .update(`${orgId}|${apexDomain}|${nonce}`)
    .digest('base64url');
}

/**
 * Mints a domain-ownership challenge.
 *
 * The token is bound to the organisation as well as the domain, so one
 * customer cannot reuse another customer's published proof to claim a domain
 * they do not control.
 */
export function createChallenge(
  apexDomain: string,
  orgId: string,
  serverKey: string,
  now: Date = new Date(),
): OwnershipChallenge {
  const nonce = randomBytes(16).toString('base64url');
  const domain = apexDomain.toLowerCase().replace(/\.$/, '');

  return {
    apexDomain: domain,
    orgId,
    nonce,
    recordName: `${TXT_RECORD_NAME}.${domain}`,
    recordValue: `${TXT_RECORD_PREFIX}${sign(orgId, domain, nonce, serverKey)}`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
  };
}

/** Constant-time comparison so token verification cannot be probed by timing. */
export function tokenMatches(expected: string, observed: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(observed);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function challengeExpired(challenge: OwnershipChallenge, now: Date = new Date()): boolean {
  return Date.parse(challenge.expiresAt) <= now.getTime();
}
