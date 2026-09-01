import {
  GameInfo,
  ExecResult,
  InstallArgs,
  InstallPlatform,
  InstallInfo,
  InstalledInfo,
  LaunchOption
} from 'common/types'
import { LibraryManager } from 'common/types/game_manager'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { join, resolve, relative, isAbsolute, sep } from 'path'
import { dialog } from 'backend/platform'
import { spawnSync, execFileSync } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { rmSync } from 'node:fs'
import { parse } from '@node-steam/vdf'
import { isWindows, isMac, isLinux } from 'backend/constants/environment'
import { userHome } from 'backend/constants/paths'
import { getSteamLibraries, getFileSize } from 'backend/utils'
import { sendFrontendMessage } from '../../ipc'
import { notify } from '../../dialog/dialog'
import i18next from 'i18next'
import { SteamUser } from './user'
import {
  isSteamAuthUnlocked,
  currentTriggerLabel,
  noteSteamAuthTrigger
} from './authTrigger'
import {
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore
} from './electronStores'
import { runOnceWhenOnline } from 'backend/online_monitor'
import { library } from './state'
import SteamGame, {
  isNativeInstallInFlight,
  clearForcedWindowsViaBottle
} from './games'
import {
  getBottleSteamappsDir,
  getSteamBottleSettings,
  getBridgeBottleSettings,
  isBottleProvisioned,
  isBridgeBottleReady
} from './bottle'
import {
  buildDepotPlan,
  finalizeToSteam,
  healReconciledFileModes,
  formatEta,
  rollingRateMiBs,
  type FinalizeToSteamOpts
} from './depot'
import { reconcilePartialState } from './depot/reconcile'
import {
  sanitizeInstalldir,
  fallbackInstalldirFor,
  UnsafeInstalldirError
} from './installLocation'
import { bridgeAllowlist } from './bridge/allowlist'
import { depotSignalCaptured } from './metadataCapture'
import {
  captureOwnedAppPlatforms,
  type PlatformCapturePicsClient
} from './platformCapture'

/**
 * Which Steam client's steamapps root an ACF scan/poll should target.
 * 'native' (default) preserves all pre-Phase-17 behavior; 'bottle' scans the
 * dedicated Phase 17 CrossOver bottle's (GameLibSteam) own steamapps dir
 * instead; 'bridge' scans the SEPARATE dedicated bridge bottle
 * (GameLibSteamBridge, D-UAT-24-05) — the bridge install writes its
 * StateFlags=4 ACF there, not into the native or Phase 17 bottle root. All
 * three roots must never be conflated (RESEARCH.md Pitfall 2).
 */
export type AcfSource = 'native' | 'bottle' | 'bridge'

/** Shared options shape for both install/uninstall poller start functions.
 *  `isNativeHandoff` is install-poller-only (ignored by startUninstallPolling)
 *  — see activePolls' isNativeHandoff field docstring for its meaning.
 *  `skippedDepots` is likewise install-poller-only, ignored by
 *  startUninstallPolling — see activePolls' skippedDepots field docstring. */
type PollOptions = {
  intervalMs?: number
  source?: AcfSource
  isNativeHandoff?: boolean
  skippedDepots?: string[]
}

/**
 * Resolves the bottle's own steamapps dir from the dedicated Steam bottle's
 * stored GameSettings (falls back to DEFAULT_STEAM_BOTTLE_NAME internally via
 * getSteamBottleSettings()). Single chokepoint so every bottle-aware scan
 * roots at the same path.
 */
function getBottleSteamappsRoot(): string {
  return getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)
}

/**
 * Resolves the DEDICATED bridge bottle's (GameLibSteamBridge) own steamapps
 * dir from getBridgeBottleSettings() — the bridge install writes its
 * StateFlags=4 appmanifest there, so the post-install poll must read from
 * this exact root, not the native libraries and not the Phase 17
 * getBottleSteamappsRoot() bottle (D-UAT-24-05: the poll previously looked in
 * the wrong location and timed out despite a correctly-written manifest).
 * Mirrors getBottleSteamappsRoot() but is a distinct, never-conflated root
 * (RESEARCH.md Pitfall 2).
 */
export function getBridgeBottleSteamappsRoot(): string {
  return getBottleSteamappsDir(getBridgeBottleSettings().wineCrossoverBottle)
}

// DETAIL-01 gap-fix: Steam installs the depot for the host OS, so the installed
// build reflects the platform GameLib is running on. Report that instead of a
// hardcoded 'Windows' (which made a Mac install read "Windows"). 'Mac'/'linux'/
// 'Windows' are all valid InstallPlatform members matched by the frontend's
// platform detection (['osx','Mac'] / ['linux','Linux']).
function hostInstallPlatform(): InstallPlatform {
  if (isMac) return 'Mac'
  if (isLinux) return 'linux'
  return 'Windows'
}

// Pitfall 3 fix: a bottle-installed game is a Windows depot running under
// Wine/CrossOver — it must ALWAYS report 'Windows', regardless of host OS.
// Only a native-sourced install object should ever consult hostInstallPlatform().
// D-UAT-24-07 fold-in: a 'bridge' install is the SAME kind of Windows depot
// (running under the dedicated GameLibSteamBridge CrossOver bottle) — it must
// also report 'Windows', never fall through to hostInstallPlatform() (which
// would mislabel it as the host 'Mac').
function installPlatformForSource(source: AcfSource): InstallPlatform {
  if (source === 'bottle' || source === 'bridge') return 'Windows'
  return hostInstallPlatform()
}

/** resolve()+relative() containment idiom shared by resolveInstallRoot()
 *  below and uninstallBottleGameDirectly()'s own ACF-installdir guard
 *  (games.ts) — never string-prefix matching ("path.join is not
 *  containment", Phase 18). `root` and `candidate` must already be resolve()'d
 *  by the caller. An EMPTY relative path (candidate === root exactly) does
 *  NOT count as contained — a title's install must occupy a real subpath,
 *  never the common/ root itself. */
function isPathContainedIn(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED):
 * determines which known install root — if any — `installPath` resolves
 * inside. This is the SOLE source of truth for uninstall() routing
 * (games.ts) — never title attributes (windows-only / bottle-eligible /
 * forcedWindowsViaBottle), which may still legitimately
 * drive OTHER decisions (install destination, launch path).
 *
 * Checks, in order:
 *  1. the CrossOver bottle's steamapps/common/ (getBottleSteamappsRoot() —
 *     the SAME root readAcfState('bottle')/pollUninstallOnce('bottle') use)
 *  2. EVERY native Steam library root from getSteamLibraries()
 *     (libraryfolders.vdf) — not just the default
 *     ~/Library/Application Support/Steam path (a host can register more
 *     than one native library)
 *
 * Returns null when installPath resolves inside NEITHER known root — the
 * caller MUST refuse to delete rather than guessing (a stale, empty, or
 * unresolvable install_path must never fall through to deleting anything).
 * Containment-checked via isPathContainedIn() (resolve()+relative(), never
 * string-prefix matching — "path.join is not containment", Phase 18).
 *
 * Deliberately does NOT model the Phase 24 bridge bottle (GameLibSteamBridge)
 * — a THIRD, separately-provisioned root with its own dedicated
 * uninstallBridgeGame()/resolveBridgeGameInstallRoot() removal path
 * (games.ts), routed independently via isBridgeEligible() BEFORE this
 * function is ever consulted. Not part of the bottle-vs-native routing bug
 * this function fixes.
 *
 * The bottle check is unconditional on `isBottleProvisioned()` — this is a
 * pure string/path containment check (no filesystem access), so an
 * unprovisioned bottle simply never contains any real installPath, and
 * skipping the provisioned-guard avoids an extra bottle-readiness dependency
 * for what is otherwise a computation with zero side effects.
 */
export async function resolveInstallRoot(
  installPath: string | undefined
): Promise<'bottle' | 'native' | null> {
  if (!installPath || !installPath.trim()) return null

  const resolvedInstallPath = resolve(installPath)

  if (isMac) {
    const bottleCommonRoot = resolve(getBottleSteamappsRoot(), 'common')
    if (isPathContainedIn(bottleCommonRoot, resolvedInstallPath)) {
      return 'bottle'
    }
  }

  const libraries = await getSteamLibraries()
  for (const libraryPath of libraries) {
    const nativeCommonRoot = resolve(libraryPath, 'steamapps', 'common')
    if (isPathContainedIn(nativeCommonRoot, resolvedInstallPath)) {
      return 'native'
    }
  }

  return null
}

/**
 * D-UAT-24-02 (core, gap-closure plan 24-17): for a bridge-eligible Steam
 * title, install-state must be AUTHORITATIVE TO THE BRIDGE BOTTLE — a native
 * macOS build and/or a Phase 17 `GameLibSteam` bottle install must NOT
 * satisfy is_installed for that appId, because Play routes a bridge-eligible
 * title through the bridge launch path regardless of where a non-bridge copy
 * lives. Without this, a bridge-eligible game "installed" only natively or
 * in the Phase 17 bottle shows Play, Play routes to the bridge, and the
 * bridge bottle doesn't contain the game — dead-ending at "steam bridge not
 * available" (hardware-confirmed: Avernum 6 / Hoard, 24-UAT.md).
 *
 * Mirrors games.ts's `isBridgeEligible()` composition — `isBottleEligible()`
 * (isMac + mac_arch==='32' OR (platformsCaptured===true AND
 * is_mac_native===false)) AND `bridgeAllowlist.has(appId)` — reading
 * `steamMetadataStore` directly rather than importing games.ts, so the
 * existing library.ts <-> games.ts import cycle is not deepened.
 *
 * DELIBERATELY EXCLUDES games.ts's `bridgeFailedThisSession` — that set is
 * module-scoped/transient/unexported session state (a single recoverable
 * bridge failure), not durable eligibility. Importing it would deepen the
 * cycle, and a transient session failure must never permanently flip
 * install-state (which persists to steamLibraryStore) — only the DURABLE
 * eligibility signal (allowlist + mac + arch) belongs here.
 *
 * Never throws on a missing metadata cache entry — `meta` is undefined for
 * an app never fetched, in which case the mac/arch gate is false and this
 * returns false (falls through to the existing native/bottle precedence).
 */
function isBridgeAuthoritativeForInstallState(appIdStr: string): boolean {
  if (!isMac) return false
  if (!bridgeAllowlist.has(appIdStr)) return false
  const meta = steamMetadataStore.get(appIdStr)
  if (meta?.mac_arch === '32') return true
  // Quick task 260816-hdg PIN — this gate deliberately keeps the raw read and
  // must NOT be routed through depotSignalCaptured. It asks the MAC question,
  // and a pre-D-17 residue entry genuinely did capture its mac answer;
  // narrowing here would de-route bottle/bridge-eligible games for a fact the
  // cache already knows. A source assertion in metadataCapture.test.ts holds
  // this line in place so it cannot be silently "corrected" later.
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}

/**
 * Maps the host OS to Steam's depot `oslist` vocabulary ('windows'|'macos'|
 * 'linux') for buildDepotPlan's `os` param — the SAME mapping games.ts's own
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
async function locateDownloadingTarget(appId: string): Promise<{
  targetSteamappsDir: string
  installdir: string
  name: string
} | null> {
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    const manifestFile = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(manifestFile)) continue

    try {
      const content = readFileSync(manifestFile, 'utf-8')
      const parsed = parse(content)
      const installdir = parsed?.AppState?.installdir
      if (!installdir) continue

      return {
        targetSteamappsDir: steamappsDir,
        installdir,
        name: library.get(appId)?.title ?? installdir
      }
    } catch {
      continue // skip corrupt ACF — same discipline as readAcfState (T-2-01)
    }
  }

  return null
}

/**
 * Phase 23 (23-03, D-04): rebuilds a real DepotPlan for a startup-resumed
 * appId and reconciles it against on-disk state, returning the real
 * gate-input FinalizeToSteamOpts a trustworthy resume needs (real
 * depots/buildid/outcome/failures/allFilesVerified/allModesApplied) instead
 * of the honest-but-uninformative empty `depots: []` Wave 2 left behind.
 * A fully-reconciled-verified resume can earn StateFlags=4 via
 * finalizeToSteam's own canWriteFullOwnership gate; a resume where
 * reconciliation finds genuinely missing/mismatched files reports them as
 * failures, which fails that same gate CLOSED to the safe 1026 fallback
 * (T-23-09).
 *
 * NEVER throws — buildDepotPlan/reconcilePartialState failing for ANY
 * reason (offline, a dropped CM connection, a corrupt PICS response) falls
 * back to the pre-23-03 honest-empty `depots: []` shape, which itself fails
 * CLOSED to 1026 via finalizeToSteam's own optional-field defaults. This is
 * the ONLY way startup resume can degrade — it never crashes init().
 *
 * PRESERVES the confirmed-safe invariant (RESEARCH Pitfall 5): buildDepotPlan
 * only reads PICS + fetches manifests over the already-authenticated CM
 * connection — the exact same network calls a fresh install already
 * performs. It never touches getBottleSteamappsDir()/tellBottledSteamToInstall
 * — no silent Steam-in-CrossOver auto-open is introduced here.
 */
async function buildResumeFinalizeOpts(
  appId: string,
  target: { targetSteamappsDir: string; installdir: string; name: string }
): Promise<FinalizeToSteamOpts> {
  // WR-03 (23-code-review): target.installdir is read directly off the
  // on-disk ACF's AppState.installdir (locateDownloadingTarget) with no
  // sanitization of its own — route it through the same containment +
  // denylist guard (D-02/D-04) the fresh-install path (installLocation.ts's
  // resolveSteamInstallTarget) already enforces before it ever reaches
  // buildDepotPlan/resolve() below. Defense-in-depth: an attacker would
  // already need local write access to steamapps/ to plant a hostile ACF,
  // but every filesystem-root-building value must be guarded the same way
  // regardless of caller.
  //
  // D-04: sanitizeInstalldir may THROW UnsafeInstalldirError on a
  // containment/denylist violation. This function's own contract (above)
  // promises it NEVER throws — resumeInterruptedSteamInstall runs during
  // startup and a throw here would crash init(). A dedicated guard around
  // ONLY this call (not the wider try block below, which must keep
  // swallowing exactly the buildDepotPlan/reconcile failures it already
  // does) catches the rejection, logs it at ERROR naming the appId and the
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
      name: target.name,
      depots: []
    }
  }

  try {
    const plan = await buildDepotPlan(appId, {
      targetSteamappsDir: target.targetSteamappsDir,
      installdir,
      os: hostSteamDepotOsForResume()
    })

    const installRoot = resolve(target.targetSteamappsDir, 'common', installdir)
    const { jobs, allFilesVerified } = await reconcilePartialState(
      plan,
      installRoot
    )

    // CR-01 gap closure (23-code-review): allFilesVerified is a CONTENT-only
    // (sha1) verdict from reconcilePartialState — it proves nothing about
    // file mode bits. A crash exactly between an earlier session's
    // downloadSingleFile whole-file sha1 check succeeding and its own
    // mode-application call leaves a file that is byte-perfect (verifies)
    // but was NEVER chmod'd. So this path must actually RE-RUN mode
    // application/healing for every reconciler-trusted file — never infer
    // "modes applied" from content verification alone. Reuses the exact same
    // guarded heal step downloadDepotFiles' own fresh-install/live-resume
    // path runs (healReconciledFileModes, shared in depot.ts) so this path
    // can never silently diverge from that discipline.
    const jobFiles = new Set(jobs.map((job) => job.file))
    const { allModesHealed, failures: healFailures } =
      await healReconciledFileModes(plan, installRoot, jobFiles)

    return {
      targetSteamappsDir: target.targetSteamappsDir,
      installdir,
      name: target.name,
      depots: plan.depots.map((d) => ({
        depotId: d.depotId,
        gid: d.gid,
        size: d.files.reduce((sum, f) => sum + Number(f.size), 0)
      })),
      buildid: plan.buildid,
      // D-05: reconciliation fills first-install/resume gaps only — a job
      // left over here means genuinely missing/mismatched content, reported
      // as a failure (not silently dropped), never re-downloaded from this
      // startup path (Pitfall 4).
      outcome: jobs.length === 0 ? 'completed' : 'cancelled',
      failures: [
        ...jobs.map((job) => ({
          file: job.file.filename,
          error:
            'missing or content-mismatched on startup resume (not re-downloaded — ' +
            'startup resume never re-invokes the depot orchestrator, Pitfall 4)'
        })),
        ...healFailures
      ],
      allFilesVerified,
      // CR-01: only true once modes were ACTUALLY re-applied/healed THIS run
      // AND that healing succeeded for every file — a healing failure (or a
      // healing step that never ran) forces this false, so
      // canWriteFullOwnership falls back to the safe 1026 verify-handoff
      // instead of a wrongful StateFlags=4.
      allModesApplied: allFilesVerified && allModesHealed
    }
  } catch (planErr) {
    logWarning(
      [
        `Steam: startup resume plan rebuild/reconciliation failed for appId ${appId}, ` +
          'falling back to the honest-empty 1026 finalize:',
        planErr
      ],
      LogPrefix.Steam
    )
    return {
      targetSteamappsDir: target.targetSteamappsDir,
      installdir,
      name: target.name,
      depots: []
    }
  }
}

