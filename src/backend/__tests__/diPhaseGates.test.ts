/**
 * Phase 66.1 end-state source gates (plan 27). Zero jest.mock: this file only reads source text,
 * so it adds nothing to the mock ceilings.
 *
 * What it pins: the transitional registries/facades are gone and stay gone; stores modules are
 * only value-imported by the stores factory and the boot; the launcher, command runner,
 * quit handler and every flow registration spawn nothing through child_process directly; and
 * neither the manager table nor any stores module constructs anything at import time.
 *
 * Every scan asserts a minimum file count so a half-empty walk cannot pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import * as ts from 'typescript'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const BACKEND = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/**
 * Test infrastructure is excluded from the production scans by name, not by accident. The one
 * place in it that may value-import stores modules is testUtils/testServices.ts (the test-side
 * stores factory); a dedicated test below pins that no other testUtils file does.
 */
const isTestInfra = (file: string): boolean =>
  /(^|\/)(__tests__|__mocks__|testUtils)\//.test(relative(BACKEND, file)) ||
  /\.(test|spec)\.tsx?$/.test(file) ||
  /jest\.[A-Za-z]+\.(ts|js)$/.test(file)

const nonTestSources = walk(BACKEND).filter(
  (f) => /\.ts$/.test(f) && !f.endsWith('.d.ts') && !isTestInfra(f)
)

const stripped = new Map<string, string>()
const source = (file: string): string => {
  let text = stripped.get(file)
  if (text === undefined) {
    text = stripSourceComments(readFileSync(file, 'utf-8'))
    stripped.set(file, text)
  }
  return text
}

/**
 * Top-level `const|let|var` statements whose initializer constructs something at import time
 * (a `new X(...)` outside any function body). Matched on the whole statement via the parser,
 * so a prettier-wrapped `const x =\n  new X(` is caught as well as the one-line form.
 */
function topLevelNewStatements(text: string): string[] {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const hasNewOutsideFunctions = (node: ts.Node): boolean => {
    if (ts.isNewExpression(node)) return true
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return false
    return ts.forEachChild(node, hasNewOutsideFunctions) ?? false
  }
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    for (const decl of st.declarationList.declarations) {
      if (decl.initializer && hasNewOutsideFunctions(decl.initializer)) {
        out.push(decl.getText(sf).replace(/\s+/g, ' ').slice(0, 80))
      }
    }
  }
  return out
}

const rel = (file: string): string => relative(BACKEND, file)

const STORES_MODULES = [
  'constants/key_value_stores.ts',
  ...walk(BACKEND)
    .map(rel)
    .filter(
      (f) =>
        /(^|\/)stores\.ts$/.test(f) &&
        !f.startsWith('stores/') &&
        !f.includes('__tests__')
    )
]

