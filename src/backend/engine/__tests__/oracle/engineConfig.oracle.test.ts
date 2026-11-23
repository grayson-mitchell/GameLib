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
import { oracleMode } from 'backend/testUtils/engineWineOracle/recorder'
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
import type { EngineServices } from '../../engineServices'
import {
  getDefaultEngine,
  getPerGameBottleNameFor,
  listGameEngineOptions
} from '../../gameEngineState'
import { parseEngineOverride } from '../../engineIds'
import { appNameOf, isEngineKey } from '../../gameKey'
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
    clock: {} as never,
    paths: { userHome: profile.home, toolsPath: profile.toolsPath },
    aborts: {
      create: () => ({}) as never,
      delete: () => undefined
    } as never,
    requestRustInvoke: gate.requestRustInvoke
  })
  const storeFile = join(profile.userData, 'store', 'wine-downloader-info.json')
  const wineManagerReleases = wineManagerReleasesFrom({
    stores: {
      wineManager: {
        wineDownloaderInfoStore: {
          get: (key: string, fallback: unknown) =>
            readJson(storeFile)?.[key] ?? fallback
        }
      }
    } as never
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

describeSkipOnWindows('engine configuration oracle (87-12)', () => {
  const cases = loadCases<ConfigCase>(CRATE, SLICE)
  const spies: jest.SpyInstance[] = []
  const restorers: (() => void)[] = []

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
    for (const restore of restorers.splice(0)) restore()
  })

  it.each(cases)('$id', async (c) => {
    const mode = oracleMode()
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
    expect(ops.size).toBeGreaterThanOrEqual(11)
  })
})
