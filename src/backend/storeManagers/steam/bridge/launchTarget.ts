/**
 * Phase 24 Plan 08 (R4/R6, review finding #2): resolves a bridge-eligible
 * game's WINDOWS launch executable from PICS appinfo `config.launch` --
 * there is no bottled `steam.exe` to `-applaunch` on the bridge path
 * (RESEARCH Pattern 4: "bridge games are launched by running their own .exe
 * directly via runWineCommand"), so GameLib must resolve the game's own
 * launch target itself rather than reusing the bottled-Steam dispatch shape.
 *
 * Modeled directly on installLocation.ts's fetchInstalldir (the exact
 * precedent this task's <read_first> names): same numeric-appId guard ->
 * `SteamUser.getClient()` (no second logon) -> `getProductInfo` over the
 * already-authenticated CM connection -> never-throws-returns-undefined
 * discipline. A missing/absent Steam client, a non-numeric appId, or a PICS
 * failure all fall back to `undefined` -- a launch-exe lookup must not
 * hard-fail the caller's launch() flow.
 *
 * `appinfo.config.launch` is a real Steam PICS map keyed by numeric-string
 * index ("0", "1", ...), not a JS array -- iterated via Object.values().
 * We prefer the entry whose OWN `config.oslist === 'windows'` (the same
 * oslist vocabulary games.ts's hostSteamDepotOs() note already documents),
 * but FALL BACK to a single untagged entry (no `oslist`) -- D-UAT-24-03:
 * older Windows-only titles (e.g. Spiderweb's Avernum 5) ship exactly one
 * launch entry with no oslist at all, so an explicit-windows-only filter
 * found nothing and the whole bridge install/launch failed. Bridge games are
 * bottle-eligible (no usable native build), so an untagged entry IS the
 * Windows launch; we deliberately never fall back to a mac/linux-TAGGED
 * entry. The first matching entry wins (multi-entry windows configs -- e.g.
 * VR vs non-VR variants -- remain out of scope; Avernum 4/Hoard ship one).
 */

import { join } from 'node:path'
import { logWarning, LogPrefix } from 'backend/logger'
import { SteamUser } from '../user'
import { sanitizeInstalldir } from '../installLocation'
import { getBridgeBottleSettings, getBottleSteamappsDir } from '../bottle'
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from '../withTimeout'

// Pattern repeated verbatim across bottle.ts, clientSetup.ts,
// installLocation.ts, allowlist.ts, importScan.ts, shimGenerate.ts -- reuse
// the SAME regex value/name, do not redefine a divergent one.
const NUMERIC_APP_ID = /^\d+$/

interface AppLaunchEntry {
  executable?: string
  config?: { oslist?: string }
}

/**
 * Narrow, ADDITIONAL local view of PICS appinfo's `config.launch`/
 * `config.installdir` fields -- mirrors installLocation.ts's own
 * `AppInstallDirInfo` pattern (a small locally-scoped interface, NOT a
 * widening of the shared SteamAppInfo type that depot/select.ts owns).
 */
interface AppLaunchInfo {
  config?: {
    installdir?: string
    launch?: Record<string, AppLaunchEntry>
  }
}

/**
 * Resolves the absolute path to a bridge-eligible game's Windows launch
 * executable, consumable directly as `runWineCommand`'s `commandParts[0]`.
 * Never throws: any guard failure, missing client, or PICS error logs a
 * warning and returns `undefined` -- the caller (games.ts launch() bridge
 * branch, Task 3) is responsible for surfacing an actual failure signal.
 */
export async function resolveBridgeLaunchExe(
  appId: string
): Promise<string | undefined> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `resolveBridgeLaunchExe: rejected non-numeric appId "${appId}"`,
      LogPrefix.Steam
    )
    return undefined
  }

  const client = SteamUser.getClient()
  if (!client) {
    return undefined
  }

  try {
    const numericAppId = Number(appId)
    // D-01a gap-audit fix (Phase 33-02): this call is reached on the macOS
    // bridge INSTALL path (games.ts installBridgeGame -> resolveBridgeLaunchExe,
    // to place the launch shim post-download) as well as the launch/uninstall
    // paths -- it was a bare, un-timed steam-user CM await identical in shape
    // to the pre-30-07 install-hang bug (installLocation.ts's own
    // fetchInstalldir already bounds the SAME getProductInfo call shape).
    // Bounded here so a stale-but-present CM socket rejects within
    // STEAM_PICS_TIMEOUT_MS instead of parking this await forever; the catch
    // below already turns any reject into a benign `undefined`.
    const { apps } = await withTimeout(
      client.getProductInfo([numericAppId], [], true),
      STEAM_PICS_TIMEOUT_MS,
      'resolveBridgeLaunchExe getProductInfo'
    )
    const entry = apps?.[numericAppId]
    const appinfo = entry?.appinfo as unknown as AppLaunchInfo | undefined

    const launchEntries = Object.values(appinfo?.config?.launch ?? {})
    // Prefer an explicit windows-tagged entry; fall back to a single untagged
    // entry (no oslist) for Windows-only titles that don't tag it at all
    // (D-UAT-24-03). Never fall back to a mac/linux-tagged entry.
    const windowsEntry =
      launchEntries.find(
        (candidate) =>
          candidate?.executable && candidate.config?.oslist === 'windows'
      ) ??
      launchEntries.find(
        (candidate) =>
          candidate?.executable &&
          (candidate.config?.oslist == null || candidate.config.oslist === '')
      )

    if (!windowsEntry?.executable) {
      logWarning(
        `resolveBridgeLaunchExe: no windows launch entry found for appId ${appId}`,
        LogPrefix.Steam
      )
      return undefined
    }

    const installdir = sanitizeInstalldir(appinfo?.config?.installdir, appId)
    const bottleName = getBridgeBottleSettings().wineCrossoverBottle
    const gameInstallDir = join(
      getBottleSteamappsDir(bottleName),
      'common',
      installdir
    )

    return join(gameInstallDir, windowsEntry.executable)
  } catch (error) {
    logWarning(
      [
        `resolveBridgeLaunchExe: getProductInfo failed for appId ${appId}`,
        error
      ],
      LogPrefix.Steam
    )
    return undefined
  }
}
