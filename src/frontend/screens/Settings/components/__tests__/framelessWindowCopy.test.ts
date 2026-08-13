/**
 * Copy-accuracy gate for the frameless-window toggle (gap G2 / UAT test 2).
 *
 * The toggle's BEHAVIOUR passes -- verified twice, live -- applying the
 * setting with no restart. The defect was documentation contradicting code:
 * `translation.json`'s `setting.frameless-window.description` read "Use
 * frameless window (requires restart)" and `UseFramelessWindow.tsx` gated
 * the toggle-on path behind an "Experimental feature ahead" confirmation
 * dialog. This is a SOURCE-TEXT gate, not a render test -- there is no jsdom
 * in this jest project (see `src/frontend/jest.config.js` docstring), so the
 * component cannot be mounted here. Every assertion below scans
 * `stripSourceComments`-stripped source text, following the
 * `NavShell/__tests__/shellTokens.test.ts` idiom, so the explanatory comment
 * this plan added to `UseFramelessWindow.tsx` cannot satisfy or break a gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const COMPONENT_PATH = join(__dirname, '..', 'UseFramelessWindow.tsx')
const GAMELIB_CATALOG_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'public/locales/en/gamelib.json'
)
const TRANSLATION_CATALOG_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'public/locales/en/translation.json'
)

function readStrippedComponent(): string {
  return stripSourceComments(readFileSync(COMPONENT_PATH, 'utf8'))
}

const RESTART_PATTERN = /restart/i

describe('frameless-window toggle copy accuracy (gap G2, UAT test 2)', () => {
  it('the gamelib catalog description does not claim a restart is required', () => {
    const gamelibCatalog = JSON.parse(
      readFileSync(GAMELIB_CATALOG_PATH, 'utf8')
    )
    const description: string =
      gamelibCatalog.settings.framelessWindowDescription

    expect(description).toBeTruthy()
    // Gap G2 / UAT test 2: the frameless-window toggle applies live,
    // confirmed twice. The description must not claim a restart is
    // required.
    expect(description).not.toMatch(/requires restart/i)
    // Gap G2 / UAT test 2: must not mention "restart" at all.
    expect(description).not.toMatch(RESTART_PATTERN)
  })

  it('NON-VACUITY: the same /restart/i predicate DOES match the real retired string still on disk', () => {
    // A hand-built fixture (e.g. `'foo restart bar'`) would only prove the
    // regex compiles. This reads the literal defective string that shipped
    // the defect -- still present in translation.json because
    // `keepRemoved: true` (D-03) retires rather than deletes unreferenced
    // keys -- and proves the predicate fires on the exact input that caused
    // gap G2.
    const translationCatalog = JSON.parse(
      readFileSync(TRANSLATION_CATALOG_PATH, 'utf8')
    )
    const retiredDescription: string =
      translationCatalog.setting['frameless-window'].description

    expect(retiredDescription).toBe('Use frameless window (requires restart)')
    expect(RESTART_PATTERN.test(retiredDescription)).toBe(true)
  })

  it('the component contains no showDialogModal or ContextProvider reference', () => {
    const source = readStrippedComponent()

    // The confirmation dialog gated a live-applying, default-off,
    // reversible setting -- it must not be reintroduced.
    expect(source).not.toMatch(/showDialogModal/)
    expect(source).not.toMatch(/ContextProvider/)
  })

  it('the component references the gamelib namespace key and no upstream frameless-window key', () => {
    const source = readStrippedComponent()

    expect(source).toMatch(/gamelib:settings\.framelessWindowDescription/)
    // A revert to the upstream `setting.frameless-window.` namespace would
    // silently reintroduce the churn-guard conflict
    // (meta/i18nCatalogChurnGuard.ts forbids writes to translation.json).
    expect(source).not.toMatch(/setting\.frameless-window\./)
  })

  it('the component contains no tuple-form t([...]) call', () => {
    const source = readStrippedComponent()

    // The tuple idiom (t([key, fallback])) is the one gamelib-namespace
    // call shape this project's i18next-parser lexer config does not
    // support -- only the plain-key form is used.
    expect(source).not.toMatch(/t\(\[/)
  })
})
