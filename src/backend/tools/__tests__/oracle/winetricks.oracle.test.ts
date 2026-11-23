/**
 * The Winetricks oracle (87-10, D-08): the script download, the install lifecycle with its streamed
 * output, the catalog reads, the sequential apply queue and the environment reports, recorded as
 * goldens the Rust `gamelib-wine` winetricks slice later has to reproduce. The DXVK family is
 * `dxvk.oracle.test.ts` and DXMT is `dxmt.oracle.test.ts`.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts and recorder.ts):
 *   GAMELIB_EW_ORACLE=record     write recorded/winetricks/<case>/ (every response is synthetic; no
 *                                    live request is ever allowed)
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    replay the recordings and rewrite golden/winetricks/expected/
 *   (default)                        replay and compare, offline
 *
 * The tools run for real (`createTools`, `createWinetricksQueue`) over a fake HOME. Nothing real is
 * spawned: every process is a scripted answer of the spawn tracer, so a case chooses what `which`,
 * `wine --version` and `winetricks` print and exit with, and the tracer records each call with the
 * env it set. A winetricks run streams: the case lists the stdout and stderr chunks, the 1s
 * progress ticks between them and the exit code. `process.env` is replaced for the case by the fake
 * profile's own env, so the recorded env diff is exactly what the tool built and never the
 * operator's. The script served by the URL is synthetic (T-87-61), never the upstream script.
 *
 * What is recorded per case: the result (what each call returned, every log line, the queue and
 * environment state), the events in the order the renderer would see them (`progressOfWinetricks`,
 * `installing-winetricks-component`, `showDialog`, the queue's `winetricksQueueChanged` pushes and
 * game-status updates), the requests, the profile tree and the process trace. The backend jest
 * project replaces i18next with a stub that returns the key, so a dialog carries
 * `box.error.winetricks.title`, not its English text.
 */
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertLiveRecorded,
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
import {
  fixturesRoot,
  installAdapter,
  installRecorder,
  engineWineOracleMode,
  type SyntheticResponse
} from 'backend/testUtils/engineWineOracle/recorder'
import {
  createSpawnTracer,
  type SpawnTracerOptions
} from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import {
  parseWinetricksListAll,
  VERB_SHAPE_RE
} from 'backend/tools/winetricksListParse'
import {
  classifyWinetricksLine,
  isUnsupportedWineVersion,
  parseUnsupportedWineVersion,
  parseWineVersionOutput,
  splitOutputChunk
} from 'backend/tools/winetricksOutputClassifier'
import {
  assertWinetricksApplyPayload,
  WINETRICKS_APPLY_MAX_VERBS
} from 'backend/tools/winetricksApplyGuard'
import {
  deriveNeedsGuiVerbs,
  parseWinetricksMetadata
} from 'common/winetricks/metadata'
import { isVisibleVerb } from 'common/winetricks/visibility'
import type { ToolsDeps } from 'backend/tools'
import type { Game } from 'common/types/game_manager'
import type {
  GameSettings,
  Runner,
  WinetricksComponent,
  WinetricksLogLine,
  WineInstallation
} from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'winetricks'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 76
/** The vector count this plan commits across every function in winetricks_pure.json. */
const VECTOR_FLOOR = 60

/** One step of a streamed winetricks run. */
type Step =
  | { out: string }
  | { err: string }
  | { tick: true }
  /** The queue's `cancelRemaining` is called while this run is in flight. */
  | { cancel: true }
  /** A second `apply` with this payload is made while this run is in flight. */
  | { applyAgain: unknown }

interface VerbRun {
  code: number | null
  steps?: Step[]
  /** The run rejects with this message, like a spawn error. */
  throws?: string
}

interface WinetricksCase {
  id: string
  op:
    | 'download'
    | 'install'
    | 'list-available'
    | 'catalog-for'
    | 'list-installed'
    | 'queue'
    | 'check-wine-version'
    | 'check-dependencies'
  note: string
  platform: OraclePlatform
  /** Default true. */
  online?: boolean
  /** The winetricks script on disk. Default `present`. */
  script?: 'present' | 'absent' | 'stale'
  /** What the script URL answers. Default 200 with the synthetic script. */
  serve?: '200' | '500' | 'network-error'
  /** The tools directory does not exist (boot makes it; this is the case it has not). */
  noToolsDir?: boolean
  seed?: SeedEntry[]
  runner?: Runner
  appName?: string
  wineVersion?: { type: string; name: string; bin: string }
  winePrefix?: string
  disableUMU?: boolean
  /** The settings go in as `gameSettings` (the Steam bridge applier), not through the library. */
  explicitSettings?: boolean
  /** Run through umu: the winetricks program is umu's and its argv starts with `winetricks`. */
  umu?: boolean
  /** `launcher.validWine` answer. Default true. */
  validWine?: boolean
  /** The component name another install is already running. */
  installing?: string
  verb?: string
  /** The host dependencies `which` does not find. */
  missing?: string[]
  /** The `which` probe itself fails to run. */
  whichThrows?: boolean
  /** What `wine --version` answers. Default `wine-9.0`. */
  versionProbe?: {
    stdout?: string
    code?: number | null
    timedOut?: boolean
    truncated?: boolean
    throws?: string
  }
  /** The single verb `install` runs. */
  run?: VerbRun
  /** `winetricks list-all` (answers every call). */
  list?: VerbRun
  /** The verbs a queue run installs, by name. */
  installs?: Record<string, VerbRun>
  /** The payloads handed to the queue's `apply`, in order (any JSON, not only verb lists). */
  applies?: unknown[]
  /** The applies are issued in the same tick. */
  concurrent?: boolean
  /** The catalog is read once (a list-all run) before the applies. */
  prelist?: boolean
  /** The environment report the game already has when the case starts. */
  preset?: {
    unsupportedWineVersion?: string | null
    missingDependencies?: string[]
  }
}

