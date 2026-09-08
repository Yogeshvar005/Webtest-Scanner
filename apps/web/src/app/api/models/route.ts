import { NextResponse } from 'next/server';
import { getOllamaStatus } from '@wts/nlp';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await getOllamaStatus();
    const cloudAvailable = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY);

    return NextResponse.json({
      local: status,
      cloudAvailable,
      recommended: status.online && status.models.length > 0 ? 'local' : 'gemini',
    });
  } catch {
    return NextResponse.json(
      {
        local: { online: false, models: [] },
        cloudAvailable: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
        recommended: 'gemini',
      },
      { status: 200 }
    );
  }
}
