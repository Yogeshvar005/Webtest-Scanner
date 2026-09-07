import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Scenario, type Step } from '@wts/dsl';
import type { ParseRequest, ParseResult } from './parse-scenario';

const llmStepSchema = z.object({
  intent: z.string().describe('The semantic intent of the action, e.g. "Click login"'),
  action: z.object({
    type: z.enum(['navigate', 'click', 'clickAll', 'explore', 'fill', 'check', 'screenshot', 'waitFor']),
    path: z.string().optional().describe('Used for navigate'),
    targetName: z.string().optional().describe('The semantic name of the element to interact with'),
    targetRole: z.enum(['button', 'link', 'textbox', 'checkbox', 'searchbox', 'region', 'menuitem']).optional().describe('The ARIA role of the element'),
    value: z.string().optional().describe('The text to type for "fill"'),
    state: z.boolean().optional().describe('For "check", true or false'),
    label: z.string().optional().describe('For "screenshot", a short label'),
    maxDepth: z.number().optional().describe('For "explore", the maximum depth to traverse (default 2)'),
  }).describe('The specific action to take'),
  assertionText: z.string().optional().describe('If the step verifies text, what text to look for'),
});

const llmResponseSchema = z.object({
  steps: z.array(llmStepSchema),
  unparsed: z.array(z.string()).describe('Any parts of the prompt that could not be mapped to a test action'),
});

import { getAIModel } from './local-llm';

