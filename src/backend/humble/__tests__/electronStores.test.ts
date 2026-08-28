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

jest.mock('backend/store_backend')

import {
  configStore,
  humbleLibraryStore,
  humbleSyncStore,
  humbleOwnershipOverrideStore,
  humbleGiftedAtStore,
  humbleAuditStore,
  humbleLocalRedeemedStore,
  humbleNotifiedExpirationStore
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

describe('humbleGiftedAtStore', () => {
  beforeEach(() => {
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
    humbleGiftedAtStore.clear()
  })

  test('is created under the store name humble_gifted_at, keyed by machine_name', () => {
    const machineName = 'sometitle_steam'
    humbleGiftedAtStore.set(machineName, { giftedAt: Date.now() })

    expect(humbleGiftedAtStore.has(machineName)).toBe(true)
  })

  test('D-59: a gifted-at record survives a disconnect-style wipe of configStore/humbleLibraryStore/humbleSyncStore', () => {
    const machineName = 'anothertitle_steam'
    const giftedAt = Date.now()
    humbleGiftedAtStore.set(machineName, { giftedAt })

    // Simulates exactly what HumbleUser.disconnect() clears (D-07/D-04/D-30)
    // — deliberately NOT humbleGiftedAtStore, per D-59.
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    expect(humbleGiftedAtStore.has(machineName)).toBe(true)
    expect(humbleGiftedAtStore.get(machineName)).toEqual({ giftedAt })
  })
})

/**
 * Phase 14 guided claim flow (Task 2, D-74/D-76): two new composite-keyed
 * (`gamekey:machineName`) disconnect-surviving stores. The composite key is
 * constructed by the caller (library.ts, later plan) — these stores just
 * treat the key as an opaque string.
 */
describe('humbleAuditStore', () => {
  beforeEach(() => {
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
    humbleAuditStore.clear()
  })

  test('composite-key round-trip: gamekey:machineName round-trips an append-only audit record array', () => {
    const compositeKey = 'order-1:sometitle_steam'
    const records = [
      {
        event: 'revealed',
        at: Date.now(),
        title: 'Some Title',
        platform: 'steam'
      }
    ]
    humbleAuditStore.set(compositeKey, records)

    expect(humbleAuditStore.has(compositeKey)).toBe(true)
    expect(humbleAuditStore.get(compositeKey)).toEqual(records)
  })

  test('WR-01 collision safety: two distinct gamekeys sharing the same machineName do not collide', () => {
    const machineName = 'sharedname_steam'
    const keyA = `order-a:${machineName}`
    const keyB = `order-b:${machineName}`
    const recordsA = [
      { event: 'revealed', at: 1000, title: 'Game A', platform: 'steam' }
    ]
    const recordsB = [
      { event: 'redeemed', at: 2000, title: 'Game B', platform: 'steam' }
    ]

    humbleAuditStore.set(keyA, recordsA)
    humbleAuditStore.set(keyB, recordsB)

    expect(humbleAuditStore.get(keyA)).toEqual(recordsA)
    expect(humbleAuditStore.get(keyB)).toEqual(recordsB)
  })

  test('D-76: an audit record survives a disconnect-style wipe of configStore/humbleLibraryStore/humbleSyncStore', () => {
    const compositeKey = 'order-2:anothertitle_steam'
    const records = [
      { event: 'revealed', at: Date.now(), title: 'Another', platform: 'steam' }
    ]
    humbleAuditStore.set(compositeKey, records)

    // Simulates exactly what HumbleUser.disconnect() clears (D-07/D-04/D-30)
    // — deliberately NOT humbleAuditStore, per D-76.
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    expect(humbleAuditStore.has(compositeKey)).toBe(true)
    expect(humbleAuditStore.get(compositeKey)).toEqual(records)
  })
})

describe('humbleLocalRedeemedStore', () => {
  beforeEach(() => {
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
    humbleLocalRedeemedStore.clear()
  })

  test('composite-key round-trip: gamekey:machineName round-trips a redeemedAt record', () => {
    const compositeKey = 'order-1:sometitle_steam'
    const redeemedAt = Date.now()
    humbleLocalRedeemedStore.set(compositeKey, { redeemedAt })

    expect(humbleLocalRedeemedStore.has(compositeKey)).toBe(true)
    expect(humbleLocalRedeemedStore.get(compositeKey)).toEqual({ redeemedAt })
  })

  test('WR-01 collision safety: two distinct gamekeys sharing the same machineName do not collide', () => {
    const machineName = 'sharedname_steam'
    const keyA = `order-a:${machineName}`
    const keyB = `order-b:${machineName}`

    humbleLocalRedeemedStore.set(keyA, { redeemedAt: 1000 })
    humbleLocalRedeemedStore.set(keyB, { redeemedAt: 2000 })

    expect(humbleLocalRedeemedStore.get(keyA)).toEqual({ redeemedAt: 1000 })
    expect(humbleLocalRedeemedStore.get(keyB)).toEqual({ redeemedAt: 2000 })
  })

  test('a local-redeem record survives a disconnect-style wipe of configStore/humbleLibraryStore/humbleSyncStore', () => {
    const compositeKey = 'order-2:anothertitle_steam'
    const redeemedAt = Date.now()
    humbleLocalRedeemedStore.set(compositeKey, { redeemedAt })

    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    expect(humbleLocalRedeemedStore.has(compositeKey)).toBe(true)
    expect(humbleLocalRedeemedStore.get(compositeKey)).toEqual({ redeemedAt })
  })
})

/**
 * Phase 15 (HSTORE-03, D-92): `humbleNotifiedExpirationStore` records the
 * last-notified expiration date per key, keyed by `machineName`, and must
 * survive a disconnect/reconnect cycle exactly like the other disconnect-
 * exempt stores above — a reconnect must not re-notify already-known
 * expirations.
 */
describe('humbleNotifiedExpirationStore', () => {
  beforeEach(() => {
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()
    humbleNotifiedExpirationStore.clear()
  })

  test('is created under the store name humble_notified_expiration, keyed by machineName, value shape { expiration: string }', () => {
    const machineName = 'sometitle_steam'
    const expiration = '2026-08-01'
    humbleNotifiedExpirationStore.set(machineName, { expiration })

    expect(humbleNotifiedExpirationStore.has(machineName)).toBe(true)
    expect(humbleNotifiedExpirationStore.get(machineName)).toEqual({
      expiration
    })
  })

  test('D-92: a notified-expiration record survives a disconnect-style wipe of configStore/humbleLibraryStore/humbleSyncStore', () => {
    const machineName = 'anothertitle_steam'
    const expiration = '2026-09-15'
    humbleNotifiedExpirationStore.set(machineName, { expiration })

    // Simulates exactly what HumbleUser.disconnect() clears (D-07/D-04/D-30)
    // — deliberately NOT humbleNotifiedExpirationStore, per D-92.
    configStore.clear()
    humbleLibraryStore.clear()
    humbleSyncStore.clear()

    expect(humbleNotifiedExpirationStore.has(machineName)).toBe(true)
    expect(humbleNotifiedExpirationStore.get(machineName)).toEqual({
      expiration
    })
  })
})

/**
 * D-74: no new secret-surface class for the revealed key value — it rides
 * the EXISTING humbleLibraryStore cache entry as an internal-only field
 * (HumbleKeyInternal). This proves the typing works end-to-end: a stored
 * entry whose keys carry revealedKeyValue/keyindex round-trips intact.
 */
describe('humbleLibraryStore — D-74 internal cache-record typing', () => {
  beforeEach(() => {
    humbleLibraryStore.clear()
  })

  test('an entry whose keys carry revealedKeyValue/keyindex round-trips intact', () => {
    const gamekey = 'order-3'
    const entry = {
      gamekey,
      allTerminal: false,
      keys: [
        {
          gamekey,
          machineName: 'internaltest_steam',
          state: 'REVEALED' as const,
          title: 'Internal Test',
          platform: 'steam',
          expiration: null,
          origin: 'Some Bundle',
          ownedElsewhere: false,
          matchConfidence: 'none' as const,
          keyindex: 3,
          revealedKeyValue: 'ABCD1-EFGH2-IJKL3'
        }
      ]
    }

    humbleLibraryStore.set(gamekey, entry)

    const stored = humbleLibraryStore.get(gamekey)
    expect(stored).toEqual(entry)
    expect(stored?.keys[0].keyindex).toBe(3)
    expect(stored?.keys[0].revealedKeyValue).toBe('ABCD1-EFGH2-IJKL3')
  })
})
