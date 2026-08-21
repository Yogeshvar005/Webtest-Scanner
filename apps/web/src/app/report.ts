import type { RunResponse } from './types';

/** Caps how much image data one report will try to embed. */
const MAX_INLINE_BYTES = 30_000_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fetches a same-origin screenshot and returns it as a base64 data URI.
 *
 * The report is meant to survive as standalone evidence after the dev server
 * is gone, so a live URL reference is not good enough — the bytes have to
 * travel with the file. Failures degrade to the original URL rather than
 * breaking the whole report.
 */
async function toDataUrl(url: string, budget: { remaining: number }): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return url;

    const blob = await response.blob();
    if (blob.size > budget.remaining) return url;
    budget.remaining -= blob.size;

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'passed': return '#0f7a4f';
    case 'failed': return '#b91c1c';
    case 'blocked': return '#6b46c1';
    case 'warning': return '#b45309';
    default: return '#6b7280';
  }
}

function pill(status: string): string {
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:${statusColor(status)}">${escapeHtml(status)}</span>`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high': return '#b91c1c';
    case 'medium': return '#b45309';
    default: return '#6b7280';
  }
}

/**
 * Renders the full run as a standalone HTML document: inline CSS, inline
 * screenshots, no external requests. Opening it with no server running, on a
 * different machine, or a year from now all work identically.
 */
