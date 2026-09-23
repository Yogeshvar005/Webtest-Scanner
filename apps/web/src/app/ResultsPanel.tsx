'use client';

import { useEffect, useState, useMemo } from 'react';
import { Glyph } from './glyphs';
import type { RunResponse, CategoryResult, DevicePreset, StepResult } from './types';
import { exportToPlaywrightTS, exportToPlaywrightPython, exportToCypress, exportToSeleniumPython } from '@wts/dsl';
import { Sparkles, AlertTriangle, ShieldCheck, CheckCircle2, Copy, Download, RefreshCw, Wand2, Terminal, Code2, Link } from 'lucide-react';

interface ResultsPanelProps {
  result: RunResponse;
  onDownload: (aiSummary?: string) => void;
  pdfing: boolean;
  device?: DevicePreset;
  onApplyFix?: (instructions: string) => void;
}

type TabId = 'overview' | 'categories' | 'findings' | 'steps' | 'diff' | 'scraper' | 'export' | 'raw';

function statusClass(status: string): string {
  return ['passed', 'failed', 'blocked', 'warning', 'skipped'].includes(status) ? status : 'skipped';
}

function runSummary(result: RunResponse): string {
  const parts: string[] = [];
  const executed = result.totals.passed + result.totals.failed;
  const stepsFailed = result.totals.failed > 0;
  const stepsBlocked = result.totals.blocked > 0;
  const failedCategories = (result.categories ?? []).filter((c) => c.status === 'failed');
  const warnedCategories = (result.categories ?? []).filter((c) => c.status === 'warning');

  const stepsText = `${executed} of ${result.totals.total} steps executed` +
    (stepsBlocked ? `, ${result.totals.blocked} blocked by policy` : '');

  if (result.status === 'failed' && !stepsFailed && !stepsBlocked && failedCategories.length > 0) {
    parts.push(`Functional steps passed (${stepsText}), but ${failedCategories.length} test ${failedCategories.length === 1 ? 'category' : 'categories'} failed: ${failedCategories.map((c) => c.label).join(', ')}.`);
  } else {
    parts.push(`Run ${result.status}. ${stepsText}.`);
    if (failedCategories.length > 0) {
      parts.push(
        `${failedCategories.length} test ${failedCategories.length === 1 ? 'category' : 'categories'} failed: ` +
          `${failedCategories.map((c) => c.label).join(', ')}.`,
      );
    }
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
  setTimeout(() => URL.revokeObjectURL(url), 100);
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
      const icon = (check.status === 'passed' || check.status === 'failed') ? '✅' : check.status === 'warning' ? '⚠️' : '⏭️';
      lines.push(`### ${icon} ${check.name}`);
      const displayStatus = (check.status === 'passed' || check.status === 'failed') ? 'Executed' : check.status;
      lines.push(`**Severity:** ${check.severity} | **Status:** ${displayStatus}`);
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

      <button type="button" className="secondary" onClick={handleJson} title="Download Full Inspection JSON">
        <IconDownload /> Full JSON
      </button>

      <button type="button" className="secondary" onClick={handleCsv}>
        <IconCsv /> CSV
      </button>

      <button type="button" className="secondary" onClick={handleMarkdown}>
        <IconMd /> Markdown
      </button>

      <button type="button" className="secondary" onClick={handleCopy}>
        <IconCopy /> {copied ? 'Copied to Clipboard!' : 'Copy JSON'}
      </button>

      {scraperData && (
        <button
          type="button"
          className="secondary"
          onClick={handleScraperJson}
        >
          <IconDownload /> Scraped Content JSON
        </button>
      )}
    </div>
  );
}

/* ── AI Root Cause Diagnostic Card ── */
interface AIDiagnosticCardProps {
  failedStep: StepResult;
  targetUrl: string;
  onApplyFix?: (instruction: string) => void;
}

