import { NAV_TAB_IDS, resolveActiveTab } from './navTabs'

/**
 * Per-tab last-location memory for the tier-1 tabs. Session-only and
 * in-memory, the same rationale as `Library/librarySessionSearch.ts`
 * (D-22: nothing survives a relaunch).
 *
 * - Ownership: a location belongs to the tab `resolveActiveTab` lights for
 *   it, the tab the user sees selected while there. Every game page
 *   therefore belongs to Games, including one opened from Downloads or the
 *   Redeem dialog (its `fromDM` state keeps its Back button honest).
 * - The router state is kept because `GamePage/index.tsx:107` destructures
 *   `location.state`; a game page without `gameInfo` (the tray/deeplink
 *   shape) is never remembered, so a restore cannot crash it.
 * - `/loginweb` is never remembered: mounting the login WebView starts a
 *   login flow.
 * - The lit tab goes to its root, otherwise the strip would offer no way
 *   out of a remembered game page.
 * - Independent of the `last-store` localStorage override in
 *   `resolveDefaultStore` and of the localStorage `last-url-*` embed
 *   persistence, both deliberately untouched.
 */
type NavTabId = (typeof NAV_TAB_IDS)[number]

type TabTarget = { to: string; state?: unknown }

const memory = new Map<NavTabId, TabTarget>()

export function rememberTabLocation(location: {
  pathname: string
  search?: string
  state?: unknown
}): void {
  const { pathname, search, state } = location
  const owner = resolveActiveTab(pathname)
  if (owner === null || pathname.includes('/loginweb')) {
    return
  }
  if (pathname.includes('/gamepage')) {
    const gameInfo = (state as { gameInfo?: unknown } | null | undefined)
      ?.gameInfo
    if (!gameInfo) {
      return
    }
  }
  memory.set(owner, { to: `${pathname}${search ?? ''}`, state })
}

export function resolveTabTarget(
  tab: NavTabId,
  rootTo: string,
  activeTab: NavTabId | null
): TabTarget {
  const remembered = memory.get(tab)
  if (tab === activeTab || !remembered) {
    return { to: rootTo }
  }
  return remembered.state === undefined
    ? { to: remembered.to }
    : { to: remembered.to, state: remembered.state }
}

export function resetTabLocationMemoryForTests(): void {
  memory.clear()
}
