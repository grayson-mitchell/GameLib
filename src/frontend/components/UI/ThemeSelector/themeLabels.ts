import { TFunction } from 'i18next'

// Phase 34.8-08a (REQ-34.8-01/-11/-17): the 14 theme display-name
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
// `resolveThemeLabel` instead uses a plain switch with 14 direct,
// literal-argument `t('gamelib:themeSelector.<slug>', '<English>')` calls
// -- Pattern 1 (`isTCallArgument`), the same exemption already proven for
// every `gamelib:`-namespaced call site in this codebase (`copy.ts`,
// `filters.ts`), with no key-shape requirement at all. Directly verified
// via `scanSource()`: 0 violations, 28 exempted.
export const defaultThemes: Record<string, true> = {
  midnightMirage: true,
  cyberSpaceOasis: true,
  cyberSpaceOasisAlt: true,
  'high-contrast': true,
  'old-school': true,
  dracula: true,
  marine: true,
  'marine-classic': true,
  zombie: true,
  'zombie-classic': true,
  'nord-light': true,
  'nord-dark': true,
  gruvbox_dark: true,
  sweet: true
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
    case 'cyberSpaceOasisAlt':
      return t(
        'gamelib:themeSelector.cyberSpaceOasisAlt',
        'Cyberspace Oasis Classic'
      )
    case 'high-contrast':
      return t('gamelib:themeSelector.highContrast', 'High Contrast')
    case 'old-school':
      return t('gamelib:themeSelector.oldSchool', 'Old School GameLib')
    case 'dracula':
      return t('gamelib:themeSelector.dracula', 'Dracula')
    case 'marine':
      return t('gamelib:themeSelector.marine', 'Marine')
    case 'marine-classic':
      return t('gamelib:themeSelector.marineClassic', 'Marine Classic')
    case 'zombie':
      return t('gamelib:themeSelector.zombie', 'Zombie')
    case 'zombie-classic':
      return t('gamelib:themeSelector.zombieClassic', 'Zombie Classic')
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
