import { generateObject } from 'ai';
import { z } from 'zod';
import { getAIModel, type AIProviderConfig } from './local-llm';
import type { SemanticTarget } from '@wts/dsl';

export interface InteractiveElement {
  id: string;
  role: string;
  text: string;
  placeholder?: string;
  name?: string;
  tagName: string;
}

export interface ResolveLLMRequest {
  target: SemanticTarget;
  elements: InteractiveElement[];
  pageUrl: string;
  pageTitle: string;
  aiConfig?: AIProviderConfig;
}

export interface ExploreLLMRequest {
  pageUrl: string;
  pageTitle: string;
  elements: InteractiveElement[];
  maxToSelect: number;
  aiConfig?: AIProviderConfig;
}

const resolveSchema = z.object({
  selectedId: z.string().nullable().describe('The ID of the element that best matches the target. Null if none match.'),
  rationale: z.string().describe('Reasoning for why this element was selected.'),
});

const exploreSchema = z.object({
  selectedIds: z.array(z.string()).describe('The IDs of the elements to explore next.'),
  rationale: z.string().describe('Reasoning for exploring these elements.'),
});

/**
 * Fallback to LLM for resolving a target when heuristic matching fails.
 */
export async function resolveTargetLLM(request: ResolveLLMRequest): Promise<string | null> {
  const { model, provider, modelName } = await getAIModel(request.aiConfig);

  const targetDescription = request.target.name || request.target.role || 'an element';
  const roleDescription = request.target.role ? ` role is "${request.target.role}"` : '';

  const systemPrompt = `You are an AI element resolver for a web testing engine.
The current page is "${request.pageTitle}" at URL: ${request.pageUrl}

Your task is to find the element that best matches the user's target intent.
Target Intent: Find an element representing "${targetDescription}"${roleDescription}.

Here is the list of interactive elements on the page:
${JSON.stringify(request.elements, null, 2)}

Return the "id" of the best matching element. If no element seems to match, return null.`;

  try {
    const { object } = await generateObject({
      model,
      schema: resolveSchema,
      system: systemPrompt,
      prompt: 'Select the best matching element.',
    });
    return object.selectedId;
  } catch (error) {
    console.warn(`[nlp] AI resolution failed with ${provider}:${modelName}`, error);
    return null;
  }
}

/**
 * Use LLM to pick the best elements to interact with during an "explore" action.
 */
export async function exploreTargetLLM(request: ExploreLLMRequest): Promise<string[]> {
  const { model, provider, modelName } = await getAIModel(request.aiConfig);

  const systemPrompt = `You are an autonomous web explorer agent.
The current page is "${request.pageTitle}" at URL: ${request.pageUrl}

Your task is to select up to ${request.maxToSelect} interactive elements to click/explore next to understand the app best.
Focus on main navigation, important calls to action, or unique links.

Here is the list of interactive elements on the page:
${JSON.stringify(request.elements, null, 2)}

Return an array of "id" values corresponding to the elements you want to explore.`;

  try {
    const { object } = await generateObject({
      model,
      schema: exploreSchema,
      system: systemPrompt,
      prompt: 'Select the most interesting elements to explore next.',
    });
    // Ensure we don't return more than requested
    return object.selectedIds.slice(0, request.maxToSelect);
  } catch (error) {
    console.warn(`[nlp] AI explore failed with ${provider}:${modelName}`, error);
    // Fallback: pick the first few
    return request.elements.slice(0, request.maxToSelect).map(e => e.id);
  }
}
