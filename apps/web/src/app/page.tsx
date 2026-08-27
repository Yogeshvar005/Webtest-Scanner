'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Settings, Search } from 'lucide-react';
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

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
      <span className="spinner" style={{ width: 12, height: 12 }} />
      {m > 0 ? `${m}m ` : ''}{s}s elapsed
    </span>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  
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

  function toggleCategory(id: string) {
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
        <div className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  const tierNumber = Number(tier);

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <header className="masthead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Radar />
          <span className="font-serif" style={{ fontSize: 28, fontWeight: 600 }}>Webtest Scanner</span>
        </div>

        <div className="header-actions">
          <button 
            className="theme-toggle" 
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="user-badge">{user?.email}</span>
          <button
            type="button"
            className="secondary"
            onClick={handleLogout}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main Centered Content ── */}
      {!result && !error && (
        <div style={{ maxWidth: 900, margin: '60px auto 0', width: '100%' }}>
          <h1 className="font-serif" style={{ fontSize: 32, textAlign: 'center', marginBottom: 32 }}>
            Good afternoon.
          </h1>

          <div className="input-pill">
            <div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
                placeholder="What shall we inspect today? Add optional natural language instructions..."
                style={{ height: 60, width: '100%', resize: 'none', border: 'none', background: 'transparent', boxShadow: 'none', padding: '0 8px', fontSize: 16 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '4px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ paddingLeft: 42, fontSize: 15, height: 44, border: 'none', background: 'transparent', boxShadow: 'none' }}
                />
              </div>
              <button
                className="pill-action-btn"
                onClick={run}
                disabled={!urlValid || running}
              >
                {running ? 'Inspecting...' : 'Inspect'}
              </button>
            </div>
          </div>
            
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: running && runStartedAt ? 48 : 0, marginTop: 16 }}>
            {running && runStartedAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ElapsedTimer startedAt={runStartedAt} />
                <button className="settings-pill" onClick={handleCancel}>Cancel</button>
              </div>
            )}
          </div>

          <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="settings-pill" style={{ height: 32, padding: '0 12px', width: 'auto' }}>
                <option value="QA">QA Environment</option>
                <option value="Staging">Staging</option>
                <option value="Production">Production</option>
                <option value="Local">Local</option>
              </select>
              <select value={tier} onChange={(e) => setTier(e.target.value)} className="settings-pill" style={{ height: 32, padding: '0 12px', width: 'auto' }}>
                <option value="0">Tier 0 (Unverified)</option>
                <option value="1">Tier 1 (Verified)</option>
                <option value="2">Tier 2 (Attested)</option>
              </select>
            </div>
            
            <div style={{ width: '1px', height: 24, background: 'var(--border)', margin: '4px' }} />
            
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {available.map((cat) => {
                const isSelected = selected.includes(cat.id);
                const isTierRestricted = cat.minTier > tierNumber;
                return (
                  <button 
                    key={cat.id} 
                    className={`settings-pill ${isSelected ? 'active' : ''}`}
                    style={{ 
                      opacity: isTierRestricted ? 0.4 : 1,
                      cursor: isTierRestricted ? 'not-allowed' : 'pointer'
                    }}
                    onClick={() => { if (!isTierRestricted) toggleCategory(cat.id); }}
                    title={cat.description}
                  >
                    {cat.label} {cat.minTier > 0 && `(T${cat.minTier})`}
                  </button>
                );
              })}
            </div>

            <div style={{ width: '1px', height: 24, background: 'var(--border)', margin: '4px' }} />

            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={strict} onChange={() => setStrict(!strict)} style={{ width: 14, height: 14 }} />
                Strict
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: tierNumber < 1 ? 'not-allowed' : 'pointer', opacity: tierNumber < 1 ? 0.5 : 1 }}>
                <input type="checkbox" checked={captureAssets} onChange={() => setCaptureAssets(!captureAssets)} disabled={tierNumber < 1} style={{ width: 14, height: 14 }} />
                Assets
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Results Panel ── */}
      <div style={{ marginTop: 24 }}>
        {error && (
          <div className="card" style={{ borderLeft: '4px solid var(--fail)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fail)', fontWeight: 600 }}>
              ⚠️ Execution Failed
            </div>
            <div style={{ marginTop: 8, fontSize: 14 }}>
              {error.findings?.[0]?.detail || (error as any).detail || (error as any).error || 'The run could not complete. Check URL connectivity.'}
            </div>
            <button className="secondary" onClick={() => setError(null)} style={{ marginTop: 16 }}>Back to Start</button>
          </div>
        )}

        {result && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <button className="secondary" onClick={() => setResult(null)}>
                ← New Inspection
              </button>
            </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
