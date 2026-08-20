import { describe, expect, test } from 'vitest';
import { evaluate, isBlocked } from '../src/index';
import { EXPIRED, request, subject, target } from './factories';

const code = (d: ReturnType<typeof evaluate>) => (d.effect === 'deny' ? d.code : undefined);

describe('denylist outranks everything', () => {
  test('a denylisted target is refused even when fully verified and attested', () => {
    const decision = evaluate(request({
      target: target({ denylisted: true, denylistReason: 'Government domain' }),
      policyClass: 'passive',
      environment: 'LOCAL',
    }));

    expect(code(decision)).toBe('DENYLISTED_DOMAIN');
    expect(decision.effect === 'deny' && decision.reason).toContain('Government domain');
  });

  test('falls back to a generic reason when none is recorded', () => {
    const decision = evaluate(request({ target: target({ denylisted: true }) }));
    expect(decision.effect === 'deny' && decision.reason).toContain('denylist');
  });
});

describe('role gate', () => {
  test('a viewer may request passive work', () => {
    expect(evaluate(request({ subject: subject({ roles: ['viewer'] }), policyClass: 'passive' })).effect).toBe('allow');
  });

  test('a viewer may not request mutating work', () => {
    const decision = evaluate(request({ subject: subject({ roles: ['viewer'] }), policyClass: 'mutating' }));
    expect(code(decision)).toBe('INSUFFICIENT_ROLE');
  });

  test('a tester may not request security-active work', () => {
    const decision = evaluate(request({
      subject: subject({ roles: ['tester'] }),
      policyClass: 'security-active',
      environment: 'QA',
    }));
    expect(code(decision)).toBe('INSUFFICIENT_ROLE');
  });

  test('an automation engineer may request security-active work', () => {
    const decision = evaluate(request({
      subject: subject({ roles: ['automation_engineer'] }),
      policyClass: 'security-active',
      environment: 'QA',
    }));
    expect(decision.effect).toBe('allow');
  });

  test('a subject with no roles at all is refused', () => {
    const decision = evaluate(request({ subject: subject({ roles: [] }) }));
    expect(code(decision)).toBe('INSUFFICIENT_ROLE');
    expect(decision.effect === 'deny' && decision.reason).toContain('none');
  });
});

describe('ownership tier', () => {
  test('security-active work in DEV requires at least tier 1', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'DEV',
      target: target({ ownershipTier: 0 }),
    }));

    expect(code(decision)).toBe('OWNERSHIP_REQUIRED');
    expect(decision.effect === 'deny' && decision.remediation).toContain('DNS TXT');
  });

  test('security-active work in QA requires tier 2 and says so', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'QA',
      target: target({ ownershipTier: 1 }),
    }));

    expect(code(decision)).toBe('OWNERSHIP_REQUIRED');
    expect(decision.effect === 'deny' && decision.remediation).toContain('attestation');
  });

  test('expired domain verification is treated as unverified', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'QA',
      target: target({ ownershipExpiresAt: EXPIRED }),
    }));

    expect(code(decision)).toBe('OWNERSHIP_EXPIRED');
  });

  test('an unparseable expiry is treated as expired rather than valid', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'QA',
      target: target({ ownershipExpiresAt: 'not-a-date' }),
    }));

    expect(code(decision)).toBe('OWNERSHIP_EXPIRED');
  });

  test('passive work needs no verification at all', () => {
    const decision = evaluate(request({
      policyClass: 'passive',
      environment: 'QA',
      target: target({ ownershipTier: 0, ownershipExpiresAt: EXPIRED, attestationExpiresAt: undefined }),
    }));

    expect(isBlocked(decision)).toBe(false);
  });
});

describe('attestation', () => {
  test('is required for security-active work in STAGING', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'STAGING',
      target: target({ attestationExpiresAt: undefined }),
    }));

    expect(code(decision)).toBe('ATTESTATION_REQUIRED');
  });

  test('an expired attestation blocks the run', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'STAGING',
      target: target({ attestationExpiresAt: EXPIRED }),
    }));

    expect(code(decision)).toBe('ATTESTATION_EXPIRED');
  });
});

