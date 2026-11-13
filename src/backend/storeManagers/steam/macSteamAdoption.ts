/**
 * Quick 261029-ji2: adopt a GameLib-downloaded native Mac install into Steam by
 * restarting Steam on Play.
 *
 * Why not `steam://install/<appId>` (quick 261029-iwy, dropped): that URL opens
 * Steam's install DIALOG. Adoption only proceeds once a human clicks Install
 * (spikes 047-049 were the operator clicking; the live GameLib run left the
 * dialog off-screen and Steam logged `Installs.CancelInstall`). A running
 * Steam never notices a GameLib-written appmanifest by itself, but a Steam that
 * STARTS after GameLib wrote the files + ACF adopts them at startup with no
 * dialog (spikes 001/003, Phase 23). So Play, when the Steam process that was
 * running at install end has not adopted the game, quits Steam gracefully
 * (`steam://exit`), waits for `steam_osx` to exit, and relaunches through
 * `steam://rungameid/<appId>`.
 *
 * Only installs GameLib downloaded itself ever get a record (games.ts native
 * depot completion branch is the single writer); Steam-performed installs never
 * restart Steam. Steam is never signalled or killed here.
 */
import type { StatusUpdateDeps } from 'backend/appRuntime'
import { existsSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendGameStatusUpdate } from 'backend/utils'
import type { SteamStoresDeps } from './library/installRoot'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import type { Clock, ProcessRunner } from 'backend/process/types'
import type { AppPaths } from 'backend/process/context'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from './localFiles/rustSteamFiles'
import {
  MAC_STEAM_OFFLINE_OWED_FILE,
  type MacSteamOffline
} from './macSteamOffline'

/** Graceful quit is bounded; Steam is never killed. */
export const RESTART_QUIT_TIMEOUT_MS = 30_000
const RESTART_POLL_MS = 500

export interface AcfSnapshot {
  mtimeMs: number
  content: string
  /**
   * Parsed by Rust (`steamfiles_read_acf`) when the snapshot was taken; absent on a baseline
   * persisted before Phase 75; isSteamAdoptedAcf reads such a snapshot as not adopted (DV-75-12).
   */
  stateFlags?: number | null
  buildid?: string
  /**
   * True when the Rust read of this snapshot rejected (timeout, shell restart): the parsed
   * fields are unknown, not "not adopted" (WR-01, 75 review).
   */
  rustReadFailed?: boolean
}

export interface PendingAdoptionRecord {
  /** steam_osx PID that was running when GameLib finished writing the install. */
  steamPid: number
  manifestPath: string
  /** ACF as GameLib wrote it, to tell a Steam rewrite from our own file. */
  baseline: AcfSnapshot
  recordedAt: number
}

/** Structural subset of CacheStore, so tests can pass an in-memory fake. */
export interface PendingAdoptionStore {
  get: (key: string) => unknown
  set: (key: string, value: PendingAdoptionRecord) => void
  delete: (key: string) => void
}

/** The pending-adoption store from the injected steam stores slice. */
export function pendingAdoptionStoreFrom(
  deps: SteamStoresDeps
): PendingAdoptionStore {
  return deps.stores.steam
    .steamPendingAdoptionStore as unknown as PendingAdoptionStore
}

export function recordPendingAdoption(
  appId: string,
  record: PendingAdoptionRecord,
  store: PendingAdoptionStore
): void {
  store.set(appId, record)
}

export function readPendingAdoption(
  appId: string,
  store: PendingAdoptionStore
): PendingAdoptionRecord | undefined {
  try {
    const v = store.get(appId) as Partial<PendingAdoptionRecord> | undefined
    if (!v || typeof v !== 'object') return undefined
    const baseline = v.baseline as Partial<AcfSnapshot> | null | undefined
    if (
      typeof v.steamPid !== 'number' ||
      !Number.isInteger(v.steamPid) ||
      v.steamPid <= 0 ||
      typeof v.manifestPath !== 'string' ||
      !baseline ||
      typeof baseline !== 'object' ||
      typeof baseline.content !== 'string' ||
      typeof baseline.mtimeMs !== 'number'
    ) {
      return undefined
    }
    return {
      steamPid: v.steamPid,
      manifestPath: v.manifestPath,
      baseline: { mtimeMs: baseline.mtimeMs, content: baseline.content },
      recordedAt: typeof v.recordedAt === 'number' ? v.recordedAt : 0
    }
  } catch {
    return undefined
  }
}

