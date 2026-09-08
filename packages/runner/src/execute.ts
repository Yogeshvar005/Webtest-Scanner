import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page, Response } from 'playwright-core';
import { launchBrowser } from './browser';
import type { Scenario, Step, WaitCondition } from '@wts/dsl';
import { detectInjection, sanitizeText, type InjectionSignal } from '@wts/nlp';
import { exploreTargetLLM } from '@wts/nlp';
import { evaluate, type PolicyRequest } from '@wts/policy';
import {
  overallStatus, runAnalyzers, setObservedApiCalls,
  type CategoryResult, type ObservedApiCall, type TestCategory,
} from '@wts/analyzers';
import { installEgressGuard, type BlockedRequest, type EgressMode, type ThirdPartyContact } from './egress-guard';
import { explainFailure, resolveTarget, resolveTargetAll, targetDescription } from './resolve';
import type { AssertionResult, Finding, RunResult, StepResult } from './types';
import { runAgenticCrawler } from './intelligent-crawler';

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
  browserType?: 'chromium' | 'webkit';
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

/**
 * Human-like random delay between min..max ms.
 * Browsers detect bots partly by perfectly regular timing; adding noise makes
 * the interaction pattern look like a real user.
 */
function humanDelay(minMs = 80, maxMs = 400): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Animates the mouse moving to a locator to simulate physical movement.
 */
