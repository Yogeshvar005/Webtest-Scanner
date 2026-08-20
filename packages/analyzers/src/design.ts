import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Analyzer, AnalyzerContext, CheckResult } from './types';

/** Caps on what a single capture may pull down, so one run cannot hammer a site. */
const CAPTURE_LIMITS = {
  maxFiles: 120,
  maxTotalBytes: 40_000_000,
  maxFileBytes: 8_000_000,
};

interface ExtractedDesign {
  colors: Array<{ value: string; count: number; role: string }>;
  fonts: Array<{ family: string; count: number }>;
  fontSizes: Array<{ value: string; count: number }>;
  fontWeights: Array<{ value: string; count: number }>;
  spacing: Array<{ value: string; count: number }>;
  radii: Array<{ value: string; count: number }>;
  shadows: string[];
  images: Array<{ src: string; natural: string; rendered: string; alt: string | null; loading: string | null; format: string }>;
  stylesheets: string[];
  scriptCount: number;
  fontFiles: string[];
  landmarks: Array<{ role: string; label: string | null }>;
  layout: { sections: number; usesGrid: number; usesFlex: number; maxDepth: number; elementCount: number };
  components: Record<string, number>;
  meta: Record<string, string>;
}

function extension(url: string): string {
  const clean = url.split('?')[0]!.split('#')[0]!;
  const match = /\.([a-z0-9]{2,5})$/i.exec(clean);
  return match ? match[1]!.toLowerCase() : 'unknown';
}

/**
 * Design and asset extraction.
 *
 * Two distinct things live here, and the difference matters legally:
 *
 *  - **Inventory** reads what the browser already rendered — the colour
 *    palette, type scale, spacing rhythm, layout structure and a catalogue of
 *    asset URLs and dimensions. Nothing is copied; this is observation, and it
 *    is what makes visual-regression baselines, contrast analysis and design
 *    system audits possible.
 *
 *  - **Capture** downloads the actual image, font and stylesheet files. That is
 *    a reproduction of someone's copyrighted work, so it is gated on proven
 *    domain ownership. Cataloguing a site you do not own is reasonable;
 *    bulk-copying its assets is not, and no amount of configuration makes that
 *    the platform's call to make on the user's behalf.
 */
