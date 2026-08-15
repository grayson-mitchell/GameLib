import { GameInfo, Runner } from 'common/types'
import { create } from 'zustand'

/**
 * The frontend mirror of the `listSteamLibraryTargets()` IPC element shape,
 * derived rather than re-declared so a change to the channel's return shape
 * (`src/common/types/ipc.ts:280-282`) is a compile error here instead of a
 * silent drift. Replaces the retiring `SteamLibraryOption`
 * (`frontend/state/SteamInstallLocation.ts`, deleted by this plan's Task 3).
 */
export type SteamInstallLibraryTarget = Awaited<
  ReturnType<typeof window.api.listSteamLibraryTargets>
>[number]

/**
 * D-24's local-validity floor for a Steam quick install. This is NOT a
 * prediction of whether a given game's bits will fit: D-06/D-07 mean no real
 * download size is ever computable for a Steam install (Steam exposes no
 * size data pre-download), and D-08 forbids blocking an install on
 * not-enough-space grounds. Below this floor essentially no Steam game can
 * install at all, so degrading into the options dialog is almost never
 * wrong; a larger floor would degrade installs that would actually have
 * succeeded, reintroducing exactly the friction D-22 removed by retiring the
 * auto-open triggers. No existing threshold constant was found in this
 * codebase for this purpose (RESEARCH Q3) — the value (1 GiB) is Claude's
 * Discretion, chosen as a "near-certain-failure" line, not a size estimate.
 */
export const LOW_SPACE_FLOOR_BYTES = 1024 ** 3

/**
 * The D-24 degrade record: what `startSteamQuickInstall` hands to
 * `openSteamInstallOptions` when the primary library fails a local check.
 * 34.13-10's dialog renders its notice from this record.
 *
 * `onlyLibrary` exists so the dialog can tell, without re-deriving it, that
 * it is in the UI-SPEC's flagged ≤1-library corner (the failing library IS
 * the user's only library, so there is nothing to offer in its place). Per
 * D-08 ("no not-enough-space blocking") and D-06 ("Install is never gated on
 * diskSize"), the dialog's Install button stays ENABLED even in this corner
 * — the notice informs, the user retries after freeing space or
 * reconnecting the drive; fabricating a picker with nothing in it is
 * explicitly forbidden by the UI-SPEC.
 *
 * `libraryPath` is for the dialog's own rendering use ONLY and must never be
 * logged (see this plan's threat model, T-34.13-08-05) — it is a local
 * filesystem path, not sensitive on its own, but there is no reason to widen
 * its surface by putting it in a log sink.
 */
export interface SteamQuickInstallDegrade {
  reason: 'library-missing' | 'library-full'
  libraryPath: string
  freeBytes: number
  onlyLibrary: boolean
}

interface InstallGameModalState {
  isOpen: boolean
  appName?: string
  runner?: Runner
  gameInfo: GameInfo | null
  action?: 'install' | 'import'
  steamDegrade?: SteamQuickInstallDegrade
}

export const useInstallGameModal = create<InstallGameModalState>()(() => ({
  isOpen: false,
  gameInfo: null,
  action: 'install'
}))

interface OpenInstallGameModalParams {
  appName: string
  runner: Runner
  gameInfo: GameInfo | null
  action?: 'install' | 'import'
}

/**
 * Steam's own install() call — the SOLE marshalling site for
 * `window.api.install` on the Steam path, and the sole write site of the
 * D-17 `InstallArgs.steamForceWindowsViaBottle` override anywhere in
 * `src/frontend`. `platformToInstall` has been hardcoded `'Windows'` for
 * every Steam install since Phase 21 and is read nowhere in the Steam
 * backend, so it CANNOT distinguish a user's deliberate D-17 bottle choice
 * from that legacy default — which is exactly why the override is a
 * separate, explicit boolean parameter, read and triple-gated by 34.13-06
 * (`=== true` AND `isMac` AND persisted `is_windows_native === true`).
 *
 * `path` is forwarded verbatim and NEVER synthesized, joined or derived
 * here — containment is the backend's `resolveOverride()`'s job
 * (`installLocation.ts:201-219`, T-21-17): an override is honoured only
 * when it `resolve()`'s to exactly one registered library's own
 * `resolve()`'d path, otherwise it falls back to the primary.
 *
 * Callers: `startSteamQuickInstall` below (always `path: ''`), 34.13-10's
 * dialog confirm handler (an explicit chosen library path), and
 * `SteamClientSetup.tsx`'s post-setup retry (2-arg legacy shape). The
 * now-deleted `SteamInstallLocationPicker.tsx`'s own confirm handler used to
 * be a third caller (3-arg shape) — Task 3 of this plan removes it.
 */
