/**
 * Steam poll parity harness (Phase 80, D-14): the TS driver.
 *
 * `runTsTimeline(timeline)` runs the REAL TS loops (startInstallPolling, pollInstallOnce,
 * pollUpdateOnce, startUninstallPolling, createRunningPoll, rearmPersistedSteamRestartHolds) over a
 * scripted timeline with fake deps and a fake clock, and returns the normalised output stream.
 *
 * It must run in a Jest suite that wires the module mocks from `./mocks` (see
 * src/backend/__tests__/steamPollTsDriver.test.ts); the loops import the sidecar's module graph, so a
 * bare script cannot load them. No process is spawned and no `env` is built: the runner and the
 * Steam probes are fakes, so there is nothing to isolate (fake-HOME rule).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import i18next from 'i18next'
import type { ManagerDeps } from 'backend/services/types'
import type { RunResult } from 'backend/process/types'
import {
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_RUNNING_APP_ID
} from 'common/types/sidecarTransport'
import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestStores
} from 'backend/testUtils/testServices'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createFakeClock, type FakeClock } from 'backend/testUtils/fakeClock'
import {
  startInstallPolling,
  cancelDelegatedInstall
} from '../../storeManagers/steam/library/installPolling'
import { startUninstallPolling } from '../../storeManagers/steam/library/uninstallPolling'
import {
  createRunningPoll,
  readRunningAppId
} from '../../storeManagers/steam/library/runningPoll'
import { rearmPersistedSteamRestartHolds } from '../../storeManagers/steam/library/resume'
import {
  captureTranslation,
  clearTranslations,
  freshWorld,
  world
} from './mocks'
import {
  expandTicks,
  type StartOptions,
  type StreamRecord,
  type Tick,
  type Timeline,
  type TimelineAcfRecord
} from './timeline'

/** Fixed epoch so recordedAt and probe-interval maths are deterministic. */
const EPOCH_MS = 1_700_000_000_000
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

let i18nReady: Promise<void> | undefined

/** A real i18next over public/locales/en (same ns/defaultNS/fallback options as the sidecar boot). */
function ensureI18n(): Promise<void> {
  i18nReady ??= (async () => {
    const read = (ns: string): Record<string, unknown> =>
      JSON.parse(
        readFileSync(
          join(REPO_ROOT, 'public', 'locales', 'en', `${ns}.json`),
          'utf8'
        )
      ) as Record<string, unknown>
    // The loops call the default export's `t`, so the harness patches that same object.
    /* eslint-disable import-x/no-named-as-default-member */
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      debug: false,
      returnEmptyString: false,
      returnNull: false,
      ns: ['translation', 'gamelib'],
      defaultNS: 'translation',
      resources: {
        en: { translation: read('translation'), gamelib: read('gamelib') }
      }
    })
    const original = i18next.t.bind(i18next) as (...a: unknown[]) => string
    /* eslint-enable import-x/no-named-as-default-member */
    ;(i18next as unknown as { t: unknown }).t = (...args: unknown[]) => {
      const [key, second, third] = args
      const isDefaultString = typeof second === 'string'
      const params = (isDefaultString ? third : second) as
        | Record<string, unknown>
        | undefined
      captureTranslation({
        key: String(key),
        ...(isDefaultString ? { default: second } : {}),
        ...(params && typeof params === 'object' ? { params } : {})
      })
      return original(...args)
    }
  })()
  return i18nReady
}

