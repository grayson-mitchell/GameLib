import { GameInfo } from 'common/types'
import type { ManagerDeps, SteamLibraryStateDeps } from 'backend/services/types'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { join } from 'path'
import { isMac, isLinux } from 'backend/constants/environment'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import { resumeVerifyRust } from '../depotRust/secondary'
import { rustFinalize } from '../depotRust/rustDepot'
import {
  sanitizeInstalldir,
  fallbackInstalldirFor,
  UnsafeInstalldirError
} from '../installLocation'
import { readAcfInstalldir } from '../acfInstalldir'
import {
  listSteamClientPids,
  readSteamProcessStartTokens
} from '../steamClientProcess'
import {
  clearSteamRestartHold,
  decideSteamRestartHoldRearm,
  listSteamRestartHolds,
  restartHoldStoreFrom
} from '../steamRestartHold'
import { MAX_TICKS } from './pollState'
import { readAcfState } from './acfState'
import { startInstallPolling } from './installPolling'

/**
 * Maps the host OS to Steam's depot `oslist` vocabulary ('windows'|'macos'|
 * 'linux') for the depot selection's `os` param — the SAME mapping games.ts's own
 * hostSteamDepotOs() uses for a fresh install. Kept as a small local
 * duplicate rather than exporting a new symbol from games.ts: this file's
 * startup-resume path (scanDownloadingAppIds, D-05) is confirmed
 * native-only (RESEARCH Pitfall 5), so it only ever needs the native/host-OS
 * mapping — never the bottle path's hardcoded 'windows' override
 * installBottleNative() applies for a fresh bottle install.
 */
function hostSteamDepotOsForResume(): string {
  if (isMac) return 'macos'
  if (isLinux) return 'linux'
  return 'windows'
}

/**
 * D-05 startup-resume helper: locates the steamapps dir + installdir +
 * display name for an in-progress (downloading) appId directly from its
 * on-disk ACF — the minimal data the depot module's finalize function needs
 * to write an honest 1026 manifest over a GameLib-owned partial. A NEW
 * helper — NOT a change to scanDownloadingAppIds/readAcfState (RESEARCH
 * Pitfall 4 requires those stay untouched, they only watch); this duplicates
 * only the installdir extraction those functions already perform internally
 * but do not expose on their own return shapes. Returns null when the
 * manifest can no longer be found (e.g. removed between the startup scan and
 * this lookup) — the caller still starts the poller either way, since D-05's
 * finalize-and-watch action is safe regardless of whether finalize ran.
 */
async function locateDownloadingTarget(
  deps: SteamLibrariesDeps & SteamLibraryStateDeps,
  appId: string
): Promise<{
  targetSteamappsDir: string
  installdir: string
  name: string
} | null> {
  const libraryPaths = await getSteamLibraries(deps)

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    // quick-260909-pym: the ACF read itself now lives in acfInstalldir.ts,
    // shared with installLocation.ts's resolveSteamInstallTarget (D-03 —
    // the two callers must never drift on how an ACF installdir is read,
    // the same reason they share one sanitizeInstalldir). Only the read
    // moved; the per-library loop, the continue-on-falsy-installdir
    // behaviour, and the name lookup below are unchanged.
    const installdir = await readAcfInstalldir(deps, steamappsDir, appId)
    if (!installdir) continue

    return {
      targetSteamappsDir: steamappsDir,
      installdir,
      name:
        deps.steamSession.libraryState.library.get(appId)?.title ?? installdir
    }
  }

  return null
}

/** Where an honest-empty resume finalize lands: the sanitised target, no depots. */
interface ResumeFinalizeTarget {
  targetSteamappsDir: string
  installdir: string
  name: string
}

/**
 * Phase 23 (D-04) / 73 (D-13): verifies a startup-resumed appId against its on-disk state. One
 * Rust verify_only job reconciles every file against the manifests, re-applies file modes and
 * writes the honest ACF itself (StateFlags 4 only when everything verifies, otherwise 1026); it
 * never fetches a chunk (Pitfall 4: startup resume never re-downloads). Returns null when that job
 * wrote the ACF, so nothing is left for the caller to finalize.
 *
 * NEVER throws: a hostile installdir or a failed verify (offline, a dropped CM connection, a
 * corrupt PICS response) degrades to the honest-empty `depots: []` finalize opts, which fail
 * CLOSED to 1026 via the Rust finalize's own defaults (allowFullOwnership false). It never touches the bottle steamapps or
 * dispatchToBottledSteam, so no silent Steam-in-CrossOver auto-open is introduced here.
 */
