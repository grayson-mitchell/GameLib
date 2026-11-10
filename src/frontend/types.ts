import {
  AppSettings,
  GameInfo,
  Runner,
  DialogType,
  ButtonOptions,
  DMQueueElement,
  DownloadManagerState,
  GameSettings,
  WikiInfo,
  ExtraInfo,
  Status,
  InstallInfo
} from 'common/types'
import { NileLoginData, NileRegisterData } from 'common/types/nile'
import { HumbleKey } from 'common/types/humble'
import type { RunsForMeState } from 'common/runsForMe'
import type {
  LibraryGroupBy,
  LibrarySortDirection,
  LibrarySortField
} from 'frontend/screens/Library/librarySort'

export type Category =
  | 'all'
  | 'legendary'
  | 'gog'
  | 'sideload'
  | 'nile'
  | 'steam'

/**
 * The per-account and per-collection shapes the account hooks in
 * `state/accountHooks.ts` build. (Formerly the account slice of the deleted
 * GlobalState context type.)
 */
export interface AccountSlices {
  hiddenGames: {
    list: HiddenGame[]
    add: (appNameToHide: string, appTitle: string) => void
    remove: (appNameToUnhide: string) => void
  }
  favouriteGames: {
    list: HiddenGame[]
    add: (appNameToAdd: string, appTitle: string) => void
    remove: (appNameToRemove: string) => void
  }
  customCategories: {
    list: Record<string, string[]>
    listCategories: () => string[]
    addToGame: (category: string, appName: string) => void
    removeFromGame: (category: string, appName: string) => void
    addCategory: (newCategory: string) => void
    removeCategory: (category: string) => void
    renameCategory: (oldName: string, newName: string) => void
  }
  epic: {
    library: GameInfo[]
    username?: string
    login: (sid: string) => Promise<string>
    logout: () => Promise<void>
  }
  gog: {
    library: GameInfo[]
    username?: string
    login: (token: string) => Promise<string>
    logout: () => Promise<void>
  }
  amazon: {
    library: GameInfo[]
    user_id?: string
    username?: string
    getLoginData: () => Promise<NileLoginData>
    login: (data: NileRegisterData) => Promise<string>
    logout: () => Promise<void>
  }
  steam: {
    library: GameInfo[]
    username?: string | null
    login: (result: { status: string; username?: string }) => Promise<string>
    logout: () => Promise<void>
  }
  humble: {
    isLoggedIn?: boolean
    username?: string | null
    expired?: boolean
    encryptionDegraded?: boolean
    keys?: HumbleKey[]
    syncedAt?: number | null
    syncError?: 'none' | 'denied' | 'network' | 'partial'
    syncing?: boolean
    login: (result: { status: string; username?: string }) => Promise<string>
    logout: () => Promise<void>
  }
}

export type DialogModalOptions = {
  showDialog?: boolean
  title?: string
  message?: string | React.ReactElement
  buttons?: Array<ButtonOptions>
  type?: DialogType
  className?: string
  onClose?: () => void
  /** Backend correlation id; the renderer acks it once the dialog is on screen. */
  ackId?: string
  /** Distinct per accepted request; DialogHandler keys the modal by it so a promoted dialog mounts fresh (G28). A close may carry it to close only that dialog (WR-01). */
  dialogKey?: number
  /** Stable identity chosen by the caller: a request with the dialogId of an open or queued dialog updates it in place (no queue, no remount), and a close carrying it closes only that dialog. */
  dialogId?: string
}

export interface ExternalLinkDialogOptions {
  showDialog: boolean
  linkCallback?: () => void
}

interface HiddenGame {
  appName: string
  title: string
}

export interface InstallProgress {
  bytes: string
  eta: string
  folder?: string
  percent: number
}

export type SyncType = 'Download' | 'Upload' | 'Force download' | 'Force upload'

declare global {
  interface Window {
    imageData: (
      src: string,
      canvas_width: number,
      canvas_height: number
    ) => Promise<string>
    setTheme: (themeClass: string) => void
    isSteamDeck: boolean
    isSteamDeckGameMode: boolean
    isFlatpak: boolean
    flatpakRuntimeVersion?: string
    platform: NodeJS.Platform
    isE2ETesting: boolean
  }

  interface WindowEventMap {
    'controller-changed': CustomEvent<{ controllerId: string }>
  }
}

