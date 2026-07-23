/**
 * Sidecar transport contract (Phase 27 — Tauri walking skeleton).
 *
 * Single source of truth for the JSON-RPC framing shared by the three legs of the
 * Tauri rearchitecture:
 *   - the Rust shell (27-01, `src-tauri/src/main.rs`) — spawns the sidecar, relays frames;
 *   - the Node sidecar RPC server (27-02) — the existing backend behind a stdio JSON-RPC loop;
 *   - the renderer bridge (27-03, `src/preload/ipc.ts` factories re-pointed onto Tauri commands).
 *
 * Framing decision (per 27-CONTEXT "Claude's discretion"): stdio JSON-RPC over the
 * parent↔child pipe, NOT a loopback TCP port. Rationale (threat T-27-01): Wine on macOS
 * shares the host network namespace, so a loopback port would be reachable by bottled
 * processes; a private stdio pipe is not.
 *
 * The contract preserves the exact call/return shapes of the three preload factories in
 * `src/preload/ipc.ts` so the 379 `window.api.*` call-sites never change:
 *   - makeHandlerInvoker(channel) → invoke(channel, ...args) → Promise<Ret>  (req/resp)
 *   - makeListenerCaller(channel) → send(channel, ...args)                   (fire-and-forget)
 *   - frontendListenerSlot(channel) → on(channel, listener) → unsubscribe    (backend→frontend push)
 *
 * This module is TYPES + CONSTANTS ONLY. It must contain no runtime logic and must not
 * import from 'electron' — it is imported by the renderer, the sidecar, and (as the naming
 * reference) the Rust shell.
 */

/**
 * Discriminates the four request kinds that can cross the transport.
 * - 'invoke'       → req/resp (maps to the old `ipcRenderer.invoke`)
 * - 'send'         → fire-and-forget (maps to the old `ipcRenderer.send`)
 * - 'openExternal' → the `shell.openExternal` parity path (steam:// opens via tauri-plugin-opener)
 * - 'rustInvoke'   → sidecar→Rust req/resp (Phase 28 D-05). Direction asymmetry: `rustInvoke`
 *   frames only ever travel sidecar→Rust; the Rust shell must never send a `rustInvoke`
 *   request INTO the sidecar, which is why `isValidRequest()` in sidecarRpc.ts deliberately
 *   does NOT accept it as an inbound kind (T-28-03b).
 */
export type SidecarRpcKind = 'invoke' | 'send' | 'openExternal' | 'rustInvoke'

/**
 * A request frame written from the Rust shell to the sidecar's stdin (one JSON object per line).
 *
 * `id` is ALWAYS a string — Steam uses 64-bit ids and JavaScript numbers cannot hold them
 * without precision loss, so every id crosses the wire as a decimal/opaque string.
 *
 * `channel` is the IPC channel name (a key of AsyncIPCFunctions / SyncIPCFunctions), preserved
 * verbatim from the existing preload contract. `args` mirror the channel's parameter tuple.
 */
export interface SidecarRpcRequest {
  /** Correlation id for matching the response. String-safe for 64-bit values. */
  id: string
  /** Which transport verb this frame represents. */
  kind: SidecarRpcKind
  /** The IPC channel name (or, for 'openExternal', the parity command target). */
  channel: string
  /** The channel's argument tuple, forwarded unchanged. */
  args: unknown[]
}

/**
 * A response frame written from the sidecar's stdout back to the Rust shell, correlated by `id`.
 *
 * `ok` is the success discriminant: on `true`, `result` holds the resolved value (mirrors the
 * Promise returned by `makeHandlerInvoker`); on `false`, `error` holds a serialized error message.
 * Only 'invoke' requests produce a response; 'send' and 'openExternal' are fire-and-forget.
 */
export interface SidecarRpcResponse {
  /** Correlation id matching the originating SidecarRpcRequest. */
  id: string
  /** Success discriminant. */
  ok: boolean
  /** Present when `ok` is true — the resolved invoke result. */
  result?: unknown
  /** Present when `ok` is false — a serialized error message. */
  error?: string
}

