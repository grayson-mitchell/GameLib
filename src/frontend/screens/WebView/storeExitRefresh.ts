/**
 * Decision logic for the "refresh a store's library when leaving its in-app
 * store" trigger (quick 261030-qqh for Steam, generalised by 261030-ts4 to
 * Epic, GOG and Amazon). Pure leaf module: no React, no `window`; every side
 * effect is injected. State is module-level because a route leave unmounts the
 * embed host hook and it must outlive mounts.
 */
import type { Runner } from 'common/types'

export type StoreExitStoreKey = 'steam' | 'epic' | 'gog' | 'amazon'

type StoreExitRefreshOutcome =
  | 'refreshed'
  | 'skipped-signed-out'
  | 'skipped-in-flight'

const STEAM_STORE_EXIT_REFRESH_ORIGIN = 'steam-store-exit'

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

const LOCALE_SEGMENT = /^[a-z]{2}(-[A-Za-z]{2,4})?$/

/**
 * Parse an https URL whose hostname is EXACTLY in `hosts` and return its path
 * segments (never suffix/substring host matching, never bare-word prefix path
 * matching). Null on anything else.
 */
function httpsSegments(url: string, hosts: Set<string>): string[] | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (!hosts.has(parsed.hostname)) return null
  return parsed.pathname.split('/').filter(Boolean)
}

function dropLocale(segments: string[]): string[] {
  return segments.length > 0 && LOCALE_SEGMENT.test(segments[0])
    ? segments.slice(1)
    : segments
}

const GOG_HOSTS = new Set(['www.gog.com'])

// CANDIDATE pattern, pending live measurement (todo 2026-10-30); evidence:
// https://www.gog.com/game/foo, https://www.gog.com/en/game/foo,
// https://www.gog.com/redeem/<code>; catalog /en/games and the affiliate
// start URL af.gog.com must NOT arm. `redeem` arms because a code redemption
// adds a game to the library.
function isGogPurchaseIntentUrl(url: string): boolean {
  const segs = httpsSegments(url, GOG_HOSTS)
  if (!segs) return false
  const [first, second] = dropLocale(segs)
  if (first === 'game') return second !== undefined
  return first === 'cart' || first === 'checkout' || first === 'redeem'
}

const EPIC_HOSTS = new Set(['store.epicgames.com', 'www.epicgames.com'])

// CANDIDATE pattern, pending live measurement (todo 2026-10-30); evidence:
// https://store.epicgames.com/en-US/p/x, https://store.epicgames.com/p/<title>,
// https://www.epicgames.com/store/product/<slug>. Product pages arm because
// the free-claim "Get" flow runs in an overlay without a main-frame purchase
// page (arm on product pages, refresh on exit).
function isEpicPurchaseIntentUrl(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  let segs = httpsSegments(url, EPIC_HOSTS)
  if (!segs) return false
  if (host === 'www.epicgames.com') {
    if (segs[0] !== 'store') return false
    segs = segs.slice(1)
  }
  const [first, second] = dropLocale(segs)
  if (first === 'p' || first === 'product' || first === 'bundles') {
    return second !== undefined
  }
  return first === 'purchase'
}

const AMAZON_HOSTS = new Set(['gaming.amazon.com'])

// CANDIDATE pattern, pending live measurement (todo 2026-10-30); evidence:
// start URL https://gaming.amazon.com. ANY path arms: Prime Gaming claims are
// inline buttons on the home grid and detail pages and need not navigate, so
// no URL distinguishes intent. The refresh is an ordinary nile entitlement
// sync on stored tokens, gated by sign-in and in-flight; in practice this is
// refresh-on-leave for any Amazon session. Narrowing is a one-row change if
// live measurement shows a claim URL. Any redirect host (e.g. luna.amazon.com)
// is added after measurement, not guessed.
function isAmazonPurchaseIntentUrl(url: string): boolean {
  return httpsSegments(url, AMAZON_HOSTS) !== null
}

interface StoreExitRow {
  runner: Runner
  /** Key of `collectSignInInputs`. */
  signInKey: 'steam' | 'legendary' | 'gog' | 'nile'
  origin: string
  isPurchaseIntentUrl: (url: string) => boolean
}

export const STORE_EXIT_ROWS: Readonly<
  Record<StoreExitStoreKey, StoreExitRow>
> = Object.freeze({
  steam: {
    runner: 'steam',
    signInKey: 'steam',
    origin: STEAM_STORE_EXIT_REFRESH_ORIGIN,
    isPurchaseIntentUrl: isSteamPurchaseIntentUrl
  },
  epic: {
    runner: 'legendary',
    signInKey: 'legendary',
    origin: 'epic-store-exit',
    isPurchaseIntentUrl: isEpicPurchaseIntentUrl
  },
  gog: {
    runner: 'gog',
    signInKey: 'gog',
    origin: 'gog-store-exit',
    isPurchaseIntentUrl: isGogPurchaseIntentUrl
  },
  amazon: {
    runner: 'nile',
    signInKey: 'nile',
    origin: 'amazon-store-exit',
    isPurchaseIntentUrl: isAmazonPurchaseIntentUrl
  }
})

export function isStoreExitStoreKey(key: string): key is StoreExitStoreKey {
  return Object.prototype.hasOwnProperty.call(STORE_EXIT_ROWS, key)
}

export function isPurchaseIntentUrlFor(storeKey: string, url: string): boolean {
  if (!isStoreExitStoreKey(storeKey)) return false
  return STORE_EXIT_ROWS[storeKey].isPurchaseIntentUrl(url)
}

const inFlight = new Set<StoreExitStoreKey>()

export function resetStoreExitRefreshState(): void {
  inFlight.clear()
}

export const resetSteamStoreExitRefreshState = resetStoreExitRefreshState

interface StoreExitRefreshDeps {
  signInState: string
  refreshInFlight: boolean
  refreshLibrary: () => Promise<void>
  log: (line: string) => void
}

export function runStoreExitRefresh(
  store: StoreExitStoreKey,
  deps: StoreExitRefreshDeps
): StoreExitRefreshOutcome {
  const prefix = `[${store}StoreExitRefresh]`
  const emit = (outcome: StoreExitRefreshOutcome) => {
    deps.log(
      `${prefix} origin=${STORE_EXIT_ROWS[store].origin} outcome=${outcome}`
    )
    return outcome
  }

  if (deps.signInState !== 'connected' && deps.signInState !== 'unknown') {
    return emit('skipped-signed-out')
  }
  if (deps.refreshInFlight || inFlight.has(store)) {
    return emit('skipped-in-flight')
  }
  // No time throttle: the 261030-qqh live test showed a 2-minute window
  // swallowing the one exit that followed a grant. The in-flight guard above
  // is what stops refreshes stacking.
  inFlight.add(store)
  const clear = () => {
    inFlight.delete(store)
  }
  let p: Promise<void>
  try {
    p = deps.refreshLibrary()
  } catch (error) {
    clear()
    deps.log(`${prefix} refresh threw: ${String(error)}`)
    return emit('refreshed')
  }
  p.catch((error: unknown) => {
    deps.log(`${prefix} refresh failed: ${String(error)}`)
  }).finally(clear)
  return emit('refreshed')
}

export const runSteamStoreExitRefresh = (
  deps: StoreExitRefreshDeps
): StoreExitRefreshOutcome => runStoreExitRefresh('steam', deps)
