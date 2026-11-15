/**
 * Types only; no work at import.
 *
 * Mirrors the `gamelib-steamcm` op arg structs and result shapes (serde camelCase, 64-bit values as
 * decimal strings) for the signed-in and anonymous channels the TS adapters call.
 */
import type {
  RUST_STEAMCM_ANON_PRODUCT_INFO,
  RUST_STEAMCM_CONTENT_SERVERS,
  RUST_STEAMCM_DEPOT_KEY,
  RUST_STEAMCM_LICENSES,
  RUST_STEAMCM_MAC_OWNED_APPS,
  RUST_STEAMCM_MANIFEST_REQUEST_CODE,
  RUST_STEAMCM_OWNED_APPS,
  RUST_STEAMCM_PERSONAS,
  RUST_STEAMCM_PRODUCT_INFO,
  RUST_STEAMCM_REDEEM_KEY,
  RUST_STEAMCM_REFRESH,
  RUST_STEAMCM_STORE_APPDETAILS,
  RUST_STEAMCM_STORE_ENRICH
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { SteamGameInfo } from 'common/types/steam'
import type { SteamMetadataCacheEntry } from '../stores'
import type { RawContentServer } from '../depot/planModel'

/** The channels a lease-bound or anonymous CM client calls (session/sign-in ops are not here). */
export type RustSteamCmClientChannel =
  | typeof RUST_STEAMCM_ANON_PRODUCT_INFO
  | typeof RUST_STEAMCM_CONTENT_SERVERS
  | typeof RUST_STEAMCM_DEPOT_KEY
  | typeof RUST_STEAMCM_LICENSES
  | typeof RUST_STEAMCM_MAC_OWNED_APPS
  | typeof RUST_STEAMCM_MANIFEST_REQUEST_CODE
  | typeof RUST_STEAMCM_OWNED_APPS
  | typeof RUST_STEAMCM_PERSONAS
  | typeof RUST_STEAMCM_PRODUCT_INFO
  | typeof RUST_STEAMCM_REDEEM_KEY
  | typeof RUST_STEAMCM_REFRESH
  | typeof RUST_STEAMCM_STORE_APPDETAILS
  | typeof RUST_STEAMCM_STORE_ENRICH

export type SteamCmFailureKind =
  | 'leaseUnknown'
  | 'timeout'
  | 'eresult'
  | 'network'
  | 'replaced'
  | 'protocol'
  | 'ambiguous'
  | 'shuttingDown'
  | 'goOfflineRequired'
  | 'unsupported'
  | 'ownedFailed'
  | 'badAppId'
  | 'http'
  | 'tooLarge'
  | 'parse'
  | 'fallback'
  | 'macFallback'

export type MacOwnedFallbackReason =
  | 'not-macos'
  | 'helper-missing'
  | 'helper-failed'
  | 'timeout'
  | 'not-logged-on'
  | 'account-mismatch'
  | 'ambiguous-slot'
  | 'parse'
  | 'pics-failed'

export type SteamCmOpFailure = {
  ok: false
  kind: SteamCmFailureKind
  eresult?: number
  /**
   * Set when `kind` is `fallback` (`steamcm_mac_owned_apps`) or `macFallback` (`steamcm_refresh`
   * with the macSteam source): why to use the CM path.
   */
  reason?: MacOwnedFallbackReason
}

/** `{ok:true,result}` or `{ok:false,kind,eresult?}`, the envelope every signed-in op returns. */
export type SteamCmOpResult<T> = { ok: true; result: T } | SteamCmOpFailure

/** One `client.licenses` element; only the field production reads is typed. */
export interface SteamCmLicense {
  package_id?: number
}

export interface SteamCmProductInfoResult {
  apps?: Record<number, { appinfo?: unknown; missingToken?: boolean }>
  packages?: Record<number, unknown>
  unknownApps?: number[]
  unknownPackages?: number[]
}

export interface SteamCmDepotKeyResult {
  eresult: number
  keyHex: string
}

export interface SteamCmRedeemResult {
  eresult: number
  purchaseResultDetails: number
  packageList: Record<string, string>
}

export interface SteamCmOwnedAppsResult {
  app_count: number
  apps: Array<{
    appid: number
    name: string
    playtime_forever: number
    img_icon_url?: string
    rtime_last_played?: number
  }>
}

/** `steamcm_mac_owned_apps` result: games only, plus demos from Steam's own set. */
export interface MacOwnedAppsResult {
  owned: SteamCmOwnedAppsResult
  demos: Array<{ appid: number; name: string; playtime_forever: number }>
  subscribedCount: number
}

export interface SteamCmPersonasResult {
  personas: Record<string, { player_name?: string } & Record<string, unknown>>
}

export interface SteamCmCaptureSummary {
  scoped: number
  captured: number
  skipped: number
  failed: boolean
}

/** `steamcm_refresh` result: the finished library and every changed metadata entry. */
export interface RefreshResult {
  games: SteamGameInfo[]
  metadataUpdates: Record<string, SteamMetadataCacheEntry>
  ownedCount: number
  demoCount: number
  demosFailed: boolean
  capture: {
    platforms: SteamCmCaptureSummary
    metacritic: SteamCmCaptureSummary
    anonCount: number
    heldCount: number
  }
  enrich: {
    attempted: number
    enriched: number
    delisted: number
    failed: number
    rateLimited: boolean
    budgetHit: boolean
    notReached: string[]
  }
  source: 'cm' | 'macSteam'
}

/** `steamcm_store_enrich` result; `entry`/`game` are absent for `noData`. */
export interface StoreEnrichResult {
  kind: 'delisted' | 'enriched' | 'noData'
  entry?: SteamMetadataCacheEntry
  game?: SteamGameInfo
}

/** `steamcm_store_appdetails` result (`StoreDetails` in the crate). */
export interface StoreDetails {
  delisted: boolean
  data: Record<string, unknown> | null
  storageBytes: number | null
  macMinOs: string | null
  macArch: string | null
}

export type SteamCmArgsFor<C extends RustSteamCmClientChannel> =
  RustInvokeArgsOf<C> extends readonly [infer A] ? A : never

interface SteamCmResultMap {
  steamcm_anon_product_info: SteamCmProductInfoResult
  steamcm_content_servers: RawContentServer[]
  steamcm_depot_key: SteamCmDepotKeyResult
  steamcm_licenses: SteamCmLicense[]
  steamcm_mac_owned_apps: MacOwnedAppsResult
  steamcm_manifest_request_code: { requestCode: string }
  steamcm_owned_apps: SteamCmOwnedAppsResult
  steamcm_personas: SteamCmPersonasResult
  steamcm_product_info: SteamCmProductInfoResult
  steamcm_redeem_key: SteamCmRedeemResult
  steamcm_refresh: RefreshResult
  steamcm_store_appdetails: StoreDetails
  steamcm_store_enrich: StoreEnrichResult
}

export type SteamCmResultFor<C extends RustSteamCmClientChannel> =
  SteamCmOpResult<SteamCmResultMap[C]>
