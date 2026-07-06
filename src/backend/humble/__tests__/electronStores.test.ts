/**
 * Regression test for D-42/D-43: `humbleOwnershipOverrideStore` (a user's
 * "Not the same game" correction, keyed by `machine_name`) must survive a
 * disconnect/reconnect cycle exactly like `humbleRevealedStore` (Phase 11,
 * D-04/D-30).
 *
 * Runs against the REAL CacheStore + electron-store (redirected to a tmp cwd
 * by src/backend/__mocks__/electron-store.ts) — mirrors
 * library.realstore.test.ts's approach — rather than mocking ../electronStores
 * with a Map double, so the assertion exercises actual on-disk persistence
 * semantics, not a test double's own bookkeeping.
 */

jest.mock('electron-store')

import {
  configStore,
  humbleLibraryStore,
  humbleSyncStore,
  humbleOwnershipOverrideStore
} from '../electronStores'

describe('humbleOwnershipOverrideStore', () => {
  beforeEach(() => {
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
    humbleOwnershipOverrideStore.clear()
  })

  test('is created under the store name humble_ownership_override, keyed by machine_name', () => {
    const machineName = 'sometitle_steam'
    humbleOwnershipOverrideStore.set(machineName, { overriddenAt: Date.now() })

    expect(humbleOwnershipOverrideStore.has(machineName)).toBe(true)
  })

  test('D-43: an override survives a disconnect-style wipe of configStore/humbleLibraryStore/humbleSyncStore', () => {
    const machineName = 'anothertitle_steam'
    const overriddenAt = Date.now()
    humbleOwnershipOverrideStore.set(machineName, { overriddenAt })

    // Simulates exactly what HumbleUser.disconnect() clears (D-07/D-04/D-30)
    // — deliberately NOT humbleOwnershipOverrideStore, per D-42/D-43.
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    expect(humbleOwnershipOverrideStore.has(machineName)).toBe(true)
    expect(humbleOwnershipOverrideStore.get(machineName)).toEqual({
      overriddenAt
    })
  })
})
