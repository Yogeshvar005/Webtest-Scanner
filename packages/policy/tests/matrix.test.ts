import { describe, expect, test } from 'vitest';
import type { EnvName, PolicyClass } from '@wts/dsl';
import { evaluate } from '../src/index';
import { request } from './factories';

type Effect = 'allow' | 'approval' | 'deny';

/**
 * The expected effect for every environment x policy-class pair, given a fully
 * privileged subject and a fully verified, attested, production-granted target.
 * Written out longhand rather than derived from ENVIRONMENT_MATRIX so this is
 * an independent check of the policy rather than a restatement of it.
 */
const EXPECTED: Record<PolicyClass, Record<EnvName, Effect>> = {
  passive: {
    LOCAL: 'allow', DEV: 'allow', QA: 'allow', UAT: 'allow', STAGING: 'allow', PRODUCTION: 'allow',
  },
  mutating: {
    LOCAL: 'allow', DEV: 'allow', QA: 'allow', UAT: 'approval', STAGING: 'approval', PRODUCTION: 'allow',
  },
  destructive: {
    LOCAL: 'allow', DEV: 'allow', QA: 'allow', UAT: 'approval', STAGING: 'approval', PRODUCTION: 'deny',
  },
  'security-active': {
    LOCAL: 'allow', DEV: 'allow', QA: 'allow', UAT: 'allow', STAGING: 'allow', PRODUCTION: 'deny',
  },
  load: {
    LOCAL: 'allow', DEV: 'approval', QA: 'approval', UAT: 'deny', STAGING: 'deny', PRODUCTION: 'deny',
  },
};

const CLASSES: PolicyClass[] = ['passive', 'mutating', 'destructive', 'security-active', 'load'];
const ENVS: EnvName[] = ['LOCAL', 'DEV', 'QA', 'UAT', 'STAGING', 'PRODUCTION'];

const cases = CLASSES.flatMap((policyClass) =>
  ENVS.map((environment) => ({ policyClass, environment, expected: EXPECTED[policyClass][environment] })),
);

describe('environment x policy-class matrix (fully authorized subject and target)', () => {
  test.each(cases)('$policyClass against $environment -> $expected', ({ policyClass, environment, expected }) => {
    const decision = evaluate(request({ policyClass, environment }));

    const actual: Effect =
      decision.effect === 'deny' ? 'deny' : decision.effect === 'require_approval' ? 'approval' : 'allow';

    expect(actual).toBe(expected);
  });

  test('covers every combination', () => {
    expect(cases).toHaveLength(30);
  });
});

describe('production is absolutely protected for dangerous classes', () => {
  test.each(['destructive', 'security-active', 'load'] as PolicyClass[])(
    '%s against PRODUCTION is denied even for a platform admin on a tier-2 attested target',
    (policyClass) => {
      const decision = evaluate(request({ policyClass, environment: 'PRODUCTION' }));

      expect(decision.effect).toBe('deny');
      expect(decision.effect === 'deny' && decision.code).toBe('FORBIDDEN_IN_ENVIRONMENT');
    },
  );
});