export interface SettingsContextType {
  getSetting: <T extends keyof AppSettings>(
    key: T,
    fallback: NonNullable<AppSettings[T]>
  ) => NonNullable<AppSettings[T]>
  setSetting: <T extends keyof AppSettings>(
    key: T,
    value: AppSettings[T]
  ) => void
  config: Partial<AppSettings>
  isDefault: boolean
  appName: string
  runner?: Runner
  gameInfo?: GameInfo
  isMacNative: boolean
  isLinuxNative: boolean
}

export interface StoresFilters {
  legendary: boolean
  gog: boolean
  nile: boolean
  sideload: boolean
  steam: boolean
}

export interface PlatformsFilters {
  win: boolean
  linux: boolean
  mac: boolean
  browser: boolean
}

// D-17: macOS-only CrossOver-rating library filter. Deliberately NOT
// `FilterMode` (tri-state off/show/only) — a rating filter is inherently
// multi-select, mirroring the `PlatformsFilters` shape (default all `true`,
// opt-out semantics). See Library/index.tsx.
export interface CrossoverRatingFilters {
  gold: boolean
  silver: boolean
  bronze: boolean
  wontRun: boolean
  unrated: boolean
}

export type FilterMode = 'off' | 'show' | 'only'

// D-11: the "No store page" facet's own tri-state. Its neutral is 'off', but
// unlike `FilterMode` the two non-off states are 'only' and 'hide' -- there
// is no 'show' state. `describeActiveFilters` emits a descriptor whenever a
// tri-state is `!== 'off'`, so a `'show'`-defaulting row would put a chip in
// the chip row and "1 selected" on the More group badge for every user on a
// virgin library with zero action taken. A per-row exception suppressing the
// descriptor was rejected to keep `selectionCount.ts`'s "what counts as
// active" rule uniform across all six More filters.
export type NoStorePageMode = 'off' | 'only' | 'hide'

export interface LibraryContextType {
  filterText: string
  handleLayout: (value: string) => void
  handleSearch: (input: string) => void
  layout: string
  showHidden: FilterMode
  setShowHidden: (value: FilterMode) => void
  showFavourites: boolean
  setShowFavourites: (value: boolean) => void
  showInstalledOnly: boolean
  setShowInstalledOnly: (value: boolean) => void
  showNonAvailable: FilterMode
  setShowNonAvailable: (value: FilterMode) => void
  // D-11: "No store page" tri-state (off / only / hide). Opt-in replacement
  // for the forced-hide REQ-37-02/D-15 removed from isNonAvailableGame.
  noStorePage: NoStorePageMode
  setNoStorePage: (value: NoStorePageMode) => void
  sortField: LibrarySortField
  setSortField: (value: LibrarySortField) => void
  sortDirection: LibrarySortDirection
  setSortDirection: (value: LibrarySortDirection) => void
  groupBy: LibraryGroupBy
  setGroupBy: (value: LibraryGroupBy) => void
  showSupportOfflineOnly: boolean
  setShowSupportOfflineOnly: (value: boolean) => void
  showThirdPartyManagedOnly: boolean
  setShowThirdPartyManagedOnly: (value: boolean) => void
  showUpdatesOnly: boolean
  setShowUpdatesOnly: (value: boolean) => void
  handleAddGameButtonClick: () => void
  // WR-08: `intent` distinguishes `+ New collection` ('create') from
  // `Manage collections` ('manage') so the two panel rows record
  // observably different calls instead of being the same action twice.
  // Optional so the dialog's own `setShowCategories(false)` close calls
  // (CategoriesManager) keep compiling unchanged.
  setShowCategories: (value: boolean, intent?: 'manage' | 'create') => void
  categoriesManagerIntent: 'manage' | 'create'
  showAlphabetFilter: boolean
  onToggleAlphabetFilter: () => void
  alphabetFilterLetter: string | null
  setAlphabetFilterLetter: (letter: string | null) => void
  gamesForAlphabetFilter: GameInfo[]

