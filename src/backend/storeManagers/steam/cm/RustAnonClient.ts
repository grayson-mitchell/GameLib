/**
 * Phase 79 (D-04): the anonymous PICS client over `steamcm_anon_product_info`. It carries no lease
 * and no credential: the Rust anon actor owns its connection.
 *
 * Exit contract: no timers, no handles, no work at import.
 */
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMCM_ANON_PRODUCT_INFO } from 'common/types/sidecarTransport'
import { invokeSteamCm } from './rustSteamCm'
import { unwrapSteamCm } from './RustCmClient'

/** Structurally the anonymousClient.ts `AnonymousPicsClient`. */
export interface RustAnonPicsClient {
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{
    apps?: Record<number, { appinfo?: unknown; missingToken?: boolean }>
    unknownApps?: number[]
  }>
}

export function createRustAnonClient(deps: RustInvokeDeps): RustAnonPicsClient {
  return {
    async getProductInfo(apps, packages, inclTokens = false) {
      const r = await invokeSteamCm(deps, RUST_STEAMCM_ANON_PRODUCT_INFO, {
        apps,
        packages,
        inclTokens
      })
      return unwrapSteamCm(RUST_STEAMCM_ANON_PRODUCT_INFO, r)
    }
  }
}
