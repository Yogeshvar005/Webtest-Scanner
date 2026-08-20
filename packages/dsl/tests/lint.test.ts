import { describe, expect, test } from 'vitest';
import { hasBlockingIssues, lintScenario } from '../src/index';
import { apiReq, ctx, fixture, scenario, step, target, testerOrigin } from './factories';

const rules = (issues: ReturnType<typeof lintScenario>) => issues.map((i) => i.rule);

describe('no-literal-secrets', () => {
  test('rejects a literal filled into a password field', () => {
    const s = scenario({
      steps: [step({
        action: { type: 'fill', target: target({ role: 'password', name: 'Password' }), value: { kind: 'literal', value: 'hunter2' } },
      })],
    });

    expect(rules(lintScenario(s, ctx))).toContain('no-literal-secrets');
  });

  test('rejects a literal filled into a field whose label mentions a token', () => {
    const s = scenario({
      steps: [step({
        action: { type: 'fill', target: target({ role: 'textbox', name: 'API Token' }), value: { kind: 'literal', value: 'abc123' } },
      })],
    });

    expect(rules(lintScenario(s, ctx))).toContain('no-literal-secrets');
  });

  test('accepts a secret reference in a password field', () => {
    const s = scenario({
      steps: [step({
        action: { type: 'fill', target: target({ role: 'password', name: 'Password' }), value: { kind: 'secret', name: 'ADMIN_PASSWORD' } },
      })],
    });

    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test.each([
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc'],
    ['AWS key', 'AKIAIOSFODNN7EXAMPLE'],
    ['Anthropic key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456'],
    ['OpenAI key', 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH'],
    ['Google key', 'AIzaSyA1234567890abcdefghijklmnopqrstuv'],
    ['GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['private key', '-----BEGIN RSA PRIVATE KEY-----'],
  ])('rejects a %s shape in an ordinary text field', (_label, value) => {
    const s = scenario({
      steps: [step({
        action: { type: 'fill', target: target({ role: 'textbox', name: 'Notes' }), value: { kind: 'literal', value } },
      })],
    });

    expect(rules(lintScenario(s, ctx))).toContain('no-literal-secrets');
  });

  test('ignores non-string literals and ordinary text', () => {
    const s = scenario({
      steps: [step({
        action: { type: 'fill', target: target({ role: 'textbox', name: 'Quantity' }), value: { kind: 'literal', value: 3 } },
      })],
    });

    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test('scans apiRequest headers for credential shapes', () => {
    const s = scenario({
      steps: [step({
        intent: 'Call API',
        action: {
          type: 'apiRequest',
          request: { ...apiReq('GET'), headers: { Authorization: { kind: 'literal', value: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' } } },
          saveAs: 'resp',
        },
      })],
    });

    expect(rules(lintScenario(s, ctx))).toContain('no-literal-secrets');
  });
});

describe('no-ai-css-fallback', () => {
  const withFallback = (origin: typeof testerOrigin) =>
    scenario({ steps: [step({ action: { type: 'click', target: target({ origin, hints: { cssFallback: '#submitBtn' } }) } })] });

  test('rejects a CSS fallback authored by the model', () => {
    const s = withFallback({ source: 'generated', confidence: 0.9 });
    expect(rules(lintScenario(s, ctx))).toContain('no-ai-css-fallback');
  });

  test('rejects a healed CSS fallback that no human approved', () => {
    const s = withFallback({ source: 'healed', confidence: 0.94 });
    expect(rules(lintScenario(s, ctx))).toContain('no-ai-css-fallback');
  });

  test('accepts a healed CSS fallback a human approved', () => {
    const s = withFallback({
      source: 'healed',
      confidence: 0.94,
      approvedBy: 'uid_123',
      approvedAt: '2026-08-20T10:00:00.000Z',
    });
    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test('inspects nested `within` targets', () => {
    const inner = target({ role: 'row', name: 'John', origin: { source: 'generated', confidence: 0.8 }, hints: { cssFallback: 'tr:nth-child(5)' } });
    const s = scenario({ steps: [step({ action: { type: 'click', target: target({ within: inner }) } })] });

    expect(rules(lintScenario(s, ctx))).toContain('no-ai-css-fallback');
  });
});

describe('origin-allowlist', () => {
  test('rejects an unknown originRef', () => {
    const s = scenario({ steps: [step({ action: { type: 'navigate', path: '/dashboard', originRef: 'evil' } })] });
    expect(rules(lintScenario(s, ctx))).toContain('origin-allowlist');
  });

  test.each([
    ['absolute http URL', 'https://evil.example/steal'],
    ['protocol-relative URL', '//evil.example/steal'],
    ['javascript scheme', 'javascript://evil'],
  ])('rejects %s in navigate.path', (_label, path) => {
    const s = scenario({ steps: [step({ action: { type: 'navigate', path, originRef: 'primary' } })] });
    expect(rules(lintScenario(s, ctx))).toContain('origin-allowlist');
  });

  test('accepts a relative path against a known origin', () => {
    const s = scenario({ steps: [step({ action: { type: 'navigate', path: '/dashboard', originRef: 'primary' } })] });
    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test('rejects an unknown API hostRef', () => {
    const s = scenario({
      steps: [step({ action: { type: 'apiRequest', request: { ...apiReq('GET'), hostRef: 'attacker' }, saveAs: 'r' } })],
    });
    expect(rules(lintScenario(s, ctx))).toContain('origin-allowlist');
  });
});

describe('risk-tags-consistent', () => {
  test('rejects a DELETE request not tagged destructive', () => {
    const s = scenario({
      policyClass: 'mutating',
      steps: [step({ intent: 'Remove record', action: { type: 'apiRequest', request: apiReq('DELETE'), saveAs: 'r' }, riskTags: ['mutating'] })],
    });
    expect(rules(lintScenario(s, ctx))).toContain('risk-tags-consistent');
  });

  test('rejects a click on a Delete button not tagged destructive', () => {
    const s = scenario({
      policyClass: 'mutating',
      steps: [step({ intent: 'Press it', action: { type: 'click', target: target({ name: 'Delete customer' }) }, riskTags: ['mutating'] })],
    });
    expect(rules(lintScenario(s, ctx))).toContain('risk-tags-consistent');
  });

  test('accepts a DELETE correctly tagged destructive', () => {
    const s = scenario({
      policyClass: 'destructive',
      steps: [step({ intent: 'Delete record', action: { type: 'apiRequest', request: apiReq('DELETE'), saveAs: 'r' }, riskTags: ['destructive'] })],
    });
    expect(rules(lintScenario(s, ctx))).not.toContain('risk-tags-consistent');
  });

  test('rejects a security probe not tagged security-active', () => {
    const s = scenario({
      policyClass: 'security-active',
      steps: [step({
        intent: 'Check headers',
        action: { type: 'securityProbe', probe: { probe: 'securityHeaders', maxRequests: 5 } },
        riskTags: ['read-only'],
      })],
    });
    expect(rules(lintScenario(s, ctx))).toContain('risk-tags-consistent');
  });
});

describe('resolvable-refs', () => {
  test('rejects a variable used before it is extracted', () => {
    const s = scenario({
      steps: [step({ action: { type: 'fill', target: target({ role: 'textbox' }), value: { kind: 'variable', name: 'orderId' } } })],
    });
    expect(rules(lintScenario(s, ctx))).toContain('resolvable-refs');
  });

  test('accepts a variable extracted by an earlier step', () => {
    const s = scenario({
      steps: [
        step({ id: 's1', index: 0, action: { type: 'extract', target: target({ role: 'cell' }), as: 'orderId', from: 'text' } }),
        step({ id: 's2', index: 1, action: { type: 'fill', target: target({ role: 'textbox' }), value: { kind: 'variable', name: 'orderId' } } }),
      ],
    });
    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test('accepts a variable saved by an earlier apiRequest', () => {
    const s = scenario({
      steps: [
        step({ id: 's1', index: 0, action: { type: 'apiRequest', request: apiReq('GET'), saveAs: 'resp' } }),
        step({ id: 's2', index: 1, action: { type: 'fill', target: target({ role: 'textbox' }), value: { kind: 'variable', name: 'resp' } } }),
      ],
    });
    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test('rejects an unknown fixture reference', () => {
    const s = scenario({
      steps: [step({ action: { type: 'fill', target: target({ role: 'textbox' }), value: { kind: 'dataset', fixtureRef: 'ghost', field: 'name' } } })],
    });
    expect(rules(lintScenario(s, ctx))).toContain('resolvable-refs');
  });

  test('rejects an unknown credential profile when profiles are known', () => {
    const s = scenario({ steps: [step({ action: { type: 'switchIdentity', credentialProfileRef: 'nobody' } })] });
    expect(rules(lintScenario(s, { ...ctx, knownCredentialProfiles: ['admin'] }))).toContain('resolvable-refs');
  });

  test('skips credential checks when the profile list is not supplied', () => {
    const s = scenario({ steps: [step({ action: { type: 'switchIdentity', credentialProfileRef: 'anything' } })] });
    expect(lintScenario(s, ctx)).toHaveLength(0);
  });
});

describe('acyclic-fixtures', () => {
  test('rejects a dependency cycle', () => {
    const s = scenario({
      fixtures: [
        fixture({ ref: 'a', dependsOn: ['b'] }),
        fixture({ ref: 'b', dependsOn: ['a'] }),
      ],
    });
    expect(rules(lintScenario(s, ctx))).toContain('acyclic-fixtures');
  });

  test('rejects a dependency on a fixture that does not exist', () => {
    const s = scenario({ fixtures: [fixture({ ref: 'order', dependsOn: ['ghost'] })] });
    expect(rules(lintScenario(s, ctx))).toContain('acyclic-fixtures');
  });

  test('accepts a valid dependency chain', () => {
    const s = scenario({
      fixtures: [
        fixture({ ref: 'address' }),
        fixture({ ref: 'customer', dependsOn: ['address'] }),
        fixture({ ref: 'order', dependsOn: ['customer'] }),
      ],
    });
    expect(rules(lintScenario(s, ctx))).not.toContain('acyclic-fixtures');
  });

  test('handles a diamond graph without reporting a false cycle', () => {
    const s = scenario({
      fixtures: [
        fixture({ ref: 'base' }),
        fixture({ ref: 'left', dependsOn: ['base'] }),
        fixture({ ref: 'right', dependsOn: ['base'] }),
        fixture({ ref: 'top', dependsOn: ['left', 'right'] }),
      ],
    });
    expect(rules(lintScenario(s, ctx))).not.toContain('acyclic-fixtures');
  });
});

describe('cleanup-covers-creates', () => {
  test('rejects a created fixture with no cleanup', () => {
    const s = scenario({ policyClass: 'mutating', fixtures: [fixture({ cleanup: { via: 'none' } })] });
    expect(rules(lintScenario(s, ctx))).toContain('cleanup-covers-creates');
  });

  test('accepts a fixture that reuses an existing record', () => {
    const s = scenario({
      policyClass: 'mutating',
      fixtures: [fixture({ createVia: { via: 'existing', lookup: {} }, cleanup: { via: 'none' } })],
    });
    expect(rules(lintScenario(s, ctx))).not.toContain('cleanup-covers-creates');
  });

  test('skips the rule entirely for passive scenarios', () => {
    const s = scenario({ policyClass: 'passive', fixtures: [fixture({ cleanup: { via: 'none' } })] });
    expect(rules(lintScenario(s, ctx))).not.toContain('cleanup-covers-creates');
  });

  test('accepts a UI-created fixture with UI cleanup', () => {
    const s = scenario({
      policyClass: 'mutating',
      fixtures: [fixture({ createVia: { via: 'ui', steps: [step()] }, cleanup: { via: 'ui', steps: [step()] } })],
    });
    expect(rules(lintScenario(s, ctx))).not.toContain('cleanup-covers-creates');
  });
});

describe('step-budget', () => {
  test('warns past the soft threshold without blocking', () => {
    const steps = Array.from({ length: 5 }, (_, i) => step({ id: `s${i}`, index: i }));
    const issues = lintScenario(scenario({ steps }), { ...ctx, stepWarnThreshold: 3 });

    expect(rules(issues)).toContain('step-budget');
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  test('stays quiet under the default threshold', () => {
    expect(rules(lintScenario(scenario(), ctx))).not.toContain('step-budget');
  });
});

describe('hasBlockingIssues', () => {
  test('is true when any error is present', () => {
    const s = scenario({ steps: [step({ action: { type: 'navigate', path: '/x', originRef: 'evil' } })] });
    expect(hasBlockingIssues(lintScenario(s, ctx))).toBe(true);
  });

  test('is false for a clean scenario', () => {
    expect(hasBlockingIssues(lintScenario(scenario(), ctx))).toBe(false);
  });
});

describe('coverage of setup and cleanup steps', () => {
  test('lints setup steps too', () => {
    const s = scenario({ setup: [step({ action: { type: 'navigate', path: '/x', originRef: 'unknown' } })] });
    expect(rules(lintScenario(s, ctx))).toContain('origin-allowlist');
  });

  test('lints cleanup steps too', () => {
    const s = scenario({
      cleanup: { strategy: 'best-effort', runOnFailure: true, lineageReaper: [], steps: [step({ action: { type: 'navigate', path: '/x', originRef: 'unknown' } })] },
    });
    expect(rules(lintScenario(s, ctx))).toContain('origin-allowlist');
  });
});

describe('branch coverage of message formatting and edge inputs', () => {
  test('reports "(none)" when the target has no verified origins at all', () => {
    const s = scenario({ steps: [step({ action: { type: 'navigate', path: '/x', originRef: 'primary' } })] });
    const issues = lintScenario(s, { allowedOrigins: {}, allowedApiHosts: {} });

    expect(issues[0]!.message).toContain('(none)');
  });

  test('reports "(none)" when the target has no declared API hosts', () => {
    const s = scenario({
      steps: [step({ action: { type: 'apiRequest', request: apiReq('GET'), saveAs: 'r' } })],
    });
    const issues = lintScenario(s, { allowedOrigins: { primary: 'https://a.example' }, allowedApiHosts: {} });

    expect(issues.some((i) => i.message.includes('(none)'))).toBe(true);
  });

  test('handles a fill target with no name, label or placeholder', () => {
    const s = scenario({
      steps: [step({
        action: {
          type: 'fill',
          target: target({ role: 'textbox', name: undefined }),
          value: { kind: 'literal', value: 'plain text' },
        },
      })],
    });

    expect(lintScenario(s, ctx)).toHaveLength(0);
  });

  test('checks select actions for literal secrets as well as fill', () => {
    const s = scenario({
      steps: [step({
        action: {
          type: 'select',
          target: target({ role: 'combobox', name: 'Secret question answer' }),
          value: { kind: 'literal', value: 'blue' },
        },
      })],
    });

    expect(rules(lintScenario(s, ctx))).toContain('no-literal-secrets');
  });

  test('detects a destructive click via labelText when the name is absent', () => {
    const s = scenario({
      policyClass: 'mutating',
      steps: [step({
        intent: 'Press it',
        action: { type: 'click', target: target({ name: undefined, labelText: 'Purge records' }) },
        riskTags: ['mutating'],
      })],
    });

    expect(rules(lintScenario(s, ctx))).toContain('risk-tags-consistent');
  });

  test('ignores non-literal values when scanning for credential shapes', () => {
    const s = scenario({
      steps: [step({
        action: {
          type: 'fill',
          target: target({ role: 'textbox', name: 'Email' }),
          value: { kind: 'faker', token: 'random.email' },
        },
      })],
    });

    expect(lintScenario(s, ctx)).toHaveLength(0);
  });
});
