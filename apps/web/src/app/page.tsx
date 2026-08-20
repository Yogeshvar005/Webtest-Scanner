'use client';

import { useEffect, useState } from 'react';

interface AssertionResult { description: string; passed: boolean; severity: string; detail?: string }
interface StepResult {
  id: string; index: number; intent: string; status: string; durationMs: number;
  screenshot?: string; resolvedBy?: string; resolutionConfidence?: number;
  assertions: AssertionResult[]; error?: string; policyReason?: string;
  consoleErrors: string[]; provenanceSource: string; provenanceConfidence: number;
}
interface CheckResult { id: string; name: string; status: string; severity: string; detail: string; evidence?: string[] }
interface CategoryResult {
  category: string; label: string; status: string; skippedReason?: string;
  checks: CheckResult[]; totals: { passed: number; failed: number; warning: number; skipped: number };
}
interface Finding { type: string; severity: string; title: string; detail: string; evidence?: string }
interface CategoryDescriptor { id: string; label: string; description: string; minTier: number }

interface RunResponse {
  runId: string; targetUrl: string; status: string; durationMs: number; strict: boolean;
  steps: StepResult[]; findings: Finding[]; categories: CategoryResult[];
  totals: { total: number; passed: number; failed: number; blocked: number; skipped: number };
  policyDecision: { effect: string; reason?: string; remediation?: string; code?: string; conditions?: Array<{ detail: string }> };
  unparsed: string[]; meanConfidence: number;
  ownership: { recordedTier: number; effectiveTier: number };
  error?: string; detail?: string; hint?: string; issues?: Array<{ rule: string; message: string }>;
}

const SAMPLE = `go to /
verify Example Domain is visible
take a screenshot`;

const DEFAULT_SELECTED = ['functional', 'ui', 'accessibility', 'security-passive'];

function statusClass(status: string): string {
  return ['passed', 'failed', 'blocked', 'warning', 'skipped'].includes(status) ? status : 'skipped';
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

  const tierNumber = Number(tier);

  return (
    <div className="wrap">
      <header className="masthead">
        <h1>Webtest Scanner</h1>
        <p>Choose what to test, describe it in plain English, and a real browser runs it with screenshot evidence.</p>
      </header>

      <div className="grid">
        <div>
          <div className="card">
            <h2>Target</h2>

            <div className="field">
              <label htmlFor="url">Website URL</label>
              <input id="url" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
            </div>

            <div className="field row">
              <div>
                <label htmlFor="env">Environment</label>
                <select id="env" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                  {['LOCAL', 'DEV', 'QA', 'UAT', 'STAGING', 'PRODUCTION'].map((e) => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="tier">Ownership tier</label>
                <select id="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="0">0 — Unverified</option>
                  <option value="1">1 — DNS verified</option>
                  <option value="2">2 — Verified + attested</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>What to test</h2>
            {available.length === 0 && <p className="hint">Loading options…</p>}

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
                  <span>
                    <span className="option-title">
                      {category.label}
                      {category.minTier > 0 && <em className="tier-badge">tier {category.minTier}+</em>}
                    </span>
                    <span className="option-desc" id={`cat-desc-${category.id}`}>{category.description}</span>
                    {locked && checked && (
                      <span className="option-warn">
                        Will be skipped: this target is tier {tierNumber} and this needs tier {category.minTier}.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}

            <label htmlFor="strict-mode" className="option" style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <input id="strict-mode" type="checkbox" checked={strict} onChange={() => setStrict(!strict)} />
              <span>
                <span className="option-title">Strict mode</span>
                <span className="option-desc">
                  Treat every warning as a failure. Heuristic checks — overlap, clipped text, tap targets —
                  produce false positives on real sites, so they only warn by default.
                </span>
              </span>
            </label>
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

        <div>
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
            <div className="card"><div className="empty"><span className="spinner" />Launching Chromium and working through your scenario…</div></div>
          )}

          {result && (
            <>
              <div className="card">
                <h2>Result</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span className={`pill ${statusClass(result.status)}`}>{result.status}</span>
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
              </div>

              {result.categories.length > 0 && (
                <div className="card">
                  <h2>Categories</h2>
                  {result.categories.map((category) => (
                    <details key={category.category} className="cat" open={category.status === 'failed'}>
                      <summary>
                        <span className={`pill ${statusClass(category.status)}`}>{category.status}</span>
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
                <div className="card">
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
                <div className="card">
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
    </div>
  );
}
