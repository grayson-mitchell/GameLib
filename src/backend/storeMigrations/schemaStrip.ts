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
 *  4. Arrays: every element is cleaned; with `dropInvalidElements` an element that still fails
 *     is removed, otherwise none is dropped. Records: every value is cleaned.
 *  5. Unions: a valid value is returned as-is. Otherwise pass 1 cleans each option losslessly
 *     (no dropInvalidOptional / dropInvalidElements) and the first option it satisfies wins;
 *     pass 2 runs the lossy clean only on options whose literal members the value already
 *     matches, so an arm can never win by dropping the value's own discriminant. Else the
 *     value is returned unchanged.
 *  6. Everything else is returned unchanged. Pure and total: no mutation, no throw, no
 *     prototype pollution (results are built with Object.fromEntries).
 */
import { z } from 'zod'

export interface StripOptions {
  /** Remove an optional member whose cleaned value still fails its schema. */
  readonly dropInvalidOptional: boolean
  /**
   * Remove an array element whose cleaned value still fails the element schema, keeping its
   * valid siblings. For user-state settings, where the whole array is otherwise lost (WR-02).
   */
  readonly dropInvalidElements?: boolean
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

/**
 * True unless `value` carries a present member that the option declares as a literal and the
 * value's member is a different literal. Non-object options always match.
 */
function literalMembersMatch(option: z.ZodType, value: unknown): boolean {
  const inner = unwrap(option)
  if (!(inner instanceof z.ZodObject) || !isPlainObject(value)) return true
  const shape = inner.shape as Record<string, z.ZodType>
  for (const [key, member] of Object.entries(shape)) {
    if (!(unwrap(member) instanceof z.ZodLiteral)) continue
    if (!Object.hasOwn(value, key) || value[key] === undefined) continue
    if (!accepts(unwrap(member), value[key])) return false
  }
  return true
}

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
    const cleaned = value.map((item) => clean(item, element, options))
    return options.dropInvalidElements
      ? cleaned.filter((item) => accepts(element, item))
      : cleaned
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
    const unionOptions = inner.options as z.ZodType[]
    // Pass 1 (lossless): only undeclared keys and rejected nulls go, so an arm whose own
    // discriminant the value carries wins before any arm that would drop that discriminant.
    const lossless: StripOptions = {
      dropInvalidOptional: false,
      dropInvalidElements: false
    }
    for (const option of unionOptions) {
      const cleaned = clean(value, option, lossless)
      if (accepts(option, cleaned)) return cleaned
    }
    // Pass 2 (lossy): only arms whose literal members the value already satisfies, so a
    // `type: 'dlc'` value can never be rewritten into the `type: 'basic'` arm (WR-01).
    for (const option of unionOptions) {
      if (!literalMembersMatch(option, value)) continue
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
