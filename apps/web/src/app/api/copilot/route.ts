import { NextResponse } from 'next/server';
import {
  chatWithQACopilot,
  type CopilotMessage,
  type SiteReconData,
  type AIProviderConfig,
} from '@wts/nlp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: {
    messages?: CopilotMessage[];
    siteContext?: SiteReconData;
    aiConfig?: AIProviderConfig;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Messages are required.' }, { status: 400 });
  }

  try {
    const response = await chatWithQACopilot({
      messages: body.messages,
      siteContext: body.siteContext,
      aiConfig: body.aiConfig,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Copilot interaction failed:', error);
    return NextResponse.json(
      {
        error: 'Copilot interaction failed.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
