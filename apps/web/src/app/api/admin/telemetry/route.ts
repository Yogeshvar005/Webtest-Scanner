import { NextResponse } from 'next/server';
import { getAdminTelemetry, getUserRole } from '../../../../lib/admin-store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const adminUid = req.headers.get('x-admin-uid');
    if (!adminUid) {
      return NextResponse.json({ error: 'Unauthorized: Missing admin UID' }, { status: 401 });
    }

    const requesterRole = await getUserRole(adminUid);
    if (requesterRole !== 'platform_admin') {
      return NextResponse.json({ error: 'Forbidden: Requires platform_admin privileges' }, { status: 403 });
    }

    const telemetry = await getAdminTelemetry();
    return NextResponse.json(telemetry);
  } catch (err: unknown) {
    console.error('[Admin Telemetry API Error]:', err);
    return NextResponse.json({ error: 'Failed to retrieve telemetry' }, { status: 500 });
  }
}
