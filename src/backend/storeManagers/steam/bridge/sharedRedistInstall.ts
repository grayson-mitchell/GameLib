/**
 * Steam bridge first-launch shared redist installer (quick 261025-rkj).
 *
 * Steam installs the Steamworks Common Redistributables a game declares (VC++, DirectX, ...)
 * before its first launch by running each depot's installscript.vdf. The bridge never ran that
 * step, so its `GameLibSteamBridge-<appId>` bottles lacked the runtimes. This does it: download
 * the declared depots into one shared cache (`downloadSharedRedistDepots`), then run each
 * installscript `Run Process` entry inside the bottle under the `redist` Play-button status.
 *
 * Idempotence has two layers. The HasRunKey registry value (lowercased entry name, REG_DWORD 1,
 * 32-bit view) is the authoritative mark, exactly as Steam writes it. A ledger file in the bottle
 * directory is the fast path: once every applicable entry is done and nothing failed, `settled`
 * is recorded and later launches make zero CM calls and zero wine spawns.
 *
 * Accepted limit (T-rkj-10): no local copy of a game's declared 228980 depots exists without a
 * CM call (`steam_metadata` holds art/platform flags only, and finalizeToSteam writes no
 * SharedDepots to the ACF), so the settled fast path does not re-check the declared list. A game
 * that later declares a new 228980 depot is not re-evaluated until the opt-in list changes or the
 * bottle (and with it the ledger) is deleted.
 *
 * Accepted risk (T-rkj-09): runWineCommand exposes no kill, so a timed-out installer keeps running
 * in the bottle until it exits on its own, or until the null display window below ends the
 * bottle's wineserver session (only when that window was opened). After a timeout no further
 * entry runs in that launch, so at most one stray installer exists per launch.
 *
 * Null display window (quick 261027-nd3). Under Wine's Mac driver every VC_redist process
 * registers as a Foreground app, which is one Dock icon per process. Under Graphics=null none
 * register and the installers succeed unchanged. The driver is chosen per wineserver session, so
 * the step sets HKCU\Software\Wine\Drivers Graphics=null and ends the session before the
 * installers, then restores the exact prior value (or deletes it) and ends the session again, so
 * the game starts a fresh Mac-driver session. It opens lazily just before the first real
 * installer, only in this appId's per-game bridge bottle, and the restore runs in a finally. A
 * `displayDriver` ledger marker is written before the switch and cleared only after a verified
 * restore plus session end; a failed restore or a crash is therefore repaired at the top of the
 * next run, even on a settled ledger. The bounded `wineserver -k` after the restore also reaps a
 * stray timed-out installer, which narrows T-rkj-09.
 *
 * Bounded retry (WR-04). A failure is never recorded as done, but it is not retried blindly
 * either. An entry the containment rules reject is a fixed property of that manifest GID, so it
 * goes in a per-GID `rejected` bucket that is skipped (and does not block settling) until the GID
 * changes. A non-success exit, timeout or throw bumps a per-GID consecutive-failure count; after
 * {@link REDIST_FAILURE_BACKOFF_AFTER} failures in a row ({@link REDIST_TIMEOUT_BACKOFF_AFTER} when
 * the last one was a timeout, read from `timedOut`) the entry is skipped, with a log line, for
 * {@link REDIST_FAILURE_BACKOFF_MS} after its last failure, then retried once. A skipped entry
 * still blocks settling, so the game keeps its CM round trip per launch but no longer pays a wine
 * spawn or a 5-minute installer timeout on every launch.
 *
 * Phase 54: the CM session is opened only when the caller passes `allowLogon: true` (the end of a
 * bridge install). Play passes nothing: it reuses an open session or defers like offline.
 *
 * Never rejects: a timeout, non-success exit, offline client, CM error or any throw logs a
 * warning, marks nothing done and lets the game launch. Sidecar exit contract: every timer is
 * unref'd and cleared; every wine child is unref'd together with its stdin/stdout/stderr pipes
 * the moment it spawns (runWineCommand's opt-in `onSpawn`), so neither an installer still
 * running nor one abandoned after its timeout holds the event loop past stdin EOF; and the work
 * only runs inside a user-initiated launch, never at boot.
 */

