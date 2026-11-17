/**
 * Token lists for the theme editor, the thumbnail and the built-in seed
 * generator. Relative imports only: `meta/runTs.cjs` does not honour the
 * tsconfig `baseUrl`.
 */

/**
 * Tokens `themes.scss` derives from a core token, mapped to the core token
 * each one follows. They are never stored in a seed (OD-1): a copy that
 * stored them would freeze the derived value, so editing Body background or
 * Accent would stop reaching the Library header band and the focus ring.
 */
export const LIVE_DERIVED_TOKENS: Readonly<Record<string, string>> = {
  '--gradient-body-background': '--body-background',
  '--focus-ring-color': '--accent',
  '--focus-ring-halo': '--body-background',
  '--focus-ring-fill': '--accent',
  '--alphabet-filter-accent-color': '--accent',
  '--alphabet-filter-accent-hover': '--accent-overlay'
}

/** Tokens that are not colours; no colour editor or colour seed applies to them. */
export const NON_COLOUR_TOKENS = ['--focus-ring-width'] as const
