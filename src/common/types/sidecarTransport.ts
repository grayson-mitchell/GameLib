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
 * import the electron package — it is imported by the renderer, the sidecar, and (as the
 * naming reference) the Rust shell.
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
 *
 * Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
 * flagged the previously-exported form as a used-in-module finding -- there
 * is no external consumer, so the export served no purpose).
 */
type SidecarRpcKind = 'invoke' | 'send' | 'openExternal' | 'rustInvoke'

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
 * Channel name carried by the sidecar's `openExternal` frame (the `shell.openExternal` parity
 * path, steam:// opens). It is not a Tauri command: the Rust command of this name was removed in
 * Phase 83 plan 06 (D-17), and the shell reads the frame in `sidecar.rs` and opens the URL
 * through tauri-plugin-opener after the scheme check.
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

/**
 * Frame `kind` of the sidecar's log frames (Phase 84, FND-05): a batch of log entries the sidecar
 * forwards on stdout for the Rust shell to write (`src-tauri/src/sidecar.rs`'s `LOG_FRAME_KIND`; a
 * Rust test pins the pair). Direction: sidecar to Rust only. The shell validates every frame
 * (closed sets, caps, no paths) and rejects a bad one whole; the shared vectors are
 * `src/common/__fixtures__/logFrameVectors.json`.
 */
export const LOG_FRAME_KIND = 'log' as const

/**
 * Frame `kind` of the sidecar's store writes (Phase 85, FND-06): one ordered frame per store write
 * the sidecar's mirror of a Rust-owned store makes, sent on stdout and applied by the shell's single
 * store worker in arrival order (`src-tauri/src/store_dispatch.rs`'s `STORE_FRAME_KIND`; the
 * generated `ipc_contract.rs` carries the same literal). Direction: sidecar to Rust only. Values
 * travel as JSON text (`valueJson`) so nested key order survives. The shell validates every frame
 * and refuses a bad one whole; the shared vectors are `src/common/__fixtures__/storeFrameVectors.json`.
 */
export const STORE_FRAME_KIND = 'store' as const

/**
 * `send`-kind channel the Rust shell fires into the sidecar after it handles a store frame
 * (Phase 85, FND-06): `{store, rev, op: 'applied' | 'refused' | 'flushed', originSeq, reason?}`, one
 * per frame, in apply order. The sidecar's mirror uses it to move an op from `pending` to its base
 * or to drop a refused one. Shell to sidecar only; like `SHELL_WINDOW_FOCUSED` it has no preload
 * call site and no renderer caller.
 */
export const STORE_MIRROR_EVENT_CHANNEL = 'storeMirrorEvent' as const

/** Which game log a game target names. Moved here from `backend/logger/paths.ts`. */
export type GameLogType =
  | 'launch'
  | 'install'
  | 'import'
  | 'repair'
  | 'update'
  | 'setup'

/** A typed log target: never a path, the shell resolves the file. */
export type LogFrameTarget =
  | { kind: 'general' }
  | { kind: 'gogRedist' }
  | { kind: 'runner'; runner: string }
  | { kind: 'game'; appName: string; runner: string; type: GameLogType }

/**
 * One entry: a structured line (the shell formats it from `ts` epoch milliseconds and `tz` minutes
 * east of UTC taken at call time) or a raw chunk of child output (written as is).
 */
export type LogFrameEntry =
  | {
      line: {
        ts: number
        tz: number
        level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'
        prefix: string
        msg: string
      }
    }
  | { raw: string }

/** The entries one writer sent for one target; `rotate` is true on a non-general writer's first. */
export interface LogFrameBatch {
  target: LogFrameTarget
  rotate: boolean
  entries: LogFrameEntry[]
}

/** The `kind:"log"` stdout frame. */
export interface LogFrame {
  kind: typeof LOG_FRAME_KIND
  batch: LogFrameBatch[]
}

