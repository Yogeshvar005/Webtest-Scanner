/**
 * browser.ts — Three-tier stealth browser launch cascade
 *
 * Tier 1 (highest stealth) — Bright Data Scraping Browser via CDP
 *   Real Chrome + rotating residential proxies + auto-CAPTCHA solving.
 *   Activated when BRIGHT_DATA_WS_ENDPOINT env var is set.
 *   Defeats virtually all bot-detection systems.
 *
 * Tier 2 — playwright-extra + stealth plugin (Vercel / serverless)
 *   Patches 20 JS fingerprint signals at the browser-context level.
 *   Works with @sparticuz/chromium on AWS Lambda / Vercel.
 *   Free, zero infra change.
 *
 * Tier 3 — rebrowser-playwright (local development)
 *   Fork of Playwright with C++-level stealth patches applied to Chromium.
 *   Harder for detection services to see through than JS-only patches.
 *   Falls back to playwright-extra if rebrowser is unavailable.
 */

import { chromium as playwrightCoreChromium, type Browser } from 'playwright-core';
// playwright-extra is a drop-in wrapper; register stealth plugin once at module load.
import { chromium as playwrightExtra } from 'playwright-extra';
// @ts-ignore — CJS default export
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

playwrightExtra.use(StealthPlugin());

/** Args that make the browser appear less automated, applied in tiers 2 & 3. */
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
   * true when the connection is a remote CDP session (Bright Data).
   * The egress guard must be skipped in this mode because routing and proxying
   * are handled by the remote browser — installing a local route handler on a
   * CDP-connected context has no effect and produces confusing errors.
   */
  usingCDP: boolean;
  /** Human-readable label for log output. */
  tier: 'bright-data' | 'stealth-vercel' | 'rebrowser-local' | 'stealth-local';
}

/**
 * Launch (or connect to) a browser using the best stealth tier available in
 * the current environment. Always returns a Playwright-compatible Browser
 * instance regardless of which tier was selected.
 */
export async function launchBrowser(opts: LaunchOpts = {}): Promise<LaunchResult> {
  const proxyOptions = opts.proxy ?? (process.env.PROXY_SERVER
    ? {
        server: process.env.PROXY_SERVER,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      }
    : undefined);

  // ──────────────────────────────────────────────────────────────
  // TIER 1 — Bright Data Scraping Browser (CDP WebSocket)
  // ──────────────────────────────────────────────────────────────
  const brightDataEndpoint = process.env.BRIGHT_DATA_WS_ENDPOINT;
  if (brightDataEndpoint) {
    console.log('[browser] tier=bright-data — connecting to Bright Data Scraping Browser');
    try {
      // connectOverCDP works with any standard CDP endpoint.
      // Bright Data provides real Chrome + residential proxies + CAPTCHA solving.
      const browser = await playwrightCoreChromium.connectOverCDP(brightDataEndpoint, {
        timeout: 30_000,
      });
      return { browser, usingCDP: true, tier: 'bright-data' };
    } catch (err) {
      console.warn('[browser] Bright Data connection failed, falling through to next tier:', err);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // TIER 2 — playwright-extra + stealth plugin on Vercel / Lambda
  // ──────────────────────────────────────────────────────────────
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

    // playwright-extra wraps chromium launch and applies all stealth patches
    // registered above before the browser context is created.
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

  // ──────────────────────────────────────────────────────────────
  // TIER 3 — rebrowser-playwright (C++-level stealth, local only)
  // ──────────────────────────────────────────────────────────────
  try {
    console.log('[browser] tier=rebrowser-local — rebrowser-playwright C++ stealth');
    // Dynamic import so the package is optional — if missing, catch handles it.
    const { chromium: rebrowser } = await import('rebrowser-playwright');
    const browser = await rebrowser.launch({
      headless: opts.headless ?? true,
      proxy: proxyOptions,
      args: STEALTH_ARGS,
    }) as unknown as Browser;
    return { browser, usingCDP: false, tier: 'rebrowser-local' };
  } catch {
    // rebrowser not available or failed — fall back to playwright-extra locally.
    console.log('[browser] tier=stealth-local — rebrowser unavailable, using playwright-extra');
    const browser = await playwrightExtra.launch({
      headless: opts.headless ?? true,
      proxy: proxyOptions,
      args: STEALTH_ARGS,
    });
    return { browser, usingCDP: false, tier: 'stealth-local' };
  }
}
