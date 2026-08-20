import { z } from 'zod';
import { Provenance } from './provenance';

/**
 * ARIA roles we can address. Role + accessible name is the contract every
 * automation library exposes, which is what keeps targets library-agnostic.
 */
export const ElementRole = z.enum([
  'button', 'link', 'textbox', 'password', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'table', 'row', 'cell', 'dialog', 'alert', 'heading',
  'image', 'tab', 'menuitem', 'form', 'region', 'list', 'listitem', 'banner',
  'navigation', 'searchbox', 'status', 'progressbar', 'tooltip',
]);
export type ElementRole = z.infer<typeof ElementRole>;

export const NameMatch = z.enum(['exact', 'contains', 'fuzzy']);
export type NameMatch = z.infer<typeof NameMatch>;

export interface SemanticTarget {
  kind: 'semantic';
  role: ElementRole;
  name?: string;
  nameMatch: NameMatch;
  labelText?: string;
  placeholder?: string;
  /** Scopes the search, e.g. "the row containing John". */
  within?: SemanticTarget;
  nth?: number;
  state?: { visible?: boolean; enabled?: boolean; checked?: boolean };
  hints?: {
    testId?: string;
    domPathHint?: string;
    /**
     * A raw CSS selector. Only ever written by the self-healing engine after a
     * human approves it — the `no-ai-css-fallback` lint rule rejects any other
     * author. This is the one place brittle selectors are permitted.
     */
    cssFallback?: string;
    visualAnchor?: { x: number; y: number; w: number; h: number };
    historicalLocatorId?: string;
  };
  origin: Provenance;
}

/**
 * The shape accepted as input. `nameMatch` is optional here because the schema
 * supplies a default, so it is required on the parsed output but not on input.
 */
export type SemanticTargetInput = Omit<SemanticTarget, 'nameMatch' | 'within'> & {
  nameMatch?: NameMatch;
  within?: SemanticTargetInput;
};

export const SemanticTarget: z.ZodType<SemanticTarget, z.ZodTypeDef, SemanticTargetInput> = z.lazy(() =>
  z.object({
    kind: z.literal('semantic'),
    role: ElementRole,
    name: z.string().max(200).optional(),
    nameMatch: NameMatch.default('exact'),
    labelText: z.string().max(200).optional(),
    placeholder: z.string().max(200).optional(),
    within: SemanticTarget.optional(),
    nth: z.number().int().min(0).max(999).optional(),
    state: z
      .object({
        visible: z.boolean().optional(),
        enabled: z.boolean().optional(),
        checked: z.boolean().optional(),
      })
      .optional(),
    hints: z
      .object({
        testId: z.string().max(120).optional(),
        domPathHint: z.string().max(500).optional(),
        cssFallback: z.string().max(500).optional(),
        visualAnchor: z
          .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
          .optional(),
        historicalLocatorId: z.string().max(120).optional(),
      })
      .optional(),
    origin: Provenance,
  }),
);

/** Human-readable descriptor used in reports and healing findings. */
export function describeTarget(t: SemanticTarget): string {
  const parts: string[] = [t.role];
  if (t.name) parts.push(`"${t.name}"`);
  else if (t.labelText) parts.push(`labelled "${t.labelText}"`);
  else if (t.placeholder) parts.push(`placeholder "${t.placeholder}"`);
  if (t.nth !== undefined) parts.push(`#${t.nth}`);
  const self = parts.join(' ');
  return t.within ? `${self} within ${describeTarget(t.within)}` : self;
}

/** Walks a target and all its `within` ancestors. */
export function* walkTarget(t: SemanticTarget): Generator<SemanticTarget> {
  yield t;
  if (t.within) yield* walkTarget(t.within);
}
