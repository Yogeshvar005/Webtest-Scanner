'use client';

import { useState } from 'react';
import { Glyph } from './glyphs';
import type { RunResponse } from './types';

interface ResultsPanelProps {
  result: RunResponse;
  onDownload: () => void;
  pdfing: boolean;
}

type TabId = 'overview' | 'categories' | 'findings' | 'steps' | 'raw';

function statusClass(status: string): string {
  return ['passed', 'failed', 'blocked', 'warning', 'skipped'].includes(status) ? status : 'skipped';
}

/**
 * The single sentence a screen-reader user hears for a completed run. Step
 * totals alone are not enough: a scenario can pass every step while a
 * selected category (security headers, accessibility) still fails, and the
 * announcement must say so or it actively contradicts the visible verdict
 * pill next to it.
 */
function runSummary(result: RunResponse): string {
  const parts = [`Run ${result.status}.`];

  parts.push(
    `${result.totals.passed} of ${result.totals.total} steps passed` +
      (result.totals.failed  > 0 ? `, ${result.totals.failed} failed`              : '') +
      (result.totals.blocked > 0 ? `, ${result.totals.blocked} blocked by policy`  : '') +
      '.',
  );

  const failedCategories  = (result.categories ?? []).filter((c) => c.status === 'failed');
  const warnedCategories  = (result.categories ?? []).filter((c) => c.status === 'warning');

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

/* ── Inline SVG icon set for the results panel ──────────────────── */

function IconDownload() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 11.5v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.5" />
      <path d="M8 2.5v7M5 7l3 3 3-3" />
    </svg>
  );
}

function IconPrint() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="12" height="14" rx="1" />
      <path d="M5 6h6M5 9h6M5 12h4" />
    </svg>
  );
}

/* ── Overview tab ──────────────────────────────────────────────── */

function OverviewTab({ result, onGoTo }: { result: RunResponse; onGoTo: (tab: TabId) => void }) {
  const notPassing  = result.categories.filter((c) => c.status === 'failed' || c.status === 'warning');
  const topFindings = [...result.findings]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 5);

  // Detect a hard abort (e.g. browser failed to launch on server)
  const abortFinding = result.findings.find((f) => f.title === 'Run aborted');

  return (
    <div>
      {abortFinding && (
        <div className="err" style={{ marginBottom: 16 }}>
          <strong>⚠ Run aborted — browser could not start</strong>
          <div style={{ marginTop: 6 }}>{abortFinding.detail}</div>
          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: '12px' }}>
            This is a server-side issue. Please try again in a moment.
          </div>
        </div>
      )}
      <div className="stats">
        <div className="stat">
          <div className="n">{result.totals.total}</div>
          <div className="k">Steps</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--pass)' }}>{result.totals.passed}</div>
          <div className="k">Passed</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--fail)' }}>{result.totals.failed}</div>
          <div className="k">Failed</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--block)' }}>{result.totals.blocked}</div>
          <div className="k">Blocked</div>
        </div>
        <div className="stat">
          <div className="n">{Math.round(result.meanConfidence * 100)}%</div>
          <div className="k">Confidence</div>
        </div>
      </div>

      <div className="meta" style={{ marginTop: 16, marginBottom: 0 }}>
        <span>Policy: <strong>{result.policyDecision.effect}</strong></span>
        <span>Ownership tier: <strong>{result.ownership.effectiveTier}</strong></span>
      </div>
      {result.policyDecision.reason && (
        <div className="hint">{result.policyDecision.reason}</div>
      )}
      {result.policyDecision.conditions?.map((c, i) => (
        <div key={i} className="hint">Condition: {c.detail}</div>
      ))}
      {result.unparsed.length > 0 && (
        <div className="hint">
          Not understood, so not executed: {result.unparsed.map((u) => `"${u}"`).join(', ')}
        </div>
      )}

      {notPassing.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="brief-heading">Categories that didn&rsquo;t pass</div>
          {notPassing.map((c) => (
            <button
              key={c.category}
              type="button"
              className="brief-row"
              onClick={() => onGoTo('categories')}
            >
              <span className={`pill ${statusClass(c.status)}`}>{c.status}</span>
              <Glyph id={c.category} />
              <span className="brief-row-label">{c.label}</span>
              <span className="brief-row-sub">
                {c.skippedReason ?? `${c.totals.failed} failed · ${c.totals.warning} warnings`}
              </span>
            </button>
          ))}
        </div>
      )}

      {topFindings.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="brief-heading">
            Top findings
            {result.findings.length > topFindings.length
              ? ` (${topFindings.length} of ${result.findings.length})`
              : ''}
          </div>
          {topFindings.map((f, i) => (
            <button
              key={i}
              type="button"
              className="brief-row"
              onClick={() => onGoTo('findings')}
            >
              <span className={`sev-dot ${f.severity}`} aria-hidden />
              <span className="brief-row-label">{f.title}</span>
              <span className="brief-row-sub">{f.severity}</span>
            </button>
          ))}
        </div>
      )}

      {notPassing.length === 0 && topFindings.length === 0 && (
        <p className="hint" style={{ marginTop: 20 }}>
          Every selected category passed cleanly. See the Steps tab for the full walkthrough.
        </p>
      )}
    </div>
  );
}

/* ── Categories tab ─────────────────────────────────────────────── */

