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
 * Never rejects: a timeout, non-success exit, offline client, CM error or any throw logs a
 * warning, marks nothing done and lets the game launch. Sidecar exit contract: every timer is
 * unref'd and cleared, and the work only runs inside a user-initiated launch, never at boot.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
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

interface Ledger {
  version: 1
  /** ledgerKey -> manifest GID of the depot that was run. */
  done: Record<string, string>
  /** ledgerKey -> ISO time an installer timed out (not done). */
  timedOut: Record<string, string>
  settled?: {
    optIn: string[]
    depotIds: string[]
    skipped: string[]
    at: string
  }
}

type BoundedResult =
  | { timedOut: true }
  | { timedOut: false; code?: number; stdout: string }

const inFlight = new Map<string, Promise<void>>()

function emptyLedger(): Ledger {
  return { version: 1, done: {}, timedOut: {} }
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
        timedOut: parsed.timedOut
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
 * Run `commandParts` in the bottle with wait:false, raced against an unref'd timer. A timed-out
 * child cannot be killed through runWineCommand, so the caller only logs it. wait:true is never
 * used: `wineserver --wait` can block forever.
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
      skipPrefixCheckIKnowWhatImDoing: true
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

export function installSteamBridgeSharedRedists(
  appId: string,
  bottleSettings: GameSettings
): Promise<void> {
  const existing = inFlight.get(appId)
  if (existing) return existing
  const p = run(appId, bottleSettings)
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

async function run(appId: string, bottleSettings: GameSettings): Promise<void> {
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
      if (!entryAppliesToBottle(entry)) continue
      const key = sharedRedistLedgerKey(entry.hasRunKey, entry.name)
      if (ledger.done[key]) continue

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

        let entryOk = true
        for (const proc of entry.processes) {
          const parts = buildRedistProcessCommandParts(
            proc,
            depot.kind,
            installDirWin
          )
          if (!parts) {
            logWarning(
              `Steam ${appId}: ${depot.label} (${entry.name}) has an unsafe process entry, skipping`,
              LogPrefix.Steam
            )
            entryOk = false
            break
          }
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
            ledger.timedOut[key] = new Date().toISOString()
            await writeLedger(ledgerPath, bottleDir, ledger)
            stop = true
            entryOk = false
            break
          }
          if (!isRedistSuccessExit(depot.kind, r.code)) {
            logWarning(
              `Steam ${appId}: ${depot.label} (${entry.name}) installer exited with code ${String(r.code)}, will retry next launch`,
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
        await writeLedger(ledgerPath, bottleDir, ledger)
      } catch (error) {
        logWarning(
          `Steam ${appId}: ${depot.label} (${entry.name}) threw, will retry next launch: ${String(error)}`,
          LogPrefix.Steam
        )
        anyFailed = true
      }
    }
  }

  if (result.failed.length === 0 && !stop && !anyFailed) {
    ledger.settled = {
      optIn,
      depotIds: result.depots.map((d) => d.depotId),
      skipped: result.skipped,
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
