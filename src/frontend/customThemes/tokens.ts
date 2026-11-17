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

/** @public exported on purpose ahead of its first cross-module import: the editor group ids that plans 64-05 onward key their section headings and i18n labels by. */
export type CoreTokenGroupId =
  | 'surfaces'
  | 'navigation'
  | 'text'
  | 'buttons'
  | 'accent'
  | 'status'

export interface CoreTokenGroup {
  id: CoreTokenGroupId
  tokens: readonly string[]
}

/**
 * The 27 core tokens the editor lists and the thumbnail reads (D-12, UI-SPEC
 * "Core tokens"), in UI-SPEC order.
 */
export const CORE_TOKEN_GROUPS: readonly CoreTokenGroup[] = [
  {
    id: 'surfaces',
    tokens: [
      '--body-background',
      '--background',
      '--input-background',
      '--modal-background',
      '--modal-border',
      '--border-color'
    ]
  },
  {
    id: 'navigation',
    tokens: [
      '--navbar-background',
      '--navbar-active-background',
      '--navbar-active',
      '--navbar-inactive',
      '--navbar-accent'
    ]
  },
  {
    id: 'text',
    tokens: [
      '--text-default',
      '--text-secondary',
      '--text-tertiary',
      '--text-hover'
    ]
  },
  {
    id: 'buttons',
    tokens: [
      '--primary',
      '--primary-hover',
      '--secondary-button',
      '--success-button',
      '--cancel-button',
      '--danger'
    ]
  },
  {
    id: 'accent',
    tokens: ['--accent', '--accent-overlay', '--search-bar-border']
  },
  {
    id: 'status',
    tokens: ['--status-success', '--status-warning', '--status-danger']
  }
]

export const CORE_TOKENS: readonly string[] = CORE_TOKEN_GROUPS.flatMap(
  (g) => g.tokens
)

/**
 * How a core token a built-in leaves undeclared is seeded: the first entry
 * that yields a value wins. A `--name` entry takes the already-flattened
 * value of that token; anything else is a literal colour. Each chain is the
 * real consumer fallback (git grep over src/frontend styles):
 *   var(--navbar-active, var(--accent-overlay, var(--accent)))
 *   var(--navbar-inactive, var(--navbar-accent))      (NavItem/index.scss)
 *   var(--text-hover, var(--accent))
 *   .button.is-success { background: var(--success-button, var(--status-success)) }
 *   var(--danger, #cc3333)
 */
export const CORE_TOKEN_SEEDS: Readonly<Record<string, readonly string[]>> = {
  '--navbar-active': ['--accent-overlay', '--accent'],
  '--navbar-inactive': ['--navbar-accent'],
  '--text-hover': ['--accent'],
  '--success-button': ['--status-success'],
  '--danger': ['#cc3333'],
  // `.button { background: var(--primary) }` has no fallback, so an
  // undeclared --primary computes to a transparent background (zombie).
  '--primary': ['#00000000']
}