function CategoriesTab({ result }: { result: RunResponse }) {
  if (result.categories.length === 0) {
    return <p className="hint">No categories were selected for this run.</p>;
  }

  return (
    <>
      {result.categories.map((category) => (
        <details key={category.category} className="cat" open={category.status === 'failed'}>
          <summary>
            <span className={`pill ${statusClass(category.status)}`}>{category.status}</span>
            <Glyph id={category.category} />
            <span className="cat-label">{category.label}</span>
            <span className="cat-totals">
              {category.totals.passed}&nbsp;pass ·{' '}
              {category.totals.failed}&nbsp;fail ·{' '}
              {category.totals.warning}&nbsp;warn
            </span>
          </summary>

          {category.skippedReason && (
            <div className="skip-reason">{category.skippedReason}</div>
          )}

          {category.checks.map((check) => (
            <div key={check.id} className={`check ${statusClass(check.status)}`}>
              <div className="check-head">
                <span className={`pill ${statusClass(check.status)}`}>{check.status}</span>
                <strong>{check.name}</strong>
                <span className="sev">{check.severity}</span>
              </div>
              <div className="check-detail">{check.detail}</div>
              {check.evidence && check.evidence.length > 0 && (
                <pre>{check.evidence.join('\n')}</pre>
              )}
            </div>
          ))}
        </details>
      ))}
    </>
  );
}

/* ── Findings tab ───────────────────────────────────────────────── */

function FindingsTab({ result }: { result: RunResponse }) {
  if (result.findings.length === 0) {
    return <p className="hint">No findings were raised.</p>;
  }

  return (
    <>
      {result.findings.map((f, i) => (
        <div key={i} className={`finding ${f.severity}`}>
          <div className="t">{f.title}</div>
          <div className="d">{f.detail}</div>
          {f.evidence && <pre>{f.evidence}</pre>}
        </div>
      ))}
    </>
  );
}

/* ── Steps tab ──────────────────────────────────────────────────── */

function StepsTab({ result }: { result: RunResponse }) {
  if (result.steps.length === 0) {
    return <p className="hint">No steps were executed.</p>;
  }

  return (
    <>
      {result.steps.map((step) => (
        <div className="step" key={step.id}>
          <div className="head">
            <span className="idx">{step.index + 1}</span>
            <span className="intent">{step.intent}</span>
            <span className={`pill ${step.provenanceSource}`}>{step.provenanceSource}</span>
            <span className={`pill ${statusClass(step.status)}`}>{step.status}</span>
            <span className="dur">{step.durationMs}ms</span>
          </div>
          <div className="body">
            <div className="meta">
              {step.resolvedBy && (
                <span>
                  Matched by <strong>{step.resolvedBy}</strong>{' '}
                  ({Math.round((step.resolutionConfidence ?? 0) * 100)}%)
                </span>
              )}
              <span>
                Authored by <strong>{step.provenanceSource}</strong>{' '}
                ({Math.round(step.provenanceConfidence * 100)}%)
              </span>
            </div>

            {step.error       && <div className="err">{step.error}</div>}
            {step.policyReason && <div className="err">Blocked by policy: {step.policyReason}</div>}

            {step.assertions.map((a, i) => (
              <div key={i} className={`assert ${a.passed ? 'ok' : 'bad'}`}>
                {a.passed ? '✓' : '✗'} {a.description}
                {a.detail && (
                  <div style={{ color: 'var(--muted)', marginTop: 2 }}>{a.detail}</div>
                )}
              </div>
            ))}

            {step.consoleErrors.slice(0, 3).map((c, i) => (
              <div key={i} className="assert bad">Console error: {c}</div>
            ))}

            {step.screenshot && (
              <img src={step.screenshot} alt={`Screenshot after: ${step.intent}`} />
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/* ── ResultsPanel (main export) ─────────────────────────────────── */

/**
 * The results view, organized as tabs so each kind of output (overview,
 * category breakdown, findings, step walkthrough, raw data) is its own panel
 * instead of one long stack of cards the tester has to scroll through in full
 * every time. Overview is the default and stays intentionally brief; the
 * other tabs hold the full detail for when it's actually wanted.
 */
export function ResultsPanel({ result, onDownload, pdfing }: ResultsPanelProps) {
  const [tab, setTab] = useState<TabId>('overview');

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'overview',   label: 'Overview' },
    { id: 'categories', label: 'Categories', count: result.categories.length },
    { id: 'findings',   label: 'Findings',   count: result.findings.length },
    { id: 'steps',      label: 'Steps',      count: result.steps.length },
    { id: 'raw',        label: 'Raw' },
  ];

  return (
    <div className="card reveal reveal-1">
      {/* Screen-reader announcement of the run result */}
      <p className="sr-only" role="status" aria-atomic="true">{runSummary(result)}</p>

      {/* ── Results header ── */}
      <div className="results-header">
        <div className="results-meta">
          <span className={`pill verdict ${statusClass(result.status)}`}>{result.status}</span>
          {result.strict && <span className="pill">strict</span>}
          <span className="results-url">
            {result.targetUrl}
            &nbsp;·&nbsp;
            {(result.durationMs / 1000).toFixed(1)}s
            &nbsp;·&nbsp;
            run {result.runId}
          </span>
        </div>

        {/* Download PDF — single action button */}
        <div className="row no-print" style={{ gap: 8, flex: 'none' }}>
          <button
            className="secondary"
            onClick={onDownload}
            disabled={pdfing}
            aria-label="Download report as PDF"
            title="Download PDF"
          >
            {pdfing
              ? <><span className="spinner" />Generating…</>
              : <><IconDownload />Download PDF</>
            }
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs no-print" role="tablist" aria-label="Result sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="tab-count">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab panel ── */}
      <div role="tabpanel" className="tabpanel">
        {tab === 'overview'    && <OverviewTab    result={result} onGoTo={setTab} />}
        {tab === 'categories'  && <CategoriesTab  result={result} />}
        {tab === 'findings'    && <FindingsTab    result={result} />}
        {tab === 'steps'       && <StepsTab       result={result} />}
        {tab === 'raw'         && (
          <pre className="raw-json">{JSON.stringify(result, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
