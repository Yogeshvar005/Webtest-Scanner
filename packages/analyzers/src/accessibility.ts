import axe from 'axe-core';
import type { Analyzer, AnalyzerContext, CheckResult } from './types';

interface AxeNode { target?: string[]; html?: string }
interface AxeViolation {
  id: string;
  impact?: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}
interface AxeResults { violations: AxeViolation[]; passes: AxeViolation[]; incomplete: AxeViolation[] }

/** axe impact maps onto our severity scale. */
const SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  critical: 'critical',
  serious: 'high',
  moderate: 'medium',
  minor: 'low',
};

export const accessibilityAnalyzer: Analyzer = {
  id: 'accessibility',
  label: 'Accessibility (WCAG 2.1 AA)',
  description:
    'Runs axe-core against the rendered page: missing labels and alt text, contrast, ARIA misuse, focus order and keyboard reachability.',
  minTier: 0,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const { page } = context;

    try {
      // axe-core exposes its own bundled source as a string, which survives
      // server bundling intact — resolving it by file path does not, because
      // the bundler rewrites require.resolve.
      await page.addScriptTag({ content: axe.source });
    } catch (error) {
      return [{
        id: 'axe-injection',
        name: 'Accessibility engine',
        status: 'skipped',
        severity: 'medium',
        detail: `Could not inject the accessibility engine: ${error instanceof Error ? error.message : String(error)}. A strict Content Security Policy on the target can block this.`,
      }];
    }

    const results = await page
      .evaluate(async () => {
        const axe = (globalThis as unknown as { axe?: { run: (opts: unknown) => Promise<AxeResults> } }).axe;
        if (!axe) throw new Error('axe did not initialise');
        return axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      })
      .catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));

    if ('error' in results) {
      return [{
        id: 'axe-run',
        name: 'Accessibility audit',
        status: 'skipped',
        severity: 'medium',
        detail: `The accessibility audit could not complete: ${results.error}`,
      }];
    }

    const checks: CheckResult[] = results.violations.map((violation) => ({
      id: `a11y:${violation.id}`,
      name: violation.help,
      status: 'failed',
      severity: SEVERITY[violation.impact ?? 'minor'] ?? 'low',
      detail: `${violation.nodes.length} element(s) affected. ${violation.helpUrl}`,
      evidence: violation.nodes
        .slice(0, 5)
        .map((node) => node.target?.join(' ') ?? node.html?.slice(0, 120) ?? '')
        .filter(Boolean),
    }));

    // `incomplete` means axe could not decide — usually contrast over an image.
    // Reporting these as warnings is honest; calling them passes would not be.
    for (const item of results.incomplete.slice(0, 10)) {
      checks.push({
        id: `a11y-review:${item.id}`,
        name: `Needs human review: ${item.help}`,
        status: 'warning',
        severity: 'low',
        detail: `axe could not determine this automatically for ${item.nodes.length} element(s). ${item.helpUrl}`,
        evidence: item.nodes.slice(0, 3).map((n) => n.target?.join(' ') ?? '').filter(Boolean),
      });
    }

    checks.push({
      id: 'a11y-passes',
      name: 'Automated accessibility rules that passed',
      status: 'passed',
      severity: 'low',
      detail: `${results.passes.length} axe rules passed. Automated testing covers roughly a third of WCAG criteria — a clean result is not a claim of full compliance.`,
    });

    return checks;
  },
};
