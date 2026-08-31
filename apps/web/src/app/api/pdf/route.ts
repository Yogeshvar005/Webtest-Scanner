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
  } catch {
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
      browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    }
    
    const page = await browser.newPage();

    // Set content directly — no round-trip required.
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Wait for any inline images to finish rendering.
    await page.waitForLoadState('domcontentloaded');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
      displayHeaderFooter: false,
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
