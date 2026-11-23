/**
 * The engine-switch oracle (87-16, D-07, D-08, SVC-02): `prepareBottleForEngine`, the one place a
 * bottle changes engine, driven over the 87-11 fixture bottles and recorded as goldens the Rust
 * `gamelib-engine` switch has to reproduce. Every branch that decides what happens to a bottle is a
 * case: crossover to pin, pin to crossover (healthy and unhealthy), pin to Wine Manager, DXVK ok
 * and failed, a marker a newer build wrote (refused, bytes unchanged), an unreadable and a
 * contradicted marker, the shared-bottle refusal, `bottle-busy`, `game-running`, and concurrent
 * switches of one bottle (the WR-02 interleave: a waiting call re-reads the marker).
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite golden/switch/expected/
 *   (default)                        compare, offline
 *
 * What is recorded per case (result.json): the inputs, the tree before (path, mode, sha256), each
 * call's result (`changed` is the plan's "switched" flag) or the error it threw, a timeline of what
 * happened in order (calls starting and finishing, gate asks, wineserver stops, installer calls,
 * `onSwitching`, every write of the marker with its bytes), the marker bytes of every bottle before
 * and after, the difference between the two trees, every log line, the calls the marker gate made
 * to Rust, the time limit of each spawn, and the DXVK installer's calls with their settings.
 * spawns.json is the spawn trace (the `wineserver -k` argv and env); tree.json is the tree after.
 *
 * No process runs. wineserver is a scripted answer of the spawn tracer; the DXVK installer and the
 * pinned-engine download are scripted doubles (the real tools are 87-09's and 87-14's goldens). The
 * marker gate is the jest-mock-free fake of the two Rust channels, answering from the real file.
 * `process.env` is replaced for a case by the fake profile's own env, so the recorded env diff is
 * only what the switch set. A file's sha256 is over its content with the profile roots replaced by
 * placeholders, because a marker names a wineserver by absolute path.
 */
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs'
import { basename, join } from 'path'
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
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
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
import {
  buildFallbackGameSettings,
  killBottleWineServerWith
} from '../../bottlePrimitives'
import { createBottleLedger } from '../../bottleLedger'
import {
  createEngineSwitcher,
  type EngineSwitchContext,
  type EngineSwitchDeps
} from '../../engineSwitch'
import { createFallbackEngine } from '../../fallbackEngine'
import { ENGINE_PINS } from '../../enginePins'
import type { EngineSelection, NonCrossoverEngine } from '../../engineTypes'
import {
  BOTTLES_REL,
  CURRENT_PIN,
  CX_BIN_DIR,
  DXVK_DIR,
  WINESERVER_BIN,
  WINE_BIN,
  buildBottle,
  buildEngines,
  fixtureByName,
  writeFixtureFiles,
  type EngineVariant
} from './fixtureBottles'

const CRATE = 'gamelib-engine'
const SLICE = 'switch'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 73

const MARKER_FILE = '.gamelib-engine.json'
const WM_VERSION = 'Wine-Staging-10.5'
const WM_WINESERVER = `<TOOLS>/wine/${WM_VERSION}/bin/wineserver`
const SYNTHETIC_PIN_LABEL = 'Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)'

type NextName = 'crossover' | 'pinned' | 'wine-manager'

interface CallSpec {
  bottle: string
  /** The engine key of the title asking. Default a GOG key. */
  key?: string
  next: NextName
  /** `none` hands the engine no DXVK. Default: with, except for a Wine Manager engine. */
  nextDxvk?: 'with' | 'none'
  /** Default true. */
  crossoverHealthy?: boolean
}

interface Args {
  calls: CallSpec[]
  /** Default sequential. `concurrent` starts every call before any is awaited. */
  mode?: 'sequential' | 'concurrent'
  /** Default present. `absent`: no CrossOver can be found. */
  binDir?: 'present' | 'absent'
  monitor?: 'starting' | 'running'
  /** Games running in a bottle, other than the caller. */
  ledger?: { bottle: string; key: string }[]
  /** `self`: the title's own bottle is the one switched. Absent: no own-bottle notion (not Steam). */
  ownBottle?: string
  installer?: {
    backup?: 'ok' | 'fails' | 'no-marker' | 'throws' | 'throws-once'
    restore?: 'ok' | 'fails' | 'left' | 'throws'
  }
  /** The pinned-engine download. Default ok. */
  pinFetch?: 'ok' | 'fails'
  /** What `wineserver -k` does. Default exit 0. */
  kill?: 'ok' | 'timeout' | 'throws'
}

