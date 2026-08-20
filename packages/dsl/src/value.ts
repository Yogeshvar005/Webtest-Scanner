import { z } from 'zod';

/**
 * Data variants the synthetic-data engine can produce for a single field
 * (spec point 6).
 */
export const VariantKind = z.enum([
  'valid',
  'invalid',
  'boundary_low',
  'boundary_at',
  'boundary_high',
  'empty',
  'whitespace_only',
  'very_long',
  'unicode',
  'special_chars',
  'duplicate',
  'malformed',
  'null',
]);
export type VariantKind = z.infer<typeof VariantKind>;

/**
 * Every value in the DSL is an expression, never a bare string. This is what
 * lets `secret` exist as a reference that never carries its own value.
 */
export const ValueExpr = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('literal'),
    value: z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]),
  }),
  z.object({
    kind: z.literal('faker'),
    token: z.string().regex(/^random\.[a-zA-Z][a-zA-Z0-9]*$/),
    locale: z.string().max(10).optional(),
    seedKey: z.string().max(64).optional(),
  }),
  z.object({
    kind: z.literal('dataset'),
    fixtureRef: z.string().max(64),
    field: z.string().max(64),
  }),
  z.object({ kind: z.literal('variable'), name: z.string().max(64) }),
  /** Resolved from Secret Manager inside the worker. Never carries a value. */
  z.object({ kind: z.literal('secret'), name: z.string().regex(/^[A-Z0-9_]{3,64}$/) }),
  /** Produces a traceable AUTOTEST_<date>_<n> identifier (spec point 34). */
  z.object({ kind: z.literal('lineage'), entity: z.string().max(64) }),
  z.object({ kind: z.literal('variant'), base: z.string().max(64), variant: VariantKind }),
]);
export type ValueExpr = z.infer<typeof ValueExpr>;
