/**
 * Tauri↔sidecar renderer transport (Phase 27 Plan 03 — spike 012, the cheapest leg).
 *
 * Wraps `@tauri-apps/api` to provide the same three verb shapes the Electron preload's
 * `ipc.ts` factories expect -- `invoke` (req/resp), `send` (fire-and-forget), `listen`
 * (backend->frontend push) -- plus a fourth primitive: a synchronous in-memory store
 * snapshot for `misc.ts`'s `storeGet`/`storeHas` (the Steam login-gate reads
 * `steamConfigStore` synchronously -- GlobalState.tsx:238).
 *
 * `isTauri()` re-exports `@tauri-apps/api/core`'s own check (`globalThis.isTauri`, set by
 * the Tauri webview at injection time) so `ipc.ts`/`misc.ts`/`preload/index.ts` can guard
 * their re-pointed bodies without this module ever touching `ipcRenderer`/`electron-store`.
 *
 * This module has NO import of the electron package (or any other Node-only package) --
 * it is safe to be part of the Tauri renderer's own JS bundle. `ipc.ts`/`misc.ts` used to
 * keep their Node/Electron access behind a lazily-invoked, guarded `require` for the same
 * reason; Phase 35 plan 16 removed those requires entirely once nothing ran under
 * Electron anymore -- see those files' own comments.
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event'
import {
  SIDECAR_INVOKE,
  SIDECAR_SEND,
  SIDECAR_STORE_SNAPSHOT,
  FRONTEND_MESSAGE_EVENT,
  STORE_FETCH_CHANNEL,
  STORE_NEW_CHANNEL,
  STORE_CHANGED_CHANNEL,
  STORE_LAZY_MISS_MARKER,
  type StoreChangedPayload
} from 'common/types/sidecarTransport'
import { isAllowedStoreField, isSafeKeyPath, isWritableStoreField } from 'common/types/storePolicy'

/**
 * Robust Tauri-context detection (Phase 27 Plan 05 blank-screen fix).
 *
 * `@tauri-apps/api/core`'s own `isTauri()` checks ONLY `window.isTauri` — a
 * convenience flag that is NOT reliably present in every Tauri v2 webview. When it
 * is absent, that helper returns `false`, so `tauriAttach` never attaches
 * `window.api`, `ipc.ts`/`misc.ts` fall through to their Electron-only `require()`
 * branch, and the renderer throws (or renders blank) inside a real Tauri window.
 *
 * `__TAURI_INTERNALS__` is the ground-truth object the Tauri runtime ALWAYS injects
 * (it is what `invoke`/`listen` themselves use), so we treat EITHER signal as
 * proof-of-Tauri. In Electron/plain-browser neither is present, so this correctly
 * returns `false` and the byte-identical Electron path is preserved.
 */
export function isTauri(): boolean {
  const w = globalThis as unknown as {
    isTauri?: unknown
    __TAURI_INTERNALS__?: unknown
  }
  return Boolean(w.isTauri) || typeof w.__TAURI_INTERNALS__ !== 'undefined'
}

/**
 * Whether the running shell registers the `imagecache://` custom URL scheme
 * (34.4.1 gap cycle 2, plan 27, Task 2).
 *
 * SINGLE SOURCE OF TRUTH: `src/backend/images_cache.ts`'s
 * `protocol.handle('imagecache', ...)` registration, which runs from an
 * Electron-only `whenReady()` init. The sidecar does NOT run Electron
 * `whenReady()` inits (project memory `phase-33-complete`), so under Tauri
 * -- the only shell that exists (Phase 35 electron cutover) -- that
 * registration never happens, and any `imagecache://...` request WKWebView
 * issues fails with `unsupported URL` -- measured at ~150 failed requests
 * per library render (one per http-sourced game tile), each recovered by
 * `CachedImage`'s `onError` retry at the cost of a doubled request and a
 * visible load flash.
 *
 * Phase 35 plan 17: this predicate used to compute the negation of a
 * runtime Tauri-context check, back when Electron and Tauri could both be
 * running. Now that Tauri is the only shell, that check is always true, so
 * the negation is always false -- hardcoded here rather than computed. If a
 * Tauri-side `imagecache://` handler is ever added, THIS is the one line
 * that changes -- every consumer (starting with `CachedImage`) follows
 * without touching a single call site. Consumers must call this predicate
 * rather than inlining their own scheme-availability check, so the scheme
 * decision lives in exactly one named place.
 */
export function imageCacheSchemeAvailable(): boolean {
  return false
}

