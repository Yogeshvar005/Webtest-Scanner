import { Scenario, type EnvName, type Provenance, type Step, type TestType } from '@wts/dsl';
import { parseLine, splitInstructions } from './parse-rules';

import type { SiteReconData } from './site-generator';
import type { AIProviderConfig } from './local-llm';

export interface ParseRequest {
  naturalLanguage: string;
  targetId: string;
  environment: EnvName;
  title?: string;
  testTypes?: TestType[];
  initialPath?: string;
  siteContext?: SiteReconData;
  aiConfig?: AIProviderConfig;
}

export interface ParseResult {
  scenario: Scenario;
  /** Lines the parser could not interpret, surfaced rather than guessed at. */
  unparsed: string[];
  /** Mean confidence across inferred steps, for the review gate. */
  meanConfidence: number;
}

const TESTER: Provenance = { source: 'tester', confidence: 1 };

/**
 * Turns a tester's plain-English description into a validated Scenario.
 *
 * The original text is preserved verbatim on the scenario so a report can
 * always show what the human actually asked for alongside what the engine
 * inferred, which is the auditability requirement in point 3 of the spec.
 */
export function parseScenarioRules(request: ParseRequest): ParseResult {
  const lines = splitInstructions(request.naturalLanguage);
  const steps: Step[] = [];
  const unparsed: string[] = [];
  const openQuestions: Scenario['openQuestions'] = [];
  const defaultPath = request.initialPath || '/';

  for (const line of lines) {
    const parsed = parseLine(line, steps.length);

    if (parsed.step) {
      steps.push(parsed.step);
      continue;
    }

    if (parsed.question) {
      unparsed.push(line);
      openQuestions.push({
        ...parsed.question,
        provenance: { source: 'inferred', confidence: 0, rationale: 'No instruction pattern matched this line.' },
      });
    }
  }

  // A scenario must do something. If nothing parsed, at least open the site so
  // the run produces a screenshot and a reviewable result rather than an error.
  if (steps.length === 0) {
    steps.push({
      id: 's0',
      index: 0,
      intent: 'Open the target page',
      action: { type: 'navigate', path: defaultPath, originRef: 'primary' },
      preWaits: [],
      postWaits: [{ type: 'networkQuiescent', idleMs: 500, ignorePatterns: [] }],
      assertions: [],
      evidence: { screenshot: 'always', fullPage: false, console: true, network: true, domSnapshot: 'on-failure' },
      onFailure: 'abort',
      timeoutMs: 30_000,
      riskTags: ['read-only'],
      provenance: { source: 'generated', confidence: 0.5, rationale: 'No instructions were understood; defaulted to opening the target.' },
    });
  }

  // Always begin at the target root unless the tester navigated explicitly.
  if (steps[0]!.action.type !== 'navigate') {
    steps.unshift({
      id: 'sroot',
      index: 0,
      intent: 'Open the target page',
      action: { type: 'navigate', path: defaultPath, originRef: 'primary' },
      preWaits: [],
      postWaits: [{ type: 'networkQuiescent', idleMs: 500, ignorePatterns: [] }],
      assertions: [],
      evidence: { screenshot: 'always', fullPage: false, console: true, network: true, domSnapshot: 'on-failure' },
      onFailure: 'abort',
      timeoutMs: 30_000,
      riskTags: ['read-only'],
      provenance: { source: 'generated', confidence: 0.9, rationale: 'Every run starts at the target root unless told otherwise.' },
    });
  }

  const renumbered = steps.map((step, index) => ({ ...step, id: `s${index}`, index }));
  const confidences = renumbered.map((s) => s.provenance.confidence);
  const meanConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  // Anything that only reads is passive; a fill or click that changes server
  // state is not knowable from text alone, so classify by action kind.
  const mutates = renumbered.some((s) => s.action.type === 'fill' || s.action.type === 'upload' || s.action.type === 'check');

  const scenario = Scenario.parse({
    schemaVersion: '1.0',
    id: `sc_${Date.now().toString(36)}`,
    version: 1,
    title: request.title?.trim() || renumbered[0]?.intent || 'Untitled scenario',
    originalNaturalLanguage: request.naturalLanguage,
    testTypes: request.testTypes ?? ['functional', 'ui'],
    priority: 'P2',
    targetId: request.targetId,
    environment: request.environment,
    openQuestions,
    steps: renumbered,
    lifecycle: 'ai_generated',
    policyClass: mutates ? 'mutating' : 'passive',
    provenance: mutates
      ? { source: 'inferred', confidence: meanConfidence, rationale: 'Scenario contains input actions, so it is classified as mutating.' }
      : TESTER,
  });

  return { scenario, unparsed, meanConfidence };
}

import { parseScenarioLLM } from './parse-llm';
import { getOllamaStatus } from './local-llm';

export async function parseScenario(request: ParseRequest): Promise<ParseResult> {
  const ollama = await getOllamaStatus();
  const hasLocal = ollama.online && ollama.models.length > 0;
  const hasCloud = Boolean(process.env.OPENAI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  if (hasLocal || hasCloud || request.aiConfig?.provider === 'local') {
    try {
      return await parseScenarioLLM(request);
    } catch (e) {
      console.warn('[nlp] LLM parsing failed, falling back to heuristic rules.', e);
    }
  }
  return parseScenarioRules(request);
}
