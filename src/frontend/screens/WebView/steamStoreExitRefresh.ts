/**
 * Decision logic for the "refresh the Steam library when leaving the in-app
 * Steam store" trigger (quick 261030-qqh). Pure leaf module: no React, no
 * `window`; every side effect is injected. State is module-level because a
 * route leave unmounts the embed host hook and it must outlive mounts.
 */

export const STEAM_STORE_EXIT_REFRESH_ORIGIN = 'steam-store-exit'
export const STEAM_STORE_EXIT_REFRESH_THROTTLE_MS = 2 * 60 * 1000

export type SteamStoreExitRefreshOutcome =
  | 'refreshed'
  | 'skipped-signed-out'
  | 'skipped-in-flight'
  | 'skipped-throttled'

const STEAM_STORE_HOSTS = new Set([
  'store.steampowered.com',
  'checkout.steampowered.com'
])

/** True for an https Steam store app, cart or checkout main-frame URL. */
export function isSteamPurchaseIntentUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (!STEAM_STORE_HOSTS.has(parsed.hostname)) return false
  const path = parsed.pathname
  return (
    path.startsWith('/app/') ||
    path === '/cart' ||
    path.startsWith('/cart/') ||
    path === '/checkout' ||
    path.startsWith('/checkout/')
  )
}

let lastAutoRefreshAt: number | null = null
let autoRefreshInFlight = false

export function resetSteamStoreExitRefreshState(): void {
  lastAutoRefreshAt = null
  autoRefreshInFlight = false
}

export interface SteamStoreExitRefreshDeps {
  signInState: string
  refreshInFlight: boolean
  refreshLibrary: () => Promise<void>
  log: (line: string) => void
  now?: () => number
}

export function runSteamStoreExitRefresh(
  deps: SteamStoreExitRefreshDeps
): SteamStoreExitRefreshOutcome {
  const now = (deps.now ?? Date.now)()
  const emit = (outcome: SteamStoreExitRefreshOutcome) => {
    deps.log(
      `[steamStoreExitRefresh] origin=${STEAM_STORE_EXIT_REFRESH_ORIGIN} outcome=${outcome}`
    )
    return outcome
  }

  if (deps.signInState !== 'connected' && deps.signInState !== 'unknown') {
    return emit('skipped-signed-out')
  }
  if (deps.refreshInFlight || autoRefreshInFlight) {
    return emit('skipped-in-flight')
  }
  if (
    lastAutoRefreshAt !== null &&
    now - lastAutoRefreshAt < STEAM_STORE_EXIT_REFRESH_THROTTLE_MS
  ) {
    return emit('skipped-throttled')
  }

  lastAutoRefreshAt = now
  autoRefreshInFlight = true
  const clear = () => {
    autoRefreshInFlight = false
  }
  let p: Promise<void>
  try {
    p = deps.refreshLibrary()
  } catch (error) {
    clear()
    deps.log(`[steamStoreExitRefresh] refresh threw: ${String(error)}`)
    return emit('refreshed')
  }
  p.catch((error: unknown) => {
    deps.log(`[steamStoreExitRefresh] refresh failed: ${String(error)}`)
  }).finally(clear)
  return emit('refreshed')
}