function AIDiagnosticCard({ failedStep, targetUrl, onApplyFix }: AIDiagnosticCardProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    category: string;
    summary: string;
    plainEnglishExplanation: string;
    suggestedFix: string;
    autoFixStep?: {
      intent: string;
      dslInstruction: string;
      actionType: 'prepend' | 'replace' | 'append';
    };
  } | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchRCA() {
      setLoading(true);
      try {
        const res = await fetch('/api/rca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            failedStepIntent: failedStep.intent,
            errorMessage: failedStep.error || 'Assertion failed',
            targetUrl,
            consoleErrors: failedStep.consoleErrors,
          }),
        });
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.warn('RCA fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRCA();
    return () => { cancelled = true; };
  }, [failedStep.id, failedStep.error, targetUrl]);

  if (loading) {
    return (
      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
        <span className="spinner" style={{ width: 14, height: 14 }} />
        <span>AI Smart Root Cause Engine diagnosing step failure...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{
      marginTop: 10,
      padding: '14px 16px',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(239, 68, 68, 0.06)',
      border: '1px solid rgba(239, 68, 68, 0.25)',
      fontSize: 13,
      lineHeight: 1.45,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#dc2626' }}>
          <AlertTriangle size={15} />
          <span>AI Root Cause Analysis: {data.category}</span>
        </div>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c', fontWeight: 600 }}>
          AI Diagnostic
        </span>
      </div>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text)' }}>
        {data.summary}
      </p>
      <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)', fontSize: 12.5 }}>
        {data.plainEnglishExplanation}
      </p>
      <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>💡 Recommended Fix:</div>
        <div style={{ color: 'var(--text-secondary)' }}>{data.suggestedFix}</div>
      </div>
      {data.autoFixStep && onApplyFix && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => {
              if (data.autoFixStep) {
                onApplyFix(data.autoFixStep.dslInstruction);
                setApplied(true);
              }
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: applied ? '#059669' : '#dc2626',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Wand2 size={13} />
            {applied ? '✓ Fix Applied to Editor' : `Apply Fix: "${data.autoFixStep.dslInstruction}"`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Code Export Tab ── */
function CodeExportTab({ result }: { result: RunResponse }) {
  const [framework, setFramework] = useState<'playwright-ts' | 'playwright-python' | 'cypress' | 'selenium'>('playwright-ts');
  const [copied, setCopied] = useState(false);

  const activeScenario = useMemo(() => {
    if (result.scenario && result.scenario.steps) return result.scenario;
    return {
      schemaVersion: '1.0',
      id: result.runId,
      version: 1,
      title: `Automated Test - ${result.targetUrl}`,
      description: `Exported from Webtest Scanner autonomous run ${result.runId}`,
      testTypes: ['functional', 'ui'],
      priority: 'P2',
      targetId: result.targetUrl,
      environment: 'PRODUCTION',
      requirementIds: [],
      openQuestions: [],
      preconditions: [],
      fixtures: [],
      setup: [],
      steps: result.steps.map((s, idx) => ({
        id: s.id || `s${idx}`,
        index: s.index ?? idx,
        intent: s.intent,
        action: {
          type: 'click',
          target: { role: 'button', name: s.intent.replace(/^click\s*["']?/i, '').replace(/["']?$/i, '') },
        },
        preWaits: [],
        postWaits: [],
        assertions: s.assertions.map((a) => ({
          type: 'textPresent',
          text: { kind: 'literal', value: a.description },
          match: 'contains',
          negate: false,
          origin: { author: 'ai', confidence: 0.9, timestamp: new Date().toISOString() },
          severity: 'medium',
        })),
        onFailure: 'abort',
        timeoutMs: 30000,
        riskTags: ['read-only'],
        provenance: { author: 'ai', confidence: 0.9, timestamp: new Date().toISOString() },
      })),
      cleanup: { strategy: 'best-effort', runOnFailure: true, steps: [], lineageReaper: [] },
      dependsOn: [],
      lifecycle: 'automated',
      policyClass: 'passive',
      provenance: { author: 'ai', confidence: 0.9, timestamp: new Date().toISOString() },
    };
  }, [result]);

  const generatedCode = useMemo(() => {
    try {
      switch (framework) {
        case 'playwright-ts':
          return exportToPlaywrightTS(activeScenario, result.targetUrl);
        case 'playwright-python':
          return exportToPlaywrightPython(activeScenario, result.targetUrl);
        case 'cypress':
          return exportToCypress(activeScenario, result.targetUrl);
        case 'selenium':
          return exportToSeleniumPython(activeScenario, result.targetUrl);
      }
    } catch (e) {
      return `// Failed to generate code: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [framework, activeScenario, result.targetUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap: Record<string, string> = {
      'playwright-ts': 'spec.ts',
      'playwright-python': 'test.py',
      'cypress': 'cy.js',
      'selenium': 'test.py',
    };
    const filename = `webtest-${result.runId.slice(0, 8)}.${extMap[framework] || 'txt'}`;
    downloadFile(filename, generatedCode, 'text/plain');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code2 size={18} color="var(--accent)" />
            Multi-Framework Code Export (AI Engine)
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Export this test into clean, zero-dependency production code for your team's CI/CD pipeline.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={handleCopy}
            style={{ fontSize: 12.5, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Copy size={14} /> {copied ? 'Copied to Clipboard!' : 'Copy Code'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleDownload}
            style={{ fontSize: 12.5, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> Download Script
          </button>
        </div>
      </div>

      {/* Framework Switcher Chips */}
      <div style={{ display: 'flex', gap: 8, background: 'var(--bg-hover)', padding: 4, borderRadius: 'var(--radius-sm)', width: 'fit-content' }}>
        {[
          { id: 'playwright-ts', label: 'Playwright (TypeScript)', badge: 'Recommended' },
          { id: 'playwright-python', label: 'Playwright (Python)' },
          { id: 'cypress', label: 'Cypress (JS)' },
          { id: 'selenium', label: 'Selenium (Python)' },
        ].map((fw) => (
          <button
            key={fw.id}
            type="button"
            onClick={() => setFramework(fw.id as any)}
            className={`subtab-chip ${framework === fw.id ? 'active' : ''}`}
            style={{
              fontSize: 12.5,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontWeight: framework === fw.id ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {fw.label}
            {fw.badge && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(217,119,87,0.2)', color: 'var(--accent)' }}>
                {fw.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Code Display Area */}
      <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', background: '#1e1e2e' }}>
        <div style={{ padding: '8px 16px', background: '#181825', borderBottom: '1px solid #313244', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#a6adc8', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <span>{framework === 'playwright-ts' ? 'tests/e2e.spec.ts' : framework === 'cypress' ? 'cypress/e2e/spec.cy.js' : 'test_e2e.py'}</span>
          <span>UTF-8 · {generatedCode.split('\n').length} lines</span>
        </div>
        <pre style={{ margin: 0, padding: '16px', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'var(--font-mono)', color: '#cdd6f4', overflowX: 'auto', maxHeight: 480 }}>
          <code>{generatedCode}</code>
        </pre>
      </div>
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({ 
  result, 
  onGoTo, 
  onApplyFix,
  aiSummary,
  isGeneratingSummary,
  onGenerateSummary
}: { 
  result: RunResponse; 
  onGoTo: (tab: TabId) => void; 
  onApplyFix?: (instructions: string) => void;
  aiSummary: string | null;
  isGeneratingSummary: boolean;
  onGenerateSummary: () => void;
}) {
  const notPassing = result.categories.filter((c) => c.status === 'failed' || c.status === 'warning');
  const topFindings = [...result.findings]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 6);

  const selfHealedCount = result.steps.filter((s) => s.selfHealed).length;
  const firstFailedStep = result.steps.find((s) => s.status === 'failed' || (s.assertions && s.assertions.some((a) => !a.passed)));

  return (
    <div>
      {(result.siteScreenshot) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            Target Page Overview
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 350px', maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000' }}>
              <img src={result.siteScreenshot} alt="Site Snapshot" style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── AI Root Cause Failure Diagnostic in Overview ── */}
      {firstFailedStep && (
        <div style={{ marginBottom: 20 }}>
          <AIDiagnosticCard failedStep={firstFailedStep} targetUrl={result.targetUrl} onApplyFix={onApplyFix} />
        </div>
      )}

      {/* ── AI Executive Summary ── */}
      <div style={{ marginBottom: 24, padding: 20, background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiSummary ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            <Sparkles size={18} className="text-amber-400" /> Executive AI Summary
          </div>
          {!aiSummary && (
            <button type="button" className="secondary" onClick={onGenerateSummary} disabled={isGeneratingSummary} style={{ height: 32, fontSize: 12, padding: '0 12px' }}>
              {isGeneratingSummary ? (
                <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Generating...</>
              ) : (
                <><Wand2 size={14} /> Generate Summary</>
              )}
            </button>
          )}
        </div>
        {aiSummary && (
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }} dangerouslySetInnerHTML={{ 
            // Simple markdown parsing for the AI summary
            __html: aiSummary
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/\n/g, '<br/>')
              .replace(/\d+\.\s/g, '<br/>• ')
          }} />
        )}
      </div>

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
        {selfHealedCount > 0 && (
          <div className="stat-box" style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
            <div className="num" style={{ color: '#059669' }}>{selfHealedCount}</div>
            <div className="label" style={{ color: '#065f46' }}>✨ Self-Healed</div>
          </div>
        )}
        <div className="stat-box">
          <div className="num" style={{ color: result.totals.blocked > 0 ? 'var(--block)' : 'var(--text-secondary)' }}>
            {result.totals.blocked}
          </div>
          <div className="label">Blocked</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--accent)' }}>
            {Math.round(result.meanConfidence * 100)}%
          </div>
          <div className="label">Inference Confidence</div>
        </div>
      </div>

      {/* ── Quick Export Banner ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Code2 size={16} color="var(--accent)" />
          <span>Export this autonomous test into your team's CI/CD pipeline</span>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => onGoTo('export')}
          style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          ⚡ Code Export
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, padding: '12px 16px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        <span>Policy Effect: <strong style={{ color: 'var(--text)' }}>{result.policyDecision.effect.toUpperCase()}</strong></span>
        <span>Effective Tier: <strong style={{ color: 'var(--text)' }}>Tier {result.ownership.effectiveTier}</strong></span>
      </div>

      {result.policyDecision.reason && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
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
                  background: 'var(--bg-hover)',
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
                  background: 'var(--bg-hover)',
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

      {(result.siteNavLinks && result.siteNavLinks.length > 0) && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            Extracted Navigation Links
          </div>
          {(() => {
            const withPreview = result.siteNavLinks!.filter(l => !!l.screenshot);
            const withoutPreview = result.siteNavLinks!.filter(l => !l.screenshot);
            
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {withPreview.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {withPreview.map((link, i) => (
                      <div key={`preview-${i}`} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <div style={{ borderBottom: '1px solid var(--border)', background: '#000' }}>
                          <img src={link.screenshot} alt={`Screenshot of ${link.text}`} style={{ width: '100%', height: 160, objectFit: 'contain', display: 'block' }} />
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', marginBottom: 4 }}>{link.text || 'Unnamed Link'}</div>
                          <div style={{ fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}>{link.href}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {withoutPreview.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {withoutPreview.map((link, i) => (
                      <a 
                        key={`link-${i}`} 
                        href={link.href} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', 
                          borderRadius: 'var(--radius-sm)', textDecoration: 'none', transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', flexShrink: 0 }}>
                          <Link size={14} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{link.text || 'Unnamed Link'}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{link.href}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {(result.siteButtons && result.siteButtons.length > 0) && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            Extracted Buttons
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {result.siteButtons!.map((btn, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {btn}
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
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No categories were selected for this run.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {result.categories.map((category) => (
        <details
          key={category.category}
          open={category.status === 'failed' || category.status === 'warning'}
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <summary
            style={{
              padding: '14px 18px',
              cursor: 'pointer',
              userSelect: 'none',
              background: 'var(--bg-hover)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`pill ${statusClass(category.status)}`}>{category.status}</span>
              <Glyph id={category.category} />
              <strong style={{ fontSize: 14 }}>{category.label}</strong>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {category.totals.passed} pass · {category.totals.failed} fail · {category.totals.warning} warn
            </div>
            </div>
          </summary>

          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
            {category.skippedReason && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
                ℹ️ {category.skippedReason}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {category.checks.map((check) => (
                <div
                  key={check.id}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`pill ${statusClass(check.status)}`}>{check.status}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{check.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{check.severity}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{check.detail}</div>
                  {check.evidence && check.evidence.length > 0 && (
                    <pre
                      style={{
                        margin: '8px 0 0',
                        padding: '8px 10px',
                        background: 'var(--bg-hover)',
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
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No findings were raised for this run.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {result.findings.map((f, i) => (
        <div
          key={i}
          style={{
            padding: '14px 16px',
            background: 'var(--bg-hover)',
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
                background: 'var(--bg-hover)',
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
function StepsTab({ result, onApplyFix }: { result: RunResponse; onApplyFix?: (instructions: string) => void }) {
  if (result.steps.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No steps were executed in this scenario.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {result.steps.map((step) => (
        <div
          key={step.id}
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-hover)', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                {step.index + 1}
              </span>
              <strong style={{ fontSize: 13.5 }}>{step.intent}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {step.selfHealed && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#059669',
                    fontSize: 11,
                    fontWeight: 700,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                  title={step.selfHealed.reason}
                >
                  <Sparkles size={11} /> Self-Healed
                </span>
              )}
              <span className={`pill ${step.status === 'passed' ? 'passed' : step.status === 'failed' ? 'failed' : statusClass(step.status)}`}>
                {step.status === 'passed' ? 'Executed' : step.status === 'failed' ? 'Failed' : step.status}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{step.durationMs}ms</span>
            </div>
          </div>

          <div style={{ padding: '14px 16px' }}>
            {step.selfHealed && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontSize: 12.5,
                marginBottom: 10,
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Sparkles size={14} color="#059669" />
                <div>
                  <strong>AI Self-Healing:</strong> Target <code>"{step.selfHealed.originalTarget}"</code> drifted. Repaired via <em>{step.selfHealed.strategy}</em>.
                </div>
              </div>
            )}

            {step.error && (
              <div style={{ color: 'var(--fail)', fontSize: 12.5, marginBottom: 8 }}>
                ❌ {step.error}
              </div>
            )}

            {(step.status === 'failed' || step.error) && (
              <AIDiagnosticCard failedStep={step} targetUrl={result.targetUrl} onApplyFix={onApplyFix} />
            )}

            {step.policyReason && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 8 }}>
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
                {a.detail && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({a.detail})</span>}
              </div>
            ))}

            {step.screenshot && (
              <div style={{ marginTop: 12 }}>
                <img
                  src={step.screenshot}
                  alt={`Screenshot after: ${step.intent}`}
                  style={{ width: '100%', maxHeight: 400, objectFit: 'contain', background: 'var(--bg-surface, #ffffff)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
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
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
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
      <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 14, padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
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
            <p style={{ color: 'var(--text-muted)' }}>No meta tags found.</p>
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
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 12 }}>{key}</td>
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
            <p style={{ color: 'var(--text-muted)' }}>No headings found.</p>
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
                      background: 'var(--bg-hover)',
                      borderLeft: `3px solid var(--accent)`,
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span className="pill" style={{ background: 'var(--bg-hover)', color: '#fff', fontSize: 10 }}>
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
              return <p style={{ color: 'var(--text-muted)' }}>No matching links found.</p>;
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
            <p style={{ color: 'var(--text-muted)' }}>No images found.</p>
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
            <p style={{ color: 'var(--text-muted)' }}>No form elements found.</p>
          ) : (
            <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', padding: 14, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
              {forms.join('\n\n')}
            </pre>
          )}
        </div>
      )}

      {/* ── Navigation Landmarks ── */}
      {section === 'navigation' && (
        <div>
          {navItems.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No navigation landmarks found.</p>
          ) : (
            <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', padding: 14, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
              {navItems.join('\n')}
            </pre>
          )}
        </div>
      )}

      {/* ── Structured Data (JSON-LD) ── */}
      {section === 'structured-data' && (
        <div>
          {structuredData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No JSON-LD structured data detected on this page.</p>
          ) : (
            structuredData.map((item, i) => (
              <pre
                key={i}
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                  padding: 14,
                  background: 'var(--bg-hover)',
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
            <p style={{ color: 'var(--text-muted)' }}>No phone numbers or email addresses found in visible text.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {contacts.map((c, i) => {
                const isEmail = c.includes('@');
                return (
                  <div
                    key={i}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--bg-hover)',
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
            <p style={{ color: 'var(--text-muted)' }}>No text blocks found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {textBlocks.map((block, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
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

/* ── Visual Regression & Pixel Diff Tab ── */
function VisualDiffTab({ result, device }: { result: RunResponse; device?: DevicePreset }) {
  const screenshots = (result.steps ?? []).map((s) => s.screenshot).filter((s): s is string => Boolean(s));
  const currentScreenshot = screenshots[0] || '';
  const baselineKey = `wts_baseline_${encodeURIComponent(result.targetUrl)}`;

  const [baselineUrl, setBaselineUrl] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side' | 'overlay'>('slider');
  const [copiedBaseline, setCopiedBaseline] = useState(false);
  const [aiDiffLoading, setAiDiffLoading] = useState(false);
  const [aiDiffResult, setAiDiffResult] = useState<{
    verdict: string;
    isTrueRegression: boolean;
    confidence: number;
    summary: string;
    noiseDetected: string[];
    defectsDetected: string[];
    recommendation: string;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(baselineKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.screenshotUrl) setBaselineUrl(parsed.screenshotUrl);
      }
    } catch {}
  }, [baselineKey]);

  function handleSetAsBaseline() {
    if (!currentScreenshot) return;
    try {
      localStorage.setItem(baselineKey, JSON.stringify({
        targetUrl: result.targetUrl,
        screenshotUrl: currentScreenshot,
        capturedAt: Date.now(),
        device: device || 'desktop',
      }));
      setBaselineUrl(currentScreenshot);
      setCopiedBaseline(true);
      setTimeout(() => setCopiedBaseline(false), 2500);
    } catch {}
  }

  async function handleRunAiDiff() {
    if (!currentScreenshot) return;
    setAiDiffLoading(true);
    try {
      const res = await fetch('/api/diff/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentScreenshot,
          baselineScreenshot: effectiveBaseline,
          targetUrl: result.targetUrl,
          device: device || 'desktop',
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setAiDiffResult(json);
      }
    } catch (e) {
      console.warn('AI Visual Diff analysis failed:', e);
    } finally {
      setAiDiffLoading(false);
    }
  }

  if (!currentScreenshot && !baselineUrl) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: 15, fontWeight: 500 }}>No Screenshots Captured</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>Add a `take a screenshot` step to your plain English scenario to enable visual diffing.</p>
      </div>
    );
  }

  const effectiveBaseline = baselineUrl || currentScreenshot;

  return (
    <div className="diff-viewer">
      <div className="diff-controls">
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Visual Regression & Pixel Diff
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Compare current render ({device || 'desktop'}) against approved baseline snapshot.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            <button
              type="button"
              className={`subtab-chip ${viewMode === 'slider' ? 'active' : ''}`}
              onClick={() => setViewMode('slider')}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              Split Slider
            </button>
            <button
              type="button"
              className={`subtab-chip ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              className={`subtab-chip ${viewMode === 'overlay' ? 'active' : ''}`}
              onClick={() => setViewMode('overlay')}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              Diff Overlay
            </button>
          </div>

          <button
            type="button"
            className="secondary"
            onClick={handleSetAsBaseline}
            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
          >
            {copiedBaseline ? '✅ Saved as Baseline!' : '📌 Set as Baseline'}
          </button>
        </div>
      </div>

      {/* ── AI Smart Noise Filter Card (AI Vision) ── */}
      <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color="var(--accent)" />
            <strong style={{ fontSize: 13.5 }}>AI Smart Noise Filter (AI Vision)</strong>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Filters out rotating carousels & timestamp false positives</span>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={handleRunAiDiff}
            disabled={aiDiffLoading}
            style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)' }}
          >
            {aiDiffLoading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Wand2 size={13} color="var(--accent)" />}
            {aiDiffLoading ? 'Analyzing Visual Shifts...' : 'Run AI Smart Filter'}
          </button>
        </div>

        {aiDiffResult && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                background: aiDiffResult.isTrueRegression ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                color: aiDiffResult.isTrueRegression ? 'var(--fail)' : 'var(--pass)',
                textTransform: 'uppercase',
              }}>
                {aiDiffResult.verdict.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Confidence: {Math.round(aiDiffResult.confidence * 100)}%</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text)', margin: '0 0 8px' }}>{aiDiffResult.summary}</p>

            {aiDiffResult.noiseDetected && aiDiffResult.noiseDetected.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <strong>Dynamic Noise Ignored:</strong> {aiDiffResult.noiseDetected.join(' · ')}
              </div>
            )}
            {aiDiffResult.defectsDetected && aiDiffResult.defectsDetected.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--fail)', fontWeight: 600 }}>
                <strong>Defects Flagged:</strong> {aiDiffResult.defectsDetected.join(' · ')}
              </div>
            )}
            {aiDiffResult.recommendation && (
              <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>
                💡 <strong>Advice:</strong> {aiDiffResult.recommendation}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Match Metric Bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>● Visual Comparison (Manual Review)</span>
        <span style={{ color: 'var(--text-secondary)' }}>·</span>
        <span style={{ color: 'var(--text-secondary)' }}>Viewport: {device === 'mobile' ? '390×844' : device === 'tablet' ? '820×1180' : '1280×800'}</span>
        <span style={{ color: 'var(--text-secondary)' }}>·</span>
        <span style={{ color: 'var(--text-secondary)' }}>Baseline: {baselineUrl ? 'Approved Snapshot' : 'Auto Baseline (Set baseline above)'}</span>
      </div>

      {/* View Mode: Split Slider */}
      {viewMode === 'slider' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div 
            className="diff-slider-container"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
              setSliderPos(pos);
            }}
          >
            {/* Current Run (Right / Full) */}
            <img src={currentScreenshot} alt="Current Run" className="diff-image-current" />

            {/* Baseline Run (Left / Clipped) */}
            <div 
              className="diff-image-baseline"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img src={effectiveBaseline} alt="Baseline" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>

            {/* Divider Line */}
            <div className="diff-divider-line" style={{ left: `${sliderPos}%` }}>
              <div className="diff-handle-badge">
                ↔
              </div>
            </div>

            {/* Badges */}
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
              BASELINE
            </div>
            <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(59,130,246,0.85)', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
              CURRENT RUN
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 500, margin: '0 auto' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Baseline (0%)</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={sliderPos} 
              onChange={(e) => setSliderPos(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Current (100%)</span>
          </div>
        </div>
      )}

      {/* View Mode: Side-by-Side */}
      {viewMode === 'side-by-side' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-hover)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
              📌 Approved Baseline
            </div>
            <img src={effectiveBaseline} alt="Baseline" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-hover)', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--accent)' }}>
              ⚡ Current Scan Result
            </div>
            <img src={currentScreenshot} alt="Current Scan" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
        </div>
      )}

      {/* View Mode: Overlay Diff */}
      {viewMode === 'overlay' && (
        <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000', maxWidth: 900, margin: '0 auto' }}>
          <PixelDiffOverlay baselineUrl={effectiveBaseline} currentUrl={currentScreenshot} />
        </div>
      )}
    </div>
  );
}

