import { generateObject } from 'ai';
import { z } from 'zod';
import { getAIModel, type AIProviderConfig } from './local-llm';

export interface RCARequest {
  failedStepIntent: string;
  failedStepAction?: string;
  errorMessage: string;
  targetUrl: string;
  consoleErrors?: string[];
  recentRequests?: Array<{ url: string; status: number; method: string }>;
  domSnippet?: string;
  aiConfig?: AIProviderConfig;
}

export const rcaResponseSchema = z.object({
  category: z.enum([
    'OVERLAY_BLOCKED',
    'LOCATOR_DRIFT',
    'TIMEOUT_LOADING',
    'NETWORK_5XX',
    'ASSERTION_MISMATCH',
    'DYNAMIC_HYDRATION',
    'OTHER',
  ]).describe('Classified technical root cause category'),
  summary: z.string().describe('One-sentence headline of why this failed'),
  plainEnglishExplanation: z.string().describe('Detailed plain-English diagnosis of the failure'),
  suggestedFix: z.string().describe('Concise recommendation on how to fix this test or the application'),
  autoFixStep: z.object({
    intent: z.string().describe('Intent of the remediation step'),
    dslInstruction: z.string().describe('Exact DSL prompt instruction to apply (e.g. click "Accept all cookies")'),
    actionType: z.enum(['prepend', 'replace', 'append']).describe('Whether to prepend before the failed step, replace it, or append'),
  }).optional().describe('Actionable DSL remediation step that can be auto-applied to the scenario'),
});

export type RCAResponse = z.infer<typeof rcaResponseSchema>;

/**
 * Analyzes a failed test step using AI to determine the root cause and generate a 1-click remediation.
 */
export async function analyzeFailureRCA(request: RCARequest): Promise<RCAResponse> {
  const { model, provider, modelName } = await getAIModel(request.aiConfig);

  const prompt = `
You are an AI-style Smart Root Cause Analysis (RCA) Engine for automated web testing.
A test step has just failed while testing: ${request.targetUrl}

FAILED STEP INTENT:
${request.failedStepIntent}

ACTION:
${request.failedStepAction || 'Not provided'}

ERROR MESSAGE:
${request.errorMessage}

CONSOLE ERRORS:
${(request.consoleErrors || []).slice(0, 8).join('\n') || 'None'}

RECENT HTTP REQUESTS:
${(request.recentRequests || []).slice(0, 5).map(r => `${r.method} ${r.url} -> ${r.status}`).join('\n') || 'None'}

DOM SNIPPET CONTEXT:
${request.domSnippet ? request.domSnippet.slice(0, 1500) : 'None'}

Your job:
1. Identify the exact root cause (is it a cookie banner/modal overlay blocking clicks? Did button text change? Did the server return 500? Did a selector time out?).
2. Give a human-friendly plain English explanation of why the failure happened.
3. Suggest a 1-click DSL remediation (e.g., if a cookie banner blocked the element, prepend 'click "Accept all cookies"' or 'click "Close"'; if the button name was wrong, replace with the right button name; if it timed out, add 'wait for network quiescent').
`;

  try {
    const result = await generateObject({
      model,
      schema: rcaResponseSchema,
      prompt,
    });
    return result.object;
  } catch (err) {
    // Graceful rule-based fallback when AI is offline or times out
    const msg = request.errorMessage.toLowerCase();
    let category: RCAResponse['category'] = 'LOCATOR_DRIFT';
    let summary = 'Element locator could not be resolved on the page.';
    let explanation = `The scanner attempted to interact with an element for "${request.failedStepIntent}", but the element was not found in the DOM or was not ready.`;
    let fix = 'Check if the button or link text matches what is displayed on the website.';
    let autoFix: RCAResponse['autoFixStep'] | undefined;

    if (msg.includes('overlay') || msg.includes('banner') || msg.includes('obscured') || msg.includes('not visible')) {
      category = 'OVERLAY_BLOCKED';
      summary = 'Element blocked by an overlay or cookie consent dialog.';
      explanation = 'A modal, popup, or cookie consent banner appeared on top of the target element, preventing mouse clicks.';
      fix = 'Add a step to dismiss the popup or cookie banner before clicking.';
      autoFix = {
        intent: 'Dismiss cookie consent or modal dialog',
        dslInstruction: 'click "Accept all" or click "Close"',
        actionType: 'prepend',
      };
    } else if (msg.includes('timeout') || msg.includes('timed out')) {
      category = 'TIMEOUT_LOADING';
      summary = 'Page or network asset timed out during execution.';
      explanation = 'The element or page did not settle within the timeout budget, likely due to slow third-party scripts or lazy-loaded widgets.';
      fix = 'Add a wait condition or increase timeout.';
      autoFix = {
        intent: 'Wait for page elements to stabilize',
        dslInstruction: 'wait for network quiescent',
        actionType: 'prepend',
      };
    }

    return {
      category,
      summary,
      plainEnglishExplanation: explanation,
      suggestedFix: fix,
      autoFixStep: autoFix,
    };
  }
}
