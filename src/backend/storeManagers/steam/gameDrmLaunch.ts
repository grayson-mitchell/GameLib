import i18next from 'i18next'
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { EnviromentVariable } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { type DrmLaunchForm } from './bottle'
import { appendCxEnvTokens } from './bridge/overlay/overlayLaunch'
import type { EngineSelection } from './engine/engineTypes'
import { type DrmLaunchReady } from './bridge/drm/drmLaunchSetup'
import { type DrmStep } from './bridge/drm/steamclientLayerMode'
import {
  DRM_TRACE_ENV,
  MAX_DRM_TRACE_BYTES,
  parseDrmTraceFile,
  formatDrmTraceLine,
  drmRelogPrefix
} from './bridge/drm/drmTrace'
import { buildDrmPaths, newDrmLaunchId } from './bridge/drm/drmPaths'

// Phase 56 (56-12): steamclient-layer DRM launch helpers.
//
// These helpers are pure, or touch only GameLib's own trace dir. None of them
// throws, and nothing runs at module load (sidecar exit contract).

export type DrmDllPathChannel = 'env' | 'cx_env' | 'not-needed' | 'raw-only'
export type DrmDllOverridesChannel =
  | 'env'
  | 'dll-option'
  | 'cx_env'
  | 'registry'
  | 'raw-only'

// 56-01-SUMMARY.md (.planning/phases/56-*/56-01-SUMMARY.md) records `dllpath_channel: not-needed`.
export const DRM_DLLPATH_CHANNEL: DrmDllPathChannel = 'not-needed'
// 56-01-SUMMARY.md records `dlloverrides_channel: dll-option`: carried as the wrapper's `--dll=<overrides>` argv.
export const DRM_DLLOVERRIDES_CHANNEL: DrmDllOverridesChannel = 'dll-option'

// The Research staging recipe (NotProton compat_run.sh). The genuine
// steamclient64.dll loads native from its full SteamClientDll64 path, and
// lsteamclient loads builtin from the clone.
// ts-prune-ignore-next
export const DRM_DLL_OVERRIDES = 'steamclient=n;steamclient64=n;lsteamclient=b'

export const DRM_TRACE_KEEP_PER_APP = 8
export const DRM_REGISTRY_TIMEOUT_MS = 30000
// lsteamclient.so dlopens $STEAM_COMPAT_CLIENT_INSTALL_PATH/steamclient.dylib
// (spike 043 step 2).
export const MAC_STEAM_CLIENT_SUBPATH = [
  'Library',
  'Application Support',
  'Steam',
  'Steam.AppBundle',
  'Steam',
  'Contents',
  'MacOS'
] as const

// ts-prune-ignore-next
export type DrmLaunchEnvInput = {
  appId: string
  traceFile: string
  macSteamClientDir: string
  steamDirHost: string
  windowsDllDir: string
  unixDllDir: string
  launchForm: DrmLaunchForm
  dllPathChannel: DrmDllPathChannel
  dllOverridesChannel: DrmDllOverridesChannel
  base: readonly EnviromentVariable[]
  // Phase 60 (D-05): overlay CX_ENV tokens merged with the DRM ones.
  overlayTokens?: readonly string[]
}
// ts-prune-ignore-next
export type DrmLaunchEnv =
  | {
      status: 'ok'
      enviromentOptions: EnviromentVariable[]
      commandPrefix: string[]
      registryCommands: string[][]
    }
  | { status: 'error'; cause: string }

// eslint-disable-next-line no-control-regex
const DRM_CONTROL_CHARS = /[\x00-\x1f\x7f]/

