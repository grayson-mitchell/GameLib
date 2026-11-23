/**
 * The engine-configuration oracle (87-12, D-08): which engine a game or the global default is on,
 * the option list the settings pages show, the per-game bottle name and the key and id grammars,
 * all read from `GamesConfig/<app>.json`, `config.json` and the Wine Manager's
 * `store/wine-downloader-info.json` on a fake HOME, and recorded as goldens the Rust
 * `gamelib-engine` config slice later has to reproduce.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite golden/config/expected/ and the vector file
 *   (default)                        compare, offline
 * Nothing here reaches the network and nothing spawns: the runner is the spawn tracer with no
 * script, so a stray spawn would fail loudly and `spawns.json` would hold it.
 *
 * What is recorded per case (result.json): the case's inputs and the outcome of every item;
 * `treeUnchanged` (reading engine state never creates or edits a file, 59-UAT G11); every log
 * line. tree.json is the tree afterwards (path, mode, sha256 over the content with the profile
 * roots as placeholders: the store file holds absolute installDirs).
 *
 * Real in this slice: every function under test, the engine runtime (fallback engine, registry,
 * launch settings) and the Wine Manager release reader over a store double that reads the seeded
 * file. Scripted: the CrossOver bin dir (the real locator probes `/Applications`, the operator's
 * machine, and Spotlight) and the per-game bottle flight (87-11's goldens own it).
 */
import { createHash } from 'crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import {
  snapshotTree,
  type TreeEntry
} from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { createFakeBottleGateRust } from 'backend/testUtils/fakeBottleGateRust'
import { createSpawnAsync } from 'backend/spawnAsync'
import * as logger from 'backend/logger'
import { hasCapability } from 'common/storeCapabilities'
import type { GameSettings, Runner } from 'common/types'
import type { Game } from 'common/types/game_manager'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  configPathDepsFrom,
  deriveEngineFromWine,
  engineIdOf,
  readEngineForGame,
  readStoredGameConfig,
  resolveEffectiveEngine,
  resolveGlobalEngine,
  type EffectiveEngine,
  type EngineConfigDeps
} from '../../engineConfig'
import { createEngineRuntime } from '../../engineRuntime'
import { engineKeyIfEligible } from '../../engineEligibility'
import { offlineLaunchCertainlyBlocked } from '../../offlineRefusal'
import {
  resolveToolSettings,
  resolveToolSettingsForId,
  type ToolSettingsDeps
} from '../../toolSettings'
import type { EngineServices } from '../../engineServices'
import { getDefaultEngine, listGameEngineOptions } from '../../gameEngineState'
import { parseEngineOverride } from '../../engineIds'
import { appNameOf, isEngineKey } from '../../gameKey'
import {
  engineKeyFor,
  getPerGameBottleNameFor,
  importEngineSettings,
  isWritableEngineOverride
} from 'backend/enginewine/twin'
import { wineManagerReleasesFrom } from '../../wineManagerReleases'
import { buildEngines, type EngineVariant } from './fixtureBottles'

const CRATE = 'gamelib-engine'
const SLICE = 'config'
/** The case count this plan commits as a floor; a later edit may raise it, never lower it. */
const FLOOR = 20

type Op =
  | 'derive'
  | 'effective'
  | 'read-for-game'
  | 'read-stored'
  | 'global'
  | 'engine-id'
  | 'options'
  | 'default-engine'
  | 'bottle-name'
  | 'ids'
  | 'keys'
  | 'eligibility'
  | 'tool-settings'
  | 'offline'

interface ConfigCase {
  id: string
  op: Op
  note: string
  platform?: OraclePlatform
  /** The pinned-engine directory variant built under `<TOOLS>`; absent is no directory. */
  engines?: EngineVariant
  /** `present` scripts the CrossOver bin dir under `<HOME>/Applications`; the default is absent. */
  crossover?: 'present' | 'absent'
  seed?: SeedEntry[]
  args: Record<string, unknown>
}

const sha = (text: string): string =>
  createHash('sha256').update(text).digest('hex')

interface Rep {
  repeat: { char: string; count: number }
}

