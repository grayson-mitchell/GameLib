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
      'config',
      'command-runner',
      'store-managers',
      'i18n',
      'register-handlers',
      'rpc-server',
      // T-28-10 / T-66-27: the keyring/dev-vault arm and the orphaned-token cleanup run after
      // the RPC server is bound, and the cleanup after the store it sweeps is installed.
      'secret-stores',
      'orphaned-token-cleanup',
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

describe('stores modules construct nothing at import (66.1-25, MH-1)', () => {
  const STORE_MODULES = [
    'constants/key_value_stores.ts',
    'crossover_index/stores.ts',
    'downloadmanager/stores.ts',
    'game_overrides/stores.ts',
    'humble/stores.ts',
    'logger/stores.ts',
    'macArch/stores.ts',
    'migration/stores.ts',
    'runsForMe/stores.ts',
    'storeManagers/gog/stores.ts',
    'storeManagers/legendary/stores.ts',
    'storeManagers/nile/stores.ts',
    'storeManagers/sideload/stores.ts',
    'storeManagers/steam/stores.ts',
    'wiki_game_info/stores.ts',
    'wine/manager/stores.ts'
  ]

  it.each(STORE_MODULES)(
    '%s has no top-level store binding and exports one factory',
    (file) => {
      const stripped = stripSourceComments(
        readFileSync(join(__dirname, '..', '..', file), 'utf-8')
      )
      const lines = stripped.split('\n')
      expect(lines.filter((l) => /^(export\s+)?(let|const)\s/.test(l))).toEqual(
        []
      )
      expect(
        lines.filter((l) => /^export function create\w+Stores\(/.test(l))
      ).toHaveLength(1)
    }
  )

  it('the registry and the factory index construct nothing at import', () => {
    for (const file of ['storeRegistry.ts', 'createStores.ts']) {
      const stripped = stripSourceComments(
        readFileSync(join(__dirname, '..', '..', 'stores', file), 'utf-8')
      )
      expect(
        stripped.split('\n').filter((l) => /^(let|const)\s/.test(l))
      ).toEqual([])
    }
  })
})

describe('register-handlers and legacy-zoom-cleanup source shape (D-08, C-03)', () => {
  it('handlers.ts has no top-level registration statement', () => {
    const stripped = stripSourceComments(
      readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf-8')
    )
    const bad = stripped
      .split('\n')
      .filter((l) => /^(ipcMain\.handle|register[A-Z]\w*\()/.test(l))
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
  const allFiles = readdirSync(SIDECAR_DIR).filter(
    (name) =>
      name.endsWith('Registration.ts') || name === 'installedJsonWatcher.ts'
  )
  const files = allFiles
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

  it('no registration require()s or dynamically import()s a stores module or a banned binding', () => {
    const offenders: string[] = []
    const callRe =
      /(?:\bawait\s+)?\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g
    for (const { name, source } of sources) {
      for (const m of source.matchAll(callRe)) {
        const path = m[1] ?? ''
        if (/(^|\/)(key_value_)?stores$/.test(path)) {
          offenders.push(`${name}: loads ${path}`)
        }
        // The text before the call: `const { a, b } =` (destructure) or `x =`; after it: `.prop`.
        const before = source.slice(Math.max(0, m.index - 200), m.index)
        const after = source.slice(
          m.index + m[0].length,
          m.index + m[0].length + 80
        )
        const destructured =
          /\{([^{}]*)\}\s*(?::[^=]+)?=\s*$/.exec(before)?.[1] ?? ''
        const accessed = /^\)?\s*\.\s*(\w+)/.exec(after)?.[1] ?? ''
        for (const binding of BANNED_BINDINGS) {
          if (
            new RegExp(`\\b${binding}\\b`).test(destructured) ||
            accessed === binding
          ) {
            offenders.push(`${name}: loads ${binding} from ${path}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the dynamic-load scan catches a destructured banned binding (self-test)', () => {
    const src =
      "const { spawnAsync } = await import('../utils')\nconst x = require('../stores')"
    const callRe =
      /(?:\bawait\s+)?\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g
    const hits = [...src.matchAll(callRe)].map((m) => m[1])
    expect(hits).toEqual(['../utils', '../stores'])
  })

  it('no registration enters the storeManagers index for its side effects', () => {
    const offenders: string[] = []
    for (const { name, source: raw } of sources) {
      if (
        /^import\s+['"]\.\.\/storeManagers['"]/m.test(raw) ||
        /import\(\s*['"](?:\.\.\/|backend\/)storeManagers['"]\s*\)/.test(raw)
      ) {
        offenders.push(name)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Registrations that take no deps. Each one was read and is genuinely uncoupled from the
   * boot's stores and managers, OR is listed with the reason it is coupled and who removes it.
   * A new zero-param registration fails here until someone decides which it is.
   */
  const ZERO_PARAM_REGISTRATIONS: Record<string, string> = {
    registerOAuthLoginFlows:
      'uncoupled: the login-window seam (humble/loginWindowSeam), no store reads',
    registerDevEpicCookieSweepFlow:
      'uncoupled: the login-window seam, dev-only cookie sweep, no store reads',
    registerStoreEmbedFlows:
      'uncoupled: owns the store-embed seam and forwards to Rust, no store reads',
    registerDepotHostFlows:
      'uncoupled: the depot job registry (jobRegistry), no store reads',
    registerHumbleFlows:
      'COUPLED through bindHumbleStores: HumbleUser/HumbleLibrary read the bound static holder. ' +
      'Passing a slice here would not remove that read; the holder is a 66.3 target (backendDiCeilings header)',
    registerHumbleLoginFlows:
      'COUPLED through bindHumbleStores (HumbleUser/HumbleLibrary), same 66.3 target as registerHumbleFlows'
  }

  it('every exported register*Flows takes a single injected `deps` parameter unless it is on the explicit zero-param allowlist', () => {
    const offenders: string[] = []
    const zeroParam: string[] = []
    let checked = 0
    for (const { name, source } of sources) {
      for (const m of source.matchAll(
        /export (?:async )?function (register\w+Flows?)\(([^)]*)\)/g
      )) {
        const params = (m[2] ?? '').trim()
        if (params === '') {
          zeroParam.push(m[1] ?? '')
          if (!((m[1] ?? '') in ZERO_PARAM_REGISTRATIONS)) {
            offenders.push(
              `${name}: ${m[1]}() is not on the zero-param allowlist`
            )
          }
          continue
        }
        checked += 1
        if (!/^deps\s*:/.test(params)) {
          offenders.push(`${name}: ${m[1]}(${params})`)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(offenders).toEqual([])
    // No stale entries: every allowlisted name still exists as a zero-param registration.
    expect(zeroParam.sort()).toEqual(
      Object.keys(ZERO_PARAM_REGISTRATIONS).sort()
    )
  })
})
