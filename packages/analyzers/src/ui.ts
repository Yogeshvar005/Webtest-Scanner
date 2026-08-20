import type { Analyzer, AnalyzerContext, CheckResult } from './types';

/**
 * Visual and layout checks.
 *
 * Several of these are heuristics that produce false positives on real sites —
 * decorative images legitimately have empty alt text, and absolutely positioned
 * elements legitimately overlap. Those report as warnings, not failures, unless
 * the run is in strict mode. Reporting a design choice as a defect destroys
 * trust in every other result.
 */
export const uiAnalyzer: Analyzer = {
  id: 'ui',
  label: 'UI / visual',
  description:
    'Checks the rendered page for broken images, horizontal overflow, invisible or clipped text, tiny tap targets and overlapping interactive elements.',
  minTier: 0,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const { page } = context;
    const checks: CheckResult[] = [];

    const report = await page.evaluate(() => {
      const broken: string[] = [];
      const emptyAlt: string[] = [];
      const tiny: string[] = [];
      const overlapping: string[] = [];
      const clipped: string[] = [];

      const describe = (el: Element): string => {
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`;
      };

      // Broken images: loaded but with no intrinsic dimensions.
      for (const img of Array.from(document.images)) {
        if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0) {
          broken.push(`${describe(img)} src=${(img.getAttribute('src') ?? '').slice(0, 120)}`);
        }
        if (!img.hasAttribute('alt')) emptyAlt.push(describe(img));
      }

      // Interactive elements below the recommended 24x24 CSS px tap target.
      const interactive = Array.from(
        document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"]'),
      );
      const visible = interactive.filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });

      for (const el of visible) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 24) {
          tiny.push(`${describe(el)} ${Math.round(rect.width)}x${Math.round(rect.height)}px`);
        }
      }

      // Overlapping interactive elements: the midpoint of one is covered by a
      // different, non-ancestor element, which usually means a click misses.
      for (const el of visible.slice(0, 250)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.bottom < 0 || rect.top > innerHeight) continue;

        const x = Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 1), innerHeight - 1);
        const top = document.elementFromPoint(x, y);

        if (top && top !== el && !el.contains(top) && !top.contains(el)) {
          overlapping.push(`${describe(el)} is covered by ${describe(top)}`);
        }
      }

      // Text clipped by a fixed-height container.
      for (const el of Array.from(document.querySelectorAll('p,h1,h2,h3,span,div,li,td')).slice(0, 400)) {
        const style = getComputedStyle(el);
        if (style.overflow !== 'hidden') continue;
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0) {
          clipped.push(`${describe(el)} content ${el.scrollHeight}px in ${el.clientHeight}px box`);
        }
      }

      return {
        broken,
        emptyAlt,
        tiny: tiny.slice(0, 20),
        overlapping: overlapping.slice(0, 20),
        clipped: clipped.slice(0, 20),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        title: document.title,
        h1Count: document.querySelectorAll('h1').length,
      };
    });

    checks.push({
      id: 'broken-images',
      name: 'No broken images',
      status: report.broken.length > 0 ? 'failed' : 'passed',
      severity: 'medium',
      detail:
        report.broken.length > 0
          ? `${report.broken.length} image(s) failed to load and render at zero size.`
          : 'All images loaded with real dimensions.',
      evidence: report.broken,
    });

    checks.push({
      id: 'image-alt',
      name: 'Images declare alt text',
      status: report.emptyAlt.length > 0 ? 'warning' : 'passed',
      severity: 'low',
      detail:
        report.emptyAlt.length > 0
          ? `${report.emptyAlt.length} image(s) have no alt attribute at all. Decorative images should still carry alt="" so screen readers skip them deliberately.`
          : 'Every image declares an alt attribute.',
      evidence: report.emptyAlt.slice(0, 20),
    });

    checks.push({
      id: 'horizontal-overflow',
      name: 'No horizontal overflow',
      status: report.horizontalOverflow ? 'failed' : 'passed',
      severity: 'medium',
      detail: report.horizontalOverflow
        ? `The page is ${report.scrollWidth}px wide in a ${report.viewportWidth}px viewport, forcing sideways scrolling.`
        : 'The page fits the viewport width.',
    });

    checks.push({
      id: 'tap-targets',
      name: 'Interactive elements are large enough',
      status: report.tiny.length > 0 ? 'warning' : 'passed',
      severity: 'low',
      detail:
        report.tiny.length > 0
          ? `${report.tiny.length} interactive element(s) are smaller than the 24x24px minimum target size.`
          : 'All interactive elements meet the minimum target size.',
      evidence: report.tiny,
    });

    checks.push({
      id: 'overlap',
      name: 'Interactive elements are not obscured',
      status: report.overlapping.length > 0 ? 'warning' : 'passed',
      severity: 'medium',
      detail:
        report.overlapping.length > 0
          ? `${report.overlapping.length} interactive element(s) are covered at their centre point, so a click may land on the wrong element. Sticky headers and overlays cause benign hits here — confirm before filing.`
          : 'No interactive element is obscured at its centre point.',
      evidence: report.overlapping,
    });

    checks.push({
      id: 'clipped-text',
      name: 'Text is not clipped by its container',
      status: report.clipped.length > 0 ? 'warning' : 'passed',
      severity: 'low',
      detail:
        report.clipped.length > 0
          ? `${report.clipped.length} element(s) hold more content than their fixed height shows. Intentional truncation looks the same as a layout bug here.`
          : 'No clipped text containers were found.',
      evidence: report.clipped,
    });

    checks.push({
      id: 'page-title',
      name: 'Page has a title',
      status: report.title.trim().length > 0 ? 'passed' : 'failed',
      severity: 'medium',
      detail: report.title.trim() ? `Title: "${report.title}"` : 'The page has no <title>.',
    });

    checks.push({
      id: 'single-h1',
      name: 'Page has exactly one top-level heading',
      status: report.h1Count === 1 ? 'passed' : 'warning',
      severity: 'low',
      detail: `Found ${report.h1Count} <h1> element(s). One is the conventional structure for assistive technology and search engines.`,
    });

    return checks;
  },
};