/**
 * steam-startup-resume-crash (2026-07-18) / D-04 softened: user-initiated
 * counterpart to init()'s detect-only surfacing below. Performs the SAME
 * locate -> rebuild-plan -> reconcile -> finalize -> watch sequence init()
 * used to run UNATTENDED on every launch — now it only runs when the user
 * actually triggers a resume (SteamGame.install() calls this first when the
 * library entry is flagged steamResumePending). Moving buildDepotPlan's
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
  appId: string
): Promise<void> {
  try {
    // Clear the pending-resume marker up front — this call IS the resume
    // attempt; it must never be left stuck "pending" after the user has
    // already acted on it, even if the finalize step below fails.
    const existing = library.get(appId)
    if (existing?.install?.steamResumePending) {
      const updated: GameInfo = {
        ...existing,
        install: { ...existing.install, steamResumePending: false }
      }
      library.set(appId, updated)
      sendFrontendMessage('pushGameToLibrary', updated)
    }

    try {
      const target = await locateDownloadingTarget(appId)
      if (target) {
        const finalizeOpts = await buildResumeFinalizeOpts(appId, target)
        await finalizeToSteam(appId, finalizeOpts)
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

    startInstallPolling(appId)
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
 * D-UAT-09 (21-17): marks a Steam library entry as incomplete/resumable
 * after a SAME-SESSION native depot-download cancel (games.ts's
 * runNativeDepotDownload cancelled branch) — the one cancel path init()'s
 * startup-surface scan (above) does NOT cover, since the process never
 * restarted. Mirrors init()'s startup-surface pattern (surface as
 * resumable, never auto-drive) and reuses the existing steamResumePending
 * field (types.ts) rather than inventing a new one. Persists immediately
 * (GAP-17-BOTTLE-STORE-DIVERGENCE precedent — see pollInstallOnce's
 * 'installed' branch) so a restart mid-cancel can't read a stale
 * is_installed:true from steamLibraryStore. A no-op (never throws) when the
 * appId has no in-memory library entry — matches every other per-appId
 * surfacing helper in this file.
 */
