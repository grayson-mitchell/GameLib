/**
 * Per-boot store root (66.4 plan 04, D-66.4-04 / D-05).
 *
 * Every persistent store used to find its directory through `process/appPaths` at construction
 * and share module state: the renderer push (`storeChangeNotifier.ts`). A `StoreRoot` is the
 * instance form of that state: the boot's 'stores' step builds one from `ctx.paths.userData` and
 * hands it to every store, so two boots (or two tests) share nothing and no store resolves a
 * path at import.
 *
 * Import budget: the pure versioning layer (storeVersioning/engine, readOnlyStores,
 * storeMigrations: no logger, no IPC), the pure mirror layer (mirrorCell, storeFrames: no logger,
 * no IPC, the output stream injected) and type-only imports. Stores import this module; it must
 * never reach the IPC layer (see the changes-channel note below) or construct a store.
 *
 * Plan 18 adds `versioning` (the per-file version engine, former module state in
 * storeVersioning/engine.ts) and `readOnly` (the read-only tracker, former readOnlyStores.ts
 * module state): every store of a boot shares them, two roots never do.
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
 *
 * Phase 85 (D-03, 85-21): every store of a root is a mirror over the shell's `StoreHost`, the one
 * disk writer. There is no rollback flag and no TS owner: the root carries the frame sink a mirror
 * writes through and what the shell reported about the stores it opened (`GAMELIB_STORE_BOOT`).
 */
import { basename } from 'path'
import type { StoreChangedPayload } from 'common/types/sidecarTransport'
import { createMigrations, type MigrationOverrides } from '../storeMigrations'
import {
  createStoreVersioning,
  type StoreVersioning
} from '../storeVersioning/engine'
import {
  createReadOnlyStores,
  type ReadOnlyStores,
  type Sinks as ReadOnlySinks
} from '../storeVersioning/readOnlyStores'
import { MirrorRegistry } from './mirrorCell'
import type { StoreFrameSink } from './storeFrames'
import type { StoreRegistry } from './storeRegistry'

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
  readonly changes: StoreChangeChannel
  readonly versioning: StoreVersioning
  readonly readOnly: ReadOnlyStores
  readonly boot: StoreBootEnv
  readonly frameSink: StoreFrameSink
  readonly mirrors: MirrorRegistry
}

/** What a root built with no sink is given (a test that writes no store): it never carries a frame. */
const NO_FRAME_SINK: StoreFrameSink = {
  send() {
    throw new Error(
      '[storeRoot] a store frame was sent on a root built without a frame sink'
    )
  }
}

type BootReadOnlyReason = 'newer' | 'failed'

/** What the shell told the sidecar about the stores it opened (`GAMELIB_STORE_BOOT`). */
export interface StoreBootEnv {
  /** Stores that refuse writes, by store key. */
  readonly readOnly: ReadonlyMap<string, BootReadOnlyReason>
  /** Caches that could not be read and continue empty. */
  readonly startEmpty: ReadonlySet<string>
}

const NO_BOOT: StoreBootEnv = { readOnly: new Map(), startEmpty: new Set() }

/**
 * Parses `GAMELIB_STORE_BOOT` (`{"readOnly":[{"store","reason"}],"startEmpty":["<key>"]}`, written
 * by `store_boot::boot_env_value`) defensively: a missing value is the empty result, and so is one
 * that is not that shape, with one stderr line. Entries of the wrong shape are skipped.
 */
export function readStoreBootEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): StoreBootEnv {
  const text = env.GAMELIB_STORE_BOOT
  if (text === undefined || text === '') return NO_BOOT
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    process.stderr.write(
      '[storeRoot] GAMELIB_STORE_BOOT is not JSON; ignoring it\n'
    )
    return NO_BOOT
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(
      '[storeRoot] GAMELIB_STORE_BOOT is not an object; ignoring it\n'
    )
    return NO_BOOT
  }
  const { readOnly, startEmpty } = parsed as Record<string, unknown>
  const readOnlyMap = new Map<string, BootReadOnlyReason>()
  if (Array.isArray(readOnly)) {
    for (const entry of readOnly as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue
      const { store, reason } = entry as Record<string, unknown>
      if (
        typeof store === 'string' &&
        (reason === 'newer' || reason === 'failed')
      ) {
        readOnlyMap.set(store, reason)
      }
    }
  }
  const startEmptySet = new Set<string>()
  if (Array.isArray(startEmpty)) {
    for (const key of startEmpty as unknown[]) {
      if (typeof key === 'string') startEmptySet.add(key)
    }
  }
  return { readOnly: readOnlyMap, startEmpty: startEmptySet }
}

/**
 * The stores the shell found read-only at boot (`GAMELIB_STORE_BOOT`), entered into the root's
 * aggregate so the once-per-launch notice (payload unchanged, D-12) lists them beside the stores
 * the TS engine marks. Keyed like the engine's own entries (`<dir>/<name>`, `<name>.json`), so a
 * store both sides report is recorded once.
 */
function seedBootReadOnly(readOnly: ReadOnlyStores, boot: StoreBootEnv): void {
  for (const [storeKey, reason] of boot.readOnly) {
    readOnly.record({
      storeKey,
      file: `${basename(storeKey)}.json`,
      reason,
      detail: 'reported by the Rust store host'
    })
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

export function createStoreRoot(deps: {
  userData: string
  /** Test seam: read-only sinks installed at construction (production installs them at flush). */
  readOnlySinks?: ReadOnlySinks
  /** Test seam: replacement migration chains for this root's versioning engine. */
  migrationOverrides?: MigrationOverrides
  /** `GAMELIB_STORE_BOOT`, parsed (`readStoreBootEnv`). */
  boot?: StoreBootEnv
  /** Where a mirror's frames go. Absent, a store write on this root throws. */
  frameSink?: StoreFrameSink
}): StoreRoot {
  const frameSink = deps.frameSink ?? NO_FRAME_SINK
  const boot = deps.boot ?? NO_BOOT
  const readOnly = createReadOnlyStores({ sinks: deps.readOnlySinks })
  seedBootReadOnly(readOnly, boot)
  const versioning = createStoreVersioning({
    migrations: createMigrations({ overrides: deps.migrationOverrides }),
    readOnly
  })
  return {
    userData: deps.userData,
    changes: createStoreChangeChannel(),
    versioning,
    readOnly,
    boot,
    frameSink,
    mirrors: new MirrorRegistry({ sink: frameSink, boot })
  }
}
