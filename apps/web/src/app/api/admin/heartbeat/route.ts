import { NextResponse } from 'next/server';
import { recordHeartbeat } from '../../../../lib/admin-store';

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

    const text = await req.text();
    if (!text) return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    const body = JSON.parse(text);
    const { displayName, avatarUrl, currentAction } = body;
    
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await recordHeartbeat({
      uid,
      email: email || '',
      displayName,
      avatarUrl,
      ip,
      userAgent,
      currentAction,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[Heartbeat API Error]:', err);
    return NextResponse.json({ error: 'Failed to record heartbeat' }, { status: 500 });
  }
}