/**
 * Rust-side channel name: read the Steam refresh token from the OS Keychain via `keyring`.
 *
 * 34.4.1 gap cycle 2 plan 26 (F-9 observability half, REQ-34.4.1-GAP-01/REQ-34.4.1-GAP-11): the
 * Rust-side arm bounds its own Keychain read at `KEYRING_READ_TIMEOUT` (`src-tauri/src/main.rs`)
 * and rejects with the classified `keyring:timeout` error string when that bound is exceeded —
 * well before this file's own `RUST_INVOKE_TIMEOUT_MS` (60s) generic RPC timeout would otherwise
 * fire. Seeing `keyring:timeout` for this channel is the EXPECTED, better-behaved outcome of a
 * blocked Keychain read (e.g. an unanswered Allow/Deny prompt); seeing the generic `rustInvoke
 * timed out after 60000ms: keyring_get` message for this channel AFTER this plan means something
 * else is wrong (the Rust-side bound itself failed to fire), not that the underlying Keychain
 * call is slow.
 */
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
 * `blocking_show()` bool result — platformApi maps `true`→`response:0`, `false`→`response:1`;
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
 * (Phase 33 Plan 04, D-05). Backs `platform/index.ts`'s `Notification.show()`. Takes a single
 * `{ title?, body? }` object arg; resolves the backend label (see
 * `RustNotificationBackendLabel`) on success; an older shell resolves null. No icon/nativeImage
 * plumbing (33-RESEARCH confirmed the plugin's icon param is optional).
 */
export const RUST_NOTIFICATION_SHOW = 'notification_show' as const

/**
 * Mirrors `notification_backend::backend_label` / `user_notifications_label` in the Rust shell.
 * The UserNotifications form carries the settings read on the same call, e.g.
 * `user-notifications;auth=provisional;alert=disabled;style=none` (52-REVIEW WR-01); acceptance
 * is not proof of display. A shell that predates WR-01 resolves the bare `'user-notifications'`.
 */
// Exported as the TS record of the Rust contract; the sidecar treats the label as an opaque string
/** @public exported as the TS record of the Rust contract; the sidecar treats the label as an opaque string. */
export type RustNotificationBackendLabel =
  | 'user-notifications'
  | `user-notifications;${string}`
  | 'plugin'

/**
 * Prefix of the `notification_show` rejection when macOS notification authorization is denied.
 * Mirrors the Rust `authorization_gate` contract in `src-tauri/src/notification_backend.rs`;
 * the sidecar matches it with `startsWith`. The other four prefixes the arm can return
 * (`notification:authorization-not-determined`, `notification:settings-timeout`,
 * `notification:delivery-failed: <reason>`, `notification:delivery-timeout`) need no constant,
 * because only a denial changes TS behaviour (it is logged once per process).
 */
export const RUST_NOTIFICATION_AUTH_DENIED_PREFIX =
  'notification:authorization-denied' as const

/**
 * Rust-side channel name: reveal a path in the OS file manager via `tauri-plugin-opener`'s
 * `reveal_item_in_dir` (Phase 33 Plan 04, D-05). Backs `platform/index.ts`'s
 * `shell.showItemInFolder()`. Fire-and-forget from the caller's perspective (platformApi does
 * not await it), but a real request/response `rustInvoke` frame under the hood so failures are
 * observable (logged), never silent.
 */
export const RUST_SHELL_SHOW_ITEM_IN_FOLDER =
  'shell_show_item_in_folder' as const

/**
 * Rust-side channel name: open a path with the default (or specified) program via
 * `tauri-plugin-opener`'s `open_path` (Phase 33 Plan 04, D-05). Backs `platform/index.ts`'s
 * `shell.openPath()`. Mirrors real Electron's `shell.openPath` contract: resolves an empty
 * string on success, or a human-readable error string on failure — never rejects.
 */
export const RUST_SHELL_OPEN_PATH = 'shell_open_path' as const

/**
 * Rust-side channel name: exit the real Tauri process via `AppHandle::exit()` (Phase 33 Plan 04,
 * D-05 app lifecycle essentials). Backs `platform/index.ts`'s `app.exit()`/`app.quit()`. The two
 * sidecar-reachable call sites (`resetHeroic()`, the `handleExit`-shaped uninstall/quit path) are
 * both deliberate user/exit actions (T-33-12, accepted DoS disposition).
 */
export const RUST_APP_EXIT = 'app_exit' as const

/**
 * Rust-side channel name: restart the real Tauri process via `AppHandle::restart()` (Phase 33
 * Plan 04, D-05 app lifecycle essentials). Backs `platform/index.ts`'s `app.relaunch()`.
 */
export const RUST_APP_RELAUNCH = 'app_relaunch' as const

/**
 * Rust-side channel name: hide the real Tauri application via `AppHandle::hide()`
 * (quick/260815-vvz). Backs `platform/index.ts`'s `app.hide()` — the yield-fallback
 * `raiseFrontmostBottledProcess` (Steam bottle install/uninstall, bottle.ts) reaches
 * when no matching installer/uninstaller window could be raised within ~18s, so
 * GameLib at least steps aside instead of staying in front of an invisible dialog.
 * No-op off macOS by design (`AppHandle::hide()` does not exist there) — exact parity
 * with real Electron's own `app.hide()`, which is macOS-only.
 */
export const RUST_APP_HIDE = 'app_hide' as const

/**
 * Rust-side channel name: bring the main GameLib window to the front
 * (`unminimize()` + `show()` + `set_focus()`). Backs `platform/index.ts`'s
 * `app.raiseMainWindow()`, called before a bridge-notice dialog so a failure
 * that happens while a game is in front is not rendered into a hidden window.
 * Callers: the bridge notice, and `app.raiseMainWindowIfHiddenByGameLib()` (quick
 * 261108-kpc), which every dialog path runs first so a dialog is never rendered into a window
 * GameLib itself hid for a launch. On macOS the
 * arm also requests Critical user attention as a fallback (Dock bounce) when
 * activation is declined with a game frontmost.
 * Takes no args; resolves null. Never called for unrelated dialogs.
 */
export const RUST_MAIN_WINDOW_RAISE = 'main_window_raise' as const

/**
 * Rust-side channel name: hide GameLib for a game launch (quick 261108-kpc). macOS uses
 * `AppHandle::hide()` (Cmd+H semantics; a Dock click restores it), other platforms hide the
 * main window (tray Show / relaunch restores it). Callers: the launch-time hide in
 * `protocol.ts`, `launcher.ts` and `steamFlowRegistration.ts`, via `app.hideMainWindow()`.
 * Takes no args; resolves null.
 */
export const RUST_MAIN_WINDOW_HIDE = 'main_window_hide' as const

/**
 * Rust-side channel name: bring Steam's own window forward on Windows. Backs the adoption note's
 * "Open Steam" (`openSteamForAdoption`): a signed-out Steam holds `steam://open/main` until login
 * finishes (measured in Steam's console_log), so the URL cannot raise the sign-in window. The shell
 * is the foreground process at click time, so it raises the window itself (restore if minimized,
 * then `SetForegroundWindow`). Picks the topmost visible, unowned, titled top-level window owned by
 * `steam.exe` or `steamwebhelper.exe`. Takes no args; resolves a boolean: `true` when a Steam window
 * was found and brought forward, `false` when none was (Steam not running or hidden to the tray)
 * or on any other OS (the arm is a no-op off Windows).
 */
export const RUST_STEAM_WINDOW_RAISE = 'steam_window_raise' as const

/**
 * Rust-side channel name: write text to the OS clipboard via `tauri-plugin-clipboard-manager`
 * (Phase 34.3 Plan 03, D-01/D-02). Backs `platform/index.ts`'s `clipboard.writeText()`.
 * Fire-and-forget from the caller's perspective (D-03, mirrors real Electron's void-returning
 * API), but a real request/response `rustInvoke` frame under the hood so failures are
 * observable (logged), never silent.
 */
export const RUST_CLIPBOARD_WRITE_TEXT = 'clipboard_write_text' as const

/**
 * Rust-side channel name: read text from the OS clipboard via
 * `tauri-plugin-clipboard-manager` (Phase 34.3 Plan 03, D-01/D-02). Backs the sidecar's
 * `clipboardReadText` handler, which awaits this directly rather than going through
 * `platform/index.ts`'s deliberately-dead synchronous `clipboard.readText()` stub (D-04).
 */
export const RUST_CLIPBOARD_READ_TEXT = 'clipboard_read_text' as const

/**
 * Rust-side channel name: swap the real Tauri tray's icon (Phase 34.1 Plan 06, D-11; tri-state
 * since quick 260930-lyk). Backs the sidecar's `changeTrayColor` registration
 * (`appShellFlowRegistration.ts`), which reads `trayIconVariant` from `GlobalConfig` (migrated
 * from the legacy `darkTrayIcon`) and forwards it here. Takes a single
 * `{ variant: 'auto' | 'light' | 'dark' }` object arg, built by `trayIconWireArgs` and pinned by
 * `meta/fixtures/tray-set-icon-wire-args.json`; resolves `Value::Null` whether or not
 * a tray currently exists (a missing tray is not an error condition — it may have legitimately
 * failed to build at startup). This is the ONLY new `dispatch_rust_channel` arm added across the
 * entire Phase 34.1 slice (D-01 keeps window chrome renderer-side, with zero new Rust arms).
 */
export const RUST_TRAY_SET_ICON = 'tray_set_icon' as const

/**
 * Rust-side channel name: take an OS power assertion (Phase 35 Plan 08, D-08, REQ-35-06).
 * Backs `platform/index.ts`'s `powerSaveBlocker.start()`, which until Phase 35 was a logged no-op
 * returning `-1` and holding nothing — so the machine idle-slept mid depot download and
 * `launcher.ts`'s `prevent-display-sleep` did nothing while a game ran.
 *
 * Takes ONE string arg, which must be exactly one of Electron's own two kind strings:
 * `'prevent-display-sleep'` (a game is running) or `'prevent-app-suspension'` (a download is in
 * progress). The Rust side REJECTS any other value rather than defaulting to one of them — a
 * silent default is how the two assertion kinds get collapsed, which would either let the screen
 * blank during play or hold the display awake through an eight-hour download (threat T-35-32).
 *
 * Resolves a `number`: the id that releases exactly this assertion via {@link RUST_WAKE_LOCK_STOP}.
 */
export const RUST_WAKE_LOCK_START = 'wake_lock_start' as const

/**
 * Rust-side channel name: release the OS power assertion a {@link RUST_WAKE_LOCK_START} call
 * created (Phase 35 Plan 08, D-08, REQ-35-06). Backs `platform/index.ts`'s `powerSaveBlocker.stop()`.
 *
 * Takes ONE numeric arg: the id `wake_lock_start` resolved. Rejects an unknown or
 * already-released id rather than silently succeeding, so a mismatch is observable — an
 * assertion that is never released outlives the app and keeps the machine awake with no UI left
 * to stop it (threat T-35-31).
 */
export const RUST_WAKE_LOCK_STOP = 'wake_lock_stop' as const

/**
 * Rust-side channel name: Phase 63 (D-03) executable scanner `scan_steam_api_imports`, a pass-through to the
 * Tauri-free `gamelib-scan` crate (the same dispatch `gamelib-scan-cli` uses).
 *
 * Takes ONE object arg (`{ exePath, appId }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `SteamApiImportScanResult` (see `backend/scanners/scanTypes.ts`). Bad args reject
 * `scan_steam_api_imports:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_SCAN_STEAM_API_IMPORTS = 'scan_steam_api_imports' as const

/**
 * Rust-side channel name: Phase 63 (D-03) executable scanner `scan_steam_drm`, a pass-through to the
 * Tauri-free `gamelib-scan` crate (the same dispatch `gamelib-scan-cli` uses).
 *
 * Takes ONE object arg (`{ exePath }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `SteamDrmScanResult` (see `backend/scanners/scanTypes.ts`). Bad args reject
 * `scan_steam_drm:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_SCAN_STEAM_DRM = 'scan_steam_drm' as const

/**
 * Rust-side channel name: Phase 63 (D-03) executable scanner `scan_steamstub_section`, a pass-through to the
 * Tauri-free `gamelib-scan` crate (the same dispatch `gamelib-scan-cli` uses).
 *
 * Takes ONE object arg (`{ exePath }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `SteamstubSectionResult` (see `backend/scanners/scanTypes.ts`). Bad args reject
 * `scan_steamstub_section:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_SCAN_STEAMSTUB_SECTION = 'scan_steamstub_section' as const

/**
 * Rust-side channel name: Phase 63 (D-03) executable scanner `scan_pe_imported_dlls`, a pass-through to the
 * Tauri-free `gamelib-scan` crate (the same dispatch `gamelib-scan-cli` uses).
 *
 * Takes ONE object arg (`{ exePath }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `PeImportedDllsResult` (see `backend/scanners/scanTypes.ts`). Bad args reject
 * `scan_pe_imported_dlls:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_SCAN_PE_IMPORTED_DLLS = 'scan_pe_imported_dlls' as const

/**
 * Rust-side channel name: Phase 63 (D-03) executable scanner `scan_contained_real`, a pass-through to the
 * Tauri-free `gamelib-scan` crate (the same dispatch `gamelib-scan-cli` uses).
 *
 * Takes ONE object arg (`{ path, rootDir }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `ContainedRealResult` (see `backend/scanners/scanTypes.ts`). Bad args reject
 * `scan_contained_real:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_SCAN_CONTAINED_REAL = 'scan_contained_real' as const

/**
 * Rust-side channel name: Phase 63 (D-03) executable scanner `scan_winemac_metal_exports`, a pass-through to the
 * Tauri-free `gamelib-scan` crate (the same dispatch `gamelib-scan-cli` uses).
 *
 * Takes ONE object arg (`{ wineBundlePath }`), all string fields (D-08: paths in, never bytes).
 * Resolves a `WinemacMetalCheck` (see `backend/scanners/scanTypes.ts`). Bad args reject
 * `scan_winemac_metal_exports:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_SCAN_WINEMAC_METAL_EXPORTS =
  'scan_winemac_metal_exports' as const

/**
 * Rust-side channel name: Phase 82 (D-07) destructive-path check `safety_check_removal`, a
 * pass-through to the Tauri-free `gamelib-safety` crate.
 *
 * Takes ONE object arg (a `SafetyRequest`, see `common/types/safety.ts`) validated in-crate with
 * `deny_unknown_fields`. Resolves a `SafetyReply` (verdict per target plus `overall`); a refusal or
 * an unreadable path RESOLVES as `no`/`unknown`. Bad args reject `safety_check_removal:bad-args`.
 * Callers go through `backend/safety/rustSafety.ts`, which reads any rejection as `unknown`.
 */
export const RUST_SAFETY_CHECK_REMOVAL = 'safety_check_removal' as const

/**
 * Rust-side channel name: Phase 82 (D-07) guarded delete `safety_remove_tree`, a pass-through to the
 * Tauri-free `gamelib-safety` crate. Re-runs every check inside the delete call (D-14).
 *
 * Takes ONE object arg (a `SafetyRequest`). Resolves a `SafetyRemoveReply` (`outcome` is `refused`,
 * `removed` or `failed`). Bad args reject `safety_remove_tree:bad-args`.
 */
export const RUST_SAFETY_REMOVE_TREE = 'safety_remove_tree' as const

/**
 * Rust-side channel name: Phase 85 (D-17) version gate `store_version_gate` for the two bottle-local
 * versioned files (`<bottle>/.gamelib-engine.json`, `<bottle>/gamelib-shared-redists.json`).
 *
 * Takes ONE object arg `{ path, chain }`: an absolute path with no `..` whose file name is one of
 * the two marker names, and the chain key that file name belongs to (`engine/gamelib-engine-marker`,
 * `steam_bridge/shared-redists`). Resolves `{ state, version, current }` where `state` is `absent`,
 * `ok`, `unreadable` or `newer`; it never writes. Anything else rejects `store_version_gate:bad-args`.
 * Callers go through `backend/stores/bottleVersionGate.ts`.
 */
export const RUST_STORE_VERSION_GATE = 'store_version_gate' as const

/**
 * Rust-side channel name: Phase 85 (D-17) `store_backup_file`, the pre-migration backup of one of
 * the two bottle-local versioned files (`<name>.v<from>.<stamp>.bak.json`, 0600, beside the file, at
 * most 3 kept, skipped when equal to the newest).
 *
 * Takes ONE object arg `{ path, fromVersion }` (the same path rule as `store_version_gate`).
 * Resolves the backup's file name, or `null` when the file is absent or its bytes could not be
 * backed up. Bad args reject `store_backup_file:bad-args`.
 */
export const RUST_STORE_BACKUP_FILE = 'store_backup_file' as const

/**
 * Rust-side channel name: Phase 85 (85-16, D-12) `store_read_only_notice`. The renderer's read-only
 * stores notice is raised by Rust once per launch: `frontendReady`
 * sends ONE object arg `{ tsEntries: [{ storeKey, reason }] }` with the stores TS still reported
 * read-only (`reason` is `newer` or `failed`); Rust merges them with its own read-only stores, maps
 * each to its area, de-duplicates, and emits `readOnlyStoresNotice` with the unchanged ids-only
 * payload `{ entries: [{ area, reason }] }`. Resolves the number of entries sent (0 on any call
 * after the first). Bad args reject `store_read_only_notice:bad-args`.
 */
export const RUST_STORE_READ_ONLY_NOTICE = 'store_read_only_notice' as const

/**
 * Rust-side channel name: Phase 75 (D-03) Steam depot `depot_finalize`, a no-download ACF finalize
 * (zero-depot install, failed resume verify) through the depot crate's own finalize rules.
 * Takes ONE object arg `{ appId, finalize, depots, outcome }` (validated in-crate with
 * `deny_unknown_fields`; `outcome` is "completed" | "cancelled" | null). Resolves
 * `{ acf: { path, stateFlags, sizeOnDisk } }`, `{ preserved: true, stateFlags }` or
 * `{ error: Failure }`. Bad args reject `depot_finalize:bad-args`.
 *
 * Long-running: listed in the sidecar's `UNBOUNDED_RUST_CHANNELS`, like `depot_job_run`'s own
 * finalize it walks the whole install tree to measure SizeOnDisk.
 */
export const RUST_DEPOT_FINALIZE = 'depot_finalize' as const

/**
 * Rust-side channel name: Phase 73 (D-03) Steam depot job `depot_job_cancel`, a pass-through to
 * the Tauri-free `gamelib-depot` crate. Takes ONE object arg (`{ jobId }`). Resolves
 * `{ cancelled: boolean }` (false when the job is not registered). Bad args reject
 * `depot_job_cancel:bad-args`.
 */
export const RUST_DEPOT_JOB_CANCEL = 'depot_job_cancel' as const

/**
 * Rust-side channel name: Phase 73 (D-03) Steam depot job `depot_job_run`. Takes ONE object arg,
 * the `DepotJob` (validated in-crate with `deny_unknown_fields`); the shell adds the manifest
 * cache dir and rejects an install root with no `steamapps` ancestor. Resolves an `Outcome`
 * (a failed download is `status: 'error'`, not a rejection). Bad args reject
 * `depot_job_run:bad-args`, a bad install root `depot_job_run:bad-install-root`.
 *
 * Long-running: listed in the sidecar's `UNBOUNDED_RUST_CHANNELS` (D-06). Progress arrives as
 * `depotJobEvent` frames, not through this response.
 */
export const RUST_DEPOT_JOB_RUN = 'depot_job_run' as const

/**
 * Rust-side channel name: Phase 73 (D-02) Steam depot `depot_manifest_summary`. Takes ONE object
 * arg (`SummarizeRequest`). Resolves `{ depots }` or `{ error: Failure }`. Bad args reject
 * `depot_manifest_summary:bad-args`.
 */
export const RUST_DEPOT_MANIFEST_SUMMARY = 'depot_manifest_summary' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_find_acf`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ steamappsDirs, appId }`); paths in, typed result out. Resolves a `SteamAppManifestLookup`-shaped result. Bad args
 * reject `steamfiles_find_acf:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_FIND_ACF = 'steamfiles_find_acf' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_parse_valve_manifest`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves a parsed Valve manifest result. Bad args
 * reject `steamfiles_parse_valve_manifest:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_PARSE_VALVE_MANIFEST =
  'steamfiles_parse_valve_manifest' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_read_acf`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves a parsed appmanifest result. Bad args
 * reject `steamfiles_read_acf:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_READ_ACF = 'steamfiles_read_acf' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_read_installscript`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves a parsed installscript result. Bad args
 * reject `steamfiles_read_installscript:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_READ_INSTALLSCRIPT =
  'steamfiles_read_installscript' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_read_library_folders`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves the parsed library folders. Bad args
 * reject `steamfiles_read_library_folders:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_READ_LIBRARY_FOLDERS =
  'steamfiles_read_library_folders' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_read_localconfig_beta_key`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path, appId }`); paths in, typed result out. Resolves the localconfig beta key result. Bad args
 * reject `steamfiles_read_localconfig_beta_key:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY =
  'steamfiles_read_localconfig_beta_key' as const

/**
 * Rust-side channel name: steamfiles op `steamfiles_read_loginusers_offline_mode` (bridged-launch-while-signed-out
 * fix), a pass-through to the Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves the most recent user's `WantsOfflineMode`
 * from Steam's `config/loginusers.vdf`. Bad args reject `steamfiles_read_loginusers_offline_mode:bad-args`; unreadable
 * or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE =
  'steamfiles_read_loginusers_offline_mode' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_read_running_app_id`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves the running app id result. Bad args
 * reject `steamfiles_read_running_app_id:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_READ_RUNNING_APP_ID =
  'steamfiles_read_running_app_id' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_scan_acfs`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ steamappsDirs }`); paths in, typed result out. Resolves the scanned appmanifests. Bad args
 * reject `steamfiles_scan_acfs:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_SCAN_ACFS = 'steamfiles_scan_acfs' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_shortcuts_apply`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path, mutation }`); paths in, typed result out. Resolves a typed apply result. Bad args
 * reject `steamfiles_shortcuts_apply:bad-args`; unreadable or unparseable files RESOLVE with a typed result. A described mutation, never a buffer (63 D-08 exception named in 75-CONTEXT); the nested mutation is an opaque value validated in-crate with `deny_unknown_fields`.
 */
export const RUST_STEAMFILES_SHORTCUTS_APPLY =
  'steamfiles_shortcuts_apply' as const

/**
 * Rust-side channel name: Phase 75 steamfiles op `steamfiles_shortcuts_read`, a pass-through to the
 * Tauri-free `gamelib-steamfiles` crate (the same dispatch `gamelib-steamfiles-cli` uses).
 *
 * Takes ONE object arg (`{ path }`); paths in, typed result out. Resolves the parsed shortcuts. Bad args
 * reject `steamfiles_shortcuts_read:bad-args`; unreadable or unparseable files RESOLVE with a typed result.
 */
export const RUST_STEAMFILES_SHORTCUTS_READ =
  'steamfiles_shortcuts_read' as const

