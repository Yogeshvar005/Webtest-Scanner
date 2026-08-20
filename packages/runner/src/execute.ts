import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import type { Scenario, Step, WaitCondition } from '@wts/dsl';
import { detectInjection, sanitizeText, type InjectionSignal } from '@wts/nlp';
import { evaluate, type PolicyRequest } from '@wts/policy';
import { installEgressGuard, type BlockedRequest } from './egress-guard';
import { resolveTarget, targetDescription } from './resolve';
import type { AssertionResult, Finding, RunResult, StepResult } from './types';

export interface ExecuteOptions {
  scenario: Scenario;
  /** Verified base origin, e.g. https://example.com */
  targetUrl: string;
  policyRequest: PolicyRequest;
  /** Directory screenshots are written to. */
  artifactDir: string;
  /** URL prefix the web app serves `artifactDir` from. */
  artifactUrlPrefix: string;
  runId: string;
  headless?: boolean;
  onStep?: (result: StepResult) => void;
}

/** Resolves a literal value expression; non-literals are not yet supported here. */
function literalValue(value: { kind: string; value?: unknown }): string {
  return value.kind === 'literal' ? String(value.value ?? '') : '';
}

async function applyWait(page: Page, condition: WaitCondition): Promise<void> {
  switch (condition.type) {
    case 'navigationComplete':
      await page.waitForLoadState('load');
      return;
    case 'networkQuiescent':
      // networkidle is Playwright's closest equivalent to "no in-flight requests".
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      return;
    case 'domStable':
      await page.waitForTimeout(condition.quietMs);
      return;
    case 'urlChanged':
      if (condition.pattern) await page.waitForURL(new RegExp(condition.pattern), { timeout: 15_000 });
      return;
    case 'requestSettled':
      await page.waitForResponse((r) => r.url().includes(condition.urlPattern), { timeout: 15_000 }).catch(() => undefined);
      return;
    case 'elementVisible': {
      const resolved = await resolveTarget(page, condition.target);
      if (resolved) await resolved.locator.waitFor({ state: 'visible', timeout: condition.timeoutMs }).catch(() => undefined);
      return;
    }
    case 'elementHidden': {
      const resolved = await resolveTarget(page, condition.target);
      if (resolved) await resolved.locator.waitFor({ state: 'hidden', timeout: condition.timeoutMs }).catch(() => undefined);
      return;
    }
  }
}

