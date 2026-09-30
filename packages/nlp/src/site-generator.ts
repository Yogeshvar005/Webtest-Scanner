import { generateObject } from 'ai';
import { z } from 'zod';
import { getAIModel, type AIProviderConfig } from './local-llm';
import { Scenario } from '@wts/dsl';

export interface SiteReconData {
  url: string;
  title: string;
  description?: string;
  domain?: string;
  headings: string[];
  interactiveElements: Array<{
    role: string;
    text: string;
    type?: string;
    placeholder?: string;
    name?: string;
  }>;
  forms: Array<{
    name?: string;
    fields: Array<{ name: string; type: string; placeholder?: string; label?: string }>;
    submitText?: string;
  }>;
  navLinks: Array<{ text: string; href: string }>;
}

const generatedStepSchema = z.object({
  intent: z.string().describe('Clear user-readable description of what this step does'),
  action: z.object({
    type: z.enum(['navigate', 'click', 'clickAll', 'explore', 'fill', 'check', 'screenshot', 'waitFor']),
    path: z.string().optional().describe('URL path for navigate action'),
    targetName: z.string().optional().describe('Exact or fuzzy name of element on the page'),
    targetRole: z.enum(['button', 'link', 'textbox', 'checkbox', 'searchbox', 'region', 'menuitem']).optional(),
    value: z.string().optional().describe('Input text value to type'),
    maxDepth: z.number().optional().describe('For explore action, traversal depth'),
  }),
  assertionText: z.string().optional().describe('Expected text to verify on the page after action'),
});

const testSuiteSchema = z.object({
  domainCategory: z.string().describe('Inferred site category, e.g. Airline, E-Commerce, SaaS, Media, Banking'),
  siteSummary: z.string().describe('Brief 1-sentence analysis of what this website provides'),
  suites: z.array(
    z.object({
      id: z.string(),
      title: z.string().describe('Descriptive name of test suite, e.g. "Flight Search & Cabin Selection"'),
      type: z.enum(['happy-path', 'boundary-negative', 'navigation-integrity', 'security-audit']),
      description: z.string().describe('What user flow or edge case this suite verifies'),
      steps: z.array(generatedStepSchema),
    })
  ),
});

export type GeneratedTestSuiteResult = z.infer<typeof testSuiteSchema>;

/**
 * Generates tailored, site-specific test suites based on real observed DOM reconnaissance.
 */
