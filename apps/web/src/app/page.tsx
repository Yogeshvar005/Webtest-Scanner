'use client';

import { useEffect, useState } from 'react';
import { Glyph, Radar, Wordmark } from './glyphs';
import { downloadReport } from './report';
import type { CategoryDescriptor, RunResponse } from './types';

const SAMPLE = `go to /
verify Example Domain is visible
take a screenshot`;

const DEFAULT_SELECTED = ['functional', 'ui', 'accessibility', 'security-passive'];

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
      (result.totals.failed > 0 ? `, ${result.totals.failed} failed` : '') +
      (result.totals.blocked > 0 ? `, ${result.totals.blocked} blocked by policy` : '') +
      '.',
  );

  const failedCategories = (result.categories ?? []).filter((c) => c.status === 'failed');
  const warnedCategories = (result.categories ?? []).filter((c) => c.status === 'warning');

  if (failedCategories.length > 0) {
    parts.push(`${failedCategories.length} test ${failedCategories.length === 1 ? 'category' : 'categories'} failed: ${failedCategories.map((c) => c.label).join(', ')}.`);
  }
  if (warnedCategories.length > 0) {
    parts.push(`${warnedCategories.length} ${warnedCategories.length === 1 ? 'category has' : 'categories have'} warnings: ${warnedCategories.map((c) => c.label).join(', ')}.`);
  }

  return parts.join(' ');
}

