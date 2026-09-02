/**
 * browser.ts — Four-tier stealth browser launch cascade
 *
 * Tier 0 — Remote browser via WebSocket  (REMOTE_BROWSER_WS_ENDPOINT)
 *   Connects to any remote browser that speaks Playwright WS protocol or raw CDP.
 *   Compatible providers (all free/self-hostable):
 *     • browserless/browserless  — Docker, free self-host, also has free cloud tier
 *     • steel-dev/steel-browser  — open source, free cloud tier
 *     • `npx playwright run-server` — zero-cost, built into Playwright itself
 *     • Chromium --remote-debugging-port — raw CDP, zero cost
 *   Also works with paid providers: Bright Data (set BRIGHT_DATA_WS_ENDPOINT alias).
 *
 * Tier 1 — playwright-extra + stealth plugin  (Vercel / serverless)
 *   Patches 20 JS fingerprint signals at browser-context level.
 *   Works with @sparticuz/chromium on Vercel Lambda. Free, zero infra.
 *
 * Tier 2 — rebrowser-playwright  (local development)
 *   Fork of Playwright with C++-level stealth patches applied to Chromium.
 *   Falls back to playwright-extra if rebrowser is unavailable.
 */

import { chromium as playwrightCoreChromium, type Browser } from 'playwright-core';
// playwright-extra is a drop-in wrapper; register stealth plugin once at module load.
import { chromium as playwrightExtra } from 'playwright-extra';
// @ts-ignore — CJS default export
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

playwrightExtra.use(StealthPlugin());

/** Args that make the browser appear less automated, applied in local tiers. */
const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--window-size=1280,800',
];

export interface LaunchOpts {
  headless?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}

export interface LaunchResult {
  browser: Browser;
  /**
   * true when the browser is a remote connection (any WS provider).
   * The egress guard is skipped in this mode — routing is handled by the
   * remote browser. Installing a local route handler on a remote context
   * has no effect and produces confusing errors.
   */
  usingCDP: boolean;
  /** Human-readable label for log output and observability. */
  tier: 'remote-ws' | 'stealth-vercel' | 'rebrowser-local' | 'stealth-local';
}

/**
 * Launch (or connect to) a browser using the best available tier.
 * Always returns a Playwright-compatible Browser instance.
 */
export async function launchBrowser(opts: LaunchOpts = {}): Promise<LaunchResult> {
  const proxyOptions = opts.proxy ?? (process.env.PROXY_SERVER
    ? {
        server: process.env.PROXY_SERVER,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      }
    : undefined);

  // ─────────────────────────────────────────────────────────────────────
  // TIER 0 — Remote browser via WebSocket
  //
  // REMOTE_BROWSER_WS_ENDPOINT  ← provider-agnostic (recommended)
  // BRIGHT_DATA_WS_ENDPOINT     ← legacy alias kept for backward compat
  //
  // Supported providers:
  //   Free / open source:
  //     browserless (self-hosted):  ws://localhost:3000
  //     Steel browser:              ws://localhost:3000
  //     Playwright server:          ws://localhost:9222  (npx playwright run-server)
  //     Chromium debug port:        http://localhost:9222 (--remote-debugging-port)
  //   Paid:
  //     Bright Data:  wss://brd-customer-XXXXX:PASS@brd.superproxy.io:9222
  //     Anchorbrowser, Nstbrowser, etc.
  // ─────────────────────────────────────────────────────────────────────
  const remoteEndpoint =
    process.env.REMOTE_BROWSER_WS_ENDPOINT ||
    process.env.BRIGHT_DATA_WS_ENDPOINT; // backward-compat alias

  if (remoteEndpoint) {
    console.log(`[browser] tier=remote-ws — connecting to ${remoteEndpoint.replace(/:[^:@]+@/, ':***@')}`);

    // Strategy A — Playwright server protocol
    // Works with: `npx playwright run-server`, browserless v2, some Steel configs.
    // playwright.connect() uses Playwright's own multiplexed WS protocol which
    // is more reliable than raw CDP for multi-page workflows.
    try {
      const browser = await playwrightCoreChromium.connect(remoteEndpoint, {
        timeout: 30_000,
      });
      console.log('[browser] connected via Playwright server protocol');
      return { browser, usingCDP: true, tier: 'remote-ws' };
    } catch {
      // Not a Playwright server endpoint — try raw CDP next.
    }

    // Strategy B — Raw CDP WebSocket
    // Works with: browserless v1, Steel, Bright Data, Chromium --remote-debugging-port.
    try {
      const browser = await playwrightCoreChromium.connectOverCDP(remoteEndpoint, {
        timeout: 30_000,
      });
      console.log('[browser] connected via raw CDP');
      return { browser, usingCDP: true, tier: 'remote-ws' };
    } catch (err) {
      console.warn('[browser] Remote browser connection failed, falling through to local tiers:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIER 1 — playwright-extra + stealth plugin on Vercel / Lambda
  // ─────────────────────────────────────────────────────────────────────
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log('[browser] tier=stealth-vercel — playwright-extra + stealth + @sparticuz/chromium');
    const chromiumPkg = await import('@sparticuz/chromium');
    const chromium = chromiumPkg.default || chromiumPkg;
    chromium.setGraphicsMode = false;

    const REMOTE_PACK_URL =
      'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

    let executablePath: string;
    try {
      executablePath = await chromium.executablePath();
      if (!executablePath) throw new Error('executablePath returned empty string');
    } catch {
      console.warn('[browser] Local chromium pack not found, using remote binary pack');
      executablePath = await chromium.executablePath(REMOTE_PACK_URL);
    }

    const browser = await playwrightExtra.launch({
      executablePath,
      proxy: proxyOptions,
      args: [
        ...chromium.args.filter((a: string) => a !== '--disable-http2'),
        ...STEALTH_ARGS,
        '--single-process',
      ],
      headless: true,
    });

    return { browser, usingCDP: false, tier: 'stealth-vercel' };
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIER 2 — rebrowser-playwright (C++-level stealth, local only)
  // ─────────────────────────────────────────────────────────────────────
  try {
    console.log('[browser] tier=rebrowser-local — rebrowser-playwright C++ stealth');
    const { chromium: rebrowser } = await import('rebrowser-playwright');
    const browser = await rebrowser.launch({
      headless: opts.headless ?? true,
      proxy: proxyOptions,
      args: STEALTH_ARGS,
    }) as unknown as Browser;
    return { browser, usingCDP: false, tier: 'rebrowser-local' };
  } catch {
    // rebrowser not installed or failed — fall back to playwright-extra locally.
    console.log('[browser] tier=stealth-local — rebrowser unavailable, using playwright-extra');
    const browser = await playwrightExtra.launch({
      headless: opts.headless ?? true,
      proxy: proxyOptions,
      args: STEALTH_ARGS,
    });
    return { browser, usingCDP: false, tier: 'stealth-local' };
  }
}