// Phase 80: Rust steampoll channels, pass-throughs to the Tauri-free `gamelib-steampoll` crate.
/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_enumerate_copies`. Enumerates every install copy of an app across the Steam roots. Args `{ roots, appId }`.
 * Bad args reject `steampoll_acf_enumerate_copies:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_ENUMERATE_COPIES =
  'steampoll_acf_enumerate_copies' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_find_other_manifests`. Finds other appmanifests sharing an installdir. Args `{ steamappsDir, installdir, appId }`.
 * Bad args reject `steampoll_acf_find_other_manifests:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS =
  'steampoll_acf_find_other_manifests' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_read_state`. Reads the ACF install state of an app. Args `{ roots, appId, source }`.
 * Bad args reject `steampoll_acf_read_state:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_READ_STATE = 'steampoll_acf_read_state' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_read_update`. Reads the ACF update state of an app. Args `{ roots, appId, source }`.
 * Bad args reject `steampoll_acf_read_update:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_READ_UPDATE =
  'steampoll_acf_read_update' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_read_update_from_dir`. Reads the ACF update fields from one steamapps dir. Args `{ steamappsDir, appId }`.
 * Bad args reject `steampoll_acf_read_update_from_dir:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR =
  'steampoll_acf_read_update_from_dir' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_remove_copy`. Removes one install copy (appmanifest and files). Args `{ roots, appId, source }`.
 * Bad args reject `steampoll_acf_remove_copy:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_REMOVE_COPY =
  'steampoll_acf_remove_copy' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_acf_scan_downloading`. Scans the roots for apps currently downloading. Args `{ roots }`.
 * Bad args reject `steampoll_acf_scan_downloading:bad-args`.
 */
export const RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING =
  'steampoll_acf_scan_downloading' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_breadcrumb_installed_on_disk`. Whether the breadcrumb manifest says fully installed. Args `{ steamappsDir, appId }`.
 * Bad args reject `steampoll_breadcrumb_installed_on_disk:bad-args`.
 */
export const RUST_STEAMPOLL_BREADCRUMB_INSTALLED_ON_DISK =
  'steampoll_breadcrumb_installed_on_disk' as const

/**
 * Rust-side channel name: Phase 81 steampoll op `steampoll_adoption_read`. Evaluates one pending adoption once, without registering a watch. Args as `steampoll_adoption_watch`.
 * Resolves `{ adopted, signedIn, steamRunning, helperState, evidence }`. Bad args reject `steampoll_adoption_read:bad-args`; a call from inside a runtime rejects `steampoll_adoption_read:wrong-thread`.
 */
export const RUST_STEAMPOLL_ADOPTION_READ = 'steampoll_adoption_read' as const

/**
 * Rust-side channel name: Phase 81 steampoll op `steampoll_adoption_unwatch`. Stops watching one app. Args `{ appId }`.
 * Resolves `true` when the app was watched, `false` otherwise. Bad args reject `steampoll_adoption_unwatch:bad-args`.
 */
export const RUST_STEAMPOLL_ADOPTION_UNWATCH =
  'steampoll_adoption_unwatch' as const

/**
 * Rust-side channel name: Phase 81 steampoll op `steampoll_adoption_watch`. Starts (or replaces) the Rust watch of one pending adoption. Args `{ appId, manifestPath, baselineContent, recordedAtMs, steamPid, installAppFallback? }`.
 * Resolves `true`. Bad args reject `steampoll_adoption_watch:bad-args`.
 */
export const RUST_STEAMPOLL_ADOPTION_WATCH = 'steampoll_adoption_watch' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_bridge_finalized`. Records that the bridge finalized an install. Args `{ appId, finalized }`.
 * Bad args reject `steampoll_bridge_finalized:bad-args`.
 */
export const RUST_STEAMPOLL_BRIDGE_FINALIZED =
  'steampoll_bridge_finalized' as const

/**
 * Rust-side channel name: Phase 81 steampoll op `steampoll_hold_discard`. Deletes the old restart-hold store file (`steam_restart_hold.json`) and nothing else. No args; the store path is the Rust profile's, never the caller's.
 * Resolves `true` when the file is gone (a missing file counts), `false` on an I/O failure. Call it only after every drained record has been persisted elsewhere.
 */
export const RUST_STEAMPOLL_HOLD_DISCARD = 'steampoll_hold_discard' as const

/**
 * Rust-side channel name: Phase 81 steampoll op `steampoll_hold_drain`. Reads the restart-hold store an older build wrote (`steam_restart_hold.json`) and answers the records still worth adopting. No args; the store path is the Rust profile's, never the caller's.
 * Resolves `DrainedHold[]` (`{ appId, steamPid, recordedAtMs }`). Writes nothing.
 */
export const RUST_STEAMPOLL_HOLD_DRAIN = 'steampoll_hold_drain' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_install_cancel_delegated`. Cancels a delegated install poll. Args `{ appId }`.
 * Bad args reject `steampoll_install_cancel_delegated:bad-args`.
 */
export const RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED =
  'steampoll_install_cancel_delegated' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_install_start`. Starts the install poll. Args `{ appId, title, roots, options? }`; options is validated in the crate.
 * Resolves a boolean: true when the appId's poll watches an update once the call returns (80-REVIEW C-WR-03).
 * Bad args reject `steampoll_install_start:bad-args`.
 */
export const RUST_STEAMPOLL_INSTALL_START = 'steampoll_install_start' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_install_stop`. Stops the install poll. Args `{ appId }`.
 * Bad args reject `steampoll_install_stop:bad-args`.
 */
export const RUST_STEAMPOLL_INSTALL_STOP = 'steampoll_install_stop' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_mac_arch_verdict`. Probes the native macOS arch verdict for an install path. Args `{ installPath }`.
 * Bad args reject `steampoll_mac_arch_verdict:bad-args`.
 */
export const RUST_STEAMPOLL_MAC_ARCH_VERDICT =
  'steampoll_mac_arch_verdict' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_native_in_flight`. Marks a native install in flight. Args `{ appId, inFlight }`.
 * Bad args reject `steampoll_native_in_flight:bad-args`.
 */
export const RUST_STEAMPOLL_NATIVE_IN_FLIGHT =
  'steampoll_native_in_flight' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_next_notice_seq`. Takes the next notice sequence number. No args.
 * Bad args reject `steampoll_next_notice_seq:bad-args`.
 */
export const RUST_STEAMPOLL_NEXT_NOTICE_SEQ =
  'steampoll_next_notice_seq' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_read_running_app_id`. Reads the running Steam app id. Args `[{ strict? }]` (the object is optional).
 * Bad args reject `steampoll_read_running_app_id:bad-args`.
 */
export const RUST_STEAMPOLL_READ_RUNNING_APP_ID =
  'steampoll_read_running_app_id' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_running_hold`. Takes a running-poll hold for an app id; resolves a numeric claim id. Args `{ appId }`.
 * Bad args reject `steampoll_running_hold:bad-args`.
 */
export const RUST_STEAMPOLL_RUNNING_HOLD = 'steampoll_running_hold' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_running_last_app_id`. The last running app id the poller saw. No args.
 * Bad args reject `steampoll_running_last_app_id:bad-args`.
 */
export const RUST_STEAMPOLL_RUNNING_LAST_APP_ID =
  'steampoll_running_last_app_id' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_running_release`. Releases a running-poll hold. Args `{ claimId, terminalSent }`.
 * Bad args reject `steampoll_running_release:bad-args`.
 */
export const RUST_STEAMPOLL_RUNNING_RELEASE =
  'steampoll_running_release' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_running_start`. Starts the running poll. No args.
 * Bad args reject `steampoll_running_start:bad-args`.
 */
export const RUST_STEAMPOLL_RUNNING_START = 'steampoll_running_start' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_running_stop`. Stops the running poll. No args.
 * Bad args reject `steampoll_running_stop:bad-args`.
 */
export const RUST_STEAMPOLL_RUNNING_STOP = 'steampoll_running_stop' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_status`. The install poll status snapshot. No args.
 * Bad args reject `steampoll_status:bad-args`.
 */
