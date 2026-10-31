/**
 * 58-18 (T-58-56): the one definition of "same parameter list" shared by the
 * generator's validation (meta/gen_vtables.ts) and the extractor's demotion
 * (meta/extractProtonInventory.ts), so the two can never disagree about which
 * older-version methods may share the newest version's helper flat function.
 *
 * Dependency-free on purpose: importing gen_vtables from the extractor would run
 * the generator's main() when the extractor is bundled.
 */

/** Spelling-only differences between Proton versions of one type (a trailing
 * SDK version / letter on a struct name, spacing) are not signature changes. */
export function normalizeParamType(type: string): string {
  return type
    .replace(/\s+/g, ' ')
    .replace(/\s*\*/g, '*')
    .replace(/_\d+[a-z]?(?=\*|$)/g, '')
    .trim()
}

/** Equal parameter count and equal normalized type at every position. */
export function paramListsEqual(
  a: readonly { type: string }[],
  b: readonly { type: string }[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) => normalizeParamType(p.type) === normalizeParamType(b[i].type)
    )
  )
}

/** Families whose older versions are checked: the Phase 58 multiplayer set.
 * Earlier phases hand-wired older versions with helper-side argument handling
 * (trailing null args, deprecated slots) and are out of this check's scope. */
export const OLDER_VERSION_CHECKED_FAMILIES: ReadonlySet<string> = new Set([
  'SteamNetworking',
  'SteamNetworkingSockets',
  'SteamNetworkingUtils',
  'SteamNetworkingMessages',
  'SteamMatchmaking',
  'SteamMatchmakingServers',
  'SteamFriends'
])
