import { NextResponse } from 'next/server';
import { getAdminTelemetry } from '../../../../lib/admin-store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const telemetry = await getAdminTelemetry();
    return NextResponse.json(telemetry);
  } catch (err: unknown) {
    console.error('[Admin Telemetry API Error]:', err);
    return NextResponse.json({ error: 'Failed to retrieve telemetry' }, { status: 500 });
  }
}
