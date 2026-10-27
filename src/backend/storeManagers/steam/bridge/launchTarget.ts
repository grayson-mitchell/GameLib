/**
 * Phase 24 Plan 08 (R4/R6, review finding #2): resolves a bridge-eligible
 * game's WINDOWS launch executable from PICS appinfo `config.launch` --
 * there is no bottled `steam.exe` to `-applaunch` on the bridge path
 * (RESEARCH Pattern 4: "bridge games are launched by running their own .exe
 * directly via runWineCommand"), so GameLib must resolve the game's own
 * launch target itself rather than reusing the bottled-Steam dispatch shape.
 *
 * Phase 54 (ROADMAP SC2): the PICS read goes over the shared ANONYMOUS client
 * first and never logs on, so Play cannot sign Mac Steam's Friends session
 * out. A license-gated app answers anonymously with a `public_only` subset
 * (no `config`); for those the lookup falls back, in order, to (1) an
 * authenticated session that is ALREADY open (`acquireOpenAuthenticated`,
 * which never logs on) and (2) the launch target persisted at the last
 * successful resolve (`bridge.launchTarget`). The T-21-11 "no second logon"
 * note becomes "no logon at all". A non-numeric appId or total absence of an
 * answer yields `undefined` -- a launch-exe lookup must not hard-fail the
 * caller's launch() flow.
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
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { SteamUser } from '../user'
import { getAnonymousPicsClient, isPublicOnlyEntry } from '../anonymousClient'
import { readBridgeVerdict, setBridgeLaunchTarget } from './bridgeVerdict'
import { sanitizeInstalldir } from '../installLocation'
import { getBridgeBottleSettings, getBottleSteamappsDir } from '../bottle'
import {
  withTimeout,
  STEAM_PICS_TIMEOUT_MS,
  STEAM_PICS_BULK_TIMEOUT_MS,
  STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS
} from '../withTimeout'

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

/** The Windows launch entry as PICS spells it (raw executable, installdir). */
interface WindowsLaunch {
  executable: string
  installdir?: string
}

/**
 * Prefer an explicit windows-tagged entry; fall back to a single untagged
 * entry (no oslist) for Windows-only titles that don't tag it at all
 * (D-UAT-24-03). Never fall back to a mac/linux-tagged entry.
 */
function pickWindowsLaunch(appinfo: unknown): WindowsLaunch | undefined {
  const info = appinfo as AppLaunchInfo | undefined
  const launchEntries = Object.values(info?.config?.launch ?? {})
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
  if (!windowsEntry?.executable) return undefined
  return {
    executable: windowsEntry.executable,
    installdir: info?.config?.installdir
  }
}

interface PicsReader {
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{ apps?: Record<number, unknown> }>
}

interface LaunchAnswer {
  launch?: WindowsLaunch
  publicOnly: boolean
}

/** One bounded PICS read. A reject or timeout counts as public-only. */
async function readLaunch(
  client: PicsReader,
  appId: string
): Promise<LaunchAnswer> {
  try {
    const numericAppId = Number(appId)
    // D-01a gap-audit fix (Phase 33-02): bounded so a stale-but-present CM
    // socket rejects within STEAM_PICS_TIMEOUT_MS instead of parking the
    // install/launch/uninstall caller forever.
    const { apps } = await withTimeout(
      client.getProductInfo([numericAppId], [], true),
      STEAM_PICS_TIMEOUT_MS,
      'resolveBridgeLaunchExe getProductInfo'
    )
    const entry = apps?.[numericAppId] as { appinfo?: unknown } | undefined
    return {
      launch: pickWindowsLaunch(entry?.appinfo),
      publicOnly: isPublicOnlyEntry(entry)
    }
  } catch (error) {
    logWarning(
      [
        `resolveBridgeLaunchExe: getProductInfo failed for appId ${appId}`,
        error
      ],
      LogPrefix.Steam
    )
    return { publicOnly: true }
  }
}

