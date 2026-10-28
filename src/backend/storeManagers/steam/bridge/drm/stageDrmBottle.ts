/**
 * Phase 56 plan 09: the `bottle-stage` DrmStep of steamclient-layer (DRM) mode.
 * Implements D-07, D-11 and D-21.
 *
 * Turns the title's existing per-title TCP-bridge bottle into a DRM-mode
 * bottle, idempotently, on every DRM launch:
 *   1. every GameLib shim steam_api(64).dll is swapped back to the game's own
 *      `.gamelib-orig` original (all or nothing);
 *   2. `gamelib_bridge.cfg` and any Phase 52 forwarder steamclient64.dll are
 *      removed;
 *   3. the genuine Valve DLLs, lsteamclient.dll and the helper steam.exe are
 *      staged into `C:\Program Files (x86)\Steam\`;
 *   4. the `ActiveProcess` registry values are written, current-user hive only.
 *
 * Current-user hive only (D-21): the local-machine hive's Valve Steam key
 * diverts the game into a `steam.exe -applaunch` relaunch (spike 036), so no
 * argv built here ever names it.
 *
 * Nothing here throws: every failure is `drmStepError('bottle-stage', cause)`.
 *
 * The wine `reg add` spawns are the declared real-profile arm of the fake-HOME
 * two-profile rule. They must reach the user's real CrossOver bottle, and they
 * go through `runWineCommand` with no hand-rolled env literal.
 *
 * This module deliberately does not import the older forwarder setup module,
 * so that module can be deleted outright. It carries its own registry builder
 * and drive_c path mapping.
 */
