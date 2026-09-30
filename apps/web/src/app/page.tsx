'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Sun, Moon, Search, Smartphone, Monitor, Tablet, Laptop, 
  Sparkles, Clock, History, Calendar, Bell, CheckCircle, 
  X, RefreshCw, ArrowRight, ShieldCheck, AlertTriangle,
  Bot, Cpu, Globe, Zap, Loader2, Lock, Check
} from 'lucide-react';
import { Glyph, Radar, Wordmark } from './glyphs';
import { printReport } from './report';
import { ResultsPanel } from './ResultsPanel';
import { CopilotDrawer } from './CopilotDrawer';
import { useAuth } from '../lib/auth-context';
import type { CategoryDescriptor, RunResponse, DevicePreset, StoredRun, ScheduleConfig, StepResult } from './types';
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
    id: 'demo-errors',
    label: 'Console Errors Demo',
    icon: '🚨',
    targetUrl: 'http://localhost:3000/api/demo-errors',
    instructions: 'go to http://localhost:3000/api/demo-errors\ntake a screenshot\nclick "Checkout Button"\ntake a screenshot\nclick "Search Button"\ntake a screenshot',
  },
  {
    id: 'health',
    label: 'Full Health Scan',
    icon: '⚡',
    instructions: 'go to /\nverify page title is not empty\nassert text present\ntake a screenshot',
  },
  {
    id: 'ecommerce',
    label: 'E-Commerce Flow',
    icon: '🛒',
    instructions: 'go to /\nclick "Pricing" or "Products"\nverify "$0" or "Cart" is visible\ntake a screenshot',
  },
  {
    id: 'auth',
    label: 'Auth Security Check',
    icon: '🔐',
    instructions: 'go to /login\nverify "Password" or "Sign in" is visible\ncheck for security headers\ntake a screenshot',
  },
  {
    id: 'a11y',
    label: 'WCAG AA Audit',
    icon: '♿',
    instructions: 'go to /\nverify all headings and buttons are accessible\ntake a screenshot',
  },
  {
    id: 'mobile-nav',
    label: 'Mobile Nav & Layout',
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
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const [url, setUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [tier, setTier] = useState('0');
  const [environment, setEnvironment] = useState('QA');
  const [strict, setStrict] = useState(false);
  const [device, setDevice] = useState<DevicePreset>('desktop');
  const [browserType, setBrowserType] = useState<'chromium' | 'webkit'>('chromium');
  const [available, setAvailable] = useState<CategoryDescriptor[]>([]);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [running, setRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<RunResponse | null>(null);
  const [liveSteps, setLiveSteps] = useState<StepResult[]>([]);
  const [pdfing, setPdfing] = useState(false);
  const [captureAssets, setCaptureAssets] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeLeftTab, setActiveLeftTab] = useState<'config' | 'results'>('config');

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2600);
  }

  // Live execution sandbox is displayed ONLY when a prompt is given / execution is active
  const isExecutionActive = Boolean(running || runStartedAt || error);
  const showResultsFullWidth = Boolean(!running && result);

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
  const [terminalLogs, setTerminalLogs] = useState<Array<{ type: string; level: string; message: string; timestamp: string }>>([]);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'visual' | 'terminal'>('visual');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previewTab === 'terminal' && terminalEndRef.current) {
      terminalEndRef.current.scrollTop = terminalEndRef.current.scrollHeight;
    }
  }, [terminalLogs, previewTab]);

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

  // Auto-enable guest mode locally if no credentials yet, or load local admin session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedAdmin = localStorage.getItem('wts_admin_user');
        if (savedAdmin) {
          setIsAdmin(true);
        } else if (!localStorage.getItem('wts_guest') && !user && !authLoading) {
          localStorage.setItem('wts_guest', 'true');
        }
      } catch {}
    }
  }, [user, authLoading]);

  // Admin & User Presence Heartbeat
  useEffect(() => {
    let localAdmin: { uid: string; email: string; displayName?: string } | null = null;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wts_admin_user');
        if (saved) localAdmin = JSON.parse(saved);
      } catch {}
    }

    const isGuest = typeof window !== 'undefined' && localStorage.getItem('wts_guest') === 'true';
    const effectiveUid = user?.uid || localAdmin?.uid || (isGuest ? 'guest_user' : null);
    const effectiveEmail = user?.email || localAdmin?.email || (isGuest ? 'guest@webtest.local' : null);
    const effectiveName = user?.displayName || localAdmin?.displayName || (isGuest ? 'Guest Tester' : undefined);

    if (!effectiveUid || !effectiveEmail) return;

    const pingHeartbeat = async () => {
      try {
        const res = await fetch('/api/admin/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: effectiveUid,
            email: effectiveEmail,
            displayName: effectiveName,
            currentAction: running ? `Running scan: ${url}` : 'Idle on home dashboard',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.valid === false) {
            alert('Your session has been terminated by an administrator.');
            if (typeof window !== 'undefined') {
              localStorage.removeItem('wts_admin_user');
              localStorage.removeItem('wts_guest');
            }
            logout();
            return;
          }
          if (data.role === 'platform_admin') {
            setIsAdmin(true);
          }
        }
      } catch {
        // silent fail on network hiccups
      }
    };

    pingHeartbeat();
    const interval = setInterval(pingHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [user, running, url, logout]);

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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wts_admin_user');
      localStorage.removeItem('wts_guest');
    }
    setIsAdmin(false);
    logout().catch((err) => console.error('Logout error:', err));
    router.push('/login');
  }

  function toggleCategory(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function resetToOriginal() {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setResult(null);
    setError(null);
    setRunning(false);
    setRunStartedAt(null);
    setLiveSteps([]);
    setTerminalLogs([]);
    setLiveFrame(null);
    setUrl('');
    setInstructions('');
    setActiveLeftTab('config');
  }

  function handleCancel() {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setRunning(false);
    setError({ error: 'Inspection Canceled', detail: 'The browser execution was canceled by the user.' } as any);
  }

  function applyPreset(preset: typeof AI_PRESETS[0]) {
    setInstructions(preset.instructions);
    if (preset.id === 'mobile-nav') {
      setDevice('mobile');
    }
    if ((preset as any).targetUrl) {
      setUrl((preset as any).targetUrl);
    }
    setPreviewTab('visual');
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
    if (!url.trim()) {
      alert('Please enter a Target Website URL first.');
      return;
    }
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
    setLiveSteps([]);
    setTerminalLogs([]);
    setLiveFrame(null);
    setPreviewTab('visual');

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
          browserType,
          aiConfig: { provider: aiProvider },
          siteContext: siteRecon || undefined,
          user: user
            ? { uid: user.uid, email: user.email, displayName: user.displayName }
            : typeof window !== 'undefined' && localStorage.getItem('wts_guest') === 'true'
            ? { uid: 'guest_user', email: 'guest@webtest.local', displayName: 'Guest Tester' }
            : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errData;
        try {
          errData = await response.json();
        } catch {
          throw new Error('Connection error');
        }
        setError(errData as RunResponse);
        return;
      }

      if (!response.body) throw new Error('ReadableStream not supported in this browser.');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let receivedDone = false;
      let receivedError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'ping') {
              // Heartbeat keep-alive; ignore
              continue;
            } else if (event.type === 'log') {
              setTerminalLogs((prev) => [...prev, event.data]);
            } else if (event.type === 'step') {
              setLiveSteps((prev) => [...prev, event.data]);
            } else if (event.type === 'frame') {
              setLiveFrame(event.data);
            } else if (event.type === 'done') {
              receivedDone = true;
              const fullResult = event.data as RunResponse;
              setResult(fullResult);
              saveRunToHistory(fullResult);
              setActiveLeftTab('results');
              if (fullResult.steps && fullResult.steps.length > 0) {
                setLiveSteps(fullResult.steps);
              }
            } else if (event.type === 'error') {
              receivedError = true;
              const runError = event as unknown as RunResponse;
              setError(runError);
              saveRunToHistory({
                runId: `err-${Date.now()}`,
                targetUrl: url,
                status: 'failed',
                durationMs: 0,
                strict,
                steps: [], findings: [], categories: [],
                totals: { total: 0, passed: 0, failed: 1, blocked: 0, skipped: 0 },
                policyDecision: { effect: 'deny', code: 'INTERNAL_ERROR', reason: 'Internal error' },
                unparsed: [], meanConfidence: 0,
                ownership: { recordedTier: Number(tier), effectiveTier: Number(tier) },
                error: runError.error || 'Unknown stream error'
              });
            }
          } catch (e) {
            console.warn('Failed to parse NDJSON line:', line, e);
          }
        }
      }

      // If the stream ended without an explicit done or error event (e.g. serverless timeout or proxy cut),
      // synthesize a graceful result from liveSteps so the user is never stuck on a spinning screen.
      if (!receivedDone && !receivedError) {
        setLiveSteps((currentSteps) => {
          if (currentSteps.length > 0) {
            const allPassed = currentSteps.every((s) => s.status === 'passed');
            const synthesized: RunResponse = {
              runId: `run-${Date.now().toString(36)}`,
              targetUrl: url,
              status: allPassed ? 'passed' : 'failed',
              durationMs: Date.now() - (runStartedAt || Date.now()),
              strict,
              steps: currentSteps,
              findings: [],
              categories: [],
              totals: {
                total: currentSteps.length,
                passed: currentSteps.filter((s) => s.status === 'passed').length,
                failed: currentSteps.filter((s) => s.status === 'failed').length,
                blocked: currentSteps.filter((s) => s.status === 'blocked').length,
                skipped: currentSteps.filter((s) => s.status === 'skipped').length,
              },
              policyDecision: { effect: 'allow', code: 'STREAM_COMPLETED', reason: 'Stream ended' },
              unparsed: [],
              meanConfidence: 1,
              ownership: { recordedTier: Number(tier), effectiveTier: Number(tier) },
            };
            setResult(synthesized);
            saveRunToHistory(synthesized);
            setActiveLeftTab('results');
          }
          return currentSteps;
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Aborted
      } else {
        const errResult = {
          runId: 'err-' + Date.now(),
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
        };
        setError(errResult);
        saveRunToHistory(errResult);
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
    <div className="min-h-screen font-sans selection:bg-brand-500/30 selection:text-amber-200 relative pb-20 theme-transition">
      {/* Ambient Glowing Orbs Background */}
      <div aria-hidden="true" className="ambient-gradient-mesh">
        <div className="gradient-orb-1"></div>
        <div className="gradient-orb-2"></div>
        <div className="gradient-orb-3"></div>
      </div>

      {/* ── Navigation Header ── */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#120e0c]/80 backdrop-blur-xl transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div 
              className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 via-neutral-900 to-sky-500/20 border border-white/15 shadow-inner group cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200"
              onClick={resetToOriginal}
            >
              <div className="absolute inset-0 rounded-xl bg-amber-500/15 blur-sm group-hover:bg-amber-500/30 transition-all"></div>
              <span className="material-symbols-outlined text-amber-400 relative z-10 text-[22px] group-hover:rotate-12 transition-transform duration-300">terminal</span>
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
              </span>
            </div>
            
            <div className="flex items-center space-x-3 sm:space-x-4 cursor-pointer" onClick={resetToOriginal}>
              <div className="flex items-baseline space-x-1.5">
                <span className="font-bold tracking-tight text-lg text-white font-sans">Webtest</span>
                <span className="font-bold tracking-tight text-lg font-sans select-none flowing-gradient-scanner">Scanner</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/30 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>v2.0
              </span>
            </div>
            
            <div className="hidden md:flex items-center pl-3.5 border-l border-white/10 text-xs font-medium">
              <button className="group hover:text-neutral-200 transition-all cursor-pointer flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/15 active:scale-95" type="button">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] group-hover:animate-ping"></span>
                <span className="font-mono text-neutral-300 text-[11px] font-medium tracking-tight">production-workspace</span>
                <span className="material-symbols-outlined text-neutral-400 group-hover:text-neutral-200 text-sm group-hover:translate-y-0.5 transition-transform">expand_more</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <Link href="/admin" className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300/90 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/60 transition-all duration-300 shadow-sm animate-amber-breathe hover:scale-105 active:scale-95 group">
              <span className="material-symbols-outlined text-amber-400 text-sm group-hover:scale-110 group-hover:rotate-12 transition-transform duration-200">verified_user</span>
              <span>Admin Console</span>
            </Link>
            
            <button type="button" onClick={() => setShowScheduleModal(true)} className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group">
              <span className="material-symbols-outlined text-neutral-400 group-hover:text-amber-300 text-sm group-hover:rotate-6 transition-transform duration-200">calendar_month</span>
              <span>Schedules</span>
            </button>
            
            <button type="button" onClick={() => setShowHistoryModal(true)} className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group">
              <span className="material-symbols-outlined text-neutral-400 group-hover:text-sky-400 text-sm group-hover:-rotate-45 transition-transform duration-300">history</span>
              <span>History</span>
              {historyRuns.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800/90 text-neutral-300 font-mono border border-white/10 group-hover:border-sky-400/40 group-hover:bg-neutral-800 group-hover:text-sky-300 transition-colors animate-badge-float">
                  {historyRuns.length}
                </span>
              )}
            </button>
            
            <div className="flex items-center space-x-2 pl-2 border-l border-white/10">
              <div className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/25 hover:bg-white/[0.07] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group">
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-sky-600 flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm group-hover:ring-2 group-hover:ring-amber-400/50 transition-all">
                  {(user?.email?.[0] || 'Y').toUpperCase()}
                </div>
                <span className="hidden lg:inline-block text-xs text-neutral-300 font-mono tracking-tight max-w-[135px] truncate group-hover:text-white transition-colors">
                  {user?.email || (typeof window !== 'undefined' && localStorage.getItem('wts_admin_user') ? JSON.parse(localStorage.getItem('wts_admin_user') || '{}').email : 'guest@webtest.dev')}
                </span>
              </div>
              <button onClick={handleLogout} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06] hover:scale-105 active:scale-95 transition-all" type="button">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      <div className={`fixed top-20 right-6 z-50 transform transition-all duration-300 pointer-events-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1c1715] border border-amber-500/30 shadow-2xl text-xs font-mono text-neutral-200 ${showToast ? 'translate-y-0 opacity-100' : 'translate-y-[-150%] opacity-0'}`}>
        <span className="material-symbols-outlined text-amber-400 text-base">info</span>
        <span>{toastMessage}</span>
      </div>

      <main className={isExecutionActive ? 'max-w-[1600px] mx-auto px-4 pt-6 pb-20 w-full grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10' : 'max-w-5xl mx-auto px-4 sm:px-6 pt-12 md:pt-16 pb-20 relative z-10'}>
        <div className={isExecutionActive ? 'w-full flex flex-col gap-4' : 'w-full'}>
            {result && (
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-2">
                <div className="flex p-1 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setActiveLeftTab('config')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeLeftTab === 'config' ? 'bg-white/10 text-foreground shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'}`}
                  >
                    <span className="material-symbols-outlined text-sm">tune</span> Edit Scan Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLeftTab('results')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeLeftTab === 'results' ? 'bg-white/10 text-foreground shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'}`}
                  >
                    <span className="material-symbols-outlined text-sm">analytics</span> Audit Report
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ml-1 ${result.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                      {result.totals.passed}/{result.totals.total} Passed
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={resetToOriginal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
                  title="Clear run and return to home"
                >
                  <span className="material-symbols-outlined text-sm">delete</span> Clear Run
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 mb-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                    <span className="material-symbols-outlined text-lg">error</span> Execution Failed
                  </div>
                  <div className="flex gap-2">
                    <button onClick={resetToOriginal} className="px-2.5 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 transition-colors">
                      Reset
                    </button>
                    <button onClick={() => { setError(null); setRunStartedAt(null); }} className="px-2.5 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 transition-colors">
                      Dismiss
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-rose-300/80">
                  {error.findings?.[0]?.detail || (error as any).detail || (error as any).error || 'The run could not complete. Check URL connectivity.'}
                </div>
              </div>
            )}

            <div className={`flex-col gap-6 w-full ${(activeLeftTab === 'config' || !result) ? 'flex' : 'hidden'}`}>
              <section className={`text-center max-w-3xl mx-auto ${isExecutionActive ? 'hidden' : 'mb-10 md:mb-12'}`} data-purpose="hero-headline">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-amber-500/30 mb-5 shadow-inner backdrop-blur-md">
                  <span className="material-symbols-outlined text-amber-400 text-sm">auto_awesome</span>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-amber-200/90 font-semibold">Autonomous QA &amp; Visual Intelligence</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-semibold tracking-tight text-white leading-[1.12]">
                  Intelligent Browser Audits in 
                  <span className="font-serif italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 underline decoration-amber-500/40 decoration-wavy decoration-1 underline-offset-8 drop-shadow-[0_0_20px_rgba(245,158,11,0.3)] ml-2">
                    Plain English.
                  </span>
                </h1>
                <p className="mt-4 text-base sm:text-lg text-neutral-300/85 max-w-2xl mx-auto leading-relaxed font-normal">
                  Execute automated tests, visual diffs, and deep compliance audits using natural language commands.
                </p>
              </section>

              <section className="relative rounded-2xl bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] shadow-card-glass shadow-glow p-5 sm:p-7 transition-all duration-300" data-purpose="audit-console">
                <div className="absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"></div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs tracking-wider uppercase font-semibold text-neutral-400">
                    <div className="flex items-center space-x-1.5 text-neutral-300">
                      <span className="material-symbols-outlined text-amber-400 text-base">edit_note</span>
                      <span className="font-mono text-xs font-semibold tracking-wider uppercase text-neutral-300">Audit Prompt &amp; Intent</span>
                    </div>
                    <div className="flex items-center space-x-1 font-mono text-[11px] text-neutral-400 bg-neutral-900/90 border border-white/10 px-2 py-0.5 rounded-md">
                      <kbd className="text-neutral-300 font-sans">⌘</kbd> + <kbd className="text-neutral-300">Enter</kbd> <span>to inspect</span>
                    </div>
                  </div>
                  <div className="relative group">
                    <textarea 
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && urlValid && !running) {
                          e.preventDefault();
                          run();
                        }
                      }}
                      className="w-full bg-[#110e0c]/90 border border-white/10 group-hover:border-white/20 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 text-neutral-100 placeholder:text-neutral-500 text-sm sm:text-base rounded-xl p-4 transition-all duration-200 resize-none font-sans outline-none" 
                      placeholder="Describe what to test in plain English (e.g. 'Audit checkout flow, test responsive layout, check form validations, simulate 3G network throttle and verify WCAG contrast')..." 
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6 p-1.5 sm:p-2 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] shadow-inner">
                  <div className="relative w-full flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                      <span className="material-symbols-outlined text-sky-400 text-base">public</span>
                    </div>
                    <input 
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && urlValid && !running) {
                          e.preventDefault();
                          run();
                        }
                      }}
                      className="w-full pl-10 pr-10 py-3 bg-[#100c0a]/95 border border-white/10 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 rounded-xl text-neutral-200 placeholder:text-neutral-500 text-sm font-mono transition-all outline-none" 
                      placeholder="https://your-domain.com or web app URL..." 
                    />
                    {url.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUrl('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    )}
                  </div>
                  <div className="relative group shrink-0 w-full sm:w-auto">
                    <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 opacity-70 blur-lg group-hover:opacity-100 group-hover:blur-xl transition duration-500 pointer-events-none"></div>
                    <button 
                      onClick={() => run()}
                      disabled={!urlValid || running}
                      className="relative w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 hover:from-cyan-300 hover:via-sky-400 hover:to-blue-500 hover:scale-[1.03] active:scale-[0.97] text-white font-semibold text-sm tracking-wide flex items-center justify-center space-x-3 shadow-luminous hover:shadow-[0_0_35px_rgba(6,182,212,0.7)] border border-white/40 transition-all duration-300 cursor-pointer overflow-hidden group/btn disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" 
                      type="button"
                    >
                      <div className="absolute inset-0 w-3/4 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-gleam-slide pointer-events-none"></div>
                      
                      {running ? (
                        <>
                          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                          <span className="relative z-10 text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">Inspecting Target…</span>
                        </>
                      ) : (
                        <>
                          <div className="relative flex items-center justify-center animate-icon-float">
                            <span className="absolute w-4 h-4 rounded-full bg-cyan-300/50 blur-xs animate-pulse-subtle"></span>
                            <span className="material-symbols-outlined text-white text-base drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] relative z-10 fill-1 group-hover/btn:scale-115 transition-transform duration-200">play_arrow</span>
                          </div>
                          <span className="relative z-10 text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">Inspect &amp; Run Audit</span>
                          <span className="relative z-10 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-black/35 backdrop-blur-md border border-white/30 text-cyan-100 font-mono text-[11px] font-medium tracking-tight shadow-inner animate-badge-float group-hover/btn:border-cyan-200/60 transition-colors">
                            <span className="text-[10px] leading-none opacity-80">⌘</span><span className="leading-none">↵</span>
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4 mb-6">
                  <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400 mb-3">
                    <span className="material-symbols-outlined text-amber-400 text-sm">auto_fix_high</span>
                    <span className="tracking-wide uppercase text-[11px] font-semibold text-neutral-400 font-mono">Quick Presets</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'demo-errors') || AI_PRESETS[0]); triggerToast('Preset loaded: Console Errors Demo'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-rose-200 border border-white/10 hover:border-rose-500/50 hover:shadow-[0_0_15px_rgba(244,63,94,0.22)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-rose-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">pest_control</span>
                      <span>Console Errors Demo</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'health') || AI_PRESETS[1]); triggerToast('Preset loaded: Full Health Scan'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-amber-200 border border-amber-500/30 hover:border-amber-400/70 hover:shadow-[0_0_18px_rgba(245,158,11,0.3)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-amber-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">monitor_heart</span>
                      <span>Full Health Scan</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'ecommerce') || AI_PRESETS[2]); triggerToast('Preset loaded: E-Commerce Flow'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-sky-200 border border-white/10 hover:border-sky-400/60 hover:shadow-[0_0_16px_rgba(56,189,248,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-sky-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">shopping_bag</span>
                      <span>E-Commerce Flow</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'auth') || AI_PRESETS[3]); triggerToast('Preset loaded: Auth Security Check'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-emerald-200 border border-white/10 hover:border-emerald-400/60 hover:shadow-[0_0_16px_rgba(52,211,153,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-emerald-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">encrypted</span>
                      <span>Auth Security Check</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'a11y') || AI_PRESETS[4]); triggerToast('Preset loaded: WCAG 2.1 AA Audit'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-sky-200 border border-sky-500/30 hover:border-sky-400/70 hover:shadow-[0_0_18px_rgba(56,189,248,0.3)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-sky-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">accessibility_new</span>
                      <span>WCAG 2.1 AA Audit</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'mobile-nav') || AI_PRESETS[5]); triggerToast('Preset loaded: Mobile Nav & Layout'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-indigo-200 border border-white/10 hover:border-indigo-400/60 hover:shadow-[0_0_16px_rgba(129,140,248,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-indigo-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">smartphone</span>
                      <span>Mobile Nav &amp; Layout</span>
                    </button>
                    <button 
                      onClick={generateAiTestForUrl}
                      disabled={!urlValid || autoGenLoading}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-amber-300/90 border border-amber-500/20 hover:border-amber-400/70 hover:shadow-[0_0_18px_rgba(245,158,11,0.3)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer disabled:opacity-50" type="button"
                    >
                      <span className="material-symbols-outlined text-amber-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">psychology</span>
                      <span>Auto-Generate Site Tests</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-neutral-400 text-sm">memory</span>
                      <span className="text-xs font-semibold tracking-wide uppercase text-neutral-400 font-mono">AI Engine &amp; Execution Profile</span>
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 tracking-wider">
                      RUNTIME: {device.toUpperCase()} • {browserType.toUpperCase()}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Intelligence</label>
                      <div className="relative">
                        <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as any)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="auto">⚡ Claude 3.5 Sonnet</option>
                          <option value="local">🖥 Local LLM (Ollama)</option>
                          <option value="gemini">✨ Gemini 1.5 Pro</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Browser Core</label>
                      <div className="relative">
                        <select value={browserType} onChange={(e) => setBrowserType(e.target.value as any)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="chromium">🌐 Chromium</option>
                          <option value="webkit">🧭 WebKit Safari</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Target Viewport</label>
                      <div className="relative">
                        <select value={device} onChange={(e) => setDevice(e.target.value as DevicePreset)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="desktop">💻 Desktop (1280×800)</option>
                          <option value="laptop">🖥 Large (1440×900)</option>
                          <option value="mobile">📱 iPhone 14 (390×844)</option>
                          <option value="tablet">📟 Tablet iPad (820×1180)</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Environment</label>
                      <div className="relative">
                        <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="QA">QA Environment</option>
                          <option value="STAGING">Staging Mirror</option>
                          <option value="PRODUCTION">Production (Read-Only)</option>
                          <option value="LOCAL">Localhost:3000</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative col-span-2 sm:col-span-1">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Safety Policy</label>
                      <div className="relative">
                        <select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="0">Tier 0 (Sandbox Safe)</option>
                          <option value="1">Tier 1 (Form Submissions)</option>
                          <option value="2">Tier 2 (Full Mutations)</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold tracking-wide uppercase text-neutral-400 font-mono">Test Suites &amp; Assertions</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-400 border border-sky-500/30 font-semibold">{selected.length} ACTIVE</span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-neutral-400">
                      <label className="inline-flex items-center space-x-2 cursor-pointer select-none group">
                        <input type="checkbox" checked={strict} onChange={() => setStrict(!strict)} className="rounded bg-[#120e0c] border-white/20 text-sky-500 focus:ring-sky-500/30 focus:ring-offset-0 w-3.5 h-3.5 transition-colors cursor-pointer" />
                        <span className="group-hover:text-neutral-300 transition-colors">Strict assertions</span>
                      </label>
                      <label className={`inline-flex items-center space-x-2 select-none group ${tierNumber < 1 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={captureAssets} onChange={() => setCaptureAssets(!captureAssets)} disabled={tierNumber < 1} className="rounded bg-[#120e0c] border-white/20 text-sky-500 focus:ring-sky-500/30 focus:ring-offset-0 w-3.5 h-3.5 transition-colors cursor-pointer" />
                        <span className="group-hover:text-neutral-300 transition-colors">Capture HAR &amp; Assets</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {(available.length > 0 ? available : [
                      { id: 'functional', label: 'Functional', minTier: 0 },
                      { id: 'ui', label: 'UI / Visual Diff', minTier: 0 },
                      { id: 'design', label: 'Design & Assets', minTier: 0 },
                      { id: 'accessibility', label: 'Accessibility (WCAG 2.1 AA)', minTier: 0 },
                      { id: 'security-passive', label: 'Security (Passive)', minTier: 0 },
                      { id: 'performance', label: 'Performance & Vitals', minTier: 0 },
                      { id: 'api', label: 'API & Network Contract', minTier: 0 },
                      { id: 'unit', label: 'Unit Tests (Source Code)', minTier: 0 },
                      { id: 'scraper', label: 'Web Scraper & Crawler', minTier: 0 },
                    ]).map((cat) => {
                      const isSelected = selected.includes(cat.id);
                      const isTierRestricted = cat.minTier > tierNumber;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            if (!isTierRestricted) toggleCategory(cat.id);
                          }}
                          disabled={isTierRestricted}
                          className={`suite-pill inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                            isTierRestricted
                              ? 'opacity-40 cursor-not-allowed bg-[#110e0c]/40 text-neutral-500 border border-white/5'
                              : isSelected 
                                ? 'bg-neutral-800 text-white border border-white/30 shadow-sm hover:bg-neutral-700 hover:border-white/50 hover:scale-[1.03] active:scale-[0.95]' 
                                : 'bg-[#110e0c]/60 text-neutral-400 border border-white/5 hover:border-white/20 hover:text-neutral-200 hover:scale-[1.03] active:scale-[0.95]'
                          }`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 active-pulse-dot" />}
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            {/* VIEW 2: Results Panel */}
            {result && activeLeftTab === 'results' && (
              <div style={{ width: '100%', marginTop: 8 }}>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="results-sub-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {device === 'mobile' ? <span className="material-symbols-outlined text-[14px]">smartphone</span> : device === 'tablet' ? <span className="material-symbols-outlined text-[14px]">tablet_mac</span> : device === 'laptop' ? <span className="material-symbols-outlined text-[14px]">laptop_mac</span> : <span className="material-symbols-outlined text-[14px]">desktop_mac</span>}
                      Emulated: {device.toUpperCase()}
                    </span>
                  </div>
                </div>
                <ResultsPanel
                  result={result}
                  device={device}
                  onApplyFix={(fix) => {
                    setInstructions((prev) => (prev ? `${fix}\n${prev}` : fix));
                    setActiveLeftTab('config');
                  }}
                  onDownload={async (aiSummary?: string, summaryData?: any) => {
                    setPdfing(true);
                    try {
                      await printReport(result, aiSummary, summaryData);
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
{/* ── RIGHT COLUMN: Live Execution Sandbox (rendered only when prompt is given / execution is active) ── */}
        {isExecutionActive && (
          <div className={`workspace-right-pane ${previewTab === 'terminal' ? 'terminal-mode' : 'visual-mode'}`}>
          {/* Browser Mockup Chrome Header */}
          <div className="browser-chrome">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div className="browser-traffic-lights">
                <span className="browser-traffic-dot close" />
                <span className="browser-traffic-dot minimize" />
                <span className="browser-traffic-dot zoom" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {running ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : null}
                {running ? 'Live Execution' : result ? 'Browser Output' : 'Live Sandbox'}
              </span>
            </div>

            {/* URL Bar */}
            <div className="browser-url-pill" title={url || 'about:blank'}>
              <span style={{ color: urlValid ? '#10b981' : 'var(--text-muted)' }}>🔒</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)', flex: 1, minWidth: 0 }}>
                {url ? url.replace(/^https?:\/\//, '') : 'about:blank'}
              </span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-muted)', flexShrink: 0 }}>
                {device}
              </span>
            </div>

            {/* Header Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {running && runStartedAt ? (
                <ElapsedTimer startedAt={runStartedAt} />
              ) : result ? (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={12} color="#10b981" />
                  {(result.durationMs / 1000).toFixed(1)}s
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                  Ready
                </span>
              )}

              {/* View Tabs */}
              <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 2, borderRadius: 8, border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className={`settings-pill ${previewTab === 'visual' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('visual')}
                  style={{ height: 26, fontSize: 11, padding: '0 10px', borderRadius: 6, border: 'none', background: previewTab === 'visual' ? 'var(--bg-surface)' : 'transparent', color: previewTab === 'visual' ? 'var(--text)' : 'var(--text-secondary)', fontWeight: previewTab === 'visual' ? 600 : 400 }}
                >
                  🖥️ Visual
                </button>
                <button
                  type="button"
                  className={`settings-pill ${previewTab === 'terminal' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('terminal')}
                  style={{ height: 26, fontSize: 11, padding: '0 10px', borderRadius: 6, border: 'none', background: previewTab === 'terminal' ? 'var(--bg-surface)' : 'transparent', color: previewTab === 'terminal' ? 'var(--text)' : 'var(--text-secondary)', fontWeight: previewTab === 'terminal' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  💻 Stdio
                  {terminalLogs.filter((l) => l.level === 'error').length > 0 && (
                    <span style={{ background: '#e11d48', color: '#fff', padding: '0 5px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                      {terminalLogs.filter((l) => l.level === 'error').length}
                    </span>
                  )}
                </button>
              </div>

              {running && (
                <button
                  className="settings-pill"
                  onClick={handleCancel}
                  style={{ color: '#e11d48', borderColor: 'rgba(225,29,72,0.4)', fontSize: 11, height: 26, padding: '0 10px' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Browser Body Area */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {previewTab === 'terminal' ? (
              <div
                ref={terminalEndRef}
                style={{
                  background: '#090d16',
                  padding: '16px 20px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 12,
                  lineHeight: 1.6,
                  flex: 1,
                  overflowY: 'auto',
                  color: '#e2e8f0',
                  textAlign: 'left',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 12, borderBottom: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b', letterSpacing: 0.5 }}>zsh — live browser stdio</span>
                  <span style={{ fontSize: 10, color: '#475569' }}>{terminalLogs.length} events</span>
                </div>
                {terminalLogs.length === 0 ? (
                  <div style={{ color: '#64748b', fontStyle: 'italic', padding: '30px 0', textAlign: 'center' }}>
                    {running ? '$ initializing browser runner & awaiting page console stream...' : '$ awaiting scan command...'}
                  </div>
                ) : (
                  terminalLogs.map((log, idx) => {
                    let color = '#94a3b8';
                    let prefix = '💬';
                    let bg = 'transparent';
                    if (log.type === 'console') {
                      if (log.level === 'error') { color = '#f43f5e'; prefix = '🚨'; bg = 'rgba(244,63,94,0.12)'; }
                      else if (log.level === 'warn') { color = '#f59e0b'; prefix = '⚠️'; }
                      else { color = '#38bdf8'; prefix = '💬'; }
                    } else if (log.type === 'error') { color = '#ff6b81'; prefix = '💥'; bg = 'rgba(225,29,72,0.2)'; }
                    else if (log.type === 'network') { color = '#fbbf24'; prefix = '📡'; }
                    else if (log.type === 'step') { color = log.message.startsWith('✓') ? '#34d399' : '#ffffff'; prefix = log.message.startsWith('▶') ? '▶' : '✔'; }
                    return (
                      <div key={idx} style={{ padding: '2px 8px', borderRadius: 4, background: bg, marginBottom: 3, display: 'flex', gap: 8, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        <span style={{ color: '#475569', userSelect: 'none', minWidth: 65 }}>[{log.timestamp}]</span>
                        <span style={{ minWidth: 18 }}>{prefix}</span>
                        <span style={{ color, fontWeight: log.level === 'error' ? 600 : 400 }}>{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', marginTop: 10 }}>
                  <span>$</span>
                  {running && <span className="spinner" style={{ width: 8, height: 8, borderWidth: 1 }} />}
                  <span style={{ color: '#64748b', fontSize: 11 }}>{running ? 'streaming from active browser session...' : 'session ready.'}</span>
                </div>
              </div>
            ) : (
              <div className="browser-canvas-body">
                {(() => {
                  const stepsWithScreenshots = (result?.steps && result.steps.length > 0 ? result.steps : liveSteps);
                  const lastStepWithScreenshot = stepsWithScreenshots.slice().reverse().find((s) => Boolean(s.screenshot));
                  const currentStep = liveSteps[liveSteps.length - 1];
                  const activeImage = liveFrame || lastStepWithScreenshot?.screenshot;

                  if (activeImage) {
                    return (
                      <div className={`browser-viewport-container device-${device}`}>
                        <div className="browser-viewport-frame">
                          {device === 'mobile' && <div className="mobile-dynamic-island" />}
                          <img
                            src={activeImage}
                            alt="Live browser preview"
                            className="browser-viewport-img"
                          />
                          {device === 'mobile' && <div className="mobile-home-indicator" />}
                          {running && (
                            <div className="browser-viewport-hud">
                              <span className="hud-indicator-dot" />
                              <span className="hud-text">
                                {currentStep?.intent ||
                                  (currentStep?.action?.type === 'navigate' ? `Navigating to ${currentStep.action.url || currentStep.action.path || '/'}` :
                                   currentStep?.action?.type === 'click' ? `Clicking ${currentStep.action.targetName || currentStep.action.target?.name || 'element'}` :
                                   currentStep?.action?.type === 'fill' ? `Filling ${currentStep.action.targetName || currentStep.action.target?.name || 'input'}` :
                                   currentStep?.action?.type === 'waitFor' ? 'Waiting for page load' :
                                   currentStep ? `Executing ${currentStep.action?.type || 'step'}...` :
                                   'Live browser session active...')}
                              </span>
                              <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.25)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 4, padding: '1px 6px', fontWeight: 700, letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                LIVE
                              </span>
                            </div>
                          )}
                          {(!running && result) && (
                            <div className="browser-viewport-hud hud-completed">
                              <CheckCircle size={14} color="#10b981" />
                              <span>Final Viewport • {(result.durationMs / 1000).toFixed(1)}s elapsed</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (running) {
                    return (
                      <div className={`browser-viewport-container device-${device}`}>
                        <div className="browser-viewport-frame" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', minHeight: 280 }}>
                          {device === 'mobile' && <div className="mobile-dynamic-island" />}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 30 }}>
                            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
                            <div style={{ textAlign: 'center' }}>
                              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Launching Live Browser...</p>
                              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', maxWidth: 280 }}>
                                Spawning {browserType === 'chromium' ? 'Chromium' : 'WebKit'} & streaming {url || 'target'}...
                              </p>
                            </div>
                          </div>
                          {device === 'mobile' && <div className="mobile-home-indicator" />}
                        </div>
                      </div>
                    );
                  }

                  // Idle Standby State
                  return (
                    <div className="browser-standby-box">
                      <div style={{
                        width: 60,
                        height: 60,
                        borderRadius: '50%',
                        background: 'rgba(217, 119, 87, 0.12)',
                        border: '1px solid rgba(217, 119, 87, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16,
                        boxShadow: '0 0 24px rgba(217, 119, 87, 0.12)',
                      }}>
                        <Radar />
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                        Live Execution Sandbox
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20, maxWidth: 380 }}>
                        {urlValid ? (
                          <>Ready to run against <strong style={{ color: 'var(--text)' }}>{url}</strong>. Live screenshots, interactions, and console logs stream here.</>
                        ) : (
                          <>Enter a website URL on the left and click <strong>Inspect</strong> to stream live browser actions and real-time visual output.</>
                        )}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                          ⚡ Headless {browserType === 'chromium' ? 'Chromium' : 'WebKit'}
                        </span>
                        <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                          📸 Real-time Screenshots
                        </span>
                        <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                          💻 Live Stdio Stream
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
        {/* END right column */}
      </main>
      {/* END workspace container */}

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
                      className="w-full bg-[#120e0c] border border-white/10 text-neutral-200 text-sm rounded-lg py-2.5 px-3 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                  </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Frequency</label>
                      <div className="relative">
                        <select 
                          value={scheduleFreq} 
                          onChange={(e) => setScheduleFreq(e.target.value as any)} 
                          className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-sm rounded-lg py-2.5 pl-3 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none cursor-pointer"
                        >
                          <option value="hourly">Every Hour</option>
                          <option value="daily">Daily at 08:00 AM</option>
                          <option value="weekly">Weekly (Monday)</option>
                        </select>
                        <i className="ph ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Device Profile</label>
                      <div className="relative">
                        <select 
                          value={device} 
                          onChange={(e) => setDevice(e.target.value as DevicePreset)} 
                          className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-sm rounded-lg py-2.5 pl-3 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none cursor-pointer"
                        >
                          <option value="desktop">Desktop</option>
                          <option value="laptop">Laptop</option>
                          <option value="mobile">Mobile (iPhone 14)</option>
                          <option value="tablet">Tablet (iPad)</option>
                        </select>
                        <i className="ph ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none" />
                      </div>
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
                        className="flex-1 w-full bg-[#120e0c] border border-white/10 text-neutral-200 text-sm rounded-lg py-2.5 px-3 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
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
                    className="w-full px-6 py-3 mt-2 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 hover:from-cyan-300 hover:via-sky-400 hover:to-blue-500 active:scale-[0.98] text-[#ffffff] font-semibold text-sm tracking-wide shadow-luminous hover:shadow-luminous-hover border border-white/35 transition-all duration-300 cursor-pointer overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed" 
                    onClick={handleSaveSchedule} 
                    
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

      {/* ── AI Copilot Floating Action ── */}
      {!copilotOpen && (
        <aside className="fixed bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={() => {
              setCopilotOpen(true);
              // Auto-run recon if we have a URL and no recon yet
              if (urlValid && !siteRecon && !reconLoading) {
                runSiteRecon();
              }
            }}
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-[#ffffff] flex items-center justify-center shadow-lg shadow-amber-950/60 border border-amber-400/30 transition-all hover:scale-105 active:scale-95 group cursor-pointer"
            title="Open AI QA Copilot"
          >
            <i className="ph-bold ph-chats-circle text-2xl group-hover:rotate-12 transition-transform" />
          </button>
        </aside>
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
          // Auto-run with the generated steps if URL is valid
          if (urlValid) {
            setTimeout(() => run(generatedInstructions), 100);
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
