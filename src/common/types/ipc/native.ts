/**
 * Typing-only declarations for the channels the Rust native router owns (Phase 83, D-01), the
 * ones listed in `nativeChannels.json`. There is no zod here: the Rust serde args type is the
 * schema authority for a native channel (D-07), and the manifest's valid/invalid vectors pin it.
 *
 * The keys below must equal the manifest's channels by kind (`ipcDomainCensus` test (e)): invoke
 * channels in `NativeAsync`, send channels in `NativeSync`.
 */
import type {
  AntiCheatInfo,
  Runner,
  RuntimeName,
  UploadedLogData,
  WikiInfo,
  WineInstallation,
  WineVersionInfo
} from '../../types'
import type { StoreSearchDeal, StoreSearchResponse } from '../storeSearch'
import type { GetLogFileArgs } from './logger'
import type { MetadataOverride } from './gameDetails'

/**
 * The renderer's log text: a string, an array of strings, or an Error-like object. A real `Error`
 * JSON-serialises to `{}` (its fields are non-enumerable), which the object arm accepts. The Rust
 * `RendererMessage` (gamelib-log) is the authority; it is strict: any other key or a non-string
 * value is rejected.
 */
type LogMessage =
  | string
  | string[]
  | { name?: string; message?: string; stack?: string }

/** The renderer's SteamGridDB grids and heroes request; the Rust `GridArgs` decode is the schema. */
interface SteamGridQuery {
  gameId: number
  styles?: string[]
  dimensions?: string[]
}

