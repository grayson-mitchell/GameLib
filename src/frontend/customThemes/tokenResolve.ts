/**
 * `var()` chain and `color-mix(in srgb)` resolution over a token scope,
 * shared by the theme-token tests and the theme generator (D-16). Relative
 * imports only: `meta/runTs.cjs` does not honour the tsconfig `baseUrl`.
 */
import { mixSrgb, toRgb } from './colour'

/** Resolve a `var()` chain to a literal, following fallbacks exactly as CSS does. */
export const resolveValue = (
  value: string,
  scope: Map<string, string>,
  globals: Map<string, string>,
  seen = new Set<string>()
): string | null => {
  const v = value.trim()
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v)
  if (!m) return v
  const name = m[1] ?? ''
  const fallback = m[2]
  if (!seen.has(name)) {
    const next = scope.get(name) ?? globals.get(name)
    if (next !== undefined) {
      const r = resolveValue(next, scope, globals, new Set(seen).add(name))
      if (r !== null) return r
    }
  }
  return fallback ? resolveValue(fallback, scope, globals, seen) : null
}

/**
 * Splits a `color-mix()` argument list on TOP-LEVEL commas only, tracking
 * paren depth so a `var(--x, fallback)` fallback's own comma never ends an
 * argument early.
 */
const splitTopLevelCommas = (source: string): string[] => {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of source) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out
}

/** A colour argument of `color-mix()`: a colour expression plus an optional trailing `NN%`. */
const parseColourMixArg = (
  arg: string
): { colourExpr: string; weight: number | null } => {
  const trimmed = arg.trim()
  const m = /^([\s\S]+?)\s+(\d+)%$/.exec(trimmed)
  if (m) return { colourExpr: m[1] ?? '', weight: Number(m[2] ?? '') }
  return { colourExpr: trimmed, weight: null }
}

/**
 * Resolves a `var()` chain exactly as `resolveValue` does, and additionally
 * resolves a `color-mix(in srgb, A p%, B)` expression down to a literal hex
 * colour, reimplementing the CSS weight rules: one percentage given means the
 * other is `100 - p`; none given means 50/50; both given means normalised by
 * their sum. Each colour argument is resolved recursively and must itself be
 * a hex or named colour `toRgb` accepts -- a bare `transparent` or
 * `currentColor` argument throws rather than silently mis-resolving.
 *
 * i18n-gate-exempt: the string literals here are CSS syntax tokens and developer-facing Error text, never rendered to a user
 */
export const resolveColour = (
  value: string,
  scope: Map<string, string>,
  globals: Map<string, string>
): string | null => {
  const resolved = resolveValue(value, scope, globals)
  if (resolved === null) return null
  if (!resolved.startsWith('color-mix(')) return resolved

  const inner = resolved.slice('color-mix('.length, resolved.length - 1).trim()
  const args = splitTopLevelCommas(inner)
  if (args.length !== 3) {
    throw new Error(
      `expected 3 color-mix() arguments, found ${args.length}: ${resolved}`
    )
  }
  const colourSpace = args[0] ?? ''
  const argA = args[1] ?? ''
  const argB = args[2] ?? ''
  if (colourSpace.trim() !== 'in srgb') {
    throw new Error(
      `expected 'in srgb' color-mix(), found '${colourSpace.trim()}'`
    )
  }

  const a = parseColourMixArg(argA)
  const b = parseColourMixArg(argB)
  const colourA = resolveColour(a.colourExpr, scope, globals)
  const colourB = resolveColour(b.colourExpr, scope, globals)
  if (colourA === null || !toRgb(colourA)) {
    throw new Error(
      `color-mix() argument is not a resolvable colour: ${a.colourExpr} -> ${colourA}`
    )
  }
  if (colourB === null || !toRgb(colourB)) {
    throw new Error(
      `color-mix() argument is not a resolvable colour: ${b.colourExpr} -> ${colourB}`
    )
  }

  let weightA: number
  if (a.weight !== null && b.weight !== null) {
    const sum = a.weight + b.weight
    weightA = sum === 0 ? 50 : (a.weight / sum) * 100
  } else if (a.weight !== null) {
    weightA = a.weight
  } else if (b.weight !== null) {
    weightA = 100 - b.weight
  } else {
    weightA = 50
  }

  return mixSrgb(colourA, colourB, weightA / 100)
}
