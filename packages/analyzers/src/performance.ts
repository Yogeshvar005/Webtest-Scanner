import type { Analyzer, AnalyzerContext, CheckResult } from './types';

/** Budgets a page has to beat. Deliberately generous — these flag problems, not aspirations. */
const BUDGETS = {
  firstContentfulPaintMs: 1_800,
  domContentLoadedMs: 2_500,
  loadMs: 4_000,
  totalTransferBytes: 3_000_000,
  requestCount: 120,
};

function verdict(value: number, budget: number): 'passed' | 'warning' {
  return value <= budget ? 'passed' : 'warning';
}

function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

export const performanceAnalyzer: Analyzer = {
  id: 'performance',
  label: 'Performance',
  description:
    'Reads the browser\'s own navigation and resource timings: paint, DOM ready, load, transfer weight and request count.',
  minTier: 0,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const { page } = context;

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paints = performance.getEntriesByType('paint');
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

      const byType: Record<string, { count: number; bytes: number }> = {};
      let totalBytes = 0;

      for (const r of resources) {
        const size = r.transferSize || r.encodedBodySize || 0;
        totalBytes += size;
        const kind = r.initiatorType || 'other';
        byType[kind] ??= { count: 0, bytes: 0 };
        byType[kind]!.count += 1;
        byType[kind]!.bytes += size;
      }

      const slowest = [...resources]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map((r) => `${Math.round(r.duration)}ms  ${r.name.slice(0, 110)}`);

      return {
        firstContentfulPaint: paints.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
        load: nav ? nav.loadEventEnd - nav.startTime : 0,
        ttfb: nav ? nav.responseStart - nav.requestStart : 0,
        transferBytes: totalBytes + (nav?.transferSize ?? 0),
        requestCount: resources.length + 1,
        byType,
        slowest,
      };
    });

    const checks: CheckResult[] = [];

    if (metrics.firstContentfulPaint > 0) {
      checks.push({
        id: 'fcp',
        name: 'First contentful paint',
        status: verdict(metrics.firstContentfulPaint, BUDGETS.firstContentfulPaintMs),
        severity: 'medium',
        detail: `${Math.round(metrics.firstContentfulPaint)}ms (budget ${BUDGETS.firstContentfulPaintMs}ms). This is when the user first sees anything.`,
      });
    }

    checks.push({
      id: 'ttfb',
      name: 'Time to first byte',
      status: verdict(metrics.ttfb, 800),
      severity: 'low',
      detail: `${Math.round(metrics.ttfb)}ms (budget 800ms). Slow TTFB points at the server rather than the front end.`,
    });

    checks.push({
      id: 'dcl',
      name: 'DOM content loaded',
      status: verdict(metrics.domContentLoaded, BUDGETS.domContentLoadedMs),
      severity: 'medium',
      detail: `${Math.round(metrics.domContentLoaded)}ms (budget ${BUDGETS.domContentLoadedMs}ms).`,
    });

    checks.push({
      id: 'load',
      name: 'Load event',
      status: verdict(metrics.load, BUDGETS.loadMs),
      severity: 'low',
      detail: `${Math.round(metrics.load)}ms (budget ${BUDGETS.loadMs}ms).`,
    });

    checks.push({
      id: 'weight',
      name: 'Total transfer weight',
      status: verdict(metrics.transferBytes, BUDGETS.totalTransferBytes),
      severity: 'medium',
      detail: `${mb(metrics.transferBytes)} transferred (budget ${mb(BUDGETS.totalTransferBytes)}).`,
      evidence: Object.entries(metrics.byType)
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .slice(0, 8)
        .map(([kind, v]) => `${kind}: ${v.count} requests, ${mb(v.bytes)}`),
    });

    checks.push({
      id: 'request-count',
      name: 'Request count',
      status: verdict(metrics.requestCount, BUDGETS.requestCount),
      severity: 'low',
      detail: `${metrics.requestCount} requests (budget ${BUDGETS.requestCount}).`,
      evidence: metrics.slowest,
    });

    return checks;
  },
};