/**
 * Mirrors `makeHandlerInvoker`'s req/resp shape: `invoke(channel, args) -> Promise<Ret>`.
 * Relayed by the Rust shell's `sidecar_invoke` command to the sidecar's stdio JSON-RPC loop.
 */
export async function invoke<Ret = unknown>(channel: string, args: unknown[]): Promise<Ret> {
  return tauriInvoke<Ret>(SIDECAR_INVOKE, { channel, args })
}

/**
 * Mirrors `makeListenerCaller`'s fire-and-forget shape: `send(channel, args)`.
 * Relayed by the Rust shell's `sidecar_send` command; no response is awaited.
 *
 * Debug session `open-external-frame-noop` (2026-08-23): this used to be
 * `void tauriInvoke(SIDECAR_SEND, { channel, args })` -- the leading `void` unconditionally
 * discarded the invoke's rejection for all ~57 channels that call `send()`. A single caller
 * (`openDiscordLink`, bound bare as a JSX `onClick` handler) passed a React SyntheticEvent as
 * an arg; Tauri's `invoke()` JSON-serializes its payload internally, and the SyntheticEvent's
 * cyclic references (e.g. `nativeEvent`/DOM back-references) made that serialization throw,
 * rejecting the invoke promise. With the rejection discarded, the click produced NO signal
 * anywhere -- no browser navigation, no error, no log line -- and took four instrumentation
 * rounds and roughly a dozen human clicks to localise. `send()` now stays fire-and-forget
 * (still returns `void`, still throws nothing at the call site, still blocks nothing) but
 * surfaces any rejection through `window.api.logError`, naming the channel, so a future
 * "silent no-op" caused the same way is visible in `gamelib.log` on the FIRST occurrence.
 *
 * RECURSION GUARD: `window.api.logError` is ITSELF a `send()`-routed channel (`logError` is
 * just another entry in the same 57-channel set). If we unconditionally routed every
 * rejection through `logError`, a rejection on the `logError` channel's own invoke would
 * recurse into this exact `.catch()` forever (`logError` fails -> log via `logError` -> fails
 * -> log via `logError` -> ...). DO NOT remove this guard to "simplify" the code -- fall back
 * to `console.error` for that one channel only. Renderer `console.error` does not reach
 * `gamelib.log`, but `logError` failing to send is an extremely rare, secondary case compared
 * to silently losing every other channel's rejections, which is the actual bug this fixes.
 */
export function send(channel: string, args: unknown[]): void {
  tauriInvoke(SIDECAR_SEND, { channel, args }).catch((err: unknown) => {
    if (channel === 'logError') {
      // see recursion guard comment above for why this falls back to console.error
      console.error(`[tauriTransport.send] rejected for channel=logError:`, err)
      return
    }
    const w = globalThis as unknown as { api?: { logError?: (msg: string) => void } }
    w.api?.logError?.(`[tauriTransport.send] rejected for channel=${channel}: ${String(err)}`)
  })
}

/**
 * Mirrors `frontendListenerSlot`'s backend->frontend push shape: `listen(channel, cb) ->
 * unsubscribe`. The Rust shell re-emits every `SidecarNotification` the sidecar pushes as a
 * single `FRONTEND_MESSAGE_EVENT` Tauri event carrying `{channel, args}`; filter by channel
 * here since the sidecar multiplexes every backend->frontend push over that one event name.
 */
export function listen(channel: string, callback: (...args: unknown[]) => void): () => void {
  let unlisten: UnlistenFn | undefined
  let cancelled = false

  void tauriListen<{ channel: string; args: unknown[] }>(FRONTEND_MESSAGE_EVENT, (event) => {
    if (event.payload.channel === channel) {
      callback(...event.payload.args)
    }
  }).then((fn) => {
    if (cancelled) {
      fn()
    } else {
      unlisten = fn
    }
  })

  return () => {
    cancelled = true
    unlisten?.()
  }
}

// ---- Synchronous store snapshot bridge (the fourth primitive misc.ts needs) ----

type StoreSnapshot = Record<string, Record<string, unknown>>

const snapshot: StoreSnapshot = {}

/**
 * D-03: which store names have a confirmed-fresh copy in `snapshot` -- either from the
 * eager `hydrateStoreSnapshot()` boot call, or a completed per-store `hydrateStore()`.
 * `registerStore()` seeds `snapshot[name] = {}` immediately on registration, so presence
 * in `snapshot` alone cannot distinguish "genuinely empty" from "not fetched yet" --
 * `hydrated` is the one signal D-04 uses to tell those apart.
 */