function PixelDiffOverlay({ baselineUrl, currentUrl }: { baselineUrl: string; currentUrl: string }) {
  const [diffImageUrl, setDiffImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const img1 = new Image();
    const img2 = new Image();
    img1.crossOrigin = "anonymous";
    img2.crossOrigin = "anonymous";
    
    Promise.all([
      new Promise((resolve, reject) => { img1.onload = resolve; img1.onerror = reject; img1.src = baselineUrl; }),
      new Promise((resolve, reject) => { img2.onload = resolve; img2.onerror = reject; img2.src = currentUrl; })
    ]).then(() => {
       if (!active) return;
       const canvas = document.createElement('canvas');
       const w = Math.max(img1.width, img2.width);
       const h = Math.max(img1.height, img2.height);
       canvas.width = w;
       canvas.height = h;
       const ctx = canvas.getContext('2d');
       if (!ctx) return;
       
       ctx.drawImage(img1, 0, 0);
       const data1 = ctx.getImageData(0, 0, w, h).data;
       
       ctx.clearRect(0, 0, w, h);
       ctx.drawImage(img2, 0, 0);
       const imgData2 = ctx.getImageData(0, 0, w, h);
       const data2 = imgData2.data;
       
       for (let i = 0; i < data1.length; i += 4) {
         if (data1[i] !== data2[i] || data1[i+1] !== data2[i+1] || data1[i+2] !== data2[i+2]) {
           data2[i] = 255;   // R
           data2[i+1] = 0;   // G
           data2[i+2] = 0;   // B
           data2[i+3] = 255; // A
         } else {
           data2[i] = Math.floor(data2[i] * 0.3);
           data2[i+1] = Math.floor(data2[i+1] * 0.3);
           data2[i+2] = Math.floor(data2[i+2] * 0.3);
           data2[i+3] = 255;
         }
       }
       ctx.putImageData(imgData2, 0, 0);
       setDiffImageUrl(canvas.toDataURL());
    }).catch(err => {
      console.warn("Pixel diff generation failed:", err);
      if (active) setError(true);
    });
    
    return () => { active = false; };
  }, [baselineUrl, currentUrl]);

  if (diffImageUrl) {
    return (
      <>
        <img src={diffImageUrl} alt="Pixel Diff" style={{ width: '100%', height: 'auto', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 12 }}>
          🔍 Actual Pixel Diff: Changed pixels are highlighted in pure red. Unchanged pixels are darkened.
        </div>
      </>
    );
  }

  return (
    <>
      <img src={baselineUrl} alt="Baseline Base" style={{ width: '100%', height: 'auto', display: 'block' }} />
      <img 
        src={currentUrl} 
        alt="Current Diff Overlay" 
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'difference', opacity: 0.85 }} 
      />
      <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 12 }}>
        {error ? '⚠️ Pixel diff failed. Showing CSS difference mode.' : '⏳ Generating pixel diff...'}
      </div>
    </>
  );
}

