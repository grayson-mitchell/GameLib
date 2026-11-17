import { useEffect, useMemo, useState } from 'react'

const STEAM_APPID_RE = /^\d{1,10}$/

/**
 * PRICE-02 / RESEARCH D4: ITAD result ids are gids, not Steam appids, so the
 * "Owned on Steam" badge needs a gid -> appid join. This hook asks the backend
 * (one `getItadSteamGids` call per distinct appid set; the backend persists
 * the mapping for 30 days, T-47-33) which gid each of the user's Steam
 * library appids maps to, and returns the INVERSE map (gid -> appId) the
 * container feeds into `resolveStoreSearchBadges` as `steamAppId`.
 *
 * Waiting Humble keys' appids are included too (Pitfall 7) so the exact
 * `keyAvailable` arm survives for games the user does not own on Steam.
 *
 * Failure-tolerant by design (RESEARCH D4.4, T-47-32): a failed lookup yields
 * an empty Map, so `steamAppId` stays undefined and the resolver falls back
 * to its fuzzy arms. A wrong Steam badge can never be shown, and search is
 * never blocked.
 */
export function useOwnedSteamGids(
  steamLibrary: { app_name: string }[],
  keysWaiting: { steamAppId?: string }[]
): Map<string, string> {
  const [gidToAppId, setGidToAppId] = useState<Map<string, string>>(
    () => new Map()
  )

  const appIdsKey = useMemo(() => {
    const ids = new Set<string>()
    for (const game of steamLibrary) {
      ids.add(game.app_name)
    }
    for (const key of keysWaiting) {
      if (key.steamAppId !== undefined) ids.add(key.steamAppId)
    }
    return [...ids]
      .filter((id) => STEAM_APPID_RE.test(id) && id !== '0')
      .sort()
      .join(',')
  }, [steamLibrary, keysWaiting])

  useEffect(() => {
    if (appIdsKey === '') {
      setGidToAppId(new Map())
      return
    }
    let cancelled = false
    window.api
      .getItadSteamGids(appIdsKey.split(','))
      .then((record) => {
        if (cancelled) return
        const inverted = new Map<string, string>()
        for (const [appId, gid] of Object.entries(record)) {
          inverted.set(gid, appId)
        }
        setGidToAppId(inverted)
      })
      .catch((err) => {
        if (cancelled) return
        window.api.logError(
          `useOwnedSteamGids: gid lookup failed: ${String(err)}`
        )
        setGidToAppId(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [appIdsKey])

  return gidToAppId
}
