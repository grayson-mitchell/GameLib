import { TFunction } from 'i18next'

// Phase 34.8-08a (REQ-34.8-01/-11/-17): value type changed from a bare
// English string to a [gamelib key, English default] tuple, mirroring
// CrossoverBadge.tsx's `labelKeyByTier` idiom (already gate-tolerant per
// D-14). The KEY SET is unchanged -- src/frontend/index.tsx:34/224 both call
// `Object.keys(defaultThemes)` (via this module's re-export from
// `./index`) and must keep working unmodified.
//
// [Rule 3 - blocking issue, deviation from the plan's stated "same file"
// action] Split out of `index.tsx` into this standalone module: `index.tsx`
// imports `{ SelectField, InfoBox, PathSelectionBox } from '..'`, the UI
// barrel, which transitively imports several `.scss` files this project's
// jsdom-less jest config (`src/frontend/jest.config.js`, no `.scss`
// transform/moduleNameMapper) cannot parse. A test file that imports
// `resolveThemeLabel`/`defaultThemes` from `index.tsx` directly fails with
// "Jest encountered an unexpected token" on the first `.scss` import it
// transitively pulls in. Extracting the pure, `t`-parameterized logic into
// this SCSS-free sibling module lets the test import it in isolation, the
// same "extracted pure function tested directly" posture this plan's
// `<interfaces>` section already mandates for the component itself.
export const defaultThemes: Record<string, [key: string, defaultText: string]> = {
  midnightMirage: ['gamelib:themeSelector.midnightMirage', 'Midnight Mirage'],
  cyberSpaceOasis: ['gamelib:themeSelector.cyberSpaceOasis', 'Cyberspace Oasis'],
  cyberSpaceOasisAlt: [
    'gamelib:themeSelector.cyberSpaceOasisAlt',
    'Cyberspace Oasis Classic'
  ],
  'high-contrast': ['gamelib:themeSelector.highContrast', 'High Contrast'],
  'old-school': ['gamelib:themeSelector.oldSchool', 'Old School GameLib'],
  dracula: ['gamelib:themeSelector.dracula', 'Dracula'],
  marine: ['gamelib:themeSelector.marine', 'Marine'],
  'marine-classic': ['gamelib:themeSelector.marineClassic', 'Marine Classic'],
  zombie: ['gamelib:themeSelector.zombie', 'Zombie'],
  'zombie-classic': ['gamelib:themeSelector.zombieClassic', 'Zombie Classic'],
  'nord-light': ['gamelib:themeSelector.nordLight', 'Nord Light'],
  'nord-dark': ['gamelib:themeSelector.nordDark', 'Nord Dark'],
  gruvbox_dark: ['gamelib:themeSelector.gruvboxDark', 'Gruvbox Dark'],
  sweet: ['gamelib:themeSelector.sweet', 'Sweet']
}

/**
 * Resolves a `defaultThemes` key to its display label through `t`, or falls
 * back to the raw `themeKey` unchanged for an unknown/custom theme (a
 * user's custom CSS file) -- preserves the pre-retrofit `defaultThemes[key]
 * || key` behaviour exactly.
 */
export function resolveThemeLabel(themeKey: string, t: TFunction): string {
  const entry = defaultThemes[themeKey]
  if (!entry) {
    return themeKey
  }
  const [key, defaultText] = entry
  return t(key, defaultText)
}
