/**
 * 34.13 review C-22 — every `t()` default in `MainButton.tsx` must equal the
 * catalog value for its key.
 *
 * WHY THIS IS A REAL GATE AND NOT TIDINESS
 *
 * When the key exists, the inline default is INERT — i18next never renders it.
 * So a divergent default is silent by construction, and the only thing it can
 * do is mislead. C-22 found `label.playing.start_with_logs` called twice in
 * the same component with two DIFFERENT defaults, only one of which is what
 * the app renders: a reader of the first call site was told the label reads
 * "Play (with logs)" when it reads "Play Now (with logs)".
 *
 * The faithful `t` mock (C-10/C-21) cannot catch this — the suite that
 * exercises this branch asserts `toContain('Play')`, which both strings
 * satisfy. Nor can a per-call-site assertion: the defect is a DISAGREEMENT
 * between two sites. So this gate enumerates every `t('key', 'default')` call
 * in the file and compares each against the real catalogs, which also makes it
 * a standing pin — a future divergence anywhere in the component fails by name.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import gamepage from '../../../../../../../public/locales/en/gamepage.json'
import gamelib from '../../../../../../../public/locales/en/gamelib.json'

const SOURCE = stripSourceComments(
  readFileSync(join(__dirname, '..', 'MainButton.tsx'), 'utf-8')
)

const CATALOGS: Record<string, unknown> = { gamepage, gamelib }
/** MainButton binds `useTranslation('gamepage')`. */
const BOUND_NAMESPACE = 'gamepage'

function catalogValue(key: string): string | undefined {
  const colon = key.indexOf(':')
  const namespace = colon === -1 ? BOUND_NAMESPACE : key.slice(0, colon)
  const path = colon === -1 ? key : key.slice(colon + 1)
  const resolved = path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') {
      return (node as Record<string, unknown>)[part]
    }
    return undefined
  }, CATALOGS[namespace])
  return typeof resolved === 'string' ? resolved : undefined
}

interface TCall {
  key: string
  defaultValue: string
}

/**
 * Every `t('key', 'default')` call in the file, whitespace-insensitively (the
 * file is prettier-formatted, so several of these span three lines — a
 * line-scoped scan would be the ledgered "a line-scoped source gate in a
 * prettier-enforced repo is a gate with a formatting-shaped failure mode").
 * Object-form calls (`t(key, { defaultValue, … })`) carry interpolation and
 * are matched separately below.
 */
function collectTCalls(source: string): TCall[] {
  const flattened = source.replace(/\s+/g, ' ')
  const re = /\bt\( ?'([^']+)', ?'((?:[^'\\]|\\.)*)' ?\)/g
  const calls: TCall[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(flattened)) !== null) {
    calls.push({ key: m[1], defaultValue: m[2].replace(/\\'/g, "'") })
  }
  return calls
}

/** `t('key', { defaultValue: '…', … })` — the interpolating form. */
function collectObjectFormTCalls(source: string): TCall[] {
  const flattened = source.replace(/\s+/g, ' ')
  const re = /\bt\( ?'([^']+)', ?\{ defaultValue: '((?:[^'\\]|\\.)*)'/g
  const calls: TCall[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(flattened)) !== null) {
    calls.push({ key: m[1], defaultValue: m[2].replace(/\\'/g, "'") })
  }
  return calls
}

const allCalls = [
  ...collectTCalls(SOURCE),
  ...collectObjectFormTCalls(SOURCE)
].filter((c) => catalogValue(c.key) !== undefined)

describe('C-22: no t() default in MainButton.tsx diverges from the catalog', () => {
  it('the scan is non-vacuous', () => {
    // If the regex ever stops matching (a refactor to a helper, a different
    // quote style) this whole file silently guards nothing.
    expect(allCalls.length).toBeGreaterThanOrEqual(10)
    expect(allCalls.map((c) => c.key)).toContain(
      'label.playing.start_with_logs'
    )
    expect(allCalls.map((c) => c.key)).toContain(
      'gamelib:steam.install.withOptionsLabel'
    )
  })

  it.each(allCalls.map((c) => [c.key, c.defaultValue] as const))(
    'the inline default for "%s" equals its catalog value',
    (key, defaultValue) => {
      expect(defaultValue).toBe(catalogValue(key))
    }
  )

  it('the two label.playing.start_with_logs call sites agree with each other', () => {
    // The specific C-22 defect: one key, one component, two defaults.
    const defaults = new Set(
      allCalls
        .filter((c) => c.key === 'label.playing.start_with_logs')
        .map((c) => c.defaultValue)
    )
    expect(
      allCalls.filter((c) => c.key === 'label.playing.start_with_logs').length
    ).toBe(2)
    expect([...defaults]).toEqual([
      catalogValue('label.playing.start_with_logs')
    ])
  })

  it('RED: the real pre-fix default DERIVED FROM THE REAL SOURCE fails both obligations', () => {
    const knownBad = SOURCE.replace(
      "t('label.playing.start_with_logs', 'Play Now (with logs)')\n",
      "t('label.playing.start_with_logs', 'Play (with logs)')\n"
    )
    expect(knownBad).not.toBe(SOURCE)
    const badCalls = collectTCalls(knownBad).filter(
      (c) => c.key === 'label.playing.start_with_logs'
    )
    expect(badCalls.length).toBe(2)
    expect(badCalls.some((c) => c.defaultValue !== catalogValue(c.key))).toBe(
      true
    )
    expect(new Set(badCalls.map((c) => c.defaultValue)).size).toBe(2)
  })
})
