/**
 * The bottles and markers oracle (87-11, D-07, D-08, D-24): bottle creation (`cxbottle --create`
 * and the fallback `wineboot -i` path), reuse, sibling-safe removal, the wineserver kill, the
 * `cxbottle.conf` writer, the engine marker's record, read, infer and view rules, the per-game
 * flight, the running-games ledger, the engine registry and the prefix resolver, all driven over
 * fake-HOME bottles the released builds left on disk (`fixtureBottles.ts`) and recorded as goldens
 * the Rust `gamelib-engine` slice later has to reproduce. The engine-switch goldens over the same
 * fixtures are 87-16; this slice is the primitives and the marker rules they share.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite state/, golden/bottles/expected/ and the vector files
 *   (default)                        compare, offline
 * Nothing in this slice reaches the network, so `record` mode has nothing to record.
 *
 * What is recorded per case (result.json): the case's inputs, the tree before (path, mode, sha256),
 * what the call returned or threw, the marker bytes of every bottle afterwards, every log line, the
 * calls the marker gate made to Rust, the time limit and abort wiring of each spawn, and the
 * DXVK installer's calls; tree.json is the tree afterwards; spawns.json is the spawn trace (program,
 * argv, env diff, result). A file's sha256 is of its content with the profile roots replaced by
 * their placeholders, because a marker names a wineserver by absolute path: the Rust replay
 * expands the same placeholders into its own FakeHome and normalises the same way.
 *
 * No process runs. wine, wineserver and cxbottle are scripted answers of the spawn tracer; a
 * script's effect (what `cxbottle --create` or `wineboot -i` leaves in the bottle) is a function the
 * case runs while the scripted process is "running", so the bytes written are fixtures, not the
 * output of an engine. The DXVK installer is a scripted double too (the DXVK tools are 87-09's).
 * `process.env` is replaced for a case by the fake profile's own env, so the recorded env diff is
 * only what the call set.
 */
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import {
  fixturesRoot,
  oracleMode
} from 'backend/testUtils/engineWineOracle/recorder'
import {
  createSpawnTracer,
  type SpawnTracerOptions
} from 'backend/testUtils/engineWineOracle/spawnTrace'
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
import { createBottleVersionGate } from 'backend/stores/bottleVersionGate'
import type { GateState } from 'backend/stores/bottleVersionGate'
import * as logger from 'backend/logger'
import type { GameSettings } from 'common/types'
import { buildCxbottleConf, writeCxbottleConf } from '../../adoptBottle'
import {
  createFallbackBottle,
  getBottleDir,
  isBottleProvisioned,
  killBottleWineServerWith,
  removeCreatedBottleDir
} from '../../bottlePrimitives'
import { createBottleLedger } from '../../bottleLedger'
import { createEngineRegistry } from '../../engineRegistry'
import {
  reconcileBottleEngineMarker,
  readBottleEngineMarkerKind,
  readBottleEngineMarkerSummary,
  recordCrossoverBottleEngine,
  recordPinnedBottleEngine,
  restoreNeedsAbsentPin
} from '../../engineSwitch'
import { createFallbackEngine } from '../../fallbackEngine'
import { ENGINE_PINS } from '../../enginePins'
import type { NonCrossoverEngine } from '../../engineTypes'
import { resolveGamePrefix } from '../../gamePrefix'
import {
  createCrossoverBottle,
  createPerGameBottleFlights
} from '../../perGameBottle'
import {
  BOTTLES_REL,
  BOTTLE_FIXTURES,
  BOTTLE_IDS,
  CURRENT_PIN,
  CX_BIN_DIR,
  DXVK_DIR,
  ENGINE_VARIANT_NAMES,
  WINESERVER_BIN,
  WINE_BIN,
  buildBottle,
  buildEngines,
  engineFiles,
  fixtureByName,
  writeFixtureFiles,
  type EngineVariant,
  type FixtureFile
} from './fixtureBottles'

const CRATE = 'gamelib-engine'
const SLICE = 'bottles'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 140

type Op =
  | 'views'
  | 'reconcile'
  | 'record-pinned'
  | 'record-crossover'
  | 'provisioned'
  | 'conf-write'
  | 'kill'
  | 'remove-created'
  | 'create-crossover'
  | 'create-fallback'
  | 'ensure'
  | 'ledger'
  | 'registry'
  | 'resolve-prefix'

