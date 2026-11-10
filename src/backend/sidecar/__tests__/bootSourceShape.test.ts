/**
 * Source-shape gates for the one-shot boot (Phase 66 D-08, D-16). This file boots nothing and
 * carries no jest.mock: it only reads source text, so it adds nothing to the mock ceilings.
 *
 * What it pins: bootstrap.ts holds exactly one top-level `let` (the latch), no per-block
 * once-guard booleans, no module-level i18nReady; the BOOT_STEP_NAMES literal keeps the ordering
 * anchors the boot comments record; and no sidecar test boots outside `bootFresh()`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const BOOTSTRAP = join(__dirname, '..', 'bootstrap.ts')
const strippedBootstrap = stripSourceComments(readFileSync(BOOTSTRAP, 'utf-8'))

describe('bootstrap.ts source shape (D-08)', () => {
  it('has exactly one top-level let, the latch', () => {
    const topLevelLets = strippedBootstrap
      .split('\n')
      .filter((line) => /^let\s/.test(line))
    expect(topLevelLets).toEqual(['let booted = false'])
  })

  it('has no *Initialized / *Registered once-guard and no module-level i18nReady', () => {
    expect(strippedBootstrap).not.toMatch(
      /\b[a-zA-Z]+(Initialized|Registered)\b/
    )
    expect(strippedBootstrap).not.toMatch(/^(let|var|const)\s+i18nReady\b/m)
  })

  it('lists the boot steps with the ordering anchors in strictly increasing order', () => {
    const match = /export const BOOT_STEP_NAMES = \[([\s\S]*?)\] as const/.exec(
      strippedBootstrap
    )
    expect(match).not.toBeNull()
    const names = [...(match?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map(
      (m) => m[1]
    )
    const anchors = [
      'logger',
      'migrations',
      'i18n',
      'register-handlers',
      'rpc-server',
      'online-monitor',
      'rosetta',
      'ready-sentinel',
      'sign-in-probe',
      'startup-protocol-url'
    ]
    const positions = anchors.map((anchor) => names.indexOf(anchor))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('register-handlers and legacy-zoom-cleanup source shape (D-08, C-03)', () => {
  it('handlers.ts has no top-level registration statement', () => {
    const stripped = stripSourceComments(
      readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf-8')
    )
    const bad = stripped
      .split('\n')
      .filter((l) =>
        /^(ipcMain\.handle|register[A-Z]\w*\(|ensureStoresRegistered\()/.test(l)
      )
    expect(bad).toEqual([])
  })

  it('the legacy-zoom-cleanup step reads ctx.paths.userData, not getPath', () => {
    expect(readFileSync(BOOTSTRAP, 'utf-8')).toContain(
      'removeLegacyZoomData(ctx.paths.userData)'
    )
    expect(strippedBootstrap).not.toMatch(
      /removeLegacyZoomData\(platformApi\.app\.getPath/
    )
  })
})

describe('no sidecar test boots outside the harness (D-08)', () => {
  const EXEMPT = new Set(['bootSourceShape.test.ts'])
  const BOOT_CALL = /(?<![.\w])init\(|startSidecar\(/

  function withoutLiterals(source: string): string {
    return source
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
  }

  it('finds no init( or startSidecar( call in any sidecar test but the harness', () => {
    const files = readdirSync(__dirname).filter(
      (name) => name.endsWith('.test.ts') && !EXEMPT.has(name)
    )
    expect(files.length).toBeGreaterThanOrEqual(30)

    const offenders = files.filter((name) =>
      BOOT_CALL.test(
        withoutLiterals(
          stripSourceComments(readFileSync(join(__dirname, name), 'utf-8'))
        )
      )
    )
    expect(offenders).toEqual([])
  })

  it('catches a synthetic offender (self-test)', () => {
    expect(BOOT_CALL.test(withoutLiterals('init(input, output)'))).toBe(true)
    expect(
      BOOT_CALL.test(withoutLiterals("it('init() boots', () => {})"))
    ).toBe(false)
    expect(BOOT_CALL.test(withoutLiterals('x.init(a)'))).toBe(false)
  })
})
