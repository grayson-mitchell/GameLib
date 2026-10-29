/**
 * Quick 261029-iwy: ask a RUNNING native Mac Steam to adopt a GameLib depot
 * install (spikes 047-049). Firing `open -g steam://install/<appId>` makes
 * Steam overwrite the manifest with a placeholder (buildid "0"), fetch
 * manifests, hash-scan the files, optionally repair (StateFlags 1026 with live
 * bytes) and finally write its own ACF with bit 4 and a real buildid. That
 * rewrite is the only completion signal used here.
 */
import { statSync, readFileSync } from 'fs'
import { parse } from '@node-steam/vdf'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendGameStatusUpdate } from 'backend/utils'
import { spawnOpenDetached } from './macSteamOffline'

export const STEAM_SYNC_TICK_MS = 1000
/** No ACF change for this long means Steam is not adopting. */
export const STEAM_SYNC_IDLE_TIMEOUT_MS = 120_000
/** Hard cap so Play is never disabled forever. */
export const STEAM_SYNC_MAX_MS = 30 * 60_000

export interface AcfSnapshot {
  mtimeMs: number
  content: string
}

export type SteamSyncTick =
  | { kind: 'adopted' }
  | { kind: 'syncing'; percent?: number }
  | { kind: 'timeout' }

interface ClassifyInput {
  baseline: AcfSnapshot | null
  current: AcfSnapshot | null
  nowMs: number
  startedAtMs: number
  lastChangeAtMs: number
}

function parseAppState(content: string): Record<string, unknown> | null {
  try {
    const parsed = parse(content) as { AppState?: Record<string, unknown> }
    return parsed.AppState ?? null
  } catch {
    return null
  }
}

export function classifySteamSyncTick(input: ClassifyInput): SteamSyncTick {
  const { baseline, current, nowMs, startedAtMs, lastChangeAtMs } = input
  let result: SteamSyncTick = { kind: 'syncing' }

  if (current) {
    const state = parseAppState(current.content)
    if (state) {
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
      // Same bitmask as isFullyInstalledStateFlags (library.ts); not imported
      // to keep library.ts's heavy graph out of this module.
      const fullyInstalled = Number.isFinite(flags) && (flags & 4) !== 0
      if (differs && fullyInstalled && buildid !== '' && buildid !== '0') {
        return { kind: 'adopted' }
      }
      if (differs) {
        const done = Number(state.BytesDownloaded)
        const total = Number(state.BytesToDownload)
        if (Number.isFinite(total) && total > 0 && Number.isFinite(done)) {
          const percent = Math.min(
            100,
            Math.max(0, Math.round((done / total) * 100))
          )
          result = { kind: 'syncing', percent }
        }
      }
    }
  }

  if (
    nowMs - startedAtMs >= STEAM_SYNC_MAX_MS ||
    nowMs - lastChangeAtMs >= STEAM_SYNC_IDLE_TIMEOUT_MS
  ) {
    return { kind: 'timeout' }
  }
  return result
}

export interface SteamSyncDeps {
  readSnapshot: (path: string) => AcfSnapshot | null
  fireUrl: (url: string) => void
  emit: (appId: string, context: string) => void
  now: () => number
  sleep: (ms: number) => Promise<void>
  signal?: AbortSignal
}

function defaultDeps(): SteamSyncDeps {
  return {
    readSnapshot: (path) => {
      try {
        return {
          mtimeMs: statSync(path).mtimeMs,
          content: readFileSync(path, 'utf-8')
        }
      } catch {
        return null
      }
    },
    fireUrl: spawnOpenDetached,
    emit: (appId, context) =>
      sendGameStatusUpdate({
        appName: appId,
        runner: 'steam',
        status: 'steam-starting',
        context
      }),
    now: Date.now,
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        // unref: the loop is bounded by STEAM_SYNC_MAX_MS, and no handle may
        // hold the sidecar's event loop past stdin EOF.
        setTimeout(resolve, ms).unref()
      })
  }
}

export async function syncRunningMacSteam(
  appId: string,
  manifestPath: string,
  overrides: Partial<SteamSyncDeps> = {}
): Promise<'adopted' | 'timeout' | 'aborted' | 'skipped'> {
  const deps: SteamSyncDeps = { ...defaultDeps(), ...overrides }

  const baseline = deps.readSnapshot(manifestPath)
  if (!baseline) {
    logWarning(
      `[Steam] running-Steam sync skipped for ${appId}: no manifest at ${manifestPath}`,
      LogPrefix.Steam
    )
    return 'skipped'
  }

  const startedAtMs = deps.now()
  let lastChangeAtMs = startedAtMs
  let previous: AcfSnapshot | null = baseline

  deps.fireUrl(`steam://install/${appId}`)
  logInfo(
    `[Steam] fired steam://install/${appId} at running Mac Steam`,
    LogPrefix.Steam
  )
  deps.emit(appId, '')

  for (;;) {
    await deps.sleep(STEAM_SYNC_TICK_MS)
    if (deps.signal?.aborted) return 'aborted'

    const current = deps.readSnapshot(manifestPath)
    const nowMs = deps.now()
    const changed =
      (current === null) !== (previous === null) ||
      (current !== null &&
        previous !== null &&
        (current.content !== previous.content ||
          current.mtimeMs !== previous.mtimeMs))
    if (changed) lastChangeAtMs = nowMs
    previous = current

    const result = classifySteamSyncTick({
      baseline,
      current,
      nowMs,
      startedAtMs,
      lastChangeAtMs
    })
    const elapsed = nowMs - startedAtMs
    if (result.kind === 'adopted') {
      logInfo(
        `[Steam] Steam adopted ${appId} after ${elapsed} ms`,
        LogPrefix.Steam
      )
      return 'adopted'
    }
    if (result.kind === 'timeout') {
      logWarning(
        `[Steam] Steam did not adopt ${appId} within ${elapsed} ms; falling back to restart hint`,
        LogPrefix.Steam
      )
      return 'timeout'
    }
    deps.emit(appId, result.percent === undefined ? '' : `${result.percent}%`)
  }
}
