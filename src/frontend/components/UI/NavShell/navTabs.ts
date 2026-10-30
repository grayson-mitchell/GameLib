/**
 * Tab identity, route-to-tab resolution and the default-store cascade for
 * the app-level navigation shell (REQ-34.10-01, REQ-34.10-11).
 *
 * This module is pure contract -- no React, no side effects at module
 * scope. Every later plan in Phase 34.10 imports from here rather than
 * inventing its own tab-id type or route-matching rules.
 */

/** The five tier-1 tabs, in navbar left-to-right order. */
export const NAV_TAB_IDS = [
  'accounts',
  'games',
  'stores',
  'downloads',
  'settings'
] as const

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- there
// is no external consumer, so the export served no purpose).
type NavTabId = (typeof NAV_TAB_IDS)[number]

/**
 * accounts -> 0, games -> 1, stores -> 2, downloads -> 3, settings -> 4.
 *
 * This index feeds the `id="tab-{index}"` attribute that
 * `components/UI/TabPanel/index.tsx`'s existing `aria-labelledby="tab-{index}"`
 * contract expects -- keep the two in sync.
 */
export const NAV_TAB_INDEX: Record<NavTabId, number> = {
  accounts: 0,
  games: 1,
  stores: 2,
  downloads: 3,
  settings: 4
}

/**
 * Resolves a hash-router pathname (`location.pathname`) to the tier-1 tab
 * that owns it, or `null` only for routes with no tab (unrouted paths).
 * Quick task 261012-dhs reversed `navigation-shell.md` §6 by user decision:
 * Downloads is now a destination tab, so `/download-manager` resolves to
 * `'downloads'` (it was `null` in the ambient-ring era).
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

  if (pathname.includes('/download-manager')) {
    return 'downloads'
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
}

const LAST_STORE_KEY = 'last-store'
const STORE_KEYS = ['epic', 'gog', 'amazon', 'steam']

/**
 * Records the storefront the user last opened, so the Stores tab returns to
 * it instead of falling back to the cascade below. Written by `WebView` on
 * every `/store/:store` mount. `localStorage`, not `sessionStorage`, so the
 * choice survives a relaunch; unknown keys are ignored.
 */
export function rememberLastStore(store: string | undefined): void {
  if (!store || !STORE_KEYS.includes(store)) {
    return
  }
  try {
    localStorage.setItem(LAST_STORE_KEY, store)
  } catch {
    // storage unavailable -- fall back to the cascade next time
  }
}

/**
 * Ports the default-store cascade at `SidebarLinks/index.tsx:82-113`
 * unchanged, in the same branch order, followed by the `last-store`
 * override (written by `rememberLastStore`) that wins over every branch.
 *
 * `localStorage` is read here, inside the function, not at module scope,
 * so tests can stub it.
 */
export function resolveDefaultStore(sessions: NavStoreSessions): string {
  const { epic, gog, amazon, steam } = sessions

  // By default, open Epic Store
  let defaultStore = 'epic'
  if (!epic.username && !gog.username && amazon.user_id) {
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

  // the store the user last opened wins over the cascade
  let lastStore: string | null = null
  try {
    lastStore = localStorage.getItem(LAST_STORE_KEY)
  } catch {
    lastStore = null
  }
  if (lastStore && STORE_KEYS.includes(lastStore)) {
    defaultStore = lastStore
  }

  return defaultStore
}
