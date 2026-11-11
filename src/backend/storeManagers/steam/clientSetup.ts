// Phase 21 Plan 10 — D-10 guided native Steam-client install + D-11
// prompt-to-launch. Replaces Plan 07's always-ready stub.
//
// ensureSteamClientReady(appId) is the SAME seam games.ts's
// installDepotDownload() gates the depot download on (Plan 07 wiring is
// unchanged — the `ready`/`error` fields stay backward compatible with
// games.ts's `if (!clientReady.ready)` check and games.test.ts's own
// `jest.mock('../clientSetup', () => ({ ensureSteamClientReady: jest.fn() }))`
// mock; the richer `status` field is new and drives the D-10/D-11 branch
// logic plus the steamClientSetupRecheck IPC handler below).
//
// D-10: when the Steam CLIENT itself is absent, this module downloads the
// OFFICIAL native Steam installer over HTTPS ONLY (T-21-20) and runs it
// NON-SILENTLY — Windows: launch the .exe through PowerShell
// `Start-Process -Verb RunAs` (the installer requires elevation, so a direct
// CreateProcess spawn fails with EACCES instead of raising UAC — D-UAT-17),
// with no /S / /VERYSILENT flag, so the user answers UAC and then sees the
// real Valve installer window; macOS: `open` the
// official .dmg, which mounts it and shows Finder for the user's own
// drag-to-Applications install; Linux: distro packaging is not reliably
// automatable — link out to the official download page instead of
// attempting a silent/background install.
//
// D-11: when Steam IS installed but has never been launched (no
// steamapps/libraryfolders.vdf yet), GameLib prompts the user to launch
// Steam once itself — it NEVER authors/synthesizes libraryfolders.vdf
// (T-21-21 mitigation; the needs-launch branch below performs reads only).