const SCRIPT_PATH = '/Winetricks/winetricks/master/src/winetricks'
const DEPENDENCIES = ['7z', 'cabextract', 'zenity', 'unzip', 'curl']

/**
 * The script served and kept on disk. Synthetic (T-87-61): the metadata fields and one
 * `w_download_manual` body are the shape the parsers read, not any line of the upstream script.
 */
const SYNTHETIC_SCRIPT = `#!/bin/sh
# synthetic winetricks script for the GameLib oracle (87-10); not the upstream script
w_metadata vcrun2019 dlls \\
    title="Visual C++ 2015-2019 libraries" \\
    publisher="Microsoft" \\
    year="2019" \\
    media="download" \\
    conflicts="vcrun2022"
w_metadata corefonts fonts \\
    title="MS Arial, Courier, Times fonts" \\
    publisher="Microsoft" \\
    year="2008" \\
    media="download"
w_metadata d3dx9 dlls \\
    title="MS d3dx9 DLLs" \\
    publisher="Microsoft" \\
    year="2010" \\
    media="download"
w_metadata manualdll dlls \\
    title="Needs a manual download" \\
    publisher="Example" \\
    year="2020" \\
    media="manual_download"
w_metadata fontsmooth=rgb settings \\
    title="Enable subpixel font smoothing for RGB LCDs"

load_manualdll()
{
    w_download_manual https://example.invalid/x x.exe 0000
}
`

const DEFAULT_WINE = {
  type: 'wine',
  name: 'Wine-9',
  bin: '<TOOLS>/wine/Wine-9/bin/wine'
}

function syntheticFor(c: WinetricksCase): SyntheticResponse[] {
  const serve = c.serve ?? '200'
  if (serve === 'network-error') {
    return [
      {
        method: 'GET',
        path: SCRIPT_PATH,
        status: 0,
        body: '',
        networkError: true
      }
    ]
  }
  if (serve === '500') {
    return [
      {
        method: 'GET',
        path: SCRIPT_PATH,
        status: 500,
        headers: { 'content-type': 'text/plain' },
        body: 'Internal Server Error'
      }
    ]
  }
  return [
    {
      method: 'GET',
      path: SCRIPT_PATH,
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: SYNTHETIC_SCRIPT
    }
  ]
}

type Event = { channel: string; args: unknown[] }

type Scripted = NonNullable<SpawnTracerOptions['scripted']>[number]

const expand = <T>(value: T, profile: EngineOracleProfile): T =>
  JSON.parse(expandPlaceholders(JSON.stringify(value), profile)) as T

/** Only the timers a case needs from jest are faked: the 1s progress interval. */
function fakeProgressInterval(): void {
  jest.useFakeTimers({
    doNotFake: [
      'Date',
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout'
    ]
  })
}

/** One macrotask: every scripted probe (microtask-only) has settled by the time it fires. */
const settle = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve))

/** Replaces the whole of `process.env` for the duration of `fn` (async), then puts it back. */
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

interface SliceModules {
  utils: typeof import('backend/utils')
  tools: typeof import('backend/tools')
  toolsState: typeof import('backend/tools/toolsState')
  queue: typeof import('backend/tools/winetricksQueue')
  logger: typeof import('backend/logger')
  testServices: typeof import('backend/testUtils/testServices')
}
let mods: SliceModules

