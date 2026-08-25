import { NextResponse } from 'next/server';
import { chromium } from 'playwright';

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
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
  } finally {
    await browser?.close();
  }
}
