import { zodToJsonSchema } from 'zod-to-json-schema';
import { Scenario } from './scenario';

/**
 * The Claude tool `input_schema` is generated from the same Zod definition
 * that validates at runtime. One source of truth means the model cannot be
 * asked for a shape we would then reject, and a schema change cannot drift
 * away from its validator.
 *
 * Emitted without a `name` wrapper and with `$refStrategy: 'none'` because the
 * Anthropic tool API expects a self-contained object schema at the top level,
 * not a `$ref` into a `definitions` block.
 */
export function scenarioJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(Scenario, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;
}