export const installSteamGame = (
  appName: string,
  gameInfo: GameInfo,
  path = '',
  forceWindowsViaBottle = false
) => {
  void window.api.install({
    appName,
    path,
    runner: 'steam',
    installDlcs: [],
    sdlList: [],
    installLanguage: 'en-US',
    platformToInstall: 'Windows',
    steamForceWindowsViaBottle: forceWindowsViaBottle,
    gameInfo
  })
}

/**
 * The frontend mirror of `resolveOverride()`'s own primary-selection
 * fallback (`installLocation.ts:205`, `libraries.find(isPrimary) ??
 * libraries[0]`) — existing ONLY so D-24's local validity check probes the
 * exact same directory the backend will actually write to. RESEARCH Q1
 * verified the two definitions of "primary" are identical, which is also
 * why `startSteamQuickInstall` below never forwards a `path`: doing so would
 * create a SECOND definition in the renderer that could drift from this
 * one. Returns `undefined` for an empty library list (the D-13
 * native-install-OFF / delegated-install signal).
 */
export function resolveQuickInstallTarget(
  libraries: SteamInstallLibraryTarget[]
): SteamInstallLibraryTarget | undefined {
  return libraries.find((lib) => lib.isPrimary) ?? libraries[0]
}

/**
 * The pure D-24 decision: does the quick-install target pass its local
 * validity check? Rules, in order:
 *   - `disk === undefined` → ok (FAIL-OPEN). A rejected/unavailable probe is
 *     an UNKNOWN verdict, not a failed one — degrading on an unknown verdict
 *     would put a dialog in front of every install on any host where the
 *     probe misbehaves, reintroducing exactly the friction D-22 removed.
 *   - `!disk.validPath` → not ok, `library-missing` (the library directory
 *     is unreachable/nonexistent — RESEARCH Q1's `/usr/share/steam`
 *     unfiltered-fallback hazard is exactly why this check is load-bearing,
 *     not defensive).
 *   - `disk.free < LOW_SPACE_FLOOR_BYTES` → not ok, `library-full`.
 *   - otherwise → ok.
 */
export function evaluateQuickInstallTarget(
  target: SteamInstallLibraryTarget,
  disk: { free: number; validPath: boolean } | undefined,
  libraryCount: number
): { ok: true } | { ok: false; degrade: SteamQuickInstallDegrade } {
  if (disk === undefined) {
    return { ok: true }
  }
  if (!disk.validPath) {
    return {
      ok: false,
      degrade: {
        reason: 'library-missing',
        libraryPath: target.path,
        freeBytes: disk.free,
        onlyLibrary: libraryCount <= 1
      }
    }
  }
  if (disk.free < LOW_SPACE_FLOOR_BYTES) {
    return {
      ok: false,
      degrade: {
        reason: 'library-full',
        libraryPath: target.path,
        freeBytes: disk.free,
        onlyLibrary: libraryCount <= 1
      }
    }
  }
  return { ok: true }
}

