import type { Analyzer, AnalyzerContext, CheckResult } from './types';

/**
 * A benign marker containing the characters that matter for HTML injection.
 * It is not a payload: it executes nothing, changes nothing, and is only used
 * to observe whether the application encodes what it reflects.
 */
const MARKER = 'wts9x7q<>"\'';

/**
 * Active security probing.
 *
 * Requires ownership tier 2 (DNS-verified plus a signed attestation) because
 * it sends input the site did not ask for. Every check here is
 * detection-oriented — it observes how the application handles a marker — and
 * never attempts exploitation, data modification, or credential guessing.
 */
export const securityActiveAnalyzer: Analyzer = {
  id: 'security-active',
  label: 'Security (active probing)',
  description:
    'Sends benign markers to observe how the application encodes reflected input, handles unexpected parameters, and responds to malformed requests. Detection only — never exploitation.',
  minTier: 2,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const { page, targetUrl } = context;
    const checks: CheckResult[] = [];

    // --- Reflected-input encoding ---
    try {
      const probeUrl = new URL(targetUrl);
      probeUrl.searchParams.set('wtsprobe', MARKER);

      const response = await page.goto(probeUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 });
      const html = (await page.content()).slice(0, 500_000);

      const rawReflected = html.includes(MARKER);
      const encodedReflected = html.includes('wts9x7q&lt;') || html.includes('wts9x7q&#60;') || html.includes('wts9x7q%3C');

      checks.push({
        id: 'reflected-encoding',
        name: 'Reflected input is HTML-encoded',
        status: rawReflected ? 'failed' : 'passed',
        severity: rawReflected ? 'high' : 'medium',
        detail: rawReflected
          ? 'A query parameter was reflected into the page with its angle brackets and quotes intact. That is the precondition for reflected XSS. Confirm the context it lands in before treating it as exploitable.'
          : encodedReflected
            ? 'The parameter was reflected but correctly encoded.'
            : 'The parameter was not reflected into the response.',
        evidence: rawReflected ? [`?wtsprobe=${MARKER}`] : undefined,
      });

      checks.push({
        id: 'unexpected-param-handling',
        name: 'Unexpected parameters handled gracefully',
        status: response && response.status() >= 500 ? 'failed' : 'passed',
        severity: 'medium',
        detail: response
          ? `The server returned ${response.status()} for a request carrying an unknown query parameter.`
          : 'No response was captured for the probe request.',
      });

      // --- Error verbosity ---
      const stackSignals = [
        'stack trace', 'Traceback (most recent call last)', 'at java.', 'System.NullReferenceException',
        'org.springframework', 'nginx/1.', 'PHP Warning', 'PHP Fatal error', 'SQLSTATE',
        'ORA-0', 'You have an error in your SQL syntax',
      ].filter((signal) => html.includes(signal));

      checks.push({
        id: 'error-verbosity',
        name: 'Errors do not leak internals',
        status: stackSignals.length > 0 ? 'failed' : 'passed',
        severity: 'high',
        detail:
          stackSignals.length > 0
            ? 'The response contains stack-trace or database-error text. This hands an attacker the stack, file paths and often query structure.'
            : 'No stack traces or database errors were visible in the response.',
        evidence: stackSignals,
      });
    } catch (error) {
      checks.push({
        id: 'reflected-encoding',
        name: 'Reflected input is HTML-encoded',
        status: 'skipped',
        severity: 'medium',
        detail: `The probe request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      // Always return the browser to the clean target before anything else runs.
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined);
    }

    // --- Directory listing ---
    const listingPaths = ['/.git/HEAD', '/.env', '/backup/'];
    const exposed: string[] = [];

    for (const path of listingPaths) {
      try {
        const probe = await page.request.get(new URL(path, targetUrl).toString(), { timeout: 10_000 });
        const body = (await probe.text()).slice(0, 400);
        const looksReal =
          probe.status() === 200 &&
          ((path === '/.git/HEAD' && body.startsWith('ref:')) ||
            (path === '/.env' && /^[A-Z_]+=/m.test(body)) ||
            (path === '/backup/' && /<title>Index of/i.test(body)));
        if (looksReal) exposed.push(`${path} -> HTTP ${probe.status()}`);
      } catch {
        // A network failure here is not a finding.
      }
    }

    checks.push({
      id: 'exposed-artifacts',
      name: 'No exposed source-control or configuration files',
      status: exposed.length > 0 ? 'failed' : 'passed',
      severity: 'critical',
      detail:
        exposed.length > 0
          ? 'Source-control metadata or configuration is reachable over HTTP. These routinely contain credentials and full source history.'
          : 'No .git metadata, .env file or open directory listing was reachable.',
      evidence: exposed,
    });

    return checks;
  },
};
