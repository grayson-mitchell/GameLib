/**
 * The wine-process half of the `bottle-stage` DrmStep: listing a bottle's live
 * processes for the reg add timeout log, and ending the stage's own wine
 * session. Every spawn goes through runBoundedListing, which owns the unref'd
 * timer (sidecar exit contract).
 */
import { logInfo, LogPrefix } from 'backend/logger'
import { endPerGameBridgeBottleSession } from '../../bridgeBottleLifecycle'
import { runBoundedListing } from './boundedListing'

/**
 * `<pid>:<pcpu>:<basename>` for processes whose command line mentions the
 * bottle or the DRM runners. The basename is cut at the first `.exe` or wine
 * binary name, never by splitting on spaces (paths hold "Application Support").
 */
export async function defaultListBottleProcesses(
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
export async function defaultEndStageSession(args: {
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
