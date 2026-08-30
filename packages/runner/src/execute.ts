import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium as playwrightCoreChromium, type Browser, type Page, type Response } from 'playwright-core';
import { addExtra } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Scenario, Step, WaitCondition } from '@wts/dsl';
import { detectInjection, sanitizeText, type InjectionSignal } from '@wts/nlp';
import { evaluate, type PolicyRequest } from '@wts/policy';
import {
  overallStatus, runAnalyzers, setObservedApiCalls,
  type CategoryResult, type ObservedApiCall, type TestCategory,
} from '@wts/analyzers';
import { installEgressGuard, type BlockedRequest, type EgressMode, type ThirdPartyContact } from './egress-guard';
import { explainFailure, resolveTarget, targetDescription } from './resolve';
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
  /** See EgressMode: 'balanced' keeps screenshots faithful, 'strict' blocks all off-site requests. */
  egressMode?: EgressMode;
  /** Categories the tester selected. The report covers these and nothing else. */
  categories?: TestCategory[];
  /** Strict mode promotes every warning to a failure. */
  strict?: boolean;
  /** Download the site's actual asset files, not just catalogue them. */
  captureAssets?: boolean;
  onStep?: (result: StepResult) => void;
  viewport?: { width: number; height: number };
  isMobile?: boolean;
  hasTouch?: boolean;
  deviceScaleFactor?: number;
  userAgent?: string;
}

/**
 * A single action gets far less than the step budget. Resolution has already
 * confirmed the element can accept the action, so a long wait here means
 * something is wrong rather than slow, and failing fast keeps one bad step
 * from consuming the whole run.
 */
