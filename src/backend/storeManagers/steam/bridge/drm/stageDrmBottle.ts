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
import { execFile } from 'node:child_process'
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
 * The helper steam.exe / lsteamclient rewrite SteamPath with a trailing
 * backslash after staging. That is the same directory, so it must not count as
 * "not staged": a needless `reg add` starts a fresh wine session whose
 * wineboot --init can hang on a crashing winebus (debug
 * drm-second-launch-bottle-stage).
 */
const sameSteamPath = (v: string | undefined): boolean =>
  v !== undefined &&
  v.replace(/(\\\\)+$/, '').toLowerCase() ===
    regEscape(DRM_STEAM_DIR_WIN).toLowerCase()

/**
 * Names (`<section>:<value>`) of the four values buildDrmRegistryCommands()
 * writes that are missing or different in a wine user.reg body; [] when fully
 * staged. Pure; never throws (an unreadable body reports `user.reg:unparseable`).
 */
// ts-prune-ignore-next
export function drmRegistryMismatches(text: string): string[] {
  try {
    if (typeof text !== 'string' || text.length > MAX_USER_REG_BYTES) {
      return ['user.reg:unparseable']
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
    const activeName = 'Software\\\\Valve\\\\Steam\\\\ActiveProcess'
    const steamName = 'Software\\\\Valve\\\\Steam'
    const active = sections.get(activeName)
    const steam = sections.get(steamName)
    const out: string[] = []
    if (active?.get('SteamClientDll64') !== regEscape(DRM_STEAMCLIENT64_WIN)) {
      out.push(`${activeName}:SteamClientDll64`)
    }
    if (active?.get('Universe') !== 'Public') {
      out.push(`${activeName}:Universe`)
    }
    if (!sameSteamPath(active?.get('SteamPath'))) {
      out.push(`${activeName}:SteamPath`)
    }
    if (!sameSteamPath(steam?.get('SteamPath'))) {
      out.push(`${steamName}:SteamPath`)
    }
    return out
  } catch {
    return ['user.reg:unparseable']
  }
}

/**
 * True when a wine user.reg body already holds all four values written by
 * buildDrmRegistryCommands(). Pure; never throws.
 */
// ts-prune-ignore-next
export function drmRegistryStagedInUserReg(text: string): boolean {
  return drmRegistryMismatches(text).length === 0
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
  /** Live wine processes of the bottle, logged on a reg add timeout. */
  listBottleProcesses?: (bottleDir: string) => Promise<string[]>
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

const MAX_SOURCE_BYTES = 256 * 1024 * 1024
const STAGE_TMP_SUFFIX = '.gamelib-stage-tmp'

const sha256 = (p: string): string =>
  createHash('sha256').update(readFileSync(p)).digest('hex')

function lstatOrNull(p: string) {
  try {
    return lstatSync(p)
  } catch {
    return null
  }
}

/** A source is a regular, non-symlink, non-empty, bounded file starting 'MZ'. */
function sourceOk(path: string): boolean {
  const st = lstatOrNull(path)
  if (!st || st.isSymbolicLink() || !st.isFile()) return false
  if (st.size <= 0 || st.size > MAX_SOURCE_BYTES) return false
  const head = readHeadCapped(path, 2)
  return head !== null && head.length === 2 && head.toString('latin1') === 'MZ'
}

/**
 * `<pid>:<pcpu>:<basename>` for processes whose command line mentions the
 * bottle or the DRM runners. The basename is cut at the first `.exe` or wine
 * binary name, never by splitting on spaces (paths hold "Application Support").
 */
async function defaultListBottleProcesses(
  bottleDir: string
): Promise<string[]> {
  const stdout = await new Promise<string>((resolveOut) => {
    execFile(
      '/bin/ps',
      ['-axww', '-o', 'pid=,pcpu=,command='],
      { timeout: 3000, maxBuffer: 4 * 1024 * 1024 },
      (error, out) => resolveOut(error ? '' : String(out))
    )
  })
  const entries: string[] = []
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+([\d.]+)\s+(.*)$/.exec(line)
    if (!m) continue
    const command = m[3]
    if (
      !command.includes(bottleDir) &&
      !command.includes('steam-bridge/drm/runners/')
    ) {
      continue
    }
    const exe =
      /([^/\\]+?\.exe)(?=\s|$)/i.exec(command)?.[1] ??
      /([^/\\\s]*wine[^/\\\s]*)(?=\s|$)/i.exec(command)?.[1] ??
      'unknown'
    entries.push(`${m[1]}:${m[2]}:${exe}`)
  }
  return entries
}

async function runRegArgv(
  commands: string[][],
  run: NonNullable<StageDrmBottleDeps['runReg']>,
  timeoutMs: number
): Promise<string | null> {
  for (const commandParts of commands) {
    const valueName = commandParts[4]
    // The timer is unref'd (sidecar exit contract, half 1) and cleared once the
    // race settles.
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout('timeout'), timeoutMs)
      timer.unref?.()
    })
    try {
      const res = await Promise.race([run(commandParts), timeout])
      if (res === 'timeout') {
        return `reg add ${valueName} timed out after ${timeoutMs} ms`
      }
      if (res.code !== 0) {
        return `reg add ${valueName} failed code=${String(res.code)} stderr=${String(res.stderr ?? '').slice(0, 120)}`
      }
    } catch (err) {
      return `reg add ${valueName} failed: ${String(err)}`
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return null
}

