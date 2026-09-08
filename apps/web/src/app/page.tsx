'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { 
  Sun, Moon, Search, Smartphone, Monitor, Tablet, Laptop, 
  Sparkles, Clock, History, Calendar, Bell, CheckCircle, 
  X, RefreshCw, ArrowRight, ShieldCheck, AlertTriangle,
  Bot, Cpu, Globe, Zap, Loader2
} from 'lucide-react';
import { Glyph, Radar, Wordmark } from './glyphs';
import { printReport } from './report';
import { ResultsPanel } from './ResultsPanel';
import { CopilotDrawer } from './CopilotDrawer';
import { useAuth } from '../lib/auth-context';
import type { CategoryDescriptor, RunResponse, DevicePreset, StoredRun, ScheduleConfig } from './types';
import type { AIProviderConfig, SiteReconData } from '@wts/nlp';

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

const AI_PRESETS = [
  {
    id: 'health',
    label: '⚡ Full Health Scan',
    icon: '⚡',
    instructions: 'go to /\nverify page title is not empty\nassert text present\ntake a screenshot',
  },
  {
    id: 'ecommerce',
    label: '🛒 E-Commerce Flow',
    icon: '🛒',
    instructions: 'go to /\nclick "Pricing" or "Products"\nverify "$0" or "Cart" is visible\ntake a screenshot',
  },
  {
    id: 'auth',
    label: '🔐 Auth Security Check',
    icon: '🔐',
    instructions: 'go to /login\nverify "Password" or "Sign in" is visible\ncheck for security headers\ntake a screenshot',
  },
  {
    id: 'a11y',
    label: '♿ WCAG AA Audit',
    icon: '♿',
    instructions: 'go to /\nverify all headings and buttons are accessible\ntake a screenshot',
  },
  {
    id: 'mobile-nav',
    label: '📱 Mobile Nav & Layout',
    icon: '📱',
    instructions: 'go to /\nclick menu button if present\nverify navigation links are visible\ntake a screenshot',
  },
];

interface RecommendedJourney {
  id: string;
  title: string;
  category: string;
  description: string;
  instructions: string;
  stepCount: number;
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
  const [device, setDevice] = useState<DevicePreset>('desktop');
  const [available, setAvailable] = useState<CategoryDescriptor[]>([]);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [running, setRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<RunResponse | null>(null);
  const [pdfing, setPdfing] = useState(false);
  const [captureAssets, setCaptureAssets] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // PRD v2 Modals
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<StoredRun[]>([]);
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [scheduleFreq, setScheduleFreq] = useState<'hourly' | 'daily' | 'weekly'>('daily');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookTestStatus, setWebhookTestStatus] = useState<string | null>(null);

  // AI Engine & Copilot
  const [aiProvider, setAiProvider] = useState<'local' | 'gemini' | 'auto'>('auto');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [siteRecon, setSiteRecon] = useState<SiteReconData | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [autoGenLoading, setAutoGenLoading] = useState(false);
  const [recommendedJourneys, setRecommendedJourneys] = useState<RecommendedJourney[]>([]);

  const aiConfig: AIProviderConfig = { provider: aiProvider };

  const urlTouched = url.trim().length > 0;
  const urlValid = isValidUrl(url);

  // Load history & schedules from localStorage
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowHistoryModal(false);
        setShowScheduleModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('wts_run_history');
      if (savedHistory) setHistoryRuns(JSON.parse(savedHistory));

