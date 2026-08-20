import { describe, expect, test } from 'vitest';
import { Action, Scenario, ValueExpr, WaitCondition, describeTarget, scenarioJsonSchema } from '../src/index';
import { scenario, step, target } from './factories';

describe('Scenario schema', () => {
  test('parses a well-formed scenario', () => {
    expect(Scenario.safeParse(scenario()).success).toBe(true);
  });

  test('requires at least one step', () => {
    expect(Scenario.safeParse(scenario({ steps: [] })).success).toBe(false);
  });

  test('caps steps at 200 to stay inside the Firestore document limit', () => {
    const steps = Array.from({ length: 201 }, (_, i) => step({ id: `s${i}`, index: i }));
    expect(Scenario.safeParse(scenario({ steps })).success).toBe(false);
  });

  test('rejects an unknown schemaVersion', () => {
    expect(Scenario.safeParse({ ...scenario(), schemaVersion: '2.0' }).success).toBe(false);
  });

  test('applies documented defaults', () => {
    const parsed = Scenario.parse({
      schemaVersion: '1.0',
      id: 'sc_1',
      version: 1,
      title: 'Minimal',
      testTypes: ['functional'],
      targetId: 'tgt_1',
      environment: 'QA',
      steps: [{
        id: 's0',
        index: 0,
        intent: 'Open home',
        action: { type: 'navigate', path: '/' },
        provenance: { source: 'tester', confidence: 1 },
      }],
      lifecycle: 'draft',
      policyClass: 'passive',
      provenance: { source: 'tester', confidence: 1 },
    });

    expect(parsed.priority).toBe('P2');
    expect(parsed.steps[0]!.riskTags).toEqual(['read-only']);
    expect(parsed.steps[0]!.evidence.screenshot).toBe('always');
    expect(parsed.steps[0]!.evidence.domSnapshot).toBe('on-failure');
    expect(parsed.cleanup.runOnFailure).toBe(true);
  });
});

describe('the action vocabulary has no escape hatch', () => {
  // These are the primitives that would let an injected instruction break out
  // of the DSL. Their absence is the containment boundary, so assert it.
  test.each([
    ['evaluateJs', { type: 'evaluateJs', script: 'fetch("https://evil.example")' }],
    ['rawSelector', { type: 'rawSelector', selector: '#x', op: 'click' }],
    ['shellCommand', { type: 'shellCommand', command: 'curl evil.example' }],
    ['eval', { type: 'eval', code: '1+1' }],
    ['sleep', { type: 'sleep', ms: 10_000 }],
    ['setCookie', { type: 'setCookie', name: 'session', value: 'stolen' }],
  ])('rejects a %s action', (_label, action) => {
    expect(Action.safeParse(action).success).toBe(false);
  });

  test('navigate carries a path and an origin reference, never a bare URL field', () => {
    const parsed = Action.parse({ type: 'navigate', path: '/dashboard' });
    expect(parsed).toEqual({ type: 'navigate', path: '/dashboard', originRef: 'primary' });
    expect('url' in parsed).toBe(false);
  });

  test('rejects unknown keys smuggled alongside a valid action', () => {
    const result = Action.safeParse({ type: 'click', target: target(), script: 'alert(1)' });
    // Zod strips unknown keys rather than failing; assert the smuggled key is gone.
    expect(result.success).toBe(true);
    expect(result.success && 'script' in result.data).toBe(false);
  });
});

describe('WaitCondition', () => {
  test('has no sleep variant — point 19 is enforced by omission', () => {
    expect(WaitCondition.safeParse({ type: 'sleep', ms: 5000 }).success).toBe(false);
  });

  test('accepts condition-based waits', () => {
    expect(WaitCondition.safeParse({ type: 'networkQuiescent' }).success).toBe(true);
    expect(WaitCondition.safeParse({ type: 'domStable' }).success).toBe(true);
    expect(WaitCondition.safeParse({ type: 'navigationComplete' }).success).toBe(true);
  });
});

describe('ValueExpr', () => {
  test('a secret reference carries a name but never a value', () => {
    const parsed = ValueExpr.parse({ kind: 'secret', name: 'ADMIN_PASSWORD', value: 'hunter2' });
    expect(parsed).toEqual({ kind: 'secret', name: 'ADMIN_PASSWORD' });
    expect('value' in parsed).toBe(false);
  });

  test('rejects a lowercase secret name', () => {
    expect(ValueExpr.safeParse({ kind: 'secret', name: 'admin_password' }).success).toBe(false);
  });

  test('rejects a faker token that is not a random.* path', () => {
    expect(ValueExpr.safeParse({ kind: 'faker', token: 'process.env.HOME' }).success).toBe(false);
    expect(ValueExpr.safeParse({ kind: 'faker', token: 'random.email' }).success).toBe(true);
  });
});

describe('describeTarget', () => {
  test('names a target by role and accessible name', () => {
    expect(describeTarget(target({ role: 'button', name: 'Login' }))).toBe('button "Login"');
  });

  test('falls back to label then placeholder', () => {
    expect(describeTarget(target({ role: 'textbox', name: undefined, labelText: 'Username' }))).toBe('textbox labelled "Username"');
    expect(describeTarget(target({ role: 'textbox', name: undefined, placeholder: 'Search…' }))).toBe('textbox placeholder "Search…"');
  });

  test('describes scoping and index', () => {
    const inner = target({ role: 'row', name: 'John' });
    expect(describeTarget(target({ role: 'button', name: 'Delete', nth: 2, within: inner }))).toBe('button "Delete" #2 within row "John"');
  });
});

describe('scenarioJsonSchema', () => {
  test('produces a JSON Schema usable as a Claude tool input_schema', () => {
    const schema = scenarioJsonSchema();
    expect(schema).toHaveProperty('type', 'object');
    expect(schema).toHaveProperty('properties.steps');
    // $refStrategy 'none' — the Anthropic tool schema must be self-contained.
    expect(JSON.stringify(schema)).not.toContain('$ref');
  });
});