interface SwitchCase {
  id: string
  note: string
  bottles?: string[]
  engines?: EngineVariant
  seed?: SeedEntry[]
  gate?: { answer?: GateState; reject?: boolean }
  args: Args
  /** Bottles whose marker bytes must be the same after as before (asserted, not only recorded). */
  markerUnchanged?: string[]
  /** The number of times the marker was written (asserted). */
  markerWrites?: number
}

type Scripted = NonNullable<SpawnTracerOptions['scripted']>[number]

interface SpawnLimit {
  program: string
  argv: string[]
  timeoutMs: number | null
  unbounded: boolean
  signal: boolean
}

interface InstallerCall {
  call: number
  tool: string
  action: string
  source: unknown
  settings: GameSettings
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

/** The tree with each file's sha256 over its content with the profile roots as placeholders. */
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
    const file = join(root, name, MARKER_FILE)
    if (existsSync(file)) {
      out[name] = normalisePaths(readFileSync(file, 'utf8'), profile)
    }
  }
  return out
}

/** What changed between two snapshots, and whether only a marker did (the legacy-bottle rule). */
function treeDiff(
  before: readonly TreeEntry[],
  after: readonly TreeEntry[]
): {
  added: string[]
  removed: string[]
  changed: string[]
  onlyMarkersDiffer: boolean
} {
  const b = new Map(before.map((e) => [e.path, JSON.stringify(e)]))
  const a = new Map(after.map((e) => [e.path, JSON.stringify(e)]))
  const added = [...a.keys()].filter((p) => !b.has(p)).sort()
  const removed = [...b.keys()].filter((p) => !a.has(p)).sort()
  const changed = [...a.keys()]
    .filter((p) => b.has(p) && b.get(p) !== a.get(p))
    .sort()
  return {
    added,
    removed,
    changed,
    onlyMarkersDiffer: [...added, ...removed, ...changed].every(
      (p) => basename(p) === MARKER_FILE
    )
  }
}

/** The engine selection a call asks for, with its paths expanded into the profile. */
function selectionFor(
  spec: CallSpec,
  P: (text: string) => string
): EngineSelection {
  if (spec.next === 'crossover') {
    return {
      kind: 'crossover',
      reason: 'cx-healthy',
      crossoverBuild: '26.0.0',
      binDir: CX_BIN_DIR
    }
  }
  if (spec.next === 'pinned') {
    return {
      kind: 'pinned',
      pinId: CURRENT_PIN.id,
      reason: 'cx-missing',
      wineBin: P(WINE_BIN),
      wineserverBin: P(WINESERVER_BIN),
      label: SYNTHETIC_PIN_LABEL,
      version: CURRENT_PIN.wineVersion,
      dxvk:
        spec.nextDxvk === 'none'
          ? null
          : { dir: P(DXVK_DIR), version: CURRENT_PIN.dxvkVersion }
    }
  }
  return {
    kind: 'wine-manager',
    managerVersion: WM_VERSION,
    reason: 'override',
    wineBin: P(`<TOOLS>/wine/${WM_VERSION}/bin/wine`),
    wineserverBin: P(WM_WINESERVER),
    label: 'Wine Manager',
    version: '10.5',
    dxvk:
      spec.nextDxvk === 'with'
        ? { dir: P(DXVK_DIR), version: CURRENT_PIN.dxvkVersion }
        : null
  }
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r))