export const RUST_STEAMPOLL_STATUS = 'steampoll_status' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_uninstall_start`. Starts the uninstall poll. Args `{ appId, title, roots, source, intervalMs?, bridgeAuthoritative? }`.
 * Bad args reject `steampoll_uninstall_start:bad-args`.
 */
export const RUST_STEAMPOLL_UNINSTALL_START =
  'steampoll_uninstall_start' as const

/**
 * Rust-side channel name: Phase 80 steampoll op `steampoll_uninstall_stop`. Stops the uninstall poll. Args `{ appId }`.
 * Bad args reject `steampoll_uninstall_stop:bad-args`.
 */
export const RUST_STEAMPOLL_UNINSTALL_STOP = 'steampoll_uninstall_stop' as const

/**
 * Phase 79: Rust CM channels, pass-throughs to the Tauri-free `gamelib-steamcm` crate (the same
 * dispatch `gamelib-steamcm-cli` uses). Each takes ONE object arg mirroring the crate's
 * `deny_unknown_fields` arg struct; ids that exceed 2^53 (steamId, manifestId) travel as decimal
 * strings. Bad args reject `<op>:bad-args`.
 */
export const RUST_STEAMCM_ANON_CLOSE = 'steamcm_anon_close' as const
export const RUST_STEAMCM_ANON_PRODUCT_INFO =
  'steamcm_anon_product_info' as const
export const RUST_STEAMCM_CONFIGURE = 'steamcm_configure' as const
export const RUST_STEAMCM_CONTENT_SERVERS = 'steamcm_content_servers' as const
export const RUST_STEAMCM_DEPOT_KEY = 'steamcm_depot_key' as const
export const RUST_STEAMCM_LICENSES = 'steamcm_licenses' as const
export const RUST_STEAMCM_MAC_OWNED_APPS = 'steamcm_mac_owned_apps' as const
export const RUST_STEAMCM_MANIFEST_REQUEST_CODE =
  'steamcm_manifest_request_code' as const
export const RUST_STEAMCM_OWNED_APPS = 'steamcm_owned_apps' as const
export const RUST_STEAMCM_PERSONAS = 'steamcm_personas' as const
export const RUST_STEAMCM_PRODUCT_INFO = 'steamcm_product_info' as const
export const RUST_STEAMCM_REDEEM_KEY = 'steamcm_redeem_key' as const
export const RUST_STEAMCM_REFRESH = 'steamcm_refresh' as const
export const RUST_STEAMCM_SESSION_ACQUIRE = 'steamcm_session_acquire' as const
export const RUST_STEAMCM_SESSION_ACQUIRE_OPEN =
  'steamcm_session_acquire_open' as const
export const RUST_STEAMCM_SESSION_ENSURE_CONNECTED =
  'steamcm_session_ensure_connected' as const
export const RUST_STEAMCM_SESSION_LOGOUT = 'steamcm_session_logout' as const
export const RUST_STEAMCM_SESSION_RELEASE = 'steamcm_session_release' as const
export const RUST_STEAMCM_SESSION_SHUTDOWN = 'steamcm_session_shutdown' as const
export const RUST_STEAMCM_SESSION_STATUS = 'steamcm_session_status' as const
export const RUST_STEAMCM_SIGNIN_CANCEL = 'steamcm_signin_cancel' as const
export const RUST_STEAMCM_SIGNIN_CREDENTIALS_START =
  'steamcm_signin_credentials_start' as const
export const RUST_STEAMCM_SIGNIN_GUARD_SUBMIT =
  'steamcm_signin_guard_submit' as const
export const RUST_STEAMCM_SIGNIN_QR_START = 'steamcm_signin_qr_start' as const
export const RUST_STEAMCM_SIGNIN_STATUS = 'steamcm_signin_status' as const
export const RUST_STEAMCM_STORE_APPDETAILS = 'steamcm_store_appdetails' as const
export const RUST_STEAMCM_STORE_ENRICH = 'steamcm_store_enrich' as const
export const RUST_STEAMCM_WRAP_RESTORE_IF_OWED =
  'steamcm_wrap_restore_if_owed' as const

/**
 * Phase 86 (SVC-01): the Rust leaf information services, pass-throughs to the Tauri-free
 * `gamelib-info` crate (the same dispatch `gamelib-info-cli` uses). Each takes ONE object arg
 * mirroring the crate's `deny_unknown_fields` arg struct. Bad args reject `<op>:bad-args`.
 *
 * `info_recent_add`: adds a game to the head of `games.recent` in `store/config.json`. Args
 * `{ appName, title, runner }` (appName 1 to 1024 UTF-16 units). Resolves `null`. The change
 * reaches the renderer (`recentGamesChanged`) and the tray from Rust.
 */
export const RUST_INFO_RECENT_ADD = 'info_recent_add' as const

/**
 * Phase 86 (SVC-01): `info_recent_remove` drops a game from `games.recent`. Args `{ appName }`.
 * Resolves `null`. The renderer's Remove-from-recent does not use this channel: it is the native
 * `removeRecent`, which runs the same op.
 */
export const RUST_INFO_RECENT_REMOVE = 'info_recent_remove' as const

/**
 * Phase 86 (SVC-01): the per-game metadata overrides, `store/game-overrides.json`'s `overrides` key,
 * served by `gamelib-info`. Not reachable from a TS caller until 86-11 turns `game_overrides` into
 * forwarding shims (D-29 row 7: a Rust write must not race the TS writer).
 *
 * `info_overrides_get`: args `{ appName }`. Resolves the stored override or `null`.
 */
export const RUST_INFO_OVERRIDES_GET = 'info_overrides_get' as const

/** `info_overrides_get_all`: args none. Resolves the whole `{ [appName]: override }` map (`{}` when none). */
export const RUST_INFO_OVERRIDES_GET_ALL = 'info_overrides_get_all' as const

/**
 * `info_overrides_set`: args `{ appName, overrideData: { title?, art_cover?, art_square? } }` (`overrideData`, not
 * `override`: that is a reserved word in the generated Rust args struct). An
 * override with every field empty removes the entry and the game's `<appName>-*` images. Resolves
 * the boolean `setGameOverrides` returned (`false` when the store could not be read or written). The
 * caller writes the TS log lines from it: the crate has no logger.
 */
export const RUST_INFO_OVERRIDES_SET = 'info_overrides_set' as const

/**
 * `info_overrides_attach`: args `{ gameInfo }`. Resolves that game object with `overrides` added
 * when one is stored for its `app_name`, else the object unchanged.
 */
export const RUST_INFO_OVERRIDES_ATTACH = 'info_overrides_attach' as const

/**
 * Phase 86 (SVC-01, 86-12): the anti-cheat data file `<appFolder>/areweanticheatyet.json`, served by
 * `gamelib-info`. Rust has no online logic in this phase (D-07): TS keeps its `releasesInfoReady`
 * listener and its online wait, and calls these between them (D-28).
 *
 * `info_anticheat_info`: args `{ appNamespace? }`. Resolves the data file's entry whose Epic namespace
 * contains the argument, or `null` (also on Windows, for no argument and for a missing or unreadable
 * file). TS's `gameAnticheatInfo` answered `undefined` for no match; Rust answers `null` (D-03).
 */
export const RUST_INFO_ANTICHEAT_INFO = 'info_anticheat_info' as const

/**
 * `info_anticheat_status`: args `{ latestFileHash? }`, the MD5 hex the release feed advertises.
 * Resolves `{ needed }`: false on Windows and when the local file exists and its MD5 equals the
 * hash, true otherwise. Rejects (`info_anticheat_status:unreadable`) when the file exists but cannot
 * be read, as the TS `createMD5` did.
 */
export const RUST_INFO_ANTICHEAT_STATUS = 'info_anticheat_status' as const

/**
 * `info_anticheat_download`: args `{}`. Fetches the platform feed (MacAnticheatData on macOS,
 * AreWeAntiCheatYet elsewhere) and writes it byte for byte. Resolves `{ written }`, plus a `warning`
 * string when `written` is false because of a failed request or write (the caller logs it as the TS
 * did); resolves `{ written: false }` on Windows. The caller runs it behind its own online wait.
 */
export const RUST_INFO_ANTICHEAT_DOWNLOAD = 'info_anticheat_download' as const

/**
 * Phase 86 (SVC-01, 86-18): the GOG catalog discounts, served by `gamelib-info` `discounts`. Args
 * `{ locale: { countryCode, locale, currencyCode }, hideOwned, wishlistOnly, token }`, where `token`
 * is the GOG access token the caller collected (or `null`): it comes from the `gogdl` child process,
 * which stays TypeScript until phase 92 (D-24), and is used for the one call only, never logged.
 * Resolves the product list as the catalog sent it, pages 1 to 30 merged in page order and
 * deduplicated by id; rejects with the text of what failed (`Request failed with status code 500`).
 * A flag with a `null` token resets both flags in Rust, as the TS did.
 */
export const RUST_INFO_GOG_DISCOUNTS = 'info_gog_discounts' as const

/**
 * Phase 86 (SVC-01, 86-19): the CrossOver rating map of the whole library, served by `gamelib-info`
 * `crossover`. Args `{ games: [{ appName, title, runner }] }`, at most 20000 games, every `runner` one
 * of the five runners: the TS resolver `getCrossoverIndex` (info/crossover.ts) only gathers that list
 * from every library manager (D-24). Resolves `{ [appName]: number | null }`: a number is the rating
 * 1 to 5, `null` is looked up and not found, an absent key was never looked up; `{}` off macOS. The
 * index fetch, its bounds, the cache and the 5 minute back-off are all in Rust. Rejects with a fixed
 * `info_crossover_rating_map:<reason>` word.
 */
export const RUST_INFO_CROSSOVER_RATING_MAP =
  'info_crossover_rating_map' as const

/**
 * Phase 86 (SVC-01, 86-20, D-04): the umu id lookup, served by `gamelib-info` `umu`. Args `{ appName,
 * runner }` with `runner` one of the five runner names. Resolves the umu id (a string) or `null`: `null`
 * for a runner with no store catalog (sideload, no request), for a miss, and for any failure of the
 * request. A server answer that is not a list, or whose first entry carries no `umu_id`, rejects with
 * `info_umu_get:bad-response` (the TS threw there too). The id is cached in `store_cache/umu.json` for
 * six hours; a cached miss is asked for again on every call, exactly as the TS did (todo
 * `2026-11-22-umu-cached-null-refetched-every-call`). The store managers' shims (86-23) are the callers.
 */
export const RUST_INFO_UMU_GET = 'info_umu_get' as const

/**
 * Phase 86 (SVC-01, 86-22, D-23): the wiki game info lookup, served by `gamelib-info` `wiki`. Args
 * `{ title, appName, runner, forceRefresh? }` with `runner` one of the five runner names. Resolves the
 * wiki object (`pcgamingwiki`, `applegamingwiki`, `codeweavers`, `howlongtobeat`, `gamesdb`, `steamInfo`,
 * `umuId`, `fetchStatus`) from the 30 day `wikigameinfo` cache, or `null` when the lookup failed (a
 * failure is logged, never thrown). The title is the caller's own. The one caller is the non-Steam
 * shortcut resolver (`nonesteamgame.ts`), whose shim 86-23 writes.
 */
export const RUST_INFO_WIKI_GET = 'info_wiki_get' as const

/**
 * Phase 86 (SVC-01, 86-22): empties the `wikigameinfo` cache (values and `__timestamp` keys together);
 * the umu cache is another store and is untouched. Args `{}`; resolves `null`. The one caller is
 * `clearCache` in `backend/utils.ts`, whose shim 86-23 writes.
 */
export const RUST_INFO_WIKI_CACHE_CLEAR = 'info_wiki_cache_clear' as const

/**
 * Phase 87 (SVC-02, 87-18): the Rust wine runtime services, pass-throughs to the Tauri-free
 * `gamelib-wine` crate (the same dispatch `gamelib-wine-cli` uses). Each takes ONE positional string,
 * the runtime name: exactly one of `eac_runtime`, `battleye_runtime`, `umu`. Any other value, a second
 * argument or none rejects with the invalid-args marker before the crate sees it.
 *
 * `wine_runtime_is_installed`: whether the runtime is installed and current (its `current_version`
 * matches the lutris list's `created_at`). Resolves a boolean. The launcher's `isRuntimeInstalled`
 * shim (`backend/enginewine/runtimes.ts`) is the one caller; the renderer's `isRuntimeInstalled` is
 * the native channel of the same name.
 */
export const RUST_WINE_RUNTIME_IS_INSTALLED =
  'wine_runtime_is_installed' as const

/**
 * Phase 87 (SVC-02, 87-18): `wine_runtime_download` downloads and extracts the runtime (contained tar
 * extraction, a guarded replace of the old folder, `current_version` written last). Resolves `true`
 * when the runtime is installed after the call, `false` on a failed download or extraction.
 *
 * Long-running: listed in the sidecar's `UNBOUNDED_RUST_CHANNELS`. A runtime is a download of tens of
 * megabytes plus an extraction, with no wall-clock ceiling of its own; the crate holds a shutdown
 * registrant and is cancelled by the token. The launcher's `downloadRuntime` shim is the one caller;
 * the renderer's `downloadRuntime` is the native channel of the same name.
 */
export const RUST_WINE_RUNTIME_DOWNLOAD = 'wine_runtime_download' as const

/**
 * Phase 87 (SVC-02, 87-20): the Rust wine-manager ops, pass-throughs to `gamelib-wine`. The sidecar's
 * callers (the default-wine download in `utils.ts` and the `releasesInfoReady` listener) reach them only
 * through the `backend/enginewine/wineManager.ts` shims;
 * the renderer's `refreshWineVersionInfo`, `installWineVersion` and `removeWineVersion` are native
 * channels over the same ops, so the wine-downloader-info store and `<tools>/wine` have one writer.
 *
 * `wine_manager_refresh`: refreshes the store from the seven release feeds. Args: one boolean, `fetch`
 * (`true` forces the network; `false` merges what is stored). Resolves `null`, and also when a feed
 * fails (the failure is logged in Rust), as the TS refresh swallowed it. Long-running: listed in the
 * sidecar's `UNBOUNDED_RUST_CHANNELS` (up to seven feeds in turn).
 */
export const RUST_WINE_MANAGER_REFRESH = 'wine_manager_refresh' as const

/**
 * Phase 87 (SVC-02, 87-20): `wine_manager_install` installs one release, the whole handler (start
 * notification, `progressOfWineManager`, the sha512-checked download, the unpack, the store entry, the
 * result notification). Args: one `WineVersionInfo` (the shell decodes it strictly: the eleven keys and
 * nothing else, of which `isInstalled`, `hasUpdate` and `installDir` may be absent on a never-installed release); the shell reads `downloadProtonToSteam` and `defaultSteamPath` from the global config
 * itself. Resolves `'success' | 'abort' | 'error'`. The renderer cancels it with `abort(version)`.
 *
 * Long-running: listed in the sidecar's `UNBOUNDED_RUST_CHANNELS` (a download of hundreds of megabytes
 * and an unpack, ended by its own result, the abort or the app shutdown).
 */
export const RUST_WINE_MANAGER_INSTALL = 'wine_manager_install' as const

/**
 * Phase 87 (SVC-02, 87-20): `wine_manager_list` reads the wine-downloader-info store's release list
 * (the stored `wine-releases`). Args: none. Resolves the array of releases, `[]` when nothing is
 * stored. The default-wine download reads it after a refresh; the sidecar's own store mirror may not
 * have caught up with Rust's write by then.
 */
export const RUST_WINE_MANAGER_LIST = 'wine_manager_list' as const

/**
 * Phase 87 (SVC-02, 87-20): `wine_releases_info_ready` is the `releasesInfoReady` listener's body: the
 * wine lists are refreshed when a feed's latest release is newer than the stored one (Linux and macOS
 * only). Args: one object, the `ReleasesInfo` the release-info fetch produced (the crate reads the five
 * feed stamps and ignores the rest). Resolves `null` once the check, and any refresh it started, has
 * ended; a failure is logged in Rust and never raised. Long-running: listed in the sidecar's
 * `UNBOUNDED_RUST_CHANNELS`, like the refresh it may start.
 */
export const RUST_WINE_RELEASES_INFO_READY = 'wine_releases_info_ready' as const

/**
 * Phase 87 (SVC-02, 87-24): `wine_valid` is `validWine`'s body: whether a wine installation can run, by the
 * existence of the binaries its type needs (a `wine` needs its `wineserver` too, a macOS toolkit needs
 * Darwin 14). Existence checks only, nothing is spawned. Args: one `WineInstallation` (or `null`, which is
 * `false`). The shell reads the Darwin release itself and keeps only the six declared installation keys, so
 * a persisted wine carrying a legacy key, or the Windows factory `{}`, answers as the TS `validWine` did
 * (`false`, never a rejection). Resolves a boolean. The sidecar's `validWine` shim in
 * `enginewine/wineCore.ts` is its one caller; the renderer's `wine.isValidVersion` is a native channel
 * over the same op.
 */
export const RUST_WINE_VALID = 'wine_valid' as const

/**
 * Phase 87 (SVC-02, 87-24): `wine_run_command` is `runWineCommand`'s body: the prefix check, the merged
 * environment and the spawn of one wine command (argv only, never a shell; output capped; a shutdown
 * registrant held while it runs). Args: one `WineCommandArgs` object; the shell adds the host facts the
 * crate may not read (its own process environment and the Darwin release). Resolves
 * `{ stdout, stderr, code }`. No TS caller yet: the sync-callback `runWineCommand` of `commandRunner.ts`
 * stays a scheduled twin until Phase 88 owns launching a game (its `onSpawn` hands callers a live
 * ChildHandle). Long-running: listed in the sidecar's `UNBOUNDED_RUST_CHANNELS` (a game's winetricks or
 * installer runs for minutes, ended by its own exit or the app shutdown).
 */
export const RUST_WINE_RUN_COMMAND = 'wine_run_command' as const

/**
 * Phase 87 (SVC-02, 87-26): `wine_discover_alternatives` is `getAlternativeWine`'s body: the wines
 * installed on this machine (CrossOver, wine on the Mac, Wineskin, GPTK and Whisky on a Mac; the tools and
 * Lutris wines, Proton and the custom paths on Linux). Args: one boolean, `scanCustom` (`getAlternativeWine`
 * defaults it to `true`). The shell builds everything else itself (its home, config.json, `/usr/share/steam`,
 * its `PATH`, `customWinePaths` and `showValveProton` from the global config, the `libraryfolders.vdf` read),
 * so no path the sidecar sent reaches the crate (T-87-71). With no wine release list stored it refreshes it
 * first, which pushes `wineVersionsUpdated` and can take up to seven feeds in turn: listed in the sidecar's
 * `UNBOUNDED_RUST_CHANNELS` like `wine_manager_refresh`. Resolves the `WineInstallation[]`. The sidecar's
 * `discoverAlternativeWine` shim in `enginewine/wineDiscovery.ts` (config.ts's `getAlternativeWine`, which
 * `utils.ts` and the Steam install form call) is its one caller; the renderer's `getAlternativeWine` is a
 * native channel over the same op.
 */
export const RUST_WINE_DISCOVER_ALTERNATIVES =
  'wine_discover_alternatives' as const

/**
 * Phase 87 (SVC-02, 87-26): `wine_discover_crossover` is `getCrossover`'s body: the CrossOver installs
 * Spotlight knows (a short labelled `mdfind`), in the order it lists them; an empty list off macOS. Args:
 * none. Resolves the `WineInstallation[]`. The still-TS engine's `resolveCrossoverBinDirAsync`
 * (`engine/crossoverLocation.ts`) reaches it through `enginewine/intraPhase.ts`, an intra-phase shim that
 * 87-56 removes with the engine TS. Bounded (an `mdfind` has a 10 s limit of its own).
 */
export const RUST_WINE_DISCOVER_CROSSOVER = 'wine_discover_crossover' as const

/**
 * Phase 87 (SVC-02, 87-34): `wine_dxvk_install_remove` is `DXVK.installRemove`'s body: it installs (`backup`)
 * or removes (`restore`) one DXVK-family tool (`dxvk`, `dxvk-nvapi`, `vkd3d` or the macOS `dxvk-macOS`) in a
 * game's Wine prefix, downloading the release when it is not cached. Args: one object,
 * `{ settings, tool, action, source? }` (the merged game settings the prefix is read from, and optionally the
 * engine's pinned `{ dir, version }`); the crate decodes it strictly and refuses any other key. The shell adds
 * the host facts the crate may not read (its process environment, the Darwin release, the bundled `public`
 * directory holding the Vulkan helper, and whether the app is online), so none of them travels from the
 * sidecar. Resolves a boolean, the TS `installRemove` answer. Long-running (a download): listed in the
 * sidecar's `UNBOUNDED_RUST_CHANNELS`. The renderer's three toggles (`engineWineResolvers.ts`) and the
 * `dxvkInstallRemove` shim (`enginewine/tools.ts`: the launcher's DXVK step and the still-TS engine's
 * `installRemove`) are its callers, so a prefix's DXVK DLLs have one writer.
 */
export const RUST_WINE_DXVK_INSTALL_REMOVE = 'wine_dxvk_install_remove' as const

/**
 * Phase 87 (SVC-02, 87-35): `wine_winetricks_apply` is the Winetricks apply queue's start. Args: `[request,
 * verbs]`, the game's target `{ runner, appName, settings | unavailable }` (the tool settings the resolver
 * gathered, or the resolver's reason word when the game has no usable Wine environment) and the renderer's
 * verbs payload exactly as it sent it; the crate's apply guard judges the verbs against the game's catalog
 * before any reaches an argv. The shell adds the wine host facts (its process environment, the Darwin release).
 * Resolves the `WinetricksApplyResult` at once; the verbs install detached in Rust, which pushes the queue's
 * events. Long-running on a first call (the catalog read downloads and lists the script): listed in the
 * sidecar's `UNBOUNDED_RUST_CHANNELS`. The `winetricksApply` resolver (`engineWineResolvers.ts`) is its caller.
 */
export const RUST_WINE_WINETRICKS_APPLY = 'wine_winetricks_apply' as const

/**
 * Phase 87 (SVC-02, 87-35): `wine_winetricks_available` lists the components winetricks can install for a
 * game (`listAvailable`, visible ones only; the crate caches the catalog for the apply guard). Args: one
 * object, the game's target `{ runner, appName, settings | unavailable }`. The shell adds the wine host facts.
 * Resolves the `WinetricksComponent[]`. The first read downloads the script: unbounded. The
 * `winetricksAvailable` resolver is its caller.
 */
export const RUST_WINE_WINETRICKS_AVAILABLE =
  'wine_winetricks_available' as const

/**
 * Phase 87 (SVC-02, 87-35): `wine_winetricks_installed` reads the lines of a game's `winetricks.log`
 * (`listInstalled`; a read never creates a bottle). Args: one object, the game's target. The shell adds the
 * wine host facts. Resolves a `string[]`. The `winetricksInstalled` resolver is its caller.
 */
export const RUST_WINE_WINETRICKS_INSTALLED =
  'wine_winetricks_installed' as const

/**
 * Phase 87 (SVC-02, 87-35): `wine_winetricks_install` installs a list of verbs for a game one after another
 * (`Winetricks.install` in the launcher's known-fix loop and the Steam bridge's known fixes). Args: `[request,
 * verbs]`, the game's target and a string list. Resolves one outcome word per verb: `installed`, `failed` or
 * `refused`; a verb that is not the shape of a real one counts as `failed` and never reaches an argv. The
 * shell adds the wine host facts. Each verb is a winetricks run: listed in `UNBOUNDED_RUST_CHANNELS`. The
 * `winetricksInstallVerbs` shim (`enginewine/tools.ts`) is its caller.
 */
export const RUST_WINE_WINETRICKS_INSTALL = 'wine_winetricks_install' as const

/**
 * Phase 87 (SVC-02, 87-35): `wine_winetricks_list_installed` is the same read as `wine_winetricks_installed`
 * for the launcher's installed-packages log line, which holds the settings it launches with (no Game object
 * crosses). Args: one object, the game's target. The `winetricksListInstalled` shim (`enginewine/tools.ts`)
 * is its caller.
 */
export const RUST_WINE_WINETRICKS_LIST_INSTALLED =
  'wine_winetricks_list_installed' as const

/**
 * Phase 87 (SVC-02, 87-36): `wine_run_command_for_game` is `runWineCommandForGame`'s body and the launcher's
 * `runWineCommandOnGame` use: the Steam, native, install-path and command-shape guards, then one wine command in
 * the game's own bottle (on Windows, the program itself as an argv array). Args: one object, the facts the
 * `runWineCommandForGame` resolver gathered (`gameCommandFacts`: the game, the resolved tool `settings` or the
 * `unavailable` reason, the Steam eligibility, the native flag, the folder name and install path, whether it is a
 * pending install) with the command (`commandParts`, `wait`, `protonVerb`, `startFolder`); the crate's
 * `assert_command_parts` judges the command (a non-empty array of at most 256 strings of at most 4096
 * characters). The shell adds the wine host facts. Resolves `{ stdout, stderr, code }`, the empty result when a
 * guard refused (one log line, nothing spawned). A wine command can run for minutes: listed in the sidecar's
 * `UNBOUNDED_RUST_CHANNELS`. The `runWineCommandForGame` resolver (`engineWineResolvers.ts`) is its caller.
 */
export const RUST_WINE_RUN_COMMAND_FOR_GAME =
  'wine_run_command_for_game' as const

/**
 * Phase 87 (SVC-02, 87-36): `wine_tool_call` is `callTool`'s wine command: `winecfg` or `runExe` on a game, each one
 * `wine_run_command_for_game` with the TS's fixed arguments (`wait` false, the exe's directory as the start
 * folder; a `runExe` with no exe runs nothing). Args: one object, the tool (`winecfg` | `runExe`), the exe a
 * `runExe` runs and the same game facts `wine_run_command_for_game` takes (`gameCommandFacts`), through the same
 * guards; the shell adds the wine host facts. Resolves null. What the TS handler did after the command (the GOG
 * offline-installer check, `pushGameToLibrary`, the final `gameStatusUpdate done`) reads the library and sends the
 * renderer's messages, so it stays in the `callTool` registration of `engineWineResolvers.ts`, which is the
 * op's one caller. A tool runs until the program ends: listed in the sidecar's `UNBOUNDED_RUST_CHANNELS`.
 */
export const RUST_WINE_TOOL_CALL = 'wine_tool_call' as const

/**
 * Phase 87 (SVC-02, 87-31): `engine_set_online` tells the Rust engine whether the machine is online. The
 * sidecar's online monitor is still the one that probes (until Phase 98), so it writes its status through
 * to `EngineCtx.online` at boot and on every change; Rust-initiated network work (the DXMT boot update, the
 * DXMT fetch behind a wine install) checks that flag as the TS checked `onlineMonitor.isOnline()`. Args: one
 * object, `{ online: boolean }`. Resolves `null`. Bounded. The `setEngineOnline` shim in
 * `enginewine/engineOnline.ts` is its one caller.
 */
export const RUST_ENGINE_SET_ONLINE = 'engine_set_online' as const

/**
 * Phase 87 (SVC-02, 87-42): the bottle, ledger and selection ops the Steam bridge and the still-TS engine decision
 * reach through the shims in `enginewine/bottles.ts` (every one a typed call over one object argument, which the
 * crate decodes strictly; D-03, D-15). `engine_bottle_prepare` makes a bottle's engine the requested one: it may
 * download DXVK, so it has no limit of its own beyond the app shutdown (it joins the sidecar's unbounded list). So
 * does `engine_bottle_create_fallback` (`wineboot -i` 180 s, `wineserver -w` 60 s, then DXVK), which takes an
 * optional `cancelId` that `engine_bottle_cancel_create` ends (the TS `AbortSignal`). The other ops are bounded:
 * the wineserver stop carries its own 15 s cap, the rest read or write one small file or one in-memory map.
 * `engine_selection_clear` and the two `engine_ledger_*` ops write the registry and the running-games ledger the
 * switch reads. Reply shapes: prepare `{ok, changed, selection?}` or `{ok: false, reason, detail}`; the creation
 * `{status, error?, errorCode?, createdHere?}`; the stop, the removal, the record ops, the clear and the mark-running
 * a boolean; the reconcile `'crossover' | 'pinned' | null`; the mark-stopped `null`. The per-game removal (87-70)
 * takes `{runner, appName, stored, knownInstalls, selfKey, protectedRoots}` and answers
 * `{outcome: 'removed' | 'not-bottle-backed' | 'refused' | 'failed', reason?, otherKey?}`.
 */
export const RUST_ENGINE_BOTTLE_PREPARE = 'engine_bottle_prepare' as const
export const RUST_ENGINE_BOTTLE_CREATE_FALLBACK =
  'engine_bottle_create_fallback' as const
export const RUST_ENGINE_BOTTLE_CANCEL_CREATE =
  'engine_bottle_cancel_create' as const
export const RUST_ENGINE_BOTTLE_KILL_WINESERVER =
  'engine_bottle_kill_wineserver' as const
export const RUST_ENGINE_BOTTLE_REMOVE_CREATED =
  'engine_bottle_remove_created' as const
export const RUST_ENGINE_BOTTLE_REMOVE_PER_GAME =
  'engine_bottle_remove_per_game' as const
export const RUST_ENGINE_BOTTLE_RECONCILE_MARKER =
  'engine_bottle_reconcile_marker' as const
export const RUST_ENGINE_BOTTLE_RECORD_PINNED =
  'engine_bottle_record_pinned' as const
export const RUST_ENGINE_BOTTLE_RECORD_CROSSOVER =
  'engine_bottle_record_crossover' as const
export const RUST_ENGINE_LEDGER_MARK_RUNNING =
  'engine_ledger_mark_running' as const
export const RUST_ENGINE_LEDGER_MARK_STOPPED =
  'engine_ledger_mark_stopped' as const
export const RUST_ENGINE_SELECTION_CLEAR = 'engine_selection_clear' as const

/**
 * Phase 87 (SVC-02, 87-52): the launch-time engine step of a non-Steam launch, reached through the shims in
 * `enginewine/launch.ts` (D-01, D-15). Every one takes one object the crate decodes strictly.
 * `engine_launch_select` runs the whole step (eligibility, the effective engine, the prefix, the game's own bottle,
 * the offline refusal, the decision, the first-need pinned-engine download, the bottle switch and the registry) and
 * answers `{kind, key?, selection?, prefix?, logLines?, launchSettings?}`; it may download the 228 MB pinned engine and
 * wait on a dialog, so it has no limit of its own beyond the app shutdown (it joins the sidecar's unbounded list).
 * `engine_launch_arm_deadline` arms the 180 s no-kill deadline and its process watch for a bottle-backed launch and
 * answers `{armed, watching?}`; `engine_launch_end` releases everything a launch held and answers `null`; both are
 * bounded (an in-memory table and one spawn handle).
 */
export const RUST_ENGINE_LAUNCH_SELECT = 'engine_launch_select' as const
export const RUST_ENGINE_LAUNCH_ARM_DEADLINE =
  'engine_launch_arm_deadline' as const
export const RUST_ENGINE_LAUNCH_END = 'engine_launch_end' as const
/**
 * Phase 87 (87-52): `getLaunchSettings` over `{key, stored}`: the stored settings with the running launch's engine
 * overlaid (a `null` key, or a key with no registered selection, answers the stored settings unchanged). Bounded: it
 * reads the in-memory registry and the overlay context.
 */
export const RUST_ENGINE_LAUNCH_SETTINGS_GET =
  'engine_launch_settings_get' as const
/**
 * Phase 87 (87-53, D-02): the renderer's `dialogDisplayed` ack of an engine dialog, over `{ackId}`. Only an id that
 * starts with `engine:` is forwarded (the ids the TS table issued are acknowledged there). Answers `true` when Rust
 * was waiting on the id, `false` for a repeated or unknown one. Bounded: it settles an in-memory entry.
 */
export const RUST_ENGINE_DIALOG_DISPLAYED = 'engine_dialog_displayed' as const
/**
 * Phase 87 (87-52, D-23): the renderer's `getEngineState`, one typed call from the resolver in
 * `sidecar/engineWineResolvers.ts`. The argument is `{identity, facts?}`: `identity` is the game (`{runner, appName}`)
 * or `null` when TypeScript found the game ineligible (a native game, a Browser install, an unknown runner, a failing
 * library lookup), which answers `null`; `facts` is present only for a bottle-runtime (Steam) title, whose bridge
 * bottle, eligibility and bottle name TypeScript holds, and absent for every other game, whose facts Rust derives from
 * the stored settings. Resolves the engine state the game page and the badge read, or `null`. Bounded: the CrossOver
 * pre-flight it may run carries its own probe timeouts, well under the sidecar's 60 s.
 */
export const RUST_ENGINE_STATE_GET = 'engine_state_get' as const
/**
 * Phase 87 (87-54, D-03, D-15): the Steam bridge's engine decisions, reached through the shims in
 * `enginewine/decision.ts`. Every one takes one object the crate decodes strictly, with the facts TypeScript holds
 * (the stored override, the process monitor's phase, the persisted wine-binary hints) as values. `engine_decide_launch`
 * answers the `LaunchDecision` (`{kind: 'use', selection, preflight, pin, needsDownload, override, logLines}` or
 * `{kind: 'unavailable', override, detail}`); `engine_decide_creation` the `{decision, createCapMs}` of the engine a
 * new bottle is made with; `engine_preflight_crossover` the `CrossoverPreflight` (the G29 two-probe rule);
 * `engine_is_crossover_missing` a boolean that never probes. The decision and the pre-flight run up to two 15 s
 * `--demo-status` probes with a wineserver stop after each, which can pass the sidecar's 60 s, so they join its
 * unbounded list; the other two are presence checks and stay bounded.
 */
export const RUST_ENGINE_DECIDE_LAUNCH = 'engine_decide_launch' as const
export const RUST_ENGINE_DECIDE_CREATION = 'engine_decide_creation' as const
export const RUST_ENGINE_PREFLIGHT_CROSSOVER =
  'engine_preflight_crossover' as const
export const RUST_ENGINE_IS_CROSSOVER_MISSING =
  'engine_is_crossover_missing' as const
/**
 * Phase 87 (87-54): where CrossOver's `bin` directory is, over `{hintWineBins}`: answers the path or `null` for "not
 * installed". Its first shim is 87-55's; the channel and the shell arm land here with the decision ops. Bounded: the
 * Spotlight search it may run has its own 10 s limit.
 */
export const RUST_ENGINE_CX_RESOLVE_BIN_DIR =
  'engine_cx_resolve_bin_dir' as const
/**
 * Phase 87 (87-54, D-03, D-15): the Steam bridge's engine-state writes, reached through the shims in
 * `enginewine/state.ts`. `engine_state_record_decision` takes `{runner, appName, bottleName, override, selection?,
 * preflight?, facts}` (the facts are the bridge's own, as values) and answers whether a decision was recorded; the two
 * overlay notices take `{runner, appName, step}` and `{runner, appName}` and answer whether they published. All three are
 * in-memory and bounded.
 */
/**
 * Phase 87 (87-54, D-17): a Steam bridge launch's deadline, reached through the shims in `enginewine/deadline.ts`.
 * `engine_deadline_arm` takes `{key}` and arms the 180 s deadline of a bridge launch (no process watch: the bridge's own
 * monitor cancels it); when it fires Rust sends the sidecar `engineDeadlineFired {key, reason: 'no-game-process'}`, which
 * only Rust can send. `engine_deadline_cancel` takes `{key, reason}` (the closed `DeadlineCancelReason` set) and answers
 * `true` when one was armed. Both are in-memory and bounded.
 */
export const RUST_ENGINE_DEADLINE_ARM = 'engine_deadline_arm' as const
export const RUST_ENGINE_DEADLINE_CANCEL = 'engine_deadline_cancel' as const
/**
 * Phase 87 (87-55, D-03, Pitfall 10): the Steam bridge's tool runs, reached through the shims in
 * `enginewine/runTool.ts`. `engine_run_tool` takes `{tool, args, timeoutMs, cancelId?}` and answers the TS
 * `RunToolResult` `{code, stdout, stderr, timedOut, aborted}`: one of five allowlisted absolute-path programs, run with
 * the isolated profile (a program outside the list is an answer, `stderr: "tool not allowed: ..."`, not a spawn).
 * An `AbortSignal` cannot cross `rustInvoke`, so the caller names a run with a `cancelId` and `engine_cancel`
 * (`{cancelId}`, answers whether a run was in flight) cancels it. `engine_run_tool` carries the caller's own
 * `timeoutMs` (a CrossOver runner clone is a multi-minute `cp -R`), so it joins the sidecar's unbounded list; the
 * cancel is a lookup and stays bounded.
 */
export const RUST_ENGINE_RUN_TOOL = 'engine_run_tool' as const
export const RUST_ENGINE_CANCEL = 'engine_cancel' as const
/**
 * Phase 87 (87-56a, D-03, D-23): the settings a Wine tool (Winetricks apply, its catalog and installed list, Run EXE in
 * prefix) acts on for a game, outside any launch, reached through `resolveEngineToolSettings` in
 * `enginewine/toolSettings.ts`. `engine_resolve_tool_settings` takes `{runner, appName, platform?, stored, ensureBottle}` and
 * answers the `ToolSettingsResult` (`{kind: 'stored' | 'engine' | 'unavailable', ...}`). Rust reads the live selection and
 * the per-launch overlay from its own registry, so a tool during a live fallback-engine launch acts on the launch's
 * engine. With `ensureBottle` it may create the game's bottle (and download the pinned engine), so it joins the
 * sidecar's unbounded list. `engine_non_crossover_engine` takes `{engineId}` and answers the built-in or Wine Manager
 * engine that id runs on, `null` when it is not installed; a read, so bounded.
 */
export const RUST_ENGINE_RESOLVE_TOOL_SETTINGS =
  'engine_resolve_tool_settings' as const
export const RUST_ENGINE_NON_CROSSOVER_ENGINE =
  'engine_non_crossover_engine' as const
/**
 * Phase 87 (87-56a, D-01, D-10): the first-need download of the pinned fallback engine (a ~228 MB archive), reached
 * through `ensureFallbackEngine` in `enginewine/fallback.ts`. `engine_fallback_ensure` takes `{pinId, appName, runner,
 * cancelId?}` (a pin id only: the crate resolves it in its own pin table, verifies size and sha256 and contains the
 * extraction) and answers the `PinnedEngineResult` (`{ok: true, engine}` or `{ok: false, aborted, reason, error}`). Rust
 * sends the `gameStatusUpdate` `engine-download` sequence itself. An `AbortSignal` cannot cross `rustInvoke`, so a caller
 * names the run with a `cancelId` and sends `engine_cancel`. It has no limit of its own beyond that cancel and the app
 * shutdown (D-17), so it joins the sidecar's unbounded list.
 */
export const RUST_ENGINE_FALLBACK_ENSURE = 'engine_fallback_ensure' as const
/**
 * Phase 88 (SVC-03, 88-12, D-01, D-19): the known-fix launch overrides of a non-Steam game, reached through
 * `readKnownFixLaunchOverrides` in `launchrust/knownFixes.ts`. `knownfix_launch_overrides` takes one object,
 * `{appName, runner, installPath}` (`installPath` is `null` when the install folder is unknown), and answers
 * `{launchArgs, exeOverride?}`: the fix's `launchArgs` as they are and its `exeOverride` once checked against
 * the install folder. A disk read, so it stays inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
 */
export const RUST_KNOWNFIX_LAUNCH_OVERRIDES =
  'knownfix_launch_overrides' as const
export const RUST_ENGINE_STATE_RECORD_DECISION =
  'engine_state_record_decision' as const
export const RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE =
  'engine_state_publish_overlay_notice' as const
export const RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE =
  'engine_state_publish_overlay_exit_notice' as const

/**
 * Rust-side channel name: quick 261117-ubb. Resolves the pinned, Valve-signed `libsteam_api.dylib`
 * the macOS bridge helper loads: the GameLib cache, else a snapshot of the Steam client's own copy
 * when it already hashes to the pin, else a fetch from Valve's client-update CDN (sha2vz, VZ decode,
 * dylib sha256 and Valve team-ID checks before it is cached). Args: none (the shell derives every
 * path from `HOME` itself). Resolves `{ source: 'cached' | 'snapshot' | 'fetched' | 'unpinned' |
 * 'unsupported', path: string | null, pinSha256, steamUser, detail: string | null }`; `path` is set
 * only for cached/snapshot/fetched. macOS only: every other platform answers `unsupported` without
 * touching the network or the filesystem. Bounded at 50 s on the Rust side (connect 10 s, request
 * 45 s), under the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`.
 */