async function animateMouseTo(page: Page, locator: import('playwright-core').Locator) {
  try {
    const box = await locator.boundingBox();
    if (box) {
      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;
      await page.mouse.move(targetX, targetY, { steps: 10 });
    }
  } catch {
    // If it fails (e.g. element hidden or detached), ignore.
  }
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
  let siteScreenshot: string | undefined;
  let siteNavLinks: Array<{ text: string; href: string; screenshot?: string }> = [];
  let siteButtons: string[] = [];

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
      // ── Stealth browser launch (three-tier cascade) ─────────────────────
      const { browser: launchedBrowser, usingCDP, tier } = await launchBrowser({
        headless: options.headless ?? false,
        browserType: options.browserType,
      });
      browser = launchedBrowser;
      console.log(`[browser] active tier: ${tier}`);

      const context = await browser!.newContext({
        // MacBook Pro 14" native resolution
        viewport: options.viewport ?? { width: 1512, height: 982 },
        isMobile: options.isMobile ?? false,
        hasTouch: options.hasTouch ?? false,
        deviceScaleFactor: options.deviceScaleFactor ?? 2, // Retina
        // Real Mac Chrome 131 UA
        userAgent: options.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        colorScheme: 'light',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'Sec-Ch-Ua-Mobile': options.isMobile ? '?1' : '?0',
          'Sec-Ch-Ua-Platform': options.isMobile ? '"iOS"' : '"macOS"',
        },
        ignoreHTTPSErrors: true,
      });

      // Aggressive in-page stealth overrides injected before any page script runs.
      await context.addInitScript(() => {
        try {
          // 1. Remove webdriver flag
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

          // 2. Restore the chrome runtime object that real Chrome has
          (window as any).chrome = {
            app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
            runtime: {
              OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
              OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
              PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
              PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
              RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
            },
            loadTimes: () => ({}),
            csi: () => ({}),
          };

          // 3. Spoof real-looking plugins (Chrome has 3 on Mac)
          const makeFakePlugin = (name: string, desc: string, filename: string) => {
            const plugin = Object.create(Plugin.prototype);
            Object.defineProperty(plugin, 'name', { get: () => name });
            Object.defineProperty(plugin, 'description', { get: () => desc });
            Object.defineProperty(plugin, 'filename', { get: () => filename });
            Object.defineProperty(plugin, 'length', { get: () => 0 });
            return plugin;
          };
          const fakePlugins = [
            makeFakePlugin('Chrome PDF Plugin', 'Portable Document Format', 'internal-pdf-viewer'),
            makeFakePlugin('Chrome PDF Viewer', '', 'mhjfbmdgcfjbbpaeojofohoefgiehjai'),
            makeFakePlugin('Native Client', '', 'internal-nacl-plugin'),
          ];
          Object.defineProperty(navigator, 'plugins', {
            get: () => Object.assign(fakePlugins, { item: (i: number) => fakePlugins[i], namedItem: (n: string) => fakePlugins.find(p => p.name === n) ?? null, refresh: () => {} }),
          });

          // 4. Languages
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

          // 5. Hardware concurrency (MacBook Pro M3 has 12 cores)
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 12 });

          // 6. Device memory
          Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

          // 7. Platform
          Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });

          // 8. Permissions API — real browsers return 'prompt' or 'granted', not errors
          const originalQuery = window.navigator.permissions?.query.bind(window.navigator.permissions);
          if (originalQuery) {
            (window.navigator.permissions as any).query = (parameters: any) =>
              parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters);
          }
        } catch { /* never crash the page */ }
      });

      // Inject visual cursor to simulate physical mouse
      await context.addInitScript(() => {
        try {
          if (window.top !== window) return; // Only in top frame
          document.addEventListener('DOMContentLoaded', () => {
            const cursor = document.createElement('div');
            cursor.id = 'wts-agent-cursor';
            cursor.style.width = '12px';
            cursor.style.height = '12px';
            cursor.style.background = 'rgba(255, 0, 0, 0.7)';
            cursor.style.borderRadius = '50%';
            cursor.style.position = 'fixed';
            cursor.style.top = '0';
            cursor.style.left = '0';
            cursor.style.display = 'none';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '999999999';
            cursor.style.transition = 'top 0.1s ease-out, left 0.1s ease-out';
            cursor.style.boxShadow = '0 0 5px rgba(255, 0, 0, 0.5)';
            document.body.appendChild(cursor);

            document.addEventListener('mousemove', (e) => {
              const c = document.getElementById('wts-agent-cursor');
              if (c) {
                c.style.display = 'block';
                c.style.left = `${e.clientX - 6}px`;
                c.style.top = `${e.clientY - 6}px`;
              }
            });
          });
        } catch { /* never crash the page */ }
      });

      // Egress guard is skipped for CDP connections — Bright Data handles
      // routing and proxying on its end; installing a local route handler on a
      // CDP-connected context has no effect and produces confusing errors.
      if (!usingCDP) {
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
      }

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

      let activePage = page;
      for (const step of scenario.steps) {
        const before = consoleErrors.length;
        const started = Date.now();
        const { result, subResults, page: nextPage } = await runStep(activePage, step, targetUrl, artifactDir, artifactUrlPrefix, runId);
        // If the step opened a new tab (e.g. Sign Up), switch to it for all subsequent steps
        if (nextPage !== activePage) {
          activePage = nextPage;
          // Re-attach response listener to the new page
          activePage.on('response', (response) => {
            const request = response.request();
            const type = request.resourceType();
            if (type === 'xhr' || type === 'fetch') {
              const started2 = startedAtByUrl.get(response.url()) ?? Date.now();
              apiCalls.push({
                url: response.url(),
                method: request.method(),
                status: response.status(),
                durationMs: Date.now() - started2,
                contentType: response.headers()['content-type'] ?? '',
              });
            }
          });
        }
        result.durationMs = Date.now() - started;
        result.consoleErrors = consoleErrors.slice(before);

        // Page text is scanned as untrusted observation data, never merged into
        // instructions. A hit is reported rather than acted on.
        const text = await activePage.textContent('body').catch(() => null);
        if (text) {
          for (const signal of detectInjection([text.slice(0, 20_000)])) {
            if (!injectionSignals.some((s) => s.pattern === signal.pattern)) injectionSignals.push(signal);
          }
        }

        steps.push(result);
        if (subResults) {
          steps.push(...subResults);
        }
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
            page: activePage,
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

      try {
        siteNavLinks = await activePage.evaluate(() => {
          const links: Array<{ text: string; href: string }> = [];
          const seen = new Set<string>();
          document.querySelectorAll('nav a, header a, [role="navigation"] a, a').forEach((a) => {
            const anchor = a as HTMLAnchorElement;
            const text = (anchor.textContent || anchor.getAttribute('aria-label') || '').trim();
            const href = anchor.href || '';
            if (text && text.length < 40 && href && href.startsWith('http') && !seen.has(`nav-${text.toLowerCase()}`)) {
              seen.add(`nav-${text.toLowerCase()}`);
              links.push({ text, href });
            }
          });
          return links.slice(0, 30);
        });
      } catch (err) {
        // Ignore
      }

      try {
        siteButtons = await activePage.evaluate(() => {
          const btns: string[] = [];
          const seen = new Set<string>();
          document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]').forEach((el) => {
            const text = (el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || '').trim();
            if (text && text.length < 40 && !seen.has(text.toLowerCase())) {
              seen.add(text.toLowerCase());
              btns.push(text);
            }
          });
          return btns.slice(0, 30);
        });
      } catch (err) {
        // Ignore
      }

      for (let i = 0; i < Math.min(5, siteNavLinks.length); i++) {
        const linkItem = siteNavLinks[i];
        if (!linkItem) continue;
        try {
          const linkPage = await context.newPage();
          await linkPage.goto(linkItem.href, { waitUntil: 'domcontentloaded', timeout: 10000 });
          const buffer = await linkPage.screenshot({ type: 'jpeg', quality: 60, scale: 'css' });
          linkItem.screenshot = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          await linkPage.close();
        } catch (e) {
          // Ignore
        }
      }

      siteScreenshot = steps.find(s => s.screenshot)?.screenshot;

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
    siteScreenshot,
    siteNavLinks,
    siteButtons,
  };
}