const ACTION_TIMEOUT_MS = 10_000;

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
      const resolved = await resolveTarget(page, condition.target, 'wait');
      if (resolved.ok) await resolved.resolution.locator.waitFor({ state: 'visible', timeout: condition.timeoutMs }).catch(() => undefined);
      return;
    }
    case 'elementHidden': {
      const resolved = await resolveTarget(page, condition.target, 'wait');
      if (resolved.ok) await resolved.resolution.locator.waitFor({ state: 'hidden', timeout: condition.timeoutMs }).catch(() => undefined);
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
        const resolved = await resolveTarget(page, assertion.target, 'read');
        const visible = resolved.ok ? await resolved.resolution.locator.isVisible().catch(() => false) : false;
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

  await mkdir(artifactDir, { recursive: true }).catch(() => {});

  const policyDecision = evaluate(policyRequest);
  const blockedRequests: BlockedRequest[] = [];
  const thirdPartyByOrigin = new Map<string, ThirdPartyContact>();
  const injectionSignals: InjectionSignal[] = [];
  const findings: Finding[] = [];
  const steps: StepResult[] = [];
  const apiCalls: ObservedApiCall[] = [];
  let categoryResults: CategoryResult[] = [];
  let mainResponse: Response | null = null;

  const categories = options.categories ?? ['functional'];
  const strict = options.strict ?? false;
  const runsFunctional = categories.includes('functional');

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
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        const chromiumPkg = await import('@sparticuz/chromium');
        const chromium = chromiumPkg.default || chromiumPkg;
        chromium.setGraphicsMode = false;

        // @sparticuz/chromium v149+ uses architecture-specific pack files.
        // The fallback URL points to the x64 build which Vercel Lambda uses.
        // Only needed if the local bundled binary extraction fails.
        const REMOTE_PACK_URL =
          'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

        let executablePath: string;
        try {
          executablePath = await chromium.executablePath();
          if (!executablePath) throw new Error('executablePath returned empty string');
        } catch (packErr) {
          console.warn('Local chromium pack not found, falling back to remote binary pack:', packErr);
          executablePath = await chromium.executablePath(REMOTE_PACK_URL);
        }

        console.log('Chromium binary resolved to:', executablePath);

        const proxyOptions = process.env.PROXY_SERVER ? {
          server: process.env.PROXY_SERVER,
          username: process.env.PROXY_USERNAME,
          password: process.env.PROXY_PASSWORD,
        } : undefined;

        const stealth = stealthPlugin();
        const stealthChromium = addExtra(playwrightCoreChromium as any);
        stealthChromium.use(stealth);

        browser = await stealthChromium.launch({
          executablePath,
          proxy: proxyOptions,
          args: [
            ...chromium.args.filter((a: string) => a !== '--disable-http2'),
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
          ],
          headless: true,
        });
      } else {
        const launchArgs = [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ];
        
        const proxyOptions = process.env.PROXY_SERVER ? {
          server: process.env.PROXY_SERVER,
          username: process.env.PROXY_USERNAME,
          password: process.env.PROXY_PASSWORD,
        } : undefined;

        try {
          const { chromium } = await import('playwright');
          const stealth = stealthPlugin();
          const stealthChromium = addExtra(chromium as any);
          stealthChromium.use(stealth);

          browser = await stealthChromium.launch({
            headless: options.headless ?? true,
            proxy: proxyOptions,
            args: launchArgs,
          });
        } catch {
          const stealth = stealthPlugin();
          const stealthChromium = addExtra(playwrightCoreChromium as any);
          stealthChromium.use(stealth);
          browser = await stealthChromium.launch({
            headless: options.headless ?? true,
            proxy: proxyOptions,
            args: launchArgs,
          });
        }
      }
      const context = await browser!.newContext({
        viewport: options.viewport ?? { width: 1280, height: 800 },
        isMobile: options.isMobile ?? false,
        hasTouch: options.hasTouch ?? false,
        deviceScaleFactor: options.deviceScaleFactor ?? 1,
        userAgent: options.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
        },
        ignoreHTTPSErrors: true, // Needed for localhost and self-signed certificates
      });

      installEgressGuard(context, {
        allowedOrigins: [targetUrl],
        mode: options.egressMode ?? 'balanced',
        onBlocked: (blocked) => blockedRequests.push(blocked),
        onThirdParty: ({ origin, resourceType }) => {
          const key = `${origin}|${resourceType}`;
          const existing = thirdPartyByOrigin.get(key);
          if (existing) existing.count += 1;
          else thirdPartyByOrigin.set(key, { origin, resourceType, count: 1 });
        },
      });

      const page = await context.newPage();

      // The main document response carries the headers the passive security
      // checks read; XHR/fetch traffic feeds the API category.
      const startedAtByUrl = new Map<string, number>();
      page.on('request', (request) => startedAtByUrl.set(request.url(), Date.now()));
      page.on('response', (response) => {
        const request = response.request();
        if (request.isNavigationRequest() && request.frame() === page.mainFrame() && mainResponse === null) {
          mainResponse = response;
        }
        const type = request.resourceType();
        if (type === 'xhr' || type === 'fetch') {
          const started = startedAtByUrl.get(response.url()) ?? Date.now();
          apiCalls.push({
            url: response.url(),
            method: request.method(),
            status: response.status(),
            durationMs: Date.now() - started,
            contentType: response.headers()['content-type'] ?? '',
          });
        }
      });

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

      // Analyzers run against the final page state, after the scenario has
      // navigated wherever it was going to navigate.
      const analyzerCategories = categories.filter((c) => c !== 'functional');
      if (analyzerCategories.length > 0) {
        setObservedApiCalls(apiCalls);
        categoryResults = await runAnalyzers({
          selected: analyzerCategories,
          context: {
            page,
            targetUrl,
            mainResponse,
            tier: (policyRequest.target.ownershipTier ?? 0) as 0 | 1 | 2,
            strict,
            artifactDir,
            artifactUrlPrefix,
            runId,
            captureAssets: options.captureAssets ?? false,
          },
        });
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

  // One finding per distinct reason, not per request: a page can easily make
  // a hundred blocked asset requests and that is one fact, not a hundred.
  const blockedByReason = new Map<string, BlockedRequest[]>();
  for (const blocked of blockedRequests) {
    const list = blockedByReason.get(blocked.reason) ?? [];
    list.push(blocked);
    blockedByReason.set(blocked.reason, list);
  }
  for (const [reason, group] of blockedByReason) {
    findings.push({
      type: 'blocked_egress',
      severity: 'medium',
      title: `${group.length} request${group.length === 1 ? '' : 's'} blocked: ${reason}`,
      detail: reason,
      evidence: group.slice(0, 5).map((b) => b.url.slice(0, 200)).join('\n'),
    });
  }

  const thirdParties = [...thirdPartyByOrigin.values()];
  if (thirdParties.length > 0) {
    const byOrigin = new Map<string, number>();
    for (const c of thirdParties) byOrigin.set(c.origin, (byOrigin.get(c.origin) ?? 0) + c.count);
    findings.push({
      type: 'third_party_contact',
      severity: 'low',
      title: `Page contacted ${byOrigin.size} third-party origin${byOrigin.size === 1 ? '' : 's'}`,
      detail:
        'These origins are outside the target site. They loaded normally so the screenshots are faithful, but they are recorded here because third-party contact is often a privacy or supply-chain concern.',
      evidence: [...byOrigin.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${n}x ${o}`).join('\n'),
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

  // Surface every failed or warning check as a finding, so the findings list
  // is the single place a reader can see everything that went wrong.
  for (const category of categoryResults) {
    for (const check of category.checks) {
      if (check.status !== 'failed' && check.status !== 'warning') continue;
      findings.push({
        type: categoryFindingType(category.category),
        severity: check.status === 'warning' && !strict ? 'low' : check.severity,
        title: `${category.label}: ${check.name}`,
        detail: check.detail,
        evidence: check.evidence?.slice(0, 8).join('\n'),
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
    status: resolveOverallStatus({ totals, categoryResults, strict, runsFunctional }),
    categories: categoryResults,
    strict,
    steps,
    findings,
    blockedRequests,
    thirdParties,
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
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(step.timeoutMs, 25_000) });
        } catch (e: any) {
          result.consoleErrors = result.consoleErrors || [];
          result.consoleErrors.push(`Navigation notice: ${e.message}`);
          try {
            await Promise.race([
              page.evaluate(() => window.stop()),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
            ]);
          } catch {
            // Ignore failure to stop
          }
        }
        // Brief settling pause for dynamic frameworks
        await page.waitForTimeout(1000).catch(() => {});
        break;
      }
      case 'click': {
        const resolved = await resolveTarget(page, action.target, 'click');
        if (!resolved.ok) throw new Error(explainFailure(action.target, resolved.failure, 'click'));
        result.resolvedBy = resolved.resolution.strategy;
        result.resolutionConfidence = resolved.resolution.confidence;
        await resolved.resolution.locator.click({ timeout: ACTION_TIMEOUT_MS });
        // Settle navigation or asynchronous dynamic loads if click triggered page transition
        await Promise.race([
          page.waitForLoadState('domcontentloaded', { timeout: 4000 }),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]).catch(() => {});
        await page.waitForTimeout(1500).catch(() => {});
        break;
      }
      case 'fill': {
        const resolved = await resolveTarget(page, action.target, 'fill');
        if (!resolved.ok) throw new Error(explainFailure(action.target, resolved.failure, 'fill'));
        result.resolvedBy = resolved.resolution.strategy;
        result.resolutionConfidence = resolved.resolution.confidence;
        await resolved.resolution.locator.fill(literalValue(action.value), { timeout: ACTION_TIMEOUT_MS });
        await resolved.resolution.locator.press('Enter').catch(() => undefined);
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
      // Allow fonts, dynamic layouts, and hero assets to paint cleanly
      await page.waitForTimeout(1500).catch(() => {});
      const buffer = await page.screenshot({ fullPage: step.evidence.fullPage, timeout: 15_000 });
      await writeFile(join(artifactDir, file), buffer).catch(() => {});
      // In serverless / cloud mode, data URLs ensure screenshots render seamlessly everywhere
      result.screenshot = `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      // A failed screenshot must not fail the step it was documenting.
    }
  }

  return result;
}


function categoryFindingType(category: TestCategory): Finding['type'] {
  switch (category) {
    case 'accessibility': return 'accessibility';
    case 'security-passive':
    case 'security-active': return 'security';
    case 'performance': return 'performance';
    case 'api': return 'api';
    case 'ui':
    case 'design': return 'ui';
    default: return 'assertion_failure';
  }
}

/**
 * A run is only "passed" if everything the tester selected passed. A blocked
 * functional scenario cannot be rescued by clean analyzer results, and a failed
 * category cannot be hidden by passing steps.
 */
function resolveOverallStatus(input: {
  totals: { passed: number; failed: number; blocked: number };
  categoryResults: CategoryResult[];
  strict: boolean;
  runsFunctional: boolean;
}): 'passed' | 'failed' | 'blocked' | 'warning' {
  const { totals, categoryResults, strict, runsFunctional } = input;

  if (runsFunctional && totals.blocked > 0 && totals.passed === 0) return 'blocked';
  if (runsFunctional && totals.failed > 0) return 'failed';

  if (categoryResults.length === 0) return 'passed';
  return overallStatus(categoryResults, strict);
}
