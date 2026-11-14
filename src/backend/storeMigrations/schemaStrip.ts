/**
 * The single schema-derived strip for Phase 70 gaps G2/G3 (70-REVIEW WR-04/WR-05).
 *
 * It reads the zod schema at call time (no copied key lists), so the strip and the strict IPC
 * schema that checks the result can never disagree. Rules:
 *  1. Optional / nullable / default wrappers are unwrapped to find the structure; null and
 *     validity checks run against the ORIGINAL member schema.
 *  2. Strict objects lose undeclared keys at every depth; `null` on a member that accepts
 *     undefined but rejects null is removed; with `dropInvalidOptional` an optional member that
 *     still fails after cleaning is removed (inner-first). Required members are never removed.
 *  3. Loose / catchall objects pass through untouched.
 *  4. Arrays: every element is cleaned, none dropped. Records: every value is cleaned.
 *  5. Unions: a valid value is returned as-is; otherwise the first option the cleaned value
 *     satisfies wins; else the value is returned unchanged.
 *  6. Everything else is returned unchanged. Pure and total: no mutation, no throw, no
 *     prototype pollution (results are built with Object.fromEntries).
 */
import { z } from 'zod'

export interface StripOptions {
  /** Remove an optional member whose cleaned value still fails its schema. */
  readonly dropInvalidOptional: boolean
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    current = current.def.innerType as z.ZodType
  }
  return current
}

const accepts = (schema: z.ZodType, value: unknown): boolean =>
  schema.safeParse(value).success

function cleanObject(
  value: Record<string, unknown>,
  schema: z.ZodObject,
  options: StripOptions
): Record<string, unknown> {
  const shape = schema.shape as Record<string, z.ZodType>
  const entries: [string, unknown][] = []
  for (const [key, raw] of Object.entries(value)) {
    const member = Object.hasOwn(shape, key) ? shape[key] : undefined
    if (!member) continue
    const optional = accepts(member, undefined)
    if (raw === null && optional && !accepts(member, null)) continue
    const cleaned = clean(raw, member, options)
    if (options.dropInvalidOptional && optional && !accepts(member, cleaned))
      continue
    entries.push([key, cleaned])
  }
  return Object.fromEntries(entries)
}

function clean(
  value: unknown,
  schema: z.ZodType,
  options: StripOptions
): unknown {
  const inner = unwrap(schema)
  if (inner instanceof z.ZodObject) {
    if (!(inner.def.catchall instanceof z.ZodNever)) return value
    return isPlainObject(value) ? cleanObject(value, inner, options) : value
  }
  if (inner instanceof z.ZodArray) {
    if (!Array.isArray(value)) return value
    const element = inner.element as z.ZodType
    return value.map((item) => clean(item, element, options))
  }
  if (inner instanceof z.ZodRecord) {
    if (!isPlainObject(value)) return value
    const valueType = inner.def.valueType as z.ZodType
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clean(v, valueType, options)])
    )
  }
  if (inner instanceof z.ZodUnion) {
    if (accepts(inner, value)) return value
    for (const option of inner.options as z.ZodType[]) {
      const cleaned = clean(value, option, options)
      if (accepts(option, cleaned)) return cleaned
    }
    return value
  }
  return value
}

export function stripToSchema(
  value: unknown,
  schema: z.ZodType,
  options: StripOptions
): unknown {
  return clean(value, schema, options)
}