/** A long input is stored as a generator so the case file stays small. */
function materialise<T>(value: T): T {
  if (Array.isArray(value)) return value.map(materialise) as T
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === 'repeat') {
      const { char, count } = (value as unknown as Rep).repeat
      return char.repeat(count) as T
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, materialise(v)])
    ) as T
  }
  return value
}

const expandDeep = <T>(value: T, profile: EngineOracleProfile): T =>
  JSON.parse(expandPlaceholders(JSON.stringify(value), profile)) as T

/** Writes a case's starting files, expanding placeholders in the text as well as the path. */
function seedWithText(
  profile: EngineOracleProfile,
  seed: readonly SeedEntry[]
): void {
  for (const entry of seed) {
    const target = expandPlaceholders(entry.path, profile)
    if (!target.startsWith(profile.home)) {
      throw new Error(`seed path outside the profile: ${entry.path}`)
    }
    if (entry.dir) {
      mkdirSync(target, { recursive: true })
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    if (entry.symlink !== undefined) {
      symlinkSync(expandPlaceholders(entry.symlink, profile), target)
      continue
    }
    writeFileSync(target, expandPlaceholders(entry.text ?? '', profile))
    if (entry.mode !== undefined) chmodSync(target, parseInt(entry.mode, 8))
  }
}

/** The tree under the profile, each file's sha256 over its content with the profile roots as placeholders. */
function snapshotNormalised(profile: EngineOracleProfile): TreeEntry[] {
  return snapshotTree(profile.home).map((entry) => {
    if (entry.kind === 'file') {
      const text = readFileSync(join(profile.home, entry.path), 'utf8')
      return { ...entry, sha256: sha(normalisePaths(text, profile)) }
    }
    return entry
  })
}

const readJson = (file: string): Record<string, unknown> | null => {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

interface Built {
  services: EngineServices
  runner: ReturnType<typeof createSpawnTracer>
  configDeps: EngineConfigDeps
  binDir: string | undefined
}

/** The engine services over the fake profile; see the header for what is real and what is scripted. */
function buildServices(
  profile: EngineOracleProfile,
  c: ConfigCase,
  P: (text: string) => string
): Built {
  const tracer = createSpawnTracer({
    baseEnv: profile.fake.childEnv({}),
    scripted: []
  })
  const gate = createFakeBottleGateRust()
  const engineRuntime = createEngineRuntime({
    paths: { userHome: profile.home, toolsPath: profile.toolsPath },
    aborts: {
      create: () => ({}) as never,
      delete: () => undefined
    } as never,
    requestRustInvoke: gate.requestRustInvoke
  })
  const wineManagerReleases = wineManagerReleasesFrom({
    paths: { userData: profile.userData }
  })
  const globalSettings = (): Record<string, unknown> =>
    (readJson(profile.paths.configPath)?.defaultSettings as
      | Record<string, unknown>
      | undefined) ?? {}
  const services = {
    spawnAsync: createSpawnAsync({ runner: tracer.runner }),
    runner: tracer.runner,
    paths: {
      userHome: profile.home,
      toolsPath: profile.toolsPath,
      gamesConfigPath: profile.paths.gamesConfigPath,
      configPath: profile.paths.configPath
    },
    engineRuntime,
    wineManagerReleases,
    globalSettings,
    globalGameSettings: () => ({}),
    installRemove: () => {
      throw new Error('unscripted installRemove call')
    }
  } as unknown as EngineServices
  const binDir =
    c.crossover === 'present'
      ? P(
          '<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
        )
      : undefined
  return {
    services,
    runner: tracer,
    binDir,
    configDeps: {
      wineManagerReleases,
      ...configPathDepsFrom(services),
      globalSettings
    } as EngineConfigDeps
  }
}

type Item = Record<string, unknown>

/** The result of one item: a thrown error is recorded by its name, never by message. */
async function attempt(fn: () => unknown): Promise<unknown> {
  try {
    const value = await fn()
    return value === undefined ? { returned: 'undefined' } : value
  } catch (error) {
    return {
      threw: error instanceof Error ? error.constructor.name : 'unknown'
    }
  }
}

/** The slice of `Game` the eligibility and tool-settings readers use. */
function gameDouble(spec: Item): Game {
  const platform = spec.platform as string | undefined
  return {
    isNative: () => spec.native === true,
    getGameInfo: () => ({
      runner: spec.runner,
      app_name: spec.appName,
      title: 'T',
      install: platform === undefined ? undefined : { platform }
    })
  } as unknown as Game
}

describeSkipOnWindows('engine configuration oracle (87-12)', () => {
  const cases = loadCases<ConfigCase>(CRATE, SLICE)
  const spies: jest.SpyInstance[] = []
  const restorers: (() => void)[] = []

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
    for (const restore of restorers.splice(0)) restore()
  })

  it.each(cases)('$id', async (c) => {
    const mode = engineWineOracleMode()
    const logs: LogLine[] = []
    for (const [name, level] of [
      ['logDebug', 'DEBUG'],
      ['logInfo', 'INFO'],
      ['logWarning', 'WARNING'],
      ['logError', 'ERROR']
    ] as const) {
      spies.push(
        jest
          .spyOn(logger, name)
          .mockImplementation((message: unknown, options?: unknown) => {
            captureLog(logs, level, message, options)
          })
      )
    }
    restorers.push(mockPlatform(c.platform ?? 'mac'))

    await withEngineOracleProfile(async (profile) => {
      const P = (text: string): string => expandPlaceholders(text, profile)
      if (c.engines) buildEngines(profile.toolsPath, c.engines, P)
      seedWithText(profile, c.seed ?? [])
      const before = snapshotNormalised(profile)
      const args = expandDeep(materialise(c.args), profile)
      const built = buildServices(profile, c, P)
      const { services, configDeps } = built
      const items = (args.items ?? []) as Item[]

      const run = async (): Promise<unknown> => {
        switch (c.op) {
          case 'derive':
            return Promise.all(
              items.map((item) =>
                attempt(() => {
                  const effective = deriveEngineFromWine(
                    item.wine as never,
                    configDeps
                  )
                  return { input: item, effective, id: engineIdOf(effective) }
                })
              )
            )
          case 'effective':
            return Promise.all(
              items.map((item) =>
                attempt(() => {
                  const effective = resolveEffectiveEngine(
                    item.entry as Record<string, unknown> | undefined,
                    item.inherited as never,
                    {
                      legacyKey: item.legacyKey as string | undefined,
                      derive: item.derive as boolean
                    },
                    configDeps
                  )
                  return { input: item, effective, id: engineIdOf(effective) }
                })
              )
            )
          case 'read-for-game':
            return Promise.all(
              items.map((item) =>
                attempt(() => {
                  const effective = readEngineForGame(
                    item as { runner: string; appName: string },
                    configDeps
                  )
                  return {
                    input: item,
                    steamStore: hasCapability(
                      item.runner as string,
                      'usesBottleRuntime'
                    ),
                    effective,
                    id: engineIdOf(effective)
                  }
                })
              )
            )
          case 'read-stored':
            return Promise.all(
              items.map((item) =>
                attempt(() => ({
                  input: item,
                  entry:
                    readStoredGameConfig(item.appName as string, configDeps) ??
                    null
                }))
              )
            )
          case 'global':
            return Promise.all(
              items.map((item) =>
                attempt(() => {
                  const effective = resolveGlobalEngine(item, configDeps)
                  return { input: item, effective, id: engineIdOf(effective) }
                })
              )
            )
          case 'engine-id':
            return Promise.all(
              items.map((item) =>
                attempt(() => ({
                  input: item,
                  id: engineIdOf(item as unknown as EffectiveEngine)
                }))
              )
            )
          case 'options':
            return Promise.all(
              items.map((item) =>
                attempt(async () => ({
                  input: item,
                  options: await listGameEngineOptions(services, item, {
                    decision: {
                      resolveCrossoverBinDir: () =>
                        Promise.resolve(built.binDir)
                    }
                  })
                }))
              )
            )
          case 'default-engine':
            return attempt(() => getDefaultEngine(services))
          case 'bottle-name':
            return Promise.all(
              items.map((item) =>
                attempt(() => ({
                  input: item,
                  name: getPerGameBottleNameFor(item)
                }))
              )
            )
          case 'ids':
            return Promise.all(
              items.map((item) =>
                attempt(() => ({
                  input: item,
                  parsed: parseEngineOverride(item.value)
                }))
              )
            )
          case 'eligibility':
            return Promise.all(
              items.map((item) =>
                attempt(() => ({
                  input: item,
                  key: engineKeyIfEligible(
                    gameDouble(item.game as Item),
                    item.mac as boolean
                  )
                }))
              )
            )
          case 'tool-settings': {
            // Sequential: a live selection is registry state the next item must not see.
            const out: unknown[] = []
            for (const item of items) {
              out.push(
                await attempt(async () => {
                  const spec = item.game as Item
                  const ensureCalls: unknown[] = []
                  const overrides: Partial<ToolSettingsDeps> = {
                    crossoverBinDir: () => Promise.resolve(built.binDir),
                    ensureGameBottle: (a) => {
                      ensureCalls.push(a)
                      return Promise.resolve(
                        item.ensure === 'error'
                          ? {
                              status: 'error' as const,
                              error: 'scripted failure',
                              errorCode: 'crossover-create-failed'
                            }
                          : {
                              status: 'done' as const,
                              createdHere: true,
                              engine: 'crossover' as const
                            }
                      )
                    }
                  }
                  const key = engineKeyFor(
                    spec.runner as string,
                    spec.appName as string
                  )
                  const live = item.live as Item | undefined
                  const { registry, launchSettings } = services.engineRuntime
                  let liveSet: boolean | null = null
                  if (live && key !== null) {
                    liveSet = registry.setEngineSelection(
                      key,
                      live.selection as never
                    )
                    if (live.context) {
                      launchSettings.setLaunchOverlayContext(
                        key,
                        live.context as never
                      )
                    }
                  }
                  try {
                    const stored = item.stored as GameSettings
                    const opts = { ensureBottle: item.ensureBottle as boolean }
                    const result =
                      item.via === 'id'
                        ? await resolveToolSettingsForId(
                            services,
                            {
                              runner: spec.runner as Runner,
                              appName: spec.appName as string,
                              platform: spec.platform as never
                            },
                            stored,
                            opts,
                            overrides
                          )
                        : await resolveToolSettings(
                            services,
                            gameDouble(spec),
                            stored,
                            opts,
                            overrides
                          )
                    return { input: item, liveSet, result, ensureCalls }
                  } finally {
                    if (key !== null) {
                      registry.clearEngineSelection(key)
                      launchSettings.clearLaunchOverlayContext(key)
                    }
                  }
                })
              )
            }
            return out
          }
          case 'offline':
            return Promise.all(
              items.map((item) =>
                attempt(() => ({
                  input: item,
                  verdict: offlineLaunchCertainlyBlocked(item as never)
                }))
              )
            )
          case 'keys':
            return Promise.all(
              ((args.keys ?? []) as unknown[]).map((key) =>
                attempt(() => {
                  const valid = isEngineKey(key)
                  return {
                    key,
                    isEngineKey: valid,
                    appNameOf: valid ? appNameOf(key) : null
                  }
                })
              )
            )
        }
      }
      const outcome = await run()
      const after = snapshotNormalised(profile)
      // Reading engine state never creates or edits a file (59-UAT G11).
      expect(JSON.stringify(after)).toBe(JSON.stringify(before))

      writeOrCompareGolden(
        CRATE,
        SLICE,
        c.id,
        {
          result: normalisePaths(
            {
              op: c.op,
              platform: c.platform ?? 'mac',
              engines: c.engines ?? 'none',
              crossover: c.crossover ?? 'absent',
              args: c.args,
              outcome,
              treeUnchanged: JSON.stringify(before) === JSON.stringify(after),
              logs
            },
            profile
          ),
          events: [],
          after,
          spawns: normalisePaths([...built.runner.records], profile)
        },
        mode
      )
    })
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })

  it('every case names an op and a note', () => {
    for (const c of cases) {
      expect(c.note.length).toBeGreaterThan(10)
    }
    const ops = new Set(cases.map((c) => c.op))
    expect(ops.size).toBeGreaterThanOrEqual(14)
  })
})

