import { logInfo, logError, LogPrefix } from 'backend/logger'
import { parseMetacriticScore } from 'common/metacriticScore'
import { steamMetadataStore, SteamMetadataCacheEntry } from './electronStores'
import {
  withPlatformCaptureLock,
  PlatformCapturePicsClient
} from './platformCapture'
import { withTimeout, STEAM_PICS_BULK_TIMEOUT_MS } from './withTimeout'

/**
 * Quick 261029-sbi: bulk PICS capture of `appinfo.common.metacritic_score`.
 *
 * Scoped to apps with `metacriticCaptured !== true`, so it converges: one bulk
 * `getProductInfo` per sync only while uncaptured apps exist, none after. It
 * is a separate pass from `captureOwnedAppPlatforms` because that one's scope
 * (depot signal) is already empty for the existing cached library.
 *
 * Never throws (same D-03 fail-soft rationale as platformCapture.ts). Adds no
 * timer, watcher or socket: the only handle is the PICS request, bounded by
 * `withTimeout`, and it runs only inside an explicit or open-session sync,
 * never at boot, so the sidecar exit contract is untouched.
 */

interface AppCommonMetacritic {
  common?: { metacritic_score?: unknown }
}

interface MetacriticCaptureSummary {
  scopedCount: number
  capturedCount: number
  skippedCount: number
  failed: boolean
}

export async function captureOwnedAppMetacritic(
  client: PlatformCapturePicsClient,
  appIds: number[]
): Promise<MetacriticCaptureSummary> {
  let scopedCount = appIds.length
  try {
    return await withPlatformCaptureLock(async () => {
      const scoped = appIds.filter(
        (id) => steamMetadataStore.get(String(id))?.metacriticCaptured !== true
      )
      scopedCount = scoped.length

      if (scoped.length === 0) {
        return {
          scopedCount: 0,
          capturedCount: 0,
          skippedCount: 0,
          failed: false
        }
      }

      const response = await withTimeout(
        client.getProductInfo(scoped, [], true),
        STEAM_PICS_BULK_TIMEOUT_MS,
        'captureOwnedAppMetacritic getProductInfo'
      )

      let capturedCount = 0
      let skippedCount = 0

      for (const id of scoped) {
        const isUnknownApp = response.unknownApps?.includes(id) === true
        const entry = isUnknownApp ? undefined : response.apps?.[id]
        const appinfo = entry?.appinfo as AppCommonMetacritic | undefined
        if (!appinfo?.common) {
          // No answer: stays uncaptured and is retried on the next sync.
          skippedCount += 1
          continue
        }

        const score = parseMetacriticScore(appinfo.common.metacritic_score)
        const existing = steamMetadataStore.get(String(id))
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { metacritic_score: _stale, ...rest } = existing ?? {}
        // Partial entry cast: this bulk writer has no art source, so
        // `existing` can legitimately be absent (same as mergePlatformCapture).
        steamMetadataStore.set(String(id), {
          ...rest,
          ...(score !== undefined ? { metacritic_score: score } : {}),
          metacriticCaptured: true
        } as SteamMetadataCacheEntry)
        capturedCount += 1
      }

      logInfo(
        `Steam bulk metacritic capture: scoped=${scoped.length} captured=${capturedCount} skipped=${skippedCount}`,
        LogPrefix.Steam
      )

      return {
        scopedCount: scoped.length,
        capturedCount,
        skippedCount,
        failed: false
      }
    })
  } catch (err) {
    logError(['Steam bulk metacritic capture failed:', err], LogPrefix.Steam)
    return {
      scopedCount,
      capturedCount: 0,
      skippedCount: 0,
      failed: true
    }
  }
}