export const designAnalyzer: Analyzer = {
  id: 'design',
  label: 'Design & assets',
  description:
    'Extracts the colour palette, type scale, spacing rhythm, layout structure and a full asset inventory. Downloading the actual image and font files additionally requires proven domain ownership.',
  minTier: 0,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const { page } = context;
    const checks: CheckResult[] = [];

    const design = await page.evaluate((): ExtractedDesign => {
      const tally = new Map<string, Map<string, number>>();
      const bump = (bucket: string, value: string) => {
        if (!value || value === 'none' || value === 'normal' || value === 'auto') return;
        if (/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(value)) return;
        const map = tally.get(bucket) ?? new Map<string, number>();
        map.set(value, (map.get(value) ?? 0) + 1);
        tally.set(bucket, map);
      };

      const elements = Array.from(document.querySelectorAll('*')).slice(0, 3000);
      let maxDepth = 0;
      let usesGrid = 0;
      let usesFlex = 0;
      const shadows = new Set<string>();

      for (const el of elements) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        bump('color', style.color);
        bump('background', style.backgroundColor);
        bump('border', style.borderTopColor);
        bump('family', style.fontFamily.split(',')[0]!.replace(/["']/g, '').trim());
        bump('size', style.fontSize);
        bump('weight', style.fontWeight);
        bump('radius', style.borderTopLeftRadius);

        for (const gap of [style.marginTop, style.marginBottom, style.paddingTop, style.paddingBottom, style.gap]) {
          if (gap && gap !== '0px') bump('spacing', gap);
        }

        if (style.display.includes('grid')) usesGrid += 1;
        if (style.display.includes('flex')) usesFlex += 1;
        if (style.boxShadow && style.boxShadow !== 'none') shadows.add(style.boxShadow);

        let depth = 0;
        let node: Element | null = el;
        while (node && depth < 60) { depth += 1; node = node.parentElement; }
        if (depth > maxDepth) maxDepth = depth;
      }

      const top = (bucket: string, limit = 14) =>
        [...(tally.get(bucket) ?? new Map())]
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([value, count]) => ({ value, count }));

      const colours = [
        ...top('color', 10).map((c) => ({ ...c, role: 'text' })),
        ...top('background', 10).map((c) => ({ ...c, role: 'background' })),
        ...top('border', 6).map((c) => ({ ...c, role: 'border' })),
      ];

      const images = Array.from(document.images)
        .slice(0, 200)
        .map((img) => ({
          src: img.currentSrc || img.src,
          natural: `${img.naturalWidth}x${img.naturalHeight}`,
          rendered: `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}`,
          alt: img.getAttribute('alt'),
          loading: img.getAttribute('loading'),
          format: '',
        }));

      const landmarkSelectors: Array<[string, string]> = [
        ['header', 'banner'], ['nav', 'navigation'], ['main', 'main'],
        ['aside', 'complementary'], ['footer', 'contentinfo'], ['form', 'form'],
        ['[role="search"]', 'search'], ['section', 'region'],
      ];
      const landmarks: ExtractedDesign['landmarks'] = [];
      for (const [selector, role] of landmarkSelectors) {
        for (const el of Array.from(document.querySelectorAll(selector)).slice(0, 12)) {
          landmarks.push({
            role,
            label: el.getAttribute('aria-label') ?? el.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 60) ?? null,
          });
        }
      }

      const meta: Record<string, string> = {};
      for (const tag of Array.from(document.querySelectorAll('meta[name], meta[property]')).slice(0, 40)) {
        const key = tag.getAttribute('name') ?? tag.getAttribute('property') ?? '';
        const content = tag.getAttribute('content') ?? '';
        if (key && content) meta[key] = content.slice(0, 200);
      }

      const count = (selector: string) => document.querySelectorAll(selector).length;

      return {
        colors: colours,
        fonts: top('family', 8).map((f) => ({ family: f.value, count: f.count })),
        fontSizes: top('size', 12),
        fontWeights: top('weight', 8),
        spacing: top('spacing', 14),
        radii: top('radius', 8),
        shadows: [...shadows].slice(0, 10),
        images,
        stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map((l) => l.getAttribute('href') ?? '')
          .filter(Boolean)
          .slice(0, 40),
        scriptCount: count('script[src]'),
        fontFiles: (() => {
          const out = new Set<string>();
          for (const entry of performance.getEntriesByType('resource')) {
            if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(entry.name)) out.add(entry.name);
          }
          return [...out].slice(0, 40);
        })(),
        landmarks,
        layout: {
          sections: count('section,article'),
          usesGrid,
          usesFlex,
          maxDepth,
          elementCount: document.querySelectorAll('*').length,
        },
        components: {
          buttons: count('button,[role="button"]'),
          links: count('a[href]'),
          inputs: count('input,textarea,select'),
          forms: count('form'),
          images: document.images.length,
          headings: count('h1,h2,h3,h4,h5,h6'),
          tables: count('table'),
          iframes: count('iframe'),
          videos: count('video'),
          svgs: count('svg'),
        },
        meta,
      };
    });

    for (const image of design.images) image.format = extension(image.src);

    // --- Palette ---
    const uniqueColours = [...new Set(design.colors.map((c) => c.value))];
    checks.push({
      id: 'design-palette',
      name: `Colour palette — ${uniqueColours.length} distinct colours`,
      status: 'passed',
      severity: 'low',
      detail:
        uniqueColours.length > 30
          ? `${uniqueColours.length} distinct colours are in use. A palette this wide usually means the design system is not being applied consistently.`
          : `${uniqueColours.length} distinct colours, ranked by how often each appears.`,
      evidence: design.colors.slice(0, 20).map((c) => `${c.role.padEnd(10)} ${c.value}  (${c.count}x)`),
    });

    // --- Typography ---
    checks.push({
      id: 'design-typography',
      name: `Typography — ${design.fonts.length} families, ${design.fontSizes.length} sizes`,
      status: design.fontSizes.length > 14 ? 'warning' : 'passed',
      severity: 'low',
      detail:
        design.fontSizes.length > 14
          ? 'More than fourteen distinct font sizes suggests an ad-hoc type scale rather than a defined one.'
          : 'Font families, sizes and weights actually rendered on the page.',
      evidence: [
        ...design.fonts.map((f) => `family  ${f.family}  (${f.count}x)`),
        ...design.fontSizes.map((s) => `size    ${s.value}  (${s.count}x)`),
        ...design.fontWeights.map((w) => `weight  ${w.value}  (${w.count}x)`),
      ],
    });

    // --- Spacing and shape ---
    checks.push({
      id: 'design-spacing',
      name: `Spacing and shape — ${design.spacing.length} spacing values, ${design.radii.length} radii`,
      status: 'passed',
      severity: 'low',
      detail: 'The spacing rhythm, corner radii and shadows the page actually renders.',
      evidence: [
        ...design.spacing.map((s) => `space   ${s.value}  (${s.count}x)`),
        ...design.radii.map((r) => `radius  ${r.value}  (${r.count}x)`),
        ...design.shadows.slice(0, 4).map((s) => `shadow  ${s.slice(0, 90)}`),
      ],
    });

    // --- Layout ---
    checks.push({
      id: 'design-layout',
      name: `Layout — ${design.layout.elementCount} elements, depth ${design.layout.maxDepth}`,
      status: design.layout.maxDepth > 32 ? 'warning' : 'passed',
      severity: 'low',
      detail:
        design.layout.maxDepth > 32
          ? `A DOM nested ${design.layout.maxDepth} levels deep is expensive to style and to traverse with assistive technology.`
          : 'Structural summary of the rendered page.',
      evidence: [
        `sections    ${design.layout.sections}`,
        `grid nodes  ${design.layout.usesGrid}`,
        `flex nodes  ${design.layout.usesFlex}`,
        `max depth   ${design.layout.maxDepth}`,
        ...design.landmarks.slice(0, 12).map((l) => `landmark    ${l.role}${l.label ? ` — ${l.label}` : ''}`),
      ],
    });

    // --- Component inventory ---
    checks.push({
      id: 'design-components',
      name: 'Component inventory',
      status: 'passed',
      severity: 'low',
      detail: 'What the page is built from. This is the surface a test suite would need to cover.',
      evidence: Object.entries(design.components).map(([kind, n]) => `${kind.padEnd(10)} ${n}`),
    });

    // --- Asset inventory ---
    const byFormat = new Map<string, number>();
    for (const image of design.images) byFormat.set(image.format, (byFormat.get(image.format) ?? 0) + 1);
    const oversized = design.images.filter((img) => {
      const [nw] = img.natural.split('x').map(Number);
      const [rw] = img.rendered.split('x').map(Number);
      return nw && rw && rw > 0 && nw > rw * 2;
    });

    checks.push({
      id: 'design-assets',
      name: `Asset inventory — ${design.images.length} images, ${design.fontFiles.length} fonts, ${design.stylesheets.length} stylesheets`,
      status: oversized.length > 0 ? 'warning' : 'passed',
      severity: 'low',
      detail:
        oversized.length > 0
          ? `${oversized.length} image(s) are served at more than twice their rendered size, which wastes bandwidth on every visit.`
          : 'Every asset the page loaded, with dimensions and formats.',
      evidence: [
        ...[...byFormat.entries()].map(([format, n]) => `${format.padEnd(6)} ${n} image(s)`),
        ...oversized.slice(0, 8).map((i) => `oversized  ${i.natural} shown at ${i.rendered}  ${i.src.slice(0, 90)}`),
        ...design.fontFiles.slice(0, 6).map((f) => `font    ${f.slice(0, 100)}`),
      ],
    });

    if (Object.keys(design.meta).length > 0) {
      checks.push({
        id: 'design-meta',
        name: 'Page metadata',
        status: 'passed',
        severity: 'low',
        detail: 'Meta tags, including Open Graph and Twitter card data.',
        evidence: Object.entries(design.meta).slice(0, 16).map(([k, v]) => `${k}: ${v}`),
      });
    }

    // --- Capture (gated) ---
    checks.push(await captureAssets(context, design));

    return checks;
  },
};

