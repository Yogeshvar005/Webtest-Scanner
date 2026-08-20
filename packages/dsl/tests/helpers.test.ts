import { describe, expect, test } from 'vitest';
import { actionTargets, actionValues, allSteps, isHeuristic, walkTarget, type Assertion } from '../src/index';
import { apiReq, scenario, step, target, testerOrigin } from './factories';

describe('actionTargets', () => {
  test('returns the direct target of an interaction', () => {
    const t = target();
    expect(actionTargets({ type: 'click', target: t })).toEqual([t]);
  });

  test('returns the scope of an accessibility audit', () => {
    const t = target({ role: 'region' });
    expect(actionTargets({ type: 'a11yAudit', scope: t, ruleset: 'wcag21aa' })).toEqual([t]);
  });

  test('returns the target of a security probe', () => {
    const t = target({ role: 'textbox' });
    expect(actionTargets({ type: 'securityProbe', probe: { probe: 'inputValidation', target: t, maxRequests: 5 } })).toEqual([t]);
  });

  test('returns the target nested inside a wait condition', () => {
    const t = target();
    expect(actionTargets({ type: 'waitFor', condition: { type: 'elementVisible', target: t, timeoutMs: 1000 } })).toEqual([t]);
  });

  test('returns nothing for actions that address no element', () => {
    expect(actionTargets({ type: 'navigate', path: '/', originRef: 'primary' })).toEqual([]);
    expect(actionTargets({ type: 'press', keys: 'Enter' })).toEqual([]);
    expect(actionTargets({ type: 'a11yAudit', ruleset: 'wcag21aa' })).toEqual([]);
    expect(actionTargets({ type: 'securityProbe', probe: { probe: 'tlsConfig', maxRequests: 1 } })).toEqual([]);
    expect(actionTargets({ type: 'waitFor', condition: { type: 'navigationComplete' } })).toEqual([]);
  });
});

describe('actionValues', () => {
  test('returns the value of a fill', () => {
    expect(actionValues({ type: 'fill', target: target(), value: { kind: 'literal', value: 'x' } })).toEqual([{ kind: 'literal', value: 'x' }]);
  });

  test('returns header and query values of an API request', () => {
    const values = actionValues({
      type: 'apiRequest',
      request: {
        ...apiReq('GET'),
        headers: { 'X-Trace': { kind: 'literal', value: 'abc' } },
        query: { page: { kind: 'literal', value: 2 } },
      },
      saveAs: 'r',
    });

    expect(values).toHaveLength(2);
  });

  test('returns nothing for valueless actions', () => {
    expect(actionValues({ type: 'click', target: target() })).toEqual([]);
  });
});

describe('walkTarget', () => {
  test('yields the target and each of its scoping ancestors', () => {
    const outer = target({ role: 'table', name: 'Customers' });
    const middle = target({ role: 'row', name: 'John', within: outer });
    const inner = target({ role: 'button', name: 'Delete', within: middle });

    expect([...walkTarget(inner)].map((t) => t.role)).toEqual(['button', 'row', 'table']);
  });
});

describe('allSteps', () => {
  test('returns setup, main and cleanup steps in execution order', () => {
    const s = scenario({
      setup: [step({ id: 's0', index: 0, intent: 'setup' })],
      steps: [step({ id: 's1', index: 1, intent: 'main' })],
      cleanup: { strategy: 'best-effort', runOnFailure: true, lineageReaper: [], steps: [step({ id: 's2', index: 2, intent: 'cleanup' })] },
    });

    expect(allSteps(s).map((x) => x.intent)).toEqual(['setup', 'main', 'cleanup']);
  });
});

describe('isHeuristic', () => {
  const assertion = (type: string): Assertion =>
    ({ type, origin: testerOrigin, severity: 'medium' }) as unknown as Assertion;

  test('flags layout checks that produce false positives on real sites', () => {
    expect(isHeuristic(assertion('noOverlappingElements'))).toBe(true);
    expect(isHeuristic(assertion('noBrokenImages'))).toBe(true);
  });

  test('does not flag deterministic assertions', () => {
    expect(isHeuristic(assertion('httpStatus'))).toBe(false);
    expect(isHeuristic(assertion('elementVisible'))).toBe(false);
  });
});
