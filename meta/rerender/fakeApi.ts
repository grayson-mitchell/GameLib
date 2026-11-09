import type { GameInfo, Runner } from 'common/types'

type Listener = (...args: unknown[]) => unknown

export const listeners: Record<string, Listener[]> = {}

/** Fire every captured listener registered through `window.api[method]`. */
export function emit(method: string, ...args: unknown[]): void {
  for (const cb of listeners[method] ?? []) cb(...args)
}

const resolved: Record<string, unknown> = {
  isFullscreen: false,
  isFrameless: false,
  getUserInfo: { displayName: 'perf' },
  getConnectivityStatus: { status: 'online', retryIn: 0 },
  getSignInProbeOutcomes: {},
  requestAppSettings: {},
  checkGameUpdates: [],
  getCrossoverIndex: {},
  getRunsForMeMap: {},
  humbleGetKeys: [],
  humbleGetSyncState: { syncedAt: null, syncError: 'none' },
  refreshLibrary: undefined
}

/**
 * Install a Proxy-based fake `window.api`. Listener registrations
 * (`handleX` / `onX`) are captured; `storeGet` serves the synthetic fixture.
 */
export function installFakeApi(fixture: Record<Runner, GameInfo[]>): void {
  // Keyed by the REAL store names from frontend/helpers/stores.ts. CacheStore
  // libraries also need `storeHas` true and a fresh `__timestamp.<key>`.
  const stamp = Date()
  const storeData: Record<string, Record<string, unknown>> = {
    legendary_library: {
      library: fixture.legendary,
      '__timestamp.library': stamp
    },
    gog_library: { games: fixture.gog, '__timestamp.games': stamp },
    gogInstalledGamesStore: { installed: [] },
    nile_library: { library: fixture.nile, '__timestamp.library': stamp },
    steam_library: { games: fixture.steam, '__timestamp.games': stamp },
    sideloadedStore: { games: fixture.sideload }
  }
  const storeGet = (store: string, key: string, def: unknown) => {
    const byStore = storeData[store]
    if (byStore && key in byStore) return byStore[key]
    return def
  }
  const storeHas = (store: string, key: string) =>
    !!storeData[store] && key in storeData[store]

  for (const k of Object.keys(listeners)) delete listeners[k]

  const target: Record<string, unknown> = {
    storeGet,
    storeHas
  }
  const api = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop]
      if (/^(handle|on)[A-Z]/.test(prop)) {
        return (cb: Listener) => {
          ;(listeners[prop] ||= []).push(cb)
          return () => undefined
        }
      }
      if (prop in resolved) return () => Promise.resolve(resolved[prop])
      return () => Promise.resolve(undefined)
    }
  })
  const w = window as unknown as Record<string, unknown>
  w.api = api
  w.platform = 'darwin'
  w.setTheme = () => undefined
}
