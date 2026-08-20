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

/**
 * What the step is about to do with the element. Resolution is action-aware:
 * an element that cannot receive the action is not a match, however well its
 * text scores. Without this a `fill` happily "resolves" to a decorative label
 * and then blocks until the step times out.
 */
export type Interaction = 'click' | 'fill' | 'read' | 'wait';

export interface Resolution {
  locator: Locator;
  strategy: string;
  confidence: number;
}

export interface ResolutionFailure {
  /** Candidates that matched by text but could not accept the interaction. */
  rejected: Array<{ strategy: string; reason: string }>;
}

export type ResolveResult =
  | { ok: true; resolution: Resolution }
  | { ok: false; failure: ResolutionFailure };

/** Roles that can hold typed input. Used to keep `fill` off decorative text. */
const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/** How long to probe a single candidate before moving to the next one. */
const PROBE_TIMEOUT_MS = 1_500;

/**
 * Confirms a candidate can actually receive the interaction.
 *
 * Probes are deliberately short: the cost of rejecting a bad candidate must
 * stay far below the step budget, or one wrong guess consumes the whole run.
 */
async function canAccept(locator: Locator, interaction: Interaction): Promise<string | undefined> {
  try {
    if ((await locator.count()) === 0) return 'no element matched';

    if (interaction === 'read' || interaction === 'wait') return undefined;

    const visible = await locator.isVisible({ timeout: PROBE_TIMEOUT_MS }).catch(() => false);
    if (!visible) return 'element is not visible';

    if (interaction === 'fill') {
      const editable = await locator.isEditable({ timeout: PROBE_TIMEOUT_MS }).catch(() => false);
      if (!editable) return 'element is visible but not editable (it is probably a label, not the input)';
      return undefined;
    }

    const enabled = await locator.isEnabled({ timeout: PROBE_TIMEOUT_MS }).catch(() => false);
    if (!enabled) return 'element is visible but disabled';
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message.slice(0, 120) : 'probe failed';
  }
}

/**
 * Resolves a semantic target to an element by trying progressively weaker
 * signals, verifying each against the interaction before accepting it.
 *
 * Returning ranked strategies (instead of throwing on the first miss) is what
 * later makes self-healing possible: the run can continue on a weaker signal
 * while the report records which signal matched and how confident it was.
 */
export async function resolveTarget(
  page: Page,
  target: SemanticTarget,
  interaction: Interaction = 'click',
): Promise<ResolveResult> {
  const scoped = target.within ? await resolveTarget(page, target.within, 'read') : undefined;
  const root = scoped?.ok ? scoped.resolution.locator : page.locator('body');
  const role = (ARIA_ROLE[target.role] ?? target.role) as Parameters<Page['getByRole']>[0];
  const exact = target.nameMatch === 'exact';
  const wantsInput = interaction === 'fill';

  const candidates: Array<[string, number, () => Locator]> = [];

  if (target.hints?.testId) {
    candidates.push(['test-id', 0.99, () => root.getByTestId(target.hints!.testId!)]);
  }
  if (target.name) {
    candidates.push(['role+name', 0.96, () => root.getByRole(role, { name: target.name!, exact })]);
  }
  if (target.labelText) {
    candidates.push(['label', 0.92, () => root.getByLabel(target.labelText!, { exact })]);
  }
  if (target.placeholder) {
    candidates.push(['placeholder', 0.88, () => root.getByPlaceholder(target.placeholder!, { exact })]);
  }

  if (wantsInput) {
    // For typed input, fall back across the input roles rather than to page
    // text. A `fill` can only ever succeed on something editable, so matching
    // arbitrary text would just produce a slow, confusing timeout.
    if (target.name) {
      candidates.push(['label-as-name', 0.86, () => root.getByLabel(target.name!, { exact: false })]);
      candidates.push(['placeholder-as-name', 0.82, () => root.getByPlaceholder(target.name!, { exact: false })]);
      for (const inputRole of EDITABLE_ROLES) {
        candidates.push([
          `${inputRole}+name`,
          0.75,
          () => root.getByRole(inputRole as Parameters<Page['getByRole']>[0], { name: target.name!, exact: false }),
        ]);
      }
    }
    for (const inputRole of EDITABLE_ROLES) {
      candidates.push([`${inputRole}-only`, 0.5, () => root.getByRole(inputRole as Parameters<Page['getByRole']>[0])]);
    }
  } else if (target.name) {
    candidates.push(['role-only+text-filter', 0.68, () => root.getByRole(role).filter({ hasText: target.name! })]);
    // Weakest: the accessible name may be unset but the text is visible.
    candidates.push(['text', 0.6, () => root.getByText(target.name!, { exact: false })]);
  }

  if (!wantsInput) {
    candidates.push(['role-only', 0.45, () => root.getByRole(role)]);
  }

  // A human-approved CSS fallback is the last resort and is never AI-authored;
  // the DSL lint rejects a cssFallback that no reviewer signed off.
  if (target.hints?.cssFallback) {
    candidates.push(['approved-css-fallback', 0.5, () => root.locator(target.hints!.cssFallback!)]);
  }

  const rejected: ResolutionFailure['rejected'] = [];

  for (const [strategy, confidence, build] of candidates) {
    let locator: Locator;
    try {
      locator = build();
      locator = target.nth !== undefined ? locator.nth(target.nth) : locator.first();
    } catch {
      // A malformed selector for one strategy must not abort the others.
      rejected.push({ strategy, reason: 'invalid selector' });
      continue;
    }

    const problem = await canAccept(locator, interaction);
    if (problem === undefined) return { ok: true, resolution: { locator, strategy, confidence } };
    if (problem !== 'no element matched') rejected.push({ strategy, reason: problem });
  }

  return { ok: false, failure: { rejected } };
}

/** A message that tells the reader what to change, not just that it failed. */
export function explainFailure(target: SemanticTarget, failure: ResolutionFailure, interaction: Interaction): string {
  const what = describeTarget(target);

  if (failure.rejected.length === 0) {
    return `Could not find ${what} on the page.`;
  }

  const notEditable = failure.rejected.find((r) => r.reason.includes('not editable'));
  if (notEditable && interaction === 'fill') {
    return `Found ${what}, but it is not a text input — it matched a label or button instead. On many sites the search box only appears after clicking the search control, so try "click ${target.name ?? 'search'}" before typing.`;
  }

  const hidden = failure.rejected.find((r) => r.reason.includes('not visible'));
  if (hidden) {
    return `Found ${what} in the page, but it is not visible. It may be behind a menu or dialog that has to be opened first.`;
  }

  const disabled = failure.rejected.find((r) => r.reason.includes('disabled'));
  if (disabled) {
    return `Found ${what}, but it is disabled.`;
  }

  return `Could not use ${what}: ${failure.rejected[0]!.reason}.`;
}

export function targetDescription(target: SemanticTarget): string {
  return describeTarget(target);
}