import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { GameSettings } from 'common/types'
import { readKnownFixProfile } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  bridgeBottleNameFor,
  endPerGameBridgeBottleSession,
  getBottleDir
} from '../bottle'
import { steamSupportPath } from '../constants'
import {
  buildHasRunKeyAddParts,
  buildHasRunKeyQueryParts,
  buildRedistProcessCommandParts,
  buildWineGraphicsDeleteParts,
  buildWineGraphicsQueryParts,
  buildWineGraphicsSetParts,
  entryAppliesToBottle,
  isRedistSuccessExit,
  normaliseSharedRedistOptIn,
  parseRegQueryDword,
  parseRegQueryGraphics,
  sharedRedistLedgerKey,
  toBottleWindowsPath
} from './sharedRedists'

/** Per installer process. DXSETUP is slow under CrossOver (RESEARCH A2, assumed). */
export const REDIST_PROCESS_TIMEOUT_MS = 300_000
const REG_TIMEOUT_MS = 15_000
/** Bound on each `wineserver -k` that ends the bottle's session around the null display window. */
const SESSION_END_TIMEOUT_MS = 20_000
const LEDGER_FILE = 'gamelib-shared-redists.json'
/** Consecutive failures of one entry at one GID before it is backed off (WR-04). */
export const REDIST_FAILURE_BACKOFF_AFTER = 3
/** The same, when the last failure was a timeout: each one cost the launch 5 minutes. */
export const REDIST_TIMEOUT_BACKOFF_AFTER = 2
/** How long a backed-off entry is skipped after its last failure before one more attempt. */
export const REDIST_FAILURE_BACKOFF_MS = 72 * 60 * 60 * 1000

interface FailureRecord {
  /** Manifest GID the failures were counted against; a new GID starts from zero. */
  gid: string
  count: number
  /** ISO time of the last failure. */
  at: string
}

interface Ledger {
  version: 1
  /** ledgerKey -> manifest GID of the depot that was run. */
  done: Record<string, string>
  /** ledgerKey -> ISO time the entry's last failure was a timeout (not done). */
  timedOut: Record<string, string>
  /** ledgerKey -> consecutive failures at one GID (not done). */
  failures: Record<string, FailureRecord>
  /** ledgerKey -> GID whose entry the containment rules rejected (not done). */
  rejected: Record<string, string>
  /**
   * ledgerKey -> GID of a done entry whose HasRunKey mark could not be written (IN-01). The
   * installer is not re-run; the mark is retried each launch and the ledger does not settle
   * until it is written, so the ledger and the registry never disagree on a settled bottle.
   */
  markPending: Record<string, string>
  /**
   * Present while the bottle may be on Wine's null display driver (quick 261027-nd3). Written
   * BEFORE the switch, cleared only after a verified restore plus session end. `prior` is the
   * Graphics value to put back, null when it was absent.
   */
  displayDriver?: { prior: string | null; at: string }
  settled?: {
    optIn: string[]
    depotIds: string[]
    skipped: string[]
    /** Ledger keys policy-rejected at settle time (informational). */
    rejected?: string[]
    at: string
  }
}

type BoundedResult =
  | { timedOut: true }
  | { timedOut: false; code?: number; stdout: string }

const inFlight = new Map<string, Promise<void>>()

function emptyLedger(): Ledger {
  return {
    version: 1,
    done: {},
    timedOut: {},
    failures: {},
    rejected: {},
    markPending: {}
  }
}

