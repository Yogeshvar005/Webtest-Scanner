import type { Page, Response } from 'playwright';
import type { Severity } from '@wts/dsl';

/**
 * The categories a tester can select for a run. The report only covers what
 * was selected — an unselected category is absent, never silently passed.
 */
export type TestCategory =
  | 'functional'
  | 'ui'
  | 'accessibility'
  | 'security-passive'
  | 'security-active'
  | 'performance'
  | 'api'
  | 'unit'
  | 'design';

export type OwnershipTier = 0 | 1 | 2;

export interface CheckResult {
  /** Stable identifier so results can be compared across runs. */
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped' | 'not-applicable';
  severity: Severity;
  detail: string;
  /** Concrete offending items — selectors, URLs, header names. */
  evidence?: string[];
}

export interface CategoryResult {
  category: TestCategory;
  label: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  /** Why the whole category was skipped, when it was. */
  skippedReason?: string;
  checks: CheckResult[];
  totals: { passed: number; failed: number; warning: number; skipped: number };
}

export interface AnalyzerContext {
  page: Page;
  targetUrl: string;
  /** The main document response, for header and status inspection. */
  mainResponse: Response | null;
  tier: OwnershipTier;
  /**
   * In strict mode a warning is treated as a failure. Heuristic checks that
   * produce false positives on real sites warn by default, so strict mode is
   * opt-in rather than the default.
   */
  strict: boolean;
  /** Where captured assets are written. Absent when capture is not enabled. */
  artifactDir?: string;
  /** URL prefix the web app serves `artifactDir` from. */
  artifactUrlPrefix?: string;
  runId?: string;
  /**
   * Whether to download the site's actual asset files, rather than only
   * cataloguing them. Copying a third party's images and fonts is a
   * reproduction of their copyrighted work, so this is gated on proven
   * domain ownership rather than offered by default.
   */
  captureAssets?: boolean;
}

export interface Analyzer {
  id: TestCategory;
  label: string;
  description: string;
  /** Minimum proven-ownership tier before this category may run at all. */
  minTier: OwnershipTier;
  run(context: AnalyzerContext): Promise<CheckResult[]>;
}

/** Rolls individual checks up into a category verdict. */
export function summarise(
  category: TestCategory,
  label: string,
  checks: CheckResult[],
  strict: boolean,
): CategoryResult {
  const totals = {
    passed: checks.filter((c) => c.status === 'passed').length,
    failed: checks.filter((c) => c.status === 'failed').length,
    warning: checks.filter((c) => c.status === 'warning').length,
    skipped: checks.filter((c) => c.status === 'skipped' || c.status === 'not-applicable').length,
  };

  // A category where nothing actually ran must never read as passing. An
  // engine that failed to load, or a surface that was not present, is an
  // absence of evidence — reporting it green is the one thing a test report
  // must never do.
  const actionable = totals.passed + totals.failed + totals.warning;
  if (actionable === 0) {
    const reason = checks[0]?.detail ?? 'Nothing in this category was applicable to this target.';
    return { category, label, status: 'skipped', skippedReason: reason, checks, totals };
  }

  const status =
    totals.failed > 0 || (strict && totals.warning > 0)
      ? 'failed'
      : totals.warning > 0
        ? 'warning'
        : 'passed';

  return { category, label, status, checks, totals };
}

export function skippedCategory(
  category: TestCategory,
  label: string,
  reason: string,
): CategoryResult {
  return {
    category,
    label,
    status: 'skipped',
    skippedReason: reason,
    checks: [],
    totals: { passed: 0, failed: 0, warning: 0, skipped: 0 },
  };
}