const hydrated = new Set<string>()

/** D-03: de-dupes concurrent `hydrateStore()` calls for the same store (T-29-22). */
const inflight = new Map<string, Promise<void>>()

/** D-04: warn at most once per store+key pair, so a hot render loop cannot flood the console. */
const lazyMissWarned = new Set<string>()

/** D-06: guards the one-time, lazy `STORE_CHANGED_CHANNEL` subscription below. */
let changeListenerAttached = false

/**
 * D-06: subscribes once to `STORE_CHANGED_CHANNEL` and patches the in-memory snapshot in
 * place on every push, so the renderer's copy cannot silently diverge from what the
 * sidecar actually persisted -- this closes the loop even for the optimistic writer
 * itself (an optimistic `snapshotSet` that ends up differing from the persisted value
 * self-heals once this push arrives). Deliberately NOT re-filtered by
 * `isAllowedStoreField` on the way in -- the sidecar's own emitter already filtered the
 * payload on the way out (plan 29-06); a second gate here would be redundant, not safer.
 *
 * Attached LAZILY, on first `registerStore()` call, so this module never calls Tauri's
 * `listen()` outside a real Tauri webview (this module is also reached, inertly, from
 * non-Tauri bundles via `misc.ts`).
 */
function ensureChangeListenerAttached(): void {
  if (changeListenerAttached) return
  changeListenerAttached = true

  listen(STORE_CHANGED_CHANNEL, (...args: unknown[]) => {
    const payload = args[0] as StoreChangedPayload | undefined
    if (!payload) return
    const { store, key, value, deleted, invalidated } = payload
    if (!snapshot[store]) snapshot[store] = {}

    // A whole-store change (`store.clear()`, or a `CacheStore.commit()` replacing the
    // store object wholesale) carries no meaningful `key`. Patching a field would be
    // wrong in both directions: it cannot express the REMOVALS a clear/commit performs,
    // so stale keys would survive in the snapshot for the life of the window. Drop the
    // store from `hydrated` and re-fetch instead — `hydrateStore` REPLACES rather than
    // merges (WR-07), which is exactly the semantics a bulk change needs.
    //
    // This is the ONLY place `hydrated` is removed from. Without it the set is
    // append-only, which is precisely how a hydrated store became permanently frozen
    // against sidecar writes (see .planning/debug/gog-login-ui-never-updates.md).
    if (invalidated) {
      hydrated.delete(store)
      void hydrateStore(store)
      return
    }

    // CR-03: the echo must patch the snapshot through the SAME nested path helpers
    // the read side uses, otherwise it re-creates the flat/nested mismatch it exists
    // to repair.
    if (deleted) {
      deleteAtPath(snapshot[store], key)
    } else {
      setAtPath(snapshot[store], key, value)
    }
  })
}

/**
 * Registers a store name so snapshotGet/snapshotHas know to look for it (mirrors
 * misc.ts's storeNew), and forwards the registration to the sidecar over
 * `STORE_NEW_CHANNEL` with the caller's construction `options`, so the sidecar can build
 * a matching instance there. Registration ALONE must not mark the store hydrated -- doing
 * so would permanently defeat D-04's lazy-miss fallback for any lazy store, since
 * `hydrated` is the only gate that fallback checks.
 */
export function registerStore(storeName: string, options?: Record<string, unknown>): void {
  ensureChangeListenerAttached()
  if (!snapshot[storeName]) {
    snapshot[storeName] = {}
  }
  send(STORE_NEW_CHANNEL, [storeName, options])
}

/**
 * Calls the `SIDECAR_STORE_SNAPSHOT` Tauri command once and fills the in-memory snapshot
 * map, marking every store name present in the result as hydrated (D-03). Must be
 * awaited before React mounts (index.tsx) -- the Steam login-gate (GlobalState.tsx:238)
 * and the CacheStore reads (GlobalState.tsx:178/203) read synchronously during
 * GlobalState's constructor. This is the EAGER tier -- `BOOT_SET_STORES`
 * (src/common/types/storePolicy.ts). Anything not in that set is a lazy store, hydrated
 * on demand by `hydrateStore()` below.
 */
export async function hydrateStoreSnapshot(): Promise<void> {
  const result = await tauriInvoke<StoreSnapshot>(SIDECAR_STORE_SNAPSHOT)
  for (const [storeName, values] of Object.entries(result ?? {})) {
    // WR-07: REPLACE, do not merge. See `hydrateStore` below for the rationale.
    snapshot[storeName] = { ...values }
    hydrated.add(storeName)
  }
}