      const savedSchedules = localStorage.getItem('wts_schedules');
      if (savedSchedules) setSchedules(JSON.parse(savedSchedules));
    } catch (e) {
      console.warn('Failed to load history or schedules from localStorage', e);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d: { categories: CategoryDescriptor[] }) => setAvailable(d.categories))
      .catch((e) => {
        console.warn('Failed to fetch categories:', e);
      });
  }, []);

  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    runRef.current = run;
  }, [url, instructions, tier, environment, strict, selected, running, urlValid, device, captureAssets, siteRecon]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  function applyPreset(preset: typeof AI_PRESETS[0]) {
    setInstructions(preset.instructions);
    if (preset.id === 'mobile-nav') {
      setDevice('mobile');
    }
  }

  async function runSiteRecon() {
    if (!urlValid || reconLoading) return;
    setReconLoading(true);
    try {
      const res = await fetch('/api/recon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data: SiteReconData = await res.json();
        setSiteRecon(data);
        return data;
      }
    } catch (e) {
      console.error('Recon failed:', e);
    } finally {
      setReconLoading(false);
    }
    return null;
  }

  async function generateAiTestForUrl() {
    if (!urlValid || autoGenLoading) return;
    setAutoGenLoading(true);
    try {
      // Step 1: Run reconnaissance on the target site
      let recon = siteRecon;
      if (!recon) {
        recon = await runSiteRecon() ?? null;
      }

      if (!recon) {
        // Fallback to basic heuristic
        setInstructions(`go to /\nverify page title is not empty\nassert text present\ntake a screenshot`);
        return;
      }

      // Step 2: Generate site-specific test suites via AI
      const res = await fetch('/api/generate-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recon, aiConfig }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawSuites = data.suites || [];
        const parsedJourneys: RecommendedJourney[] = rawSuites.map((suite: any, index: number) => {
          const steps: string[] = [];
          for (const step of (suite.steps || [])) {
            if (step.action?.type === 'navigate') {
              steps.push(`go to ${step.action.path || '/'}`);
            } else if (step.action?.type === 'click') {
              steps.push(`click "${step.action.targetName || 'button'}"`);
            } else if (step.action?.type === 'fill') {
              steps.push(`fill "${step.action.targetName || 'input'}" with "${step.action.value || 'test'}"`);
            } else if (step.action?.type === 'explore') {
              steps.push('explore the site');
            } else if (step.action?.type === 'screenshot') {
              steps.push('take a screenshot');
            } else if (step.action?.type === 'waitFor') {
              steps.push('wait for page to load');
            } else {
              steps.push(step.intent || 'take a screenshot');
            }
          }
          return {
            id: suite.id || `journey-${index}`,
            title: suite.title || `Journey ${index + 1}`,
            category: suite.category || 'General',
            description: suite.description || '',
            instructions: steps.join('\n'),
            stepCount: steps.length,
          };
        });

        setRecommendedJourneys(parsedJourneys);

        if (parsedJourneys.length > 0) {
          setInstructions(parsedJourneys[0].instructions);
        } else {
          setInstructions(`go to /\nverify page title is not empty\nassert text present\ntake a screenshot`);
        }
      } else {
        setInstructions(`go to /\nverify main content is visible\ntake a screenshot`);
      }
    } catch (e) {
      console.error('Auto-generate failed:', e);
      setInstructions(`go to /\nverify main content is visible\ntake a screenshot`);
    } finally {
      setAutoGenLoading(false);
    }
  }

  function saveRunToHistory(runResult: RunResponse) {
    try {
      const firstScreenshot = runResult.steps?.find((s) => s.screenshot)?.screenshot;
      const newStoredRun: StoredRun = {
        id: Math.random().toString(36).substring(2, 9),
        runId: runResult.runId,
        targetUrl: runResult.targetUrl,
        timestamp: Date.now(),
        status: runResult.status,
        durationMs: runResult.durationMs,
        device,
        totals: runResult.totals,
        instructions,
        screenshot: firstScreenshot,
      };

      let updated = [newStoredRun, ...historyRuns].slice(0, 20);
      setHistoryRuns(updated);

      try {
        localStorage.setItem('wts_run_history', JSON.stringify(updated));
      } catch (err: any) {
        if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          const updatedNoScreen = updated.map(r => ({ ...r, screenshot: undefined }));
          localStorage.setItem('wts_run_history', JSON.stringify(updatedNoScreen));
        } else {
          throw err;
        }
      }

      // Also update baseline screenshot for visual regression
      if (firstScreenshot) {
        const baselineKey = `wts_baseline_${encodeURIComponent(runResult.targetUrl)}`;
        try {
          localStorage.setItem(baselineKey, JSON.stringify({
            targetUrl: runResult.targetUrl,
            screenshotUrl: firstScreenshot,
            capturedAt: Date.now(),
            device,
          }));
        } catch (err: any) {
          console.warn('Could not save baseline due to quota limits');
        }
      }
    } catch (e) {
      console.error('Failed to save run history:', e);
    }
  }

  function handleSaveSchedule() {
    if (!url.trim()) return;
    alert('Disclaimer: Scheduled Monitoring is UI-only and has no server-side execution engine implemented yet.');

    const newSchedule: ScheduleConfig = {
      id: Math.random().toString(36).substring(2, 9),
      targetUrl: url,
      instructions: instructions || 'go to /\nverify page is loaded\ntake a screenshot',
      frequency: scheduleFreq,
      device,
      active: true,
      webhookUrl: webhookUrl.trim() || undefined,
      lastRun: Date.now(),
      nextRun: Date.now() + (scheduleFreq === 'hourly' ? 3600000 : scheduleFreq === 'daily' ? 86400000 : 604800000),
    };

    const updated = [newSchedule, ...schedules];
    setSchedules(updated);
    localStorage.setItem('wts_schedules', JSON.stringify(updated));
    setShowScheduleModal(false);
  }

  function toggleSchedule(id: string) {
    const updated = schedules.map((s) => s.id === id ? { ...s, active: !s.active } : s);
    setSchedules(updated);
    localStorage.setItem('wts_schedules', JSON.stringify(updated));
  }

  function deleteSchedule(id: string) {
    const updated = schedules.filter((s) => s.id !== id);
    setSchedules(updated);
    localStorage.setItem('wts_schedules', JSON.stringify(updated));
  }

  function simulateWebhookTest() {
    alert('Disclaimer: This is a UI simulation. No actual HTTP request is being sent.');
    setWebhookTestStatus('sending');
    setTimeout(() => {
      setWebhookTestStatus('success');
      setTimeout(() => setWebhookTestStatus(null), 4000);
    }, 1200);
  }

  function loadFromHistory(runItem: StoredRun) {
    setUrl(runItem.targetUrl);
    if (runItem.instructions) setInstructions(runItem.instructions);
    if (runItem.device) setDevice(runItem.device);
    setShowHistoryModal(false);
  }

  async function run(overrideInstructions?: unknown) {
    if (!urlValid || running) return;

    const isCustomStr = typeof overrideInstructions === 'string';
    const effectiveInstructions = isCustomStr ? overrideInstructions : instructions;
    if (isCustomStr) {
      setInstructions(overrideInstructions);
    }

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
          instructions: effectiveInstructions,
          environment,
          ownershipTier: Number(tier),
          categories: selected,
          strict,
          captureAssets,
          device,
          siteContext: siteRecon || undefined,
        }),
        signal: controller.signal,
      });

      const data = (await response.json()) as RunResponse;

      if (!response.ok) {
        setError(data);
      } else {
        setResult(data);
        saveRunToHistory(data);
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
          <Wordmark />
          <span className="pill-badge" style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: 6, 
            background: 'var(--bg-surface)', 
            color: 'var(--text)', 
            fontSize: 11, 
            fontWeight: 700, 
            padding: '4px 10px', 
            borderRadius: 999, 
            fontVariantNumeric: 'tabular-nums', 
            transform: 'translateY(-2px)',
            boxShadow: 'var(--shadow-sm), 0 0 0 1px var(--border)',
            letterSpacing: '0.04em'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }}></span>
            V2.0
          </span>
        </div>

        <div className="header-actions">
          {/* Schedule Monitor Button */}
          <button
            className="secondary"
            onClick={() => setShowScheduleModal(true)}
            title="Scheduled Synthetic Monitoring"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px' }}
          >
            <Calendar size={15} />
            Schedules {schedules.length > 0 && `(${schedules.filter(s => s.active).length})`}
          </button>

          {/* History Drawer Button */}
          <button
            className="secondary"
            onClick={() => setShowHistoryModal(true)}
            title="Recent Scan History"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px' }}
          >
            <History size={15} />
            History {historyRuns.length > 0 && `(${historyRuns.length})`}
          </button>

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
        <div style={{ maxWidth: 900, margin: '50px auto 0', width: '100%' }}>
          <h1 className="font-serif" style={{ fontSize: 32, textAlign: 'center', marginBottom: 28 }}>
            Intelligent Browser Audits in Plain English.
          </h1>

          <div className="input-pill">
            <div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
                placeholder="What shall we test today? Write plain English steps or pick an AI preset below..."
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
                  placeholder="Enter website URL..."
                  autoComplete="off"
                  spellCheck={false}
                  style={{ paddingLeft: 42, fontSize: 15, height: 44, border: 'none', background: 'transparent', boxShadow: 'none' }}
                />
              </div>
              <button
                className="pill-action-btn"
                onClick={() => run()}
                disabled={!urlValid || running}
              >
                {running ? 'Inspecting...' : 'Inspect'}
              </button>
            </div>
          </div>

          {/* ── AI Smart Presets & Test Suggestions ── */}
          <div className="ai-presets-container">
            <span className="ai-presets-label">
              <Sparkles size={14} /> AI Presets:
            </span>
            {AI_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className="ai-preset-chip"
                onClick={() => applyPreset(preset)}
                title={`Load "${preset.label}" template`}
              >
                <span>{preset.icon}</span> {preset.label}
              </button>
            ))}
            <button
              className="ai-preset-chip"
              onClick={generateAiTestForUrl}
              disabled={!urlValid || autoGenLoading}
              style={{
                background: 'linear-gradient(135deg, rgba(217,119,87,0.15), rgba(59,130,246,0.12))',
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
                opacity: (!urlValid || autoGenLoading) ? 0.5 : 1,
                cursor: (!urlValid || autoGenLoading) ? 'not-allowed' : 'pointer',
              }}
              title="AI scans the real website structure and auto-generates precise test scenarios"
            >
              {autoGenLoading ? (
                <><Loader2 size={12} className="spinner" /> Analyzing Site...</>
              ) : (
                <><Zap size={12} /> ✨ Auto-Generate Site Tests</>
              )}
            </button>
          </div>

          {/* ── Autonomous User Journeys (KaneAI Engine) ── */}
          {recommendedJourneys.length > 0 && (
            <div style={{
              marginTop: 16,
              padding: '16px 18px',
              background: 'var(--bg-card)',
              borderRadius: 12,
              border: '1px solid rgba(59,130,246,0.25)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                    <Sparkles size={14} /> Autonomous User Journeys (KaneAI Engine)
                  </span>
                  <span className="pill info" style={{ fontSize: 10, padding: '2px 8px' }}>
                    {recommendedJourneys.length} Auto-Discovered Flows
                  </span>
                </div>
                <button
                  type="button"
                  className="settings-pill"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => setRecommendedJourneys([])}
                >
                  Dismiss
                </button>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
              }}>
                {recommendedJourneys.map((journey) => (
                  <div
                    key={journey.id}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--bg-hover)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {journey.title}
                        </span>
                        <span className="pill verdict" style={{ fontSize: 10, padding: '2px 6px', textTransform: 'uppercase' }}>
                          {journey.category}
                        </span>
                      </div>
                      {journey.description && (
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                          {journey.description}
                        </p>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>⚡ {journey.stepCount} steps</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        className="primary"
                        style={{ flex: 1, padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        onClick={() => run(journey.instructions)}
                        disabled={running}
                      >
                        <Zap size={12} /> ⚡ Run Journey
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setInstructions(journey.instructions)}
                        title="Load steps into editor"
                      >
                        📝 Load
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
            
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: running && runStartedAt ? 48 : 0, marginTop: 16 }}>
            {running && runStartedAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ElapsedTimer startedAt={runStartedAt} />
                <button className="settings-pill" onClick={handleCancel}>Cancel</button>
              </div>
            )}
          </div>

          {/* ── Configuration Bar with Device Emulation & AI Engine ── */}
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {/* AI Engine Selector */}
            <div style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              background: 'var(--bg-hover)',
              borderRadius: 10,
              padding: '3px 4px',
              border: '1px solid var(--border)',
            }}>
              <button
                className={`settings-pill ${aiProvider === 'auto' ? 'active' : ''}`}
                onClick={() => setAiProvider('auto')}
                style={{
                  height: 28,
                  padding: '0 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: aiProvider === 'auto' ? 'var(--accent)' : 'transparent',
                  color: aiProvider === 'auto' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 8,
                }}
                title="Automatically pick best available model (Local first, Cloud fallback)"
              >
                <Zap size={11} /> Auto
              </button>
              <button
                className={`settings-pill ${aiProvider === 'local' ? 'active' : ''}`}
                onClick={() => setAiProvider('local')}
                style={{
                  height: 28,
                  padding: '0 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: aiProvider === 'local' ? '#2E7D32' : 'transparent',
                  color: aiProvider === 'local' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 8,
                }}
                title="Use local Ollama model (Llama 3.2 / Qwen 2.5) — zero latency, private"
              >
                <Cpu size={11} /> Local LLM
              </button>
              <button
                className={`settings-pill ${aiProvider === 'gemini' ? 'active' : ''}`}
                onClick={() => setAiProvider('gemini')}
                style={{
                  height: 28,
                  padding: '0 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: aiProvider === 'gemini' ? '#F57F17' : 'transparent',
                  color: aiProvider === 'gemini' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 8,
                }}
                title="Use Google Gemini cloud model"
              >
                <Globe size={11} /> Gemini
              </button>
            </div>

            <div style={{ width: '1px', height: 24, background: 'var(--border)', margin: '4px' }} />

            {/* Device Profile Selector */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select 
                value={device} 
                onChange={(e) => setDevice(e.target.value as DevicePreset)} 
                className="settings-pill" 
                style={{ height: 32, padding: '0 10px', width: 'auto', fontWeight: 500 }}
                title="Emulated Device & Viewport"
              >
                <option value="desktop">🖥️ Desktop (1280×800)</option>
                <option value="laptop">💻 Laptop (1440×900)</option>
                <option value="mobile">📱 iPhone 14 (390×844)</option>
                <option value="tablet">📲 iPad (820×1180)</option>
              </select>

              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="settings-pill" style={{ height: 32, padding: '0 12px', width: 'auto' }}>
                <option value="QA">QA Environment</option>
                <option value="STAGING">Staging</option>
                <option value="PRODUCTION">Production</option>
                <option value="LOCAL">Local</option>
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
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="secondary" onClick={() => setResult(null)}>
                ← New Inspection
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="results-sub-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {device === 'mobile' ? <Smartphone size={14} /> : device === 'tablet' ? <Tablet size={14} /> : device === 'laptop' ? <Laptop size={14} /> : <Monitor size={14} />}
                  Emulated: {device.toUpperCase()}
                </span>
              </div>
            </div>

            <ResultsPanel
              result={result}
              device={device}
              onApplyFix={(fix) => {
                setInstructions((prev) => (prev ? `${fix}\n${prev}` : fix));
                setResult(null);
              }}
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

      {/* ── PRD v2: History & Trends Modal ── */}
      {showHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <History size={20} color="var(--accent)" />
                Audit History & Trends
              </div>
              <button className="theme-toggle" onClick={() => setShowHistoryModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {historyRuns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <p style={{ fontSize: 15 }}>No past scans recorded yet.</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>Completed scans on this browser will be tracked here for trend analysis and visual diff baselines.</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Showing last {historyRuns.length} scans</span>
                    <button 
                      className="secondary" 
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => {
                        setHistoryRuns([]);
                        localStorage.removeItem('wts_run_history');
                      }}
                    >
                      Clear History
                    </button>
                  </div>

                  {historyRuns.map((item) => (
                    <div key={item.id} className="history-card">
                      <div>
                        <div className="history-url">{item.targetUrl}</div>
                        <div className="history-meta">
                          <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                          <span>•</span>
                          <span style={{ textTransform: 'capitalize' }}>📱 {item.device || 'desktop'}</span>
                          <span>•</span>
                          <span>⏱️ {(item.durationMs / 1000).toFixed(1)}s</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className={`badge ${item.status === 'passed' ? 'passed' : 'failed'}`} style={{ textTransform: 'uppercase', fontSize: 11 }}>
                          {item.status}
                        </span>
                        <button
                          className="secondary"
                          style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => loadFromHistory(item)}
                        >
                          Load <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRD v2: Scheduled Monitoring Modal ── */}
      {showScheduleModal && (
        <div className="modal-backdrop" onClick={() => setShowScheduleModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Calendar size={20} color="var(--accent)" />
                Synthetic Scheduled Monitoring
              </div>
              <button className="theme-toggle" onClick={() => setShowScheduleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Create New Scheduled Scan</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Target Website</label>
                    <input 
                      type="text" 
                      value={url} 
                      onChange={(e) => setUrl(e.target.value)} 
                      placeholder="Enter website URL..." 
                      style={{ width: '100%', fontSize: 14 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Frequency</label>
                      <select 
                        value={scheduleFreq} 
                        onChange={(e) => setScheduleFreq(e.target.value as any)} 
                        style={{ width: '100%', fontSize: 14, height: 38 }}
                      >
                        <option value="hourly">Every Hour</option>
                        <option value="daily">Daily at 08:00 AM</option>
                        <option value="weekly">Weekly (Monday)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Device Profile</label>
                      <select 
                        value={device} 
                        onChange={(e) => setDevice(e.target.value as DevicePreset)} 
                        style={{ width: '100%', fontSize: 14, height: 38 }}
                      >
                        <option value="desktop">Desktop</option>
                        <option value="laptop">Laptop</option>
                        <option value="mobile">Mobile (iPhone 14)</option>
                        <option value="tablet">Tablet (iPad)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Webhook Alert URL (Slack, Discord, or Custom API)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input 
                        type="url" 
                        value={webhookUrl} 
                        onChange={(e) => setWebhookUrl(e.target.value)} 
                        placeholder="https://hooks.slack.com/services/..." 
                        style={{ flex: 1, fontSize: 14 }}
                      />
                      <button 
                        type="button"
                        className="secondary" 
                        onClick={simulateWebhookTest} 
                        disabled={webhookTestStatus === 'sending'}
                        style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                      >
                        {webhookTestStatus === 'sending' ? 'Testing...' : webhookTestStatus === 'success' ? '✅ Sent!' : 'Test Alert'}
                      </button>
                    </div>
                  </div>

                  <button 
                    type="button" 
                    className="pill-action-btn" 
                    onClick={handleSaveSchedule} 
                    disabled={!url.trim()}
                    style={{ marginTop: 8, height: 40 }}
                  >
                    + Add Schedule
                  </button>
                </div>
              </div>

              {/* Active Schedules List */}
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Active Monitored Targets ({schedules.length})</h4>
                {schedules.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No automated schedules configured yet.</p>
                ) : (
                  schedules.map((s) => (
                    <div key={s.id} className="history-card">
                      <div>
                        <div className="history-url">{s.targetUrl}</div>
                        <div className="history-meta">
                          <span style={{ textTransform: 'capitalize' }}>⏰ {s.frequency}</span>
                          <span>•</span>
                          <span style={{ textTransform: 'capitalize' }}>📱 {s.device}</span>
                          {s.webhookUrl && <span>• 🔔 Webhook</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button 
                          className="settings-pill" 
                          onClick={() => toggleSchedule(s.id)}
                          style={{ 
                            background: s.active ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-hover)', 
                            color: s.active ? 'var(--pass)' : 'var(--text-secondary)' 
                          }}
                        >
                          {s.active ? 'Active' : 'Paused'}
                        </button>
                        <button 
                          className="secondary" 
                          onClick={() => deleteSchedule(s.id)} 
                          style={{ color: 'var(--fail)', padding: '4px 8px', fontSize: 12 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="secondary" onClick={() => setShowScheduleModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Copilot FAB ── */}
      {!copilotOpen && (
        <button
          onClick={() => {
            setCopilotOpen(true);
            // Auto-run recon if we have a URL and no recon yet
            if (urlValid && !siteRecon && !reconLoading) {
              runSiteRecon();
            }
          }}
          style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #D97757, #E58E73)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(217, 119, 87, 0.4)',
            zIndex: 9998,
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 8px 28px rgba(217, 119, 87, 0.55)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(217, 119, 87, 0.4)';
          }}
          title="Open AI QA Copilot"
        >
          <Bot size={26} />
        </button>
      )}

      {/* ── Copilot Drawer ── */}
      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        siteRecon={siteRecon}
        targetUrl={url}
        aiConfig={aiConfig}
        onRunSteps={(generatedInstructions) => {
          setInstructions(generatedInstructions);
          setCopilotOpen(false);
          // Auto-run if URL is valid
          if (urlValid) {
            setTimeout(() => run(), 300);
          }
        }}
        onInsertSteps={(generatedInstructions) => {
          setInstructions((prev) => prev ? `${prev.trim()}\n\n${generatedInstructions}` : generatedInstructions);
          setCopilotOpen(false);
        }}
      />
    </div>
  );
}
