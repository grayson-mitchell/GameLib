// finalizeToSteam: the TS honest-empty ACF finalize (extracted from ../depot.ts, 62-10; moved
// here with canWriteFullOwnership when the TS download pipeline was deleted, 73-20). Rust
// finalizes every job that downloads; TS only finalizes a zero-depot install and a startup
// resume whose Rust verify failed.

import { logInfo, LogPrefix } from 'backend/logger'
import { readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'path'
import { writeAppManifest } from './appManifest'
import { assertNumericAppId } from './plan'
import { readAppManifestFlagsTs } from '../library/manifestFlags'
import { isFullyInstalledStateFlags } from '../library/installedMap'
import { type DepotDownloadFailure, type DepotSteamUser } from './planModel'

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 (21-06)/Phase 23 (23-02): finalizeToSteam — the SINGLE recovery
// mechanism (Pattern 5, D-04/D-05/D-07). Cancel, failure, and full success
// ALL converge here: measure REAL bytes on disk (never a manifest-derived
// sum — spike 001: a summed total overshoots multi-depot installs by
// 236MB), then decide StateFlags via the canWriteFullOwnership completeness
// gate (D-01/D-02, spike-003 VALIDATED). When the gate earns it, writes a
// trustworthy StateFlags=4 (full ownership, Steam runs no verify pass) with
// the real public-branch buildid and download-complete byte counts; when it
// doesn't — any missing/ambiguous signal — falls back to the unchanged,
// unconditional StateFlags=1026 verify-handoff Phase 21 already shipped
// (Steam's own verify-and-repair pass reconciles whatever landed against the
// real manifest). The manifest write is always the LAST filesystem action so
// a Retry (re-invoking downloadSteamDepots) never races a partially-written
// .acf (D-07's non-conflicting-paths guarantee).
// ─────────────────────────────────────────────────────────────────────────

/**
 * The single completeness gate (Phase 23, D-01/D-02, spike-003 VALIDATED) deciding whether
 * finalizeToSteam may write StateFlags "4" (full ownership, Steam runs no verify pass) instead
 * of the safe "1026" verify-handoff. Fails CLOSED: every input must positively prove completion.
 * Rust applies the same gate to its own jobs (gamelib-depot acf.rs).
 */
export function canWriteFullOwnership(opts: {
  outcome: 'completed' | 'cancelled'
  failures: DepotDownloadFailure[]
  buildid?: string
  allFilesVerified: boolean
  allModesApplied: boolean
}): boolean {
  return (
    opts.outcome === 'completed' &&
    opts.failures.length === 0 &&
    !!opts.buildid &&
    opts.buildid !== '0' &&
    opts.allFilesVerified === true &&
    opts.allModesApplied === true
  )
}

interface FinalizeDepotEntry {
  /** Steam depot id. STRING — never coerced to Number (T-21-04). */
  depotId: string
  /** 64-bit manifest GID. STRING — never coerced to Number (T-21-04). */
  gid: string
  /** Depot's declared size in bytes (from the DepotPlan, NOT what's actually
   *  on disk — SizeOnDisk is separately measured below). */
  size: number
}

export interface FinalizeToSteamOpts {
  /** The boot-owned SteamUser: the persisted SteamID64 becomes LastOwner (D-66.3-16). */
  steamUser: Pick<DepotSteamUser, 'getPersistedSteamId64'>
  targetSteamappsDir: string
  installdir: string
  name: string
  /** Every depot ATTEMPTED, regardless of per-file success/failure — an
   *  honest, possibly-incomplete InstalledDepots map (D-04). */
  depots: FinalizeDepotEntry[]
  /** Current public-branch buildid, threaded from the plan-time PICS capture
   *  (DepotPlan.buildid) — NEVER re-derived by a second PICS call here
   *  (D-02, RESEARCH.md Pitfall 4). A "0"/absent buildid reads to Steam as
   *  UpdateRequired and always fails the canWriteFullOwnership gate below. */
  buildid?: string
  /** D-01/D-02 completeness-gate inputs, threaded from the DepotDownloadResult
   *  of the run that just attempted this install/resume. Optional: a caller
   *  that omits these (e.g. a finalize invoked with no download attempt at
   *  all) fails CLOSED to the safe 1026 fallback — canWriteFullOwnership
   *  never resolves true on an absent/undefined input. */
  outcome?: 'completed' | 'cancelled'
  failures?: DepotDownloadFailure[]
  allFilesVerified?: boolean
  allModesApplied?: boolean
  /** quick 261110-up7: the Steam beta branch the depots came from; omitted/'public' writes no BetaKey. */
  betaKey?: string
}

/**
 * Recursively sums real file sizes under `root` — the measured on-disk byte
 * total finalizeToSteam writes as SizeOnDisk, NEVER a DepotPlan-derived sum
 * (spike 001: summed totals overshoot multi-depot installs by 236MB). Missing
 * root (nothing landed yet, e.g. a connection failure before any file write)
 * measures as 0, not an error — an honest empty state is still a valid
 * finalize target (D-04).
 */
async function measureInstalledBytes(root: string): Promise<number> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }

  let total = 0
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      total += await measureInstalledBytes(full)
    } else if (entry.isFile()) {
      total += (await stat(full)).size
    }
  }
  return total
}

