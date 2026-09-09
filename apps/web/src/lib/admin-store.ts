import { promises as fs } from 'fs';
import path from 'path';
import type { Role } from '@wts/policy';

export interface UserPresence {
  uid: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: Role;
  status: 'online' | 'idle' | 'offline';
  lastSeenAt: string; // ISO
  lastAction?: string;
  lastIp?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  sessionRevoked?: boolean;
  metrics: {
    totalScans: number;
    passedScans: number;
    failedScans: number;
    copilotQueries: number;
    lastTargetUrl?: string;
  };
}

export interface ActivityLog {
  id: string;
  uid: string;
  email: string;
  type: 'scan' | 'copilot' | 'export' | 'login' | 'role_change' | 'session_revoked';
  title: string;
  detail?: string;
  targetUrl?: string;
  status?: 'passed' | 'failed' | 'info';
  timestamp: string; // ISO
  metadata?: Record<string, unknown>;
}

export interface AdminStoreData {
  users: Record<string, UserPresence>;
  activities: ActivityLog[];
  adminEmails: string[];
}

const STORE_PATH = path.join(process.cwd(), '.admin-telemetry.json');

// In-memory cache
let inMemoryStore: AdminStoreData | null = null;

function parseUserAgent(ua?: string): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };
  let browser = 'Browser';
  let os = 'OS';

  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';

  if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return { browser, os };
}

async function loadStore(): Promise<AdminStoreData> {
  if (inMemoryStore) return inMemoryStore;

  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    inMemoryStore = JSON.parse(raw) as AdminStoreData;
  } catch {
    // Default initial seed
    inMemoryStore = {
      users: {},
      activities: [],
      // Only these emails are permanently granted platform_admin on login.
      // Changes here require a redeploy. Runtime promotions persist in-memory only.
      adminEmails: ['yogeshvar2508@gmail.com'],
    };
  }

  return inMemoryStore;
}

async function saveStore(store: AdminStoreData): Promise<void> {
  inMemoryStore = store;
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[AdminStore] Could not write to disk, using in-memory store:', err);
  }
}

export async function recordHeartbeat(params: {
  uid: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  ip?: string;
  userAgent?: string;
  currentAction?: string;
}): Promise<{ valid: boolean; role: Role }> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const { browser, os } = parseUserAgent(params.userAgent);

  const existing = store.users[params.uid];
  const isRevoked = existing?.sessionRevoked ?? false;

  // Assign admin role only if email is in the hardcoded adminEmails list.
  // Runtime role changes (from admin console) are preserved via existing?.role.
  let assignedRole: Role = existing?.role || 'tester';
  const isPermanentAdmin = store.adminEmails.includes(params.email.toLowerCase());

  if (isPermanentAdmin) {
    // Always enforce platform_admin for seeded admins — cannot be downgraded
    assignedRole = 'platform_admin';
  }

  store.users[params.uid] = {
    uid: params.uid,
    email: params.email,
    displayName: params.displayName || existing?.displayName || params.email.split('@')[0],
    avatarUrl: params.avatarUrl || existing?.avatarUrl,
    role: assignedRole,
    status: 'online',
    lastSeenAt: now,
    lastAction: params.currentAction || existing?.lastAction || 'Active in app',
    lastIp: params.ip || existing?.lastIp || '127.0.0.1',
    userAgent: params.userAgent || existing?.userAgent,
    browser,
    os,
    sessionRevoked: isRevoked,
    metrics: existing?.metrics || {
      totalScans: 0,
      passedScans: 0,
      failedScans: 0,
      copilotQueries: 0,
    },
  };

  await saveStore(store);

  return { valid: !isRevoked, role: assignedRole };
}

