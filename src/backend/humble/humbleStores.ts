import type { Stores } from 'backend/services/types'

/** The store families the Humble integration reads (66.1, R1). */
export interface HumbleStoresDeps {
  stores: Pick<Stores, 'humble' | 'steam'>
}

/**
 * Static holder for the bound stores slice, the same shape as `SteamUser.bindStores` (66.1-16)
 * and `bindBottleStores` (66.1-17). The Humble helpers are sync and spread over four modules plus
 * a `HumbleLibrary` object, so they read the slice bound once at boot instead of threading it
 * through every call. Reading before binding throws: never read a store at import time.
 */
class HumbleStoresHolder {
  static bound: HumbleStoresDeps | null = null
}

/** Binds the slice at boot ('secret-stores' step), before any Humble code can read a store. */
export function bindHumbleStores(deps: HumbleStoresDeps): void {
  HumbleStoresHolder.bound = deps
}

function bound(): HumbleStoresDeps {
  if (!HumbleStoresHolder.bound) {
    throw new Error('Humble stores read before bindHumbleStores()')
  }
  return HumbleStoresHolder.bound
}

/** The humble store family. */
export const humbleStores = (): Stores['humble'] => bound().stores.humble

/** The steam store family (library.ts reads the steam library for the connectivity gate). */
export const steamStores = (): Stores['steam'] => bound().stores.steam
