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
 */
async function toDataUrl(url: string, budget: { remaining: number }): Promise<string> {
  if (url.startsWith('data:')) return url;
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
    case 'passed': return '#059669';
    case 'failed': return '#dc2626';
    case 'blocked': return '#7c3aed';
    case 'warning': return '#d97706';
    default: return '#64748b';
  }
}

function pill(status: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#fff;background:${statusColor(status)}">${escapeHtml(status)}</span>`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high': return '#dc2626';
    case 'medium': return '#d97706';
    default: return '#64748b';
  }
}

function cleanEvidence(evidence: string[]): string {
  // Collapse excessive blank lines
  const cleaned: string[] = [];
  let prevEmpty = false;
  const lines = evidence.join('\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!prevEmpty && cleaned.length > 0) {
        cleaned.push('');
        prevEmpty = true;
      }
    } else {
      cleaned.push(line);
      prevEmpty = false;
    }
  }
  return cleaned.join('\n').trim();
}

/**
 * Renders the full run as a standalone, gap-free HTML document:
 * Inline CSS, compact spacing, zero orphaned headers, and clean page breaks.
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
            `<div style="font-size:12.5px;padding:6px 9px;border-radius:5px;background:#f8fafc;margin-bottom:4px;border-left:3px solid ${a.passed ? '#059669' : '#dc2626'}">${a.passed ? '✓' : '✗'} ${escapeHtml(a.description)}${a.detail ? `<div style="color:#64748b;margin-top:2px;font-size:11.5px">${escapeHtml(a.detail)}</div>` : ''}</div>`,
        )
        .join('');

      return `
        <div class="step-card" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden;page-break-inside:avoid;break-inside:avoid">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
            <span style="color:#64748b;font-size:12px;min-width:18px;font-weight:700">${step.index + 1}</span>
            <strong style="flex:1;font-size:13px">${escapeHtml(step.intent)}</strong>
            ${pill(step.status)}
            <span style="color:#64748b;font-size:11.5px">${step.durationMs}ms</span>
          </div>
          <div style="padding:10px 12px">
            ${step.error ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 10px;border-radius:6px;font-size:12px;margin-bottom:8px">${escapeHtml(step.error)}</div>` : ''}
            ${assertionsHtml}
            ${screenshot ? `<img src="${screenshot}" alt="Screenshot after: ${escapeHtml(step.intent)}" style="width:100%;max-height:480px;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;margin-top:8px;display:block;background:#05070D" />` : ''}
          </div>
        </div>`;
    }),
  );

  const categoriesHtml = result.categories
    .map((category) => {
      const checksHtml = category.checks
        .map((check) => {
          const evidenceStr = check.evidence && check.evidence.length > 0 ? cleanEvidence(check.evidence) : '';
          return `
          <div class="check-item" style="padding:8px 12px;border-top:1px solid #e2e8f0;page-break-inside:avoid;break-inside:avoid">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
              ${pill(check.status)}
              <strong style="font-size:12.5px">${escapeHtml(check.name)}</strong>
              <span style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">${escapeHtml(check.severity)}</span>
            </div>
            <div style="font-size:12px;color:#334155;line-height:1.45">${escapeHtml(check.detail)}</div>
            ${evidenceStr ? `<pre style="margin:5px 0 0;padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;line-height:1.35;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-word;max-height:360px">${escapeHtml(evidenceStr)}</pre>` : ''}
          </div>`;
        })
        .join('');

      return `
        <div class="category-block" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#f8fafc;page-break-inside:avoid;break-inside:avoid">
            ${pill(category.status)}
            <strong style="flex:1;font-size:13px">${escapeHtml(category.label)}</strong>
            <span style="font-size:11.5px;color:#64748b">${category.totals.passed} pass · ${category.totals.failed} fail · ${category.totals.warning} warn</span>
          </div>
          ${category.skippedReason ? `<div style="margin:8px 12px;padding:7px 9px;border-radius:6px;background:#f3f0ff;border:1px solid #ddd6fe;color:#5b21b6;font-size:12px">${escapeHtml(category.skippedReason)}</div>` : ''}
          ${checksHtml}
        </div>`;
    })
    .join('');

  const privacyFindings = result.findings.filter((f) => f.type === 'blocked_egress' || f.type === 'third_party_contact');
  const regularFindings = result.findings.filter((f) => f.type !== 'blocked_egress' && f.type !== 'third_party_contact');

  let privacyHtml = '';
  if (privacyFindings.length > 0) {
    const listHtml = privacyFindings.map((f) => {
      const evidenceStr = f.evidence ? cleanEvidence(f.evidence.split('\n')) : '';
      let formattedEvidence = '';
      if (evidenceStr) {
        if (f.type === 'third_party_contact') {
          const items = evidenceStr.split('\n').map(line => `<li style="margin-bottom:3px"><code style="background:#f1f5f9;padding:2px 5px;border-radius:3px;border:1px solid #e2e8f0;color:#334155">${escapeHtml(line)}</code></li>`).join('');
          formattedEvidence = `<div style="margin-top:10px;font-weight:600;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.03em;">Top Trackers and Third-Party Origins Included:</div><ul style="margin:6px 0 0 0;padding-left:22px;font-size:11.5px;">${items}</ul>`;
        } else {
          formattedEvidence = `<pre style="margin:6px 0 0;padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;line-height:1.35;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-word;max-height:360px">${escapeHtml(evidenceStr)}</pre>`;
        }
      }
      return `
      <div class="finding-item" style="border:1px solid #e2e8f0;border-left:3.5px solid ${severityColor(f.severity)};border-radius:6px;padding:10px 12px;margin-bottom:10px;background:#fff;page-break-inside:avoid;break-inside:avoid">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#0f172a">${escapeHtml(f.title)}</div>
        <div style="font-size:12.5px;color:#475569;line-height:1.5">${escapeHtml(f.detail)}</div>
        ${formattedEvidence}
      </div>`;
    }).join('');

    privacyHtml = `
      <div style="margin-top:24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
        <div style="background:#f1f5f9;padding:12px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:13px;color:#0f172a;display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Privacy & Supply Chain Egress
        </div>
        <div style="padding:14px 14px 4px 14px;">
          ${listHtml}
        </div>
      </div>
    `;
  }

  const findingsHtml = regularFindings
    .map((f) => {
      const evidenceStr = f.evidence ? cleanEvidence(f.evidence.split('\n')) : '';
      return `
      <div class="finding-item" style="border:1px solid #e2e8f0;border-left:3.5px solid ${severityColor(f.severity)};border-radius:6px;padding:9px 11px;margin-bottom:8px;page-break-inside:avoid;break-inside:avoid">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">${escapeHtml(f.title)}</div>
        <div style="font-size:12px;color:#334155;line-height:1.45">${escapeHtml(f.detail)}</div>
        ${evidenceStr ? `<pre style="margin:6px 0 0;padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:11px;line-height:1.35;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-word;max-height:360px">${escapeHtml(evidenceStr)}</pre>` : ''}
      </div>`;
    })
    .join('');


  const hasLinks = result.siteNavLinks && result.siteNavLinks.length > 0;
  const hasButtons = result.siteButtons && result.siteButtons.length > 0;

  let reconHtml = '';
  if (hasLinks || hasButtons) {
    if (hasLinks) {
      const linksHtml = result.siteNavLinks!.map(link => {
        const screenshotHtml = link.screenshot 
          ? `<div style="border-bottom:1px solid #e2e8f0;background:#000;"><img src="${escapeHtml(link.screenshot)}" alt="Screenshot of ${escapeHtml(link.text)}" style="width:100%;height:160px;object-fit:contain;display:block;" /></div>`
          : `<div style="height:160px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">No Preview</div>`;
        return `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;page-break-inside:avoid;break-inside:avoid;">
          ${screenshotHtml}
          <div style="padding:10px;">
            <div style="font-weight:600;font-size:12.5px;color:#0f172a;margin-bottom:4px;">${escapeHtml(link.text || 'Unnamed Link')}</div>
            <div style="font-size:11.5px;color:#3b82f6;word-break:break-all;">${escapeHtml(link.href)}</div>
          </div>
        </div>`;
      }).join('');
      reconHtml += `
      <div style="margin-top:24px;">
        <h2 style="margin-top:0;">Extracted Navigation Links</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">
          ${linksHtml}
        </div>
      </div>`;
    }

    if (hasButtons) {
      const buttonsHtml = result.siteButtons!.map(btn => {
        return `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:6px 10px;font-size:12px;font-weight:500;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(btn)}">${escapeHtml(btn)}</div>`;
      }).join('');
      reconHtml += `
      <div style="margin-top:24px;">
        <h2>Extracted Buttons</h2>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${buttonsHtml}
        </div>
      </div>`;
    }
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Webtest Scanner report — ${escapeHtml(result.targetUrl)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  @page {
    margin: 12mm 10mm;
    size: A4 portrait;
  }
  body {
    font: 13.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 20px;
    max-width: 860px;
    margin-inline: auto;
  }
  h1 {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 4px;
    color: #0f172a;
  }
  h2 {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #475569;
    margin: 20px 0 8px;
    page-break-after: avoid;
    break-after: avoid;
  }
  .meta-line {
    color: #64748b;
    font-size: 12px;
    margin-bottom: 12px;
    line-height: 1.4;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin: 12px 0;
  }
  .stat {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .stat .n {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.1;
  }
  .stat .k {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: #64748b;
    margin-top: 3px;
  }
  .report-header {
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e2e8f0;
  }
  @media print {
    body { padding: 0; }
    .category-block { page-break-inside: auto; break-inside: auto; }
    .check-item { page-break-inside: auto; break-inside: auto; }
    .finding-item { page-break-inside: avoid; break-inside: avoid; }
    .step-card { page-break-inside: avoid; break-inside: avoid; }
    h2 { page-break-after: avoid; break-after: avoid; }
    pre { max-height: none !important; overflow: visible !important; }
  }
</style>
</head>
<body>
  <div class="report-header">
    <h1>Webtest Scanner Report</h1>
    <div class="meta-line">
      <strong>${escapeHtml(result.targetUrl)}</strong> · Run ID: ${escapeHtml(result.runId)} · Generated: ${escapeHtml(generatedAt)} · ${(result.durationMs / 1000).toFixed(1)}s
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      ${pill(result.status)}
      ${result.strict ? '<span style="font-size:11px;color:#64748b;font-weight:600">Strict Mode</span>' : ''}
    </div>

    <div class="stats">
      <div class="stat"><div class="n">${result.totals.total}</div><div class="k">Steps</div></div>
      <div class="stat"><div class="n" style="color:#059669">${result.totals.passed}</div><div class="k">Passed</div></div>
      <div class="stat"><div class="n" style="color:#dc2626">${result.totals.failed}</div><div class="k">Failed</div></div>
      <div class="stat"><div class="n" style="color:#7c3aed">${result.totals.blocked}</div><div class="k">Blocked</div></div>
      <div class="stat"><div class="n">${Math.round(result.meanConfidence * 100)}%</div><div class="k">Confidence</div></div>
    </div>

    <div class="meta-line" style="margin:8px 0 0">
      Policy: <strong>${escapeHtml(result.policyDecision.effect)}</strong> · Ownership Tier: <strong>${result.ownership.effectiveTier}</strong>
      ${result.policyDecision.reason ? ` · ${escapeHtml(result.policyDecision.reason)}` : ''}
    </div>
  </div>

  ${reconHtml}
  ${privacyHtml}
  ${result.categories.length > 0 ? `<h2>Categories (${result.categories.length})</h2>${categoriesHtml}` : ''}
  ${regularFindings.length > 0 ? `<h2>Findings (${regularFindings.length})</h2>${findingsHtml}` : ''}
  ${result.steps.length > 0 ? `<h2>Steps &amp; Screenshots (${result.steps.length})</h2>${stepsHtml.join('')}` : ''}

  <div style="color:#94a3b8;font-size:10.5px;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;text-align:center">
    Generated by Webtest Scanner. Screenshots and data extracted from live browser execution.
  </div>
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

  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Exports the run as a PDF by sending the pre-built HTML to the /api/pdf
 * server route, which uses Playwright to render it and return the bytes.
 */
export async function printReport(result: RunResponse): Promise<void> {
  const html = await buildReportHtml(result);

  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`PDF generation failed: ${err}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `webtest-report-${result.runId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 100);
}
