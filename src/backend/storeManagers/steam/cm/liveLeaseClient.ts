import type { SteamCmClient } from './SteamCmClient'

/**
 * A client that is not bound to one lease: every call goes through whichever lease is held at the
 * moment of the call. `SteamUser.getClient()` hands this out (review 79 C1/CR-01), so a caller that
 * holds its own lease (an install) keeps working when a different lease it happened to be handed
 * (a concurrent Refresh's) is released. Without a held lease a call fails as `leaseUnknown`, the
 * same failure the Rust session gives a released lease.
 */
export function createLiveLeaseClient(
  current: () => SteamCmClient | null
): SteamCmClient {
  const noLease = (): Error =>
    Object.assign(new Error('steamcm: no Steam CM lease is held'), {
      steamcmKind: 'leaseUnknown' as const
    })
  const pick = (): SteamCmClient => {
    const c = current()
    if (!c) throw noLease()
    return c
  }
  return {
    get steamID() {
      return current()?.steamID ?? null
    },
    get licenses() {
      return current()?.licenses ?? []
    },
    getProductInfo: async (...a) => pick().getProductInfo(...a),
    getDepotDecryptionKey(appId, depotId, callback) {
      const c = current()
      if (!c) return callback(noLease(), Buffer.alloc(0))
      c.getDepotDecryptionKey(appId, depotId, callback)
    },
    getContentServers(appId, callback) {
      const c = current()
      if (!c) return callback(noLease(), [])
      c.getContentServers(appId, callback)
    },
    getManifestRequestCode: async (...a) => pick().getManifestRequestCode(...a),
    getUserOwnedApps: async (...a) => pick().getUserOwnedApps(...a),
    getPersonas: async (...a) => pick().getPersonas(...a),
    redeemKey: async (...a) => pick().redeemKey(...a)
  }
}
