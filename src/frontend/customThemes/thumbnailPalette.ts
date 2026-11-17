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
  baseTokens: Tokens | undefined
): string => {
  const chain = CHAINS[element]
  const fallback = safeColour(
    baseTokens ? firstDefined(baseTokens, chain) : undefined,
    LAST_RESORT
  )
  return safeColour(firstDefined(tokens, chain), fallback)
}

export function thumbnailPalette(
  tokens: Tokens,
  base: string
): ThumbnailPalette {
  const baseTokens = builtinSeed(base)
  const palette = {} as ThumbnailPalette
  for (const element of Object.keys(CHAINS) as Array<keyof ThumbnailPalette>) {
    palette[element] = resolveElement(element, tokens, baseTokens)
  }
  return palette
}