/** The twin helpers' vectors: input and the TS answer. A long string is stored as a generator. */
interface Vector {
  id: string
  input: unknown
  expected: unknown
}

const TWIN_VECTOR_FLOOR = 100
const rep = (char: string, count: number): Rep => ({ repeat: { char, count } })

const RUNNERS = ['legendary', 'gog', 'nile', 'sideload', 'steam']
const KEY_APP_NAMES: [string, unknown][] = [
  ['steam-id', '620'],
  ['gog-id', '1207658924'],
  ['name', 'Sugar'],
  ['spaced', 'My Game'],
  ['dotted', 'a.b'],
  ['unicode', 'ゲーム'],
  ['zero', '0'],
  ['ten-digits', '1234567890'],
  ['eleven-digits', '12345678901'],
  ['leading-zeros', '000620'],
  ['exponent', '1e3'],
  ['negative', '-1'],
  ['fullwidth-digits', '６２０'],
  ['padded', ' padded'],
  ['trailing-pad', 'padded '],
  ['slash', 'a/b'],
  ['backslash', 'a\\b'],
  ['nul', 'a\u0000b'],
  ['parent', '..'],
  ['parent-inside', 'a..b'],
  ['single-dot', '.'],
  ['empty', ''],
  ['255-chars', rep('a', 255)],
  ['256-chars', rep('a', 256)],
  ['colon', 'a:b']
]
const NON_STRING_APP_NAMES: [string, unknown][] = [
  ['number', 620],
  ['null', null],
  ['true', true],
  ['array', ['620']],
  ['object', {}]
]