export interface NativeAsync {
  getHeroicVersion: () => string
  getLogContent: (args: GetLogFileArgs) => string
  uploadLogFile: (
    name: string,
    args: GetLogFileArgs
  ) => Promise<false | [string, UploadedLogData]>
  getUploadedLogFiles: () => Promise<Record<string, UploadedLogData>>
  deleteUploadedLogFile: (url: string) => Promise<boolean>
  // Phase 85 (85-16): the renderer's lazy store fetch, answered from the Rust StoreHost. `rev` is
  // the store's change count when Rust read it, absent when the sidecar answered.
  'sidecar:store-fetch': (
    storeName: string
  ) => Promise<{ values: Record<string, unknown>; rev?: number }>
  // Phase 85 (85-17): the renderer's confirmed store write, applied by Rust; `true` only once on
  // disk, `false` for any refusal.
  'sidecar:store-set-checked': (
    storeName: string,
    keyPath: string,
    value: unknown
  ) => Promise<boolean>
  // Phase 86 (86-08, D-17): the renderer's Remove-from-recent, run by the Rust `info` slice
  // (`gamelib-info`'s `info_recent_remove`). The appName is 1 to 1024 UTF-16 units.
  removeRecent: (appName: string) => Promise<void>
  // Phase 86 (86-10, D-17): every stored per-game metadata override, read by the Rust `info` slice
  // from the StoreHost (`gamelib-info`'s `info_overrides_get_all`).
  getAllGameOverrides: () => Promise<Record<string, MetadataOverride>>
  // Phase 86 (86-10, D-17): one game's stored override or `null`, read by the Rust `info` slice
  // (`info_overrides_get`). The appName is 1 to 256 UTF-16 units.
  getGameMetadataOverride: (appName: string) => Promise<MetadataOverride | null>
  // Phase 86 (86-12, D-17): the game page's anti-cheat badge, looked up by the Rust `info` slice in
  // `<appFolder>/areweanticheatyet.json` (`info_anticheat_info`). `null` for no match (where the TS
  // returned `undefined`, D-03), on Windows, and when the data file is missing or unreadable. The
  // namespace is 0 to 1024 UTF-16 units.
  getAnticheatInfo: (appNamespace: string) => Promise<AntiCheatInfo | null>
  // Phase 86 (86-15, D-17): the SteamGridDB title search, run by the Rust `info` slice
  // (`info_steamgrid_search`) with the key from the Keychain owner. `[]` when no key is stored. The
  // query is 0 to 256 UTF-16 units; a non-2xx answer rejects with `Request failed with status code
  // <n>`, as the TS rethrow did.
  'steamgriddb.searchGame': (
    query: string
  ) => Promise<Array<{ id: number; name: string }>>
  // Phase 86 (86-15, D-17): the other four SteamGridDB channels, run by the same `info` slice.
  // `hasApiKey` is whether the `steamgrid-api-key` Keychain slot holds a key; `setApiKey` stores the
  // trimmed key (0 to 256 UTF-16 units) or clears it for an empty one. `getGrids` and `getHeroes`
  // take a strict `{ gameId, styles?, dimensions? }` (a positive integer id; each list at most 64
  // strings of at most 64 UTF-16 units) and answer `[]` when no key is stored.
  'steamgriddb.hasApiKey': () => Promise<boolean>
  'steamgriddb.setApiKey': (key: string) => Promise<void>
  'steamgriddb.getGrids': (
    query: SteamGridQuery
  ) => Promise<Array<{ id: number; url: string; thumb: string }>>
  'steamgriddb.getHeroes': (
    query: SteamGridQuery
  ) => Promise<Array<{ id: number; url: string; thumb: string }>>
  // Phase 86 (86-22, D-17, D-23): the game page's wiki block, computed by the Rust `info` slice
  // (`info_wiki_get`): the 30 day `wikigameinfo` cache, the stale rules and the sources (PCGamingWiki,
  // GamesDB, AppleGamingWiki, umu, the CrossOver index, HowLongToBeat, ProtonDB, the Steam Deck report).
  // The title is the renderer's own (0 to 1024 UTF-16 units; the TS read it off the resolved game), the
  // app name 1 to 256 units, the runner one of the five names, `forceRefresh` absent, null or a boolean.
  // `null` when the lookup failed (a failure is logged, never thrown).
  getWikiGameInfo: (
    title: string,
    appName: string,
    runner: Runner,
    forceRefresh?: boolean | null
  ) => Promise<WikiInfo | null>
  // Phase 86 (86-16, D-17): the IsThereAnyDeal store search, run by the Rust `info` slice
  // (`info_itad_search`) over the `itad_prices` cache. The term is 0 to 256 UTF-16 units and the
  // country absent, null or 0 to 16 units (anything but two upper-case letters prices as US). A
  // failure rejects with the fixed `[storeSearch:<code>] <endpoint> <status>` string the renderer
  // turns into its provider-failed state; a 429 or a network error serves a stale row with
  // `cachedAt` when one is cached.
  searchStores: (
    query: string,
    country?: string | null
  ) => Promise<StoreSearchResponse>
  // Phase 86 (86-16, D-17): the deal list for one ITAD game id (`info_itad_deals`) and the keyless
  // Steam app id to ITAD game id lookup (`info_itad_gids`), served by the same slice. The game id is
  // 1 to 64 characters of `[0-9a-fA-F-]`; `getItadSteamGids` takes at most 5000 ids of 1 to 10 digits
  // and never rejects for a network failure (it answers what the cache holds).
  getStoreSearchDeals: (
    gameId: string,
    country?: string | null
  ) => Promise<StoreSearchDeal[]>
  getItadSteamGids: (appIds: string[]) => Promise<Record<string, string>>
  // Phase 86 (86-16, D-17): the optional ITAD user key, over the Rust Keychain owner (the `itad-api-key`
  // slot). `itad.getKeyStatus` is two booleans and never the key: `hasKey` is the user slot only (not
  // the built-in key) and `rejected` is the session memory of ITAD refusing it. `itad.setApiKey` takes
  // 0 to 256 UTF-16 units, trims, clears the slot for an empty value and forgets any rejection; a
  // Keychain that cannot be written rejects with a fixed category, never the key.
  'itad.getKeyStatus': () => Promise<{ hasKey: boolean; rejected: boolean }>
  'itad.setApiKey': (key: string) => Promise<void>
  // Phase 87 (87-17, D-14): whether a Wine runtime (EAC, BattlEye or umu) is installed and current,
  // answered by the Rust `wine` slice (`gamelib-wine`'s `wine_runtime_is_installed`) from the lutris
  // list and `<tools>/runtimes/<name>/current_version`. The name is exactly one of the three; any
  // other value rejects with the invalid-args marker.
  isRuntimeInstalled: (name: RuntimeName) => Promise<boolean>
  // Phase 87 (87-18, D-14): download and extract one Wine runtime (EAC, BattlEye or umu), answered by the
  // Rust `wine` slice (`wine_runtime_download`): `true` when it is installed after the call, `false` on a
  // failed download or extraction (the TypeScript reported a failed `tar` as installed; Rust does not).
  // The same one-of-three decode as `isRuntimeInstalled`. It runs with no wall-clock bound, so it is not
  // among the sidecar's long-running invoke channels any more.
  downloadRuntime: (name: RuntimeName) => Promise<boolean>
  // Phase 87 (87-20, D-14): refresh the wine-downloader info store from the seven release feeds,
  // answered by the Rust `wine` slice (`wine_manager_refresh`). `fetch` is the one optional boolean; it
  // answers `undefined` on success and on every failure (the TypeScript swallowed an error the same
  // way), so only a rejected argument ever rejects.
  refreshWineVersionInfo: (fetch?: boolean) => Promise<void>
  // Phase 87 (87-20, D-14): install and remove one wine-manager version, answered by the Rust `wine`
  // slice (`gamelib-wine`'s install and `wine_manager_remove`). Both take one `WineVersionInfo` as the
  // renderer holds it; the Rust decode is strict (an unknown key rejects with the invalid-args marker).
  // An install is cancelled by `abort(version)`. Remove acts on the version only: the directory removed
  // is the one the store holds, never the `installDir` the renderer sent (T-34.5-16). Both answer
  // `undefined`; progress, notifications and `wineVersionsUpdated` are pushed as before.
  installWineVersion: (release: WineVersionInfo) => Promise<void>
  removeWineVersion: (release: WineVersionInfo) => Promise<void>
  // Phase 87 (87-24, D-14): whether the wine the renderer holds can run, answered by the Rust `wine`
  // slice (`gamelib-wine`'s `wine_valid`): the binaries its type needs exist (a `wine` also needs its
  // `wineserver`), and a macOS toolkit needs Darwin 14 or later. Existence checks only, nothing is
  // spawned. The decode is strict (an unknown key rejects with the invalid-args marker); `lib`, `lib32`
  // and `wineserver` may be absent or null.
  'wine.isValidVersion': (wine: WineInstallation) => Promise<boolean>
  // Phase 87 (87-26, D-14): the wines installed on this machine, discovered by the Rust `wine` slice
  // (`gamelib-wine`'s `wine_discover_alternatives`): CrossOver, Wineskin, the Game Porting Toolkit and Whisky
  // on a Mac; the tools and Lutris wines, Proton and the custom paths on Linux. It takes no argument (the
  // roots, the `PATH` and the settings are the shell's own), and with no release list stored it refreshes
  // it first and pushes `wineVersionsUpdated`, so it has no wall-clock bound of its own.
  getAlternativeWine: () => Promise<WineInstallation[]>
}

export interface NativeSync {
  logError: (message: LogMessage) => void
  logInfo: (message: LogMessage) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
  openExternalUrl: (url: string) => void
  // Phase 85 (85-17): the renderer's store write, checked and applied by Rust through the StoreHost.
  storeSet: (storeName: string, keyPath: string, value: unknown) => void
  storeDelete: (storeName: string, keyPath: string) => void
  // The options are never used (T-27-03): a recognised cache store opens from the store table's row.
  storeNew: (storeName: string, options?: Record<string, unknown>) => void
}