function isFailureRecord(v: unknown): v is FailureRecord {
  const f = v as Partial<FailureRecord> | null
  return (
    typeof f === 'object' &&
    f !== null &&
    typeof f.gid === 'string' &&
    typeof f.count === 'number' &&
    Number.isInteger(f.count) &&
    f.count > 0 &&
    typeof f.at === 'string'
  )
}

/** Optional ledger buckets added after the first release: absent or malformed reads as empty. */
function readFailures(v: unknown): Record<string, FailureRecord> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  const out: Record<string, FailureRecord> = {}
  for (const [k, f] of Object.entries(v)) if (isFailureRecord(f)) out[k] = f
  return out
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === 'string')
  )
}

async function readLedger(path: string, appId: string): Promise<Ledger> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return emptyLedger()
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Ledger> | null
    if (
      parsed &&
      parsed.version === 1 &&
      isStringRecord(parsed.done) &&
      isStringRecord(parsed.timedOut)
    ) {
      const ledger: Ledger = {
        version: 1,
        done: parsed.done,
        timedOut: parsed.timedOut,
        failures: readFailures(parsed.failures),
        rejected: isStringRecord(parsed.rejected) ? parsed.rejected : {},
        markPending: isStringRecord(parsed.markPending)
          ? parsed.markPending
          : {}
      }
      const dd = parsed.displayDriver
      if (
        dd &&
        typeof dd === 'object' &&
        (typeof dd.prior === 'string' || dd.prior === null) &&
        typeof dd.at === 'string'
      )
        ledger.displayDriver = { prior: dd.prior, at: dd.at }
      const s = parsed.settled
      if (
        s &&
        Array.isArray(s.optIn) &&
        Array.isArray(s.depotIds) &&
        Array.isArray(s.skipped) &&
        typeof s.at === 'string'
      )
        ledger.settled = s
      return ledger
    }
  } catch {
    // fall through
  }
  logWarning(
    `Steam ${appId}: shared redist ledger is unreadable, starting empty`,
    LogPrefix.Steam
  )
  return emptyLedger()
}

let ledgerTmpSeq = 0

