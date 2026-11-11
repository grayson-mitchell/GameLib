import { InstallPlatform } from 'common/types'
import { isMac, isLinux } from 'backend/constants/environment'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import { resolve, relative, isAbsolute } from 'path'
import i18next from 'i18next'
import type { Stores } from 'backend/services/types'
import { getBottleSteamappsDir, getSteamBottleSettings } from '../bottle'
import { getBridgeBottleSettings, type BridgeBottleDeps } from '../bridgeBottle'
import { bridgeAllowlist } from '../bridge/allowlist'

/**
 * Which Steam client's steamapps root an ACF scan/poll should target.
 * 'native' (default) preserves all pre-Phase-17 behavior; 'bottle' scans the
 * dedicated Phase 17 CrossOver bottle's (GameLibSteam) own steamapps dir
 * instead; 'bridge' scans the SEPARATE dedicated bridge bottle
 * (GameLibSteamBridge, D-UAT-24-05) — the bridge install writes its
 * StateFlags=4 ACF there, not into the native or Phase 17 bottle root. All
 * three roots must never be conflated (RESEARCH.md Pitfall 2).
 */
/** The stores slice the Steam library readers read (66.1 R3). */
export type SteamStoresDeps = { stores: Pick<Stores, 'steam'> }

export type AcfSource = 'native' | 'bottle' | 'bridge'

const COPY_SOURCE_FALLBACK: Record<AcfSource, string> = {
  native: 'Mac Steam',
  bottle: 'Windows Steam (CrossOver)',
  bridge: 'Steam bridge'
}

// User-facing name for an install root, for the surviving-copy uninstall notice.
export function copySourceLabel(source: AcfSource): string {
  return i18next.t(
    `gamelib:steam.uninstall.copySource.${source}`,
    COPY_SOURCE_FALLBACK[source]
  )
}

/** Shared options shape for both install/uninstall poller start functions.
 *  `isNativeHandoff` is install-poller-only (ignored by startUninstallPolling)
 *  — see activePolls' isNativeHandoff field docstring for its meaning.
 *  `skippedDepots` is likewise install-poller-only, ignored by
 *  startUninstallPolling — see activePolls' skippedDepots field docstring. */
export type PollOptions = {
  intervalMs?: number
  source?: AcfSource
  isNativeHandoff?: boolean
  /** Native Mac GameLib depot install (quick 261029-ji2): Steam adopts it at
   *  its next start, which Play forces, so the "Restart Steam to finish" hint
   *  never applies to a FullyInstalled install on this route. */
  macNativeRoute?: boolean
  skippedDepots?: string[]
  /** True only when Steam (native `steam://install`) owns the download, so
   *  GameLib must wait for Steam to start/self-update/log in and for the
   *  user to confirm Steam's dialog before any appmanifest exists. Install-
   *  poller-only (quick 261024-exo). */
  delegatedToSteamClient?: boolean
  /** True only when a running Steam client accepted GameLib's finished depot
   *  install via InstallApp, so Steam already knows the manifest and the
   *  D-UAT-13 restart hold's premise does not apply. The poll starts with the
   *  hold released, never probes Steam PIDs and never persists a restart hold.
   *  Install-poller-only (quick 261105-sqe). */
  adoptedBySteamClient?: boolean
  /** Boot re-arm only (quick 261029-pkp): start the poll already holding for
   *  a Steam restart, with `startTicks` already elapsed so the MAX_TICKS cap
   *  stays measured from the original finalize. */
  restoredSteamHold?: { pids: number[]; startTicks: number }
}

/**
 * Resolves the bottle's own steamapps dir from the dedicated Steam bottle's
 * stored GameSettings (falls back to DEFAULT_STEAM_BOTTLE_NAME internally via
 * getSteamBottleSettings()). Single chokepoint so every bottle-aware scan
 * roots at the same path.
 */
export function getBottleSteamappsRoot(): string {
  return getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)
}

/**
 * Resolves a bridge bottle's own steamapps dir from getBridgeBottleSettings()
 * — the bridge install writes its StateFlags=4 appmanifest there, so the
 * post-install poll must read from this exact root, not the native
 * libraries and not the Phase 17 getBottleSteamappsRoot() bottle
 * (D-UAT-24-05: the poll previously looked in the wrong location and timed
 * out despite a correctly-written manifest). Mirrors getBottleSteamappsRoot()
 * but is a distinct, never-conflated root (RESEARCH.md Pitfall 2).
 *
 * quick/261016-u1w (D-E): `appId` is now REQUIRED — this resolves that one
 * game's own bridge bottle (per-game if ready, else legacy if it holds this
 * game's manifest, via resolveBridgeBottleName/D-B) rather than defaulting
 * to the shared legacy bottle. Callers that need to scan EVERY ready bridge
 * bottle (buildBridgeInstalledMap) do not call this — they loop over
 * listReadyBridgeBottleNames() and resolve each name's steamapps dir
 * directly via getBottleSteamappsDir().
 */
export function getBridgeBottleSteamappsRoot(
  deps: BridgeBottleDeps,
  appId: string
): string {
  return getBottleSteamappsDir(
    getBridgeBottleSettings(deps, appId).wineCrossoverBottle
  )
}

// DETAIL-01 gap-fix: Steam installs the depot for the host OS, so the installed
// build reflects the platform GameLib is running on. Report that instead of a
// hardcoded 'Windows' (which made a Mac install read "Windows"). 'Mac'/'linux'/
// 'Windows' are all valid InstallPlatform members matched by the frontend's
// platform detection (['osx','Mac'] / ['linux','Linux']).
export function hostInstallPlatform(): InstallPlatform {
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
export function installPlatformForSource(source: AcfSource): InstallPlatform {
  if (source === 'bottle' || source === 'bridge') return 'Windows'
  return hostInstallPlatform()
}

/** resolve()+relative() containment idiom shared by resolveInstallRoot(deps)
 *  below and uninstallBottleGameDirectly()'s own ACF-installdir guard
 *  (games.ts) — never string-prefix matching ("path.join is not
 *  containment", Phase 18). `root` and `candidate` must already be resolve()'d
 *  by the caller. An EMPTY relative path (candidate === root exactly) does
 *  NOT count as contained — a title's install must occupy a real subpath,
 *  never the common/ root itself. */
export function isPathContainedIn(root: string, candidate: string): boolean {
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
 *     the SAME root readAcfState(deps, 'bottle')/pollUninstallOnce('bottle') use)
 *  2. EVERY native Steam library root from getSteamLibraries(deps)
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
  deps: SteamLibrariesDeps,
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

  const libraries = await getSteamLibraries(deps)
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
export function isBridgeAuthoritativeForInstallState(
  deps: SteamStoresDeps,
  appIdStr: string
): boolean {
  if (!isMac) return false
  if (!bridgeAllowlist.has(appIdStr)) return false
  const meta = deps.stores.steam.steamMetadataStore.get(appIdStr)
  if (meta?.mac_arch === '32') return true
  // Quick task 260816-hdg PIN — this gate deliberately keeps the raw read and
  // must NOT be routed through depotSignalCaptured. It asks the MAC question,
  // and a pre-D-17 residue entry genuinely did capture its mac answer;
  // narrowing here would de-route bottle/bridge-eligible games for a fact the
  // cache already knows. A source assertion in metadataCapture.test.ts holds
  // this line in place so it cannot be silently "corrected" later.
  return meta?.platformsCaptured === true && meta?.is_mac_native === false
}