import {
  closeSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { runWineCommand } from 'backend/launcher'
import type { GameSettings } from 'common/types'
import { getBottleDir, sanitizeBottleName } from '../../bottle'
import {
  findRuntimeLoadedSteamApiDlls,
  findUnrealLayout,
  isContainedWithin,
  resolveWalkRoot
} from '../bridgeScan'
import { isGameLibShimBytes, probeOriginalBackup } from '../shimGenerate'
import { restoreBridgeSteamApiOriginals } from '../originalRestore'
import { BRIDGE_CONFIG_FILENAME } from '../bridgeConfig'
import { drmStepError, type DrmStepResult } from './steamclientLayerMode'

// ts-prune-ignore-next
export const DRM_STEAM_DIR_SEGMENTS = ['Program Files (x86)', 'Steam'] as const
// ts-prune-ignore-next
export const DRM_STEAM_DIR_WIN = 'C:\\Program Files (x86)\\Steam'
// ts-prune-ignore-next
export const DRM_STEAMCLIENT64_WIN = DRM_STEAM_DIR_WIN + '\\steamclient64.dll'
// ts-prune-ignore-next
export const DRM_HELPER_WIN = DRM_STEAM_DIR_WIN + '\\steam.exe'
/** Genuine Valve client files (D-06), from the 56-07 cache. */
// ts-prune-ignore-next
export const DRM_VALVE_FILES = [
  'steamclient64.dll',
  'tier0_s64.dll',
  'vstdlib_s64.dll'
] as const
/** Files from the 56-10 steamclient-layer component. */
// ts-prune-ignore-next
export const DRM_COMPONENT_FILES = ['lsteamclient.dll', 'steam.exe'] as const
// ts-prune-ignore-next
export const DRM_REG_ADD_TIMEOUT_MS = 15_000

const ACTIVE_PROCESS_KEY = 'HKCU\\Software\\Valve\\Steam\\ActiveProcess'
const STEAM_KEY = 'HKCU\\Software\\Valve\\Steam'
const ORIGINAL_SUFFIX = '.gamelib-orig'
const MAX_FORWARDER_BYTES = 4 * 1024 * 1024
const MAX_USER_REG_BYTES = 64 * 1024 * 1024

/**
 * The Phase 52 forwarder's version-resource FileDescription, stored UTF-16LE.
 * A steamclient64.dll without it is not ours and is never deleted.
 */
const PHASE52_FORWARDER_MARKER_UTF16 = Buffer.from(
  'GameLib steamclient forwarder',
  'utf16le'
)

/**
 * Four argv arrays (no shell). Throws only inside this pure builder, on a
 * value that could not be a plain Windows drive path.
 */
// ts-prune-ignore-next
export function buildDrmRegistryCommands(): string[][] {
  const add = (key: string, name: string, data: string): string[] => {
    if (
      (data !== 'Public' && !/^[A-Za-z]:\\/.test(data)) ||
      /["\r\n\0]/.test(data)
    ) {
      throw new Error('buildDrmRegistryCommands: invalid registry data')
    }
    return ['reg', 'add', key, '/v', name, '/t', 'REG_SZ', '/d', data, '/f']
  }
  return [
    add(ACTIVE_PROCESS_KEY, 'SteamClientDll64', DRM_STEAMCLIENT64_WIN),
    add(ACTIVE_PROCESS_KEY, 'Universe', 'Public'),
    add(ACTIVE_PROCESS_KEY, 'SteamPath', DRM_STEAM_DIR_WIN),
    add(STEAM_KEY, 'SteamPath', DRM_STEAM_DIR_WIN)
  ]
}

const regEscape = (s: string): string => s.replace(/\\/g, '\\\\')

/**
 * True when a wine user.reg body already holds all four values written by
 * buildDrmRegistryCommands(). Pure; never throws.
 */
// ts-prune-ignore-next
export function drmRegistryStagedInUserReg(text: string): boolean {
  try {
    if (typeof text !== 'string' || text.length > MAX_USER_REG_BYTES) {
      return false
    }
    const sections = new Map<string, Map<string, string>>()
    let current: Map<string, string> | null = null
    for (const line of text.split('\n')) {
      const header = /^\[(.+?)\](\s+\d+)?\s*$/.exec(line)
      if (header) {
        const name = header[1]
        current = sections.get(name) ?? new Map<string, string>()
        sections.set(name, current)
        continue
      }
      const value = /^"([^"]+)"="(.*)"\s*$/.exec(line)
      if (value && current) current.set(value[1], value[2])
    }
    const active = sections.get('Software\\\\Valve\\\\Steam\\\\ActiveProcess')
    const steam = sections.get('Software\\\\Valve\\\\Steam')
    return (
      active?.get('SteamClientDll64') === regEscape(DRM_STEAMCLIENT64_WIN) &&
      active.get('Universe') === 'Public' &&
      active.get('SteamPath') === regEscape(DRM_STEAM_DIR_WIN) &&
      steam?.get('SteamPath') === regEscape(DRM_STEAM_DIR_WIN)
    )
  } catch {
    return false
  }
}

/** True when the bytes carry the Phase 52 forwarder version string. */
// ts-prune-ignore-next
export function isPhase52ForwarderBytes(buf: Buffer): boolean {
  return buf.includes(PHASE52_FORWARDER_MARKER_UTF16)
}

// ts-prune-ignore-next
export type StageDrmBottleInput = {
  appId: string
  bottleName: string
  bottleSettings: GameSettings
  exePath: string
  installRoot: string
  installdir: string
  valveClientDir: string
  componentDir: string
  signal?: AbortSignal
}

// ts-prune-ignore-next
export type StageDrmBottleDeps = {
  getBottleDir?: typeof getBottleDir
  findDlls?: typeof findRuntimeLoadedSteamApiDlls
  findUnreal?: typeof findUnrealLayout
  restoreOriginals?: typeof restoreBridgeSteamApiOriginals
  runReg?: (
    commandParts: string[]
  ) => Promise<{ code?: number; stderr?: string }>
  regTimeoutMs?: number
}

// ts-prune-ignore-next
export type StageDrmBottleOk = {
  steamDirHost: string
  steamDirWin: string
  helperHostPath: string
  helperWinPath: string
  steamClient64WinPath: string
  restored: string[]
  removed: string[]
  foreignSteamClientLeft: string[]
  staged: string[]
  registryWritten: boolean
}