export function markSteamInstallIncomplete(appId: string): void {
  const existing = library.get(appId)
  if (!existing) return

  const updated: GameInfo = {
    ...existing,
    is_installed: false,
    install: { ...existing.install, steamResumePending: true }
  }
  library.set(appId, updated)
  steamLibraryStore.set('games', Array.from(library.values()))
  sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * 260821-rb5: persists a crash-surviving breadcrumb the MOMENT a native
 * depot download starts (games.ts's runNativeDepotDownload, synchronously
 * before the downloadSteamDepots await), so a hard kill (kill -9, crash,
 * power loss) — which leaves partial bytes on disk with NO appmanifest_*.acf
 * (case C of
 * .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md) —
 * still leaves a record somewhere init() can find it. `targetSteamappsDir`
 * and `installdir` are the values ACTUALLY resolved for this run (including
 * a bottle-root override), never re-derived or guessed later.
 *
 * Deliberately does NOT set `is_installed: false`, unlike
 * markSteamInstallIncomplete above — this runs at install START, and on an
 * update/reinstall the existing complete install is still launchable at
 * this moment, so dropping Play here would be a lie. The interrupted-update
 * sub-case self-heals instead (its .acf still has bit 4 set, so the startup
 * self-heal in init() below clears the breadcrumb rather than surfacing
 * it) — that is the conservative, non-nagging outcome and is intended, not
 * an oversight.
 *
 * No-op (never throws) when the appId has no in-memory library entry —
 * matches every other per-appId surfacing helper in this file. Persists
 * IMMEDIATELY (same markSteamInstallIncomplete sequence) so a kill
 * microseconds later already finds it on disk.
 */
export function markSteamNativeInstallStarted(
  appId: string,
  breadcrumb: { targetSteamappsDir: string; installdir: string }
): void {
  const existing = library.get(appId)
  if (!existing) return

  const updated: GameInfo = {
    ...existing,
    install: {
      ...existing.install,
      steamResumePending: true,
      steamResumeTargetSteamappsDir: breadcrumb.targetSteamappsDir,
      steamResumeInstalldir: breadcrumb.installdir
    }
  }
  library.set(appId, updated)
  steamLibraryStore.set('games', Array.from(library.values()))
  sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * 260821-rb5: clears the install-start breadcrumb above. Called both on a
 * successful native depot run (the ACF-derived path now covers this appId,
 * so keeping the breadcrumb would double-surface it) and at startup by
 * init()'s self-heal (a breadcrumb whose appId turns out to already have a
 * fully-installed on-disk manifest — see breadcrumbAppIsFullyInstalledOnDisk
 * below).
 *
 * Strips both breadcrumb fields by deleting them rather than setting them to
 * '' — absence is the discriminator getSteamResumeBreadcrumbAppIds reads.
 * No-op when there is no entry, or when the entry carries neither breadcrumb
 * field nor steamResumePending, avoiding a pointless whole-library
 * re-persist on every success.
 */
export function clearSteamResumeBreadcrumb(appId: string): void {
  const existing = library.get(appId)
  if (!existing) return
  if (
    !existing.install?.steamResumePending &&
    !existing.install?.steamResumeTargetSteamappsDir &&
    !existing.install?.steamResumeInstalldir
  ) {
    return
  }

  const install = { ...existing.install }
  delete install.steamResumeTargetSteamappsDir
  delete install.steamResumeInstalldir

  const updated: GameInfo = {
    ...existing,
    install: { ...install, steamResumePending: false }
  }
  library.set(appId, updated)
  steamLibraryStore.set('games', Array.from(library.values()))
  sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * 260821-rb5: pure in-memory read over `library` — returns appIds whose
 * install-start breadcrumb is present (both steamResumeInstalldir AND
 * steamResumeTargetSteamappsDir set). Cannot throw. Exported for unit
 * testing, and consumed by init() to union with the ACF-derived
 * scanDownloadingAppIds() result — case C by definition leaves no ACF, so
 * the breadcrumb is the ONLY record for that case.
 */
export function getSteamResumeBreadcrumbAppIds(): string[] {
  const ids: string[] = []
  for (const [appId, info] of library.entries()) {
    if (
      info.install?.steamResumeInstalldir &&
      info.install?.steamResumeTargetSteamappsDir
    ) {
      ids.push(appId)
    }
  }
  return ids
}

/**
 * 260821-rb5 self-heal predicate: is a breadcrumb-carrying appId ALREADY
 * fully installed on disk? Checked at the breadcrumb's OWN persisted
 * `steamResumeTargetSteamappsDir` rather than re-scanning
 * getSteamLibraries() — the only way a bottle-rooted install
 * (targetSteamappsDirOverride) is checkable at all here. Reuses
 * isFullyInstalledStateFlags so the installed/incomplete bit logic can
 * never diverge from buildInstalledMap/buildIncompleteInstallSet.
 *
 * False (never surfaces a false-positive clear) when the breadcrumb dir is
 * absent, when no ACF exists yet (the case-C path — no manifest means
 * SURFACE, not clear), or on any throw / corrupt ACF / NaN StateFlags — fail
 * toward surfacing, since surfacing is non-destructive (matches the "skip
 * corrupt ACF" discipline used elsewhere in this file).
 */
function breadcrumbAppIsFullyInstalledOnDisk(
  appId: string,
  install: Partial<InstalledInfo> | undefined
): boolean {
  if (!install?.steamResumeTargetSteamappsDir) return false

  try {
    const manifest = join(
      install.steamResumeTargetSteamappsDir,
      `appmanifest_${appId}.acf`
    )
    if (!existsSync(manifest)) return false

    const content = readFileSync(manifest, 'utf-8')
    const parsed = parse(content) as {
      AppState?: { StateFlags?: string }
    }
    const stateFlags = parseInt(parsed?.AppState?.StateFlags ?? '', 10)
    if (Number.isNaN(stateFlags)) return false

    return isFullyInstalledStateFlags(stateFlags)
  } catch {
    return false
  }
}

export default class SteamLibraryManager implements LibraryManager {
  /**
   * On startup: load the cached library immediately, SURFACE (never
   * auto-drive) any in-progress install detected on disk (D-07, softened by
   * steam-startup-resume-crash / D-04), then trigger a background sync when
   * online and logged in (D-01 / D-09).
   */
  async init(): Promise<void> {
    // One-time migration: portrait library capsule replaced the cropped
    // landscape capsule. Rewrite any stale art URLs already in the caches so
    // existing libraries pick up the new art without a manual cache clear.
    this.migrateStaleArtUrls()

    const cached = steamLibraryStore.get('games', [])
    if (cached.length) {
      library.clear()
      cached.forEach((g) => {
        library.set(g.app_name, g)
        sendFrontendMessage('pushGameToLibrary', g)
      })
      logInfo(
        `Steam: loaded ${cached.length} games from cache`,
        LogPrefix.Steam
      )
    }

    // steam-startup-resume-crash (2026-07-18) / D-04 softened: DETECT any
    // in-progress download left on disk (D-07) and SURFACE it as resumable —
    // never auto-drive it. Previously this block ran the full
    // locate->rebuild-plan->reconcile->finalize->watch sequence UNATTENDED on
    // every launch; a native fatal in that heavy machinery (buildDepotPlan's
    // PICS/manifest fetch and everything chained after it) running
    // immediately after startup was the confirmed root cause of a silent
    // whole-app crash. That sequence now lives in resumeInterruptedSteamInstall()
    // above and only runs when the user explicitly triggers it (their own
    // Install click — see SteamGame.install()). Wrapped in try/catch (outer
    // AND per-appId inner) so neither a scan failure nor a single game's
    // surface step can ever block startup or take down the others.
    // 260821-rb5: case C of the aborted-depot-residue todo (a hard kill —
    // kill -9, crash, power loss — mid native-depot-download) leaves NO
    // appmanifest_*.acf at all, so scanDownloadingAppIds() below can never
    // see it. getSteamResumeBreadcrumbAppIds() is the in-memory (never
    // throws) counterpart, sourced from the install-start breadcrumb
    // (markSteamNativeInstallStarted, games.ts). Unioning the two lists is
    // load-bearing, not additive convenience: without it, case C has no
    // record ANYWHERE after a restart. The ACF scan is narrowed to its own
    // try so a scan failure (which case C triggers by definition — there IS
    // no ACF) can never skip breadcrumb surfacing.
    const breadcrumbIds = getSteamResumeBreadcrumbAppIds()
    const breadcrumbSet = new Set(breadcrumbIds)
    let downloadingIds: string[] = []
    try {
      downloadingIds = await scanDownloadingAppIds()
    } catch (err) {
      logWarning(
        [
          'Steam: scanDownloadingAppIds failed during init, skipping resume:',
          err
        ],
        LogPrefix.Steam
      )
    }

    for (const appId of new Set([...downloadingIds, ...breadcrumbIds])) {
      // T-23-14: a stale on-disk StateFlags=1026 manifest for an appId
      // already owned by a LIVE in-process install (games.ts's
      // nativeInstallsInFlight) must never spawn a phantom concurrent
      // resume path racing it — skip entirely and let the live install own
      // this appId's finalize + poll start (installDepotDownload calls
      // startInstallPolling itself once its own run completes).
      if (isNativeInstallInFlight(appId)) {
        logInfo(
          `Steam: skipping startup resume-surface for appId ${appId} — already owned by a live in-process install`,
          LogPrefix.Steam
        )
        continue
      }

      // Per-appId hardening: surfacing one game's resumable state must
      // never throw out of this loop and never block startup or the
      // other appIds in this list.
      try {
        const existing = library.get(appId)

        // 260821-rb5 self-heal: a breadcrumb-carrying appId whose on-disk
        // manifest turns out to be fully installed (e.g. Steam itself
        // finished the download after the kill, or a stale breadcrumb from
        // a completed update) must be CLEARED, not surfaced. Without this,
        // a killed-then-Steam-completed install would nag "resume" on
        // every launch forever — the breadcrumb has no other clear point,
        // since case C never reaches the success-route clear in
        // runNativeDepotDownload.
        if (
          breadcrumbSet.has(appId) &&
          breadcrumbAppIsFullyInstalledOnDisk(appId, existing?.install)
        ) {
          clearSteamResumeBreadcrumb(appId)
          logInfo(
            `Steam: appId ${appId} carried a 260821-rb5 install-start breadcrumb but its on-disk manifest is fully installed — clearing the breadcrumb instead of surfacing it`,
            LogPrefix.Steam
          )
          continue
        }

        if (existing) {
          const updated: GameInfo = {
            ...existing,
            install: { ...existing.install, steamResumePending: true }
          }
          library.set(appId, updated)
          sendFrontendMessage('pushGameToLibrary', updated)
        }

        logInfo(
          `Steam: appId ${appId} has an interrupted install detected on startup — surfacing as resumable, NOT auto-resuming`,
          LogPrefix.Steam
        )

        notify({
          title: existing?.title ?? '',
          body: i18next.t(
            'gamelib:steam.resumeAvailable.notify',
            'An interrupted install for {{game}} is ready to resume — click Install to continue',
            { game: existing?.title ?? '' }
          )
        })
      } catch (surfaceErr) {
        logWarning(
          [
            `Steam: failed to surface resumable install for appId ${appId} (never blocks startup):`,
            surfaceErr
          ],
          LogPrefix.Steam
        )
      }
    }

    // Background sync once per session (D-01 / D-03). quick-260817-d61: names
    // the deferral's log line 'startup' rather than an empty label — the gate
    // itself lives at the top of refresh() below, not here; this call never
    // unlocks anything (noteSteamAuthTrigger('startup') is never deliberate).
    if (SteamUser.isLoggedIn()) {
      noteSteamAuthTrigger('startup')
      runOnceWhenOnline(() => this.refresh())
    }

    // Start the running-game poller (GAME-05 / D-06). Idempotent, so a re-init
    // is safe. Stopped on app quit from main.ts. Because the Electron main
    // process only runs while the app is open, this satisfies "poll only while
    // the app window is open" without per-window tracking.
    startRunningPoll()
  }

  getGame(id: string): SteamGame {
    return new SteamGame(id)
  }

  /**
   * Rewrite cached `art_square` URLs from the old landscape capsule
   * (capsule_616x353) to the portrait library capsule (library_600x900) in both
   * the per-game metadata cache and the persisted library list. Idempotent — a
   * no-op once every entry has been migrated. Done in place so games keep their
   * art (the new URL resolves for the same appId) with no blank-art flash.
   */
  private migrateStaleArtUrls(): void {
    const OLD_ART = 'capsule_616x353.jpg'
    const NEW_ART = 'library_600x900.jpg'

    // Per-game metadata cache (refresh() rebuilds art_square from here, so this
    // must be fixed or the next sync would re-apply the old URL).
    for (const [appId, meta] of steamMetadataStore.entries()) {
      if (meta?.art_square?.includes(OLD_ART)) {
        steamMetadataStore.set(appId, {
          ...meta,
          art_square: meta.art_square.replace(OLD_ART, NEW_ART)
        })
      }
    }

    // Persisted library list (what init() loads and pushes to the frontend).
    const games = steamLibraryStore.get('games', [])
    let changed = false
    const migrated = games.map((game) => {
      if (game.art_square?.includes(OLD_ART)) {
        changed = true
        return {
          ...game,
          art_square: game.art_square.replace(OLD_ART, NEW_ART)
        }
      }
      return game
    })
    if (changed) {
      steamLibraryStore.set('games', migrated)
      logInfo(
        `Steam: migrated ${migrated.filter((g) => g.art_square.includes(NEW_ART)).length} cached cover URLs to portrait art`,
        LogPrefix.Steam
      )
    }
  }

  /**
   * Fetch the full owned game list + playtime from Steam CM, merge local ACF
   * install state, push each game to the frontend, persist the list and sync
   * timestamp.  Falls back to the cached library if the CM call fails (D-09).
   */
  async refresh(): Promise<ExecResult | null> {
    // quick-260817-d61: exit path 0 of the five now on this method — checked
    // BEFORE the 'syncing' emit below, so an automatic (unattended) refresh
    // never touches the keyring at all. `init()` has ALREADY pushed the
    // cached library to the frontend by the time this can be reached from
    // startup (see init() above), so emitting 'idle' here — rather than
    // emitting nothing — renders a populated grid, never an empty one, and
    // also clears any stale 'syncing' a prior run left behind. Deliberate
    // Steam actions (Install/Play/game-page-open/explicit-Refresh/login) call
    // `noteSteamAuthTrigger`/`noteRefreshTrigger` before reaching here, which
    // unlocks the gate for the rest of this process's lifetime (sticky —
    // see authTrigger.ts's own doc comment for why a non-sticky gate would be
    // a worse bug than the one this plan fixes).
    if (!isSteamAuthUnlocked()) {
      logInfo(
        `Steam: library refresh deferred until a deliberate Steam action — no keyring_get issued (trigger=${currentTriggerLabel()})`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamSyncStatus', { status: 'idle' })
      return null
    }

    // 34.15 D-06/D-07: emitted as the very first statement of refresh() —
    // this is what gives the Steam sync tri-state STRUCTURAL meaning ("a
    // refresh is currently running"), a property the boolean this tri-state
    // replaces (GlobalState.tsx's old background-refresh flag) never had —
    // that flag defaulted true and was reset to true after every unscoped
    // refresh, so it could never distinguish "running" from anything else.
    sendFrontendMessage('steamSyncStatus', { status: 'syncing' })

    // The steam-user client is in-memory and dies on app restart — reconnect
    // from the persisted refresh token before syncing.
    const connected = await SteamUser.ensureConnected()
    const client = SteamUser.getClient()
    if (!connected || !client || !client.steamID) {
      logWarning(
        'Steam client not ready, skipping library refresh',
        LogPrefix.Steam
      )
      // 34.15 D-07 exit path 1 of 4.
      sendFrontendMessage('steamSyncStatus', {
        status: 'failed',
        reason: 'client-not-ready'
      })
      return null
    }

    // ── Step 1: fetch owned games + playtime from Steam CM ────────────────
    let ownedApps: Array<{
      appid: number
      name: string
      playtime_forever: number
      img_icon_url?: string
      /** Unix seconds — exists at runtime in CPlayer_GetOwnedGames_Response_Game but omitted from @types/steam-user */
      rtime_last_played?: number
    }> = []
    try {
      const result = await client.getUserOwnedApps(client.steamID, {
        includePlayedFreeGames: true
      })
      ownedApps = result.apps
      logInfo(`Steam: fetched ${ownedApps.length} owned games`, LogPrefix.Steam)
    } catch (err) {
      logError(['Steam getUserOwnedApps failed:', err], LogPrefix.Steam)
      // Offline / CM-unreachable fallback — serve cached library (D-09)
      const cached = steamLibraryStore.get('games', [])
      cached.forEach((g) => sendFrontendMessage('pushGameToLibrary', g))
      // 34.15 D-07 exit path 2 of 4. Emitted AFTER the cached-library push
      // loop above so the renderer already has the cached games in hand
      // before it is told the sync failed — the notice must render above a
      // populated grid, never an empty one.
      sendFrontendMessage('steamSyncStatus', {
        status: 'failed',
        reason: 'owned-apps-failed'
      })
      return { stdout: '', stderr: String(err) }
    }

    // ── Step 1.5: bulk-capture platform data from PICS (34.15 D-01..D-04) ──
    // WHY HERE (D-03): the CM client is already connected and the owned-app
    // id list is already in hand, so this is one bulk call on a live socket.
    // Placing it before the Step 3 hydration loop means every `GameInfo` is
    // correct on its FIRST push — no re-push, no second IPC event, no
    // convergence window, no resumability machinery.
    //
    // WHY FAIL-SOFT: the bulk capture call below never throws by contract; on
    // timeout or error it returns `failed: true` and the sync continues to
    // today's cache-only hydration below. Fail-closed is this repo's house
    // default and 34.14 D-04's depot fail-open is the first documented
    // exception; this is the SECOND. Aborting here would trade "incomplete
    // metadata" for "no library", which is defect 2's exact shape — a later
    // reviewer must not "fix" this back to fail-closed.
    //
    // WHY THIS DOES NOT MAKE THE DATA COMPLETE (D-05 — the non-consequence):
    // four durable paths keep an unresolved signal reachable for a game that
    // is VISIBLE in the library — (1) this step failing soft; (2) a per-app
    // absent/empty `oslist` correctly writing nothing; (3) the cached-library
    // early returns above (exit paths 1 and 2), neither of which runs this
    // step while games still render; (4) `init()` pushing the persisted list
    // to the frontend independently of `refresh()`, so the library is on
    // screen from the first frame of every cold start. Therefore 34.14's
    // D-04 fail-open, the pending row, and the Install-disable ALL remain
    // load-bearing and must not be weakened, removed, or "simplified" on the
    // grounds that the data is complete now.
    const appIds = ownedApps.map((app) => app.appid)
    const captureSummary = await captureOwnedAppPlatforms(
      client as unknown as PlatformCapturePicsClient,
      appIds
    )
    logInfo(
      `Steam bulk platform capture: scoped=${captureSummary.scopedCount} captured=${captureSummary.capturedCount} skipped=${captureSummary.skippedCount} failed=${captureSummary.failed}`,
      LogPrefix.Steam
    )

    // 34.15 D-07 exit path 4 of 4 — the previously UNDOCUMENTED one. Steps 2-4
    // below carried NO try/catch at HEAD, so a hydration-loop exception (e.g.
    // a corrupt ACF file, a throwing map builder) became an unhandled
    // rejection with ZERO ui signal on the unscoped mount-time path
    // (init()'s `runOnceWhenOnline(() => this.refresh())`;
    // online_monitor.ts's runOnceWhenOnline discards the callback's return
    // value with no `.catch` anywhere in the chain). The two obvious
    // `return`s above are NOT the exhaustive exit census — this wraps the
    // ~140-line uncovered span. Re-throwing after emitting preserves the
    // existing main.ts refreshLibrary IPC-rejection shape for the scoped
    // caller (GlobalState's own catch already handles it); the emit is what
    // closes the silent mount-time path.
    try {
      // ── Step 2: build install-state map(s) from ACF manifests on disk ─────
      // Bottle-aware (GAP-17-BOTTLE-PLAY-REVERT): this full resync can be
      // triggered mid-session (e.g. the launch-completion 'done' status), so it
      // must reconcile bottle-installed games the same way refreshInstallState()
      // does — otherwise a bottle-only-installed game's is_installed gets
      // clobbered back to false by this native-only scan every time it runs.
      const installedMap = await buildInstalledMap()
      const bottleInstalledMap =
        isMac && isBottleProvisioned() ? await buildBottleInstalledMap() : null
      // D-UAT-24-07: consult the bridge bottle too, so a bridge-installed game
      // (24-12's install poll flips is_installed:true on install) stays
      // installed across this periodic sync instead of being clobbered back to
      // false — gated the same way as the Phase 17 bottle map (isMac +
      // provisioned check), so non-mac/unprovisioned environments skip this
      // scan entirely (no new failing scan, native/bottle behavior unchanged).
      const bridgeInstalledMap =
        isMac && isBridgeBottleReady() ? await buildBridgeInstalledMap() : null
      // WR-01 (21-17): the incomplete-on-disk set (native ACF present, bit 4
      // unset — e.g. a 1026 cancel handoff). Because this rebuild does
      // library.clear() below and derives each GameInfo purely from the ACF
      // scan, the same-session steamResumePending marker (markSteamInstallIncomplete)
      // would otherwise be silently wiped on the first mid-session resync,
      // reverting "Resume Install" back to a bare "Install" (the D-UAT-09
      // symptom). Deriving the flag from on-disk state here makes it durable
      // across any number of refreshes.
      const incompleteSet = await buildIncompleteInstallSet()

      // 260821-rb5: capture install-start breadcrumbs BEFORE library.clear()
      // below wipes the in-memory Map. refresh() rebuilds every GameInfo
      // purely from the ACF scan + ownership data, and a case-C breadcrumb
      // has NO ACF by definition — the same wipe shape WR-01/D-UAT-09
      // already had to fix for the ACF-derived steamResumePending flag
      // above, but for a field the ACF scan can never re-derive. Without
      // this, the first mid-session resync — which init() itself kicks off
      // via runOnceWhenOnline(() => this.refresh()) — silently wipes the
      // breadcrumb and the whole fix evaporates.
      const breadcrumbs = new Map<
        string,
        { targetSteamappsDir: string; installdir: string }
      >()
      for (const [appId, info] of library.entries()) {
        if (
          info.install?.steamResumeTargetSteamappsDir &&
          info.install?.steamResumeInstalldir
        ) {
          breadcrumbs.set(appId, {
            targetSteamappsDir: info.install.steamResumeTargetSteamappsDir,
            installdir: info.install.steamResumeInstalldir
          })
        }
      }

      // ── Step 3: build and push one GameInfo per owned game ────────────────
      library.clear()
      for (const app of ownedApps) {
        const appIdStr = String(app.appid)
        const nativeInstalledData = installedMap.get(app.appid)
        const bottleInstalledData = bottleInstalledMap?.get(app.appid)
        const bridgeInstalledData = bridgeInstalledMap?.get(app.appid)
        // D-UAT-24-02 (24-17): for a bridge-eligible title, install-state is
        // authoritative to the bridge bottle ONLY — native/Phase-17-bottle
        // copies must not shadow the bridge (they'd show Play while the
        // bridge bottle doesn't have the game, dead-ending the launch).
        // Precedence for NON-eligible titles is unchanged: native wins, then
        // Phase 17 bottle, then bridge — never double-count/conflate the
        // three roots (mirrors refreshInstallState()'s reconciliation;
        // D-UAT-24-07 adds the bridge tier last so native/bottle behavior is
        // byte-for-byte unchanged when they match).
        const bridgeAuthoritative =
          isBridgeAuthoritativeForInstallState(appIdStr)
        const installedData = bridgeAuthoritative
          ? bridgeInstalledData
          : (nativeInstalledData ?? bottleInstalledData ?? bridgeInstalledData)
        const source: AcfSource = bridgeAuthoritative
          ? 'bridge'
          : nativeInstalledData
            ? 'native'
            : bottleInstalledData
              ? 'bottle'
              : 'bridge'
        const cachedMeta = steamMetadataStore.get(appIdStr)

        const gameInfo: GameInfo = {
          runner: 'steam',
          app_name: appIdStr,
          title: app.name,
          // Seed artwork from metadata cache so previously fetched art survives resync
          art_cover: cachedMeta?.art_cover ?? '',
          art_square: cachedMeta?.art_square ?? '',
          // DETAIL-01: seed native platform flags from the metadata cache so the
          // platform icons survive a resync (fetchMetadataIfNeeded populates these).
          // D-17: is_windows_native is deliberately NOT defaulted (34.13
          // review WR-16). Both `common/types.ts` and `electronStores.ts`
          // document this field as THREE-valued: `undefined` means "never
          // captured (pre-34.13 entry)", `false` means "confirmed no Windows
          // depot", and only `=== true` permits offering a Windows install.
          // Collapsing `undefined -> false` here destroyed the first state at
          // the `GameInfo` boundary, so the renderer
          // (`steamPlatformRow.ts`) could no longer tell a cold-cache game
          // from a confirmed Windows-less one. Behaviour is unchanged today
          // — the field is optional on `GameInfo` and EVERY consumer tests
          // `=== true`, so an absent or never-captured entry still proves
          // nothing about a Windows depot and still can never offer the
          // option — but the documented contract is now preserved rather
          // than contradicted.
          is_mac_native: cachedMeta?.is_mac_native ?? false,
          is_linux_native: cachedMeta?.is_linux_native ?? false,
          is_windows_native: cachedMeta?.is_windows_native,
          // GAP-B: seed the persisted delisted verdict so it survives a library resync
          is_delisted: cachedMeta?.is_delisted ?? false,
          // CR-01 fix: seed the persisted Mach-O ground-truth verdict so a
          // cached '32' survives every startup/resync. Default MUST be
          // 'unknown' (never '32') — a missing/blank cache can never be
          // coerced into a 32-bit verdict (T-18-05-02, false-flag-safe
          // invariant from MAC32-01).
          mac_arch: cachedMeta?.mac_arch ?? 'unknown',
          // Phase 17 D-08 reconciliation, NARROWED by quick task 260816-hdg.
          // This field no longer mirrors the D-11 routing gate, and the
          // divergence is deliberate: it seeds the frontend's
          // `hasSteamDepotSignalCaptured`, which asks the DEPOT question, while
          // the D-11 gate (isBridgeAuthoritativeForInstallState, above in this
          // file) asks the MAC question and is unchanged. Routed through
          // depotSignalCaptured so a pre-D-17 residue entry — which flagged the
          // platforms fetch complete without ever writing the Windows field —
          // stops claiming a depot signal it never captured. Consequence,
          // accepted: AppleWikiInfo.tsx's section hides for such a game until
          // getGameInfo's self-heal refetch lands, which is one fetch away.
          steamPlatformsCaptured: depotSignalCaptured(cachedMeta),
          is_installed: !!installedData,
          install: installedData
            ? {
                install_path: installedData.installPath,
                install_size: getFileSize(Number(installedData.sizeOnDisk)),
                // GAP-17-BOTTLE-PLAY-REVERT: platform must reflect which root
                // actually matched (native vs bottle), never hardcoded — a
                // bottle-installed game must always report 'Windows' (Pitfall 3).
                platform: installPlatformForSource(source)
              }
            : // WR-01 (21-17): no fully-installed manifest, but an incomplete
              // (bit-4-unset) native ACF is on disk — durably re-surface the
              // "Resume Install" resume affordance. is_installed stays false
              // (installedData is falsy here), so the no-regression Play-safety
              // truth holds; a fully-installed ACF took the branch above and
              // still yields is_installed=true + Play.
              incompleteSet.has(app.appid)
              ? { steamResumePending: true }
              : {},
          extra: {
            reqs: [],
            // cachedMeta.extra preserves about/genres/art metadata from prior fetches.
            // Playtime and last-played must reflect the latest sync (fresh wins over stale),
            // so dynamic Steam fields are placed AFTER the spread to override any cached values.
            ...(cachedMeta?.extra ?? {}),
            steamPlaytimeMinutes: app.playtime_forever,
            steamLastPlayed: app.rtime_last_played ?? 0
          },
          canRunOffline: true,
          installable: true,
          store_url: `https://store.steampowered.com/app/${app.appid}/`
        }

        // 260821-rb5: re-apply a captured breadcrumb (see above, before
        // library.clear()). Property-mutation after construction, rather
        // than a fourth arm on the `install:` ternary above, to keep this
        // diff surgical against an already 100-line object literal. The
        // `!installedData` guard is the SAME self-heal rule as init()'s
        // startup self-heal: a game that is now fully installed drops its
        // breadcrumb instead of carrying it forward.
        const breadcrumb = breadcrumbs.get(appIdStr)
        if (breadcrumb && !installedData) {
          gameInfo.install = {
            ...gameInfo.install,
            steamResumePending: true,
            steamResumeTargetSteamappsDir: breadcrumb.targetSteamappsDir,
            steamResumeInstalldir: breadcrumb.installdir
          }
        }

        library.set(appIdStr, gameInfo)
        sendFrontendMessage('pushGameToLibrary', gameInfo)
      }

      // ── Step 4: persist library list and sync timestamp ───────────────────
      steamLibraryStore.set('games', Array.from(library.values()))
      steamSyncStore.set('syncedAt', Date.now())
    } catch (err) {
      logError(
        ['Steam library sync failed during hydration:', err],
        LogPrefix.Steam
      )
      // 34.15 D-07 exit path 4 of 4 (see the try's own doc comment above for
      // why this path was previously silent). Re-thrown after emitting so
      // main.ts's refreshLibrary IPC handler still rejects for a
      // scoped-refresh caller, exactly as before this plan — only the emit
      // is new.
      sendFrontendMessage('steamSyncStatus', {
        status: 'failed',
        reason: 'sync-failed'
      })
      throw err
    }
    logInfo(
      `Steam library sync complete: ${library.size} games`,
      LogPrefix.Steam
    )
    // 34.15 D-07 exit path 3 of 4 (success).
    sendFrontendMessage('steamSyncStatus', { status: 'idle' })
    return { stdout: `${library.size} games synced`, stderr: '' }
  }

  /**
   * Returns the GameInfo for a given appName.  Delegates to SteamGame so that
   * the lazy metadata fetch (artwork, description, genres — LIB-04) is
   * triggered regardless of whether callers use the library manager or the
   * per-game entry point.  Falls back to the persisted library cache when the
   * in-memory Map has not been populated yet (e.g. before init() fires).
   */
  getGameInfo(appName: string, _forceReload?: boolean): GameInfo | undefined {
    // Delegate to SteamGame — reads shared library Map and fires lazy fetch
    // (fetchMetadataIfNeeded) when art_cover is empty (plan 02-03)
    const fromGame = new SteamGame(appName).getGameInfo()
    if (fromGame.app_name) return fromGame

    // Fallback: consult persistent cache (useful if init() hasn't fired yet)
    const cached = steamLibraryStore.get('games', [])
    return cached.find((g) => g.app_name === appName)
  }

  getListOfGames(): GameInfo[] {
    return steamLibraryStore.get('games', [])
  }

  /**
   * D-07 (phase 34.13): deliberate stub returning `undefined` — Steam
   * exposes no pre-install size, and computing one for real would need an
   * authenticated Steam CM connection plus per-depot round trips (D-06),
   * far more than this call should ever cost.
   * The Steam install dialog never calls the frontend `getInstallInfo`
   * helper and never gates Install on `diskSize`, so this stub can't hang
   * it — the historical failure mode it used to imply, `DownloadDialog`
   * spinning forever on the "download size" string, can't recur here.
   * `InstallGameModal.ts`'s short-circuit is no longer the only defense —
   * the dialog's own D-06 contract is.
   */
  async getInstallInfo(
    _appName: string,
    _installPlatform: InstallPlatform,
    _options: {
      branch?: string
      build?: string
      lang?: string
      retries?: number
    }
  ): Promise<InstallInfo | undefined> {
    return undefined
  }

  async listUpdateableGames(): Promise<string[]> {
    return []
  }

  async changeGameInstallPath(
    _appName: string,
    _newPath: string
  ): Promise<void> {
    // Phase 3: install operations
  }

  changeVersionPinnedStatus(_appName: string, _status: boolean): void {
    // Phase 3: install operations
  }

  /**
   * Steam install state is always derived from ACF on disk (D-10).
   * This method is intentionally a no-op — callers that need to reconcile
   * install badges should use refreshInstallState() instead.
   * The LibraryManager interface requires this method, but for Steam the
   * source of truth is always the ACF StateFlags bit 4, never a boolean flag.
   */
  installState(_appName: string, _state: boolean): void {
    // Intentional no-op: Steam install state derives from ACF (D-10).
    // Use refreshInstallState() to reconcile badges from live ACF data.
  }

  /**
   * Re-reads ACF manifests from disk via buildInstalledMap() and pushes
   * updated install badges to the frontend for any game whose is_installed
   * state actually changed since the last read.
   *
   * This is the D-01/D-02 reconciliation path:
   *  - D-01: triggered by BrowserWindow 'focus' (main.ts), not by polling.
   *  - D-02: badges flip only after confirmed ACF data; never optimistically
   *    from a click.
   *
   * 17-03 (MACSTEAM-05): when isMac && isBottleProvisioned(), ALSO diffs each
   * library entry against buildBottleInstalledMap() (the dedicated CrossOver
   * bottle's own ACF root) and reconciles bottle-installed games with
   * install.platform: 'Windows' (Pitfall 3) — never the host OS. D-UAT-24-07:
   * when isMac && isBridgeBottleReady(), ALSO diffs against
   * buildBridgeInstalledMap() (the dedicated bridge bottle's own ACF root),
   * so a bridge-installed game's badge is not clobbered back to false by this
   * focus-triggered reconciliation either — same 'Windows' platform label
   * (installPlatformForSource). Bottle reconciliation is gated strictly behind
   * isBottleProvisioned() (T-17-03: a
   * missing/unprovisioned bottle is a no-op, not a repeated failing scan) and
   * is skipped entirely on Linux/Windows or an un-provisioned macOS, leaving
   * the native-only reconciliation byte-for-byte unchanged in those cases.
   * The native map always takes precedence for a given appId — a bottle
   * result is only consulted when the native scan found nothing for that
   * appId, so the two roots are never double-counted or conflated.
   *
   * Only games whose state changed are pushed (avoids flooding the frontend).
   * The GameInfo install shape matches refresh() when installed:
   *   install_path, install_size, platform ('Windows' always for a bottle
   *   install; host-OS-derived for a native install)
   * and is set to {} when not installed.
   */
  async refreshInstallState(): Promise<void> {
    const installedMap = await buildInstalledMap()
    const bottleInstalledMap =
      isMac && isBottleProvisioned() ? await buildBottleInstalledMap() : null
    // D-UAT-24-07: same bridge-map consult as refresh(), so a focus/post-launch
    // reconciliation does not clobber a bridge-installed game's badge back to
    // false either. Gated identically (isMac + provisioned check).
    const bridgeInstalledMap =
      isMac && isBridgeBottleReady() ? await buildBridgeInstalledMap() : null

    for (const [appIdStr, gameInfo] of library.entries()) {
      const appId = parseInt(appIdStr, 10)
      const nativeInstalledData = installedMap.get(appId)
      const bottleInstalledData = bottleInstalledMap?.get(appId)
      const bridgeInstalledData = bridgeInstalledMap?.get(appId)
      // D-UAT-24-02 (24-17): same bridge-authoritative selection as
      // refresh() — a bridge-eligible title reconciles ONLY against the
      // bridge map, so a stale native/Phase-17-bottle-only badge gets
      // correctly flipped to not-installed rather than surviving focus
      // reconciliation. Precedence for non-eligible titles is unchanged:
      // native wins, then Phase 17 bottle, then bridge — never
      // double-count/conflate the three roots.
      const bridgeAuthoritative = isBridgeAuthoritativeForInstallState(appIdStr)
      const installedData = bridgeAuthoritative
        ? bridgeInstalledData
        : (nativeInstalledData ?? bottleInstalledData ?? bridgeInstalledData)
      const source: AcfSource = bridgeAuthoritative
        ? 'bridge'
        : nativeInstalledData
          ? 'native'
          : bottleInstalledData
            ? 'bottle'
            : 'bridge'
      const isNowInstalled = !!installedData

      if (gameInfo.is_installed !== isNowInstalled) {
        const updated: GameInfo = {
          ...gameInfo,
          is_installed: isNowInstalled,
          install: isNowInstalled
            ? {
                install_path: installedData.installPath,
                install_size: getFileSize(Number(installedData.sizeOnDisk)),
                platform: installPlatformForSource(source)
              }
            : {}
        }
        library.set(appIdStr, updated)
        // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately so the in-memory
        // Map and the on-disk cache never diverge (mirrors refresh() and
        // gog/library.ts's installedGamesStore.set-immediately-after-mutate
        // pattern) — otherwise an app restart before the next full refresh()
        // would read a stale is_installed from steamLibraryStore.
        steamLibraryStore.set('games', Array.from(library.values()))
        sendFrontendMessage('pushGameToLibrary', updated)
      }
    }
  }

  getLaunchOptions(_appName: string): LaunchOption[] {
    return []
  }
}

/**
 * D-UAT-09 (21-17): the single completeness predicate every install-state
 * detector must call — bit 4 (0x4 = FullyInstalled) is a BITMASK check, NOT
 * equality (Pitfall 6); the strict-1026 GAMELIB_HANDOFF_STATE_FLAGS literal
 * elsewhere in this file is a DIFFERENT, unrelated check (exact handoff
 * value, not this bitmask). Centralizing this decision means no future
 * detector can diverge from the other three and spoof "installed" from a
 * partial/interrupted manifest (T-21-17-01, regression-locked by tests).
 */
export function isFullyInstalledStateFlags(stateFlags: number): boolean {
  return (stateFlags & 4) !== 0
}

/**
 * Reads all Steam library paths and returns a Map from AppID (number) to
 * install data for games whose ACF StateFlags has bit 4 set
 * (0x4 = FullyInstalled). Skips missing directories and corrupt ACF files
 * without throwing (T-2-01 mitigation).
 *
 * Exported for unit testing.
 */
export async function buildInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string }>
> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        const isInstalled = isFullyInstalledStateFlags(stateFlags)

        if (isInstalled && !isNaN(appid)) {
          installed.set(appid, {
            installPath: join(steamappsDir, 'common', state.installdir ?? ''),
            sizeOnDisk: state.SizeOnDisk ?? '0'
          })
        }
      } catch {
        /* skip corrupt ACF — T-2-01 mitigation */
      }
    }
  }

  return installed
}

