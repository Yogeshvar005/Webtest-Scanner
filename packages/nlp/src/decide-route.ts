import { generateObject } from 'ai';
import { NavigationDecisionSchema, type NavigationDecision } from '@wts/dsl';
import { getAIModel, type AIProviderConfig } from './local-llm';
import type { InteractiveElement } from './resolve-llm';

export interface DecideRouteRequest {
  pageUrl: string;
  pageTitle: string;
  elements: InteractiveElement[];
  pageText: string;
  visitedUrls: string[];
  aiConfig?: AIProviderConfig;
}

/**
 * Use LLM to decide navigation strategy based on the current page content and visited history.
 */
export async function decideRouteLLM(request: DecideRouteRequest): Promise<NavigationDecision> {
  const { model, provider, modelName } = await getAIModel(request.aiConfig);

  const systemPrompt = `You are an autonomous web crawler agent tasked with mapping a web application.
The current page is "${request.pageTitle}" at URL: ${request.pageUrl}

Here is a summary of the page text content:
${request.pageText.slice(0, 1500)} // truncate if too long

Here are the interactive elements (links/buttons) found on the page:
${JSON.stringify(request.elements.slice(0, 50), null, 2)}

You have already visited these URLs in this session:
${JSON.stringify(request.visitedUrls)}

Analyze the page and decide:
1. pageSummary: What is the main purpose of this page?
2. isRelevant: Should this page be part of the final test map? (usually true unless it's an external ad/auth wall)
3. nextLinksToExplore: Provide an array of up to 4 'id' strings from the elements list that represent unique, unvisited internal links or important actions to explore next. Prioritize core app functionality.
4. shouldBacktrack: Return true if this is a leaf node (no useful unvisited links) or an error page.`;

  try {
    const { object } = await generateObject({
      model,
      schema: NavigationDecisionSchema,
      system: systemPrompt,
      prompt: 'Analyze the page and provide your navigation decision.',
    });
    return object;
  } catch (error) {
    console.warn(`[nlp] AI navigation decision failed with ${provider}:${modelName}`, error);
    // Fallback decision
    return {
      pageSummary: 'Failed to analyze page',
      isRelevant: false,
      nextLinksToExplore: request.elements.slice(0, 2).map(e => e.id),
      shouldBacktrack: true,
    };
  }
}