export function buildDrmLaunchEnvironment(
  input: DrmLaunchEnvInput
): DrmLaunchEnv {
  try {
    const invalid = (field: string): DrmLaunchEnv => ({
      status: 'error',
      cause: `invalid DRM launch input: ${field}`
    })
    if (typeof input.appId !== 'string' || !/^[0-9]{1,10}$/.test(input.appId)) {
      return invalid('appId')
    }
    const pathFields = [
      'traceFile',
      'macSteamClientDir',
      'steamDirHost',
      'windowsDllDir',
      'unixDllDir'
    ] as const
    for (const field of pathFields) {
      const value = input[field]
      if (
        typeof value !== 'string' ||
        !value.startsWith('/') ||
        DRM_CONTROL_CHARS.test(value)
      ) {
        return invalid(field)
      }
    }
    for (const field of ['steamDirHost', 'windowsDllDir', 'unixDllDir']) {
      if (input[field as 'steamDirHost'].includes(':')) return invalid(field)
    }

    const raw = input.launchForm === 'raw WINELOADER+WINEPREFIX'
    let pathChannel = input.dllPathChannel
    let overridesChannel = input.dllOverridesChannel
    if (pathChannel === 'raw-only') {
      if (!raw) {
        return {
          status: 'error',
          cause: 'channel raw-only needs the raw launch form'
        }
      }
      pathChannel = 'env'
    }
    if (overridesChannel === 'raw-only') {
      if (!raw) {
        return {
          status: 'error',
          cause: 'channel raw-only needs the raw launch form'
        }
      }
      overridesChannel = 'env'
    }

    let env: EnviromentVariable[] = input.base.map((e) => ({ ...e }))
    const getKey = (key: string): string | undefined =>
      env.find((e) => e.key.toLowerCase() === key.toLowerCase())?.value
    const setKey = (key: string, value: string) => {
      env = env.filter((e) => e.key.toLowerCase() !== key.toLowerCase())
      env.push({ key, value })
    }

    setKey(DRM_TRACE_ENV, input.traceFile)
    setKey('SteamGameId', input.appId)
    setKey('SteamAppId', input.appId)
    setKey('STEAM_COMPAT_CLIENT_INSTALL_PATH', input.macSteamClientDir)

    const drmPath = [
      input.steamDirHost,
      input.windowsDllDir,
      input.unixDllDir
    ].join(':')
    const commandPrefix: string[] = []
    const registryCommands: string[][] = []
    const cxTokens: string[] = []

    if (overridesChannel === 'env') {
      const existing = getKey('WINEDLLOVERRIDES') ?? ''
      const ours = new Set(['steamclient', 'steamclient64', 'lsteamclient'])
      const kept: string[] = []
      for (const item of existing.split(';')) {
        if (!item) continue
        const eq = item.indexOf('=')
        const names = (eq === -1 ? item : item.slice(0, eq))
          .split(',')
          .filter((n) => n && !ours.has(n.toLowerCase()))
        if (names.length === 0) continue
        kept.push(
          eq === -1
            ? names.join(',')
            : `${names.join(',')}=${item.slice(eq + 1)}`
        )
      }
      setKey('WINEDLLOVERRIDES', [...kept, DRM_DLL_OVERRIDES].join(';'))
    } else if (overridesChannel === 'dll-option') {
      // 56-01-SUMMARY.md 56-12 item: "Carry steamclient=n;steamclient64=n;lsteamclient=b
      // through the `--dll=<overrides>` option (argv, so `bin/wine --dll=...`)".
      commandPrefix.push('--dll=' + DRM_DLL_OVERRIDES)
    } else if (overridesChannel === 'registry') {
      for (const [name, mode] of [
        ['steamclient', 'native'],
        ['steamclient64', 'native'],
        ['lsteamclient', 'builtin']
      ]) {
        registryCommands.push([
          'reg',
          'add',
          'HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides',
          '/v',
          name,
          '/d',
          mode,
          '/f'
        ])
      }
    } else if (overridesChannel === 'cx_env') {
      cxTokens.push(`WINEDLLOVERRIDES='${DRM_DLL_OVERRIDES}'`)
    }

    if (pathChannel === 'env') {
      const existing = getKey('WINEDLLPATH')
      setKey('WINEDLLPATH', existing ? `${drmPath}:${existing}` : drmPath)
    } else if (pathChannel === 'cx_env') {
      cxTokens.push(`WINEDLLPATH='${drmPath}'`)
    }

    const allCxTokens = [...cxTokens, ...(input.overlayTokens ?? [])]
    if (allCxTokens.length > 0) {
      const merged = appendCxEnvTokens(env, allCxTokens)
      if (merged.status === 'error') return invalid('CX_ENV value')
      env = merged.env
    }

    return {
      status: 'ok',
      enviromentOptions: env,
      commandPrefix,
      registryCommands
    }
  } catch (error) {
    return {
      status: 'error',
      cause: `invalid DRM launch input: ${String(error)}`
    }
  }
}

/**
 * The helper passes this string verbatim to CreateProcessW (56-03), so it is
 * the game's C:\ path, never the Z: mapping.
 */
export function drmBottleWinPath(
  bottleDir: string,
  hostPath: string
): string | null {
  if (
    typeof bottleDir !== 'string' ||
    typeof hostPath !== 'string' ||
    DRM_CONTROL_CHARS.test(bottleDir) ||
    DRM_CONTROL_CHARS.test(hostPath)
  ) {
    return null
  }
  const driveC = resolve(bottleDir, 'drive_c')
  const rel = relative(driveC, resolve(hostPath))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return 'C:\\' + rel.split(sep).join('\\')
}

