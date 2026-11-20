import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamLibrariesDeps } from 'backend/utils'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMPOLL_ACF_ENUMERATE_COPIES,
  RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS,
  RUST_STEAMPOLL_ACF_READ_STATE,
  RUST_STEAMPOLL_ACF_REMOVE_COPY,
  RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING
} from 'common/types/sidecarTransport'
import {
  invokeSteamPoll,
  nativeSteamRoot,
  pollRootsFor
} from '../pollRust/rustSteamPoll'
import type {
  AcfState as RustAcfState,
  RemoveCopyResult as RustRemoveCopyResult
} from '../pollRust/steamPollTypes'
import { DEFAULT_BRIDGE_BOTTLE_NAME, type BottleSettingsDeps } from '../bottle'
import {
  removePerGameBridgeBottle,
  type BottleRemovalDeps
} from '../bridgeBottleLifecycle'
import { NUMERIC_APP_ID } from '../gameConstants'
import type { AcfSource } from './installRoot'

/**
 * Reads the install state of a single appId from its ACF manifest.
 *
 * - 'installed':   manifest present and StateFlags bit 4 set (FullyInstalled)
 * - 'downloading': manifest present but bit 4 unset (download in flight)
 * - 'absent':      no manifest found for this appId in any library path
 * - 'unknown':     the rustInvoke for the library list or the manifest lookup
 *                  rejected (timeout, shell restart). Nothing was learned, so
 *                  no caller may read it as absent (WR-01, 75 review): pollers
 *                  skip the tick, delete paths refuse.
 *
 * `source` selects which steamapps root(s) to scan:
 *  - 'native' (default): every native library path from getSteamLibraries(deps)
 *    — exactly the pre-Phase-17 behavior, byte-for-byte unchanged.
 *  - 'bottle': the single dedicated Phase 17 CrossOver bottle (GameLibSteam)
 *    steamapps root (RESEARCH.md Pitfall 2 — never conflated with the other
 *    roots).
 *  - 'bridge': the single dedicated bridge bottle (GameLibSteamBridge)
 *    steamapps root (D-UAT-24-05) — where the bridge install actually writes
 *    its StateFlags=4 ACF; never conflated with 'native'/'bottle'.
 *
 * Corrupt/unreadable manifests are skipped without throwing (T-2-01 / T-17-05).
 * Exported for unit testing.
 */
export async function readAcfState(
  deps: SteamLibrariesDeps & BottleSettingsDeps,
  appId: string,
  source: AcfSource = 'native'
): Promise<{
  state: 'absent' | 'downloading' | 'installed' | 'unknown'
  stateFlags?: number
  installPath?: string
  sizeOnDisk?: string
  /** ACF buildid; only populated on the 'installed' result. */
  buildid?: string
  /** Bytes downloaded/staged so far, and the totals to compare against —
   *  parsed from the ACF's AppState (strings on disk). Only populated on the
   *  'downloading' result; used to derive a progress
   *  percent for the bottle install path (GAP-17-BOTTLE-PROGRESS). Missing or
   *  non-numeric values default to 0. */
  bytesDownloaded?: number
  bytesToDownload?: number
  bytesStaged?: number
  bytesToStage?: number
}> {
  // Root resolution may throw for an unprovisioned bottle; callers rely on it.
  const roots = pollRootsFor(deps, appId, source)
  let res: RustAcfState
  try {
    res = (await invokeSteamPoll(
      deps as unknown as RustInvokeDeps,
      RUST_STEAMPOLL_ACF_READ_STATE,
      { roots, appId, source }
    )) as RustAcfState
  } catch (error) {
    logWarning(
      `SteamLibraryManager: readAcfState(${appId}, '${source}') could not read manifests, state unknown: ${String(error)}`,
      LogPrefix.Steam
    )
    return { state: 'unknown' }
  }
  if (res.state === 'installed') {
    return {
      state: 'installed',
      stateFlags: res.stateFlags,
      installPath: res.installPath,
      sizeOnDisk: res.sizeOnDisk,
      buildid: res.buildid ?? undefined
    }
  }
  if (res.state === 'downloading') {
    return {
      state: 'downloading',
      stateFlags: res.stateFlags ?? NaN,
      bytesDownloaded: res.bytesDownloaded,
      bytesToDownload: res.bytesToDownload,
      bytesStaged: res.bytesStaged,
      bytesToStage: res.bytesToStage
    }
  }
  return { state: res.state }
}

