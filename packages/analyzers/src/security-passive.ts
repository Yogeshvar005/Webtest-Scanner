import type { Analyzer, AnalyzerContext, CheckResult } from './types';

interface HeaderRule {
  id: string;
  header: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  why: string;
  validate?: (value: string) => string | undefined;
}

/**
 * Response-header checks. Every one of these is observable from a single
 * ordinary GET — nothing here probes, fuzzes or sends unexpected input, so it
 * is safe against a target whose ownership has not been proven.
 */
const HEADER_RULES: HeaderRule[] = [
  {
    id: 'hsts',
    header: 'strict-transport-security',
    name: 'HTTP Strict Transport Security',
    severity: 'high',
    why: 'Without HSTS a network attacker can downgrade the first request to plain HTTP and intercept it.',
    validate: (v) => {
      const maxAge = /max-age=(\d+)/i.exec(v);
      if (!maxAge) return 'max-age is missing';
      if (Number(maxAge[1]) < 15_552_000) return `max-age is ${maxAge[1]}s, below the recommended 15552000s (180 days)`;
      return undefined;
    },
  },
  {
    id: 'csp',
    header: 'content-security-policy',
    name: 'Content Security Policy',
    severity: 'high',
    why: 'CSP is the main defence that limits the damage of an XSS bug.',
    validate: (v) => {
      if (/unsafe-inline/i.test(v) && !/nonce-|sha\d{3}-/i.test(v)) {
        return "policy allows 'unsafe-inline' without a nonce or hash, which removes most of its XSS protection";
      }
      return undefined;
    },
  },
  {
    id: 'x-content-type-options',
    header: 'x-content-type-options',
    name: 'MIME type sniffing disabled',
    severity: 'medium',
    why: 'Without nosniff a browser may execute a file whose declared type says it is not script.',
    validate: (v) => (v.trim().toLowerCase() === 'nosniff' ? undefined : `expected "nosniff", got "${v}"`),
  },
  {
    id: 'x-frame-options',
    header: 'x-frame-options',
    name: 'Clickjacking protection',
    severity: 'medium',
    why: 'Without a frame policy the page can be framed invisibly and its clicks hijacked.',
  },
  {
    id: 'referrer-policy',
    header: 'referrer-policy',
    name: 'Referrer policy',
    severity: 'low',
    why: 'A permissive referrer policy leaks full URLs, including any tokens in them, to third parties.',
  },
];

/** Headers that disclose stack detail an attacker can use for targeting. */
const DISCLOSURE_HEADERS = ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator'];

