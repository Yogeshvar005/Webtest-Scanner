import { z } from 'zod';
import { Action, ApiRequestSpec } from './action';
import { Assertion } from './assertion';
import { Provenance } from './provenance';
import { WaitCondition } from './action';
import { ValueExpr } from './value';

/** Drives policy decisions and cleanup obligations. */
export const RiskTag = z.enum([
  'read-only', 'mutating', 'destructive', 'auth', 'pii', 'security-active', 'load',
]);
export type RiskTag = z.infer<typeof RiskTag>;

export const PolicyClass = z.enum(['passive', 'mutating', 'destructive', 'security-active', 'load']);
export type PolicyClass = z.infer<typeof PolicyClass>;

export const EnvName = z.enum(['LOCAL', 'DEV', 'QA', 'UAT', 'STAGING', 'PRODUCTION']);
export type EnvName = z.infer<typeof EnvName>;

export const TestType = z.enum([
  'functional', 'ui', 'api', 'integration', 'accessibility', 'compatibility', 'security',
]);
export type TestType = z.infer<typeof TestType>;

export const Priority = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof Priority>;

export const EvidencePolicy = z.object({
  screenshot: z.enum(['always', 'on-failure', 'never']).default('always'),
  fullPage: z.boolean().default(false),
  console: z.boolean().default(true),
  network: z.boolean().default(true),
  /** DOM snapshots are large; default to failures only to control storage cost. */
  domSnapshot: z.enum(['always', 'on-failure', 'never']).default('on-failure'),
});
export type EvidencePolicy = z.infer<typeof EvidencePolicy>;

export const Step = z.object({
  id: z.string().regex(/^s[0-9]+$/),
  index: z.number().int().min(0),
  /** The semantic intent, e.g. "Submit login" — this is what reports show. */
  intent: z.string().max(200),
  action: Action,
  preWaits: z.array(WaitCondition).max(20).default([]),
  postWaits: z.array(WaitCondition).max(20).default([]),
  assertions: z.array(Assertion).max(50).default([]),
  expected: z.string().max(300).optional(),
  evidence: EvidencePolicy.default({}),
  onFailure: z.enum(['abort', 'continue', 'markBlocked']).default('abort'),
  timeoutMs: z.number().int().min(0).max(600_000).default(30_000),
  riskTags: z.array(RiskTag).min(1).default(['read-only']),
  provenance: Provenance,
});
export type Step = z.infer<typeof Step>;

/** Spec points 33 and 34: every test defines how it undoes itself. */
export const CleanupBlock = z.object({
  strategy: z.enum(['best-effort', 'required', 'none']).default('best-effort'),
  runOnFailure: z.boolean().default(true),
  steps: z.array(Step).max(50).default([]),
  lineageReaper: z
    .array(
      z.object({
        entity: z.string().max(64),
        matchPrefix: z.string().max(64),
        maxAgeHours: z.number().int().min(1).max(720).default(24),
      }),
    )
    .max(20)
    .default([]),
});
export type CleanupBlock = z.infer<typeof CleanupBlock>;

/** Spec point 7: referential test data as an explicit dependency graph. */
export const FixtureDecl = z.object({
  ref: z.string().max(64),
  entity: z.string().max(64),
  dependsOn: z.array(z.string().max(64)).max(20).default([]),
  createVia: z.discriminatedUnion('via', [
    z.object({ via: z.literal('ui'), steps: z.array(Step).max(50) }),
    z.object({ via: z.literal('api'), request: ApiRequestSpec, idPath: z.string().max(200) }),
    z.object({ via: z.literal('existing'), lookup: z.record(z.string().max(64), ValueExpr) }),
  ]),
  fields: z.record(z.string().max(64), ValueExpr).default({}),
  cleanup: z.discriminatedUnion('via', [
    z.object({ via: z.literal('ui'), steps: z.array(Step).max(50) }),
    z.object({ via: z.literal('api'), request: ApiRequestSpec }),
    z.object({ via: z.literal('none') }),
  ]),
});
export type FixtureDecl = z.infer<typeof FixtureDecl>;

/** Spec point 5, "Compatibility". */
export const ExecutionMatrix = z.object({
  browsers: z.array(z.enum(['chromium', 'firefox', 'webkit', 'msedge'])).min(1).default(['chromium']),
  viewports: z.array(z.enum(['mobile', 'tablet', 'desktop'])).min(1).default(['desktop']),
});
export type ExecutionMatrix = z.infer<typeof ExecutionMatrix>;

/** Spec point 21. */
export const Lifecycle = z.enum([
  'draft', 'ai_generated', 'human_reviewed', 'approved', 'automated', 'archived',
]);
export type Lifecycle = z.infer<typeof Lifecycle>;

export const Scenario = z.object({
  schemaVersion: z.literal('1.0'),
  id: z.string().max(64),
  version: z.number().int().min(1),
  title: z.string().max(200),
  description: z.string().max(2000).optional(),
  /** Exactly what the tester typed. Kept for audit, never re-parsed at run time. */
  originalNaturalLanguage: z.string().max(8000).optional(),
  testTypes: z.array(TestType).min(1),
  priority: Priority.default('P2'),
  targetId: z.string().max(64),
  environment: EnvName,
  requirementIds: z.array(z.string().max(64)).max(100).default([]),
  preconditions: z.array(z.object({ text: z.string().max(500), provenance: Provenance })).max(50).default([]),
  /** Spec point 3: what the engine could not infer, and what it assumed instead. */
  openQuestions: z
    .array(
      z.object({
        question: z.string().max(500),
        assumedAnswer: z.string().max(500),
        provenance: Provenance,
      }),
    )
    .max(50)
    .default([]),
  fixtures: z.array(FixtureDecl).max(50).default([]),
  setup: z.array(Step).max(50).default([]),
  /** Capped so a scenario document stays comfortably inside Firestore's 1 MiB limit. */
  steps: z.array(Step).min(1).max(200),
  cleanup: CleanupBlock.default({}),
  dependsOn: z.array(z.string().max(64)).max(50).default([]),
  matrix: ExecutionMatrix.optional(),
  lifecycle: Lifecycle,
  policyClass: PolicyClass,
  provenance: Provenance,
});
export type Scenario = z.infer<typeof Scenario>;

/** Every step in a scenario, including setup and cleanup, in execution order. */
export function allSteps(s: Scenario): Step[] {
  return [...s.setup, ...s.steps, ...s.cleanup.steps];
}
