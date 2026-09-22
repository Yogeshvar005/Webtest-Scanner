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
export async function buildReportHtml(result: RunResponse, aiSummary?: string): Promise<string> {
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
      const withPreview = result.siteNavLinks!.filter(l => !!l.screenshot);
      const withoutPreview = result.siteNavLinks!.filter(l => !l.screenshot);

      let withPreviewHtml = '';
      if (withPreview.length > 0) {
        withPreviewHtml = `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin-bottom:16px;">
            ${withPreview.map(link => `
              <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;page-break-inside:avoid;break-inside:avoid;">
                <div style="border-bottom:1px solid #e2e8f0;background:#000;">
                  <img src="${escapeHtml(link.screenshot!)}" alt="Screenshot of ${escapeHtml(link.text)}" style="width:100%;height:160px;object-fit:contain;display:block;" />
                </div>
                <div style="padding:10px;">
                  <div style="font-weight:600;font-size:12.5px;color:#0f172a;margin-bottom:4px;">${escapeHtml(link.text || 'Unnamed Link')}</div>
                  <div style="font-size:11.5px;color:#3b82f6;word-break:break-all;">${escapeHtml(link.href)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      let withoutPreviewHtml = '';
      if (withoutPreview.length > 0) {
        withoutPreviewHtml = `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${withoutPreview.map(link => `
              <a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;text-decoration:none;page-break-inside:avoid;break-inside:avoid;">
                <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:rgba(59,130,246,0.1);color:#3b82f6;flex-shrink:0;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </div>
                <div style="display:flex;flex-direction:column;overflow:hidden;">
                  <span style="font-weight:600;font-size:13.5px;color:#0f172a;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${escapeHtml(link.text || 'Unnamed Link')}</span>
                  <span style="font-size:12px;color:#64748b;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${escapeHtml(link.href)}</span>
                </div>
              </a>
            `).join('')}
          </div>
        `;
      }

      reconHtml += `
      <div style="margin-top:24px;">
        <h2 style="margin-top:0;">Extracted Navigation Links</h2>
        ${withPreviewHtml}
        ${withoutPreviewHtml}
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

  let aiSummaryHtml = '';
  if (aiSummary) {
    const formattedSummary = aiSummary
      .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
      .replace(/\\n/g, '<br/>')
      .replace(/\\d+\\.\\s/g, '<br/>• ');
    aiSummaryHtml = `
      <div class="ai-block">
        <div class="ai-header">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          Executive AI Summary
        </div>
        <div class="ai-content">
          ${formattedSummary}
        </div>
      </div>
    `;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Security & Quality Audit — ${escapeHtml(result.targetUrl)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  @page {
    margin: 0;
    size: A4 portrait;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #f1f5f9;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page-container {
    background: #ffffff;
    max-width: 100%;
    margin: 0 auto;
    padding: 40px 50px;
  }
  
  /* PREMIUM HERO */
  .hero {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    padding: 40px;
    border-radius: 16px;
    margin-bottom: 40px;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
  }
  .hero-title {
    font-size: 36px;
    font-weight: 800;
    margin: 0 0 8px 0;
    letter-spacing: -0.03em;
    color: #ffffff;
  }
  .hero-url {
    font-size: 16px;
    color: #94a3b8;
    font-weight: 500;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
  }
  
  .hero-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
    margin-top: 32px;
    padding-top: 32px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .hero-stat-val {
    font-size: 32px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 6px;
  }
  .hero-stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    font-weight: 600;
  }

  /* AI SUMMARY */
  .ai-block {
    background: linear-gradient(to right, #fdf4ff, #faf5ff);
    border: 1px solid #e879f9;
    border-radius: 16px;
    margin-bottom: 40px;
    box-shadow: 0 4px 6px -1px rgba(217, 70, 239, 0.1);
    page-break-inside: avoid;
  }
  .ai-header {
    background: linear-gradient(to right, #d946ef, #a855f7);
    color: #ffffff;
    padding: 16px 24px;
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    border-top-left-radius: 15px;
    border-top-right-radius: 15px;
    letter-spacing: 0.02em;
  }
  .ai-content {
    padding: 24px;
    color: #4c1d95;
    font-size: 14.5px;
    line-height: 1.7;
  }
  .ai-content strong {
    color: #3b0764;
    font-weight: 700;
  }

  /* SECTIONS */
  h2 {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: #0f172a;
    margin: 40px 0 20px 0;
    padding-bottom: 12px;
    border-bottom: 2px solid #e2e8f0;
    page-break-after: avoid;
  }
  
  .finding-item {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    page-break-inside: avoid;
  }
  .finding-title {
    font-weight: 700;
    font-size: 15px;
    color: #0f172a;
    margin-bottom: 8px;
  }
  .finding-detail {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.6;
  }
  pre {
    margin: 12px 0 0;
    padding: 12px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: #334155;
  }

  .footer {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    page-break-inside: avoid;
  }

  @media print {
    body { background: #ffffff; }
    .page-container { padding: 0; box-shadow: none; }
  }
</style>
</head>
<body>
<div class="page-container">
  <div class="hero">
    <h1 class="hero-title">Quality & Security Audit</h1>
    <div class="hero-url">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
      ${escapeHtml(result.targetUrl)}
    </div>
    
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <span class="status-badge" style="background: ${result.status === 'passed' ? 'rgba(16,185,129,0.2)' : result.status === 'failed' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}; border-color: ${result.status === 'passed' ? 'rgba(16,185,129,0.4)' : result.status === 'failed' ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.2)'}; color: ${result.status === 'passed' ? '#34d399' : result.status === 'failed' ? '#f87171' : '#fff'}">
        ${escapeHtml(result.status)}
      </span>
      ${result.strict ? '<span class="status-badge" style="background:rgba(239,68,68,0.2);border-color:rgba(239,68,68,0.4);color:#f87171">Strict Mode</span>' : ''}
      <span style="font-size:12px;color:#94a3b8">Run ID: ${escapeHtml(result.runId.substring(0,8))}</span>
    </div>

    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-val" style="color: #ffffff">${result.totals.total}</div>
        <div class="hero-stat-label">Steps</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val" style="color: #34d399">${result.totals.passed}</div>
        <div class="hero-stat-label">Passed</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val" style="color: #f87171">${result.totals.failed}</div>
        <div class="hero-stat-label">Failed</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val" style="color: #a78bfa">${result.totals.blocked}</div>
        <div class="hero-stat-label">Blocked</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val" style="color: #60a5fa">${Math.round(result.meanConfidence * 100)}%</div>
        <div class="hero-stat-label">Confidence</div>
      </div>
    </div>
  </div>

  ${aiSummaryHtml}
  ${reconHtml}
  ${privacyHtml}
  ${result.categories.length > 0 ? `<h2>Category Breakdown</h2>${categoriesHtml}` : ''}
  ${regularFindings.length > 0 ? `<h2>Detailed Findings</h2>${findingsHtml.replace(/class="finding-item" style="border:1px solid #e2e8f0;border-left:3.5px solid (.*?);/g, 'class="finding-item" style="border-left:4px solid $1;')}` : ''}
  ${result.steps.length > 0 ? `<h2>Execution Timeline</h2>${stepsHtml.join('')}` : ''}

  <div class="footer">
    <strong>Webtest Scanner</strong> · Automated Enterprise Audit Report · Generated ${escapeHtml(generatedAt)}
  </div>
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
export async function printReport(result: RunResponse, aiSummary?: string): Promise<void> {
  let finalSummary = aiSummary;
  
  // If the summary wasn't provided from the UI, automatically fetch it now so the PDF isn't missing it.
  if (!finalSummary) {
    try {
      // Strip screenshots to avoid 413 Payload Too Large
      const strippedResult = {
        ...result,
        siteScreenshot: undefined,
        steps: result.steps.map((s) => ({ ...s, screenshot: undefined })),
        siteNavLinks: result.siteNavLinks?.map((l) => ({ ...l, screenshot: undefined })),
      };

      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultsJSON: strippedResult })
      });
      if (res.ok) {
        const data = await res.json();
        finalSummary = data.summary;
      }
    } catch (e) {
      console.error('Failed to auto-generate AI summary for PDF', e);
    }
  }

  const html = await buildReportHtml(result, finalSummary);

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
