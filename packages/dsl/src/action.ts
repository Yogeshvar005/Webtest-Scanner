import { z } from 'zod';
import { SemanticTarget } from './target';
import { ValueExpr } from './value';

/**
 * Conditions the executor may wait on. There is deliberately no `sleep`
 * action anywhere in this DSL — spec point 19 is enforced by omission, not by
 * convention.
 */
export const WaitCondition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('elementVisible'), target: SemanticTarget, timeoutMs: z.number().int().min(0).max(120_000).default(15_000) }),
  z.object({ type: z.literal('elementHidden'), target: SemanticTarget, timeoutMs: z.number().int().min(0).max(120_000).default(15_000) }),
  z.object({ type: z.literal('urlChanged'), pattern: z.string().max(500).optional() }),
  z.object({ type: z.literal('requestSettled'), urlPattern: z.string().max(500), method: z.string().max(10).optional() }),
  z.object({ type: z.literal('networkQuiescent'), idleMs: z.number().int().min(0).max(30_000).default(500), ignorePatterns: z.array(z.string().max(500)).max(50).default([]) }),
  z.object({ type: z.literal('domStable'), quietMs: z.number().int().min(0).max(30_000).default(300) }),
  z.object({ type: z.literal('navigationComplete') }),
]);
export type WaitCondition = z.infer<typeof WaitCondition>;

export const HttpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
export type HttpMethod = z.infer<typeof HttpMethod>;

export const ApiRequestSpec = z.object({
  method: HttpMethod,
  /** Path only. The host comes from the target's declared API allowlist. */
  path: z.string().max(2000),
  hostRef: z.string().max(64).default('default'),
  headers: z.record(z.string().max(120), ValueExpr).default({}),
  query: z.record(z.string().max(120), ValueExpr).default({}),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().min(0).max(120_000).default(30_000),
});
export type ApiRequestSpec = z.infer<typeof ApiRequestSpec>;

export const MockRule = z.object({
  urlPattern: z.string().max(500),
  method: HttpMethod.optional(),
  respond: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('status'),
      status: z.number().int().min(100).max(599),
      body: z.unknown().optional(),
      headers: z.record(z.string(), z.string()).default({}),
    }),
    z.object({ mode: z.literal('timeout') }),
    z.object({ mode: z.literal('slow'), delayMs: z.number().int().min(0).max(120_000) }),
    z.object({ mode: z.literal('malformed') }),
  ]),
});
export type MockRule = z.infer<typeof MockRule>;

export const SecurityProbeSpec = z.object({
  probe: z.enum([
    'securityHeaders', 'cookieFlags', 'tlsConfig', 'unsafeRedirect',
    'inputValidation', 'sensitiveDataExposure', 'rateLimit', 'idor', 'csrf',
  ]),
  target: SemanticTarget.optional(),
  payloadSet: z.string().max(64).optional(),
  maxRequests: z.number().int().min(1).max(500).default(20),
});
export type SecurityProbeSpec = z.infer<typeof SecurityProbeSpec>;

export const ViewportPreset = z.union([
  z.enum(['mobile', 'tablet', 'desktop']),
  z.object({ w: z.number().int().min(200).max(4000), h: z.number().int().min(200).max(4000) }),
]);

export const FileRef = z.object({
  /** Generated fixture files only — never an arbitrary host path. */
  fixtureName: z.string().max(120),
  mimeType: z.string().max(120).default('application/octet-stream'),
  sizeBytes: z.number().int().min(0).max(50_000_000).default(1024),
});

/**
 * The complete action vocabulary. There is no `evaluateJs`, no `rawSelector`,
 * no shell access, and `navigate` cannot express an arbitrary URL — it takes a
 * path plus a reference into the target's verified origin allowlist. This
 * closed vocabulary is the real containment boundary for prompt injection;
 * the prompt wording is only defence in depth.
 */
export const Action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), path: z.string().max(2000), originRef: z.string().max(64).default('primary') }),
  z.object({ type: z.literal('click'), target: SemanticTarget }),
  z.object({ type: z.literal('fill'), target: SemanticTarget, value: ValueExpr }),
  z.object({ type: z.literal('select'), target: SemanticTarget, value: ValueExpr }),
  z.object({ type: z.literal('check'), target: SemanticTarget, state: z.boolean() }),
  z.object({ type: z.literal('press'), keys: z.string().max(40) }),
  z.object({ type: z.literal('upload'), target: SemanticTarget, file: FileRef }),
  z.object({
    type: z.literal('extract'),
    target: SemanticTarget,
    as: z.string().max(64),
    from: z.enum(['text', 'value', 'attribute', 'count']),
    attribute: z.string().max(120).optional(),
  }),
  z.object({ type: z.literal('waitFor'), condition: WaitCondition }),
  z.object({ type: z.literal('apiRequest'), request: ApiRequestSpec, saveAs: z.string().max(64) }),
  z.object({ type: z.literal('setViewport'), preset: ViewportPreset }),
  z.object({ type: z.literal('a11yAudit'), scope: SemanticTarget.optional(), ruleset: z.enum(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).default('wcag21aa') }),
  z.object({ type: z.literal('mock'), rules: z.array(MockRule).max(100) }),
  z.object({ type: z.literal('switchIdentity'), credentialProfileRef: z.string().max(64) }),
  z.object({ type: z.literal('screenshot'), label: z.string().max(80) }),
  z.object({ type: z.literal('securityProbe'), probe: SecurityProbeSpec }),
]);
export type Action = z.infer<typeof Action>;

/** Extracts every SemanticTarget an action references. */
export function actionTargets(a: Action): SemanticTarget[] {
  if ('target' in a && a.target) return [a.target];
  if (a.type === 'a11yAudit' && a.scope) return [a.scope];
  if (a.type === 'securityProbe' && a.probe.target) return [a.probe.target];
  if (a.type === 'waitFor' && 'target' in a.condition) return [a.condition.target];
  return [];
}

/** Extracts every ValueExpr an action references. */
export function actionValues(a: Action): ValueExpr[] {
  const out: ValueExpr[] = [];
  if ('value' in a && a.value) out.push(a.value);
  if (a.type === 'apiRequest') {
    out.push(...Object.values(a.request.headers), ...Object.values(a.request.query));
  }
  return out;
}
