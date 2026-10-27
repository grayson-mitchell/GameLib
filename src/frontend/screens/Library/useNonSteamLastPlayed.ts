import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameInfo } from 'common/types'
import { timestampStore } from 'frontend/helpers/electronStores'

type NonSteamLastPlayedMap = Readonly<Record<string, string | undefined>>

/**
 * Back-off between `timestampStore` hydrate attempts after a failed fetch (review
 * 261027-jjz WR-01). Bounded: after the last delay the hook gives up with ONE warning
 * and waits for a store-change notification (a later successful background hydrate, or
 * any push for the store) to start a fresh round.
 */
export const LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS: readonly number[] = [
  1000, 2000, 4000, 8000
]

/**
 * Set once `timestampStore` has hydrated in this renderer, so a Library remount (route
 * change and back) builds the map in its FIRST render instead of showing the "not ready"
 * fallback for a frame. The transport keeps the store hydrated for the window's life
 * except across an `invalidated` push; that re-fetch notifies `storeOnChanged` when it
 * lands, which re-reads the map.
 */
let timestampStoreHydratedOnce = false

function sameMap(a: NonSteamLastPlayedMap, b: NonSteamLastPlayedMap): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((key) => key in b && a[key] === b[key])
}

/**
 * Last played (ISO) for every non-Steam game in `games`, read from GameLib's lazy
 * `timestampStore`. Steam never reads this store (it uses `extra.steamLastPlayed`).
 *
 * Returns `null` while `active` is false or until the store has hydrated: the caller must
 * treat that as "not known yet", which is distinct from "never played" (an absent key in
 * a hydrated map). Reading a cold store instead would return `undefined` for every game
 * and log one lazy-miss warning per game (WR-01).
 *
 * `games` should be the UNFILTERED library (WR-02): keyed to the filtered list, every
 * filter change rebuilt the map one render late, so newly visible games sorted as never
 * played for a frame. The map is built synchronously in render (a memo), so a library
 * change can never be paired with a stale map either.
 *
 * Re-read triggers (WR-05): `storeOnChanged('timestampStore')` fires after the snapshot
 * reflects a sidecar write, so the session-end `lastPlayed` write is seen regardless of
 * whether `recentGamesChanged` arrives before or after it. `recentAppNames` is kept as a
 * second trigger only as a backstop.
 */
export function useNonSteamLastPlayed(
  active: boolean,
  games: readonly GameInfo[],
  recentAppNames: readonly string[]
): NonSteamLastPlayedMap | null {
  const [hydrated, setHydrated] = useState(timestampStoreHydratedOnce)
  const [storeVersion, setStoreVersion] = useState(0)

  useEffect(() => {
    if (!active) return
    return window.api.storeOnChanged('timestampStore', () =>
      setStoreVersion((v) => v + 1)
    )
  }, [active])

  // Hydrate, retrying with a bounded back-off. Re-armed by `storeVersion` while still
  // un-hydrated, so a background hydrate that succeeds after we gave up (or any later
  // push) starts a fresh round rather than leaving the sort permanently degraded.
  useEffect(() => {
    if (!active || hydrated) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    const tryHydrate = () => {
      window.api
        .storeEnsureHydrated('timestampStore')
        .then((ok) => {
          if (cancelled) return
          if (ok) {
            timestampStoreHydratedOnce = true
            setHydrated(true)
            return
          }
          const delay = LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS[attempt++]
          if (delay === undefined) {
            console.warn(
              'Library: timestampStore did not hydrate after ' +
                `${attempt} attempts; Last played for non-Steam games stays ` +
                'unknown until the store reports a change'
            )
            return
          }
          timer = setTimeout(tryHydrate, delay)
        })
        .catch((error: unknown) => {
          console.error('Library: Last played hydrate failed', error)
        })
    }
    tryHydrate()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [active, hydrated, storeVersion])

  const nonSteamAppNames = useMemo(
    () =>
      games.filter((game) => game.runner !== 'steam').map((g) => g.app_name),
    [games]
  )

  // Keeps the previous map's identity when a re-read changes nothing (e.g. a
  // `totalPlayed` write), so the grid's sort memo is not invalidated for no reason.
  const previous = useRef<NonSteamLastPlayedMap | null>(null)

  return useMemo(() => {
    if (!active || !hydrated) {
      previous.current = null
      return null
    }
    // Referenced so the linter accepts them as the re-read triggers they are: the reads
    // below go through the store snapshot, which React cannot see change.
    void storeVersion
    void recentAppNames
    const map: Record<string, string | undefined> = {}
    for (const appName of nonSteamAppNames) {
      map[appName] = timestampStore.get_nodefault(appName)?.lastPlayed
    }
    if (previous.current && sameMap(previous.current, map)) {
      return previous.current
    }
    previous.current = map
    return map
  }, [active, hydrated, nonSteamAppNames, storeVersion, recentAppNames])
}