/** How a scripted engine or CrossOver process behaves. */
interface ProcessScript {
  code?: number | null
  stderr?: string
  /** What the process leaves in the bottle: the fixture whose files it writes. */
  writes?: string
  throws?: string
}

interface Args {
  bottle?: string
  names?: string[]
  times?: number
  pinId?: string
  engine?: 'with-dxvk' | 'no-dxvk'
  binDir?: string
  extraEnv?: Record<string, string>
  timeoutMs?: number
  script?: 'ok' | 'timeout' | 'throws'
  createTimeoutMs?: number
  abort?: 'before' | 'during' | 'after-boot' | 'after-installer'
  // create-crossover
  cxbottle?: ProcessScript
  // create-fallback and ensure
  boot?: ProcessScript
  wait?: 'ok' | 'timeout'
  installer?: 'ok' | 'no-marker' | 'fails' | 'throws' | 'absent'
  dxvk?: boolean
  // ensure
  decision?: 'crossover' | 'pinned'
  binDirPresent?: boolean
  pin?: 'ok' | 'offline' | 'aborted'
  mode?: 'single' | 'twice' | 'concurrent'
  runner?: string
  appName?: string
  // ledger, registry, resolve-prefix
  steps?: Record<string, unknown>[]
  inputs?: Record<string, unknown>[]
}

interface BottleCase {
  id: string
  op: Op
  note: string
  bottles?: string[]
  engines?: EngineVariant
  seed?: SeedEntry[]
  gate?: { answer?: GateState; reject?: boolean }
  args?: Args
}

const sha = (text: string): string =>
  createHash('sha256').update(text).digest('hex')

/** Replaces `process.env` for the duration of `fn` (async), then puts it back. */
async function withCleanProcessEnv<T>(
  clean: NodeJS.ProcessEnv,
  fn: () => Promise<T>
): Promise<T> {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, clean)
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

/**
 * The tree under the profile with each file's sha256 taken over its content with the profile roots
 * as placeholders (a marker holds a wineserver's absolute path); symlink targets likewise.
 */
function snapshotNormalised(profile: EngineOracleProfile): TreeEntry[] {
  return snapshotTree(profile.home).map((entry) => {
    if (entry.kind === 'file') {
      const text = readFileSync(join(profile.home, entry.path), 'utf8')
      return { ...entry, sha256: sha(normalisePaths(text, profile)) }
    }
    if (entry.kind === 'symlink' && entry.symlink !== undefined) {
      return { ...entry, symlink: normalisePaths(entry.symlink, profile) }
    }
    return entry
  })
}

/** The engine marker bytes of every bottle under the Bottles root, by bottle name. */
function markerBytes(profile: EngineOracleProfile): Record<string, string> {
  const root = join(profile.home, BOTTLES_REL)
  const out: Record<string, string> = {}
  if (!existsSync(root)) return out
  for (const name of readdirSync(root).sort()) {
    const file = join(root, name, '.gamelib-engine.json')
    if (existsSync(file)) {
      out[name] = normalisePaths(readFileSync(file, 'utf8'), profile)
    }
  }
  return out
}

const expandDeep = <T>(value: T, profile: EngineOracleProfile): T =>
  JSON.parse(expandPlaceholders(JSON.stringify(value), profile)) as T

type Scripted = NonNullable<SpawnTracerOptions['scripted']>[number]

interface SpawnLimit {
  program: string
  argv: string[]
  timeoutMs: number | null
  unbounded: boolean
  signal: boolean
}

interface InstallerCall {
  tool: string
  action: string
  source: unknown
  settings: GameSettings
}

type MarkerCtx = Parameters<typeof recordPinnedBottleEngine>[0]

const SYNTHETIC_PIN_LABEL = 'Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)'