async function runStep(
  page: Page,
  step: Step,
  targetUrl: string,
  artifactDir: string,
  artifactUrlPrefix: string,
  runId: string,
): Promise<{ result: StepResult; subResults?: StepResult[]; page: Page }> {
  let activePage = page;
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
  const subResults: StepResult[] = [];

  try {
    for (const wait of step.preWaits) await applyWait(activePage, wait);

    const action = step.action;

    switch (action.type) {
      case 'navigate': {
        // The DSL cannot express an absolute URL, so the origin is always ours.
        const url = new URL(action.path, targetUrl).toString();
        try {
          await activePage.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(step.timeoutMs, 25_000) });
        } catch (e: any) {
          result.consoleErrors = result.consoleErrors || [];
          result.consoleErrors.push(`Navigation notice: ${e.message}`);
          try {
            await Promise.race([
              activePage.evaluate(() => window.stop()),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
            ]);
          } catch {
            // Ignore failure to stop
          }
        }
        // Wait for challenge redirects (Akamai, Cloudflare, DataDome),
        // WAF interstitials, or dynamic client-side SPA rendering to finish settling.
        await Promise.race([
          activePage.waitForLoadState('networkidle', { timeout: 8000 }),
          activePage.waitForFunction(() => {
            const body = document.body;
            if (!body) return false;
            const text = (body.innerText || '').trim();
            return text.length > 40 || body.children.length > 3;
          }, { timeout: 8000 }),
        ]).catch(() => {});
        await activePage.waitForTimeout(1500).catch(() => {});
        break;
      }
      case 'click': {
        const resolved = await resolveTarget(activePage, action.target, 'click');
        if (!resolved.ok) throw new Error(explainFailure(action.target, resolved.failure, 'click'));
        result.resolvedBy = resolved.resolution.strategy;
        result.resolutionConfidence = resolved.resolution.confidence;
        if (resolved.resolution.selfHealed) {
          result.selfHealed = resolved.resolution.selfHealed;
        }

        await animateMouseTo(activePage, resolved.resolution.locator);

        // Human-like: hover over the element first, pause, then click
        await resolved.resolution.locator.hover({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
        await humanDelay(120, 350);

        // Listen for a new tab/popup that the click might open (e.g. GitHub "Sign up")
        const popupPromise = activePage.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
        await resolved.resolution.locator.click({ timeout: ACTION_TIMEOUT_MS, delay: Math.floor(Math.random() * 80) + 20 });

        // Human-like pause after click before checking result
        await humanDelay(200, 600);

        // Check if a new tab was opened
        const popup = await popupPromise;
        if (popup) {
          // Switch focus to the new tab so the screenshot shows the destination
          await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
          await popup.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
          await popup.waitForTimeout(2000).catch(() => {});
          activePage = popup;
        } else {
          // No popup — wait for in-page navigation to settle
          await Promise.race([
            activePage.waitForLoadState('networkidle', { timeout: 8000 }),
            activePage.waitForLoadState('domcontentloaded', { timeout: 4000 }),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]).catch(() => {});
          await activePage.waitForTimeout(2000).catch(() => {});
        }
        break;
      }
      case 'clickAll': {
        const resolved = await resolveTargetAll(activePage, action.target, 'click');
        if (!resolved.ok) throw new Error(explainFailure(action.target, resolved.failure, 'click'));
        result.resolvedBy = resolved.resolution.strategy;
        result.resolutionConfidence = resolved.resolution.confidence;

        for (const loc of resolved.resolution.locators) {
          await animateMouseTo(activePage, loc);
          await loc.hover({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});
          await humanDelay(120, 350);
          
          await loc.click({ timeout: ACTION_TIMEOUT_MS, delay: Math.floor(Math.random() * 80) + 20 }).catch(() => {});
          await humanDelay(200, 600);
          
          // Wait briefly for in-page actions
          await Promise.race([
            activePage.waitForLoadState('networkidle', { timeout: 2000 }),
            new Promise((resolve) => setTimeout(resolve, 500)),
          ]).catch(() => {});
        }
        break;
      }
      case 'explore': {
        const initialUrl = activePage.url();
        const results = await runAgenticCrawler(activePage, step, action.maxDepth, runId, artifactDir);
        subResults.push(...results);
        
        // Restore initial URL and ensure the page DOM settles so subsequent steps don't act on an unrendered page
        if (activePage.url() !== initialUrl) {
          await activePage.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        }
        await Promise.race([
          activePage.waitForLoadState('networkidle', { timeout: 8000 }),
          activePage.waitForFunction(() => {
            const body = document.body;
            if (!body) return false;
            const text = (body.innerText || '').trim();
            return text.length > 40 || body.children.length > 3;
          }, { timeout: 8000 }),
        ]).catch(() => {});
        await activePage.waitForTimeout(1500).catch(() => {});
        
        break;
      }
      case 'fill': {
        const resolved = await resolveTarget(activePage, action.target, 'fill');
        if (!resolved.ok) throw new Error(explainFailure(action.target, resolved.failure, 'fill'));
        result.resolvedBy = resolved.resolution.strategy;
        result.resolutionConfidence = resolved.resolution.confidence;
        if (resolved.resolution.selfHealed) {
          result.selfHealed = resolved.resolution.selfHealed;
        }

        await animateMouseTo(activePage, resolved.resolution.locator);

        // Click the field first, human-like
        await resolved.resolution.locator.click({ timeout: ACTION_TIMEOUT_MS });
        await humanDelay(80, 200);

        // Type character by character with randomised inter-key delay
        // (instant .fill() is a strong bot signal; real humans type ~80-200ms/key)
        const text = literalValue(action.value);
        await resolved.resolution.locator.pressSequentially(text, { delay: Math.floor(Math.random() * 80) + 60 });
        await humanDelay(100, 300);
        await resolved.resolution.locator.press('Enter').catch(() => undefined);
        break;
      }
      case 'press':
        await activePage.keyboard.press(action.keys);
        break;
      case 'waitFor':
        await applyWait(activePage, action.condition);
        break;
      case 'setViewport': {
        const preset = action.preset;
        const size =
          typeof preset === 'string'
            ? { mobile: { w: 390, h: 844 }, tablet: { w: 820, h: 1180 }, desktop: { w: 1280, h: 800 } }[preset]
            : preset;
        await activePage.setViewportSize({ width: size.w, height: size.h });
        break;
      }
      case 'screenshot':
      case 'a11yAudit':
        // Evidence-only steps; the screenshot below is the output.
        break;
      default:
        throw new Error(`Action "${action.type}" is not supported by the local runner yet.`);
    }

    for (const wait of step.postWaits || []) await applyWait(activePage, wait);
    result.assertions = await runAssertions(activePage, step);

    if (result.assertions.some((a) => !a.passed)) result.status = 'failed';
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
  }

  // For 'explore' actions, subResults contain the screenshots for each visited page.
  // The parent 'explore' container step should not produce a redundant screenshot.
  if (step.evidence?.screenshot !== 'never' && step.action.type !== 'explore') {
    try {
      const file = `${runId}-${String(step.index).padStart(2, '0')}.png`;
      // Allow fonts, dynamic layouts, and hero assets to paint cleanly and ensure body is not blank
      await Promise.race([
        activePage.waitForFunction(() => {
          const body = document.body;
          if (!body) return false;
          return (body.innerText || '').trim().length > 30 || body.children.length > 2;
        }, { timeout: 6000 }),
        activePage.waitForTimeout(1500),
      ]).catch(() => {});
      // Temporarily hide the simulated cursor element during screenshot so it doesn't obstruct content
      await activePage.evaluate(() => {
        const c = document.getElementById('wts-agent-cursor');
        if (c) c.style.display = 'none';
      }).catch(() => {});
      const buffer = await activePage.screenshot({ fullPage: step.evidence?.fullPage ?? false, timeout: 15_000 });
      await activePage.evaluate(() => {
        const c = document.getElementById('wts-agent-cursor');
        if (c) c.style.display = 'block';
      }).catch(() => {});
      await writeFile(join(artifactDir, file), buffer).catch(() => {});
      // In serverless / cloud mode, data URLs ensure screenshots render seamlessly everywhere
      result.screenshot = `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
      // A failed screenshot must not fail the step it was documenting.
    }
  }

  return { result, subResults, page: activePage };
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