const OVERRIDE_VALUES: [string, unknown][] = [
  ['automatic', 'automatic'],
  ['crossover', 'crossover'],
  ['pinned-current', 'pinned:wine-staging-11.20'],
  ['pinned-retired', 'pinned:wine-staging-11.1'],
  ['pinned-empty', 'pinned:'],
  ['pinned-unknown', 'pinned:x'],
  ['pinned-trailing-space', 'pinned:wine-staging-11.20 '],
  ['manager', 'wine-manager:Wine-Staging-10.5'],
  ['manager-numeric', 'wine-manager:10.5'],
  ['manager-empty', 'wine-manager:'],
  ['manager-dotdot', 'wine-manager:a..b'],
  ['manager-dxmt', 'wine-manager:Wine-Staging-10.5-DXMT'],
  ['manager-gptk', 'wine-manager:GPTK-2'],
  ['manager-toolkit', 'wine-manager:Game-Porting-Toolkit'],
  ['manager-porting', 'wine-manager:Porting-1'],
  ['manager-space', 'wine-manager:has space'],
  ['manager-64-chars', `wine-manager:${'a'.repeat(64)}`],
  ['manager-65-chars', `wine-manager:${'a'.repeat(65)}`],
  ['manager-punctuation', 'wine-manager:ok.1_2-3'],
  ['legacy-label', 'legacy:Odd Wine'],
  ['legacy-word', 'Legacy'],
  ['capitalised', 'Automatic'],
  ['leading-space', ' automatic'],
  ['trailing-space', 'automatic '],
  ['empty', ''],
  ['path', '/usr/bin/wine'],
  ['relative-path', '../wine'],
  ['null', null],
  ['number', 5],
  ['true', true],
  ['array', ['automatic']],
  ['empty-object', {}],
  ['object', { id: 'automatic' }]
]

