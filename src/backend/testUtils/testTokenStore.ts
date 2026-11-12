import {
  createTokenStoreSlot,
  type TokenStore,
  type TokenStoreSlot
} from '../storeManagers/steam/tokenStore'

/**
 * A token store slot for tests (66.4-07). Starts unconfigured, like the boot's; pass `store` to
 * start configured with it. The info log is dropped.
 */
export function createTestTokenStoreSlot(store?: TokenStore): TokenStoreSlot {
  const slot = createTokenStoreSlot({ log: () => undefined })
  if (store) slot.configure(store)
  return slot
}