/**
 * An unsolicited notification frame the sidecar pushes to the Rust shell (backend→frontend push),
 * which the shell re-emits to the webview as the FRONTEND_MESSAGE_EVENT Tauri event.
 *
 * This is the transport form of the old `ipcRenderer.on(channel, listener)` backend push
 * (`frontendListenerSlot`). It carries no `id` because it is not a reply to any request.
 */
export interface SidecarNotification {
  /** Notification discriminant — the only kind in the skeleton is a frontend message push. */
  kind: 'frontendMessage'
  /** The FrontendMessages channel name the renderer listener is keyed on. */
  channel: string
  /** The push payload tuple, forwarded unchanged to the renderer listener. */
  args: unknown[]
}

/**
 * Sentinel line the sidecar prints to stdout exactly once, after it has installed its Electron
 * shims and finished importing the backend modules, to signal the Rust shell that it is ready to
 * accept request frames. The shell must not write requests before observing this line.
 */
export const READY_SENTINEL = '__GAMELIB_SIDECAR_READY__' as const

/**
 * Tauri command name the renderer invokes for a req/resp `invoke` call.
 * The Rust `#[command]` of the same (snake_case) name writes a SidecarRpcRequest{kind:'invoke'}
 * and awaits the matching SidecarRpcResponse by id.
 */
export const SIDECAR_INVOKE = 'sidecar_invoke' as const

/**
 * Tauri command name the renderer invokes for a fire-and-forget `send` call.
 * Writes a SidecarRpcRequest{kind:'send'}; no response is awaited.
 */
export const SIDECAR_SEND = 'sidecar_send' as const

/**
 * Tauri command name for the `shell.openExternal` parity path (steam:// opens).
 * The Rust `#[command]` shells the URL through tauri-plugin-opener.
 */
export const OPEN_EXTERNAL = 'open_external' as const

/**
 * Tauri command name for the renderer's synchronous store snapshot bridge.
 * Returns the minimal store snapshot the skeleton read path needs (electron-store parity),
 * so the renderer's synchronous `configStore`-style reads resolve without a round-trip per key.
 */
export const SIDECAR_STORE_SNAPSHOT = 'sidecar_store_snapshot' as const

/**
 * SidecarRpcKind discriminant for the sidecar→Rust request/response channel (Phase 28 D-05).
 * Direction asymmetry: `rustInvoke` frames only ever travel sidecar→Rust; the Rust shell
 * must never send a `rustInvoke` request INTO the sidecar (T-28-03b) — see SidecarRpcKind's
 * own doc comment above.
 */
export const RUST_INVOKE_KIND = 'rustInvoke' as const

/** Rust-side channel name: read the Steam refresh token from the OS Keychain via `keyring`. */
export const RUST_KEYRING_GET = 'keyring_get' as const

/** Rust-side channel name: write the Steam refresh token to the OS Keychain via `keyring`. */
export const RUST_KEYRING_SET = 'keyring_set' as const

/** Rust-side channel name: delete the Steam refresh token entry from the OS Keychain. */
export const RUST_KEYRING_DELETE = 'keyring_delete' as const

/** Rust-side channel name: probe Keychain availability without assuming a static answer. */
export const RUST_KEYRING_AVAILABLE = 'keyring_available' as const

/**
 * Rust-side channel name: open a native folder-picker dialog via the Tauri dialog plugin
 * (Phase 30 Plan 03, D-09/REQ-30-07). Takes no path argument from the caller — the picked
 * path comes FROM the OS dialog, never INTO it (T-30-11). Resolves the picked absolute path
 * as a string, or `null` on cancel.
 */
export const RUST_DIALOG_OPEN = 'dialog_open' as const