import { join } from 'path'
import { existsSync, mkdirSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { GlobalConfigSlice } from 'backend/config'
import type { ManagerDeps } from 'backend/services/types'
import type { SpawnDeps } from './provisionBottle'
import { isMac, isLinux } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { downloadSetupPayload } from './setupDownloads'
import {
  STEAM_DOWNLOAD_URL,
  STEAM_SETUP_EXE_URL,
  steamSupportPath
} from './constants'
import { NUMERIC_APP_ID } from './gameConstants'

// Shown to the user after the frontend's "Steam setup could not start: " prefix;
// the exit code and stderr detail go to the log instead.
const WINDOWS_LAUNCH_FAILED =
  'The Steam installer did not open (administrator permission was declined or the launch failed)'
const MAC_LAUNCH_FAILED = 'The Steam installer disk image did not open'

/**
 * Wraps a string as a PowerShell single-quoted literal. Nothing inside is
 * interpolated, and doubling every apostrophe means the value can neither
 * close the literal early nor split into several arguments (a Windows
 * username may contain a space or an apostrophe).
 */
function toPowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

// Not exported (this and EnsureSteamClientReadyResult, StartGuidedInstallStatus and
// StartGuidedInstallResult below): verified to have no importer anywhere -- not in any
// tracked .ts/.tsx file (`pnpm find-deadcode` / ts-prune flagged the previously-exported
// forms as over-broad `export` keywords).
type SteamClientReadyStatus = 'ready' | 'needs-install' | 'needs-launch'

interface EnsureSteamClientReadyResult {
  status: SteamClientReadyStatus
  // Mirrors `status === 'ready'` — kept alongside `status` so Plan 07's
  // existing games.ts call site (`if (!clientReady.ready)`) needs zero
  // changes (21-07 SUMMARY's stated invariant: "same exported signature ...
  // no games.ts changes needed").
  ready: boolean
  error?: string
}

/**
 * True only when steamapps/libraryfolders.vdf exists under the configured
 * defaultSteamPath — mirrors backend/utils.ts's getSteamLibraries(deps) own vdf
 * path construction, but as a direct existence probe rather than reusing
 * getSteamLibraries(deps)'s return value: getSteamLibraries(deps) ALWAYS includes a
 * hardcoded '/usr/share/steam' fallback entry regardless of whether the vdf
 * exists, so its array length/emptiness can never reliably signal "vdf
 * absent" — reusing it here would silently defeat D-11 by never detecting
 * the never-launched case. Read-only: never creates or writes the file
 * (T-21-21).
 */
function hasLibraryFoldersVdf(
  config: Pick<GlobalConfigSlice, 'getSettings'>
): boolean {
  const { defaultSteamPath } = config.getSettings()
  const path = defaultSteamPath.replaceAll("'", '')
  const vdfFile = join(path, 'steamapps', 'libraryfolders.vdf')
  return existsSync(vdfFile)
}

/**
 * Resolves once the Steam CLIENT this appId's native depot download needs is
 * ready to adopt the manifest: the client must be INSTALLED and have been
 * LAUNCHED at least once (steamapps/libraryfolders.vdf exists).
 *
 *  - Steam absent -> 'needs-install' (D-10): emits steamClientSetupRequired
 *    with reason 'install' so the frontend opens the guided-install consent
 *    UI. Nothing is downloaded/installed here — that only happens on
 *    explicit user consent via startGuidedClientInstall below.
 *  - Steam installed, never launched -> 'needs-launch' (D-11): emits
 *    steamClientSetupRequired with reason 'launch-once'. NEVER authors
 *    libraryfolders.vdf (T-21-21).
 *  - Both present -> 'ready': no event fired, install() proceeds.
 *
 * appId is guarded with the same /^\d+$/ rule as buildSteamProtocolUrl
 * (T-21-05). This function is the single seam BOTH games.ts's internal
 * install() call AND the new steamClientSetupRecheck IPC handler go
 * through, so guarding here covers the untrusted-IPC-input case at its true
 * entry point without a second, duplicated guard in main.ts.
 */
export async function ensureSteamClientReady(
  deps: Pick<ManagerDeps, 'config' | 'steamUser'>,
  appId: string
): Promise<EnsureSteamClientReadyResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `ensureSteamClientReady: rejected non-numeric appId "${appId}" (T-21-05)`,
      LogPrefix.Steam
    )
    return {
      status: 'needs-install',
      ready: false,
      error: `Invalid appId: "${appId}"`
    }
  }

  if (!deps.steamUser.isSteamClientInstalled()) {
    logInfo(
      `ensureSteamClientReady: Steam client not installed — requesting guided install for appId ${appId} (D-10)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamClientSetupRequired', {
      appName: appId,
      reason: 'install'
    })
    return { status: 'needs-install', ready: false }
  }

  if (!hasLibraryFoldersVdf(deps.config)) {
    logInfo(
      `ensureSteamClientReady: Steam installed but never launched (no libraryfolders.vdf) — requesting launch-once prompt for appId ${appId} (D-11)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamClientSetupRequired', {
      appName: appId,
      reason: 'launch-once'
    })
    return { status: 'needs-launch', ready: false }
  }

  return { status: 'ready', ready: true }
}

// ── D-10: guided native Steam-client install ────────────────────────────────

// Official native Steam client installers — HTTPS only (T-21-20). The
// Windows URL is the SAME cdn path bottle.ts's STEAM_SETUP_EXE_URL already
// uses for the bottled-Wine install (it is the identical Valve-published
// installer either way; reusing the constant avoids drift/duplication). No
// Linux distro package URL exists here on purpose — D-10 explicitly links
// out on Linux rather than attempting to auto-install a distro package.
const STEAM_MAC_INSTALLER_URL =
  'https://cdn.cloudflare.steamstatic.com/client/installer/steam.dmg'

type StartGuidedInstallStatus = 'started' | 'link-opened' | 'error'

interface StartGuidedInstallResult {
  status: StartGuidedInstallStatus
  error?: string
}