export async function buildReportHtml(result: RunResponse): Promise<string> {
  const budget = { remaining: MAX_INLINE_BYTES };
  const generatedAt = new Date().toLocaleString();

  const stepsHtml = await Promise.all(
    result.steps.map(async (step) => {
      const screenshot = step.screenshot ? await toDataUrl(step.screenshot, budget) : undefined;
      const assertionsHtml = step.assertions
        .map(
          (a) =>
            `<div style="font-size:13px;padding:6px 10px;border-radius:6px;background:#f8fafc;margin-bottom:5px;border-left:3px solid ${a.passed ? '#0f7a4f' : '#b91c1c'}">${a.passed ? '✓' : '✗'} ${escapeHtml(a.description)}${a.detail ? `<div style="color:#6b7280;margin-top:2px">${escapeHtml(a.detail)}</div>` : ''}</div>`,
        )
        .join('');

      return `
        <section style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px;overflow:hidden;break-inside:avoid">
          <header style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb">
            <span style="color:#6b7280;font-size:13px;min-width:20px">${step.index + 1}</span>
            <strong style="flex:1">${escapeHtml(step.intent)}</strong>
            ${pill(step.status)}
            <span style="color:#6b7280;font-size:12px">${step.durationMs}ms</span>
          </header>
          <div style="padding:14px">
            ${step.error ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:9px 11px;border-radius:8px;font-size:13px;margin-bottom:10px">${escapeHtml(step.error)}</div>` : ''}
            ${assertionsHtml}
            ${screenshot ? `<img src="${screenshot}" alt="Screenshot after: ${escapeHtml(step.intent)}" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;margin-top:10px;display:block" />` : ''}
          </div>
        </section>`;
    }),
  );

  const categoriesHtml = result.categories
    .map((category) => {
      const checksHtml = category.checks
        .map(
          (check) => `
          <div style="padding:9px 13px;border-top:1px solid #e5e7eb">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
              ${pill(check.status)}
              <strong style="font-size:13.5px">${escapeHtml(check.name)}</strong>
              <span style="font-size:11px;color:#6b7280;text-transform:uppercase">${escapeHtml(check.severity)}</span>
            </div>
            <div style="font-size:13px;color:#4b5563">${escapeHtml(check.detail)}</div>
            ${check.evidence && check.evidence.length > 0 ? `<pre style="margin:7px 0 0;padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:11.5px;overflow-x:auto;white-space:pre-wrap;word-break:break-word">${escapeHtml(check.evidence.join('\n'))}</pre>` : ''}
          </div>`,
        )
        .join('');

      return `
        <section style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;overflow:hidden;break-inside:avoid">
          <header style="display:flex;align-items:center;gap:10px;padding:11px 13px;background:#f8fafc">
            ${pill(category.status)}
            <strong style="flex:1">${escapeHtml(category.label)}</strong>
            <span style="font-size:12px;color:#6b7280">${category.totals.passed} pass · ${category.totals.failed} fail · ${category.totals.warning} warn</span>
          </header>
          ${category.skippedReason ? `<div style="margin:11px 13px;padding:9px 11px;border-radius:7px;background:#f3f0ff;border:1px solid #ddd6fe;color:#5b21b6;font-size:13px">${escapeHtml(category.skippedReason)}</div>` : ''}
          ${checksHtml}
        </section>`;
    })
    .join('');

  const findingsHtml = result.findings
    .map(
      (f) => `
      <div style="border:1px solid #e5e7eb;border-left:4px solid ${severityColor(f.severity)};border-radius:8px;padding:11px 13px;margin-bottom:10px;break-inside:avoid">
        <div style="font-weight:700;font-size:14px;margin-bottom:3px">${escapeHtml(f.title)}</div>
        <div style="font-size:13px;color:#4b5563">${escapeHtml(f.detail)}</div>
        ${f.evidence ? `<pre style="margin:8px 0 0;padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-word">${escapeHtml(f.evidence)}</pre>` : ''}
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Webtest Scanner report — ${escapeHtml(result.targetUrl)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430; background: #ffffff; margin: 0; padding: 32px; max-width: 900px; margin-inline: auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin: 28px 0 12px; }
  .meta-line { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin: 16px 0 4px; }
  .stat { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .stat .n { font-size: 22px; font-weight: 700; }
  .stat .k { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Webtest Scanner report</h1>
  <div class="meta-line">${escapeHtml(result.targetUrl)} · run ${escapeHtml(result.runId)} · generated ${escapeHtml(generatedAt)} · ${(result.durationMs / 1000).toFixed(1)}s</div>

  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    ${pill(result.status)}
    ${result.strict ? '<span style="font-size:12px;color:#6b7280">strict mode</span>' : ''}
  </div>

  <div class="stats">
    <div class="stat"><div class="n">${result.totals.total}</div><div class="k">Steps</div></div>
    <div class="stat"><div class="n" style="color:#0f7a4f">${result.totals.passed}</div><div class="k">Passed</div></div>
    <div class="stat"><div class="n" style="color:#b91c1c">${result.totals.failed}</div><div class="k">Failed</div></div>
    <div class="stat"><div class="n" style="color:#6b46c1">${result.totals.blocked}</div><div class="k">Blocked</div></div>
    <div class="stat"><div class="n">${Math.round(result.meanConfidence * 100)}%</div><div class="k">Confidence</div></div>
  </div>

  <div class="meta-line" style="margin-top:14px">Policy: <strong>${escapeHtml(result.policyDecision.effect)}</strong> · Ownership tier: <strong>${result.ownership.effectiveTier}</strong></div>
  ${result.policyDecision.reason ? `<div class="meta-line">${escapeHtml(result.policyDecision.reason)}</div>` : ''}

  ${result.categories.length > 0 ? `<h2>Categories</h2>${categoriesHtml}` : ''}
  ${result.findings.length > 0 ? `<h2>Findings (${result.findings.length})</h2>${findingsHtml}` : ''}
  ${result.steps.length > 0 ? `<h2>Steps</h2>${stepsHtml.join('')}` : ''}

  <p style="color:#9ca3af;font-size:11px;margin-top:32px">Generated by Webtest Scanner. Screenshots are embedded as captured; this file makes no claim beyond what is shown above.</p>
</body>
</html>`;
}

/** Downloads the run as a standalone HTML file the user can open, share, or archive. */
export async function downloadReport(result: RunResponse): Promise<void> {
  const html = await buildReportHtml(result);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `webtest-report-${result.runId}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/** Resolves once every image in a document has finished loading (or failed). */
function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  ).then(() => undefined);
}

/**
 * Prints the run as a real, paginated PDF via the browser's print dialog.
 *
 * This deliberately does NOT call `window.print()` on the live app. The app
 * has a fixed-position gradient background, animated widgets, and a
 * three-column control layout that isn't part of the report at all — printing
 * it directly produces a single oversized "screenshot" of the whole page
 * rather than a real document. Instead this builds the same clean, white,
 * paginated report used by `downloadReport`, opens it in its own window, and
 * prints *that* — so the output is actual flowing text and images the browser
 * can paginate, not a rasterised dump of the UI chrome.
 *
 * The window is opened synchronously, before the `await`, because opening a
 * window after an awaited fetch falls outside the click's user-gesture
 * window in some browsers and gets blocked as a popup.
 */
export async function printReport(result: RunResponse): Promise<void> {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');

  if (!printWindow) {
    // Popup blocked: printing the live page is a degraded fallback, not the
    // intended path, but it beats doing nothing.
    window.print();
    return;
  }

  printWindow.document.write(
    '<!doctype html><title>Preparing report…</title><body style="font:15px system-ui;padding:40px;color:#444">Preparing the report for printing…</body>',
  );
  printWindow.document.close();

  const html = await buildReportHtml(result);

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  await waitForImages(printWindow.document);
  printWindow.focus();
  printWindow.print();
}