/**
 * Rust-side channel name: show a native message/error dialog via the Tauri dialog plugin
 * (Phase 31 Plan 02, D-03/REQ-31-03/REQ-31-05). Backs both `dialog.showMessageBox` and
 * `dialog.showErrorBox` (the latter forwards with an error `kind`). Resolves the underlying
 * `blocking_show()` bool result — electronStub maps `true`→`response:0`, `false`→`response:1`;
 * there is no v2 checkbox-return equivalent (documented accepted gap, zero real callers read
 * `checkboxChecked`).
 */
export const RUST_DIALOG_MESSAGE = 'dialog_message' as const

/**
 * Rust-side channel name: open a native save-file dialog via the Tauri dialog plugin
 * (Phase 31 Plan 02, D-03/REQ-31-03). Resolves the picked absolute path as a string, or `null`
 * on cancel — the same `Option<FilePath>` shape as `RUST_DIALOG_OPEN`.
 */
export const RUST_DIALOG_SAVE = 'dialog_save' as const

/**
 * Rust-side channel name: show a real OS notification via `tauri-plugin-notification`
 * (Phase 33 Plan 04, D-05). Backs `electronStub.ts`'s `Notification.show()`. Takes a single
 * `{ title?, body? }` object arg; resolves `Value::Null` on success. No icon/nativeImage
 * plumbing (33-RESEARCH confirmed the plugin's icon param is optional).
 */
export const RUST_NOTIFICATION_SHOW = 'notification_show' as const

/**
 * Single source of truth for the sidecar→Rust `rustInvoke` channel allowlist (T-28-03).
 * `requestRustInvoke()` in sidecarRpc.ts refuses to emit a frame for any channel not listed
 * here. Must be kept in sync with Rust's `dispatch_rust_channel` match arms (plan 28-02).
 */
export const RUST_INVOKE_CHANNELS = [
  RUST_KEYRING_GET,
  RUST_KEYRING_SET,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_AVAILABLE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_SAVE,
  RUST_NOTIFICATION_SHOW
] as const

/** The set of channel names `requestRustInvoke()` is allowed to target. */
export type RustInvokeChannel = (typeof RUST_INVOKE_CHANNELS)[number]

/**
 * Marker prefixed to the `error` of any invoke response rejected solely because the channel
 * has no handler registered in the sidecar — i.e. one of the ~217 endpoints this phase
 * deliberately leaves unported (see SEAM.md § Deferred), NOT a malfunction.
 *
 * This distinction is load-bearing for the renderer. Much of the existing frontend invokes
 * channels at module scope with an uncaught `.then()` (e.g.
 * `frontend/state/UploadedLogFiles.ts` → `getUploadedLogFiles()`), which under Electron can
 * never reject because every handler exists. Against the skeleton sidecar those same calls
 * reject and surface as unhandled rejections at boot. Without this marker the renderer
 * cannot tell them apart from a genuine bootstrap failure, and the on-page error surface
 * hijacks the whole page for what is really an expected, documented seam gap.
 *
 * Rejection semantics are deliberately preserved (the promise still rejects, honestly) —
 * this only classifies the reason.
 */
export const UNPORTED_CHANNEL_MARKER = '[GAMELIB_UNPORTED_CHANNEL]' as const

/**
 * Tauri event name the Rust shell emits to the webview for every SidecarNotification it reads
 * from the sidecar's stdout. The renderer bridge (27-03) subscribes via Tauri `listen` and
 * dispatches to the per-channel listeners registered through `frontendListenerSlot`.
 */
export const FRONTEND_MESSAGE_EVENT = 'frontend_message' as const

/**
 * Store channel constants (Phase 29 Plan 03, D-12) — generalizes the sidecar store beyond
 * the two skeleton stores (`configStore`/`steamConfigStore`). These are wire-protocol
 * literals; changing any value below is a breaking change to whichever side (renderer or
 * sidecar) is not updated in lockstep.
 */

