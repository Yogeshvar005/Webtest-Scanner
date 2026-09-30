import { NextResponse } from 'next/server';
import { getAdminTelemetry, getUserRole } from '../../../../lib/admin-store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
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

    const { getAdminEmails, getUserRole } = await import('../../../../lib/admin-store');
    
    let isPerm = false;
    if (adminEmail) {
      const perm = await getAdminEmails();
      isPerm = perm.includes(adminEmail.toLowerCase().trim());
    }

    const requesterRole = adminUid ? await getUserRole(adminUid) : null;
    if (requesterRole !== 'platform_admin' && !isPerm) {
      return NextResponse.json({ error: 'Forbidden: Requires platform_admin privileges' }, { status: 403 });
    }

    const telemetry = await getAdminTelemetry();
    return NextResponse.json(telemetry);
  } catch (err: unknown) {
    console.error('[Admin Telemetry API Error]:', err);
    return NextResponse.json({ error: 'Failed to retrieve telemetry' }, { status: 500 });
  }
}
