import Store from './store_backend'
import type { StoreKind } from './storeVersioning/types'

import type { StoreRoot } from './stores/storeRoot'

export default class CacheStore<ValueType, KeyType extends string = string> {
  private readonly store: Store
  /**
   * Retained so writes can name the store they changed. For a `CacheStore` the
   * constructor filename IS the store name the renderer knows it by — both sides
   * construct with `{ cwd: 'store_cache', name: filename }`, and
   * `RECOGNIZED_CACHE_STORE_NAMES` lists these same strings.
   */
  private readonly filename: string
  private readonly root: StoreRoot
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
   * @param options.kind D-01: 'cache' is discarded on a shape-changing version
   *                     bump, 'user-state' is migrated and never discarded.
   */
  constructor(
    filename: string,
    max_value_lifespan: number | null = 60 * 6,
    options: {
      /** The boot's root: this store's directory, shared cells and renderer push. */
      root: StoreRoot
      kind: StoreKind
      tokenBearing?: true
      failedView?: 'as-is' | 'empty'
      invalidateCheck?: (data: ValueType) => boolean
    }
  ) {
    this.filename = filename
    this.root = options.root
    this.store = new Store({
      root: options.root,
      cwd: 'store_cache',
      name: filename,
      clearInvalidConfig: true,
      declaration: {
        kind: options.kind,
        ...(options.tokenBearing ? { tokenBearing: options.tokenBearing } : {}),
        ...(options.failedView ? { failedView: options.failedView } : {})
      }
    })
    this.in_memory_store = new Map<string, ValueType>()
    this.using_in_memory = false
    this.current_store = this.store
    this.lifespan = max_value_lifespan
    if (options.invalidateCheck) {
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
    // The engine's `__internal__` version envelope is not a cache entry: keep it out
    // of the working map (commit() re-stamps it on the way back to disk).
    this.in_memory_store = new Map(
      Object.entries(this.store.store).filter(([key]) => key !== '__internal__')
    ) as Map<string, ValueType>
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
   * The renderer's mirror of this class (`frontend/helpers/stores.ts`'s
   * `CacheStore.get`) reads TWO fields before it will return anything: `storeHas(key)`
   * AND `storeGet('__timestamp.' + key)`. It returns the caller's fallback if EITHER is
   * missing. Announcing only the value would therefore leave the renderer with a
   * populated key, no timestamp, and the same empty result the notification exists to
   * fix — a fix that looks correct in the payload and changes nothing observable.
   *
   * `changes.notify` is a no-op when the in-memory path is active (see below), so the
   * `using_in_memory` guard is about correctness, not chattiness: those writes have not
   * reached disk yet, and telling the renderer otherwise would make its snapshot claim a
   * value the sidecar has not persisted.
   */
  public set(key: KeyType, value: ValueType) {
    if (this.refusesDiskWrite()) return
    const timestamp = Date() as ValueType
    this.current_store.set(key, value)
    this.current_store.set(`__timestamp.${key}`, timestamp)
    if (!this.using_in_memory) {
      this.root.changes.notify({ store: this.filename, key, value })
      this.root.changes.notify({
        store: this.filename,
        key: `__timestamp.${key}`,
        value: timestamp
      })
    }
  }

  public delete(key: KeyType) {
    if (this.refusesDiskWrite()) return
    this.current_store.delete(key)
    this.current_store.delete(`__timestamp.${key}`)
    if (!this.using_in_memory) {
      this.root.changes.notify({ store: this.filename, key, deleted: true })
      this.root.changes.notify({
        store: this.filename,
        key: `__timestamp.${key}`,
        deleted: true
      })
    }
  }

  public clear = () => {
    if (this.refusesDiskWrite()) return
    this.current_store.clear()
    if (!this.using_in_memory) {
      this.root.changes.invalidate(this.filename)
    }
  }

  /**
   * Phase 68 D-03/D-06: true for a read-only store (newer-than-supported or failed
   * migration). `=== true` so suites mocking `store_backend` stay writable.
   */
  public get readOnly(): boolean {
    return (this.store as { readOnly?: boolean }).readOnly === true
  }

  /** A read-only store accepts no disk write and announces nothing; the in-memory map keeps working. */
  private refusesDiskWrite(): boolean {
    return this.readOnly && !this.using_in_memory
  }

  public has(key: string) {
    return this.current_store.has(key)
  }

  /**
   * Returns all cached entries as [key, value] pairs, excluding internal
   * `__timestamp.*` bookkeeping keys and the engine's `__internal__` version key. Useful for one-off cache migrations.
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
        ([key]) =>
          key !== '__internal__' &&
          key !== '__timestamp' &&
          !key.startsWith('__timestamp.')
      )
      .map(([key, value]) => [key as KeyType, value as ValueType])
  }

  public commit() {
    if (this.using_in_memory && this.readOnly) {
      // D-03: the batched session writes are lost; nothing is written or announced.
      this.using_in_memory = false
      this.current_store = this.store
      return
    }
    if (this.using_in_memory) {
      this.store.store = Object.fromEntries(this.in_memory_store)
      this.using_in_memory = false
      this.current_store = this.store
      // This is the moment the batched in-memory writes actually reach disk, and it
      // REPLACES the whole store object — so it is announced as a whole-store
      // invalidation, not as N per-key pushes. Emitting per-key here would also miss
      // every key the commit REMOVED relative to what was on disk before.
      this.root.changes.invalidate(this.filename)
    }
  }
}
