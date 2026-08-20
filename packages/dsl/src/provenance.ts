import { z } from 'zod';

/**
 * Who authored a piece of a scenario. Point 3 of the spec requires reports to
 * distinguish tester-provided from framework-inferred from auto-generated.
 */
export const ProvenanceSource = z.enum([
  'tester',
  'inferred',
  'generated',
  'healed',
  'crawler',
  'imported',
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

export const Provenance = z.object({
  source: ProvenanceSource,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500).optional(),
  modelId: z.string().max(120).optional(),
  promptHash: z.string().length(64).optional(),
  approvedBy: z.string().max(128).optional(),
  approvedAt: z.string().datetime().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

export const TESTER_PROVENANCE: Provenance = { source: 'tester', confidence: 1 };

/** A value only a human may set is one that has been explicitly approved. */
export function isHumanApproved(p: Provenance): boolean {
  return p.approvedBy !== undefined && p.approvedAt !== undefined;
}
