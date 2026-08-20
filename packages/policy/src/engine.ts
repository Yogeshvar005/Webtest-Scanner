import { cellFor, MINIMUM_ROLE, type MatrixCell } from './rules/environment';
import type {
  Condition, DenyCode, PolicyDecision, PolicyRequest, PolicyTarget,
} from './types';

function deny(code: DenyCode, reason: string, remediation: string): PolicyDecision {
  return { effect: 'deny', code, reason, remediation };
}

function isExpired(iso: string | undefined, now: Date): boolean {
  if (iso === undefined) return false;
  const at = Date.parse(iso);
  return Number.isNaN(at) || at <= now.getTime();
}

/** Ownership must be both high enough and still current. */
function checkOwnership(cell: MatrixCell, target: PolicyTarget, now: Date): PolicyDecision | undefined {
  const required = cell.minTier ?? 0;

  if (required > 0 && isExpired(target.ownershipExpiresAt, now)) {
    return deny(
      'OWNERSHIP_EXPIRED',
      `Domain verification for ${target.targetId} has expired.`,
      'Re-verify the domain by republishing the DNS TXT record, then retry.',
    );
  }

  if (target.ownershipTier < required) {
    return deny(
      'OWNERSHIP_REQUIRED',
      `This action requires ownership tier ${required}; the target is tier ${target.ownershipTier}.`,
      required === 1
        ? 'Verify you control this domain by publishing the DNS TXT record shown on the target page.'
        : 'Verify the domain via DNS TXT and have a Project Admin sign the authorization attestation.',
    );
  }

  if (cell.requireAttestation) {
    if (target.attestationExpiresAt === undefined) {
      return deny(
        'ATTESTATION_REQUIRED',
        'This action requires a signed authorization attestation, which is not on file.',
        'Ask a Project Admin to complete the authorization attestation for this target.',
      );
    }
    if (isExpired(target.attestationExpiresAt, now)) {
      return deny(
        'ATTESTATION_EXPIRED',
        'The authorization attestation for this target has expired.',
        'Ask a Project Admin to renew the authorization attestation.',
      );
    }
  }

  return undefined;
}

/**
 * The single authorization decision point for the platform.
 *
 * Evaluated three times for every run: when a scenario is authored, when a run
 * is dispatched, and again inside the worker immediately before each action
 * fires. The worker re-evaluates rather than trusting the web tier, so a
 * compromised or buggy front end cannot widen what actually executes.
 */
export function evaluate(request: PolicyRequest): PolicyDecision {
  const { subject, target, environment, policyClass, dataLineage, budget } = request;
  const now = request.now ?? new Date();

  // 1. The denylist outranks every other signal, including proven ownership.
  //    A verified government or critical-infrastructure domain is still refused.
  if (target.denylisted) {
    return deny(
      'DENYLISTED_DOMAIN',
      target.denylistReason ?? `${target.targetId} is on the platform denylist.`,
      'This category of target cannot be tested through this platform. Contact the platform administrator.',
    );
  }

  // 2. Role gate.
  const permitted = MINIMUM_ROLE[policyClass];
  if (!subject.roles.some((r) => permitted.includes(r))) {
    return deny(
      'INSUFFICIENT_ROLE',
      `Role(s) [${subject.roles.join(', ') || 'none'}] may not request ${policyClass} work.`,
      `This action requires one of: ${permitted.join(', ')}.`,
    );
  }

  // 3. Environment matrix.
  const cell = cellFor(policyClass, environment);
  if (cell.base === 'deny') {
    return deny(
      'FORBIDDEN_IN_ENVIRONMENT',
      `${policyClass} testing is never permitted against ${environment}.`,
      environment === 'PRODUCTION'
        ? 'Run this scenario against a non-production environment instead.'
        : 'Choose a lower environment, or reclassify the scenario.',
    );
  }

  // 4. Ownership, attestation and expiry.
  const ownershipFailure = checkOwnership(cell, target, now);
  if (ownershipFailure) return ownershipFailure;

  // 5. Destructive work may only touch data this platform created.
  if (cell.requireTestCreatedData && dataLineage !== 'test-created') {
    return deny(
      'DESTRUCTIVE_ON_FOREIGN_DATA',
      `Destructive actions in ${environment} are limited to records this platform created; this scenario targets ${dataLineage} data.`,
      'Have the scenario create its own fixture data and delete only that, or run in DEV/LOCAL.',
    );
  }

  // 6. Production writes need a separate explicit grant.
  if (cell.requireProdWriteGrant && target.prodWriteGrant !== true) {
    return deny(
      'FORBIDDEN_IN_ENVIRONMENT',
      'Writing to PRODUCTION requires an explicit per-target production-write grant.',
      'A Platform Admin must enable the production-write grant for this target.',
    );
  }

  // 7. Budget.
  if (budget.requestsUsedToday >= budget.requestsAllowedToday) {
    return deny(
      'BUDGET_EXHAUSTED',
      `Daily request budget exhausted (${budget.requestsUsedToday}/${budget.requestsAllowedToday}).`,
      'Wait for the budget to reset, or ask a Project Admin to raise it.',
    );
  }

  // 8. Approvals.
  if (cell.base === 'approval') {
    return {
      effect: 'require_approval',
      approvals: ['project_admin'],
      reason: `${policyClass} testing against ${environment} requires human approval before it runs.`,
    };
  }

  // 9. Allow, attaching any conditions the cell demands.
  const conditions: Condition[] = [];
  if (cell.throttleRps !== undefined) {
    conditions.push({
      kind: 'throttle',
      detail: `Limit requests to ${cell.throttleRps}/s against ${environment}.`,
      value: cell.throttleRps,
    });
  }
  if (target.ownershipTier === 0) {
    conditions.push({ kind: 'read-only-methods', detail: 'Unverified target: only safe (GET/HEAD) methods are permitted.' });
    conditions.push({ kind: 'cap-requests', detail: 'Unverified target: capped at 200 requests per run.', value: 200 });
  }

  return conditions.length > 0 ? { effect: 'allow_with_conditions', conditions } : { effect: 'allow' };
}
