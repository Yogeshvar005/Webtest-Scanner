import { describe, expect, test } from 'vitest';
import {
  CATEGORIES, overallStatus, runAnalyzers, skippedCategory, summarise,
  type Analyzer, type AnalyzerContext, type CheckResult, type TestCategory,
} from '../src/index';

function check(over: Partial<CheckResult> = {}): CheckResult {
  return { id: 'c', name: 'A check', status: 'passed', severity: 'medium', detail: '', ...over };
}

function context(over: Partial<AnalyzerContext> = {}): AnalyzerContext {
  return {
    page: {} as AnalyzerContext['page'],
    targetUrl: 'https://app.example.com',
    mainResponse: null,
    tier: 0,
    strict: false,
    ...over,
  };
}

describe('summarise', () => {
  test('passes when every check passed', () => {
    expect(summarise('ui', 'UI', [check(), check()], false).status).toBe('passed');
  });

  test('fails when any check failed', () => {
    expect(summarise('ui', 'UI', [check(), check({ status: 'failed' })], false).status).toBe('failed');
  });

  test('warns, but does not fail, on a warning by default', () => {
    expect(summarise('ui', 'UI', [check(), check({ status: 'warning' })], false).status).toBe('warning');
  });

  test('promotes a warning to a failure in strict mode', () => {
    expect(summarise('ui', 'UI', [check(), check({ status: 'warning' })], true).status).toBe('failed');
  });

  test('a failure outranks a warning', () => {
    const result = summarise('ui', 'UI', [check({ status: 'failed' }), check({ status: 'warning' })], false);
    expect(result.status).toBe('failed');
  });

  test('counts each status', () => {
    const result = summarise('ui', 'UI', [
      check({ status: 'passed' }),
      check({ status: 'failed' }),
      check({ status: 'warning' }),
      check({ status: 'skipped' }),
      check({ status: 'not-applicable' }),
    ], false);

    expect(result.totals).toEqual({ passed: 1, failed: 1, warning: 1, skipped: 2 });
  });
});

describe('a category where nothing ran must never read as passing', () => {
  // This is the single most important behaviour in the reporting layer:
  // absence of evidence must never be presented as evidence of absence.
  test('is skipped, not passed, when every check was skipped', () => {
    const result = summarise('accessibility', 'A11y', [
      check({ status: 'skipped', detail: 'The engine could not be injected.' }),
    ], false);

    expect(result.status).toBe('skipped');
    expect(result.skippedReason).toBe('The engine could not be injected.');
  });

  test('is skipped when the only checks were not-applicable', () => {
    const result = summarise('api', 'API', [check({ status: 'not-applicable', detail: 'No API traffic.' })], false);
    expect(result.status).toBe('skipped');
  });

  test('is skipped when there are no checks at all', () => {
    const result = summarise('api', 'API', [], false);
    expect(result.status).toBe('skipped');
    expect(result.skippedReason).toContain('applicable');
  });

  test('still passes when at least one real check ran alongside skipped ones', () => {
    const result = summarise('api', 'API', [check({ status: 'passed' }), check({ status: 'skipped' })], false);
    expect(result.status).toBe('passed');
  });
});

describe('skippedCategory', () => {
  test('carries the reason and empty totals', () => {
    const result = skippedCategory('security-active', 'Active security', 'Requires tier 2.');
    expect(result.status).toBe('skipped');
    expect(result.skippedReason).toBe('Requires tier 2.');
    expect(result.totals).toEqual({ passed: 0, failed: 0, warning: 0, skipped: 0 });
  });
});

describe('runAnalyzers', () => {
  const fake = (id: TestCategory, minTier: 0 | 1 | 2, run: Analyzer['run']): Analyzer => ({
    id, label: `Fake ${id}`, description: '', minTier, run,
  });

  const passing = (id: TestCategory, minTier: 0 | 1 | 2 = 0) =>
    fake(id, minTier, async () => [check({ status: 'passed' })]);

  test('runs only the selected categories', async () => {
    const results = await runAnalyzers({
      selected: ['ui'],
      context: context(),
      analyzers: [passing('ui'), passing('performance')],
    });

    expect(results.map((r) => r.category)).toEqual(['ui']);
  });

  test('ignores a category that is not selected', async () => {
    const results = await runAnalyzers({ selected: [], context: context() });
    expect(results).toEqual([]);
  });

  test('skips a category whose tier requirement is not met, with a reason', async () => {
    const results = await runAnalyzers({
      selected: ['security-active'],
      context: context({ tier: 1 }),
      analyzers: [passing('security-active', 2)],
    });

    expect(results[0]!.status).toBe('skipped');
    expect(results[0]!.skippedReason).toContain('tier 2');
    expect(results[0]!.skippedReason).toContain('tier 1');
  });

  test('runs a tier-gated category once the tier is high enough', async () => {
    const results = await runAnalyzers({
      selected: ['security-active'],
      context: context({ tier: 2 }),
      analyzers: [passing('security-active', 2)],
    });

    expect(results[0]!.status).toBe('passed');
  });

  test('turns an analyzer crash into a reported failure, not a lost run', async () => {
    // One broken analyzer must not take down the whole report, and its failure
    // must be visible rather than swallowed.
    const boom = fake('ui', 0, async () => { throw new Error('engine exploded'); });

    const results = await runAnalyzers({ selected: ['ui'], context: context(), analyzers: [boom] });

    expect(results[0]!.status).toBe('failed');
    expect(results[0]!.checks[0]!.detail).toContain('engine exploded');
  });

  test('a crash in one category does not stop the others', async () => {
    const boom = fake('ui', 0, async () => { throw new Error('boom'); });

    const results = await runAnalyzers({
      selected: ['ui', 'performance'],
      context: context(),
      analyzers: [boom, passing('performance')],
    });

    expect(results.map((r) => r.status)).toEqual(['failed', 'passed']);
  });
});

describe('overallStatus', () => {
  const cat = (status: 'passed' | 'failed' | 'warning' | 'skipped') =>
    ({ category: 'ui' as TestCategory, label: 'UI', status, checks: [], totals: { passed: 0, failed: 0, warning: 0, skipped: 0 } });

  test('fails if any category failed', () => {
    expect(overallStatus([cat('passed'), cat('failed')], false)).toBe('failed');
  });

  test('warns if any category warned', () => {
    expect(overallStatus([cat('passed'), cat('warning')], false)).toBe('warning');
  });

  test('fails on a warning in strict mode', () => {
    expect(overallStatus([cat('passed'), cat('warning')], true)).toBe('failed');
  });

  test('passes when everything passed', () => {
    expect(overallStatus([cat('passed'), cat('passed')], false)).toBe('passed');
  });

  test('a skipped category alone does not fail the run', () => {
    expect(overallStatus([cat('passed'), cat('skipped')], false)).toBe('passed');
  });
});

describe('the category registry', () => {
  test('includes functional plus every analyzer', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(ids).toContain('functional');
    expect(ids).toContain('security-active');
    expect(ids).toContain('unit');
  });

  test('every category carries a description a tester can act on', () => {
    for (const category of CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.description.length).toBeGreaterThan(20);
    }
  });

  test('only active security probing requires proven ownership', () => {
    const gated = CATEGORIES.filter((c) => c.minTier > 0).map((c) => c.id);
    expect(gated).toEqual(['security-active']);
  });

  test('active security probing requires the highest tier', () => {
    expect(CATEGORIES.find((c) => c.id === 'security-active')!.minTier).toBe(2);
  });
});