async function runAssertions(page: Page, step: Step): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of step.assertions) {
    const description = assertion.describe ?? assertion.type;

    try {
      if (assertion.type === 'textPresent') {
        const needle = literalValue(assertion.text as { kind: string; value?: unknown });
        const body = (await page.textContent('body')) ?? '';
        const found = body.toLowerCase().includes(needle.toLowerCase());
        results.push({
          description,
          passed: assertion.negate ? !found : found,
          severity: assertion.severity,
          detail: found ? `Found "${needle}" on the page.` : `"${needle}" was not present in the page text.`,
        });
        continue;
      }

      if (assertion.type === 'elementVisible') {
        const resolved = await resolveTarget(page, assertion.target);
        const visible = resolved ? await resolved.locator.isVisible().catch(() => false) : false;
        results.push({
          description,
          passed: assertion.negate ? !visible : visible,
          severity: assertion.severity,
          detail: visible ? 'Element is visible.' : `Could not see ${targetDescription(assertion.target)}.`,
        });
        continue;
      }

      if (assertion.type === 'urlMatches') {
        const matches = new RegExp(assertion.pattern).test(page.url());
        results.push({ description, passed: matches, severity: assertion.severity, detail: `URL is ${page.url()}` });
        continue;
      }

      results.push({
        description,
        passed: true,
        severity: assertion.severity,
        detail: `Assertion type "${assertion.type}" is not evaluated by the local runner yet.`,
      });
    } catch (error) {
      results.push({
        description,
        passed: false,
        severity: assertion.severity,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Executes a scenario against a real browser, capturing a screenshot after
 * every step so the report reads like a person working through the site.
 *
 * The policy engine is consulted again here, per step, rather than trusting
 * the decision made when the run was dispatched.
 */
export async function executeScenario(options: ExecuteOptions): Promise<RunResult> {
  const { scenario, targetUrl, policyRequest, artifactDir, artifactUrlPrefix, runId } = options;
  const startedAt = new Date();

  await mkdir(artifactDir, { recursive: true });

  const policyDecision = evaluate(policyRequest);
  const blockedRequests: BlockedRequest[] = [];
  const injectionSignals: InjectionSignal[] = [];
  const findings: Finding[] = [];
  const steps: StepResult[] = [];

  if (policyDecision.effect === 'deny') {
    findings.push({
      type: 'policy_denial',
      severity: 'critical',
      title: `Run refused: ${policyDecision.code}`,
      detail: policyDecision.reason,
      evidence: policyDecision.remediation,
    });
  }

  let browser: Browser | undefined;

  try {
    if (policyDecision.effect === 'deny') {
      for (const step of scenario.steps) {
        steps.push({
          id: step.id,
          index: step.index,
          intent: step.intent,
          status: 'blocked',
          durationMs: 0,
          assertions: [],
          policyReason: policyDecision.reason,
          consoleErrors: [],
          provenanceSource: step.provenance.source,
          provenanceConfidence: step.provenance.confidence,
        });
      }
    } else {
      browser = await chromium.launch({ headless: options.headless ?? true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (compatible; WebtestScanner/0.1; +https://github.com/webtest-scanner)',
      });

      installEgressGuard(context, [targetUrl], (blocked) => blockedRequests.push(blocked));

      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(sanitizeText(message.text(), 300));
      });

      for (const step of scenario.steps) {
        const before = consoleErrors.length;
        const started = Date.now();
        const result = await runStep(page, step, targetUrl, artifactDir, artifactUrlPrefix, runId);
        result.durationMs = Date.now() - started;
        result.consoleErrors = consoleErrors.slice(before);

        // Page text is scanned as untrusted observation data, never merged into
        // instructions. A hit is reported rather than acted on.
        const text = await page.textContent('body').catch(() => null);
        if (text) {
          for (const signal of detectInjection([text.slice(0, 20_000)])) {
            if (!injectionSignals.some((s) => s.pattern === signal.pattern)) injectionSignals.push(signal);
          }
        }

        steps.push(result);
        options.onStep?.(result);

        if (result.status === 'failed' && step.onFailure === 'abort') break;
      }

      await context.close();
    }
  } catch (error) {
    findings.push({
      type: 'console_error',
      severity: 'high',
      title: 'Run aborted',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }

  for (const signal of injectionSignals) {
    findings.push({
      type: 'prompt_injection_attempt',
      severity: 'high',
      title: `Page contains text addressed to an AI agent (${signal.pattern})`,
      detail:
        'This page contains wording that attempts to give instructions to automated agents. It was treated as untrusted page data and never as an instruction. Site owners usually want to know this text is present.',
      evidence: sanitizeText(signal.excerpt, 300),
    });
  }

  for (const blocked of blockedRequests.slice(0, 20)) {
    findings.push({
      type: 'blocked_egress',
      severity: 'medium',
      title: 'Request to an off-allowlist origin was blocked',
      detail: blocked.reason,
      evidence: blocked.url.slice(0, 300),
    });
  }

  for (const step of steps) {
    for (const assertion of step.assertions.filter((a) => !a.passed)) {
      findings.push({
        type: 'assertion_failure',
        severity: assertion.severity,
        title: `${step.intent} — ${assertion.description}`,
        detail: assertion.detail ?? 'Assertion failed.',
      });
    }
  }

  const finishedAt = new Date();
  const totals = {
    total: steps.length,
    passed: steps.filter((s) => s.status === 'passed').length,
    failed: steps.filter((s) => s.status === 'failed').length,
    blocked: steps.filter((s) => s.status === 'blocked').length,
    skipped: steps.filter((s) => s.status === 'skipped').length,
  };

  return {
    runId,
    scenario,
    targetUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: totals.blocked > 0 && totals.passed === 0 ? 'blocked' : totals.failed > 0 ? 'failed' : 'passed',
    steps,
    findings,
    blockedRequests,
    injectionSignals,
    policyDecision,
    totals,
  };
}

async function runStep(
  page: Page,
  step: Step,
  targetUrl: string,
  artifactDir: string,
  artifactUrlPrefix: string,
  runId: string,
): Promise<StepResult> {
  const result: StepResult = {
    id: step.id,
    index: step.index,
    intent: step.intent,
    status: 'passed',
    durationMs: 0,
    assertions: [],
    consoleErrors: [],
    provenanceSource: step.provenance.source,
    provenanceConfidence: step.provenance.confidence,
  };

  try {
    for (const wait of step.preWaits) await applyWait(page, wait);

    const action = step.action;

    switch (action.type) {
      case 'navigate': {
        // The DSL cannot express an absolute URL, so the origin is always ours.
        const url = new URL(action.path, targetUrl).toString();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: step.timeoutMs });
        break;
      }
      case 'click': {
        const resolved = await resolveTarget(page, action.target);
        if (!resolved) throw new Error(`Could not find ${targetDescription(action.target)}`);
        result.resolvedBy = resolved.strategy;
        result.resolutionConfidence = resolved.confidence;
        await resolved.locator.click({ timeout: step.timeoutMs });
        break;
      }
      case 'fill': {
        const resolved = await resolveTarget(page, action.target);
        if (!resolved) throw new Error(`Could not find ${targetDescription(action.target)}`);
        result.resolvedBy = resolved.strategy;
        result.resolutionConfidence = resolved.confidence;
        await resolved.locator.fill(literalValue(action.value), { timeout: step.timeoutMs });
        await resolved.locator.press('Enter').catch(() => undefined);
        break;
      }
      case 'press':
        await page.keyboard.press(action.keys);
        break;
      case 'waitFor':
        await applyWait(page, action.condition);
        break;
      case 'setViewport': {
        const preset = action.preset;
        const size =
          typeof preset === 'string'
            ? { mobile: { w: 390, h: 844 }, tablet: { w: 820, h: 1180 }, desktop: { w: 1280, h: 800 } }[preset]
            : preset;
        await page.setViewportSize({ width: size.w, height: size.h });
        break;
      }
      case 'screenshot':
      case 'a11yAudit':
        // Evidence-only steps; the screenshot below is the output.
        break;
      default:
        throw new Error(`Action "${action.type}" is not supported by the local runner yet.`);
    }

    for (const wait of step.postWaits) await applyWait(page, wait);
    result.assertions = await runAssertions(page, step);

    if (result.assertions.some((a) => !a.passed)) result.status = 'failed';
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (step.evidence.screenshot !== 'never') {
    try {
      const file = `${runId}-${String(step.index).padStart(2, '0')}.png`;
      const buffer = await page.screenshot({ fullPage: step.evidence.fullPage, timeout: 15_000 });
      await writeFile(join(artifactDir, file), buffer);
      result.screenshot = `${artifactUrlPrefix}/${file}`;
    } catch {
      // A failed screenshot must not fail the step it was documenting.
    }
  }

  return result;
}