describeSkipOnWindows('bottles and markers oracle (87-11)', () => {
  const cases = loadCases<BottleCase>(CRATE, SLICE)
  const loggerSpies: jest.SpyInstance[] = []

  afterEach(() => {
    for (const spy of loggerSpies.splice(0)) spy.mockRestore()
  })

  it.each(cases)('$id', async (c) => {
    // Read before the case replaces `process.env`, which holds the mode switches.
    const mode = oracleMode()
    const logs: LogLine[] = []
    for (const [name, level] of [
      ['logDebug', 'DEBUG'],
      ['logInfo', 'INFO'],
      ['logWarning', 'WARNING'],
      ['logError', 'ERROR']
    ] as const) {
      loggerSpies.push(
        jest
          .spyOn(logger, name)
          .mockImplementation((message: unknown, options?: unknown) => {
            captureLog(logs, level, message, options)
          })
      )
    }
    // adoptBottle draws the BottleID from crypto.randomUUID: pinned to an allow-listed id.
    const nodeCrypto = jest.requireActual<typeof import('crypto')>('crypto')
    loggerSpies.push(
      jest
        .spyOn(nodeCrypto, 'randomUUID')
        .mockReturnValue(
          BOTTLE_IDS[3].toLowerCase() as ReturnType<
            typeof nodeCrypto.randomUUID
          >
        )
    )

    await withEngineOracleProfile(
      async (profile) => {
        const P = (text: string): string => expandPlaceholders(text, profile)
        if (c.engines) buildEngines(profile.toolsPath, c.engines, P)
        for (const name of c.bottles ?? []) {
          buildBottle(profile.home, fixtureByName(name), P)
        }
        const before = snapshotNormalised(profile)
        const args = expandDeep(c.args ?? {}, profile)
        const controller = new AbortController()
        const installerCalls: InstallerCall[] = []
        const limits: SpawnLimit[] = []
        const bottleDir = (name: string): string =>
          getBottleDir({ userHome: profile.home }, name)

        const scripted: Scripted[] = scriptsFor(c, args, {
          profile,
          P,
          controller,
          bottleDir
        })
        const tracer = createSpawnTracer({
          baseEnv: profile.fake.childEnv({}),
          scripted
        })
        const runner = {
          ...tracer.runner,
          run: (...a: Parameters<typeof tracer.runner.run>) => {
            const [program, argv, opts] = a
            limits.push({
              program,
              argv: [...argv],
              timeoutMs: opts?.timeoutMs ?? null,
              unbounded: opts?.timeout?.none === true,
              signal: opts?.signal !== undefined
            })
            return tracer.runner.run(...a)
          }
        }
        const spawnAsync = createSpawnAsync({ runner })

        const gate = createFakeBottleGateRust({
          answer: c.gate?.answer,
          rejectGate: c.gate?.reject
        })
        const fallback = createFallbackEngine({
          paths: { toolsPath: profile.toolsPath },
          aborts: {
            create: () => ({}) as never,
            delete: () => undefined
          } as never
        })
        const markerCtx: MarkerCtx = {
          paths: { userHome: profile.home, toolsPath: profile.toolsPath },
          fallback,
          requestRustInvoke: gate.requestRustInvoke,
          bottleGate: createBottleVersionGate()
        }
        const engine = (
          variant?: 'with-dxvk' | 'no-dxvk'
        ): NonCrossoverEngine => ({
          wineBin: P(WINE_BIN),
          wineserverBin: P(WINESERVER_BIN),
          label: SYNTHETIC_PIN_LABEL,
          version: CURRENT_PIN.wineVersion,
          dxvk:
            variant === 'no-dxvk'
              ? null
              : { dir: P(DXVK_DIR), version: CURRENT_PIN.dxvkVersion }
        })
        const installRemove = (
          settings: GameSettings,
          tool: string,
          action: string,
          source: unknown
        ): Promise<boolean> => {
          installerCalls.push({ tool, action, source, settings })
          const how = args.installer ?? 'ok'
          if (how === 'throws') {
            return Promise.reject(new Error('DXVK installer blew up'))
          }
          if (how === 'fails') return Promise.resolve(false)
          if (how === 'ok') {
            writeFixtureFiles(settings.winePrefix, [
              {
                path: 'current_dxvk-macOS',
                text: `${CURRENT_PIN.dxvkVersion}\n`
              }
            ])
          }
          if (
            controller.signal.aborted === false &&
            args.abort === 'after-installer'
          ) {
            controller.abort()
          }
          return Promise.resolve(true)
        }
        const globalGameSettings = (): GameSettings =>
          ({
            enviromentOptions: [
              { key: 'FOO', value: 'bar' },
              { key: 'user', value: 'someone' },
              { key: 'WINEDEBUG', value: '+all' }
            ],
            autoInstallDxvk: true,
            launcherArgs: '-skip'
          }) as unknown as GameSettings
        const services = {
          paths: { userHome: profile.home },
          spawnAsync,
          installRemove,
          globalGameSettings
        }
        const crossoverArgs = (): Parameters<typeof createCrossoverBottle> => [
          { spawnAsync, paths: { userHome: profile.home } },
          args.bottle ?? '',
          args.binDir ?? CX_BIN_DIR,
          {
            ...(args.createTimeoutMs !== undefined && {
              createTimeoutMs: args.createTimeoutMs
            }),
            signal: controller.signal
          }
        ]

        const outcome = await withCleanProcessEnv(
          profile.fake.childEnv({}),
          async (): Promise<unknown> => {
            const bottle = args.bottle ?? ''
            const names = args.names ?? []
            if (args.abort === 'before') controller.abort()
            switch (c.op) {
              case 'views':
                return names.map((name) => ({
                  name,
                  kind: readBottleEngineMarkerKind(markerCtx, name),
                  summary: readBottleEngineMarkerSummary(markerCtx, name),
                  restoreNeedsAbsentPin: restoreNeedsAbsentPin(markerCtx, name)
                }))
              case 'reconcile': {
                const out: unknown[] = []
                for (let i = 0; i < (args.times ?? 1); i++) {
                  out.push(await reconcileBottleEngineMarker(markerCtx, bottle))
                }
                return out
              }
              case 'record-pinned': {
                const out: unknown[] = []
                for (let i = 0; i < (args.times ?? 1); i++) {
                  out.push({
                    returned: await recordPinnedBottleEngine(
                      markerCtx,
                      bottle,
                      args.pinId ?? CURRENT_PIN.id,
                      engine(args.engine)
                    ),
                    markerSha256: markerSha(profile, bottle)
                  })
                }
                return out
              }
              case 'record-crossover': {
                const out: unknown[] = []
                for (let i = 0; i < (args.times ?? 1); i++) {
                  out.push({
                    returned: await recordCrossoverBottleEngine(
                      markerCtx,
                      bottle,
                      args.binDir ?? CX_BIN_DIR
                    ),
                    markerSha256: markerSha(profile, bottle)
                  })
                }
                return out
              }
              case 'provisioned':
                return names.map((name) => ({
                  name,
                  provisioned: isBottleProvisioned(
                    { userHome: profile.home },
                    name
                  )
                }))
              case 'conf-write': {
                const out: unknown[] = []
                for (let i = 0; i < (args.times ?? 1); i++) {
                  const returned = writeCxbottleConf(bottleDir(bottle), {
                    uuid: () => BOTTLE_IDS[2].toLowerCase()
                  })
                  const file = join(bottleDir(bottle), 'cxbottle.conf')
                  out.push({
                    returned,
                    conf: existsSync(file) ? readFileSync(file, 'utf8') : null
                  })
                }
                return {
                  built: buildCxbottleConf(BOTTLE_IDS[2]),
                  calls: out
                }
              }
              case 'kill': {
                const out: unknown[] = []
                for (const name of names) {
                  out.push({
                    name,
                    returned: await killBottleWineServerWith(
                      { spawnAsync, paths: { userHome: profile.home } },
                      name,
                      P(WINESERVER_BIN),
                      args.extraEnv ?? { USER: 'crossover' },
                      args.timeoutMs ?? 15_000
                    )
                  })
                }
                return out
              }
              case 'remove-created':
                return names.map((name) => {
                  removeCreatedBottleDir({ userHome: profile.home }, name)
                  return { name, returned: null }
                })
              case 'create-crossover':
                return createCrossoverBottle(...crossoverArgs())
              case 'create-fallback':
                return createFallbackBottle(
                  { ...services, spawnAsync },
                  bottle,
                  engine(args.dxvk === false ? 'no-dxvk' : 'with-dxvk'),
                  controller.signal
                )
              case 'ensure':
                return runEnsure(args, {
                  services,
                  engine,
                  controller,
                  profile,
                  P
                })
              case 'ledger': {
                const ledger = createBottleLedger()
                return (args.steps ?? []).map((step) => {
                  const call = String(step.call)
                  const b = step.bottle as string
                  const k = step.key as string
                  let returned: unknown
                  switch (call) {
                    case 'markGameRunning':
                      returned = ledger.markGameRunning(b, k)
                      break
                    case 'markGameStopped':
                      ledger.markGameStopped(b, k)
                      returned = null
                      break
                    case 'gamesRunningIn':
                      returned = ledger.gamesRunningIn(b)
                      break
                    case 'otherGamesRunning':
                      returned = ledger.otherGamesRunning(b, k)
                      break
                    default:
                      returned = ledger.size()
                  }
                  return { ...step, returned }
                })
              }
              case 'registry': {
                const registry = createEngineRegistry()
                return (args.steps ?? []).map((step) => {
                  const call = String(step.call)
                  const key = step.key as string
                  const selection = step.selection as
                    | (Record<string, unknown> & { dxvk?: { version: string } })
                    | undefined
                  let returned: unknown
                  if (call === 'set') {
                    returned = registry.setEngineSelection(
                      key,
                      selection as never
                    )
                    if (step.mutateInput && selection) {
                      selection.label = 'MUTATED'
                      if (selection.dxvk) selection.dxvk.version = 'MUTATED'
                    }
                  } else if (call === 'get') {
                    returned = registry.getEngineSelection(key) ?? null
                  } else {
                    registry.clearEngineSelection(key)
                    returned = null
                  }
                  return { call, key, returned }
                })
              }
              case 'resolve-prefix':
                return (args.inputs ?? []).map((input) => ({
                  input,
                  returned: resolveGamePrefix(input as never)
                }))
            }
          }
        )

        const gateCalls = gate.calls.map((call) => ({
          channel: call.channel,
          args: call.args
        }))
        writeOrCompareGolden(
          CRATE,
          SLICE,
          c.id,
          {
            result: normalisePaths(
              {
                op: c.op,
                bottles: c.bottles ?? [],
                engines: c.engines ?? 'none',
                gate: c.gate ?? null,
                args: c.args ?? {},
                before,
                outcome,
                markers: markerBytes(profile),
                logs,
                gateCalls,
                spawnLimits: limits,
                installRemove: installerCalls
              },
              profile
            ),
            events: [],
            after: snapshotNormalised(profile),
            spawns: normalisePaths([...tracer.records], profile)
          },
          mode
        )
      },
      { seed: c.seed }
    )
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })

  it('every case names an op, a note and a fixture that exists', () => {
    const ops = new Set(cases.map((c) => c.op))
    expect(ops.size).toBeGreaterThanOrEqual(14)
    for (const c of cases) {
      expect(c.note.length).toBeGreaterThan(10)
      for (const name of c.bottles ?? []) fixtureByName(name)
    }
  })

  describe('the D-07 state fixtures', () => {
    const stateRoot = (): string => join(fixturesRoot(CRATE), 'state')

    /** What the builders produce, as `<group>/<name>/<path>` -> text and exec bit. */
    function expectedState(): Map<string, { text: string; exec: boolean }> {
      const out = new Map<string, { text: string; exec: boolean }>()
      const add = (prefix: string, files: readonly FixtureFile[]): void => {
        for (const f of files) {
          out.set(`${prefix}/${f.path}`, {
            text: f.text,
            exec: f.mode === '0755'
          })
        }
      }
      for (const bottle of BOTTLE_FIXTURES) {
        add(`bottles/${bottle.name}`, bottle.files)
      }
      for (const variant of ENGINE_VARIANT_NAMES) {
        add(`engines/${variant}`, engineFiles(variant))
      }
      return out
    }

    function committedState(): Map<string, { text: string; exec: boolean }> {
      const out = new Map<string, { text: string; exec: boolean }>()
      const walk = (dir: string, rel: string): void => {
        if (!existsSync(dir)) return
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const next = rel === '' ? entry.name : `${rel}/${entry.name}`
          if (entry.isDirectory()) {
            walk(join(dir, entry.name), next)
          } else {
            const full = join(dir, entry.name)
            out.set(next, {
              text: readFileSync(full, 'utf8'),
              exec: (statSync(full).mode & 0o111) !== 0
            })
          }
        }
      }
      walk(stateRoot(), '')
      return out
    }

    it('are what the builders produce', () => {
      if (oracleMode() === 'write') {
        rmSync(join(stateRoot(), 'bottles'), { recursive: true, force: true })
        rmSync(join(stateRoot(), 'engines'), { recursive: true, force: true })
        for (const bottle of BOTTLE_FIXTURES) {
          writeFixtureFiles(
            join(stateRoot(), 'bottles', bottle.name),
            bottle.files
          )
        }
        for (const variant of ENGINE_VARIANT_NAMES) {
          writeFixtureFiles(
            join(stateRoot(), 'engines', variant),
            engineFiles(variant)
          )
        }
      }
      const expected = expectedState()
      const committed = committedState()
      expect([...committed.keys()].sort()).toEqual([...expected.keys()].sort())
      for (const [path, want] of expected) {
        expect(committed.get(path)).toEqual(want)
      }
    })

    it('cover every D-07 shape with at least twelve bottles', () => {
      expect(BOTTLE_FIXTURES.length).toBeGreaterThanOrEqual(12)
      const names = BOTTLE_FIXTURES.map((b) => b.name)
      expect(new Set(names).size).toBe(names.length)
      const markers = BOTTLE_FIXTURES.flatMap((b) =>
        b.files.filter((f) => f.path === '.gamelib-engine.json')
      ).map((f) => f.text)
      // crossover, pinned current and retired, wine-manager, failed, newer, unreadable
      expect(markers.some((m) => m.includes('"kind":"crossover"'))).toBe(true)
      expect(markers.some((m) => m.includes(`"id":"${CURRENT_PIN.id}"`))).toBe(
        true
      )
      expect(markers.some((m) => m.includes('wine-staging-11.1"'))).toBe(true)
      expect(markers.some((m) => m.includes('"kind":"wine-manager"'))).toBe(
        true
      )
      expect(markers.some((m) => m.includes('"dxvk":"failed"'))).toBe(true)
      expect(markers.some((m) => m.includes('"version":2'))).toBe(true)
      expect(markers.some((m) => !m.endsWith('}'))).toBe(true)
    })

    it('draw every BottleID from the allow-list and name no account', () => {
      const uuid =
        /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g
      for (const bottle of BOTTLE_FIXTURES) {
        for (const file of bottle.files) {
          for (const id of file.text.match(uuid) ?? []) {
            expect(BOTTLE_IDS as readonly string[]).toContain(id)
          }
          expect(file.text).not.toMatch(/\/Users\/|\/home\//)
        }
      }
    })

    it('pin the ids and hashes of the build under oracle', () => {
      expect(CURRENT_PIN.id).toBe(ENGINE_PINS.current.id)
      expect(CURRENT_PIN.wineVersion).toBe(ENGINE_PINS.current.wine.version)
      expect(CURRENT_PIN.wineSha256).toBe(ENGINE_PINS.current.wine.sha256)
      expect(CURRENT_PIN.dxvkVersion).toBe(ENGINE_PINS.current.dxvk.version)
      expect(CURRENT_PIN.dxvkSha256).toBe(ENGINE_PINS.current.dxvk.sha256)
    })

    it('write the conf the way buildCxbottleConf does', () => {
      const bare = fixtureByName('fx-nomarker-nodxvk-nots').files.find(
        (f) => f.path === 'cxbottle.conf'
      )
      expect(bare?.text).toBe(buildCxbottleConf(BOTTLE_IDS[1]))
    })
  })
})

