import type {
  Action, LintContext, Provenance, Scenario, SemanticTarget, Step, FixtureDecl,
} from '../src/index';

export const testerOrigin: Provenance = { source: 'tester', confidence: 1 };

export function target(over: Partial<SemanticTarget> = {}): SemanticTarget {
  return {
    kind: 'semantic',
    role: 'button',
    name: 'Login',
    nameMatch: 'exact',
    origin: testerOrigin,
    ...over,
  };
}

export function step(over: Partial<Step> = {}): Step {
  return {
    id: 's1',
    index: 0,
    intent: 'Click login',
    action: { type: 'click', target: target() } as Action,
    preWaits: [],
    postWaits: [],
    assertions: [],
    evidence: { screenshot: 'always', fullPage: false, console: true, network: true, domSnapshot: 'on-failure' },
    onFailure: 'abort',
    timeoutMs: 30_000,
    riskTags: ['read-only'],
    provenance: testerOrigin,
    ...over,
  };
}

export function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    schemaVersion: '1.0',
    id: 'sc_1',
    version: 1,
    title: 'Example scenario',
    testTypes: ['functional'],
    priority: 'P2',
    targetId: 'tgt_1',
    environment: 'QA',
    requirementIds: [],
    preconditions: [],
    openQuestions: [],
    fixtures: [],
    setup: [],
    steps: [step()],
    cleanup: { strategy: 'best-effort', runOnFailure: true, steps: [], lineageReaper: [] },
    dependsOn: [],
    lifecycle: 'approved',
    policyClass: 'passive',
    provenance: testerOrigin,
    ...over,
  };
}

export function fixture(over: Partial<FixtureDecl> = {}): FixtureDecl {
  return {
    ref: 'customerA',
    entity: 'Customer',
    dependsOn: [],
    createVia: { via: 'api', request: apiReq(), idPath: '$.id' },
    fields: {},
    cleanup: { via: 'api', request: apiReq('DELETE') },
    ...over,
  };
}

export function apiReq(method: 'GET' | 'POST' | 'DELETE' = 'POST') {
  return {
    method,
    path: '/api/customers',
    hostRef: 'default',
    headers: {},
    query: {},
    timeoutMs: 30_000,
  };
}

export const ctx: LintContext = {
  allowedOrigins: { primary: 'https://app.example.com' },
  allowedApiHosts: { default: 'https://api.example.com' },
};
