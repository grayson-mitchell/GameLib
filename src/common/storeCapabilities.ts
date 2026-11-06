// Phase 62 (D-01, D-02): the one static table that says what each store can and
// cannot do, plus the one named helper for the rare check that is genuinely
// about store identity.
//
// Why a table: behaviour that differs per store (a Steam game's install is owned
// by the Steam client, only Epic and GOG have DLC pickers, ...) used to be
// spelled `runner === 'steam'` at ~200 call sites, each re-deciding the same
// question. The same drift hit steamInstallOptionsEntry.ts (34.13 C-04): two
// sites disagreed, so the decision was pulled into one function. This table
// does that for every store. `satisfies Record<Runner, StoreCapabilities>`
// makes adding a Runner a compile error until every flag is answered.
//
// Per-game facts (`is_delisted`, `thirdPartyManagedApp`, `canRunOffline`,
// `steamResumePending`, ...) stay on `GameInfo`; nothing here is stamped onto a
// serialised game. A flag says what a *store* can do, never what a *game* is.
//
// Identity checks ("this is the GOG login") use `isStore`, the only place a raw
// store-literal comparison is allowed. `src/common/**` sits outside the
// runner-literal ratchet, so no disable comment is needed here.
//
// Only `import type` from `common/types`: common/ never imports backend/ or
// frontend/ (see types/game_manager.ts).
import type { Runner } from 'common/types'

export interface StoreCapabilities {
  /** Identity field: the runner this row describes. */
  store: Runner
  // Steam-only (D-07, GAME-03): the Steam client and the ACF poller own install
  // progress, completion toasts, cancel and uninstall. No pause/cancel surface.
  installManagedExternally: boolean
  // Steam-only (34.13 C-04): install begins by handing off to the Steam client.
  installHandOffToClient: boolean
  // Steam-only: launch is a steam:// hand-off or bridge spawn; args are ignored.
  launchHandedToClient: boolean
  // Steam-only: the game runs in a bottle with CrossOver-first engine selection.
  usesBottleRuntime: boolean
  // Steam-only: appName is the Steam appId (wiki, ProtonDB, gamesdb lookups).
  appNameIsSteamAppId: boolean
  // Steam-only: playtime and last-played come from store metadata.
  playtimeFromStoreMetadata: boolean
  // Steam-only: bottleProcessMonitor records sessions, not launcher.ts.
  playtimeTrackedExternally: boolean
  // Steam-only (37-REVIEW W-01): delisted titles have no store page; the fact
  // itself is per-game `GameInfo.is_delisted`.
  canBeDelisted: boolean
  // Steam-only: install size comes from the Steam store query.
  installSizeFromSteamStore: boolean
  // Epic + GOG: DLC list selector at install.
  supportsDlcSelection: boolean
  // Epic + GOG: cloud saves settings and sync.
  supportsCloudSaves: boolean
  // Epic + GOG: modify-install menu item.
  supportsModifyInstall: boolean
  // Everything except sideload: store-provided description, developer, size,
  // update, anticheat info.
  hasStoreCatalog: boolean
  // Everything except Steam: "Add to Steam" is meaningful.
  canAddSteamShortcut: boolean
  // Everything except Steam: wine prefix tools apply.
  winePrefixToolsAvailable: boolean
}

export type CapabilityFlag = keyof Omit<StoreCapabilities, 'store'>

/** A runner, or the Humble key store which is compared at login but is not a Runner. */
export type StoreKey = Runner | 'humble'

const NOT_STEAM = {
  installManagedExternally: false,
  installHandOffToClient: false,
  launchHandedToClient: false,
  usesBottleRuntime: false,
  appNameIsSteamAppId: false,
  playtimeFromStoreMetadata: false,
  playtimeTrackedExternally: false,
  canBeDelisted: false,
  installSizeFromSteamStore: false,
  canAddSteamShortcut: true,
  winePrefixToolsAvailable: true
} as const

export const storeCapabilities = {
  legendary: {
    ...NOT_STEAM,
    store: 'legendary',
    supportsDlcSelection: true,
    supportsCloudSaves: true,
    supportsModifyInstall: true,
    hasStoreCatalog: true
  },
  gog: {
    ...NOT_STEAM,
    store: 'gog',
    supportsDlcSelection: true,
    supportsCloudSaves: true,
    supportsModifyInstall: true,
    hasStoreCatalog: true
  },
  sideload: {
    ...NOT_STEAM,
    store: 'sideload',
    supportsDlcSelection: false,
    supportsCloudSaves: false,
    supportsModifyInstall: false,
    hasStoreCatalog: false
  },
  nile: {
    ...NOT_STEAM,
    store: 'nile',
    supportsDlcSelection: false,
    supportsCloudSaves: false,
    supportsModifyInstall: false,
    hasStoreCatalog: true
  },
  steam: {
    store: 'steam',
    installManagedExternally: true,
    installHandOffToClient: true,
    launchHandedToClient: true,
    usesBottleRuntime: true,
    appNameIsSteamAppId: true,
    playtimeFromStoreMetadata: true,
    playtimeTrackedExternally: true,
    canBeDelisted: true,
    installSizeFromSteamStore: true,
    supportsDlcSelection: false,
    supportsCloudSaves: false,
    supportsModifyInstall: false,
    hasStoreCatalog: true,
    canAddSteamShortcut: false,
    winePrefixToolsAvailable: false
  }
} as const satisfies Record<Runner, StoreCapabilities>

/**
 * Flag accessor for a runner that is not statically `Runner`. Legacy
 * `runner === 'steam'` was false for undefined or unknown values, where a bare
 * `storeCapabilities[runner].flag` would throw (T-62-27).
 */
export function hasCapability(
  runner: string | null | undefined,
  flag: CapabilityFlag
): boolean {
  if (
    typeof runner !== 'string' ||
    !Object.prototype.hasOwnProperty.call(storeCapabilities, runner)
  ) {
    return false
  }
  return storeCapabilities[runner as Runner][flag]
}

/**
 * The one sanctioned raw store-identity comparison (D-02). False for
 * null/undefined and for an object without a runner.
 */
export function isStore<T extends { runner: StoreKey }, K extends StoreKey>(
  subject: T,
  store: K
): subject is T & { runner: K }
export function isStore(
  subject: string | null | undefined | { runner?: string | null },
  store: StoreKey
): boolean
export function isStore(
  subject: string | null | undefined | { runner?: string | null },
  store: StoreKey
): boolean {
  if (subject === null || subject === undefined) return false
  const key = typeof subject === 'string' ? subject : subject.runner
  return key === store
}

/** Replaces `runner === 'steam' && action === 'install'`: a client-managed install request. */
export function isHandOffInstall(
  runner: string | null | undefined,
  action: string | null | undefined
): boolean {
  return hasCapability(runner, 'installHandOffToClient') && action === 'install'
}
