/**
 * Steam poll parity harness (Phase 80, D-14): the timeline and stream types, and the validator.
 *
 * A timeline is one scripted poll scenario. The TS driver (`tsDriver.ts`) runs the real TS loops over
 * it; the Rust replay (gamelib-steampoll, plan 17) runs the same file. Both produce a stream of
 * `StreamRecord`s that is diffed. The format is specified field by field in
 * `src-tauri/crates/gamelib-steampoll/tests/fixtures/timelines/README.md`.
 *
 * Types only plus `parseTimeline`; no imports from the code under test.
 */

type Machine = 'install' | 'uninstall' | 'running' | 'rearm'
type Platform = 'darwin' | 'win32' | 'linux'
type AcfSourceName = 'native' | 'bottle' | 'bridge'

/** The ACF record shape (mirrors steamFilesTypes AcfRecord, without the depots). */
export interface TimelineAcfRecord {
  appid: string | null
  name?: string | null
  installdir: string | null
  stateFlags: number | null
  sizeOnDisk?: string | null
  buildid?: string | null
  bytesDownloaded?: string | null
  bytesToDownload?: string | null
  bytesStaged?: string | null
  bytesToStage?: string | null
  targetBuildId?: string | null
  scheduledAutoUpdate?: string | null
  betaKey?: string | null
}

/** The option object the TS `startInstallPolling` takes (PollOptions, minus `intervalMs`). */
export interface StartOptions {
  source?: AcfSourceName
  isNativeHandoff?: boolean
  macNativeRoute?: boolean
  skippedDepots?: string[]
  delegatedToSteamClient?: boolean
  adoptedBySteamClient?: boolean
  restoredSteamHold?: { pids: number[]; startTicks: number }
  awaitingUpdate?: {
    fromBuild: string
    targetBuild?: string
    installAppRetry?: { libraryPath?: string; attempts: number }
  }
}

interface Roots {
  /** Native library paths (the steamapps dir is `<lib>/steamapps`). */
  native: string[]
  /** The CrossOver bottle's steamapps dir. */
  bottle?: string
  /** The bridge bottle's steamapps dir. */
  bridge?: string
}

interface StartSpec extends StartOptions {
  appId: string
  title: string
  roots: Roots
}

interface StoreSpec {
  /** Persisted restart-hold records present at start (rearm scenarios). */
  restartHold?: Record<
    string,
    {
      pids: Array<{ pid: number; startToken: string }>
      recordedAt: number
      macNativeRoute: boolean
      skippedDepots: string[]
    }
  >
  /** steamMetadataStore entry for the app (drives the bridge-authoritative read). */
  metadata?: {
    mac_arch?: '32' | '64'
    platformsCaptured?: boolean
    is_mac_native?: boolean
  }
  /** bridgeAllowlist.has(appId). */
  bridgeAllowlisted?: boolean
}

export interface Tick {
  /** `{[steamappsDir]: record | null}`; a dir absent from the map is unchanged from the previous tick. */
  acf?: Record<string, TimelineAcfRecord | null>
  /** Live download reading (the monitor's output, not its raw nettop rows); null = no reading. */
  monitor?: {
    bytesDone: number
    bytesTotal: number
    speedBytesPerSec?: number
  } | null
  /** Registry/ps RunningAppID. null = the value is missing (Windows reg query fails). */
  running?: number | null
  /** Steam client pids (listSteamClientPids); null = probe inconclusive. */
  steamPids?: number[] | null
  /** pid -> start token (readSteamProcessStartTokens); null = inconclusive. */
  startTokens?: Record<string, string> | null
  /** The steam-bridge-helper reply (InstallApp retry). */
  helper?: { stdout: string; code: number | null }
  /** `lipo -archs` reply for the post-install Mac arch probe. */
  lipo?: { stdout: string; code: number | null }
  /** gameSession.isNativeInstallInFlight(appId). */
  nativeInFlight?: boolean
  /** The sidecar's ack of this tick's state events (Rust replay only; the TS baseline has no ack). */
  ack?: 'ack' | 'timeout'
  /** isBridgeInstallFinalized(appId). */
  bridgeFinalized?: boolean
  /** A second startInstallPolling call before this tick fires (native-handoff upgrade, adoption). */
  startAgain?: StartOptions
  /** cancelDelegatedInstall(appId) before this tick fires. */
  cancelDelegated?: boolean
  /** running machine: runningPoll.hold(appId) before this tick fires. */
  runningHold?: number
  /** running machine: release a previously taken hold before this tick fires. */
  runningRelease?: { appId: number; terminalSent: boolean }
  /** Run-length: this tick is repeated `repeat` more times with no change (max-tick scenarios). */
  repeat?: number
}

export interface Timeline {
  name: string
  description?: string
  machine: Machine
  platform: Platform
  start: StartSpec
  store?: StoreSpec
  /** Rust replay only: the sidecar becomes READY at this tick (the TS baseline has no queue). */
  sidecarReadyAtTick?: number
  /** The scenario's point is that nothing is emitted (the stream is legitimately empty). */
  expectEmptyStream?: boolean
  ticks: Tick[]
}

export type StreamRecord =
  | { frontend: { channel: string; args: unknown[] } }
  | {
      notify: {
        title: string
        body: string
        key?: string
        default?: string
        params?: Record<string, unknown>
      }
    }
  | { state: { kind: string; [field: string]: unknown } }
  | { file: { op: 'record' | 'clear'; appId: string; record: unknown } }

const MACHINES: Machine[] = ['install', 'uninstall', 'running', 'rearm']
const PLATFORMS: Platform[] = ['darwin', 'win32', 'linux']

function fail(name: string, why: string): never {
  throw new Error(`timeline ${name}: ${why}`)
}

/** Validates the parsed JSON of one timeline file; throws on the first structural problem. */
export function parseTimeline(json: unknown): Timeline {
  if (!json || typeof json !== 'object')
    throw new Error('timeline: not an object')
  const t = json as Record<string, unknown>
  const name = typeof t.name === 'string' ? t.name : '<unnamed>'
  if (typeof t.name !== 'string' || t.name === '') fail(name, 'name missing')
  if (!MACHINES.includes(t.machine as Machine)) fail(name, 'bad machine')
  if (!PLATFORMS.includes(t.platform as Platform)) fail(name, 'bad platform')
  const start = t.start as Record<string, unknown> | undefined
  if (!start || typeof start.appId !== 'string' || !/^\d+$/.test(start.appId)) {
    fail(name, 'start.appId must be a numeric string')
  }
  if (typeof start.title !== 'string') fail(name, 'start.title missing')
  const roots = start.roots as Record<string, unknown> | undefined
  if (!roots || !Array.isArray(roots.native))
    fail(name, 'start.roots.native missing')
  if (!Array.isArray(t.ticks) || t.ticks.length === 0)
    fail(name, 'ticks missing')
  for (const tick of t.ticks as unknown[]) {
    if (!tick || typeof tick !== 'object') fail(name, 'tick is not an object')
    const rep = (tick as Record<string, unknown>).repeat
    if (rep !== undefined && (!Number.isInteger(rep) || (rep as number) < 0)) {
      fail(name, 'tick.repeat must be a non-negative integer')
    }
  }
  return t as unknown as Timeline
}

/** Expands `repeat` run-lengths into one tick per interval. */
export function expandTicks(ticks: Tick[]): Tick[] {
  const out: Tick[] = []
  for (const tick of ticks) {
    const { repeat, ...first } = tick
    out.push(first)
    for (let i = 0; i < (repeat ?? 0); i++) out.push({})
  }
  return out
}