/**
 * WR-01 (21-17): scans on-disk native ACF manifests and returns the set of
 * AppIDs whose StateFlags is present but NOT fully installed (bit 4 unset —
 * e.g. the honest 1026 verify-repair handoff a cancelled native install
 * writes). This is the durable, on-disk complement to buildInstalledMap:
 * refresh() uses it to re-seed `steamResumePending` on every resync so a
 * mid-session `library.clear()` + rebuild can never wipe the "Finish in
 * Steam" resume affordance (the D-UAT-09 symptom). The incomplete verdict is
 * derived from the SAME predicate as the installed detectors
 * (`isFullyInstalledStateFlags`) — negated here — so the "installed" and
 * "incomplete" decisions can never diverge on the bit logic. Skips missing
 * directories and corrupt ACF files without throwing (T-2-01 mitigation).
 *
 * Exported for unit testing.
 */
export async function buildIncompleteInstallSet(): Promise<Set<number>> {
  const incomplete = new Set<number>()
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        // A present-but-incomplete manifest (bit 4 unset). NaN StateFlags is
        // excluded — an unparseable manifest is not a trustworthy resume
        // signal, matching buildInstalledMap's fail-closed stance.
        if (
          !isNaN(appid) &&
          !isNaN(stateFlags) &&
          !isFullyInstalledStateFlags(stateFlags)
        ) {
          incomplete.add(appid)
        }
      } catch {
        /* skip corrupt ACF — T-2-01 mitigation */
      }
    }
  }

  return incomplete
}

// ── macOS arch ground-truth check (MAC32-03) ─────────────────────────────────
// Post-install Mach-O binary inspection is the ONLY detector in this phase
// that may ever assert mac_arch === '32'. Steam's manual osarch metadata
// proved absent/unreliable on every macOS launch entry (18-01 finding,
// retired) and the pre-install store-API min-OS heuristic (games.ts
// macArchFromMinOS) structurally never returns '32' either — this is the
// correctness backstop that catches an i386-only mac depot Steam left
// un-tagged.

/**
 * Runs `lipo -archs` on the given binary — argv-form execFileSync (command +
 * array, never a shell-interpolated string; T-18-03-01) mirroring the
 * windowsRunningAppId/linuxFallbackRunningAppId convention above. Falls back
 * to `file` when lipo throws (not installed / binary lipo doesn't recognize).
 * Returns [] when BOTH tools fail — inconclusive, NEVER a 32-bit verdict on
 * its own (verdictFromArchs below is the sole place that turns an arch list
 * into a '32'/'64' answer). Exported for unit testing.
 */
export function machOArchsOf(binaryPath: string): string[] {
  try {
    const output = execFileSync('lipo', ['-archs', binaryPath], {
      encoding: 'utf8',
      timeout: 5000
    })
    return output.trim().split(/\s+/).filter(Boolean)
  } catch {
    try {
      const output = execFileSync('file', [binaryPath], {
        encoding: 'utf8',
        timeout: 5000
      })
      const archs: string[] = []
      if (/\bx86_64\b/.test(output)) archs.push('x86_64')
      if (/\barm64\b/.test(output)) archs.push('arm64')
      if (/\bi386\b/.test(output)) archs.push('i386')
      return archs
    } catch {
      return [] // neither tool available/succeeded — inconclusive, NOT 32-bit
    }
  }
}

/**
 * Maps a Mach-O arch list to a verdict. A universal binary (any x86_64/arm64
 * slice present) is runnable — '64' wins even alongside an i386 slice. Empty
 * input is inconclusive: null, never '32' (T-18-03-03 — the false-flag-safe
 * invariant at this subprocess boundary). Exported for unit testing.
 */
export function verdictFromArchs(archs: string[]): '32' | '64' | null {
  if (archs.length === 0) return null // inconclusive — do not overwrite existing hint
  if (archs.includes('x86_64') || archs.includes('arm64')) return '64'
  if (archs.includes('i386')) return '32'
  return null
}