export function clearPendingAdoption(
  appId: string,
  store: PendingAdoptionStore
): void {
  try {
    store.delete(appId)
  } catch (err) {
    logWarning(
      `[Steam] could not clear pending adoption for ${appId}: ${String(err)}`,
      LogPrefix.Steam
    )
  }
}

export async function readAcfSnapshot(
  rust: RustInvokeDeps,
  path: string
): Promise<AcfSnapshot | null> {
  let snapshot: AcfSnapshot
  try {
    snapshot = {
      mtimeMs: statSync(path).mtimeMs,
      content: readFileSync(path, 'utf-8')
    }
  } catch {
    return null
  }
  try {
    const read = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path
    })
    const record = read.parsed ? read.record : null
    return {
      ...snapshot,
      stateFlags: record?.stateFlags ?? null,
      buildid: record?.buildid ?? ''
    }
  } catch {
    // Rust unreachable: the parsed fields are unknown. isSteamAdoptedAcf still answers false,
    // but decidePlayAdoption answers 'unknown' rather than 'restart' (WR-01, 75 review).
    return { ...snapshot, stateFlags: null, buildid: '', rustReadFailed: true }
  }
}

/**
 * True when `current` is an ACF Steam itself rewrote: it differs from the
 * baseline GameLib wrote AND carries bit 4 AND a real buildid. A placeholder
 * (StateFlags 2/18, buildid 0) is not adopted yet.
 */
export function isSteamAdoptedAcf(
  baseline: AcfSnapshot | null,
  current: AcfSnapshot | null
): boolean {
  if (!current) return false
  // The Rust-parsed fields captured by readAcfSnapshot. A snapshot without them (persisted
  // before Phase 75) reads not-adopted (DV-75-12).
  if (current.stateFlags === undefined) return false
  const flags = current.stateFlags === null ? NaN : current.stateFlags
  const buildid = current.buildid ?? ''
  const differs =
    !baseline ||
    current.content !== baseline.content ||
    current.mtimeMs !== baseline.mtimeMs
  // Same bitmask as isFullyInstalledStateFlags (library.ts); not imported to
  // keep library.ts's heavy graph out of this module.
  const fullyInstalled = Number.isFinite(flags) && (flags & 4) !== 0
  return differs && fullyInstalled && buildid !== '' && buildid !== '0'
}

/**
 * 'unknown': the record is pending and the running Steam is the one that saw the install, but
 * the current ACF could not be read, so whether Steam adopted it is unknown. Callers take the
 * side-effect-free route (plain launch / delegated uninstall) and keep the record.
 */
type PlayAdoptionDecision =
  | 'launch'
  | 'clear-and-launch'
  | 'restart'
  | 'unknown'

/**
 * Pure Play-time decision. A different PID means Steam restarted since the
 * install and adopted at its own startup; the same PID with an unrewritten ACF
 * means the running Steam has never seen the install.
 */
export function decidePlayAdoption(input: {
  record: PendingAdoptionRecord | undefined
  currentPid: number | null
  currentAcf: AcfSnapshot | null
}): PlayAdoptionDecision {
  const { record, currentPid, currentAcf } = input
  if (!record) return 'launch'
  if (currentPid === null) return 'clear-and-launch'
  if (currentPid !== record.steamPid) return 'clear-and-launch'
  if (currentAcf?.rustReadFailed) return 'unknown'
  if (isSteamAdoptedAcf(record.baseline, currentAcf)) return 'clear-and-launch'
  return 'restart'
}

/**
 * `pgrep -x steam_osx` returning the lowest PID, or null when not running.
 * Isolated half of the two-profile rule: env from createFakeHomeProfile().
 */
