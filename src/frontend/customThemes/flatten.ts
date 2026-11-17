/**
 * Browser-faithful flatten of one built-in theme into literal colour values
 * (D-11). Relative imports only: `meta/runTs.cjs` does not honour the
 * tsconfig `baseUrl`.
 *
 * Two tiers, because that is where the browser computes each token. A token
 * declared only on `:root` (the colorSystem mixin) is computed AT `:root`, so
 * a `body.<theme>` override of a token it references never reaches it;
 * resolving its raw text in body scope would store values the real app never
 * paints. Body and theme tokens are computed on `<body>`, where the root
 * values are already inherited. So: resolve root tokens in root scope first,
 * then resolve everything else in a scope that is the root results overlaid
 * by the base `body {}` block and then every `body.<key> {}` block.
 */
import {
  allBlocksFor,
  cssBlock,
  customProps,
  globalTokensFrom
} from '../testUtils/scssTokenSource'
import { normaliseColour } from './colour'
import { resolveColour } from './tokenResolve'
import {
  CORE_TOKEN_SEEDS,
  CORE_TOKENS,
  LIVE_DERIVED_TOKENS,
  NON_COLOUR_TOKENS
} from './tokens'

export interface FlattenInput {
  /** `themes.scss`, comment-stripped. */
  themesScss: string
  /** `styles/_colors.scss`, comment-stripped. */
  colorsScss: string
  /** The theme key, e.g. `dracula`. */
  key: string
}

const GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\(/

/** Index of the `)` that closes the `(` at `open`, or -1. */
const closingParen = (text: string, open: number): number => {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

/**
 * Replaces every `var(--x[, fallback])` inside gradient text with its
 * resolved literal. Returns null when any inner var cannot resolve to a
 * literal.
 *
 * i18n-gate-exempt: the `var(` literal is CSS syntax, never rendered to a user
 */
const substituteVars = (
  text: string,
  scope: Map<string, string>
): string | null => {
  let out = ''
  let i = 0
  for (;;) {
    const at = text.indexOf('var(', i)
    if (at === -1) return out + text.slice(i)
    const end = closingParen(text, at + 3)
    if (end === -1) return null
    const resolved = resolveColour(
      text.slice(at, end + 1),
      scope,
      new Map<string, string>()
    )
    if (resolved === null || resolved.includes('var(')) return null
    out += text.slice(i, at) + (normaliseColour(resolved) ?? resolved)
    i = end + 1
  }
}

/** One value to its stored literal, or null when it cannot be stored. */
const flattenValue = (
  raw: string,
  scope: Map<string, string>
): string | null => {
  let resolved: string | null
  try {
    resolved = resolveColour(raw, scope, new Map<string, string>())
  } catch {
    return null
  }
  if (resolved === null) return null
  if (GRADIENT_RE.test(resolved)) {
    try {
      return substituteVars(resolved, scope)
    } catch {
      return null
    }
  }
  return normaliseColour(resolved)
}

/**
 * The selector a theme's block is declared under in `themes.scss`.
 *
 * i18n-gate-exempt: the `body.` literal is CSS selector syntax, never rendered to a user
 */
const themeSelector = (key: string): string => `body.${key}`

export function flattenBuiltinTheme(
  input: FlattenInput
): Record<string, string> {
  const rootRaw = globalTokensFrom(input.colorsScss)

  // Root tier: computed at :root, keep only literal results.
  const scope = new Map<string, string>()
  for (const [name, raw] of rootRaw) {
    const value = flattenValue(raw, rootRaw)
    if (value !== null) scope.set(name, value)
  }

  // Body tier: base body block, then every body.<key> block, last wins.
  for (const [k, v] of customProps(cssBlock(input.themesScss, 'body')))
    scope.set(k, v)
  for (const block of allBlocksFor(input.themesScss, themeSelector(input.key)))
    for (const [k, v] of customProps(block)) scope.set(k, v)

  const skipped = new Set<string>([
    ...NON_COLOUR_TOKENS,
    ...Object.keys(LIVE_DERIVED_TOKENS)
  ])
  const flat = new Map<string, string>()
  for (const [name, raw] of scope) {
    if (skipped.has(name)) continue
    const value = flattenValue(raw, scope)
    if (value !== null) flat.set(name, value)
  }

  // Seed every core token the theme leaves undeclared from its consumer
  // fallback chain, so a later release that starts declaring one in
  // themes.scss cannot change an existing copy: the copy already stores it.
  for (const token of CORE_TOKENS) {
    if (flat.has(token)) continue
    for (const candidate of CORE_TOKEN_SEEDS[token] ?? []) {
      const value = candidate.startsWith('--')
        ? flat.get(candidate)
        : normaliseColour(candidate)
      if (value !== undefined && value !== null) {
        flat.set(token, value)
        break
      }
    }
    if (!flat.has(token))
      throw new Error(
        `flattenBuiltinTheme: theme "${input.key}" leaves core token ${token} undeclared and no seed chain fills it`
      )
  }

  return Object.fromEntries(
    [...flat.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
}