/**
 * Locates the installed Mach-O binary to inspect. Prefers a supplied launch
 * executable path (resolved relative to installPath); otherwise scans
 * installPath for a top-level *.app bundle and returns its
 * Contents/MacOS/<first file>. Containment (T-18-03-04): a supplied
 * launchExecutable that escapes installPath's own subtree — via `..`
 * segments or an absolute path — is rejected (logged + skipped), not just
 * join()'d; `join()` alone does not prevent `../../` traversal. Never
 * throws, returns null (log+skip at the call site) on any miss. Exported
 * for unit testing.
 */
export function locateMachOBinary(
  installPath: string,
  launchExecutable?: string
): string | null {
  if (launchExecutable) {
    // T-18-03-04: reject any candidate that escapes installPath's subtree.
    // resolve() honors an absolute launchExecutable and collapses '..'
    // segments; relative() then reveals an escape as a leading '..' (or, on
    // Windows, a different drive → absolute). Verify containment BEFORE
    // touching the filesystem — join() alone would silently nest an absolute
    // path and does not prevent '../../' traversal.
    const candidate = resolve(installPath, launchExecutable)
    const rel = relative(installPath, candidate)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      logWarning(
        `Steam: locateMachOBinary rejected launchExecutable '${launchExecutable}' — escapes installPath subtree; skipping`,
        LogPrefix.Steam
      )
    } else if (existsSync(candidate)) {
      return candidate
    }
  }
  try {
    const entries = readdirSync(installPath)
    const appBundle = entries.find((e) => e.endsWith('.app'))
    if (!appBundle) return null
    const macOsDir = join(installPath, appBundle, 'Contents', 'MacOS')
    if (!existsSync(macOsDir)) return null
    const bins = readdirSync(macOsDir)
    return bins.length ? join(macOsDir, bins[0]) : null
  } catch {
    return null
  }
}

/**
 * Post-install ground-truth check (MAC32-03). Corrects Steam's un-tagged
 * mac_arch signal by inspecting the installed Mach-O binary — the only path
 * in this phase that may assert mac_arch === '32'.
 *
 * Skip gates, in order:
 *  - source !== 'native': a bottle install is a Windows depot — no Mach-O
 *    binary belongs to this game on that path (RESEARCH.md Anti-Patterns).
 *  - !isMac: host-gated, mirrors games.ts ensurePlatformsCaptured()'s guard.
 *  - mac_arch already '32', or mac_arch_verified already true: nothing to
 *    correct, or already resolved — never re-shells on every install/launch.
 *
 * A definitive verdict ('32' or '64') is persisted with mac_arch_source:
 * 'macho' and mac_arch_verified:true, spreading the existing cache entry so
 * art/extra/etc. are never lost. An inconclusive result (no binary located,
 * or verdictFromArchs returns null) is a no-op — logs and leaves mac_arch
 * exactly as-is (T-18-03-03).
 *
 * When the verdict is '32', triggers the user-consented recovery (CONTEXT
 * D-6 / promptI386Recovery below) as a decoupled fire-and-forget call — the
 * ground-truth check itself never awaits the dialog, so it never blocks the
 * pollInstallOnce 'installed' badge-flip UX.
 *
 * Exported for unit testing.
 */
export async function verifyMacArchGroundTruth(
  appId: string,
  installPath: string,
  source: AcfSource
): Promise<void> {
  if (source !== 'native') return
  if (!isMac) return

  const existing = steamMetadataStore.get(appId)
  if (existing?.mac_arch === '32' || existing?.mac_arch_verified === true) {
    return
  }

  const binaryPath = locateMachOBinary(installPath)
  if (!binaryPath) {
    logInfo(
      `Steam: verifyMacArchGroundTruth found no Mach-O binary for appId ${appId} at ${installPath} — skipping`,
      LogPrefix.Steam
    )
    return
  }

  const verdict = verdictFromArchs(machOArchsOf(binaryPath))
  if (verdict === null) {
    logInfo(
      `Steam: verifyMacArchGroundTruth inconclusive for appId ${appId} — leaving mac_arch unchanged`,
      LogPrefix.Steam
    )
    return
  }

  steamMetadataStore.set(appId, {
    ...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
    mac_arch: verdict,
    mac_arch_source: 'macho',
    mac_arch_verified: true
  })
  logInfo(
    `Steam: verifyMacArchGroundTruth resolved appId ${appId} to mac_arch '${verdict}' (Mach-O ground truth)`,
    LogPrefix.Steam
  )

  // CR-01 fix: propagate the resolved verdict to the in-memory library Map
  // and push it to the frontend, mirroring the library.set + push pattern
  // used at the end of refresh()'s loop. Without this, the badge is
  // unreachable until the next app restart/resync (steamMetadataStore alone
  // is not frontend-visible). Only update when the game is already present
  // in the Map — never fabricate a GameInfo; the store write above already
  // carries the verdict for the next refresh() rebuild.
  const currentGameInfo = library.get(appId)
  if (currentGameInfo) {
    const updatedGameInfo: GameInfo = { ...currentGameInfo, mac_arch: verdict }
    library.set(appId, updatedGameInfo)
    // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately, mirroring every
    // other library-mutating call site in this file — otherwise a restart
    // before the next full refresh() reads a stale mac_arch from
    // steamLibraryStore and the 32-bit badge silently reverts.
    steamLibraryStore.set('games', Array.from(library.values()))
    sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
  } else {
    logInfo(
      `Steam: verifyMacArchGroundTruth resolved appId ${appId} but it is not in the in-memory library Map — skipping frontend push (will pick up mac_arch on next refresh)`,
      LogPrefix.Steam
    )
  }

  if (verdict === '32') {
    // MAC32-03/CONTEXT D-6: decoupled — never awaited here, so this check
    // never blocks the pollInstallOnce 'installed' badge-flip UX above.
    void promptI386Recovery(appId)
  }
}

/**
 * MAC32-03 / CONTEXT D-6: user-consented i386 recovery. Steam left this
 * game's mac depot un-tagged and the post-install Mach-O check proved it is
 * i386-only — unrunnable on this version of macOS (Apple removed 32-bit
 * support in Catalina, 2019).
 *
 * Presents a native confirm dialog via Electron's `dialog.showMessageBox` —
 * this codebase's established backend-AWAITED confirm primitive (see
 * legendary/eos_overlay.ts's remove()/enable()) — deliberately NOT
 * showDialogBoxModalAuto, whose `buttons[].onClick` callbacks travel over
 * IPC (webContents.send uses the structured-clone algorithm, which cannot
 * carry function values) and so can never round-trip a confirm decision back
 * into this async function; dialog.showMessageBox is a native, in-process,
 * awaitable primitive with no such limitation.
 *
 * On confirm: force-uninstalls the dead native copy, then re-installs —
 * which now routes through the bottle because isBottleEligible() honors the
 * mac_arch:'32' verdict verifyMacArchGroundTruth already persisted.
 * On cancel/dismiss: leaves the (unrunnable) native install in place; the
 * '32' verdict stays cached (persisted by verifyMacArchGroundTruth BEFORE
 * this prompt fires) so the badge and future routing reflect reality either
 * way.
 *
 * Exported for unit testing.
 */
export async function promptI386Recovery(appId: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    title: i18next.t(
      'gamelib:box.steam.mac32Detected.title',
      '32-bit macOS build detected'
    ),
    message: i18next.t(
      'gamelib:box.steam.mac32Detected.message',
      "This game's macOS build is 32-bit only and cannot run on this version of macOS. GameLib can reinstall it through CrossOver instead, which will redownload the Windows version."
    ),
    buttons: [
      i18next.t(
        'gamelib:box.steam.mac32Detected.confirm',
        'Reinstall via CrossOver'
      ),
      i18next.t('gamelib:box.cancel', 'Cancel')
    ],
    // D-07 fail-safe (Phase 33 Plan 03): buttons[0] ("Reinstall via CrossOver") is the
    // destructive branch (force-uninstall + reinstall) -- an explicit cancelId declares
    // buttons[1] ("Cancel") as the safe decline so a degraded/timed-out dialog never
    // auto-confirms the recovery. A positional "last index" heuristic would coincidentally
    // match here, but this is stated explicitly per 33-RESEARCH Pitfall 4.
    cancelId: 1
  })

  if (response !== 0) {
    logInfo(
      `Steam: user declined i386 recovery for appId ${appId} — native install left in place (unrunnable)`,
      LogPrefix.Steam
    )
    return
  }

  logInfo(
    `Steam: user confirmed i386 recovery for appId ${appId} — force-uninstalling the native copy and reinstalling via the bottle`,
    LogPrefix.Steam
  )
  const game = new SteamGame(appId)
  await game.forceUninstall()
  await game.install({} as InstallArgs)
}

// ── Install polling lifecycle (D-07) ─────────────────────────────────────────

/**
 * The exact StateFlags value GameLib writes on handoff (D-UAT-04 / 21-16):
 * bit 4 (FullyInstalled) is deliberately unset until Steam adopts the
 * manifest, which only happens on a full Steam client restart (focusing the
 * window is not enough). Steam replaces this value the moment it adopts the
 * install. See 21-RESEARCH for the full ACF field list.
 */
const GAMELIB_HANDOFF_STATE_FLAGS = 1026

/** Module-level registry of active install polls, keyed by appId string. */
const activePolls = new Map<
  string,
  {
    timer: NodeJS.Timeout
    ticks: number
    seenDownloading: boolean
    /** Fire-once guard (T-21-16-03) — the "restart Steam" notification must
     *  fire exactly once per install, not on every poll tick. */
    notifiedWaiting: boolean
    /** T-AOG (quick/260719-aog): the PREVIOUS tick's BytesDownloaded + the
     *  wall-clock time it was observed at, used to derive an instantaneous
     *  download speed. Undefined until the first tick with an active poll
     *  has run once — the very first tick therefore never has a speed. */
    lastBytesDownloaded?: number
    lastTickMs?: number
    /** T-AOG: consecutive 'downloading' ticks where a real in-flight
     *  download's BytesDownloaded did not advance — drives the
     *  'steam-paused' gameStatusUpdate hint once it crosses
     *  STALLED_TICKS_THRESHOLD. Reset to 0 the moment bytes advance again. */
    stalledTicks: number
    /** debug/steam-1026-download-restart: true ONLY for a poll started
     *  immediately after GameLib's OWN depot.ts download has already
     *  finished (games.ts's runNativeDepotDownload, native-install-ON —
     *  either the native or the bottle root) — the one scenario where
     *  StateFlags 1026 genuinely means "GameLib wrote this handoff manifest,
     *  waiting for a Steam restart to adopt it". Every OFF-path poll (Steam
     *  itself owns the download, via steam://install or the bottled Steam
     *  client's own tellBottledSteamToInstall dispatch) leaves this false —
     *  on that path StateFlags 1026 is an ORDINARY Steam active-download
     *  state (0x400 update-running | 0x2 update-required), not a handoff.
     *  Root cause of the 1026-collision bug: this distinction cannot be made
     *  from the ACF alone, only from which call site started the poll. */
    isNativeHandoff: boolean
    /** 23.2-04 (D-06/D-07): depot ids GameLib's own downloadSteamDepots run
     *  dropped because Steam refused their decryption key (skip-and-warn,
     *  phase 23.2). Threaded from the DepotDownloadOutcome through
     *  startInstallPolling's PollOptions. Always [] on an OFF-path poll
     *  (Steam owns the download and GameLib has no skipped-depot knowledge
     *  for it) — see the isNativeHandoff docstring above for the same
     *  native-vs-OFF distinction. */
    skippedDepots: string[]
    /** Fire-once guard for the skip completion notice, mirroring the
     *  "restart Steam" toast's own fire-once flag immediately above —
     *  deliberately a SEPARATE flag. Reusing that flag would make the
     *  "Restart Steam" toast and the skip notice mutually exclusive:
     *  whichever notify() ran first would permanently suppress the other,
     *  and a native-handoff install with a skipped depot (this phase's
     *  exact scenario) would silently lose one of the two notices it must
     *  show. */
    notifiedDepotSkipped: boolean
  }
>()

const GRACE_TICKS = 20 // ≈60 s at 3 000 ms default interval — stop if no manifest appeared
const MAX_TICKS = 7200 // ≈6 h at 3 000 ms default interval — absolute safety cap
/** T-AOG (quick/260719-aog): consecutive frozen 'downloading' ticks (at the
 *  default 3 000 ms poll interval, ≈9 s) before a genuinely in-flight
 *  download is surfaced as 'steam-paused' rather than a silently frozen
 *  progress bar. */
const STALLED_TICKS_THRESHOLD = 3
/** Bytes per MiB — mirrors depot.ts's own (unexported) constant so this
 *  poller's `downSpeed` matches the native depot-download path's MiB/s
 *  convention (the DownloadManager UI renders `downSpeed` with a "MB/s"
 *  label; see depot.ts's BYTES_PER_MIB docstring, UAT D-UAT-02). */
const BYTES_PER_MIB = 1024 * 1024

/**
 * Reads the install state of a single appId from its ACF manifest.
 *
 * - 'installed':   manifest present and StateFlags bit 4 set (FullyInstalled)
 * - 'downloading': manifest present but bit 4 unset (download in flight)
 * - 'absent':      no manifest found for this appId in any library path
 *
 * `source` selects which steamapps root(s) to scan:
 *  - 'native' (default): every native library path from getSteamLibraries()
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
  appId: string,
  source: AcfSource = 'native'
): Promise<{
  state: 'absent' | 'downloading' | 'installed'
  stateFlags?: number
  installPath?: string
  sizeOnDisk?: string
  /** Bytes downloaded/staged so far, and the totals to compare against —
   *  parsed from the ACF's AppState (strings on disk). Only populated on the
   *  'downloading' result; used by pollInstallOnce to derive a progress
   *  percent for the bottle install path (GAP-17-BOTTLE-PROGRESS). Missing or
   *  non-numeric values default to 0. */
  bytesDownloaded?: number
  bytesToDownload?: number
  bytesStaged?: number
  bytesToStage?: number
}> {
  const steamappsDirs =
    source === 'bottle'
      ? [getBottleSteamappsRoot()]
      : source === 'bridge'
        ? [getBridgeBottleSteamappsRoot()]
        : (await getSteamLibraries()).map((libPath) =>
            join(libPath, 'steamapps')
          )

  for (const steamappsDir of steamappsDirs) {
    if (!existsSync(steamappsDir)) continue

    const manifestFile = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(manifestFile)) continue

    try {
      const content = readFileSync(manifestFile, 'utf-8')
      const parsed = parse(content)
      const state = parsed?.AppState
      if (!state) continue

      const stateFlags = parseInt(state.StateFlags, 10)
      if (isFullyInstalledStateFlags(stateFlags)) {
        return {
          state: 'installed',
          stateFlags,
          installPath: join(steamappsDir, 'common', state.installdir ?? ''),
          sizeOnDisk: state.SizeOnDisk ?? '0'
        }
      }
      return {
        state: 'downloading',
        stateFlags,
        bytesDownloaded: Number(state.BytesDownloaded) || 0,
        bytesToDownload: Number(state.BytesToDownload) || 0,
        bytesStaged: Number(state.BytesStaged) || 0,
        bytesToStage: Number(state.BytesToStage) || 0
      }
    } catch {
      continue // skip corrupt ACF (T-2-01)
    }
  }

  return { state: 'absent' }
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
 * Same corrupt-file discipline as every other manifest scan here
 * (T-2-01/T-17-05): an unreadable or unparseable ACF is skipped, never
 * thrown out of. Comparison is case-sensitive and exact, matching the way
 * `installRoot` itself is built (`join(commonRoot, installdirSegment)`).
 *
 * Exported for unit testing.
 */
