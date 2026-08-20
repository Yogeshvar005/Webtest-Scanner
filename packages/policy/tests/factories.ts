import type { PolicyRequest, PolicyTarget, PolicySubject } from '../src/index';

export const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';

export function subject(over: Partial<PolicySubject> = {}): PolicySubject {
  return { uid: 'uid_1', orgId: 'org_1', roles: ['platform_admin'], ...over };
}

/** A maximally-permitted target: tier 2, attested, granted, not denylisted. */
export function target(over: Partial<PolicyTarget> = {}): PolicyTarget {
  return {
    targetId: 'tgt_1',
    ownershipTier: 2,
    verifiedAt: PAST,
    ownershipExpiresAt: FUTURE,
    attestationExpiresAt: FUTURE,
    origins: ['https://app.example.com'],
    prodWriteGrant: true,
    denylisted: false,
    ...over,
  };
}

export function request(over: Partial<PolicyRequest> = {}): PolicyRequest {
  return {
    subject: subject(),
    target: target(),
    environment: 'QA',
    policyClass: 'passive',
    dataLineage: 'test-created',
    budget: { requestsUsedToday: 0, requestsAllowedToday: 1000 },
    now: FIXED_NOW,
    ...over,
  };
}

export const EXPIRED = PAST;
