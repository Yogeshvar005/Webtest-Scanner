import type { Analyzer, AnalyzerContext, CheckResult } from './types';

/** Populated by the runner from network traffic observed during the run. */
export interface ObservedApiCall {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  contentType: string;
}

let observed: ObservedApiCall[] = [];

export function setObservedApiCalls(calls: ObservedApiCall[]): void {
  observed = calls;
}

export const apiAnalyzer: Analyzer = {
  id: 'api',
  label: 'API / contract',
  description:
    'Inspects the XHR and fetch traffic the page actually made: status codes, response times, content types and whether error bodies leak internals.',
  minTier: 0,

  async run(_context: AnalyzerContext): Promise<CheckResult[]> {
    if (observed.length === 0) {
      return [{
        id: 'api-traffic',
        name: 'API traffic observed',
        status: 'not-applicable',
        severity: 'low',
        detail:
          'The page made no XHR or fetch calls during this run, so there was no API surface to inspect. A server-rendered page legitimately produces this result.',
      }];
    }

    const failures = observed.filter((c) => c.status >= 500);
    const clientErrors = observed.filter((c) => c.status >= 400 && c.status < 500);
    const slow = observed.filter((c) => c.durationMs > 1_000);
    const notJson = observed.filter((c) => !/json|text|xml/i.test(c.contentType) && c.contentType !== '');

    return [
      {
        id: 'api-server-errors',
        name: 'No server errors',
        status: failures.length > 0 ? 'failed' : 'passed',
        severity: 'critical',
        detail:
          failures.length > 0
            ? `${failures.length} API call(s) returned 5xx. A 5xx during a normal page load is an application defect, not a test problem.`
            : `None of the ${observed.length} observed API calls returned 5xx.`,
        evidence: failures.slice(0, 10).map((c) => `${c.status} ${c.method} ${c.url.slice(0, 120)}`),
      },
      {
        id: 'api-client-errors',
        name: 'No unexpected client errors',
        status: clientErrors.length > 0 ? 'warning' : 'passed',
        severity: 'medium',
        detail:
          clientErrors.length > 0
            ? `${clientErrors.length} API call(s) returned 4xx. A 401 on an anonymous page load is often expected; a 404 usually is not.`
            : 'No 4xx responses were observed.',
        evidence: clientErrors.slice(0, 10).map((c) => `${c.status} ${c.method} ${c.url.slice(0, 120)}`),
      },
      {
        id: 'api-latency',
        name: 'API responses under one second',
        status: slow.length > 0 ? 'warning' : 'passed',
        severity: 'low',
        detail:
          slow.length > 0
            ? `${slow.length} API call(s) took longer than 1000ms.`
            : `All ${observed.length} observed API calls responded within 1000ms.`,
        evidence: slow.slice(0, 10).map((c) => `${Math.round(c.durationMs)}ms ${c.method} ${c.url.slice(0, 110)}`),
      },
      {
        id: 'api-content-type',
        name: 'API responses declare a sane content type',
        status: notJson.length > 0 ? 'warning' : 'passed',
        severity: 'low',
        detail:
          notJson.length > 0
            ? `${notJson.length} API response(s) declared a content type that is neither JSON, text nor XML.`
            : 'All observed API responses declared a JSON, text or XML content type.',
        evidence: notJson.slice(0, 5).map((c) => `${c.contentType} ${c.url.slice(0, 110)}`),
      },
    ];
  },
};

/**
 * Source-code unit testing.
 *
 * This category exists so the answer is explicit rather than silently missing.
 * Unit tests exercise internal functions of source code; given only a URL there
 * is no source to exercise. Anything the platform can do from a URL alone is
 * black-box testing by definition. Claiming otherwise would be dishonest, so
 * this reports as not-applicable and names what it would actually require.
 */
export const unitAnalyzer: Analyzer = {
  id: 'unit',
  label: 'Unit tests (source code)',
  description:
    'Genuine unit testing of the application source. Requires repository access — it cannot be performed against a URL.',
  minTier: 0,

  async run(_context: AnalyzerContext): Promise<CheckResult[]> {
    return [{
      id: 'unit-requires-source',
      name: 'Unit testing requires the source repository',
      status: 'not-applicable',
      severity: 'low',
      detail:
        'Unit tests exercise individual functions inside the application. With only a URL there is no source code, no coverage instrumentation and no way to call a function in isolation, so no honest unit-test result can be produced here. Connect the repository to enable this: the platform would then run the existing suite with coverage and propose tests for uncovered functions. Everything else in this report is black-box testing of the running site.',
    }];
  },
};
