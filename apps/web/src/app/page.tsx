'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Glyph, Radar, Wordmark } from './glyphs';
import { printReport } from './report';
import { ResultsPanel } from './ResultsPanel';
import { useAuth } from '../lib/auth-context';
import type { CategoryDescriptor, RunResponse } from './types';

const SAMPLE = `go to /
verify Example Domain is visible
take a screenshot`;

const DEFAULT_SELECTED = ['functional', 'ui', 'accessibility', 'security-passive'];
const MAX_INSTRUCTIONS = 2000;

/** Validate that the URL looks like a real http/https address. */
function isValidUrl(value: string): boolean {
  try {
    const withProto = value.startsWith('http') 
      ? value 
      : (value.startsWith('localhost') || value.startsWith('127.0.0.1') ? `http://${value}` : `https://${value}`);
    const u = new URL(withProto);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const TIER_HELP: Record<string, string> = {
  '0': 'Unverified — observation only (GET/HEAD, ≤1 rps, screenshots, passive checks).',
  '1': 'DNS verified — forms, CRUD, authenticated journeys, API tests.',
  '2': 'DNS + signed attestation — active security probing, IDOR, session probes.',
};

/** Elapsed time counter displayed during a run. */
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="elapsed">
      {m > 0 ? `${m}m ` : ''}{s}s elapsed
    </span>
  );
}

/** Icon: Download */
function IconDownload() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 11.5v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.5" />
      <path d="M8 2.5v7M5 7l3 3 3-3" />
    </svg>
  );
}

/** Icon: Print */
function IconPrint() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="10" height="6" rx="1" />
      <path d="M5 7V3h6v4" />
      <path d="M5 11H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2" />
      <circle cx="11.5" cy="9" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Richer empty state with floating icon and helpful guidance. */