describeSkipOnWindows('Winetricks oracle (87-10)', () => {
  const cases = loadCases<WinetricksCase>(CRATE, SLICE)

  beforeAll(async () => {
    // The recorder's dispatcher must be the default adapter before `backend/utils` builds its axios
    // client, so every slice module is imported after it.
    installAdapter()
    mods = {
      utils: await import('backend/utils'),
      tools: await import('backend/tools'),
      toolsState: await import('backend/tools/toolsState'),
      queue: await import('backend/tools/winetricksQueue'),
      logger: await import('backend/logger'),
      testServices: await import('backend/testUtils/testServices')
    }
  })

  beforeEach(fakeProgressInterval)
  afterEach(() => {
    jest.useRealTimers()
  })

  it.each(cases)('$id', async (c) => {
    assertLiveRecorded(CRATE, SLICE, c)
    // Read before the case replaces `process.env`, which holds the mode switches.
    const mode = engineWineOracleMode()
    const restorePlatform = mockPlatform(c.platform)
    // No live request is ever allowed: every body is synthetic.
    const recorder = installRecorder({
      crate: CRATE,
      slice: SLICE,
      caseId: c.id,
      synthetic: syntheticFor(c),
      allowLive: () => false
    })
    const logs: LogLine[] = []
    const logSpies = (
      [
        ['logDebug', 'DEBUG'],
        ['logInfo', 'INFO'],
        ['logWarning', 'WARNING'],
        ['logError', 'ERROR']
      ] as const
    ).map(([name, level]) =>
      jest
        .spyOn(mods.logger, name)
        .mockImplementation((message: unknown, options?: unknown) => {
          captureLog(logs, level, message, options)
        })
    )
    // The script on disk, as the case says (a download case states it itself).
    const seed: SeedEntry[] = [
      ...(c.noToolsDir ? [] : [{ path: '<TOOLS>', dir: true as const }]),
      ...(c.script === 'absent'
        ? []
        : [
            {
              path: '<TOOLS>/winetricks',
              text: SYNTHETIC_SCRIPT,
              mode: '0755'
            }
          ]),
      ...(c.seed ?? [])
    ]
    try {
      await withEngineOracleProfile(
        async (profile) => {
          const runner: Runner = c.runner ?? 'gog'
          const appName = c.appName ?? 'game'
          const wineVersion = expand(c.wineVersion ?? DEFAULT_WINE, profile)
          const winePrefix = expandPlaceholders(
            c.winePrefix ?? '<HOME>/prefix',
            profile
          )
          const settings = {
            winePrefix,
            wineVersion: wineVersion as unknown as WineInstallation,
            ...(c.disableUMU && { disableUMU: true })
          } as unknown as GameSettings

          const scriptPath = join(profile.toolsPath, 'winetricks')
          if (c.script === 'stale') {
            // older than the 7 days the download cache honours
            const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000)
            utimesSync(scriptPath, eightDaysAgo, eightDaysAgo)
          }

          // The fake profile's own env is the process env of the case: the tools spread it into
          // every spawn, so the recorded env diff is what the tools built.
          const baseEnv = profile.fake.childEnv({
            PATH: '/oracle/bin',
            LANG: 'en_US.UTF-8'
          })
          await withCleanProcessEnv(baseEnv, async () => {
            const events: Event[] = []
            const sendFrontendMessage = ((
              channel: string,
              ...args: unknown[]
            ) => {
              // Cloned now: the tool hands over live arrays it goes on appending to.
              events.push({ channel, args: structuredClone(args) })
              return true
            }) as unknown as SendFrontendMessage

            const umuPath = join(profile.runtimePath, 'umu', 'umu_run.py')
            const winetricksProgram = c.umu ? umuPath : scriptPath
            const verb = c.verb ?? 'vcrun2019'
            // The wine binary winetricks runs with: a Proton that umu does not run is unpacked.
            const alwaysWineBin =
              wineVersion.type === 'proton' && !c.umu
                ? join(dirname(wineVersion.bin), 'files', 'bin', 'wine')
                : wineVersion.bin

            // What the steps reach back into: assigned once the queue exists.
            const hookLog: unknown[] = []
            const hooks = {
              cancel: () => undefined as void,
              applyAgain: (_payload: unknown): Promise<void> =>
                Promise.resolve()
            }
            const streamFor =
              (steps: readonly Step[]) =>
              async (io: {
                stdout(text: string): void
                stderr(text: string): void
              }) => {
                // A real install runs for minutes: the fire-and-forget probes have long settled
                // before its first byte.
                await settle()
                for (const step of steps) {
                  if ('out' in step) io.stdout(step.out)
                  else if ('err' in step) io.stderr(step.err)
                  else if ('tick' in step) jest.advanceTimersByTime(1000)
                  else if ('cancel' in step) hooks.cancel()
                  else await hooks.applyAgain(step.applyAgain)
                }
              }
            const runEntry = (
              argv: string[],
              r: VerbRun,
              repeat: boolean
            ): Scripted => ({
              program: winetricksProgram,
              argv,
              code: r.code,
              repeat,
              ...(r.throws !== undefined
                ? { throws: r.throws }
                : { stream: streamFor(r.steps ?? []) })
            })
            const verbArgv = (v: string): string[] =>
              c.umu ? ['winetricks', v] : ['-q', v]

            const scripted: Scripted[] = [
              ...DEPENDENCIES.map(
                (dependency): Scripted =>
                  c.whichThrows
                    ? {
                        program: 'which',
                        argv: [dependency],
                        throws: 'spawn which ENOENT',
                        repeat: true
                      }
                    : {
                        program: 'which',
                        argv: [dependency],
                        code: (c.missing ?? []).includes(dependency) ? 1 : 0,
                        repeat: true
                      }
              ),
              {
                program: alwaysWineBin,
                argv: ['--version'],
                repeat: true,
                stdout: c.versionProbe?.stdout ?? 'wine-9.0\n',
                ...(c.versionProbe?.code !== undefined && {
                  code: c.versionProbe.code
                }),
                ...(c.versionProbe?.timedOut && { timedOut: true }),
                ...(c.versionProbe?.truncated && { truncated: true }),
                ...(c.versionProbe?.throws !== undefined && {
                  throws: c.versionProbe.throws
                })
              },
              ...(c.run ? [runEntry(verbArgv(verb), c.run, false)] : []),
              ...Object.entries(c.installs ?? {}).map(([name, r]) =>
                runEntry(verbArgv(name), r, false)
              ),
              ...(c.list
                ? [
                    runEntry(
                      c.umu ? ['winetricks', 'list-all'] : ['list-all'],
                      c.list,
                      true
                    )
                  ]
                : [])
            ]
            const tracer = createSpawnTracer({ baseEnv, scripted })

            const launcherCalls: unknown[] = []
            const slices = mods.testServices.createTestToolsSlices({
              sendFrontendMessage
            })
            const toolsState = slices.toolsState
            const game = {
              isNative: () => true,
              getGameInfo: () => ({
                runner,
                app_name: appName,
                install: { platform: 'Windows' }
              }),
              getSettings: () => Promise.resolve(settings)
            }
            const deps = {
              ...slices,
              paths: profile.paths,
              spawnAsync: tracer.spawnAsync,
              runner: tracer.runner,
              onlineMonitor: { isOnline: () => c.online !== false },
              stores: mods.testServices.createTestStores(),
              managers: {
                library: c.explicitSettings
                  ? {}
                  : { [runner]: { getGame: () => game } }
              },
              commandRunner: {
                runWineCommand: () => Promise.reject(new Error('not used'))
              },
              launcher: {
                setupEnvVars: (s: GameSettings) => {
                  launcherCalls.push({
                    fn: 'setupEnvVars',
                    wineVersion: {
                      type: s.wineVersion.type,
                      bin: s.wineVersion.bin
                    }
                  })
                  return { ORACLE_SETUP_ENV: '1' }
                },
                setupWineEnvVars: (s: GameSettings, app: string) => {
                  launcherCalls.push({
                    fn: 'setupWineEnvVars',
                    wineVersion: {
                      type: s.wineVersion.type,
                      bin: s.wineVersion.bin
                    },
                    appName: app
                  })
                  return { ORACLE_WINE_ENV: app }
                },
                validWine: (v: { name: string }) => {
                  launcherCalls.push({ fn: 'validWine', name: v.name })
                  return Promise.resolve(c.validWine !== false)
                }
              }
            } as unknown as ToolsDeps

            if (c.preset?.missingDependencies) {
              toolsState.winetricksEnv.recordMissingDependencies(
                runner,
                appName,
                c.preset.missingDependencies
              )
            }
            if (c.preset && 'unsupportedWineVersion' in c.preset) {
              toolsState.winetricksEnv.recordUnsupportedWine(
                runner,
                appName,
                c.preset.unsupportedWineVersion ?? null
              )
            }
            // The boot's one queue: its environment listener is what pushes a report change.
            const queue = mods.queue.createWinetricksQueue({
              push: (channel, state) => {
                events.push({ channel, args: [structuredClone(state)] })
              },
              sendGameStatus: (update) => {
                events.push({ channel: 'queue:sendGameStatus', args: [update] })
              },
              getInstallingComponent: () => toolsState.installing.get(),
              environment: toolsState.winetricksEnv
            })
            const { Winetricks } = mods.tools.createTools(deps)
            hooks.cancel = () => {
              hookLog.push({
                step: 'cancelRemaining',
                state: structuredClone(queue.cancelRemaining(runner, appName))
              })
            }
            hooks.applyAgain = async (payload) => {
              hookLog.push({
                step: 'applyDuringRun',
                result: structuredClone(
                  await queue.apply(Winetricks, runner, appName, payload)
                )
              })
            }

            if (c.installing) toolsState.installing.set(c.installing)

            const catalogKey = `${runner}:${appName}`
            let result: Record<string, unknown>
            switch (c.op) {
              case 'download': {
                await Winetricks.download()
                result = { returned: null }
                break
              }
              case 'install': {
                const onLines: WinetricksLogLine[] = []
                const outcome = await Winetricks.install(
                  runner,
                  appName,
                  verb,
                  (line) => onLines.push(line),
                  c.explicitSettings ? settings : undefined
                )
                result = { verb, outcome, onLines }
                break
              }
              case 'list-available': {
                const components = await Winetricks.listAvailable(
                  runner,
                  appName
                )
                result = {
                  components,
                  catalogCache: toolsState.catalogCache.get(catalogKey) ?? null
                }
                break
              }
              case 'catalog-for': {
                const first = await Winetricks.catalogFor(runner, appName)
                const second = await Winetricks.catalogFor(runner, appName)
                result = {
                  first: first.map((component) => component.verb),
                  second: second.map((component) => component.verb)
                }
                break
              }
              case 'list-installed': {
                result = {
                  lines: await Winetricks.listInstalled(game as unknown as Game)
                }
                break
              }
              case 'check-wine-version': {
                await Winetricks.checkWineVersion(
                  runner,
                  appName,
                  wineVersion.bin,
                  { WINEPREFIX: winePrefix }
                )
                result = {}
                break
              }
              case 'check-dependencies': {
                const messages: string[] = []
                await Winetricks.checkDependencies(
                  runner,
                  appName,
                  { WINEPREFIX: winePrefix },
                  (message) => messages.push(message)
                )
                result = { messages }
                break
              }
              case 'queue': {
                if (c.prelist) await Winetricks.listAvailable(runner, appName)
                const payloads = c.applies ?? []
                const applyAll = (): Promise<unknown>[] =>
                  payloads.map((payload) =>
                    queue.apply(Winetricks, runner, appName, payload)
                  )
                const applies: unknown[] = []
                if (c.concurrent) {
                  applies.push(...(await Promise.all(applyAll())))
                } else {
                  for (const payload of payloads) {
                    applies.push(
                      await queue.apply(Winetricks, runner, appName, payload)
                    )
                  }
                }
                // The run goes on detached: wait for the push that says it is done.
                const runDone = (): boolean =>
                  events.some(
                    (e) =>
                      e.channel === 'winetricksQueueChanged' &&
                      (e.args[0] as { run: { status: string } | null }).run
                        ?.status === 'done'
                  )
                const accepted = applies.some(
                  (a) => (a as { accepted: boolean }).accepted
                )
                for (let i = 0; accepted && i < 5000 && !runDone(); i++) {
                  await settle()
                }
                expect(accepted ? runDone() : true).toBe(true)
                result = {
                  applies,
                  duringRun: hookLog,
                  finalState: queue.getState(runner, appName)
                }
                break
              }
            }
            await settle()
            await settle()

            // Done carries `failed`; no other progress payload does.
            const progress = events.filter(
              (e) => e.channel === 'progressOfWinetricks'
            )
            for (const e of progress) {
              const payload = e.args[0] as {
                messages: string[]
                failed?: boolean
              }
              expect('failed' in payload).toBe(payload.messages[0] === 'Done')
            }

            // A winetricks run that spawned ends in the ['Done'] event.
            const spawned = tracer.records.some(
              (r) =>
                r.program === winetricksProgram && r.result.error === undefined
            )
            if (c.op === 'install' && spawned) {
              expect(
                (
                  progress[progress.length - 1]?.args[0] as {
                    messages: string[]
                  }
                ).messages
              ).toEqual(['Done'])
            }

            await recorder.finish()
            writeOrCompareGolden(
              CRATE,
              SLICE,
              c.id,
              {
                result: normalisePaths(
                  {
                    op: c.op,
                    platform: c.platform,
                    ...result,
                    installing: toolsState.installing.get(),
                    environment: toolsState.winetricksEnv.getReport(
                      runner,
                      appName
                    ),
                    launcher: launcherCalls,
                    logs
                  },
                  profile
                ),
                events: normalisePaths(events, profile),
                after: snapshotTree(profile.home),
                spawns: normalisePaths(tracer.records, profile),
                requests: recorder.requested
              },
              mode
            )
          })
        },
        { seed }
      )
    } finally {
      for (const logSpy of logSpies) logSpy.mockRestore()
      restorePlatform()
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })
})

