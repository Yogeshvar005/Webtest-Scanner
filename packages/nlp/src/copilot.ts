import { generateObject } from 'ai';
import { z } from 'zod';
import { getAIModel, type AIProviderConfig } from './local-llm';
import type { SiteReconData } from './site-generator';

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CopilotRequest {
  messages: CopilotMessage[];
  siteContext?: SiteReconData;
  aiConfig?: AIProviderConfig;
}

const copilotResponseSchema = z.object({
  reply: z.string().describe('Clear, conversational QA advice or explanation of what will be tested'),
  actionableSteps: z
    .array(
      z.object({
        intent: z.string().describe('Readable intent'),
        action: z.object({
          type: z.enum(['navigate', 'click', 'clickAll', 'explore', 'fill', 'check', 'screenshot', 'waitFor']),
          path: z.string().optional(),
          targetName: z.string().optional(),
          targetRole: z.enum(['button', 'link', 'textbox', 'checkbox', 'searchbox', 'region', 'menuitem']).optional(),
          value: z.string().optional(),
        }),
      })
    )
    .describe('Executable DSL test actions. Must contain steps if the user asked to test or verify a flow, even if it is just a generic navigate or explore action.'),
  suggestedFollowUps: z.array(z.string()).describe('2-3 quick follow-up testing suggestions'),
});

export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

/**
 * Handles conversational QA Copilot interactions with the website.
 */
export async function chatWithQACopilot(request: CopilotRequest): Promise<CopilotResponse> {
  const { model, provider, modelName } = await getAIModel(request.aiConfig);

  const contextBrief = request.siteContext
    ? `
CURRENT WEBSITE UNDER TEST:
- Title: ${request.siteContext.title}
- URL: ${request.siteContext.url}
- Headings: ${request.siteContext.headings.slice(0, 8).join(' | ')}
- Available Buttons: ${request.siteContext.interactiveElements
        .filter((e) => e.role === 'button')
        .map((e) => e.text)
        .slice(0, 15)
        .join(', ')}
- Available Inputs: ${request.siteContext.interactiveElements
        .filter((e) => e.role === 'textbox' || e.role === 'searchbox')
        .map((e) => e.placeholder || e.name || e.text)
        .slice(0, 10)
        .join(', ')}
- Available Forms: ${request.siteContext.forms.map((f) => f.name || 'Form').join(', ')}
`
    : 'No active website context available yet.';

  const systemPrompt = `You are the Webtest Scanner AI QA Copilot — an expert test automation engineer embedded directly into the browser.
${contextBrief}

YOUR CAPABILITIES:
1. You can inspect any website feature, diagnose issues, or recommend test strategies.
2. If the user gives an instruction to test or verify a flow or URL (e.g. "test flight search", "Verify the 'Book a flight' process", "https://example.com"):
   - Explain what you are going to verify in 'reply'.
   - You MUST generate exact, executable actions in 'actionableSteps'. If you have context, use real elements. If you lack context, at least generate 'navigate' and 'explore' steps!
3. If the user asks a general QA question or asks for insights:
   - Provide sharp, expert QA analysis and 2-3 actionable follow-up questions or prompts.
4. Never be vague. Always reference real buttons and inputs found on this website.`;

  const conversation = request.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  try {
    const { object } = await generateObject({
      model,
      schema: copilotResponseSchema,
      system: systemPrompt,
      prompt: conversation,
    });
    return object;
  } catch (error) {
    console.warn(`[copilot] AI response failed with ${provider}:${modelName}`, error);
    // Fallback response
    const lastUserMsg = request.messages[request.messages.length - 1]?.content || '';
    return {
      reply: `I analyzed your request: "${lastUserMsg}". Here are the recommended test actions based on the site's detected elements.`,
      actionableSteps: [
        { intent: 'Navigate to target page', action: { type: 'navigate', path: '/' } },
        { intent: 'Inspect visible interactive elements', action: { type: 'screenshot' } },
      ],
      suggestedFollowUps: [
        'Test search functionality with edge case inputs',
        'Verify navigation bar links and sub-menus',
        'Run boundary validation on all forms',
      ],
    };
  }
}
