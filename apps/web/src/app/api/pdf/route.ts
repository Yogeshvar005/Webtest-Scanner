import { NextResponse } from 'next/server';

// Playwright needs a real Node runtime and a generous budget.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let html: string;

  try {
    const body = (await request.json()) as { html?: string };
    if (!body.html || typeof body.html !== 'string') {
      return NextResponse.json({ error: 'Missing html field.' }, { status: 400 });
    }
    html = body.html;
  } catch (error) {
    console.warn('Failed to parse PDF request body:', error);
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  let browser;
  try {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const { chromium: playwrightCoreChromium } = await import('playwright-core');
      const chromiumPkg = await import('@sparticuz/chromium');
      const chromium = chromiumPkg.default || chromiumPkg;
      chromium.setGraphicsMode = false;

      const REMOTE_PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';
      let executablePath: string;
      try {
        executablePath = await chromium.executablePath();
        if (!executablePath) throw new Error('executablePath returned empty string');
      } catch (packErr) {
        console.warn('Local chromium pack not found, falling back to remote binary pack:', packErr);
        executablePath = await chromium.executablePath(REMOTE_PACK_URL);
      }

      browser = await playwrightCoreChromium.launch({
        executablePath,
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
        headless: true,
      });
    } else {
      const { chromium } = await import('playwright');
      try {
        browser = await chromium.launch({
          channel: 'chrome',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      } catch {
        browser = await chromium.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }
    }

    const page = await browser.newPage();

    // Set content and ensure images / fonts are loaded
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});

    const targetUrlMatch = html.match(/<meta\s+name=["']target-url["']\s+content=["'](.*?)["']/i);
    const targetUrl = targetUrlMatch ? targetUrlMatch[1] : '';

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 8px; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 14mm; box-sizing: border-box;">
          <span style="font-weight: 700; color: #475569; letter-spacing: 0.04em;">WEBTEST SCANNER <span style="font-weight: 400; color: #94a3b8;">· ENTERPRISE AUDIT REPORT</span></span>
          <span style="letter-spacing: 0.04em; text-transform: uppercase;">CONFIDENTIAL</span>
        </div>
      `,
      footerTemplate: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 8px; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0 14mm; box-sizing: border-box;">
          <span>Target: <strong style="color: #475569;">${targetUrl || 'Web Target'}</strong> · Enterprise Audit</span>
          <span style="font-weight: 600; color: #475569;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="webtest-report.pdf"',
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'PDF generation failed.' }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