/**
 * Resolves the absolute path to a bridge-eligible game's Windows launch
 * executable, consumable directly as `runWineCommand`'s `commandParts[0]`.
 * Never throws: any guard failure, missing answer, or PICS error logs a
 * warning and returns `undefined` -- the caller (games.ts launch() bridge
 * branch) is responsible for surfacing an actual failure signal.
 *
 * Source order (Phase 54): anonymous PICS -> an already-open authenticated
 * session -> the persisted `bridge.launchTarget`. Never a logon.
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

  try {
    let launch: WindowsLaunch | undefined
    let fromPics = false

    let anonymous: Awaited<ReturnType<typeof getAnonymousPicsClient>> = null
    try {
      anonymous = await withTimeout(
        getAnonymousPicsClient('launch-target'),
        STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS,
        'resolveBridgeLaunchExe anonymous connect'
      )
    } catch (err) {
      logWarning(
        `resolveBridgeLaunchExe: anonymous connect failed for appId ${appId}: ${String(err)}`,
        LogPrefix.Steam
      )
    }

    if (anonymous) {
      const answer = await readLaunch(anonymous, appId)
      if (answer.launch && !answer.publicOnly) {
        launch = answer.launch
        fromPics = true
      }
    }

    if (!launch) {
      const open = SteamUser.acquireOpenAuthenticated('user-install')
      if (open) {
        try {
          const answer = await readLaunch(open.client, appId)
          if (answer.launch) {
            launch = answer.launch
            fromPics = true
          }
        } finally {
          open.release()
        }
      }
    }

    if (launch && fromPics && launch.installdir) {
      setBridgeLaunchTarget(appId, {
        executable: launch.executable,
        installdir: launch.installdir
      })
    }

    if (!launch) {
      const stored = readBridgeVerdict(appId)?.launchTarget
      if (stored) {
        logInfo(
          `resolveBridgeLaunchExe: PICS unavailable for appId ${appId}, using the stored launch target`,
          LogPrefix.Steam
        )
        launch = stored
      }
    }

    if (!launch) {
      logWarning(
        `resolveBridgeLaunchExe: no windows launch entry found for appId ${appId}`,
        LogPrefix.Steam
      )
      return undefined
    }

    // quick/261016-u1w (D-B threading): resolve THIS game's own bridge
    // bottle rather than the shared zero-arg default.
    const bottleName = getBridgeBottleSettings(appId).wineCrossoverBottle
    const steamappsDir = getBottleSteamappsDir(bottleName)
    // D-02/D-04 (37-10): sanitizeInstalldir may THROW UnsafeInstalldirError on
    // a denylist/containment violation -- applied to every source (anonymous,
    // session, stored record). The catch below keeps the never-throws contract.
    const installdir = sanitizeInstalldir(
      launch.installdir,
      appId,
      steamappsDir
    )
    const gameInstallDir = join(steamappsDir, 'common', installdir)

    // PICS stores the executable with Windows separators (XCOM 200510:
    // `Binaries\Win32\XComGame.exe`). On macOS a backslash is a filename
    // character, so split it into segments or the joined path does not exist.
    return join(gameInstallDir, ...launch.executable.split('\\'))
  } catch (error) {
    logWarning(
      [`resolveBridgeLaunchExe: failed for appId ${appId}`, error],
      LogPrefix.Steam
    )
    return undefined
  }
}

/**
 * Phase 54: records a launch target for every installed bridge appId that
 * lacks one, from ONE bulk PICS call on a client the caller already holds
 * (an authenticated lease held by Refresh or sign-in). Never opens or
 * acquires a session itself and never throws. Returns the recorded count.
 */
export async function backfillBridgeLaunchTargets(
  client: PicsReader,
  appIds: string[]
): Promise<number> {
  const missing = appIds.filter(
    (id) => NUMERIC_APP_ID.test(id) && !readBridgeVerdict(id)?.launchTarget
  )
  if (missing.length === 0) return 0

  try {
    const { apps } = await withTimeout(
      client.getProductInfo(missing.map(Number), [], true),
      STEAM_PICS_BULK_TIMEOUT_MS,
      'backfillBridgeLaunchTargets getProductInfo'
    )
    let recorded = 0
    for (const id of missing) {
      const entry = apps?.[Number(id)] as { appinfo?: unknown } | undefined
      const launch = pickWindowsLaunch(entry?.appinfo)
      if (launch?.installdir) {
        setBridgeLaunchTarget(id, {
          executable: launch.executable,
          installdir: launch.installdir
        })
        recorded++
      }
    }
    logInfo(
      `resolveBridgeLaunchExe: backfilled ${recorded} launch targets from the held Steam session`,
      LogPrefix.Steam
    )
    return recorded
  } catch (error) {
    logWarning(
      ['backfillBridgeLaunchTargets: bulk PICS read failed', error],
      LogPrefix.Steam
    )
    return 0
  }
}