/**
 * 34.13 review A-13: every OTHER appId in `steamappsDir` whose manifest
 * declares the same `installdir` as `installdirSegment`.
 *
 * WHY THIS EXISTS. `uninstallBottleGameDirectly`'s JSDoc argues its deletion
 * is safe because a shared depot's files live under the OWNING app's own
 * installdir — a SIBLING directory under common/ — and calls that
 * "structurally impossible" to over-delete, "handled by construction". That
 * holds for the SharedDepots case its real-filesystem regression test proves.
 * It does NOT hold for the case the argument silently assumes away: two
 * installed appIds whose ACFs declare the SAME `installdir`. Steam does this
 * routinely — a game and its dedicated-server/tool app, regional SKU
 * variants, demo/base pairs. In that shape `rmSync(installRoot,
 * { recursive: true })` deletes the co-installed app's files, while only
 * `appmanifest_<thisAppId>.acf` is removed, so the other app's manifest
 * survives pointing at a now-empty path and both Steam and GameLib still
 * believe it is installed.
 *
 * A claim stronger than the code supports is the more dangerous half — a
 * later reader trusts it. This makes the claim true instead of narrowing it.
 *
 * Never throws (T-2-01/T-17-05), but unlike the read-only scans an
 * unreadable or unparseable sibling ACF, or an unreadable/over-cap
 * directory, is reported as the `<unknown>` conflict rather than ignored
 * (WR-02): this list gates a recursive delete, so "could not read" must not
 * mean "no conflict". Comparison is case-sensitive and exact, matching the way
 * `installRoot` itself is built (`join(commonRoot, installdirSegment)`).
 *
 * Exported for unit testing.
 */
export async function findOtherManifestsWithInstalldir(
  rust: RustInvokeDeps,
  steamappsDir: string,
  installdirSegment: string,
  selfAppId: string
): Promise<string[]> {
  try {
    return (await invokeSteamPoll(
      rust,
      RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS,
      { steamappsDir, installdir: installdirSegment, appId: selfAppId }
    )) as string[]
  } catch {
    // T-75-55: a transport failure must not read as "no conflict".
    return [UNKNOWN_CONFLICT]
  }
}

const UNKNOWN_CONFLICT = '<unknown>'

/**
 * One entry in the multi-root inventory `enumerateSteamInstallCopies`
 * returns — mirrors the fields `readAcfState`'s 'installed' branch already
 * carries, narrowed to what `removeAllSteamInstallCopies` (removeAllCopies.ts)
 * and the submenu's "Remove all copies…" confirm dialog need.
 */
export interface SteamInstallCopy {
  source: AcfSource
  installPath: string
  sizeOnDisk: string
}

/**
 * quick-260821-le0: the shared multi-root enumeration primitive the todo
 * asked for — probes the SAME fixed `['native','bottle','bridge']` order
 * `pollUninstallOnce` already probes below (D-UAT-24-05/Pitfall 2), the
 * exact set that made HOARD/63000's three-root orphan visible. Does not
 * re-derive per-source steamapps paths; `readAcfState` already owns that
 * mapping. Each probe is individually try/catch-guarded and logged on
 * failure — an unprovisioned bridge bottle throwing must not take the whole
 * enumeration down. `'downloading'` is deliberately excluded: a copy still
 * being written is not a removable install.
 *
 * Exported for unit testing.
 */
export async function enumerateSteamInstallCopies(
  deps: SteamLibrariesDeps & BottleSettingsDeps,
  appId: string
): Promise<SteamInstallCopy[]> {
  try {
    return (await invokeSteamPoll(
      deps as unknown as RustInvokeDeps,
      RUST_STEAMPOLL_ACF_ENUMERATE_COPIES,
      {
        roots: pollRootsFor(deps, appId),
        appId
      }
    )) as SteamInstallCopy[]
  } catch (error) {
    logWarning(
      [
        `SteamLibraryManager: enumerateSteamInstallCopies failed for appId ${appId}`,
        error
      ],
      LogPrefix.Steam
    )
    return []
  }
}

/**
 * quick-260821-le0: outcome of a single-root `removeSteamInstallCopy` call.
 * quick-261016-u1w/D-51-12 (phase 51 plan 05): the 'removed' variant's
 * `bottleRemoved` is present ONLY for source 'bridge' when the resolved
 * bottle was a per-game one (GameLibSteamBridge-<appId>) and a deletion was
 * actually attempted — absent for 'native'/'bottle' sources and for a
 * legacy-shared-bottle removal, where no bottle delete is ever attempted.
 */
export type RemoveCopyResult =
  | {
      status: 'removed'
      source: AcfSource
      manifestOnly: boolean
      bottleRemoved?: boolean
    }
  | { status: 'absent'; source: AcfSource }
  | { status: 'refused'; source: AcfSource; reason: string }

