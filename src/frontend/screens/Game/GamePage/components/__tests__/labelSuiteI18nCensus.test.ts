/**
 * 34.13 review C-21 — a CENSUS gate over the label suites' `t` mock.
 *
 * C-10 replaced the `t: (_key, defaultValue) => defaultValue` mock in two of
 * the three `MainButton` label suites and missed the third — which happened to
 * own the ONLY gate on the caret's accessible name. That is this phase's
 * dominant defect shape (fix the reported file, miss the sibling), and a
 * per-file assertion cannot see it. So this gate enumerates the suites from the
 * FILESYSTEM rather than from a hardcoded list: a fourth label suite added
 * later is enrolled automatically.
 *
 * THE PROPERTY: no suite that asserts a user-facing label may resolve `t`
 * through the inline default argument. A defaults-returning mock measures a
 * literal that need not appear anywhere in the running UI, and stays green
 * through any change to the real catalog value — the repo's ledgered
 * "editing a `t()` DEFAULT is a silent no-op when the key exists" trap, seen
 * from the test side.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { makeFaithfulT } from './faithfulTranslate'
import gamelib from '../../../../../../../public/locales/en/gamelib.json'

const SUITE_DIR = __dirname

/**
 * Every suite in this directory that renders `MainButton` AND mocks
 * `react-i18next` — i.e. every suite whose assertions are about that
 * component's labels. Enumerated from disk, never hardcoded.
 *
 * Comments are stripped before any assertion: these files legitimately QUOTE
 * the pre-fix mock shape in their explanatory prose, and a naive text match
 * would report the documentation as the defect.
 */
const SELF = __filename.split('/').pop()!

const i18nSuites = readdirSync(SUITE_DIR)
  .filter((f) => /\.test\.tsx?$/.test(f))
  // This file necessarily contains both marker strings (in its own filter and
  // in the RED derivation's template) — it is the census, not a subject.
  .filter((f) => f !== SELF)
  .map((f) => ({
    name: f,
    source: stripSourceComments(readFileSync(join(SUITE_DIR, f), 'utf-8'))
  }))
  .filter(
    (s) =>
      s.source.includes("jest.mock('react-i18next'") &&
      s.source.includes("from '../MainButton'")
  )

describe('C-21: no label suite measures the inline t() default', () => {
  it('the census is non-vacuous', () => {
    // If this ever reaches zero the obligations below guard nothing. The
    // three MainButton label suites are the known members today.
    expect(i18nSuites.length).toBeGreaterThanOrEqual(3)
    expect(i18nSuites.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        'MainButton.steamIncomplete.test.tsx',
        'MainButton.steamSplitButton.test.tsx',
        'MainButton.steamWaitingRestart.test.tsx'
      ])
    )
  })

  it.each(i18nSuites.map((s) => [s.name, s.source] as const))(
    '%s routes t through the shared faithful mock',
    (_name, source) => {
      expect(source).toContain('faithfulTranslate')
      expect(source).toContain('faithfulReactI18next()')
    }
  )

  it.each(i18nSuites.map((s) => [s.name, s.source] as const))(
    '%s does not return the inline default from t',
    (_name, source) => {
      // The two shapes the pre-fix mocks used, whitespace-insensitively.
      const flattened = source.replace(/\s+/g, ' ')
      expect(flattened).not.toMatch(/t: \([^)]*\) => defaultValue/)
      expect(flattened).not.toMatch(/=> defaultValue \?\? _?key/)
    }
  )

  it('RED: the real pre-fix mock shape DERIVED FROM THE CENSUS fails both obligations', () => {
    const knownBad = i18nSuites[0].source.replace(
      /jest\.mock\('react-i18next'[\s\S]*?\n\}\)/,
      `jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key
  })
}))`
    )
    expect(knownBad).not.toBe(i18nSuites[0].source)
    expect(knownBad).not.toContain('faithfulReactI18next()')
    expect(knownBad.replace(/\s+/g, ' ')).toMatch(/=> defaultValue \?\? _?key/)
  })
})

describe('C-21: the shared mock genuinely crosses namespaces', () => {
  it('a gamelib:-prefixed key on a gamepage-bound t resolves through the gamelib catalog', () => {
    // This is the exact call MainButton.tsx:356 makes. The pre-C-21 mock
    // resolved gamepage.json only, split the key on '.', produced
    // ['gamelib:steam', 'install', 'withOptionsLabel'], failed to resolve, and
    // returned the inline default — so the ONE key in this component that
    // crosses namespaces was never actually measured.
    const t = makeFaithfulT('gamepage')
    expect(
      t('gamelib:steam.install.withOptionsLabel', 'INLINE-DEFAULT-SENTINEL')
    ).toBe(gamelib.steam.install.withOptionsLabel)
    expect(
      t('gamelib:steam.install.withOptionsLabel', 'INLINE-DEFAULT-SENTINEL')
    ).not.toBe('INLINE-DEFAULT-SENTINEL')
  })

  it('an unprefixed key still resolves in the BOUND namespace', () => {
    const t = makeFaithfulT('gamepage')
    expect(t('bottle.setup.done', 'INLINE-DEFAULT-SENTINEL')).toBe('Done')
  })

  it('a key that resolves nowhere falls back to the inline default, then the key', () => {
    const t = makeFaithfulT('gamepage')
    expect(t('no.such.key.anywhere', 'fallback')).toBe('fallback')
    expect(t('no.such.key.anywhere')).toBe('no.such.key.anywhere')
  })
})
