import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { hasBlockingIssues, lintScenario, type EnvName } from '@wts/dsl';
import { parseScenario } from '@wts/nlp';
import { checkDenylist, effectiveTier, requiresManualReview } from '@wts/ownership';
import type { PolicyRequest, Role } from '@wts/policy';
import { executeScenario } from '@wts/runner';

// Playwright needs a real Node runtime and a generous budget.
export const runtime = 'nodejs';
export const maxDuration = 300;

interface RunBody {
  url?: string;
  instructions?: string;
  environment?: EnvName;
  /** Simulated ownership tier, so the gate can be demonstrated both ways. */
  ownershipTier?: 0 | 1 | 2;
  roles?: Role[];
}

function badRequest(message: string, hint?: string) {
  return NextResponse.json({ error: message, hint }, { status: 400 });
}

export async function POST(request: Request) {
  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const rawUrl = (body.url ?? '').trim();
  if (!rawUrl) return badRequest('Enter the URL of the site you want to test.');

  let target: URL;
  try {
    target = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return badRequest(`"${rawUrl}" is not a valid URL.`, 'Try something like https://example.com');
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return badRequest('Only http and https URLs can be tested.');
  }

  // The denylist is checked before anything else and outranks verification.
  const denied = checkDenylist(target.hostname);
  if (denied) {
    return NextResponse.json(
      {
        error: 'This target cannot be tested through this platform.',
        code: 'DENYLISTED_DOMAIN',
        detail: denied.reason,
        category: denied.category,
      },
      { status: 403 },
    );
  }

  const environment: EnvName = body.environment ?? 'QA';
  const origin = `${target.protocol}//${target.host}`;
  const targetId = target.hostname;

  const { scenario, unparsed, meanConfidence } = parseScenario({
    naturalLanguage: body.instructions ?? '',
    targetId,
    environment,
  });

  // Lint runs here and would run again in the worker, which never trusts this tier.
  const lintIssues = lintScenario(scenario, {
    allowedOrigins: { primary: origin },
    allowedApiHosts: {},
  });

  if (hasBlockingIssues(lintIssues)) {
    return NextResponse.json(
      { error: 'The scenario failed validation.', issues: lintIssues.filter((i) => i.severity === 'error') },
      { status: 422 },
    );
  }

  const recordedTier = body.ownershipTier ?? 0;
  const tier = effectiveTier(recordedTier);

  const policyRequest: PolicyRequest = {
    subject: { uid: 'local-dev', orgId: 'local', roles: body.roles ?? ['automation_engineer'] },
    target: {
      targetId,
      ownershipTier: tier,
      origins: [origin],
      denylisted: false,
      prodWriteGrant: false,
    },
    environment,
    policyClass: scenario.policyClass,
    dataLineage: 'unknown',
    budget: { requestsUsedToday: 0, requestsAllowedToday: 5_000 },
  };

  const runId = randomUUID().slice(0, 8);

  const result = await executeScenario({
    scenario,
    targetUrl: origin,
    policyRequest,
    artifactDir: join(process.cwd(), 'public', 'artifacts'),
    artifactUrlPrefix: '/artifacts',
    runId,
  });

  return NextResponse.json({
    ...result,
    lintIssues,
    unparsed,
    meanConfidence,
    reviewFlag: requiresManualReview(target.hostname) ?? null,
    ownership: { recordedTier, effectiveTier: tier },
  });
}
