/**
 * browser.ts - Four-tier stealth browser launch cascade
 *
 * Tier 0 - Remote browser via WebSocket  (REMOTE_BROWSER_WS_ENDPOINT)
 * Tier 1 - playwright-extra + stealth plugin  (Vercel / serverless)
 * Tier 2 - rebrowser-playwright  (local development, HEADED by default)
 *
 * LOCAL MODE: runs HEADED (visible browser window) by default.
 * Headless mode leaks CSS media queries, runtime.enabledFeatures, and
 * HiDPI timing signals that GitHub/Cloudflare detect immediately.
 * A real Mac + residential IP + headed Chrome is essentially
 * indistinguishable from a human user.
 */

import { chromium as playwrightCoreChromium, type Browser } from 'playwright-core';
import { addExtra } from 'playwright-extra';
// @ts-ignore - CJS default export
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const playwrightExtra = addExtra(playwrightCoreChromium);
playwrightExtra.use(StealthPlugin());

/**
 * Maximally aggressive anti-detection flags.
 * Mimics a real Mac user running Chrome 131 on a MacBook Pro 14".
 */
const STEALTH_ARGS = [
  // ---- Core anti-detection (must come first) ----
  '--disable-blink-features=AutomationControlled',
  '--exclude-switches=enable-automation',
  '--disable-infobars',

  // ---- Kill every flag that leaks to JS as an automation signal ----
  '--no-default-browser-check',
  '--no-first-run',
  '--disable-default-apps',
  '--disable-translate',
  '--disable-sync',
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-domain-reliability',
  '--disable-component-update',
  '--disable-features=IsolateOrigins,site-per-process,TranslateUI',
  '--metrics-recording-only',
  '--safebrowsing-disable-auto-update',
  '--password-store=basic',
  '--use-mock-keychain',

  // ---- Sandbox (still needed on Linux / Docker) ----
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',

  // ---- Enable GPU so WebGL/canvas fingerprints look REAL ----
  '--enable-webgl',
  '--use-gl=swiftshader',
  '--enable-accelerated-2d-canvas',

  // ---- Realistic window: MacBook Pro 14" native resolution ----
  '--window-size=1512,982',
  '--window-position=0,0',
  '--start-maximized',

  // ---- Language / locale identical to a real en-US Mac user ----
  '--lang=en-US',
  '--accept-lang=en-US,en;q=0.9',
];

export interface LaunchOpts {
  headless?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}

export interface LaunchResult {
  browser: Browser;
  /**
   * true when the browser is a remote connection (any WS provider).
   * The egress guard is skipped in this mode.
   */
  usingCDP: boolean;
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

  // -------------------------------------------------------------------------
  // TIER 0 - Remote browser via WebSocket
  // -------------------------------------------------------------------------
  const remoteEndpoint =
    process.env.REMOTE_BROWSER_WS_ENDPOINT ||
    process.env.BRIGHT_DATA_WS_ENDPOINT;

  if (remoteEndpoint) {
    console.log(`[browser] tier=remote-ws - connecting to ${remoteEndpoint.replace(/:[^:@]+@/, ':***@')}`);

    // Strategy A - Playwright server protocol (browserless v2, npx playwright run-server)
    try {
      const browser = await playwrightCoreChromium.connect(remoteEndpoint, { timeout: 30_000 });
      console.log('[browser] connected via Playwright server protocol');
      return { browser, usingCDP: true, tier: 'remote-ws' };
    } catch { /* try CDP */ }

    // Strategy B - Raw CDP WebSocket (browserless v1, Steel, Bright Data, Chromium debug port)
    try {
      const browser = await playwrightCoreChromium.connectOverCDP(remoteEndpoint, { timeout: 30_000 });
      console.log('[browser] connected via raw CDP');
      return { browser, usingCDP: true, tier: 'remote-ws' };
    } catch (err) {
      console.warn('[browser] Remote browser connection failed, falling through to local tiers:', err);
    }
  }

  // -------------------------------------------------------------------------
  // TIER 1 - playwright-extra + stealth plugin on Vercel / Lambda
  // -------------------------------------------------------------------------
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log('[browser] tier=stealth-vercel - playwright-extra + stealth + @sparticuz/chromium');
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

  // -------------------------------------------------------------------------
  // TIER 2 - rebrowser-playwright (C++-level stealth, local only)
  //
  // DEFAULT: headless=false (headed / visible window).
  // A headed Chrome on a Mac with a residential IP is nearly impossible for
  // bot-detection to distinguish from a real user. Headless mode is only used
  // if the caller explicitly passes headless:true (e.g. a CI environment).
  // -------------------------------------------------------------------------
  const localHeadless = opts.headless ?? false;
  console.log(`[browser] tier=rebrowser-local - headed=${!localHeadless} (AGGRESSIVE LOCAL STEALTH MODE)`);

  try {
    const { chromium: rebrowser } = await import('rebrowser-playwright');
    const browser = await rebrowser.launch({
      headless: localHeadless,
      proxy: proxyOptions,
      args: STEALTH_ARGS,
    }) as unknown as Browser;
    return { browser, usingCDP: false, tier: 'rebrowser-local' };
  } catch {
    console.log('[browser] tier=stealth-local - rebrowser unavailable, using playwright-extra');
    const browser = await playwrightExtra.launch({
      headless: localHeadless,
      proxy: proxyOptions,
      args: STEALTH_ARGS,
    });
    return { browser, usingCDP: false, tier: 'stealth-local' };
  }
}