describe('destructive work is confined to data we created', () => {
  test.each(['unknown', 'pre-existing'] as const)('QA destructive work on %s data is denied', (dataLineage) => {
    const decision = evaluate(request({ policyClass: 'destructive', environment: 'QA', dataLineage }));

    expect(code(decision)).toBe('DESTRUCTIVE_ON_FOREIGN_DATA');
  });

  test('QA destructive work on test-created data is allowed', () => {
    const decision = evaluate(request({ policyClass: 'destructive', environment: 'QA', dataLineage: 'test-created' }));
    expect(decision.effect).toBe('allow');
  });

  test('DEV destructive work is unconstrained by lineage', () => {
    const decision = evaluate(request({ policyClass: 'destructive', environment: 'DEV', dataLineage: 'pre-existing' }));
    expect(decision.effect).toBe('allow');
  });
});

describe('production write grant', () => {
  test('mutating PRODUCTION work without the grant is denied', () => {
    const decision = evaluate(request({
      policyClass: 'mutating',
      environment: 'PRODUCTION',
      target: target({ prodWriteGrant: false }),
    }));

    expect(code(decision)).toBe('FORBIDDEN_IN_ENVIRONMENT');
    expect(decision.effect === 'deny' && decision.reason).toContain('production-write grant');
  });

  test('mutating PRODUCTION work with the grant is allowed but throttled', () => {
    const decision = evaluate(request({ policyClass: 'mutating', environment: 'PRODUCTION' }));

    expect(decision.effect).toBe('allow_with_conditions');
    expect(decision.effect === 'allow_with_conditions' && decision.conditions.some((c) => c.kind === 'throttle')).toBe(true);
  });
});

describe('budget', () => {
  test('is refused once the daily allowance is used up', () => {
    const decision = evaluate(request({ budget: { requestsUsedToday: 500, requestsAllowedToday: 500 } }));
    expect(code(decision)).toBe('BUDGET_EXHAUSTED');
  });

  test('is checked before approvals so an over-budget run cannot be approved into existence', () => {
    const decision = evaluate(request({
      policyClass: 'load',
      environment: 'QA',
      budget: { requestsUsedToday: 10, requestsAllowedToday: 10 },
    }));

    expect(code(decision)).toBe('BUDGET_EXHAUSTED');
  });
});

describe('allow conditions', () => {
  test('passive PRODUCTION work is throttled to 1 rps', () => {
    const decision = evaluate(request({ policyClass: 'passive', environment: 'PRODUCTION' }));

    expect(decision.effect).toBe('allow_with_conditions');
    expect(decision.effect === 'allow_with_conditions' && decision.conditions[0]!.value).toBe(1);
  });

  test('an unverified target is restricted to safe methods and a request cap', () => {
    const decision = evaluate(request({
      policyClass: 'passive',
      environment: 'QA',
      target: target({ ownershipTier: 0 }),
    }));

    expect(decision.effect).toBe('allow_with_conditions');
    const kinds = decision.effect === 'allow_with_conditions' ? decision.conditions.map((c) => c.kind) : [];
    expect(kinds).toContain('read-only-methods');
    expect(kinds).toContain('cap-requests');
  });

  test('a verified target in a normal environment allows with no conditions', () => {
    expect(evaluate(request({ policyClass: 'passive', environment: 'QA' })).effect).toBe('allow');
  });
});

describe('isBlocked', () => {
  test('treats denials and pending approvals as blocked', () => {
    expect(isBlocked({ effect: 'deny', code: 'BUDGET_EXHAUSTED', reason: '', remediation: '' })).toBe(true);
    expect(isBlocked({ effect: 'require_approval', approvals: ['project_admin'], reason: '' })).toBe(true);
  });

  test('treats allows as not blocked', () => {
    expect(isBlocked({ effect: 'allow' })).toBe(false);
    expect(isBlocked({ effect: 'allow_with_conditions', conditions: [] })).toBe(false);
  });
});

describe('defaults', () => {
  test('uses the current time when no clock is injected', () => {
    const { now, ...rest } = request();
    expect(evaluate(rest).effect).toBe('allow');
  });
});

describe('an ownership record with no expiry date', () => {
  test('is treated as non-expiring rather than as expired', () => {
    const decision = evaluate(request({
      policyClass: 'security-active',
      environment: 'DEV',
      target: target({ ownershipTier: 1, ownershipExpiresAt: undefined }),
    }));

    expect(decision.effect).toBe('allow');
  });
});
