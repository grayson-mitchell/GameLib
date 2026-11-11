// Phase 35 Plan 05 (D-04): `Store` is no longer `electron-store` — it is
// `./store_backend`, a first-party shim over `conf`. `electron-store` was a thin
// wrapper over `conf` whose only real addition was `require('electron')`, which
// made it the last third-party runtime dependency on Electron in the tree.
//
// THE LOAD-BEARING PART, repeated here because this is where the constructor
// lives: the shim passes `cwd` to `conf` EXPLICITLY, derived from
// `sidecar/pathShim.ts`'s `getPath('userData')`. `conf`'s own default derives
// from `env-paths` plus the package name — a DIFFERENT algorithm from
// `app.getPath('userData')` — and `conf` resolves a RELATIVE `cwd` against
// `process.cwd()`. It also has no `name` option at all (it reads `configName`).
// Omitting any of that translation silently relocates, or outright collapses,
// every persisted setting, library cache and credential in the app. See
// `store_backend.ts`'s header for the measurements, and
// `__tests__/cache.test.ts`'s "store path parity" block for the gate.
import Store from './store_backend'
import type { StoreDeclaration } from './storeVersioning/types'
import type { StoreRegistry } from './stores/storeRegistry'

import {
  StoreOptions,
  StoreStructure,
  TypeCheckedStore,
  UnknownGuard,
  ValidStoreName
} from 'common/types/typed_store'
import { Get } from 'type-fest'
import type { StoreRoot } from './stores/storeRoot'

// REQ-29-01 / Pitfall 4: a `ValidStoreName` string is NOT the on-disk
// filename — `options.cwd` + (`options.name` ?? 'config') governs that, and
// `TypeCheckedStoreBackend`'s constructor drops its `name` parameter
// entirely once `new Store(options)` is called. Any generic, name-keyed
// dispatch (the sidecar's storeSet/storeGet handlers, plan 29-05) MUST
// resolve the live instance through the boot's registry and must NEVER
// reconstruct a path/instance from the name string itself.
const RESERVED_KEY = '__internal__'

export class TypeCheckedStoreBackend<
  Name extends ValidStoreName
> implements TypeCheckedStore<Name> {
  private store: Store
  /**
   * Retained so writes can name the store they changed when notifying the renderer.
   *
   * This does NOT contradict the REQ-29-01 note above: that note says the name is not the
   * on-disk FILENAME and must never be used to reconstruct a path. It is still the store's
   * IDENTITY — the per-boot `StoreRegistry` is keyed by it, and it is exactly the
   * identifier `StoreChangedPayload.store` carries. Used for identity only, never for
   * path resolution.
   */
  private readonly storeName: Name
  /** The boot's root: this store's directory, shared cells and renderer push (66.4 plan 04). */
  private readonly root: StoreRoot

  constructor(
    name: Name,
    options: StoreOptions<StoreStructure[Name]>,
    declaration: StoreDeclaration,
    deps: { registry?: StoreRegistry; root: StoreRoot }
  ) {
    const { registry, root } = deps
    this.storeName = name
    this.root = root
    // @ts-expect-error Pre-existing generic variance between the per-store
    // `StoreStructure[Name]` shape and the store's own `Record<string, unknown>`
    // default. Carried over verbatim from the electron-store-backed version.
    this.store = new Store({ ...options, declaration, root })
    // The registry (66.1 plan 25) is per boot and owns first-registration-wins plus the
    // duplicate diagnostic (WR-08). A store built with no registry is not RPC-visible.
    registry?.register(
      name,
      this as unknown as TypeCheckedStoreBackend<ValidStoreName>,
      options as StoreOptions<StoreStructure[ValidStoreName]>,
      declaration
    )
  }

  public has(key: string) {
    return this.store.has(key)
  }

  public get<KeyType extends string>(
    key: KeyType,
    defaultValue: NonNullable<UnknownGuard<Get<StoreStructure[Name], KeyType>>>
  ) {
    return this.store.get(key, defaultValue) as NonNullable<
      UnknownGuard<Get<StoreStructure[Name], KeyType>>
    >
  }

  public get_nodefault<KeyType extends string>(key: KeyType) {
    return this.store.get(key) as UnknownGuard<
      Get<StoreStructure[Name], KeyType> | undefined
    >
  }

  // The three write methods below each announce the change to the renderer AFTER the
  // write succeeds. See `./stores/storeRoot` (`changes`) for why this is an injected function
  // rather than a direct `pushFrontendMessage` call, and why it was a no-op back when this
  // ran under the old Electron build.
  // A write that throws must NOT notify — the renderer would then cache a value that is
  // not on disk, which is the exact divergence this mechanism exists to prevent.

  /**
   * Phase 68 D-03/D-06: a read-only store (newer-than-supported or failed
   * migration) refuses every write at the `GameLibStore` setter. These early
   * returns make the refusal silent to the renderer too: notifying after a
   * refused write would make the renderer cache a value that is not on disk.
   * `=== true` so suites that mock `store_backend` (no `readOnly`) stay writable.
   */
  public get readOnly(): boolean {
    return (this.store as { readOnly?: boolean }).readOnly === true
  }

  /**
   * `__internal__` is the engine's store-version namespace. conf's own
   * reserved-key check misses the bare key and is skipped entirely on
   * `accessPropertiesByDotNotation: false` stores, so refuse it here.
   */
  private refuseReservedKey(key: string): boolean {
    if (key.split('.')[0] !== RESERVED_KEY) return false
    process.stderr.write(
      `[typed_store] refusing reserved key on ${this.storeName}\n`
    )
    return true
  }

  public set<KeyType extends string>(
    key: KeyType,
    value: UnknownGuard<Get<StoreStructure[Name], KeyType>>
  ) {
    if (this.readOnly || this.refuseReservedKey(key)) return
    this.store.set(key, value)
    this.root.changes.notify({ store: this.storeName, key, value })
  }

  public delete<KeyType extends string>(key: KeyType) {
    if (this.readOnly || this.refuseReservedKey(key)) return
    this.store.delete(key)
    this.root.changes.notify({ store: this.storeName, key, deleted: true })
  }

  public clear() {
    if (this.readOnly) return
    this.store.clear()
    // Whole-store change: no single key describes it, and a per-key encoding could not
    // express the removals at all.
    this.root.changes.invalidate(this.storeName)
  }

  public get raw_store() {
    // The version envelope is not store data: `uploader.ts` iterates these keys as
    // log URLs, and the sidecar snapshot path reads this too (Pitfall 5).
    const { [RESERVED_KEY]: _internal, ...rest } = this.store.store
    return rest as StoreStructure[Name]
  }
}
