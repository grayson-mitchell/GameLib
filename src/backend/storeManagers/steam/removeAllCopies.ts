/**
 * quick-260821-le0 Task 3 — the `steamRemoveAllCopies` IPC seam. Sweeps
 * EVERY recorded install root for a Steam title in one action, instead of
 * requiring one Uninstall click per root (the HOARD/63000 three-root shape
 * that motivated this task).
 *
 * Deliberately its own file, not folded into games.ts or library.ts:
 * mirrors this directory's existing convention of one small file per IPC
 * handler body shared across both runtimes (installFormIpc.ts, clientSetup.ts,
 * installLocation.ts), so `main.ts` and `steamAuthFlowRegistration.ts` both
 * import the SAME function and are physically incapable of drifting.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  enumerateSteamInstallCopies,
  removeSteamInstallCopy,
  pollUninstallOnce
} from './library'

// Mirrors installFormIpc.ts's own NUMERIC_APP_ID copy (34.13 review A-12
// pattern) — each file in this directory carries its own local copy by
// established convention rather than sharing one import.
const NUMERIC_APP_ID = /^\d+$/

export interface RemoveAllCopiesResult {
  removed: number
  refused: number
  error?: string
}

/**
 * Sweeps every install root `enumerateSteamInstallCopies` finds for
 * `appName` and calls `removeSteamInstallCopy` on each. `appName` arrives
 * from the renderer over IPC and is untrusted (same discipline as
 * `getSteamBottleEligibilityVerdict`, installFormIpc.ts:89) — validated as
 * a numeric-string appId BEFORE any enumeration or delete target is built.
 *
 * A single root refusing (e.g. mid-download) does not abort the sweep —
 * every OTHER root is still attempted, and the tally reports both counts so
 * a partial sweep is never silently reported as a full success (T-LE0-06).
 * This function never throws.
 *
 * Finishes with exactly one `pollUninstallOnce(appId, 'native')` call AFTER
 * the sweep — not per root — so the library entry reconciles honestly once,
 * matching the locked "badge follows confirmed on-disk ACF state"
 * constraint the route-time auto-cleanup (Task 2) also follows.
 */
export async function removeAllSteamInstallCopies(
  appName: unknown
): Promise<RemoveAllCopiesResult> {
  if (typeof appName !== 'string' || !NUMERIC_APP_ID.test(appName)) {
    logWarning(
      'removeAllSteamInstallCopies: rejected non-string or non-numeric appName',
      LogPrefix.Steam
    )
    return { removed: 0, refused: 0, error: 'invalid appId' }
  }

  let removed = 0
  let refused = 0

  try {
    const copies = await enumerateSteamInstallCopies(appName)

    for (const copy of copies) {
      try {
        const result = await removeSteamInstallCopy(appName, copy.source)
        if (result.status === 'removed') {
          removed += 1
        } else if (result.status === 'refused') {
          refused += 1
        }
      } catch (error) {
        // A single root's removal throwing must not abort the remaining
        // roots (T-LE0-06) — tally it as a refusal and continue the sweep.
        logWarning(
          [
            `removeAllSteamInstallCopies: removeSteamInstallCopy threw for appId ${appName} source '${copy.source}'`,
            error
          ],
          LogPrefix.Steam
        )
        refused += 1
      }
    }

    await pollUninstallOnce(appName, 'native')

    logInfo(
      `removeAllSteamInstallCopies: appId ${appName} swept — removed ${removed}, refused ${refused}`,
      LogPrefix.Steam
    )

    return { removed, refused }
  } catch (error) {
    logWarning(
      [`removeAllSteamInstallCopies: sweep failed for appId ${appName}`, error],
      LogPrefix.Steam
    )
    return { removed, refused, error: 'sweep failed' }
  }
}