export const RUST_STEAM_API_PIN_RESOLVE = 'steam_api_pin_resolve' as const

/**
 * Rust-side channel name: open a fail-closed child `WebviewWindow` on any https URL
 * (Phase 34.4.1 Plan 01, D-01/D-02, REQ-34.4.1-01/REQ-34.4.1-09). Runner-agnostic by
 * design -- nothing in Rust knows what Humble is; this is the mechanism Phase 34.5
 * inherits for Epic/GOG/Amazon too. Args: `[url: string, visible: boolean,
 * userAgent: string]`. Resolves the generated window label (never `main`/`about`, never
 * derived from `url` -- T-34.1-27).
 */
export const RUST_HUMBLE_LOGIN_OPEN = 'humble_login_open' as const

/**
 * Rust-side channel name: read the login window's cookie jar with a domain-suffix filter
 * (Phase 34.4.1 Plan 01, D-02, REQ-34.4.1-01). Args: `[label: string, host: string,
 * names: string[]]`. Resolves `{ total: number, matched: Array<{name, domain, value}> }`
 * -- `total` is the UNFILTERED jar size, the liveness proof that distinguishes a
 * genuinely empty jar from a silently dead cookie API
 * (`navigator-clipboard-noops-under-tauri`'s failure shape). Never `cookies_for_url()`
 * -- see `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md`.
 */
