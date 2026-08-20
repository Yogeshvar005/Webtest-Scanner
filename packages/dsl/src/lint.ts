import { actionTargets, actionValues, type Action } from './action';
import { isHumanApproved } from './provenance';
import { allSteps, type FixtureDecl, type Scenario, type Step } from './scenario';
import { walkTarget, describeTarget } from './target';
import type { ValueExpr } from './value';

export type LintSeverity = 'error' | 'warning';

export interface LintIssue {
  rule: string;
  severity: LintSeverity;
  message: string;
  path: string;
}

export interface LintContext {
  /** Named origins the target has been verified for, e.g. { primary: 'https://app.example.com' }. */
  allowedOrigins: Record<string, string>;
  /** Named API hosts declared on the target. */
  allowedApiHosts: Record<string, string>;
  /** Credential profile refs that exist for this project. */
  knownCredentialProfiles?: string[];
  /** Warn above this many steps; the hard cap lives in the schema. */
  stepWarnThreshold?: number;
}

const DEFAULT_STEP_WARN = 60;

/** Field names whose value must never be a literal. */
const SECRETISH_FIELD = /pass|pwd|secret|token|apikey|api_key|credential|otp|pin/i;

/** Shapes that look like real credentials even outside an obviously-named field. */
const SECRET_VALUE_PATTERNS: Array<[string, RegExp]> = [
  ['JWT', /^ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-[A-Za-z0-9]{32,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const DESTRUCTIVE_LABEL = /\b(delete|remove|drop|purge|destroy|wipe|erase)\b/i;

function issue(rule: string, severity: LintSeverity, message: string, path: string): LintIssue {
  return { rule, severity, message, path };
}

function literalString(v: ValueExpr): string | undefined {
  return v.kind === 'literal' && typeof v.value === 'string' ? v.value : undefined;
}

/** no-literal-secrets: credentials must be `{kind:'secret'}` references. */
function checkLiteralSecrets(step: Step, path: string, out: LintIssue[]): void {
  const action = step.action;

  if ((action.type === 'fill' || action.type === 'select') && action.value.kind === 'literal') {
    const role = action.target.role;
    const label = `${action.target.name ?? ''} ${action.target.labelText ?? ''} ${action.target.placeholder ?? ''}`;
    if (role === 'password' || SECRETISH_FIELD.test(label)) {
      out.push(
        issue(
          'no-literal-secrets',
          'error',
          `Literal value supplied to ${describeTarget(action.target)}. Use {kind:'secret', name:'...'} so the value is resolved from the secret store and redacted from evidence.`,
          `${path}.action.value`,
        ),
      );
    }
  }

  for (const [idx, value] of actionValues(action).entries()) {
    const text = literalString(value);
    if (text === undefined) continue;
    for (const [label, pattern] of SECRET_VALUE_PATTERNS) {
      if (pattern.test(text)) {
        out.push(
          issue(
            'no-literal-secrets',
            'error',
            `Value looks like a ${label}. Credentials must never appear literally in a scenario.`,
            `${path}.action.values[${idx}]`,
          ),
        );
        break;
      }
    }
  }
}

/**
 * no-ai-css-fallback: a raw CSS selector is only legitimate when the healing
 * engine proposed it AND a human approved it. Anything else means a model (or
 * an injection) has smuggled a brittle selector into the scenario.
 */
function checkCssFallback(step: Step, path: string, out: LintIssue[]): void {
  for (const target of actionTargets(step.action)) {
    for (const node of walkTarget(target)) {
      if (node.hints?.cssFallback === undefined) continue;
      if (node.origin.source !== 'healed' || !isHumanApproved(node.origin)) {
        out.push(
          issue(
            'no-ai-css-fallback',
            'error',
            `cssFallback on ${describeTarget(node)} was authored by '${node.origin.source}' without human approval. Raw selectors may only be introduced by an approved self-healing proposal.`,
            `${path}.hints.cssFallback`,
          ),
        );
      }
    }
  }
}

/** origin-allowlist: navigation and API calls may not leave verified hosts. */
function checkOriginAllowlist(action: Action, ctx: LintContext, path: string, out: LintIssue[]): void {
  if (action.type === 'navigate') {
    if (!(action.originRef in ctx.allowedOrigins)) {
      out.push(
        issue(
          'origin-allowlist',
          'error',
          `Unknown originRef '${action.originRef}'. Allowed: ${Object.keys(ctx.allowedOrigins).join(', ') || '(none)'}.`,
          `${path}.action.originRef`,
        ),
      );
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(action.path) || action.path.startsWith('//')) {
      out.push(
        issue(
          'origin-allowlist',
          'error',
          `navigate.path must be a path, not an absolute URL ('${action.path}'). Absolute URLs cannot express a host outside the verified allowlist.`,
          `${path}.action.path`,
        ),
      );
    }
  }

  if (action.type === 'apiRequest' && !(action.request.hostRef in ctx.allowedApiHosts)) {
    out.push(
      issue(
        'origin-allowlist',
        'error',
        `Unknown API hostRef '${action.request.hostRef}'. Allowed: ${Object.keys(ctx.allowedApiHosts).join(', ') || '(none)'}.`,
        `${path}.action.request.hostRef`,
      ),
    );
  }
}

/** risk-tags-consistent: destructive work must be labelled destructive. */
function checkRiskTags(step: Step, path: string, out: LintIssue[]): void {
  const tags = new Set(step.riskTags);
  const action = step.action;

  const looksDestructive =
    (action.type === 'apiRequest' && action.request.method === 'DELETE') ||
    (action.type === 'click' && DESTRUCTIVE_LABEL.test(`${action.target.name ?? ''} ${action.target.labelText ?? ''}`)) ||
    DESTRUCTIVE_LABEL.test(step.intent);

  if (looksDestructive && !tags.has('destructive')) {
    out.push(
      issue(
        'risk-tags-consistent',
        'error',
        `Step "${step.intent}" performs what looks like a destructive operation but is not tagged 'destructive'. The policy engine relies on this tag to block deletions in protected environments.`,
        `${path}.riskTags`,
      ),
    );
  }

  if (action.type === 'securityProbe' && !tags.has('security-active')) {
    out.push(
      issue(
        'risk-tags-consistent',
        'error',
        `Step "${step.intent}" runs a security probe but is not tagged 'security-active'.`,
        `${path}.riskTags`,
      ),
    );
  }
}

/** resolvable-refs: variables, fixtures and credential profiles must exist. */
function checkResolvableRefs(scenario: Scenario, ctx: LintContext, out: LintIssue[]): void {
  const fixtureRefs = new Set(scenario.fixtures.map((f) => f.ref));
  const defined = new Set<string>();
  const steps = allSteps(scenario);

  for (const [i, step] of steps.entries()) {
    const path = `steps[${i}]`;
    const action = step.action;

    for (const value of actionValues(action)) {
      if (value.kind === 'variable' && !defined.has(value.name)) {
        out.push(
          issue(
            'resolvable-refs',
            'error',
            `Variable '${value.name}' is used before any step extracts it.`,
            `${path}.action.value`,
          ),
        );
      }
      if (value.kind === 'dataset' && !fixtureRefs.has(value.fixtureRef)) {
        out.push(
          issue('resolvable-refs', 'error', `Unknown fixture '${value.fixtureRef}'.`, `${path}.action.value`),
        );
      }
    }

    if (action.type === 'extract') defined.add(action.as);
    if (action.type === 'apiRequest') defined.add(action.saveAs);

    if (
      action.type === 'switchIdentity' &&
      ctx.knownCredentialProfiles &&
      !ctx.knownCredentialProfiles.includes(action.credentialProfileRef)
    ) {
      out.push(
        issue(
          'resolvable-refs',
          'error',
          `Unknown credential profile '${action.credentialProfileRef}'.`,
          `${path}.action.credentialProfileRef`,
        ),
      );
    }
  }
}

/** acyclic-fixtures: the test-data dependency graph must be a DAG. */
function checkFixtureGraph(fixtures: FixtureDecl[], out: LintIssue[]): void {
  const byRef = new Map(fixtures.map((f) => [f.ref, f]));
  const state = new Map<string, 'visiting' | 'done'>();

  for (const fixture of fixtures) {
    for (const dep of fixture.dependsOn) {
      if (!byRef.has(dep)) {
        out.push(
          issue('acyclic-fixtures', 'error', `Fixture '${fixture.ref}' depends on unknown fixture '${dep}'.`, `fixtures.${fixture.ref}.dependsOn`),
        );
      }
    }
  }

  // Only ever called with a fixture that exists, so the declaration itself is
  // passed in rather than looked up defensively.
  const visit = (node: FixtureDecl, trail: string[]): void => {
    const current = state.get(node.ref);
    if (current === 'done') return;
    if (current === 'visiting') {
      out.push(
        issue('acyclic-fixtures', 'error', `Cyclic fixture dependency: ${[...trail, node.ref].join(' -> ')}.`, `fixtures.${node.ref}.dependsOn`),
      );
      return;
    }
    state.set(node.ref, 'visiting');
    for (const dep of node.dependsOn) {
      const target = byRef.get(dep);
      if (target) visit(target, [...trail, node.ref]);
    }
    state.set(node.ref, 'done');
  };

  for (const fixture of fixtures) visit(fixture, []);
}

/** cleanup-covers-creates: anything a test creates, it must undo. */
function checkCleanupCoverage(scenario: Scenario, out: LintIssue[]): void {
  if (scenario.policyClass === 'passive') return;

  for (const fixture of scenario.fixtures) {
    const creates = fixture.createVia.via === 'ui' || fixture.createVia.via === 'api';
    if (creates && fixture.cleanup.via === 'none') {
      out.push(
        issue(
          'cleanup-covers-creates',
          'error',
          `Fixture '${fixture.ref}' creates a ${fixture.entity} but declares no cleanup. Leaked records accumulate in the target system.`,
          `fixtures.${fixture.ref}.cleanup`,
        ),
      );
    }
  }
}

/** step-budget: keep scenarios inside Firestore's document ceiling. */
function checkStepBudget(scenario: Scenario, ctx: LintContext, out: LintIssue[]): void {
  const threshold = ctx.stepWarnThreshold ?? DEFAULT_STEP_WARN;
  const total = allSteps(scenario).length;
  if (total > threshold) {
    out.push(
      issue(
        'step-budget',
        'warning',
        `Scenario has ${total} steps (soft limit ${threshold}). Large scenarios approach Firestore's 1 MiB document limit and produce unwieldy reports — consider splitting it.`,
        'steps',
      ),
    );
  }
}

/**
 * Semantic validation, run after `Scenario.parse` has established structural
 * validity. Runs in the web tier when a scenario is authored and again in the
 * worker on receipt — the worker never trusts the web tier.
 */
export function lintScenario(scenario: Scenario, ctx: LintContext): LintIssue[] {
  const out: LintIssue[] = [];

  for (const [i, step] of allSteps(scenario).entries()) {
    const path = `steps[${i}]`;
    checkLiteralSecrets(step, path, out);
    checkCssFallback(step, path, out);
    checkOriginAllowlist(step.action, ctx, path, out);
    checkRiskTags(step, path, out);
  }

  checkResolvableRefs(scenario, ctx, out);
  checkFixtureGraph(scenario.fixtures, out);
  checkCleanupCoverage(scenario, out);
  checkStepBudget(scenario, ctx, out);

  return out;
}

export function hasBlockingIssues(issues: LintIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
