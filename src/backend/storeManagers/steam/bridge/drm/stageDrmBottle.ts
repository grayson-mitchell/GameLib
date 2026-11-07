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
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { runWineCommand } from 'backend/launcher'
import { endPerGameBridgeBottleSession } from '../../bridgeBottleLifecycle'
import {
  getBottleDir,
  sanitizeBottleName
} from 'backend/engine/bottlePrimitives'
import { isContainedWithin } from '../bridgeScan'
import { runBoundedListing } from './boundedListing'
import { openStageWineLog } from './stageWineLog'
import { drmStepError, type DrmStepResult } from './steamclientLayerMode'
import {
  buildDrmRegistryCommands,
  DRM_COMPONENT_FILES,
  DRM_HELPER_WIN,
  DRM_REG_ADD_RETRIES,
  DRM_REG_ADD_TIMEOUT_MS,
  DRM_STEAM_DIR_SEGMENTS,
  DRM_STEAM_DIR_WIN,
  DRM_STEAMCLIENT64_WIN,
  DRM_VALVE_FILES,
  drmRegistryMismatches,
  drmRegistryStagedInUserReg,
  forcedFirstTimeoutMs,
  MAX_USER_REG_BYTES,
  runRegArgv
} from './drmRegistry'
import {
  bottleHostToWinPath,
  readHeadCapped,
  walkRuntimeDlls,
  removeTcpBridgeArtifacts,
  restoreDrmOriginals,
  type WalkCtx
} from './drmRestore'
import type {
  StageDrmBottleDeps,
  StageDrmBottleInput,
  StageDrmBottleOk
} from './stageDrmTypes'

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
  // Sidecar exit contract (56-REVIEW WR-02): runBoundedListing owns the 3 s
  // bound with an unref'd timer and unrefs the child and its pipes.
  const listing = await runBoundedListing(
    '/bin/ps',
    ['-axww', '-o', 'pid=,pcpu=,command='],
    { timeoutMs: 3000, maxBuffer: 4 * 1024 * 1024 }
  )
  const stdout = listing.error ? '' : listing.stdout
  const entries: string[] = []
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+([\d.]+)\s+(.*)$/.exec(line)
    if (!m) continue
    const command = m[3] ?? ''
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
    entries.push(`${m[1] ?? ''}:${m[2] ?? ''}:${exe}`)
  }
  return entries
}

const WINE_COMMAND =
  /wineserver|wineboot|winedevice|winewrapper|wine64|\bwine\b|\.exe\b/i

/**
 * PIDs of the wine processes (any user-visible env mentioning this bottle) that
 * the `ps -E` listing attributes to this bottle: `WINEPREFIX=<bottleDir>` or
 * `CX_BOTTLE=<name>` as a whole env entry. Pure; never throws.
 * @internal exported for tests
 */
export function pidsOfBottleSession(
  psOutput: string,
  bottleDir: string,
  bottleName: string,
  ownPid: number
): number[] {
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefix = new RegExp(`(^|\\s)WINEPREFIX=${escape(bottleDir)}(?=\\s|$)`)
  const bottle = new RegExp(`(^|\\s)CX_BOTTLE=${escape(bottleName)}(?=\\s|$)`)
  const pids: number[] = []
  for (const line of psOutput.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    const pid = Number(m[1])
    if (pid === ownPid || pid <= 1) continue
    const rest = m[2] ?? ''
    if (!WINE_COMMAND.test(rest)) continue
    if (prefix.test(rest) || bottle.test(rest)) pids.push(pid)
  }
  return pids
}

/**
 * PIDs of wine processes whose working directory, per `lsof -F pn -d cwd`, is
 * the bottle dir or inside it. Wine blanks winedevice's env in `ps -E`, so the
 * env match above never sees the spinning winedevice; its cwd under drive_c
 * does (live gate 2026-10-29). `psOutput` (`ps -o pid=,command=`, no env)
 * limits the match to wine commands, so a shell cd'd into the bottle is never
 * picked. Pure; never throws.
 * @internal exported for tests
 */
export function pidsWithCwdInBottle(
  lsofOutput: string,
  psOutput: string,
  bottleDir: string,
  ownPid: number
): number[] {
  const wine = new Set<number>()
  for (const line of psOutput.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (m && WINE_COMMAND.test(m[2] ?? '')) wine.add(Number(m[1]))
  }
  const pids: number[] = []
  let pid = 0
  for (const line of lsofOutput.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1)) || 0
    } else if (
      line.startsWith('n') &&
      pid > 1 &&
      pid !== ownPid &&
      wine.has(pid) &&
      (line.slice(1) === bottleDir || line.slice(1).startsWith(`${bottleDir}/`))
    ) {
      pids.push(pid)
    }
  }
  return pids
}

/** stdout of a bounded listing command; lsof exits 1 on any unreadable pid. */
async function listingOutput(file: string, argv: string[]): Promise<string> {
  // Sidecar exit contract (56-REVIEW WR-02): see runBoundedListing.
  const listing = await runBoundedListing(file, argv, {
    timeoutMs: 3000,
    maxBuffer: 16 * 1024 * 1024
  })
  return listing.stdout
}

/**
 * Ends the wine session a timed-out stage reg add left behind: the clone
 * runner's `wineserver -k`, then SIGKILL for whatever still belongs to this
 * bottle (a spinning winedevice survives `wineserver -k`, and a pid kill was
 * what stopped it). A process belongs to the bottle by its env (`ps -E`) or by
 * a cwd inside the bottle (`lsof`), so other bottles' sessions are never
 * touched. Best effort; never throws.
 */
