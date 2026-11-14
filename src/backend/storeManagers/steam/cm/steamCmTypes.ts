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
  RUST_STEAMCM_MANIFEST_REQUEST_CODE,
  RUST_STEAMCM_OWNED_APPS,
  RUST_STEAMCM_PERSONAS,
  RUST_STEAMCM_PRODUCT_INFO,
  RUST_STEAMCM_REDEEM_KEY
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RawContentServer } from '../depot/planModel'

/** The channels a lease-bound or anonymous CM client calls (session/sign-in ops are not here). */
export type RustSteamCmClientChannel =
  | typeof RUST_STEAMCM_ANON_PRODUCT_INFO
  | typeof RUST_STEAMCM_CONTENT_SERVERS
  | typeof RUST_STEAMCM_DEPOT_KEY
  | typeof RUST_STEAMCM_LICENSES
  | typeof RUST_STEAMCM_MANIFEST_REQUEST_CODE
  | typeof RUST_STEAMCM_OWNED_APPS
  | typeof RUST_STEAMCM_PERSONAS
  | typeof RUST_STEAMCM_PRODUCT_INFO
  | typeof RUST_STEAMCM_REDEEM_KEY

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

export type SteamCmOpFailure = {
  ok: false
  kind: SteamCmFailureKind
  eresult?: number
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

export interface SteamCmPersonasResult {
  personas: Record<string, { player_name?: string } & Record<string, unknown>>
}

export type SteamCmArgsFor<C extends RustSteamCmClientChannel> =
  RustInvokeArgsOf<C> extends readonly [infer A] ? A : never

interface SteamCmResultMap {
  steamcm_anon_product_info: SteamCmProductInfoResult
  steamcm_content_servers: RawContentServer[]
  steamcm_depot_key: SteamCmDepotKeyResult
  steamcm_licenses: SteamCmLicense[]
  steamcm_manifest_request_code: { requestCode: string }
  steamcm_owned_apps: SteamCmOwnedAppsResult
  steamcm_personas: SteamCmPersonasResult
  steamcm_product_info: SteamCmProductInfoResult
  steamcm_redeem_key: SteamCmRedeemResult
}

export type SteamCmResultFor<C extends RustSteamCmClientChannel> =
  SteamCmOpResult<SteamCmResultMap[C]>