/** Maps a host path inside `<bottle>/drive_c` to its `C:\` path, else null. */
function bottleHostToWinPath(
  bottleDir: string,
  absPath: string
): string | null {
  const driveC = join(resolve(bottleDir), 'drive_c')
  const target = resolve(absPath)
  if (!isContainedWithin(driveC, target)) return null
  return 'C:\\' + relative(driveC, target).split(sep).join('\\')
}

function readHeadCapped(path: string, maxBytes: number): Buffer | null {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(maxBytes)
    const n = readSync(fd, buf, 0, maxBytes, 0)
    return buf.subarray(0, n)
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // already closed
      }
    }
  }
}

type WalkCtx = {
  appId: string
  bottleDir: string
  exePath: string
  installRoot: string
  installdir: string
  signal?: AbortSignal
  deps: StageDrmBottleDeps
}

const relOf = (ctx: WalkCtx, p: string): string =>
  isContainedWithin(ctx.installRoot, p)
    ? relative(ctx.installRoot, p)
    : relative(ctx.bottleDir, p)

async function walkRuntimeDlls(ctx: WalkCtx) {
  const findDlls = ctx.deps.findDlls ?? findRuntimeLoadedSteamApiDlls
  const findUnreal = ctx.deps.findUnreal ?? findUnrealLayout
  const root = resolveWalkRoot(ctx.bottleDir, ctx.exePath, ctx.installRoot)
  const unreal = await findUnreal(ctx.bottleDir, dirname(ctx.exePath))
  return findDlls(root, unreal?.steamworksDir ? [unreal.steamworksDir] : [], {
    isShimBytes: isGameLibShimBytes
  })
}

/**
 * Puts the game's original steam_api(64).dll back over every GameLib shim.
 * Phase A changes nothing and proves every shim has a restorable original;
 * Phase B renames the backups into place.
 * @internal exported for tests
 */
// ts-prune-ignore-next
export async function restoreDrmOriginals(
  ctx: WalkCtx
): Promise<{ ok: true; restored: string[] } | { ok: false; cause: string }> {
  try {
    const shims = (await walkRuntimeDlls(ctx)).filter((d) => d.isGameLibShim)

    for (const d of shims) {
      const st = lstatSync(d.path)
      if (st.isSymbolicLink() || !st.isFile()) {
        return {
          ok: false,
          cause: `live steam_api is not a regular file: ${relOf(ctx, d.path)}`
        }
      }
    }

    let states = shims.map((d) => probeOriginalBackup(ctx.bottleDir, d.path))
    if (states.includes('no-backup')) {
      await (ctx.deps.restoreOriginals ?? restoreBridgeSteamApiOriginals)({
        appId: ctx.appId,
        bottleDir: ctx.bottleDir,
        installRoot: ctx.installRoot,
        installdir: ctx.installdir,
        signal: ctx.signal
      })
      states = shims.map((d) => probeOriginalBackup(ctx.bottleDir, d.path))
    }
    const bad = states.findIndex((s) => s !== 'restorable')
    if (bad !== -1) {
      return {
        ok: false,
        cause: `no restorable original for ${relOf(ctx, shims[bad].path)}`
      }
    }
    // Backups must be plain files too (probe covers symlinks; belt and braces).
    for (const d of shims) {
      const st = lstatSync(d.path + ORIGINAL_SUFFIX)
      if (st.isSymbolicLink() || !st.isFile()) {
        return {
          ok: false,
          cause: `no restorable original for ${relOf(ctx, d.path)}`
        }
      }
    }

    const restored: string[] = []
    try {
      for (const d of shims) {
        if (!isGameLibShimBytes(readFileSync(d.path))) {
          return {
            ok: false,
            cause: `live steam_api changed during swap: ${relOf(ctx, d.path)}`
          }
        }
        if (probeOriginalBackup(ctx.bottleDir, d.path) !== 'restorable') {
          return {
            ok: false,
            cause: `no restorable original for ${relOf(ctx, d.path)}`
          }
        }
        renameSync(d.path + ORIGINAL_SUFFIX, d.path)
        restored.push(relOf(ctx, d.path))
        logInfo(
          `stageDrmBottle: appId ${ctx.appId} restored original ${relOf(ctx, d.path)}`,
          LogPrefix.Steam
        )
      }
    } catch (err) {
      return {
        ok: false,
        cause: `shim swap failed for ${restored.length}: ${String(err)}`
      }
    }
    return { ok: true, restored }
  } catch (err) {
    return { ok: false, cause: `shim swap failed: ${String(err)}` }
  }
}

