'use client';

import { useEffect, useState } from 'react';
import { Glyph, Radar, Wordmark } from './glyphs';
import { downloadReport, printReport } from './report';
import { ResultsPanel } from './ResultsPanel';
import type { CategoryDescriptor, RunResponse } from './types';

const SAMPLE = `go to /
verify Example Domain is visible
take a screenshot`;

const DEFAULT_SELECTED = ['functional', 'ui', 'accessibility', 'security-passive'];

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

  function handlePrint() {
    if (!result) return;
    void printReport(result);
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
            <ResultsPanel result={result} downloading={downloading} onDownload={handleDownload} onPrint={handlePrint} />
          )}
        </div>
    </div>
  );
}