/**
 * D-03: lazy per-store hydrate. Fetches one `LAZY_STORES` store's filtered snapshot on
 * demand via `STORE_FETCH_CHANNEL` (ridden over the existing `SIDECAR_INVOKE` command --
 * no new Tauri command required) and merges it into the in-memory snapshot. De-dupes
 * concurrent callers for the same store through `inflight`. A rejecting fetch is caught
 * and logged, NEVER rethrown -- SEAM Invariant B: a throw here (this is fired with `void`
 * from a synchronous read) can blank the window, the same failure class as the 27-05
 * boot-time crash.
 */
export async function hydrateStore(storeName: string): Promise<void> {
  const existing = inflight.get(storeName)
  if (existing) return existing

  const task = (async () => {
    try {
      const result = await invoke<Record<string, unknown>>(STORE_FETCH_CHANNEL, [storeName])
      // WR-07 (Phase 29 code review): REPLACE the store's snapshot wholesale rather
      // than merging into it. Merging meant a key removed on disk -- by the backend, a
      // migration, or `store.clear()` -- stayed in the renderer's copy for the life of
      // the window, and `snapshotGet` kept returning the stale value in preference to
      // the caller's default. That also defeated the self-heal the D-06 change listener
      // is supposed to guarantee for backend-side deletions. The sidecar's filtered
      // payload is authoritative for the store it names.
      snapshot[storeName] = { ...(result ?? {}) }
      hydrated.add(storeName)
    } catch (error) {
      console.error(
        `hydrateStore: fetch of "${storeName}" failed; leaving the snapshot degraded ` + 'for this store',
        error
      )
    }
  })()

  inflight.set(storeName, task)
  try {
    await task
  } finally {
    inflight.delete(storeName)
  }
}

function getAtPath(obj: Record<string, unknown> | undefined, key: string): unknown {
  if (!obj) return undefined
  // CR-01: never traverse a prototype-chain segment, even on a read.
  if (!isSafeKeyPath(key)) return undefined
  // electron-store dot-notation parity (misc.ts's storeGet supports subpaths).
  return key.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment]
    }
    return undefined
  }, obj)
}

/**
 * CR-03 (Phase 29 code review): the WRITE side must be the exact inverse of `getAtPath`
 * above. It was not — `snapshotSet` did a FLAT `snapshot[storeName][key] = value` while
 * every read resolved the key through `key.split('.')`. Shipped call sites that write
 * dot keys (`configStore.set('games.hidden'|'games.favourites'|'games.customCategories', …)`
 * in GlobalState.tsx, and every frontend `CacheStore.set()`, which writes a
 * `` `__timestamp.${key}` `` entry) therefore read back the PRE-write hydrated value for
 * the rest of the session: a hidden game un-hid itself, and a freshly written cache
 * entry could never be read back in-session. Only a restart repaired it, because the
 * sidecar's `FileStore` does split on dots, so disk was always correct.
 *
 * Carries CR-01's disallowed-segment guard (single-sourced from `storePolicy`) so the
 * renderer snapshot cannot be prototype-polluted either.
 */