/**
 * D-23/D-24: the one-click default. Resolves Steam's primary library, runs
 * D-24's cheap LOCAL validity check, and either installs with no friction at
 * all (Phase 21 D-09, unchanged) or degrades into the options dialog
 * carrying the reason. Never throws, never installs anyway on a real local
 * failure, never silently picks a different library.
 *
 * Both awaits below are individually guarded — a rejected
 * `listSteamLibraryTargets` yields an empty list (server-gated on
 * `isSteamNativeInstallEnabled()`, so an empty list ALSO means "GameLib
 * controls no local target" — the delegated `steam://install` shape, and
 * D-24 structurally cannot fire there, UI-SPEC §"D-24 Degrade-into-Options
 * Contract", "When this applies"); a rejected `checkDiskSpace` yields
 * `undefined`, which `evaluateQuickInstallTarget` treats as fail-open. So
 * this function needs no top-level try/catch: there is no rejection path
 * left (pinned by spec B8).
 */
export const startSteamQuickInstall = async (
  appName: string,
  gameInfo: GameInfo
) => {
  let libraries: SteamInstallLibraryTarget[] = []
  try {
    libraries = await window.api.listSteamLibraryTargets()
  } catch {
    libraries = []
  }

  const target = resolveQuickInstallTarget(libraries)
  if (!target) {
    // 0 libraries: either native install is OFF, or the backend has nothing
    // registered. Either way GameLib controls no local target — delegate to
    // steam://install with no path, exactly like today's zero-friction path.
    installSteamGame(appName, gameInfo)
    return
  }

  let disk: { free: number; validPath: boolean } | undefined
  try {
    disk = await window.api.checkDiskSpace(target.steamappsDir)
  } catch {
    disk = undefined
  }

  const verdict = evaluateQuickInstallTarget(target, disk, libraries.length)
  if (verdict.ok) {
    // D-23: NO path argument, ever. resolveOverride() on the backend already
    // resolves this exact primary target from an empty override — passing a
    // path here would create a second, driftable definition of "primary" in
    // the renderer (RESEARCH Q1).
    installSteamGame(appName, gameInfo)
    return
  }

  openSteamInstallOptions(appName, gameInfo, verdict.degrade)
}

/**
 * D-25: the instant options door. Synchronous — awaits nothing, computes
 * nothing — because the user already asked for the dialog by clicking
 * "Install with options…". Withholding it for up to
 * `METADATA_FETCH_TIMEOUT_MS` (15000ms) would be the dead click D-25 exists
 * to remove. The bottle-eligibility verdict is fetched INSIDE the dialog
 * (34.13-10), which carries its own loading state on the wine section and
 * disables its own Install button until it resolves — never here. This
 * function must never become `async`.
 */
export const openSteamInstallOptions = (
  appName: string,
  gameInfo: GameInfo,
  degrade?: SteamQuickInstallDegrade
) => {
  useInstallGameModal.setState({
    isOpen: true,
    appName,
    runner: 'steam',
    gameInfo,
    action: 'install',
    steamDegrade: degrade
  })
}

export const openInstallGameModal = ({
  appName,
  runner,
  gameInfo,
  action = 'install'
}: OpenInstallGameModalParams) => {
  // Steam installs now default to a one-click quick install targeting
  // Steam's primary library (D-23) — the options dialog is reached only by
  // an explicit user action ("Install with options…"), never by this
  // function (D-22: the auto-open triggers retire, the user is the
  // trigger). This is still the single chokepoint every install entry
  // point shares (library grid/list, game page, game submenu), which is why
  // three of D-27's call-site rows are correct with zero edits to them.
  // `getInstallInfo` is STILL never called for Steam — 34.13-10's dialog
  // deliberately does not consult it either (D-06/D-07), so the "loop
  // forever on Getting download size…" hazard this chokepoint used to guard
  // against is now closed by dialog design rather than by this
  // short-circuit.
  if (runner === 'steam' && action === 'install' && gameInfo) {
    void startSteamQuickInstall(appName, gameInfo)
    return
  }

  useInstallGameModal.setState({
    isOpen: true,
    appName,
    runner,
    gameInfo,
    action
  })
}

export const closeInstallGameModal = () => {
  useInstallGameModal.setState({
    isOpen: false,
    // A stale degrade record would show one game's library warning on the
    // next game's dialog.
    steamDegrade: undefined
  })
}
