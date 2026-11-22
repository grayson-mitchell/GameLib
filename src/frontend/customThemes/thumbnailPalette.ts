/**
 * Token map -> sanitised thumbnail palette (Phase 64, THEME-01). One colour per drawn element of
 * the SVG mini-launcher, each resolved through the same fallback chain the real consumer CSS uses
 * (NavItem, SearchBar, `.button`), then passed through `safeColour` so a half-typed or hostile
 * value can never reach an SVG attribute: an invalid value draws the base built-in's colour for
 * that element instead, and `#00000000` when even that is missing.
 */
import { builtinSeed } from './builtinTokens'
import { safeColour } from './colour'

export interface ThumbnailPalette {
  body: string
  tabBar: string
  inactiveLabel: string
  activeTab: string
  activeLabel: string
  sidebar: string
  activeRow: string
  searchFill: string
  searchStroke: string
  tile: string
  tileTitle: string
  primary: string
  primaryLabel: string
  secondary: string
  secondaryLabel: string
  success: string
  successLabel: string
  danger: string
  dangerLabel: string
  text: string
  textSecondary: string
}

type Tokens = Readonly<Record<string, string>>

/** Tokens in consumer order: the first one a theme defines wins, as `var(a, var(b))` does. */
const CHAINS: Readonly<Record<keyof ThumbnailPalette, readonly string[]>> = {
  body: ['--body-background'],
  tabBar: ['--navbar-background'],
  inactiveLabel: ['--navbar-inactive', '--navbar-accent'],
  activeTab: ['--body-background'],
  activeLabel: ['--navbar-active', '--accent-overlay', '--accent'],
  sidebar: ['--navbar-background'],
  activeRow: ['--navbar-active-background'],
  searchFill: ['--search-bar-background', '--input-background'],
  searchStroke: ['--search-bar-border', '--accent'],
  tile: ['--background'],
  tileTitle: ['--gamecard-title-color'],
  primary: ['--primary'],
  primaryLabel: ['--text-tertiary'],
  secondary: ['--secondary-button'],
  secondaryLabel: ['--text-tertiary'],
  success: ['--success-button', '--status-success'],
  successLabel: ['--text-tertiary'],
  danger: ['--cancel-button', '--status-danger'],
  dangerLabel: ['--text-tertiary'],
  text: ['--text-default'],
  textSecondary: ['--text-secondary']
}

const LAST_RESORT = '#00000000'

type PreviewOverride = { literal: string } | { token: string }

/**
 * Colours the BASE theme's own CSS sets with nested rules that beat the generic chains, so a copy
 * keeps them whatever its stored tokens say (OD-2). Nord Light's and GameLib Light's (the
 * pre-261122-qwk Nord Light, kept verbatim) `.button.is-success` is a literal `#81a1c1` with
 * `--text-default` text, and their `button.is-primary` text is `--text-default` (themes.scss,
 * `body.nord-light` and `body.gamelib-light`); a source-text test pins both rules per theme. NavTabs' Nord Light
 * selected-tab label is deliberately NOT mirrored here (UI-SPEC OD-2 lists only the two button rules).
 */
export const BASE_PREVIEW_OVERRIDES: Readonly<
  Record<string, Partial<Record<keyof ThumbnailPalette, PreviewOverride>>>
> = {
  'gamelib-light': {
    success: { literal: '#81a1c1' },
    successLabel: { token: '--text-default' },
    primaryLabel: { token: '--text-default' }
  },
  'nord-light': {
    success: { literal: '#81a1c1' },
    successLabel: { token: '--text-default' },
    primaryLabel: { token: '--text-default' }
  }
}

/** Tokens a base theme sets directly, so editing them does not change the real app (Plan 08 chip). */
export const BASE_OVERRIDDEN_TOKENS: Readonly<
  Record<string, readonly string[]>
> = {
  'gamelib-light': ['--success-button'],
  'nord-light': ['--success-button']
}

/** Every token any palette chain or base override reads (Plan 08 derives "Not in preview" from it). */
export const PREVIEW_TOKENS: ReadonlySet<string> = new Set([
  ...Object.values(CHAINS).flat(),
  ...Object.values(BASE_PREVIEW_OVERRIDES).flatMap((overrides) =>
    Object.values(overrides).flatMap((override) =>
      override && 'token' in override ? [override.token] : []
    )
  )
])

const firstDefined = (
  tokens: Tokens,
  chain: readonly string[]
): string | undefined => {
  for (const name of chain) {
    const value = tokens[name]
    if (value !== undefined) return value
  }
  return undefined
}

const resolveElement = (
  element: keyof ThumbnailPalette,
  tokens: Tokens,
  base: string,
  baseTokens: Tokens | undefined
): string => {
  const chain = CHAINS[element]
  const fallback = safeColour(
    baseTokens ? firstDefined(baseTokens, chain) : undefined,
    LAST_RESORT
  )
  const override = BASE_PREVIEW_OVERRIDES[base]?.[element]
  if (override) {
    if ('literal' in override) return safeColour(override.literal, fallback)
    return safeColour(
      tokens[override.token],
      safeColour(baseTokens?.[override.token], fallback)
    )
  }
  return safeColour(firstDefined(tokens, chain), fallback)
}

export function thumbnailPalette(
  tokens: Tokens,
  base: string
): ThumbnailPalette {
  const baseTokens = builtinSeed(base)
  const palette = {} as ThumbnailPalette
  for (const element of Object.keys(CHAINS) as Array<keyof ThumbnailPalette>) {
    palette[element] = resolveElement(element, tokens, base, baseTokens)
  }
  return palette
}