  // Quick 261029-riq: the panel's quick-filter row is (Installed) | (All)
  // (Native). Installed is an independent toggle; `nativeOnly` is the
  // All/Native single-select pair (false = All). `nativeFilterAvailable` is
  // false on win32, where the pair is not rendered (D-riq-1).
  installedOnly: boolean
  setInstalledOnly: (value: boolean) => void
  nativeOnly: boolean
  setNativeOnly: (value: boolean) => void
  nativeFilterAvailable: boolean
  // D-01: opt-in store selection. Default []. [] means no constraint.
  storeFacet: StoreFacetValue[]
  setStoreFacet: (value: StoreFacetValue[]) => void
  // D-01: opt-in runnability selection (runnabilityFacet). Default [].
  // [] means no constraint.
  runnabilityFacet: RunnabilityTier[]
  setRunnabilityFacet: (value: RunnabilityTier[]) => void
  // D-21: single-select collection -- a `customCategories` key, the literal
  // 'preset_uncategorized', or null for no constraint.
  currentCollection: string | null
  setCurrentCollection: (value: string | null) => void
  // D-25: resets AND persists every filter below to its default, including
  // clearing the session-only search term. A non-persisting implementation
  // would be a defect, not a simplification -- see Library/index.tsx.
  clearAllFilters: () => void
  // D-26: the active filter DESCRIPTOR LIST, not just a count -- plan 08's
  // chip row renders one chip per descriptor and needs id/kind/value per
  // entry, which a bare count cannot provide.
  activeFilterDescriptors: ActiveFilterDescriptor[]
  // Always the descriptor list's `.length`, derived from that same array in
  // the same memo -- never a second independent computation (see the
  // provider's clear-all wiring in Library/index.tsx for why that matters).
  activeFilterCount: number
  // The Runnability rows this host can compute (plan 01's
  // `runnabilityRowsForHost`). Empty on Windows -- consumers render no
  // Runnability group at all when this is empty (D-12 extension).
  runnabilityRows: RunnabilityTier[]
  // The store facet values whose account is connected (D-04) -- the Store
  // group renders a row only for a connected account, never a permanent 0.
  connectedStores: StoreFacetValue[]
  // D-28: exclude-your-own-facet counts, built on filterEngine's `countFor`.
  countForStore: (value: StoreFacetValue) => number
  countForRunnability: (value: RunnabilityTier) => number
  // Set ONLY in `LibraryContext.tsx`'s `initialContext`, never by the real
  // provider in `Library/index.tsx`. Lets a consumer distinguish "mounted,
  // nothing selected" ([] descriptors, 0 count) from "rendered outside the
  // provider" (same [] / 0, but from the no-op default) -- the exact
  // ambiguity that let 34.10 ship a relocated <Header> whose filters were
  // dead while looking alive. Plan 08 branches on this sentinel.
  __isDefaultLibraryContext?: true
}

export interface GameContextType {
  appName: string
  runner: Runner
  gameInfo: GameInfo | null
  gameExtraInfo: ExtraInfo | null
  gameSettings: GameSettings | null
  gameInstallInfo: InstallInfo | null
  is: {
    installing: boolean
    importing: boolean
    installingWinetricksPackages: boolean
    installingRedist: boolean
    preparingDrm: boolean
    downloadingEngine: boolean
    startingSteam: boolean
    launching: boolean
    linux: boolean
    linuxNative: boolean
    mac: boolean
    macNative: boolean
    moving: boolean
    native: boolean
    notAvailable: boolean
    notInstallable: boolean
    notSupportedGame: boolean
    playing: boolean
    queued: boolean
    reparing: boolean
    sideloaded: boolean
    settingUpBottle: boolean
    syncing: boolean
    uninstalling: boolean
    updating: boolean
    win: boolean
    notPlayableOffline: boolean
  }
  statusContext?: string
  status: Status | undefined
  wikiInfo: WikiInfo | null
  refreshWikiInfo?: () => Promise<void>
}

export type DMQueue = {
  elements: DMQueueElement[]
  finished: DMQueueElement[]
  state: DownloadManagerState
}

// D-05: the Games tier-2 panel's single-select view set. 'all' is the
// default and the only value that produces no chip (D-26).
// Since quick 261029-riq this serves only the Focus row
// (`focusRowSelectors.ts`) and the engine's `view` stage; the main grid has no
// view selector and always passes 'all'.
export type LibraryView = 'all' | 'installed' | 'recentlyPlayed' | 'favourites'

