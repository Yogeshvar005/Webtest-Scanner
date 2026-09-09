import { NextResponse } from 'next/server';
import { updateUserRole, revokeUserSession, reinstateUserSession } from '../../../../lib/admin-store';
import type { Role } from '@wts/policy';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, targetUid, newRole, adminUid } = body;

    if (!action || !targetUid) {
      return NextResponse.json({ error: 'Missing action or targetUid' }, { status: 400 });
    }

    if (action === 'update_role') {
      if (!newRole) {
        return NextResponse.json({ error: 'Missing newRole' }, { status: 400 });
      }
      const success = await updateUserRole(targetUid, newRole as Role, adminUid || 'admin');
      return NextResponse.json({ success });
    }

    if (action === 'revoke_session') {
      const success = await revokeUserSession(targetUid, adminUid || 'admin');
      return NextResponse.json({ success });
    }

    if (action === 'reinstate_session') {
      const success = await reinstateUserSession(targetUid);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('[Admin Users API Error]:', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