async function buildResumeFinalizeOpts(
  deps: Pick<ManagerDeps, 'config' | 'steamUser' | 'steamInstallRuntime'>,
  appId: string,
  target: { targetSteamappsDir: string; installdir: string; name: string }
): Promise<ResumeFinalizeTarget | null> {
  // WR-03 (23-code-review): target.installdir is read directly off the
  // on-disk ACF's AppState.installdir (locateDownloadingTarget) with no
  // sanitization of its own — route it through the same containment +
  // denylist guard (D-02/D-04) the fresh-install path (installLocation.ts's
  // resolveSteamInstallTarget) already enforces before it ever reaches
  // the verify job below. Defense-in-depth: an attacker would
  // already need local write access to steamapps/ to plant a hostile ACF,
  // but every filesystem-root-building value must be guarded the same way
  // regardless of caller.
  //
  // D-04: sanitizeInstalldir may THROW UnsafeInstalldirError on a
  // containment/denylist violation. This function's own contract (above)
  // promises it NEVER throws — resumeInterruptedSteamInstall runs during
  // startup and a throw here would crash init(). A dedicated guard around
  // ONLY this call (not the wider try block below, which must keep
  // swallowing exactly the verify failures it already does) catches the rejection, logs it at ERROR naming the appId and the
  // rejected value, and degrades to the SAME honest-empty `depots: []`
  // shape the existing catch below already produces for a planning
  // failure — which fails CLOSED to the safe StateFlags=1026 verify-handoff.
  // A hostile on-disk ACF aborts the RESUME for this appId, not the app.
  let installdir: string
  try {
    installdir = sanitizeInstalldir(
      target.installdir,
      appId,
      target.targetSteamappsDir
    )
  } catch (sanitizeErr) {
    if (!(sanitizeErr instanceof UnsafeInstalldirError)) {
      throw sanitizeErr
    }
    logError(
      [
        `Steam: startup resume rejected a hostile on-disk installdir for appId ${appId}, ` +
          'falling back to the honest-empty 1026 finalize:',
        sanitizeErr
      ],
      LogPrefix.Steam
    )
    return {
      targetSteamappsDir: target.targetSteamappsDir,
      installdir: fallbackInstalldirFor(appId),
      name: target.name
    }
  }

  try {
    const v = await resumeVerifyRust(appId, {
      installRuntime: deps.steamInstallRuntime,
      steamUser: deps.steamUser,
      config: deps.config,
      targetSteamappsDir: target.targetSteamappsDir,
      installdir,
      name: target.name,
      os: hostSteamDepotOsForResume()
    })
    logInfo(
      `Steam: rust resume verify for appId ${appId}: missing=${v.missing.length} verified=${v.allFilesVerified} modesHealed=${v.allModesHealed} StateFlags=${v.acf?.stateFlags ?? 'none'}`,
      LogPrefix.Steam
    )
    return null
  } catch (verifyErr) {
    logWarning(
      [
        `Steam: startup resume verify failed for appId ${appId}, ` +
          'falling back to the honest-empty 1026 finalize:',
        verifyErr
      ],
      LogPrefix.Steam
    )
    return {
      targetSteamappsDir: target.targetSteamappsDir,
      installdir,
      name: target.name
    }
  }
}

/**
 * steam-startup-resume-crash (2026-07-18) / D-04 softened: user-initiated
 * counterpart to init()'s detect-only surfacing below. Performs the SAME
 * locate -> verify -> finalize -> watch sequence init()
 * used to run UNATTENDED on every launch — now it only runs when the user
 * actually triggers a resume (SteamGame.install() calls this first when the
 * library entry is flagged steamResumePending). Moving the depot plan's
 * PICS/manifest network fetch (and everything chained after it) off the boot
 * path is the actual fix: a native fatal in that machinery running
 * unattended immediately after launch was the confirmed crash trigger.
 * Running the exact same code here is safe because it is now consent-gated
 * behind an explicit user click instead of firing automatically on startup.
 *
 * NEVER throws — degrades to "still start the poller" on any failure so a
 * caller (SteamGame.install()) can always safely continue into its own
 * normal install flow afterward, exactly like the pre-existing init()
 * contract did.
 */