// D-09/D-10: the runnability facet's rows. 'bottle' collapses the
// gold/silver/bronze CrossOver medal tiers into one row — medal tiers are
// evidence, not user-facing controls (D-10). 'notChecked' is the
// `rating === null` row (looked up, no data). A game whose tier cannot be
// computed on the current host renders NO row at all (D-12).
// 'runsForMe' (quick 261029-mkz) is user-asserted (or auto-set after a 60 s
// session): it wins over every rating-derived tier and 'notChecked', never
// over 'native'.
export type RunnabilityTier =
  | 'native'
  | 'runsForMe'
  | 'bottle'
  | 'wontRun'
  | 'notChecked'

// D-01: the store facet's opt-in value union, mirroring StoresFilters' six
// runner keys so a selection can be a plain array instead of a boolean mask.
export type StoreFacetValue =
  | 'legendary'
  | 'gog'
  | 'nile'
  | 'sideload'
  | 'steam'

// D-28: the domain of filterEngine's exclude-your-own-facet `skip` parameter.
export type FacetKind =
  | 'view'
  | 'collection'
  | 'store'
  | 'runnability'
  | 'search'
  | 'more'

// The Games tier-2 filter panel's full engine state (D-01, D-05, D-21).
export interface FilterEngineState {
  view: LibraryView
  // Quick 261029-riq: Installed is an independent toggle that ANDs with
  // everything else; `nativeOnly` is the All/Native pair (false = All).
  installedOnly: boolean
  nativeOnly: boolean
  // A `customCategories` key, the literal 'preset_uncategorized', or `null`
  // for no constraint. Collections are single-select (D-21).
  collection: string | null
  // Opt-in: `[]` means no constraint (D-01).
  stores: StoreFacetValue[]
  // Opt-in: `[]` means no constraint (D-01).
  runnability: RunnabilityTier[]
  // `null` means no search active; otherwise the precomputed set of
  // `gameKey()` values the Fuse.js search matched (D-33 amendment — search
  // stays fuzzy, so counts are computed over the matched set).
  searchMatchedKeys: Set<string> | null
  showHidden: FilterMode
  showNonAvailable: FilterMode
  // D-11: "No store page" tri-state (off / only / hide). Read ONLY inside
  // `passesMore` -- see filterEngine.ts's comment on why.
  noStorePage: NoStorePageMode
  showSupportOfflineOnly: boolean
  showThirdPartyManagedOnly: boolean
  showUpdatesOnly: boolean
}

// External data the filter engine needs but does not source itself — every
// field here is already resolved/parsed by the caller (see T-34.11-02).
export interface FilterEngineDeps {
  hiddenAppNames: string[]
  nonAvailableAppNames: string[]
  // Keyed by gameKey(), i.e. `${app_name}_${runner}` (matches
  // Library/index.tsx's favouritesIds shape).
  favouriteKeys: Set<string>
  recentAppNames: string[]
  customCategories: Record<string, string[]>
  gameUpdates: string[]
  crossoverRatings: Record<string, number | null>
  // Quick 261029-mkz: keyed by gameKey() (`${app_name}_${runner}`).
  runsForMe: Record<string, RunsForMeState>
  // the app stores's `platform`, i.e. 'darwin' | 'linux' | 'win32'.
  hostPlatform: string
}

// D-26: chips render for everything non-default, including views.
export interface ActiveFilterDescriptor {
  // Stable, unique within one render — e.g. 'store:gog',
  // 'runnability:bottle', 'view:installed', 'collection:Backlog', 'search'.
  id: string
  kind:
    | 'installedOnly'
    | 'nativeOnly'
    | 'collection'
    | 'store'
    | 'runnability'
    | 'search'
    | 'showHidden'
    | 'showNonAvailable'
    | 'noStorePage'
    | 'showSupportOfflineOnly'
    | 'showThirdPartyManagedOnly'
    | 'showUpdatesOnly'
  // The facet value, the collection name, the raw search term, or the
  // FilterMode value ('show'/'only') for a tri-state (D-27).
  value: string
}