/** `<id>.log` -> `<id>.wine.log`: the wine child's output beside its trace. */
export function drmWineLogPathFor(traceFile: string): string {
  return traceFile.replace(/\.log$/, '.wine.log')
}

/** GAMELIB_DRM_WINEDEBUG allowlist (T-56-20-01); anything else is ignored. */
export function drmWineDebugFromEnv(
  value: string | undefined
): string | undefined {
  return value !== undefined && /^[A-Za-z0-9_+\-,.]{1,200}$/.test(value)
    ? value
    : undefined
}

/** Synchronous, size-capped (T-56-20-02), 0600 append sink for the wine log. */
export function createDrmWineLogAppender(
  path: string,
  maxBytes: number = 8 * 1024 * 1024
): { write: (chunk: string) => void; close: () => void } {
  let fd: number | null = null
  let written = 0
  let truncated = false
  try {
    fd = openSync(path, 'a', 0o600)
  } catch (error) {
    logWarning(
      `SteamGame: DRM wine log unavailable: ${String(error)}`,
      LogPrefix.Steam
    )
  }
  return {
    write: (chunk: string) => {
      if (fd === null || truncated) return
      try {
        const buf = Buffer.from(chunk, 'utf8')
        if (written + buf.length > maxBytes) {
          const room = Math.max(0, maxBytes - written)
          if (room > 0) writeSync(fd, buf, 0, room)
          writeSync(fd, `\n[gamelib] wine log truncated at ${maxBytes} bytes\n`)
          written = maxBytes
          truncated = true
          return
        }
        writeSync(fd, buf)
        written += buf.length
      } catch {
        truncated = true
      }
    },
    close: () => {
      if (fd === null) return
      try {
        closeSync(fd)
      } catch {
        // nothing to clean up
      }
      fd = null
    }
  }
}

export function prepareDrmTraceFile(
  appFolderPath: string,
  appId: string,
  now: number = Date.now()
):
  | { status: 'ok'; traceFile: string; traceRoot: string }
  | { status: 'error'; cause: string } {
  try {
    const paths = buildDrmPaths(appFolderPath)
    if (!paths)
      return { status: 'error', cause: 'invalid app folder for DRM trace' }
    mkdirSync(paths.traceRoot, { recursive: true, mode: 0o700 })
    if (!lstatSync(paths.traceRoot).isDirectory()) {
      return {
        status: 'error',
        cause: 'trace dir is a symlink or not a directory'
      }
    }
    chmodSync(paths.traceRoot, 0o700)
    const traceFile = paths.traceFile(appId, newDrmLaunchId(now))
    if (!traceFile)
      return { status: 'error', cause: 'invalid DRM trace file name' }

    try {
      // Group `<id>.log` and `<id>.wine.log` by id so orphan wine logs (the
      // game died before writing a trace) are pruned too (CR-03). The
      // `.stage.wine.log` suffix cannot match: `.stage` follows the digits.
      const re = new RegExp(`^${appId}-([0-9]{1,16})(\\.wine)?\\.log$`)
      const byId = new Map<number, string[]>()
      for (const name of readdirSync(paths.traceRoot)) {
        const m = re.exec(name)
        if (!m) continue
        const st = lstatSync(join(paths.traceRoot, name), {
          throwIfNoEntry: false
        })
        if (!st || !st.isFile()) continue
        const id = Number(m[1])
        const names = byId.get(id)
        if (names) names.push(name)
        else byId.set(id, [name])
      }
      const ids = [...byId.keys()].sort((a, b) => b - a)
      for (const id of ids.slice(DRM_TRACE_KEEP_PER_APP - 1)) {
        for (const name of byId.get(id) ?? []) {
          try {
            unlinkSync(join(paths.traceRoot, name))
          } catch (error) {
            logWarning(
              `SteamGame: DRM log removal failed for ${name}: ${String(error)}`,
              LogPrefix.Steam
            )
          }
        }
      }
    } catch (error) {
      logWarning(
        `SteamGame: DRM trace retention failed for appId ${appId}: ${String(error)}`,
        LogPrefix.Steam
      )
    }
    return { status: 'ok', traceFile, traceRoot: paths.traceRoot }
  } catch (error) {
    return { status: 'error', cause: String(error) }
  }
}