/**
 * quick-260821-le0: deletes ONE root's install copy for `appId`. Ports the
 * guard set from games.ts's `uninstallBottleGameDirectly` verbatim in
 * intent — those guards encode already-paid-for review findings, not
 * reinvented here:
 *  - NUMERIC_APP_ID-shaped check on appId FIRST, before either delete
 *    target (installRoot / manifestPath) is built (34.13 review A-12):
 *    `join` is not containment (Phase 18) — an appId containing `../` would
 *    otherwise relocate the manifest delete target with nothing else
 *    catching it.
 *  - `'downloading'` is an explicit REFUSAL, never folded into the
 *    `'absent'` success branch (34.13 review A-10) — a depot download may
 *    still be writing into the directory.
 *  - `installdirSegment` is derived via the resolve()+relative()+
 *    isAbsolute() containment idiom against THIS root's own `common/`,
 *    rejecting an empty, `..`-prefixed, or absolute result.
 *  - `findOtherManifestsWithInstalldir` guards the SharedDepots/co-installed
 *    hazard (34.13 review A-13): when another appId's manifest declares the
 *    same installdir, only the manifest is removed and the shared directory
 *    is left alone.
 *
 * `uninstallBottleGameDirectly` is NOT routed through this function in this
 * plan — it is a LIVE-CONFIRMED path and its own dedup is a separate
 * refactor. TODO(dedup): route uninstallBottleGameDirectly through this
 * function once that refactor is scheduled.
 *
 * Exported for unit testing.
 */
export async function removeSteamInstallCopy(
  deps: BottleRemovalDeps & SteamLibrariesDeps & BottleSettingsDeps,
  appId: string,
  source: AcfSource
): Promise<RemoveCopyResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy rejected non-numeric appId (source '${source}')`,
      LogPrefix.Steam
    )
    return { status: 'refused', source, reason: 'invalid appId' }
  }

  return removeCopyViaRust(deps, appId, source)
}

/**
 * D-12 / T-80-73: on this arm Rust owns the whole guard set and the deletion; nothing here removes
 * a file. Only the per-game bridge bottle goes through removePerGameBridgeBottle, as on the ts arm.
 */
async function removeCopyViaRust(
  deps: BottleRemovalDeps & SteamLibrariesDeps & BottleSettingsDeps,
  appId: string,
  source: AcfSource
): Promise<RemoveCopyResult> {
  const roots = pollRootsFor(deps, appId, source)
  let res: RustRemoveCopyResult
  try {
    res = (await invokeSteamPoll(
      deps as unknown as RustInvokeDeps,
      RUST_STEAMPOLL_ACF_REMOVE_COPY,
      { roots, appId, source }
    )) as RustRemoveCopyResult
  } catch (error) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy appId ${appId} source '${source}' could not reach Rust: ${String(error)}`,
      LogPrefix.Steam
    )
    return { status: 'refused', source, reason: 'install state unknown' }
  }
  if (res.status === 'absent') return { status: 'absent', source }
  if (res.status === 'refused') {
    return {
      status: 'refused',
      source,
      reason: typeof res.reason === 'string' ? res.reason : 'refused'
    }
  }
  logInfo(
    `SteamLibraryManager: removeSteamInstallCopy removed appId ${appId} source '${source}'`,
    LogPrefix.Steam
  )
  if (res.manifestOnly || !res.bridgeBottle) {
    return { status: 'removed', source, manifestOnly: res.manifestOnly }
  }
  // The caller-side bottle step stays TS: Rust returns only the per-game candidate (80-05).
  if (res.bridgeBottle === DEFAULT_BRIDGE_BOTTLE_NAME) {
    return { status: 'removed', source, manifestOnly: false }
  }
  const bottleResult = await removePerGameBridgeBottle(deps, appId)
  const bottleRemoved = bottleResult.status === 'removed'
  if (!bottleRemoved) {
    // A 'refused' bottle (Phase 82, D-11) is left in place like an 'error' one, never counted as
    // removed; the reason names the check that stopped it.
    const why =
      bottleResult.status === 'refused'
        ? `'refused', ${bottleResult.reason}`
        : `'${bottleResult.status}'`
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy left bridge bottle "${res.bridgeBottle}" in place for appId ${appId} (removePerGameBridgeBottle returned ${why})`,
      LogPrefix.Steam
    )
  }
  return { status: 'removed', source, manifestOnly: false, bottleRemoved }
}

/**
 * Scans all Steam library paths for appmanifest_*.acf files whose StateFlags
 * has bit 4 UNSET (download in progress), and filters to those appIds that
 * are present in the in-memory library Map.
 *
 * Used by SteamLibraryManager.init() to resume polling after an app restart.
 * Exported for unit testing.
 */
export async function scanDownloadingAppIds(
  deps: SteamLibrariesDeps & SteamLibraryStateDeps
): Promise<string[]> {
  try {
    // Rust returns every downloading appId; the libraryState filter stays here (80-05).
    const ids = (await invokeSteamPoll(
      deps as unknown as RustInvokeDeps,
      RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING,
      { roots: { steamRoot: nativeSteamRoot(deps) } }
    )) as string[]
    return ids.filter((id) => deps.steamSession.libraryState.library.has(id))
  } catch {
    return []
  }
}