export async function parseScenarioLLM(request: ParseRequest): Promise<ParseResult> {
  const { model } = await getAIModel(request.aiConfig);

  const siteContextText = request.siteContext
    ? `
LIVE WEBSITE ELEMENTS & CONTEXT (Ground actions using these real observed elements!):
- Target URL: ${request.siteContext.url}
- Title: ${request.siteContext.title}
- Headings: ${request.siteContext.headings.slice(0, 8).join(', ')}
- Buttons on page: ${request.siteContext.interactiveElements.filter(e => e.role === 'button').map(e => e.text).slice(0, 15).join(' | ')}
- Inputs on page: ${request.siteContext.interactiveElements.filter(e => e.role === 'textbox' || e.role === 'searchbox').map(e => e.placeholder || e.name || e.text).slice(0, 10).join(' | ')}
`
    : '';

  const { object } = await generateObject({
    model,
    schema: llmResponseSchema,
    system: `You are a test automation engine parsing natural language into structured Playwright DSL actions.
Your job is to map the user's natural language into a list of executable steps.
${siteContextText}
BE AGGRESSIVE AND CREATIVE: Always map the user's intent to one of the supported actions. 
If the user asks to interact with "all" or "every" of something (e.g. "click all buttons"), use 'clickAll'.
If the user asks to explore the site, test paths, spider, or find where buttons go, use 'explore'.
CRITICAL: Use real observed element names and roles from the live site context whenever matching elements!
Supported action types: navigate, click, clickAll, explore, fill, check, screenshot, waitFor.
If the user wants to check or verify text, use the 'screenshot' action and set assertionText.`,
    prompt: request.naturalLanguage,
  });

  const steps: Step[] = [];
  const defaultPath = request.initialPath || '/';

  for (let i = 0; i < object.steps.length; i++) {
    const rawStep = object.steps[i]!;
    const index = steps.length;
    
    let actionPayload: any;
    
    switch (rawStep.action.type) {
      case 'navigate':
        actionPayload = { type: 'navigate', path: rawStep.action.path || '/', originRef: 'primary' };
        break;
      case 'click':
        actionPayload = { 
          type: 'click', 
          target: { kind: 'semantic', role: rawStep.action.targetRole || 'button', name: rawStep.action.targetName || 'element', nameMatch: 'contains', origin: { source: 'inferred', confidence: 0.9, rationale: 'LLM generated' } }
        };
        break;
      case 'clickAll':
        actionPayload = { 
          type: 'clickAll', 
          target: { kind: 'semantic', role: rawStep.action.targetRole || 'button', name: rawStep.action.targetName || 'element', nameMatch: 'contains', origin: { source: 'inferred', confidence: 0.9, rationale: 'LLM generated' } }
        };
        break;
      case 'explore':
        actionPayload = { 
          type: 'explore', 
          maxDepth: rawStep.action.maxDepth || 2 
        };
        break;
      case 'fill':
        actionPayload = { 
          type: 'fill', 
          target: { kind: 'semantic', role: rawStep.action.targetRole || 'textbox', name: rawStep.action.targetName || 'input', nameMatch: 'contains', origin: { source: 'inferred', confidence: 0.9, rationale: 'LLM generated' } },
          value: { kind: 'literal', value: rawStep.action.value || '' }
        };
        break;
      case 'check':
        actionPayload = { 
          type: 'check', 
          target: { kind: 'semantic', role: rawStep.action.targetRole || 'checkbox', name: rawStep.action.targetName || 'checkbox', nameMatch: 'contains', origin: { source: 'inferred', confidence: 0.9, rationale: 'LLM generated' } },
          state: rawStep.action.state ?? true
        };
        break;
      case 'screenshot':
        actionPayload = { type: 'screenshot', label: rawStep.action.label || 'Screenshot' };
        break;
      case 'waitFor':
        actionPayload = { 
          type: 'waitFor', 
          condition: { 
            type: 'elementVisible', 
            target: { kind: 'semantic', role: rawStep.action.targetRole || 'region', name: rawStep.action.targetName || 'element', nameMatch: 'contains', origin: { source: 'inferred', confidence: 0.9, rationale: 'LLM generated' } },
            timeoutMs: 15000 
          } 
        };
        break;
    }

    const assertions = rawStep.assertionText ? [{
      type: 'textPresent' as const,
      text: { kind: 'literal' as const, value: rawStep.assertionText },
      match: 'contains' as const,
      negate: false,
      origin: { source: 'inferred' as const, confidence: 0.9, rationale: 'LLM generated' },
      severity: 'high' as const,
      describe: `Expected to find "${rawStep.assertionText}" on the page.`,
    }] : [];

    steps.push({
      id: `s${index}`,
      index,
      intent: rawStep.intent,
      action: actionPayload,
      preWaits: [],
      postWaits: (rawStep.action.type === 'click' || rawStep.action.type === 'clickAll' || rawStep.action.type === 'navigate') ? [{ type: 'networkQuiescent', idleMs: 500, ignorePatterns: [] }] : [],
      assertions,
      expected: rawStep.assertionText ? `"${rawStep.assertionText}" is visible` : undefined,
      evidence: { screenshot: 'always', fullPage: false, console: true, network: true, domSnapshot: 'on-failure' },
      onFailure: 'continue',
      timeoutMs: rawStep.action.type === 'explore' ? 300000 : 30000,
      riskTags: ['read-only'],
      provenance: { source: 'inferred', confidence: 0.9, rationale: 'Generated by LLM' }
    });
  }

  // Same logic as parse-rules to ensure we have a valid starting point
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
      provenance: { source: 'generated', confidence: 0.5, rationale: 'Default step' },
    });
  }

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
      provenance: { source: 'generated', confidence: 0.9, rationale: 'Default step' },
    });
  }

  const renumbered = steps.map((step, index) => ({ ...step, id: `s${index}`, index }));
  const mutates = renumbered.some((s) => s.action.type === 'fill' || s.action.type === 'check');
  const openQuestions = object.unparsed.map((q) => ({
    question: `Could not interpret: "${q}"`,
    assumedAnswer: 'Skipped — LLM could not map to an action.',
    provenance: { source: 'inferred' as const, confidence: 0, rationale: 'No matching instruction pattern.' }
  }));

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
      ? { source: 'inferred', confidence: 0.9, rationale: 'LLM generated input' }
      : { source: 'tester', confidence: 1 },
  });

  return { scenario, unparsed: object.unparsed, meanConfidence: 0.9 };
}
