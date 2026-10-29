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
import { spawn } from 'child_process'
import { existsSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { parse } from '@node-steam/vdf'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendGameStatusUpdate } from 'backend/utils'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  spawnOpenDetached,
  MAC_STEAM_OFFLINE_OWED_FILE
} from './macSteamOffline'

/** Graceful quit is bounded; Steam is never killed. */
export const RESTART_QUIT_TIMEOUT_MS = 30_000
export const RESTART_POLL_MS = 500

export interface AcfSnapshot {
  mtimeMs: number
  content: string
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

function defaultStore(): PendingAdoptionStore {
  // Lazy: keeps electron-store out of module load (nothing runs at import).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { steamPendingAdoptionStore } =
    require('./electronStores') as typeof import('./electronStores')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return steamPendingAdoptionStore as unknown as PendingAdoptionStore
}

export function recordPendingAdoption(
  appId: string,
  record: PendingAdoptionRecord,
  store: PendingAdoptionStore = defaultStore()
): void {
  store.set(appId, record)
}

export function readPendingAdoption(
  appId: string,
  store: PendingAdoptionStore = defaultStore()
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
  store: PendingAdoptionStore = defaultStore()
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

export function readAcfSnapshot(path: string): AcfSnapshot | null {
  try {
    return {
      mtimeMs: statSync(path).mtimeMs,
      content: readFileSync(path, 'utf-8')
    }
  } catch {
    return null
  }
}

function parseAppState(content: string): Record<string, unknown> | null {
  try {
    const parsed = parse(content) as { AppState?: Record<string, unknown> }
    return parsed.AppState ?? null
  } catch {
    return null
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
  const state = parseAppState(current.content)
  if (!state) return false
  const flags = Number(state.StateFlags)
  // @node-steam/vdf parses numeric strings to numbers.
  const buildid =
    typeof state.buildid === 'string' || typeof state.buildid === 'number'
      ? String(state.buildid)
      : ''
  const differs =
    !baseline ||
    current.content !== baseline.content ||
    current.mtimeMs !== baseline.mtimeMs
  // Same bitmask as isFullyInstalledStateFlags (library.ts); not imported to
  // keep library.ts's heavy graph out of this module.
  const fullyInstalled = Number.isFinite(flags) && (flags & 4) !== 0
  return differs && fullyInstalled && buildid !== '' && buildid !== '0'
}

export type PlayAdoptionDecision = 'launch' | 'clear-and-launch' | 'restart'

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
  if (isSteamAdoptedAcf(record.baseline, currentAcf)) return 'clear-and-launch'
  return 'restart'
}

/**
 * `pgrep -x steam_osx` returning the lowest PID, or null when not running.
 * Isolated half of the two-profile rule: env from createFakeHomeProfile().
 */
export async function probeMacSteamPid(
  timeoutMs = 2000
): Promise<number | null> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-steam-pid-probe-' })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<number | null>((resolve, reject) => {
      const child = spawn('/usr/bin/pgrep', ['-x', 'steam_osx'], {
        env: profile.childEnv(),
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      })
      child.unref()
      let out = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString()
      })
      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
        reject(new Error(`pgrep timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      timer.unref()
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          const pids = out
            .split('\n')
            .map((l) => parseInt(l.trim(), 10))
            .filter((n) => Number.isInteger(n) && n > 0)
          resolve(pids.length ? Math.min(...pids) : null)
        } else if (code === 1) resolve(null)
        else reject(new Error(`pgrep exited ${code}`))
      })
    })
  } finally {
    if (timer) clearTimeout(timer)
    profile.dispose()
  }
}

export type RestartResult =
  | { kind: 'relaunched' }
  | { kind: 'game-running'; runningAppId: number }
  | { kind: 'steam-busy' }
  | { kind: 'quit-timeout' }

export interface RestartDeps {
  readRunningAppId: () => number
  isOfflineWrapOwed: () => boolean
  isSteamRunning: () => Promise<boolean>
  openUrlDetached: (url: string) => void
  launchRunGameId: () => Promise<unknown>
  emitStatus: (appId: string) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
}

function defaultRestartDeps(): RestartDeps {
  return {
    readRunningAppId: () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { readRunningAppId } =
        require('./library') as typeof import('./library')
      /* eslint-enable @typescript-eslint/no-require-imports */
      return readRunningAppId()
    },
    // Restarting Steam mid go-offline wrap would bring it online and kick
    // GameLib's CM session, so refuse while the wrap is owed.
    isOfflineWrapOwed: () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { appFolder } =
        require('backend/constants/paths') as typeof import('backend/constants/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      return existsSync(join(appFolder, MAC_STEAM_OFFLINE_OWED_FILE))
    },
    isSteamRunning: async () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { isMacSteamRunning } =
        require('./bridge/drm/drmLaunchSetup') as typeof import('./bridge/drm/drmLaunchSetup')
      /* eslint-enable @typescript-eslint/no-require-imports */
      return isMacSteamRunning()
    },
    openUrlDetached: spawnOpenDetached,
    launchRunGameId: () => Promise.resolve(),
    emitStatus: (id) =>
      sendGameStatusUpdate({
        appName: id,
        runner: 'steam',
        status: 'steam-starting'
      }),
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        // unref: bounded by RESTART_QUIT_TIMEOUT_MS, and no handle may hold
        // the sidecar's event loop past stdin EOF.
        setTimeout(resolve, ms).unref()
      }),
    now: Date.now
  }
}

/**
 * Quit Mac Steam gracefully, wait (bounded) for it to exit, then relaunch via
 * `launchRunGameId`. Never signals Steam. `steam://exit` rather than an
 * osascript quit: Apple Events to Steam raise a macOS Automation TCC prompt.
 */
export async function restartMacSteamForAdoption(
  appId: string,
  overrides: Partial<RestartDeps> = {}
): Promise<RestartResult> {
  const deps: RestartDeps = { ...defaultRestartDeps(), ...overrides }

  const runningAppId = deps.readRunningAppId()
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
}
