/**
 * Per-boot store root (66.4 plan 04, D-66.4-04 / D-05).
 *
 * Every persistent store used to find its directory through `sidecar/pathShim` at construction
 * and share two pieces of module state: the file-cell registry (`sidecar/fileStore.ts`, D-14)
 * and the renderer push (`storeChangeNotifier.ts`). A `StoreRoot` is the instance form of all
 * three: the boot's 'stores' step builds one from `ctx.paths.userData` and hands it to every
 * store, so two boots (or two tests) share nothing and no store resolves a path at import.
 *
 * Import budget: a type-only import and nothing else. Stores import this module; it must
 * never reach the IPC layer (see the changes-channel note below) or construct a store.
 *
 * The changes channel (formerly `storeChangeNotifier.ts`)
 *
 * Phase 29 D-06 gave the renderer a `STORE_CHANGED_CHANNEL` listener that patches its snapshot
 * whenever the sidecar reports a store write. The sidecar's OWN writes (every backend store
 * manager) bypass `applyStoreWrite`, so without a notification the renderer snapshot silently
 * diverges from disk (.planning/debug/gog-login-ui-never-updates.md). The store classes call
 * `root.changes.notify()`; the sidecar binds the real push once, in
 * `registerStoreWriteHandlers()`. Until then `notify` is a no-op, exactly as the null
 * notifier was. `storeWriteHandlers.ts` forbids a second `pushFrontendMessage(STORE_CHANGED_CHANNEL)`
 * call site: this channel holds a function reference that points at that one site.
 */
import type { StoreChangedPayload } from 'common/types/sidecarTransport'
import type { StoreRegistry } from './storeRegistry'

export interface FileStoreCell {
  data: Record<string, unknown>
}

/**
 * D-14: one shared data cell per resolved on-disk path, scoped to the root. Production code
 * never discards a cell: doing so would desync an already-constructed `FileStore`.
 */
interface FileStoreCells {
  cellFor(fullPath: string, create: () => FileStoreCell): FileStoreCell
}

type StorePush = (payload: StoreChangedPayload) => void

interface StoreChangeChannel {
  /** Installs (or clears, with `null`) the sidecar's push implementation. */
  bind(push: StorePush | null): void
  isBound(): boolean
  /**
   * No-op when unbound or suppressed. A throw from the push never propagates: the write
   * already succeeded and a dropped push degrades to a stale snapshot, not data loss.
   */
  notify(payload: StoreChangedPayload): void
  /**
   * Whole-store change a per-key payload cannot express (a `clear()`, or a `CacheStore.commit()`
   * flushing an in-memory map): the renderer drops the store and re-fetches it.
   */
  invalidate(storeName: string): void
  /**
   * Runs `fn` with notification suppressed. Whoever initiates a write owns its notification:
   * `applyStoreWrite` pushes a richer payload itself, so the store classes stay quiet inside
   * it. A depth counter, not a boolean, so a nested section cannot re-enable the outer one.
   */
  withSuppressed<T>(fn: () => T): T
}

export interface StoreRoot {
  readonly userData: string
  readonly cells: FileStoreCells
  readonly changes: StoreChangeChannel
}

function createFileStoreCells(): FileStoreCells {
  const registry = new Map<string, FileStoreCell>()
  return {
    cellFor(fullPath, create) {
      let cell = registry.get(fullPath)
      if (!cell) {
        cell = create()
        registry.set(fullPath, cell)
      }
      return cell
    }
  }
}

function createStoreChangeChannel(): StoreChangeChannel {
  let push: StorePush | null = null
  let suppressDepth = 0
  const channel: StoreChangeChannel = {
    bind(fn) {
      push = fn
    },
    isBound: () => push !== null,
    notify(payload) {
      if (!push || suppressDepth > 0) return
      try {
        push(payload)
      } catch {
        // Intentionally swallowed (see the interface note). No logger import: same reach
        // constraint as the module header.
      }
    },
    invalidate(storeName) {
      channel.notify({ store: storeName, key: '', invalidated: true })
    },
    withSuppressed(fn) {
      suppressDepth++
      try {
        return fn()
      } finally {
        suppressDepth--
      }
    }
  }
  return channel
}

/** What every store family factory receives: the boot's registry and root. */
export interface StoreFamilyDeps {
  registry: StoreRegistry
  root: StoreRoot
}

export function createStoreRoot(deps: { userData: string }): StoreRoot {
  return {
    userData: deps.userData,
    cells: createFileStoreCells(),
    changes: createStoreChangeChannel()
  }
}