/**
 * `send`-kind (fire-and-forget) channel name for a single-key store write. ALREADY emitted
 * by `tauriTransport.ts`'s `snapshotSet()` (`send('storeSet', [storeName, key, value])`) —
 * this constant must match that literal exactly, or the renderer's existing writes silently
 * orphan. Until plan 29-05 registers a sidecar-side listener for this channel, these frames
 * vanish into an empty listener array with ZERO signal (29-RESEARCH Pitfall 1) — worse than
 * an unported `invoke`, which at least rejects with `UNPORTED_CHANNEL_MARKER`.
 */
export const STORE_SET_CHANNEL = 'storeSet' as const

/**
 * `send`-kind (fire-and-forget) channel name for a single-key store delete. ALREADY emitted
 * by `tauriTransport.ts`'s `snapshotDelete()` (`send('storeDelete', [storeName, key])`) —
 * must match that literal exactly. Same unlistened-frame risk as `STORE_SET_CHANNEL` until
 * plan 29-05 wires a listener.
 */
export const STORE_DELETE_CHANNEL = 'storeDelete' as const

/**
 * `send`-kind (fire-and-forget) channel name for registering a new store (mirrors
 * `misc.ts`'s `storeNew` / `tauriTransport.ts`'s `registerStore()`). Same unlistened-frame
 * risk as `STORE_SET_CHANNEL`/`STORE_DELETE_CHANNEL` until plan 29-05 wires a listener.
 */
export const STORE_NEW_CHANNEL = 'storeNew' as const

/**
 * `invoke`-kind INTERNAL RPC channel, ridden over the existing `SIDECAR_INVOKE`
 * (`sidecar_invoke`) Tauri command, for D-03's lazy per-store hydrate: the renderer fetches
 * one `LAZY_STORES` store's filtered snapshot on first access instead of every store being
 * eagerly hydrated at boot. This is NOT a new Tauri command and requires no Rust change —
 * it is dispatched exactly like any other sidecar RPC channel name.
 */
export const STORE_FETCH_CHANNEL = 'sidecar:store-fetch' as const

/**
 * Mirrors `src-tauri/src/main.rs`'s own snapshot-channel constant. DISTINCT from
 * `SIDECAR_STORE_SNAPSHOT` (the renderer-facing Tauri COMMAND name the renderer invokes to
 * request the snapshot) — this is the internal sidecar-side channel identifier for the same
 * concept. Do not change either value; they are two different layers of the same feature,
 * not synonyms of one another.
 */
export const STORE_SNAPSHOT_CHANNEL = 'sidecar:store-snapshot' as const

/**
 * `frontendMessage` push channel (D-06) carrying a single `StoreChangedPayload` argument,
 * so the renderer's local snapshot cache can be kept in sync when a store value changes on
 * the sidecar side without the renderer having written it itself. `pushFrontendMessage(channel,
 * ...args)` and `main.rs`'s reader are already generic over the channel name (see
 * `SidecarNotification` above), so wiring this channel requires ZERO Rust changes.
 */
export const STORE_CHANGED_CHANNEL = 'storeChanged' as const

/**
 * D-04's distinct, greppable warning marker for a lazy-store read that missed the
 * synchronous snapshot (i.e. resolved to `undefined`/a stale default) and then
 * self-corrected once the async `STORE_FETCH_CHANNEL` round-trip completed. Modelled on
 * `UNPORTED_CHANNEL_MARKER` above. Deliberately NOT folded into generic logging — a
 * silently-wrong-then-self-correcting read is only diagnosable from a log line carrying
 * this exact marker.
 */
export const STORE_LAZY_MISS_MARKER = '[GAMELIB_STORE_LAZY_MISS]' as const

/**
 * Payload shape for a `STORE_CHANGED_CHANNEL` push. `key` is the top-level (or dot-notation)
 * field that changed; `value` is present on a set, `deleted` is `true` on a delete.
 */
export interface StoreChangedPayload {
  store: string
  key: string
  value?: unknown
  deleted?: boolean
}