export const RUST_HUMBLE_LOGIN_COOKIES = 'humble_login_cookies' as const

/**
 * Rust-side channel name: read the login window's cookie jar with a domain-suffix filter,
 * in the OPPOSITE argument direction from `RUST_HUMBLE_LOGIN_COOKIES` above (Phase 34.4.1
 * Plan 22, F-6 Defect A, REQ-34.4.1-GAP-07). `RUST_HUMBLE_LOGIN_COOKIES` answers "does this
 * cookie's domain cover the page I am on?" (page host first) -- the correct direction for
 * `watchForLogin()`'s poll, proven by spike 014a, and NEVER used for this channel. This
 * channel answers the DIFFERENT question the disconnect census asks: "does this cookie
 * belong to the target domain or any of its subdomains?" (the cookie's OWN domain first, the
 * fixed target second). Passing a fixed apex through the page-host-first direction can never
 * match a leading-dot- or subdomain-scoped cookie, which is exactly how the census silently
 * undercounted (spike 016, live: total=33, page-host direction=29, this direction=33 -- see
 * `34.4.1-SPIKE-016-FINDINGS.md`). Args: `[label: string, domain: string, names: string[]]`.
 * Resolves the SAME `{ total: number, matched: Array<{name, domain, value}> }` shape as
 * `RUST_HUMBLE_LOGIN_COOKIES` -- `total` is still the UNFILTERED jar size, the same liveness
 * proof. Never `cookies_for_url()` -- see
 * `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md`.
 */
export const RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN =
  'humble_login_cookies_for_domain' as const

/**
 * Rust-side channel name: drain the login window's queued main-frame navigation events
 * (Phase 34.4.1 Plan 01, REQ-34.4.1-03). Args: `[label: string]`. Resolves an array of
 * `{ event: 'started' | 'finished', url: string }`, relayed from `on_page_load` --
 * NEVER `on_navigation`, which also fires for third-party iframes and would let an ad
 * frame re-arm a login watch's deadline indefinitely.
 */
export const RUST_HUMBLE_LOGIN_TAKE_EVENTS = 'humble_login_take_events' as const

/**
 * Rust-side channel name: close a login window (Phase 34.4.1 Plan 01, D-01). Args:
 * `[label: string]`. Resolves `Bool(existed)` -- a missing label is a healthy
 * already-closed state, never an error.
 */
export const RUST_HUMBLE_LOGIN_CLOSE = 'humble_login_close' as const

/**
 * Rust-side channel name: domain-scoped cookie clear for `humbleDisconnect` and
 * `LegendaryUser.logout()`'s Tauri branch (Phase 34.4.1 Plan 01/23, D-08, REQ-34.4.1-06,
 * F-6 Defect B). Args: `[label: string, domain: string]`. Resolves a measured delete
 * count -- on every platform, the number is a re-read of the matching-cookie count taken
 * AFTER the removal actually ran, never an attempted/pre-removal count, so a clear that
 * removed nothing resolves `0` rather than reporting the size of what it merely tried to
 * remove. On macOS this goes through `WKWebsiteDataStore` (never wry's `delete_cookie()`,
 * whose `Ok(())` fires unconditionally regardless of whether anything was actually
 * deleted -- bugs.webkit.org #184938); Linux/Windows keep the existing `delete_cookie()`
 * path, UNVERIFIED and DECLARED as such (D-09/REQ-34.4.1-13). Never a blanket wipe -- the
 * platform cookie jar is app-wide and will hold Epic/GOG/Amazon cookies once Phase 34.5
 * lands, so this is scoped strictly to `domain`'s suffix match, never
 * `clear_all_browsing_data()`.
 */
export const RUST_HUMBLE_LOGIN_CLEAR_COOKIES =
  'humble_login_clear_cookies' as const

/**
 * Rust-side channel name: issue the Humble reveal-key POST from a hidden, on-demand login
 * window's own JS context (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05). `humblePostRequest`
 * (`backend/humble/adapter.ts`) routes here under Tauri instead of Electron's `net.request` --
 * a genuine WKWebView `fetch()` is the one structurally-new transport with its own real
 * browser TLS/HTTP fingerprint (the `humble-reveal-key-fails` debug session's rounds 1-5
 * already falsified cookie/header fidelity as the cause; this channel does not re-run them).
 * Args: `[originUrl: string, path: string, body: string, csrfToken: string | null,
 * userAgent: string]`. Resolves `{ status: number, body: string }` -- a non-2xx `status` is a
 * normal, DECLARED outcome (D-07), never an error thrown by this channel itself; only a
 * structural failure (bad args, no window, a script error, or a timeout) rejects. The hidden
 * window this arm opens is per-call: opened on demand and closed on EVERY exit path (success,
 * script error, and timeout alike) -- no idle authenticated window persists between reveals
 * (D-08, the orphan-session concern Phase 34 WR-03 raised for the sidecar itself).
 */
export const RUST_HUMBLE_REVEAL_POST = 'humble_reveal_post' as const

/**
 * Rust-side channel name: origin-scoped storage clear (34.4.1 gap cycle plan 15, F-6 BLOCKING,
 * REQ-34.4.1-06/REQ-34.4.1-GAP-03). Same hidden-window + navigation-intercept-exfil template as
 * `RUST_HUMBLE_REVEAL_POST` -- clears `localStorage`, `sessionStorage`, IndexedDB, Cache Storage
 * and service-worker registrations for the loaded page's OWN origin only, scoped by construction
 * via same-origin policy rather than by a filter that could be got wrong. Args:
 * `[originUrl: string, userAgent: string]`. Resolves `{ localStorage, sessionStorage, indexedDB,
 * caches, serviceWorkers }`, where each value is a `number` (items cleared) or the literal string
 * `'unsupported'` -- NEVER a coerced `0` for a category the engine does not expose. This is NOT a
 * new IPC channel in the `humble*` ported-channel sense -- it is a Rust arm behind the existing
 * `LoginWindowSeam`, so it adds no row to `34.4.1-PORTED-CHANNELS.md`'s 7-channel table. Called
 * from the Humble disconnect flow in `src/backend/humble/user.ts` via `seam.clearStorage(...)`.
 */
