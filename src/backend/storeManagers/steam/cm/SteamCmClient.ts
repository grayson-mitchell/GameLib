/**
 * Phase 79 (D-03, D-18): the exact subset of steam-user's client that production calls, in
 * steam-user's own call shapes. The Rust-backed client satisfies it.
 *
 * Types only; no work at import.
 */
import type { RawContentServer } from '../depot/planModel'
import type {
  SteamCmLicense,
  SteamCmProductInfo,
  SteamCmUserOwnedApps
} from './steamCmTypes'

/** What `getProductInfo` resolves with (the former steam-user shape). */
type ProductInfoResult = SteamCmProductInfo

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
  ): Promise<SteamCmUserOwnedApps>
  getPersonas(
    steamids: SteamIdLike[]
  ): Promise<{ personas: Record<string, { player_name?: string }> }>
  redeemKey(key: string): Promise<{
    purchaseResultDetails: number
    packageList: Record<string, string>
  }>
}
