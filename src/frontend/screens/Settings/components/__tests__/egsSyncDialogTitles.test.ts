/**
 * Copy-distinctness gate for the EGS sync / unsync success dialogs
 * (todo 2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance).
 *
 * The defect: BOTH outcomes rendered under the literal, hardcoded title
 * `'EGS Sync'`, leaving a one-word body ("Sync Complete" vs "Unsync Complete")
 * as the only signal. The operator who filed the parent todo read an
 * "Unsync Complete" body under an "EGS Sync" title as confirmation that sync
 * had been ENABLED.
 *
 * This is a SOURCE-TEXT gate, not a render test -- there is no jsdom in this
 * jest project (see `src/frontend/jest.config.js`), so the component cannot be
 * mounted. Every source assertion runs against `stripSourceComments`-stripped
 * text, so the explanatory comment this change added to `EgsSettings.tsx`
 * cannot satisfy or break a gate.
 *
 * Assertions deliberately match the KEY STRINGS rather than whole `tGamelib(...)`
 * call expressions: prettier wraps those calls across four lines, and a regex
 * written against the unwrapped call would silently match nothing.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const COMPONENT_PATH = join(__dirname, '..', 'EgsSettings.tsx')
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')

const LOCALES = ['en', 'de', 'fr'] as const

const ENABLED_KEY = 'gamelib:settings.egsSyncEnabledTitle'
const DISABLED_KEY = 'gamelib:settings.egsSyncDisabledTitle'

/**
 * Any `title:` whose value is a bare string literal. This is the exact shape
 * of the retired defect (`title: 'EGS Sync'`) and the shape a future edit
 * would most plausibly reintroduce.
 */
const HARDCODED_TITLE = /title:\s*['"`]/

function readStrippedComponent(): string {
  return stripSourceComments(readFileSync(COMPONENT_PATH, 'utf8'))
}

/**
 * The distinctness rule the dialogs must satisfy, as a single named predicate
 * so the specs below and the non-vacuity spec exercise the SAME code.
 */
function titlesAreDistinguishable(enabled: string, disabled: string): boolean {
  return (
    typeof enabled === 'string' &&
    typeof disabled === 'string' &&
    enabled.trim() !== '' &&
    disabled.trim() !== '' &&
    enabled.trim().toLowerCase() !== disabled.trim().toLowerCase()
  )
}

function readCatalog(locale: string): Record<string, string> {
  const catalog = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'public/locales', locale, 'gamelib.json'),
      'utf8'
    )
  ) as { settings: Record<string, string> }
  return catalog.settings
}

describe('EGS sync / unsync dialog titles are distinguishable at a glance', () => {
  it.each(LOCALES)(
    '%s carries BOTH titles and they are not the same string',
    (locale) => {
      const settings = readCatalog(locale)
      const enabled = settings.egsSyncEnabledTitle
      const disabled = settings.egsSyncDisabledTitle

      // The whole point of the todo: an operator must be able to tell the two
      // outcomes apart from the title alone, in every shipped locale.
      expect(titlesAreDistinguishable(enabled, disabled)).toBe(true)
    }
  )

  it.each(LOCALES)(
    'NON-VACUITY (%s): the SAME predicate REJECTS the pre-fix condition -- one live title on both branches',
    (locale) => {
      // Not a hand-built fixture: this feeds the real shipped title through
      // the real predicate on both sides, which is exactly what the retired
      // `title: 'EGS Sync'` did. If this returned true, the specs above would
      // prove nothing.
      const { egsSyncEnabledTitle } = readCatalog(locale)

      expect(egsSyncEnabledTitle).toEqual(expect.any(String))
      expect(
        titlesAreDistinguishable(egsSyncEnabledTitle, egsSyncEnabledTitle)
      ).toBe(false)
      // An empty title is not "distinguishable" either, however different.
      expect(titlesAreDistinguishable(egsSyncEnabledTitle, '  ')).toBe(false)
    }
  )

  it('neither English title merely restates the body copy the dialog already shows', () => {
    const { egsSyncEnabledTitle, egsSyncDisabledTitle } = readCatalog('en')

    // Bodies are upstream `message.sync` / `message.unsync` ("Sync Complete" /
    // "Unsync Complete") and stay untouched. A title equal to its own body
    // would re-create the redundancy without adding a distinguishing signal.
    expect(egsSyncEnabledTitle).not.toBe('Sync Complete')
    expect(egsSyncDisabledTitle).not.toBe('Unsync Complete')
  })

  it('the component carries no hardcoded dialog title', () => {
    const source = readStrippedComponent()

    expect(source).not.toMatch(HARDCODED_TITLE)
    // The specific retired literal, named so a revert fails by name.
    expect(source).not.toMatch(/'EGS Sync'/)
  })

  it('NON-VACUITY: the hardcoded-title predicate DOES fire on the live source mutated back to the defect', () => {
    // Mutating the real file's text is stronger than asserting against a
    // fixture: it proves the regex fires on this component's actual shape,
    // not merely that it compiles.
    const mutated = readStrippedComponent().replace(
      /title: unlinked/,
      "title: 'EGS Sync' || unlinked"
    )

    expect(mutated).not.toBe(readStrippedComponent())
    expect(mutated).toMatch(HARDCODED_TITLE)
  })

  it('the component selects the title per outcome through both gamelib keys', () => {
    const source = readStrippedComponent()

    expect(source).toContain(ENABLED_KEY)
    expect(source).toContain(DISABLED_KEY)
    // The branch that picks between them. Without this, both keys could be
    // present while only one was ever rendered.
    expect(source).toMatch(/title:\s*unlinked/)
  })

  it('the gamelib keys are reached through the `tGamelib` alias the i18next-parser lexer knows', () => {
    const source = readStrippedComponent()

    // `i18next-parser.config.js` declares functions: ['t', 'tGamelib']. Any
    // other alias is invisible to the lexer and the keys never reach
    // translators.
    expect(source).toMatch(
      /const \{ t: tGamelib \} = useTranslation\('gamelib'\)/
    )
    expect(source).toMatch(/tGamelib\(/)
  })

  it('the component contains no tuple-form t([...]) call', () => {
    const source = readStrippedComponent()

    // The tuple idiom is the one call shape this project's lexer config does
    // not support once the key carries a `gamelib:` namespace prefix.
    expect(source).not.toMatch(/t\(\[/)
  })

  it('the upstream body keys are untouched, so no upstream catalog write is implied', () => {
    const source = readStrippedComponent()

    expect(source).toContain("t('message.sync')")
    expect(source).toContain("t('message.unsync')")
  })
})