/** Write to a unique temp file and rename it over the ledger, so a crash never tears it (IN-04). */
async function writeLedger(
  path: string,
  dir: string,
  ledger: Ledger
): Promise<void> {
  await mkdir(dir, { recursive: true })
  const tmp = `${path}.${process.pid}.${++ledgerTmpSeq}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(ledger, null, 2))
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

/**
 * Drop the event-loop references a wine child holds: the process handle and its three stdio
 * pipes (WR-01). `unref()` stops none of them working (output is still read and `close` still
 * fires while stdin keeps the sidecar alive); it only stops them keeping the process alive.
 * Optional calls: a pipe is null when stdio is not 'pipe', and test fakes need not implement it.
 */
export function unrefWineChild(child: ChildProcess): void {
  child.unref?.()
  for (const pipe of [child.stdin, child.stdout, child.stderr]) {
    ;(pipe as { unref?: () => void } | null | undefined)?.unref?.()
  }
}

/**
 * Run `commandParts` in the bottle with wait:false, raced against an unref'd timer. A timed-out
 * child cannot be killed through runWineCommand, so the caller only logs it. wait:true is never
 * used: `wineserver --wait` can block forever. The child and its pipes are unref'd at spawn.
 */
async function runBounded(
  runWineCommand: typeof import('backend/launcher').runWineCommand,
  commandParts: string[],
  gameSettings: GameSettings,
  timeoutMs: number
): Promise<BoundedResult> {
  let timer: NodeJS.Timeout | undefined
  try {
    const timeout = new Promise<'timeout'>((res) => {
      timer = setTimeout(() => res('timeout'), timeoutMs)
      timer.unref?.()
    })
    const wine = runWineCommand({
      commandParts,
      gameSettings,
      wait: false,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true,
      onSpawn: unrefWineChild,
      resolveOnExit: true
    })
    // A child that outlives its timeout may reject later; nothing is awaiting it by then.
    wine.catch(() => undefined)
    const outcome = await Promise.race([wine, timeout])
    if (outcome === 'timeout') return { timedOut: true }
    return {
      timedOut: false,
      code: outcome?.code,
      stdout: outcome?.stdout ?? ''
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * `signal` (WR-06) aborts the depot download and stops the loop before the next entry; an
 * installer already running is not killed (T-rkj-09). An aborted run never settles. A call that
 * joins an in-flight run for the same appId shares that run, and with it the first caller's signal.
 */
export function installSteamBridgeSharedRedists(
  appId: string,
  bottleSettings: GameSettings,
  signal?: AbortSignal,
  opts?: { allowLogon?: boolean }
): Promise<void> {
  const existing = inFlight.get(appId)
  if (existing) return existing
  const p = run(appId, bottleSettings, signal, opts)
    .catch((error: unknown) => {
      logWarning(
        `Steam ${appId}: shared redist step failed, launching anyway: ${String(error)}`,
        LogPrefix.Steam
      )
    })
    .finally(() => {
      inFlight.delete(appId)
    })
  inFlight.set(appId, p)
  return p
}

/**
 * When a failing entry may next be attempted (epoch ms), or null when it may run now. Reads the
 * `failures` count for this GID and the `timedOut` marker (WR-04).
 */
function backoffUntil(ledger: Ledger, key: string, gid: string): number | null {
  const f = ledger.failures[key]
  if (!f || f.gid !== gid) return null
  const threshold = ledger.timedOut[key]
    ? REDIST_TIMEOUT_BACKOFF_AFTER
    : REDIST_FAILURE_BACKOFF_AFTER
  if (f.count < threshold) return null
  const until = Date.parse(f.at) + REDIST_FAILURE_BACKOFF_MS
  return Number.isFinite(until) && Date.now() < until ? until : null
}

function recordFailure(
  ledger: Ledger,
  key: string,
  gid: string,
  timedOut: boolean
): FailureRecord {
  const prev = ledger.failures[key]
  const at = new Date(Date.now()).toISOString()
  const record = {
    gid,
    count: prev && prev.gid === gid ? prev.count + 1 : 1,
    at
  }
  ledger.failures[key] = record
  if (timedOut) ledger.timedOut[key] = at
  else delete ledger.timedOut[key]
  return record
}

async function run(
  appId: string,
  bottleSettings: GameSettings,
  signal: AbortSignal | undefined,
  opts?: { allowLogon?: boolean }
): Promise<void> {
  const bottleDir = getBottleDir(bottleSettings.wineCrossoverBottle)
  const ledgerPath = join(bottleDir, LEDGER_FILE)
  const ledger = await readLedger(ledgerPath, appId)
  const optIn = normaliseSharedRedistOptIn(
    readKnownFixProfile(appId, 'steam')?.steamSharedRedists
  ).sort()

  const { runWineCommand } = await import('backend/launcher')

  /**
   * Put the Graphics value back (2 verified attempts), then always end the bottle's session so the
   * game starts fresh on the restored driver. Clears the ledger marker only on full success.
   * Never throws.
   */
  const restoreDisplay = async (prior: string | null): Promise<void> => {
    let verified = false
    for (let attempt = 0; attempt < 2 && !verified; attempt++) {
      try {
        await runBounded(
          runWineCommand,
          prior === null
            ? buildWineGraphicsDeleteParts()
            : buildWineGraphicsSetParts(prior),
          bottleSettings,
          REG_TIMEOUT_MS
        )
        const q = await runBounded(
          runWineCommand,
          buildWineGraphicsQueryParts(),
          bottleSettings,
          REG_TIMEOUT_MS
        )
        if (!q.timedOut) {
          const current = parseRegQueryGraphics(q.stdout)
          verified = prior === null ? current === null : current === prior
        }
      } catch {
        // retried once below; the final warning covers a persistent failure
      }
    }
    let sessionEnded = false
    try {
      sessionEnded = await endPerGameBridgeBottleSession(
        appId,
        bottleSettings.wineCrossoverBottle,
        SESSION_END_TIMEOUT_MS
      )
    } catch {
      // endPerGameBridgeBottleSession never throws; belt and braces
    }
    if (verified && sessionEnded) {
      try {
        delete ledger.displayDriver
        await writeLedger(ledgerPath, bottleDir, ledger)
      } catch {
        // The marker may linger; the next launch repeats a harmless restore.
      }
      return
    }
    logWarning(
      `Steam ${appId}: could not restore the Wine display driver in bottle ${bottleSettings.wineCrossoverBottle}; the bottle may still be on Wine's null display driver, so the game may start with no display. The restore will be retried next launch`,
      LogPrefix.Steam
    )
  }

  if (ledger.displayDriver) {
    logInfo(
      `Steam ${appId}: a previous run left the Wine display driver switched, restoring it first`,
      LogPrefix.Steam
    )
    await restoreDisplay(ledger.displayDriver.prior)
  }

  if (
    ledger.settled &&
    JSON.stringify([...ledger.settled.optIn].sort()) === JSON.stringify(optIn)
  ) {
    logInfo(
      `Steam ${appId}: shared redists already settled, nothing to do`,
      LogPrefix.Steam
    )
    return
  }
  if (ledger.settled) {
    // Re-evaluating (opt-in changed): clear the stale mark until this run settles again.
    delete ledger.settled
    await writeLedger(ledgerPath, bottleDir, ledger)
  }

  const { downloadSharedRedistDepots } = await import('../depot')

  const result = await downloadSharedRedistDepots(appId, {
    cacheSteamappsDir: join(steamSupportPath, 'sharedRedist', 'steamapps'),
    optInDepotIds: optIn,
    signal,
    allowLogon: opts?.allowLogon,
    onComponent: (label) =>
      sendGameStatusUpdate({
        appName: appId,
        runner: 'steam',
        status: 'redist',
        context: label
      })
  })
  if (result.status === 'offline') {
    logInfo(
      `Steam ${appId}: Steam client offline or no Steam session at Play, shared redists deferred to next launch`,
      LogPrefix.Steam
    )
    return
  }

  let stop = false
  let anyFailed = false

  /** Write Steam's HasRunKey mark; false on a timeout, non-zero exit or throw. */
  const writeMark = async (hasRunKey: string, name: string) => {
    try {
      const mark = await runBounded(
        runWineCommand,
        buildHasRunKeyAddParts(hasRunKey, name),
        bottleSettings,
        REG_TIMEOUT_MS
      )
      return !mark.timedOut && mark.code === 0
    } catch {
      return false
    }
  }

  let windowTried = false
  let windowPrior: { prior: string | null } | null = null

  /** Lazily switch this appId's per-game bottle to Graphics=null; never throws or fails the launch. */
  const openNullDisplay = async (): Promise<void> => {
    if (windowTried) return
    windowTried = true
    let markerWritten = false
    let prior: string | null = null
    try {
      if (bottleSettings.wineCrossoverBottle !== bridgeBottleNameFor(appId))
        return
      const q = await runBounded(
        runWineCommand,
        buildWineGraphicsQueryParts(),
        bottleSettings,
        REG_TIMEOUT_MS
      )
      if (q.timedOut) {
        logInfo(
          `Steam ${appId}: Graphics query timed out, redists run on the Mac driver`,
          LogPrefix.Steam
        )
        return
      }
      if (q.code === 0) {
        const parsed = parseRegQueryGraphics(q.stdout)
        if (parsed === null) return
        prior = parsed
      }
      const setNull = buildWineGraphicsSetParts('null')
      if (prior !== null) buildWineGraphicsSetParts(prior) // throws on a value we could not replay
      ledger.displayDriver = { prior, at: new Date().toISOString() }
      await writeLedger(ledgerPath, bottleDir, ledger)
      markerWritten = true
      windowPrior = { prior }
      const add = await runBounded(
        runWineCommand,
        setNull,
        bottleSettings,
        REG_TIMEOUT_MS
      )
      const ended =
        !add.timedOut &&
        add.code === 0 &&
        (await endPerGameBridgeBottleSession(
          appId,
          bottleSettings.wineCrossoverBottle,
          SESSION_END_TIMEOUT_MS
        ))
      if (!ended) {
        logWarning(
          `Steam ${appId}: could not switch the bottle to the null display driver, redists run on the Mac driver (cosmetic: Dock icons only)`,
          LogPrefix.Steam
        )
        windowPrior = null
        await restoreDisplay(prior)
      }
    } catch (error) {
      logWarning(
        `Steam ${appId}: null display window failed: ${String(error)}`,
        LogPrefix.Steam
      )
      if (markerWritten) {
        windowPrior = null
        await restoreDisplay(prior)
      }
    }
  }

  try {
    for (const depot of result.depots) {
      if (stop) break
      const installDirWin = toBottleWindowsPath(depot.installDirHost)
      for (const entry of depot.entries) {
        if (stop) break
        if (signal?.aborted) {
          logInfo(
            `Steam ${appId}: shared redist step aborted, no further redists this launch`,
            LogPrefix.Steam
          )
          stop = true
          break
        }
        if (!entryAppliesToBottle(entry)) continue
        const key = sharedRedistLedgerKey(
          entry.hasRunKey,
          entry.name,
          depot.depotId
        )
        if (ledger.done[key]) {
          if (ledger.markPending[key] && entry.hasRunKey) {
            if (await writeMark(entry.hasRunKey, entry.name)) {
              delete ledger.markPending[key]
              await writeLedger(ledgerPath, bottleDir, ledger)
            } else {
              logWarning(
                `Steam ${appId}: still could not write the HasRunKey mark for ${depot.label} (${entry.name})`,
                LogPrefix.Steam
              )
            }
          }
          continue
        }
        if (ledger.rejected[key] === depot.gid) {
          logInfo(
            `Steam ${appId}: ${depot.label} (${entry.name}) was rejected by the containment rules at manifest ${depot.gid}, skipping`,
            LogPrefix.Steam
          )
          continue
        }
        const until = backoffUntil(ledger, key, depot.gid)
        if (until !== null) {
          logWarning(
            `Steam ${appId}: ${depot.label} (${entry.name}) failed ${ledger.failures[key].count} times in a row at manifest ${depot.gid}, skipping until ${new Date(until).toISOString()}`,
            LogPrefix.Steam
          )
          anyFailed = true
          continue
        }

        try {
          if (entry.hasRunKey) {
            const q = await runBounded(
              runWineCommand,
              buildHasRunKeyQueryParts(entry.hasRunKey, entry.name),
              bottleSettings,
              REG_TIMEOUT_MS
            )
            if (!q.timedOut) {
              const value = parseRegQueryDword(q.stdout)
              if (value !== null && value >= entry.minimumHasRunValue) {
                logInfo(
                  `Steam ${appId}: ${depot.label} (${entry.name}) already marked in the bottle registry`,
                  LogPrefix.Steam
                )
                ledger.done[key] = depot.gid
                await writeLedger(ledgerPath, bottleDir, ledger)
                continue
              }
            }
          }

          if (entry.processes.length === 0) continue

          sendGameStatusUpdate({
            appName: appId,
            runner: 'steam',
            status: 'redist',
            context: depot.label
          })

          // Build every process first, so a rejected entry runs none of its processes.
          const allParts = entry.processes.map((proc) =>
            buildRedistProcessCommandParts(proc, depot.kind, installDirWin)
          )
          if (allParts.some((parts) => parts === null)) {
            logWarning(
              `Steam ${appId}: ${depot.label} (${entry.name}) has an unsafe process entry, skipping it while depot ${depot.depotId} stays at manifest ${depot.gid}`,
              LogPrefix.Steam
            )
            ledger.rejected[key] = depot.gid
            await writeLedger(ledgerPath, bottleDir, ledger)
            continue
          }

          await openNullDisplay()

          let entryOk = true
          for (const parts of allParts as string[][]) {
            const r = await runBounded(
              runWineCommand,
              parts,
              bottleSettings,
              REDIST_PROCESS_TIMEOUT_MS
            )
            if (r.timedOut) {
              logWarning(
                `Steam ${appId}: ${depot.label} (${entry.name}) installer timed out after ${REDIST_PROCESS_TIMEOUT_MS}ms; it may keep running in the bottle, no further redists this launch`,
                LogPrefix.Steam
              )
              recordFailure(ledger, key, depot.gid, true)
              await writeLedger(ledgerPath, bottleDir, ledger)
              stop = true
              entryOk = false
              break
            }
            if (!isRedistSuccessExit(depot.kind, r.code)) {
              const f = recordFailure(ledger, key, depot.gid, false)
              await writeLedger(ledgerPath, bottleDir, ledger)
              logWarning(
                `Steam ${appId}: ${depot.label} (${entry.name}) installer exited with code ${String(r.code)} (consecutive failure ${f.count}), will retry`,
                LogPrefix.Steam
              )
              entryOk = false
              break
            }
          }
          if (!entryOk) {
            anyFailed = true
            continue
          }

          // The installer succeeded, so the entry is done whatever happens to the mark; a failed
          // mark is retried next launch and blocks settling (IN-01).
          if (
            entry.hasRunKey &&
            !(await writeMark(entry.hasRunKey, entry.name))
          ) {
            logWarning(
              `Steam ${appId}: could not write the HasRunKey mark for ${depot.label} (${entry.name}), will retry the mark next launch`,
              LogPrefix.Steam
            )
            ledger.markPending[key] = depot.gid
          } else {
            delete ledger.markPending[key]
          }
          logInfo(
            `Steam ${appId}: installed ${depot.label} (${entry.name}, depot ${depot.depotId})`,
            LogPrefix.Steam
          )
          ledger.done[key] = depot.gid
          delete ledger.timedOut[key]
          delete ledger.failures[key]
          delete ledger.rejected[key]
          await writeLedger(ledgerPath, bottleDir, ledger)
        } catch (error) {
          logWarning(
            `Steam ${appId}: ${depot.label} (${entry.name}) threw, will retry next launch: ${String(error)}`,
            LogPrefix.Steam
          )
          anyFailed = true
          try {
            recordFailure(ledger, key, depot.gid, false)
            await writeLedger(ledgerPath, bottleDir, ledger)
          } catch {
            // The failure count is best effort; the entry already stays not-done and unsettled.
          }
        }
      }
    }
  } finally {
    if (windowPrior) {
      const { prior } = windowPrior as { prior: string | null }
      windowPrior = null
      await restoreDisplay(prior)
    }
  }

  const marksPending = Object.keys(ledger.markPending).length > 0
  if (result.failed.length === 0 && !stop && !anyFailed && !marksPending) {
    ledger.settled = {
      optIn,
      depotIds: result.depots.map((d) => d.depotId),
      skipped: result.skipped,
      rejected: Object.keys(ledger.rejected),
      at: new Date().toISOString()
    }
    await writeLedger(ledgerPath, bottleDir, ledger)
  } else {
    logWarning(
      `Steam ${appId}: shared redists not settled (failed: ${result.failed.join(',') || 'none'}${marksPending ? ', HasRunKey marks pending' : ''}), will retry next launch`,
      LogPrefix.Steam
    )
  }
}