export function relogDrmTrace(
  appId: string,
  traceFile: string
):
  | { status: 'relogged'; events: number; rejected: number }
  | { status: 'missing' | 'refused' | 'oversize' | 'error'; detail: string } {
  const notRelogged = (
    status: 'missing' | 'refused' | 'oversize' | 'error',
    detail: string
  ) => {
    logInfo(
      `SteamGame: DRM trace for appId ${appId} not relogged (${status}: ${detail})`,
      LogPrefix.Steam
    )
    return { status, detail } as const
  }
  try {
    const st = lstatSync(traceFile, { throwIfNoEntry: false })
    if (!st) return notRelogged('missing', 'no trace file')
    if (!st.isFile()) return notRelogged('refused', 'not a regular file')
    if (st.size > MAX_DRM_TRACE_BYTES) {
      return notRelogged('oversize', `${st.size} bytes`)
    }
    const parsed = parseDrmTraceFile(readFileSync(traceFile, 'utf8'), appId)
    if (parsed.status === 'oversize')
      return notRelogged('oversize', 'text too large')
    for (const ev of parsed.events) {
      logInfo(drmRelogPrefix(appId) + formatDrmTraceLine(ev), LogPrefix.Steam)
    }
    logInfo(
      `SteamGame: DRM trace for appId ${appId} relogged events=${parsed.events.length} rejected=${parsed.rejected}`,
      LogPrefix.Steam
    )
    return {
      status: 'relogged',
      events: parsed.events.length,
      rejected: parsed.rejected
    }
  } catch (error) {
    return notRelogged('error', String(error))
  }
}

// D-13 (56-12): the [bridge-notice] log line fires on every attempt; the dialog
// and notify fire once per title and failed step per session. A different
// failed step is new information, so it shows again. Keyed `${appId}|${step}`.
export const drmModeNoticeShownThisSession = new Set<string>()

/**
 * Test-only reset for drmModeNoticeShownThisSession — mirrors gameSessionState.ts's
 * `__resetBridgeFailedSessionForTests()` convention. A test that drives
 * maybeNotifyDrmModeFailed records a per-`${appId}|${step}` notice, which
 * would silence the same notice in a later test sharing that key; call this
 * in a `beforeEach`.
 */
export function __resetDrmModeNoticeShownForTests(): void {
  drmModeNoticeShownThisSession.clear()
}

export function engineLabelForLog(sel: EngineSelection): string {
  return sel.kind === 'crossover' ? 'crossover' : `${sel.kind} ${sel.label}`
}

export type DrmWineLaunch = {
  ready: DrmLaunchReady
  gameWinPath: string
  traceFile: string
  anchorLine: string
  macSteamClientDir: string
  // Phase 60 (D-05): overlay CX_ENV tokens for a re-signed DRM clone.
  overlayTokens?: string[]
  // Test seam for the registry-channel branch; defaults to buildDrmLaunchEnvironment.
  buildEnv?: (input: DrmLaunchEnvInput) => DrmLaunchEnv
}

export function drmStepNoticeText(step: DrmStep): string {
  switch (step) {
    case 'steam-not-running':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.steamNotRunning',
        'Mac Steam is not running, and this game needs it. Open Steam, sign in, then press Play again.'
      )
    case 'unsupported-crossover':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.unsupportedCrossover',
        'This game needs a version of CrossOver that GameLib supports. The details name the version you have and the versions GameLib supports.'
      )
    case 'component-missing':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.componentMissing',
        'GameLib could not download the compatibility component this game needs. Check your internet connection, then press Play again.'
      )
    case 'component-verify':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.componentVerify',
        'The compatibility component GameLib downloaded failed its integrity check, so GameLib did not use it.'
      )
    case 'runner-clone':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.runnerClone',
        'GameLib could not prepare its own copy of CrossOver for this game.'
      )
    case 'runner-patch':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.runnerPatch',
        "GameLib could not prepare its own copy of CrossOver for this game, because CrossOver's files did not match what GameLib expects."
      )
    case 'valve-fetch':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.valveFetch',
        'GameLib could not download the Steam client files this game needs from Valve. Check your internet connection, then press Play again.'
      )
    case 'valve-verify':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.valveVerify',
        'The Steam client files downloaded from Valve failed their integrity check, so GameLib did not use them.'
      )
    case 'bottle-stage':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.bottleStage',
        "GameLib could not prepare this game's bottle to run it with its Steam DRM."
      )
    default: {
      const unreachable: never = step
      return String(unreachable)
    }
  }
}
