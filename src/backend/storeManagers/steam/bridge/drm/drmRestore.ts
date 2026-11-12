/**
 * The restore half of the `bottle-stage` DrmStep: puts the game's own
 * steam_api(64).dll back over every GameLib shim, and removes the TCP bridge's
 * config files and any Phase 52 forwarder steamclient64.dll.
 */
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  findRuntimeLoadedSteamApiDlls,
  findUnrealLayout,
  isContainedWithin,
  resolveWalkRoot
} from '../bridgeScan'
import { isGameLibShimBytes, probeOriginalBackup } from '../shimOriginals'
import { restoreBridgeSteamApiOriginals } from '../originalRestore'
import { BRIDGE_CONFIG_FILENAME } from '../bridgeConfig'
import { isPhase52ForwarderBytes } from './drmRegistry'
import type { DownloadSteamDepotsOpts } from '../../depot/planModel'
import type { StageDrmBottleDeps } from './stageDrmTypes'

const ORIGINAL_SUFFIX = '.gamelib-orig'
const MAX_FORWARDER_BYTES = 4 * 1024 * 1024

/** Maps a host path inside `<bottle>/drive_c` to its `C:\` path, else null. */
export function bottleHostToWinPath(
  bottleDir: string,
  absPath: string
): string | null {
  const driveC = join(resolve(bottleDir), 'drive_c')
  const target = resolve(absPath)
  if (!isContainedWithin(driveC, target)) return null
  return 'C:\\' + relative(driveC, target).split(sep).join('\\')
}

export function readHeadCapped(path: string, maxBytes: number): Buffer | null {
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

export type WalkCtx = {
  installRuntime: DownloadSteamDepotsOpts['installRuntime']
  steamUser: DownloadSteamDepotsOpts['steamUser']
  config: DownloadSteamDepotsOpts['config']
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

export async function walkRuntimeDlls(ctx: WalkCtx) {
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
        installRuntime: ctx.installRuntime,
        steamUser: ctx.steamUser,
        config: ctx.config,
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
        cause: `no restorable original for ${relOf(ctx, shims[bad]?.path ?? '')}`
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
export function removeTcpBridgeArtifacts(
  ctx: Pick<WalkCtx, 'appId' | 'bottleDir' | 'exePath' | 'installRoot'>,
  runtimeDllPaths: string[],
  extraExeDirs: string[] = []
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
      [
        exeDir,
        join(exeDir, 'compat'),
        join(exeDir, 'x64'),
        ...extraExeDirs,
        ...dllDirs
      ].map((d) => resolve(d))
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
        ...extraExeDirs,
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