export async function generateSiteSpecificSuites(
  recon: SiteReconData,
  options?: { aiConfig?: AIProviderConfig; userInstruction?: string }
): Promise<GeneratedTestSuiteResult> {
  const { model, provider, modelName } = await getAIModel(options?.aiConfig);

  // Defensive extraction to prevent crashes if fields are missing in partial recon
  const headings = Array.isArray(recon.headings) ? recon.headings : [];
  const navLinks = Array.isArray(recon.navLinks) ? recon.navLinks : [];
  const forms = Array.isArray(recon.forms) ? recon.forms : [];
  const interactiveElements = Array.isArray(recon.interactiveElements) ? recon.interactiveElements : [];

  // Compact representation to minimize token count while maximizing context
  const contextSummary = {
    url: recon.url || '',
    title: recon.title || '',
    description: recon.description || '',
    topHeadings: headings.slice(0, 10),
    keyNavLinks: navLinks.slice(0, 15).map((l) => l?.text).filter(Boolean),
    formsDetected: forms.map((f) => ({
      name: f?.name || 'Form',
      fields: (f?.fields || []).map((field) => field?.label || field?.placeholder || field?.name),
      submitButton: f?.submitText || 'Submit',
    })),
    prominentButtons: Array.from(
      new Set(
        interactiveElements
          .filter((e) => e?.role === 'button')
          .map((e) => e?.text)
          .filter((t) => t && t.length < 30)
      )
    ).slice(0, 20),
    prominentInputs: interactiveElements
      .filter((e) => e?.role === 'textbox' || e?.role === 'searchbox')
      .map((e) => e?.placeholder || e?.name || e?.text)
      .filter(Boolean)
      .slice(0, 10),
  };

  const prompt = `You are an elite QA automation architect. Analyze this live website's structure and generate 3 to 4 domain-specific, realistic end-to-end test suites.

TARGET SITE CONTEXT:
${JSON.stringify(contextSummary, null, 2)}

${options?.userInstruction ? `USER'S SPECIAL INSTRUCTION: "${options.userInstruction}"` : ''}

REQUIREMENTS:
1. NO GENERIC PLACEHOLDERS: Do NOT generate vague steps like "click button" or "test form". Target the REAL buttons, tabs, inputs, and links listed in the site context above.
2. If this is an airline (like Etihad): create real flight search flows, manage booking checks, or cabin class selectors.
3. If this is e-commerce: test cart additions, product search, coupon code input.
4. If this is SaaS: test sign-in validation, pricing switchers, demo request form.
5. Create at least:
   - One "happy-path" primary customer journey.
   - One "boundary-negative" test (e.g. submitting empty search, typing invalid dates/emails to verify error handling).
   - One "navigation-integrity" test checking key service areas.
6. For each step, use exact targetName matching one of the observed prominentButtons or prominentInputs.`;

  try {
    const { object } = await generateObject({
      model,
      schema: testSuiteSchema,
      prompt,
    });
    return object;
  } catch (err) {
    console.warn(`[site-generator] AI generation with ${provider}:${modelName} failed, using heuristic fallback`, err);
    return createHeuristicSuites(recon);
  }
}

/**
 * Heuristic fallback if local LLM is temporarily unreachable or times out
 */
function createHeuristicSuites(recon: SiteReconData): GeneratedTestSuiteResult {
  const headings = Array.isArray(recon.headings) ? recon.headings : [];
  const combinedText = ((recon.title || '') + ' ' + headings.join(' ')).toLowerCase();
  const isTravel = /flight|book|hotel|airline|travel|etihad|emirates/i.test(combinedText);
  const isEcommerce = /shop|store|cart|product|checkout|price|buy/i.test(combinedText);

  if (isTravel) {
    return {
      domainCategory: 'Airline & Travel',
      siteSummary: recon.title || 'Travel & Booking Portal',
      suites: [
        {
          id: 'travel-primary',
          title: 'Flight Search & Booking Flow',
          type: 'happy-path',
          description: 'Tests departure/destination search and date validation on booking widget',
          steps: [
            { intent: 'Open the homepage', action: { type: 'navigate', path: '/' } },
            { intent: 'Verify search widget is visible', action: { type: 'waitFor' } },
            { intent: 'Click Book or Search button', action: { type: 'click', targetRole: 'button', targetName: 'Book' } },
            { intent: 'Take verification screenshot', action: { type: 'screenshot' } },
          ],
        },
        {
          id: 'travel-negative',
          title: 'Validation & Empty Search Handling',
          type: 'boundary-negative',
          description: 'Verifies appropriate validation warnings appear if search is initiated without dates',
          steps: [
            { intent: 'Open booking page', action: { type: 'navigate', path: '/' } },
            { intent: 'Click Search without inputs', action: { type: 'click', targetRole: 'button', targetName: 'Search' } },
            { intent: 'Verify error prompt appears', action: { type: 'screenshot' } },
          ],
        },
      ],
    };
  }

  if (isEcommerce) {
    return {
      domainCategory: 'E-Commerce Store',
      siteSummary: recon.title || 'Online Shop',
      suites: [
        {
          id: 'shop-primary',
          title: 'Product Discovery & Cart Flow',
          type: 'happy-path',
          description: 'Tests product exploration and cart button functionality',
          steps: [
            { intent: 'Navigate to store root', action: { type: 'navigate', path: '/' } },
            { intent: 'Explore products', action: { type: 'explore', maxDepth: 1 } },
            { intent: 'Inspect cart component', action: { type: 'screenshot' } },
          ],
        },
      ],
    };
  }

  return {
    domainCategory: 'Web Application / Portal',
    siteSummary: recon.title || 'Web Service',
    suites: [
      {
        id: 'web-primary',
        title: 'Core Interactive Journey',
        type: 'happy-path',
        description: 'Navigates and verifies primary interactive components',
        steps: [
          { intent: 'Open the application', action: { type: 'navigate', path: '/' } },
          { intent: 'Verify page rendered with headings', action: { type: 'screenshot' } },
          { intent: 'Explore navigation links', action: { type: 'explore', maxDepth: 1 } },
        ],
      },
    ],
  };
}

/**
 * Converts a generated suite into a fully executable DSL Scenario.
 */
export function suiteToScenario(
  suite: GeneratedTestSuiteResult['suites'][0],
  targetId: string,
  environment = 'QA'
): Scenario {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const steps: any[] = suite.steps.map((s, idx) => ({
    id: `s${idx}`,
    index: idx,
    intent: s.intent,
    action: (s.action.type === 'navigate'
      ? { type: 'navigate', path: s.action.path || '/', originRef: 'primary' }
      : s.action.type === 'click'
      ? {
          type: 'click',
          target: {
            kind: 'semantic',
            role: s.action.targetRole || 'button',
            name: s.action.targetName || 'button',
            nameMatch: 'contains',
            origin: { source: 'inferred', confidence: 0.9, rationale: 'Site-aware generated' },
          },
        }
      : s.action.type === 'fill'
      ? {
          type: 'fill',
          target: {
            kind: 'semantic',
            role: s.action.targetRole || 'textbox',
            name: s.action.targetName || 'input',
            nameMatch: 'contains',
            origin: { source: 'inferred', confidence: 0.9, rationale: 'Site-aware generated' },
          },
          value: { kind: 'literal', value: s.action.value || '' },
        }
      : s.action.type === 'explore'
      ? { type: 'explore', maxDepth: s.action.maxDepth || 2 }
      : { type: 'screenshot', label: s.intent }) as any,
    preWaits: [],
    postWaits: [{ type: 'networkQuiescent', idleMs: 600, ignorePatterns: [] }],
    assertions: s.assertionText
      ? [
          {
            type: 'textPresent',
            match: 'contains' as const,
            text: { kind: 'literal', value: s.assertionText },
            severity: 'medium',
            negate: false,
            describe: `Verify text "${s.assertionText}" is visible`,
            origin: { source: 'inferred', confidence: 0.9, rationale: 'Site-aware generated' },
          },
        ]
      : [],
    evidence: { screenshot: 'always', fullPage: false, console: true, network: true, domSnapshot: 'on-failure' },
    onFailure: 'continue',
    timeoutMs: 30_000,
    riskTags: ['read-only'],
    provenance: { source: 'generated', confidence: 0.95, rationale: 'Domain generated testcase' },
  }));

  return Scenario.parse({
    schemaVersion: '1.0',
    id: `sc_${Date.now().toString(36)}`,
    version: 1,
    title: suite.title,
    originalNaturalLanguage: suite.description,
    testTypes: ['functional', 'ui'],
    priority: 'P2',
    targetId,
    environment,
    openQuestions: [],
    steps,
    lifecycle: 'ai_generated',
    policyClass: 'passive',
    provenance: { source: 'generated', confidence: 0.95, rationale: 'Domain generated testcase' },
  });
}