/**
 * The single recovery function cancel, failure, and success ALL funnel
 * through (Pattern 5). Writes StateFlags "4" (full ownership, Steam runs no
 * verify pass) ONLY when canWriteFullOwnership earns it from the threaded
 * completeness-gate inputs (D-01/D-02, spike-003 VALIDATED); otherwise falls
 * back to the unchanged "1026" verify-handoff via manifest.ts's own default,
 * with a measured (not summed) SizeOnDisk and the honest InstalledDepots map
 * of whatever was attempted.
 */
export async function finalizeToSteam(
  appId: string,
  opts: FinalizeToSteamOpts
): Promise<void> {
  assertNumericAppId(appId)

  // Todo 2026-11-09: a cancelled run must not downgrade a manifest that is
  // already fully installed. TS finalize never downloads, so "nothing fetched"
  // is inherent. outcome undefined (startup resume) is deliberately unaffected.
  if (opts.outcome === 'cancelled') {
    const existing = readAppManifestFlagsTs(opts.targetSteamappsDir, appId)
    if (existing && isFullyInstalledStateFlags(existing.stateFlags)) {
      logInfo(
        `finalizeToSteam: appId ${appId} cancelled over an installed manifest (StateFlags=${existing.stateFlags}); leaving it untouched`,
        LogPrefix.Steam
      )
      return
    }
  }

  const installRoot = resolve(
    opts.targetSteamappsDir,
    'common',
    opts.installdir
  )
  const sizeOnDisk = await measureInstalledBytes(installRoot)

  // SteamID64 of the signed-in user, read from the persisted account — the
  // CM session may already be closed at finalize (a startup-resume finalize,
  // or the idle grace expiring under a long download), so the live client is
  // not the source. LastOwner is a STRING (64-bit), never a JS Number
  // (T-21-04). Falls back to manifest.ts's own "0" default when nothing is
  // persisted.
  const lastOwner = opts.steamUser.getPersistedSteamId64()

  // Phase 23 (23-02, D-01/D-02): the single completeness-gate call site.
  // buildid is ONLY ever the caller-supplied opts.buildid (plan-time PICS
  // capture, D-02) — a fresh PICS product-info lookup is never issued here
  // (RESEARCH.md Pitfall 4). Every gate input defaults to a value that fails
  // CLOSED when the caller omits it (e.g. today's startup-resume finalize,
  // Wave 3), matching canWriteFullOwnership's own fail-closed contract.
  const canWrite4 = canWriteFullOwnership({
    outcome: opts.outcome ?? 'cancelled',
    failures: opts.failures ?? [],
    buildid: opts.buildid,
    allFilesVerified: opts.allFilesVerified ?? false,
    allModesApplied: opts.allModesApplied ?? false
  })
  if (canWrite4) {
    logInfo(
      `Writing StateFlags=4 full-ownership manifest for appId ${appId} ` +
        `(sizeOnDisk=${sizeOnDisk}, buildid=${opts.buildid})`,
      LogPrefix.Steam
    )
  }

  await writeAppManifest(opts.targetSteamappsDir, {
    appId,
    installdir: opts.installdir,
    name: opts.name,
    sizeOnDisk: String(sizeOnDisk),
    lastOwner,
    stateFlags: canWrite4 ? '4' : undefined,
    bytes: canWrite4 ? String(sizeOnDisk) : undefined,
    buildid: canWrite4 ? opts.buildid : undefined,
    betaKey: opts.betaKey,
    installedDepots: opts.depots.map((d) => ({
      depotId: d.depotId,
      manifest: d.gid,
      size: d.size
    }))
  })
}