function markerSha(
  profile: EngineOracleProfile,
  bottle: string
): string | null {
  const file = join(profile.home, BOTTLES_REL, bottle, '.gamelib-engine.json')
  return existsSync(file)
    ? sha(normalisePaths(readFileSync(file, 'utf8'), profile))
    : null
}

interface ScriptEnv {
  profile: EngineOracleProfile
  P: (text: string) => string
  controller: AbortController
  bottleDir: (name: string) => string
}

/** One scripted process: a stream (so its effect runs while it "runs") or a spawn failure. */
function step(
  program: string,
  argv: string[],
  script: {
    code?: number | null
    stderr?: string
    effect?: () => void
    throws?: string
    repeat?: boolean
  } = {}
): Scripted {
  if (script.throws !== undefined) {
    return { program, argv, throws: script.throws, repeat: script.repeat }
  }
  return {
    program,
    argv,
    code: script.code === undefined ? 0 : script.code,
    repeat: script.repeat,
    stream: (io) => {
      script.effect?.()
      if (script.stderr) io.stderr(script.stderr)
    }
  }
}

/** The scripted processes a case's op runs, in the order they are asked for. */
function scriptsFor(c: BottleCase, args: Args, env: ScriptEnv): Scripted[] {
  const { P, controller, bottleDir } = env
  const bottle = args.bottle ?? ''
  const wineserver = P(WINESERVER_BIN)
  const wine = P(WINE_BIN)
  const binDir = args.binDir ?? CX_BIN_DIR
  const out: Scripted[] = []
  const writes = (fixture: string | undefined) => (): void => {
    if (fixture) {
      writeFixtureFiles(bottleDir(bottle), fixtureByName(fixture).files, P)
    }
  }
  const crossover = (): void => {
    const cx = args.cxbottle ?? {}
    const effect = (): void => {
      writes(cx.writes)()
      if (args.abort === 'during') controller.abort()
    }
    out.push(
      step(
        `${binDir}/cxbottle`,
        ['--create', '--bottle', bottle, '--template', 'win10_64'],
        { code: cx.code, stderr: cx.stderr, effect, throws: cx.throws }
      ),
      step(`${binDir}/wineserver`, ['-k'], { repeat: true })
    )
  }
  const fallback = (): void => {
    const boot = args.boot ?? {}
    out.push(
      step(wine, ['wineboot', '-i'], {
        code: boot.code,
        stderr: boot.stderr,
        throws: boot.throws,
        effect: () => {
          writes(boot.writes)()
          if (args.abort === 'after-boot') controller.abort()
        }
      }),
      step(wineserver, ['-w'], {
        code: args.wait === 'timeout' ? null : 0
      }),
      step(wineserver, ['-k'], { repeat: true })
    )
  }
  switch (c.op) {
    case 'kill':
      out.push(
        step(
          wineserver,
          ['-k'],
          args.script === 'throws'
            ? { throws: 'spawn wineserver ENOENT', repeat: true }
            : { code: args.script === 'timeout' ? null : 0, repeat: true }
        )
      )
      break
    case 'create-crossover':
      crossover()
      break
    case 'create-fallback':
      fallback()
      break
    case 'ensure':
      if (args.decision === 'crossover' && args.binDirPresent !== false) {
        crossover()
      }
      fallback()
      break
    default:
      break
  }
  return out
}