// ---------------------------------------------------------------------------------------------
// The pure vectors: input/output pairs for the logic the Rust port reimplements. Every expected
// value is what the TS returned; nothing here is typed by hand as an answer.

const component = (
  verb: string,
  category = 'dlls',
  extra: Partial<WinetricksComponent> = {}
): WinetricksComponent => ({
  verb,
  title: `title of ${verb}`,
  category,
  cached: false,
  ...extra
})

const GUARD_CATALOG: WinetricksComponent[] = [
  component('vcrun2019'),
  component('corefonts', 'fonts'),
  component('d3dx9'),
  component('fontsmooth=rgb', 'settings'),
  component('foobar2000', 'apps'),
  component('3dmark06', 'benchmarks'),
  component('annihilate', 'settings'),
  component('winecfg', 'settings'),
  component('manualdll', 'dlls', { needsGui: true }),
  component('visibleflag', 'dlls', { needsGui: false })
]

/** 100 and 101 distinct verbs, all in one catalog. */
const MANY = Array.from(
  { length: WINETRICKS_APPLY_MAX_VERBS + 1 },
  (_, i) => `v${String(i).padStart(3, '0')}`
)
const MANY_CATALOG = MANY.map((verb) => component(verb))

const LIST_ALL_INPUTS: { id: string; chunks: string[] }[] = [
  {
    id: 'list-all-two-categories',
    chunks: [
      '===== dlls =====\nvcrun2019               Visual C++ 2015-2019 libraries (Microsoft, 2019) [downloadable,cached]\n===== fonts =====\ncorefonts               MS Arial, Courier, Times fonts (Microsoft, 2008) [downloadable]\n'
    ]
  },
  {
    id: 'list-all-prefix-block-skipped',
    chunks: [
      '===== prefix =====\napps\ndlls\nfonts\nsettings\n===== dlls =====\nd3dx9                  MS d3dx9 DLLs (Microsoft, 2010) [downloadable]\n'
    ]
  },
  {
    id: 'list-all-before-first-header-ignored',
    chunks: [
      'warning: taskset/cpuset not available on your platform!\nvcrun2019   ignored before any header\n===== dlls =====\nd3dx9  title [downloadable]\n'
    ]
  },
  {
    id: 'list-all-chunk-boundary-mid-line',
    chunks: [
      '===== dlls =====\nvcrun20',
      '19    Visual C++ [downloadable]\nd3dx9   ',
      'title [downloadable]\n'
    ]
  },
  {
    id: 'list-all-crlf',
    chunks: ['===== dlls =====\r\nvcrun2019   Visual C++ [downloadable]\r\n']
  },
  {
    id: 'list-all-duplicate-verb-keeps-first',
    chunks: [
      '===== dlls =====\nvcrun2019   first [downloadable]\n===== fonts =====\nvcrun2019   second [downloadable]\n'
    ]
  },
  {
    id: 'list-all-bare-token-rejected',
    chunks: ['===== dlls =====\nvcrun2019\nd3dx9   title\n']
  },
  {
    id: 'list-all-uppercase-and-dotted-verbs-rejected',
    chunks: [
      '===== dlls =====\nVCRUN2019   upper\nvc.run   dotted\nvc-run   dashed\nok_verb   fine\n'
    ]
  },
  {
    id: 'list-all-settings-verb-with-equals',
    chunks: [
      '===== settings =====\nfontsmooth=rgb          Enable subpixel font smoothing for RGB LCDs\nvd=1024x768             Virtual desktop\n'
    ]
  },
  {
    id: 'list-all-flags-without-cached',
    chunks: [
      '===== dlls =====\nx  title [downloadable,nocd]\ny  title [cached]\nz  title []\n'
    ]
  },
  {
    id: 'list-all-header-lookalike-not-a-verb',
    chunks: ['===== dlls =====\n===== x =====\n=====  no\nvcrun2019   title\n']
  },
  { id: 'list-all-empty', chunks: [] }
]

