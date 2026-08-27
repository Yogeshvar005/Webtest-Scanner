import { accessibilityAnalyzer } from './accessibility';
import { designAnalyzer } from './design';
import { apiAnalyzer, unitAnalyzer } from './api-and-unit';
import { performanceAnalyzer } from './performance';
import { scraperAnalyzer } from './scraper';
import { securityActiveAnalyzer } from './security-active';
import { securityPassiveAnalyzer } from './security-passive';
import {
  skippedCategory, summarise,
  type Analyzer, type AnalyzerContext, type CategoryResult, type TestCategory,
} from './types';
import { uiAnalyzer } from './ui';

export * from './types';
export { setObservedApiCalls, type ObservedApiCall } from './api-and-unit';

/**
 * Every selectable category except `functional`, which is the scenario the
 * tester wrote and is executed by the runner rather than by an analyzer.
 */
export const ANALYZERS: Analyzer[] = [
  uiAnalyzer,
  designAnalyzer,
  accessibilityAnalyzer,
  securityPassiveAnalyzer,
  securityActiveAnalyzer,
  performanceAnalyzer,
  apiAnalyzer,
  unitAnalyzer,
  scraperAnalyzer,
];

export interface CategoryDescriptor {
  id: TestCategory;
  label: string;
  description: string;
  minTier: 0 | 1 | 2;
}

/** Drives the selection UI, so the options can never drift from the implementations. */
export const CATEGORIES: CategoryDescriptor[] = [
  {
    id: 'functional',
    label: 'Functional',
    description:
      'Runs the steps you described: navigation, forms, clicks and the assertions you asked for.',
    minTier: 0,
  },
  ...ANALYZERS.map((a) => ({ id: a.id, label: a.label, description: a.description, minTier: a.minTier })),
];

export interface RunAnalyzersOptions {
  selected: TestCategory[];
  context: AnalyzerContext;
  /** Overrides the registry. Injectable so orchestration is testable without a browser. */
  analyzers?: Analyzer[];
}

/**
 * Runs the selected analyzers and returns one result per selected category.
 *
 * A category the tester chose but which cannot run — because ownership has not
 * been proven, or because it needs something a URL cannot provide — comes back
 * explicitly skipped with the reason. It is never quietly dropped, and it is
 * never reported as passing.
 */
export async function runAnalyzers(options: RunAnalyzersOptions): Promise<CategoryResult[]> {
  const { selected, context } = options;
  const analyzers = options.analyzers ?? ANALYZERS;
  const results: CategoryResult[] = [];

  for (const analyzer of analyzers) {
    if (!selected.includes(analyzer.id)) continue;

    if (context.tier < analyzer.minTier) {
      results.push(
        skippedCategory(
          analyzer.id,
          analyzer.label,
          `Requires ownership tier ${analyzer.minTier}; this target is tier ${context.tier}. Prove you control the domain (DNS TXT) and, for tier 2, have a Project Admin sign the authorization attestation.`,
        ),
      );
      continue;
    }

    try {
      const checks = await analyzer.run(context);
      results.push(summarise(analyzer.id, analyzer.label, checks, context.strict));
    } catch (error) {
      results.push(
        summarise(
          analyzer.id,
          analyzer.label,
          [{
            id: `${analyzer.id}-error`,
            name: `${analyzer.label} could not complete`,
            status: 'failed',
            severity: 'medium',
            detail: error instanceof Error ? error.message : String(error),
          }],
          context.strict,
        ),
      );
    }
  }

  return results;
}

/**
 * The overall verdict across categories.
 *
 * In strict mode a warning fails the run. Otherwise warnings are surfaced but
 * do not fail it, because the heuristic checks (overlap, clipping, tap targets)
 * produce false positives on real sites.
 */
export function overallStatus(results: CategoryResult[], strict: boolean): 'passed' | 'failed' | 'warning' {
  if (results.some((r) => r.status === 'failed')) return 'failed';
  const warned = results.some((r) => r.status === 'warning');
  if (warned) return strict ? 'failed' : 'warning';
  return 'passed';
}