export function findOtherManifestsWithInstalldir(
  steamappsDir: string,
  installdirSegment: string,
  selfAppId: string
): string[] {
  if (!existsSync(steamappsDir)) return []

  let files: string[]
  try {
    files = readdirSync(steamappsDir)
  } catch {
    return []
  }

  const conflicting: string[] = []
  for (const file of files) {
    if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue
    if (file === `appmanifest_${selfAppId}.acf`) continue

    try {
      const parsed = parse(readFileSync(join(steamappsDir, file), 'utf-8'))
      const state = parsed?.AppState
      if (!state) continue
      if (state.installdir !== installdirSegment) continue
      const appid = String(state.appid ?? '')
      if (appid && appid !== selfAppId) conflicting.push(appid)
    } catch {
      /* skip corrupt ACF — T-2-01/T-17-05 mitigation */
    }
  }

  return conflicting
}

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

const ALL_ACF_SOURCES: AcfSource[] = ['native', 'bottle', 'bridge']

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
  appId: string
): Promise<SteamInstallCopy[]> {
  const copies: SteamInstallCopy[] = []

  for (const source of ALL_ACF_SOURCES) {
    try {
      const acfState = await readAcfState(appId, source)
      if (acfState.state === 'installed' && acfState.installPath) {
        copies.push({
          source,
          installPath: acfState.installPath,
          sizeOnDisk: acfState.sizeOnDisk ?? '0'
        })
      }
    } catch (error) {
      logWarning(
        [
          `SteamLibraryManager: enumerateSteamInstallCopies probe failed for appId ${appId} source '${source}'`,
          error
        ],
        LogPrefix.Steam
      )
    }
  }

  return copies
}

/** quick-260821-le0: outcome of a single-root `removeSteamInstallCopy` call. */
export type RemoveCopyResult =
  | { status: 'removed'; source: AcfSource; manifestOnly: boolean }
  | { status: 'absent'; source: AcfSource }
  | { status: 'refused'; source: AcfSource; reason: string }

/** Shared appId shape guard (34.13 review A-12) — mirrors games.ts's own
 *  NUMERIC_APP_ID and installFormIpc.ts's own copy; each file in this repo
 *  carries its own local copy of this regex by established convention. */
const NUMERIC_APP_ID = /^\d+$/

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

  const acfState = await readAcfState(appId, source)

  if (acfState.state === 'absent') {
    return { status: 'absent', source }
  }

  if (acfState.state === 'downloading') {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy refused appId ${appId} source '${source}' — install still in progress`,
      LogPrefix.Steam
    )
    return { status: 'refused', source, reason: 'install in progress' }
  }

  if (!acfState.installPath) {
    // 'installed' with no installPath cannot happen from readAcfState's own
    // contract (its 'installed' branch always builds one), but a missing
    // delete target must never fall through to guessing — refuse.
    return { status: 'refused', source, reason: 'no install path' }
  }

  // readAcfState's 'installed' branch builds installPath as
  // join(steamappsDir, 'common', installdir) — recover steamappsDir from it
  // rather than re-deriving the per-source library/bottle lookup a second
  // time (readAcfState already owns that mapping).
  const steamappsDir = resolve(acfState.installPath, '..', '..')
  const commonRoot = resolve(steamappsDir, 'common')
  const resolvedInstallPath = resolve(acfState.installPath)
  const relFromCommon = relative(commonRoot, resolvedInstallPath)
  const installdirSegment = relFromCommon.split(sep)[0]

  if (
    !installdirSegment ||
    relFromCommon.startsWith('..') ||
    isAbsolute(relFromCommon)
  ) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy refused appId ${appId} source '${source}' — install path "${acfState.installPath}" does not resolve inside common/`,
      LogPrefix.Steam
    )
    return {
      status: 'refused',
      source,
      reason: 'install path outside common/'
    }
  }

  const installRoot = join(commonRoot, installdirSegment)
  const manifestPath = join(steamappsDir, `appmanifest_${appId}.acf`)

  const conflicting = findOtherManifestsWithInstalldir(
    steamappsDir,
    installdirSegment,
    appId
  )

  if (conflicting.length > 0) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy — installdir "${installdirSegment}" (source '${source}') is shared with appId(s) ${conflicting.join(',')}; removing appId ${appId}'s manifest only`,
      LogPrefix.Steam
    )
    rmSync(manifestPath, { force: true })
    return { status: 'removed', source, manifestOnly: true }
  }

  rmSync(installRoot, { recursive: true, force: true })
  rmSync(manifestPath, { force: true })

  logInfo(
    `SteamLibraryManager: removeSteamInstallCopy removed appId ${appId} source '${source}' at "${installRoot}"`,
    LogPrefix.Steam
  )

  return { status: 'removed', source, manifestOnly: false }
}

/**
 * Bottle-scoped sibling of buildInstalledMap() — same StateFlags bitmask +
 * corrupt-file discipline (T-2-01/T-17-05), rooted at the dedicated CrossOver
 * bottle's own steamapps dir instead of the native defaultSteamPath (Pitfall 2).
 * Returns an empty Map when the bottle steamapps dir doesn't exist yet (e.g.
 * bottle not provisioned or Steam not yet installed inside it).
 *
 * Exported for unit testing.
 */
export async function buildBottleInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string }>
> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const steamappsDir = getBottleSteamappsRoot()
  if (!existsSync(steamappsDir)) return installed

  let files: string[]
  try {
    files = readdirSync(steamappsDir)
  } catch {
    return installed
  }

  for (const file of files) {
    if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

    try {
      const content = readFileSync(join(steamappsDir, file), 'utf-8')
      const parsed = parse(content)
      const state = parsed?.AppState
      if (!state) continue

      const appid = parseInt(state.appid, 10)
      const stateFlags = parseInt(state.StateFlags, 10)
      const isInstalled = isFullyInstalledStateFlags(stateFlags)

      if (isInstalled && !isNaN(appid)) {
        installed.set(appid, {
          installPath: join(steamappsDir, 'common', state.installdir ?? ''),
          sizeOnDisk: state.SizeOnDisk ?? '0'
        })
      }
    } catch {
      /* skip corrupt ACF — T-2-01/T-17-05 mitigation */
    }
  }

  return installed
}

/**
 * Bridge-bottle-scoped sibling of buildBottleInstalledMap() — same StateFlags
 * bitmask + corrupt-file discipline (T-2-01/T-17-05), but rooted at the
 * DEDICATED bridge bottle's (GameLibSteamBridge) own steamapps dir via
 * getBridgeBottleSteamappsRoot(), never conflated with the native or Phase 17
 * bottle roots (RESEARCH.md Pitfall 2). D-UAT-24-07: the periodic library
 * sync (refresh()) and the focus-triggered reconciliation
 * (refreshInstallState()) previously derived install-state from ONLY the
 * native + Phase 17 bottle maps, so a bridge-installed game (24-12's install
 * poll had already flipped its badge to Installed) got clobbered back to
 * not-installed on the very next sync — this builder lets both paths consult
 * the bridge bottle too, so the badge stays durable across syncs. Returns an
 * empty Map when the bridge bottle steamapps dir doesn't exist yet (e.g. the
 * bridge bottle has never been provisioned).
 *
 * Exported for unit testing.
 */
export async function buildBridgeInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string }>
> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const steamappsDir = getBridgeBottleSteamappsRoot()
  if (!existsSync(steamappsDir)) return installed

  let files: string[]
  try {
    files = readdirSync(steamappsDir)
  } catch {
    return installed
  }

  for (const file of files) {
    if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

    try {
      const content = readFileSync(join(steamappsDir, file), 'utf-8')
      const parsed = parse(content)
      const state = parsed?.AppState
      if (!state) continue

      const appid = parseInt(state.appid, 10)
      const stateFlags = parseInt(state.StateFlags, 10)
      const isInstalled = isFullyInstalledStateFlags(stateFlags)

      if (isInstalled && !isNaN(appid)) {
        installed.set(appid, {
          installPath: join(steamappsDir, 'common', state.installdir ?? ''),
          sizeOnDisk: state.SizeOnDisk ?? '0'
        })
      }
    } catch {
      /* skip corrupt ACF — T-2-01 mitigation */
    }
  }

  return installed
}

/**
 * Executes one polling tick for appId:
 *   'downloading' → updates seenDownloading flag, sends gameStatusUpdate { status: 'installing' }
 *   'installed'   → updates library entry, sends pushGameToLibrary +
 *                   gameStatusUpdate { status: 'done' }, stops the poll
 *   'absent'      → no-op (grace/cap logic lives in startInstallPolling's callback)
 *
 * `source` selects the native (default), bottle-scoped, or bridge-bottle-
 * scoped ACF root — see readAcfState() for the distinction.
 *
 * Exported for unit testing.
 */
export async function pollInstallOnce(
  appId: string,
  source: AcfSource = 'native'
): Promise<void> {
  const result = await readAcfState(appId, source)
  const poll = activePolls.get(appId)

  if (result.state === 'downloading') {
    if (poll) poll.seenDownloading = true

    // GAP-17-BOTTLE-PROGRESS: the bottle install has no DownloadManager
    // feeding the frontend progress store — the ACF's own byte counts are
    // the only source of truth. Prefer the download totals; fall back to
    // the staging totals when the download total is 0/missing (late-stage
    // installs that are past the download phase). Never emit a non-finite
    // percent — if BOTH totals are 0/missing, skip the progress emit
    // entirely (the gameStatusUpdate below still fires).
    const {
      bytesDownloaded = 0,
      bytesToDownload = 0,
      bytesStaged = 0,
      bytesToStage = 0
    } = result

    // D-UAT-04 (21-16): GameLib writes StateFlags EXACTLY 1026 on handoff —
    // bit 4 (FullyInstalled) unset, waiting for Steam to adopt the manifest
    // on its next full restart. That is NOT the same as an active download;
    // surface a passive 'waiting for restart' context instead of the plain
    // 'installing' status so the frontend can show a hint (Task 3) rather
    // than an indefinite spinner. Never launch/focus/drive Steam (T-21-16-02).
    //
    // debug/steam-1026-download-restart: StateFlags===1026 alone is NOT a
    // unique GameLib-handoff signal — Steam itself writes 1026
    // (0x400 update-running | 0x2 update-required) as an ORDINARY active-
    // download state on the native-install-OFF path (confirmed via live ACF:
    // two Steam-owned downloads sat at 1026 and were misclassified as
    // "waiting for restart" with progress hidden, while a third at 1042 —
    // also active, but !== 1026 — was unaffected). The equality check must
    // therefore be gated on provenance: only a poll started right after
    // GameLib's OWN depot.ts download finished (isNativeHandoff===true, set
    // by startInstallPolling's caller in games.ts) may interpret 1026 as a
    // finished handoff. A poll with no isNativeHandoff flag (OFF path, or a
    // direct unit-test call with no active poll registered) never does —
    // defaulting to "false" is the safe direction, since showing live
    // progress for a genuine handoff poll is merely cosmetically wrong for
    // one grace-window tick, while hiding progress for a genuine OFF-path
    // download is the exact bug this fixes.
    const isWaitingForSteamRestart =
      result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS &&
      poll?.isNativeHandoff === true

    // T-AOG (quick/260719-aog, Task 2): a genuinely in-flight download
    // (BytesToDownload > 0 and not yet complete) whose BytesDownloaded hasn't
    // advanced since the PREVIOUS tick is "stalled". STALLED_TICKS_THRESHOLD
    // consecutive stalled ticks surface a 'steam-paused' hint — the restart
    // hint always takes precedence (never both at once). Guarded on `poll`
    // existing so a direct unit-test call with no active poll never flags
    // paused. The staged-fallback phase (bytesToDownload===0) can never
    // satisfy realDownloadInFlight, so it's never mistaken for paused.
    const realDownloadInFlight =
      bytesToDownload > 0 && bytesDownloaded < bytesToDownload
    let isPaused = false
    if (poll) {
      if (
        realDownloadInFlight &&
        poll.lastBytesDownloaded !== undefined &&
        bytesDownloaded <= poll.lastBytesDownloaded
      ) {
        poll.stalledTicks += 1
      } else {
        poll.stalledTicks = 0
      }
      isPaused =
        !isWaitingForSteamRestart &&
        poll.stalledTicks >= STALLED_TICKS_THRESHOLD
    }

    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'installing',
      ...(isWaitingForSteamRestart
        ? { context: 'steam-waiting-for-restart' }
        : isPaused
          ? { context: 'steam-paused' }
          : {})
    })

    if (isWaitingForSteamRestart && poll && !poll.notifiedWaiting) {
      poll.notifiedWaiting = true
      const game = library.get(appId)
      notify({
        title: game?.title ?? '',
        body: i18next.t(
          'steam.waitingForSteam.notify',
          'Restart Steam to finish installing {{game}}',
          { game: game?.title ?? '' }
        )
      })
    }

    // T-AOG (quick/260719-aog, Task 1): derive a live download speed + ETA
    // from the DOWNLOAD bytes specifically (bytesDownloaded), NOT the
    // staged/bottle numerator below — "download speed" tracks bytes off the
    // network, which stays meaningful even during the bottle's staged-
    // fallback phase (it will simply be 0/absent there since bytesDownloaded
    // doesn't move). `poll` is undefined for direct unit-test calls with no
    // active poll — every branch below degrades to "no speed/eta" rather
    // than throwing. Runs AFTER the stalled-ticks comparison above so both
    // read the same PREVIOUS-tick poll.lastBytesDownloaded baseline before
    // it gets overwritten with the current tick's value here.
    let downSpeedMiBs: number | undefined
    if (poll) {
      const nowMs = Date.now()
      const prevBytes = poll.lastBytesDownloaded
      const prevTickMs = poll.lastTickMs

      if (prevBytes !== undefined && prevTickMs !== undefined) {
        const deltaBytes = bytesDownloaded - prevBytes
        const deltaMs = nowMs - prevTickMs
        // rollingRateMiBs guards the div-by-near-zero window (two ticks
        // landing back-to-back — e.g. a Steam preallocation jump) by
        // returning the previous rate (0 here) rather than dividing by a
        // near-zero delta, so this can never yield NaN/Infinity (T-AOG-01).
        const rate = rollingRateMiBs(deltaBytes, deltaMs, 0)
        if (deltaBytes >= 0 && Number.isFinite(rate) && rate > 0) {
          downSpeedMiBs = rate
        }
      }

      poll.lastBytesDownloaded = bytesDownloaded
      poll.lastTickMs = nowMs
    }

    let eta = ''
    if (
      downSpeedMiBs !== undefined &&
      downSpeedMiBs > 0 &&
      bytesToDownload > bytesDownloaded
    ) {
      const remainingBytes = bytesToDownload - bytesDownloaded
      const speedBytesPerSec = downSpeedMiBs * BYTES_PER_MIB
      const etaSeconds = remainingBytes / speedBytesPerSec
      if (Number.isFinite(etaSeconds) && etaSeconds > 0) {
        eta = formatEta(etaSeconds)
      }
    }

    const useStaged = !(bytesToDownload > 0)
    const denominator = useStaged ? bytesToStage : bytesToDownload
    const numerator = useStaged ? bytesStaged : bytesDownloaded

    if (denominator > 0) {
      const rawPercent = (numerator / denominator) * 100
      if (Number.isFinite(rawPercent)) {
        const percent = Math.min(100, Math.max(0, Math.round(rawPercent)))
        sendFrontendMessage('progressUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'installing',
          progress: {
            percent,
            bytes: getFileSize(numerator),
            eta,
            ...(downSpeedMiBs !== undefined ? { downSpeed: downSpeedMiBs } : {})
          }
        })
      }
    }
  } else if (result.state === 'installed') {
    const existing = library.get(appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: result.installPath!,
          install_size: getFileSize(Number(result.sizeOnDisk!)),
          platform: installPlatformForSource(source)
        }
      }
      library.set(appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately (see
      // refreshInstallState() for rationale) so a restart mid-poll can't read
      // a stale not-installed state from steamLibraryStore.
      steamLibraryStore.set('games', Array.from(library.values()))
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-02: fire the confirmed completion toast here (ACF state verified) so
    // the user gets exactly one "Installation Finished" notification per install.
    // The DM pipeline toast is suppressed for steam — this is the sole source.
    notify({
      title: existing?.title ?? '',
      body: i18next.t('notify.install.finished', 'Installation Finished')
    })

    // 23.2-04 (D-06/D-07): a completion notice naming any depot GameLib's
    // own downloadSteamDepots run dropped because Steam refused its key
    // (skip-and-warn, phase 23.2) — fired IN ADDITION to the ordinary
    // Installation Finished toast above, never instead of it. Log-only was
    // explicitly rejected: a silently reduced install that reports plain
    // success is the exact failure class this project has repeatedly been
    // bitten by.
    //
    // Gated on a SEPARATE notifiedDepotSkipped flag, deliberately NOT the
    // "restart Steam" toast's own fire-once flag below. Reusing that flag
    // here would make the two notices mutually exclusive: whichever
    // notify() ran first would permanently suppress the other, and a
    // native-handoff install with a skipped depot — this phase's exact
    // scenario — would silently lose one of them. Always empty on an
    // OFF-path poll (Steam owns the download), so this never fires there.
    if (poll?.skippedDepots?.length && !poll.notifiedDepotSkipped) {
      poll.notifiedDepotSkipped = true
      notify({
        title: existing?.title ?? '',
        body: i18next.t(
          'steam.download.notify.depotSkipped',
          "Installed without depot {{depots}}. Steam wouldn't release its key for this account, so that content was skipped — the game should still run.",
          { depots: poll.skippedDepots.join(', ') }
        )
      })
    }

    // debug/wazhack-uninstall-reverts: the "restart Steam to finish
    // installing" notify previously lived ONLY inside the 'downloading'
    // branch above, gated on StateFlags===GAMELIB_HANDOFF_STATE_FLAGS
    // (1026). That check is structurally unreachable here — the Phase 23
    // "trustworthy 4" fast path (canWriteFullOwnership) writes StateFlags=4
    // directly via finalizeToSteam, so readAcfState() returns
    // state:'installed' on the very first poll and this branch is reached
    // WITHOUT ever passing through 'downloading' at all. isNativeHandoff is
    // the correct signal here too — it is set true by games.ts the moment
    // GameLib's OWN depot download finishes (runNativeDepotDownload,
    // ~L1543-1550), BEFORE it's known whether the resulting ACF lands on
    // 1026 or on the StateFlags=4 fast path — so it identifies "GameLib
    // wrote this manifest directly, Steam has not yet adopted it" uniformly
    // across both completion shapes. Fire-once per poll via
    // notifiedWaiting, mirroring the 'downloading' branch's own guard
    // (T-21-16-03), even though this branch itself only ever runs once
    // before stopInstallPolling() below tears the poll down.
    if (poll?.isNativeHandoff === true && !poll.notifiedWaiting) {
      poll.notifiedWaiting = true
      notify({
        title: existing?.title ?? '',
        body: i18next.t(
          'steam.waitingForSteam.notify',
          'Restart Steam to finish installing {{game}}',
          { game: existing?.title ?? '' }
        )
      })
    }

    stopInstallPolling(appId)
    logInfo(
      `Steam: install polling complete for appId ${appId} — badge flipped to installed`,
      LogPrefix.Steam
    )

    // MAC32-03: fire-and-forget post-install ground-truth check — placed
    // AFTER the badge-flip/notify above so it can never delay them. Native
    // installs only (a bottle install is a Windows depot; no Mach-O binary
    // belongs to this game on that path) and macOS-only (host-gated).
    if (isMac && source === 'native') {
      void verifyMacArchGroundTruth(appId, result.installPath!, source)
    }
  }
  // 'absent': no message — grace/cap logic is in startInstallPolling's setInterval callback
}

