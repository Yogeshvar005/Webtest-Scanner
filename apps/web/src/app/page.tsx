'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Glyph, Radar, Wordmark } from './glyphs';
import { printReport } from './report';
import { ResultsPanel } from './ResultsPanel';
import { useAuth } from '../lib/auth-context';
import type { CategoryDescriptor, RunResponse } from './types';

const DEFAULT_SELECTED = ['functional', 'ui', 'accessibility', 'security-passive', 'scraper'];
const MAX_INSTRUCTIONS = 2000;

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
  '0': 'Tier 0: Unverified — passive DOM inspection & web scraping (GET/HEAD, screenshots).',
  '1': 'Tier 1: DNS verified — forms, interactive flows, and asset downloading.',
  '2': 'Tier 2: Verified + Attested — active security probes and deep testing.',
};

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent-cyan)' }}>
      <span className="spinner" style={{ width: 12, height: 12 }} />
      {m > 0 ? `${m}m ` : ''}{s}s elapsed
    </span>
  );
}

function EmptyState() {
  return (
    <div className="card reveal reveal-3">
      <div className="empty-hero">
        <div className="empty-radar-wrap">
          <Radar />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Intelligent Inspection Engine
        </h3>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto', fontSize: 13.5, lineHeight: 1.55 }}>
          Enter a website URL above and click <strong>Run Inspection</strong> to extract complete DOM structures, analyze UI/UX design, audit accessibility, and run functional automation with real Chromium execution.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [url, setUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [tier, setTier] = useState('0');
  const [environment, setEnvironment] = useState('QA');
  const [strict, setStrict] = useState(false);
  const [available, setAvailable] = useState<CategoryDescriptor[]>([]);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [running, setRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<RunResponse | null>(null);
  const [pdfing, setPdfing] = useState(false);
  const [captureAssets, setCaptureAssets] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const urlTouched = url.trim().length > 0;
  const urlValid = isValidUrl(url);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d: { categories: CategoryDescriptor[] }) => setAvailable(d.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, instructions, tier, environment, strict, selected, running, urlValid]);

  function handleLogout() {
    logout().catch((err) => console.error('Logout error:', err));
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleCancel() {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setRunning(false);
    setRunStartedAt(null);
  }

  async function run() {
    if (!urlValid || running) return;

    setRunning(true);
    setRunStartedAt(Date.now());
    setResult(null);
    setError(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          instructions,
          environment,
          ownershipTier: Number(tier),
          categories: selected,
          strict,
          captureAssets,
        }),
        signal: controller.signal,
      });

      const data = (await response.json()) as RunResponse;

      if (!response.ok) {
        setError(data);
      } else {
        setResult(data);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Aborted
      } else {
        setError({
          runId: 'err',
          status: 'failed',
          durationMs: 0,
          targetUrl: url,
          strict,
          steps: [],
          categories: [],
          findings: [
            {
              type: 'console_error',
              severity: 'high',
              title: 'Connection error',
              detail: err instanceof Error ? err.message : String(err),
            },
          ],
          policyDecision: { effect: 'deny', code: 'INTERNAL_ERROR', reason: 'Internal error' },
          ownership: { recordedTier: Number(tier), effectiveTier: Number(tier) },
          totals: { total: 0, passed: 0, failed: 1, blocked: 0, skipped: 0 },
          unparsed: [],
          meanConfidence: 0,
        });
      }
    } finally {
      setRunning(false);
      setRunStartedAt(null);
      setAbortController(null);
    }
  }

  if (authLoading) {
    return (
      <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="spinner" style={{ width: 24, height: 24 }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Initializing 3D workspace…</div>
        </div>
      </div>
    );
  }

  const tierNumber = Number(tier);

  return (
    <div className="wrap">
      {/* ── Floating Header ── */}
      <header className="masthead reveal reveal-1">
        <div className="masthead-row">
          <Wordmark />
        </div>

        <div className="header-actions">
          <span className="user-badge">
            <span className="user-dot" />
            <span>{user?.email || 'Authenticated'}</span>
          </span>
          <button
            type="button"
            className="secondary"
            onClick={handleLogout}
            style={{ padding: '6px 12px', fontSize: 12 }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── 3-Column Control Workspace ── */}
      <div className="controls-row">
        {/* Card 1: Target & Guardrails */}
        <div className="card reveal reveal-1">
          <div className="card-title">
            <span>Target &amp; Scope</span>
            <span className="card-title-badge">Tier {tier}</span>
          </div>

          <div className="field">
            <label htmlFor="target-url">Target Website URL</label>
            {/* Integrated Bug-Free URL Bar with solid left badge */}
            <div className="url-bar-3d">
              <div className="url-badge-3d">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>HTTPS</span>
              </div>
              <input
                id="target-url"
                type="text"
                className="url-input-field"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                autoComplete="off"
                spellCheck={false}
              />
              {url && (
                <button
                  type="button"
                  className="url-clear-btn"
                  onClick={() => setUrl('')}
                  title="Clear URL"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ownership-tier">Ownership Verification Tier</label>
            <select
              id="ownership-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              <option value="0">Tier 0 — Unverified (Observation Only)</option>
              <option value="1">Tier 1 — DNS Verified (Full Forms &amp; CRUD)</option>
              <option value="2">Tier 2 — Verified + Attested (Active Probes)</option>
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
              {TIER_HELP[tier]}
            </div>
          </div>

          <div className="field">
            <label htmlFor="env-select">Environment</label>
            <select
              id="env-select"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="QA">QA Environment</option>
              <option value="Staging">Staging Environment</option>
              <option value="Production">Production Environment</option>
              <option value="Local">Local Development</option>
            </select>
          </div>

          <div style={{ paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <label className="ios-switch">
              <input
                type="checkbox"
                checked={captureAssets}
                onChange={() => setCaptureAssets(!captureAssets)}
                disabled={tierNumber < 1}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span style={{ fontSize: 12.5, color: tierNumber < 1 ? 'var(--muted)' : 'var(--text)' }}>
                Download Asset Files <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>(Tier 1+)</span>
              </span>
            </label>
          </div>
        </div>

        {/* Card 2: Test Suite & Scraper Selection */}
        <div className="card reveal reveal-2">
          <div className="card-title">
            <span>Inspection Suite</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {selected.length} of {available.length} active
            </span>
          </div>

          <div className="category-grid">
            {available.map((cat) => {
              const isSelected = selected.includes(cat.id);
              const isTierRestricted = cat.minTier > tierNumber;

              return (
                <div
                  key={cat.id}
                  className={`option-tile ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (!isTierRestricted) toggle(cat.id);
                  }}
                  style={{
                    opacity: isTierRestricted ? 0.45 : 1,
                    cursor: isTierRestricted ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div className="option-glyph">
                    <Glyph id={cat.id} />
                  </div>
                  <div className="option-content">
                    <div className="option-title">
                      <span>{cat.label}</span>
                      {cat.minTier > 0 && (
                        <span className="card-title-badge">Tier {cat.minTier}+</span>
                      )}
                    </div>
                    <div className="option-desc">{cat.description}</div>
                  </div>
                  <div className="option-check">
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <label className="ios-switch">
              <input
                type="checkbox"
                checked={strict}
                onChange={() => setStrict(!strict)}
              />
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span style={{ fontSize: 12.5 }}>
                Strict Mode <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>(Warnings become failures)</span>
              </span>
            </label>
          </div>
        </div>

        {/* Card 3: Scenario & Execution */}
        <div className="card reveal reveal-3" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-title">
            <span>Scenario &amp; Run</span>
            <span className="card-title-badge">Natural Language</span>
          </div>

          <div className="field" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label htmlFor="scenario-input">Steps (Optional Custom Flow)</label>
            <textarea
              id="scenario-input"
              ref={textareaRef}
              className="scenario-textarea"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
              placeholder={`# Leave blank to audit & scrape page, or write steps:\ngo to /\nverify Search is visible\ntake a screenshot`}
              spellCheck={false}
              style={{ flex: 1 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>Leave blank for automated page audit</span>
              <span>{instructions.length} / {MAX_INSTRUCTIONS}</span>
            </div>
          </div>

          <div className="verbs-box">
            <strong>DSL Verbs:</strong> <span className="verb-tag">go to /path</span> <span className="verb-tag">click X</span> <span className="verb-tag">enter Y into X</span> <span className="verb-tag">verify X</span> <span className="verb-tag">screenshot</span>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            {running ? (
              <>
                <button
                  type="button"
                  className="danger"
                  onClick={handleCancel}
                  style={{ flex: 1 }}
                >
                  Cancel Run
                </button>
                {runStartedAt && <ElapsedTimer startedAt={runStartedAt} />}
              </>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={run}
                disabled={!urlValid}
                style={{ flex: 1, padding: '13px 20px', fontSize: 14 }}
              >
                <span>Run Inspection</span>
                <span style={{ fontSize: 11, opacity: 0.85, padding: '2px 6px', background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
                  ⌘ ↵
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results Panel or Ready State ── */}
      <div className="results-container" style={{ marginTop: 24 }}>
        {error && (
          <div className="card reveal reveal-1" style={{ borderLeft: '4px solid var(--fail)', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fail)', fontWeight: 700 }}>
              <span>⚠️ Execution Failed</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13.5, color: 'var(--text)' }}>
              {error.findings?.[0]?.detail || 'The run could not complete. Check URL connectivity.'}
            </div>
          </div>
        )}

        {result ? (
          <ResultsPanel
            result={result}
            onDownload={async () => {
              setPdfing(true);
              try {
                await printReport(result);
              } catch (e) {
                console.error('PDF generation error:', e);
              } finally {
                setPdfing(false);
              }
            }}
            pdfing={pdfing}
          />
        ) : (
          !running && <EmptyState />
        )}
      </div>
    </div>
  );
}