/* ── Main ResultsPanel Export ── */
export function ResultsPanel({ result, onDownload, pdfing, device, onApplyFix }: ResultsPanelProps) {
  const [tab, setTab] = useState<TabId>('overview');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const handleGenerateSummary = () => {
    setIsGeneratingSummary(true);

    // Generate summary client-side from scan data — instant, no API timeouts.
    setTimeout(() => {
      try {
        const conf = Math.round(result.meanConfidence * 100);
        const failedCats = result.categories.filter((c) => c.status === 'failed');
        const warnCats   = result.categories.filter((c) => c.status === 'warning');
        const critFindings = result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
        const allPassed  = result.totals.failed === 0 && failedCats.length === 0;

        // ── Paragraph 1: Overall posture ──
        const posture = allPassed
          ? `The autonomous scan of **${result.targetUrl}** completed successfully with all ${result.totals.total} functional steps passing and an inference confidence of ${conf}%. The target presents a generally healthy posture with no critical functional failures detected.`
          : `The autonomous scan of **${result.targetUrl}** returned a **${result.status.toUpperCase()}** verdict after executing ${result.totals.total} steps at ${conf}% inference confidence. ${failedCats.length > 0 ? `${failedCats.length} inspection categor${failedCats.length === 1 ? 'y' : 'ies'} failed (${failedCats.map((c) => c.label).join(', ')}), requiring immediate attention.` : 'All functional steps passed, however inspection categories revealed outstanding concerns.'}`;

        // ── Key Findings bullets ──
        const bullets: string[] = [];

        if (critFindings.length > 0) {
          bullets.push(`**${critFindings.length} high-severity finding${critFindings.length > 1 ? 's' : ''} identified** — ${critFindings.slice(0, 2).map((f) => f.title).join('; ')}.`);
        }

        failedCats.slice(0, 3).forEach((c) => {
          const failedChecks = c.checks.filter((ch) => ch.status === 'failed');
          if (failedChecks.length > 0) {
            bullets.push(`**${c.label}:** ${failedChecks[0].name} — ${failedChecks[0].detail.slice(0, 120)}${failedChecks[0].detail.length > 120 ? '…' : ''}`);
          }
        });

        warnCats.slice(0, 2).forEach((c) => {
          bullets.push(`**${c.label} (Warning):** ${c.checks.filter((ch) => ch.status === 'warning').length} advisory issue${c.checks.filter((ch) => ch.status === 'warning').length > 1 ? 's' : ''} flagged for review.`);
        });

        if (result.totals.blocked > 0) {
          bullets.push(`**Policy enforcement active:** ${result.totals.blocked} step${result.totals.blocked > 1 ? 's' : ''} blocked by ownership policy (Tier ${result.ownership.effectiveTier}).`);
        }

        if (bullets.length === 0) {
          bullets.push('**No critical findings detected** — the target passed all active inspection checks.');
          bullets.push(`**Functional integrity confirmed** — all ${result.totals.passed} executed steps returned expected outcomes.`);
        }

        // ── Remediation ──
        const remediations: string[] = [];
        if (failedCats.some((c) => c.category === 'security')) {
          remediations.push('**Priority:** Address security hardening gaps — implement missing Content Security Policy headers and ensure all session cookies carry the Secure and HttpOnly flags.');
        }
        if (failedCats.some((c) => c.category === 'accessibility')) {
          remediations.push('**Accessibility:** Audit interactive elements for keyboard focus visibility and ensure all form inputs carry accessible ARIA labels for screen reader compatibility.');
        }
        if (failedCats.some((c) => c.category === 'performance')) {
          remediations.push('**Performance:** Profile and reduce main-thread blocking scripts; consider code-splitting and deferred loading for non-critical assets.');
        }
        if (remediations.length === 0) {
          remediations.push('**Maintain current quality bar** — schedule periodic automated audits to detect regressions as the site evolves.');
          remediations.push('**Expand test coverage** — consider adding authenticated user journey tests to validate gated functionality.');
        }

        const summary = [
          `## Executive Summary\n\n${posture}`,
          `\n\n## Key Findings\n\n${bullets.map((b) => `- ${b}`).join('\n')}`,
          `\n\n## Remediation Advice\n\n${remediations.map((r) => `- ${r}`).join('\n')}`,
        ].join('');

        setAiSummary(summary);
      } catch (e) {
        console.error('Summary generation error:', e);
      } finally {
        setIsGeneratingSummary(false);
      }
    }, 800); // Brief delay for perceived "thinking" UX
  };

  // Auto-generate summary whenever a new scan result arrives (keyed on runId)
  useEffect(() => {
    setAiSummary(null);
    handleGenerateSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.runId]);

  const hasScraperData = result.categories.some((c) => c.category === 'scraper');
  const hasScreenshots = (result.steps ?? []).some((s) => Boolean(s.screenshot));

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'categories', label: 'Categories', count: result.categories.length },
    { id: 'findings', label: 'Findings', count: result.findings.length },
    { id: 'steps', label: 'Steps & Timeline', count: result.steps.length },
    ...(hasScreenshots ? [{ id: 'diff' as TabId, label: '🔍 Visual & Diff' }] : []),
    ...(hasScraperData ? [{ id: 'scraper' as TabId, label: '🕷 Extracted Content' }] : []),
    { id: 'export' as TabId, label: '⚡ Code Export' },
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
          <span className="pill verdict" style={{ background: 'var(--bg-hover)', color: 'var(--text)' }}>
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
            onClick={() => onDownload(aiSummary ?? undefined)}
            disabled={pdfing}
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
      {(result.steps.length > 0 || result.categories.length > 0) && <ExportDock result={result} />}

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
        {tab === 'overview' && <OverviewTab result={result} onGoTo={setTab} onApplyFix={onApplyFix} aiSummary={aiSummary} isGeneratingSummary={isGeneratingSummary} onGenerateSummary={handleGenerateSummary} />}
        {tab === 'categories' && <CategoriesTab result={result} />}
        {tab === 'findings' && <FindingsTab result={result} />}
        {tab === 'steps' && <StepsTab result={result} onApplyFix={onApplyFix} />}
        {tab === 'diff' && <VisualDiffTab result={result} device={device} />}
        {tab === 'scraper' && <ScraperTab result={result} />}
        {tab === 'export' && <CodeExportTab result={result} />}
        {tab === 'raw' && (
          <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', padding: 16, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', overflowX: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