const VERB_SHAPE_INPUTS: string[] = [
  'vcrun2019',
  'fontsmooth=rgb',
  'vd=1024x768',
  '_underscore',
  'a',
  '0day',
  'dotnet48',
  '=leading',
  'UPPER',
  'with space',
  'dash-ed',
  'dot.ted',
  '',
  '=====',
  'a:b'
]

const CLASSIFY_INPUTS: string[] = [
  '',
  '   ',
  '  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current',
  '                                 Dload  Upload   Total   Spent    Left  Speed',
  ' 42 12.3M   42 5229k    0     0  1234k      0  0:00:10  0:00:04  0:00:06 1233k',
  '100 12.3M  100 12.3M    0     0  1234k      0  0:00:10  0:00:10 --:--:-- 1233k',
  '101 12.3M  101 12.3M    0     0  1234k      0  0:00:10  0:00:10 --:--:-- 1233k',
  '0024:fixme:ntdll:NtQuerySystemInformation info_class 1',
  '002c:err:module:import_dll Library X.dll not found',
  'fixme:heap:RtlSetHeapInformation stub',
  'warn:module:foo bar',
  'trace:x:y z',
  '----------------------------------------------------',
  '---------',
  'Note: command "wine setup.exe" returned status 1. Aborting.',
  'warning: Note: command x returned status 2. Aborting.',
  'Aborting',
  'warning: Your version of wine 7.7 is no longer supported upstream. You should upgrade to 8.x',
  'zenity not installed! Winetricks might fail to install some packages or even open',
  'warning: taskset/cpuset not available on your platform!',
  'warning: something else',
  'Executing w_do_call vcrun2019',
  'Using winetricks 20260125-next - sha256sum: abc',
  `${'x'.repeat(2100)}`
]