/**
 * Downloads the actual asset files, when the operator has proven they control
 * the domain. Refuses otherwise and says why, rather than silently omitting it.
 */
async function captureAssets(context: AnalyzerContext, design: ExtractedDesign): Promise<CheckResult> {
  const { page, tier, captureAssets: wanted, artifactDir, artifactUrlPrefix, runId } = context;

  if (!wanted) {
    return {
      id: 'design-capture',
      name: 'Asset capture',
      status: 'not-applicable',
      severity: 'low',
      detail: 'Asset capture was not requested. The inventory above catalogues every asset without copying any of it.',
    };
  }

  if (tier < 1) {
    return {
      id: 'design-capture',
      name: 'Asset capture',
      status: 'skipped',
      severity: 'medium',
      detail:
        'Downloading a site\'s images, fonts and stylesheets reproduces copyrighted work, so it requires proven domain ownership (tier 1). Publish the DNS TXT record for this domain to enable it. The inventory above is available without that, because reading what a browser already rendered copies nothing.',
    };
  }

  if (!artifactDir || !runId) {
    return {
      id: 'design-capture',
      name: 'Asset capture',
      status: 'skipped',
      severity: 'low',
      detail: 'No artifact directory was configured for this run, so captured files had nowhere to go.',
    };
  }

  const urls = [
    ...new Set([
      ...design.images.map((i) => i.src),
      ...design.fontFiles,
      ...design.stylesheets,
    ]),
  ].filter((u) => u.startsWith('http')).slice(0, CAPTURE_LIMITS.maxFiles);

  const dir = join(artifactDir, 'capture', runId);
  await mkdir(dir, { recursive: true });

  const manifest: Array<{ url: string; file: string; bytes: number; contentType: string }> = [];
  const failed: string[] = [];
  let totalBytes = 0;

  for (const [index, url] of urls.entries()) {
    if (totalBytes >= CAPTURE_LIMITS.maxTotalBytes) {
      failed.push(`stopped at the ${(CAPTURE_LIMITS.maxTotalBytes / 1_000_000).toFixed(0)}MB capture ceiling`);
      break;
    }

    try {
      const response = await page.request.get(url, { timeout: 15_000 });
      if (!response.ok()) { failed.push(`HTTP ${response.status()} ${url.slice(0, 90)}`); continue; }

      const body = await response.body();
      if (body.byteLength > CAPTURE_LIMITS.maxFileBytes) {
        failed.push(`too large (${(body.byteLength / 1_000_000).toFixed(1)}MB) ${url.slice(0, 80)}`);
        continue;
      }

      const name = `${String(index).padStart(3, '0')}-${(url.split('/').pop() ?? 'asset').split('?')[0]!.slice(0, 60) || 'asset'}`;
      await writeFile(join(dir, name), body);

      totalBytes += body.byteLength;
      manifest.push({
        url,
        file: `${artifactUrlPrefix ?? ''}/capture/${runId}/${name}`,
        bytes: body.byteLength,
        contentType: response.headers()['content-type'] ?? '',
      });
    } catch (error) {
      failed.push(`${error instanceof Error ? error.message.slice(0, 60) : 'failed'} ${url.slice(0, 70)}`);
    }
  }

  await writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), source: context.targetUrl, design, files: manifest }, null, 2),
  );

  return {
    id: 'design-capture',
    name: `Asset capture — ${manifest.length} files, ${(totalBytes / 1_000_000).toFixed(2)} MB`,
    status: manifest.length > 0 ? 'passed' : 'warning',
    severity: 'low',
    detail: `Saved ${manifest.length} of ${urls.length} assets, plus a manifest.json holding the full design extraction. Capture is capped at ${CAPTURE_LIMITS.maxFiles} files and ${CAPTURE_LIMITS.maxTotalBytes / 1_000_000}MB per run so one capture cannot hammer the origin.`,
    evidence: [
      ...manifest.slice(0, 12).map((m) => `${(m.bytes / 1024).toFixed(0).padStart(6)}KB  ${m.file}`),
      ...failed.slice(0, 6).map((f) => `failed  ${f}`),
    ],
  };
}
