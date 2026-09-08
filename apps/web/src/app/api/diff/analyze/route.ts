import { NextResponse } from 'next/server';
import { analyzeVisualNoise, type VisualDiffAIRequest } from '@wts/nlp';

export const runtime = 'nodejs';
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    const body: VisualDiffAIRequest = await request.json();

    if (!body.currentScreenshot || !body.baselineScreenshot) {
      return NextResponse.json(
        { error: 'Both currentScreenshot and baselineScreenshot are required.' },
        { status: 400 }
      );
    }

    const analysis = await analyzeVisualNoise(body);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Visual AI Diff analysis failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze visual differences.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