/** A long chunk is stored as its generator, so the vector file stays small. */
type SplitChunk = string | { repeat: { char: string; count: number } }
const chunkText = (chunk: SplitChunk): string =>
  typeof chunk === 'string'
    ? chunk
    : chunk.repeat.char.repeat(chunk.repeat.count)

const SPLIT_INPUTS: { id: string; remainder: string; chunk: SplitChunk }[] = [
  { id: 'split-whole-lines', remainder: '', chunk: 'a\nb\nc\n' },
  { id: 'split-partial-tail', remainder: '', chunk: 'a\nb\npart' },
  { id: 'split-remainder-completes', remainder: 'par', chunk: 't one\nnext' },
  { id: 'split-bare-cr-redraw', remainder: '', chunk: ' 10 x\r 20 x\r 30 x' },
  { id: 'split-crlf', remainder: '', chunk: 'a\r\nb\r\n' },
  { id: 'split-blank-lines-dropped', remainder: '', chunk: '\n\n  \na\n' },
  { id: 'split-empty-chunk-keeps-remainder', remainder: 'keep', chunk: '' },
  {
    id: 'split-no-newline-over-limit',
    remainder: '',
    chunk: { repeat: { char: 'y', count: 65536 * 2 + 5 } }
  },
  {
    id: 'split-exactly-at-limit',
    remainder: '',
    chunk: { repeat: { char: 'z', count: 65536 } }
  }
]

const WINE_VERSION_INPUTS: string[] = [
  'wine-9.0\n',
  'wine-8.0-rc1\n',
  'wine-7.7 (Game Porting Toolkit 1.1)\n',
  'wine-10.0 (Staging)\n',
  'wine-staging-9.5\r\n',
  '\n\nwine-9.0\n',
  'CrossOver wine-8.0.1\n',
  'Wine version 6.0\n',
  '',
  'garbage\n',
  'wine-\n',
  'wine-abc\n'
]

const UNSUPPORTED_NOTICE_INPUTS: string[] = [
  'warning: Your version of wine 7.7 is no longer supported upstream. You should upgrade to 8.x',
  'Your version of wine 6.23 is no longer supported upstream',
  'Your version of wine is no longer supported upstream',
  'warning: Your version of wine 8.0 is fine',
  '',
  'prefix text Your version of wine 5.0-rc1 is no longer supported upstream trailing'
]

const UNSUPPORTED_VERSION_INPUTS: string[] = [
  '7.7',
  '7.99',
  '7.99.0',
  '7.99.1',
  '7.100',
  '8.0',
  '10.0',
  '6.23',
  '9.0.1',
  '7',
  'abc',
  ''
]

const VISIBLE_INPUTS: { verb: string; category: string; needsGui?: boolean }[] =
  [
    { verb: 'vcrun2019', category: 'dlls' },
    { verb: 'foobar2000', category: 'apps' },
    { verb: '3dmark06', category: 'benchmarks' },
    { verb: 'annihilate', category: 'settings' },
    { verb: 'winecfg', category: 'settings' },
    { verb: 'regedit', category: 'settings' },
    { verb: 'shell', category: 'settings' },
    { verb: 'fontsmooth=rgb', category: 'settings' },
    { verb: 'manualdll', category: 'dlls', needsGui: true },
    { verb: 'plain', category: 'dlls', needsGui: false },
    { verb: 'bad', category: 'settings' },
    { verb: 'good', category: 'settings' }
  ]