export const securityPassiveAnalyzer: Analyzer = {
  id: 'security-passive',
  label: 'Security (passive)',
  description:
    'Inspects what the server already returned: transport security, response headers, cookie flags and mixed content. Sends no crafted input, so it is safe on any reachable site.',
  minTier: 0,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    const { page, targetUrl, mainResponse } = context;

    // --- Transport ---
    const isHttps = targetUrl.startsWith('https://');
    checks.push({
      id: 'https',
      name: 'Served over HTTPS',
      status: isHttps ? 'passed' : 'failed',
      severity: 'critical',
      detail: isHttps
        ? 'The site is served over HTTPS.'
        : 'The site is served over plain HTTP. All traffic, including any credentials, travels unencrypted.',
    });

    // --- Response headers ---
    const headers: Record<string, string> = mainResponse
      ? await mainResponse.allHeaders().catch(() => ({}))
      : {};
    const lower: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;

    if (!mainResponse) {
      checks.push({
        id: 'headers',
        name: 'Response headers',
        status: 'skipped',
        severity: 'medium',
        detail: 'No main document response was captured, so headers could not be inspected.',
      });
    } else {
      for (const rule of HEADER_RULES) {
        const value = lower[rule.header];

        if (value === undefined) {
          checks.push({
            id: rule.id,
            name: rule.name,
            status: 'failed',
            severity: rule.severity,
            detail: `${rule.header} is not set. ${rule.why}`,
          });
          continue;
        }

        const problem = rule.validate?.(value);
        checks.push({
          id: rule.id,
          name: rule.name,
          status: problem ? 'warning' : 'passed',
          severity: rule.severity,
          detail: problem ? `${rule.header}: ${problem}. ${rule.why}` : `${rule.header} is set appropriately.`,
          evidence: [`${rule.header}: ${value.slice(0, 200)}`],
        });
      }

      const disclosed = DISCLOSURE_HEADERS.filter((h) => lower[h] !== undefined);
      checks.push({
        id: 'version-disclosure',
        name: 'Software version disclosure',
        status: disclosed.length > 0 ? 'warning' : 'passed',
        severity: 'low',
        detail:
          disclosed.length > 0
            ? 'Response headers disclose server software. This does not create a vulnerability by itself, but it tells an attacker exactly which exploits to try.'
            : 'No server or framework version headers were disclosed.',
        evidence: disclosed.map((h) => `${h}: ${lower[h]}`),
      });
    }

    // --- Cookies ---
    const cookies = await page.context().cookies().catch(() => []);
    if (cookies.length === 0) {
      checks.push({
        id: 'cookie-flags',
        name: 'Cookie security flags',
        status: 'not-applicable',
        severity: 'medium',
        detail: 'The page set no cookies.',
      });
    } else {
      const insecure = cookies.filter((c) => !c.secure && isHttps);
      const notHttpOnly = cookies.filter((c) => !c.httpOnly);
      const laxOrNone = cookies.filter((c) => c.sameSite === 'None');

      checks.push({
        id: 'cookie-secure',
        name: 'Cookies marked Secure',
        status: insecure.length > 0 ? 'failed' : 'passed',
        severity: 'high',
        detail:
          insecure.length > 0
            ? `${insecure.length} cookie(s) lack the Secure flag on an HTTPS site, so they will also be sent over plain HTTP.`
            : 'All cookies are marked Secure.',
        evidence: insecure.map((c) => c.name),
      });

      checks.push({
        id: 'cookie-httponly',
        name: 'Cookies marked HttpOnly',
        status: notHttpOnly.length > 0 ? 'warning' : 'passed',
        severity: 'medium',
        detail:
          notHttpOnly.length > 0
            ? `${notHttpOnly.length} cookie(s) are readable by JavaScript. If any carries a session, an XSS bug becomes account takeover. Analytics cookies legitimately need this.`
            : 'All cookies are HttpOnly.',
        evidence: notHttpOnly.map((c) => c.name),
      });

      checks.push({
        id: 'cookie-samesite',
        name: 'Cookie SameSite policy',
        status: laxOrNone.length > 0 ? 'warning' : 'passed',
        severity: 'medium',
        detail:
          laxOrNone.length > 0
            ? `${laxOrNone.length} cookie(s) use SameSite=None, so they are sent on cross-site requests and need CSRF defences.`
            : 'No cookies use SameSite=None.',
        evidence: laxOrNone.map((c) => c.name),
      });
    }

    // --- Mixed content ---
    if (isHttps) {
      const insecureRefs = await page
        .evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(document.querySelectorAll('img,script,link,iframe,video,audio,source'))) {
            const raw =
              el.getAttribute('src') ?? el.getAttribute('href') ?? '';
            if (raw.startsWith('http://')) out.push(`${el.tagName.toLowerCase()} -> ${raw}`);
          }
          return out.slice(0, 25);
        })
        .catch(() => [] as string[]);

      checks.push({
        id: 'mixed-content',
        name: 'No mixed content',
        status: insecureRefs.length > 0 ? 'failed' : 'passed',
        severity: 'high',
        detail:
          insecureRefs.length > 0
            ? `${insecureRefs.length} subresource(s) are referenced over plain HTTP from an HTTPS page. Browsers block or downgrade these, and they are interceptable.`
            : 'No HTTP subresources were referenced from this HTTPS page.',
        evidence: insecureRefs,
      });
    }

    // --- Forms posting to an insecure endpoint ---
    const insecureForms = await page
      .evaluate(() => {
        const out: string[] = [];
        for (const form of Array.from(document.querySelectorAll('form'))) {
          const action = form.getAttribute('action') ?? '';
          if (action.startsWith('http://')) out.push(action);
        }
        return out.slice(0, 10);
      })
      .catch(() => [] as string[]);

    checks.push({
      id: 'form-action-https',
      name: 'Forms submit over HTTPS',
      status: insecureForms.length > 0 ? 'failed' : 'passed',
      severity: 'critical',
      detail:
        insecureForms.length > 0
          ? 'A form submits to a plain HTTP endpoint, so anything typed into it is sent unencrypted.'
          : 'No form submits to a plain HTTP endpoint.',
      evidence: insecureForms,
    });

    return checks;
  },
};
