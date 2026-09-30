import { NextResponse } from 'next/server';
import { recordHeartbeat } from '../../../../lib/admin-store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (!text) return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    const body = JSON.parse(text);
    const { uid, email, displayName, avatarUrl, currentAction } = body;

    if (!uid || !email) {
      return NextResponse.json({ error: 'Missing uid or email' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await recordHeartbeat({
      uid,
      email,
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