describe('66.1 end state: removed collaborators', () => {
  it('scans a full backend tree', () => {
    expect(nonTestSources.length).toBeGreaterThanOrEqual(400)
  })

  const FORBIDDEN = [
    'libraryManagerMap',
    'storeLaunchHooks',
    'trackedChildren',
    'longLivedChildren',
    'legacyManagerDeps',
    'legacyBootQueue',
    'legacyChildren',
    'services/legacyFacades'
  ]

  it.each(FORBIDDEN)('no non-test file references %s', (name) => {
    const offenders = nonTestSources
      .filter((f) => source(f).includes(name))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('the legacy facades module does not exist', () => {
    expect(existsSync(join(BACKEND, 'services', 'legacyFacades.ts'))).toBe(
      false
    )
    expect(existsSync(join(BACKEND, 'trackedChildren.ts'))).toBe(false)
    expect(existsSync(join(BACKEND, 'longLivedChildren.ts'))).toBe(false)
  })

  it('utils.ts no longer exports spawnAsync, handleExit or getGame', () => {
    expect(source(join(BACKEND, 'utils.ts'))).not.toMatch(
      /^export (const|async function|function) (spawnAsync|handleExit|getGame)\b/m
    )
  })
})

describe('66.1 end state: stores modules', () => {
  it('finds the 16 stores modules', () => {
    expect(STORES_MODULES).toHaveLength(16)
    for (const m of STORES_MODULES) {
      expect(existsSync(join(BACKEND, m))).toBe(true)
    }
  })

  it('no non-test file outside the stores modules and the stores factory value-imports one', () => {
    const allowed = new Set([...STORES_MODULES, 'stores/createStores.ts'])
    // `typeof import('...')` is a type position, not a value import, so the lookbehind skips it.
    const importRe =
      /^(import|export)\s+(type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]|(?<!typeof\s)(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/gm
    const offenders: string[] = []
    for (const file of nonTestSources) {
      if (allowed.has(rel(file))) continue
      for (const m of source(file).matchAll(importRe)) {
        if (m[2]) continue // import type / export type
        const spec = m[3] ?? m[4] ?? ''
        if (/(^|\/)stores$/.test(spec) || /key_value_stores$/.test(spec)) {
          offenders.push(`${rel(file)} -> ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the top-level-new scan catches one-line and prettier-wrapped statements, not factories', () => {
    expect(topLevelNewStatements('export const a = new Map()')).toHaveLength(1)
    expect(topLevelNewStatements('export const a =\n  new Map()')).toHaveLength(
      1
    )
    expect(
      topLevelNewStatements('const a = foo(\n  new Map()\n)')
    ).toHaveLength(1)
    expect(
      topLevelNewStatements(
        'export const make = () => {\n  return new Map()\n}'
      )
    ).toHaveLength(0)
    expect(
      topLevelNewStatements('function f() { return new Map() }')
    ).toHaveLength(0)
  })

  it('testUtils: only testServices.ts value-imports a stores module', () => {
    const files = walk(join(BACKEND, 'testUtils')).filter((f) =>
      /\.ts$/.test(f)
    )
    expect(files.length).toBeGreaterThan(3)
    const importRe =
      /^(import|export)\s+(type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]|(?<!typeof\s)(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/gm
    const offenders: string[] = []
    for (const file of files) {
      if (rel(file) === 'testUtils/testServices.ts') continue
      for (const m of source(file).matchAll(importRe)) {
        if (m[2]) continue
        const spec = m[3] ?? m[4] ?? ''
        if (/(^|\/)stores$/.test(spec) || /key_value_stores$/.test(spec)) {
          offenders.push(`${rel(file)} -> ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(source(join(BACKEND, 'testUtils/testServices.ts'))).not.toMatch(
      /\brequire\(/
    )
  })

  it('storeManagers/index.ts and every stores module have no top-level new', () => {
    const files = ['storeManagers/index.ts', ...STORES_MODULES]
    expect(files.length).toBeGreaterThanOrEqual(17)
    const offenders: string[] = []
    for (const f of files) {
      const text = source(join(BACKEND, f))
      expect(text.length).toBeGreaterThan(0)
      offenders.push(...topLevelNewStatements(text).map((st) => `${f}: ${st}`))
    }
    expect(offenders).toEqual([])
  })
})

describe('66.1 end state: no direct child_process', () => {
  const registrations = nonTestSources.filter((f) =>
    /\/sidecar\/[^/]*Registration\.ts$/.test(f)
  )

  it('finds the flow registrations', () => {
    expect(registrations.length).toBeGreaterThanOrEqual(24)
  })

  it('launcher, runner front doors and every registration import no child_process', () => {
    const files = [
      join(BACKEND, 'launcher.ts'),
      join(BACKEND, 'commandRunner.ts'),
      join(BACKEND, 'spawnAsync.ts'),
      join(BACKEND, 'quitHandler.ts'),
      ...registrations
    ]
    const offenders = files
      .filter((f) =>
        /(?:from|require\()\s*['"](?:node:)?child_process['"]/.test(source(f))
      )
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('66.2 end state: one process runner', () => {
  // The ceilings module is CommonJS (a node script); there is no ESM form to import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ceilings = require('../../../meta/backendDiCeilings.cjs') as {
    census: () => { childProcess: Record<string, number> }
    loadShards: () => {
      merged: { sanctioned: Record<string, { childProcess: number }> }
      failures: string[]
    }
  }

  it('only src/backend/process/runner.ts imports child_process', () => {
    expect(ceilings.census().childProcess).toEqual({
      'src/backend/process/runner.ts': 1
    })
  })

  it('the sanctioned list has exactly one child_process entry: the runner', () => {
    const { merged, failures } = ceilings.loadShards()
    expect(failures).toEqual([])
    const withCp = Object.entries(merged.sanctioned)
      .filter(([, e]) => e.childProcess > 0)
      .map(([p]) => p)
    expect(withCp).toEqual(['src/backend/process/runner.ts'])
  })

  it('the ESLint config rejects a child_process import in a backend production path', () => {
    const config = readFileSync(
      join(BACKEND, '..', '..', 'eslint.config.mjs'),
      'utf8'
    )
    const start = config.indexOf("files: ['src/backend/**/*.ts']")
    expect(start).toBeGreaterThan(-1)
    const block = config.slice(start, start + 1500)
    expect(block).toContain("name: 'child_process'")
    expect(block).toContain("name: 'node:child_process'")
    expect(block).toContain('...RESTRICTED_PATHS')
    expect(block).toContain("'src/backend/process/runner.ts'")
    expect(block).toMatch(/'no-restricted-imports': \[\s*'error'/)
  })
})

describe('66.3 end state: shim, config and process-wide owners at zero', () => {
  const importsPlatformShim = (
    text: string,
    opts?: { allowTypes?: boolean }
  ): boolean => {
    const code = stripSourceComments(text)
    return code.split('\n').some((line) => {
      if (opts?.allowTypes && /^\s*import\s+type\b/.test(line)) return false
      const m =
        /from\s*(['"])(backend\/platform|(?:\.\.?\/)+platform|\.\/platform)(\/index)?\1/.exec(
          line
        )
      return m !== null
    })
  }
  const callsStaticConfigGet = (text: string): boolean =>
    /\b(GlobalConfig|GameConfig)\.get\(/.test(stripSourceComments(text))

  const OWNED_66_3 = [
    'src/backend/platform/index.ts',
    'src/backend/config.ts',
    'src/backend/game_config.ts',
    'src/backend/online_monitor.ts',
    'src/backend/sidecar/processGuards.ts',
    'src/backend/engine/engineState.ts',
    'src/backend/storeManagers/steam/anonymousClient.ts',
    'src/backend/storeManagers/steam/gameSessionState.ts',
    'src/backend/storeManagers/steam/userSignInState.ts',
    'src/backend/storeManagers/steam/authTrigger.ts',
    'src/backend/storeManagers/steam/state.ts',
    'src/backend/storeManagers/steam/bridge/helperRegistry.ts',
    'src/backend/storeManagers/steam/bridge/shimCoverage.ts',
    'src/backend/tools/winetricksQueue.ts',
    'src/backend/signInProbe/pass.ts',
    'src/backend/signInProbe/outcomes.ts',
    'src/backend/signInProbe/sessionEpoch.ts',
    'src/backend/storeManagers/steam/user.ts',
    'src/backend/storeManagers/steam/bottle.ts',
    'src/backend/tools/dxmt.ts',
    'src/backend/steamgrid/secretStore.ts',
    'src/backend/sidecar/steamgridSecretStore.ts',
    'src/backend/humble/classify.ts',
    'src/backend/humble/library.ts',
    'src/backend/humble/loginWindowSeam.ts',
    'src/backend/humble/secretStore.ts',
    'src/backend/humble/syncFence.ts',
    'src/backend/humble/user.ts'
  ] as const

  it('scans a full backend tree', () => {
    expect(nonTestSources.length).toBeGreaterThanOrEqual(400)
  })

  it('importsPlatformShim fires on shim imports and not on comments or siblings', () => {
    expect(importsPlatformShim("import { app } from 'backend/platform'")).toBe(
      true
    )
    expect(importsPlatformShim("import { a } from '../platform'")).toBe(true)
    expect(
      importsPlatformShim("import { a } from '../../platform/index'")
    ).toBe(true)
    expect(importsPlatformShim("import { a } from './platform'")).toBe(true)
    expect(
      importsPlatformShim("import type { T } from 'backend/platform'", {
        allowTypes: true
      })
    ).toBe(false)
    expect(importsPlatformShim("// from 'backend/platform'")).toBe(false)
    expect(
      importsPlatformShim("import { a } from 'backend/platformCapture'")
    ).toBe(false)
  })

  it('callsStaticConfigGet fires on static config reads and not on comments or injected config', () => {
    expect(
      callsStaticConfigGet('const s = GlobalConfig.get().getSettings()')
    ).toBe(true)
    expect(callsStaticConfigGet('GameConfig.get(appName)')).toBe(true)
    expect(callsStaticConfigGet('deps.config.getSettings()')).toBe(false)
    expect(callsStaticConfigGet('// GlobalConfig.get()')).toBe(false)
    expect(callsStaticConfigGet('gameConfigs.get(appName)')).toBe(false)
  })

  it('OWNED_66_3 lists the 28 files 66.3 owns, all existing (but the deleted platform delegate) and none sanctioned', () => {
    // 66.3-17 deleted humble/humbleStores.ts outright (its holder had no remaining reader), so it
    // leaves the owned list: the file went away, it did not move.
    expect(OWNED_66_3).toHaveLength(28)
    const root = join(BACKEND, '..', '..')
    const sanctioned = [
      'src/backend/logger/index.ts',
      'src/backend/sidecar/bootstrap.ts',
      'src/backend/process/runner.ts'
    ]
    for (const p of OWNED_66_3) {
      // 66.3-18 deleted the platform delegate: it is on the owned list as the one file that must
      // no longer exist.
      expect(existsSync(join(root, p))).toBe(
        p !== 'src/backend/platform/index.ts'
      )
      expect(sanctioned).not.toContain(p)
    }
  })
  // The ceilings module is CommonJS (a node script); there is no ESM form to import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ceilings = require('../../../meta/backendDiCeilings.cjs') as {
    census: () => { moduleState: Record<string, number> }
    containerCallResidual: () => string[]
    loadShards: () => {
      merged: {
        sanctioned: Record<string, { kind: string; childProcess: number }>
      }
      failures: string[]
    }
    SANCTIONED_PATHS: Record<string, string[]>
  }
  const root = join(BACKEND, '..', '..')
  const SRC = join(root, 'src')

  // One census walk for the whole block (it reads every backend file).
  let censusState: Record<string, number> | undefined
  const moduleStateOf = (): Record<string, number> =>
    (censusState ??= ceilings.census().moduleState)

  it.each(OWNED_66_3)('%s has no module state', (file) => {
    expect(moduleStateOf()[file]).toBeUndefined()
    if (file === 'src/backend/platform/index.ts') {
      expect(existsSync(join(root, file))).toBe(false)
    }
  })

  // 66.4-19 (D-66.4-01): the five once-only latches, converted (not sanctioned).
  it.each([
    'src/backend/sidecar/devEpicCookieSweepRegistration.ts',
    'src/backend/sidecar/runnerAuthFlowRegistration.ts',
    'src/backend/sidecar/shortcutsFlowRegistration.ts',
    'src/backend/sidecar/wineToolsFlowRegistration.ts',
    'src/backend/sidecar/storeWriteHandlers.ts'
  ])('%s has no module state', (file) => {
    expect(moduleStateOf()[file]).toBeUndefined()
  })

  it('src/backend/platform does not exist', () => {
    expect(existsSync(join(BACKEND, 'platform'))).toBe(false)
  })

  const srcFiles = walk(SRC).filter(
    (f) => /\.(ts|tsx|js|cjs)$/.test(f) && !f.endsWith('.d.ts')
  )

  it('no non-test file under src imports backend/platform', () => {
    // The walk covers every source file of the repo's TypeScript tree (backend, common, preload
    // and frontend), so a type import from the retired facade is caught as well.
    expect(srcFiles.length).toBeGreaterThanOrEqual(1500)
    const offenders = srcFiles
      .filter((f) => !isTestInfra(f) && !/\/__tests__\//.test(f))
      .filter((f) => importsPlatformShim(readFileSync(f, 'utf-8')))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it('no non-test backend file calls GlobalConfig.get( or GameConfig.get(', () => {
    const offenders = nonTestSources
      .filter((f) => callsStaticConfigGet(readFileSync(f, 'utf-8')))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('the only sanctioned shard entry is the runner (module state is the 66.4 census test)', () => {
    const { merged, failures } = ceilings.loadShards()
    expect(failures).toEqual([])
    expect(Object.keys(merged.sanctioned)).toEqual([
      'src/backend/process/runner.ts'
    ])
  })

  it('no sanctioned entry has kind rust-overlap and its allowed path list is empty (D-14)', () => {
    const { merged } = ceilings.loadShards()
    expect(
      Object.values(merged.sanctioned).filter((e) => e.kind === 'rust-overlap')
    ).toEqual([])
    expect(ceilings.SANCTIONED_PATHS['rust-overlap']).toEqual([])
  })

  it('containerCallResidual() names no OWNED_66_3 file and no platform entry', () => {
    const residual = ceilings.containerCallResidual()
    expect(residual).toEqual([])
    for (const entry of residual) {
      expect(OWNED_66_3.some((f) => entry.startsWith(f + ':'))).toBe(false)
      expect(entry).not.toContain('/platform/')
    }
  })

  // 66.4-20 (D-66.4-04 / D-66.4-05): the import-bound path sources are deleted, and nothing under
  // src or meta imports them (a comment naming one is history, not an importer).
  it.each([
    'src/backend/constants/paths.ts',
    'src/backend/sidecar/pathShim.ts',
    'src/backend/storeManagers/steam/bottleDirs.ts',
    'src/backend/testUtils/pathShimPaths.ts'
  ])('%s is deleted', (file) => {
    expect(existsSync(join(root, file))).toBe(false)
  })

  it('no file under src or meta imports, requires or mocks backend/constants/paths, sidecar/pathShim or steam/bottleDirs', () => {
    const files = [
      ...srcFiles,
      ...walk(join(root, 'meta')).filter((f) => /\.(ts|tsx|js|cjs)$/.test(f))
    ]
      // These name the specifiers as DATA: this gate, testContainment's cross-project specifier
      // list and its self-test, and a module-hygiene text assertion.
      .filter(
        (f) =>
          f !== __filename &&
          !/sidecar\/__tests__\/testContainment\.test\.ts$/.test(f) &&
          !/drm\/__tests__\/steamclientLayerInstall\.test\.ts$/.test(f)
      )
    const SPECIFIER =
      /['"][^'"]*(constants\/paths|sidecar\/pathShim|\.\/pathShim|\.\.\/pathShim|steam\/bottleDirs|\.\/bottleDirs|pathShimPaths)['"]/
    const offenders = files
      .filter((f) =>
        SPECIFIER.test(stripSourceComments(readFileSync(f, 'utf-8')))
      )
      .map((f) => relative(root, f))
    expect(offenders).toEqual([])
  })

  // A class member that is `static get(`, or a static field that is not readonly: the two shapes a
  // static config accessor and its cache take. Methods (`static create(`) and readonly constants
  // are not state and do not match.
  const STATIC_GETTER = /\bstatic\s+(async\s+)?get\s*\(/
  const STATIC_MUTABLE_FIELD =
    /^\s*(public\s+|protected\s+|private\s+)?static\s+(?!readonly\b)(?!async\b)(?!get\b)(?!set\b)[A-Za-z_$][\w$]*\s*[?!]?\s*[:=;]/m
  const hasStaticConfigMember = (text: string): boolean => {
    const code = stripSourceComments(text)
    return STATIC_GETTER.test(code) || STATIC_MUTABLE_FIELD.test(code)
  }

  it('hasStaticConfigMember fires on a static getter and a static mutable field, and not on a method, a readonly constant or a comment', () => {
    expect(hasStaticConfigMember('class A { static get() {} }')).toBe(true)
    expect(
      hasStaticConfigMember(
        'class A {\n  protected static globalInstance: GlobalConfig\n}'
      )
    ).toBe(true)
    expect(
      hasStaticConfigMember('class A {\n  static instances = new Map()\n}')
    ).toBe(true)
    expect(
      hasStaticConfigMember('class A {\n  private static x?: number;\n}')
    ).toBe(true)
    expect(
      hasStaticConfigMember('class A {\n  static readonly DEFAULTS = {}\n}')
    ).toBe(false)
    expect(
      hasStaticConfigMember('class A {\n  static create(): X { return 1 }\n}')
    ).toBe(false)
    expect(
      hasStaticConfigMember(
        '// static get() {}\n/* static x = 1 */\nconst a = 1'
      )
    ).toBe(false)
  })

  it('config.ts and game_config.ts have no static get and no static mutable field', () => {
    for (const f of ['config.ts', 'game_config.ts']) {
      const text = readFileSync(join(BACKEND, f), 'utf-8')
      expect(text.length).toBeGreaterThan(0)
      expect(hasStaticConfigMember(text)).toBe(false)
    }
  })

  // The tokens the interim 66.3 scaffolding used. Raw text, not comment-stripped: a comment that
  // names one is just as stale as code that uses it.
  const INTERIM_TOKENS = [
    'interimIpc',
    'bindHostServices',
    'shim-bind',
    'adoptGlobalConfig',
    '@66.3-compat'
  ] as const
  const containsInterimToken = (text: string): string[] =>
    INTERIM_TOKENS.filter((token) => text.includes(token))

  it.each(INTERIM_TOKENS)(
    'the interim-scaffolding detector fires on %s and not on clean source',
    (token) => {
      expect(containsInterimToken(`const x = ${token}()`)).toEqual([token])
      expect(containsInterimToken('const x = createIpcRegistry()')).toEqual([])
    }
  )

  it('no 66.3 interim scaffolding remains under src', () => {
    const self = join(BACKEND, '__tests__', 'diPhaseGates.test.ts')
    const scanned = srcFiles.filter((f) => f !== self)
    // A walk that saw only a handful of files would pass vacuously.
    expect(scanned.length).toBeGreaterThanOrEqual(400)
    const offenders = scanned
      .map(
        (f) =>
          [
            relative(SRC, f),
            containsInterimToken(readFileSync(f, 'utf-8'))
          ] as const
      )
      .filter(([, tokens]) => tokens.length > 0)
    expect(offenders).toEqual([])
  })
})

// 66.4 end state (plan 21): the long tail is at zero, the census is a jest test, the path shim is gone.
describe('66.4 end state: long tail at zero, census is a test, path shim gone', () => {
  // Every file the 66.4 conversion plans took off the census and that still exists (the 85 shard
  // entries at the start of 66.4, less the two modules deleted outright).
  const OWNED_66_4 = [
    'src/backend/backend_events.ts',
    'src/backend/crossover_index/fetcher.ts',
    'src/backend/crossover_index/index.ts',
    'src/backend/dialog/dialog.ts',
    'src/backend/dialog/displayAck.ts',
    'src/backend/engine/bottleLedger.ts',
    'src/backend/engine/bottlePrimitives.ts',
    'src/backend/engine/crossoverLocation.ts',
    'src/backend/engine/engineNoticeStore.ts',
    'src/backend/engine/engineRegistry.ts',
    'src/backend/engine/engineSwitch.ts',
    'src/backend/engine/fallbackEngine.ts',
    'src/backend/engine/launchDeadline.ts',
    'src/backend/engine/launchEngine.ts',
    'src/backend/engine/launchSettings.ts',
    'src/backend/engine/perGameBottle.ts',
    'src/backend/gamedetails/overrides.ts',
    'src/backend/images_cache.ts',
    'src/backend/knownFixOverlayInstall.ts',
    'src/backend/knownFixesFetcher.ts',
    'src/backend/launchSingleFlight.ts',
    'src/backend/macArch/recovery.ts',
    'src/backend/protocol.ts',
    'src/backend/runsForMe/index.ts',
    'src/backend/sidecar/appShellFlowRegistration.ts',
    'src/backend/sidecar/devEpicCookieSweepRegistration.ts',
    'src/backend/sidecar/enrichmentFlowRegistration.ts',
    'src/backend/sidecar/fileStore.ts',
    'src/backend/sidecar/installedJsonWatcher.ts',
    'src/backend/sidecar/ipcValidation.ts',
    'src/backend/sidecar/outboundHttpRegistry.ts',
    'src/backend/sidecar/runnerAuthFlowRegistration.ts',
    'src/backend/sidecar/shortcutsFlowRegistration.ts',
    'src/backend/sidecar/sidecarRpc.ts',
    'src/backend/sidecar/storeWriteHandlers.ts',
    'src/backend/sidecar/wineToolsFlowRegistration.ts',
    'src/backend/store/storeEmbedSeam.ts',
    'src/backend/storeManagers/gog/e2eMock.ts',
    'src/backend/storeManagers/gog/library.ts',
    'src/backend/storeManagers/gog/presence.ts',
    'src/backend/storeManagers/gog/resumeProgress.ts',
    'src/backend/storeManagers/gog/user.ts',
    'src/backend/storeManagers/legendary/e2eMock.ts',
    'src/backend/storeManagers/legendary/library.ts',
    'src/backend/storeManagers/nile/e2eMock.ts',
    'src/backend/storeManagers/nile/user.ts',
    'src/backend/storeManagers/steam/bottleProcessMonitor.ts',
    'src/backend/storeManagers/steam/bottledSteam.ts',
    'src/backend/storeManagers/steam/bridge/allowlist.ts',
    'src/backend/storeManagers/steam/bridge/bridgeRoute.ts',
    'src/backend/storeManagers/steam/bridge/drm/runnerClone.ts',
    'src/backend/storeManagers/steam/bridge/drm/runnerEntitlements.ts',
    'src/backend/storeManagers/steam/bridge/interfaceVersions.ts',
    'src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts',
    'src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts',
    'src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts',
    'src/backend/storeManagers/steam/bridgeBottle.ts',
    'src/backend/storeManagers/steam/depot/appinfoOrder.ts',
    'src/backend/storeManagers/steam/depot/cdnAuth.ts',
    'src/backend/storeManagers/steam/depot/sharedRedist.ts',
    'src/backend/storeManagers/steam/depotDecodeErrors.ts',
    'src/backend/storeManagers/steam/depotErrors.ts',
    'src/backend/storeManagers/steam/depotRust/jobRegistry.ts',
    'src/backend/storeManagers/steam/gameDrmLaunch.ts',
    'src/backend/storeManagers/steam/gameLaunchOverlay.ts',
    'src/backend/storeManagers/steam/library/pollState.ts',
    'src/backend/storeManagers/steam/library/restartHold.ts',
    'src/backend/storeManagers/steam/library/uninstallPolling.ts',
    'src/backend/storeManagers/steam/platformCapture.ts',
    'src/backend/storeManagers/steam/tokenStore.ts',
    'src/backend/storeManagers/steam/userTypes.ts',
    'src/backend/storeMigrations/index.ts',
    'src/backend/storeSearch/cheapshark.ts',
    'src/backend/storeVersioning/engine.ts',
    'src/backend/storeVersioning/readOnlyStores.ts',
    'src/backend/tools/index.ts',
    'src/backend/tools/winetricksEnvironment.ts',
    'src/backend/utils.ts',
    'src/backend/utils/aborthandler/aborthandler.ts',
    'src/backend/utils/systeminfo/gpu/pci_ids.ts',
    'src/backend/utils/systeminfo/index.ts',
    'src/backend/utils/wineWindowRaise.ts',
    'src/backend/wiki_game_info/howlongtobeat/utils.ts'
  ] as const
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ceilings = require('../../../meta/backendDiCeilings.cjs') as {
    census: () => { moduleState: Record<string, number> }
  }
  const root = join(BACKEND, '..', '..')
  let censusMemo: Record<string, number> | undefined
  const moduleStateNow = (): Record<string, number> =>
    (censusMemo ??= ceilings.census().moduleState)

  /** True when text imports, requires, re-exports or mocks constants/paths or sidecar/pathShim. */
  const importsPathModules = (text: string): boolean =>
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+|jest\.\w+\s*\(\s*)['"][^'"]*(?:constants\/paths|sidecar\/pathShim|\.\/pathShim|\.\.\/pathShim)['"]/.test(
      stripSourceComments(text)
    )

  it('importsPathModules fires on import/require forms and not on comments or siblings', () => {
    expect(
      importsPathModules("import { a } from 'backend/constants/paths'")
    ).toBe(true)
    expect(importsPathModules("import { a } from './pathShim'")).toBe(true)
    expect(importsPathModules("const a = require('../sidecar/pathShim')")).toBe(
      true
    )
    expect(importsPathModules("await import('backend/constants/paths')")).toBe(
      true
    )
    expect(importsPathModules("jest.mock('backend/constants/paths')")).toBe(
      true
    )
    expect(
      importsPathModules("// import { a } from 'backend/constants/paths'")
    ).toBe(false)
    expect(
      importsPathModules("import { a } from 'backend/constants/pathsExtra'")
    ).toBe(false)
    expect(importsPathModules("import { a } from './pathShimmer'")).toBe(false)
    expect(
      importsPathModules("import { a } from 'backend/constants/other'")
    ).toBe(false)
  })

  it('the owned list is a full scan (floor)', () => {
    expect(OWNED_66_4.length).toBeGreaterThanOrEqual(80)
  })

  it.each(OWNED_66_4)('%s is absent from the census', (file) => {
    expect(moduleStateNow()[file]).toBeUndefined()
  })

  it('pathShim.ts and constants/paths.ts are gone and imported nowhere under src', () => {
    expect(existsSync(join(root, 'src/backend/sidecar/pathShim.ts'))).toBe(
      false
    )
    expect(existsSync(join(root, 'src/backend/constants/paths.ts'))).toBe(false)
    const files = walk(join(root, 'src')).filter((f) =>
      /\.(ts|tsx|js|cjs)$/.test(f)
    )
    expect(files.length).toBeGreaterThanOrEqual(1500)
    const offenders = files
      .filter(
        (f) =>
          f !== __filename &&
          !/testContainment\.test\.ts$/.test(f) &&
          !/steamclientLayerInstall\.test\.ts$/.test(f)
      )
      .filter((f) => importsPathModules(readFileSync(f, 'utf-8')))
      .map((f) => relative(root, f))
    expect(offenders).toEqual([])
  })

  it('the ceilings script has no moduleState section and no shard carries the key', () => {
    const cjs = join(root, 'meta/backendDiCeilings.cjs')
    const sections = /const SECTIONS = \[([^\]]*)\]/.exec(
      readFileSync(cjs, 'utf-8')
    )
    expect(sections?.[1]).toBeDefined()
    expect(sections?.[1]).not.toContain('moduleState')
    const dir = join(root, 'meta/backendDiCeilings')
    const shards = readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(shards.length).toBeGreaterThan(0)
    for (const name of shards)
      expect(
        Object.keys(JSON.parse(readFileSync(join(dir, name), 'utf-8')))
      ).not.toContain('moduleState')
  })

  it('app-folder is the first boot step', () => {
    const match = /export const BOOT_STEP_NAMES = \[([\s\S]*?)\] as const/.exec(
      readFileSync(join(BACKEND, 'sidecar/bootstrap.ts'), 'utf-8')
    )
    const names = [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (m) => m[1]
    )
    expect(names[0]).toBe('app-folder')
  })
})
