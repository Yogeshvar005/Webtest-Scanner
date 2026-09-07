import { NextResponse } from 'next/server';
import {
  generateSiteSpecificSuites,
  suiteToScenario,
  type SiteReconData,
  type AIProviderConfig,
} from '@wts/nlp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: {
    recon?: SiteReconData;
    userInstruction?: string;
    aiConfig?: AIProviderConfig;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  if (!body.recon) {
    return NextResponse.json({ error: 'Reconnaissance data is required.' }, { status: 400 });
  }

  try {
    const result = await generateSiteSpecificSuites(body.recon, {
      aiConfig: body.aiConfig,
      userInstruction: body.userInstruction,
    });

    // Also attach executable Scenario DSL to each suite
    const targetId = body.recon.domain || 'target-site';
    const suitesWithScenario = result.suites.map((suite) => ({
      ...suite,
      scenario: suiteToScenario(suite, targetId),
    }));

    return NextResponse.json({
      domainCategory: result.domainCategory,
      siteSummary: result.siteSummary,
      suites: suitesWithScenario,
    });
  } catch (error) {
    console.error('Scenario generation failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate site-specific test suites.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