export const RUST_HUMBLE_LOGIN_CLEAR_STORAGE =
  'humble_login_clear_storage' as const

/**
 * Rust-side channel names for the in-app store embed (Phase 40 Plan 02 shipped the first five;
 * Plan 05, D-01/D-03/D-17/D-18/D-21/D-22/D-25/D-29, defines the full set here — including the
 * four navigation arms plan `40-07` implements — so that plan never has to edit this file and
 * collide with a concurrent plan). All nine are gated to a single fixed-label webview
 * (`STORE_EMBED_LABEL = "store-embed"`, `src-tauri/src/main.rs`); none take a label argument.
 *
 * The first five below are LIVE (`40-02-SUMMARY.md` records their shipped argument/return
 * shapes). The last four have no Rust arm yet — `back`/`forward`/`reload`/`navigate` are
 * declared here only so `storeEmbedFlowRegistration.ts`'s `StoreEmbedSeam` implementation can
 * reference a stable channel name while its methods throw a declared-unimplemented Error naming
 * `40-07` as owner (D-25: no native back/forward/history API exists on `tauri::webview::Webview`
 * or `wry::WebView`, confirmed by `40-EMBED-API-VERIFICATION.md` Q1/Q2 — a Rust-side history
 * stack fed by `on_page_load` is the only mechanism, and `40-07` is the plan that builds it).
 */

/**
 * Opens (or, if already open, re-points — D-01 idempotency) the store embed. Args:
 * `[url: string, x: number, y: number, w: number, h: number]` — bounds are LOGICAL px, courier
 * discipline (D-18): no rounding, clamping, default or fallback anywhere in the TypeScript
 * layer. Resolves `Value::Null` on success (40-02-SUMMARY.md) — NOT a window label, unlike
 * `RUST_HUMBLE_LOGIN_OPEN`; the embed's label is the fixed `STORE_EMBED_LABEL` constant, known
 * statically to both sides.
 */
export const RUST_STORE_EMBED_OPEN = 'store_embed_open' as const

/**
 * Re-bounds the store embed. Args: `[x: number, y: number, w: number, h: number]`, same
 * courier discipline as `RUST_STORE_EMBED_OPEN` above (D-18) — spike 017 proved a second
 * geometry writer (a substituted/defaulted rect) wins silently with no error, so a missing or
 * non-finite coordinate must throw rather than be coerced. Resolves `Value::Null`. This is the
 * one channel in this group that is SEND-kind end to end (renderer → preload → sidecar) — it
 * fires on every `ResizeObserver` tick and must never accumulate promises (D-29).
 */
export const RUST_STORE_EMBED_SET_BOUNDS = 'store_embed_set_bounds' as const

/** Hides the store embed without destroying it (D-21: history/state survive a hide). No args. Resolves `Value::Null`. */
export const RUST_STORE_EMBED_HIDE = 'store_embed_hide' as const

/** Re-shows a previously hidden store embed. No args. Resolves `Value::Null`. */
export const RUST_STORE_EMBED_SHOW = 'store_embed_show' as const

/** Closes the store embed and clears its Rust-side history (D-21: teardown only, never a route-leave hide). No args. Resolves `Value::Null`. */
export const RUST_STORE_EMBED_CLOSE = 'store_embed_close' as const

/**
 * DRAINS (never peeks) the navigation states queued by the embed's `on_page_load` Finished
 * handler — D-22's inversion: back/forward availability is PUSHED state the renderer receives,
 * never a `canGoBack()` it can synchronously ask for. Takes no args, returns an array of
 * `StoreEmbedNavEvent`-shaped objects, oldest first.
 *
 * Live in Rust since quick task `260905-e61` (GAP-D, REQ-40-06). Until then this was the ONLY
 * one of the five nav channels with no dispatch arm, which is precisely why an in-embed link
 * click never reached the renderer: the four arms below report state for navigations the
 * CHROME initiated, and nothing reported the ones the PAGE initiated.
 */
export const RUST_STORE_EMBED_TAKE_NAV_EVENTS =
  'store_embed_take_nav_events' as const

/** Navigates the embed backward one step (live since plan `40-07`, D-22/D-25). */
export const RUST_STORE_EMBED_BACK = 'store_embed_back' as const

/** Navigates the embed forward one step (live since plan `40-07`, D-22/D-25). */
export const RUST_STORE_EMBED_FORWARD = 'store_embed_forward' as const

/** Reloads the embed's current page (live since plan `40-07`, D-22/D-25). */
export const RUST_STORE_EMBED_RELOAD = 'store_embed_reload' as const

/** Args: `[{ url: string }]`. Navigates the embed to a new URL within the existing webview (live since plan `40-07`, D-22/D-25). */
export const RUST_STORE_EMBED_NAVIGATE = 'store_embed_navigate' as const

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
  RUST_NOTIFICATION_SHOW,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER,
  RUST_SHELL_OPEN_PATH,
  RUST_APP_EXIT,
  RUST_APP_RELAUNCH,
  RUST_APP_HIDE,
  RUST_MAIN_WINDOW_RAISE,
  RUST_MAIN_WINDOW_HIDE,
  RUST_STEAM_WINDOW_RAISE,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_CLIPBOARD_READ_TEXT,
  RUST_TRAY_SET_ICON,
  RUST_HUMBLE_LOGIN_OPEN,
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
  RUST_HUMBLE_LOGIN_TAKE_EVENTS,
  RUST_HUMBLE_LOGIN_CLOSE,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES,
  RUST_HUMBLE_REVEAL_POST,
  RUST_HUMBLE_LOGIN_CLEAR_STORAGE,
  RUST_STORE_EMBED_OPEN,
  RUST_STORE_EMBED_SET_BOUNDS,
  RUST_STORE_EMBED_HIDE,
  RUST_STORE_EMBED_SHOW,
  RUST_STORE_EMBED_CLOSE,
  RUST_STORE_EMBED_TAKE_NAV_EVENTS,
  RUST_STORE_EMBED_BACK,
  RUST_STORE_EMBED_FORWARD,
  RUST_STORE_EMBED_RELOAD,
  RUST_STORE_EMBED_NAVIGATE,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP,
  RUST_SCAN_STEAM_API_IMPORTS,
  RUST_SCAN_STEAM_DRM,
  RUST_SCAN_STEAMSTUB_SECTION,
  RUST_SCAN_PE_IMPORTED_DLLS,
  RUST_SCAN_CONTAINED_REAL,
  RUST_SCAN_WINEMAC_METAL_EXPORTS,
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE,
  RUST_STORE_VERSION_GATE,
  RUST_STORE_BACKUP_FILE,
  RUST_STORE_READ_ONLY_NOTICE,
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY,
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_PARSE_VALVE_MANIFEST,
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_INSTALLSCRIPT,
  RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY,
  RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE,
  RUST_STEAMFILES_READ_RUNNING_APP_ID,
  RUST_STEAMFILES_SCAN_ACFS,
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ,
  RUST_STEAMCM_ANON_CLOSE,
  RUST_STEAMCM_ANON_PRODUCT_INFO,
  RUST_STEAMCM_CONFIGURE,
  RUST_STEAMCM_CONTENT_SERVERS,
  RUST_STEAMCM_DEPOT_KEY,
  RUST_STEAMCM_LICENSES,
  RUST_STEAMCM_MAC_OWNED_APPS,
  RUST_STEAMCM_MANIFEST_REQUEST_CODE,
  RUST_STEAMCM_OWNED_APPS,
  RUST_STEAMCM_PERSONAS,
  RUST_STEAMCM_PRODUCT_INFO,
  RUST_STEAMCM_REDEEM_KEY,
  RUST_STEAMCM_REFRESH,
  RUST_STEAMCM_SESSION_ACQUIRE,
  RUST_STEAMCM_SESSION_ACQUIRE_OPEN,
  RUST_STEAMCM_SESSION_ENSURE_CONNECTED,
  RUST_STEAMCM_SESSION_LOGOUT,
  RUST_STEAMCM_SESSION_RELEASE,
  RUST_STEAMCM_SESSION_SHUTDOWN,
  RUST_STEAMCM_SESSION_STATUS,
  RUST_STEAMCM_SIGNIN_CANCEL,
  RUST_STEAMCM_SIGNIN_CREDENTIALS_START,
  RUST_STEAMCM_SIGNIN_GUARD_SUBMIT,
  RUST_STEAMCM_SIGNIN_QR_START,
  RUST_STEAMCM_SIGNIN_STATUS,
  RUST_STEAMCM_STORE_APPDETAILS,
  RUST_STEAMCM_STORE_ENRICH,
  RUST_STEAMCM_WRAP_RESTORE_IF_OWED,
  RUST_STEAM_API_PIN_RESOLVE,
  RUST_STEAMPOLL_ACF_ENUMERATE_COPIES,
  RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS,
  RUST_STEAMPOLL_ACF_READ_STATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR,
  RUST_STEAMPOLL_ACF_REMOVE_COPY,
  RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING,
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH,
  RUST_STEAMPOLL_BREADCRUMB_INSTALLED_ON_DISK,
  RUST_STEAMPOLL_BRIDGE_FINALIZED,
  RUST_STEAMPOLL_HOLD_DISCARD,
  RUST_STEAMPOLL_HOLD_DRAIN,
  RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED,
  RUST_STEAMPOLL_INSTALL_START,
  RUST_STEAMPOLL_INSTALL_STOP,
  RUST_STEAMPOLL_MAC_ARCH_VERDICT,
  RUST_STEAMPOLL_NATIVE_IN_FLIGHT,
  RUST_STEAMPOLL_NEXT_NOTICE_SEQ,
  RUST_STEAMPOLL_READ_RUNNING_APP_ID,
  RUST_STEAMPOLL_RUNNING_HOLD,
  RUST_STEAMPOLL_RUNNING_LAST_APP_ID,
  RUST_STEAMPOLL_RUNNING_RELEASE,
  RUST_STEAMPOLL_RUNNING_START,
  RUST_STEAMPOLL_RUNNING_STOP,
  RUST_STEAMPOLL_STATUS,
  RUST_STEAMPOLL_UNINSTALL_START,
  RUST_STEAMPOLL_UNINSTALL_STOP,
  RUST_INFO_RECENT_ADD,
  RUST_INFO_RECENT_REMOVE,
  RUST_INFO_OVERRIDES_GET,
  RUST_INFO_OVERRIDES_GET_ALL,
  RUST_INFO_OVERRIDES_SET,
  RUST_INFO_OVERRIDES_ATTACH,
  RUST_INFO_ANTICHEAT_INFO,
  RUST_INFO_ANTICHEAT_STATUS,
  RUST_INFO_ANTICHEAT_DOWNLOAD,
  RUST_INFO_GOG_DISCOUNTS,
  RUST_INFO_CROSSOVER_RATING_MAP,
  RUST_INFO_UMU_GET,
  RUST_INFO_WIKI_GET,
  RUST_INFO_WIKI_CACHE_CLEAR,
  RUST_WINE_RUNTIME_IS_INSTALLED,
  RUST_WINE_RUNTIME_DOWNLOAD,
  RUST_WINE_MANAGER_REFRESH,
  RUST_WINE_MANAGER_INSTALL,
  RUST_WINE_MANAGER_LIST,
  RUST_WINE_RELEASES_INFO_READY,
  RUST_WINE_VALID,
  RUST_WINE_RUN_COMMAND,
  RUST_WINE_DISCOVER_ALTERNATIVES,
  RUST_WINE_DISCOVER_CROSSOVER,
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_WINETRICKS_APPLY,
  RUST_WINE_WINETRICKS_AVAILABLE,
  RUST_WINE_WINETRICKS_INSTALLED,
  RUST_WINE_WINETRICKS_INSTALL,
  RUST_WINE_WINETRICKS_LIST_INSTALLED,
  RUST_WINE_RUN_COMMAND_FOR_GAME,
  RUST_WINE_TOOL_CALL,
  RUST_ENGINE_SET_ONLINE,
  RUST_ENGINE_BOTTLE_PREPARE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_KILL_WINESERVER,
  RUST_ENGINE_BOTTLE_REMOVE_CREATED,
  RUST_ENGINE_BOTTLE_REMOVE_PER_GAME,
  RUST_ENGINE_BOTTLE_RECONCILE_MARKER,
  RUST_ENGINE_BOTTLE_RECORD_PINNED,
  RUST_ENGINE_BOTTLE_RECORD_CROSSOVER,
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR,
  RUST_ENGINE_LAUNCH_SELECT,
  RUST_ENGINE_LAUNCH_ARM_DEADLINE,
  RUST_ENGINE_LAUNCH_END,
  RUST_ENGINE_LAUNCH_SETTINGS_GET,
  RUST_ENGINE_STATE_GET,
  RUST_ENGINE_DIALOG_DISPLAYED,
  RUST_ENGINE_DECIDE_LAUNCH,
  RUST_ENGINE_DECIDE_CREATION,
  RUST_ENGINE_PREFLIGHT_CROSSOVER,
  RUST_ENGINE_IS_CROSSOVER_MISSING,
  RUST_ENGINE_CX_RESOLVE_BIN_DIR,
  RUST_ENGINE_STATE_RECORD_DECISION,
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE,
  RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE,
  RUST_ENGINE_DEADLINE_ARM,
  RUST_ENGINE_DEADLINE_CANCEL,
  RUST_ENGINE_RUN_TOOL,
  RUST_ENGINE_CANCEL,
  RUST_ENGINE_RESOLVE_TOOL_SETTINGS,
  RUST_ENGINE_NON_CROSSOVER_ENGINE,
  RUST_ENGINE_FALLBACK_ENSURE,
  RUST_KNOWNFIX_LAUNCH_OVERRIDES
] as const