/**
 * D-10: on user consent (the frontend SteamClientSetup.tsx consent dialog),
 * downloads the official native Steam installer and runs it NON-SILENTLY —
 * no /S, /VERYSILENT, or other unattended flag is ever passed — so the user
 * sees and clicks through the real Valve installer themselves.
 *
 *  - Windows: fetch SteamSetup.exe and launch it on the host OS through
 *    PowerShell `Start-Process -Verb RunAs` (this is the NATIVE client —
 *    never routed through Wine/CrossOver, unlike bottle.ts's
 *    provisionBottle()). The installer needs elevation, so a direct spawn
 *    fails with EACCES (D-UAT-17); RunAs raises UAC instead. No wait switch
 *    and no installer arguments are passed, so the Valve installer window
 *    stays visible.
 *  - macOS: fetch the official .dmg and `open` it — mounts the disk image
 *    and shows Finder, the standard macOS drag-to-Applications flow; the
 *    closest non-silent equivalent to Windows' installer wizard for a
 *    .dmg-packaged app.
 *  - Linux: distro packaging is not reliably automatable (D-10) — open the
 *    official Steam download page instead of attempting any install.
 *
 * On Win/macOS this awaits the LAUNCHER's outcome, never the installer's
 * lifetime: the user completes the click-through/drag-install at their own
 * pace. A launch that failed or was declined (UAC "No", a failed `open`)
 * returns status 'error' so the UI does not claim an install is running when
 * nothing opened (D-UAT-17).
 */
export async function startGuidedClientInstall(
  deps: SpawnDeps & Pick<ManagerDeps, 'openExternal'>
): Promise<StartGuidedInstallResult> {
  if (isLinux) {
    try {
      await deps.openExternal.openExternal(STEAM_DOWNLOAD_URL)
      return { status: 'link-opened' }
    } catch (error) {
      logError(
        [
          'startGuidedClientInstall: failed to open the Steam download page',
          error
        ],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Failed to open ${STEAM_DOWNLOAD_URL}`
      }
    }
  }

  const installerUrl = isMac ? STEAM_MAC_INSTALLER_URL : STEAM_SETUP_EXE_URL
  const destFileName = isMac ? 'steam.dmg' : 'SteamSetup.exe'
  const destDir = join(steamSupportPath, 'redist')
  const destPath = join(destDir, destFileName)

  try {
    mkdirSync(destDir, { recursive: true })
    if (!existsSync(destPath)) {
      await downloadSetupPayload('steam-client', {
        url: installerUrl,
        dest: destPath
      })
    }
  } catch (error) {
    logError(
      [
        'startGuidedClientInstall: failed to download the native Steam installer',
        error
      ],
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Failed to download the Steam installer: ${String(error)}`
    }
  }

  // NON-SILENT (T-21-20) — macOS: `open` the .dmg (mount + Finder, user
  // completes the drag-install); Windows: PowerShell `Start-Process -Verb
  // RunAs` so UAC is raised (a direct spawn of the exe fails with EACCES,
  // D-UAT-17). No -Wait (it would block on the installer's whole lifetime),
  // no -ArgumentList and no silent/quiet flag: the real Valve installer
  // window is what the user sees. The await is bounded by the user's UAC
  // answer, not by the installer.
  const launcherName = isMac ? 'open' : 'powershell'
  const launchFailedMessage = isMac ? MAC_LAUNCH_FAILED : WINDOWS_LAUNCH_FAILED
  try {
    const { code, stderr } = isMac
      ? await deps.spawnAsync('open', [destPath])
      : await deps.spawnAsync(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            'Start-Process',
            '-FilePath',
            toPowerShellLiteral(destPath),
            '-Verb',
            'RunAs',
            '-ErrorAction',
            'Stop'
          ],
          { windowsHide: true }
        )
    if (code !== 0) {
      // log-secret-gate-exempt: stderr of powershell Start-Process -Verb RunAs / open (Steam installer launch), not an auth command
      logError(
        [
          `startGuidedClientInstall: ${launcherName} exited with code ${String(code)} (${destPath})`,
          stderr.trim()
        ],
        LogPrefix.Steam
      )
      return { status: 'error', error: launchFailedMessage }
    }
  } catch (error) {
    logError(
      [
        `startGuidedClientInstall: failed to launch the native Steam installer through ${launcherName}`,
        error
      ],
      LogPrefix.Steam
    )
    return { status: 'error', error: launchFailedMessage }
  }

  logInfo(
    `startGuidedClientInstall: launched the native Steam installer non-silently (${destPath})`,
    LogPrefix.Steam
  )

  return { status: 'started' }
}
