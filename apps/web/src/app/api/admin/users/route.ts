import { NextResponse } from 'next/server';
import { updateUserRole, revokeUserSession, reinstateUserSession, addAdminEmail, getAdminEmails, getUserRole } from '../../../../lib/admin-store';
import type { Role } from '@wts/policy';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const { verifyIdToken } = await import('../../../../lib/firebase-admin');
    
    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const adminUid = decodedToken.uid;
    const adminEmail = decodedToken.email;

    let isPerm = false;
    if (adminEmail) {
      const perm = await getAdminEmails();
      isPerm = perm.includes(adminEmail.toLowerCase().trim());
    }

    const requesterRole = adminUid ? await getUserRole(adminUid) : null;
    if (requesterRole !== 'platform_admin' && !isPerm) {
      return NextResponse.json({ error: 'Forbidden: Requires platform_admin privileges' }, { status: 403 });
    }

    const body = await req.json();
    const { action, targetUid, newRole, email } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    if (action === 'update_role') {
      if (!targetUid || !newRole) {
        return NextResponse.json({ error: 'Missing targetUid or newRole' }, { status: 400 });
      }
      const success = await updateUserRole(targetUid, newRole as Role, adminUid || 'admin');
      return NextResponse.json({ success });
    }

    if (action === 'revoke_session') {
      if (!targetUid) return NextResponse.json({ error: 'Missing targetUid' }, { status: 400 });
      const success = await revokeUserSession(targetUid, adminUid || 'admin');
      return NextResponse.json({ success });
    }

    if (action === 'reinstate_session') {
      if (!targetUid) return NextResponse.json({ error: 'Missing targetUid' }, { status: 400 });
      const success = await reinstateUserSession(targetUid);
      return NextResponse.json({ success });
    }

    // Add a new email to the permanent admin list (takes effect on next login of that user)
    if (action === 'add_admin_email') {
      if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
      const success = await addAdminEmail(email.toLowerCase().trim());
      return NextResponse.json({ success });
    }

    // Get current admin emails list
    if (action === 'get_admin_emails') {
      const emails = await getAdminEmails();
      return NextResponse.json({ success: true, emails });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Admin Users API Error]:', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
