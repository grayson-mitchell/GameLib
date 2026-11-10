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
      'stores',
      'migrations',
      'command-runner',
      'store-managers',
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

describe('legacy service facades source shape (66.1-04, T-66.1-12)', () => {
  const stripped = stripSourceComments(
    readFileSync(
      join(__dirname, '..', '..', 'services', 'legacyFacades.ts'),
      'utf-8'
    )
  )

  it('has no top-level let/const binding', () => {
    expect(
      stripped.split('\n').filter((l) => /^(let|const)\s/.test(l))
    ).toEqual([])
  })

  it('constructs nothing', () => {
    expect(stripped).not.toMatch(/\bnew\s/)
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

describe('66.1 MH-3: registrations take slices', () => {
  const SIDECAR_DIR = join(__dirname, '..')
  const BANNED_BINDINGS = [
    'libraryManagerMap',
    'storeLaunchHooks',
    'getGame',
    'spawnAsync',
    'handleExit',
    'callRunner',
    'runWineCommand'
  ]
  // `storeRegistration.ts` keeps its side-effect store imports until plan 25 deletes it.
  // `runnerAuthFlowRegistration.ts` still builds its gog/legendary/nile user deps from the
  // legacy singletons at call time (66.1-08 transitional); it leaves this set when that
  // conversion lands.
  const EXEMPT = new Set([
    'storeRegistration.ts',
    'runnerAuthFlowRegistration.ts'
  ])
  const allFiles = readdirSync(SIDECAR_DIR).filter(
    (name) =>
      name.endsWith('Registration.ts') || name === 'installedJsonWatcher.ts'
  )
  const files = allFiles.filter((name) => !EXEMPT.has(name))
  const sources = files.map((name) => ({
    name,
    source: stripSourceComments(readFileSync(join(SIDECAR_DIR, name), 'utf-8'))
  }))

  /** Every `import ... from '<path>'` that is not a type-only import: its clause and path. */
  function valueImports(source: string): { clause: string; path: string }[] {
    return [
      ...source.matchAll(/^import\s+(?!type\b)([\s\S]*?)\s+from\s+'([^']+)'/gm)
    ].map((m) => ({ clause: m[1] ?? '', path: m[2] ?? '' }))
  }

  it('no registration value-imports a singleton, a stores module or a legacy accessor', () => {
    expect(allFiles.length).toBeGreaterThanOrEqual(25)
    const offenders: string[] = []
    for (const { name, source } of sources) {
      for (const { clause, path } of valueImports(source)) {
        if (/(^|\/)(key_value_)?stores$/.test(path)) {
          offenders.push(`${name}: imports ${path}`)
        }
        for (const binding of BANNED_BINDINGS) {
          // Inline `type X` specifiers are fine; only a value binding counts.
          const withoutTypes = clause.replace(/\btype\s+\w+(\s+as\s+\w+)?/g, '')
          if (new RegExp(`\\b${binding}\\b`).test(withoutTypes)) {
            offenders.push(`${name}: imports ${binding}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('every exported register*Flows in a coupled registration takes a single injected `deps` parameter', () => {
    const offenders: string[] = []
    let checked = 0
    for (const { name, source } of sources) {
      for (const m of source.matchAll(
        /export (?:async )?function (register\w+Flows)\(([^)]*)\)/g
      )) {
        const params = (m[2] ?? '').trim()
        if (params === '') continue // an uncoupled registration: nothing to inject
        checked += 1
        if (!/^deps\s*:/.test(params)) {
          offenders.push(`${name}: ${m[1]}(${params})`)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
