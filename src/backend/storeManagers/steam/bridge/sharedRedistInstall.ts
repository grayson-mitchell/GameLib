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
 * in the bottle until it exits on its own. After a timeout no further entry runs in that launch,
 * so at most one stray installer exists per launch.
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
 * Never rejects: a timeout, non-success exit, offline client, CM error or any throw logs a
 * warning, marks nothing done and lets the game launch. Sidecar exit contract: every timer is
 * unref'd and cleared; every wine child is unref'd together with its stdin/stdout/stderr pipes
 * the moment it spawns (runWineCommand's opt-in `onSpawn`), so neither an installer still
 * running nor one abandoned after its timeout holds the event loop past stdin EOF; and the work
 * only runs inside a user-initiated launch, never at boot.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { GameSettings } from 'common/types'
import { readKnownFixesLayered } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getBottleDir } from '../bottle'
import { steamSupportPath } from '../constants'
import {
  buildHasRunKeyAddParts,
  buildHasRunKeyQueryParts,
  buildRedistProcessCommandParts,
  entryAppliesToBottle,
  isRedistSuccessExit,
  normaliseSharedRedistOptIn,
  parseRegQueryDword,
  sharedRedistLedgerKey,
  toBottleWindowsPath
} from './sharedRedists'

/** Per installer process. DXSETUP is slow under CrossOver (RESEARCH A2, assumed). */
export const REDIST_PROCESS_TIMEOUT_MS = 300_000
const REG_TIMEOUT_MS = 15_000
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
  return { version: 1, done: {}, timedOut: {}, failures: {}, rejected: {} }
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
        rejected: isStringRecord(parsed.rejected) ? parsed.rejected : {}
      }
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

async function writeLedger(
  path: string,
  dir: string,
  ledger: Ledger
): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path, JSON.stringify(ledger, null, 2))
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
      onSpawn: unrefWineChild
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
  signal?: AbortSignal
): Promise<void> {
  const existing = inFlight.get(appId)
  if (existing) return existing
  const p = run(appId, bottleSettings, signal)
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
  signal: AbortSignal | undefined
): Promise<void> {
  const bottleDir = getBottleDir(bottleSettings.wineCrossoverBottle)
  const ledgerPath = join(bottleDir, LEDGER_FILE)
  const ledger = await readLedger(ledgerPath, appId)
  const optIn = normaliseSharedRedistOptIn(
    readKnownFixesLayered(appId, 'steam')?.steamSharedRedists
  ).sort()

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

  const { runWineCommand } = await import('backend/launcher')
  const { downloadSharedRedistDepots } = await import('../depot')

  const result = await downloadSharedRedistDepots(appId, {
    cacheSteamappsDir: join(steamSupportPath, 'sharedRedist', 'steamapps'),
    optInDepotIds: optIn,
    signal,
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
      `Steam ${appId}: Steam client offline, shared redists deferred to next launch`,
      LogPrefix.Steam
    )
    return
  }

  let stop = false
  let anyFailed = false

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
      const key = sharedRedistLedgerKey(entry.hasRunKey, entry.name)
      if (ledger.done[key]) continue
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

        if (entry.hasRunKey) {
          const mark = await runBounded(
            runWineCommand,
            buildHasRunKeyAddParts(entry.hasRunKey, entry.name),
            bottleSettings,
            REG_TIMEOUT_MS
          )
          if (mark.timedOut || mark.code !== 0) {
            logWarning(
              `Steam ${appId}: could not write the HasRunKey mark for ${depot.label} (${entry.name})`,
              LogPrefix.Steam
            )
          }
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

  if (result.failed.length === 0 && !stop && !anyFailed) {
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
      `Steam ${appId}: shared redists not settled (failed: ${result.failed.join(',') || 'none'}), will retry next launch`,
      LogPrefix.Steam
    )
  }
}
