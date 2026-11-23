/**
 * The Winetricks oracle (87-10, D-08): the script download, the install lifecycle with its streamed
 * output, the catalog reads, the sequential apply queue and the environment reports, recorded as
 * goldens the Rust `gamelib-wine` winetricks slice later has to reproduce. The DXVK family is
 * `dxvk.oracle.test.ts` and DXMT is `dxmt.oracle.test.ts`.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts and recorder.ts):
 *   GAMELIB_ENGINE_ORACLE=record     write recorded/winetricks/<case>/ (every response is synthetic; no
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
import { utimesSync } from 'fs'
import { join } from 'path'
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
  installAdapter,
  installRecorder,
  oracleMode,
  type SyntheticResponse
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import type { ToolsDeps } from 'backend/tools'
import type {
  GameSettings,
  Runner,
  WinetricksLogLine,
  WineInstallation
} from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'winetricks'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 9

/** One step of a streamed winetricks run. */
type Step = { out: string } | { err: string } | { tick: true }

interface VerbRun {
  code: number | null
  steps?: Step[]
  /** The run rejects with this message, like a spawn error. */
  throws?: string
}

interface WinetricksCase {
  id: string
  op: 'download' | 'install'
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
  run?: VerbRun
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
    const mode = oracleMode()
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
            PATH: '/oracle/bin:/usr/bin',
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
            const alwaysWineBin = wineVersion.bin

            const scripted = [
              ...DEPENDENCIES.map((dependency) =>
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
              ...(c.run
                ? [
                    {
                      program: winetricksProgram,
                      argv: c.umu ? ['winetricks', verb] : ['-q', verb],
                      code: c.run.code,
                      ...(c.run.throws !== undefined
                        ? { throws: c.run.throws }
                        : {
                            stream: async (io: {
                              stdout(text: string): void
                              stderr(text: string): void
                            }) => {
                              // A real install runs for minutes: the fire-and-forget probes have
                              // long settled before its first byte.
                              await settle()
                              for (const step of c.run?.steps ?? []) {
                                if ('out' in step) io.stdout(step.out)
                                else if ('err' in step) io.stderr(step.err)
                                else jest.advanceTimersByTime(1000)
                              }
                            }
                          })
                    }
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

            // The boot's one queue: its environment listener is what pushes a report change.
            mods.queue.createWinetricksQueue({
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

            if (c.installing) toolsState.installing.set(c.installing)

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

            // A run that spawned ends in the ['Done'] event.
            if (c.op === 'install' && c.run && c.run.throws === undefined) {
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