export async function resumeInterruptedSteamInstall(
  deps: ManagerDeps,
  appId: string
): Promise<void> {
  try {
    // Clear the pending-resume marker up front — this call IS the resume
    // attempt; it must never be left stuck "pending" after the user has
    // already acted on it, even if the finalize step below fails.
    const existing = deps.steamSession.libraryState.library.get(appId)
    if (existing?.install?.steamResumePending) {
      const updated: GameInfo = {
        ...existing,
        install: { ...existing.install, steamResumePending: false }
      }
      deps.steamSession.libraryState.library.set(appId, updated)
      deps.sendFrontendMessage('pushGameToLibrary', updated)
    }

    try {
      const target = await locateDownloadingTarget(deps, appId)
      if (target) {
        const finalizeOpts = await buildResumeFinalizeOpts(deps, appId, target)
        // null: the Rust verify_only job already wrote the ACF.
        if (finalizeOpts) {
          const res = await rustFinalize(
            deps.steamInstallRuntime.depotJobs.transport,
            appId,
            {
              steamappsDir: finalizeOpts.targetSteamappsDir,
              installdir: finalizeOpts.installdir,
              name: finalizeOpts.name,
              buildid: null,
              lastOwner: deps.steamUser.getPersistedSteamId64() ?? null,
              allowFullOwnership: false,
              betaKey: undefined
            },
            [],
            null
          )
          if ('preserved' in res) {
            logInfo(
              `Steam: resume finalize for appId ${appId} found an installed manifest (StateFlags=${res.stateFlags}); leaving it untouched`,
              LogPrefix.Steam
            )
          }
        }
      }
    } catch (finalizeErr) {
      logWarning(
        [
          `Steam: resume finalize failed for appId ${appId}, will still watch:`,
          finalizeErr
        ],
        LogPrefix.Steam
      )
    }

    startInstallPolling(deps, appId)
  } catch (err) {
    // Per-appId hardening: a resume attempt failing for any reason must
    // never throw out to the caller (SteamGame.install() continues into its
    // normal install flow regardless).
    logWarning(
      [`Steam: resumeInterruptedSteamInstall failed for appId ${appId}:`, err],
      LogPrefix.Steam
    )
  }
}
/**
 * quick 261029-pkp (D-UAT-13 follow-up): at boot, re-arm the persisted
 * "Restart Steam to finish" hold for every app whose recorded Steam process
 * is still the live one; drop the record otherwise. Never throws. With zero
 * records it spawns nothing. An inconclusive probe arms nothing and keeps
 * the record (fail-open, as before D-UAT-13).
 */
export async function rearmPersistedSteamRestartHolds(
  deps: ManagerDeps
): Promise<{
  dropped: number
}> {
  let dropped = 0
  const { restartHold } = deps.steamInstallRuntime
  const { pendingSteamHoldRearm } = restartHold
  const records = listSteamRestartHolds(restartHoldStoreFrom(deps))
  if (records.length === 0) return { dropped }
  restartHold.setReconcileRanDuringRearm(false)
  // Synchronously, before any await: fail closed until verified.
  for (const [appId] of records) pendingSteamHoldRearm.add(appId)
  try {
    const livePids = await listSteamClientPids(deps)
    let startTokens: Map<number, string> | undefined = new Map()
    if (livePids) {
      const union = new Set<number>()
      for (const [, record] of records) {
        for (const p of record.pids) {
          if (livePids.includes(p.pid)) union.add(p.pid)
        }
      }
      if (union.size > 0) {
        startTokens = await readSteamProcessStartTokens(deps, [...union])
      }
    }
    const now = Date.now()
    for (const [appId, record] of records) {
      try {
        if (
          deps.steamSession.gameSession.isNativeInstallInFlight(appId) ||
          deps.steamInstallRuntime.polls.activePolls.has(appId)
        ) {
          clearSteamRestartHold(appId, restartHoldStoreFrom(deps))
          dropped++
          continue
        }
        const decision = decideSteamRestartHoldRearm({
          record,
          livePids,
          startTokens,
          nowMs: now,
          maxAgeMs: MAX_TICKS * 3000
        })
        if (decision.kind === 'unknown') {
          logInfo(
            `Steam: Steam restart hold for appId ${appId} could not be verified at boot; not re-arming (fail-open), keeping the record`,
            LogPrefix.Steam
          )
          // Counts as released: the game is reported installed (fail-open).
          dropped++
          continue
        }
        if (decision.kind === 'drop') {
          clearSteamRestartHold(appId, restartHoldStoreFrom(deps))
          dropped++
          logInfo(
            `Steam: dropped persisted Steam restart hold for appId ${appId} (${decision.reason})`,
            LogPrefix.Steam
          )
          continue
        }
        const acf = await readAcfState(deps, appId, 'native')
        if (acf.state !== 'installed') {
          clearSteamRestartHold(appId, restartHoldStoreFrom(deps))
          dropped++
          logInfo(
            `Steam: dropped persisted Steam restart hold for appId ${appId} (manifest is ${acf.state})`,
            LogPrefix.Steam
          )
          continue
        }
        startInstallPolling(deps, appId, {
          isNativeHandoff: true,
          source: 'native',
          macNativeRoute: record.macNativeRoute,
          skippedDepots: record.skippedDepots,
          restoredSteamHold: {
            pids: decision.pids,
            startTicks: Math.floor((now - record.recordedAt) / 3000)
          }
        })
        logInfo(
          `Steam: re-armed steam-waiting-for-restart for appId ${appId} (Steam pid ${decision.pids.join(', ')}) after a GameLib restart`,
          LogPrefix.Steam
        )
      } catch (error) {
        logWarning(
          [`Steam: could not re-arm Steam restart hold for ${appId}:`, error],
          LogPrefix.Steam
        )
      }
    }
  } catch (error) {
    logWarning(
      ['Steam: re-arming persisted Steam restart holds failed:', error],
      LogPrefix.Steam
    )
  } finally {
    for (const [appId] of records) pendingSteamHoldRearm.delete(appId)
  }
  return { dropped }
}
