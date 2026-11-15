/**
 * Phase 79 (D-03): a `SteamCmClient` backed by one Rust CM lease. Every method is one
 * `invokeSteamCm` carrying the lease id. A failed op becomes an `Error` shaped like steam-user's
 * (`.eresult` when the CM sent one), so existing catch blocks keep working.
 *
 * Exit contract: no timers, no handles, no work at import.
 * Errors carry the channel, the kind and the eresult only, never args or results.
 */
import { logError, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type SteamUserLib from 'steam-user'
import {
  RUST_STEAMCM_CONTENT_SERVERS,
  RUST_STEAMCM_DEPOT_KEY,
  RUST_STEAMCM_MANIFEST_REQUEST_CODE,
  RUST_STEAMCM_OWNED_APPS,
  RUST_STEAMCM_PERSONAS,
  RUST_STEAMCM_PRODUCT_INFO,
  RUST_STEAMCM_REDEEM_KEY
} from 'common/types/sidecarTransport'
import type { SteamCmClient, SteamIdLike } from './SteamCmClient'
import { invokeSteamCm } from './rustSteamCm'
import type {
  RustSteamCmClientChannel,
  SteamCmLicense,
  SteamCmOpFailure,
  SteamCmOpResult
} from './steamCmTypes'

export interface RustCmLease {
  leaseId: number
  /** The account's 64-bit SteamID as a decimal string. */
  steamId: string
  licenses: SteamCmLicense[]
}

type SteamCmError = Error & {
  eresult?: number
  steamcmKind: SteamCmOpFailure['kind']
  purchaseResultDetails?: number
  packageList?: Record<string, string>
}

function toSteamCmError(
  channel: RustSteamCmClientChannel,
  failure: SteamCmOpFailure
): SteamCmError {
  const err = new Error(
    `steamcm ${channel} failed: ${failure.kind}`
  ) as SteamCmError
  err.steamcmKind = failure.kind
  if (typeof failure.eresult === 'number') err.eresult = failure.eresult
  return err
}

/** Unwraps `{ok:true,result}`; a failure rejects with {@link toSteamCmError}. */
export function unwrapSteamCm<T>(
  channel: RustSteamCmClientChannel,
  r: SteamCmOpResult<T>
): T {
  if (!r.ok) throw toSteamCmError(channel, r)
  return r.result
}

function steamIdString(id: SteamIdLike): string {
  return typeof id === 'string' ? id : id.getSteamID64()
}

function toCallback<T>(
  p: Promise<T>,
  cb: (err: Error | null, value: T) => void
): void {
  p.then(
    (v) => cb(null, v),
    (e: unknown) =>
      cb(e instanceof Error ? e : new Error(String(e)), undefined as T)
  ).catch((e: unknown) => {
    logError(
      ['steamcm callback threw:', e instanceof Error ? e.name : typeof e],
      LogPrefix.Steam
    )
  })
}

// A property on the client, not module state (the module-state census is zero outside its list).
const LEASE_ID = Symbol.for('gamelib.steamcm.leaseId')

/** The Rust lease id a client from {@link createRustCmClient} is bound to; undefined for any other client. */
export function leaseIdOf(client: object): number | undefined {
  const id = (client as Record<symbol, unknown>)[LEASE_ID]
  return typeof id === 'number' ? id : undefined
}

export function createRustCmClient(
  deps: RustInvokeDeps,
  lease: RustCmLease
): SteamCmClient {
  const { leaseId, steamId } = lease
  const client: SteamCmClient = {
    steamID: { getSteamID64: () => steamId, toString: () => steamId },
    licenses: lease.licenses,

    async getProductInfo(apps, packages, inclTokens = false) {
      const r = await invokeSteamCm(deps, RUST_STEAMCM_PRODUCT_INFO, {
        leaseId,
        apps,
        packages,
        inclTokens
      })
      return unwrapSteamCm(
        RUST_STEAMCM_PRODUCT_INFO,
        r
      ) as unknown as SteamUserLib.ProductInfo
    },

    getDepotDecryptionKey(appId, depotId, callback) {
      toCallback(
        invokeSteamCm(deps, RUST_STEAMCM_DEPOT_KEY, {
          leaseId,
          appId,
          depotId
        }).then((r) =>
          Buffer.from(unwrapSteamCm(RUST_STEAMCM_DEPOT_KEY, r).keyHex, 'hex')
        ),
        callback
      )
    },

    getContentServers(appId, callback) {
      toCallback(
        invokeSteamCm(deps, RUST_STEAMCM_CONTENT_SERVERS, {
          leaseId,
          appId
        }).then((r) => unwrapSteamCm(RUST_STEAMCM_CONTENT_SERVERS, r)),
        callback
      )
    },

    async getManifestRequestCode(appId, depotId, manifestId, branch) {
      const r = await invokeSteamCm(deps, RUST_STEAMCM_MANIFEST_REQUEST_CODE, {
        leaseId,
        appId,
        depotId,
        manifestId,
        branch
      })
      return unwrapSteamCm(RUST_STEAMCM_MANIFEST_REQUEST_CODE, r)
    },

    async getUserOwnedApps(id, opts) {
      const r = await invokeSteamCm(deps, RUST_STEAMCM_OWNED_APPS, {
        leaseId,
        steamId: steamIdString(id),
        includeAppinfo: true,
        includePlayedFreeGames: opts?.includePlayedFreeGames ?? false,
        includeFreeSub: opts?.includeFreeSub ?? false,
        skipUnvettedApps: true
      })
      return unwrapSteamCm(
        RUST_STEAMCM_OWNED_APPS,
        r
      ) as unknown as SteamUserLib.UserOwnedApps
    },

    async getPersonas(ids) {
      const r = await invokeSteamCm(deps, RUST_STEAMCM_PERSONAS, {
        leaseId,
        steamIds: ids.map(steamIdString)
      })
      return unwrapSteamCm(RUST_STEAMCM_PERSONAS, r)
    },

    async redeemKey(key) {
      const r = await invokeSteamCm(deps, RUST_STEAMCM_REDEEM_KEY, {
        leaseId,
        key
      })
      const res = unwrapSteamCm(RUST_STEAMCM_REDEEM_KEY, r)
      if (res.eresult !== 1) {
        // steam-user rejects a non-OK reply with the purchase verdict on the error.
        const err = toSteamCmError(RUST_STEAMCM_REDEEM_KEY, {
          ok: false,
          kind: 'eresult',
          eresult: res.eresult
        })
        err.purchaseResultDetails = res.purchaseResultDetails
        err.packageList = res.packageList
        throw err
      }
      return {
        purchaseResultDetails: res.purchaseResultDetails,
        packageList: res.packageList
      }
    }
  }
  Object.defineProperty(client, LEASE_ID, { value: leaseId })
  return client
}