interface EnsureEnv {
  services: {
    paths: { userHome: string }
    spawnAsync: unknown
    installRemove: unknown
    globalGameSettings: unknown
  }
  engine: (variant?: 'with-dxvk' | 'no-dxvk') => NonCrossoverEngine
  controller: AbortController
  profile: EngineOracleProfile
  P: (text: string) => string
}

async function runEnsure(args: Args, env: EnsureEnv): Promise<unknown> {
  const flights = createPerGameBottleFlights()
  const runner = args.runner ?? 'gog'
  const appName = args.appName ?? '1207658924'
  const key = runner === 'steam' ? appName : `${runner}:${appName}`
  const call = (): Promise<unknown> =>
    flights.ensureGameBottle(
      env.services as never,
      {
        key,
        bottleName: args.bottle ?? '',
        appName,
        runner: runner as never,
        signal: env.controller.signal
      },
      {
        decide: () =>
          Promise.resolve(
            args.decision === 'pinned'
              ? {
                  kind: 'pinned',
                  reason: 'cx-missing',
                  pin: ENGINE_PINS.current
                }
              : {
                  kind: 'crossover',
                  createTimeoutMs: 120_000,
                  probed: false,
                  build: null
                }
          ) as never,
        resolveBinDir: () =>
          Promise.resolve(
            args.binDirPresent === false
              ? undefined
              : (args.binDir ?? CX_BIN_DIR)
          ),
        ensurePin: () =>
          Promise.resolve(
            args.pin === 'offline'
              ? {
                  ok: false as const,
                  aborted: false,
                  reason: 'offline',
                  error: 'offline: the pinned engine is not installed'
                }
              : args.pin === 'aborted'
                ? {
                    ok: false as const,
                    aborted: true,
                    reason: 'aborted',
                    error: 'aborted'
                  }
                : {
                    ok: true as const,
                    engine: env.engine(
                      args.dxvk === false ? 'no-dxvk' : 'with-dxvk'
                    )
                  }
          )
      }
    )
  if (args.mode === 'twice') {
    const first = await call()
    const second = await call()
    return { first, second }
  }
  if (args.mode === 'concurrent') {
    const [first, second] = await Promise.all([call(), call()])
    return { first, second }
  }
  return call()
}
