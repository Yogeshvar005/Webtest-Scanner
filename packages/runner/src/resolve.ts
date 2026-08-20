import type { Locator, Page } from 'playwright';
import { describeTarget, type ElementRole, type SemanticTarget } from '@wts/dsl';

/**
 * Maps our semantic roles onto ARIA roles Playwright understands. The DSL role
 * vocabulary is intentionally close to ARIA, so most map straight through; the
 * exceptions are inputs, which ARIA models by role plus type.
 */
const ARIA_ROLE: Partial<Record<ElementRole, string>> = {
  password: 'textbox',
  searchbox: 'searchbox',
};

export interface Resolution {
  locator: Locator;
  strategy: string;
  confidence: number;
}

/**
 * Resolves a semantic target to an element by trying progressively weaker
 * signals, rather than failing on the first miss.
 *
 * Returning a ranked strategy (instead of throwing) is what later makes
 * self-healing possible: the run can continue on a weaker signal while the
 * report records which signal actually matched and how confident it was.
 */
export async function resolveTarget(page: Page, target: SemanticTarget): Promise<Resolution | undefined> {
  const scope = target.within ? (await resolveTarget(page, target.within))?.locator : undefined;
  const root = scope ?? page.locator('body');
  const role = (ARIA_ROLE[target.role] ?? target.role) as Parameters<Page['getByRole']>[0];
  const exact = target.nameMatch === 'exact';

  const candidates: Array<[string, number, () => Locator]> = [];

  if (target.name) {
    candidates.push(['role+name', 0.96, () => root.getByRole(role, { name: target.name!, exact })]);
  }
  if (target.labelText) {
    candidates.push(['label', 0.92, () => root.getByLabel(target.labelText!, { exact })]);
  }
  if (target.placeholder) {
    candidates.push(['placeholder', 0.88, () => root.getByPlaceholder(target.placeholder!, { exact })]);
  }
  if (target.hints?.testId) {
    candidates.push(['test-id', 0.99, () => root.getByTestId(target.hints!.testId!)]);
  }
  if (target.name) {
    // Weaker: the accessible name may not be set, but the text is visible.
    candidates.push(['text', 0.7, () => root.getByText(target.name!, { exact: false })]);
    candidates.push(['role-only+text-filter', 0.6, () => root.getByRole(role).filter({ hasText: target.name! })]);
  }
  candidates.push(['role-only', 0.45, () => root.getByRole(role)]);

  // A human-approved CSS fallback is the last resort and is never AI-authored;
  // the DSL lint rejects a cssFallback that no reviewer signed off.
  if (target.hints?.cssFallback) {
    candidates.push(['approved-css-fallback', 0.5, () => root.locator(target.hints!.cssFallback!)]);
  }

  for (const [strategy, confidence, build] of candidates) {
    try {
      let locator = build();
      if (target.nth !== undefined) locator = locator.nth(target.nth);
      else locator = locator.first();

      if ((await locator.count()) > 0) {
        return { locator, strategy, confidence };
      }
    } catch {
      // A malformed selector for one strategy must not abort the others.
      continue;
    }
  }

  return undefined;
}

export function targetDescription(target: SemanticTarget): string {
  return describeTarget(target);
}