const APPLY_INPUTS: {
  id: string
  verbs: unknown
  catalog: WinetricksComponent[]
}[] = [
  { id: 'apply-one-verb', verbs: ['vcrun2019'], catalog: GUARD_CATALOG },
  {
    id: 'apply-several-keep-order',
    verbs: ['corefonts', 'vcrun2019', 'd3dx9'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'apply-dedupes-first-occurrence-order',
    verbs: ['d3dx9', 'vcrun2019', 'd3dx9', 'corefonts', 'vcrun2019'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'apply-settings-verb-with-equals',
    verbs: ['fontsmooth=rgb'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'apply-explicit-needsgui-false-visible',
    verbs: ['visibleflag'],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-string', verbs: 'vcrun2019', catalog: GUARD_CATALOG },
  { id: 'reject-object', verbs: { 0: 'vcrun2019' }, catalog: GUARD_CATALOG },
  { id: 'reject-null', verbs: null, catalog: GUARD_CATALOG },
  { id: 'reject-number', verbs: 3, catalog: GUARD_CATALOG },
  { id: 'reject-empty-list', verbs: [], catalog: GUARD_CATALOG },
  {
    id: 'reject-non-string-entry',
    verbs: ['vcrun2019', 3],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-null-entry', verbs: [null], catalog: GUARD_CATALOG },
  {
    id: 'reject-uppercase-shape',
    verbs: ['VCRUN2019'],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-space-shape', verbs: ['vc run'], catalog: GUARD_CATALOG },
  {
    id: 'reject-leading-equals-shape',
    verbs: ['=rgb'],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-empty-string-shape', verbs: [''], catalog: GUARD_CATALOG },
  {
    id: 'reject-shell-metacharacters',
    verbs: ['vcrun2019;rm'],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-not-in-catalog', verbs: ['dotnet48'], catalog: GUARD_CATALOG },
  {
    id: 'reject-one-of-two-not-in-catalog',
    verbs: ['vcrun2019', 'dotnet48'],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-empty-catalog', verbs: ['vcrun2019'], catalog: [] },
  {
    id: 'reject-hidden-apps-category',
    verbs: ['foobar2000'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'reject-hidden-benchmarks-category',
    verbs: ['3dmark06'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'reject-hidden-annihilate',
    verbs: ['annihilate'],
    catalog: GUARD_CATALOG
  },
  { id: 'reject-hidden-winecfg', verbs: ['winecfg'], catalog: GUARD_CATALOG },
  {
    id: 'reject-hidden-needsgui',
    verbs: ['manualdll'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'reject-hidden-among-visible',
    verbs: ['vcrun2019', 'annihilate'],
    catalog: GUARD_CATALOG
  },
  {
    id: 'apply-exactly-the-maximum',
    verbs: MANY.slice(0, WINETRICKS_APPLY_MAX_VERBS),
    catalog: MANY_CATALOG.slice(0, WINETRICKS_APPLY_MAX_VERBS)
  },
  {
    // the count is checked before the catalog, so an empty catalog still reports the count
    id: 'reject-one-over-the-maximum',
    verbs: MANY,
    catalog: []
  },
  {
    id: 'apply-maximum-entries-with-a-duplicate-counts-entries-not-verbs',
    verbs: [...MANY.slice(0, WINETRICKS_APPLY_MAX_VERBS - 1), MANY[0]],
    catalog: MANY_CATALOG.slice(0, WINETRICKS_APPLY_MAX_VERBS - 1)
  }
]

const METADATA_INPUTS: { id: string; script: string }[] = [
  {
    id: 'metadata-full-block',
    script:
      'w_metadata vcrun2019 dlls \\\n    title="Visual C++" \\\n    publisher="Microsoft" \\\n    year="2019" \\\n    media="download" \\\n    conflicts="vcrun2022 vcrun2017" \\\n    homepage="https://example.invalid/"\n'
  },
  {
    id: 'metadata-single-line-header',
    script: 'w_metadata bad settings\nw_metadata good settings\n'
  },
  {
    id: 'metadata-localised-title-ignored',
    script:
      'w_metadata corefonts fonts \\\n    title="MS fonts" \\\n    title_bg="bulgarian" \\\n    publisher="Microsoft"\n'
  },
  {
    id: 'metadata-crlf',
    script:
      'w_metadata d3dx9 dlls \\\r\n    title="d3dx9" \\\r\n    year="2010"\r\n'
  },
  {
    id: 'metadata-block-ends-without-backslash',
    script:
      'w_metadata a dlls \\\n    title="A"\n    year="2000"\nw_metadata b fonts \\\n    title="B"\n'
  },
  {
    id: 'metadata-unknown-field-skipped',
    script: 'w_metadata a dlls \\\n    colour="red" \\\n    title="A"\n'
  },
  {
    id: 'metadata-fields-outside-a-block-ignored',
    script: '    title="not in a block"\nw_metadata a dlls \\\n    title="A"\n'
  },
  { id: 'metadata-empty-script', script: '' }
]

const NEEDS_GUI_INPUTS: { id: string; script: string }[] = [
  {
    id: 'gui-manual-download-in-load-function',
    script:
      'load_manualdll()\n{\n    w_download_manual https://x.invalid/a a.exe 00\n}\n'
  },
  {
    id: 'gui-plain-download-not-flagged',
    script: 'load_okdll()\n{\n    w_download https://x.invalid/a a.exe 00\n}\n'
  },
  {
    id: 'gui-two-functions-one-flagged',
    script:
      'load_one()\n{\n    w_download_manual https://x.invalid/a a.exe 00\n}\nload_two()\n{\n    w_download https://x.invalid/b b.exe 00\n}\n'
  },
  {
    id: 'gui-manual-download-after-function-closed',
    script:
      'load_one()\n{\n    w_download https://x.invalid/a a.exe 00\n}\n    w_download_manual stray\n'
  },
  {
    id: 'gui-media-field-alone-does-not-flag',
    script:
      'w_metadata gdiplus_winxp dlls \\\n    media="manual_download"\nload_gdiplus_winxp()\n{\n    w_download https://x.invalid/a a.exe 00\n}\n'
  },
  { id: 'gui-empty-script', script: '' }
]

const METADATA_FIXTURE =
  'src/common/winetricks/__tests__/fixtures/winetricks-20260125-next.metadata.sh'
const METADATA_FIXTURE_SAMPLE = [
  'vcrun2019',
  'corefonts',
  'dotnet48',
  'd3dx9',
  'gdiplus_winxp',
  'fontsmooth=rgb'
]

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex')

type Settled<T> = { returned: T } | { threw: string }
function settled<T>(fn: () => T): Settled<T> {
  try {
    return { returned: fn() }
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) }
  }
}

function buildVectors(): Record<string, unknown[]> {
  const metadataOf = (script: string) =>
    [...parseWinetricksMetadata(script).entries()].map(([verb, meta]) => ({
      verb,
      meta
    }))
  const fixtureText = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'common',
      'winetricks',
      '__tests__',
      'fixtures',
      'winetricks-20260125-next.metadata.sh'
    ),
    'utf8'
  )
  const fixtureMap = parseWinetricksMetadata(fixtureText)
  const fixtureEntries = [...fixtureMap.entries()].map(([verb, meta]) => ({
    verb,
    meta
  }))
  return {
    parseWinetricksListAll: LIST_ALL_INPUTS.map((input) => ({
      ...input,
      expected: parseWinetricksListAll(input.chunks)
    })),
    verbShape: VERB_SHAPE_INPUTS.map((input) => ({
      id: `shape-${input === '' ? 'empty' : input}`,
      input,
      expected: VERB_SHAPE_RE.test(input)
    })),
    classifyWinetricksLine: CLASSIFY_INPUTS.map((line, i) => ({
      id: `classify-${String(i).padStart(2, '0')}`,
      line,
      expected: classifyWinetricksLine(line)
    })),
    splitOutputChunk: SPLIT_INPUTS.map((input) => {
      const out = splitOutputChunk(input.remainder, chunkText(input.chunk))
      return {
        ...input,
        // The over-limit tails are long: the vector pins their shape, not their 64 KiB bodies.
        expected: {
          lines: out.lines.map((line) => ({
            length: line.length,
            head: line.slice(0, 3)
          })),
          remainder: {
            length: out.remainder.length,
            head: out.remainder.slice(0, 3)
          }
        }
      }
    }),
    parseWineVersionOutput: WINE_VERSION_INPUTS.map((raw, i) => ({
      id: `wine-version-${String(i).padStart(2, '0')}`,
      raw,
      expected: parseWineVersionOutput(raw)
    })),
    parseUnsupportedWineVersion: UNSUPPORTED_NOTICE_INPUTS.map((line, i) => ({
      id: `unsupported-notice-${String(i).padStart(2, '0')}`,
      line,
      expected: parseUnsupportedWineVersion(line)
    })),
    isUnsupportedWineVersion: UNSUPPORTED_VERSION_INPUTS.map((version) => ({
      id: `unsupported-version-${version === '' ? 'empty' : version}`,
      version,
      expected: isUnsupportedWineVersion(version)
    })),
    assertWinetricksApplyPayload: APPLY_INPUTS.map((input) => {
      const outcome = settled(() =>
        assertWinetricksApplyPayload(input.verbs, input.catalog)
      )
      return {
        ...input,
        expected:
          'returned' in outcome
            ? { accepted: outcome.returned }
            : { rejected: outcome.threw }
      }
    }),
    applyGuardConstants: [
      {
        id: 'WINETRICKS_APPLY_MAX_VERBS',
        expected: WINETRICKS_APPLY_MAX_VERBS
      }
    ],
    isVisibleVerb: VISIBLE_INPUTS.map((input) => ({
      id: `visible-${input.verb}-${input.category}${input.needsGui === undefined ? '' : `-gui-${String(input.needsGui)}`}`,
      ...input,
      expected: isVisibleVerb(input)
    })),
    parseWinetricksMetadata: METADATA_INPUTS.map((input) => ({
      ...input,
      expected: metadataOf(input.script)
    })),
    deriveNeedsGuiVerbs: NEEDS_GUI_INPUTS.map((input) => ({
      ...input,
      expected: [...deriveNeedsGuiVerbs(input.script)].sort()
    })),
    // The committed excerpt of the pinned script: its text stays where it is, the vector names it.
    parseWinetricksMetadataFixture: [
      {
        id: 'metadata-fixture-20260125-next',
        file: METADATA_FIXTURE,
        expected: {
          verbCount: fixtureMap.size,
          entriesSha256: sha256(JSON.stringify(fixtureEntries)),
          needsGui: [...deriveNeedsGuiVerbs(fixtureText)].sort(),
          sampled: METADATA_FIXTURE_SAMPLE.map((verb) => ({
            verb,
            meta: fixtureMap.get(verb) ?? null
          }))
        }
      }
    ]
  }
}

const vectorFile = (): string =>
  join(fixturesRoot(CRATE), 'vectors', 'winetricks_pure.json')

describeSkipOnWindows('Winetricks pure vectors (87-10)', () => {
  it('records the pure parsers, the classifier and the apply guard as vectors', () => {
    const vectors = buildVectors()
    const total = Object.values(vectors).flat().length
    assertAtOrAboveFloor('winetricks pure vectors', total, VECTOR_FLOOR)
    for (const [name, list] of Object.entries(vectors)) {
      const ids = list.map((v) => (v as { id: string }).id)
      expect(new Set(ids).size).toBe(ids.length)
      assertAtOrAboveFloor(`winetricks ${name} vectors`, list.length, 1)
    }
    const text = `${JSON.stringify(vectors, null, 2)}\n`
    const mode = engineWineOracleMode()
    if (mode === 'record') return
    if (mode === 'write') {
      mkdirSync(join(vectorFile(), '..'), { recursive: true })
      writeFileSync(vectorFile(), text)
      return
    }
    expect(text).toBe(readFileSync(vectorFile(), 'utf8'))
    const committed = JSON.parse(readFileSync(vectorFile(), 'utf8')) as Record<
      string,
      unknown[]
    >
    assertAtOrAboveFloor(
      'winetricks committed pure vectors',
      Object.values(committed).flat().length,
      VECTOR_FLOOR
    )
  })

  it('an empty vector list fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('winetricks pure vectors', 0, VECTOR_FLOOR)
    ).toThrow(/below the floor/)
  })

  it('every rejection the apply guard has is represented, plus the accepted shapes', () => {
    const vectors = buildVectors()
    const outcomes = vectors.assertWinetricksApplyPayload as {
      expected: { accepted?: string[]; rejected?: string }
    }[]
    const accepted = outcomes.filter((o) => o.expected.accepted !== undefined)
    const messages = new Set(
      outcomes.map((o) => o.expected.rejected).filter((m) => m !== undefined)
    )
    expect(accepted.length).toBeGreaterThanOrEqual(5)
    // array, empty, over the maximum, non-string, shape, catalog membership, hidden
    expect(messages.size).toBeGreaterThanOrEqual(7)
  })
})
