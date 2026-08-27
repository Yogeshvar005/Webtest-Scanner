'use client';

import { useState } from 'react';
import { Glyph } from './glyphs';
import type { RunResponse, CategoryResult } from './types';

interface ResultsPanelProps {
  result: RunResponse;
  onDownload: () => void;
  pdfing: boolean;
}

type TabId = 'overview' | 'categories' | 'findings' | 'steps' | 'scraper' | 'raw';

function statusClass(status: string): string {
  return ['passed', 'failed', 'blocked', 'warning', 'skipped'].includes(status) ? status : 'skipped';
}

function runSummary(result: RunResponse): string {
  const parts = [`Run ${result.status}.`];

  parts.push(
    `${result.totals.passed} of ${result.totals.total} steps passed` +
      (result.totals.failed > 0 ? `, ${result.totals.failed} failed` : '') +
      (result.totals.blocked > 0 ? `, ${result.totals.blocked} blocked by policy` : '') +
      '.',
  );

  const failedCategories = (result.categories ?? []).filter((c) => c.status === 'failed');
  const warnedCategories = (result.categories ?? []).filter((c) => c.status === 'warning');

  if (failedCategories.length > 0) {
    parts.push(
      `${failedCategories.length} test ${failedCategories.length === 1 ? 'category' : 'categories'} failed: ` +
        `${failedCategories.map((c) => c.label).join(', ')}.`,
    );
  }
  if (warnedCategories.length > 0) {
    parts.push(
      `${warnedCategories.length} ${warnedCategories.length === 1 ? 'category has' : 'categories have'} warnings: ` +
        `${warnedCategories.map((c) => c.label).join(', ')}.`,
    );
  }

  return parts.join(' ');
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function IconDownload() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 11.5v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.5" />
      <path d="M8 2.5v7M5 7l3 3 3-3" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="5" width="8" height="9" rx="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" />
    </svg>
  );
}

function IconCsv() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M2 6h12M2 10h12M6 2v12" />
    </svg>
  );
}

function IconMd() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M4.5 9.5V6.5l2 2 2-2v3M11.5 8l-1.5 1.5M10 8h3" />
    </svg>
  );
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildCsv(result: RunResponse): string {
  const rows: string[] = ['"Category","Check","Status","Severity","Detail"'];
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      const q = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      rows.push([q(cat.label), q(check.name), q(check.status), q(check.severity), q(check.detail)].join(','));
    }
  }
  return rows.join('\r\n');
}

