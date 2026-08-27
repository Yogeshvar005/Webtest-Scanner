import type { Analyzer, AnalyzerContext, CheckResult } from './types';

/**
 * Web Scraper / Content Extractor.
 *
 * Observation-only (tier 0) — reads what the browser has already rendered.
 * No files are downloaded, no requests are made beyond what Playwright already
 * fetched. This is equivalent to a human reading the page source.
 *
 * Extracted:
 *  - Page metadata (title, meta tags, OG, Twitter card, canonical)
 *  - Heading hierarchy (h1–h6 text)
 *  - All visible text content (paragraphs, lists, tables)
 *  - All hyperlinks (internal and external, with anchor text)
 *  - All images (src, alt, dimensions, loading strategy)
 *  - All forms (fields, labels, action, method)
 *  - Navigation structure (nav landmarks and their links)
 *  - Structured data (JSON-LD / schema.org)
 *  - Contact info (phone numbers and email addresses found in text)
 */
export const scraperAnalyzer: Analyzer = {
  id: 'scraper',
  label: 'Web Scraper',
  description:
    'Extracts all visible content: headings, text, links, images, forms, navigation, meta tags, structured data, and contact info found on the page.',
  minTier: 0,

  async run(context: AnalyzerContext): Promise<CheckResult[]> {
    const { page, targetUrl } = context;
    const checks: CheckResult[] = [];

    const extracted = await page.evaluate((pageUrl: string) => {
      const targetOrigin = (() => {
        try { return new URL(pageUrl).origin; } catch { return ''; }
      })();

      // ── Metadata ───────────────────────────────────────────────
      const metaMap: Record<string, string> = {};
      for (const m of Array.from(document.querySelectorAll('meta[name],meta[property]'))) {
        const key = m.getAttribute('name') || m.getAttribute('property') || '';
        const val = m.getAttribute('content') || '';
        if (key && val) metaMap[key] = val;
      }
      const canonical = (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? '';
      const lang = document.documentElement.lang ?? '';

      // ── Heading hierarchy ───────────────────────────────────────
      const headings: Array<{ level: number; text: string }> = [];
      for (const el of Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
        const text = el.textContent?.trim() ?? '';
        if (text) {
          headings.push({ level: parseInt(el.tagName[1]!, 10), text: text.slice(0, 200) });
        }
      }

      // ── Links ───────────────────────────────────────────────────
      const internalLinks: Array<{ href: string; text: string }> = [];
      const externalLinks: Array<{ href: string; text: string }> = [];
      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        const href = (a as HTMLAnchorElement).href;
        const text = (a.textContent?.trim() ?? '').slice(0, 120);
        if (!href || href.startsWith('javascript:') || href === '#') continue;
        const isInternal = href.startsWith(targetOrigin) || href.startsWith('/') || href.startsWith('./');
        (isInternal ? internalLinks : externalLinks).push({ href: href.slice(0, 300), text });
      }

      // ── Images ─────────────────────────────────────────────────
      const images: Array<{ src: string; alt: string; width: number; height: number; loading: string }> = [];
      for (const img of Array.from(document.images)) {
        images.push({
          src: img.src.slice(0, 300),
          alt: img.alt ?? '',
          width: img.naturalWidth,
          height: img.naturalHeight,
          loading: img.loading ?? 'eager',
        });
      }

      // ── Forms ──────────────────────────────────────────────────
      const forms: Array<{
        action: string; method: string; fields: Array<{ type: string; name: string; label: string; required: boolean }>;
      }> = [];
      for (const form of Array.from(document.querySelectorAll('form'))) {
        const fields: Array<{ type: string; name: string; label: string; required: boolean }> = [];
        for (const input of Array.from(form.querySelectorAll('input,select,textarea'))) {
          const inp = input as HTMLInputElement;
          const id = inp.id;
          const labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
          const ariaLabel = inp.getAttribute('aria-label') ?? '';
          const placeholder = inp.placeholder ?? '';
          const labelText = (labelEl?.textContent?.trim() ?? ariaLabel ?? placeholder).slice(0, 80);
          fields.push({
            type: inp.type ?? inp.tagName.toLowerCase(),
            name: (inp.name ?? inp.id ?? '').slice(0, 60),
            label: labelText,
            required: inp.required ?? false,
          });
        }
        forms.push({
          action: (form.action ?? '').slice(0, 300),
          method: (form.method || 'GET').toUpperCase(),
          fields,
        });
      }

      // ── Navigation ─────────────────────────────────────────────
      const navMenus: Array<{ label: string; links: Array<{ text: string; href: string }> }> = [];
      for (const nav of Array.from(document.querySelectorAll('nav,[role="navigation"]'))) {
        const label = (nav.getAttribute('aria-label') ?? nav.getAttribute('id') ?? '').slice(0, 60);
        const links = Array.from(nav.querySelectorAll('a[href]')).slice(0, 50).map((a) => ({
          text: (a.textContent?.trim() ?? '').slice(0, 80),
          href: (a as HTMLAnchorElement).href.slice(0, 200),
        }));
        if (links.length > 0) navMenus.push({ label, links });
      }

      // ── Structured data ─────────────────────────────────────────
      const structuredData: object[] = [];
      for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          structuredData.push(JSON.parse(script.textContent ?? '{}') as object);
        } catch {
          // ignore malformed JSON-LD
        }
      }

      // ── Contact info ────────────────────────────────────────────
      const bodyText = document.body?.innerText ?? '';
      const phoneMatches = Array.from(
        new Set(bodyText.match(/(?:\+?\d[\d\s\-().]{7,18}\d)/g) ?? []),
      ).slice(0, 20);
      const emailMatches = Array.from(
        new Set(bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? []),
      ).slice(0, 20);

      // ── Visible text (paragraphs + list items) ──────────────────
      const textBlocks: string[] = [];
      for (const el of Array.from(document.querySelectorAll('p,li,td,th,blockquote,figcaption')).slice(0, 500)) {
        const text = el.textContent?.trim() ?? '';
        if (text.length > 20) textBlocks.push(text.slice(0, 500));
      }

      return {
        meta: metaMap,
        canonical,
        lang,
        headings,
        internalLinks: internalLinks.slice(0, 200),
        externalLinks: externalLinks.slice(0, 100),
        images,
        forms,
        navMenus,
        structuredData,
        phoneNumbers: phoneMatches,
        emails: emailMatches,
        textBlocks: textBlocks.slice(0, 100),
        pageTitle: document.title,
        totalElements: document.querySelectorAll('*').length,
      };
    }, targetUrl);

    // ── Build CheckResults ──────────────────────────────────────────

    // Metadata
    const metaEntries = Object.entries(extracted.meta).map(([k, v]) => `${k}: ${v}`);
    checks.push({
      id: 'scraper-meta',
      name: 'Page metadata',
      status: metaEntries.length > 0 ? 'passed' : 'warning',
      severity: 'low',
      detail: metaEntries.length > 0
        ? `Found ${metaEntries.length} meta tag(s). Title: "${extracted.pageTitle}". Language: ${extracted.lang || '(not set)'}. Canonical: ${extracted.canonical || '(none)'}.`
        : 'No meta tags found.',
      evidence: metaEntries,
    });

    // Headings
    const headingLines = extracted.headings.map((h) => `H${h.level}: ${h.text}`);
    checks.push({
      id: 'scraper-headings',
      name: 'Heading hierarchy',
      status: extracted.headings.length > 0 ? 'passed' : 'warning',
      severity: 'low',
      detail: `Found ${extracted.headings.length} heading(s) across h1–h6.`,
      evidence: headingLines,
    });

    // Internal links
    const internalEv = extracted.internalLinks.map((l) => `[${l.text || '(no text)'}] → ${l.href}`);
    checks.push({
      id: 'scraper-internal-links',
      name: 'Internal links',
      status: 'passed',
      severity: 'low',
      detail: `Found ${extracted.internalLinks.length} internal link(s).`,
      evidence: internalEv,
    });

    // External links
    const externalEv = extracted.externalLinks.map((l) => `[${l.text || '(no text)'}] → ${l.href}`);
    checks.push({
      id: 'scraper-external-links',
      name: 'External links',
      status: 'passed',
      severity: 'low',
      detail: `Found ${extracted.externalLinks.length} external link(s).`,
      evidence: externalEv,
    });

    // Images
    const imageEv = extracted.images.map(
      (img) => `${img.src.slice(0, 80)} [${img.width}×${img.height}] alt="${img.alt}" loading=${img.loading}`,
    );
    checks.push({
      id: 'scraper-images',
      name: 'Images inventory',
      status: 'passed',
      severity: 'low',
      detail: `Found ${extracted.images.length} image(s).`,
      evidence: imageEv,
    });

    // Forms
    const formEv = extracted.forms.map((f, i) => {
      const fieldSummary = f.fields.map((fi) => `  ${fi.type} "${fi.name}" label="${fi.label}" required=${fi.required}`).join('\n');
      return `Form ${i + 1}: ${f.method} ${f.action}\n${fieldSummary}`;
    });
    checks.push({
      id: 'scraper-forms',
      name: 'Forms and fields',
      status: 'passed',
      severity: 'low',
      detail: `Found ${extracted.forms.length} form(s) with a total of ${extracted.forms.reduce((s, f) => s + f.fields.length, 0)} field(s).`,
      evidence: formEv,
    });

    // Navigation
    const navEv = extracted.navMenus.flatMap((nav) => [
      `Nav: "${nav.label}" (${nav.links.length} links)`,
      ...nav.links.map((l) => `  [${l.text}] → ${l.href}`),
    ]);
    checks.push({
      id: 'scraper-navigation',
      name: 'Navigation menus',
      status: 'passed',
      severity: 'low',
      detail: `Found ${extracted.navMenus.length} navigation landmark(s).`,
      evidence: navEv,
    });

    // Structured data
    checks.push({
      id: 'scraper-structured-data',
      name: 'Structured data (JSON-LD)',
      status: extracted.structuredData.length > 0 ? 'passed' : 'not-applicable',
      severity: 'low',
      detail: extracted.structuredData.length > 0
        ? `Found ${extracted.structuredData.length} JSON-LD block(s).`
        : 'No JSON-LD structured data found.',
      evidence: extracted.structuredData.map((d) => JSON.stringify(d, null, 2).slice(0, 500)),
    });

    // Contact info
    checks.push({
      id: 'scraper-contacts',
      name: 'Contact information',
      status: (extracted.phoneNumbers.length > 0 || extracted.emails.length > 0) ? 'passed' : 'not-applicable',
      severity: 'low',
      detail: [
        extracted.phoneNumbers.length > 0 ? `${extracted.phoneNumbers.length} phone number(s) found.` : '',
        extracted.emails.length > 0 ? `${extracted.emails.length} email address(es) found.` : '',
        !extracted.phoneNumbers.length && !extracted.emails.length ? 'No contact info found in visible text.' : '',
      ].filter(Boolean).join(' '),
      evidence: [
        ...extracted.phoneNumbers.map((p) => `Phone: ${p}`),
        ...extracted.emails.map((e) => `Email: ${e}`),
      ],
    });

    // Text content
    checks.push({
      id: 'scraper-text',
      name: 'Visible text content',
      status: extracted.textBlocks.length > 0 ? 'passed' : 'warning',
      severity: 'low',
      detail: `Extracted ${extracted.textBlocks.length} text block(s) from paragraphs, list items, and table cells.`,
      evidence: extracted.textBlocks,
    });

    return checks;
  },
};