/**
 * Starts an ACF polling loop for appId. Idempotent — calling twice has no
 * effect, EXCEPT that a call carrying `isNativeHandoff: true` against an
 * ALREADY-registered poll upgrades that poll's isNativeHandoff (and adopts
 * skippedDepots when the existing entry has none) instead of no-opping — see
 * 260822-dkf below. The loop calls pollInstallOnce every intervalMs (default
 * 3 000 ms).
 *
 * Stops automatically when:
 *   - state becomes 'installed' (via pollInstallOnce → stopInstallPolling)
 *   - state has been 'absent' for GRACE_TICKS WITHOUT ever seeing
 *     'downloading' AND no GameLib-owned native depot download is in flight
 *     for this appId (user likely cancelled Steam's install dialog —
 *     T-03-06 mitigation; the in-flight exception is 260822-dkf, see the
 *     grace branch below)
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over — T-03-06 mitigation)
 *
 * The second parameter accepts EITHER a plain intervalMs number (existing
 * call signature, unchanged) OR a `{ intervalMs?, source?, isNativeHandoff? }`
 * options object — `source: 'bottle'` polls the dedicated CrossOver bottle's
 * steamapps root instead of the native one. Omitting the second arg
 * entirely, or passing a bare number, preserves today's native behavior
 * byte-for-byte (including `isNativeHandoff` defaulting to false — see
 * activePolls' isNativeHandoff docstring, debug/steam-1026-download-restart).
 *
 * Exported for unit testing.
 */
export function startInstallPolling(
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): void {
  // 260822-dkf (D-02): before the grace-window fix below, the finalize-time
  // handoff call at games.ts:1720/1726 only ever reached this function AFTER
  // the grace window had already killed resumeInterruptedSteamInstall's bare
  // download poll — so `activePolls` was always empty by then and this
  // idempotent guard never mattered to it. Fixing the grace window lets that
  // download poll survive, which means the SAME handoff call now arrives
  // while an entry already exists. Without this upgrade branch it would
  // silently no-op: isNativeHandoff/skippedDepots would never reach the
  // entry, and library.ts:2351's 1026 handoff interpretation,
  // library.ts:2547's "Restart Steam" notify, and the skippedDepots
  // completion notice would all stop firing. A bare call (no
  // isNativeHandoff:true) against an existing entry stays a pure no-op, as
  // before — this never downgrades an already-true isNativeHandoff back to
  // false.
  const existingEntry = activePolls.get(appId)
  if (existingEntry) {
    if (
      typeof intervalMsOrOptions !== 'number' &&
      intervalMsOrOptions.isNativeHandoff === true
    ) {
      existingEntry.isNativeHandoff = true
      // Never discard a non-empty skippedDepots list already on the entry.
      if (
        existingEntry.skippedDepots.length === 0 &&
        intervalMsOrOptions.skippedDepots?.length
      ) {
        existingEntry.skippedDepots = intervalMsOrOptions.skippedDepots
      }
      logInfo(
        `Steam: upgrading in-flight install poll for appId ${appId} to isNativeHandoff (260822-dkf D-02)`,
        LogPrefix.Steam
      )
    }
    return // idempotent — no second interval either way
  }

  const {
    intervalMs,
    source,
    isNativeHandoff,
    skippedDepots
  }: {
    intervalMs: number
    source: AcfSource
    isNativeHandoff: boolean
    skippedDepots: string[]
  } =
    typeof intervalMsOrOptions === 'number'
      ? {
          intervalMs: intervalMsOrOptions,
          source: 'native',
          isNativeHandoff: false,
          skippedDepots: []
        }
      : {
          intervalMs: intervalMsOrOptions.intervalMs ?? 3000,
          source: intervalMsOrOptions.source ?? 'native',
          isNativeHandoff: intervalMsOrOptions.isNativeHandoff ?? false,
          skippedDepots: intervalMsOrOptions.skippedDepots ?? []
        }

  logInfo(
    `Steam: starting install polling for appId ${appId} (interval ${intervalMs}ms, source ${source}, isNativeHandoff ${isNativeHandoff}, skippedDepots ${skippedDepots.length})`,
    LogPrefix.Steam
  )

  const entry = {
    timer: null as unknown as NodeJS.Timeout,
    ticks: 0,
    seenDownloading: false,
    notifiedWaiting: false,
    stalledTicks: 0,
    isNativeHandoff,
    skippedDepots,
    notifiedDepotSkipped: false
  }

  const timer = setInterval(async () => {
    entry.ticks++

    // Absolute safety cap — stop after MAX_TICKS and rely on the D-01 focus backstop
    if (entry.ticks >= MAX_TICKS) {
      logWarning(
        `Steam: install polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks); relying on D-01 focus backstop`,
        LogPrefix.Steam
      )
      stopInstallPolling(appId)
      return
    }

    // Teardown-safety (mirrors bottle.ts GAP C): a real poller can outlive the
    // Jest suite that started it (unref() above only stops it from keeping the
    // process alive — it does NOT stop it from firing while the process is
    // otherwise kept busy by a later suite). If it fires after that suite's
    // module mocks are torn down, readAcfState()'s dependencies
    // (getSteamLibraries/getSteamBottleSettings) return undefined and throw.
    // Left unguarded, that throw escapes this async setInterval callback as an
    // unhandled rejection and kills the whole Jest worker. Production never
    // expects this branch — it's a defensive, log-only catch; the next tick
    // retries normally.
    try {
      await pollInstallOnce(appId, source)
    } catch (error) {
      logError(
        [`Steam: install polling tick for appId ${appId} threw`, error],
        LogPrefix.Steam
      )
      return
    }

    // pollInstallOnce may have stopped the poll (state became 'installed')
    if (!activePolls.has(appId)) return

    // Grace window (260822-dkf): "no manifest ever appeared" only means "the
    // user cancelled Steam's install dialog" when STEAM owns the download.
    // On the native depot path GameLib owns the download and deliberately
    // writes the ACF only at finalize (D-08), so `seenDownloading` can never
    // become true mid-download — an absent manifest carries NO cancellation
    // signal at all while GameLib's own depot run is still streaming chunks.
    // isNativeInstallInFlight(appId) is read PER-TICK, never captured at
    // poll-start: on the resumeInterruptedSteamInstall path the flag is
    // still false when this poll is created and only becomes true a moment
    // later once the native depot run registers itself. Do NOT gate this on
    // isNativeHandoff — three of the four startInstallPolling call sites
    // leave it false, and two of those are exactly the paths whose cancel
    // detection this grace window exists to provide (D-01).
    //
    // No `entry.ticks` reset is needed when the download completes:
    // pollInstallOnce above runs before this branch on every tick and either
    // sets seenDownloading or stops the poll once GameLib's finalize has
    // written the manifest — so the only way this branch fires after a
    // completed native run is a run that produced no manifest at all, which
    // is a correct stop.
    if (
      !entry.seenDownloading &&
      entry.ticks >= GRACE_TICKS &&
      !isNativeInstallInFlight(appId)
    ) {
      logWarning(
        `Steam: install polling for appId ${appId} stopped after grace window (${GRACE_TICKS} ticks) — no manifest detected; user may have cancelled`,
        LogPrefix.Steam
      )
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      stopInstallPolling(appId)
    } else if (
      !entry.seenDownloading &&
      entry.ticks === GRACE_TICKS &&
      isNativeInstallInFlight(appId)
    ) {
      // Diagnosable suppression, logged ONCE at the exact tick the grace
      // window would otherwise have fired, not on every subsequent tick.
      logInfo(
        `Steam: install polling for appId ${appId} — grace window suppressed, native depot download still in flight (260822-dkf)`,
        LogPrefix.Steam
      )
    }
  }, intervalMs)

  // Teardown-safety (mirrors bottle.ts GAP C): unref the interval so it never
  // keeps a bare Node process (e.g. a Jest worker) alive on its own. In the
  // Electron main process the app's own event loop keeps polling running, so
  // this is production-neutral; under Jest it stops a leaked real poller from
  // surviving teardown and crashing on a later tick (readAcfState on reset
  // mocks). Optional-chained — a no-op in any non-Node timer context.
  timer.unref?.()

  entry.timer = timer
  activePolls.set(appId, entry)
}

/**
 * Stops the active polling loop for appId (clears the interval and removes the
 * activePolls entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopInstallPolling(appId: string): void {
  const poll = activePolls.get(appId)
  if (!poll) return
  clearInterval(poll.timer)
  activePolls.delete(appId)
  logInfo(`Steam: stopped install polling for appId ${appId}`, LogPrefix.Steam)
}

// ── Uninstall polling lifecycle (D-07, symmetric to install) ─────────────────

/** Module-level registry of active uninstall polls, keyed by appId string. */
const activeUninstallPolls = new Map<
  string,
  { timer: NodeJS.Timeout; ticks: number; seenUninstalling: boolean }
>()

/** Steam EAppState bit 0x800 (2048) = actively uninstalling. */
const STATE_UNINSTALLING = 2048

/**
 * Executes one uninstall polling tick for appId:
 *   'absent'  → manifest gone on `source`'s root. debug/steam-bottle-
 *               uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED): a
 *               dual-installed title losing only the `source` copy is
 *               CORRECT, expected behaviour — before flipping the badge,
 *               check whether the OTHER known root (bottle<->native; the
 *               bridge bottle is a separate, out-of-scope root never routed
 *               through this poller — see resolveInstallRoot()'s own JSDoc)
 *               still has a real install:
 *                 - a surviving copy: install_path/install_size/platform are
 *                   re-resolved to it, is_installed STAYS true (the badge is
 *                   never forced to flip), and no "Game Uninstalled" toast
 *                   fires — the success signal must not overstate what
 *                   actually happened.
 *                 - no surviving copy anywhere: flip the library entry to
 *                   not-installed, send pushGameToLibrary + the confirmed
 *                   "Game Uninstalled" toast.
 *               Either way: send gameStatusUpdate { done } and stop the poll
 *               (the frontend re-derives its badge from is_installed once a
 *               non-active status arrives — deriveInstallStatusKind,
 *               frontend/hooks/hasStatus.ts — so 'done' is correct for both
 *               outcomes here).
 *   present   → still on disk: if actively uninstalling (StateFlags bit 0x800 set,
 *               or bit 4 cleared mid-removal) send gameStatusUpdate { uninstalling }.
 *               A plain installed manifest (no 0x800) means uninstall hasn't started
 *               or was cancelled — handled by the grace logic in startUninstallPolling.
 *
 * Install state is never optimistically flipped (D-02) — only a confirmed-absent
 * manifest (with no surviving copy elsewhere) flips the badge. `source` selects
 * the native (default) or bottle-scoped ACF root — see readAcfState(). Exported
 * for unit testing.
 */
