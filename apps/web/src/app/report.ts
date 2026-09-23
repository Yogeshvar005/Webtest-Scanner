import type { RunResponse } from './types';

/** Caps how much image data one report will try to embed. */
const MAX_INLINE_BYTES = 30_000_000;

export interface SummaryFinding {
  label: string;
  detail: string;
  tag: string;
  color: string;
  icon: string;
}

export interface SummaryRemediation {
  title: string;
  detail: string;
  icon: string;
}

export interface SummaryData {
  verdict: 'passed' | 'failed' | 'warning';
  score: number;
  overview: string;
  findings: SummaryFinding[];
  remediation: SummaryRemediation[];
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Safe markdown parser for executive summaries and findings.
 * Converts bold, italics, inline code, headings, lists, and paragraphs.
 * Zero regex backslash bugs.
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  const text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Heading: ### or ## or #
    const headingMatch = raw.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      const level = headingMatch[1].length;
      const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      out.push(`<${tag} class="md-heading">${formatInlineMarkdown(headingMatch[2])}</${tag}>`);
      continue;
    }

    // List item: *, -, •, or 1.
    const listMatch = raw.match(/^([*\-•]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      out.push(`<li>${formatInlineMarkdown(listMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    out.push(`<p class="md-p">${formatInlineMarkdown(raw)}</p>`);
  }

  if (inList) {
    out.push('</ul>');
  }

  return out.join('');
}

function formatInlineMarkdown(text: string): string {
  let res = escapeHtml(text);
  res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/__(.+?)__/g, '<strong>$1</strong>');
  res = res.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  res = res.replace(/_([^_]+?)_/g, '<em>$1</em>');
  res = res.replace(/`([^`]+?)`/g, '<code class="md-code">$1</code>');
  return res;
}

/**
 * Computes deterministic summary data if not passed from UI.
 */
export function computeSummaryData(result: RunResponse, customOverview?: string): SummaryData {
  const conf = Math.round(result.meanConfidence * 100);
  const failedCats = result.categories.filter((c) => c.status === 'failed');
  const warnCats = result.categories.filter((c) => c.status === 'warning');
  const critFindings = result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const medFindings = result.findings.filter((f) => f.severity === 'medium');

  let score = 100;
  score -= result.totals.failed * 20;               // functional step failures
  score -= failedCats.length * 6;                   // passive inspection advisory fails
  score -= warnCats.length * 3;                     // warnings
  score -= critFindings.length * 4;                 // informational findings
  score -= medFindings.length * 1;
  if (result.totals.blocked > 0) score -= 3;
  score = Math.max(0, Math.min(100, score));

  const verdict: 'passed' | 'failed' | 'warning' =
    result.totals.failed > 0
      ? 'failed'
      : failedCats.length === 0 && warnCats.length === 0
      ? 'passed'
      : 'warning';

  let hostname = result.targetUrl;
  try {
    hostname = new URL(result.targetUrl).hostname;
  } catch {}

  const overview = customOverview || (
    result.totals.failed === 0
      ? `The autonomous audit of ${hostname} completed with all ${result.totals.total} functional steps passing at ${conf}% inference confidence.${failedCats.length > 0 ? ` Passive inspection identified ${failedCats.length} categor${failedCats.length === 1 ? 'y' : 'ies'} (${failedCats.map((c) => c.label).join(', ')}) with hardening opportunities — these are advisory findings that do not indicate functional breakage.` : ' The target demonstrates a sound overall posture.'}`
      : `The autonomous audit of ${hostname} concluded with ${result.totals.failed} functional step failure${result.totals.failed !== 1 ? 's' : ''} across ${result.totals.total} total steps at ${conf}% inference confidence. ${failedCats.length > 0 ? `Inspection also flagged ${failedCats.length} categor${failedCats.length === 1 ? 'y' : 'ies'} requiring attention.` : ''}`
  );

  const findings: SummaryFinding[] = [];
  if (critFindings.length > 0) {
    findings.push({
      label: `${critFindings.length} Critical/High Severity Finding${critFindings.length > 1 ? 's' : ''}`,
      detail: critFindings.slice(0, 3).map((f) => f.title).join(' · '),
      tag: 'CRITICAL',
      color: '#ef4444',
      icon: '🔴',
    });
  }

  failedCats.forEach((c) => {
    const fc = c.checks.filter((ch) => ch.status === 'failed');
    if (fc.length > 0) {
      findings.push({
        label: c.label,
        detail: `${fc[0].name} — ${fc[0].detail.slice(0, 160)}${fc[0].detail.length > 160 ? '…' : ''}`,
        tag: 'FAILED',
        color: '#f97316',
        icon: '⚠️',
      });
    }
  });

  warnCats.forEach((c) => {
    const wc = c.checks.filter((ch) => ch.status === 'warning');
    findings.push({
      label: `${c.label} — Advisory`,
      detail: wc.length > 0 ? `${wc[0].name}: ${wc[0].detail.slice(0, 140)}${wc[0].detail.length > 140 ? '…' : ''}` : `${wc.length} advisory issue${wc.length !== 1 ? 's' : ''} flagged for review.`,
      tag: 'WARNING',
      color: '#eab308',
      icon: '🟡',
    });
  });

  if (result.totals.blocked > 0) {
    findings.push({
      label: 'Policy Enforcement Active',
      detail: `${result.totals.blocked} step${result.totals.blocked > 1 ? 's' : ''} were blocked by ownership policy. Review policy configuration to ensure legitimate flows are not gated.`,
      tag: 'POLICY',
      color: '#8b5cf6',
      icon: '🛡️',
    });
  }

  if (findings.length === 0) {
    findings.push({
      label: 'All Checks Passed',
      detail: `All ${result.totals.passed} executed steps returned expected outcomes with no failures or warnings detected.`,
      tag: 'PASSED',
      color: '#22c55e',
      icon: '✅',
    });
  }

  const remediation: SummaryRemediation[] = [];
  if (failedCats.some((c) => c.category === 'security')) {
    remediation.push({ icon: '🔒', title: 'Harden Security Headers', detail: 'Implement a Content Security Policy (CSP), set Strict-Transport-Security, and ensure all session cookies carry Secure and HttpOnly flags to protect against XSS and MITM attacks.' });
  }
  if (failedCats.some((c) => c.category === 'accessibility')) {
    remediation.push({ icon: '♿', title: 'Resolve Accessibility Gaps', detail: 'Audit all interactive elements for keyboard focus rings, ensure every form input has an accessible ARIA label, and verify colour contrast meets WCAG 2.1 AA (4.5:1) requirements.' });
  }
  if (failedCats.some((c) => c.category === 'performance')) {
    remediation.push({ icon: '⚡', title: 'Improve Page Performance', detail: 'Profile and defer non-critical JavaScript, enable compression (gzip/brotli), adopt a CDN for static assets, and implement code-splitting to reduce Time-to-Interactive.' });
  }
  if (failedCats.some((c) => c.category === 'ui' || c.category === 'visual')) {
    remediation.push({ icon: '🎨', title: 'Fix Visual Regressions', detail: 'Review viewport meta tag configuration for mobile responsiveness, validate image aspect ratios, and resolve any broken or zero-size rendering artefacts reported by the visual scanner.' });
  }
  if (remediation.length === 0) {
    remediation.push({ icon: '📅', title: 'Maintain Audit Cadence', detail: 'Schedule recurring automated audits (weekly or on each deployment) to detect regressions early before they reach production users.' });
    remediation.push({ icon: '🧪', title: 'Expand Test Coverage', detail: 'Add authenticated user-journey tests and cross-browser visual regression checks to increase confidence across the full application surface.' });
  }

  return { verdict, score, overview, findings, remediation };
}

/**
 * Fetches a same-origin screenshot and returns it as a base64 data URI.
 */
async function toDataUrl(url: string, budget: { remaining: number }): Promise<string> {
  if (!url) return '';
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
    case 'skipped':
    case 'not-applicable': return '#64748b';
    default: return '#64748b';
  }
}

function statusBadge(status: string): string {
  const bg = `${statusColor(status)}18`;
  const border = `${statusColor(status)}40`;
  const color = statusColor(status);
  return `<span class="status-pill" style="background:${bg};border-color:${border};color:${color}">${escapeHtml(status)}</span>`;
}

function severityColor(severity: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical':
    case 'high': return '#dc2626';
    case 'medium': return '#d97706';
    case 'low': return '#2563eb';
    default: return '#64748b';
  }
}

function severityBadge(severity: string): string {
  if (!severity) return '';
  const col = severityColor(severity);
  return `<span class="severity-badge" style="color:${col};background:${col}14;border:1px solid ${col}30">${escapeHtml(severity)}</span>`;
}

function cleanEvidence(evidence: string[], maxLines = 14): string {
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

  if (cleaned.length > maxLines) {
    const remaining = cleaned.length - maxLines;
    const truncated = cleaned.slice(0, maxLines);
    truncated.push(`... (+${remaining} more items truncated for report readability)`);
    return truncated.join('\n');
  }

  return cleaned.join('\n').trim();
}

/** Formats evidence lines with visual color swatches if lines contain RGB/Hex colors */
function formatEvidenceLines(evidenceStr: string, isColorCheck: boolean): string {
  const lines = evidenceStr.split('\n');
  const formatted = lines.map((line) => {
    let html = escapeHtml(line);
    if (isColorCheck) {
      const match = line.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
      if (match) {
        const colorVal = match[1];
        const swatch = `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${escapeHtml(colorVal)};border:1px solid rgba(0,0,0,0.25);vertical-align:middle;margin-right:6px"></span>`;
        html = swatch + html;
      }
    }
    return html;
  });
  return formatted.join('\n');
}

/**
 * Builds the complete standalone HTML document for printing or saving.
 */
export async function buildReportHtml(
  result: RunResponse,
  aiSummary?: string,
  summaryData?: SummaryData | null
): Promise<string> {
  const budget = { remaining: MAX_INLINE_BYTES };
  const generatedAt = new Date().toLocaleString();

  // Resolve summary data
  const summary: SummaryData = summaryData || computeSummaryData(result, typeof aiSummary === 'string' && aiSummary.length > 50 ? undefined : undefined);

  const scoreColor = summary.score >= 80 ? '#059669' : summary.score >= 60 ? '#d97706' : '#dc2626';
  const scoreVerdictLabel = summary.verdict === 'passed' ? 'HEALTHY' : summary.verdict === 'failed' ? 'AT RISK' : 'NEEDS ATTENTION';
  const scoreVerdictBg = summary.verdict === 'passed' ? 'rgba(5,150,105,0.12)' : summary.verdict === 'failed' ? 'rgba(220,38,38,0.12)' : 'rgba(217,119,6,0.12)';
  const scoreVerdictBorder = summary.verdict === 'passed' ? 'rgba(5,150,105,0.3)' : summary.verdict === 'failed' ? 'rgba(220,38,38,0.3)' : 'rgba(217,119,6,0.3)';

  // Process screenshots
  const siteScreenshotUrl = result.siteScreenshot ? await toDataUrl(result.siteScreenshot, budget) : undefined;

  // Steps
  const stepsHtml = await Promise.all(
    (result.steps || []).map(async (step) => {
      const screenshot = step.screenshot ? await toDataUrl(step.screenshot, budget) : undefined;
      const assertionsHtml = (step.assertions || [])
        .map(
          (a) =>
            `<div class="assertion-row ${a.passed ? 'pass' : 'fail'}">
              <span class="assert-icon">${a.passed ? '✓' : '✗'}</span>
              <div class="assert-content">
                <span class="assert-desc">${escapeHtml(a.description)}</span>
                ${a.detail ? `<div class="assert-detail">${escapeHtml(a.detail)}</div>` : ''}
              </div>
            </div>`,
        )
        .join('');

      return `
        <div class="step-card">
          <div class="step-header">
            <span class="step-num">#${step.index + 1}</span>
            <strong class="step-intent">${escapeHtml(step.intent)}</strong>
            ${statusBadge(step.status)}
            <span class="step-duration">${step.durationMs}ms</span>
          </div>
          <div class="step-body">
            ${step.error ? `<div class="step-error">${escapeHtml(step.error)}</div>` : ''}
            ${assertionsHtml}
            ${screenshot ? `
              <div class="step-screenshot-wrap">
                <img src="${screenshot}" alt="Screenshot for: ${escapeHtml(step.intent)}" class="step-screenshot" />
              </div>` : ''}
          </div>
        </div>`;
    }),
  );

  // Categories
  const categoriesHtml = (result.categories || [])
    .map((category) => {
      const isColorCategory = category.category === 'design';
      const checksHtml = (category.checks || [])
        .map((check) => {
          const evidenceStr = check.evidence && check.evidence.length > 0 ? cleanEvidence(check.evidence) : '';
          const isColorCheck = isColorCategory && check.name.toLowerCase().includes('colo');
          const formattedEvidence = evidenceStr ? formatEvidenceLines(evidenceStr, isColorCheck) : '';

          return `
          <div class="check-item">
            <div class="check-top">
              ${statusBadge(check.status)}
              <strong class="check-name">${escapeHtml(check.name)}</strong>
              ${severityBadge(check.severity)}
            </div>
            <div class="check-detail">${escapeHtml(check.detail)}</div>
            ${formattedEvidence ? `<pre class="evidence-box">${formattedEvidence}</pre>` : ''}
          </div>`;
        })
        .join('');

      return `
        <div class="category-block">
          <div class="category-header">
            ${statusBadge(category.status)}
            <strong class="category-title">${escapeHtml(category.label)}</strong>
            <span class="category-stats">
              <span class="cat-pill pass">${category.totals.passed} pass</span>
              ${category.totals.failed > 0 ? `<span class="cat-pill fail">${category.totals.failed} fail</span>` : ''}
              ${category.totals.warning > 0 ? `<span class="cat-pill warn">${category.totals.warning} warn</span>` : ''}
            </span>
          </div>
          ${category.skippedReason ? `<div class="category-skipped">${escapeHtml(category.skippedReason)}</div>` : ''}
          <div class="checks-list">
            ${checksHtml}
          </div>
        </div>`;
    })
    .join('');

  // Findings
  const privacyFindings = (result.findings || []).filter((f) => f.type === 'blocked_egress' || f.type === 'third_party_contact');
  const regularFindings = (result.findings || []).filter((f) => f.type !== 'blocked_egress' && f.type !== 'third_party_contact');

  let privacyHtml = '';
  if (privacyFindings.length > 0) {
    const listHtml = privacyFindings.map((f) => {
      const evidenceStr = f.evidence ? cleanEvidence(f.evidence.split('\n')) : '';
      let formattedEvidence = '';
      if (evidenceStr) {
        if (f.type === 'third_party_contact') {
          const items = evidenceStr.split('\n').map(line => `<li><code>${escapeHtml(line)}</code></li>`).join('');
          formattedEvidence = `<div class="third-party-title">Contacted Third-Party Origins:</div><ul class="third-party-list">${items}</ul>`;
        } else {
          formattedEvidence = `<pre class="evidence-box">${escapeHtml(evidenceStr)}</pre>`;
        }
      }
      return `
      <div class="finding-card" style="border-left-color: ${severityColor(f.severity)}">
        <div class="finding-title">${escapeHtml(f.title)}</div>
        <div class="finding-detail">${escapeHtml(f.detail)}</div>
        ${formattedEvidence}
      </div>`;
    }).join('');

    privacyHtml = `
      <div class="section-container">
        <h2>Privacy &amp; Supply Chain Egress</h2>
        <div class="findings-list">
          ${listHtml}
        </div>
      </div>
    `;
  }

  const findingsHtml = regularFindings
    .map((f) => {
      const evidenceStr = f.evidence ? cleanEvidence(f.evidence.split('\n')) : '';
      return `
      <div class="finding-card" style="border-left-color: ${severityColor(f.severity)}">
        <div class="finding-header">
          <span class="finding-title">${escapeHtml(f.title)}</span>
          ${severityBadge(f.severity)}
        </div>
        <div class="finding-detail">${escapeHtml(f.detail)}</div>
        ${evidenceStr ? `<pre class="evidence-box">${escapeHtml(evidenceStr)}</pre>` : ''}
      </div>`;
    })
    .join('');

  // Reconnaissance (Links & Buttons)
  const hasLinks = result.siteNavLinks && result.siteNavLinks.length > 0;
  const hasButtons = result.siteButtons && result.siteButtons.length > 0;

  let reconHtml = '';
  if (hasLinks || hasButtons) {
    let linksContent = '';
    if (hasLinks) {
      const withPreview = result.siteNavLinks!.filter((l) => !!l.screenshot);
      const withoutPreview = result.siteNavLinks!.filter((l) => !l.screenshot);

      let withPreviewHtml = '';
      if (withPreview.length > 0) {
        withPreviewHtml = `
          <div class="link-previews-grid">
            ${withPreview.map((link) => `
              <div class="link-preview-card">
                <div class="lp-img-wrap">
                  <img src="${escapeHtml(link.screenshot!)}" alt="${escapeHtml(link.text)}" />
                </div>
                <div class="lp-meta">
                  <div class="lp-text">${escapeHtml(link.text || 'Unnamed Link')}</div>
                  <div class="lp-url">${escapeHtml(link.href)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      let withoutPreviewHtml = '';
      if (withoutPreview.length > 0) {
        // Render as a sleek compact table instead of massive bloated cards
        withoutPreviewHtml = `
          <div class="links-table-container">
            <table class="recon-table">
              <thead>
                <tr>
                  <th style="width: 32px">#</th>
                  <th style="width: 28%">Link Label</th>
                  <th>Destination URL</th>
                </tr>
              </thead>
              <tbody>
                ${withoutPreview.map((link, idx) => `
                  <tr>
                    <td class="td-num">${idx + 1}</td>
                    <td class="td-label">${escapeHtml(link.text || '(empty)')}</td>
                    <td class="td-url"><code>${escapeHtml(link.href)}</code></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      linksContent = `
        <div class="recon-subblock">
          <div class="section-subheading">Extracted Navigation Links (${result.siteNavLinks!.length})</div>
          ${withPreviewHtml}
          ${withoutPreviewHtml}
        </div>
      `;
    }

    let buttonsContent = '';
    if (hasButtons) {
      const buttonsHtml = result.siteButtons!.map((btn) => `
        <span class="btn-chip">${escapeHtml(btn)}</span>
      `).join('');
      buttonsContent = `
        <div class="recon-subblock">
          <div class="section-subheading">Extracted Interactive Buttons (${result.siteButtons!.length})</div>
          <div class="btn-chips-wrap">
            ${buttonsHtml}
          </div>
        </div>
      `;
    }

    reconHtml = `
      <div class="section-container">
        <h2>Reconnaissance &amp; Surface Discovery</h2>
        ${linksContent}
        ${buttonsContent}
      </div>
    `;
  }

  // Render AI Summary block (if available from LLM or computed)
  let aiNarrativeBlock = '';
  if (aiSummary && typeof aiSummary === 'string' && aiSummary.trim().length > 0) {
    const rendered = renderMarkdown(aiSummary);
    aiNarrativeBlock = `
      <div class="ai-narrative-container">
        <div class="ai-narrative-header">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          Detailed AI Security &amp; Quality Assessment
        </div>
        <div class="ai-narrative-body">
          ${rendered}
        </div>
      </div>
    `;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Security &amp; Quality Audit — ${escapeHtml(result.targetUrl)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="target-url" content="${escapeHtml(result.targetUrl)}" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  
  @page {
    size: A4 portrait;
    margin: 16mm 14mm 18mm 14mm;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #f8fafc;
    margin: 0;
    padding: 0;
    font-size: 13px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .report-wrapper {
    background: #ffffff;
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 36px;
  }

  /* ── PRINT RULES ── */
  @media print {
    body { background: #ffffff !important; }
    .report-wrapper { padding: 0 !important; max-width: 100% !important; }
    .no-print { display: none !important; }
    .html-only-footer { display: none !important; }
    h2 { page-break-after: avoid; break-after: avoid; }
    .step-card, .check-item, .finding-card, .summary-finding-card, .remediation-card {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }

  /* ── HERO BANNER (PAGE 1) ── */
  .hero-card {
    background: linear-gradient(135deg, #090e17 0%, #162032 100%);
    color: #ffffff;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  }

  .hero-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .hero-brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .brand-badge {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #38bdf8;
    text-transform: uppercase;
  }

  .brand-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #ffffff;
  }

  .hero-status-pill {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 4px 12px;
    border-radius: 9999px;
    text-transform: uppercase;
  }

  .hero-status-pill.passed {
    background: rgba(5, 150, 105, 0.25);
    border: 1px solid rgba(5, 150, 105, 0.5);
    color: #34d399;
  }

  .hero-status-pill.warning {
    background: rgba(217, 119, 6, 0.25);
    border: 1px solid rgba(217, 119, 6, 0.5);
    color: #fbbf24;
  }

  .hero-status-pill.failed {
    background: rgba(220, 38, 38, 0.25);
    border: 1px solid rgba(220, 38, 38, 0.5);
    color: #f87171;
  }

  .hero-target-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .target-url-box {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .url-text {
    word-break: break-all;
    color: #f1f5f9;
  }

  .hero-meta-items {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .meta-tag {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    color: #94a3b8;
  }

  .meta-tag.strict {
    background: rgba(239,68,68,0.2);
    border-color: rgba(239,68,68,0.4);
    color: #fca5a5;
    font-weight: 700;
  }

  /* ── KPI METRICS GRID ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .kpi-cell {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 6px 8px;
    text-align: center;
  }

  .kpi-val {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 2px;
    color: #ffffff;
  }

  .kpi-label {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #94a3b8;
    text-transform: uppercase;
  }

  /* ── EXECUTIVE SUMMARY SECTION ── */
  .executive-section {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #ffffff;
    overflow: hidden;
    margin-bottom: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    page-break-after: always;
    break-after: page;
  }

  .exec-header {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-bottom: 1px solid #e2e8f0;
    padding: 8px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .exec-title-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 13px;
    color: #0f172a;
  }

  .exec-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 10px;
    background: rgba(37,99,235,0.1);
    color: #2563eb;
    letter-spacing: 0.03em;
  }

  .overview-row {
    padding: 12px 14px;
    display: flex;
    gap: 14px;
    align-items: flex-start;
    border-bottom: 1px solid #e2e8f0;
  }

  .score-card {
    flex-shrink: 0;
    width: 100px;
    padding: 8px 6px;
    border-radius: 8px;
    text-align: center;
    background: ${scoreVerdictBg};
    border: 1px solid ${scoreVerdictBorder};
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .score-number {
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
    color: ${scoreColor};
  }

  .score-label {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: ${scoreColor};
    text-transform: uppercase;
  }

  .score-verdict {
    font-size: 8.5px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 5px;
    background: ${scoreVerdictBg};
    border: 1px solid ${scoreVerdictBorder};
    color: ${scoreColor};
    letter-spacing: 0.04em;
    margin-top: 2px;
  }

  .overview-text-wrap {
    flex: 1;
    min-width: 0;
  }

  .overview-heading {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .overview-p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: #334155;
  }

  .snapshot-preview-wrap {
    flex-shrink: 0;
    width: 140px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
    background: #090e17;
  }

  .snapshot-preview-img {
    width: 100%;
    height: 80px;
    object-fit: cover;
    display: block;
  }

  /* ── FINDINGS HIGHLIGHTS ── */
  .summary-block {
    padding: 10px 14px;
    border-bottom: 1px solid #e2e8f0;
  }

  .summary-block-title {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.07em;
    color: #475569;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .summary-findings-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .summary-finding-card {
    padding: 6px 10px;
    border-radius: 6px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }

  .sfc-header {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 2px;
  }

  .sfc-icon { font-size: 12px; line-height: 1; }
  .sfc-title { font-weight: 700; font-size: 12px; color: #0f172a; flex: 1; }
  .sfc-tag {
    font-size: 9px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid transparent;
    letter-spacing: 0.03em;
  }
  .sfc-detail {
    font-size: 11.5px;
    color: #475569;
    line-height: 1.4;
  }

  /* ── REMEDIATION ADVICE ── */
  .remediation-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .remediation-card {
    display: flex;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(5, 150, 105, 0.04);
    border: 1px solid rgba(5, 150, 105, 0.16);
    align-items: flex-start;
  }

  .rem-icon { font-size: 13px; line-height: 1.2; flex-shrink: 0; }
  .rem-body { flex: 1; }
  .rem-title { font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 1px; }
  .rem-detail { font-size: 11.5px; color: #334155; line-height: 1.4; }

  /* ── AI NARRATIVE ACCORDION ── */
  .ai-narrative-container {
    margin: 16px 20px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
    overflow: hidden;
  }

  .ai-narrative-header {
    background: #f1f5f9;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 700;
    color: #334155;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid #e2e8f0;
  }

  .ai-narrative-body {
    padding: 14px 16px;
    color: #334155;
    font-size: 12.5px;
    line-height: 1.6;
  }

  .ai-narrative-body .md-heading {
    font-size: 13.5px;
    font-weight: 700;
    color: #0f172a;
    margin: 12px 0 6px 0;
  }

  .ai-narrative-body .md-heading:first-child { margin-top: 0; }

  .ai-narrative-body .md-p {
    margin: 0 0 8px 0;
  }

  .ai-narrative-body .md-list {
    margin: 0 0 8px 0;
    padding-left: 20px;
  }

  .ai-narrative-body .md-list li {
    margin-bottom: 4px;
  }

  .ai-narrative-body .md-code {
    background: #e2e8f0;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
  }

  /* ── HEADINGS & SECTIONS ── */
  h2 {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: #0f172a;
    margin: 28px 0 14px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid #e2e8f0;
  }

  .section-subheading {
    font-size: 12.5px;
    font-weight: 700;
    color: #475569;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── STATUS PILLS & BADGES ── */
  .status-pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid transparent;
  }

  .severity-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ── CATEGORY BLOCKS ── */
  .category-block {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 14px;
    background: #ffffff;
    overflow: hidden;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .category-title {
    flex: 1;
    font-size: 13.5px;
    color: #0f172a;
  }

  .category-stats {
    display: flex;
    gap: 6px;
  }

  .cat-pill {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 10px;
    font-weight: 600;
  }

  .cat-pill.pass { background: rgba(5,150,105,0.1); color: #059669; }
  .cat-pill.fail { background: rgba(220,38,38,0.1); color: #dc2626; }
  .cat-pill.warn { background: rgba(217,119,6,0.1); color: #d97706; }

  .category-skipped {
    margin: 8px 12px;
    padding: 6px 10px;
    border-radius: 6px;
    background: #f3f0ff;
    border: 1px solid #ddd6fe;
    color: #5b21b6;
    font-size: 12px;
  }

  .check-item {
    padding: 10px 14px;
    border-top: 1px solid #f1f5f9;
  }

  .check-item:first-child { border-top: none; }

  .check-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 3px;
  }

  .check-name {
    font-size: 12.5px;
    color: #0f172a;
  }

  .check-detail {
    font-size: 12px;
    color: #475569;
    line-height: 1.45;
  }

  .evidence-box {
    margin: 6px 0 0;
    padding: 6px 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    font-size: 11px;
    line-height: 1.4;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap;
    word-break: break-word;
    color: #334155;
  }

  /* ── DETAILED FINDINGS ── */
  .findings-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .finding-card {
    border: 1px solid #e2e8f0;
    border-left-width: 4px;
    border-radius: 6px;
    padding: 10px 14px;
    background: #ffffff;
  }

  .finding-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .finding-title {
    font-weight: 700;
    font-size: 13px;
    color: #0f172a;
  }

  .finding-detail {
    font-size: 12.5px;
    color: #475569;
    line-height: 1.5;
  }

  .third-party-title {
    margin-top: 8px;
    font-weight: 700;
    font-size: 11.5px;
    color: #475569;
    text-transform: uppercase;
  }

  .third-party-list {
    margin: 4px 0 0;
    padding-left: 18px;
    font-size: 11.5px;
  }

  .third-party-list li { margin-bottom: 2px; }

  /* ── RECON TABLE & BUTTONS ── */
  .recon-subblock {
    margin-bottom: 18px;
  }

  .recon-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
  }

  .recon-table th {
    background: #f8fafc;
    padding: 6px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    border-bottom: 1px solid #e2e8f0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .recon-table td {
    padding: 5px 10px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }

  .recon-table tr:nth-child(even) td { background: #fafafa; }
  .recon-table tr:last-child td { border-bottom: none; }

  .td-num { color: #94a3b8; font-size: 11px; text-align: center; }
  .td-label { font-weight: 600; color: #1e293b; }
  .td-url { color: #2563eb; }
  .td-url code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; word-break: break-all; }

  .btn-chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .btn-chip {
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11.5px;
    font-weight: 500;
    color: #334155;
  }

  .link-previews-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }

  .link-preview-card {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    background: #ffffff;
  }

  .lp-img-wrap {
    height: 90px;
    background: #000;
  }

  .lp-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .lp-meta {
    padding: 6px 8px;
  }

  .lp-text { font-weight: 600; font-size: 12px; color: #0f172a; }
  .lp-url { font-size: 10.5px; color: #2563eb; word-break: break-all; }

  /* ── STEPS & TIMELINE ── */
  .step-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
    background: #ffffff;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .step-num {
    font-size: 12px;
    font-weight: 800;
    color: #64748b;
  }

  .step-intent {
    flex: 1;
    font-size: 13px;
    color: #0f172a;
  }

  .step-duration {
    font-size: 11.5px;
    color: #64748b;
  }

  .step-body {
    padding: 10px 12px;
  }

  .step-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    padding: 6px 10px;
    border-radius: 5px;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .assertion-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 5px;
    margin-bottom: 4px;
    font-size: 12px;
    background: #f8fafc;
  }

  .assertion-row.pass { border-left: 3px solid #059669; }
  .assertion-row.fail { border-left: 3px solid #dc2626; background: #fff1f2; }

  .assert-icon { font-weight: 800; font-size: 12px; }
  .assertion-row.pass .assert-icon { color: #059669; }
  .assertion-row.fail .assert-icon { color: #dc2626; }

  .assert-content { flex: 1; }
  .assert-desc { font-weight: 500; color: #1e293b; }
  .assert-detail { font-size: 11px; color: #64748b; margin-top: 1px; }

  .step-screenshot-wrap {
    margin-top: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    background: #090e17;
  }

  .step-screenshot {
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    display: block;
  }

  /* ── HTML-ONLY FOOTER (Screen export only) ── */
  .html-only-footer {
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    color: #94a3b8;
    font-size: 11.5px;
  }
</style>
</head>
<body>
<div class="report-wrapper">

  <!-- ── HERO (PAGE 1) ── -->
  <div class="hero-card">
    <div class="hero-top-bar">
      <div class="hero-brand">
        <div class="brand-badge">WEBTEST SCANNER</div>
        <div class="brand-title">Quality &amp; Security Audit</div>
      </div>
      <div class="hero-status-pill ${summary.verdict}">
        ${scoreVerdictLabel} · HEALTH SCORE ${summary.score}/100
      </div>
    </div>

    <div class="hero-target-row">
      <div class="target-url-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        <span class="url-text">${escapeHtml(result.targetUrl)}</span>
      </div>
      <div class="hero-meta-items">
        <span class="meta-tag">Run: ${escapeHtml(result.runId.substring(0, 8))}</span>
        <span class="meta-tag">Duration: ${(result.durationMs / 1000).toFixed(1)}s</span>
        <span class="meta-tag">Tier: ${result.ownership?.effectiveTier ?? 0}</span>
        ${result.strict ? '<span class="meta-tag strict">Strict Mode</span>' : ''}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-cell">
        <div class="kpi-val" style="color: ${scoreColor}">${summary.score}</div>
        <div class="kpi-label">Health Score</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val">${result.totals.total}</div>
        <div class="kpi-label">Total Steps</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #34d399">${result.totals.passed}</div>
        <div class="kpi-label">Passed</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: ${result.totals.failed > 0 ? '#f87171' : '#94a3b8'}">${result.totals.failed}</div>
        <div class="kpi-label">Failed</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: ${result.totals.blocked > 0 ? '#c084fc' : '#94a3b8'}">${result.totals.blocked}</div>
        <div class="kpi-label">Blocked</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #60a5fa">${Math.round(result.meanConfidence * 100)}%</div>
        <div class="kpi-label">Confidence</div>
      </div>
    </div>
  </div>

  <!-- ── EXECUTIVE DASHBOARD (PAGE 1) ── -->
  <div class="executive-section">
    <div class="exec-header">
      <div class="exec-title-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        Executive Audit Summary
      </div>
      <span class="exec-badge">AUTOMATED ASSESSMENT</span>
    </div>

    <div class="overview-row">
      <div class="score-card">
        <div class="score-number">${summary.score}</div>
        <div class="score-label">Health Score</div>
        <div class="score-verdict">${scoreVerdictLabel}</div>
      </div>
      <div class="overview-text-wrap">
        <div class="overview-heading">Target Posture &amp; Verification</div>
        <p class="overview-p">${escapeHtml(summary.overview)}</p>
      </div>
      ${siteScreenshotUrl ? `
        <div class="snapshot-preview-wrap">
          <img src="${siteScreenshotUrl}" class="snapshot-preview-img" alt="Target Preview" />
        </div>
      ` : ''}
    </div>

    <!-- Key Findings -->
    <div class="summary-block">
      <div class="summary-block-title">Key Findings Highlights</div>
      <div class="summary-findings-list">
        ${summary.findings.map(f => `
          <div class="summary-finding-card" style="border-left: 3.5px solid ${f.color}">
            <div class="sfc-header">
              <span class="sfc-icon">${f.icon}</span>
              <span class="sfc-title">${escapeHtml(f.label)}</span>
              <span class="sfc-tag" style="color:${f.color}; background:${f.color}15; border-color:${f.color}30">${escapeHtml(f.tag)}</span>
            </div>
            <div class="sfc-detail">${escapeHtml(f.detail)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Remediation Guidance -->
    <div class="summary-block" style="border-bottom:none">
      <div class="summary-block-title">Strategic Remediation Advice</div>
      <div class="remediation-list">
        ${summary.remediation.map(r => `
          <div class="remediation-card">
            <span class="rem-icon">${r.icon}</span>
            <div class="rem-body">
              <div class="rem-title">${escapeHtml(r.title)}</div>
              <div class="rem-detail">${escapeHtml(r.detail)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${aiNarrativeBlock}
  </div>

  <!-- ── RECONNAISSANCE ── -->
  ${reconHtml}

  <!-- ── PRIVACY & SUPPLY CHAIN ── -->
  ${privacyHtml}

  <!-- ── CATEGORY BREAKDOWN ── -->
  ${(result.categories || []).length > 0 ? `<h2>Category Breakdown</h2>${categoriesHtml}` : ''}

  <!-- ── DETAILED FINDINGS ── -->
  ${regularFindings.length > 0 ? `<h2>Detailed Findings (${regularFindings.length})</h2><div class="findings-list">${findingsHtml}</div>` : ''}

  <!-- ── EXECUTION TIMELINE ── -->
  ${(result.steps || []).length > 0 ? `<h2>Execution Timeline (${result.steps.length} Steps)</h2>${stepsHtml.join('')}` : ''}

  <!-- ── STANDALONE HTML FOOTER ── -->
  <div class="html-only-footer">
    <strong>Webtest Scanner</strong> · Automated Enterprise Audit Report · Generated ${escapeHtml(generatedAt)}
  </div>

</div>
</body>
</html>`;
}

/** Downloads the run as a standalone HTML file. */
export async function downloadReport(
  result: RunResponse,
  aiSummary?: string,
  summaryData?: SummaryData | null
): Promise<void> {
  const html = await buildReportHtml(result, aiSummary, summaryData);
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
export async function printReport(
  result: RunResponse,
  aiSummary?: string,
  summaryData?: SummaryData | null
): Promise<void> {
  let finalSummary = aiSummary;
  let finalSummaryData = summaryData;

  // Auto-generate summary data if missing
  if (!finalSummaryData) {
    try {
      finalSummaryData = computeSummaryData(result);
    } catch (e) {
      console.warn('Failed to compute summary data for report:', e);
    }
  }

  // If the AI narrative summary wasn't provided, fetch it if needed
  if (!finalSummary && !finalSummaryData) {
    try {
      const strippedResult = {
        ...result,
        siteScreenshot: undefined,
        steps: (result.steps || []).map((s) => ({ ...s, screenshot: undefined })),
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
      console.warn('Failed to auto-generate AI summary for PDF:', e);
    }
  }

  const html = await buildReportHtml(result, finalSummary, finalSummaryData);

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