function installGlobalClock(clock: FakeClock): () => void {
  const g = globalThis as unknown as Record<string, unknown>
  const original = {
    setInterval: g.setInterval,
    clearInterval: g.clearInterval,
    now: Date.now
  }
  g.setInterval = (fn: () => void, ms: number) => {
    const handle = clock.setInterval(fn, ms)
    return { unref: () => undefined, ref: () => undefined, __handle: handle }
  }
  g.clearInterval = (t: { __handle?: Parameters<FakeClock['clear']>[0] }) => {
    if (t?.__handle) clock.clear(t.__handle)
  }
  Date.now = () => EPOCH_MS + clock.now()
  return () => {
    g.setInterval = original.setInterval
    g.clearInterval = original.clearInterval
    Date.now = original.now
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise<void>((r) => setImmediate(r))
}

type AcfRecordFull = {
  appid: string | null
  name: string | null
  installdir: string | null
  stateFlags: number | null
  stateFlagsRaw: string | null
  sizeOnDisk: string | null
  buildid: string | null
  lastOwner: string | null
  bytesDownloaded: string | null
  bytesToDownload: string | null
  bytesStaged: string | null
  bytesToStage: string | null
  targetBuildId: string | null
  scheduledAutoUpdate: string | null
  betaKey: string | null
  installedDepots: never[]
}

function fullRecord(r: TimelineAcfRecord): AcfRecordFull {
  return {
    appid: r.appid,
    name: r.name ?? null,
    installdir: r.installdir,
    stateFlags: r.stateFlags,
    stateFlagsRaw: r.stateFlags === null ? null : String(r.stateFlags),
    sizeOnDisk: r.sizeOnDisk ?? null,
    buildid: r.buildid ?? null,
    lastOwner: null,
    bytesDownloaded: r.bytesDownloaded ?? null,
    bytesToDownload: r.bytesToDownload ?? null,
    bytesStaged: r.bytesStaged ?? null,
    bytesToStage: r.bytesToStage ?? null,
    targetBuildId: r.targetBuildId ?? null,
    scheduledAutoUpdate: r.scheduledAutoUpdate ?? null,
    betaKey: r.betaKey ?? null,
    installedDepots: []
  }
}

/** The fake rustInvoke: answers the steamfiles ops the loops call from the timeline's ACF map. */
function fakeRustInvoke(appId: string) {
  return (channel: string, argv: readonly unknown[]): Promise<unknown> => {
    const args = argv[0] as Record<string, unknown>
    const w = world.current
    if (channel === RUST_STEAMFILES_FIND_ACF) {
      for (const dir of args.steamappsDirs as string[]) {
        const rec = w.acf.get(dir)
        if (rec && rec.appid === (args.appId as string)) {
          return Promise.resolve({
            found: true,
            steamappsDir: dir,
            record: fullRecord(rec)
          })
        }
      }
      return Promise.resolve({ found: false, steamappsDir: null, record: null })
    }
    if (channel === RUST_STEAMFILES_READ_ACF) {
      const path = args.path as string
      const m = /^(.*)[\\/]appmanifest_(\d+)\.acf$/.exec(path)
      const rec = m ? w.acf.get(m[1]!) : undefined
      if (rec && rec.appid === m![2]) {
        return Promise.resolve({
          exists: true,
          parsed: true,
          readError: null,
          record: fullRecord(rec)
        })
      }
      return Promise.resolve({
        exists: false,
        parsed: false,
        readError: null,
        record: null
      })
    }
    if (channel === RUST_STEAMFILES_READ_RUNNING_APP_ID) {
      return Promise.resolve({ runningAppId: w.running ?? 0 })
    }
    void appId
    return Promise.reject(new Error(`unstubbed steamfiles channel ${channel}`))
  }
}

function fakeRunner(helperPath: string) {
  const ok = (stdout: string, code: number | null): RunResult =>
    ({
      stdout,
      stderr: '',
      code,
      timedOut: false,
      truncated: false
    }) as unknown as RunResult
  return {
    run: (file: string): Promise<RunResult> => {
      const w = world.current
      if (file === helperPath)
        return Promise.resolve(ok(w.helper.stdout, w.helper.code))
      if (file === 'reg') {
        return Promise.resolve(
          w.running === null
            ? ok('', 1)
            : ok(
                `    RunningAppID    REG_DWORD    0x${w.running.toString(16)}\r\n`,
                0
              )
        )
      }
      if (file === 'ps') {
        return Promise.resolve(
          ok(w.running ? `reaper SteamLaunch --AppId ${w.running}\n` : '', 0)
        )
      }
      return Promise.resolve(ok('', 1))
    }
  }
}

function applyTick(tick: Tick): void {
  const w = world.current
  if (tick.acf) {
    for (const [dir, rec] of Object.entries(tick.acf)) w.acf.set(dir, rec)
  }
  if (tick.running !== undefined) w.running = tick.running
  if (tick.steamPids !== undefined) w.steamPids = tick.steamPids
  if (tick.startTokens !== undefined) w.startTokens = tick.startTokens
  if (tick.helper) w.helper = tick.helper
  if (tick.lipo) w.lipo = tick.lipo
  if (tick.nativeInFlight !== undefined) w.nativeInFlight = tick.nativeInFlight
  if (tick.bridgeFinalized !== undefined)
    w.bridgeFinalized = tick.bridgeFinalized
}

/** Post-processing: updateDone.completed is true when the poll went on to report `updating`. */
function finalizeStream(stream: StreamRecord[]): StreamRecord[] {
  stream.forEach((rec, i) => {
    if ('state' in rec && rec.state.kind === 'updateDone') {
      const next = stream[i + 1]
      rec.state.completed =
        !!next &&
        'frontend' in next &&
        next.frontend.channel === 'gameStatusUpdate' &&
        (next.frontend.args[0] as { status?: string } | undefined)?.status ===
          'updating'
    }
  })
  return stream
}

/** What the TS loops left behind in the sidecar's library, for handler parity (D-14). */
export interface TsSnapshot {
  /** The library entry the run was seeded with. */
  initial: unknown
  /** Library values at the end of the run. */
  library: unknown[]
  /** The last `steamLibraryStore.set('games', ...)` value, undefined when never written. */
  games: unknown
}

/** Runs one timeline through the real TS loops and returns the normalised stream. */
export async function runTsTimeline(
  timeline: Timeline
): Promise<StreamRecord[]> {
  return (await runTsTimelineWithSnapshot(timeline)).stream
}

/** Like `runTsTimeline`, plus the final library / store snapshot. */
export async function runTsTimelineWithSnapshot(
  timeline: Timeline
): Promise<{ stream: StreamRecord[]; snapshot: TsSnapshot }> {
  await ensureI18n()
  world.current = freshWorld()
  clearTranslations()
  const w = world.current
  const { start } = timeline
  const { appId } = start
  const ticks = expandTicks(timeline.ticks)
  const nativeLibs = start.roots.native
  w.platform = timeline.platform
  w.libraries = nativeLibs
  w.bottleDir = start.roots.bottle
  w.bridgeDir = start.roots.bridge
  w.bridgeAllowlisted = timeline.store?.bridgeAllowlisted ?? false

  let storeGames: unknown
  // Stores: Map-backed, restart-hold writes recorded as file records.
  const holdMap = new Map<string, unknown>(
    Object.entries(timeline.store?.restartHold ?? {})
  )
  const metadata = new Map<string, unknown>()
  if (timeline.store?.metadata) metadata.set(appId, timeline.store.metadata)
  const steamStores = {
    steamLibraryStore: {
      get: () => undefined,
      set: (_k: string, v: unknown) => {
        storeGames = v
      }
    },
    steamMetadataStore: {
      get: (k: string) => metadata.get(k),
      set: (k: string, v: unknown) => void metadata.set(k, v),
      entries: () => [...metadata.entries()]
    },
    steamSyncStore: { get: () => undefined, set: () => undefined },
    configStore: {
      get: () => undefined,
      get_nodefault: () => undefined,
      set: () => undefined,
      clear: () => undefined
    },
    steamRestartHoldStore: {
      get: (k: string) => holdMap.get(k),
      set: (k: string, v: unknown) => {
        holdMap.set(k, v)
        w.stream.push({ file: { op: 'record', appId: k, record: v } })
      },
      delete: (k: string) => {
        holdMap.delete(k)
        w.stream.push({ file: { op: 'clear', appId: k, record: null } })
      },
      entries: () => [...holdMap.entries()]
    }
  }

  const clock = createFakeClock(0)
  const restore = installGlobalClock(clock)
  try {
    const helperPath = process.execPath
    const paths = createTestAppPaths('/fake/gamelib', {
      steamBridgeHelperPath: helperPath
    })
    const runner = fakeRunner(helperPath)
    const requestRustInvoke = fakeRustInvoke(appId)

    const base = createTestManagerDeps()
    const library = base.steamSession.libraryState.library
    const installed = timeline.machine === 'uninstall'
    const seedEntry = {
      app_name: appId,
      runner: 'steam',
      title: start.title,
      is_installed: installed,
      install: installed
        ? {
            install_path: join(
              nativeLibs[0]!,
              'steamapps',
              'common',
              'TestGame'
            ),
            install_size: '1.00 MiB',
            platform: 'Mac'
          }
        : {}
    }
    const initial = JSON.parse(JSON.stringify(seedEntry)) as unknown
    library.set(appId, seedEntry as never)
    // Observe sidecar-state writes: library.set of a resolved install => `installed` / `uninstalled`.
    const rawSet = library.set.bind(library)
    library.set = (key, value) => {
      const result = rawSet(key, value)
      const info = value as {
        is_installed?: boolean
        install?: { install_path?: string }
      }
      if (timeline.machine !== 'uninstall' && info.is_installed === true) {
        const found = findRecordFor(info.install?.install_path)
        const poll = deps.steamInstallRuntime.polls.activePolls.get(key)
        w.stream.push({
          state: {
            kind: 'installed',
            appId: key,
            source: poll?.source ?? start.source ?? 'native',
            installPath: info.install?.install_path ?? '',
            sizeOnDisk: found?.record.sizeOnDisk ?? '0',
            buildid: found?.record.buildid ?? null
          }
        })
      } else if (timeline.machine === 'uninstall') {
        const poll =
          deps.steamInstallRuntime.uninstallPolls.activeUninstallPolls
        void poll
        if (info.is_installed === true) {
          const found = findRecordFor(info.install?.install_path)
          w.stream.push({
            state: {
              kind: 'uninstalled',
              appId: key,
              source: start.source ?? 'native',
              survivor: {
                source: found?.source ?? 'native',
                installPath: info.install?.install_path ?? '',
                sizeOnDisk: found?.record.sizeOnDisk ?? '0',
                buildid: found?.record.buildid ?? null
              }
            }
          })
        } else {
          w.stream.push({
            state: {
              kind: 'uninstalled',
              appId: key,
              source: start.source ?? 'native',
              survivor: null
            }
          })
        }
      }
      return result
    }

    const findRecordFor = (
      installPath: string | undefined
    ): { record: TimelineAcfRecord; source: string } | undefined => {
      if (!installPath) return undefined
      const candidates: Array<[string, string]> = [
        ...nativeLibs.map((l): [string, string] => [
          join(l, 'steamapps'),
          'native'
        ]),
        ...(start.roots.bottle
          ? [[start.roots.bottle, 'bottle'] as [string, string]]
          : []),
        ...(start.roots.bridge
          ? [[start.roots.bridge, 'bridge'] as [string, string]]
          : [])
      ]
      for (const [dir, source] of candidates) {
        const record = w.acf.get(dir)
        if (record && installPath.startsWith(join(dir, 'common'))) {
          return { record, source }
        }
      }
      return undefined
    }

    const gameSession = {
      ...base.steamSession.gameSession,
      isNativeInstallInFlight: () => w.nativeInFlight
    }
    const polls = base.steamInstallRuntime.polls
    polls.isBridgeInstallFinalized = () => w.bridgeFinalized
    const monitor: { reading: Tick['monitor'] } = { reading: null }
    const deps: ManagerDeps = createTestManagerDeps({
      requestRustInvoke: requestRustInvoke as never,
      sendFrontendMessage: ((channel: string, ...args: unknown[]) => {
        // pushGameToLibrary is the sidecar's own push (covered by the state records, R2).
        if (channel === 'pushGameToLibrary') return
        w.stream.push({ frontend: { channel, args } })
      }) as never,
      steamBottle: {
        getSteamBottleSettings: () => ({ wineCrossoverBottle: 'BOTTLE' })
      } as never,
      steamProcesses: createInertSteamProcesses({
        downloadMonitor: {
          start: () => Promise.resolve(),
          read: () => monitor.reading ?? undefined,
          stop: () => undefined,
          stopAll: () => undefined
        }
      }),
      stores: createTestStores({ steam: steamStores as never }),
      steamSession: { ...base.steamSession, gameSession },
      steamInstallRuntime: base.steamInstallRuntime,
      runner: runner as never,
      clock,
      paths
    })

    const runningDeps = {
      runner,
      paths: { userHome: '/fake/home' },
      requestRustInvoke
    }
    const running =
      timeline.machine === 'running'
        ? createRunningPoll({
            clock,
            readRunningAppId: () =>
              readRunningAppId(runningDeps as never, timeline.platform),
            notify: (id, status) =>
              w.stream.push({
                frontend: {
                  channel: 'gameStatusUpdate',
                  args: [{ appName: String(id), runner: 'steam', status }]
                }
              })
          })
        : undefined
    const releases = new Map<number, (terminalSent: boolean) => void>()

    const startOptions = (o: StartOptions): StartOptions => ({ ...o })
    const toPollOptions = (o: StartOptions) => ({
      intervalMs: 3000,
      ...startOptions(o)
    })

    const first = expandTicks(timeline.ticks)[0] ?? {}
    applyTick(first)
    monitor.reading = first.monitor ?? null

    const { appId: _appId, title: _title, roots: _roots, ...startOpts } = start
    void _appId
    void _title
    void _roots
    if (timeline.machine === 'install') {
      await startInstallPolling(deps, appId, toPollOptions(startOpts))
    } else if (timeline.machine === 'uninstall') {
      await startUninstallPolling(deps, appId, toPollOptions(startOpts))
    } else if (timeline.machine === 'rearm') {
      await rearmPersistedSteamRestartHolds(deps)
      await flush()
    } else if (running) {
      running.start(5000)
    }

    const intervalMs = timeline.machine === 'running' ? 5000 : 3000
    for (const [index, tick] of ticks.entries()) {
      if (index > 0) {
        applyTick(tick)
        if (tick.monitor !== undefined) monitor.reading = tick.monitor
      }
      if (tick.startAgain) {
        await startInstallPolling(deps, appId, toPollOptions(tick.startAgain))
      }
      if (tick.cancelDelegated) await cancelDelegatedInstall(deps, appId)
      if (running && tick.runningHold !== undefined) {
        releases.set(tick.runningHold, running.hold(tick.runningHold))
      }
      if (running && tick.runningRelease) {
        releases.get(tick.runningRelease.appId)?.(
          tick.runningRelease.terminalSent
        )
      }
      clock.advance(intervalMs)
      await flush()
    }
    return {
      stream: finalizeStream(world.current.stream),
      snapshot: {
        initial,
        library: JSON.parse(JSON.stringify([...library.values()])) as unknown[],
        games:
          storeGames === undefined
            ? undefined
            : JSON.parse(JSON.stringify(storeGames))
      }
    }
  } finally {
    restore()
  }
}
