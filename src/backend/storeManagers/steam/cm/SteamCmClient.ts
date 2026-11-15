/**
 * Phase 79 (D-03, D-18): the exact subset of steam-user's client that production calls, in
 * steam-user's own call shapes. Both the steam-user client (cm=ts) and the Rust-backed client
 * (cm=rust) satisfy it, so callers change only their type.
 *
 * Types only; no work at import.
 */
import type SteamUserLib from 'steam-user'
import type { RawContentServer, SteamUserDepotClient } from '../depot/planModel'
import type { SteamCmLicense } from './steamCmTypes'

/** What `getProductInfo` resolves with (steam-user's own shape). */
type ProductInfoResult = SteamUserLib.ProductInfo

/** A SteamID object or its 64-bit decimal string, as steam-user accepts. */
export type SteamIdLike = { getSteamID64(): string } | string

export interface SteamCmClient {
  steamID: { getSteamID64(): string; toString(): string } | null
  licenses: SteamCmLicense[]
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<ProductInfoResult>
  getDepotDecryptionKey(
    appId: number,
    depotId: number,
    callback: (err: Error | null, key: Buffer) => void
  ): void
  getContentServers(
    appId: number,
    callback: (err: Error | null, servers: RawContentServer[]) => void
  ): void
  getManifestRequestCode(
    appId: number,
    depotId: number,
    manifestId: string,
    branch: string
  ): Promise<{ requestCode: unknown }>
  getUserOwnedApps(
    steamID: SteamIdLike,
    options?: {
      includePlayedFreeGames?: boolean
      includeFreeSub?: boolean
      filterAppids?: number[]
    }
  ): Promise<SteamUserLib.UserOwnedApps>
  getPersonas(
    steamids: SteamIdLike[]
  ): Promise<{ personas: Record<string, { player_name?: string }> }>
  redeemKey(key: string): Promise<{
    purchaseResultDetails: number
    packageList: Record<string, string>
  }>
}

// Compile-time only (no module-scope statement: the sidecar's floating-promise guard walks this graph).
type AssertTrue<T extends true> = T
/** @public compile-time assertion only: a type alias nothing imports, so it must stay exported to count as used. */
export type SteamUserFitsSteamCmClient = AssertTrue<
  SteamUserDepotClient extends SteamCmClient ? true : false
>
