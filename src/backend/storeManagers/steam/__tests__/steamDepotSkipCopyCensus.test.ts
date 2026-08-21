/**
 * 23.2-04 (D-06/D-07) — a copy-contract census for the depot-skip completion
 * notice, modeled on
 * src/frontend/screens/Game/GamePage/components/__tests__/steamResumeCopyCensus.test.ts.
 *
 * WHY THIS GATE EXISTS
 *
 * The skip notice is the only surface distinguishing a complete install from
 * a deliberately reduced one (T-23.2-18). Its correctness depends on four
 * facts holding simultaneously, in four different files, that no single
 * per-file test naturally covers together:
 *
 *   1. The new catalog key exists, carries `{{depots}}`, and never carries
 *      `{{count}}` (i18next reserves that name for pluralization — see
 *      T-23.2-22).
 *   2. The pre-existing `steam.download.error.depotBlocked` key — the
 *      residual terminal path this notice supersedes for the ordinary case
 *      — stays byte-identical. A silent rewording here would be invisible
 *      to every test that only asserts the NEW key.
 *   3. `library.ts` references the new key by its literal string, so a
 *      rename in one file cannot silently desync from the catalog.
 *   4. `depotErrors.ts` still references `depotBlocked` literally, proving
 *      the residual EResult-40 terminal path was not accidentally
 *      repointed at the new key.
 *
 * Each predicate below is proven non-vacuous with an in-test known-bad
 * specimen. A census that has never been shown to fail is not evidence
 * (this repo's own precedent: grep-assertion-must-fail-against-known-bad-input).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from '../../../testUtils/stripSourceComments'
import translation from '../../../../../public/locales/en/translation.json'

// __dirname: src/backend/storeManagers/steam/__tests__
const REPO_ROOT = join(__dirname, '../../../../..')
const LIBRARY_TS_PATH = join(
  REPO_ROOT,
  'src/backend/storeManagers/steam/library.ts'
)
const DEPOT_ERRORS_TS_PATH = join(
  REPO_ROOT,
  'src/backend/storeManagers/steam/depotErrors.ts'
)

const ORIGINAL_DEPOT_BLOCKED_VALUE =
  'This depot appears to be blocked for your account or region right now. The game may still be installable directly through the Steam client.'

interface TranslationShape {
  steam: {
    download: {
      notify: { depotSkipped?: string }
      error: { depotBlocked?: string }
    }
  }
}

const typedTranslation = translation as unknown as TranslationShape

describe('steamDepotSkipCopyCensus (23.2-04, D-06/D-07): the depot-skip notice copy contract', () => {
  describe('1. translation.json depotSkipped: exists, carries {{depots}}, never {{count}}', () => {
    it('the key exists and carries {{depots}}', () => {
      const value = typedTranslation.steam.download.notify.depotSkipped
      expect(value).toBeDefined()
      expect(value).toContain('{{depots}}')
    })

    it('the key never carries the reserved {{count}} interpolation name', () => {
      const value = typedTranslation.steam.download.notify.depotSkipped ?? ''
      expect(value).not.toContain('{{count}}')
    })

    it('RED: a known-bad specimen using {{count}} trips the predicate', () => {
      const knownBad =
        "Installed without depot {{count}}. Steam wouldn't release its key."
      expect(knownBad.includes('{{count}}')).toBe(true)
    })

    it('RED: a known-bad specimen missing {{depots}} trips the presence predicate', () => {
      const knownBad =
        "Installed without a depot. Steam wouldn't release its key."
      expect(knownBad.includes('{{depots}}')).toBe(false)
    })
  })

  describe('2. translation.json depotBlocked: byte-identical to its pre-23.2-04 value', () => {
    it('the value is unchanged, verbatim', () => {
      expect(typedTranslation.steam.download.error.depotBlocked).toBe(
        ORIGINAL_DEPOT_BLOCKED_VALUE
      )
    })

    it('RED: a known-bad (reworded) specimen trips the byte-identity predicate', () => {
      const knownBad = ORIGINAL_DEPOT_BLOCKED_VALUE.replace(
        'right now',
        'at this time'
      )
      expect(knownBad).not.toBe(ORIGINAL_DEPOT_BLOCKED_VALUE)
    })
  })

  describe('3. library.ts references the new key literally', () => {
    const librarySource = stripSourceComments(
      readFileSync(LIBRARY_TS_PATH, 'utf-8')
    )

    it('the literal key string is present, non-comment', () => {
      expect(librarySource).toContain('steam.download.notify.depotSkipped')
    })

    it('RED: a known-bad specimen with the key renamed trips the predicate', () => {
      const knownBad = librarySource.replace(
        'steam.download.notify.depotSkipped',
        'steam.download.notify.depotDropped'
      )
      expect(knownBad).not.toBe(librarySource)
      expect(knownBad.includes('steam.download.notify.depotSkipped')).toBe(
        false
      )
    })
  })

  describe('4. depotErrors.ts still references depotBlocked literally', () => {
    const depotErrorsSource = stripSourceComments(
      readFileSync(DEPOT_ERRORS_TS_PATH, 'utf-8')
    )

    it('the literal key string is present, non-comment', () => {
      expect(depotErrorsSource).toContain('steam.download.error.depotBlocked')
    })

    it('RED: a known-bad specimen with the reference removed trips the predicate', () => {
      const knownBad = depotErrorsSource.replace(
        /steam\.download\.error\.depotBlocked/g,
        ''
      )
      expect(knownBad).not.toBe(depotErrorsSource)
      expect(knownBad.includes('steam.download.error.depotBlocked')).toBe(false)
    })
  })
})
