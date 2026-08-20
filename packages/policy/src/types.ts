import type { EnvName, PolicyClass } from '@wts/dsl';

export type Role =
  | 'viewer'
  | 'tester'
  | 'test_designer'
  | 'automation_engineer'
  | 'project_admin'
  | 'platform_admin';

/**
 * How thoroughly the operator has proven they may test this target.
 * 0 = unverified, 1 = DNS-verified, 2 = DNS-verified plus signed attestation.
 */
export type OwnershipTier = 0 | 1 | 2;

/** Whether the data an action touches was created by us or already existed. */
export type DataLineage = 'test-created' | 'unknown' | 'pre-existing';

export interface PolicySubject {
  uid: string;
  roles: Role[];
  orgId: string;
}

export interface PolicyTarget {
  targetId: string;
  ownershipTier: OwnershipTier;
  /** ISO timestamp; a stale verification is treated as unverified. */
  verifiedAt?: string;
  ownershipExpiresAt?: string;
  attestationExpiresAt?: string;
  origins: string[];
  /** Explicit, separately-granted permission to perform writes in PRODUCTION. */
  prodWriteGrant?: boolean;
  denylisted: boolean;
  denylistReason?: string;
}

export interface PolicyBudget {
  requestsUsedToday: number;
  requestsAllowedToday: number;
}

export interface PolicyRequest {
  subject: PolicySubject;
  target: PolicyTarget;
  environment: EnvName;
  policyClass: PolicyClass;
  dataLineage: DataLineage;
  budget: PolicyBudget;
  /** Evaluation time; injectable so expiry logic is testable. */
  now?: Date;
}

export type ApprovalKind = 'project_admin' | 'platform_admin';

export type DenyCode =
  | 'DENYLISTED_DOMAIN'
  | 'OWNERSHIP_REQUIRED'
  | 'OWNERSHIP_EXPIRED'
  | 'ATTESTATION_REQUIRED'
  | 'ATTESTATION_EXPIRED'
  | 'FORBIDDEN_IN_ENVIRONMENT'
  | 'DESTRUCTIVE_ON_FOREIGN_DATA'
  | 'BUDGET_EXHAUSTED'
  | 'INSUFFICIENT_ROLE';

export interface Condition {
  kind: 'throttle' | 'mask-fields' | 'read-only-methods' | 'cap-requests';
  detail: string;
  value?: number;
}

export type PolicyDecision =
  | { effect: 'allow' }
  | { effect: 'allow_with_conditions'; conditions: Condition[] }
  | { effect: 'require_approval'; approvals: ApprovalKind[]; reason: string }
  | { effect: 'deny'; code: DenyCode; reason: string; remediation: string };

export function isBlocked(d: PolicyDecision): boolean {
  return d.effect === 'deny' || d.effect === 'require_approval';
}