export default function Home() {
  const [url, setUrl] = useState('https://example.com');
  const [instructions, setInstructions] = useState(SAMPLE);
  const [tier, setTier] = useState('0');
  const [environment, setEnvironment] = useState('QA');
  const [strict, setStrict] = useState(false);
  const [available, setAvailable] = useState<CategoryDescriptor[]>([]);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<RunResponse | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d: { categories: CategoryDescriptor[] }) => setAvailable(d.categories))
      .catch(() => undefined);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url, instructions, environment,
          ownershipTier: Number(tier), categories: selected, strict,
        }),
      });
      const data = (await response.json()) as RunResponse;
      if (!response.ok) setError(data);
      else setResult(data);
    } catch (e) {
      setError({ error: e instanceof Error ? e.message : 'Request failed' } as RunResponse);
    } finally {
      setRunning(false);
    }
  }

  async function handleDownload() {
    if (!result) return;
    setDownloading(true);
    try {
      await downloadReport(result);
    } finally {
      setDownloading(false);
    }
  }

  const tierNumber = Number(tier);

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="masthead-row">
          <Radar />
          <div>
            <Wordmark />
            <p className="tagline">
              A real browser
              <span className="rotator">
                <span>clicks through your site.</span>
                <span>reads its colours and type.</span>
                <span>audits it for accessibility.</span>
                <span>inspects its security headers.</span>
                <span>screenshots every step.</span>
              </span>
            </p>
          </div>
        </div>
      </header>

      <div className="controls-row no-print">
        <div className="card">
          <h2>Target</h2>

          <div className="field">
            <label htmlFor="url">Website URL</label>
            <input id="url" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </div>

          <div className="field">
            <label htmlFor="env">Environment</label>
            <select id="env" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              {['LOCAL', 'DEV', 'QA', 'UAT', 'STAGING', 'PRODUCTION'].map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="tier">Ownership tier</label>
            <select id="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="0">0 — Unverified</option>
              <option value="1">1 — DNS verified</option>
              <option value="2">2 — Verified + attested</option>
            </select>
          </div>
        </div>

        <div className="card">
          <h2>What to test</h2>
          {available.length === 0 && <p className="hint">Loading options…</p>}

          <div className="checklist-scroll">
            <div className="checklist-grid">
              {available.map((category) => {
                const locked = tierNumber < category.minTier;
                const checked = selected.includes(category.id);

                return (
                  <label key={category.id} htmlFor={`cat-${category.id}`} className={`option ${locked ? 'locked' : ''}`}>
                    <input
                      id={`cat-${category.id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(category.id)}
                      aria-describedby={`cat-desc-${category.id}`}
                    />
                    <Glyph id={category.id} />
                    <span>
                      <span className="option-title">
                        {category.label}
                        {category.minTier > 0 && <em className="tier-badge">tier {category.minTier}+</em>}
                      </span>
                      <span className="option-desc" id={`cat-desc-${category.id}`}>{category.description}</span>
                      {locked && checked && (
                        <span className="option-warn">
                          Skipped: target is tier {tierNumber}, this needs tier {category.minTier}.
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <label htmlFor="strict-mode" className="option strict-option">
              <input id="strict-mode" type="checkbox" checked={strict} onChange={() => setStrict(!strict)} />
              <Glyph id="strict" />
              <span>
                <span className="option-title">Strict mode</span>
                <span className="option-desc">
                  Treat every warning as a failure. Heuristic checks — overlap, clipped text, tap targets —
                  produce false positives on real sites, so they only warn by default.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="card">
          <h2>Scenario</h2>
          <div className="field">
            <label htmlFor="instructions">Steps, in plain English</label>
            <textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>

          <button className="primary" onClick={run} disabled={running || selected.length === 0}>
            {running ? <><span className="spinner" />Running in a real browser…</> : 'Run test'}
          </button>

          {selected.length === 0 && <p className="hint">Select at least one kind of testing.</p>}

          <p className="hint">
            Understood verbs: <code>go to /path</code> · <code>click X</code> · <code>enter Y into X</code> ·{' '}
            <code>fill X with Y</code> · <code>search for X</code> · <code>verify X</code> ·{' '}
            <code>wait for X</code> · <code>screenshot</code>
          </p>
        </div>
      </div>

      <div className="results">
          {error && (
            <div className="card">
              <h2>Run refused</h2>
              <div className="err">
                <strong>{error.error}</strong>
                {error.detail && <div style={{ marginTop: 6 }}>{error.detail}</div>}
                {error.hint && <div style={{ marginTop: 6 }}>{error.hint}</div>}
              </div>
              {error.issues?.map((issue, i) => (
                <div key={i} className="assert bad"><strong>{issue.rule}</strong> — {issue.message}</div>
              ))}
            </div>
          )}

          {!result && !error && !running && (
            <div className="card"><div className="empty">Pick what to test, then run.</div></div>
          )}

          {running && (
            <div className="card" aria-busy="true">
              <div className="scanning">
                <div className="bars" aria-hidden><i /><i /><i /><i /><i /></div>
                <div className="phase" role="status" aria-atomic="true">Driving a real browser through your scenario…</div>
              </div>
            </div>
          )}

          {result && (
            <>
              <div className="card reveal reveal-1">
                <h2>Result</h2>
                <p className="sr-only" role="status" aria-atomic="true">
                  {runSummary(result)}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span className={`pill verdict ${statusClass(result.status)}`}>{result.status}</span>
                  {result.strict && <span className="pill">strict</span>}
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {result.targetUrl} · {(result.durationMs / 1000).toFixed(1)}s · run {result.runId}
                  </span>
                </div>

                <div className="stats">
                  <div className="stat"><div className="n">{result.totals.total}</div><div className="k">Steps</div></div>
                  <div className="stat"><div className="n" style={{ color: 'var(--pass)' }}>{result.totals.passed}</div><div className="k">Passed</div></div>
                  <div className="stat"><div className="n" style={{ color: 'var(--fail)' }}>{result.totals.failed}</div><div className="k">Failed</div></div>
                  <div className="stat"><div className="n" style={{ color: 'var(--block)' }}>{result.totals.blocked}</div><div className="k">Blocked</div></div>
                  <div className="stat"><div className="n">{Math.round(result.meanConfidence * 100)}%</div><div className="k">Confidence</div></div>
                </div>

                <div className="meta" style={{ marginTop: 14, marginBottom: 0 }}>
                  <span>Policy: <strong>{result.policyDecision.effect}</strong></span>
                  <span>Ownership tier: <strong>{result.ownership.effectiveTier}</strong></span>
                </div>
                {result.policyDecision.reason && <div className="hint">{result.policyDecision.reason}</div>}
                {result.policyDecision.conditions?.map((c, i) => <div key={i} className="hint">Condition: {c.detail}</div>)}
                {result.unparsed.length > 0 && (
                  <div className="hint">Not understood, so not executed: {result.unparsed.map((u) => `"${u}"`).join(', ')}</div>
                )}

                <div className="row no-print" style={{ marginTop: 16 }}>
                  <button className="secondary" onClick={handleDownload} disabled={downloading}>
                    {downloading ? <><span className="spinner" />Preparing…</> : 'Download report'}
                  </button>
                  <button className="secondary" onClick={() => window.print()}>
                    Print / Save as PDF
                  </button>
                </div>
              </div>

              {result.categories.length > 0 && (
                <div className="card reveal reveal-2">
                  <h2>Categories</h2>
                  {result.categories.map((category) => (
                    <details key={category.category} className="cat" open={category.status === 'failed'}>
                      <summary>
                        <span className={`pill ${statusClass(category.status)}`}>{category.status}</span>
                        <Glyph id={category.category} />
                        <span className="cat-label">{category.label}</span>
                        <span className="cat-totals">
                          {category.totals.passed}&nbsp;pass · {category.totals.failed}&nbsp;fail · {category.totals.warning}&nbsp;warn
                        </span>
                      </summary>

                      {category.skippedReason && <div className="skip-reason">{category.skippedReason}</div>}

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
                </div>
              )}

              {result.findings.length > 0 && (
                <div className="card reveal reveal-3">
                  <h2>Findings ({result.findings.length})</h2>
                  {result.findings.map((f, i) => (
                    <div key={i} className={`finding ${f.severity}`}>
                      <div className="t">{f.title}</div>
                      <div className="d">{f.detail}</div>
                      {f.evidence && <pre>{f.evidence}</pre>}
                    </div>
                  ))}
                </div>
              )}

              {result.steps.length > 0 && (
                <div className="card reveal reveal-4">
                  <h2>Steps</h2>
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
                          {step.resolvedBy && <span>Matched by <strong>{step.resolvedBy}</strong> ({Math.round((step.resolutionConfidence ?? 0) * 100)}%)</span>}
                          <span>Authored by <strong>{step.provenanceSource}</strong> ({Math.round(step.provenanceConfidence * 100)}%)</span>
                        </div>

                        {step.error && <div className="err">{step.error}</div>}
                        {step.policyReason && <div className="err">Blocked by policy: {step.policyReason}</div>}

                        {step.assertions.map((a, i) => (
                          <div key={i} className={`assert ${a.passed ? 'ok' : 'bad'}`}>
                            {a.passed ? '✓' : '✗'} {a.description}
                            {a.detail && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{a.detail}</div>}
                          </div>
                        ))}

                        {step.consoleErrors.slice(0, 3).map((c, i) => (
                          <div key={i} className="assert bad">Console error: {c}</div>
                        ))}

                        {step.screenshot && <img src={step.screenshot} alt={`Screenshot after: ${step.intent}`} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="card">
                <details className="raw">
                  <summary>Raw run data (the structured DSL and result)</summary>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </div>
    </div>
  );
}
