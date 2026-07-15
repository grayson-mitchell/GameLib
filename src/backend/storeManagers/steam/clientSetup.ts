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
// NON-SILENTLY — Windows: spawn the .exe directly (no /S / /VERYSILENT
// flag), the user sees the real Valve installer window; macOS: `open` the
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
import { GlobalConfig } from 'backend/config'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { downloadFile, openUrlOrFile, spawnAsync } from 'backend/utils'
import { isMac, isLinux } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { SteamUser } from './user'
import {
  STEAM_DOWNLOAD_URL,
  STEAM_SETUP_EXE_URL,
  steamSupportPath
} from './constants'

const NUMERIC_APP_ID = /^\d+$/

export type SteamClientReadyStatus = 'ready' | 'needs-install' | 'needs-launch'

export interface EnsureSteamClientReadyResult {
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
 * defaultSteamPath — mirrors backend/utils.ts's getSteamLibraries() own vdf
 * path construction, but as a direct existence probe rather than reusing
 * getSteamLibraries()'s return value: getSteamLibraries() ALWAYS includes a
 * hardcoded '/usr/share/steam' fallback entry regardless of whether the vdf
 * exists, so its array length/emptiness can never reliably signal "vdf
 * absent" — reusing it here would silently defeat D-11 by never detecting
 * the never-launched case. Read-only: never creates or writes the file
 * (T-21-21).
 */
function hasLibraryFoldersVdf(): boolean {
  const { defaultSteamPath } = GlobalConfig.get().getSettings()
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

  if (!SteamUser.isSteamClientInstalled()) {
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

  if (!hasLibraryFoldersVdf()) {
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

export type StartGuidedInstallStatus = 'started' | 'link-opened' | 'error'

export interface StartGuidedInstallResult {
  status: StartGuidedInstallStatus
  error?: string
}

/**
 * D-10: on user consent (the frontend SteamClientSetup.tsx consent dialog),
 * downloads the official native Steam installer and runs it NON-SILENTLY —
 * no /S, /VERYSILENT, or other unattended flag is ever passed — so the user
 * sees and clicks through the real Valve installer themselves.
 *
 *  - Windows: fetch SteamSetup.exe, spawn it DIRECTLY on the host OS (this
 *    is the NATIVE client — never routed through Wine/CrossOver, unlike
 *    bottle.ts's provisionBottle()).
 *  - macOS: fetch the official .dmg and `open` it — mounts the disk image
 *    and shows Finder, the standard macOS drag-to-Applications flow; the
 *    closest non-silent equivalent to Windows' installer wizard for a
 *    .dmg-packaged app.
 *  - Linux: distro packaging is not reliably automatable (D-10) — open the
 *    official Steam download page instead of attempting any install.
 *
 * Fire-and-forget on Win/macOS (mirrors provisionBottle's wait:false — the
 * user completes the click-through/drag-install at their own pace); this
 * function itself returns as soon as the download completes and the
 * installer process/Finder window has been launched.
 */
export async function startGuidedClientInstall(): Promise<StartGuidedInstallResult> {
  if (isLinux) {
    try {
      await openUrlOrFile(STEAM_DOWNLOAD_URL)
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
      await downloadFile({ url: installerUrl, dest: destPath })
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
  // completes the drag-install); Windows: spawn the exe directly with no
  // silent/quiet flag, the real Valve installer window is what the user
  // sees. Fire-and-forget — never awaited — so this function returns
  // promptly instead of blocking on the user's own click-through pace.
  const launch = isMac
    ? spawnAsync('open', [destPath])
    : spawnAsync(destPath, [])
  launch.catch((error) => {
    logWarning(
      [
        'startGuidedClientInstall: native Steam installer process reported an error (fire-and-forget)',
        error
      ],
      LogPrefix.Steam
    )
  })

  logInfo(
    `startGuidedClientInstall: launched the native Steam installer non-silently (${destPath})`,
    LogPrefix.Steam
  )

  return { status: 'started' }
}