function setAtPath(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (!isSafeKeyPath(key)) return
  const segments = key.split('.')
  const last = segments.pop() as string
  let cursor = obj
  for (const segment of segments) {
    const next = cursor[segment]
    if (typeof next !== 'object' || next === null) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[last] = value
}

function deleteAtPath(obj: Record<string, unknown>, key: string): void {
  if (!isSafeKeyPath(key)) return
  const segments = key.split('.')
  const last = segments.pop() as string
  let cursor: Record<string, unknown> | undefined = obj
  for (const segment of segments) {
    if (!cursor || typeof cursor[segment] !== 'object' || cursor[segment] === null) {
      return
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
  if (cursor) delete cursor[last]
}

/**
 * D-04: records+warns at most once per store+key pair that a lazy miss occurred, and
 * kicks off (never awaits) the self-correcting hydrate.
 */
function reportLazyMiss(storeName: string, key: string, forCall: string): void {
  const missKey = `${storeName}.${key}`
  if (!lazyMissWarned.has(missKey)) {
    lazyMissWarned.add(missKey)
    console.warn(
      `${STORE_LAZY_MISS_MARKER} ${forCall}("${storeName}", "${key}") missed an ` +
        'un-hydrated store; returning the caller default and hydrating asynchronously'
    )
  }
  void hydrateStore(storeName)
}

/**
 * Synchronous read from the in-memory snapshot (D-03: boot-set stores are populated by
 * `hydrateStoreSnapshot()`, lazy stores by `hydrateStore()` on first miss).
 *
 * D-08: gates on `isAllowedStoreField` -- the TAURI path's fail-closed ALLOW-list
 * (src/common/types/storePolicy.ts), replacing the module's former local hardcoded
 * secret-key deny-list. Phase 35 plan 16 converged `src/preload/api/misc.ts`'s
 * `storeGet` onto this same allow-list (it used to carry its own, deliberately
 * divergent, Electron-only deny-list until the Electron cutover -- see that file's
 * own D-08 comment for the convergence history and the Phase 28 D-11 precedent this
 * followed).
 *
 * D-04: a synchronous read of a NOT-YET-HYDRATED store returns `defaultValue` rather
 * than throwing or blocking (SEAM Invariant B) -- logs one greppable
 * `STORE_LAZY_MISS_MARKER` warning per store+key pair, fires an async `hydrateStore()`
 * so the NEXT read is correct, and never throws. This is an accepted risk: it admits a
 * silently-wrong first read that self-corrects, which is only diagnosable because the
 * marker is distinct and greppable -- modelled on `UNPORTED_CHANNEL_MARKER`, and
 * deliberately NOT folded into generic logging.
 */
export function snapshotGet(storeName: string, key: string, defaultValue?: unknown): unknown {
  if (!isAllowedStoreField(storeName, key)) {
    console.warn(
      `snapshotGet: blocked read of "${key}" from "${storeName}" -- not in the Tauri ` + 'store-field allow-list'
    )
    return undefined
  }

  const value = getAtPath(snapshot[storeName], key)
  if (value === undefined && !hydrated.has(storeName)) {
    reportLazyMiss(storeName, key, 'snapshotGet')
    return defaultValue
  }

  return value === undefined ? defaultValue : value
}

/** Synchronous has-check from the in-memory snapshot -- same D-04/D-08 gating as `snapshotGet`. */
export function snapshotHas(storeName: string, key: string): boolean {
  if (!isAllowedStoreField(storeName, key)) return false

  const found = getAtPath(snapshot[storeName], key) !== undefined
  if (!found && !hydrated.has(storeName)) {
    reportLazyMiss(storeName, key, 'snapshotHas')
    return false
  }

  return found
}

/**
 * WR-03 (Phase 29 code review): the write pair must be gated by the SAME allow-list as
 * `snapshotGet`/`snapshotHas`. Ungated, a write to a non-allow-listed field updated the
 * renderer's snapshot optimistically, was rejected by sidecar guard (c) with a stderr
 * line the renderer never sees, and the UI then showed a saved value that was not on
 * disk until restart — 29-RESEARCH Pitfall 1 reproduced in a new location, and silent
 * data loss for any future `StoreStructure` field added without a matching
 * `STORE_ALLOWLIST` entry. Rejection now warns in the RENDERER, where the caller is.
 */
function rejectSnapshotWrite(forCall: string, storeName: string, key: string): void {
  console.warn(
    `${forCall}: blocked write of "${key}" to "${storeName}" -- not in the Tauri ` +
      'store-field allow-list; the sidecar would reject it, so the local snapshot is ' +
      'deliberately NOT updated optimistically'
  )
}

/**
 * Optimistically updates the local snapshot (so an immediate synchronous read after a set
 * observes it, electron-store parity) and forwards the write to the sidecar asynchronously.
 */
export function snapshotSet(storeName: string, key: string, value?: unknown): void {
  // WR-04: the WRITE predicate, strictly narrower than the read predicate.
  if (!isWritableStoreField(storeName, key)) {
    rejectSnapshotWrite('snapshotSet', storeName, key)
    return
  }
  if (!snapshot[storeName]) snapshot[storeName] = {}
  // CR-03: nested write, mirroring `getAtPath`'s nested read.
  setAtPath(snapshot[storeName], key, value)
  send('storeSet', [storeName, key, value])
}

/** Deletes locally and forwards the delete to the sidecar asynchronously. */
export function snapshotDelete(storeName: string, key: string): void {
  // WR-04: the WRITE predicate, strictly narrower than the read predicate.
  if (!isWritableStoreField(storeName, key)) {
    rejectSnapshotWrite('snapshotDelete', storeName, key)
    return
  }
  // CR-03: nested delete, mirroring `getAtPath`'s nested read.
  if (snapshot[storeName]) deleteAtPath(snapshot[storeName], key)
  send('storeDelete', [storeName, key])
}
