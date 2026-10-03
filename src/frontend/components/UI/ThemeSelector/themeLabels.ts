import { TFunction } from 'i18next'

// Phase 34.8-08a (REQ-34.8-01/-11/-17): the 10 theme display-name
// violations this plan retrofits, extracted out of `index.tsx` into this
// standalone module.
//
// [Rule 3 - blocking issue, deviation from the plan's stated "same file" /
// "[key, defaultText] tuple table" action] `index.tsx` imports
// `{ SelectField, InfoBox, PathSelectionBox } from '..'`, the UI barrel,
// which transitively imports several `.scss` files this project's
// jsdom-less jest config cannot parse -- so this logic is split into this
// SCSS-free sibling module (same posture as `filters.ts` for
// SideloadDialog, later in this same plan).
//
// A SECOND, independent blocking issue surfaced re-running `scanSource()`
// directly (not just `npx jest`): `meta/hardcodedStringGate.ts`'s Pattern 2
// `[key, defaultText]` tuple-table exemption (the CrossoverBadge.tsx /
// LibraryFilters idiom this plan's `<read_first>` names) requires its first
// tuple element to match `DOTTED_KEY_RE`
// (`^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$`), which does not
// accept the `gamelib:` namespace-prefix colon this plan's own key
// convention (`gamelib:themeSelector.<slug>`) requires. A tuple-table built
// with `gamelib:`-prefixed keys therefore does NOT satisfy the gate's
// tuple exemption and is flagged. `defaultThemes` is kept as a
// `Record<string, true>` (key set unchanged, no string values at all) and
// `resolveThemeLabel` instead uses a plain switch with 10 direct,
// literal-argument `t('gamelib:themeSelector.<slug>', '<English>')` calls
// -- Pattern 1 (`isTCallArgument`), the same exemption already proven for
// every `gamelib:`-namespaced call site in this codebase (`copy.ts`,
// `filters.ts`), with no key-shape requirement at all. Directly verified
// via `scanSource()`: 0 violations, 20 exempted (re-measured 2026-10-04 at
// quick task 261004-bz3, after trimming the theme set from 14 to 10 --
// see RETIRED_THEME_MIGRATIONS below for the four keys removed).
export const defaultThemes: Record<string, true> = {
  midnightMirage: true,
  cyberSpaceOasis: true,
  'high-contrast': true,
  dracula: true,
  marine: true,
  zombie: true,
  'nord-light': true,
  'nord-dark': true,
  gruvbox_dark: true,
  sweet: true
}

// Quick task 261004-bz3: four near-duplicate/recoloured theme variants were
// retired from `defaultThemes` above. A user whose stored `theme` config
// value is still one of these four keys must not land on a blank app (see
// `index.tsx`'s `window.setTheme`, which treats any non-`defaultThemes` key
// as a custom theme CSS filename) -- so each retired key maps to its
// nearest surviving theme. `old-school` -> `zombie` because the two are
// byte-identical in background/navbar/input/icon tokens and differ only in
// 14 accent-derived tokens (measured against `themes.scss` at HEAD
// 5e285b702); the other three map to the base theme whose block they
// previously shared verbatim.
const RETIRED_THEME_MIGRATIONS = {
  cyberSpaceOasisAlt: 'cyberSpaceOasis',
  'marine-classic': 'marine',
  'zombie-classic': 'zombie',
  'old-school': 'zombie'
} as const satisfies Record<string, keyof typeof defaultThemes>

/**
 * Maps a retired theme key to its surviving replacement. Any key that is
 * not one of the four retired keys -- including every surviving
 * `defaultThemes` key and any genuinely custom theme CSS filename -- passes
 * through unchanged. Pure lookup over a closed literal map: no
 * interpolation, no string building, no regex (see threat register
 * T-261004bz3-01).
 */
export function migrateThemeKey(themeKey: string): string {
  if (
    Object.prototype.hasOwnProperty.call(RETIRED_THEME_MIGRATIONS, themeKey)
  ) {
    return RETIRED_THEME_MIGRATIONS[
      themeKey as keyof typeof RETIRED_THEME_MIGRATIONS
    ]
  }
  return themeKey
}

/**
 * Resolves a `defaultThemes` key to its display label through `t`, or falls
 * back to the raw `themeKey` unchanged for an unknown/custom theme (a
 * user's custom CSS file) -- preserves the pre-retrofit `defaultThemes[key]
 * || key` behaviour exactly.
 */
export function resolveThemeLabel(themeKey: string, t: TFunction): string {
  switch (themeKey) {
    case 'midnightMirage':
      return t('gamelib:themeSelector.midnightMirage', 'Midnight Mirage')
    case 'cyberSpaceOasis':
      return t('gamelib:themeSelector.cyberSpaceOasis', 'Cyberspace Oasis')
    case 'high-contrast':
      return t('gamelib:themeSelector.highContrast', 'High Contrast')
    case 'dracula':
      return t('gamelib:themeSelector.dracula', 'Dracula')
    case 'marine':
      return t('gamelib:themeSelector.marine', 'Marine')
    case 'zombie':
      return t('gamelib:themeSelector.zombie', 'Zombie')
    case 'nord-light':
      return t('gamelib:themeSelector.nordLight', 'Nord Light')
    case 'nord-dark':
      return t('gamelib:themeSelector.nordDark', 'Nord Dark')
    case 'gruvbox_dark':
      return t('gamelib:themeSelector.gruvboxDark', 'Gruvbox Dark')
    case 'sweet':
      return t('gamelib:themeSelector.sweet', 'Sweet')
    default:
      return themeKey
  }
}
