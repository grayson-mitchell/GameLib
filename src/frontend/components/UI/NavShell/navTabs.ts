/**
 * Tab identity, route-to-tab resolution and the default-store cascade for
 * the app-level navigation shell (REQ-34.10-01, REQ-34.10-11).
 *
 * This module is pure contract -- no React, no side effects at module
 * scope. Every later plan in Phase 34.10 imports from here rather than
 * inventing its own tab-id type or route-matching rules.
 */

/** The four tier-1 tabs, in navbar left-to-right order. */
export const NAV_TAB_IDS = ['accounts', 'games', 'stores', 'settings'] as const

export type NavTabId = (typeof NAV_TAB_IDS)[number]

/**
 * accounts -> 0, games -> 1, stores -> 2, settings -> 3.
 *
 * This index feeds the `id="tab-{index}"` attribute that
 * `components/UI/TabPanel/index.tsx`'s existing `aria-labelledby="tab-{index}"`
 * contract expects -- keep the two in sync.
 */
export const NAV_TAB_INDEX: Record<NavTabId, number> = {
  accounts: 0,
  games: 1,
  stores: 2,
  settings: 3
}

/**
 * Resolves a hash-router pathname (`location.pathname`) to the tier-1 tab
 * that owns it, or `null` when the route has no tab -- currently only
 * `/download-manager`. That `null` is deliberate: per the settled design
 * (`navigation-shell.md` §6) Downloads is ambient state with its own
 * persistent progress ring, not a destination, so the tab strip legitimately
 * shows nothing lit there.
 */
export function resolveActiveTab(pathname: string): NavTabId | null {
  if (pathname.includes('/login') || pathname.includes('/loginweb')) {
    return 'accounts'
  }

  if (pathname === '/' || pathname.includes('/gamepage')) {
    return 'games'
  }

  if (
    pathname.includes('/store/') ||
    pathname.includes('store-page') ||
    // `last-url` appears as a `store/:store` param value in the sidebar
    // code being retired, so the `/store/` clause above already covers it
    // -- this explicit clause mirrors SidebarLinks/index.tsx:45-48 anyway.
    pathname.includes('last-url') ||
    pathname.includes('/discounts') ||
    pathname.includes('/store-search') ||
    pathname.includes('/humble-keys')
  ) {
    return 'stores'
  }

  if (
    pathname.includes('/settings') ||
    pathname.includes('/wine-manager') ||
    pathname.includes('/accessibility') ||
    pathname.includes('/console') ||
    pathname.includes('/wiki')
  ) {
    return 'settings'
  }

  return null
}

/** The store-session slice `resolveDefaultStore` reads from. */
export interface NavStoreSessions {
  epic: { username?: string }
  gog: { username?: string }
  amazon: { user_id?: string }
  steam: { username?: string }
  zoom: { username?: string; enabled: boolean }
}

/**
 * Ports the default-store cascade at `SidebarLinks/index.tsx:82-113`
 * unchanged, in the same branch order, including the trailing
 * `sessionStorage.getItem('last-store')` override that wins over every
 * branch (REQ-34.10-11 -- the cascade carries over unchanged; the Zoom
 * branch stays even though ZOOM Platform is absent from the Stores tier-2
 * list, because this function decides a route target, not a rendered row).
 *
 * `sessionStorage` is read here, inside the function, not at module scope,
 * so tests can stub it.
 */
export function resolveDefaultStore(sessions: NavStoreSessions): string {
  const { epic, gog, amazon, steam, zoom } = sessions

  // By default, open Epic Store
  let defaultStore = 'epic'
  if (
    zoom.enabled &&
    !epic.username &&
    !gog.username &&
    !amazon.user_id &&
    zoom.username
  ) {
    // Prioritize Zoom if only Zoom is logged in
    defaultStore = 'zoom'
  } else if (!epic.username && !gog.username && amazon.user_id) {
    // If only logged in to Amazon Games, open Amazon Gaming
    defaultStore = 'amazon'
  } else if (!epic.username && gog.username) {
    // Otherwise, if not logged in to Epic Games, open GOG Store
    defaultStore = 'gog'
  } else if (
    !epic.username &&
    !gog.username &&
    !amazon.user_id &&
    steam.username
  ) {
    // If only logged in to Steam, open the (browse-only) Steam store so the
    // Stores link doesn't land on Epic and show a "not logged in" warning.
    defaultStore = 'steam'
  }

  // if we have a stored last-url, default to the `/last-url` route
  const lastStore = sessionStorage.getItem('last-store')
  if (lastStore) {
    defaultStore = lastStore
  }

  return defaultStore
}