export async function probeMacSteamPid(
  deps: { runner: Pick<ProcessRunner, 'run'> },
  timeoutMs = 2000
): Promise<number | null> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-steam-pid-probe-' })
  try {
    const r = await deps.runner.run('/usr/bin/pgrep', ['-x', 'steam_osx'], {
      env: profile.childEnv(),
      replaceEnv: true,
      stdin: '',
      timeoutMs
    })
    if (r.timedOut) throw new Error(`pgrep timed out after ${timeoutMs} ms`)
    if (r.code === 0) {
      const pids = r.stdout
        .split('\n')
        .map((l) => parseInt(l.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
      return pids.length ? Math.min(...pids) : null
    }
    if (r.code === 1) return null
    throw new Error(`pgrep exited ${String(r.code)}`)
  } finally {
    profile.dispose()
  }
}

type RestartResult =
  | { kind: 'relaunched' }
  | { kind: 'game-running'; runningAppId: number }
  | { kind: 'steam-busy' }
  | { kind: 'quit-timeout' }

export interface RestartDeps {
  readRunningAppId: () => Promise<number>
  isOfflineWrapOwed: () => boolean
  isSteamRunning: () => Promise<boolean>
  openUrlDetached: (url: string) => void
  launchRunGameId: () => Promise<unknown>
  emitStatus: (appId: string) => void
  emitDone: (appId: string) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
}

/**
 * The restart deps, built explicitly by the caller (no default): timers come
 * from the clock (unref'd by default), the probe and the detached open from
 * the boot-built Mac Steam instance.
 */
export function createRestartDeps(deps: {
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
  clock: Clock
  paths: Pick<AppPaths, 'appFolder' | 'userHome'>
  macSteamOffline: Pick<MacSteamOffline, 'isSteamRunning' | 'openUrlDetached'>
  launchRunGameId: () => Promise<unknown>
  sendFrontendMessage: StatusUpdateDeps['sendFrontendMessage']
  appRuntime: StatusUpdateDeps['appRuntime']
}): RestartDeps {
  const { clock, macSteamOffline } = deps
  return {
    readRunningAppId: () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { readMacRunningAppId } =
        require('./library/runningPoll') as typeof import('./library/runningPoll')
      /* eslint-enable @typescript-eslint/no-require-imports */
      return readMacRunningAppId({
        paths: deps.paths,
        requestRustInvoke: deps.requestRustInvoke
      })
    },
    // Restarting Steam mid go-offline wrap would bring it online and kick
    // GameLib's CM session, so refuse while the wrap is owed.
    isOfflineWrapOwed: () => {
      return existsSync(join(deps.paths.appFolder, MAC_STEAM_OFFLINE_OWED_FILE))
    },
    isSteamRunning: () => macSteamOffline.isSteamRunning(),
    openUrlDetached: (url) => macSteamOffline.openUrlDetached(url),
    launchRunGameId: deps.launchRunGameId,
    emitStatus: (id) =>
      sendGameStatusUpdate(deps, {
        appName: id,
        runner: 'steam',
        status: 'steam-starting'
      }),
    emitDone: (id) =>
      sendGameStatusUpdate(deps, {
        appName: id,
        runner: 'steam',
        status: 'done'
      }),
    // Bounded by RESTART_QUIT_TIMEOUT_MS; clock timers are unref'd, so no handle
    // holds the sidecar's event loop past stdin EOF.
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        clock.setTimeout(resolve, ms)
      }),
    now: () => clock.now()
  }
}

/**
 * Quit Mac Steam gracefully, wait (bounded) for it to exit, then relaunch via
 * `launchRunGameId`. Never signals Steam. `steam://exit` rather than an
 * osascript quit: Apple Events to Steam raise a macOS Automation TCC prompt.
 */
export async function restartMacSteamForAdoption(
  appId: string,
  deps: RestartDeps
): Promise<RestartResult> {
  const runningAppId = await deps.readRunningAppId()
  if (runningAppId !== 0) {
    logWarning(
      `[Steam] not restarting Steam for ${appId}: game ${runningAppId} is running`,
      LogPrefix.Steam
    )
    return { kind: 'game-running', runningAppId }
  }
  if (deps.isOfflineWrapOwed()) {
    logWarning(
      `[Steam] not restarting Steam for ${appId}: a go-offline wrap is owed`,
      LogPrefix.Steam
    )
    return { kind: 'steam-busy' }
  }

  const startedAt = deps.now()
  const elapsed = () => deps.now() - startedAt
  deps.emitStatus(appId)
  // Steam launches skip launchEventCallback, so nothing else ever sends 'done'.
  try {
    deps.openUrlDetached('steam://exit')
    logInfo(
      `[Steam] fired steam://exit to adopt ${appId} on restart`,
      LogPrefix.Steam
    )

    let exited = false
    while (elapsed() < RESTART_QUIT_TIMEOUT_MS) {
      await deps.sleep(RESTART_POLL_MS)
      // A failed probe is treated as still running.
      const running = await deps.isSteamRunning().catch(() => true)
      if (!running) {
        exited = true
        break
      }
    }
    if (!exited) {
      logWarning(
        `[Steam] Steam did not quit within ${elapsed()} ms; not relaunching ${appId}`,
        LogPrefix.Steam
      )
      return { kind: 'quit-timeout' }
    }

    logInfo(
      `[Steam] Steam exited after ${elapsed()} ms; relaunching ${appId}`,
      LogPrefix.Steam
    )
    await deps.launchRunGameId()
    return { kind: 'relaunched' }
  } finally {
    deps.emitDone(appId)
  }
}
