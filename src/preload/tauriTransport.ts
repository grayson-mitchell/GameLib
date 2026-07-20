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
 * This module has NO import from 'electron' (or any other Node-only package) -- it is safe
 * to be part of the Tauri renderer's own JS bundle (unlike `ipc.ts`/`misc.ts`, which keep
 * their Node/Electron access behind a lazily-invoked, guarded `require()` for the same
 * reason -- see those files' own comments).
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event'
import {
  SIDECAR_INVOKE,
  SIDECAR_SEND,
  SIDECAR_STORE_SNAPSHOT,
  FRONTEND_MESSAGE_EVENT
} from 'common/types/sidecarTransport'

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
 * Mirrors `makeHandlerInvoker`'s req/resp shape: `invoke(channel, args) -> Promise<Ret>`.
 * Relayed by the Rust shell's `sidecar_invoke` command to the sidecar's stdio JSON-RPC loop.
 */
export async function invoke<Ret = unknown>(
  channel: string,
  args: unknown[]
): Promise<Ret> {
  return tauriInvoke<Ret>(SIDECAR_INVOKE, { channel, args })
}

/**
 * Mirrors `makeListenerCaller`'s fire-and-forget shape: `send(channel, args)`.
 * Relayed by the Rust shell's `sidecar_send` command; no response is awaited.
 */
export function send(channel: string, args: unknown[]): void {
  void tauriInvoke(SIDECAR_SEND, { channel, args })
}

/**
 * Mirrors `frontendListenerSlot`'s backend->frontend push shape: `listen(channel, cb) ->
 * unsubscribe`. The Rust shell re-emits every `SidecarNotification` the sidecar pushes as a
 * single `FRONTEND_MESSAGE_EVENT` Tauri event carrying `{channel, args}`; filter by channel
 * here since the sidecar multiplexes every backend->frontend push over that one event name.
 */
export function listen(
  channel: string,
  callback: (...args: unknown[]) => void
): () => void {
  let unlisten: UnlistenFn | undefined
  let cancelled = false

  void tauriListen<{ channel: string; args: unknown[] }>(
    FRONTEND_MESSAGE_EVENT,
    (event) => {
      if (event.payload.channel === channel) {
        callback(...event.payload.args)
      }
    }
  ).then((fn) => {
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
 * T-10-12 / WR-09 / T-27-06: mirror `misc.ts`'s `SECRET_STORE_KEYS` deny-list verbatim so a
 * compromised renderer script cannot exfiltrate a credential via the synchronous snapshot
 * path either. Defense in depth -- the sidecar's `SIDECAR_STORE_SNAPSHOT` handler must also
 * never include these keys in the payload it returns (a later plan's concern; this deny-list
 * holds regardless of what the sidecar sends).
 */
const SECRET_STORE_KEYS: Record<string, readonly string[]> = {
  humbleConfigStore: ['sessionCookie'],
  steamConfigStore: ['refreshToken']
}

const isSecretStoreKey = (storeName: string, key: string) =>
  (SECRET_STORE_KEYS[storeName] ?? []).some(
    // electron-store supports dot-notation paths -- block subpath reads too.
    (secret) => key === secret || key.startsWith(`${secret}.`)
  )

/** Registers a store name so snapshotGet/snapshotHas know to look for it (mirrors storeNew). */
export function registerStore(storeName: string): void {
  if (!snapshot[storeName]) {
    snapshot[storeName] = {}
  }
}

/**
 * Calls the `SIDECAR_STORE_SNAPSHOT` Tauri command once and fills the in-memory snapshot
 * map. Must be awaited before React mounts (index.tsx) -- the Steam login-gate
 * (GlobalState.tsx:238) and the CacheStore reads (GlobalState.tsx:178/203) read
 * synchronously during GlobalState's constructor. Skeleton scope: `configStore` +
 * `steamConfigStore` (27-CONTEXT "Claude's discretion" -- the two stores the skeleton's
 * read flow touches).
 */
export async function hydrateStoreSnapshot(): Promise<void> {
  const result = await tauriInvoke<StoreSnapshot>(SIDECAR_STORE_SNAPSHOT)
  for (const [storeName, values] of Object.entries(result ?? {})) {
    snapshot[storeName] = { ...(snapshot[storeName] ?? {}), ...values }
  }
}

function getAtPath(
  obj: Record<string, unknown> | undefined,
  key: string
): unknown {
  if (!obj) return undefined
  // electron-store dot-notation parity (misc.ts's storeGet supports subpaths).
  return key.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment]
    }
    return undefined
  }, obj)
}

/** Synchronous read from the hydrated snapshot -- proven in Task 3. */
export function snapshotGet(
  storeName: string,
  key: string,
  defaultValue?: unknown
): unknown {
  if (isSecretStoreKey(storeName, key)) {
    console.warn(
      `snapshotGet: blocked read of credential key "${key}" from "${storeName}"`
    )
    return undefined
  }
  const value = getAtPath(snapshot[storeName], key)
  return value === undefined ? defaultValue : value
}

/** Synchronous has-check from the hydrated snapshot. */
export function snapshotHas(storeName: string, key: string): boolean {
  if (isSecretStoreKey(storeName, key)) return false
  return getAtPath(snapshot[storeName], key) !== undefined
}

/**
 * Optimistically updates the local snapshot (so an immediate synchronous read after a set
 * observes it, electron-store parity) and forwards the write to the sidecar asynchronously.
 */
export function snapshotSet(storeName: string, key: string, value?: unknown): void {
  if (!snapshot[storeName]) snapshot[storeName] = {}
  snapshot[storeName][key] = value
  send('storeSet', [storeName, key, value])
}

/** Deletes locally and forwards the delete to the sidecar asynchronously. */
export function snapshotDelete(storeName: string, key: string): void {
  if (snapshot[storeName]) delete snapshot[storeName][key]
  send('storeDelete', [storeName, key])
}