/**
 * Removes the TCP bridge's `gamelib_bridge.cfg` files and any Phase 52
 * forwarder steamclient64.dll. A steamclient64.dll without the forwarder
 * marker is left in place and reported.
 * @internal exported for tests
 */
// ts-prune-ignore-next
export function removeTcpBridgeArtifacts(
  ctx: Pick<WalkCtx, 'appId' | 'bottleDir' | 'exePath' | 'installRoot'>,
  runtimeDllPaths: string[]
):
  | { ok: true; removed: string[]; foreignSteamClientLeft: string[] }
  | { ok: false; cause: string } {
  const wctx = ctx as WalkCtx
  const exeDir = dirname(ctx.exePath)
  const removed: string[] = []
  const foreign: string[] = []
  try {
    const dllDirs = runtimeDllPaths.map((p) => dirname(p))
    const cfgDirs = new Set(
      [exeDir, join(exeDir, 'compat'), join(exeDir, 'x64'), ...dllDirs].map(
        (d) => resolve(d)
      )
    )
    for (const dir of cfgDirs) {
      const cfg = join(dir, BRIDGE_CONFIG_FILENAME)
      if (!isContainedWithin(ctx.bottleDir, cfg)) continue
      let st
      try {
        st = lstatSync(cfg)
      } catch {
        continue
      }
      if (!st.isFile() && !st.isSymbolicLink()) {
        return {
          ok: false,
          cause: `${BRIDGE_CONFIG_FILENAME} is not a file: ${relOf(wctx, cfg)}`
        }
      }
      unlinkSync(cfg)
      removed.push(relOf(wctx, cfg))
    }

    const fwdDirs = new Set(
      [
        exeDir,
        ...runtimeDllPaths
          .filter((p) => basename(p).toLowerCase() === 'steam_api64.dll')
          .map((p) => dirname(p))
      ].map((d) => resolve(d))
    )
    for (const dir of fwdDirs) {
      const dll = join(dir, 'steamclient64.dll')
      if (!isContainedWithin(ctx.bottleDir, dll)) continue
      let st
      try {
        st = lstatSync(dll)
      } catch {
        continue
      }
      if (st.isSymbolicLink() || !st.isFile()) continue
      const head =
        st.size <= MAX_FORWARDER_BYTES
          ? readHeadCapped(dll, MAX_FORWARDER_BYTES)
          : null
      if (head && isPhase52ForwarderBytes(head)) {
        unlinkSync(dll)
        removed.push(relOf(wctx, dll))
      } else {
        foreign.push(relOf(wctx, dll))
        logWarning(
          `stageDrmBottle: appId ${ctx.appId} left foreign steamclient64.dll in place: ${relOf(wctx, dll)}`,
          LogPrefix.Steam
        )
      }
    }
    return { ok: true, removed, foreignSteamClientLeft: foreign }
  } catch (err) {
    return { ok: false, cause: `artifact cleanup failed: ${String(err)}` }
  }
}

// Internal helpers kept referenced for the orchestration added next.
// ts-prune-ignore-next
export const _internal = {
  bottleHostToWinPath,
  readHeadCapped,
  createHash,
  copyFileSync,
  mkdirSync,
  realpathSync,
  constants,
  drmStepError
}
export type _R = DrmStepResult<StageDrmBottleOk>
