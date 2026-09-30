'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Users,
  Activity,
  Cpu,
  Bot,
  Globe,
  RefreshCw,
  Search,
  Filter,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Laptop,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
  Download,
  ExternalLink,
  ChevronRight,
  Sliders,
  LogOut,
  Terminal,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import type { UserPresence, ActivityLog } from '../../lib/admin-store';
import type { Role } from '@wts/policy';

interface TelemetryResponse {
  users: UserPresence[];
  activities: ActivityLog[];
  metrics: {
    totalUsers: number;
    onlineUsers: number;
    idleUsers: number;
    offlineUsers: number;
    totalScans: number;
    passedScans: number;
    failedScans: number;
    totalCopilotQueries: number;
  };
}

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to run reports' },
  { value: 'tester', label: 'Tester', description: 'Can execute standard synthetic test journeys' },
  { value: 'automation_engineer', label: 'Automation Eng', description: 'Can create custom tests, schedules & webhooks' },
  { value: 'platform_admin', label: 'Platform Admin', description: 'Full administrative access and user management' },
];

function formatTimeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  
  // Filters & State
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'idle' | 'offline'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<'all' | ActivityLog['type']>('all');
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [localAdminUser, setLocalAdminUser] = useState<{ uid: string; email: string; displayName?: string } | null>(null);

  // Load saved local admin session
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wts_admin_user');
      if (saved) {
        setLocalAdminUser(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const activeUser = user || localAdminUser;

  // Fetch telemetry
  const fetchTelemetry = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch('/api/admin/telemetry', {
        headers: {
          'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
        }
      });
      if (!res.ok) {
        throw new Error(`Failed to load telemetry: ${res.statusText}`);
      }
      const data: TelemetryResponse = await res.json();
      setTelemetry(data);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err: unknown) {
      console.error('[Admin Telemetry Error]:', err);
      setError(err instanceof Error ? err.message : 'Unknown telemetry error');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [activeUser?.uid]);

  // Initial load
  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  // Auto-refresh interval (10s)
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchTelemetry(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchTelemetry]);

  // Clear toast notifications after 3 seconds
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 3500);
      return () => clearTimeout(t);
    }
  }, [actionSuccess]);

  // Handle Role Change
  const handleRoleChange = async (targetUid: string, newRole: Role) => {
    setUpdatingUid(targetUid);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
        },
        body: JSON.stringify({
          action: 'update_role',
          targetUid,
          newRole,
          adminUid: user?.uid || 'admin',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update role');
      }
      setActionSuccess(`Role updated to ${newRole}`);
      await fetchTelemetry(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdatingUid(null);
    }
  };

  // Handle Session Revoke / Reinstate
  const handleToggleSession = async (targetUid: string, currentRevoked: boolean) => {
    const action = currentRevoked ? 'reinstate_session' : 'revoke_session';
    const confirmPrompt = currentRevoked
      ? 'Reinstate access for this user?'
      : 'Force-terminate this session? The user will be immediately logged out on their next heartbeat.';
    
    if (!window.confirm(confirmPrompt)) return;

    setUpdatingUid(targetUid);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
        },
        body: JSON.stringify({
          action,
          targetUid,
          adminUid: user?.uid || 'admin',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Action failed');
      }
      setActionSuccess(currentRevoked ? 'Session reinstated' : 'Session revoked successfully');
      await fetchTelemetry(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setUpdatingUid(null);
    }
  };

  // Export audit logs as CSV
  const handleExportCsv = () => {
    if (!telemetry?.activities) return;
    const headers = ['ID', 'Timestamp', 'User Email', 'Event Type', 'Title', 'Detail', 'Target URL', 'Status'];
    const rows = telemetry.activities.map((a) => [
      a.id,
      a.timestamp,
      `"${a.email}"`,
      a.type,
      `"${(a.title || '').replace(/"/g, '""')}"`,
      `"${(a.detail || '').replace(/"/g, '""')}"`,
      `"${(a.targetUrl || '').replace(/"/g, '""')}"`,
      a.status || 'info',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wts-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export full telemetry JSON
  const handleExportJson = () => {
    if (!telemetry) return;
    const blob = new Blob([JSON.stringify(telemetry, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wts-telemetry-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    if (!telemetry?.users) return [];
    return telemetry.users.filter((u) => {
      const matchesSearch =
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(userSearch.toLowerCase())) ||
        u.uid.toLowerCase().includes(userSearch.toLowerCase());
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [telemetry?.users, userSearch, statusFilter, roleFilter]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    if (!telemetry?.activities) return [];
    return telemetry.activities.filter((a) => {
      const matchesSearch =
        (a.email && a.email.toLowerCase().includes(activitySearch.toLowerCase())) ||
        (a.title && a.title.toLowerCase().includes(activitySearch.toLowerCase())) ||
        (a.targetUrl && a.targetUrl.toLowerCase().includes(activitySearch.toLowerCase())) ||
        (a.detail && a.detail.toLowerCase().includes(activitySearch.toLowerCase()));
      const matchesType = activityTypeFilter === 'all' || a.type === activityTypeFilter;
      const matchesSelectedUser = !selectedUserUid || a.uid === selectedUserUid;
      return matchesSearch && matchesType && matchesSelectedUser;
    });
  }, [telemetry?.activities, activitySearch, activityTypeFilter, selectedUserUid]);

  const selectedUser = useMemo(() => {
    if (!selectedUserUid || !telemetry?.users) return null;
    return telemetry.users.find((u) => u.uid === selectedUserUid) || null;
  }, [selectedUserUid, telemetry?.users]);

  // Strict role check — only platform_admin from telemetry is allowed in.
  // The email-contains-'admin' shortcut is intentionally removed.
  const currentUserRole = useMemo(() => {
    if (!activeUser || !telemetry?.users) return null;
    const match = telemetry.users.find(
      (u) => u.uid === activeUser.uid || u.email.toLowerCase() === activeUser.email?.toLowerCase()
    );
    return match?.role ?? null;
  }, [activeUser, telemetry?.users]);

  // Robust fallback check in case of lambda cold starts emptying telemetry users
  const isAdmin = currentUserRole === 'platform_admin' || activeUser?.email?.toLowerCase() === 'yogeshvar2508@gmail.com';

  // Manage-Admins panel state
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminEmailError, setAdminEmailError] = useState<string | null>(null);

  // Load current admin emails list (only for platform_admin users)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/users', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
      },
      body: JSON.stringify({ action: 'get_admin_emails' }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.emails) setAdminEmails(d.emails); })
      .catch(() => {});
  }, [isAdmin]);

  if (authLoading && !localAdminUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--accent)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Connecting to Admin Telemetry...</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Authenticating credentials and live presence</p>
        </div>
      </div>
    );
  }

  // Not logged in at all → send to login
  if (!user && !authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div className="max-w-[420px] w-full bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-8 sm:p-9 shadow-2xl text-center">
          <div style={{ width: 54, height: 54, borderRadius: '50%', backgroundColor: 'rgba(217,119,87,0.15)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Shield size={28} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Admin Console</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
            Please sign in to continue.
          </p>
          <Link href="/login" className="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            <ShieldCheck size={18} /> Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Logged in but NOT platform_admin → Access Denied
  if (!authLoading && activeUser && telemetry && !isAdmin) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div className="max-w-[460px] w-full bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-8 sm:p-10 shadow-2xl text-center">
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px' }}>
            <ShieldAlert size={32} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 10px', color: '#EF4444' }}>Access Denied</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.6 }}>
            Your account <strong style={{ color: 'var(--text)' }}>{activeUser.email}</strong> does not have admin privileges.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 28px', lineHeight: 1.5 }}>
            Contact your administrator to request access.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-muted)', color: 'var(--text)', fontWeight: 500, fontSize: 14, textDecoration: 'none', border: '1px solid var(--border)' }}>
              <ArrowLeft size={16} /> Back to Scanner
            </Link>
            <button
              type="button"
              onClick={() => { logout?.(); router.push('/login'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 'var(--radius-md)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 14, border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingBottom: 80 }}>
      {/* Toast Notification */}
      {actionSuccess && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            backgroundColor: 'var(--pass-bg)',
            color: 'var(--pass)',
            border: '1px solid var(--pass)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 20px',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          <CheckCircle2 size={18} />
          {actionSuccess}
        </div>
      )}

      {/* ── Top Masthead ── */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-[#120e0c]/70 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Back to Scanner</span>
            </Link>

            <div className="flex items-center space-x-3.5 sm:space-x-4">
              {/* Designer Glowing Brand Mark */}
              <Link
                href="/"
                className="relative flex items-center justify-center group cursor-pointer transition-transform duration-200 active:scale-[0.98]"
                title="Webtest Scanner - Back to home"
              >
                <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-r from-amber-500/30 via-orange-500/20 to-sky-500/30 blur-md opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-b from-[#241c19] via-[#16110f] to-[#0c0908] border border-white/20 group-hover:border-amber-400/50 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.25)] flex items-center justify-center transition-all duration-300 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                  <i className="ph-bold ph-terminal-window text-2xl sm:text-[26px] text-amber-400 group-hover:text-amber-300 transition-colors drop-shadow-[0_2px_10px_rgba(251,191,36,0.45)]" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-gradient-to-tr from-cyan-400 to-sky-400 border border-[#0c0908] shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  </span>
                </div>
              </Link>
              <div>
                <div className="flex items-center space-x-2.5 sm:space-x-3">
                  <div className="flex items-baseline space-x-1 sm:space-x-1.5">
                    <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans drop-shadow-sm">Webtest</span>
                    <span className="relative inline-block">
                      <span className="absolute inset-0 text-xl sm:text-2xl font-serif italic font-normal tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-500 to-amber-300 bg-[size:200%_auto] animate-gradient-pan blur-[8px] opacity-80 select-none">Scanner</span>
                      <span className="relative text-xl sm:text-2xl font-serif italic font-normal tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-400 to-amber-200 bg-[size:200%_auto] animate-gradient-pan select-none drop-shadow-[0_0_2px_rgba(251,191,36,0.8)]">Scanner</span>
                    </span>
                    <span className="text-sm font-semibold uppercase tracking-wider text-amber-400/90 font-mono ml-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Admin</span>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-gradient-to-r from-sky-500/10 via-amber-500/10 to-transparent border border-sky-500/30 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.15)] backdrop-blur-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />Telemetry v2.0
                  </span>
                </div>
                <p className="hidden md:block m-0 text-xs text-neutral-400">
                  Live user presence, target audits, session control &amp; telemetry
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all cursor-pointer"
              style={{
                color: autoRefresh ? 'var(--pass)' : 'var(--text-muted)',
              }}
              title={autoRefresh ? 'Live refresh active (every 10s)' : 'Live refresh paused'}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: autoRefresh ? 'var(--pass)' : 'var(--text-muted)',
                  display: 'inline-block',
                }}
              />
              <span className="hidden sm:inline">{autoRefresh ? 'Live' : 'Paused'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchTelemetry(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 transition-all cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Export Audit CSV Button */}
            <button
              onClick={handleExportCsv}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 transition-all cursor-pointer"
              title="Download audit logs in CSV format"
            >
              <Download size={13} />
              <span>Audit CSV</span>
            </button>

            {/* Admin User Badge */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {activeUser?.email ? activeUser.email.slice(0, 2).toUpperCase() : 'AD'}
              </div>
              <span className="hidden md:inline text-xs font-medium text-neutral-200">{activeUser?.email}</span>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Admin
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('wts_admin_user');
                }
                setLocalAdminUser(null);
                logout().catch(() => {});
              }}
              title="Sign out of admin session"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all cursor-pointer"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
        {/* KPI Metric Cards */}
        {telemetry?.metrics && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              marginBottom: 28,
            }}
          >
            {/* Total & Active Users */}
            <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>User Presence</span>
                <Users size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{telemetry.metrics.totalUsers}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Registered Users</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 12, fontSize: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--pass)', fontWeight: 600 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--pass)' }} />
                  {telemetry.metrics.onlineUsers} Online
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--warn)', fontWeight: 600 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--warn)' }} />
                  {telemetry.metrics.idleUsers} Idle
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />
                  {telemetry.metrics.offlineUsers} Offline
                </span>
              </div>
            </div>

            {/* Total Scans & Health */}
            <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Synthetic Scans</span>
                <Activity size={18} style={{ color: 'var(--pass)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{telemetry.metrics.totalScans}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Executed</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--pass)', fontWeight: 600 }}>
                  ✓ {telemetry.metrics.passedScans} Passed
                </span>
                <span style={{ color: telemetry.metrics.failedScans > 0 ? 'var(--fail)' : 'var(--text-muted)', fontWeight: 600 }}>
                  ✕ {telemetry.metrics.failedScans} Failed
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {telemetry.metrics.totalScans > 0
                    ? `${Math.round((telemetry.metrics.passedScans / telemetry.metrics.totalScans) * 100)}% Pass Rate`
                    : 'No runs'}
                </span>
              </div>
            </div>

            {/* AI Copilot Interactions */}
            <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>AI Copilot Queries</span>
                <Bot size={18} style={{ color: '#8b5cf6' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{telemetry.metrics.totalCopilotQueries}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Inquiries Answered</span>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                Multi-model automated reasoning assistance
              </div>
            </div>

            {/* Audit Events Recorded */}
            <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Audit Events</span>
                <Terminal size={18} style={{ color: 'var(--text-muted)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{telemetry.activities.length}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Captured Activities</span>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                Synced {formatTimeAgo(lastRefreshed.toISOString())}
              </div>
            </div>
          </div>
        )}

        {/* ── Two-Column Layout: Users Roster & Live Audit Feed ── */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 380px' : '1.3fr 1fr', gap: 24 }}>
          {/* ── Column 1: Users Presence & Management Roster ── */}
          <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl overflow-hidden shadow-sm">
            {/* Header & Filter Bar */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Team Presence & Session Directory</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Monitor who is currently logged in, what targets they test, and their system roles.
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-pill)',
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {filteredUsers.length} Users
                </span>
              </div>

              {/* Search & Filter Controls */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by email, name or UID..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 34px',
                      fontSize: 13,
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg)',
                      color: 'var(--text)',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="online">🟢 Online</option>
                  <option value="idle">🟡 Idle</option>
                  <option value="offline">⚪ Offline</option>
                </select>

                {/* Role Filter */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg)',
                    color: 'var(--text)',
                  }}
                >
                  <option value="all">All Roles</option>
                  <option value="platform_admin">Platform Admin</option>
                  <option value="automation_engineer">Automation Engineer</option>
                  <option value="tester">Tester</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>User</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Presence</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Environment</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600 }}>Usage</th>
                    <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No users match the search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelected = selectedUserUid === u.uid;
                      const isCurrentUser = user?.uid === u.uid || user?.email?.toLowerCase() === u.email.toLowerCase();

                      return (
                        <tr
                          key={u.uid}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: isSelected ? 'rgba(217, 119, 87, 0.07)' : 'transparent',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {/* User Name & Email */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: '50%',
                                  backgroundColor: u.role === 'platform_admin' ? 'var(--accent)' : 'var(--bg-hover)',
                                  color: u.role === 'platform_admin' ? '#fff' : 'var(--text)',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {u.email ? u.email.slice(0, 2).toUpperCase() : '??'}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                    {u.displayName || u.email.split('@')[0]}
                                  </span>
                                  {isCurrentUser && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        borderRadius: 'var(--radius-sm)',
                                        backgroundColor: 'var(--bg-hover)',
                                        color: 'var(--text-muted)',
                                        fontWeight: 600,
                                      }}
                                    >
                                      You
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{u.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Presence Status */}
                          <td style={{ padding: '14px 18px' }}>
                            <div>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor:
                                      u.status === 'online'
                                        ? 'var(--pass)'
                                        : u.status === 'idle'
                                        ? 'var(--warn)'
                                        : 'var(--text-muted)',
                                    boxShadow:
                                      u.status === 'online'
                                        ? '0 0 8px rgba(76, 175, 80, 0.6)'
                                        : 'none',
                                  }}
                                />
                                <span
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 12,
                                    textTransform: 'capitalize',
                                    color:
                                      u.status === 'online'
                                        ? 'var(--pass)'
                                        : u.status === 'idle'
                                        ? 'var(--warn)'
                                        : 'var(--text-muted)',
                                  }}
                                >
                                  {u.status}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                {formatTimeAgo(u.lastSeenAt)}
                              </div>
                            </div>
                          </td>

                          {/* Role Dropdown */}
                          <td style={{ padding: '14px 18px' }}>
                            <select
                              value={u.role}
                              disabled={updatingUid === u.uid}
                              onChange={(e) => handleRoleChange(u.uid, e.target.value as Role)}
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                                backgroundColor:
                                  u.role === 'platform_admin'
                                    ? 'rgba(217, 119, 87, 0.12)'
                                    : 'var(--bg)',
                                color: u.role === 'platform_admin' ? 'var(--accent)' : 'var(--text)',
                                cursor: 'pointer',
                              }}
                            >
                              {ROLE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Environment (Browser & OS) */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Laptop size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                              <span>
                                {u.browser || 'Browser'} / {u.os || 'OS'}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              IP: {u.lastIp || '127.0.0.1'}
                            </div>
                          </td>

                          {/* Usage Metrics */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>
                              {u.metrics.totalScans} scans ({u.metrics.passedScans} passed)
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {u.metrics.copilotQueries} AI queries
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {/* Drill-down Drawer Button */}
                              <button
                                onClick={() => setSelectedUserUid(isSelected ? null : u.uid)}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--border)',
                                  backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-hover)',
                                  color: isSelected ? '#fff' : 'var(--text)',
                                  cursor: 'pointer',
                                }}
                                title="Inspect user activity trail"
                              >
                                {isSelected ? 'Close' : 'Inspect'}
                              </button>

                              {/* Force Revoke / Reinstate Session */}
                              <button
                                onClick={() => handleToggleSession(u.uid, u.sessionRevoked ?? false)}
                                disabled={updatingUid === u.uid || isCurrentUser}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid',
                                  borderColor: u.sessionRevoked ? 'var(--pass)' : 'rgba(211, 47, 47, 0.4)',
                                  backgroundColor: u.sessionRevoked ? 'var(--pass-bg)' : 'rgba(211, 47, 47, 0.08)',
                                  color: u.sessionRevoked ? 'var(--pass)' : 'var(--fail)',
                                  cursor: isCurrentUser ? 'not-allowed' : 'pointer',
                                  opacity: isCurrentUser ? 0.4 : 1,
                                }}
                                title={
                                  isCurrentUser
                                    ? 'Cannot revoke your own active admin session'
                                    : u.sessionRevoked
                                    ? 'Reinstate access'
                                    : 'Revoke and force signout'
                                }
                              >
                                {u.sessionRevoked ? 'Reinstate' : 'Revoke'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Column 2: Live Activity Audit Feed OR User Drill-down Drawer ── */}
          <div>
            {selectedUser ? (
              /* User Drill-down Pane */
              <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl overflow-hidden shadow-sm sticky top-[80px]">
                <div
                  style={{
                    padding: '18px 20px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selectedUser.email ? selectedUser.email.slice(0, 2).toUpperCase() : '??'}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                        {selectedUser.displayName || selectedUser.email.split('@')[0]}
                      </h3>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{selectedUser.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUserUid(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: 20 }}>
                  {/* Status Banner */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-hover)',
                      marginBottom: 16,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{selectedUser.status}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Assigned Role:</span>
                      <span style={{ fontWeight: 600 }}>{selectedUser.role}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Client:</span>
                      <span>
                        {selectedUser.browser} on {selectedUser.os}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Last IP:</span>
                      <span style={{ fontFamily: 'monospace' }}>{selectedUser.lastIp}</span>
                    </div>
                  </div>

                  {/* Scanned Targets */}
                  {selectedUser.metrics.lastTargetUrl && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Most Recent Target
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg)',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {selectedUser.metrics.lastTargetUrl}
                      </div>
                    </div>
                  )}

                  {/* Activity History for This User */}
                  <h4 style={{ fontSize: 13, fontWeight: 700, margin: '20px 0 10px' }}>Recent Activity Logs</h4>
                  <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredActivities.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                        No activity records found for this user.
                      </div>
                    ) : (
                      filteredActivities.map((act) => (
                        <div
                          key={act.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg)',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor:
                                  act.type === 'scan'
                                    ? 'rgba(46, 125, 50, 0.12)'
                                    : act.type === 'copilot'
                                    ? 'rgba(139, 92, 246, 0.12)'
                                    : 'var(--bg-hover)',
                                color:
                                  act.type === 'scan'
                                    ? 'var(--pass)'
                                    : act.type === 'copilot'
                                    ? '#8b5cf6'
                                    : 'var(--text-secondary)',
                              }}
                            >
                              {act.type}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {formatTimeAgo(act.timestamp)}
                            </span>
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{act.title}</div>
                          {act.targetUrl && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                              {act.targetUrl}
                            </div>
                          )}
                          {act.detail && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                              {act.detail}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* General Live Audit Trail */
              <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl overflow-hidden shadow-sm">
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>System Activity Audit Trail</h2>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        Immutable ledger of scans executed, AI copilot queries, and auth changes.
                      </p>
                    </div>
                  </div>

                  {/* Filter by Type & Search */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        placeholder="Search logs by action or URL..."
                        style={{
                          width: '100%',
                          padding: '7px 10px 7px 30px',
                          fontSize: 12,
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    <select
                      value={activityTypeFilter}
                      onChange={(e) => setActivityTypeFilter(e.target.value as any)}
                      style={{
                        padding: '7px 10px',
                        fontSize: 12,
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg)',
                        color: 'var(--text)',
                      }}
                    >
                      <option value="all">All Events</option>
                      <option value="scan">🔍 Scans</option>
                      <option value="copilot">🤖 Copilot</option>
                      <option value="role_change">🛡️ Roles</option>
                      <option value="session_revoked">🚫 Sessions</option>
                    </select>
                  </div>
                </div>

                {/* Audit Items Stream */}
                <div style={{ maxHeight: 600, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredActivities.length === 0 ? (
                    <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No audit events recorded yet. Run tests or interact with Copilot to view activity.
                    </div>
                  ) : (
                    filteredActivities.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor:
                                  act.type === 'scan'
                                    ? 'rgba(46, 125, 50, 0.15)'
                                    : act.type === 'copilot'
                                    ? 'rgba(139, 92, 246, 0.15)'
                                    : 'var(--bg-hover)',
                                color:
                                  act.type === 'scan'
                                    ? 'var(--pass)'
                                    : act.type === 'copilot'
                                    ? '#8b5cf6'
                                    : 'var(--text-secondary)',
                              }}
                            >
                              {act.type}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                              {act.email}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatTimeAgo(act.timestamp)}
                          </span>
                        </div>

                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{act.title}</div>

                        {act.targetUrl && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--accent)',
                              fontFamily: 'monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            🎯 {act.targetUrl}
                          </div>
                        )}

                        {act.detail && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {act.detail}
                          </div>
                        )}

                        {act.status && (
                          <div style={{ marginTop: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor:
                                  act.status === 'passed'
                                    ? 'var(--pass-bg)'
                                    : act.status === 'failed'
                                    ? 'var(--fail-bg)'
                                    : 'var(--bg-hover)',
                                color:
                                  act.status === 'passed'
                                    ? 'var(--pass)'
                                    : act.status === 'failed'
                                    ? 'var(--fail)'
                                    : 'var(--text-muted)',
                              }}
                            >
                              {act.status}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Manage Admins Panel ── */}
        <div style={{ maxWidth: 900, margin: '40px auto 0', padding: '0 24px' }}>
          <div className="bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-7 shadow-sm">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <ShieldCheck size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Manage Admins</h3>
            </div>

            {/* Current Admin Emails */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                Permanent Admin Accounts
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {adminEmails.map((em) => (
                  <span
                    key={em}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(217,119,87,0.12)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(217,119,87,0.3)',
                      fontWeight: 500,
                    }}
                  >
                    <Shield size={12} />
                    {em}
                  </span>
                ))}
                {adminEmails.length === 0 && (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</span>
                )}
              </div>
            </div>

            {/* Promote existing user */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                Promote Existing User to Admin
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(telemetry?.users ?? [])
                  .filter((u) => u.role !== 'platform_admin')
                  .map((u) => (
                    <div
                      key={u.uid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg)',
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor:
                            u.status === 'online' ? 'var(--pass)' :
                            u.status === 'idle' ? '#F59E0B' : 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{u.email}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>({u.role})</span>
                      <button
                        type="button"
                        disabled={updatingUid === u.uid}
                        onClick={async () => {
                          setUpdatingUid(u.uid);
                          try {
                            const r = await fetch('/api/admin/users', {
                              method: 'POST',
                              headers: { 
                                'Content-Type': 'application/json',
                                'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
                              },
                              body: JSON.stringify({
                                action: 'update_role',
                                targetUid: u.uid,
                                newRole: 'platform_admin',
                                adminUid: user?.uid,
                              }),
                            });
                            const r2 = await fetch('/api/admin/users', {
                              method: 'POST',
                              headers: { 
                                'Content-Type': 'application/json',
                                'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
                              },
                              body: JSON.stringify({ action: 'add_admin_email', email: u.email }),
                            });
                            const d2 = await r2.json();
                            if (d2.success) {
                              setAdminEmails((prev) => [...new Set([...prev, u.email.toLowerCase()])]);
                            }
                            setActionSuccess(`${u.email} is now an admin`);
                            await fetchTelemetry(true);
                          } catch {
                            alert('Failed to promote user');
                          } finally {
                            setUpdatingUid(null);
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'rgba(217,119,87,0.1)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(217,119,87,0.3)',
                          cursor: updatingUid === u.uid ? 'not-allowed' : 'pointer',
                          opacity: updatingUid === u.uid ? 0.6 : 1,
                        }}
                      >
                        <ShieldCheck size={11} />
                        Make Admin
                      </button>
                    </div>
                  ))}
                {(telemetry?.users ?? []).filter((u) => u.role !== 'platform_admin').length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                    All registered users are already admins.
                  </p>
                )}
              </div>
            </div>

            {/* Add new admin by email */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                Add Admin by Email (for users not yet signed in)
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = newAdminEmail.trim().toLowerCase();
                  if (!trimmed || !trimmed.includes('@')) {
                    setAdminEmailError('Please enter a valid email address');
                    return;
                  }
                  setAddingAdmin(true);
                  setAdminEmailError(null);
                  try {
                    const res = await fetch('/api/admin/users', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        'x-admin-uid': activeUser?.uid || '',
          'x-admin-email': activeUser?.email || '',
                      },
                      body: JSON.stringify({ action: 'add_admin_email', email: trimmed }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setAdminEmails((prev) => [...new Set([...prev, trimmed])]);
                      setNewAdminEmail('');
                      setActionSuccess(`${trimmed} added as admin`);
                    } else {
                      setAdminEmailError('Failed to add admin email');
                    }
                  } catch {
                    setAdminEmailError('Network error, please try again');
                  } finally {
                    setAddingAdmin(false);
                  }
                }}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={newAdminEmail}
                    onChange={(e) => { setNewAdminEmail(e.target.value); setAdminEmailError(null); }}
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      fontSize: 14,
                      borderRadius: 'var(--radius-md)',
                      border: adminEmailError ? '1px solid #EF4444' : '1px solid var(--border)',
                      backgroundColor: 'var(--bg)',
                      color: 'var(--text)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {adminEmailError && (
                    <p style={{ fontSize: 12, color: '#EF4444', margin: '4px 0 0' }}>{adminEmailError}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={addingAdmin || !newAdminEmail.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    cursor: addingAdmin || !newAdminEmail.trim() ? 'not-allowed' : 'pointer',
                    opacity: addingAdmin || !newAdminEmail.trim() ? 0.6 : 1,
                  }}
                >
                  <ShieldCheck size={14} />
                  {addingAdmin ? 'Adding...' : 'Add Admin'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>


    </div>
  );
}
