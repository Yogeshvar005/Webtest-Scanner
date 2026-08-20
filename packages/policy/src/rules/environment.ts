import type { EnvName, PolicyClass } from '@wts/dsl';
import type { OwnershipTier } from '../types';

/**
 * A single cell of the environment x policy-class matrix. Expressed as data so
 * the whole matrix is table-testable and can be tightened per project without
 * touching engine logic.
 */
export interface MatrixCell {
  base: 'allow' | 'approval' | 'deny';
  /** Minimum proven-ownership tier required. */
  minTier?: OwnershipTier;
  /** Requires a signed authorization attestation on top of the tier. */
  requireAttestation?: boolean;
  /** Destructive work is only allowed against data this platform created. */
  requireTestCreatedData?: boolean;
  /** Requests per second ceiling applied as an allow-condition. */
  throttleRps?: number;
  /** PRODUCTION writes additionally need an explicit per-target grant. */
  requireProdWriteGrant?: boolean;
}

const ALLOW: MatrixCell = { base: 'allow' };
const APPROVAL: MatrixCell = { base: 'approval' };
const DENY: MatrixCell = { base: 'deny' };

/**
 * Deny-by-default authorization matrix (spec points 13 and 31).
 *
 * The bottom-right of this table is the part that matters: nothing
 * destructive, security-active, or load-generating may ever run against
 * PRODUCTION, regardless of how well the domain is verified.
 */
export const ENVIRONMENT_MATRIX: Record<PolicyClass, Record<EnvName, MatrixCell>> = {
  passive: {
    LOCAL: ALLOW,
    DEV: ALLOW,
    QA: ALLOW,
    UAT: ALLOW,
    STAGING: ALLOW,
    PRODUCTION: { base: 'allow', throttleRps: 1 },
  },
  mutating: {
    LOCAL: ALLOW,
    DEV: ALLOW,
    QA: ALLOW,
    UAT: APPROVAL,
    STAGING: APPROVAL,
    PRODUCTION: { base: 'allow', minTier: 2, requireAttestation: true, requireProdWriteGrant: true, throttleRps: 1 },
  },
  destructive: {
    LOCAL: ALLOW,
    DEV: ALLOW,
    QA: { base: 'allow', requireTestCreatedData: true },
    UAT: { base: 'approval', requireTestCreatedData: true },
    STAGING: { base: 'approval', requireTestCreatedData: true },
    PRODUCTION: DENY,
  },
  'security-active': {
    LOCAL: ALLOW,
    DEV: { base: 'allow', minTier: 1 },
    QA: { base: 'allow', minTier: 2 },
    UAT: { base: 'allow', minTier: 2, requireAttestation: true },
    STAGING: { base: 'allow', minTier: 2, requireAttestation: true },
    PRODUCTION: DENY,
  },
  load: {
    LOCAL: ALLOW,
    DEV: APPROVAL,
    QA: APPROVAL,
    UAT: DENY,
    STAGING: DENY,
    PRODUCTION: DENY,
  },
};

export function cellFor(policyClass: PolicyClass, environment: EnvName): MatrixCell {
  return ENVIRONMENT_MATRIX[policyClass][environment];
}

/** Minimum role permitted to request each class of work. */
export const MINIMUM_ROLE: Record<PolicyClass, string[]> = {
  passive: ['viewer', 'tester', 'test_designer', 'automation_engineer', 'project_admin', 'platform_admin'],
  mutating: ['tester', 'test_designer', 'automation_engineer', 'project_admin', 'platform_admin'],
  destructive: ['test_designer', 'automation_engineer', 'project_admin', 'platform_admin'],
  'security-active': ['automation_engineer', 'project_admin', 'platform_admin'],
  load: ['automation_engineer', 'project_admin', 'platform_admin'],
};
