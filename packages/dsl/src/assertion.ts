import { z } from 'zod';
import { Provenance } from './provenance';
import { SemanticTarget } from './target';
import { ValueExpr } from './value';

export const Severity = z.enum(['critical', 'high', 'medium', 'low']);
export type Severity = z.infer<typeof Severity>;

const AssertionBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('elementVisible'), target: SemanticTarget, negate: z.boolean().default(false) }),
  z.object({ type: z.literal('elementEnabled'), target: SemanticTarget, negate: z.boolean().default(false) }),
  z.object({ type: z.literal('elementChecked'), target: SemanticTarget, negate: z.boolean().default(false) }),
  z.object({
    type: z.literal('textPresent'),
    scope: SemanticTarget.optional(),
    text: ValueExpr,
    match: z.enum(['exact', 'contains']).default('contains'),
    negate: z.boolean().default(false),
  }),
  z.object({ type: z.literal('rowInTable'), table: SemanticTarget, cells: z.record(z.string().max(120), ValueExpr), negate: z.boolean().default(false) }),
  z.object({ type: z.literal('urlMatches'), pattern: z.string().max(500) }),
  z.object({ type: z.literal('elementCount'), target: SemanticTarget, op: z.enum(['eq', 'gte', 'lte']), count: z.number().int().min(0) }),

  // API-shaped assertions (spec point 5, "API")
  z.object({ type: z.literal('httpStatus'), of: z.string().max(64), equals: z.number().int().optional(), oneOf: z.array(z.number().int()).max(20).optional() }),
  z.object({ type: z.literal('jsonPath'), of: z.string().max(64), path: z.string().max(500), op: z.enum(['eq', 'neq', 'exists', 'absent', 'gt', 'lt', 'matches']), value: z.unknown().optional() }),
  z.object({ type: z.literal('jsonSchema'), of: z.string().max(64), schema: z.unknown() }),
  z.object({ type: z.literal('responseTimeUnder'), of: z.string().max(64), ms: z.number().int().min(0) }),

  // UI-health assertions (spec point 5, "UI")
  z.object({ type: z.literal('noConsoleErrors'), allowPatterns: z.array(z.string().max(500)).max(50).default([]) }),
  z.object({ type: z.literal('noBrokenImages') }),
  z.object({ type: z.literal('noOverlappingElements'), scope: SemanticTarget.optional() }),

  // Accessibility (spec point 5, "Accessibility")
  z.object({ type: z.literal('a11yViolationsUnder'), severity: z.enum(['critical', 'serious', 'moderate', 'minor']), max: z.number().int().min(0).default(0) }),

  // Security (spec points 9, 11)
  z.object({ type: z.literal('securityHeader'), header: z.string().max(120), expect: z.enum(['present', 'absent', 'matches']), pattern: z.string().max(500).optional() }),
  z.object({
    type: z.literal('cookieAttributes'),
    name: z.string().max(120),
    secure: z.boolean().optional(),
    httpOnly: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  }),
  z.object({ type: z.literal('sessionInvalidated'), sessionRef: z.string().max(64) }),
  z.object({ type: z.literal('accessDenied'), of: z.string().max(64), expectStatusOneOf: z.array(z.number().int()).max(10).default([401, 403]) }),
]);

export const Assertion = z.intersection(
  AssertionBody,
  z.object({
    origin: Provenance,
    severity: Severity.default('medium'),
    /** Shown verbatim in the report when this assertion fails. */
    describe: z.string().max(300).optional(),
  }),
);
export type Assertion = z.infer<typeof Assertion>;

/**
 * `noOverlappingElements` and `noBrokenImages` are heuristics that produce
 * false positives on real sites, so they are reported as warnings rather than
 * hard failures unless the author explicitly raised their severity.
 */
export const HEURISTIC_ASSERTIONS = new Set(['noOverlappingElements', 'noBrokenImages']);

export function isHeuristic(a: Assertion): boolean {
  return HEURISTIC_ASSERTIONS.has(a.type);
}