function buildMarkdown(result: RunResponse): string {
  const lines: string[] = [
    `# Webtest Scanner & Scraper Report`,
    ``,
    `**Target:** ${result.targetUrl}  `,
    `**Status:** ${result.status.toUpperCase()}  `,
    `**Run ID:** ${result.runId}  `,
    `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s  `,
    `**Ownership Tier:** ${result.ownership.effectiveTier}  `,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total steps | ${result.totals.total} |`,
    `| Passed | ${result.totals.passed} |`,
    `| Failed | ${result.totals.failed} |`,
    `| Blocked | ${result.totals.blocked} |`,
    `| Confidence | ${Math.round(result.meanConfidence * 100)}% |`,
    ``,
  ];

  for (const cat of result.categories) {
    lines.push(`## ${cat.label} — ${cat.status.toUpperCase()}`);
    lines.push('');
    if (cat.skippedReason) {
      lines.push(`> Skipped: ${cat.skippedReason}`);
      lines.push('');
    }
    for (const check of cat.checks) {
      const icon = check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : check.status === 'warning' ? '⚠️' : '⏭️';
      lines.push(`### ${icon} ${check.name}`);
      lines.push(`**Severity:** ${check.severity} | **Status:** ${check.status}`);
      lines.push('');
      lines.push(check.detail);
      if (check.evidence && check.evidence.length > 0) {
        lines.push('');
        lines.push('```');
        lines.push(...check.evidence.slice(0, 15));
        lines.push('```');
      }
      lines.push('');
    }
  }

  if (result.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const f of result.findings) {
      lines.push(`### ${f.severity.toUpperCase()}: ${f.title}`);
      lines.push(f.detail);
      if (f.evidence) lines.push(`\`${f.evidence}\``);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function getScraperData(result: RunResponse) {
  return result.categories.find((c) => c.category === 'scraper');
}

function buildScraperJson(scraper: CategoryResult): string {
  const out: Record<string, unknown> = {};
  for (const check of scraper.checks) {
    out[check.id] = {
      summary: check.detail,
      items: check.evidence ?? [],
    };
  }
  return JSON.stringify({ category: 'Web Scraper', extractedAt: new Date().toISOString(), checks: out }, null, 2);
}

/* ── Export Dock Component ── */
function ExportDock({ result }: { result: RunResponse }) {
  const [copied, setCopied] = useState(false);
  const scraperData = getScraperData(result);
  const slug = result.targetUrl.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').slice(0, 30);

  function handleJson() {
    downloadFile(`scanner_${slug}_${result.runId}.json`, JSON.stringify(result, null, 2), 'application/json');
  }

  function handleCsv() {
    downloadFile(`scanner_${slug}_${result.runId}.csv`, buildCsv(result), 'text/csv');
  }

  function handleMarkdown() {
    downloadFile(`scanner_${slug}_${result.runId}.md`, buildMarkdown(result), 'text/markdown');
  }

  function handleCopy() {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleScraperJson() {
    if (!scraperData) return;
    downloadFile(`scraped_${slug}_${result.runId}.json`, buildScraperJson(scraperData), 'application/json');
  }

  return (
    <div className="export-dock no-print">
      <span className="export-dock-label">Export Intelligence:</span>

      <button type="button" className="secondary" onClick={handleJson} title="Download Full Inspection JSON" style={{ fontSize: 12 }}>
        <IconDownload /> Full JSON
      </button>

      <button type="button" className="secondary" onClick={handleCsv} title="Download CSV Spreadsheet" style={{ fontSize: 12 }}>
        <IconCsv /> CSV
      </button>

      <button type="button" className="secondary" onClick={handleMarkdown} title="Download Markdown Audit Report" style={{ fontSize: 12 }}>
        <IconMd /> Markdown
      </button>

      <button type="button" className="secondary" onClick={handleCopy} title="Copy Raw JSON to Clipboard" style={{ fontSize: 12 }}>
        <IconCopy /> {copied ? 'Copied to Clipboard!' : 'Copy JSON'}
      </button>

      {scraperData && (
        <button
          type="button"
          className="secondary"
          onClick={handleScraperJson}
          title="Download Scraped Page Data"
          style={{ fontSize: 12, background: 'var(--accent-dim)', borderColor: 'rgba(10, 132, 255, 0.4)', color: 'var(--accent-cyan)' }}
        >
          <IconDownload /> Scraped Content JSON
        </button>
      )}
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({ result, onGoTo }: { result: RunResponse; onGoTo: (tab: TabId) => void }) {
  const notPassing = result.categories.filter((c) => c.status === 'failed' || c.status === 'warning');
  const topFindings = [...result.findings]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 6);

  return (
    <div>
      <div className="stats-strip">
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--text)' }}>{result.totals.total}</div>
          <div className="label">Steps Executed</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--pass)' }}>{result.totals.passed}</div>
          <div className="label">Passed</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: result.totals.failed > 0 ? 'var(--fail)' : 'var(--text-secondary)' }}>
            {result.totals.failed}
          </div>
          <div className="label">Failed</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: result.totals.blocked > 0 ? 'var(--block)' : 'var(--text-secondary)' }}>
            {result.totals.blocked}
          </div>
          <div className="label">Blocked</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--accent-cyan)' }}>
            {Math.round(result.meanConfidence * 100)}%
          </div>
          <div className="label">Inference Confidence</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        <span>Policy Effect: <strong style={{ color: 'var(--text)' }}>{result.policyDecision.effect.toUpperCase()}</strong></span>
        <span>Effective Tier: <strong style={{ color: 'var(--text)' }}>Tier {result.ownership.effectiveTier}</strong></span>
      </div>

      {result.policyDecision.reason && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
          ℹ️ {result.policyDecision.reason}
        </div>
      )}

      {notPassing.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            Inspection Categories Requiring Attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notPassing.map((c) => (
              <div
                key={c.category}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => onGoTo('categories')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`pill ${statusClass(c.status)}`}>{c.status}</span>
                  <Glyph id={c.category} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {c.skippedReason ?? `${c.totals.failed} failed · ${c.totals.warning} warnings`} →
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {topFindings.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            Key Findings Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topFindings.map((f, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderLeft: `4px solid ${f.severity === 'critical' || f.severity === 'high' ? 'var(--fail)' : f.severity === 'medium' ? 'var(--warn)' : 'var(--accent)'}`,
                  borderTop: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => onGoTo('findings')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{f.title}</span>
                  <span className={`pill ${f.severity === 'critical' || f.severity === 'high' ? 'failed' : f.severity === 'medium' ? 'warning' : 'passed'}`}>
                    {f.severity}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{f.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Categories Tab ── */
function CategoriesTab({ result }: { result: RunResponse }) {
  if (result.categories.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No categories were selected for this run.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {result.categories.map((category) => (
        <details
          key={category.category}
          open={category.status === 'failed' || category.status === 'warning'}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <summary
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`pill ${statusClass(category.status)}`}>{category.status}</span>
              <Glyph id={category.category} />
              <strong style={{ fontSize: 14 }}>{category.label}</strong>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {category.totals.passed} pass · {category.totals.failed} fail · {category.totals.warning} warn
            </div>
          </summary>

          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-subtle)' }}>
            {category.skippedReason && (
              <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
                ℹ️ {category.skippedReason}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {category.checks.map((check) => (
                <div
                  key={check.id}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`pill ${statusClass(check.status)}`}>{check.status}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{check.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{check.severity}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{check.detail}</div>
                  {check.evidence && check.evidence.length > 0 && (
                    <pre
                      style={{
                        margin: '8px 0 0',
                        padding: '8px 10px',
                        background: 'rgba(0,0,0,0.5)',
                        borderRadius: 4,
                        fontSize: 11.5,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                        overflowX: 'auto',
                        maxHeight: 180,
                      }}
                    >
                      {check.evidence.slice(0, 15).join('\n')}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

/* ── Findings Tab ── */
function FindingsTab({ result }: { result: RunResponse }) {
  if (result.findings.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No findings were raised for this run.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {result.findings.map((f, i) => (
        <div
          key={i}
          style={{
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.03)',
            borderLeft: `4px solid ${f.severity === 'critical' || f.severity === 'high' ? 'var(--fail)' : f.severity === 'medium' ? 'var(--warn)' : 'var(--accent)'}`,
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{f.title}</span>
            <span className={`pill ${f.severity === 'critical' || f.severity === 'high' ? 'failed' : f.severity === 'medium' ? 'warning' : 'passed'}`}>
              {f.severity}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.detail}</div>
          {f.evidence && (
            <pre
              style={{
                margin: '8px 0 0',
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.5)',
                borderRadius: 4,
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
              }}
            >
              {f.evidence}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Steps Tab ── */
function StepsTab({ result }: { result: RunResponse }) {
  if (result.steps.length === 0) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No steps were executed in this scenario.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {result.steps.map((step) => (
        <div
          key={step.id}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                {step.index + 1}
              </span>
              <strong style={{ fontSize: 13.5 }}>{step.intent}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`pill ${statusClass(step.status)}`}>{step.status}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{step.durationMs}ms</span>
            </div>
          </div>

          <div style={{ padding: '14px 16px' }}>
            {step.error && (
              <div style={{ color: 'var(--fail)', fontSize: 12.5, marginBottom: 8 }}>
                ❌ {step.error}
              </div>
            )}
            {step.policyReason && (
              <div style={{ color: 'var(--block)', fontSize: 12.5, marginBottom: 8 }}>
                🛡️ Blocked by policy: {step.policyReason}
              </div>
            )}

            {step.assertions.map((a, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12.5,
                  padding: '4px 0',
                  color: a.passed ? 'var(--pass)' : 'var(--fail)',
                }}
              >
                {a.passed ? '✓' : '✗'} {a.description}
                {a.detail && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>({a.detail})</span>}
              </div>
            ))}

            {step.screenshot && (
              <div style={{ marginTop: 12 }}>
                <img
                  src={step.screenshot}
                  alt={`Screenshot after: ${step.intent}`}
                  style={{ width: '100%', maxHeight: 400, objectFit: 'contain', background: '#000', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Web Scraper (Deep Extraction) Tab ── */
function ScraperTab({ result }: { result: RunResponse }) {
  const scraper = getScraperData(result);
  const [section, setSection] = useState<string>('meta');
  const [linkSearch, setLinkSearch] = useState<string>('');

  if (!scraper) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
        Web Scraper category was not selected for this run. Enable &ldquo;Web Scraper&rdquo; in the inspection suite and run again.
      </div>
    );
  }

  const getEvidence = (checkId: string) => scraper.checks.find((c) => c.id === checkId)?.evidence ?? [];
  const getDetail = (checkId: string) => scraper.checks.find((c) => c.id === checkId)?.detail ?? '';

  const metaItems = getEvidence('scraper-meta');
  const headingItems = getEvidence('scraper-headings');
  const internalLinks = getEvidence('scraper-internal-links');
  const externalLinks = getEvidence('scraper-external-links');
  const images = getEvidence('scraper-images');
  const forms = getEvidence('scraper-forms');
  const navItems = getEvidence('scraper-navigation');
  const structuredData = getEvidence('scraper-structured-data');
  const contacts = getEvidence('scraper-contacts');
  const textBlocks = getEvidence('scraper-text');

  const sections = [
    { id: 'meta', label: 'Metadata', count: metaItems.length },
    { id: 'headings', label: 'Headings Hierarchy', count: headingItems.length },
    { id: 'internal-links', label: 'Internal Links', count: internalLinks.length },
    { id: 'external-links', label: 'External Links', count: externalLinks.length },
    { id: 'images', label: 'Images Gallery', count: images.length },
    { id: 'forms', label: 'Forms & Fields', count: forms.length },
    { id: 'navigation', label: 'Navigation', count: navItems.length },
    { id: 'structured-data', label: 'JSON-LD Data', count: structuredData.length },
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'text', label: 'Page Text Content', count: textBlocks.length },
  ];

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--accent-cyan)', marginBottom: 14, padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 'var(--radius-sm)' }}>
        🕷 {getDetail('scraper-meta')}
      </div>

      {/* Subtab Pills */}
      <div className="scraper-subtabs">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`subtab-chip ${section === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.label} <span style={{ opacity: 0.7 }}>({s.count})</span>
          </button>
        ))}
      </div>

      {/* ── Metadata View ── */}
      {section === 'meta' && (
        <div>
          {metaItems.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No meta tags found.</p>
          ) : (
            <table className="apple-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Attribute / Tag</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {metaItems.map((item, i) => {
                  const colonIdx = item.indexOf(': ');
                  const key = colonIdx > -1 ? item.slice(0, colonIdx) : item;
                  const val = colonIdx > -1 ? item.slice(colonIdx + 2) : '';
                  return (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: 12 }}>{key}</td>
                      <td style={{ wordBreak: 'break-word', fontSize: 12.5 }}>{val}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Headings Tree View ── */}
      {section === 'headings' && (
        <div>
          {headingItems.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No headings found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {headingItems.map((h, i) => {
                const level = parseInt(h.slice(1, 2), 10) || 1;
                return (
                  <div
                    key={i}
                    style={{
                      marginLeft: (level - 1) * 18,
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderLeft: `3px solid var(--accent)`,
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span className="pill" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 10 }}>
                      H{level}
                    </span>
                    <span style={{ fontSize: Math.max(12, 15 - level * 0.8), fontWeight: level <= 2 ? 600 : 400 }}>
                      {h.slice(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Links View with Search ── */}
      {(section === 'internal-links' || section === 'external-links') && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search extracted URLs or anchor text..."
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              style={{ maxWidth: 360, fontSize: 12.5 }}
            />
          </div>

          {(() => {
            const rawLinks = section === 'internal-links' ? internalLinks : externalLinks;
            const filtered = rawLinks.filter((l) => l.toLowerCase().includes(linkSearch.toLowerCase()));

            if (filtered.length === 0) {
              return <p style={{ color: 'var(--muted)' }}>No matching links found.</p>;
            }

            return (
              <table className="apple-table">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Anchor Text</th>
                    <th>Destination URL</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => {
                    const match = item.match(/^\[(.+?)\] → (.+)$/);
                    const text = match?.[1] ?? item;
                    const href = match?.[2] ?? '';
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{text}</td>
                        <td>
                          <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                            {href} ↗
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* ── Images Gallery ── */}
      {section === 'images' && (
        <div>
          {images.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No images found.</p>
          ) : (
            <div className="image-gallery">
              {images.map((item, i) => {
                const parts = item.split(' ');
                const src = parts[0] ?? '';
                const dims = parts[1] ?? '';
                const altMatch = item.match(/alt="([^"]*)"/);
                const alt = altMatch?.[1] ?? '';

                return (
                  <div key={i} className="image-card">
                    <img
                      src={src}
                      alt={alt || 'Extracted image'}
                      className="image-preview"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="image-meta">
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{dims}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>{alt ? `alt: "${alt}"` : '(No alt text)'}</div>
                      <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, marginTop: 4, display: 'inline-block' }}>
                        Open source ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Forms Explorer ── */}
      {section === 'forms' && (
        <div>
          {forms.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No form elements found.</p>
          ) : (
            <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', padding: 14, background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)' }}>
              {forms.join('\n\n')}
            </pre>
          )}
        </div>
      )}

      {/* ── Navigation Landmarks ── */}
      {section === 'navigation' && (
        <div>
          {navItems.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No navigation landmarks found.</p>
          ) : (
            <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', padding: 14, background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)' }}>
              {navItems.join('\n')}
            </pre>
          )}
        </div>
      )}

      {/* ── Structured Data (JSON-LD) ── */}
      {section === 'structured-data' && (
        <div>
          {structuredData.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No JSON-LD structured data detected on this page.</p>
          ) : (
            structuredData.map((item, i) => (
              <pre
                key={i}
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                  padding: 14,
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 12,
                }}
              >
                {item}
              </pre>
            ))
          )}
        </div>
      )}

      {/* ── Contacts ── */}
      {section === 'contacts' && (
        <div>
          {contacts.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No phone numbers or email addresses found in visible text.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {contacts.map((c, i) => {
                const isEmail = c.includes('@');
                return (
                  <div
                    key={i}
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c}</span>
                    <a
                      href={isEmail ? `mailto:${c}` : `tel:${c}`}
                      className="preset-chip"
                      style={{ textDecoration: 'none' }}
                    >
                      {isEmail ? '✉️ Email' : '📞 Call'}
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Text Content ── */}
      {section === 'text' && (
        <div>
          {textBlocks.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No text blocks found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {textBlocks.map((block, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {block}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main ResultsPanel Export ── */
export function ResultsPanel({ result, onDownload, pdfing }: ResultsPanelProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const hasScraperData = result.categories.some((c) => c.category === 'scraper');

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'categories', label: 'Categories', count: result.categories.length },
    { id: 'findings', label: 'Findings', count: result.findings.length },
    { id: 'steps', label: 'Steps & Timeline', count: result.steps.length },
    ...(hasScraperData ? [{ id: 'scraper' as TabId, label: '🕷 Extracted Content' }] : []),
    { id: 'raw', label: 'Raw JSON' },
  ];

  return (
    <div className="card reveal reveal-1">
      <p className="sr-only" role="status" aria-atomic="true">
        {runSummary(result)}
      </p>

      {/* ── Results Hero Header ── */}
      <div className="results-hero">
        <div className="results-meta-left">
          <span className="pill verdict" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text)' }}>
            {['passed', 'failed', 'warning', 'blocked'].includes(result.status) ? 'EXECUTED' : result.status.toUpperCase()}
          </span>
          {result.strict && <span className="pill warning">Strict</span>}
          <div>
            <div className="results-target-url">{result.targetUrl}</div>
            <div className="results-sub-meta">
              Duration: {(result.durationMs / 1000).toFixed(1)}s · Run ID: {result.runId}
            </div>
          </div>
        </div>

        <div className="no-print">
          <button
            type="button"
            className="primary"
            onClick={onDownload}
            disabled={pdfing}
            style={{ fontSize: 13 }}
          >
            {pdfing ? (
              <>
                <span className="spinner" /> Generating PDF…
              </>
            ) : (
              <>
                <IconDownload /> Download PDF Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Export Dock ── */}
      <ExportDock result={result} />

      {/* ── Segmented Tab Controls ── */}
      <div className="tabs-segmented no-print" style={{ marginTop: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-pill ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {t.count !== undefined && <span className="tab-badge">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Tab View Panels ── */}
      <div style={{ marginTop: 12 }}>
        {tab === 'overview' && <OverviewTab result={result} onGoTo={setTab} />}
        {tab === 'categories' && <CategoriesTab result={result} />}
        {tab === 'findings' && <FindingsTab result={result} />}
        {tab === 'steps' && <StepsTab result={result} />}
        {tab === 'scraper' && <ScraperTab result={result} />}
        {tab === 'raw' && (
          <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', padding: 16, background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-sm)', overflowX: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
