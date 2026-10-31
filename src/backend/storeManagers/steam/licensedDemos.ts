import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { withTimeout } from './withTimeout'

/**
 * Quick 261031-i0q: licensed demos for the Steam library Refresh.
 *
 * Spike 052: `getUserOwnedApps` never returns demos (free-on-demand
 * licenses), under any option and whether or not they were played. The
 * licenses path does: `client.licenses` -> PICS package info
 * (`packageinfo.appids`) -> PICS app info (`common.type`). Only type Demo is
 * added, by user decision; DLC, tools and unplayed free-to-play games stay out.
 *
 * Uses only the client passed in. It never acquires a session or logs on
 * (STEAM-STACK.md Phase 54: every authenticated logon signs the Mac Steam
 * Friends list out).
 */

/** Narrow structural client, mirroring `PlatformCapturePicsClient`. */
export interface LicensedDemosPicsClient {
  licenses?: Array<{ package_id: number }> | null
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{
    apps?: Record<number, { appinfo?: unknown }>
    packages?: Record<number, { packageinfo?: unknown }>
  }>
}

/**
 * One overall budget for the whole licenses -> packages -> apps chain
 * (planner's choice). Not STEAM_PICS_BULK_TIMEOUT_MS per call: on a stale
 * socket that could stall Refresh by up to 180 s. 30 s sits above the 25 s
 * single-call bound and leaves room for a healthy run of about 5 calls.
 */
export const LICENSED_DEMOS_TIMEOUT_MS = 30000

const APP_BATCH_SIZE = 200

interface DemoEntry {
  appid: number
  name: string
  playtime_forever: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function packageAppIds(
  packageIds: number[],
  packages: Record<number, { packageinfo?: unknown }> | undefined
): number[] {
  const out = new Set<number>()
  for (const pid of packageIds) {
    const info = packages?.[pid]?.packageinfo
    const appids = isRecord(info) ? info.appids : undefined
    if (!isRecord(appids)) continue
    for (const v of Object.values(appids)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.add(v)
    }
  }
  return [...out]
}

/** Deduped appids granted by the given packages, minus owned ones. */
export function licensedNotOwnedAppIds(
  ownedAppIds: ReadonlySet<number>,
  packageIds: number[],
  packages: Record<number, { packageinfo?: unknown }> | undefined
): number[] {
  return packageAppIds(packageIds, packages).filter(
    (id) => !ownedAppIds.has(id)
  )
}

/** Pure and total: never throws on malformed PICS data. */
export function selectLicensedDemos(
  ownedAppIds: ReadonlySet<number>,
  packageIds: number[],
  packages: Record<number, { packageinfo?: unknown }> | undefined,
  apps: Record<number, { appinfo?: unknown }> | undefined
): DemoEntry[] {
  const out: DemoEntry[] = []
  for (const appid of licensedNotOwnedAppIds(
    ownedAppIds,
    packageIds,
    packages
  )) {
    const info = apps?.[appid]?.appinfo
    const common = isRecord(info) ? info.common : undefined
    if (!isRecord(common)) continue
    if (String(common.type).toLowerCase() !== 'demo') continue
    const name =
      typeof common.name === 'string' && common.name.length > 0
        ? common.name
        : String(appid)
    out.push({ appid, name, playtime_forever: 0 })
  }
  return out.sort((a, b) => a.appid - b.appid)
}

/**
 * Fail-soft by contract: never throws. A reviewer must not make this
 * fail-closed: doing so would trade "no demos" for "no library".
 */
export async function fetchLicensedDemos(
  client: LicensedDemosPicsClient,
  ownedAppIds: number[]
): Promise<DemoEntry[]> {
  try {
    const licenses = client.licenses
    if (!Array.isArray(licenses)) {
      logWarning(
        'Steam licensed demos: client.licenses unavailable, skipping',
        LogPrefix.Steam
      )
      return []
    }
    const packageIds = [
      ...new Set(
        licenses
          .map((l) => l?.package_id)
          .filter((id): id is number => typeof id === 'number')
      )
    ]
    if (packageIds.length === 0) return []

    const owned = new Set(ownedAppIds)
    return await withTimeout(
      (async () => {
        const pkgResult = await client.getProductInfo([], packageIds, true)
        const remainder = licensedNotOwnedAppIds(
          owned,
          packageIds,
          pkgResult?.packages
        )
        const apps: Record<number, { appinfo?: unknown }> = {}
        for (let i = 0; i < remainder.length; i += APP_BATCH_SIZE) {
          const batch = remainder.slice(i, i + APP_BATCH_SIZE)
          const res = await client.getProductInfo(batch, [], true)
          Object.assign(apps, res?.apps)
        }
        const demos = selectLicensedDemos(
          owned,
          packageIds,
          pkgResult?.packages,
          apps
        )
        logInfo(
          `Steam licensed demos: licenses=${packageIds.length} licensedNotOwned=${remainder.length} demos=${demos.length}`,
          LogPrefix.Steam
        )
        return demos
      })(),
      LICENSED_DEMOS_TIMEOUT_MS,
      'fetchLicensedDemos'
    )
  } catch (err) {
    logWarning(
      ['Steam licensed demos lookup failed, continuing owned-only:', err],
      LogPrefix.Steam
    )
    return []
  }
}