/**
 * Stages a DRM-mode bottle from the title's existing bridge bottle. Never
 * throws; every failure is a `bottle-stage` DrmStepError.
 */
// ts-prune-ignore-next
export async function stageDrmBottle(
  input: StageDrmBottleInput,
  deps: StageDrmBottleDeps = {}
): Promise<DrmStepResult<StageDrmBottleOk>> {
  const fail = (cause: unknown) => drmStepError('bottle-stage', cause)
  try {
    // 1. Validate (no writes).
    if (!/^\d+$/.test(input.appId)) return fail('invalid appId')
    const name = sanitizeBottleName(input.bottleName)
    if (!name) return fail('invalid bottle name')
    const bottleDir = resolve((deps.getBottleDir ?? getBottleDir)(name))
    const driveC = join(bottleDir, 'drive_c')
    const exePath = resolve(input.exePath)
    const installRoot = resolve(input.installRoot)
    if (!isContainedWithin(driveC, exePath) || !/\.exe$/i.test(exePath)) {
      return fail('exe outside bottle drive_c')
    }
    if (!isContainedWithin(driveC, installRoot)) {
      return fail('install root outside bottle drive_c')
    }
    if (input.signal?.aborted) return fail('aborted')

    // 2. Steam dir pre-checks (no writes).
    const pf86 = join(driveC, DRM_STEAM_DIR_SEGMENTS[0])
    const pf86Stat = lstatOrNull(pf86)
    if (!pf86Stat || pf86Stat.isSymbolicLink() || !pf86Stat.isDirectory()) {
      return fail('bottle is not a 64-bit prefix (no Program Files (x86))')
    }
    const steamDirHost = join(pf86, DRM_STEAM_DIR_SEGMENTS[1])
    const steamStat = lstatOrNull(steamDirHost)
    if (steamStat) {
      if (steamStat.isSymbolicLink() || !steamStat.isDirectory()) {
        return fail('Steam dir is a symlink or not a directory')
      }
      if (
        !isContainedWithin(realpathSync(driveC), realpathSync(steamDirHost))
      ) {
        return fail('Steam dir resolves outside bottle drive_c (symlink)')
      }
      if (lstatOrNull(join(steamDirHost, 'steamui.dll'))) {
        return fail(
          'bottle has a Steam client install (steamui.dll); refusing to overwrite it'
        )
      }
    }

    // 3. Source pre-checks (no writes). Shas are not re-verified here: 56-07
    // checks the Valve files against the manifest sha2 and 56-10 checks the
    // component against its pinned shas.
    const sources: { name: string; src: string }[] = [
      ...DRM_VALVE_FILES.map((n) => ({
        name: n as string,
        src: join(input.valveClientDir, n)
      })),
      ...DRM_COMPONENT_FILES.map((n) => ({
        name: n as string,
        src: join(input.componentDir, n)
      }))
    ]
    for (const s of sources) {
      if (!sourceOk(s.src)) {
        return fail(`source ${s.name} missing or not a regular PE file`)
      }
    }

    // 4. Originals and cleanup: the first mutation, after every pre-check.
    if (input.signal?.aborted) return fail('aborted')
    const ctx: WalkCtx = {
      appId: input.appId,
      bottleDir,
      exePath,
      installRoot,
      installdir: input.installdir,
      signal: input.signal,
      deps
    }
    const swap = await restoreDrmOriginals(ctx)
    if (!swap.ok) return fail(swap.cause)
    const runtimeDllPaths = (await walkRuntimeDlls(ctx)).map((d) => d.path)
    const cleaned = removeTcpBridgeArtifacts(ctx, runtimeDllPaths)
    if (!cleaned.ok) return fail(cleaned.cause)

    // 5. Stage files.
    if (input.signal?.aborted) return fail('aborted')
    if (!steamStat) mkdirSync(steamDirHost)
    if (!isContainedWithin(realpathSync(driveC), realpathSync(steamDirHost))) {
      return fail('Steam dir resolves outside bottle drive_c (symlink)')
    }
    const staged: string[] = []
    for (const s of sources) {
      const dest = join(steamDirHost, s.name)
      if (
        bottleHostToWinPath(bottleDir, dest) !==
        `${DRM_STEAM_DIR_WIN}\\${s.name}`
      ) {
        return fail('staged path not under drive_c')
      }
      const dst = lstatOrNull(dest)
      if (dst && (dst.isSymbolicLink() || !dst.isFile())) {
        return fail(`staged target ${s.name} is a symlink or not a file`)
      }
      if (
        dst &&
        dst.size === lstatSync(s.src).size &&
        sha256(dest) === sha256(s.src)
      ) {
        continue
      }
      const tmp = dest + STAGE_TMP_SUFFIX
      try {
        if (lstatOrNull(tmp)) unlinkSync(tmp)
        copyFileSync(s.src, tmp, constants.COPYFILE_EXCL)
        renameSync(tmp, dest)
        staged.push(s.name)
      } catch (err) {
        try {
          unlinkSync(tmp)
        } catch {
          // nothing to clean up
        }
        return fail(`stage ${s.name} failed: ${String(err)}`)
      }
    }

    // 6. Registry (D-07, D-21): HKCU only.
    let registryWritten = false
    const regStat = lstatOrNull(join(bottleDir, 'user.reg'))
    let alreadyStaged = false
    if (regStat && regStat.isFile() && regStat.size <= MAX_USER_REG_BYTES) {
      try {
        alreadyStaged = drmRegistryStagedInUserReg(
          readFileSync(join(bottleDir, 'user.reg'), 'utf8')
        )
      } catch {
        alreadyStaged = false
      }
    }
    if (!alreadyStaged) {
      if (input.signal?.aborted) return fail('aborted')
      if (regStat && regStat.isFile()) {
        try {
          logInfo(
            `stageDrmBottle: appId ${input.appId} registry not staged: ${drmRegistryMismatches(
              readFileSync(join(bottleDir, 'user.reg'), 'utf8')
            ).join(', ')}`,
            LogPrefix.Steam
          )
        } catch {
          // diagnostic only
        }
      }
      let commands: string[][]
      try {
        commands = buildDrmRegistryCommands()
      } catch (err) {
        return fail(err)
      }
      const run =
        deps.runReg ??
        ((commandParts: string[]) =>
          runWineCommand({
            gameSettings: input.bottleSettings,
            commandParts,
            // reg.exe's own exit code proves the write; `wineserver --wait`
            // blocks until the bottle's wineserver exits, which can be never.
            wait: false,
            protonVerb: 'run'
          }))
      const err = await runRegArgv(
        commands,
        run,
        deps.regTimeoutMs ?? DRM_REG_ADD_TIMEOUT_MS
      )
      if (err) {
        logWarning(
          `stageDrmBottle: appId ${input.appId} ${err}`,
          LogPrefix.Steam
        )
        if (err.includes('timed out after')) {
          try {
            const procs = await (
              deps.listBottleProcesses ?? defaultListBottleProcesses
            )(bottleDir)
            logWarning(
              `stageDrmBottle: appId ${input.appId} bottle processes at timeout: ${procs.slice(0, 20).join(',')}`,
              LogPrefix.Steam
            )
          } catch {
            // diagnostic only
          }
        }
        return fail(err)
      }
      registryWritten = true
      logInfo(
        `stageDrmBottle: appId ${input.appId} registered ${DRM_STEAMCLIENT64_WIN} under HKCU ActiveProcess`,
        LogPrefix.Steam
      )
    }

    return {
      status: 'ok',
      steamDirHost,
      steamDirWin: DRM_STEAM_DIR_WIN,
      helperHostPath: join(steamDirHost, 'steam.exe'),
      helperWinPath: DRM_HELPER_WIN,
      steamClient64WinPath: DRM_STEAMCLIENT64_WIN,
      restored: swap.restored,
      removed: cleaned.removed,
      foreignSteamClientLeft: cleaned.foreignSteamClientLeft,
      staged,
      registryWritten
    }
  } catch (err) {
    return fail(err)
  }
}