describeSkipOnWindows('engine switch oracle (87-16)', () => {
  const cases = loadCases<SwitchCase>(CRATE, SLICE)
  const spies: jest.SpyInstance[] = []

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
  })

  it.each(cases)('$id', async (c) => {
    // Read before the case replaces `process.env`, which holds the mode switches.
    const mode = engineWineOracleMode()
    const logs: LogLine[] = []
    const timeline: Record<string, unknown>[] = []
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
    // Every write of the marker is a rename onto it: record the bytes as they are renamed.
    const nodeFs = jest.requireActual<typeof import('fs')>('fs')
    const realRename = nodeFs.renameSync
    spies.push(
      jest
        .spyOn(nodeFs, 'renameSync')
        .mockImplementation((from: unknown, to: unknown) => {
          if (basename(String(to)) === MARKER_FILE) {
            timeline.push({
              ev: 'marker-write',
              bottle: basename(String(to).slice(0, -(MARKER_FILE.length + 1))),
              bytes: readFileSync(String(from), 'utf8')
            })
          }
          return realRename(from as string, to as string)
        })
    )

    await withEngineOracleProfile(
      async (profile) => {
        const P = (text: string): string => expandPlaceholders(text, profile)
        if (c.engines) buildEngines(profile.toolsPath, c.engines, P)
        for (const name of c.bottles ?? []) {
          buildBottle(profile.home, fixtureByName(name), P)
        }
        const before = snapshotNormalised(profile)
        const markersBefore = markerBytes(profile)
        const args = c.args
        const installerCalls: InstallerCall[] = []
        const limits: SpawnLimit[] = []
        const pinFetches: string[] = []

        const killScript = (program: string): Scripted =>
          args.kill === 'throws'
            ? {
                program,
                argv: ['-k'],
                throws: 'spawn wineserver ENOENT',
                repeat: true
              }
            : {
                program,
                argv: ['-k'],
                code: args.kill === 'timeout' ? null : 0,
                repeat: true
              }
        const tracer = createSpawnTracer({
          baseEnv: profile.fake.childEnv({}),
          scripted: [
            `${CX_BIN_DIR}/wineserver`,
            P(WINESERVER_BIN),
            P(WM_WINESERVER),
            P(WINE_BIN)
          ].map(killScript)
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
        const ledger = createBottleLedger()
        for (const running of args.ledger ?? []) {
          ledger.markGameRunning(running.bottle, running.key as never)
        }
        const fallback = createFallbackEngine({
          paths: { toolsPath: profile.toolsPath },
          aborts: {
            create: () => ({}) as never,
            delete: () => undefined
          } as never
        })
        const ctx: EngineSwitchContext = {
          paths: { userHome: profile.home, toolsPath: profile.toolsPath },
          fallback,
          ledger,
          requestRustInvoke: (channel, rustArgs) => {
            timeline.push({ ev: 'gate-ask', channel })
            return gate.requestRustInvoke(channel, rustArgs)
          },
          bottleGate: createBottleVersionGate()
        }

        let backupThrows = 0
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

        const depsFor = (
          call: number,
          spec: CallSpec
        ): Partial<EngineSwitchDeps> &
          Pick<
            EngineSwitchDeps,
            | 'ctx'
            | 'crossoverSettings'
            | 'killWith'
            | 'installRemove'
            | 'resolveCrossoverBinDir'
            | 'ensurePinEngine'
            | 'fallbackSettings'
          > => {
          const installRemove = async (
            settings: GameSettings,
            tool: string,
            action: string,
            source: unknown
          ): Promise<boolean> => {
            installerCalls.push({ call, tool, action, source, settings })
            timeline.push({ ev: 'installer', call, tool, action })
            await tick()
            const prefix = settings.winePrefix
            if (action === 'backup') {
              const how = args.installer?.backup ?? 'ok'
              if (how === 'throws') throw new Error('DXVK installer blew up')
              if (how === 'throws-once' && backupThrows++ === 0) {
                throw new Error('DXVK installer blew up')
              }
              if (how === 'fails') return false
              if (how === 'ok' || how === 'throws-once') {
                writeFixtureFiles(prefix, [
                  {
                    path: 'current_dxvk-macOS',
                    text: `${CURRENT_PIN.dxvkVersion}\n`
                  }
                ])
              }
              return true
            }
            const how = args.installer?.restore ?? 'ok'
            if (how === 'throws') throw new Error('DXVK restore blew up')
            if (how === 'fails') return false
            if (how === 'ok') {
              rmSync(join(prefix, 'current_dxvk-macOS'), { force: true })
            }
            return true
          }
          const killWith: EngineSwitchDeps['killWith'] = async (
            bottleName,
            wineserverBin,
            extraEnv,
            timeoutMs
          ) => {
            timeline.push({
              ev: 'kill',
              call,
              bottle: bottleName,
              wineserver: wineserverBin,
              env: extraEnv,
              timeoutMs
            })
            const returned = await killBottleWineServerWith(
              { spawnAsync, paths: { userHome: profile.home } },
              bottleName,
              wineserverBin,
              extraEnv,
              timeoutMs
            )
            timeline.push({ ev: 'kill-returned', call, returned })
            return returned
          }
          return {
            ctx,
            getMonitorPhase: () => args.monitor ?? null,
            killWith,
            resolveCrossoverBinDir: () =>
              Promise.resolve(
                args.binDir === 'absent' ? undefined : CX_BIN_DIR
              ),
            installRemove:
              installRemove as unknown as EngineSwitchDeps['installRemove'],
            crossoverSettings: (key) => {
              timeline.push({ ev: 'crossover-settings', call, key })
              return {
                wineVersion: {
                  type: 'crossover',
                  bin: `${CX_BIN_DIR}/wine`,
                  name: 'CrossOver'
                },
                winePrefix: P('<HOME>/global-crossover-prefix'),
                wineCrossoverBottle: ''
              } as unknown as GameSettings
            },
            fallbackSettings: (bottleName, engine) =>
              buildFallbackGameSettings(
                { userHome: profile.home },
                bottleName,
                engine,
                globalGameSettings()
              ),
            ensurePinEngine: (pin) => {
              pinFetches.push(pin.id)
              timeline.push({ ev: 'ensure-pin', call, pinId: pin.id })
              if (args.pinFetch === 'fails') return Promise.resolve(null)
              const engine: NonCrossoverEngine = {
                wineBin: P(WINE_BIN),
                wineserverBin: P(WINESERVER_BIN),
                label: SYNTHETIC_PIN_LABEL,
                version: pin.wine.version,
                dxvk: { dir: P(DXVK_DIR), version: pin.dxvk.version }
              }
              return Promise.resolve(engine)
            },
            ...(args.ownBottle !== undefined && {
              ownBottleName: () =>
                args.ownBottle === 'self' ? spec.bottle : args.ownBottle!
            })
          }
        }

        const switcher = createEngineSwitcher()
        const runCall = async (
          spec: CallSpec,
          call: number
        ): Promise<Record<string, unknown>> => {
          timeline.push({
            ev: 'start',
            call,
            bottle: spec.bottle,
            next: spec.next
          })
          try {
            const result = await switcher.prepareBottleForEngine({
              key: spec.key ?? 'gog:1207658924',
              bottleName: spec.bottle,
              next: selectionFor(spec, P),
              crossoverHealthy: spec.crossoverHealthy,
              onSwitching: () => timeline.push({ ev: 'switching', call }),
              deps: depsFor(call, spec)
            })
            timeline.push({ ev: 'result', call, result })
            return { call, result }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            timeline.push({ ev: 'threw', call, message })
            return { call, threw: message }
          }
        }

        const outcomes = await withCleanProcessEnv(
          profile.fake.childEnv({}),
          async (): Promise<Record<string, unknown>[]> => {
            if (args.mode === 'concurrent') {
              return Promise.all(args.calls.map((spec, i) => runCall(spec, i)))
            }
            const out: Record<string, unknown>[] = []
            for (const [i, spec] of args.calls.entries()) {
              out.push(await runCall(spec, i))
            }
            return out
          }
        )

        const after = snapshotNormalised(profile)
        const markers = markerBytes(profile)
        for (const name of c.markerUnchanged ?? []) {
          expect(markers[name]).toBeDefined()
          expect(markers[name]).toBe(markersBefore[name])
        }
        if (c.markerWrites !== undefined) {
          expect(timeline.filter((e) => e.ev === 'marker-write')).toHaveLength(
            c.markerWrites
          )
        }
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
                bottles: c.bottles ?? [],
                engines: c.engines ?? 'none',
                gate: c.gate ?? null,
                args,
                before,
                outcomes,
                timeline,
                markersBefore,
                markers,
                treeDiff: treeDiff(before, after),
                logs,
                gateCalls,
                spawnLimits: limits,
                installRemove: installerCalls,
                pinFetches
              },
              profile
            ),
            events: [],
            after,
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

  it('every case names a note, at least one call and a fixture that exists', () => {
    for (const c of cases) {
      expect(c.note.length).toBeGreaterThan(10)
      expect(c.args.calls.length).toBeGreaterThan(0)
      for (const name of c.bottles ?? []) fixtureByName(name)
    }
  })

  it('records the newer-marker refusal with the marker bytes asserted unchanged', () => {
    const newer = cases.filter((c) => c.id.includes('newer-marker'))
    expect(newer.length).toBeGreaterThanOrEqual(1)
    for (const c of newer) expect(c.markerUnchanged?.length).toBeGreaterThan(0)
  })

  it('records the WR-02 interleave with the marker writes counted', () => {
    const wr02 = cases.filter((c) => c.id.startsWith('concurrent-'))
    expect(wr02.length).toBeGreaterThanOrEqual(3)
    for (const c of wr02) {
      expect(c.args.mode).toBe('concurrent')
      expect(c.args.calls.length).toBeGreaterThanOrEqual(2)
      expect(c.markerWrites).toBeDefined()
    }
  })

  it('pins the ids of the build under oracle', () => {
    expect(CURRENT_PIN.id).toBe(ENGINE_PINS.current.id)
    expect(CURRENT_PIN.dxvkVersion).toBe(ENGINE_PINS.current.dxvk.version)
  })

  it('names no operator path in any case', () => {
    expect(JSON.stringify(cases)).not.toMatch(/\/Users\/|\/home\//)
  })
})