export async function recordActivity(activity: Omit<ActivityLog, 'id' | 'timestamp'>): Promise<ActivityLog> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const fullLog: ActivityLog = {
    ...activity,
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
  };

  // Update user metrics
  const user = store.users[activity.uid];
  if (user) {
    user.lastSeenAt = now;
    user.status = 'online';
    user.lastAction = activity.title;

    if (activity.type === 'scan') {
      user.metrics.totalScans += 1;
      if (activity.status === 'passed') user.metrics.passedScans += 1;
      if (activity.status === 'failed') user.metrics.failedScans += 1;
      if (activity.targetUrl) user.metrics.lastTargetUrl = activity.targetUrl;
    } else if (activity.type === 'copilot') {
      user.metrics.copilotQueries += 1;
    }
  }

  // Prepend to activities, keep last 1000 logs
  store.activities.unshift(fullLog);
  if (store.activities.length > 1000) {
    store.activities = store.activities.slice(0, 1000);
  }

  await saveStore(store);
  return fullLog;
}

export async function getAdminTelemetry(): Promise<{
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
}> {
  const store = await loadStore();
  const now = Date.now();

  const userList = Object.values(store.users).map((u) => {
    const elapsedMinutes = (now - new Date(u.lastSeenAt).getTime()) / (1000 * 60);
    let status: 'online' | 'idle' | 'offline' = 'offline';
    if (elapsedMinutes < 2) status = 'online';
    else if (elapsedMinutes < 15) status = 'idle';

    return { ...u, status };
  });

  const onlineUsers = userList.filter((u) => u.status === 'online').length;
  const idleUsers = userList.filter((u) => u.status === 'idle').length;
  const offlineUsers = userList.filter((u) => u.status === 'offline').length;

  let totalScans = 0;
  let passedScans = 0;
  let failedScans = 0;
  let totalCopilotQueries = 0;

  for (const u of userList) {
    totalScans += u.metrics.totalScans;
    passedScans += u.metrics.passedScans;
    failedScans += u.metrics.failedScans;
    totalCopilotQueries += u.metrics.copilotQueries;
  }

  return {
    users: userList.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()),
    activities: store.activities.slice(0, 100),
    metrics: {
      totalUsers: userList.length,
      onlineUsers,
      idleUsers,
      offlineUsers,
      totalScans,
      passedScans,
      failedScans,
      totalCopilotQueries,
    },
  };
}

export async function getUserRole(uid: string): Promise<Role | null> {
  const store = await loadStore();
  return store.users[uid]?.role || null;
}

export async function updateUserRole(uid: string, newRole: Role, adminUid: string): Promise<boolean> {
  const store = await loadStore();
  const target = store.users[uid];
  if (!target) return false;

  const oldRole = target.role;
  target.role = newRole;

  await recordActivity({
    uid: adminUid,
    email: store.users[adminUid]?.email || 'Admin',
    type: 'role_change',
    title: `Changed role of ${target.email} from ${oldRole} to ${newRole}`,
    status: 'info',
  });

  await saveStore(store);
  return true;
}

export async function revokeUserSession(uid: string, adminUid: string): Promise<boolean> {
  const store = await loadStore();
  const target = store.users[uid];
  if (!target) return false;

  target.sessionRevoked = true;
  target.status = 'offline';

  await recordActivity({
    uid: adminUid,
    email: store.users[adminUid]?.email || 'Admin',
    type: 'session_revoked',
    title: `Revoked active session for ${target.email}`,
    status: 'info',
  });

  await saveStore(store);
  return true;
}

export async function reinstateUserSession(uid: string): Promise<boolean> {
  const store = await loadStore();
  const target = store.users[uid];
  if (!target) return false;

  target.sessionRevoked = false;
  await saveStore(store);
  return true;
}

export async function addAdminEmail(email: string): Promise<boolean> {
  const store = await loadStore();
  const normalised = email.toLowerCase().trim();
  if (store.adminEmails.includes(normalised)) return true; // already present

  store.adminEmails.push(normalised);

  // Also immediately promote the user if they are already in the store
  for (const u of Object.values(store.users)) {
    if (u.email.toLowerCase() === normalised) {
      u.role = 'platform_admin';
    }
  }

  await saveStore(store);
  return true;
}

export async function getAdminEmails(): Promise<string[]> {
  const store = await loadStore();
  return store.adminEmails;
}

