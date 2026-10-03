/**
 * Unit tests for ThemeSelector's `resolveThemeLabel` (Phase 34.8-08a,
 * REQ-34.8-01/-11/-17).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring). `ThemeSelector` itself calls
 * `useState`/`useEffect`/`useContext` beyond what a `react-i18next` mock
 * alone makes safe to invoke directly as a plain function, so this file
 * tests the extracted pure function instead, per this plan's
 * test-infrastructure note.
 *
 * Imports from `../themeLabels` (NOT `../index`) -- `index.tsx` pulls in
 * the UI barrel (`SelectField`/`InfoBox`/`PathSelectionBox` from `..`),
 * which transitively imports `.scss` files this project's jsdom-less jest
 * config cannot parse. `defaultThemes`/`resolveThemeLabel` are re-exported
 * unchanged from `index.tsx` for `src/frontend/index.tsx`'s external
 * `Object.keys(defaultThemes)` callers; this test targets the SCSS-free
 * source module directly.
 */
import { TFunction } from 'i18next'

import {
  defaultThemes,
  migrateThemeKey,
  resolveThemeLabel
} from '../themeLabels'

// Copy-preserving proof: a `t` that returns its own second (English
// default) argument unchanged.
const echoT = ((_key: string, defaultValue: string) =>
  defaultValue) as unknown as TFunction

// Genuine-routing proof: a `t` that ignores its default and returns a
// distinct sentinel -- proves the label flows through `t`, not a hardcoded
// literal sitting beside a decorative `t()` call.
const sentinelT = ((_key: string, _defaultValue: string) =>
  'SENTINEL') as unknown as TFunction

const expectedLabels: Record<string, string> = {
  midnightMirage: 'Midnight Mirage',
  cyberSpaceOasis: 'Cyberspace Oasis',
  'high-contrast': 'High Contrast',
  dracula: 'Dracula',
  marine: 'Marine',
  zombie: 'Zombie',
  'nord-light': 'Nord Light',
  'nord-dark': 'Nord Dark',
  gruvbox_dark: 'Gruvbox Dark',
  sweet: 'Sweet'
}

describe('resolveThemeLabel', () => {
  it('covers exactly the 10 known theme keys (guards against silent drift from defaultThemes)', () => {
    expect(Object.keys(defaultThemes).sort()).toEqual(
      Object.keys(expectedLabels).sort()
    )
    expect(Object.keys(defaultThemes)).toHaveLength(10)
  })

  it.each(Object.entries(expectedLabels))(
    'resolves theme key %s to its exact pre-retrofit English label under a copy-preserving t',
    (themeKey, expectedLabel) => {
      expect(resolveThemeLabel(themeKey, echoT)).toBe(expectedLabel)
    }
  )

  it.each(Object.keys(expectedLabels))(
    'routes theme key %s through t rather than a hardcoded literal (sentinel proof)',
    (themeKey) => {
      expect(resolveThemeLabel(themeKey, sentinelT)).toBe('SENTINEL')
    }
  )

  it('falls back to the raw key unchanged for an unknown/custom theme key', () => {
    expect(resolveThemeLabel('my-custom-theme', echoT)).toBe('my-custom-theme')
    expect(resolveThemeLabel('my-custom-theme', sentinelT)).toBe(
      'my-custom-theme'
    )
  })
})

describe('migrateThemeKey', () => {
  it('maps each of the 4 retired theme keys to its surviving replacement', () => {
    expect(migrateThemeKey('cyberSpaceOasisAlt')).toBe('cyberSpaceOasis')
    expect(migrateThemeKey('marine-classic')).toBe('marine')
    expect(migrateThemeKey('zombie-classic')).toBe('zombie')
    expect(migrateThemeKey('old-school')).toBe('zombie')
  })

  it('returns a surviving key unchanged', () => {
    expect(migrateThemeKey('marine')).toBe('marine')
  })

  it('passes a non-retired, non-defaultThemes key through unchanged (custom theme CSS filename)', () => {
    expect(migrateThemeKey('my-custom-theme.css')).toBe('my-custom-theme.css')
  })
})
