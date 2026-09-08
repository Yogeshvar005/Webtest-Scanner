import { NextResponse } from 'next/server';
import { analyzeFailureRCA, type RCARequest } from '@wts/nlp';

export const runtime = 'nodejs';
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    const body: RCARequest = await request.json();

    if (!body.errorMessage && !body.failedStepIntent) {
      return NextResponse.json({ error: 'Failure context is required for RCA.' }, { status: 400 });
    }

    const analysis = await analyzeFailureRCA(body);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('RCA failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to diagnose step failure.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
