/**
 * Quick 261122-rgi (D-01, D-03): the opt-in DLC a Steam game offers (a DLC whose depots carry
 * `config.optionaldlc`), for the install dialog's ticks and the Install tab's switch rows.
 *
 * `installed` is read from the installed depots alone (D-03): there is no store, setting or ACF
 * key behind it. `manage` says who may change an installed copy: GameLib's delta updater runs on
 * bridge installs only (Phase 74), so a Steam-registered or bottled-Steam copy is read-only.
 *
 * It never opens a signed-in session. The appinfo comes from the anonymous client first, else
 * from a session that is already open (`acquireOpenAuthenticated` never logs on); with neither it
 * answers null. Ownership needs the licence list, so it is `null` (unknown) without an open
 * session. Never throws. Exit contract: no timers or handles of its own; `withTimeout`'s timer is
 * the only one, and every CM call is bounded by it.
 */
import { dirname } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import type { SteamOptInDlcEntry, SteamOptInDlcInfo } from 'common/types/steam'
import { readAcfInstalledDepots } from './acfInstalledDepots'
import { isPublicOnlyEntry } from './anonymousClient'
import { findBridgeInstallBottle } from './bridgeBottle'
import { NUMERIC_APP_ID } from './gameConstants'
import { hostSteamDepotOs } from './gameRequirements'
import SteamGame from './games'
import { getOwnedSets } from './depot/plan'
import { dlcAppIds, listOptInDlc, type SteamAppInfo } from './depot/select'
import { resolveBridgeUpdateContext } from './depotRust/updateEstimate'
import {
  STEAM_PICS_BULK_TIMEOUT_MS,
  STEAM_PICS_TIMEOUT_MS,
  withTimeout
} from './withTimeout'

/** The one PICS call both the anonymous view and a session lease answer. */
interface PicsReader {
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{ apps?: Record<number, unknown> }>
}

export async function getSteamOptInDlc(
  deps: ManagerDeps,
  appId: string,
  opts: { windowsBuild?: boolean } = {}
): Promise<SteamOptInDlcInfo | null> {
  if (typeof appId !== 'string' || !NUMERIC_APP_ID.test(appId)) return null
  try {
    const copy = await resolveCopy(deps, appId, opts)
    const numericAppId = Number(appId)

    const anonymous = await withTimeout(
      deps.anonymousClient.get('opt-in-dlc'),
      STEAM_PICS_TIMEOUT_MS,
      'getSteamOptInDlc anonymous connect'
    ).catch(() => null)
    // Never logs on: a session that is already open, or null.
    const lease = await deps.steamUser.acquireOpenAuthenticated('user-install')
    try {
      let reader: PicsReader | null = null
      let baseEntry: { appinfo?: unknown } | undefined
      if (anonymous) {
        const answer = await readApps(anonymous, [numericAppId]).catch(
          () => undefined
        )
        const entry = answer?.[numericAppId] as
          | { appinfo?: unknown }
          | undefined
        if (entry?.appinfo && !isPublicOnlyEntry(entry)) {
          reader = anonymous
          baseEntry = entry
        }
      }
      if (!baseEntry && lease) {
        const answer = await readApps(lease.client, [numericAppId])
        const entry = answer?.[numericAppId] as
          | { appinfo?: unknown }
          | undefined
        if (entry?.appinfo) {
          reader = lease.client
          baseEntry = entry
        }
      }
      if (!reader || !baseEntry) return null
      const appinfo = baseEntry.appinfo as SteamAppInfo

      const dlcIds = dlcAppIds(appinfo)
      const dlcInfos: Record<string, SteamAppInfo> = {}
      if (dlcIds.length > 0) {
        const apps = await withTimeout(
          reader.getProductInfo(dlcIds, [], true),
          STEAM_PICS_BULK_TIMEOUT_MS,
          'getSteamOptInDlc dlc getProductInfo'
        ).then((r) => r.apps)
        for (const id of dlcIds) {
          const entry = apps?.[id] as { appinfo?: unknown } | undefined
          if (entry?.appinfo)
            dlcInfos[String(id)] = entry.appinfo as SteamAppInfo
        }
      }

      const listed = listOptInDlc(appinfo, dlcInfos, appId, {
        os: copy.os,
        branch: copy.branch
      })

      let owned: { apps: Set<number>; depots: Set<number> } | null = null
      if (lease) {
        owned = await getOwnedSets(lease.client).catch((err: unknown) => {
          logWarning(
            `getSteamOptInDlc: licence list unavailable for appId ${appId}: ${String(err)}`,
            LogPrefix.Steam
          )
          return null
        })
      }

      const entries: SteamOptInDlcEntry[] = listed.map((dlc) => ({
        appId: dlc.appId,
        name: dlc.name,
        bytes: dlc.bytes,
        owned: owned
          ? owned.apps.has(Number(dlc.appId)) ||
            dlc.depotIds.some((d) => owned.depots.has(Number(d)))
          : null,
        installed: dlc.depotIds.some((d) => copy.installedDepotIds.has(d))
      }))
      return { manage: copy.manage, entries }
    } finally {
      lease?.release()
    }
  } catch (err) {
    logWarning(
      `getSteamOptInDlc: appId ${appId} failed: ${String(err)}`,
      LogPrefix.Steam
    )
    return null
  }
}

async function readApps(
  reader: PicsReader,
  ids: number[]
): Promise<Record<number, unknown> | undefined> {
  const { apps } = await withTimeout(
    reader.getProductInfo(ids, [], true),
    STEAM_PICS_TIMEOUT_MS,
    'getSteamOptInDlc getProductInfo'
  )
  return apps
}

interface Copy {
  manage: SteamOptInDlcInfo['manage']
  os: string
  branch: string
  installedDepotIds: ReadonlySet<string>
}

/** Which copy of the game exists and who may change it. A bridge copy is GameLib's. */
async function resolveCopy(
  deps: ManagerDeps,
  appId: string,
  opts: { windowsBuild?: boolean }
): Promise<Copy> {
  const game = new SteamGame(appId, deps)
  if (findBridgeInstallBottle(deps.paths, appId)) {
    const ctx = await resolveBridgeUpdateContext(game)
    return {
      manage: 'gamelib',
      os: 'windows',
      branch: 'error' in ctx ? 'public' : ctx.branch,
      installedDepotIds: new Set('error' in ctx ? [] : ctx.oldGidByDepot.keys())
    }
  }
  const info = game.findGameInfo()
  const installPath = info?.is_installed
    ? info.install?.install_path
    : undefined
  if (installPath) {
    const acf = await readAcfInstalledDepots(
      deps,
      dirname(dirname(installPath)),
      appId
    )
    return {
      manage: 'steam',
      os: game.isNative() ? hostSteamDepotOs() : 'windows',
      branch: 'public',
      installedDepotIds: new Set(
        acf?.installedDepots.map((d) => d.depotId) ?? []
      )
    }
  }
  return {
    manage: 'not-installed',
    os: opts.windowsBuild ? 'windows' : hostSteamDepotOs(),
    branch: 'public',
    installedDepotIds: new Set()
  }
}
