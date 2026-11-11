import {
  MAX_CONCURRENT_METADATA_FETCHES,
  createSteamLibraryState
} from '../state'

/**
 * The metadata-fetch semaphore caps how many Steam store-API requests run at
 * once so a cold cache (hundreds of games) doesn't open hundreds of parallel
 * TLS connections and mass-time-out. 66.3-13: the limiter, the library map and
 * the dedup set are per-instance (one per boot), so every case builds its own.
 */
describe('Steam metadata-fetch concurrency limiter', () => {
  it('grants up to MAX_CONCURRENT_METADATA_FETCHES slots immediately', async () => {
    const state = createSteamLibraryState()
    const granted = await Promise.all(
      Array.from({ length: MAX_CONCURRENT_METADATA_FETCHES }, () =>
        state.acquireMetadataSlot().then(() => true)
      )
    )
    expect(granted).toHaveLength(MAX_CONCURRENT_METADATA_FETCHES)
    expect(granted.every(Boolean)).toBe(true)
  })

  it('queues an over-cap request until a slot is released, then hands it the slot', async () => {
    const state = createSteamLibraryState()
    // Fill every slot.
    for (let i = 0; i < MAX_CONCURRENT_METADATA_FETCHES; i++) {
      await state.acquireMetadataSlot()
    }

    // One more must NOT resolve until a slot frees.
    let overCapResolved = false
    const overCap = state.acquireMetadataSlot().then(() => {
      overCapResolved = true
    })

    // Let microtasks flush — it should still be pending.
    await Promise.resolve()
    expect(overCapResolved).toBe(false)

    // Release one slot — the waiter should now be granted it.
    state.releaseMetadataSlot()
    await overCap
    expect(overCapResolved).toBe(true)
  })

  it('a released slot below the cap lets the next acquire resolve immediately', async () => {
    const state = createSteamLibraryState()
    for (let i = 0; i < MAX_CONCURRENT_METADATA_FETCHES; i++) {
      await state.acquireMetadataSlot()
    }
    state.releaseMetadataSlot()
    await expect(state.acquireMetadataSlot()).resolves.toBeUndefined()
  })

  it('two instances never share a slot count, a library map or a dedup set', async () => {
    const one = createSteamLibraryState()
    const two = createSteamLibraryState()
    for (let i = 0; i < MAX_CONCURRENT_METADATA_FETCHES; i++) {
      await one.acquireMetadataSlot()
    }
    // `one` is full; `two` is untouched, so its acquire resolves at once.
    await expect(two.acquireMetadataSlot()).resolves.toBeUndefined()
    one.pendingFetches.add('730')
    one.library.set('730', { app_name: '730' } as never)
    expect(two.pendingFetches.size).toBe(0)
    expect(two.library.size).toBe(0)
  })
})