/** Phase 63 (D-03): the scanner channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_SCAN_CHANNELS = [
  RUST_SCAN_STEAM_API_IMPORTS,
  RUST_SCAN_STEAM_DRM,
  RUST_SCAN_STEAMSTUB_SECTION,
  RUST_SCAN_PE_IMPORTED_DLLS,
  RUST_SCAN_CONTAINED_REAL,
  RUST_SCAN_WINEMAC_METAL_EXPORTS
] as const

export type RustScanChannel = (typeof RUST_SCAN_CHANNELS)[number]

/** Phase 82 (D-07): the safety channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_SAFETY_CHANNELS = [
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE
] as const

export type RustSafetyChannel = (typeof RUST_SAFETY_CHANNELS)[number]

/** Phase 75: the steamfiles channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_STEAMFILES_CHANNELS = [
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_PARSE_VALVE_MANIFEST,
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_INSTALLSCRIPT,
  RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY,
  RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE,
  RUST_STEAMFILES_READ_RUNNING_APP_ID,
  RUST_STEAMFILES_SCAN_ACFS,
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ
] as const

export type RustSteamFilesChannel = (typeof RUST_STEAMFILES_CHANNELS)[number]

/** Phase 73 (D-03): the depot channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_DEPOT_CHANNELS = [
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_CANCEL,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_MANIFEST_SUMMARY
] as const

/** Phase 80: the steampoll channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_STEAMPOLL_CHANNELS = [
  RUST_STEAMPOLL_ACF_ENUMERATE_COPIES,
  RUST_STEAMPOLL_ACF_FIND_OTHER_MANIFESTS,
  RUST_STEAMPOLL_ACF_READ_STATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE,
  RUST_STEAMPOLL_ACF_READ_UPDATE_FROM_DIR,
  RUST_STEAMPOLL_ACF_REMOVE_COPY,
  RUST_STEAMPOLL_ACF_SCAN_DOWNLOADING,
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_ADOPTION_WATCH,
  RUST_STEAMPOLL_BREADCRUMB_INSTALLED_ON_DISK,
  RUST_STEAMPOLL_BRIDGE_FINALIZED,
  RUST_STEAMPOLL_HOLD_DISCARD,
  RUST_STEAMPOLL_HOLD_DRAIN,
  RUST_STEAMPOLL_INSTALL_CANCEL_DELEGATED,
  RUST_STEAMPOLL_INSTALL_START,
  RUST_STEAMPOLL_INSTALL_STOP,
  RUST_STEAMPOLL_MAC_ARCH_VERDICT,
  RUST_STEAMPOLL_NATIVE_IN_FLIGHT,
  RUST_STEAMPOLL_NEXT_NOTICE_SEQ,
  RUST_STEAMPOLL_READ_RUNNING_APP_ID,
  RUST_STEAMPOLL_RUNNING_HOLD,
  RUST_STEAMPOLL_RUNNING_LAST_APP_ID,
  RUST_STEAMPOLL_RUNNING_RELEASE,
  RUST_STEAMPOLL_RUNNING_START,
  RUST_STEAMPOLL_RUNNING_STOP,
  RUST_STEAMPOLL_STATUS,
  RUST_STEAMPOLL_UNINSTALL_START,
  RUST_STEAMPOLL_UNINSTALL_STOP
] as const

export type RustSteamPollChannel = (typeof RUST_STEAMPOLL_CHANNELS)[number]

/** Phase 79: the Rust CM channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_STEAMCM_CHANNELS = [
  RUST_STEAMCM_ANON_CLOSE,
  RUST_STEAMCM_ANON_PRODUCT_INFO,
  RUST_STEAMCM_CONFIGURE,
  RUST_STEAMCM_CONTENT_SERVERS,
  RUST_STEAMCM_DEPOT_KEY,
  RUST_STEAMCM_LICENSES,
  RUST_STEAMCM_MAC_OWNED_APPS,
  RUST_STEAMCM_MANIFEST_REQUEST_CODE,
  RUST_STEAMCM_OWNED_APPS,
  RUST_STEAMCM_PERSONAS,
  RUST_STEAMCM_PRODUCT_INFO,
  RUST_STEAMCM_REDEEM_KEY,
  RUST_STEAMCM_REFRESH,
  RUST_STEAMCM_SESSION_ACQUIRE,
  RUST_STEAMCM_SESSION_ACQUIRE_OPEN,
  RUST_STEAMCM_SESSION_ENSURE_CONNECTED,
  RUST_STEAMCM_SESSION_LOGOUT,
  RUST_STEAMCM_SESSION_RELEASE,
  RUST_STEAMCM_SESSION_SHUTDOWN,
  RUST_STEAMCM_SESSION_STATUS,
  RUST_STEAMCM_SIGNIN_CANCEL,
  RUST_STEAMCM_SIGNIN_CREDENTIALS_START,
  RUST_STEAMCM_SIGNIN_GUARD_SUBMIT,
  RUST_STEAMCM_SIGNIN_QR_START,
  RUST_STEAMCM_SIGNIN_STATUS,
  RUST_STEAMCM_STORE_APPDETAILS,
  RUST_STEAMCM_STORE_ENRICH,
  RUST_STEAMCM_WRAP_RESTORE_IF_OWED
] as const

/** Phase 86: the Rust leaf information channels, a subset of {@link RUST_INVOKE_CHANNELS}. */
export const RUST_INFO_CHANNELS = [
  RUST_INFO_RECENT_ADD,
  RUST_INFO_RECENT_REMOVE,
  RUST_INFO_OVERRIDES_GET,
  RUST_INFO_OVERRIDES_GET_ALL,
  RUST_INFO_OVERRIDES_SET,
  RUST_INFO_OVERRIDES_ATTACH,
  RUST_INFO_ANTICHEAT_INFO,
  RUST_INFO_ANTICHEAT_STATUS,
  RUST_INFO_ANTICHEAT_DOWNLOAD,
  RUST_INFO_GOG_DISCOUNTS,
  RUST_INFO_CROSSOVER_RATING_MAP,
  RUST_INFO_UMU_GET,
  RUST_INFO_WIKI_GET,
  RUST_INFO_WIKI_CACHE_CLEAR
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

/** Stable code carried in the JSON tail of an `IPC_INVALID_ARGS_MARKER` error. */
export const IPC_INVALID_ARGS = 'IPC_INVALID_ARGS' as const

/**
 * Marker prefixed to the `error` of an invoke response rejected because its args failed the
 * channel's schema at the sidecar boundary (Phase 67, D-08/D-11). The error stays a plain
 * string because the Rust reader takes `error` with `as_str()`; the typed part is a JSON tail
 * after the marker. The tail carries the channel, sanitised issue paths and issue codes ONLY,
 * never argument values, issue messages or unrecognized key names (D-10).
 *
 * Pure and zod-free: the preload value-imports this file, and D-04 keeps zod out of the
 * renderer.
 */
export const IPC_INVALID_ARGS_MARKER = '[GAMELIB_IPC_INVALID_ARGS]' as const

/**
 * Marker prefixed to the error the Rust relay returns when the renderer names a channel that is
 * not on the generated renderer allow-list (Phase 67, D-14). Rejected before anything crosses
 * the pipe. Mirrored as a literal in `src/frontend/bootErrorSurface.ts` (zero-import module).
 */
export const IPC_INVALID_CHANNEL_MARKER =
  '[GAMELIB_IPC_INVALID_CHANNEL]' as const

export interface IpcInvalidArgsPayload {
  code: typeof IPC_INVALID_ARGS
  channel: string
  paths: string[]
  codes: string[]
}

/** Builds the wire `error` string for a rejected invoke. */
export function formatIpcInvalidArgsError(p: IpcInvalidArgsPayload): string {
  return `${IPC_INVALID_ARGS_MARKER} ${JSON.stringify(p)}`
}

/** Parses a wire `error` string back to its payload; null on any mismatch, never throws. */
export function parseIpcInvalidArgsError(
  message: string
): IpcInvalidArgsPayload | null {
  try {
    const at = message.indexOf(IPC_INVALID_ARGS_MARKER)
    if (at === -1) return null
    const value: unknown = JSON.parse(
      message.slice(at + IPC_INVALID_ARGS_MARKER.length).trim()
    )
    if (!value || typeof value !== 'object') return null
    const v = value as Record<string, unknown>
    const isStrings = (x: unknown): x is string[] =>
      Array.isArray(x) && x.every((s) => typeof s === 'string')
    if (
      v.code !== IPC_INVALID_ARGS ||
      typeof v.channel !== 'string' ||
      !isStrings(v.paths) ||
      !isStrings(v.codes)
    ) {
      return null
    }
    return {
      code: IPC_INVALID_ARGS,
      channel: v.channel,
      paths: v.paths,
      codes: v.codes
    }
  } catch {
    return null
  }
}

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
 * orphan. Since Phase 85 (85-17) it is a NATIVE channel (`nativeChannels.json`, slice `store`):
 * the Rust shell checks the policy and applies it through `StoreHost`. The sidecar has no handler
 * of its own (its shell-only fallback was deleted in 85-21, D-03).
 */
export const STORE_SET_CHANNEL = 'storeSet' as const

/**
 * `send`-kind (fire-and-forget) channel name for a single-key store delete. ALREADY emitted
 * by `tauriTransport.ts`'s `snapshotDelete()` (`send('storeDelete', [storeName, key])`) —
 * must match that literal exactly. A native channel since Phase 85 (85-17), like
 * `STORE_SET_CHANNEL`.
 */
export const STORE_DELETE_CHANNEL = 'storeDelete' as const

/**
 * `send`-kind (fire-and-forget) channel name for registering a new store (mirrors
 * `misc.ts`'s `storeNew` / `tauriTransport.ts`'s `registerStore()`). A native channel since
 * Phase 85 (85-17).
 */
export const STORE_NEW_CHANNEL = 'storeNew' as const

/**
 * `invoke`-kind renderer channel for D-03's lazy per-store hydrate: the renderer fetches one
 * `LAZY_STORES` store's filtered snapshot on first access instead of every store being eagerly
 * hydrated at boot. Since Phase 85 (85-16) it is a NATIVE channel (`nativeChannels.json`, slice
 * `store`): the Rust shell answers it from `StoreHost` and the result is `{ values, rev }`.
 */
export const STORE_FETCH_CHANNEL = 'sidecar:store-fetch' as const

/**
 * `invoke`-kind INTERNAL RPC channel, ridden over `SIDECAR_INVOKE`, for a CONFIRMED single-key
 * store write (Phase 64 plan 03). Unlike the fire-and-forget `STORE_SET_CHANNEL` it carries a
 * response: `true` only when the write was persisted, and `false` when any write guard refused it
 * or the write threw. Since Phase 85 (85-17) it is a NATIVE channel: the Rust shell applies it
 * through `StoreHost` behind the same policy.
 */
export const STORE_SET_CHECKED_CHANNEL = 'sidecar:store-set-checked' as const

/**
 * The key beside the store names in the Rust snapshot (`SIDECAR_STORE_SNAPSHOT`, built from the
 * `StoreHost` since 85-16) under which each store's rev rides (`{ [store]: rev }`). It can never be
 * a store name: store names are `[A-Za-z0-9_-]`.
 */
export const STORE_REV_KEY = '@rev' as const

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
 *
 * `invalidated` marks a WHOLE-STORE change that cannot be described key-by-key — a
 * `store.clear()` or a `CacheStore.commit()` flushing an in-memory map. On such a push
 * `key` carries no meaning (it is `''`) and the renderer must re-fetch the store rather
 * than patch a field. A per-key encoding of a bulk change cannot express REMOVALS, so a
 * cleared store would otherwise keep its stale keys in the renderer's snapshot for the
 * life of the window — the same failure WR-07 fixed for `hydrateStore` by making it
 * REPLACE rather than merge.
 */
export interface StoreChangedPayload {
  store: string
  key: string
  value?: unknown
  deleted?: boolean
  invalidated?: boolean
  /**
   * The store's change count after this change. Present when Rust owns the store (Phase 85, 85-17):
   * the shell emits every push in rev order and the boot snapshot (`STORE_REV_KEY`) and the lazy
   * fetch (`{ values, rev }`) carry the rev they were read at, so the renderer drops a push that is
   * not newer than what it already holds. Absent on a push the sidecar makes itself (a store no
   * Rust-owned file backs). Revs can skip: a change to a field the renderer may not read is never pushed.
   */
  rev?: number
}

/**
 * `send`-kind channel fired by the Rust shell itself (`src-tauri/src/main.rs`'s `.setup()`,
 * `WindowEvent::Focused(true)`) rather than by the renderer through the `sidecar_send`
 * command — the FIRST channel on this transport with that origin. Every other `send`-kind
 * constant in this file carries the `ipcRenderer.send` parity comment above (`makeListenerCaller`
 * fired from `src/preload/ipc.ts`); this one has no preload call site and no renderer-side
 * caller at all, so it does not appear in `RUST_INVOKE_CHANNELS` or any preload factory list.
 *
 * This does NOT contradict `SidecarRpcKind`'s direction-asymmetry note above — that note is
 * scoped to `rustInvoke` frames only (sidecar→Rust, never the reverse). `send`-kind frames
 * have always travelled shell→sidecar on the wire (`sidecar_send` writes them from Rust); what
 * changes here is only WHO on the Rust side decides to write one — a `.setup()` window-event
 * callback instead of a renderer-driven `ipcRenderer.send` call relayed through the command.
 *
 * Restores the Electron→Tauri cutover's dropped `mainWindow.on('focus', ...)` handler
 * (`src/backend/main.ts:272-274`, deleted in `5643c7583`), which drove
 * `SteamLibraryManager.refreshInstallState()` (D-01/D-02) so install/uninstall badges
 * reconcile when the user refocuses the window after using the native Steam client. Carries
 * no args — the sidecar-side listener re-derives everything it needs from its own state.
 */
export const SHELL_WINDOW_FOCUSED = 'shellWindowFocused' as const