const matGen = (value: unknown): unknown => materialise(value)

function buildTwinVectors(): Record<string, Vector[]> {
  const out: Record<string, Vector[]> = {
    engineKeyFor: [],
    isWritableEngineOverride: [],
    importEngineSettings: [],
    getPerGameBottleNameFor: []
  }
  const list = (name: string): Vector[] => out[name] as Vector[]

  const keyInput = (runner: unknown, appName: unknown): Item =>
    appName === undefined ? { runner } : { runner, appName }
  const keyVector = (id: string, input: Item): void => {
    const m = matGen(input) as Item
    list('engineKeyFor').push({
      id,
      input,
      expected: engineKeyFor(m.runner as string, m.appName)
    })
  }
  for (const runner of RUNNERS) {
    for (const [label, appName] of KEY_APP_NAMES) {
      keyVector(`key-${runner}-${label}`, keyInput(runner, appName))
    }
  }
  for (const runner of [
    'unknown',
    '',
    'GOG',
    ' gog',
    'humble',
    '__proto__',
    'toString',
    'constructor'
  ]) {
    for (const [label, appName] of [
      ['id', '1'],
      ['name', 'abc']
    ] as const) {
      keyVector(
        `key-runner-${runner || 'empty'}-${label}`,
        keyInput(runner, appName)
      )
    }
  }
  for (const runner of [5, null, true, ['gog'], {}]) {
    keyVector(
      `key-runner-nonstring-${JSON.stringify(runner)}`,
      keyInput(runner, '1')
    )
  }
  for (const runner of ['gog', 'steam']) {
    keyVector(`key-${runner}-appname-missing`, keyInput(runner, undefined))
    for (const [label, appName] of NON_STRING_APP_NAMES) {
      keyVector(`key-${runner}-appname-${label}`, keyInput(runner, appName))
    }
  }

  for (const [label, value] of OVERRIDE_VALUES) {
    list('isWritableEngineOverride').push({
      id: `writable-${label}`,
      input: { value },
      expected: isWritableEngineOverride(value)
    })
  }
  list('isWritableEngineOverride').push({
    id: 'writable-missing',
    input: {},
    expected: isWritableEngineOverride(undefined)
  })

  const importVector = (id: string, input: Item): void => {
    list('importEngineSettings').push({
      id,
      input,
      expected: importEngineSettings(matGen(input) as never)
    })
  }
  for (const runner of RUNNERS) {
    for (const [label, value] of [
      ['automatic', 'automatic'],
      ['crossover', 'crossover'],
      ['pinned', 'pinned:wine-staging-11.20'],
      ['manager', 'wine-manager:Wine-Staging-10.5'],
      ['retired-pin', 'pinned:wine-staging-11.1'],
      ['legacy-label', 'legacy:Odd Wine'],
      ['path', '/usr/bin/wine'],
      ['number', 5],
      ['null', null]
    ] as [string, unknown][]) {
      importVector(`import-${runner}-${label}`, {
        runner,
        appName: '1234',
        engineOverride: value
      })
    }
  }
  importVector('import-engine-override-missing', {
    runner: 'gog',
    appName: '1234'
  })
  importVector('import-bad-app-name', {
    runner: 'gog',
    appName: '../x',
    engineOverride: 'crossover'
  })
  importVector('import-unknown-runner', {
    runner: 'unknown',
    appName: '1',
    engineOverride: 'crossover'
  })
  importVector('import-long-app-name-hashes-the-bottle', {
    runner: 'gog',
    appName: rep('a', 100),
    engineOverride: 'pinned:wine-staging-11.20'
  })
  importVector('import-renderer-bottle-name-is-ignored', {
    runner: 'gog',
    appName: '1234',
    engineOverride: 'crossover',
    wineCrossoverBottle: 'Evil'
  })
  importVector('import-steam-app-has-no-bottle', {
    runner: 'steam',
    appName: '620',
    engineOverride: 'crossover'
  })

  const bottleVector = (id: string, input: unknown): void => {
    const m = matGen(input)
    list('getPerGameBottleNameFor').push({
      id,
      input,
      expected: getPerGameBottleNameFor(m)
    })
  }
  for (const runner of ['gog', 'legendary', 'nile', 'sideload']) {
    for (const [label, appName] of KEY_APP_NAMES) {
      bottleVector(`bottle-${runner}-${label}`, { runner, appName })
    }
  }
  for (const [label, appName] of KEY_APP_NAMES) {
    bottleVector(`bottle-steam-${label}`, { runner: 'steam', appName })
  }
  for (const [label, appName] of [
    ['40-chars', rep('a', 40)],
    ['52-chars', rep('a', 52)],
    ['53-chars', rep('a', 53)],
    ['100-chars', rep('b', 100)],
    ['percent', 'a%b'],
    ['tilde', 'a~b'],
    ['leading-dot', '.hidden'],
    ['trailing-dot', 'trail.'],
    ['accented', 'Ünï-ñ']
  ] as [string, unknown][]) {
    bottleVector(`bottle-gog-${label}`, { runner: 'gog', appName })
  }
  for (const [label, input] of [
    ['null', null],
    ['string', 'x'],
    ['number', 5],
    ['array', []],
    ['empty-object', {}],
    ['no-app-name', { runner: 'gog' }],
    ['no-runner', { appName: '1' }],
    ['runner-number', { runner: 5, appName: '1' }],
    ['unknown-runner', { runner: 'unknown', appName: '1' }]
  ] as [string, unknown][]) {
    bottleVector(`bottle-args-${label}`, input)
  }
  return out
}