export async function pollUninstallOnce(
  appId: string,
  source: AcfSource = 'native'
): Promise<void> {
  const result = await readAcfState(appId, source)
  const poll = activeUninstallPolls.get(appId)

  if (result.state === 'absent') {
    // D-17 (34.13-14) reversibility: clear the forced verdict ONLY on a
    // BOTTLE-scoped CONFIRMED-absent tick — never at dispatch time (a
    // cancelled bottled-Steam confirm dialog leaves the manifest in place)
    // — and BEFORE the `if (existing)` Map guard below, which the
    // diagnostic note beneath it records as capable of MISSing.
    //
    // 34.13 review A-19: a second eraser, clearNativeBottleInstall, used to
    // ride this same tick. Its field had no reader anywhere — it recorded
    // install provenance that stopped deciding uninstall routing — so it
    // performed a full whole-entry steamMetadataStore rewrite on EVERY
    // confirmed-absent bottle tick for no decision. Field and pair removed.
    if (source === 'bottle') {
      clearForcedWindowsViaBottle(appId)
    }
    const existing = library.get(appId)

    // debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION,
    // LOCKED, item 4/5): check EVERY other known root before declaring this
    // title fully uninstalled — native, the GameLibSteam bottle, AND the
    // dedicated GameLibSteamBridge bottle.
    //
    // The bridge was previously excluded here on the reasoning that it owns
    // its own uninstallBridgeGame()/markBridgeGameUninstalled() completion
    // path. That is true of a bridge-INITIATED uninstall, but it does not
    // make a surviving bridge copy invisible to a native- or bottle-scoped
    // one. Live 2026-08-15: HOARD (63000) was installed on all THREE roots
    // simultaneously, so removing the native copy declared a complete
    // uninstall — and fired the toast — while 277M survived in the bridge
    // bottle. That is exactly the overstatement this branch exists to
    // prevent, so the check must be exhaustive over roots, not pairwise.
    //
    // Probe order is fixed (native, bottle, bridge minus `source`) so the
    // re-resolved install_path is deterministic when more than one survives.
    // Each probe is individually guarded: a root that cannot be RESOLVED at
    // all (e.g. the bridge bottle was never provisioned, so
    // getBridgeBottleSettings() has nothing to hand back) must not take the
    // whole uninstall completion down with it. An unreadable root cannot
    // confirm a survivor either way, so it is treated as absent and logged —
    // never allowed to throw out of the poller.
    let survivorSource: AcfSource | null = null
    let survivor: Awaited<ReturnType<typeof readAcfState>> = { state: 'absent' }
    for (const candidate of (['native', 'bottle', 'bridge'] as const).filter(
      (root) => root !== source
    )) {
      try {
        const candidateState = await readAcfState(appId, candidate)
        if (
          candidateState.state === 'installed' &&
          candidateState.installPath
        ) {
          survivorSource = candidate
          survivor = candidateState
          break
        }
      } catch (error) {
        logWarning(
          `Steam: uninstall-poll could not read the ${candidate} root for appId ${appId} — treating it as no survivor: ${String(error)}`,
          LogPrefix.Steam
        )
      }
    }

    if (survivorSource && survivor.installPath && existing) {
      // A copy on the OTHER root survives — re-resolve install_path/platform
      // to it instead of orphaning the entry with a stale pointer at the
      // copy we just removed (the exact re-resolution risk flagged by the
      // operator decision). The badge is never forced to flip.
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: survivor.installPath,
          install_size: getFileSize(Number(survivor.sizeOnDisk ?? '0')),
          platform: installPlatformForSource(survivorSource)
        }
      }
      library.set(appId, updated)
      steamLibraryStore.set('games', Array.from(library.values()))
      sendFrontendMessage('pushGameToLibrary', updated)
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      // The success signal must not lie: the title is legitimately still
      // installed via the surviving copy, so no "Game Uninstalled" toast
      // fires here — that would overstate what actually happened.
      stopUninstallPolling(appId)
      logInfo(
        `Steam: uninstall polling complete for appId ${appId} — removed the ${source} copy; a ${survivorSource} copy survives at "${survivor.installPath}", badge stays installed and install_path re-resolved to it`,
        LogPrefix.Steam
      )
      return
    }

    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: false,
        install: {}
      }
      library.set(appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately (see
      // refreshInstallState() for rationale).
      steamLibraryStore.set('games', Array.from(library.values()))
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-03: fire the confirmed completion toast here (manifest confirmed absent
    // on EVERY known root — no surviving copy) so the user gets exactly one
    // "Game Uninstalled" notification per genuinely-complete uninstall. The
    // uninstaller callback toast is suppressed for steam — this is the sole source.
    notify({
      title: existing?.title ?? '',
      body: i18next.t('notify.uninstalled', 'Game Uninstalled')
    })
    stopUninstallPolling(appId)
    logInfo(
      `Steam: uninstall polling complete for appId ${appId} — badge flipped to not-installed`,
      LogPrefix.Steam
    )
    return
  }

  const uninstalling =
    result.state === 'downloading' ||
    ((result.stateFlags ?? 0) & STATE_UNINSTALLING) !== 0
  if (uninstalling) {
    if (poll) poll.seenUninstalling = true
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'uninstalling'
    })
  }
}

/**
 * Starts an ACF polling loop for an in-progress uninstall. Idempotent.
 *
 * Stops automatically when:
 *   - the manifest disappears (uninstall complete) via pollUninstallOnce
 *   - the game is still installed and no active uninstall was ever observed
 *     after GRACE_TICKS (user likely cancelled Steam's confirm dialog) — clears
 *     any transient status, leaving the badge installed
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over — T-03-06 mitigation)
 *
 * The second parameter accepts EITHER a plain intervalMs number (existing
 * call signature, unchanged) OR a `{ intervalMs?, source? }` options object —
 * `source: 'bottle'` polls the dedicated CrossOver bottle's steamapps root
 * instead of the native one. Omitting the second arg entirely, or passing a
 * bare number, preserves today's native behavior byte-for-byte.
 *
 * Exported for unit testing.
 */
export function startUninstallPolling(
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): void {
  if (activeUninstallPolls.has(appId)) return // idempotent

  const { intervalMs, source }: { intervalMs: number; source: AcfSource } =
    typeof intervalMsOrOptions === 'number'
      ? { intervalMs: intervalMsOrOptions, source: 'native' }
      : {
          intervalMs: intervalMsOrOptions.intervalMs ?? 3000,
          source: intervalMsOrOptions.source ?? 'native'
        }

  logInfo(
    `Steam: starting uninstall polling for appId ${appId} (interval ${intervalMs}ms, source ${source})`,
    LogPrefix.Steam
  )

  const entry = {
    timer: null as unknown as NodeJS.Timeout,
    ticks: 0,
    seenUninstalling: false
  }

  const timer = setInterval(async () => {
    entry.ticks++

    // Absolute safety cap — stop after MAX_TICKS and rely on the D-01 focus backstop
    if (entry.ticks >= MAX_TICKS) {
      logWarning(
        `Steam: uninstall polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks); relying on D-01 focus backstop`,
        LogPrefix.Steam
      )
      stopUninstallPolling(appId)
      return
    }

    // Teardown-safety (mirrors startInstallPolling's callback above / bottle.ts
    // GAP C): a real poller can outlive the Jest suite that started it —
    // unref() only stops it from keeping the process alive, not from firing
    // while a later suite keeps the process busy. If it fires after that
    // suite's module mocks are torn down, readAcfState()'s dependencies throw,
    // and an unguarded throw here would escape as an unhandled rejection and
    // kill the whole Jest worker. Production never expects this branch — it's
    // a defensive, log-only catch; the next tick retries normally.
    try {
      await pollUninstallOnce(appId, source)
    } catch (error) {
      logError(
        [`Steam: uninstall polling tick for appId ${appId} threw`, error],
        LogPrefix.Steam
      )
      return
    }

    // pollUninstallOnce may have stopped the poll (manifest absent = complete)
    if (!activeUninstallPolls.has(appId)) return

    // Cancellation/timeout: if no active uninstall was ever observed after the
    // grace window, the user probably cancelled Steam's confirm dialog — clear
    // any transient status and stop (badge stays installed).
    if (!entry.seenUninstalling && entry.ticks >= GRACE_TICKS) {
      logWarning(
        `Steam: uninstall polling for appId ${appId} stopped after grace window (${GRACE_TICKS} ticks) — no uninstall detected; user may have cancelled`,
        LogPrefix.Steam
      )
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      // debug/wazhack-uninstall-reverts: this branch previously gave the user
      // ZERO feedback — a bare gameStatusUpdate{done} with no notify() call —
      // so a native uninstall whose Steam confirm dialog was never answered
      // (never surfaced, or dismissed) looked identical to "nothing happened
      // at all", the exact reported symptom. The badge correctly stays
      // installed (D-02); the user now gets an honest, distinct toast saying
      // so instead of a silent revert.
      notify({
        title: library.get(appId)?.title ?? '',
        body: i18next.t(
          'notify.uninstallNotConfirmed',
          'Uninstall not confirmed by Steam — please check Steam and try again'
        )
      })
      stopUninstallPolling(appId)
    }
  }, intervalMs)

  // Teardown-safety (mirrors bottle.ts GAP C / the install poller above):
  // unref so a leaked real poller never keeps a Jest worker alive or crashes
  // on a later tick. Production-neutral in the Electron main process.
  timer.unref?.()

  entry.timer = timer
  activeUninstallPolls.set(appId, entry)
}

/**
 * Stops the active uninstall polling loop for appId (clears the interval and
 * removes the registry entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopUninstallPolling(appId: string): void {
  const poll = activeUninstallPolls.get(appId)
  if (!poll) return
  clearInterval(poll.timer)
  activeUninstallPolls.delete(appId)
  logInfo(
    `Steam: stopped uninstall polling for appId ${appId}`,
    LogPrefix.Steam
  )
}

/**
 * Scans all Steam library paths for appmanifest_*.acf files whose StateFlags
 * has bit 4 UNSET (download in progress), and filters to those appIds that
 * are present in the in-memory library Map.
 *
 * Used by SteamLibraryManager.init() to resume polling after an app restart.
 * Exported for unit testing.
 */
export async function scanDownloadingAppIds(): Promise<string[]> {
  const libraryPaths = await getSteamLibraries()
  const downloadingIds: string[] = []

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        if (isNaN(appid)) continue

        const appIdStr = String(appid)
        const stateFlags = parseInt(state.StateFlags, 10)
        // Bit 4 unset = not fully installed (download in progress or other non-installed state)
        if (
          !isNaN(stateFlags) &&
          (stateFlags & 4) === 0 &&
          library.has(appIdStr)
        ) {
          downloadingIds.push(appIdStr)
        }
      } catch {
        /* skip corrupt ACF */
      }
    }
  }

  return downloadingIds
}

// ── Running-game polling lifecycle (GAME-05) ──────────────────────────────────

/** Module-level timer for the running-game poller (single global poll). */
let runningPollTimer: NodeJS.Timeout | null = null

/** Last RunningAppID seen by the poller — used to detect deltas. */
let lastKnownRunningAppId = 0

/**
 * Reads Windows HKCU\Software\Valve\Steam\RunningAppID via reg.exe.
 * Uses argv-form spawnSync (no shell) — registry path is hardcoded (T-06-04).
 * Returns 0 on missing value, non-zero exit status, or thrown error.
 */
function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    if (result.status !== 0) return 0
    const match = result.stdout?.match(
      /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i
    )
    return match ? parseInt(match[1], 16) : 0
  } catch {
    return 0
  }
}

/**
 * Reads macOS ~/Library/Application Support/Steam/registry.vdf for RunningAppID.
 * Parses via @node-steam/vdf with exact casing (Pitfall 4 — T-06-06).
 * Returns 0 when file absent, parse fails, or key missing.
 */
function macOsRunningAppId(): number {
  const regPath = join(
    userHome,
    'Library',
    'Application Support',
    'Steam',
    'registry.vdf'
  )
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Reads Linux ~/.steam/registry.vdf for RunningAppID.
 * Note: this is ~/.steam/registry.vdf, NOT ~/.steam/steam/registry.vdf (Pitfall 3).
 * Returns 0 when file absent, parse fails, or broken (ValveSoftware/steam-for-linux#9672).
 */
function linuxRegistryVdfRunningAppId(): number {
  const regPath = join(userHome, '.steam', 'registry.vdf')
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Linux fallback: scans process cmdline for the Steam reaper process which carries
 * the running AppId. Uses argv-form execFileSync with a narrow regex (T-06-05).
 * Returns 0 when no reaper found or execFileSync fails.
 */
function linuxFallbackRunningAppId(): number {
  try {
    const output = execFileSync('ps', ['-eo', 'args'], {
      encoding: 'utf8',
      timeout: 1000
    })
    const match = output.match(/reaper SteamLaunch --AppId (\d+)/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}

/**
 * Reads the currently running Steam game AppID, cross-platform.
 *
 * - Windows: reads HKCU registry via reg.exe (T-06-04)
 * - macOS: reads ~/Library/Application Support/Steam/registry.vdf (T-06-06)
 * - Linux: tries ~/.steam/registry.vdf first; falls back to reaper process scan
 *   because the Linux VDF RunningAppID is broken since 2023 (ValveSoftware/#9672)
 *   (T-06-05)
 *
 * Returns 0 when no game is running or on any error. Never throws.
 * Exported for unit testing.
 */
export function readRunningAppId(): number {
  if (isWindows) return windowsRunningAppId()
  if (isMac) return macOsRunningAppId()
  // Linux: VDF first, reaper fallback when VDF returns 0 (D-05)
  const fromRegistry = linuxRegistryVdfRunningAppId()
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId()
}

/**
 * Executes one running-game poll tick:
 * - 0→X: sends `playing` for X
 * - X→0: sends `done` for X
 * - X→Y: sends `done` for X then `playing` for Y
 * - unchanged: no-op
 *
 * AppID is scoped to a numeric-only string (T-06-07 — no raw external string).
 * Exported for unit testing.
 */
export function pollRunningOnce(): void {
  const currentAppId = readRunningAppId()
  if (currentAppId === lastKnownRunningAppId) return

  if (lastKnownRunningAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(lastKnownRunningAppId),
      runner: 'steam',
      status: 'done'
    })
    logInfo(
      `Steam: running-game poller: game ${lastKnownRunningAppId} stopped`,
      LogPrefix.Steam
    )
  }
  if (currentAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(currentAppId),
      runner: 'steam',
      status: 'playing'
    })
    logInfo(
      `Steam: running-game poller: game ${currentAppId} started`,
      LogPrefix.Steam
    )
  }

  lastKnownRunningAppId = currentAppId
}

/**
 * Starts the running-game poller. Idempotent — calling twice has no effect.
 * Polls every intervalMs milliseconds (default 5000 / D-06).
 *
 * Exported for unit testing.
 */
export function startRunningPoll(intervalMs = 5000): void {
  if (runningPollTimer) return // idempotent
  runningPollTimer = setInterval(pollRunningOnce, intervalMs)
  // Teardown-safety (mirrors the install/uninstall pollers above): unref so a
  // leaked real poller never keeps a Jest worker alive on its own.
  // Production-neutral in the Electron main process. pollRunningOnce is
  // synchronous and its own readRunningAppId() never throws (see docstring),
  // so no try/catch guard is needed here.
  runningPollTimer.unref?.()
  logInfo('Steam: started running-game poller', LogPrefix.Steam)
}

/**
 * Stops the running-game poller and resets lastKnownRunningAppId to 0 so the
 * next startRunningPoll starts with a clean slate. Safe to call when no poll is
 * active (no-op on timer, always resets state).
 *
 * Exported for unit testing.
 */
export function stopRunningPoll(): void {
  if (runningPollTimer) {
    clearInterval(runningPollTimer)
    runningPollTimer = null
  }
  lastKnownRunningAppId = 0
  logInfo('Steam: stopped running-game poller', LogPrefix.Steam)
}
