import { z } from 'zod';

export const NavigationDecisionSchema = z.object({
  pageSummary: z.string().describe('One-sentence summary of what this page offers'),
  isRelevant: z.boolean().describe('Whether this page should be recorded in our test map'),
  nextLinksToExplore: z.array(z.string()).describe('Top 2 to 4 unique internal URLs prioritized for exploration'),
  shouldBacktrack: z.boolean().describe('True if this page is a leaf node, dead end, or fully mapped'),
});

export type NavigationDecision = z.infer<typeof NavigationDecisionSchema>;
