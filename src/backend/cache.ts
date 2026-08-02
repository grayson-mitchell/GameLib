import Store from 'electron-store'

import {
  notifyStoreChanged,
  notifyStoreInvalidated
} from './storeChangeNotifier'

export default class CacheStore<ValueType, KeyType extends string = string> {
  private readonly store: Store
  /**
   * Retained so writes can name the store they changed. For a `CacheStore` the
   * constructor filename IS the store name the renderer knows it by — both sides
   * construct with `{ cwd: 'store_cache', name: filename }`, and
   * `RECOGNIZED_CACHE_STORE_NAMES` lists these same strings.
   */
  private readonly filename: string
  private in_memory_store: Map<string, ValueType>
  private using_in_memory: boolean
  private current_store: Store | Map<string, ValueType>
  private readonly lifespan: number | null
  private invalidateCheck: (data: ValueType) => boolean

  /**
   * Creates a new cache store
   * @param filename
   * @param max_value_lifespan How long an individual entry in the store will
   *                           be cached (in minutes)
   */
  constructor(
    filename: string,
    max_value_lifespan: number | null = 60 * 6,
    options?: { invalidateCheck?: (data: ValueType) => boolean }
  ) {
    this.filename = filename
    this.store = new Store({
      cwd: 'store_cache',
      name: filename,
      clearInvalidConfig: true
    })
    this.in_memory_store = new Map<string, ValueType>()
    this.using_in_memory = false
    this.current_store = this.store
    this.lifespan = max_value_lifespan
    if (options && options.invalidateCheck) {
      this.invalidateCheck = options.invalidateCheck
    } else {
      this.invalidateCheck = () => true
    }
  }

  /**
   * Allows to switch over to use in memory store (useful for many read and writes)
   * IMPORTANT! after operations run commit() to update file on drive
   */
  public use_in_memory() {
    // Mirror store to memory map
    this.using_in_memory = true
    this.in_memory_store = new Map(this.store) as Map<string, ValueType>
    this.current_store = this.in_memory_store
  }

  public get(key: KeyType): ValueType | undefined
  public get(key: KeyType, fallback: ValueType): ValueType
  public get(key: KeyType, fallback?: ValueType) {
    if (!this.current_store.has(key)) {
      return fallback
    }

    if (this.lifespan) {
      const lastUpdateTimestamp = this.current_store.get(
        `__timestamp.${key}`
      ) as string | undefined
      if (!lastUpdateTimestamp) {
        return fallback
      }

      const updateDate = new Date(lastUpdateTimestamp)
      const msSinceUpdate = Date.now() - updateDate.getTime()
      const minutesSinceUpdate = msSinceUpdate / 1000 / 60
      if (
        minutesSinceUpdate > this.lifespan &&
        this.invalidateCheck(this.current_store.get(key) as ValueType)
      ) {
        this.current_store.delete(key)
        this.current_store.delete(`__timestamp.${key}`)
        return fallback
      }
    }

    return this.current_store.get(key) as ValueType
  }

  /**
   * BOTH writes below must be announced, not just the value one.
   *
   * The renderer's mirror of this class (`frontend/helpers/electronStores.ts`'s
   * `CacheStore.get`) reads TWO fields before it will return anything: `storeHas(key)`
   * AND `storeGet('__timestamp.' + key)`. It returns the caller's fallback if EITHER is
   * missing. Announcing only the value would therefore leave the renderer with a
   * populated key, no timestamp, and the same empty result the notification exists to
   * fix — a fix that looks correct in the payload and changes nothing observable.
   *
   * `notifyStoreChanged` is a no-op when the in-memory path is active (see below), so the
   * `using_in_memory` guard is about correctness, not chattiness: those writes have not
   * reached disk yet, and telling the renderer otherwise would make its snapshot claim a
   * value the sidecar has not persisted.
   */
  public set(key: KeyType, value: ValueType) {
    const timestamp = Date() as ValueType
    this.current_store.set(key, value)
    this.current_store.set(`__timestamp.${key}`, timestamp)
    if (!this.using_in_memory) {
      notifyStoreChanged({ store: this.filename, key, value })
      notifyStoreChanged({
        store: this.filename,
        key: `__timestamp.${key}`,
        value: timestamp
      })
    }
  }

  public delete(key: KeyType) {
    this.current_store.delete(key)
    this.current_store.delete(`__timestamp.${key}`)
    if (!this.using_in_memory) {
      notifyStoreChanged({ store: this.filename, key, deleted: true })
      notifyStoreChanged({
        store: this.filename,
        key: `__timestamp.${key}`,
        deleted: true
      })
    }
  }

  public clear = () => {
    this.current_store.clear()
    if (!this.using_in_memory) {
      notifyStoreInvalidated(this.filename)
    }
  }

  public has(key: string) {
    return this.current_store.has(key)
  }

  /**
   * Returns all cached entries as [key, value] pairs, excluding internal
   * `__timestamp.*` bookkeeping keys. Useful for one-off cache migrations.
   *
   * The bookkeeping exclusion must cover BOTH on-disk shapes:
   * - The file-backed path: electron-store (conf) defaults
   *   `accessPropertiesByDotNotation: true`, so `set('__timestamp.foo', …)`
   *   nests the timestamps under a single TOP-LEVEL `__timestamp` object —
   *   the literal-prefix filter alone misses it, leaking a
   *   `['__timestamp', {…}]` pseudo-entry to callers (this broke
   *   HumbleLibrary.getKeys(), which spreads `entry.keys` of every entry).
   * - The in-memory path (use_in_memory): Map.set stores the literal
   *   `__timestamp.foo` key, which the prefix filter catches.
   */
  public entries(): Array<[KeyType, ValueType]> {
    const source =
      this.current_store instanceof Map
        ? Object.fromEntries(this.current_store)
        : this.store.store
    return Object.entries(source)
      .filter(
        ([key]) => key !== '__timestamp' && !key.startsWith('__timestamp.')
      )
      .map(([key, value]) => [key as KeyType, value as ValueType])
  }

  public commit() {
    if (this.using_in_memory) {
      this.store.store = Object.fromEntries(this.in_memory_store)
      this.using_in_memory = false
      this.current_store = this.store
      // This is the moment the batched in-memory writes actually reach disk, and it
      // REPLACES the whole store object — so it is announced as a whole-store
      // invalidation, not as N per-key pushes. Emitting per-key here would also miss
      // every key the commit REMOVED relative to what was on disk before.
      notifyStoreInvalidated(this.filename)
    }
  }
}
