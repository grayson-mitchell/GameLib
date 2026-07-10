import {
  MAX_CONCURRENT_METADATA_FETCHES,
  acquireMetadataSlot,
  releaseMetadataSlot
} from '../state'

/**
 * The metadata-fetch semaphore caps how many Steam store-API requests run at
 * once so a cold cache (hundreds of games) doesn't open hundreds of parallel
 * TLS connections and mass-time-out.
 */
describe('Steam metadata-fetch concurrency limiter', () => {
  // The limiter is module-level state; always release exactly what we acquire.
  it('grants up to MAX_CONCURRENT_METADATA_FETCHES slots immediately', async () => {
    const granted = await Promise.all(
      Array.from({ length: MAX_CONCURRENT_METADATA_FETCHES }, () =>
        acquireMetadataSlot().then(() => true)
      )
    )
    expect(granted).toHaveLength(MAX_CONCURRENT_METADATA_FETCHES)
    expect(granted.every(Boolean)).toBe(true)

    // cleanup
    for (let i = 0; i < MAX_CONCURRENT_METADATA_FETCHES; i++) {
      releaseMetadataSlot()
    }
  })

  it('queues an over-cap request until a slot is released, then hands it the slot', async () => {
    // Fill every slot.
    for (let i = 0; i < MAX_CONCURRENT_METADATA_FETCHES; i++) {
      await acquireMetadataSlot()
    }

    // One more must NOT resolve until a slot frees.
    let overCapResolved = false
    const overCap = acquireMetadataSlot().then(() => {
      overCapResolved = true
    })

    // Let microtasks flush — it should still be pending.
    await Promise.resolve()
    expect(overCapResolved).toBe(false)

    // Release one slot — the waiter should now be granted it.
    releaseMetadataSlot()
    await overCap
    expect(overCapResolved).toBe(true)

    // cleanup: release the slot the waiter now holds + the remaining held slots.
    releaseMetadataSlot()
    for (let i = 0; i < MAX_CONCURRENT_METADATA_FETCHES - 1; i++) {
      releaseMetadataSlot()
    }
  })
})
