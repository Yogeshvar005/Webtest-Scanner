'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
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
  Sun,
  Moon,
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
  const { resolvedTheme, setTheme } = useTheme();

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

  // Fetch telemetry
  const fetchTelemetry = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch('/api/admin/telemetry');
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
  }, []);

  // Check initial access & initial load
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
        return;
      }
      fetchTelemetry();
    }
  }, [user, authLoading, router, fetchTelemetry]);

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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  // Check if current user is admin
  const currentUserRole = useMemo(() => {
    if (!user || !telemetry?.users) return null;
    const match = telemetry.users.find((u) => u.uid === user.uid || u.email.toLowerCase() === user.email?.toLowerCase());
    return match?.role || (user.email?.toLowerCase().includes('admin') ? 'platform_admin' : 'tester');
  }, [user, telemetry?.users]);

  if (authLoading || (loading && !telemetry)) {
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
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(16px)',
          backgroundColor: 'rgba(var(--bg-surface-rgb, 255, 255, 255), 0.75)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <ArrowLeft size={15} />
            Back to Scanner
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(217, 119, 87, 0.15)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                Admin Operations Console
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                Live user presence, target audits, session control & telemetry
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border)',
              backgroundColor: autoRefresh ? 'rgba(76, 175, 80, 0.12)' : 'var(--bg-surface)',
              color: autoRefresh ? 'var(--pass)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
            title={autoRefresh ? 'Live refresh active (every 10s)' : 'Live refresh paused'}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: autoRefresh ? 'var(--pass)' : 'var(--text-muted)',
                display: 'inline-block',
              }}
            />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={() => fetchTelemetry(false)}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* Export Dropdown / Buttons */}
          <button
            onClick={handleExportCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
            title="Download audit logs in CSV format"
          >
            <Download size={14} />
            Audit CSV
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Admin User Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px 4px 6px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {user?.email ? user.email.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{user?.email}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(217, 119, 87, 0.15)',
                color: 'var(--accent)',
              }}
            >
              Admin
            </span>
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
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '20px 24px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
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
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '20px 24px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
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
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '20px 24px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
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

            {/* Audit Logs Recorded */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '20px 24px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
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
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
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
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                  position: 'sticky',
                  top: 90,
                }}
              >
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
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
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
      </main>
    </div>
  );
}