describeSkipOnWindows('the D-24 engine twin vectors (87-12)', () => {
  const vectorFile = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'src-tauri',
    'crates',
    CRATE,
    'tests',
    'fixtures',
    'vectors',
    'engine_twin.json'
  )
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

  it('engine_twin.json pins the sync pure helpers non-bridge TS keeps until their owners delete them', () => {
    const vectors = buildTwinVectors()
    const total = Object.values(vectors).flat().length
    assertAtOrAboveFloor('engine twin vectors', total, TWIN_VECTOR_FLOOR)
    for (const [name, list] of Object.entries(vectors)) {
      const ids = list.map((v) => v.id)
      expect(new Set(ids).size).toBe(ids.length)
      assertAtOrAboveFloor(`engine twin ${name} vectors`, list.length, 20)
    }
    const text = json(vectors)
    const mode = engineWineOracleMode()
    if (mode === 'write') {
      mkdirSync(dirname(vectorFile), { recursive: true })
      writeFileSync(vectorFile, text)
    } else if (mode === 'compare') {
      expect(text).toBe(readFileSync(vectorFile, 'utf8'))
    }
    if (mode !== 'record') {
      const committed = JSON.parse(readFileSync(vectorFile, 'utf8')) as Record<
        string,
        unknown[]
      >
      assertAtOrAboveFloor(
        'engine twin committed vectors',
        Object.values(committed).flat().length,
        TWIN_VECTOR_FLOOR
      )
    }
  })

  it('an empty vector list fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('engine twin vectors', 0, TWIN_VECTOR_FLOOR)
    ).toThrow(/below the floor/)
  })

  it('the twin covers the four helpers D-24 names', () => {
    expect(Object.keys(buildTwinVectors()).sort()).toEqual([
      'engineKeyFor',
      'getPerGameBottleNameFor',
      'importEngineSettings',
      'isWritableEngineOverride'
    ])
  })

  it('the answers are the TS answers: a key, a refusal, a writable id and a hashed bottle name are present', () => {
    const vectors = buildTwinVectors()
    const find = (group: string, id: string): Vector =>
      (vectors[group] ?? []).find((v) => v.id === id) as Vector
    expect(find('engineKeyFor', 'key-gog-gog-id').expected).toBe(
      'gog:1207658924'
    )
    expect(find('engineKeyFor', 'key-steam-gog-id').expected).toBe('1207658924')
    expect(find('engineKeyFor', 'key-gog-parent').expected).toBeNull()
    expect(
      find('isWritableEngineOverride', 'writable-pinned-current').expected
    ).toBe(true)
    expect(
      find('isWritableEngineOverride', 'writable-legacy-label').expected
    ).toBe(false)
    expect(
      find('importEngineSettings', 'import-gog-pinned').expected
    ).toMatchObject({ engineOverride: 'pinned:wine-staging-11.20' })
    expect(
      String(find('getPerGameBottleNameFor', 'bottle-gog-100-chars').expected)
    ).toHaveLength(64)
  })
})