async function defaultEndStageSession(args: {
  appId: string
  bottleName: string
  bottleDir: string
}): Promise<void> {
  try {
    await endPerGameBridgeBottleSession(args.appId, args.bottleName, 5000)
  } catch {
    // best effort
  }
  try {
    const [psEnvOut, psOut, lsofOut] = await Promise.all([
      listingOutput('/bin/ps', ['-axwwE', '-o', 'pid=,command=']),
      listingOutput('/bin/ps', ['-axww', '-o', 'pid=,command=']),
      listingOutput('/usr/sbin/lsof', ['-nP', '-d', 'cwd', '-F', 'pn'])
    ])
    const pids = [
      ...new Set([
        ...pidsOfBottleSession(
          psEnvOut,
          args.bottleDir,
          args.bottleName,
          process.pid
        ),
        ...pidsWithCwdInBottle(lsofOut, psOut, args.bottleDir, process.pid)
      ])
    ]
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already gone
      }
    }
    logInfo(
      `stageDrmBottle: appId ${args.appId} ended stage session, killed ${pids.length} leftover process(es)`,
      LogPrefix.Steam
    )
  } catch {
    // best effort
  }
}

/**
 * Stages a DRM-mode bottle from the title's existing bridge bottle. Never
 * throws; every failure is a `bottle-stage` DrmStepError.
 */
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
    const extraExeDirs = (input.extraExeDirs ?? []).map((d) => resolve(d))
    for (const d of extraExeDirs) {
      if (!isContainedWithin(driveC, d)) {
        return fail('extra exe dir outside bottle drive_c')
      }
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
    const cleaned = removeTcpBridgeArtifacts(ctx, runtimeDllPaths, extraExeDirs)
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
      const sink = input.stageLogDir
        ? (deps.openStageLog ?? openStageWineLog)(
            input.stageLogDir,
            input.appId,
            Date.now(),
            name
          )
        : null
      if (sink) {
        logInfo(
          `stageDrmBottle: appId ${input.appId} stage wine log ${sink.path}`,
          LogPrefix.Steam
        )
      }
      try {
        const run =
          deps.runReg ??
          ((commandParts: string[]) =>
            runWineCommand({
              gameSettings: input.bottleSettings,
              commandParts,
              // reg.exe's own exit code proves the write; `wineserver --wait`
              // blocks until the bottle's wineserver exits, which can be never.
              wait: false,
              protonVerb: 'run',
              // The first call after endPerGameBridgeBottleSession starts a fresh
              // wineserver that inherits the pipes and outlives reg.exe, so
              // settling on 'close' timed the server, not the write (219990,
              // debug drm-bottle-stage-reg-add-hang).
              resolveOnExit: true,
              // Plan 56-32: the stage session's output (verification gap 1).
              options: {
                onOutput: (chunk: unknown) => sink?.write(String(chunk))
              }
            }))
        const regTimeoutMs = deps.regTimeoutMs ?? DRM_REG_ADD_TIMEOUT_MS
        const forcedMs = forcedFirstTimeoutMs(deps)
        if (forcedMs !== null) {
          logInfo(
            `stageDrmBottle: appId ${input.appId} first stage attempt timeout forced to ${forcedMs} ms (GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS, dev only)`,
            LogPrefix.Steam
          )
        }
        // Lists the bottle's processes for the log and the stage log. Runs on
        // every timed-out attempt, BEFORE the session is ended.
        const logTimeoutListing = async () => {
          try {
            const procs = await (
              deps.listBottleProcesses ?? defaultListBottleProcesses
            )(bottleDir)
            const line = `stageDrmBottle: appId ${input.appId} bottle processes at timeout: ${procs.slice(0, 20).join(',')}`
            logWarning(line, LogPrefix.Steam)
            sink?.write(`[gamelib] ${line}\n`)
          } catch {
            // diagnostic only
          }
        }
        sink?.write(`[gamelib] stage attempt 0 ${new Date().toISOString()}\n`)
        let err = await runRegArgv(commands, run, forcedMs ?? regTimeoutMs)
        // A fresh bottle's first wine session can wedge (winedevice HID spin);
        // end it and retry once on a fresh session. reg add /f is idempotent.
        for (
          let attempt = 0;
          err?.includes('timed out after') && attempt < DRM_REG_ADD_RETRIES;
          attempt++
        ) {
          if (input.signal?.aborted) return fail('aborted')
          logWarning(
            `stageDrmBottle: appId ${input.appId} ${err}; ending the stage session and retrying`,
            LogPrefix.Steam
          )
          await logTimeoutListing()
          await (deps.endStageSession ?? defaultEndStageSession)({
            appId: input.appId,
            bottleName: name,
            bottleDir
          })
          sink?.write(
            `[gamelib] stage attempt ${attempt + 1} ${new Date().toISOString()}\n`
          )
          err = await runRegArgv(commands, run, regTimeoutMs)
          if (!err) {
            logInfo(
              `stageDrmBottle: appId ${input.appId} stage retry passed on attempt ${attempt + 1}`,
              LogPrefix.Steam
            )
          }
        }
        if (err) {
          logWarning(
            `stageDrmBottle: appId ${input.appId} ${err}`,
            LogPrefix.Steam
          )
          if (err.includes('timed out after')) await logTimeoutListing()
          return fail(err)
        }
      } finally {
        sink?.close()
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
