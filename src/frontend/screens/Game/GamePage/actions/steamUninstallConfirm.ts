/**
 * quick 261112-90h (66.3 UAT test 5). Whether the game-page Uninstall for a
 * Steam game must open GameLib's UninstallModal first.
 *
 * D-05 (no GameLib confirm, Steam's own dialog confirms) holds only for the
 * delegated steam://uninstall route. Bridge, bottle, setting-ON native and
 * unadopted-Mac-native installs are deleted by GameLib itself, so GameLib must
 * confirm them. Fails closed: only a literal `delegated === true` skips it.
 */
export type SteamDeleteRoute = { gamelibDelete: boolean; delegated: boolean }

/** Closed fallback for a failed route query: never delegated, so the modal opens. */
export const CLOSED_STEAM_DELETE_ROUTE: SteamDeleteRoute = {
  gamelibDelete: false,
  delegated: false
}

export function steamUninstallNeedsConfirm(route: unknown): boolean {
  if (typeof route !== 'object' || route === null) return true
  const { delegated, gamelibDelete } = route as Record<string, unknown>
  return !(delegated === true && gamelibDelete !== true)
}