function EmptyState() {
  return (
    <div className="card">
      <div className="empty">
        <div className="empty-icon" role="img" aria-label="Radar scanner">
          <Radar />
        </div>
        <div className="empty-title">Ready to scan</div>
        <div className="empty-desc">
          Enter a URL, choose what to test, write your scenario steps,
          then click <strong>Run test</strong>. A real Chromium browser
          will work through every step and screenshot the result.
        </div>
        <p className="hint" style={{ marginTop: 0, textAlign: 'center' }}>
          Try: <code>https://example.com</code>
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [url, setUrl]                   = useState('https://example.com');
  const [instructions, setInstructions] = useState('');
  const [tier, setTier]                 = useState('0');
  const [environment, setEnvironment]   = useState('QA');
  const [strict, setStrict]             = useState(false);
  const [available, setAvailable]       = useState<CategoryDescriptor[]>([]);
  const [selected, setSelected]         = useState<string[]>(DEFAULT_SELECTED);
  const [running, setRunning]           = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [result, setResult]             = useState<RunResponse | null>(null);
  const [error, setError]               = useState<RunResponse | null>(null);
  const [pdfing, setPdfing]             = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const urlTouched = url.trim().length > 0;
  const urlValid   = isValidUrl(url);

  // Route protection: redirect to /login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d: { categories: CategoryDescriptor[] }) => setAvailable(d.categories))
      .catch(() => {
        // Keep UI functional even if categories fail to load
      });
  }, []);

  /** Cmd+Enter / Ctrl+Enter anywhere on the page triggers Run. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, instructions, tier, environment, strict, selected, running, urlValid]);

  function handleLogout() {
    logout().catch((err) => console.error('Logout error:', err));
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  // Show clean loader while authenticating or redirecting
  if (authLoading || !user) {
    return (
      <div
        className="wrap"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '80vh',
          textAlign: 'center',
          gap: '16px',
        }}
      >
        <Radar />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '14px' }}>
          <span className="spinner" />
          <span>Verifying authentication…</span>
        </div>
      </div>
    );
  }

  async function run() {
    if (!urlValid || selected.length === 0 || running) return;

    const controller = new AbortController();
    setAbortController(controller);

    setRunning(true);
    setRunStartedAt(Date.now());
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url,
          instructions,
          environment,
          ownershipTier: Number(tier),
          categories: selected,
          strict,
        }),
        signal: controller.signal,
      });
      let data: RunResponse;
      const text = await response.text();
      try {
        data = JSON.parse(text) as RunResponse;
      } catch {
        data = {
          error: `Server error (${response.status || '500'})`,
          detail: text || response.statusText || 'The server encountered an issue processing the request.',
        } as RunResponse;
      }

      if (!response.ok) setError(data);
      else setResult(data);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError({ error: 'Run canceled by user' } as RunResponse);
      } else {
        setError({ error: e instanceof Error ? e.message : 'Network request failed' } as RunResponse);
      }
    } finally {
      setRunning(false);
      setRunStartedAt(null);
      setAbortController(null);
    }
  }

  function handleCancel() {
    if (abortController) {
      abortController.abort();
    }
  }

  function handleDownloadPdf() {
    if (!result || pdfing) return;
    setPdfing(true);
    printReport(result)
      .catch((e) => console.error('PDF export failed:', e))
      .finally(() => setPdfing(false));
  }

  const tierNumber   = Number(tier);
  const charsLeft    = MAX_INSTRUCTIONS - instructions.length;
  const charClass    = charsLeft < 100 ? 'at-limit' : charsLeft < 300 ? 'near-limit' : '';

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <header className="masthead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
        
        <div style={{ paddingTop: '8px' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600 }}>
                {user.displayName || user.email}
              </span>
              <button onClick={handleLogout} className="secondary" style={{ textDecoration: 'none' }}>
                Log Out
              </button>
            </div>
          ) : (
            <Link href="/login" className="secondary" style={{ textDecoration: 'none' }}>
              Log In
            </Link>
          )}
        </div>
      </header>

      {/* ── Three-column controls ── */}
      <div className="controls-row no-print">

        {/* Card 1: Target */}
        <div className="card">
          <h2>Target</h2>

          <div className="field">
            <label htmlFor="url">Website URL</label>
            <div className="input-wrap">
              <input
                id="url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className={urlTouched ? (urlValid ? 'url-valid' : 'url-invalid') : ''}
                autoComplete="url"
                spellCheck={false}
              />
              {urlTouched && (
                <span className="input-valid-icon" aria-hidden>
                  {urlValid ? '✓' : '✗'}
                </span>
              )}
            </div>
            {urlTouched && !urlValid && (
              <p className="hint" style={{ color: 'var(--fail)', marginTop: 5 }}>
                Enter a valid URL starting with https:// or http://
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="env">Environment</label>
            <select id="env" value={environment} onChange={(e) => setEnvironment(e.target.value)}>
              <option value="LOCAL">LOCAL — Local Development</option>
              <option value="DEV">DEV — Development</option>
              <option value="QA">QA — Quality Assurance</option>
              <option value="UAT">UAT — User Acceptance Testing</option>
              <option value="STAGING">STAGING — Staging / Pre-production</option>
              <option value="PRODUCTION">PRODUCTION — Live Production</option>
            </select>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="tier">Ownership tier</label>
            <select id="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="0">0 — Unverified</option>
              <option value="1">1 — DNS verified</option>
              <option value="2">2 — Verified + attested</option>
            </select>
            <div className="tier-help" aria-live="polite">
              {TIER_HELP[tier]}
            </div>
          </div>
        </div>

        {/* Card 2: What to test */}
        <div className="card">
          <h2>What to test</h2>
          {available.length === 0 && (
            <p className="hint">Loading options…</p>
          )}

          <div className="checklist-scroll">
            <div className="checklist-grid">
              {available.map((category) => {
                const locked  = tierNumber < category.minTier;
                const checked = selected.includes(category.id);

                return (
                  <label
                    key={category.id}
                    htmlFor={`cat-${category.id}`}
                    className={`option ${locked ? 'locked' : ''}`}
                  >
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
                        {category.minTier > 0 && (
                          <em className="tier-badge">tier {category.minTier}+</em>
                        )}
                      </span>
                      <span className="option-desc" id={`cat-desc-${category.id}`}>
                        {category.description}
                      </span>
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
              <input
                id="strict-mode"
                type="checkbox"
                checked={strict}
                onChange={() => setStrict(!strict)}
              />
              <Glyph id="strict" />
              <span>
                <span className="option-title">Strict mode</span>
                <span className="option-desc">
                  Treat every warning as a failure. Heuristic checks — overlap, clipped text,
                  tap targets — produce false positives on real sites, so they only warn by
                  default.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Card 3: Scenario + Run */}
        <div className="card">
          <h2>Scenario</h2>
          <div className="field">
            <label htmlFor="instructions">Steps, in plain English</label>
            <textarea
              id="instructions"
              ref={textareaRef}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
              placeholder={SAMPLE}
            />
            <div className={`char-counter ${charClass}`}>
              {charsLeft} / {MAX_INSTRUCTIONS} chars remaining
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="primary"
              onClick={run}
              disabled={running || selected.length === 0 || !urlValid}
              aria-label="Run test in a real browser"
              style={{ flex: 1 }}
            >
              {running
                ? <><span className="spinner" />Running in a real browser…</>
                : 'Run test'
              }
            </button>
            {running && (
              <button
                className="secondary"
                onClick={handleCancel}
                aria-label="Cancel test run"
              >
                Stop
              </button>
            )}
          </div>

          <p className="run-hint">
            <kbd>⌘</kbd>+<kbd>Enter</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
          </p>

          {selected.length === 0 && (
            <p className="hint" style={{ color: 'var(--warn)' }}>
              Select at least one kind of testing.
            </p>
          )}

          <p className="hint">
            Verbs: <code>go to /path</code> · <code>click X</code> · <code>enter Y into X</code> ·{' '}
            <code>fill X with Y</code> · <code>search for X</code> · <code>verify X</code> ·{' '}
            <code>wait for X</code> · <code>screenshot</code>
          </p>
        </div>
      </div>

      {/* ── Results area ── */}
      <div className="results">
        {/* Error */}
        {error && (
          <div className="card">
            <h2>Run refused</h2>
            <div className="err">
              <strong>{error.error}</strong>
              {error.detail && <div style={{ marginTop: 6 }}>{error.detail}</div>}
              {error.hint   && <div style={{ marginTop: 6 }}>{error.hint}</div>}
            </div>
            {error.issues?.map((issue, i) => (
              <div key={i} className="assert bad">
                <strong>{issue.rule}</strong> — {issue.message}
              </div>
            ))}
            <button
              className="secondary"
              style={{ marginTop: 12 }}
              onClick={run}
              disabled={running || !urlValid}
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!result && !error && !running && <EmptyState />}

        {/* Running */}
        {running && runStartedAt && (
          <div className="card" aria-busy="true">
            <div className="scanning">
              <div className="bars" aria-hidden>
                <i /><i /><i /><i /><i />
              </div>
              <div className="phase" role="status" aria-atomic="true">
                Driving a real browser through your scenario…
              </div>
              <ElapsedTimer startedAt={runStartedAt} />
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <ResultsPanel
            result={result}
            onDownload={handleDownloadPdf}
            pdfing={pdfing}
          />
        )}
      </div>
    </div>
  );
}
