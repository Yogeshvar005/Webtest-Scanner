import { NextResponse } from 'next/server';
import { launchBrowser } from '@wts/runner';
import type { SiteReconData } from '@wts/nlp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const rawUrl = (body.url ?? '').trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Please provide a valid website URL.' }, { status: 400 });
  }

  let targetUrl: string;
  try {
    const withProto = rawUrl.startsWith('http')
      ? rawUrl
      : (rawUrl.startsWith('localhost') || rawUrl.startsWith('127.0.0.1') ? `http://${rawUrl}` : `https://${rawUrl}`);
    const u = new URL(withProto);
    targetUrl = u.toString();
  } catch {
    return NextResponse.json({ error: 'Invalid URL format.' }, { status: 400 });
  }

  let browser;
  try {
    const launched = await launchBrowser({ headless: true });
    browser = launched.browser;

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Fast navigation with timeout
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch {
      // Continue even if navigation had slow network assets
    }

    // Allow dynamic hydration & initial widgets to render
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 6000 }),
      page.waitForFunction(() => (document.body?.innerText || '').length > 40, { timeout: 6000 }),
    ]).catch(() => {});
    await page.waitForTimeout(1000).catch(() => {});

    const reconData: SiteReconData = await page.evaluate((currentUrl: string) => {
      const urlObj = new URL(currentUrl);

      // Title & Description
      const title = document.title || '';
      const metaDesc =
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        '';

      // Headings
      const headings: string[] = [];
      document.querySelectorAll('h1, h2, h3').forEach((h) => {
        const text = (h.textContent || '').trim();
        if (text && text.length < 150 && !headings.includes(text)) {
          headings.push(text);
        }
      });

      // Interactive Elements
      const interactiveElements: SiteReconData['interactiveElements'] = [];
      const seen = new Set<string>();

      // Buttons
      document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach((el) => {
        const text = (el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').trim();
        if (text && text.length < 50 && !seen.has(text.toLowerCase())) {
          seen.add(text.toLowerCase());
          interactiveElements.push({
            role: 'button',
            text,
          });
        }
      });

      // Inputs
      document.querySelectorAll('input, select, textarea').forEach((el) => {
        const input = el as HTMLInputElement;
        const type = input.type || 'text';
        if (['hidden', 'submit', 'button', 'reset'].includes(type)) return;

        const placeholder = input.placeholder || '';
        const name = input.name || input.id || '';
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || '';
        const identifier = placeholder || label || name || type;

        if (identifier && !seen.has(identifier.toLowerCase())) {
          seen.add(identifier.toLowerCase());
          interactiveElements.push({
            role: type === 'search' ? 'searchbox' : 'textbox',
            text: identifier,
            placeholder: placeholder || undefined,
            name: name || undefined,
            type,
          });
        }
      });

      // Forms
      const forms: SiteReconData['forms'] = [];
      document.querySelectorAll('form').forEach((f) => {
        const formName = f.getAttribute('name') || f.getAttribute('aria-label') || f.id || 'Form';
        const fields: Array<{ name: string; type: string; placeholder?: string; label?: string }> = [];

        f.querySelectorAll('input, select, textarea').forEach((inp) => {
          const input = inp as HTMLInputElement;
          if (['hidden', 'submit', 'button'].includes(input.type)) return;
          const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || '';
          fields.push({
            name: input.name || input.id || 'field',
            type: input.type || 'text',
            placeholder: input.placeholder || undefined,
            label: label || undefined,
          });
        });

        const submitBtn = f.querySelector('button[type="submit"], input[type="submit"], button')?.textContent?.trim() || 'Submit';

        if (fields.length > 0) {
          forms.push({
            name: formName,
            fields: fields.slice(0, 8),
            submitText: submitBtn,
          });
        }
      });

      // Navigation Links
      const navLinks: SiteReconData['navLinks'] = [];
      document.querySelectorAll('nav a, header a, [role="navigation"] a').forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const text = (anchor.textContent || anchor.getAttribute('aria-label') || '').trim();
        const href = anchor.href || '';
        if (text && text.length < 40 && !seen.has(`nav-${text.toLowerCase()}`)) {
          seen.add(`nav-${text.toLowerCase()}`);
          navLinks.push({ text, href });
        }
      });

      return {
        url: currentUrl,
        title,
        description: metaDesc,
        domain: urlObj.hostname,
        headings: headings.slice(0, 15),
        interactiveElements: interactiveElements.slice(0, 30),
        forms: forms.slice(0, 5),
        navLinks: navLinks.slice(0, 20),
      };
    }, targetUrl);

    await context.close().catch(() => {});
    await browser.close().catch(() => {});

    return NextResponse.json(reconData);
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    console.error('Reconnaissance failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to inspect website structure.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
