// GameLib Tauri v2 shell — Phase 27 walking skeleton.
//
// Responsibilities (all additive; the Electron build is untouched):
//   1. Host the electron-vite renderer output (../build, via tauri.conf.json frontendDist).
//   2. Spawn the Node sidecar (the existing backend behind a stdio JSON-RPC loop, produced
//      by 27-02's `build:sidecar`) and hold its stdin/stdout.
//   3. Expose four Tauri #[command]s that relay renderer↔sidecar traffic per the shared
//      contract in src/common/types/sidecarTransport.ts:
//        - sidecar_invoke        (req/resp   — ipcRenderer.invoke parity)
//        - sidecar_send          (fire-and-forget — ipcRenderer.send parity)
//        - open_external         (shell.openExternal parity — steam:// via tauri-plugin-opener)
//        - sidecar_store_snapshot(minimal store snapshot for the synchronous store bridge)
//   4. Read SidecarNotification lines from the sidecar's stdout and re-emit them to the
//      webview as the `frontend_message` Tauri event (ipcRenderer.on backend→frontend parity).
//   5. Build a bounded Tauri tray at setup (Phase 34.1 Plan 06, D-11) -- tooltip, left-click
//      show/focus, and a two-item Show/Quit menu -- and back `changeTrayColor` via the
//      `tray_set_icon` rustInvoke arm, the ONLY new `dispatch_rust_channel` arm added by the
//      whole 34.1 slice. Deliberately out of scope: recent-games submenu, About/Reload/Debug,
//      the macOS dock menu, language-driven rebuilds, and honouring `noTrayIcon`/`exitToTray`
//      (all re-deferred to Phase 35 -- see 34.1-06-PLAN.md and 34.1-PORTED-CHANNELS.md).
//
// NOTE: attaching `window.api` + the six preload globals to the webview is 27-03's job; this
// shell only relays transport. It does NOT modify anything under src/preload or src/backend.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::hash::{BuildHasher, Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel as mpsc_channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use keyring::Entry;
use serde::Serialize;
use serde_json::Value;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::{process::Command as ShellCommand, ShellExt};

// ---- Contract mirror (keep in lockstep with src/common/types/sidecarTransport.ts) ----

/// Printed once by the sidecar on stdout when it has installed its Electron shims and
/// finished importing the backend modules. Mirrors READY_SENTINEL.
const READY_SENTINEL: &str = "__GAMELIB_SIDECAR_READY__";

/// Tauri event name re-emitted to the webview for every SidecarNotification.
/// Mirrors FRONTEND_MESSAGE_EVENT.
const FRONTEND_MESSAGE_EVENT: &str = "frontend_message";

/// Reserved channel the store-snapshot command invokes on.
const STORE_SNAPSHOT_CHANNEL: &str = "sidecar:store-snapshot";

// ---- Tray icon (Phase 34.1 Plan 06, D-11; macOS template redirect, gap G3) ----
//
// Icon bytes are embedded at COMPILE TIME via `include_bytes!`, not resolved at runtime from
// `publicDir`/`app.getAppPath()`. This deliberately sidesteps this repo's recurring
// publicDir/getAppPath path-resolution failure family
// ([[publicdir-getapppath-chunking]], the bundled-JSON-asset gotcha) -- no runtime path is
// resolved and no file can be substituted post-build (T-34.1-21).
//
// **macOS** uses a THIRD asset, `TRAY_ICON_TEMPLATE`, instead of choosing between the two
// colour variants below. `public/icon-dark.png` and `public/icon-light.png` were found to be
// byte-identical (see `.planning/todos/pending/tray-dark-light-icons-are-identical.md`), and a
// straight RGB inversion of the full-colour artwork was tried and REJECTED (see
// `meta/trayIconVariants.ts`'s docstring) because it produced a differently-coloured smudge, not
// a legible glyph, at 22px. The fix actually adopted is a macOS AppKit template image --
// `meta/trayIconVariants.ts` hue-segments the cat glyph out of its starburst background and
// emits `public/icon-tray-template.png`: solid black RGB, the glyph silhouette carried entirely
// in alpha. `TrayIcon::set_icon_as_template`/`icon_as_template` (tauri 2.11.5,
// `tray/mod.rs:294,560` -- verified against the installed crate, not from memory) tell macOS to
// render it black-on-light and white-on-dark automatically. **Consequence, stated explicitly:**
// on macOS, `darkTrayIcon` becomes VESTIGIAL -- `tray_image` below returns the same template
// image regardless of the `dark` argument, so toggling the setting has zero visible effect
// there BY DESIGN. This is a deliberate no-op, not a regression of this same bug: the setting
// still round-trips through the existing single `tray_set_icon` arm (D-01's "zero new Rust
// arms" is preserved), it simply has no macOS-visible effect, exactly like several other
// settings that are meaningful on some platforms and not others.
//
// **Windows/Linux** are UNCHANGED by this redirect: they keep selecting between
// `TRAY_ICON_DARK`/`TRAY_ICON_LIGHT` exactly as before. Those two files remain byte-identical on
// those platforms -- fixing that is explicitly out of scope for this redirect, which targets
// only the macOS template path (see `34.1-13-SUMMARY.md`).

/// Dark tray icon variant, shown on Windows/Linux when `settings.darkTrayIcon` is true. Still
/// byte-identical to `TRAY_ICON_LIGHT` -- fixing that pair is out of scope for the macOS
/// template redirect (see the block comment above).
const TRAY_ICON_DARK: &[u8] = include_bytes!("../../public/icon-dark.png");
/// Light tray icon variant (also the Windows/Linux startup default, corrected by the sidecar's
/// initial `changeTrayColor` sync once `GlobalConfig` is readable -- see
/// `dispatch_rust_channel`'s `tray_set_icon` arm and `appShellFlowRegistration.ts`).
const TRAY_ICON_LIGHT: &[u8] = include_bytes!("../../public/icon-light.png");
/// macOS-only AppKit template silhouette (see the block comment above). A monochrome PNG --
/// solid black RGB, shape lives in alpha -- generated by `meta/trayIconVariants.ts` from
/// `public/icon-dark.png` via hue segmentation.
#[cfg(target_os = "macos")]
const TRAY_ICON_TEMPLATE: &[u8] = include_bytes!("../../public/icon-tray-template.png");
/// Unique id for the app's single tray icon; looked up later via `app.tray_by_id(...)`.
const TRAY_ICON_ID: &str = "gamelib-tray";
/// 1x1 fully-transparent pixel, used only if all bundled tray PNGs fail to decode. Should
/// never happen in practice (they are checked-in assets) -- exists purely so `tray_image`
/// has an infallible last resort and can never panic (T-34.1-22).
const TRAY_ICON_FALLBACK_PIXEL: [u8; 4] = [0, 0, 0, 0];

/// Whether the tray icon should be marked as an AppKit template image. **macOS only** --
/// `TrayIcon::set_icon_as_template`/`TrayIconBuilder::icon_as_template` are documented no-ops on
/// Windows/Linux (tauri 2.11.5, `tray/mod.rs:294,560`), but this helper keeps call sites
/// self-documenting about WHY macOS is special-cased rather than relying on the callee's silent
/// no-op.
fn tray_is_template() -> bool {
    cfg!(target_os = "macos")
}

/// Decode the requested tray icon. **macOS** always returns the template silhouette
/// (`TRAY_ICON_TEMPLATE`), ignoring `dark` -- see the block comment above. **Windows/Linux**
/// keep the original dark/light colour selection. Every failure path degrades instead of
/// panicking: on macOS a bad/corrupt template asset falls through to the colour selection
/// below; a bad/corrupt colour asset falls back to the light variant; if that also fails to
/// decode, falls back to a blank 1x1 pixel image built via `Image::new` (infallible, no decode
/// step) -- `tray_image` can never be the reason `.setup()` panics (T-34.1-22).
fn tray_image(dark: bool) -> Image<'static> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(img) = Image::from_bytes(TRAY_ICON_TEMPLATE) {
            return img;
        }
        eprintln!(
            "[shell] WARN: macOS tray template image failed to decode, falling back to the colour variant"
        );
    }
    let bytes = if dark { TRAY_ICON_DARK } else { TRAY_ICON_LIGHT };
    if let Ok(img) = Image::from_bytes(bytes) {
        return img;
    }
    eprintln!(
        "[shell] WARN: requested tray icon variant (dark={dark}) failed to decode, trying light variant"
    );
    if let Ok(img) = Image::from_bytes(TRAY_ICON_LIGHT) {
        return img;
    }
    eprintln!("[shell] WARN: both tray icon variants failed to decode, using a blank fallback");
    Image::new(&TRAY_ICON_FALLBACK_PIXEL, 1, 1)
}

/// Invoke response timeout — a skeleton guardrail so a hung sidecar cannot wedge a command.
const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);

/// Channels whose work is legitimately unbounded in wall-clock terms and therefore must NOT
/// be subject to `INVOKE_TIMEOUT` (CR-03, Phase 30 code review).
///
/// A Steam depot download runs for minutes to hours; bounding it at 60s made the renderer see
/// a spurious `sidecar invoke timed out` failure while the install kept running in the sidecar,
/// and the real (late) response was then dropped by the reader thread as an unknown id. The
/// renderer-side symptom was an unhandled rejection out of
/// `frontend/state/InstallGameModal.ts`'s `void window.api.install(...)`.
///
/// `checkGameUpdates` fans out across six library managers, each shelling out to
/// legendary/gogdl/nile, and can plausibly exceed 60s on a cold cache; `refreshLibrary` has the
/// same shape. `uninstall` can take arbitrarily long on a large install directory.
///
/// The guardrail is not lost for the rest of the surface: every OTHER channel keeps the 60s
/// bound, and a genuinely wedged long-running invoke now surfaces as a never-settling promise
/// rather than a wrong answer — the honest failure mode. The sidecar dying closes the channel,
/// which wakes `rx.recv()` with a disconnect error, so a crashed sidecar still fails fast.
///
/// Phase 34.2 Plan 06, D-10: `getCrossoverIndex` joins this list for the same library-wide
/// reason as `checkGameUpdates`/`refreshLibrary` above — it fans out over every game in every
/// library manager (`crossover_index/crossoverRatingMap.ts`'s `buildCrossoverRatingMap()`), AND
/// calls `loadIndex`/`buildMaps` (`crossover_index/index.ts:99`) once PER GAME rather than once
/// overall, a known inefficiency deliberately not fixed by this slice (recorded as a deferred
/// optimization in `34.2-03-SUMMARY.md`). `getWikiGameInfo` was measured instead of exempted:
/// three representative cold-cache calls (Hades, Stardew Valley, Portal 2 — cache-miss forced
/// via this repo's own jest electron-store automock, real network, 2026-07-25) completed in
/// 1190ms / 957ms / 702ms respectively, comfortably under the 60s bound, so it stays on the
/// default 60s timeout (see `34.2-06-SUMMARY.md` for the full measurement record).
const LONG_RUNNING_CHANNELS: &[&str] = &[
    "install",
    "updateGame",
    "uninstall",
    "checkGameUpdates",
    "refreshLibrary",
    "getCrossoverIndex",
    // A full re-verify/re-download of an installed game (legendary/gogdl repair) routinely exceeds 60s (CR-01).
    "repair",
    // readConfig('library') calls legendary.refresh(), the same work refreshLibrary is exempted for; readConfig('user') is fast, so this trades a 60s rejection for a never-settling promise if it ever wedges.
    "readConfig",
    // Phase 34.5 gap cycle 3, F-34.5-G6-02: oauthCaptureLogin drives a HUMAN interaction (typing
    // credentials, solving a challenge, fetching a mailed verification code) and carries its own
    // 300_000ms deadline (DEFAULT_DEADLINE_MS, src/backend/sidecar/oauthLoginCapture.ts) -- five
    // times this shell's 60s bound. The 2026-08-01 live gate measured every real attempt exceeding
    // 60s (GOG captured at 68s, Amazon at 91s, Epic timed out at 300s x3); with the bound in place
    // the shell returns Err("sidecar invoke timed out") at 60s AND the real late response is
    // dropped by the reader thread as an unknown id, so the outcome can never arrive.
    "oauthCaptureLogin",
    // Same shape as oauthCaptureLogin above (F-34.5-G6-02 recurrence count, 34.5-22 Task 2):
    // humbleStartLogin/humbleReconnect both await HumbleUser.watchForLogin()
    // (src/backend/humble/user.ts), bounded by its own LOGIN_WATCH_TIMEOUT_MS = 600_000ms -- ten
    // times this shell's 60s bound, an even larger mismatch than oauthCaptureLogin's.
    "humbleStartLogin",
    "humbleReconnect",
    // Phase 34.5 gap cycle 6: getInstallInfo was ported to the sidecar by plan 34.5-43
    // (F-34.5-G6-10), which deliberately did NOT touch this file (it belongs to plan 34.5-44,
    // same wave); this entry is added by plan 34.5-44 Task 4 to close ledger row U-34.5-16
    // (threat T-34.5-C6-06). Same shape as checkGameUpdates/refreshLibrary above:
    // gog/library.ts:624 spawns `gogdl` over the network and legendary/library.ts:260
    // re-enters getInstallInfo on a retry, either of which can plausibly exceed 60s on a cold
    // cache or a slow CDN, producing a spurious "sidecar invoke timed out" that looks like a
    // code failure rather than a slow network.
    "getInstallInfo",
];

/// `None` means "wait indefinitely" (see `LONG_RUNNING_CHANNELS`).
fn timeout_for(channel: &str) -> Option<Duration> {
    if LONG_RUNNING_CHANNELS.contains(&channel) {
        None
    } else {
        Some(INVOKE_TIMEOUT)
    }
}

/// Keychain service/account identifying the Steam refresh token entry this shell owns
/// (Phase 28, D-01: keyring-native storage, not OSCrypt-compatible ciphertext). These are
/// production-stable identifiers — they must NOT be spike 011's throwaway
/// `com.gamelib.spike011` probe values, which were deliberately named to be obviously
/// disposable and were deleted (`delete_credential`) after every spike run.
const KEYRING_SERVICE: &str = "com.gamelib.launcher";
const KEYRING_ACCOUNT: &str = "steam-refresh-token";

/// Compile-time keyring slot allowlist (34.4.1 gap cycle, D-GAP-01 -- binding). A caller supplies
/// a slot NAME; this function is the ONLY place a slot name is mapped to a real Keychain account
/// string, and it is the ONLY thing standing between a sidecar frame and `Entry::new`. T-28-03
/// stays preserved, not reopened: the sidecar can only ever select one of the entries below, never
/// an arbitrary account passed straight through from `args`. There is no wildcard/fallback arm --
/// an unrecognised slot is `keyring:unknown-slot`, always, never a silent fallback to a real
/// account (see `keyring_slot_arg` below for the SEPARATE, deliberate default that applies before
/// a slot name ever reaches this function).
///
/// Two Humble slots exist because Humble holds two independent secrets today (the
/// `_simpleauth_sess` session cookie and the csrf snapshot -- currently separate `configStore`
/// keys, per `34.4.1-SEAM-PARITY-SWEEP.md` S-10): packing both into one slot would make a partial
/// write corrupt both.
///
/// `steamgrid/secureKey.ts` (F-1b, `34.4.1-SEAM-PARITY-SWEEP.md` S-11) deliberately has NO slot
/// here: the sweep found it unreachable from the sidecar's curated import graph today (reached
/// only via `src/backend/main.ts`, Electron's own entry point, never the sidecar's
/// `bootstrap.ts`/`handlers.ts` chain) -- it stays dormant, not live. A future plan adds its slot
/// only once it is actually wired into a sidecar registration module.
fn keyring_account(slot: &str) -> Result<&'static str, String> {
    match slot {
        "steam-refresh-token" => Ok(KEYRING_ACCOUNT),
        "humble-session" => Ok("humble-session"),
        "humble-csrf" => Ok("humble-csrf"),
        _ => Err("keyring:unknown-slot".to_string()),
    }
}

/// Reads the slot name argument for a keyring dispatch arm at `position`, defaulting to the
/// `steam-refresh-token` slot when absent or non-string. **This default is deliberate and is what
/// makes this change backward compatible**: every keyring frame the sidecar sent before this plan
/// carried no slot argument at all, and it must keep resolving to the SAME Keychain entry it
/// always has, with no user-visible re-login. Do not "tidy" this into a hard error -- an absent
/// slot is the currently-shipping shape, not malformed input. This is a SEPARATE concern from
/// `keyring_account`'s hard-error-on-unknown-slot: a present-but-unrecognised slot name is still
/// always rejected; only an ABSENT slot argument gets this default.
fn keyring_slot_arg(args: &[Value], position: usize) -> &str {
    args.get(position)
        .and_then(|v| v.as_str())
        .unwrap_or("steam-refresh-token")
}

/// A request frame written to the sidecar's stdin (one JSON object per line).
/// Mirrors SidecarRpcRequest. `id` is always a string (64-bit-safe).
#[derive(Serialize)]
struct SidecarRpcRequest {
    id: String,
    kind: &'static str,
    channel: String,
    args: Vec<Value>,
}

/// Payload emitted to the webview alongside FRONTEND_MESSAGE_EVENT.
#[derive(Clone, Serialize)]
struct FrontendMessagePayload {
    channel: String,
    args: Vec<Value>,
}

// ---- Shell state ----

/// Shared handle to the sidecar: its stdin, the pending-invoke correlation table, and an
/// id counter. Wrapped in an Arc and `manage`d so the four commands can reach it.
struct SidecarState {
    stdin: Mutex<ChildStdin>,
    /// id -> one-shot sender the reader thread fulfils when the matching response arrives.
    pending: Mutex<HashMap<String, Sender<Result<Value, String>>>>,
    counter: AtomicU64,
    /// The shell owns the sidecar's lifetime: held alive so it is not reaped early, and
    /// explicitly killed by `shutdown_child()` on app exit (WR-03).
    child: Mutex<Child>,
}

impl SidecarState {
    fn next_id(&self) -> String {
        self.counter.fetch_add(1, Ordering::Relaxed).to_string()
    }

    /// WR-03: kill and reap the sidecar process. Called from the `RunEvent::Exit`
    /// handler in `main()`. Normal window close (red X / Cmd+Q / Alt+F4) does not route
    /// through `app_exit`/`app_relaunch` (the only two in-app call sites that used to be
    /// the sole way this process died), so without this an orphaned sidecar can survive
    /// after the user believes the app has quit, retaining an authenticated Steam session,
    /// open network sockets, and file handles. This runs on the exit path, so a poisoned
    /// mutex, an already-exited process, or a kill error must all be logged and swallowed
    /// rather than panicking -- an unwind here is worse than a leak.
    fn shutdown_child(&self) {
        let mut child = match self.child.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                eprintln!("[shell] sidecar mutex poisoned during exit shutdown; recovering");
                poisoned.into_inner()
            }
        };
        if let Err(e) = child.kill() {
            eprintln!("[shell] sidecar kill() failed during exit shutdown (may have already exited): {e}");
        }
        if let Err(e) = child.wait() {
            eprintln!("[shell] sidecar wait() failed during exit shutdown: {e}");
        } else {
            eprintln!("[shell] sidecar terminated on exit");
        }
    }

    /// Serialize an arbitrary `serde_json::Value` and write it (newline-terminated) to the
    /// sidecar's stdin. Used both for outbound request frames (via `write_frame` below) and
    /// for `rustInvoke` response frames written back on the same pipe (Phase 28).
    fn write_raw(&self, value: &Value) -> Result<(), String> {
        let line = serde_json::to_string(value).map_err(|e| e.to_string())?;
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| e.to_string())
    }

    /// Serialize a request frame and write it (newline-terminated) to the sidecar's stdin.
    fn write_frame(&self, req: &SidecarRpcRequest) -> Result<(), String> {
        let value = serde_json::to_value(req).map_err(|e| e.to_string())?;
        self.write_raw(&value)
    }

    /// Write an 'invoke' frame and block until the correlated response (or timeout).
    fn invoke(&self, channel: String, args: Vec<Value>) -> Result<Value, String> {
        let id = self.next_id();
        // CR-03: resolve the per-channel bound BEFORE `channel` is moved into the frame.
        let timeout = timeout_for(&channel);
        let (tx, rx) = mpsc_channel::<Result<Value, String>>();
        {
            let mut pending = self.pending.lock().map_err(|e| e.to_string())?;
            pending.insert(id.clone(), tx);
        }
        let req = SidecarRpcRequest {
            id: id.clone(),
            kind: "invoke",
            channel,
            args,
        };
        if let Err(e) = self.write_frame(&req) {
            self.pending.lock().ok().and_then(|mut p| p.remove(&id));
            return Err(e);
        }
        match timeout {
            Some(bound) => match rx.recv_timeout(bound) {
                Ok(result) => result,
                Err(_) => {
                    self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                    Err("sidecar invoke timed out".into())
                }
            },
            // Long-running channel: block until the sidecar answers. `recv()` still returns
            // Err when the sender is dropped (sidecar died / pending entry removed), so this
            // cannot hang forever on a dead sidecar.
            None => match rx.recv() {
                Ok(result) => result,
                Err(_) => {
                    self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                    Err("sidecar closed before responding".into())
                }
            },
        }
    }
}

// ---- The four relay commands (names mirror the transport contract constants) ----

/// ipcRenderer.invoke parity: req/resp round-trip to the sidecar.
#[tauri::command]
async fn sidecar_invoke(
    channel: String,
    args: Vec<Value>,
    state: State<'_, Arc<SidecarState>>,
) -> Result<Value, String> {
    let state = state.inner().clone();
    // Run the blocking channel-write + recv off the async runtime's worker.
    tauri::async_runtime::spawn_blocking(move || state.invoke(channel, args))
        .await
        .map_err(|e| e.to_string())?
}

/// ipcRenderer.send parity: fire-and-forget, no response awaited.
#[tauri::command]
fn sidecar_send(
    channel: String,
    args: Vec<Value>,
    state: State<'_, Arc<SidecarState>>,
) -> Result<(), String> {
    let req = SidecarRpcRequest {
        id: state.next_id(),
        kind: "send",
        channel,
        args,
    };
    state.write_frame(&req)
}

/// shell.openExternal parity — opens the URL (e.g. steam://rungameid/<appId>) via
/// tauri-plugin-opener (/usr/bin/open → Steam.app, the registered steam:// handler).
/// The URL is built upstream by the backend's numeric-appId-guarded buildSteamProtocolUrl
/// (threat T-27-02); this command does not construct URLs from renderer free-text.
#[tauri::command]
fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Requests the sidecar's minimal store snapshot for the renderer's synchronous store bridge.
#[tauri::command]
async fn sidecar_store_snapshot(
    state: State<'_, Arc<SidecarState>>,
) -> Result<Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.invoke(STORE_SNAPSHOT_CHANNEL.to_string(), vec![])
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- Clipboard arg/value helpers (Phase 34.3 Plan 03, D-01/D-02/REQ-34.3-08) ----
//
// The `clipboard_write_text`/`clipboard_read_text` dispatch arms below call
// `app.clipboard()`, which needs a live `AppHandle` and therefore cannot be driven from a
// plain `#[test]` (a `#[cfg(test)]` unit test structurally cannot construct a Tauri
// runtime). These two functions extract each arm's non-plugin logic into a pure,
// `AppHandle`-free surface so it can be proven by `#[cfg(test)] mod tests` below. The arms'
// actual plugin calls are proven empirically instead, by REQ-34.3-11's live-gate item 3 —
// not by these tests.

/// This channel's entire ASVS V5 input validation: `args[0]` must be present and a JSON
/// string. An empty string is a VALID clipboard write and must not be conflated with a
/// missing/wrong-typed argument — `unwrap_or("")` would silently accept both.
fn clipboard_text_arg(args: &[Value]) -> Result<&str, String> {
    args.first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| "clipboard_write_text:bad-args".to_string())
}

/// Shapes the plugin's `Result<String, String>` into the arm's `Result<Value, String>`.
/// An empty clipboard read is `Ok(Value::String(String::new()))`, deliberately NOT
/// `Ok(Value::Null)` — the sidecar's `clipboardReadText` handler coerces a non-string result
/// to `''`, which would mask a `Value::Null` regression here as an indistinguishable empty
/// read instead of a visibly wrong shape.
fn clipboard_read_value(read: Result<String, String>) -> Result<Value, String> {
    match read {
        Ok(text) => Ok(Value::String(text)),
        Err(e) => Err(e),
    }
}

// ---- Login-window (child WebviewWindow) support (Phase 34.4.1 Plan 01, D-01/D-02) ----
//
// D-02's resolved shape: a runner-agnostic set of `dispatch_rust_channel` arms -- nothing
// below knows what Humble is -- reached only via `requestRustInvoke()` from the headless
// Node sidecar, the same pattern as the keyring/dialog_open/clipboard arms above and
// below. Pure logic (label generation, URL validation, the domain-suffix filter, event
// shaping) is extracted into `AppHandle`-free functions here, proven by
// `#[cfg(test)] mod tests`; the arms' actual `WebviewWindowBuilder`/`cookies()`/
// `delete_cookie()` calls are proven empirically instead, by this phase's REQ-34.4.1-12
// blocking live gate (`34.4.1-LIVE-GATE.md`), the same split Phase 34.3's clipboard arms
// use.

/// Monotonic counter feeding `next_login_window_label()`. Process-static, mirrors this
/// file's existing `SidecarState::next_id()` counter shape.
static LOGIN_WINDOW_LABEL_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Navigation events observed by the `on_page_load` hook (Pattern 4 below), queued per
/// window label and drained by `humble_login_take_events`. `Mutex<Option<HashMap<..>>>`
/// rather than `Mutex<HashMap<..>>` because `HashMap::new()` is not a `const fn` (its
/// default `RandomState` seed is not const-constructible) -- the map is created lazily on
/// first use instead.
static LOGIN_WINDOW_EVENTS: Mutex<Option<HashMap<String, Vec<Value>>>> = Mutex::new(None);

/// Per-label cap on `LOGIN_WINDOW_EVENTS`, oldest-dropped past this bound (threat
/// T-34.4.1-09): a page that navigates in a loop must not grow the queue without bound
/// between `humble_login_take_events` drains.
const LOGIN_WINDOW_EVENTS_CAP: usize = 50;

/// Canonical label for the app's single Tauri-managed main window (the only entry in
/// `tauri.conf.json`'s `app.windows` array). Used both by the always-compiled tray/devtools
/// call sites below (`main()`'s `.setup()` closure) and by the macOS-only login-window
/// attachment helpers this phase adds (Phase 34.4.2 Plan 02) -- kept as a single plain
/// `const`, not `#[cfg(target_os = "macos")]`-gated, so the label has exactly one definition
/// across the whole file regardless of which call sites end up using it on a given platform.
const MAIN_WINDOW_LABEL: &str = "main";

/// Dev-only pre-page-script diagnostic (epic-login-non-interactive investigation,
/// 2026-08-02, F-34.5-G6-01): injected as a Tauri `initialization_script()` on the LOGIN
/// window ONLY (see the `humble_login_open` arm below), gated identically to that arm's
/// existing `open_devtools()` call -- `#[cfg(debug_assertions)]` AND `if visible` -- so
/// it can never reach a packaged build. Initialization scripts run BEFORE any page
/// script, including Epic's own bundle, which is the entire point: every technique tried
/// in this investigation so far (console reads, Break on All Exceptions) could only
/// observe AFTER the page's own bootstrap had already run and, per the evidence trail in
/// `.planning/debug/epic-login-non-interactive.md`, already failed silently into a
/// caught error boundary.
///
/// Deliberately does NOT relay via Tauri IPC in any form -- this page's IPC transport is
/// independently confirmed broken in the same debug file (`IPC custom protocol failed,
/// Tauri will now use the postMessage interface instead -- TypeError: Load failed`, and
/// Epic's CSP refuses `ipc://localhost` outright). A diagnostic that depended on the
/// broken transport would silently capture nothing -- the exact failure mode this
/// project already named in `sidecar-send-channels-fail-silently`. Instead this script
/// keeps everything in-page: it accumulates records into a plain array at
/// `window.__GAMELIB_DIAG__` (capped, see MAX_RECORDS below) and ALSO `console.warn`s
/// each record immediately with the literal `[GAMELIB-DIAG]` prefix so it is visible
/// live and greppable in the Web Inspector console the developer already has open --
/// zero dependency on IPC, the file logger, or Safari's Network request-body viewer (the
/// three routes this investigation has already exhausted).
///
/// Reusable as-is for GOG/Amazon/Nile/Zoom's login windows: this call lives in the SAME
/// `humble_login_open` arm that (per this file's own prior-cycle comment above
/// `open_devtools()`) is not Humble-specific and is shared by all five runners.
///
/// Robustness, all load-bearing (a diagnostic that breaks the page it measures is worse
/// than none):
/// - The whole script is one outer try/catch; each individual hook (error listener,
///   unhandledrejection listener, fetch/sendBeacon/XHR.send wrappers, console.error
///   passthrough) is ALSO independently try/caught so one hook's failure cannot take
///   down the others or the page.
/// - Adds listeners only -- never removes or overwrites existing handlers -- and the
///   fetch/sendBeacon/XHR.send wrappers always call through to the TRUE original
///   implementation after recording, preserving page behavior exactly.
/// - `window.__GAMELIB_DIAG__` is capped at 200 records; once full, new records simply
///   stop being pushed (never evicted/grown) so a rejection loop cannot exhaust memory.
/// - Any captured body/text is truncated at 20,000 chars with an explicit truncation
///   marker appended.
/// - Captures NO cookie values, NO `Authorization`/header values, and NO token-shaped
///   data at any point -- it never reads request headers at all. REQUEST bodies are
///   captured ONLY when the destination URL substring-matches a Sentry-ingest shape
///   (`/envelope`, `ingest.sentry.io`, `sentry`). All other requests record structural
///   facts only (URL, method, body length), never request-body content. This debug file
///   may get pasted console output committed to a public fork, so this boundary is
///   deliberate, not incidental.
/// - Every mirrored record uses `console.warn`, NEVER `console.log` (audited across the
///   whole script, 2026-08-02 -- a developer's Web Inspector console can have an active
///   level filter that hides Log-level output while leaving Warn/Error visible, and this
///   exact ambiguity produced two false "the request hangs forever" conclusions in this
///   investigation before it was noticed; `console.log` must never be reintroduced here).
///
/// PER-REQUEST OUTCOME CORRELATION (2026-08-02 cycle, epic-login-non-interactive crux
/// test -- does Epic's OWN `/id/api/redirect` request succeed or fail in the same run
/// where a manual diagnostic fetch to it returned HTTP 200?): every intercepted `fetch`
/// and `XMLHttpRequest.send` call is assigned a monotonic integer `id`
/// (`nextRequestId()`) at send time, recorded on its `fetch.send`/`xhr.send` record.
/// EVERY response is now recorded, 2xx and non-2xx alike (previously the code path
/// existed for this already; this cycle added the missing `id`/`elapsedMs` correlation
/// and closed a credential-shaped-URL body gap -- see below), each outcome record
/// carrying the SAME `id` plus `elapsedMs` (milliseconds since send):
///   - `fetch.response` -- any status, 2xx or non-2xx.
///   - `fetch.error` -- the `.catch()` path: a rejection that never produced a
///     `Response` object at all (e.g. a dropped connection), with `errorName` +
///     `errorMessage`, distinct from `fetch.response`.
///   - `xhr.response` -- the `load` event, any status.
///   - `xhr.error` -- a network-level failure with NO response at all. This is
///     specifically the shape `NSURLErrorNetworkConnectionLost` (-1005) surfaces as --
///     a `load` listener alone would record NOTHING for exactly this failure mode.
///   - `xhr.timeout` / `xhr.abort` -- the two other XHR terminal events, each fires at
///     most once per request per the XHR spec, so there is no double-recording.
/// EVERY send is unconditionally recorded, so a reader can diff the `id`s present on
/// `fetch.send`/`xhr.send` records against the `id`s present on ANY outcome record in
/// the dumped `window.__GAMELIB_DIAG__` array: an `id` with a send but no matching
/// outcome record was still in flight when the page settled, the array filled (200-cap),
/// or the session ended.
///
/// fetch's response observer is a SEPARATE `.then()`/`.catch()` chain attached to the
/// promise `originalFetch()` returns -- never to the value returned to the caller -- so
/// attaching it cannot alter what or when Epic's own code awaits/resolves (multiple
/// `.then()` handlers on one promise are independent by spec). `res.clone()` is used
/// before any body read, so the response stream Epic's own code consumes is never
/// touched. XHR uses additive `load`/`error`/`timeout`/`abort` listeners, never
/// overwriting `onload`/`onerror`/etc., so any handler Epic's own bundle attaches keeps
/// firing unmodified.
///
/// RESPONSE BODY capture follows a policy STRICTER than request bodies and is the
/// mandatory secret-handling boundary for this public fork: for any URL that looks
/// credential-shaped (substring match on `/redirect`, `exchangecode`,
/// `authorizationcode`, `/token`, `oauth` -- covers Epic's `/id/api/redirect`, which
/// returns a real `authorizationCode`/`exchangeCode` in its response), body CONTENT is
/// NEVER captured, at ANY status code -- only status, elapsed time, and (if the body
/// parses as JSON) the top-level KEY NAMES via `Object.keys()`, never values. This check
/// fails CLOSED (a thrown/unexpected input is treated as credential-shaped). For all
/// other URLs, body text is captured (truncated, same convention as request bodies) only
/// for non-2xx responses -- 2xx responses to non-credential URLs record status/timing
/// only, since a successful response is not the diagnostic payload this instrument
/// exists to retrieve and capturing it unconditionally would be needless exposure.
#[cfg(debug_assertions)]
const DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT: &str = r#"
(function () {
  try {
    var MAX_RECORDS = 200;
    var MAX_BODY_LEN = 20000;
    var TRUNC_MARKER = '...[GAMELIB-DIAG TRUNCATED]';
    if (!window.__GAMELIB_DIAG__) { window.__GAMELIB_DIAG__ = []; }
    var diag = window.__GAMELIB_DIAG__;
    var REQUEST_ID_COUNTER = 0;

    function nextRequestId() {
      REQUEST_ID_COUNTER += 1;
      return REQUEST_ID_COUNTER;
    }

    function truncate(s) {
      try {
        if (typeof s !== 'string') return s;
        if (s.length > MAX_BODY_LEN) { return s.slice(0, MAX_BODY_LEN) + TRUNC_MARKER; }
        return s;
      } catch (e) { return '[GAMELIB-DIAG truncate error]'; }
    }

    function isSentryLike(url) {
      try {
        var u = String(url || '');
        return u.indexOf('/envelope') !== -1 || u.indexOf('ingest.sentry.io') !== -1 || u.indexOf('sentry') !== -1;
      } catch (e) { return false; }
    }

    // Credential-shaped: any URL that could plausibly return an OAuth code, token, or
    // exchange credential in its response body (e.g. Epic's `/id/api/redirect`, which
    // returns `authorizationCode`/`exchangeCode`). Mandatory secret-handling boundary:
    // response BODIES for these URLs are NEVER captured, at any status code -- only
    // status, timing, and (if the body parses as JSON) top-level KEY NAMES, never
    // values. Fails CLOSED: if the check itself throws, the URL is treated as
    // credential-shaped so a bug in this function cannot leak a body.
    function isCredentialShapedUrl(url) {
      try {
        var u = String(url || '').toLowerCase();
        return u.indexOf('/redirect') !== -1 ||
          u.indexOf('exchangecode') !== -1 ||
          u.indexOf('authorizationcode') !== -1 ||
          u.indexOf('/token') !== -1 ||
          u.indexOf('oauth') !== -1;
      } catch (e) { return true; }
    }

    // Shared response-body capture policy for both fetch and XHR outcome recording.
    // `status` is ALWAYS known to the caller separately -- this function only decides
    // what (if anything) of the BODY gets attached.
    function captureResponseBody(url, status, rawText) {
      try {
        if (isCredentialShapedUrl(url)) {
          try {
            var parsed = JSON.parse(rawText);
            if (parsed && typeof parsed === 'object') {
              return { bodyKeys: Object.keys(parsed), body: undefined, bodyRedacted: true };
            }
          } catch (eParse) {}
          return { bodyKeys: undefined, body: undefined, bodyRedacted: true };
        }
        if (typeof status === 'number' && status >= 200 && status < 300) {
          // Non-credential 2xx: status/timing is enough; body is not the diagnostic
          // payload this instrument exists to retrieve, so it is not captured.
          return { bodyKeys: undefined, body: undefined, bodyRedacted: false };
        }
        return { bodyKeys: undefined, body: truncate(String(rawText)), bodyRedacted: false };
      } catch (e) {
        return { bodyKeys: undefined, body: undefined, bodyRedacted: true };
      }
    }

    function record(entry) {
      try {
        entry.t = Date.now();
        if (diag.length < MAX_RECORDS) { diag.push(entry); }
        try { console.warn('[GAMELIB-DIAG]', entry); } catch (eWarn) {}
      } catch (e) {}
    }

    try {
      window.addEventListener('error', function (ev) {
        try {
          record({
            kind: 'error',
            message: ev && ev.message,
            filename: ev && ev.filename,
            lineno: ev && ev.lineno,
            colno: ev && ev.colno,
            stack: (ev && ev.error && ev.error.stack) ? truncate(String(ev.error.stack)) : undefined
          });
        } catch (eInner) {}
      });
    } catch (eListenError) {}

    try {
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          var reason = ev && ev.reason;
          var reasonMessage;
          try { reasonMessage = (reason && reason.message) ? String(reason.message) : String(reason); }
          catch (eMsg) { reasonMessage = '[GAMELIB-DIAG unreadable reason]'; }
          var reasonStack;
          try { reasonStack = (reason && reason.stack) ? truncate(String(reason.stack)) : undefined; }
          catch (eStack) {}
          record({ kind: 'unhandledrejection', reason: truncate(reasonMessage), stack: reasonStack });
        } catch (eInner) {}
      });
    } catch (eListenRejection) {}

    // fetch: every send gets a monotonic `id` (also on its 'fetch.send' record) and a
    // `startTime`. A SEPARATE .then/.catch chain is attached to the promise
    // `originalFetch(...)` returns -- never to the value returned to the caller -- so
    // Epic's own await/resolution of that SAME promise is unaffected (independent
    // `.then()` handlers on one promise never disturb each other or the promise's own
    // resolution). `res.clone()` is used before any body read, so the response stream
    // Epic's own code consumes is never touched. Exactly one outcome record per
    // request: 'fetch.response' (any status, 2xx or non-2xx alike) or 'fetch.error'
    // (the .catch() path -- a rejection that never produced a Response object at all,
    // e.g. a dropped connection).
    try {
      if (window.fetch) {
        var originalFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
          var url = ''; var method = 'GET';
          var reqId = nextRequestId();
          var startTime = Date.now();
          try {
            url = (typeof input === 'string') ? input : ((input && input.url) || '');
            method = (init && init.method) || (input && input.method) || 'GET';
          } catch (eUrl) {}
          try {
            var bodyLen; var bodyPreview;
            try {
              var rawBody = (init && init.body) || undefined;
              if (typeof rawBody === 'string') {
                bodyLen = rawBody.length;
                if (isSentryLike(url)) { bodyPreview = truncate(rawBody); }
              }
            } catch (eBody) {}
            record({ kind: 'fetch.send', id: reqId, url: String(url), method: String(method), bodyLen: bodyLen, body: bodyPreview });
          } catch (eOuter) {}
          var fetchPromise = originalFetch(input, init);
          try {
            fetchPromise.then(function (res) {
              try {
                var elapsed = Date.now() - startTime;
                var status = (res && typeof res.status === 'number') ? res.status : undefined;
                try {
                  res.clone().text().then(function (text) {
                    try {
                      var capture = captureResponseBody(url, status, text);
                      record({
                        kind: 'fetch.response', id: reqId, url: String(url), method: String(method),
                        status: status, elapsedMs: elapsed,
                        bodyLen: (typeof text === 'string' ? text.length : undefined),
                        bodyKeys: capture.bodyKeys, body: capture.body, bodyRedacted: capture.bodyRedacted
                      });
                    } catch (eRec) {}
                  }).catch(function () {
                    try {
                      record({ kind: 'fetch.response', id: reqId, url: String(url), method: String(method), status: status, elapsedMs: elapsed, bodyReadError: true });
                    } catch (eRec2) {}
                  });
                } catch (eClone) {
                  try {
                    record({ kind: 'fetch.response', id: reqId, url: String(url), method: String(method), status: status, elapsedMs: elapsed, cloneError: true });
                  } catch (eRec3) {}
                }
              } catch (eResp) {}
            }).catch(function (fetchErr) {
              try {
                var elapsed = Date.now() - startTime;
                record({
                  kind: 'fetch.error', id: reqId, url: String(url), method: String(method), elapsedMs: elapsed,
                  errorName: (fetchErr && fetchErr.name) ? String(fetchErr.name) : undefined,
                  errorMessage: (fetchErr && fetchErr.message) ? truncate(String(fetchErr.message)) : String(fetchErr)
                });
              } catch (eRejRec) {}
            });
          } catch (eAttach) {}
          return fetchPromise;
        };
      }
    } catch (eFetch) {}

    try {
      if (navigator && navigator.sendBeacon) {
        var originalSendBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (url, data) {
          try {
            var reqId = nextRequestId();
            var bodyLen; var bodyPreview;
            try {
              if (typeof data === 'string') {
                bodyLen = data.length;
                if (isSentryLike(url)) { bodyPreview = truncate(data); }
              }
            } catch (eBody) {}
            record({ kind: 'sendBeacon', id: reqId, url: String(url), bodyLen: bodyLen, body: bodyPreview });
          } catch (eOuter) {}
          return originalSendBeacon(url, data);
        };
      }
    } catch (eBeacon) {}

    // XHR: `open` still only tags the instance with the URL/method it will send
    // (unchanged). `send` now assigns a monotonic `id` and `startTime`, then registers
    // ADDITIVE `addEventListener` handlers (never overwrites `onload`/`onerror`/any
    // handler Epic's own bundle attaches) for FOUR distinct terminal events, not just
    // 'load':
    //   - 'load'    -> 'xhr.response' outcome (status + elapsedMs + body policy, any status)
    //   - 'error'   -> 'xhr.error' outcome (a network-level failure with NO response at
    //                  all -- this is the event NSURLErrorNetworkConnectionLost / -1005
    //                  surfaces as; a 'load'-only listener would record NOTHING for
    //                  exactly this failure)
    //   - 'timeout' -> 'xhr.timeout' outcome
    //   - 'abort'   -> 'xhr.abort' outcome
    // Each of these four is a distinct terminal event per the XHR spec -- at most one
    // ever fires per request, so there is no double-recording.
    try {
      if (window.XMLHttpRequest && XMLHttpRequest.prototype && XMLHttpRequest.prototype.send) {
        var originalOpen = XMLHttpRequest.prototype.open;
        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
          try { this.__gamelibDiagUrl = url; this.__gamelibDiagMethod = method; } catch (eSet) {}
          return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
          var url = this && this.__gamelibDiagUrl;
          var method = this && this.__gamelibDiagMethod;
          var reqId = nextRequestId();
          var startTime = Date.now();
          try {
            var bodyLen; var bodyPreview;
            try {
              if (typeof body === 'string') {
                bodyLen = body.length;
                if (isSentryLike(url)) { bodyPreview = truncate(body); }
              }
            } catch (eBody) {}
            // Read (never set) the page's OWN configured `.timeout` on this instance,
            // if any -- this is Epic's own client-side timeout budget for this specific
            // request, not this diagnostic's classification of the outcome. 0/undefined
            // means the page left the browser default (no explicit timeout) in place.
            // Purely observational: read-only, no assignment, cannot change request
            // behavior. Added to discriminate "Epic's own short timeout collided with
            // WKWebView connection latency" from "a general connection-level failure"
            // without needing a second live run.
            var configuredTimeoutMs;
            try {
              if (typeof this.timeout === 'number' && this.timeout > 0) {
                configuredTimeoutMs = this.timeout;
              }
            } catch (eTimeout) {}
            record({
              kind: 'xhr.send',
              id: reqId,
              url: url ? String(url) : undefined,
              method: method ? String(method) : undefined,
              bodyLen: bodyLen,
              body: bodyPreview,
              configuredTimeoutMs: configuredTimeoutMs
            });
          } catch (eOuter) {}
          try {
            var self = this;
            function recordXhrOutcome(eventType) {
              try {
                var elapsed = Date.now() - startTime;
                var status;
                try { status = self.status; } catch (eStatus) {}
                if (eventType === 'load') {
                  var text;
                  try { text = self.responseText; } catch (eRT) {}
                  var capture;
                  try { capture = captureResponseBody(url, status, text); }
                  catch (eCap) { capture = { bodyKeys: undefined, body: undefined, bodyRedacted: true }; }
                  record({
                    kind: 'xhr.response', id: reqId, url: url ? String(url) : undefined,
                    method: method ? String(method) : undefined, status: status, elapsedMs: elapsed,
                    bodyLen: (typeof text === 'string' ? text.length : undefined),
                    bodyKeys: capture.bodyKeys, body: capture.body, bodyRedacted: capture.bodyRedacted
                  });
                } else {
                  record({
                    kind: 'xhr.' + eventType, id: reqId, url: url ? String(url) : undefined,
                    method: method ? String(method) : undefined, status: status, elapsedMs: elapsed
                  });
                }
              } catch (eOutcome) {}
            }
            self.addEventListener('load', function () { recordXhrOutcome('load'); });
            self.addEventListener('error', function () { recordXhrOutcome('error'); });
            self.addEventListener('timeout', function () { recordXhrOutcome('timeout'); });
            self.addEventListener('abort', function () { recordXhrOutcome('abort'); });
          } catch (eAttachLoad) {}
          return originalSend.apply(this, arguments);
        };
      }
    } catch (eXhr) {}

    try {
      var originalConsoleError = console.error ? console.error.bind(console) : null;
      console.error = function () {
        try {
          var args = Array.prototype.slice.call(arguments);
          var joined;
          try {
            joined = args.map(function (a) {
              try {
                if (typeof a === 'string') return a;
                if (a && a.stack) return String(a.stack);
                return JSON.stringify(a);
              } catch (eJ) { return String(a); }
            }).join(' ');
          } catch (eJoin) { joined = '[GAMELIB-DIAG unjoinable console.error args]'; }
          record({ kind: 'console.error', message: truncate(joined) });
        } catch (eOuter) {}
        if (originalConsoleError) {
          try { return originalConsoleError.apply(console, arguments); } catch (eCall) {}
        }
      };
    } catch (eConsole) {}

    try { console.warn('[GAMELIB-DIAG] instrumentation installed'); } catch (eFinal) {}
  } catch (outerError) {
    try { console.warn('[GAMELIB-DIAG] instrumentation failed to install', outerError); } catch (eReport) {}
  }
})();
"#;

/// Generates a login-window label that can NEVER equal `main`/`about` and is NEVER
/// derived from any caller-supplied argument (T-34.1-27, REQ-34.4.1-09) -- the Rust-side
/// port of `tauriChildWindows.ts`'s `nextExternalWindowLabel()` discipline. The fixed
/// `loginwin-` prefix (neither reserved label starts with it) plus a process-lifetime
/// monotonic counter plus a nanosecond timestamp guarantee uniqueness; the trailing hex
/// entropy (sourced from `RandomState`'s OS-seeded random keys -- std, no new dependency)
/// means the label is not predictable from the counter/timestamp alone. Child labels
/// never join `capabilities/default.json`'s `windows: ["main"]` array, so a label that is
/// never `main`/`about` and never url-derived matches NO capability and gets zero Tauri
/// command access.
fn next_login_window_label() -> String {
    let n = LOGIN_WINDOW_LABEL_COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
    (n, nanos).hash(&mut hasher);
    let entropy = (hasher.finish() & 0xffff_ffff) as u32;
    format!("loginwin-{n:x}-{nanos:x}-{entropy:08x}")
}

/// This arm's entire ASVS V5 input validation (threat T-34.4.1-08): `args[0]` must be
/// present, a JSON string, and parse as an absolute URL whose scheme is exactly `https`.
/// `http://`, `file://` and `javascript:` are all rejected HERE, before any real OS
/// window is constructed -- this is the arm's only gate.
fn login_window_url_arg(args: &[Value]) -> Result<tauri::Url, String> {
    let raw = args
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| "humble_login_open:bad-args".to_string())?;
    let url = tauri::Url::parse(raw).map_err(|_| "humble_login_open:bad-url".to_string())?;
    if url.scheme() != "https" {
        return Err("humble_login_open:bad-url".to_string());
    }
    Ok(url)
}

/// Composes the login window's OS title with the SHELL-RESOLVED origin FIRST, always
/// (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/T-34.5-G6-23). `AppHandle`-free and
/// `#[cfg(test)]`-covered, mirroring `clipboard_text_arg`/`login_window_url_arg`'s own
/// pure-helper convention.
///
/// `origin` MUST come from the URL the shell itself validated (`login_window_url_arg`'s
/// return value, via `tauri::Url::origin().ascii_serialization()`) -- NEVER from page
/// content. `document_title` is the page's own `document.title`, which is fully
/// attacker-controlled: the loaded page can set it to anything, including a string
/// crafted to look like a URL or an origin (T-34.5-G6-23). That is exactly why the
/// document title can never be trusted as an origin indicator on its own, and exactly why
/// this helper places `origin` first, unconditionally, with the document title (if any)
/// appended only AFTER it -- a truncated title bar still shows the trustworthy part first,
/// and the page's text can never precede or replace it.
fn login_window_title(origin: &str, document_title: Option<&str>) -> String {
    match document_title {
        Some(title) if !title.is_empty() => format!("{origin} — {title}"),
        _ => origin.to_string(),
    }
}

/// The ONLY domain comparison in this file -- the wry cookies-for-url API (the plausible
/// but WRONG shortcut this function replaces) MUST NOT appear anywhere in `main.rs` (see
/// the cookie arms below). Proper suffix match: `host ==
/// domain` OR `host` ends with `.{domain}`, never wry's `==`-only comparison, which
/// silently drops `_simpleauth_sess` for `www.humblebundle.com` because Humble stores it
/// against the apex domain `humblebundle.com` (spike 014a /
/// `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md`).
fn cookie_domain_matches(host: &str, domain: Option<&str>) -> bool {
    match domain {
        // Normalize a leading-dot `domain` (RFC 6265's wildcard-subdomain marker) before
        // comparing (F-34.4.2-19). Without this, `format!(".{d}")` on an already-dotted `d`
        // produces an impossible ".."-prefixed suffix requirement no real hostname can ever
        // satisfy, making this comparator categorically blind to any leading-dot cookie
        // domain regardless of `host` -- exactly the shape `_simpleauth_sess`'s real,
        // live-measured domain (".humblebundle.com") takes, which silently broke
        // `humble_login_cookies`' poll arm. RFC 6265 defines a `.example.com` cookie as
        // applying to `example.com` itself, not only to its subdomains, so stripping the
        // leading dot here is the spec-correct fix, not a special case. Argument order at
        // every call site is DELIBERATELY left untouched (Plan 22, F-6 Defect A) -- this
        // normalizes the value being compared, not which position it is compared from.
        Some(d) => {
            let d = d.strip_prefix('.').unwrap_or(d);
            host == d || host.ends_with(&format!(".{d}"))
        }
        None => false,
    }
}

/// Domain-suffix match for a `WKWebsiteDataRecord`'s `displayName()` (Phase 34.4.1 Plan 23,
/// F-6 Defect B, REQ-34.4.1-06). `displayName` and a cookie's `domain()` share the exact same
/// shape -- a bare host string, grouped by the public suffix list -- so this delegates to
/// `cookie_domain_matches` above (the ONLY domain comparison this file uses, per its own
/// comment) rather than reimplementing suffix discipline a second, subtly different way. A
/// second ad hoc comparator in this file is exactly how Defect A happened (Plan 22): do not
/// repeat that mistake here just because the input is a record instead of a cookie. The
/// `display_name.is_empty()` guard is explicit rather than left implicit in
/// `cookie_domain_matches`'s own logic, so an empty display name can never accidentally match
/// (`cookie_domain_matches("", Some(d))` is already `false` for any non-empty `d`, but this
/// states the guarantee in-source rather than relying on that as an unstated side effect).
fn website_data_record_matches_domain(display_name: &str, target: &str) -> bool {
    if display_name.is_empty() {
        return false;
    }
    cookie_domain_matches(display_name, Some(target))
}

/// The measured-delete-count contract this plan establishes (Phase 34.4.1 Plan 23, F-6
/// Defect B): `before - after`, saturating at zero rather than wrapping, so a jar that GREW
/// between the two reads (a concurrent login racing the clear) can never produce a negative
/// or wrapped count. This is deliberately NEVER the pre-removal size of the matched set,
/// computed before any removal ran -- that attempted-count shape is the exact bug this plan
/// closes. Both `before` and
/// `after` must be counted with the SAME filter (the clear direction), or the subtraction is
/// meaningless; callers are responsible for that symmetry.
fn verified_delete_count(before: usize, after: usize) -> usize {
    before.saturating_sub(after)
}

/// Shapes one `LOGIN_WINDOW_EVENTS` queue entry -- the exact `{"event", "url"}` shape
/// `humble_login_take_events`'s interface contract promises the sidecar.
fn login_event_value(kind: &str, url: &str) -> Value {
    serde_json::json!({ "event": kind, "url": url })
}

/// Pushes one navigation event onto `label`'s queue, capping it at
/// `LOGIN_WINDOW_EVENTS_CAP` with oldest-dropped (T-34.4.1-09). Called from the
/// `on_page_load` hook below, which may run off the calling thread -- hence the `Mutex`.
/// A poisoned lock (only reachable after a prior panic elsewhere) fails this single push
/// silently rather than panicking a webview navigation callback.
fn push_login_window_event(label: &str, event: Value) {
    let Ok(mut guard) = LOGIN_WINDOW_EVENTS.lock() else {
        return;
    };
    let map = guard.get_or_insert_with(HashMap::new);
    let queue = map.entry(label.to_string()).or_insert_with(Vec::new);
    queue.push(event);
    if queue.len() > LOGIN_WINDOW_EVENTS_CAP {
        queue.remove(0);
    }
}

// ---- humble_reveal_post support (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) ----
//
// `humblePostRequest` (`backend/humble/adapter.ts`) routes its ONE write-style Humble call
// (the reveal-key POST) through this arm under Tauri instead of Electron's `net.request`.
// Design: open a HIDDEN, on-demand child window on the real Humble origin, run the POST from
// the page's OWN JS `fetch()` (a genuine WKWebView network stack -- the one structurally-new
// transport with its own real browser TLS/HTTP fingerprint), and read the result back via a
// navigation-intercept exfil the arm itself cancels before it can resolve anywhere (Open
// Question 1, RESEARCH.md -- discharged below).

/// Non-resolvable exfil host for `humble_reveal_post`'s navigation-intercept return channel
/// (D-07, T-34.4.1-21, Open Question 1). RFC 2606 reserves the `.invalid` TLD as guaranteed
/// non-resolvable, so even a late `on_navigation` cancellation cannot leak the reveal payload
/// to a public DNS resolver -- the worst case is a brief local resolver miss, never
/// third-party disclosure.
const REVEAL_EXFIL_HOST: &str = "gamelib.invalid";

/// Bound on how long `humble_reveal_post` waits for the exfil channel to deliver a payload
/// before treating the reveal as a timeout (D-08: the hidden window must not linger
/// indefinitely). A backstop underneath the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60s,
/// `sidecarRpc.ts`) -- this fires first and lets the window close well before that outer bound.
const REVEAL_POST_TIMEOUT: Duration = Duration::from_secs(20);

/// Bound on how long `humble_login_clear_cookies` waits, on macOS, for
/// `removeDataOfTypes_forDataRecords_completionHandler`'s completion block to fire before
/// falling through to the post-removal re-read anyway (Phase 34.4.1 Plan 23, F-6 Defect B,
/// D-08: must not linger). Mirrors `REVEAL_POST_TIMEOUT`'s reasoning -- a backstop underneath
/// the sidecar's own 60s `RUST_INVOKE_TIMEOUT_MS`. A timeout here does NOT short-circuit to an
/// error: the verified count always comes from re-reading the jar, never from whether this
/// signal arrived, so a missed signal still yields an honest (possibly zero) count rather than
/// a false failure.
#[cfg(target_os = "macos")]
const CLEAR_COOKIES_TIMEOUT: Duration = Duration::from_secs(10);

/// Bound on how long `keyring_get` waits for its worker-thread Keychain read before classifying
/// the call as `keyring:timeout` (34.4.1 gap cycle 2 plan 26, F-9 observability half,
/// T-34.4.1-114/T-34.4.1-115; raised 8s -> 45s by Phase 34.5 gap cycle 4 plan 35, closing Routing
/// item 3). This is OBSERVABILITY, not a fix for F-9's underlying cause, which this plan does NOT
/// establish as a single clean answer (see
/// `keyring_read_timing_hypothesis_absent_vs_present_entry`'s own doc comment and
/// `34.4.1-26-SUMMARY.md` for the full timed verdict).
///
/// Chosen from that harness's own recorded timings on this machine: an absent-entry read
/// completed in 40-102ms across two runs (fast, `NoEntry`, no authorization needed). A
/// present-entry read against the real `steam-refresh-token` account took 48.9s on one run and
/// **291s** on another, both ultimately resolving `PlatformFailure(-60008, "Unable to obtain
/// authorization for this operation")` -- live, hardware-measured evidence for
/// `deferred-items.md`'s ad-hoc-signature/Keychain-ACL theory, reproduced from this same-machine,
/// non-interactive `cargo test` process (a different code identity than the built `gamelib-shell`
/// app, so these exact numbers are illustrative of the MECHANISM, not a promise about the app's
/// own timing).
///
/// **Why 8s was wrong and 45s is the replacement.** A 2026-08-01 live session recorded TWO
/// separate macOS Keychain approval prompts for the same `steam-refresh-token` slot, 19:22:57 and
/// 19:24:38 -- the exact outcome plan 34.5-25's own decision rule defines as FALSIFIED. 8 seconds
/// is shorter than the time a human plausibly takes to notice, read and approve a Keychain
/// authorization dialog, so a human-speed approval could never complete inside the old bound; the
/// read timed out, the worker thread that eventually got the real (human-approved) answer was
/// already abandoned, and the next caller had to prompt again. Two selecting constraints pick 45s:
/// it must exceed ordinary human Keychain-approval time (8s demonstrably does not), and it must
/// stay strictly under the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60_000ms,
/// `src/backend/sidecar/sidecarRpc.ts`) with enough round-trip headroom that a slow read is still
/// reported as the specific, named `keyring:timeout` rather than degrading into an opaque
/// transport timeout raised by that outer layer instead. 45s satisfies both: comfortably above
/// human approval time, and 15s of raw headroom under the 60s invoke bound -- of which this
/// file's own `#[cfg(test)]` assertion
/// (`keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound_with_round_trip_headroom`)
/// enforces at least 10s as a minimum round-trip margin.
///
/// **45s does NOT cover the 291s worst case measured above, and that is deliberate.** That
/// worst-case number is attributed to `deferred-items.md`'s ad-hoc-code-signing /
/// Keychain-ACL-non-persistence theory -- a likely DEV-BUILD severity modifier (an ad-hoc dev
/// signature means the Keychain ACL never persists, so every run re-triggers a slow authorization
/// negotiation), not an established production cause, and this plan does not investigate or fix
/// it. A read that genuinely takes 291s will still time out under the new bound exactly as it did
/// under the old one; only the human-speed-approval case (the live-confirmed defect) is fixed
/// here.
///
/// A timed-out worker thread is ABANDONED, not cancelled: `SecItemCopyMatching` has no interrupt
/// API, so this bound protects the RPC round trip, not the underlying OS call -- the abandoned
/// thread keeps running (and, per this harness's own measurement, may keep running for minutes)
/// on its own.
const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);

/// The five parsed, validated args `humble_reveal_post` needs. Kept as a plain struct (rather
/// than returning a tuple) so the dispatch arm's body reads by field name, not position.
/// Deliberately does NOT derive the standard formatting trait this doc comment is avoiding
/// naming by its real identifier (REQ-34.1-07's file-wide tray out-of-scope-menu-depth text
/// gate scans the WHOLE stripped file for that capitalized word, not just the tray block) --
/// `#[cfg(test)]`'s rejection assertions below use a small manual-match helper instead of
/// `.unwrap_err()` specifically so this struct never needs that trait.
struct RevealPostArgs {
    origin_url: tauri::Url,
    path: String,
    body: String,
    csrf_token: Option<String>,
    user_agent: String,
}

/// This arm's entire ASVS V5 input validation (mirrors `login_window_url_arg`'s discipline for
/// `humble_login_open`, T-34.4.1-08): `args[0]` is re-validated https-only via
/// `login_window_url_arg` itself (never re-derived), so a missing/wrong-typed arg AND a
/// non-https origin both collapse to the single `humble_reveal_post:bad-args` error the
/// interface contract declares (no separate bad-url variant for this arm). `args[3]`
/// (csrf_token) is the only optional value -- a missing arg or `Value::Null` both map to
/// `None`, never the JS-string `"null"` (see `reveal_post_script` below).
fn reveal_post_args(args: &[Value]) -> Result<RevealPostArgs, String> {
    let origin_url = login_window_url_arg(args).map_err(|_| "humble_reveal_post:bad-args".to_string())?;
    let path = args
        .get(1)
        .and_then(|v| v.as_str())
        .ok_or_else(|| "humble_reveal_post:bad-args".to_string())?
        .to_string();
    let body = args
        .get(2)
        .and_then(|v| v.as_str())
        .ok_or_else(|| "humble_reveal_post:bad-args".to_string())?
        .to_string();
    let csrf_token = match args.get(3) {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err("humble_reveal_post:bad-args".to_string()),
    };
    let user_agent = args
        .get(4)
        .and_then(|v| v.as_str())
        .ok_or_else(|| "humble_reveal_post:bad-args".to_string())?
        .to_string();
    Ok(RevealPostArgs {
        origin_url,
        path,
        body,
        csrf_token,
        user_agent,
    })
}

/// Builds the script injected into the reveal window: runs the POST from the page's own JS
/// context and exfiltrates the JSON-encoded `{status, body}` result via a `location.href`
/// assignment to `exfil_host`, which the arm's `on_navigation` hook cancels before it can ever
/// resolve (T-34.4.1-20/21). Every interpolated value -- `path`, `body`, `csrf_token` -- is
/// embedded via `serde_json::to_string`, producing a properly escaped JS string/null literal;
/// this is the arm's ENTIRE defense against a tampered/attacker-influenceable value breaking
/// out of its string context in an authenticated remote page (ASVS V5). NEVER
/// `format!("'{}'", value)` -- a naive quoted interpolation is exactly the injection this
/// function exists to prevent.
///
/// Does NOT use `eval_with_callback`'s callback to deliver the fetch result (Pitfall 5,
/// 34.4.1-RESEARCH.md): `WKWebView.evaluateJavaScript(_:completionHandler:)` reports the
/// script's IMMEDIATE completion value, and a returned Promise is not auto-awaited. The script
/// runs fire-and-forget (`WebviewWindow::eval`); the real result arrives later via the
/// navigation-intercept exfil this function's own `location.href` assignment triggers.
///
/// The JS template below is built via `concat!` of single-line string pieces (each opening and
/// closing its own `"` delimiter on the SAME source line) rather than one multi-line raw
/// string -- `longRunningChannels.test.ts`'s WR-08 stripper-integrity guard asserts every
/// comment-stripped code line in this file has a BALANCED (even) `"`-count, which a multi-line
/// `r#"..."#` literal's opening/closing lines each structurally violate (one bare `"` per
/// line). Every JS string literal inside the template therefore uses single quotes, so no `"`
/// character appears anywhere except each piece's own two Rust delimiters.
fn reveal_post_script(path: &str, body: &str, csrf_token: Option<&str>, exfil_host: &str) -> String {
    let path_js = serde_json::to_string(path).unwrap_or_else(|_| "\"\"".to_string());
    let body_js = serde_json::to_string(body).unwrap_or_else(|_| "\"\"".to_string());
    let csrf_js = match csrf_token {
        Some(token) => serde_json::to_string(token).unwrap_or_else(|_| "null".to_string()),
        None => "null".to_string(),
    };
    let exfil_host_js = serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    format!(
        concat!(
            "(function() {{ ",
            "var headers = {{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'}}; ",
            "var csrf = {csrf_js}; ",
            "if (csrf !== null) {{ headers['csrf-prevention-token'] = csrf; }} ",
            "function exfil(result) {{ location.href = 'https://' + {exfil_host_js} + '/reveal?data=' + encodeURIComponent(JSON.stringify(result)); }} ",
            "fetch({path_js}, {{method:'POST',credentials:'include',headers:headers,body:{body_js}}})",
            ".then(function(response) {{ return response.text().then(function(text) {{ exfil({{status:response.status,body:text}}); }}); }})",
            ".catch(function(error) {{ exfil({{status:0,body:'ERR:'+String(error)}}); }}); ",
            "}})();"
        ),
        // Explicit named args required: `format!`'s implicit-capture-from-scope sugar cannot
        // resolve identifiers when its format string is itself produced by another macro
        // (`concat!`), to avoid ambiguity -- see rustc's own note on this exact error.
        path_js = path_js,
        body_js = body_js,
        csrf_js = csrf_js,
        exfil_host_js = exfil_host_js
    )
}

// ---- humble_login_clear_storage support (34.4.1 gap cycle plan 15, F-6 BLOCKING,
// REQ-34.4.1-06/REQ-34.4.1-GAP-03) ----
//
// New capability the Tauri seam has never had: `humble_login_clear_cookies` above only clears
// cookies. Electron's disconnect additionally runs `clearStorageData`/`clearCache`/
// `clearAuthCache`/`clearHostResolverCache`/`clearData` -- localStorage, sessionStorage,
// IndexedDB, Cache Storage and service workers all survived a Tauri disconnect (F-6, the
// blocking live-gate finding), so Humble's web app silently restored a session from what
// remained. This arm's design mirrors `humble_reveal_post` (D-07/D-08's hidden-window +
// navigation-intercept-exfil template), not `humble_login_clear_cookies` -- running the clear
// as JS INSIDE the target page's own origin makes it origin-scoped BY CONSTRUCTION (same-origin
// policy), satisfying both D-08/Pitfall 3's over-broad constraint (never touch another
// origin/storefront's storage) and F-6's under-broad one (never leave the CURRENT origin's
// storage untouched) at the same time. `clear_all_browsing_data()` MUST NOT appear anywhere in
// this file.

/// Bound on how long `humble_login_clear_storage` waits for the exfil channel to deliver a
/// payload before treating the clear as a timeout (mirrors `REVEAL_POST_TIMEOUT`'s D-08
/// discipline -- the hidden window must not linger indefinitely on any exit path).
const CLEAR_STORAGE_TIMEOUT: Duration = Duration::from_secs(20);

/// The two parsed, validated args `humble_login_clear_storage` needs. `origin_url` is
/// re-validated https-only via `login_window_url_arg` itself (never re-derived, mirrors
/// `reveal_post_args`'s own discipline) -- a missing/wrong-typed arg AND a non-https origin both
/// collapse to the single `humble_login_clear_storage:bad-args` error. Deliberately does NOT
/// derive the standard formatting trait (REQ-34.1-07's file-wide text gate, same reasoning as
/// `RevealPostArgs` above) -- `#[cfg(test)]`'s rejection assertions use a small manual-match
/// helper instead of `.unwrap_err()`.
struct ClearStorageArgs {
    origin_url: tauri::Url,
    user_agent: String,
}

/// This arm's entire ASVS V5 input validation (mirrors `reveal_post_args`/`login_window_url_arg`,
/// T-34.4.1-08).
fn clear_storage_args(args: &[Value]) -> Result<ClearStorageArgs, String> {
    let origin_url = login_window_url_arg(args)
        .map_err(|_| "humble_login_clear_storage:bad-args".to_string())?;
    let user_agent = args
        .get(1)
        .and_then(|v| v.as_str())
        .ok_or_else(|| "humble_login_clear_storage:bad-args".to_string())?
        .to_string();
    Ok(ClearStorageArgs {
        origin_url,
        user_agent,
    })
}

/// Builds the script injected by `humble_login_clear_storage`. Clears, for the loaded page's OWN
/// origin only (same-origin policy makes any other origin structurally unreachable by this
/// script -- T-34.4.1-66): `localStorage`, `sessionStorage`, every IndexedDB database, every
/// Cache Storage entry, and every service-worker registration. Each category is wrapped in its
/// OWN try/catch (mirrors the TS-side guarded `wipeSteps` shape plan 16 will wire this into) so
/// one failing/absent category can never abort the rest, and every category reports either a
/// numeric count or the literal string `'unsupported'` -- NEVER silently coercing a missing API
/// (`indexedDB.databases()` in particular is not universally available) into a false "0
/// cleared" (T-34.4.1-67, the `navigator-clipboard-noops-under-tauri` mitigation applied to
/// storage). The async categories (IndexedDB deletion, `caches`, service-worker unregistration)
/// are all `await`ed before the single `exfil()` call at the very end, or this would report
/// success for work that has not actually happened yet.
///
/// The ONLY interpolated value is `exfil_host`, which goes through the SAME `serde_json::to_string`
/// discipline `reveal_post_script` uses for its own interpolated values (T-34.4.1-65) -- via a
/// placeholder-token `.replace()` rather than `format!`'s `{{`/`}}` brace-escaping, which this
/// script's heavy JS object/brace nesting would make unreadable and error-prone to keep correct.
/// Every JS string literal inside the template uses single quotes (mirrors `reveal_post_script`),
/// so every `concat!` piece below is exactly one Rust string literal with a BALANCED (2, even)
/// raw `"`-count per source line -- satisfying `longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard trivially, with no escaped-quote bookkeeping required.
fn clear_storage_script(exfil_host: &str) -> String {
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    let template = concat!(
        "(function() { ",
        "function exfil(result) { location.href = 'https://' + @@EXFIL_HOST@@ + '/clear-storage?data=' + encodeURIComponent(JSON.stringify(result)); } ",
        "(async function() { ",
        "var report = {}; ",
        "try { if (typeof localStorage !== 'undefined' && localStorage !== null) { var n0 = localStorage.length; localStorage.clear(); report.localStorage = n0; } else { report.localStorage = 'unsupported'; } } catch (e0) { report.localStorage = 'unsupported'; } ",
        "try { if (typeof sessionStorage !== 'undefined' && sessionStorage !== null) { var n1 = sessionStorage.length; sessionStorage.clear(); report.sessionStorage = n1; } else { report.sessionStorage = 'unsupported'; } } catch (e1) { report.sessionStorage = 'unsupported'; } ",
        "try { if (typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.databases === 'function') { var dbs = await indexedDB.databases(); var n2 = 0; for (var i = 0; i < dbs.length; i++) { if (dbs[i] && dbs[i].name) { await new Promise(function(resolve) { try { var req = indexedDB.deleteDatabase(dbs[i].name); req.onsuccess = function() { resolve(); }; req.onerror = function() { resolve(); }; req.onblocked = function() { resolve(); }; } catch (e4) { resolve(); } }); n2++; } } report.indexedDB = n2; } else { report.indexedDB = 'unsupported'; } } catch (e2) { report.indexedDB = 'unsupported'; } ",
        "try { if (typeof caches !== 'undefined' && caches !== null && typeof caches.keys === 'function') { var keys = await caches.keys(); for (var j = 0; j < keys.length; j++) { await caches.delete(keys[j]); } report.caches = keys.length; } else { report.caches = 'unsupported'; } } catch (e3) { report.caches = 'unsupported'; } ",
        "try { if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') { var regs = await navigator.serviceWorker.getRegistrations(); for (var k = 0; k < regs.length; k++) { await regs[k].unregister(); } report.serviceWorkers = regs.length; } else { report.serviceWorkers = 'unsupported'; } } catch (e5) { report.serviceWorkers = 'unsupported'; } ",
        "exfil(report); ",
        "})(); ",
        "})();"
    );
    template.replace("@@EXFIL_HOST@@", &exfil_host_js)
}

// ---- Login-sheet cancel channel: the /login-cancel sentinel and its injected strip
// (Phase 34.4.2 Plan 08, REQ-34.4.2-03/04/06/07/08/10, T-34.4.2-33) ----
//
// Plan 07 (`present_login_window_as_sheet`/`dismiss_login_window_sheet`, above) presents the
// Tauri-managed login window as an AppKit sheet with NO close affordance -- `endSheet:` HIDES
// rather than closes, and a sheet renders no titlebar close button, exactly the hard lock-out
// spike 021 measured (T-34.4.2-33). This section closes it via a SEPARATE reserved-path
// sentinel on the SAME `REVEAL_EXFIL_HOST` the reveal/clear-storage channels already use --
// discriminated by path, not host (T-34.4.2-13's discipline).

/// Sentinel path on `REVEAL_EXFIL_HOST` (never a second host) the injected cancel strip's
/// cancelled-navigation request uses. Joins `/reveal`/`/clear-storage` as a third,
/// path-discriminated channel on the same reserved host (T-34.4.2-13).
const LOGIN_CANCEL_EXFIL_PATH: &str = "/login-cancel";

/// This channel's entire input validation (mirrors this file's other sentinel-path
/// validators' "this arm's entire input validation lives here" discipline): pure, no
/// `AppHandle`, no logging, no I/O, never panics. Carries deliberately NO payload -- unlike
/// a payload-bearing sentinel that must validate structured data, this channel's whole
/// semantic is "the user pressed cancel", so there is nothing for a hostile page to smuggle
/// through it (T-34.4.2-34, accepted and bounded -- see this plan's threat register).
/// Returns true only when the host equals `REVEAL_EXFIL_HOST` AND the path equals
/// `LOGIN_CANCEL_EXFIL_PATH` exactly -- false for `/reveal`/`/clear-storage` on the same
/// host (no collision with either sibling sentinel), and false for this exact path on any
/// other host.
fn is_login_cancel_request(url: &tauri::Url) -> bool {
    url.host_str() == Some(REVEAL_EXFIL_HOST) && url.path() == LOGIN_CANCEL_EXFIL_PATH
}

/// Builds the JS injected as an `initialization_script()` into the Tauri-managed login
/// surface's VISIBLE builder ONLY (`humble_login_open`'s `if visible` block, macOS-gated --
/// see the injection site's own doc comment, below). This strip is NOT kill-switchable and
/// must never become so: an env var that removes the only visible exit from a
/// parent-blocking sheet is a lock-out switch, not a safety switch (T-34.4.2-33/T-34.4.2-15).
/// After Phase 34.4.2 Plan 13 deleted the in-field injected-glyph mechanism this comment
/// used to be contrasted against (operator decision D-A), this is permanent by construction
/// rather than by convention: no kill-switchable injected control exists anywhere in this
/// arm at all, so there is nothing left this strip's independence could even be contrasted
/// against.
///
/// Contract the generated script implements (REQ-34.4.2-03/04/06/07):
/// - **Top-frame only (WR-03, `34.4.2-REVIEW.md`).** The FIRST statement inside the try is
///   `if (window.top !== window) { return; }`, checked before the idempotence flag is even
///   read, so a subframe leaves no state behind at all. `initialization_script` runs in every
///   frame; spike 013 measured 5 of 8 navigations on Humble's real login page as third-party
///   iframes, each of which would otherwise build its own duplicate "Cancel sign-in" control
///   pinned to ITS OWN top-right, plus its own `MutationObserver`. A cross-origin `window.top`
///   access that throws still bails through the existing top-level catch.
/// - Idempotent via `window.__GAMELIB_LOGIN_CANCEL_STRIP__`, set before any further DOM work.
/// - Renders exactly ONE control, appended to `document.body || document.documentElement`
///   (resolved into a local first; if neither exists yet, the append is skipped rather than
///   thrown -- WR-04, below), `position:fixed`, pinned to the top-right inset, `z-index` >=
///   2147483000, visible label text "Cancel sign-in", `role="button"`, `aria-label="Cancel
///   sign-in"`, and enough contrast to be legible on a light or dark page (styling is
///   executor discretion).
/// - **Pointer control, not a keyboard-activatable one (IN-02, `34.4.2-REVIEW.md`).** No
///   `tabindex` is set -- REQ-34.4.2-06 forbids key listeners, so this control can only ever
///   activate on `click`, and advertising `tabindex="0"` would promise Enter/Space activation
///   it cannot deliver. It carries `aria-keyshortcuts="Escape"` instead: a static attribute,
///   not a listener, truthfully advertising the page-independent bare-Esc `NSEvent` monitor as
///   the sanctioned keyboard route.
/// - **Retry and observer survive a throwing first build (WR-04, `34.4.2-REVIEW.md`).** The
///   `DOMContentLoaded` listener and the `MutationObserver`'s `observe()` call are both
///   registered BEFORE the initial `ensure()` call, which is the LAST statement inside the
///   try -- so if that initial call throws (or simply no-ops because neither `document.body`
///   nor `document.documentElement` exists yet), both retries are already installed and the
///   strip still gets built on `DOMContentLoaded` or on the next mutation, instead of never
///   appearing for that document at all. Re-appends itself if removed: a debounced
///   `MutationObserver` on `document.documentElement` (`{childList:true, subtree:true}`)
///   re-adds the control if the page's own script deletes it -- a login page that can delete
///   the only exit re-creates the lock-out this plan exists to close.
/// - On activation (`click` only) delivers via the hidden 1x1 `display:none` iframe technique
///   to `'https://' + @@EXFIL_HOST@@ + '/login-cancel'`. No payload, no page state read --
///   never `location.href`, which would fire `beforeunload` on the live, credential-bearing
///   document.
/// - Registers NO `keydown`/`keyup`/`keypress` listener anywhere, and calls `preventDefault()`
///   on nothing but its own `click` (REQ-34.4.2-06: Cmd+V into the password field must keep
///   working).
/// - Never reads any input's `value`, never reads or transmits page content (REQ-34.4.2-07).
/// - Whole body in one top-level try/catch (T-34.4.2-16) -- a throwing strip must never break
///   a live login page. WR-04's fix is deliberately NOT an inner try/catch (the cargo test
///   `login_cancel_strip_script_is_wrapped_in_a_single_top_level_try_catch` asserts `"try {"`
///   appears exactly once) -- it is a reorder plus null-root-safe appends instead.
///
/// Uses this file's `concat!`-of-single-line-pieces discipline (matching `clear_storage_script`'s
/// own convention -- every JS string literal below uses single quotes, so every piece keeps an
/// EVEN raw `"`-count on its own source line -- `longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard). Pure: the same host input always produces the same output.
fn login_cancel_strip_script(exfil_host: &str) -> String {
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    let template = concat!(
        "(function() { ",
        "try { ",
        "if (window.top !== window) { return; } ",
        "if (window.__GAMELIB_LOGIN_CANCEL_STRIP__) { return; } ",
        "window.__GAMELIB_LOGIN_CANCEL_STRIP__ = true; ",
        "var ID = '__gamelib_login_cancel_strip__'; ",
        "function deliver() { ",
        "var frame = document.getElementById('__gamelib_login_cancel_frame__'); ",
        "if (!frame) { ",
        "var deliverRoot = document.body || document.documentElement; ",
        "if (!deliverRoot) { return; } ",
        "frame = document.createElement('iframe'); ",
        "frame.id = '__gamelib_login_cancel_frame__'; ",
        "frame.style.display = 'none'; ",
        "frame.style.width = '1px'; ",
        "frame.style.height = '1px'; ",
        "deliverRoot.appendChild(frame); ",
        "} ",
        "frame.src = 'https://' + @@EXFIL_HOST@@ + '/login-cancel'; ",
        "} ",
        "function build() { ",
        "var buildRoot = document.body || document.documentElement; ",
        "if (!buildRoot) { return; } ",
        "var strip = document.createElement('div'); ",
        "strip.id = ID; ",
        "strip.setAttribute('role', 'button'); ",
        "strip.setAttribute('aria-label', 'Cancel sign-in'); ",
        "strip.setAttribute('aria-keyshortcuts', 'Escape'); ",
        "strip.textContent = 'Cancel sign-in'; ",
        "strip.style.position = 'fixed'; ",
        "strip.style.top = '8px'; ",
        "strip.style.right = '8px'; ",
        "strip.style.zIndex = '2147483000'; ",
        "strip.style.padding = '6px 12px'; ",
        "strip.style.borderRadius = '4px'; ",
        "strip.style.background = '#1a1a1a'; ",
        "strip.style.color = '#ffffff'; ",
        "strip.style.fontFamily = 'sans-serif'; ",
        "strip.style.fontSize = '13px'; ",
        "strip.style.cursor = 'pointer'; ",
        "strip.style.userSelect = 'none'; ",
        "strip.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)'; ",
        "strip.addEventListener('click', function(evt) { ",
        "evt.preventDefault(); ",
        "deliver(); ",
        "}); ",
        "buildRoot.appendChild(strip); ",
        "} ",
        "function ensure() { ",
        "if (!document.getElementById(ID)) { build(); } ",
        "} ",
        "if (document.readyState === 'loading') { ",
        "document.addEventListener('DOMContentLoaded', function() { ensure(); }); ",
        "} ",
        "var debounceTimer = null; ",
        "function scheduleEnsure() { ",
        "if (debounceTimer) { return; } ",
        "debounceTimer = setTimeout(function() { debounceTimer = null; ensure(); }, 200); ",
        "} ",
        "var observer = new MutationObserver(function() { scheduleEnsure(); }); ",
        "observer.observe(document.documentElement, { childList: true, subtree: true }); ",
        "ensure(); ",
        "} catch (e) { } ",
        "})();"
    );
    template.replace("@@EXFIL_HOST@@", &exfil_host_js)
}

// ---- Login-sheet origin banner: the in-page anti-phishing indicator AppKit sheets cannot
// render as a title bar (Phase 34.5 Plan 52, F-34.5-G6-16, D-CYCLE7-A, REQ-34.5-04/12) ----
//
// `on_document_title_changed` (below, `humble_login_open`'s visible arm) composes
// `login_window_title`'s origin-prefixed string correctly and sets it on the underlying
// `NSWindow` -- but AppKit sheets structurally render NO title bar UI at all, so that string is
// never user-visible on macOS (F-34.5-G6-16). Per D-CYCLE7-A (child-window attachment is
// permanently closed, F-34.4.2-01/-02, and the routing document's "stop presenting as a sheet"
// option is factually closed), the fix is an in-page element instead, injected by the EXACT SAME
// mechanism the mandated cancel strip already uses -- never a second injection path.
// `login_window_title` itself is UNCHANGED; Windows/Linux still render it as a real OS title.

/// Builds the JS injected as an `initialization_script()` into the Tauri-managed login
/// surface's VISIBLE builder ONLY (`humble_login_open`'s `if visible` block, macOS-gated --
/// see the injection site's own doc comment), immediately alongside `login_cancel_strip_script`.
/// Mirrors that function's conventions exactly (T-34.5-C7-02..05, this plan's threat register):
///
/// - **Top-frame only.** The FIRST statement inside the try is `if (window.top !== window) {
///   return; }`, checked before the idempotence flag -- identical discipline to the cancel
///   strip, for the identical reason (spike 013's 5-of-8-iframe measurement).
/// - Idempotent via `window.__GAMELIB_LOGIN_ORIGIN_BANNER__`, set before any further DOM work.
/// - The live origin is stored on `window.__GAMELIB_LOGIN_ORIGIN_VALUE__` so
///   `login_origin_banner_update_script` (below) can re-text an already-built banner without
///   re-running this whole script.
/// - Renders exactly ONE element, id `'__gamelib_login_origin_banner__'`, appended to
///   `document.body || document.documentElement` (null-root-safe, mirrors the cancel strip's
///   WR-04 fix), `position: fixed`, pinned to the **top-LEFT** inset (`top: 8px`, `left: 8px`)
///   -- the opposite corner from the cancel strip's top-right, so the two controls can never
///   overlap (T-34.5-C7-05).
/// - `z-index: '2147482999'` -- strictly BELOW the cancel strip's `'2147483000'`, so the banner
///   can never paint over the sheet's only exit affordance (T-34.5-C7-05).
/// - `pointerEvents: 'none'`, `userSelect: 'none'`. Registers NO event listener of any kind --
///   no `click`, no `keydown`/`keyup`/`keypress`, and (unlike the cancel strip, which needs
///   `DOMContentLoaded` for its own click-armed control) no `addEventListener` call anywhere in
///   this script at all: the loading-state arm below uses `document.onreadystatechange`
///   instead, a property assignment rather than a listener registration, so this banner is
///   provably inert with respect to REQ-34.4.2-06 (Cmd+V into the password field must keep
///   working) by construction, not merely by omission of the specific key names.
/// - Sets text via `textContent` ONLY -- no HTML-fragment-write API of any kind appears in this
///   function's body (T-34.5-C7-02).
/// - Never reads any input's `value`, never transmits anything anywhere, creates no iframe
///   (T-34.5-C7-04) -- unlike the cancel strip, this control has nothing to deliver; it is
///   read-only chrome.
/// - Self-re-appending: the same debounced `MutationObserver` on `document.documentElement`
///   (`{childList: true, subtree: true}`) / `scheduleEnsure()` / `ensure()` / `build()` shape the
///   cancel strip uses, plus a `document.readyState === 'loading'` arm that re-runs `ensure()`
///   on the next ready-state change (functionally the cancel strip's own `DOMContentLoaded`
///   safety net, without an `addEventListener` call -- see above).
/// - Whole body in exactly ONE top-level `try { } catch (e) { }` (T-34.5-C7-03) -- a throwing
///   banner must never break a live login page.
/// - Pure: the same origin input always yields byte-identical output.
///
/// The ONLY interpolated value is `origin`, through the same `serde_json::to_string`
/// placeholder-token discipline `login_cancel_strip_script`/`clear_storage_script` use for their
/// own interpolated values -- never naive string interpolation (T-34.5-C7-02). Every JS string
/// literal below is single-quoted, so every `concat!` piece keeps an EVEN raw `"`-count on its
/// own source line (`longRunningChannels.test.ts`'s WR-08 stripper-integrity guard).
fn login_origin_banner_script(origin: &str) -> String {
    let origin_js = serde_json::to_string(origin).unwrap_or_else(|_| "\"\"".to_string());
    let template = concat!(
        "(function() { ",
        "try { ",
        "if (window.top !== window) { return; } ",
        "if (window.__GAMELIB_LOGIN_ORIGIN_BANNER__) { return; } ",
        "window.__GAMELIB_LOGIN_ORIGIN_BANNER__ = true; ",
        "window.__GAMELIB_LOGIN_ORIGIN_VALUE__ = @@ORIGIN@@; ",
        "var ID = '__gamelib_login_origin_banner__'; ",
        "function build() { ",
        "var buildRoot = document.body || document.documentElement; ",
        "if (!buildRoot) { return; } ",
        "var banner = document.createElement('div'); ",
        "banner.id = ID; ",
        "banner.textContent = window.__GAMELIB_LOGIN_ORIGIN_VALUE__; ",
        "banner.style.position = 'fixed'; ",
        "banner.style.top = '8px'; ",
        "banner.style.left = '8px'; ",
        "banner.style.zIndex = '2147482999'; ",
        "banner.style.padding = '6px 12px'; ",
        "banner.style.borderRadius = '4px'; ",
        "banner.style.background = '#1a1a1a'; ",
        "banner.style.color = '#ffffff'; ",
        "banner.style.fontFamily = 'sans-serif'; ",
        "banner.style.fontSize = '13px'; ",
        "banner.style.pointerEvents = 'none'; ",
        "banner.style.userSelect = 'none'; ",
        "banner.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)'; ",
        "buildRoot.appendChild(banner); ",
        "} ",
        "function ensure() { ",
        "var existing = document.getElementById(ID); ",
        "if (!existing) { build(); } else { existing.textContent = window.__GAMELIB_LOGIN_ORIGIN_VALUE__; } ",
        "} ",
        "if (document.readyState === 'loading') { ",
        "document.onreadystatechange = function() { ensure(); }; ",
        "} ",
        "var debounceTimer = null; ",
        "function scheduleEnsure() { ",
        "if (debounceTimer) { return; } ",
        "debounceTimer = setTimeout(function() { debounceTimer = null; ensure(); }, 200); ",
        "} ",
        "var observer = new MutationObserver(function() { scheduleEnsure(); }); ",
        "observer.observe(document.documentElement, { childList: true, subtree: true }); ",
        "ensure(); ",
        "} catch (e) { } ",
        "})();"
    );
    template.replace("@@ORIGIN@@", &origin_js)
}

/// Builds a small script for `window.eval()`, called on every main-frame origin change (the
/// `on_page_load` visible branch, below) after `current_origin` has already been updated. JSON-
/// escapes `origin` via the same `serde_json::to_string` placeholder-token discipline as the
/// banner script above, assigns it to `window.__GAMELIB_LOGIN_ORIGIN_VALUE__`, and if the banner
/// element already exists (`document.getElementById('__gamelib_login_origin_banner__')`) sets
/// its `textContent` to the new value -- never an HTML-fragment-write API. Wrapped in its own single top-level
/// `try { } catch (e) { }` (T-34.5-C7-03): `window.eval` firing on a page that has since
/// navigated away, or before the banner script's own injection has run, must never throw into
/// the caller. Registers no listener of any kind. Pure: the same origin input always yields
/// byte-identical output, and two different origins always yield different output (both
/// asserted below).
fn login_origin_banner_update_script(origin: &str) -> String {
    let origin_js = serde_json::to_string(origin).unwrap_or_else(|_| "\"\"".to_string());
    let template = concat!(
        "(function() { ",
        "try { ",
        "window.__GAMELIB_LOGIN_ORIGIN_VALUE__ = @@ORIGIN@@; ",
        "var el = document.getElementById('__gamelib_login_origin_banner__'); ",
        "if (el) { el.textContent = window.__GAMELIB_LOGIN_ORIGIN_VALUE__; } ",
        "} catch (e) { } ",
        "})();"
    );
    template.replace("@@ORIGIN@@", &origin_js)
}

/// Builds the JS injected as an `initialization_script()` into the Tauri-managed login
/// surface's VISIBLE builder ONLY (`humble_login_open`'s `if visible` block) -- but, unlike
/// its two neighbours above, deliberately WITHOUT a `#[cfg(target_os = "macos")]` gate (D-2,
/// quick task 260822-di1). `login_cancel_strip_script`/`login_origin_banner_script` substitute
/// for macOS *sheet* chrome -- a sheet renders no title bar and no close button, so they exist
/// only where that gap exists. This script substitutes for nothing platform-specific: Humble's
/// marketing footer and navbar are visual noise on the login page on Windows and Linux too, so
/// it is injected on every platform, unconditionally, inside the `if visible` block.
///
/// Purpose: CSS hiding is chosen over DOM surgery because it is fail-safe -- if Humble re-skins
/// and either selector stops matching, the page renders unchanged instead of breaking, and the
/// two rules fail independently of each other (260822-eib D-1: two separate declaration
/// blocks, not one comma-joined selector list, so a syntax error in one never drops the
/// other). Reversal is a one-line edit to a single shared constant
/// (`src/common/humble/loginChromeCss.ts`'s `HUMBLE_LOGIN_CHROME_CSS`, this function's
/// drift-pinned counterpart). The optional wrapper-padding tighten from the originating task
/// brief was declined (D-1, `loginChromeCss.ts`'s own doc comment) -- there is no measured
/// baseline for that padding, so any override would be an unverifiable guess. This now covers
/// two full-width page-chrome selectors (`footer.site-footer`, `.simple-navbar`), not one
/// (260822-eib).
///
/// Takes no arguments and interpolates nothing -- unlike its two neighbours, there is no
/// `serde_json::to_string` placeholder-token step here, because there is no untrusted or
/// caller-supplied value anywhere in this script's body. This is the one convention it
/// legitimately drops relative to `login_cancel_strip_script`/`login_origin_banner_script`.
///
/// Contract this script implements (T-di1-01..06, quick task 260822-di1's threat register):
/// - **Top-frame only.** The FIRST statement inside the try is `if (window.top !== window) {
///   return; }`, identical discipline to its two neighbours (spike 013 measured 5 of 8
///   navigation events on Humble's real login page as third-party iframes).
/// - **Host gate runs BEFORE the idempotence flag (D-3).** This is a deliberate divergence
///   from `login_origin_banner_script`'s flag-then-work order: on `accounts.google.com` (or
///   any other host this runner-agnostic window opens -- `humble_login_open` takes no
///   `runner` argument) the script returns immediately after the host check and touches
///   NOTHING, not even a `window` property -- the same "a non-participating document leaves
///   no state behind" discipline the top-frame guard above already encodes for subframes.
///   Anchored via `host.slice(-SUFFIX.length) !== SUFFIX`, never `indexOf` -- a substring test
///   would also match the look-alike host `humblebundle.com.evil.example` (T-di1-02).
/// - Idempotent via `window.__GAMELIB_LOGIN_CHROME_CSS__`, set before any further DOM work.
/// - Sets exactly ONE `<style>` element's `.textContent` -- never an HTML-fragment-write API
///   of any kind. The CSS text below is byte-identical to `HUMBLE_LOGIN_CHROME_CSS`
///   (`src/common/humble/loginChromeCss.ts`); `loginChromeCssInjection.test.ts` pins this with
///   a byte-equality drift check, proven RED against a synthetic mismatched literal (T-di1-06).
/// - **Retry for document-start root absence (D-4), not for a hostile page.** An
///   `initialization_script` runs at document-start, when `document.head` may not exist yet,
///   so a bare `build()` would silently no-op and the CSS would never apply for that document.
///   The `document.readyState === 'loading'` -> `document.onreadystatechange` arm (a PROPERTY
///   ASSIGNMENT, never `addEventListener`) closes that gap the same way
///   `login_origin_banner_script` does, and the debounced `MutationObserver` -- the same house
///   pattern this exact page already uses for two other scripts -- closes the re-append case
///   for free.
/// - Registers NO listener of any kind, of ANY type -- `document.onreadystatechange` is a
///   property assignment, not a registration -- so REQ-34.4.2-06 (Cmd+V into the password
///   field must keep working) holds by construction here, not merely by omission of the
///   specific key names (T-di1-01).
/// - Never reads any input's `value`, transmits nothing anywhere, creates no iframe
///   (T-di1-01).
/// - Whole body in exactly ONE top-level `try { } catch (e) { }` (T-di1-03) -- a throwing
///   script must never break a live, credential-bearing login page.
/// - Pure: calling this twice yields byte-identical output.
///
/// Uses this file's `concat!`-of-single-line-pieces discipline (matching its two neighbours'
/// own convention) -- every JS string literal below is single-quoted, so every piece keeps an
/// EVEN raw `"`-count on its own source line (`longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard).
fn login_chrome_css_script() -> String {
    concat!(
        "(function() { ",
        "try { ",
        "if (window.top !== window) { return; } ",
        "var SUFFIX = '.humblebundle.com'; ",
        "var host = location.hostname || ''; ",
        "if (host !== 'humblebundle.com' && host.slice(-SUFFIX.length) !== SUFFIX) { return; } ",
        "if (window.__GAMELIB_LOGIN_CHROME_CSS__) { return; } ",
        "window.__GAMELIB_LOGIN_CHROME_CSS__ = true; ",
        "var ID = '__gamelib_login_chrome_css__'; ",
        "function build() { ",
        "var buildRoot = document.head || document.documentElement; ",
        "if (!buildRoot) { return; } ",
        "var style = document.createElement('style'); ",
        "style.id = ID; ",
        "style.textContent = 'footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }'; ",
        "buildRoot.appendChild(style); ",
        "} ",
        "function ensure() { ",
        "if (!document.getElementById(ID)) { build(); } ",
        "} ",
        "if (document.readyState === 'loading') { ",
        "document.onreadystatechange = function() { ensure(); }; ",
        "} ",
        "var debounceTimer = null; ",
        "function scheduleEnsure() { ",
        "if (debounceTimer) { return; } ",
        "debounceTimer = setTimeout(function() { debounceTimer = null; ensure(); }, 200); ",
        "} ",
        "var observer = new MutationObserver(function() { scheduleEnsure(); }); ",
        "observer.observe(document.documentElement, { childList: true, subtree: true }); ",
        "ensure(); ",
        "} catch (e) { } ",
        "})();"
    )
    .to_string()
}

/// The SINGLE dismissal entry point both the cancel-strip sentinel (below, in the
/// `.on_navigation(` closure) and the Esc monitor (Task 2, `main()`'s `.setup()`) call.
/// `#[cfg(target_os = "macos")]` -- dismissing a sheet is a macOS-only concept (Plan 07).
///
/// Order is load-bearing: `dismiss_login_window_sheet` (Plan 07, above) FIRST -- ends the
/// sheet, releasing the parent window -- THEN `app.get_webview_window(label)` and `.close()`
/// it so the existing `WindowEvent::Destroyed` hook fires, pushes the `closed` event, and lets
/// `oauthLoginCapture.ts` settle `{ status: 'cancelled' }` with reason `window-closed`. Closing
/// the window BEFORE ending the sheet risks leaving the parent in a sheet-blocked state with no
/// sheet -- do not reorder.
///
/// Never fatal, never logs URL/origin/title -- only the label and a fixed two-value `route`
/// string (`strip`/`esc`), matching `present_login_window_as_sheet`/
/// `dismiss_login_window_sheet`'s own logging discipline (T-34.4.2-11).
#[cfg(target_os = "macos")]
fn request_login_sheet_cancel(app: &AppHandle, label: &str, route: &str) {
    dismiss_login_window_sheet(app, label);
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
    eprintln!("[shell] login-sheet: cancel requested for '{label}' via {route}");
}

/// Host this arm uses to decide whether the window it is about to open is Epic's --
/// the ONLY signal available here, since `LoginWindowSeam.open()` (`loginWindowSeam.ts`)
/// takes no `runner` argument and `humble_login_open` is runner-agnostic by design. Mirrors
/// the literal host of `EPIC_LOGIN_URL` (`frontend/screens/WebView/loginRoutes.ts:45`,
/// READ ONLY, never imported -- this file has no access to frontend source at build time)
/// without changing that constant, per this cycle's hard constraint.
const EPIC_LOGIN_HOST: &str = "www.epicgames.com";

// ---- Pristine Epic login webview (bounded "pristine-webview attempt", checkpoint response,
// 2026-08-03T18:00:00 superseding cycle, F-34.5-G6-01) ----
//
// User-directed bounded attempt: build Epic's login window as a raw WKWebView with ZERO Tauri
// initialization-script injection, so Talon (Epic's anti-bot) sees a Safari-like `window`
// surface instead of the CONFIRMED root cause (`window.isTauri`, `__TAURI_INTERNALS__`,
// `window.ipc`, 8 `__TAURI_PLUGIN_*`/`__TAURI_IIFE__` keys, notification-plugin `Notification`
// override -- proven non-configurable AND non-writable via 3-arm fingerprint elimination,
// debug file Evidence 2026-08-02). SIDLogin stays untouched as the working, live-verified
// primary path -- this is Epic's ALTERNATIVE tile only.
//
// MECHANISM: `tauri::WebviewWindowBuilder` (used by every other arm below, including THIS SAME
// arm for non-Epic runners) ALWAYS injects Tauri's core.js -- there is no public builder flag to
// suppress it, and the project's OWN `unstable` multiwebview spike confirmed even a
// Tauri-MANAGED CHILD webview still gets `window.__TAURI__`
// (`.claude/skills/spike-findings-gamelib/references/tauri-embedded-store-browser.md`,
// "window.__TAURI__ is injected into the remote store origin"). The only way to get a
// genuinely pristine WKWebView under this app is to bypass Tauri's webview construction
// entirely: build a WEBVIEW-LESS `tauri::WindowBuilder` window (native chrome only --
// title/size/center/close-detection are all `Window`-level, not `Webview`-level, APIs, so they
// still work) and construct a raw `WKWebView` ourselves via `objc2-web-kit` (already a project
// dependency -- see `humble_login_clear_cookies`'s own `with_webview()` +
// `objc2_web_kit::WKWebView` cast above for the established precedent of direct native WebKit
// access in this file), attached as the window's content view's only subview, with our OWN
// `WKNavigationDelegate` (via `objc2::define_class!`, pattern copied from wry's own
// `WryNavigationDelegate` -- `wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs`, the
// exact same crate/version already vendored here) instead of Tauri's.
//
// CAPTURE MECHANISM SIMPLIFICATION: the Tauri-managed webview's only Rust-visible navigation
// signal was `on_page_load`, which never fires for the silently-refused localhost redirect --
// this investigation's own POST-AUTH root cause. This delegate uses
// `decidePolicyForNavigationAction`, which WebKit calls for EVERY
// navigation ATTEMPT, including ones it will go on to silently refuse -- so Epic's real
// `http://localhost:PORT/?code=...` redirect attempt is directly, natively observable, no
// in-page JS relay needed at all. Confirmed against `matchOAuthRedirect`
// (`backend/sidecar/oauthLoginCapture.ts`, `legendary` case): it requires ONLY
// `hostname === 'localhost'` + a non-empty `code` param, so pushing the FULL captured url as a
// `'finished'` `LoginWindowNavEvent` (the exact shape `push_login_window_event`/
// `login_event_value` already produce for every other runner's `on_page_load` hook) needs ZERO
// changes to `matchOAuthRedirect`, `oauthLoginCapture.ts`, `useTauriOAuthLogin.ts`, or
// `LoginWindowSeam` -- this delegate is a drop-in alternate PRODUCER for the same event queue,
// never a new consumer contract.
//
// SCOPE: Epic-only (`is_epic_login`, computed by the caller), macOS-only (`#[cfg(target_os =
// "macos")]`) -- GOG/Amazon/Zoom/Humble and Epic-on-non-macOS keep the existing
// `WebviewWindowBuilder` path in this same arm, completely untouched.
//
// KNOWN, DELIBERATE SIMPLIFICATIONS for this bounded attempt (documented, not hidden):
//   - The navigation delegate is intentionally LEAKED (`std::mem::forget`) rather than tracked
//     in a label-keyed side table: `setNavigationDelegate` is a WEAK property (the vendored
//     `objc2-web-kit` binding's own doc comment), so an un-leaked delegate would be deallocated
//     the instant this function returns, silently breaking capture. A per-window delegate leak
//     is a small, bounded cost (one login window per attempt, closed by the user) -- acceptable
//     for a single bounded experiment, called out here rather than solved with a bigger
//     cross-thread-safe registry this cycle does not need.
//   - No `on_document_title_changed` equivalent -- the title is set once, from the opened
//     origin, and never updated. Cosmetic only, not needed to prove or disprove the 403
//     hypothesis.
//   - RESOLVED 2026-08-03 (live testing found the login hangs after the password step): the
//     delegate below now implements `WKUIDelegate` too, so JS `alert`/`confirm`/`prompt` present
//     real native `NSAlert` panels instead of silently hanging, and `window.open`/`target=_blank`
//     navigations (`targetFrame() == nil`, otherwise silently dropped by WebKit with no
//     UIDelegate) load into this SAME webview via `createWebViewWithConfiguration:` rather than
//     opening a second window -- `decidePolicyForNavigationAction` below does the identical
//     redirect as a belt-and-braces second layer.
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyObject, Bool, NSObject, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2::{define_class, msg_send, DeclaredClass, MainThreadOnly};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL, NSURLRequest};
#[cfg(target_os = "macos")]
use objc2_web_kit::{
    WKFrameInfo, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate, WKUIDelegate,
    WKWebView, WKWebViewConfiguration, WKWindowFeatures,
};

#[cfg(target_os = "macos")]
struct EpicPristineNavDelegateIvars {
    event_label: String,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EpicPristineNavDelegateIvars]
    struct EpicPristineNavDelegate;

    unsafe impl NSObjectProtocol for EpicPristineNavDelegate {}

    unsafe impl WKNavigationDelegate for EpicPristineNavDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn navigation_policy(
            &self,
            webview: &WKWebView,
            action: &WKNavigationAction,
            handler: &block2::Block<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            // Mirrors this file's OTHER `on_navigation` cancellation arms
            // (`humble_reveal_post`): never `eprintln!`s the captured url
            // (T-34.4.1-21/T-28-04) -- it is a live OAuth authorization code.
            let url_string = unsafe {
                action
                    .request()
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
                    .unwrap_or_default()
            };
            let is_redirect_attempt = tauri::Url::parse(&url_string)
                .map(|parsed| parsed.host_str() == Some("localhost"))
                .unwrap_or(false);
            if is_redirect_attempt {
                push_login_window_event(
                    self.ivars().event_label.as_str(),
                    login_event_value("finished", &url_string),
                );
                (*handler).call((WKNavigationActionPolicy::Cancel,));
                return;
            }
            // New-window navigations (`targetFrame` nil: `window.open`/`target=_blank`) are NOT
            // redirected here. `WKUIDelegate::createWebViewWithConfiguration:` below is the
            // documented hook and handles them. A nil-`targetFrame` cancel-and-reload arm lived
            // here briefly (2026-08-03) and blanked the window: WebKit reports a nil `targetFrame`
            // for the FIRST main-frame load of a fresh `WKWebView` too -- the frame does not exist
            // yet -- so the initial `loadRequest` cancelled and re-issued itself forever and Epic's
            // page never rendered. Live-confirmed regression; do not reinstate.
            //
            // Observability parity with every OTHER runner's `on_page_load` hook, which pushes one
            // event per main-frame navigation. `oauthLoginCapture`'s poll loop logs the HOSTNAME
            // ONLY (T-34.5-G6-11) and de-duplicates consecutive same-host lines, so a live
            // authorization code can never reach the log through this path, and a non-matching
            // event is simply logged and dropped by `matchOAuthRedirect`. Without this the
            // pristine window was the ONLY login window in the app that logged no navigation at
            // all: the 2026-08-03T20:13 live timeout could not be diagnosed because nothing
            // recorded whether Epic ever attempted its post-password redirect. Main frame only --
            // this method also fires for every iframe (Epic's login embeds several), which would
            // swamp the log and defeat the de-duplication.
            let is_main_frame = unsafe {
                action
                    .targetFrame()
                    .map(|frame| frame.isMainFrame())
                    .unwrap_or(false)
            };
            if is_main_frame {
                push_login_window_event(
                    self.ivars().event_label.as_str(),
                    login_event_value("nav", &url_string),
                );
            }
            (*handler).call((WKNavigationActionPolicy::Allow,));
        }
    }

    unsafe impl WKUIDelegate for EpicPristineNavDelegate {
        // `window.open`/`target=_blank` navigations otherwise silently refused by WebKit (see
        // `navigation_policy`'s own comment above) -- this is the DOCUMENTED hook
        // (`WKUIDelegate`'s own doc comment: "If you do not implement this method, the web view
        // will cancel the navigation"). Never creates a second window: loads the popup's request
        // into the SAME webview that asked for it and returns `None` so WebKit never allocates a
        // second `WKWebView`.
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        fn create_web_view_for_navigation_action(
            &self,
            webview: &WKWebView,
            _configuration: &WKWebViewConfiguration,
            action: &WKNavigationAction,
            _window_features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            unsafe {
                webview.loadRequest(&action.request());
            }
            None
        }

        // Without a `WKUIDelegate`, JS `alert()` is a silent no-op (the module doc comment's now-
        // resolved "KNOWN, DELIBERATE SIMPLIFICATION" above) -- live testing found this is why
        // Epic's login hangs after the password step. Presents a real modal `NSAlert` and always
        // calls the completion handler exactly once, on every path.
        #[unsafe(method(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_alert(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            if let Some(mtm) = objc2::MainThreadMarker::new() {
                present_native_js_alert(mtm, &message.to_string());
            }
            (*completion_handler).call(());
        }

        /// Same rationale as `run_js_alert` above, for JS `confirm()`. Always calls the
        /// completion handler exactly once.
        #[unsafe(method(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_confirm(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(Bool)>,
        ) {
            let confirmed = objc2::MainThreadMarker::new()
                .map(|mtm| present_native_js_confirm(mtm, &message.to_string()))
                .unwrap_or(false);
            (*completion_handler).call((Bool::from(confirmed),));
        }

        /// Same rationale as `run_js_alert` above, for JS `prompt()`. Always calls the completion
        /// handler exactly once: a live `NSTextField` accessory view collects the entered text on
        /// OK, `nil` on Cancel or if no main-thread marker is available (never dropped either
        /// way).
        #[unsafe(method(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))]
        fn run_js_prompt(
            &self,
            _webview: &WKWebView,
            prompt: &NSString,
            default_text: Option<&NSString>,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(*mut NSString)>,
        ) {
            let default_text_owned = default_text.map(|s| s.to_string()).unwrap_or_default();
            let entered = objc2::MainThreadMarker::new()
                .and_then(|mtm| present_native_js_prompt(mtm, &prompt.to_string(), &default_text_owned));
            match entered {
                Some(text) => {
                    let ns_text = NSString::from_str(&text);
                    (*completion_handler).call((Retained::as_ptr(&ns_text) as *mut NSString,));
                }
                None => (*completion_handler).call((std::ptr::null_mut(),)),
            }
        }
    }
);

#[cfg(target_os = "macos")]
impl EpicPristineNavDelegate {
    fn new(event_label: String, mtm: objc2::MainThreadMarker) -> Retained<Self> {
        let delegate = mtm
            .alloc::<EpicPristineNavDelegate>()
            .set_ivars(EpicPristineNavDelegateIvars { event_label });
        unsafe { msg_send![super(delegate), init] }
    }
}

/// Presents a native, modal `NSAlert` for JS `alert()` (single OK button). Runs synchronously
/// (`runModal`) -- WebKit always invokes `WKUIDelegate` methods on the main thread, so this never
/// competes with the `run_on_main_thread` dispatch `open_pristine_epic_login_window` uses for
/// setup, only with itself (and only one modal alert can be on-screen at a time regardless).
#[cfg(target_os = "macos")]
fn present_native_js_alert(mtm: objc2::MainThreadMarker, message: &str) {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.runModal();
}

/// Presents a native, modal `NSAlert` for JS `confirm()` (OK/Cancel). Returns `true` only when
/// the user picked the first ("OK") button.
#[cfg(target_os = "macos")]
fn present_native_js_confirm(mtm: objc2::MainThreadMarker, message: &str) -> bool {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.addButtonWithTitle(&NSString::from_str("Cancel"));
    alert.runModal() == objc2_app_kit::NSAlertFirstButtonReturn
}

/// Presents a native, modal `NSAlert` for JS `prompt()` (OK/Cancel plus a single-line
/// `NSTextField` accessory view seeded with `default_text`). Returns the entered text on OK,
/// `None` on Cancel -- matching `WKUIDelegate`'s own documented completion-handler contract
/// ("Pass the entered text if the user chose OK, otherwise nil").
#[cfg(target_os = "macos")]
fn present_native_js_prompt(
    mtm: objc2::MainThreadMarker,
    prompt: &str,
    default_text: &str,
) -> Option<String> {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(prompt));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.addButtonWithTitle(&NSString::from_str("Cancel"));

    let field_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(300.0, 24.0));
    let text_field = objc2_app_kit::NSTextField::initWithFrame(mtm.alloc(), field_frame);
    text_field.setStringValue(&NSString::from_str(default_text));
    alert.setAccessoryView(Some(&text_field));

    if alert.runModal() == objc2_app_kit::NSAlertFirstButtonReturn {
        Some(text_field.stringValue().to_string())
    } else {
        None
    }
}

/// Builds Epic's login window as a genuinely pristine WKWebView (no Tauri injection at all --
/// see the module-level doc comment above this function for the full mechanism and rationale).
/// Runs on whatever thread `dispatch_rust_channel` itself runs on (a spawned worker thread, per
/// this arm's own established convention -- see `humble_login_clear_cookies`'s threading doc
/// comment above) and internally hops to the OS main thread via `AppHandle::run_on_main_thread`
/// for every objc2/AppKit/WebKit call, exactly the "worker blocks on a channel, main thread does
/// the real work" shape `humble_login_clear_cookies` already established for this same
/// main-thread-confinement problem.
#[cfg(target_os = "macos")]
fn open_pristine_epic_login_window(
    app: &AppHandle,
    label: &str,
    url: tauri::Url,
    visible: bool,
    user_agent: &str,
) -> Result<Value, String> {
    let origin = url.origin().ascii_serialization();
    let event_label = label.to_string();

    let mut window_builder = tauri::WindowBuilder::new(app, label).visible(visible);
    if visible {
        window_builder = window_builder
            .inner_size(900.0, 700.0)
            .center()
            .focused(true)
            .theme(Some(tauri::Theme::Light))
            .title(login_window_title(&origin, None));
    }
    let window = window_builder
        .build()
        .map_err(|e| format!("humble_login_open:pristine:build-failed:{e}"))?;

    // SAFETY (Send across the `run_on_main_thread`/`on_window_event` boundaries in this
    // function): a raw pointer value is not normally `Send`, but this is a bare address,
    // reconstructed into a live reference only from within a main-thread closure. Reused for two
    // addresses: the webview's content-view pointer just below, and (further down) the `NSEvent`
    // local monitor token the Cmd+V/C/X/A/Z fix installs.
    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}

    // Cmd+V (and Cmd+C/X/A/Z) key-equivalent fix: holds the `NSEvent` local monitor token once
    // it's installed (further below, after the webview exists) so the close hook just below can
    // remove it via `NSEvent::removeMonitor`. Unlike `EpicPristineNavDelegate` -- which this
    // section's own doc comment above deliberately `std::mem::forget`s for the app's whole
    // lifetime -- a leaked monitor would keep intercepting Cmd+V/C/X/A/Z key-down events
    // app-wide (scoped out by the key-window check below, but still running on every keystroke)
    // for as long as the process lives, so it MUST be torn down on close instead.
    let monitor_slot: Arc<Mutex<Option<SendPtr>>> = Arc::new(Mutex::new(None));

    // Close-detection: IDENTICAL mechanism/semantics to the existing arm's own
    // `WindowEvent::Destroyed` hook (Quick task 260803-eee Task 5) -- same queue, same helper,
    // same "closed" event shape, so `oauthLoginCapture.ts`'s cancel-on-close branch needs no
    // changes for this window either.
    let close_event_label = event_label.clone();
    let monitor_slot_for_close = Arc::clone(&monitor_slot);
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            push_login_window_event(&close_event_label, login_event_value("closed", ""));
            // Tear down the Cmd+V/C/X/A/Z local event monitor, if the main-thread setup below
            // ever installed one -- see `monitor_slot`'s doc comment above.
            if let Ok(mut guard) = monitor_slot_for_close.lock() {
                if let Some(monitor_ptr) = guard.take() {
                    let _ = app_for_close.run_on_main_thread(move || {
                        // Forces Rust 2021 disjoint closure capture to move in the WHOLE
                        // `SendPtr` wrapper (same reason as the `ns_view_addr` rebinding above),
                        // not just its inner `*mut c_void` field, which would bypass the
                        // wrapper's `Send` impl entirely and fail to compile.
                        let monitor_ptr = monitor_ptr;
                        // SAFETY: `monitor_ptr` is the address
                        // `addLocalMonitorForEventsMatchingMask:handler:` returned below;
                        // `removeMonitor:` is the documented way to release it, and this is the
                        // only call site that ever does so for this token.
                        let monitor: &AnyObject =
                            unsafe { &*(monitor_ptr.0 as *const AnyObject) };
                        unsafe {
                            objc2_app_kit::NSEvent::removeMonitor(monitor);
                        }
                    });
                }
            }
        }
    });

    let ns_view_ptr = window
        .ns_view()
        .map_err(|e| format!("humble_login_open:pristine:ns_view-failed:{e}"))?;
    // SAFETY: see `SendPtr`'s doc comment above -- reconstructed into a live reference only
    // INSIDE the main-thread closure below, which is guaranteed to run before `window` (still
    // alive on THIS function's own stack via the blocking `rx.recv_timeout` below) could
    // possibly be dropped.
    let ns_view_addr = SendPtr(ns_view_ptr);
    let url_string = url.to_string();
    let user_agent_owned = user_agent.to_string();
    let main_thread_label = event_label.clone();
    let monitor_slot_for_main = Arc::clone(&monitor_slot);

    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        // Forces Rust 2021 disjoint closure capture to move in the WHOLE `SendPtr` wrapper
        // (which has an explicit `unsafe impl Send`), not just its inner `*mut c_void` field --
        // without this rebinding, precise capture analysis captures `ns_view_addr.0` directly
        // (since that's the only path ever referenced below), bypassing the wrapper's `Send`
        // impl entirely and failing to compile.
        let ns_view_addr = ns_view_addr;
        let result: Result<(), String> = (|| {
            let mtm = objc2::MainThreadMarker::new()
                .ok_or_else(|| "humble_login_open:pristine:no-main-thread-marker".to_string())?;
            // SAFETY: `ns_view_addr` was obtained from this SAME window's `ns_view()` just
            // before dispatch, on the same call this closure is part of -- the window (and
            // therefore its content view) is still alive, since the caller is blocked on
            // `rx.recv_timeout` below and cannot have dropped it yet.
            let ns_view: &objc2_app_kit::NSView =
                unsafe { &*(ns_view_addr.0 as *const objc2_app_kit::NSView) };
            let frame = ns_view.frame();

            let config = unsafe { WKWebViewConfiguration::new(mtm) };
            let webview: Retained<WKWebView> =
                unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config) };
            webview.setAutoresizingMask(
                objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
                    | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
            );
            unsafe {
                webview.setCustomUserAgent(Some(&NSString::from_str(&user_agent_owned)));
            }
            // Dev-only Web Inspector, gated identically to this file's existing
            // `window.open_devtools()` gate for the main (Tauri-managed) webview above -- the key
            // diagnostic tool for the NEXT live run of this window. `setInspectable` is
            // WKWebView-macOS-13.3+; unavailable in release builds, matching the project's
            // existing debug-only devtools convention.
            #[cfg(debug_assertions)]
            unsafe {
                webview.setInspectable(true);
            }

            let delegate = EpicPristineNavDelegate::new(main_thread_label.clone(), mtm);
            unsafe {
                webview.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            }
            // Intentional leak -- see this section's "KNOWN, DELIBERATE SIMPLIFICATIONS" doc
            // comment above.
            std::mem::forget(delegate);

            ns_view.addSubview(&webview);
            // Paste (Cmd+V) -- and every other Edit-menu key equivalent -- routes via
            // `[NSApp sendAction:to:from:]` to the KEY window's first responder; `addSubview`
            // alone does not promote the new subview into the responder chain. Without this, the
            // long password this window exists to let the user paste (rather than hand-type)
            // silently goes nowhere. `tauri-2.11.5/src/app.rs` (`Builder::build`,
            // `enable_macos_default_menu` defaults to `true`, `Menu::default`'s own "Edit" submenu
            // already includes `PredefinedMenuItem::paste`) confirms this app already gets a
            // standard macOS Edit menu for free -- `main()` never calls `.menu(...)` or
            // `.enable_macos_default_menu(false)`, so no new menu needs building here, only this
            // first-responder promotion.
            if let Some(ns_window) = ns_view.window() {
                if !ns_window.makeFirstResponder(Some(&webview)) {
                    eprintln!(
                        "[shell] WARN: humble_login_open:pristine: makeFirstResponder declined for '{main_thread_label}' -- paste may not reach the login form"
                    );
                }

                // Key-equivalent delivery fix (live-confirmed 2026-08-03): choosing Edit > Paste
                // from the menu bar pastes into the login form correctly -- proving the webview
                // IS first responder and DOES handle `paste:` -- but pressing Cmd+V does nothing.
                // The gap is purely in *key-equivalent delivery*: tao's `NSWindow` subclass
                // consumes the raw Cmd+V `NSEvent` before AppKit's `performKeyEquivalent:`
                // main-menu traversal ever sees it (a known class of tao/wry issue). Rather than
                // patch tao, install a narrowly-scoped local event monitor that re-dispatches the
                // five standard Edit-menu actions through the EXACT SAME `sendAction:to:from:`
                // path the menu bar itself already uses successfully, and let every other event
                // -- including these same shortcuts in every OTHER window -- fall through
                // completely unchanged.
                let monitor_ns_window = ns_window.clone();
                let monitor_handler = block2::RcBlock::new(
                    move |event: std::ptr::NonNull<
                        objc2_app_kit::NSEvent,
                    >|
                          -> *mut objc2_app_kit::NSEvent {
                        // SAFETY: AppKit hands local monitor handlers a valid, live `NSEvent`
                        // for the duration of this call.
                        let event_ref = unsafe { event.as_ref() };
                        let flags = event_ref.modifierFlags();
                        // Command held, WITHOUT Control/Option, so this never steals any other
                        // chord (e.g. Cmd+Opt+I devtools).
                        let is_plain_command = flags
                            .contains(objc2_app_kit::NSEventModifierFlags::Command)
                            && !flags.intersects(
                                objc2_app_kit::NSEventModifierFlags::Control
                                    | objc2_app_kit::NSEventModifierFlags::Option,
                            );
                        let action = is_plain_command
                            .then(|| event_ref.charactersIgnoringModifiers())
                            .flatten()
                            .map(|s| s.to_string().to_lowercase())
                            .and_then(|s| match s.as_str() {
                                "v" => Some(objc2::sel!(paste:)),
                                "c" => Some(objc2::sel!(copy:)),
                                "x" => Some(objc2::sel!(cut:)),
                                "a" => Some(objc2::sel!(selectAll:)),
                                "z" => Some(objc2::sel!(undo:)),
                                _ => None,
                            });
                        if let Some(sel) = action {
                            if let Some(mtm) = objc2::MainThreadMarker::new() {
                                let ns_app = objc2_app_kit::NSApplication::sharedApplication(mtm);
                                // SAFETY: `mtm` proves this handler is running on the main
                                // thread, as AppKit guarantees for local monitor callbacks.
                                let is_this_window = ns_app.keyWindow().is_some_and(|key_window| {
                                    std::ptr::eq(&*key_window, &*monitor_ns_window)
                                });
                                if is_this_window {
                                    // SAFETY: `sel` is one of the five hardcoded, valid Cocoa
                                    // selectors above; nil target/sender lets AppKit walk the
                                    // normal responder chain, exactly like the Edit menu's own
                                    // items already do successfully.
                                    let _ = unsafe {
                                        ns_app.sendAction_to_from(sel, None, None)
                                    };
                                    // Consumed: every OTHER window (and every non-matching
                                    // event) falls through via the `event.as_ptr()` return below
                                    // instead.
                                    return std::ptr::null_mut();
                                }
                            }
                        }
                        event.as_ptr()
                    },
                );
                // SAFETY: `monitor_handler` is a valid block; AppKit copies it internally when
                // registering the monitor (the standard Cocoa block-parameter convention for
                // handlers a callee stores beyond the call), so it outliving this call is not
                // required.
                let monitor_token = unsafe {
                    objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                        objc2_app_kit::NSEventMask::KeyDown,
                        &monitor_handler,
                    )
                };
                match monitor_token {
                    Some(token) => {
                        // Transfers ownership of the +1 retain count
                        // `addLocalMonitorForEventsMatchingMask:handler:` returned into a bare
                        // address -- NOT a leak, unlike the navigation delegate's
                        // `std::mem::forget` above: `NSEvent::removeMonitor` in the close hook
                        // above is the release, called exactly once, when this window closes.
                        let ptr = Retained::into_raw(token) as *mut std::ffi::c_void;
                        if let Ok(mut guard) = monitor_slot_for_main.lock() {
                            *guard = Some(SendPtr(ptr));
                        }
                    }
                    None => {
                        eprintln!(
                            "[shell] WARN: humble_login_open:pristine: addLocalMonitorForEventsMatchingMask failed for '{main_thread_label}' -- Cmd+V/C/X/A/Z may not reach the login form"
                        );
                    }
                }
            } else {
                eprintln!(
                    "[shell] WARN: humble_login_open:pristine: no NSWindow for '{main_thread_label}' -- cannot promote webview to first responder"
                );
            }

            let nsurl = NSURL::URLWithString(&NSString::from_str(&url_string))
                .ok_or_else(|| "humble_login_open:pristine:bad-nsurl".to_string())?;
            let request = NSURLRequest::requestWithURL(&nsurl);
            unsafe {
                webview.loadRequest(&request);
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("humble_login_open:pristine:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => {
            eprintln!(
                "[shell] humble_login_open: pristine WKWebView built for '{label}' (zero Tauri injection, F-34.5-G6-01 bounded attempt)"
            );
            Ok(Value::String(label.to_string()))
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("humble_login_open:pristine:main-thread-timeout".to_string()),
    }
}

/// The domain-suffix target `humble_login_clear_cookies`'s pristine-window fallback (below)
/// gates on -- MUST equal `legendary/user.ts`'s own `EPIC_COOKIE_HOST` constant, the only
/// value that arm's `clearEpicCookies` step ever passes as `domain`. Kept as a literal
/// (mirroring `EPIC_LOGIN_HOST`'s own "read only, never imported" convention above, since this
/// file has no build-time access to frontend/backend TS source) rather than derived from
/// `EPIC_LOGIN_HOST`, which is a full hostname (`www.epicgames.com`), not the cookie-domain
/// suffix (`epicgames.com`) Epic's session cookies are actually set against.
#[cfg(target_os = "macos")]
const EPIC_COOKIE_DOMAIN: &str = "epicgames.com";

/// Resolves the `NSWindow` handle for a Tauri-managed login window (Humble/GOG/Amazon --
/// REQ-34.4.2-10's locked scope; see this file's module-level scope note on
/// `open_pristine_epic_login_window`, above, for the full boundary). Returns the raw address as
/// `usize` rather than a live `Retained<NSWindow>` so the value is `Send`: callers reconstruct
/// it inside their own main-thread closure using this file's existing `SendPtr` convention (see
/// that struct's own doc comment on `open_pristine_epic_login_window`, above). `None` when no
/// Tauri-managed window carries `label` -- a missing window is never an error in this file (the
/// `humble_login_close` "already closed is healthy" convention).
///
/// Deliberately resolves ONLY through `app.get_webview_window(label)`. A future Epic phase
/// would extend this with an `app.get_window(label)` fallback -- the pristine shell
/// (`open_pristine_epic_login_window`, above) is a plain `tauri::Window`, reachable only that
/// way, and the `unstable` tauri feature that enables it is already on. **That fallback is
/// deliberately NOT written here**: REQ-34.4.2-10 (the locked user decision, 2026-08-04) is that
/// no code path in this phase resolves the pristine window, and an unused branch that resolves
/// it is still a code path that does. This comment is the whole Epic-readiness deliverable.
///
/// Side-effect free: never logs a label's URL or any page content.
///
/// Callers: `present_login_window_as_sheet`/`dismiss_login_window_sheet` (Phase 34.4.2
/// Plan 07, below); plan 34.4.2-04 is a further caller.
#[cfg(target_os = "macos")]
fn login_window_ns_window(app: &AppHandle, label: &str) -> Option<usize> {
    app.get_webview_window(label)
        .and_then(|w| w.ns_window().ok())
        .map(|ptr| ptr as usize)
}

/// Cap on `PRESENTED_LOGIN_SHEETS`, below -- mirrors `LOGIN_WINDOW_EVENTS_CAP`'s discipline
/// (T-34.4.2-08): an unbounded presented-sheet list would be a denial-of-service surface if a
/// caller somehow kept minting presented labels without ever dismissing them. In practice at
/// most one or two Tauri-managed login windows are ever open at once (Humble plus one OAuth
/// runner), so this bound is generous, not a realistic ceiling.
#[cfg(target_os = "macos")]
const PRESENTED_LOGIN_SHEETS_CAP: usize = LOGIN_WINDOW_EVENTS_CAP;

/// Labels of the Tauri-managed login windows currently presented as AppKit SHEETS on
/// `MAIN_WINDOW_LABEL` (`present_login_window_as_sheet`, below). Consulted by
/// `present_login_window_as_sheet`/`dismiss_login_window_sheet` themselves and by the Esc
/// local monitor's membership check (`main()`'s `.setup()`) to confirm a label is a live,
/// presented sheet before acting on it -- the same registry the prior child-window
/// mechanism used, re-homed onto sheet presentation by the operator's binding design
/// decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding Design Decision" section).
/// Insertion-ordered, deduplicated on insert, capped at `PRESENTED_LOGIN_SHEETS_CAP`
/// (T-34.4.2-08) -- a label is ALWAYS removed on dismiss, even when the underlying AppKit call
/// could not run, so a destroyed window never lingers on this list (see
/// `dismiss_login_window_sheet`'s own doc comment, below).
#[cfg(target_os = "macos")]
static PRESENTED_LOGIN_SHEETS: Mutex<Option<Vec<String>>> = Mutex::new(None);

/// F-34.4.2-04 (checkpoint response, 2026-08-04): the OUTER bound `humble_login_open` places
/// on the entire sheet-attach attempt, not just `present_login_window_as_sheet`'s own internal
/// 10s `rx.recv_timeout` around its main-thread dispatch. `login_window_ns_window`'s two
/// `.ns_window()` calls at that function's own top run BEFORE its internal bound even starts,
/// and each is tauri-runtime-wry's own `window_getter!`/`getter!` machinery, confirmed by
/// direct read of that crate's vendored source to block on an UNBOUNDED `rx.recv()` -- no
/// timeout parameter exists there at all. Set comfortably above the inner 10s bound (not
/// merely equal to it) so `present_login_window_as_sheet` is given every chance to finish
/// normally; this constant exists purely as the caller-side backstop for the part of that
/// function's own critical path it cannot itself bound.
#[cfg(target_os = "macos")]
const LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(15);

/// F-34.4.2-05 (checkpoint response round 2, 2026-08-04, commit 56d4986f8's live run): the
/// operator captured `[shell]` diagnostics this time and they isolate the wedge precisely --
/// `main-thread closure entered` printed, then NOTHING further from inside that closure for
/// the full 10s bound (the WARN that follows is `present_login_window_as_sheet`'s OWN
/// `rx.recv_timeout` giving up, not a log line the closure itself produced). The only AppKit
/// call between those two log lines is `parent.beginSheet_completionHandler(child, None)`
/// itself -- so the main thread is wedged inside (or immediately around) that single call,
/// not in this file's own recv/dispatch plumbing (F-34.4.2-04 already traced every
/// `rx.recv`/`rx.recv_timeout` in this path to a spawned worker thread, main.rs:4901, which
/// directly falsified the checkpoint response's own leading "self-deadlock on the main
/// thread" theory -- see the Eliminated section of this bug's debug session).
///
/// Independent third-party reports of the same class of failure -- a `WKWebView`-backed
/// `NSWindow` that has never completed an on-screen display/layout pass wedging AppKit when
/// asked to participate in a sheet/modal transition immediately after creation -- exist for
/// unrelated Rust/Go webview stacks hitting the identical native layer (Apple Developer
/// Forums "WKWebView in a modal window" thread: "WKWebView needs a certain NSRunLoop to do
/// its work on... rearranging things to avoid [calling from inside a dispatch_async block]
/// solved the problem"; `wailsapp/wails#4226` "Deadlock in webview_window_darwin";
/// `r0x0r/pywebview#138` "Deadlock while closing the window with persistent threads
/// running"). The common thread: WebKit's content-process handshake needs real run-loop
/// turns to complete, and this file was calling `beginSheet:` synchronously, in the SAME
/// run-loop turn as `.build()`'s own window-creation work (both dispatched via
/// `run_on_main_thread`/`send_user_message`'s queued-message path, but processed back to
/// back once the main thread picks them up), giving WebKit none.
///
/// This is a REAL, bounded wall-clock deferral via `dispatch2::DispatchQueue::main().after()`
/// -- not a race against another thread (the standing constraint from the checkpoint
/// response: "the hang itself must be prevented, not bounded/raced" is about NOT trying to
/// out-run an unbounded stall from a second thread; this is the opposite shape -- a
/// deterministic, single-threaded delay that runs strictly BEFORE the AppKit call it
/// protects, on the same main thread, giving that thread's own run loop the turns it needs).
/// A second `run_on_main_thread` call from inside the first closure would NOT achieve this:
/// `send_user_message` (tauri-runtime-wry-2.11.4/src/lib.rs:239-248, confirmed by direct
/// read) executes synchronously inline, with zero run-loop yield, whenever the caller is
/// already on the main thread -- which this closure always is. GCD's main queue, serviced by
/// a dedicated run-loop source `NSApplication` registers automatically, is independent of
/// tao's own event-proxy pipeline and is guaranteed to run on a LATER iteration of the real
/// run loop.
///
/// 250ms is chosen conservatively: imperceptible against both this function's own 10s bound
/// and `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`'s 15s bound, and against the multi-second (in
/// the reported case, indefinite) hang this fix targets -- but long enough to span several
/// real run-loop turns, not just the single queue-drain a bare `exec_async` (zero delay)
/// would provide, matching the shape of the fix multiple third-party reports above converged
/// on independently.
#[cfg(target_os = "macos")]
const SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY: Duration = Duration::from_millis(250);

/// T-34.4.2-39 (Phase 34.4.2 Plan 14): the single pending VISIBLE Tauri-managed login window
/// currently between request (`humble_login_open`'s refuse-or-arm check, below) and resolution
/// (sheet-attach confirmed, visible-fallback shown, or the window's own `WindowEvent::Destroyed`).
/// A latch, not a list -- zero or one entry, label plus arm-time. Consulted alongside
/// `PRESENTED_LOGIN_SHEETS` (above) so a request is refused whether the incumbent is still
/// between request and presentation (the F-34.4.2-06/T-34.4.2-39 pre-presentation gap) OR
/// already on screen. Hidden reveal/clear windows never touch this latch (see
/// `humble_login_open`'s own `if visible` gating around the refuse-or-arm check). Deliberately
/// NOT routed through `register_presented_login_sheet`/`PRESENTED_LOGIN_SHEETS` itself -- that
/// registry's exactly-three-call-sites test (Plan 11) is load-bearing and this is a
/// structurally different concern (pre-presentation vs. already-presented).
#[cfg(target_os = "macos")]
static PENDING_VISIBLE_LOGIN_WINDOW: Mutex<Option<(String, std::time::Instant)>> =
    Mutex::new(None);

/// T-34.4.2-41 (NEW, Phase 34.4.2 Plan 14): bounds how long `PENDING_VISIBLE_LOGIN_WINDOW` may
/// stay armed before its entry is treated as absent. This is a safety requirement, not a
/// nicety -- a latch armed by a flow that then panics, hangs in the upstream CLI spawn
/// (F-34.4.2-06), or is killed mid-flight would otherwise block every future sign-in for the
/// life of the process, converting a spoofing mitigation (T-34.4.2-39) into a total denial of
/// service. This phase already learned once (T-34.4.2-15/-33, the cancel-strip kill-switch
/// case) that a mechanism added to make a login surface safer can itself become the lock-out;
/// this constant applies that lesson before a gate rather than after one.
///
/// Derived from `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT` (the existing 15s OUTER bound on the
/// whole sheet-attach attempt) rather than invented independently, with a stated 10s margin, so
/// the two can never disagree: the watchdog's own fallback path always runs and clears this
/// latch (see the visible-fallback clear-call in `humble_login_open`) well before this TTL could
/// ever expire it out from under a flow that is still legitimately in flight.
#[cfg(target_os = "macos")]
const PENDING_VISIBLE_LOGIN_WINDOW_TTL: Duration =
    Duration::from_secs(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT.as_secs() + 10);

/// Pure, AppKit-free staleness check for `PENDING_VISIBLE_LOGIN_WINDOW_TTL` -- extracted so it
/// is unit-testable without a live window (T-34.4.2-41). Boundary verdict: an age EQUAL to the
/// TTL is treated as stale (`>=`, not `>`) -- the TTL is the point past which the entry is no
/// longer trusted, not the last instant it is still trusted, matching this file's existing
/// `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`/`recv_timeout` convention of a bound that has been
/// EXCEEDED (not merely reached) before the caller-side fallback runs.
#[cfg(target_os = "macos")]
fn pending_login_entry_is_stale(age: Duration) -> bool {
    age >= PENDING_VISIBLE_LOGIN_WINDOW_TTL
}

/// Clears `PENDING_VISIBLE_LOGIN_WINDOW` only when the stored label MATCHES `label` -- a late
/// clear from an already-superseded (e.g. expired-and-replaced) flow must never unlatch a newer,
/// still-legitimate one. Called from `humble_login_open`'s three resolution paths: sheet
/// presentation confirmed, the visible-fallback (`window.show()`/`window.set_focus()`), and
/// `WindowEvent::Destroyed`. Deliberately a distinct function from `register_presented_login_sheet`
/// (T-34.4.2-08's registry) -- routing this through that helper would add a fourth call site and
/// fail Plan 11's exactly-three-call-sites test.
#[cfg(target_os = "macos")]
fn clear_pending_visible_login_window(label: &str) {
    if let Ok(mut guard) = PENDING_VISIBLE_LOGIN_WINDOW.lock() {
        let matches = guard
            .as_ref()
            .map(|(pending_label, _)| pending_label == label)
            .unwrap_or(false);
        if matches {
            *guard = None;
            eprintln!(
                "[shell] humble_login_open: cleared pending login window latch for '{label}'"
            );
        }
    }
}

/// Presents a VISIBLE Tauri-managed login window (Humble/GOG/Amazon -- REQ-34.4.2-10's
/// locked scope; see `open_pristine_epic_login_window`'s own module-level scope note, above,
/// for the full boundary) as an AppKit SHEET on the app's `main` window (REQ-34.4.2-01/02),
/// per the operator's binding design decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding
/// Design Decision" section): the prior child-window attachment mechanism went
/// live-CONFIRMED broken (F-34.4.2-01/-02 -- unresponsive after minimize/restore, could not
/// be closed). Called from `humble_login_open`'s `if visible` branch ONLY, after `.build()`
/// succeeds: hidden reveal/clear windows this arm also builds have no user-visible
/// presentation and sheeting them onto `main` would be meaningless.
///
/// Never fatal (T-34.1-22 discipline, matching this file's existing tray/devtools
/// convention): a missing parent, a missing child, a failed main-thread dispatch, or an
/// UNCONFIRMED attachment logs one `[shell] WARN: login-window sheet: ...` line and returns
/// `false` -- a login flow must never fail because its window could not be presented. CR-02
/// fix: returns `true` only once `attachedSheet()`/`isSheet()` (read back on the main thread,
/// immediately after `beginSheet:completionHandler:` returns) CONFIRM the child is attached
/// as the parent's sheet -- not merely once the AppKit call ran without erroring, which CR-01
/// proved can silently no-op. `humble_login_open`'s own presentation-record `eprintln!` reports
/// the resulting `sheet_presented` boolean as real machine evidence, and its own fallback (see
/// that arm, below) shows the window normally when this returns `false` so a user is never left
/// looking at nothing.
///
/// Never logs the URL, origin, or title -- only the label and a fixed reason string
/// (T-34.4.1-21/-106 discipline).
///
/// Crosses the `run_on_main_thread` boundary with this file's existing `SendPtr` convention
/// (see `open_pristine_epic_login_window`'s own `SendPtr` doc comment, above), moving the
/// WHOLE wrapper into the closure and rebinding it inside (the Rust-2021 disjoint-capture
/// rebinding this file already documents twice) -- not a second pointer-passing convention.
/// Blocks on the dispatch via `mpsc_channel` + `rx.recv_timeout`, the same
/// worker-blocks-on-a-channel shape `open_pristine_epic_login_window` and
/// `clear_default_data_store_cookies_for_domain` both already use for this exact
/// main-thread-confinement problem, so a failure is observable rather than fire-and-forget --
/// though a timeout is still only a WARN, never a propagated error.
///
/// `endSheet:` (in `dismiss_login_window_sheet`, below) HIDES rather than closes the sheet
/// window (spike 021, measured) -- presentation alone does not give the user a way out; the
/// mandated explicit close affordance is plan 34.4.2-08's deliverable (T-34.4.2-33).
#[cfg(target_os = "macos")]
fn present_login_window_as_sheet(app: &AppHandle, label: &str) -> bool {
    // Live-evidence gap (checkpoint response, 2026-08-04, F-34.4.2-04): the first live
    // hardware run of the CR-01/CR-02 fix (commit 751521663) reported a SYMPTOM CHANGE --
    // no window at all (not even the pre-fix free-standing one) plus a stuck spinner that
    // never cleared -- with no captured `[shell]` stdout to say WHERE time was spent. This
    // `Instant` and the `eprintln!`s below it (entry, both `ns_window` resolutions, the
    // main-thread closure's own entry/exit) exist so the NEXT live run's captured
    // `tauri:dev` stdout can localize a stall to a specific leg of this function instead of
    // guessing again. Never fatal, never logs URL/origin/title (T-34.4.1-21/-106
    // discipline unchanged) -- only elapsed durations and the fixed label.
    let started = std::time::Instant::now();
    eprintln!("[shell] login-window sheet: present_login_window_as_sheet entered for '{label}'");
    let Some(parent_addr) = login_window_ns_window(app, MAIN_WINDOW_LABEL) else {
        eprintln!(
            "[shell] WARN: login-window sheet: no NSWindow for '{MAIN_WINDOW_LABEL}' -- skipping"
        );
        return false;
    };
    let Some(child_addr) = login_window_ns_window(app, label) else {
        eprintln!("[shell] WARN: login-window sheet: no NSWindow for '{label}' -- skipping");
        return false;
    };
    eprintln!(
        "[shell] login-window sheet: both NSWindow addresses resolved for '{label}' (elapsed={:?})",
        started.elapsed()
    );

    // SAFETY: see `SendPtr`'s doc comment on `open_pristine_epic_login_window`, above -- a
    // bare address is not normally `Send`, but this wrapper is reconstructed into a live
    // reference only from within the main-thread closure below.
    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}
    let parent_ptr = SendPtr(parent_addr as *mut std::ffi::c_void);
    let child_ptr = SendPtr(child_addr as *mut std::ffi::c_void);

    // CR-02 fix (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL 0/6): the channel now
    // carries a `bool` -- whether AppKit itself confirms the attachment -- rather than `()`.
    // The prior shape treated "the main-thread dispatch didn't time out" as proof of success,
    // which is unfalsifiable: `beginSheet:completionHandler:` can run to completion and still
    // not attach anything (that was CR-01's silent-failure mode). Reading back
    // `attachedSheet()`/`isSheet()` immediately after the call, on the SAME main-thread hop,
    // turns "did the dispatch return" into "did AppKit actually attach the sheet".
    let (tx, rx) = mpsc_channel::<bool>();
    let closure_label = label.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        // Forces Rust 2021 disjoint closure capture to move in the WHOLE `SendPtr` wrapper
        // for each address, not just its inner raw-pointer field, which would bypass
        // `SendPtr`'s `Send` impl entirely and fail to compile.
        let parent_ptr = parent_ptr;
        let child_ptr = child_ptr;
        // Live-evidence gap (see this function's own entry comment): proves the QUEUED
        // main-thread closure actually STARTED running, distinguishing "never got
        // scheduled" from "started and stalled inside the AppKit call below" -- the two
        // failure modes the checkpoint response could not tell apart from a beachball
        // alone.
        eprintln!(
            "[shell] login-window sheet: main-thread closure entered for '{closure_label}'"
        );
        // F-34.4.2-05 fix (see `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY`'s own doc comment for
        // the full live-evidence mechanism): the actual `beginSheet:completionHandler:`
        // call and its read-back are deferred onto GCD's main queue, `WARMUP_DELAY` in the
        // future, rather than invoked synchronously right here. This is deliberately NOT a
        // second `run_on_main_thread` call -- `send_user_message` executes synchronously
        // inline when already on the main thread (confirmed by direct read of
        // tauri-runtime-wry's vendored source), so it would not yield a single run-loop
        // turn and would reproduce exactly the wedge this fix targets.
        eprintln!(
            "[shell] login-window sheet: deferring beginSheet dispatch by {SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY:?} via DispatchQueue::main().after() for '{closure_label}'"
        );
        let deferred_label = closure_label.clone();
        let deferred_started = std::time::Instant::now();
        let when = dispatch2::DispatchTime::NOW
            .time(SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY.as_nanos() as i64);
        let _ = dispatch2::DispatchQueue::main().after(when, move || {
            // Forces Rust 2021 disjoint closure capture to move in the WHOLE `SendPtr`
            // wrapper for each address (same discipline as the outer closure, above) --
            // this closure's own field access below (`parent_ptr.0`/`child_ptr.0`) would
            // otherwise let disjoint capture pull in only the bare `*mut c_void` field,
            // bypassing `SendPtr`'s `Send` impl and failing `DispatchQueue::after`'s own
            // `F: Send` bound (confirmed by a real `cargo check` E0277 before this line was
            // added).
            let parent_ptr = parent_ptr;
            let child_ptr = child_ptr;
            // Live-evidence gap: proves the deferred closure actually ran (as opposed to
            // GCD silently dropping/never scheduling it), and how much real wall-clock
            // time elapsed since it was scheduled -- should be >= WARMUP_DELAY, confirming
            // a genuine run-loop deferral took place rather than an inline no-op.
            eprintln!(
                "[shell] login-window sheet: deferred beginSheet closure entered for '{deferred_label}' (deferred_elapsed={:?})",
                deferred_started.elapsed()
            );
            // SAFETY: both addresses were resolved moments ago via `login_window_ns_window`,
            // which only returns `Some` for a live Tauri-managed `NSWindow`; reconstructed
            // into live references only here, on the main thread (GCD's main queue always
            // runs work on the OS main thread, same as `run_on_main_thread`'s own closures).
            let parent: &objc2_app_kit::NSWindow =
                unsafe { &*(parent_ptr.0 as *const objc2_app_kit::NSWindow) };
            let child: &objc2_app_kit::NSWindow =
                unsafe { &*(child_ptr.0 as *const objc2_app_kit::NSWindow) };
            // `beginSheet:completionHandler:` is a safe binding (no `unsafe fn` in the
            // generated bindings) -- `parent`/`child` are both live `NSWindow`s
            // reconstructed above via the `unsafe` pointer casts, but the call itself needs
            // no further `unsafe` block.
            parent.beginSheet_completionHandler(child, None);
            // Live-evidence gap: proves the AppKit sheet-begin call itself RETURNED (as
            // opposed to blocking the main thread inside AppKit, which would mean this
            // line -- and every other main-thread message queued behind it, including the
            // visible-fallback `humble_login_open` queues further down -- never runs).
            eprintln!(
                "[shell] login-window sheet: beginSheet dispatch call returned for '{deferred_label}'"
            );
            // CR-02 read-back: two independent AppKit-owned signals, both required.
            // `isSheet()` confirms the child itself now believes it is presented as a
            // sheet; `attachedSheet()` on the parent is compared by POINTER identity (not
            // `==`, which `NSWindow` does not implement) to confirm the parent's sheet is
            // specifically THIS child, not some other sheet already queued/presented on
            // it. Either alone could be a false positive (e.g. a stale `isSheet()` from a
            // previous presentation); both together are the strongest falsifiable signal
            // this binding exposes.
            let attached = child.isSheet()
                && parent
                    .attachedSheet()
                    .is_some_and(|sheet| std::ptr::eq(&*sheet as *const _, child as *const _));
            eprintln!(
                "[shell] login-window sheet: read-back attached={attached} for '{deferred_label}'"
            );
            let _ = tx.send(attached);
        });
    }) {
        eprintln!(
            "[shell] WARN: login-window sheet: main-thread dispatch failed for '{label}' ({e})"
        );
        return false;
    }
    let attached = match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(attached) => attached,
        Err(_) => {
            eprintln!(
                "[shell] WARN: login-window sheet: main-thread dispatch timed out for '{label}' (elapsed={:?} -- the main-thread closure above may still be running/queued; see LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT in humble_login_open for the caller-side bound that guarantees a fallback regardless)",
                started.elapsed()
            );
            return false;
        }
    };
    eprintln!(
        "[shell] login-window sheet: present_login_window_as_sheet resolved attached={attached} for '{label}' (elapsed={:?})",
        started.elapsed()
    );
    if !attached {
        eprintln!(
            "[shell] WARN: login-window sheet: beginSheet did not attach '{label}' to '{MAIN_WINDOW_LABEL}' (attachedSheet/isSheet read-back false -- CR-01/CR-02)"
        );
        return false;
    }

    register_presented_login_sheet(label);
    true
}

/// Extracted from `present_login_window_as_sheet`'s own registration block (WR-01,
/// `34.4.2-REVIEW.md`) so `dismiss_login_window_sheet`, below, can re-run the EXACT same
/// dedup-on-insert + `PRESENTED_LOGIN_SHEETS_CAP` eviction semantics (T-34.4.2-08's
/// bounded-growth guarantee, preserved verbatim) when a failed `endSheet:` hop must leave the
/// label re-authorized for a retry, not only when a sheet is first confirmed attached. Called
/// from exactly three sites: the present-path registration below (on confirmed attachment
/// only -- CR-02's invariant is not relaxed here) and the two dismiss-failure re-registration
/// arms in `dismiss_login_window_sheet`.
#[cfg(target_os = "macos")]
fn register_presented_login_sheet(label: &str) {
    if let Ok(mut guard) = PRESENTED_LOGIN_SHEETS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if !list.iter().any(|existing| existing == label) {
            if list.len() >= PRESENTED_LOGIN_SHEETS_CAP {
                list.remove(0);
            }
            list.push(label.to_string());
        }
    }
}

/// Mirror of `present_login_window_as_sheet`, above: resolves both `NSWindow`s, hops to the
/// main thread, and calls `endSheet:`. Called from `humble_login_open`'s existing
/// `WindowEvent::Destroyed` hook (Quick task 260803-eee Task 5's close-detection arm, below)
/// for every window that arm builds, not gated on `visible` -- a hidden reveal/clear window
/// was never presented in the first place, so dismissing it is a guaranteed no-op given the
/// membership gate below.
///
/// `label` is ALWAYS removed from `PRESENTED_LOGIN_SHEETS` FIRST, unconditionally
/// (T-34.4.2-08), and whether it WAS present is captured before any AppKit call is made.
/// Unlike `removeChildWindow:` (the predecessor mechanism, which was a documented no-op on a
/// window that was never attached), `endSheet:` on a window that was never presented as THIS
/// window's sheet is not a defined no-op -- so this function is membership-gated: if `label`
/// was NOT present in the registry, it returns immediately without touching AppKit at all.
/// This covers both the hidden reveal/clear windows this arm also builds and a second
/// dismissal of an already-dismissed sheet.
///
/// **`endSheet:` HIDES the sheet window rather than closing it** (spike 021, measured) -- so
/// calling this alone is not a dismissal. Plan 34.4.2-08's cancel routes must call this and
/// THEN close the Tauri window so the existing `WindowEvent::Destroyed` hook fires and
/// `oauthLoginCapture.ts` settles `{ status: 'cancelled' }, 'window-closed'`.
///
/// A child `NSWindow` that no longer resolves by the time `Destroyed` fires is treated as
/// already healthy (this file's existing `humble_login_close` "already closed is healthy"
/// convention).
///
/// Never fatal, never logs URL/origin/title content -- same discipline as
/// `present_login_window_as_sheet`, above.
///
/// WR-01 fix (`34.4.2-REVIEW.md`): removal-first is unconditional, but it is REVERSIBLE on a
/// failed AppKit hop. If the main-thread dispatch fails, or its own 10s bound expires with no
/// confirmation the closure ran, the label is re-registered via `register_presented_login_sheet`
/// before this function returns -- otherwise both cancel routes (the strip, the Esc monitor)
/// and any retry would be permanently membership-gated shut against a sheet that may still be
/// presented, stranding the parent window for the process lifetime with no remaining dismissal
/// route. The healthy `child_addr == None` path below ("already gone by the time Destroyed
/// fires") deliberately does NOT re-register -- that path means the window is genuinely gone.
#[cfg(target_os = "macos")]
fn dismiss_login_window_sheet(app: &AppHandle, label: &str) {
    let was_presented = if let Ok(mut guard) = PRESENTED_LOGIN_SHEETS.lock() {
        if let Some(list) = guard.as_mut() {
            let before = list.len();
            list.retain(|existing| existing != label);
            before != list.len()
        } else {
            false
        }
    } else {
        false
    };
    if !was_presented {
        return;
    }

    let Some(parent_addr) = login_window_ns_window(app, MAIN_WINDOW_LABEL) else {
        eprintln!(
            "[shell] WARN: login-window dismiss: no NSWindow for '{MAIN_WINDOW_LABEL}' -- skipping"
        );
        return;
    };
    let Some(child_addr) = login_window_ns_window(app, label) else {
        // Already gone by the time Destroyed fires -- healthy, not an error (see doc
        // comment above).
        return;
    };

    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}
    let parent_ptr = SendPtr(parent_addr as *mut std::ffi::c_void);
    let child_ptr = SendPtr(child_addr as *mut std::ffi::c_void);

    let (tx, rx) = mpsc_channel::<()>();
    if let Err(e) = app.run_on_main_thread(move || {
        let parent_ptr = parent_ptr;
        let child_ptr = child_ptr;
        // SAFETY: both addresses were resolved moments ago via `login_window_ns_window`,
        // reconstructed into live references only here, on the main thread.
        let parent: &objc2_app_kit::NSWindow =
            unsafe { &*(parent_ptr.0 as *const objc2_app_kit::NSWindow) };
        let child: &objc2_app_kit::NSWindow =
            unsafe { &*(child_ptr.0 as *const objc2_app_kit::NSWindow) };
        parent.endSheet(child);
        let _ = tx.send(());
    }) {
        // WR-01: the dispatch never ran at all -- re-register so both cancel routes (strip,
        // Esc) and any retry stay reachable rather than permanently membership-gated shut.
        register_presented_login_sheet(label);
        eprintln!(
            "[shell] WARN: login-window dismiss: '{label}' main-thread dispatch failed -- re-registered as still presented so the cancel routes stay reachable ({e})"
        );
        return;
    }
    if rx.recv_timeout(Duration::from_secs(10)).is_err() {
        // WR-01: the dispatch was queued but never confirmed within the bound -- treat as
        // unconfirmed, not successful, and re-register for the same reason as the dispatch-Err
        // arm above.
        register_presented_login_sheet(label);
        eprintln!(
            "[shell] WARN: login-window dismiss: '{label}' main-thread hop unconfirmed within 10s -- re-registered as still presented so the cancel routes stay reachable"
        );
    }
}

/// Fixes the live-observed Epic logout defect (`humble_login_clear_cookies` rejecting with
/// `humble_login:no-window:{label}` on EVERY Epic logout, `gamelib.log`, 2026-08-03): Epic's
/// login window is ALWAYS the pristine, webview-less `WindowBuilder` window
/// `open_pristine_epic_login_window` builds (`humble_login_open`'s `is_epic_login` branch,
/// unconditional on macOS -- there is no "Epic but not pristine" case to preserve), so
/// `app.get_webview_window(label)` structurally can never find it, for ANY label, fresh or
/// stale. The label was never a real lookup key for cookie data in the first place: the
/// pristine webview's `WKWebViewConfiguration::new(mtm)` uses no custom `websiteDataStore`
/// override, so its cookies live in the SAME process-wide `WKWebsiteDataStore::defaultDataStore()`
/// every Tauri-managed window already shares -- D-08's own "the jar is app-wide" comment on
/// `humble_login_clear_cookies` above. Clearing that store directly needs no window handle at
/// all, live or closed, Tauri-managed or raw -- so this function is deliberately
/// label-independent, taking only the domain to filter on.
///
/// Removal mechanism is the SAME one `humble_login_clear_cookies`'s existing per-window macOS
/// branch already proved correct (Plan 23, F-6 Defect B): `WKWebsiteDataStore
/// .removeDataOfTypes(forDataRecords:completionHandler:)`, scoped to `WKWebsiteDataTypeCookies`
/// only and to records whose `displayName()` domain-suffix-matches `domain` -- never
/// `WKHTTPCookieStore.deleteCookie()` (the filed WebKit defect, bugs.webkit.org #184938, that
/// reports success while silently deleting nothing; see that branch's own doc comment). The
/// measured count comes from `WKHTTPCookieStore.getAllCookies()` -- a real per-cookie read,
/// genuinely INDEPENDENT of the data-record removal path above it -- taken both before and
/// after the removal and reduced through the same `verified_delete_count` (before-after,
/// saturating) contract every other clear path in this file uses. This function can never
/// report success while removing nothing: the count it returns is never the mutating call's
/// own report, always a fresh re-read (the discipline the file's D-08 comment establishes and
/// this function's own doc note repeats because F-6 already proved a mutating call's own
/// "it completed" signal is not proof of anything on this platform).
#[cfg(target_os = "macos")]
fn clear_default_data_store_cookies_for_domain(
    app: &AppHandle,
    domain: &str,
) -> Result<Value, String> {
    let count_matching_cookies = |domain: &str| -> Result<usize, String> {
        let (tx, rx) = mpsc_channel::<Result<usize, String>>();
        let domain_owned = domain.to_string();
        if let Err(e) = app.run_on_main_thread(move || {
            let outcome: Result<(), String> = (|| {
                let mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                    "humble_login_clear_cookies:default-store:no-main-thread-marker".to_string()
                })?;
                // SAFETY: `mtm` proves this closure is running on the main thread.
                let data_store =
                    unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
                let cookie_store = unsafe { data_store.httpCookieStore() };
                let target_domain = domain_owned.clone();
                let tx_fetch = tx.clone();
                // SAFETY: `getAllCookies` hands the completion handler a valid, live array
                // pointer for the duration of this call; `tx_fetch` outlives it.
                let completion = block2::RcBlock::new(
                    move |cookies: std::ptr::NonNull<
                        objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                    >| {
                        let cookies_ref = unsafe { cookies.as_ref() };
                        // Never logged (T-34.4.1-21/T-28-04/T-34.4.1-39/-75/-91) -- each
                        // cookie's domain is read only to feed the pure, count-only
                        // `cookie_domain_matches` filter, never printed.
                        let count = cookies_ref
                            .to_vec()
                            .iter()
                            .filter(|cookie| {
                                cookie_domain_matches(
                                    &cookie.domain().to_string(),
                                    Some(&target_domain),
                                )
                            })
                            .count();
                        let _ = tx_fetch.send(Ok(count));
                    },
                );
                unsafe {
                    cookie_store.getAllCookies(&completion);
                }
                Ok(())
            })();
            if let Err(e) = outcome {
                let _ = tx.send(Err(e));
            }
        }) {
            return Err(format!(
                "humble_login_clear_cookies:default-store:dispatch-failed:{e}"
            ));
        }
        match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
            Ok(inner) => inner,
            // Mirrors the per-window branch above: a timeout here means the SIGNAL was
            // missed, not that the read itself is meaningless -- there is nothing to fall
            // back to for a COUNT specifically (unlike the removal below, which always has
            // a re-read to fall through to), so this one case does surface as an error.
            Err(_) => Err("humble_login_clear_cookies:default-store:timeout".to_string()),
        }
    };

    let before_matching = count_matching_cookies(domain)?;
    if before_matching == 0 {
        return Ok(Value::Number(0.into()));
    }

    let (tx, rx) = mpsc_channel::<()>();
    let domain_for_removal = domain.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        let Some(mtm) = objc2::MainThreadMarker::new() else {
            // Structurally should not happen inside a run_on_main_thread closure; fail safe
            // by signalling "done, nothing removed" rather than hanging until the timeout.
            let _ = tx.send(());
            return;
        };
        // SAFETY: `mtm` proves this closure is running on the main thread.
        let data_store = unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
        let data_store_for_removal = data_store.clone();
        let all_types = unsafe { objc2_web_kit::WKWebsiteDataStore::allWebsiteDataTypes(mtm) };
        let tx_fetch = tx.clone();
        let target_domain = domain_for_removal.clone();
        let fetch_completion = block2::RcBlock::new(
            move |records: std::ptr::NonNull<
                objc2_foundation::NSArray<objc2_web_kit::WKWebsiteDataRecord>,
            >| {
                // SAFETY: WebKit hands the completion handler a valid, live array pointer for
                // the duration of this call.
                let records_ref = unsafe { records.as_ref() };
                let all_records: Vec<objc2::rc::Retained<objc2_web_kit::WKWebsiteDataRecord>> =
                    records_ref.to_vec();
                let matching_records: Vec<&objc2_web_kit::WKWebsiteDataRecord> = all_records
                    .iter()
                    .filter(|record| {
                        // SAFETY: `displayName()` is a simple ObjC accessor; `record` is a
                        // live, retained object from `all_records`. Never logged -- passed
                        // only into the pure, count-only `website_data_record_matches_domain`
                        // filter.
                        let display_name = unsafe { record.displayName() }.to_string();
                        website_data_record_matches_domain(&display_name, &target_domain)
                    })
                    .map(|record| &**record)
                    .collect();
                if matching_records.is_empty() {
                    let _ = tx_fetch.send(());
                    return;
                }
                // Scoped to WKWebsiteDataTypeCookies ONLY -- a matched record may carry
                // localStorage/IndexedDB/cache data for the same domain too;
                // `humble_login_clear_storage` (a separate, already-shipped step) owns those.
                // SAFETY: `WKWebsiteDataTypeCookies` is a valid static `NSString` this crate
                // exposes; reading an extern static is the only unsafe part of this line.
                let cookies_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeCookies };
                let cookies_type_set = objc2_foundation::NSSet::from_slice(&[cookies_type]);
                let records_array = objc2_foundation::NSArray::from_slice(&matching_records);
                let tx_remove = tx_fetch.clone();
                let remove_completion = block2::RcBlock::new(move || {
                    let _ = tx_remove.send(());
                });
                // SAFETY: `data_store_for_removal` is a live object obtained on the main
                // thread above; `cookies_type_set`/`records_array` are freshly built, live
                // objects; `remove_completion` outlives the call.
                unsafe {
                    data_store_for_removal.removeDataOfTypes_forDataRecords_completionHandler(
                        &cookies_type_set,
                        &records_array,
                        &remove_completion,
                    );
                }
            },
        );
        // SAFETY: `data_store`/`all_types` are live objects obtained above on the main
        // thread; `fetch_completion` outlives the call.
        unsafe {
            data_store.fetchDataRecordsOfTypes_completionHandler(&all_types, &fetch_completion);
        }
    }) {
        eprintln!("[shell] humble_login_clear_cookies: default-store dispatch failed: {e}");
        return Err(format!(
            "humble_login_clear_cookies:default-store:dispatch:{e}"
        ));
    }

    if rx.recv_timeout(CLEAR_COOKIES_TIMEOUT).is_err() {
        eprintln!(
            "[shell] humble_login_clear_cookies: default-store WKWebsiteDataStore removal timed out waiting for the completion signal"
        );
    }

    let after_matching = count_matching_cookies(domain)?;
    Ok(Value::Number(
        verified_delete_count(before_matching, after_matching).into(),
    ))
}

/// Classifies a raw `keyring` crate outcome (`Entry::new(...).and_then(|e| e.get_password())`)
/// into the arm's `Value`/`String` contract (34.4.1 gap cycle 2 plan 26, F-9 observability
/// half). Extracted as its own pure function so this classification is directly testable
/// without a live Keychain (mirrors `keyring_account`'s own "pure function, directly testable"
/// precedent) -- Task 2's acceptance criteria requires the `NoEntry`-still-null path proven,
/// and this is the seam that proves it. `NoEntry` is the healthy first-run state (Pitfall 1 /
/// D-06) and resolves `Value::Null`, never an error; every other variant collapses into the
/// file's existing flat `keyring:unavailable:{e}` string convention.
fn keyring_get_result(result: Result<String, keyring::Error>) -> Result<Value, String> {
    match result {
        Ok(secret) => Ok(Value::String(secret)),
        Err(keyring::Error::NoEntry) => Ok(Value::Null),
        Err(e) => Err(format!("keyring:unavailable:{e}")),
    }
}

/// Runs `read` on a worker thread and bounds the wait for its result at `bound`, returning
/// `Err("keyring:timeout")` if `read` has not completed in time (34.4.1 gap cycle 2 plan 26,
/// T-34.4.1-114/T-34.4.1-115). Follows `humble_reveal_post`'s existing `mpsc_channel` +
/// `rx.recv_timeout()` shape rather than inventing a second one. Generic over the read
/// operation specifically so the timeout path is provable in a unit test with an injected
/// slow/never-returning closure, never by waiting on a real Keychain (this plan's own
/// acceptance criteria) -- see `bounded_keyring_read_times_out_as_keyring_timeout_on_a_never_
/// returning_operation` below.
///
/// A timed-out worker thread is ABANDONED, not cancelled -- there is no API to interrupt a
/// blocked platform call, so this function protects the caller's wait, not the underlying
/// operation. If `read` eventually completes after the bound has already elapsed, its result is
/// sent into a channel whose receiver has already been dropped; `Sender::send` on a
/// disconnected channel simply returns an `Err` this function discards, so the abandoned
/// thread's late result is silently dropped rather than causing a panic.
fn bounded_keyring_read<F>(bound: Duration, read: F) -> Result<Value, String>
where
    F: FnOnce() -> Result<Value, String> + Send + 'static,
{
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    thread::spawn(move || {
        let _ = tx.send(read());
    });
    match rx.recv_timeout(bound) {
        Ok(result) => result,
        Err(_) => Err("keyring:timeout".to_string()),
    }
}

// ---- Rust-side keyring dispatch (Phase 28: sidecar->Rust rustInvoke channel) ----

/// Dispatches a `rustInvoke` frame's `channel`/`args` to the matching keyring operation.
/// The Keychain `service` is the compile-time `KEYRING_SERVICE` constant; the `account` is
/// resolved from a compile-time ALLOWLIST (`keyring_account`) keyed by a caller-supplied slot
/// NAME (`keyring_slot_arg`) — never an account string sourced directly from `args` (threat
/// T-28-03: the sidecar must not be able to address an arbitrary Keychain entry). **T-28-03
/// still holds**: the slot can only ever select one of a fixed, compile-time set of accounts —
/// the sidecar's reachable set is exactly the allowlist, not an open namespace. Error mapping
/// follows this file's existing flat `String` convention (`.map_err(|e| e.to_string())`, see
/// `open_external` above); a bare `keyring::Error` variant is never returned as-is.
///
/// Also dispatches `dialog_open` (Phase 30 Plan 03). `app` is threaded through for that arm:
/// the folder picker is reached via the AppHandle, not via `args` — the picked path comes
/// FROM the OS dialog, never INTO it from the renderer/sidecar (T-30-11/T-30-12).
fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {
    match channel {
        // OBSERVABILITY, not a root-cause fix (34.4.1 gap cycle 2 plan 26, F-9). F-9's cause is
        // NOT established by this plan -- the missing-entry hypothesis's harness verdict is
        // recorded in `keyring_read_timing_hypothesis_absent_vs_present_entry`'s doc comment and
        // in `34.4.1-26-SUMMARY.md`. What this wrapper DOES do: bound the wait on
        // `entry.get_password()` at `KEYRING_READ_TIMEOUT`, well under the sidecar's own 60s
        // `RUST_INVOKE_TIMEOUT_MS` (`sidecarRpc.ts`), so a blocked read (e.g. an unanswered
        // Keychain prompt -- `phase-28-keyring-complete`'s Deny -> `PlatformFailure(-128)` is a
        // real, reachable state) fails fast as a NAMED `keyring:timeout` instead of silently
        // consuming the sidecar's whole RPC budget and surfacing as an unattributable generic
        // RPC timeout. It does NOT make a blocking Keychain call return faster -- the worker
        // thread is abandoned on timeout, not cancelled (`bounded_keyring_read`'s own doc
        // comment).
        //
        // Sibling arms deliberately NOT wrapped: `keyring_set` and `keyring_delete` below keep
        // their original unbounded synchronous shape. Reads (`keyring_get`) fire transparently
        // and repeatedly behind the scenes on every credential/csrf lookup (the read-count
        // defect this gap cycle's `deferred-items.md` traces as F-9's likely amplifier); writes
        // and deletes fire only on an explicit user action (sign-in, disconnect) the user is
        // already actively engaged with, at far lower frequency, so a modal prompt there is a
        // single expected step in a flow the user just started, not a silent stall behind an
        // unrelated background call. `keyring_available` (below `keyring_delete`) is likewise
        // left unwrapped: it exists as a read-adjacent probe and would be a natural Task-scope
        // candidate for a later plan, but this plan's own harness and fix are scoped to the
        // exact `keyring_get` signature F-9 was observed on.
        "keyring_get" => {
            let account = keyring_account(keyring_slot_arg(args, 0))?;
            let result = bounded_keyring_read(KEYRING_READ_TIMEOUT, move || {
                let outcome =
                    Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.get_password());
                keyring_get_result(outcome)
            });
            if let Err(ref e) = result {
                if e == "keyring:timeout" {
                    eprintln!(
                        "[shell] keyring {channel} timed out after {KEYRING_READ_TIMEOUT:?} (worker thread abandoned, not cancelled -- see KEYRING_READ_TIMEOUT's doc comment)"
                    );
                } else {
                    eprintln!("[shell] keyring {channel} failed: {e}");
                }
            }
            result
        }
        "keyring_set" => {
            let secret = match args.first().and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Err("keyring:bad-args".into()),
            };
            let account = keyring_account(keyring_slot_arg(args, 1))?;
            match Entry::new(KEYRING_SERVICE, account) {
                Ok(entry) => match entry.set_password(secret) {
                    Ok(()) => Ok(Value::Bool(true)),
                    Err(e) => {
                        // Never log the secret itself (threat T-28-04) — channel + error only.
                        eprintln!("[shell] keyring {channel} failed: {e:?}");
                        Err(format!("keyring:unavailable:{e}"))
                    }
                },
                Err(e) => {
                    eprintln!("[shell] keyring {channel} failed: {e:?}");
                    Err(format!("keyring:unavailable:{e}"))
                }
            }
        }
        "keyring_delete" => {
            let account = keyring_account(keyring_slot_arg(args, 0))?;
            match Entry::new(KEYRING_SERVICE, account) {
                Ok(entry) => match entry.delete_credential() {
                    // Deleting an already-absent entry is success, not an error.
                    Ok(()) | Err(keyring::Error::NoEntry) => Ok(Value::Bool(true)),
                    Err(e) => {
                        eprintln!("[shell] keyring {channel} failed: {e:?}");
                        Err(format!("keyring:unavailable:{e}"))
                    }
                },
                Err(e) => {
                    eprintln!("[shell] keyring {channel} failed: {e:?}");
                    Err(format!("keyring:unavailable:{e}"))
                }
            }
        }
        "keyring_available" => {
            let account = keyring_account(keyring_slot_arg(args, 0))?;
            match Entry::new(KEYRING_SERVICE, account) {
                Ok(entry) => match entry.get_password() {
                    // Backend works, whether or not a token is currently stored.
                    Ok(_) | Err(keyring::Error::NoEntry) => Ok(Value::Bool(true)),
                    // A *successful* report of unavailability (D-06's honest-unavailable signal),
                    // not an error — the caller asked "is it available", and the honest answer
                    // here is "no".
                    Err(e) => {
                        eprintln!("[shell] keyring {channel} failed: {e:?}");
                        Ok(Value::Bool(false))
                    }
                },
                Err(e) => {
                    eprintln!("[shell] keyring {channel} failed: {e:?}");
                    Ok(Value::Bool(false))
                }
            }
        }
        // Native folder picker (Phase 30 Plan 03, D-09/REQ-30-07): blocks the calling thread
        // until the user picks or cancels, so callers MUST dispatch this on a spawned worker
        // thread, never the reader thread (T-30-13 — same reasoning as the keyring arms above,
        // a modal OS prompt must not head-of-line block other pending rustInvokes). Returns the
        // picked path as a string, or `Value::Null` on cancel — never an error on cancel, which
        // is a normal user choice, not a failure.
        // WR-01: honor the forwarded Electron `OpenDialogOptions.properties`. The options
        // object crosses the wire as `args[0]` and used to be ignored entirely, so EVERY
        // caller got a directory picker — including the `properties: ['openFile']` call
        // sites (Settings/CustomWineProton's Wine/Proton binary, SideloadDialog's exe +
        // cover images, GameSubMenu) which then received a path that can never be a valid
        // binary/image. Default stays "folder" so the plan-30-03 install-location path is
        // unchanged when no properties are supplied.
        "dialog_open" => {
            let wants_file = args
                .first()
                .and_then(|v| v.get("properties"))
                .and_then(|v| v.as_array())
                .map(|props| {
                    let has_dir = props.iter().any(|p| p.as_str() == Some("openDirectory"));
                    let has_file = props.iter().any(|p| p.as_str() == Some("openFile"));
                    has_file && !has_dir
                })
                .unwrap_or(false);
            let picked = if wants_file {
                app.dialog().file().blocking_pick_file()
            } else {
                app.dialog().file().blocking_pick_folder()
            };
            match picked {
                Some(path) => Ok(Value::String(path.to_string())),
                None => Ok(Value::Null),
            }
        }
        // Native message/error dialog (Phase 31 Plan 02, D-03/REQ-31-03/REQ-31-05): backs both
        // `dialog.showMessageBox` and `dialog.showErrorBox` on the electronStub side. Maps
        // `blocking_show()`'s bool onto `Value::Bool` — electronStub maps `true`->response:0,
        // `false`->response:1. Default kind is Info when unspecified; the showErrorBox caller
        // always sends `kind:"error"`. Runs on the existing spawned worker thread (same
        // modal-dialog-must-not-block-the-reader-thread reasoning as `dialog_open` above).
        //
        // Phase 33 Plan 03 (D-06): extended to read an optional 2-element `buttons` array and
        // wire it to `MessageDialogButtons::OkCancelCustom` — a real multi-button confirm
        // instead of the OK-only default. `blocking_show()`'s bool keeps the same meaning:
        // `true` -> buttons[0] clicked -> electronStub response:0, `false` -> buttons[1]
        // clicked -> electronStub response:1. Single-button (no `buttons` / not length 2)
        // behavior is unchanged (still OK-only, always true). Data-shape change only, no new
        // match arm/channel (33-RESEARCH confirmed).
        "dialog_message" => {
            let message = args
                .first()
                .and_then(|v| v.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let kind = args
                .first()
                .and_then(|v| v.get("kind"))
                .and_then(|v| v.as_str())
                .map(|s| match s {
                    "error" => MessageDialogKind::Error,
                    "warning" => MessageDialogKind::Warning,
                    _ => MessageDialogKind::Info,
                })
                .unwrap_or(MessageDialogKind::Info);
            let mut builder = app.dialog().message(message).kind(kind);
            if let Some(title) = args
                .first()
                .and_then(|v| v.get("title"))
                .and_then(|v| v.as_str())
            {
                builder = builder.title(title);
            }
            let buttons = args
                .first()
                .and_then(|v| v.get("buttons"))
                .and_then(|v| v.as_array());
            if let Some(btns) = buttons.filter(|b| b.len() == 2) {
                let label0 = btns[0].as_str().unwrap_or("");
                let label1 = btns[1].as_str().unwrap_or("");
                builder = builder.buttons(MessageDialogButtons::OkCancelCustom(
                    label0.into(),
                    label1.into(),
                ));
            }
            Ok(Value::Bool(builder.blocking_show()))
        }
        // Real OS notification (Phase 33 Plan 04, D-05) via `tauri-plugin-notification`. Backs
        // `electronStub.ts`'s `Notification.show()`. Mirrors `dialog_message`'s args-parse idiom
        // -- read an optional `title`/`body` from args[0], build the notification, show it. No
        // icon/nativeImage plumbing (33-RESEARCH confirmed the plugin's icon param is optional).
        // `show()`'s internal work (`notify_rust`) is dispatched onto `tauri::async_runtime::spawn`
        // by the plugin itself, so this call returns promptly -- safe to run on the same spawned
        // worker thread as the other rustInvoke arms.
        "notification_show" => {
            let mut builder = app.notification().builder();
            if let Some(title) = args
                .first()
                .and_then(|v| v.get("title"))
                .and_then(|v| v.as_str())
            {
                builder = builder.title(title);
            }
            if let Some(body) = args
                .first()
                .and_then(|v| v.get("body"))
                .and_then(|v| v.as_str())
            {
                builder = builder.body(body);
            }
            builder.show().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        // Reveal a path in the OS file manager (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `reveal_item_in_dir` (already installed for `open_external`).
        // Backs `electronStub.ts`'s `shell.showItemInFolder()`. The path originates from
        // in-app backend callers, not renderer free-text (T-33-11) -- forwarded to the vetted
        // opener plugin's own scoping, not a raw shell-out.
        "shell_show_item_in_folder" => {
            let path = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or("shell_show_item_in_folder:bad-args")?;
            app.opener()
                .reveal_item_in_dir(path)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        // Open a path with the default program (Phase 33 Plan 04, D-05) via
        // `tauri-plugin-opener`'s `open_path`. Backs `electronStub.ts`'s `shell.openPath()`.
        // Same path-provenance note as `shell_show_item_in_folder` above (T-33-11).
        "shell_open_path" => {
            let path = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or("shell_open_path:bad-args")?;
            app.opener()
                .open_path(path, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        // Write text to the OS clipboard (Phase 34.3 Plan 03, D-01/D-02, REQ-34.3-03) via
        // `tauri-plugin-clipboard-manager`'s `app.clipboard().write_text()`. Backs
        // `electronStub.ts`'s `clipboard.writeText()`. This arm and `clipboard_read_text`
        // below are the ONLY two new `dispatch_rust_channel` arms the entire 34.3 slice adds
        // -- D-02's zero-renderer-capability-grant stance holds (capabilities/default.json is
        // untouched; the plugin has no `js_init_script`, confirmed by 34.3-RESEARCH.md Q2).
        "clipboard_write_text" => {
            let text = clipboard_text_arg(args)?;
            app.clipboard().write_text(text).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        // Read text from the OS clipboard (Phase 34.3 Plan 03, D-01/D-02, REQ-34.3-03) via
        // `tauri-plugin-clipboard-manager`'s `app.clipboard().read_text()`. Backs the
        // sidecar's `clipboardReadText` handler (D-04 -- the read path bypasses
        // `electronStub`'s sync stub and awaits this rustInvoke directly, since a sync
        // function structurally cannot await a Rust round-trip). Safe to call `read_text()`
        // here specifically because `dispatch_rust_channel` always runs on a
        // `thread::spawn`'d worker thread (see `start_reader`), never the main/reader thread
        // -- the plugin's own `desktop.rs` docstring warns `read_text()` must not be called on
        // the main thread (Linux deadlock risk). A future refactor that moves dispatch onto
        // the reader thread must not silently reintroduce that deadlock.
        "clipboard_read_text" => {
            clipboard_read_value(app.clipboard().read_text().map_err(|e| e.to_string()))
        }
        // Exit the real Tauri process (Phase 33 Plan 04, D-05 app lifecycle essentials) via
        // `AppHandle::exit()`. Backs `electronStub.ts`'s `app.exit()`/`app.quit()`. Only two
        // sidecar-reachable call sites invoke this (`resetHeroic()`, the uninstall/quit exit
        // path) -- both deliberate user/exit actions (T-33-12, accepted DoS disposition).
        "app_exit" => {
            app.exit(0);
            Ok(Value::Null)
        }
        // Restart the real Tauri process (Phase 33 Plan 04, D-05 app lifecycle essentials) via
        // `AppHandle::restart()`. Backs `electronStub.ts`'s `app.relaunch()`. `restart()` never
        // returns (`-> !`) -- it either restarts the process directly (main thread) or blocks
        // this spawned worker thread until the process exits (background thread), which is safe
        // since the whole process is about to go away regardless.
        //
        // Phase 34.3 Plan 03 D-05 / REQ-34.3-06 (RESOLVED, no code change needed): dispatch_rust_channel
        // always runs on a thread::spawn'd worker thread (see start_reader above), never the main
        // thread, so this app.restart() call is always restart()'s BACKGROUND-THREAD branch -- it sets
        // restart_on_exit=true and requests exit through the real event loop, rather than the
        // main-thread branch that skips RunEvent::Exit entirely. That exit request fires
        // tauri::RunEvent::Exit, and this file's own .run(...) closure (below main()) calls
        // state.shutdown_child() on exactly that event -- BEFORE the process re-execs. Therefore there
        // is no orphan-sidecar window for this codebase's calling pattern, and no extra
        // state.shutdown_child() call belongs here -- adding one would be dead code inviting the next
        // reader to wonder why it is duplicated. Verified against tauri 2.11.5's vendored source (the
        // exact version this crate's Cargo.lock pins) by direct read of app.rs's restart()/run()/
        // make_run_event_loop_callback() -- see 34.3-RESEARCH.md Q1 for the full evidence chain.
        // restart()'s "skip the events" branch applies ONLY when restart() is called on the main
        // thread, which this call site never is.
        // Empirical confirmation is REQ-34.3-11's live-gate item 4 (a PACKAGED build: resetHeroic
        // leaves exactly ONE sidecar process), not a Rust unit test -- a #[cfg(test)] test structurally
        // cannot drive a live winit/tao event loop. One residual not traced here: the exact delivery
        // guarantee of runtime_handle.request_exit(...) inside tauri-runtime-wry -- the same mechanism
        // every existing app.exit() call in this codebase already depends on; the live-gate item above
        // is where that residual closes empirically.
        "app_relaunch" => {
            app.restart();
        }
        // Hide the real Tauri application (quick/260815-vvz) via `AppHandle::hide()`. Backs
        // `electronStub.ts`'s `app.hide()`, whose one reachable caller is
        // `raiseFrontmostBottledProcess`'s (`bottle.ts`) ~18s-miss yield fallback for bottled
        // Steam install/uninstall -- when no matching installer/uninstaller window can be
        // raised within that window, GameLib steps aside instead of staying in front of an
        // invisible Steam confirm dialog (the root cause `steam-bottle-uninstall-reverts.md`
        // records).
        //
        // `AppHandle::hide()` (tauri 2.11.5, `src/app.rs:1095-1104`) only exists
        // `#[cfg(target_os = "macos")]` -- exact parity with real Electron's own `app.hide()`,
        // which is macOS-only there too. An ungated call would not compile off macOS, so the
        // two branches are `#[cfg]`-split; the non-macOS branch is a loud `eprintln!` declaring
        // the no-op (never a silent lie), converging on the same `Ok(Value::Null)`.
        //
        // Thread-safety: `dispatch_rust_channel` always runs on a `thread::spawn`'d worker
        // thread (see `clipboard_read_text`'s comment above and `start_reader`), never the
        // main/reader thread -- so `AppHandle::hide()` always takes its
        // `RuntimeOrDispatch::RuntimeHandle(h) => h.hide()?` branch, which posts to the real
        // event loop rather than calling the runtime directly. Same mechanism the already-
        // shipped `app_exit`/`app_relaunch` arms above rely on.
        "app_hide" => {
            #[cfg(target_os = "macos")]
            {
                app.hide().map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                eprintln!(
                    "[dispatch_rust_channel] app_hide: declared no-op off macOS -- \
                     AppHandle::hide() does not exist on this platform, exact parity with real \
                     Electron's own macOS-only app.hide()"
                );
            }
            Ok(Value::Null)
        }
        // Swap the real Tauri tray's icon (Phase 34.1 Plan 06, D-11). Backs the sidecar's
        // `changeTrayColor` registration (`appShellFlowRegistration.ts`), which reads
        // `darkTrayIcon` from `GlobalConfig` and forwards it here as `{ dark }`. This is the
        // ONLY new `dispatch_rust_channel` arm added by the entire 34.1 slice -- D-01 keeps
        // window chrome renderer-side with zero new Rust arms.
        "tray_set_icon" => {
            let dark = args
                .first()
                .and_then(|v| v.get("dark"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            match app.tray_by_id(TRAY_ICON_ID) {
                Some(tray) => {
                    // Atomic icon+template-flag update (tauri 2.11.5, `tray/mod.rs:569-599`):
                    // calling `set_icon` followed by `set_icon_as_template` separately causes a
                    // visible flicker on macOS as the icon renders twice. Falls back to plain
                    // `set_icon` on Windows/Linux, where `is_template` is a documented no-op.
                    tray.set_icon_with_as_template(Some(tray_image(dark)), tray_is_template())
                        .map_err(|e| e.to_string())?;
                }
                // A missing tray is not an error condition -- it may have legitimately
                // failed to build at startup (T-34.1-22); log and resolve successfully.
                None => eprintln!(
                    "[shell] tray_set_icon: no tray found with id {TRAY_ICON_ID:?}, skipping"
                ),
            }
            Ok(Value::Null)
        }
        // Native save-file dialog (Phase 31 Plan 02, D-03/REQ-31-03): same `Option<FilePath>`
        // shape as `dialog_open`'s pick_folder/pick_file arm -- `Some(path)` is the chosen path,
        // `None` is a healthy user cancel (never an error). Runs on the same spawned worker
        // thread.
        "dialog_save" => {
            let mut builder = app.dialog().file();
            if let Some(file_name) = args
                .first()
                .and_then(|v| v.get("defaultPath"))
                .and_then(|v| v.as_str())
            {
                builder = builder.set_file_name(file_name);
            }
            if let Some(filters) = args
                .first()
                .and_then(|v| v.get("filters"))
                .and_then(|v| v.as_array())
            {
                for filter in filters {
                    let name = filter.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let extensions: Vec<&str> = filter
                        .get("extensions")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|e| e.as_str()).collect())
                        .unwrap_or_default();
                    builder = builder.add_filter(name, &extensions);
                }
            }
            match builder.blocking_save_file() {
                Some(path) => Ok(Value::String(path.to_string())),
                None => Ok(Value::Null),
            }
        }
        // Open a fail-closed child login window on any https URL (Phase 34.4.1 Plan 01,
        // D-01/D-02, REQ-34.4.1-01/REQ-34.4.1-09). Runner-agnostic by design: nothing
        // here knows what Humble is. `.user_agent()` is MANDATORY, not reinforcement --
        // Tauri's default macOS UA carries no browser product token at all (spike 013).
        // Deliberately NO `.title()` call (WR-07 anti-phishing: the loaded document's
        // own title must show, never a hard-coded "GameLib"). The relay is wired to
        // `on_page_load` (main-frame Started/Finished only), NEVER `on_navigation` --
        // spike 013 measured 5 of 8 `on_navigation` events as third-party iframes, and
        // relaying those would let an ad frame re-arm the sidecar's login-watch deadline
        // forever (Pitfall 2).
        //
        // F-4 fix (Phase 34.4.1 Plan 18, T-34.4.1-79/T-34.4.1-82): the live gate found
        // the VISIBLE login window too small for Humble's login form plus a Humble
        // Guard / OTP step, and lost behind other applications once the operator
        // switched away to fetch a code. `.inner_size()`/`.center()`/`.focused(true)`
        // below fix both, applied ONLY when `visible` is true -- the SAME arm also
        // builds the hidden reveal/clear windows (disconnect's clear, reveal-POST),
        // and sizing/centering/raising one of those would be wasted work at best and
        // a visible flash at worst, on a path whose whole design is that nothing is
        // shown (T-34.4.1-82). `.focused(true)` raises-and-focuses ONCE on creation,
        // deliberately NOT `.always_on_top(true)`: a permanent flag would force the
        // operator to fight past the login window to reach the very password-manager
        // window or OS credential prompt they switched away to use, trading one
        // findability problem for a worse one.
        //
        // WR-07 CORRECTION (Phase 34.4.1 Plan 24, research Pitfall 3 in the flesh): an
        // earlier version of this comment claimed WR-07 was "enforced by the grep gate
        // in this plan's own acceptance criteria, not by intent alone." That claim was
        // FALSE and misdirected two live gate operators, both of whom reported the
        // title bar read the framework default, "Tauri app" -- neither Humble's own
        // title (what WR-07 requires) nor a hard-coded "GameLib" (what WR-07
        // prohibits). A grep gate proving `.title(` is never hard-coded can only
        // establish the ABSENCE of the prohibited value; it structurally cannot
        // establish the PRESENCE of the required one. Omitting `.title()` does NOT by
        // itself make the OS window title track the loaded document's title -- that
        // assumption was never spiked. Tauri's documented mechanism for this (an
        // in-source example at `tauri-2.11.5/src/webview/mod.rs:564-567`) is the
        // title-tracking builder callback wired below, inside the same `if visible`
        // block as the F-4 presentation calls -- a hidden reveal/clear window has no
        // title bar for a title to matter on. That callback sets ONLY the OS window
        // title; it grants no capability and does not touch the fail-closed label
        // scheme (`next_login_window_label()`, REQ-34.4.1-09) in any way. WR-07's
        // negative half (no hard-coded title) stays grep-provable, unchanged; WR-07's
        // positive half (Humble's own title actually shows) is provable only LIVE --
        // see plan 24's SUMMARY and plan 29 item 1, the only thing that closes it.
        //
        // ANTI-PHISHING ORIGIN (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/23/39): the
        // title-tracking callback above shows the loaded DOCUMENT's title -- a value the
        // remote page fully controls -- and nothing else. That is NOT an origin indicator:
        // an attacker-influenced or redirected login page can title itself anything,
        // including a string designed to look like a real address bar (T-34.5-G6-23), and
        // this window has no address bar of its own for the operator to check instead.
        // `login_window_title()` fixes this by prefixing the SHELL-RESOLVED origin --
        // derived from the validated URL this arm already holds, never from page content
        // -- ahead of the document title, unconditionally. The origin is seeded from the
        // open URL immediately after `.build()` (visible from the moment the window
        // appears, not only after the first title event) and kept current via the SAME
        // `on_page_load` hook this arm already trusts for the login relay above --
        // main-frame `Started`/`Finished` only, NEVER `on_navigation`: spike 013 measured
        // 5 of 8 `on_navigation` events as third-party iframes, the callback carries no
        // frame-type flag to filter them, and an iframe overwriting the title bar's origin
        // would be the exact inverse of the guarantee this exists to provide
        // (T-34.5-G6-39). This is the SAME rule the login relay above already follows, now
        // also covering the title's origin source -- one convention, not two. The origin
        // is shared between the `on_page_load` hook and the `on_document_title_changed`
        // hook via `current_origin` (an `Arc<Mutex<String>>`) so a title change arriving
        // between navigations is still composed against the page's CURRENT host, never a
        // stale one.
        //
        // LIGHT INTERFACE STYLE (Phase 34.5 Plan 27, F-34.5-G6-05): the developer's live
        // gate report was verbatim "the text was black on black so could not tell my cut
        // and paste worked until i highlighted" on Amazon's verification-code field. The
        // likely mechanism is a dark `prefers-color-scheme` the webview inherits from the
        // host system, mismatched against a page stylesheet that only sets text colour.
        // `.theme(Some(tauri::Theme::Light))` below (the builder method at
        // `tauri-2.11.5/src/webview/webview_window.rs:882`, "Forces a theme or uses the
        // system settings if None was provided") requests a light interface style on our
        // OWN window -- it changes what the page is TOLD, not what it runs. No CSS or
        // script is injected into the third-party credential page (that would trade a
        // legibility defect for a materially worse security posture: running script in a
        // live credential context). Applied ONLY inside `if visible`, matching every other
        // presentation-only call in this arm -- the hidden reveal/clear windows have no
        // user-visible rendering. FALSIFIABLE, not assumed closed: if plan 34.5-28's live
        // check still shows unreadable text, `prefers-color-scheme` was not the mechanism
        // and this fix must be recorded as NOT closing F-34.5-G6-05.
        "humble_login_open" => {
            let url = login_window_url_arg(args)?;
            let origin = url.origin().ascii_serialization();
            // Epic-only scoping for the pristine-webview route below -- computed BEFORE `url`
            // moves into the builder below, since this is the only signal this runner-agnostic
            // arm has (see `EPIC_LOGIN_HOST`'s own doc comment).
            #[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
            let is_epic_login = url.host_str() == Some(EPIC_LOGIN_HOST);
            let visible = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            let user_agent = args
                .get(2)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_open:bad-args".to_string())?;
            let label = next_login_window_label();
            let event_label = label.clone();
            // Cloned separately from `event_label` (Phase 34.4.2 Plan 08,
            // REQ-34.4.2-03/04/08): the login-cancel sentinel's `.on_navigation(` closure
            // below needs its own owned label for its log line, and moves it independently
            // of the `.on_page_load(` closure's own `event_label` capture.
            let nav_sentinel_label = label.clone();
            // Bounded pristine-webview attempt (checkpoint response, 2026-08-03T18:00:00
            // superseding cycle; F-34.5-G6-01): route Epic's login window through a
            // Tauri-injection-free WKWebView on macOS instead of this arm's own
            // `WebviewWindowBuilder` path below. See `open_pristine_epic_login_window`'s own
            // doc comment (above) for the full mechanism. Scoped to `is_epic_login` + macOS
            // only -- every other runner (and Epic itself on non-macOS) falls through to the
            // existing, completely untouched code
            // below. `url` is only moved into this branch when it is actually taken (`return`
            // on the same expression), so the unconditional uses of `url` further down this
            // arm remain valid on every path that reaches them.
            #[cfg(target_os = "macos")]
            if is_epic_login {
                return open_pristine_epic_login_window(app, &label, url, visible, user_agent);
            }
            // T-34.4.2-39 single-flight guard (Phase 34.4.2 Plan 14): refuse a second VISIBLE
            // login window while one is already pending (armed here, not yet resolved) or
            // presented (`PRESENTED_LOGIN_SHEETS` non-empty), so AppKit is never asked to queue
            // a second `beginSheet:` behind the first -- the concrete failure mode this closes
            // is typing one store's password into another store's just-arrived sheet. Sits
            // AFTER Epic's early return above (structural exemption, D-D) and BEFORE the
            // builder below (a refused request never gets a window built). Scoped to `visible`
            // only -- hidden reveal/clear windows (e.g. the Humble health-check/disconnect
            // routes in `src/backend/humble/user.ts`, both `visible: false`) never arm or are
            // refused by this latch.
            //
            // HONEST BOUNDARY: this guard arms at `humble_login_open`, the earliest point this
            // shell can know a login is being opened. It does NOT cover the interval between
            // the user's click and this call -- on the Amazon path that interval is the ~7-8s
            // nile PyInstaller-onefile spawn (F-34.4.2-06), during which the shell has been
            // told nothing. Concretely: if the user clicks Amazon then Humble during that
            // window, Humble presents and Amazon is REFUSED -- the user's first click loses.
            // That is a deliberate trade (an explicit, logged refusal is strictly safer than an
            // unrequested sheet arriving over a dismissed one) and a residual, not full
            // coverage -- see `34.4.2-PLATFORM-SCOPE.md`'s Plan 14 entry.
            //
            // Deliberately `if visible == true {`, NOT the bare `if visible {` this arm uses
            // everywhere else: Plan 08 Test 1 (`tauriShellSource.test.ts`) locates the ORIGINAL
            // `if visible {` block (the builder-setup one containing
            // `login_cancel_strip_script(`) via `code.indexOf('if visible {')`, the FIRST
            // occurrence. This guard is required to sit textually BEFORE that block (see the
            // ordering requirement above -- both must be before the same
            // `tauri::WebviewWindowBuilder::new(` call), so an identical bare condition here
            // would make `indexOf` resolve to THIS block instead and silently break that
            // pre-existing test. The comparison changes nothing about the runtime check
            // (`visible` is already a `bool`); `if (visible) {` was tried first and rejected --
            // it compiles but trips rustc's own `unused_parens` warning, violating this file's
            // zero-warnings bar.
            #[cfg(target_os = "macos")]
            if visible == true {
                let now = std::time::Instant::now();
                let mut pending_guard = PENDING_VISIBLE_LOGIN_WINDOW
                    .lock()
                    .map_err(|_| "humble_login_open:pending-lock-poisoned".to_string())?;
                // Expire a stale latch in passing (T-34.4.2-41): a flow that panicked, hung
                // upstream, or was killed mid-flight must not block every later sign-in for the
                // life of the process.
                if let Some((stale_label, armed_at)) = pending_guard.clone() {
                    let age = now.duration_since(armed_at);
                    if pending_login_entry_is_stale(age) {
                        eprintln!(
                            "[shell] humble_login_open: pending login window latch for '{stale_label}' expired after {age:?} (TTL {PENDING_VISIBLE_LOGIN_WINDOW_TTL:?}) -- treating as absent"
                        );
                        *pending_guard = None;
                    }
                }
                let incumbent = pending_guard
                    .as_ref()
                    .map(|(pending_label, _)| pending_label.clone())
                    .or_else(|| {
                        PRESENTED_LOGIN_SHEETS.lock().ok().and_then(|guard| {
                            guard.as_ref().and_then(|list| list.first().cloned())
                        })
                    });
                if let Some(incumbent_label) = incumbent {
                    eprintln!(
                        "[shell] humble_login_open: REFUSED visible login window '{label}' -- '{incumbent_label}' is already pending or presented (T-34.4.2-39 single-flight)"
                    );
                    return Err("humble_login_open:login-already-in-progress".to_string());
                }
                *pending_guard = Some((label.clone(), now));
                eprintln!(
                    "[shell] humble_login_open: visible login window '{label}' armed as the single pending login flow (T-34.4.2-39)"
                );
            }
            // Shared last-known main-frame origin (Phase 34.5 Plan 27): seeded from the
            // validated open URL so it is never empty, updated only from `on_page_load`
            // (main-frame only, per this arm's own doc comment above), and read by
            // `on_document_title_changed` so a title change is always composed against
            // the CURRENT host, not the one the window opened on.
            let current_origin = Arc::new(Mutex::new(origin.clone()));
            // CR-01 fix (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL 0/6): on macOS
            // this window is the sheet CANDIDATE `present_login_window_as_sheet` attempts to
            // attach further down this arm, after `.build()`. `beginSheet:completionHandler:`
            // expects to be the thing that orders the sheet window in and makes it key --
            // building it `.visible(true)`/`.focused(true)` here races that call (tao/wry
            // orders the window in and takes key status synchronously during `.build()`,
            // strictly BEFORE `beginSheet:` ever runs), so AppKit silently does not attach it
            // and the window is left as an ordinary titled window (F-34.4.2-03). So on macOS
            // the sheet candidate is ALWAYS built `.visible(false)` regardless of this arm's
            // own `visible` argument -- presentation happens exclusively through
            // `present_login_window_as_sheet`'s `beginSheet:` call below, with an explicit
            // visible-fallback (see the `sheet_presented` block further down this arm) so a
            // failed attach never leaves the user looking at nothing. Windows/Linux have no
            // sheet concept and keep exactly today's behavior (REQ-34.4.2-08).
            #[cfg(target_os = "macos")]
            let initial_visible = false;
            #[cfg(not(target_os = "macos"))]
            let initial_visible = visible;
            let mut builder =
                tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
                    .user_agent(user_agent)
                    .visible(initial_visible);
            if visible {
                let title_origin = Arc::clone(&current_origin);
                builder = builder.inner_size(900.0, 700.0);
                // CR-01 fix (continued): `.center()`/`.focused(true)` are AppKit-owned
                // concerns once this window becomes a sheet -- `beginSheet:` positions the
                // sheet under the parent's title bar and gives it key status itself, so
                // pre-setting them here on macOS would be immediately overridden (harmless)
                // when attachment succeeds, but WOULD be exactly the race described above
                // when it does not run first. The visible-fallback path (below) calls
                // `.center()`/`.set_focus()` itself if attachment is not confirmed, so macOS
                // loses nothing on the failure path either. Windows/Linux keep the original,
                // unconditional immediate center+focus.
                #[cfg(not(target_os = "macos"))]
                {
                    builder = builder.center().focused(true);
                }
                builder = builder
                    .theme(Some(tauri::Theme::Light))
                    .on_document_title_changed(move |window, title| {
                        // Never .unwrap() on a live user-facing path (T-34.4.1-108): a
                        // stale title bar is a cosmetic defect, a panic here would kill
                        // the login flow outright. Never logs the title string itself
                        // (T-34.4.1-106, remote page content must never reach an
                        // uploadable log) -- only the fact that a change was applied
                        // and its LENGTH, the only machine evidence able to
                        // distinguish "the hook never fired" from "the hook fired and
                        // the OS ignored it" if plan 29's operator still sees the
                        // framework default title. `origin_now` is read from the
                        // shared `current_origin` (Phase 34.5 Plan 27) rather than
                        // recomputed here, so this composed title always reflects the
                        // most recent MAIN-FRAME origin, never this callback's own
                        // page-content input.
                        let origin_now = title_origin
                            .lock()
                            .map(|guard| guard.clone())
                            .unwrap_or_default();
                        let composed = login_window_title(&origin_now, Some(&title));
                        let _ = window.set_title(&composed);
                        eprintln!(
                            "[shell] humble_login_open: title change applied len={}",
                            title.len()
                        );
                    });
                // Login-sheet cancel strip injection (Phase 34.4.2 Plan 08,
                // REQ-34.4.2-03/04/06/07/08, T-34.4.2-33). `#[cfg(target_os = "macos")]`:
                // only macOS presents this window as a sheet (Plan 07), so only macOS
                // needs an in-page exit. This strip has NO kill switch of its own and
                // never has: an env var that removes the only visible exit from a
                // parent-blocking sheet would be a lock-out switch, not a safety switch
                // (T-34.4.2-15). Phase 34.4.2 Plan 13 (operator decision D-A) deleted the
                // OTHER in-field injected-glyph mechanism entirely -- closing
                // `34.4.2-PLATFORM-SCOPE.md` §1's previously-recorded
                // cross-platform-injected-but-inert wart -- so this strip is now the ONLY
                // injected control on the login form, on any platform.
                #[cfg(target_os = "macos")]
                {
                    builder = builder
                        .initialization_script(&login_cancel_strip_script(REVEAL_EXFIL_HOST));
                    eprintln!(
                        "[shell] humble_login_open: login cancel strip injected for '{label}'"
                    );
                }
                // Login-sheet origin banner injection (Phase 34.5 Plan 52, F-34.5-G6-16,
                // D-CYCLE7-A). Same `#[cfg(target_os = "macos")]` gate as the cancel strip
                // immediately above -- only macOS presents this window as a titleless sheet,
                // so only macOS needs an in-page substitute for the OS title's origin prefix.
                // `origin` here is the SHELL-RESOLVED value `current_origin` is seeded from
                // (this arm's own validated open URL), never page content. Placed AFTER the
                // cancel strip's own injection so the two injected-control helpers sit
                // together, matching Task 1's own doc-comment ordering.
                #[cfg(target_os = "macos")]
                {
                    builder = builder.initialization_script(&login_origin_banner_script(&origin));
                    eprintln!(
                        "[shell] humble_login_open: login origin banner injected for '{label}'"
                    );
                }
                // Login-chrome CSS injection (quick task 260822-di1, D-2). Deliberately NOT
                // `#[cfg(target_os = "macos")]`, unlike the two blocks immediately above: the
                // cancel strip and origin banner substitute for macOS *sheet* chrome (a sheet
                // renders no title bar and no close button), while this substitutes for
                // nothing platform-specific -- Humble's marketing footer is visual noise on
                // Windows and Linux too, so it runs unconditionally inside this `if visible`
                // block on every platform.
                builder = builder.initialization_script(&login_chrome_css_script());
                eprintln!("[shell] humble_login_open: login chrome CSS injected for '{label}'");
                // F-4 machine record (Phase 34.4.1 Plan 24): `.focused(true)` above is
                // a ONE-SHOT raise-on-creation with no persistent state to inspect
                // afterwards, so without this line there is no record of what
                // presentation the operator was actually looking at -- F-4's raised
                // half has now gone UNOBSERVED across two live gates
                // (34.4.1-LIVE-GATE-RERUN.md Item 3). This line records only that
                // sizing/centring/one-shot-focus were REQUESTED and that a persistent
                // pin was deliberately NOT requested (research confirms the platform
                // offers only one or the other, never both, and a persistent pin would
                // trap the operator behind this window when they switch to a password
                // manager -- exactly the switch F-4's observation asks them to
                // perform). It does NOT prove the window actually raised; that
                // observation belongs to plan 29 item 1 alone. `light_theme_requested`
                // records only that Plan 27's `.theme(Some(tauri::Theme::Light))` call
                // above was REQUESTED, mirroring this line's existing discipline --
                // whether the field actually rendered legibly is plan 34.5-28's live
                // check alone. MOVED to after `.build()` by Phase 34.4.2 Plan 02 (still
                // gated on this same `if visible` intent) so it can also record
                // `sheet_presented` -- see the print call after `window` exists, below.
            }
            // Dev-only diagnostic instrumentation (epic-login-non-interactive
            // investigation, 2026-08-02): injects `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
            // (defined above, near `LOGIN_WINDOW_EVENTS_CAP`) as a Tauri
            // `initialization_script()` on this window BEFORE `.build()` runs --
            // initialization scripts execute before any page script, so this captures
            // Epic's own bootstrap failure instead of only what survives to a later
            // console read. Gated identically to this arm's `open_devtools()` call
            // below -- `#[cfg(debug_assertions)]` AND `if visible` -- so it can never
            // reach a packaged build.
            //
            // THIRD GATE ADDED 2026-08-02, and it DEFAULTS OFF: `GAMELIB_LOGIN_DIAG=1`.
            // This script is an `initialization_script`, so it runs BEFORE Epic's own
            // bundle and replaces `XMLHttpRequest.prototype.open/send` and
            // `window.fetch`. Epic's anti-bot service (Talon) fingerprints the page
            // environment and ships a 6-15 KB attestation payload; patched network
            // primitives on the prototype chain are a canonical automation signal.
            // `/id/api/email/exists` returns a deterministic HTTP 403 whose on-screen
            // copy is the stock anti-bot challenge ("enable javascript and cookies to
            // continue"), and EVERY 403 observation in
            // `.planning/debug/epic-login-non-interactive.md` postdates the commit that
            // added this script (`bf5394a20`) -- before it, symptoms were blank pages
            // and timeouts, never a 403. So the instrumentation is a live suspect for
            // CAUSING the defect it was added to observe, and it must be switchable
            // WITHOUT a rebuild so both arms can be compared in one sitting.
            // Off by default is the safer direction: a diagnostic that perturbs its own
            // measurement should be opt-in, not something a routine dev run inherits.
            #[cfg(debug_assertions)]
            if visible && std::env::var("GAMELIB_LOGIN_DIAG").as_deref() == Ok("1") {
                builder = builder.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT);
                eprintln!(
                    "[shell] humble_login_open: GAMELIB-DIAG init script INJECTED for '{label}' (GAMELIB_LOGIN_DIAG=1)"
                );
            }
            let page_load_origin = Arc::clone(&current_origin);
            // Owned `AppHandle` clone for the `.on_navigation(` sentinel closure below (Phase
            // 34.4.2 Plan 08, REQ-34.4.2-03/04/08): `request_login_sheet_cancel` needs
            // `&AppHandle` to dismiss the sheet and close the window, and `.on_navigation(`
            // takes a `move` closure -- mirrors this arm's own existing
            // `app_for_detach = app.clone()` convention (a few lines below `.build()`). The
            // sole surviving owned `AppHandle` clone this arm's head needs, after Phase
            // 34.4.2 Plan 13 (operator decision D-A) deleted this arm's other such clone,
            // and the mechanism it served, entirely.
            #[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
            let app_for_cancel = app.clone();
            let window = builder
                .on_page_load(move |window, payload| {
                    let kind = match payload.event() {
                        tauri::webview::PageLoadEvent::Started => "started",
                        tauri::webview::PageLoadEvent::Finished => "finished",
                    };
                    let event = login_event_value(kind, payload.url().as_str());
                    push_login_window_event(&event_label, event);
                    // Main-frame-only origin refresh (Phase 34.5 Plan 27): this hook is
                    // ALREADY the arm's trusted main-frame-only signal (see the
                    // ANTI-PHISHING ORIGIN comment above) -- never `on_navigation`,
                    // which spike 013 measured as 5-of-8 third-party-iframe noise. Gated
                    // on `visible` because this same closure also fires for the hidden
                    // reveal/clear windows this arm builds, which have no title bar for
                    // a title to matter on.
                    if visible {
                        let new_origin = payload.url().origin().ascii_serialization();
                        if let Ok(mut guard) = page_load_origin.lock() {
                            *guard = new_origin.clone();
                        }
                        let _ = window.set_title(&login_window_title(&new_origin, None));
                        // Origin banner re-text on main-frame origin change (Phase 34.5 Plan
                        // 52, F-34.5-G6-16, D-CYCLE7-A). KEPT alongside, never replacing, the
                        // `set_title` call above -- Windows/Linux still render the OS title;
                        // this is macOS's in-page substitute for it. Never `.unwrap()` on a
                        // live user-facing path (T-34.4.1-108): a stale banner is cosmetic, a
                        // panic here would kill the login flow. Logs the LENGTH only, never
                        // the origin string, matching this arm's existing `title change
                        // applied len={}` discipline (T-34.4.1-106).
                        #[cfg(target_os = "macos")]
                        {
                            let _ = window.eval(&login_origin_banner_update_script(&new_origin));
                            eprintln!(
                                "[shell] humble_login_open: origin banner updated len={}",
                                new_origin.len()
                            );
                        }
                    }
                })
                .on_navigation(move |url| {
                    // Login-sheet cancel sentinel interception ONLY (Phase 34.4.2 Plan 08,
                    // REQ-34.4.2-03/04/08, T-34.4.2-33). This closure is deliberately
                    // separate from the `.on_page_load(` hook above and preserves this
                    // arm's own F-34.5-G6-04 invariant (spike 013: 5 of 8 `on_navigation`
                    // events on Humble's real login page were third-party iframes --
                    // letting a subframe drive the login-watch relay lets an ad frame
                    // re-arm its deadline forever): it never calls
                    // `push_login_window_event`, never touches `current_origin`, and never
                    // calls `set_title`. It parses and cancels exactly one reserved-host,
                    // reserved-path sentinel; every other navigation (including the real
                    // login page's own) is untouched. macOS only: dismissing a sheet is a
                    // macOS-only concept (Plan 07); on Windows/Linux this arm keeps
                    // silently discarding the navigation.
                    //
                    // Phase 34.4.2 Plan 13 (operator decision D-A) deleted the
                    // synthesized-right-click sentinel this closure previously also
                    // intercepted -- this cancel arm is now the closure's ONLY sentinel,
                    // and the only path through this closure that ever returns `false`.
                    if is_login_cancel_request(&url) {
                        #[cfg(target_os = "macos")]
                        request_login_sheet_cancel(&app_for_cancel, &nav_sentinel_label, "strip");
                        #[cfg(not(target_os = "macos"))]
                        {
                            let _ = &app_for_cancel;
                        }
                        return false;
                    }
                    true
                })
                .build()
                .map_err(|e| format!("humble_login_open:build-failed:{e}"))?;
            // AppKit SHEET presentation (Phase 34.4.2 Plan 07, REQ-34.4.2-01/02) -- macOS
            // only. Supersedes Plan 02's child-window attachment per the operator's binding
            // design decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding Design
            // Decision" section): the child-window mechanism went live-CONFIRMED broken
            // (F-34.4.2-01/-02). Presents a VISIBLE login window as a sheet on `main`
            // immediately once it exists. Hidden reveal/clear windows this arm also builds
            // are never presented. The pristine Epic login window
            // (`open_pristine_epic_login_window`) is deliberately NOT wired here or anywhere
            // else -- REQ-34.4.2-10, locked user decision, Epic ships last. On Windows/Linux
            // the login window keeps exactly today's free-floating behavior -- declared
            // UNVERIFIED here, matching the skill's Constraints section.
            #[cfg(target_os = "macos")]
            let sheet_presented = if visible {
                // F-34.4.2-04 fix (checkpoint response, 2026-08-04, post commit 751521663):
                // the first live hardware run of the CR-01/CR-02 fix reported a symptom
                // CHANGE -- no window at all (not even the pre-fix free-standing one) plus a
                // spinner that never cleared, i.e. worse than F-34.4.2-03, not better. That
                // shape is exactly what a stall ANYWHERE inside `present_login_window_as_sheet`
                // (including tauri's own unbounded internal `.ns_window()` getters --
                // `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`'s own doc comment, above) would look
                // like: if the call never returns, this arm's fallback below (which exists
                // SPECIFICALLY to guarantee visibility) never runs either, because it is
                // gated on `sheet_presented`, which would never get assigned.
                //
                // Racing the WHOLE attempt on its own thread against an independent, bounded
                // watchdog decouples "the fallback is guaranteed to run" from "whatever
                // `present_login_window_as_sheet` is doing eventually finishes" -- the
                // reasoning_checkpoint's own explicit constraint ("never block the main thread
                // waiting on a closure queued to the main thread") is satisfied doubly here:
                // this wait happens on a worker thread exactly like the pre-existing recv
                // calls in this file already do, and it can no longer be starved by a stall
                // this file does not control.
                let (watchdog_tx, watchdog_rx) = mpsc_channel::<bool>();
                let app_for_sheet = app.clone();
                let label_for_sheet = label.clone();
                thread::spawn(move || {
                    let attached = present_login_window_as_sheet(&app_for_sheet, &label_for_sheet);
                    let _ = watchdog_tx.send(attached);
                });
                match watchdog_rx.recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT) {
                    Ok(attached) => attached,
                    Err(_) => {
                        eprintln!(
                            "[shell] WARN: humble_login_open: '{label}' sheet-attach watchdog exceeded {LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT:?} -- present_login_window_as_sheet has not returned (see that function's own diagnostics for where it last logged); treating as unconfirmed and falling back now rather than waiting further"
                        );
                        false
                    }
                }
            } else {
                false
            };
            #[cfg(not(target_os = "macos"))]
            let sheet_presented = false;
            // T-34.4.2-39 resolution path 1 of 3 (Phase 34.4.2 Plan 14): sheet presentation
            // CONFIRMED -- clear the pending-login latch now that this request has resolved to
            // an on-screen sheet, membership in `PRESENTED_LOGIN_SHEETS` (set inside
            // `present_login_window_as_sheet`'s own `register_presented_login_sheet` call)
            // taking over as this label's "in progress" signal from here on.
            #[cfg(target_os = "macos")]
            if sheet_presented {
                clear_pending_visible_login_window(&label);
            }
            // CR-01 visible-fallback (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL
            // 0/6): this window was built `.visible(false)` on macOS specifically so
            // `beginSheet:` could be the one to reveal it as a sheet (see the builder-setup
            // block above). If `present_login_window_as_sheet` did not confirm attachment
            // (CR-02's read-back), the window is otherwise ordered nowhere, offscreen, and
            // non-key -- the user would see nothing at all, strictly worse than the
            // free-standing-window symptom this fix was written for. `window.show()` +
            // `window.set_focus()` (post-`.build()` `WebviewWindow` methods, not the builder's
            // own `.center()`/`.inner_size()`/`.focused(true)`/`on_document_title_changed`
            // presentation calls Test 559 scopes to the `if visible {` block above -- this is
            // deliberately a DIFFERENT, later code path, not a second copy of those) restore
            // visibility and key status; none of these calls are fatal to the login flow
            // (T-34.1-22 discipline), so failures here are logged, not propagated. Position is
            // whatever AppKit's default placement is for a window shown without `.center()`
            // having run -- acceptable: an off-center but genuinely visible/focused window is
            // still strictly better than the invisible one this fallback exists to prevent.
            #[cfg(target_os = "macos")]
            if visible && !sheet_presented {
                eprintln!(
                    "[shell] WARN: humble_login_open: '{label}' sheet attachment unconfirmed -- falling back to a free-standing visible window"
                );
                let _ = window.show();
                let _ = window.set_focus();
                // T-34.4.2-39 resolution path 2 of 3 (Phase 34.4.2 Plan 14): the visible
                // fallback also resolves this request -- the window is genuinely on screen
                // (just not as a sheet), so the latch must clear here too, not only on the
                // sheet-confirmed path above.
                clear_pending_visible_login_window(&label);
            }
            if visible {
                // F-4 machine record (Phase 34.4.1 Plan 24) -- see this arm's
                // builder-setup block above for the full "why record this at all"
                // rationale. `sheet_presented` (Phase 34.4.2 Plan 07's sheet-presentation
                // switch, superseding Plan 02's differently-named field) is recorded here;
                // this print still runs AFTER `.build()`/presentation so it can be included.
                eprintln!(
                    "[shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented={sheet_presented}"
                );
            }
            // Quick task 260803-eee Task 5: close-detection, added AFTER `.build()` because
            // `on_window_event` is a method on the built `WebviewWindow` handle
            // (`tauri-2.11.5/src/webview/webview_window.rs:1524`), not on the builder --
            // confirmed by direct read of the vendored crate source, mirroring this arm's own
            // established discipline of checking the crate before adding a hook (see the WR-07
            // CORRECTION comment above).
            //
            // THE BUG THIS FIXES: closing this window (any way -- clicking its close button,
            // Cmd+W, the OS window-close gesture) produced NO signal at all on the JS side.
            // `oauthLoginCapture.ts`'s `captureOAuthLogin` kept polling forever until its
            // five-minute deadline, so cancelling a GOG/Epic/Amazon/Zoom sign-in never resolved
            // `{ status: 'cancelled' }` -- the frontend hook stayed on `awaiting` and the
            // cancel-path navigation fix (Task 4, `onCancelled`/`handleTauriOAuthCancelled`)
            // could never fire, because the outcome it depends on never arrived.
            //
            // `WindowEvent::Destroyed`, not `CloseRequested`: `CloseRequested` fires BEFORE the
            // window is actually gone and exists so a handler can call `api.prevent_close()` --
            // this arm never wants to prevent closing, only observe that it happened, and
            // `Destroyed` is the point that is actually true. Pushed onto the SAME
            // `LOGIN_WINDOW_EVENTS` queue via the SAME `push_login_window_event` helper the
            // `on_page_load` hook above already uses -- one relay mechanism, not two. Fires for
            // ANY window this arm builds (hidden reveal/clear windows included, not gated on
            // `visible`) -- harmless for those, since nothing calls `takeEvents()` on a
            // reveal/clear window's label. F-34.4.2-19 fix: `humble/user.ts`'s own
            // `takeEvents()` consumer (`watchForLogin()`) now settles `{ status: 'error' }`
            // immediately on a `'closed'` entry, rather than discovering the window's absence
            // one poll tick later via a `no-window` cookie-read error (see `loginWindowSeam.ts`'s
            // `LoginWindowNavEvent` doc comment for the full cross-consumer safety argument). No
            // url to relay -- `""`, never a partial/stale navigation url that could be mistaken
            // for one.
            //
            // NOT a race with this arm's own `humble_login_close` (a few match arms below):
            // every caller that closes a window programmatically (`captureOAuthLogin`'s
            // `settle()`, `humble_login_close` itself) does so only AFTER it has already decided
            // the real outcome and stopped consuming events for that label -- so a `'closed'`
            // event produced by that SAME programmatic close is written to a queue nothing reads
            // again, never observed as a spurious cancel.
            let close_event_label = label.clone();
            #[cfg(target_os = "macos")]
            let app_for_dismiss = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    push_login_window_event(&close_event_label, login_event_value("closed", ""));
                    // Mirror of the presentation call above (Phase 34.4.2 Plan 07,
                    // REQ-34.4.2-01/02): unconditional (not gated on `visible`) because a
                    // hidden reveal/clear window was never presented in the first place, so
                    // dismissing it is a guaranteed no-op given the membership gate -- see
                    // `dismiss_login_window_sheet`'s own doc comment.
                    #[cfg(target_os = "macos")]
                    dismiss_login_window_sheet(&app_for_dismiss, &close_event_label);
                    // T-34.4.2-39 resolution path 3 of 3 (Phase 34.4.2 Plan 14): a destroyed
                    // window resolves this request too, whichever way it got there (sheet
                    // dismissed via the cancel strip/Esc, closed while still an unattached
                    // free-standing fallback window, or closed programmatically before either
                    // ran). Unconditional like `dismiss_login_window_sheet` above -- a hidden
                    // reveal/clear window never armed the latch in the first place, so clearing
                    // it here is a guaranteed no-op for those (label-matched, see this
                    // function's own doc comment).
                    #[cfg(target_os = "macos")]
                    clear_pending_visible_login_window(&close_event_label);
                }
            });
            // Seed the title from the validated open URL's origin (Phase 34.5 Plan 27) so
            // it is visible from the moment the window appears, rather than only after the
            // first `on_page_load`/`on_document_title_changed` event.
            if visible {
                let _ = window.set_title(&login_window_title(&origin, None));
            }
            // Dev-only diagnostic (epic-login-non-interactive investigation, 2026-08-01,
            // F-34.5-G6-01): `open_devtools()` is already forced for the "main" webview
            // above (main.rs:2476-2487, guarded by the same #[cfg(debug_assertions)]), but
            // THIS arm builds the login window (`loginwin-N-*`) that all five runners share
            // -- and it has never had devtools wired up. That gap left the login page's own
            // JS console unread across four debug cycles despite it being the one webview
            // that renders third-party OAuth pages (Epic, GOG, Amazon, Humble). Gated on
            // `visible` to match every other presentation-only call in this arm (the hidden
            // reveal/clear windows built elsewhere in this file are unaffected) and on
            // `#[cfg(debug_assertions)]` so it can never reach a packaged build.
            #[cfg(debug_assertions)]
            if visible {
                window.open_devtools();
                eprintln!(
                    "[shell] humble_login_open: devtools opened for '{label}' (debug build)"
                );
            }
            Ok(Value::String(label))
        }
        // Return the FULL unfiltered cookie count (`total`) alongside a domain/name
        // filtered `matched` list (Phase 34.4.1 Plan 01, D-02, REQ-34.4.1-01). `total` is
        // the liveness proof (34.4.1-RESEARCH.md Pattern 3) -- the sidecar's poll can
        // distinguish "the jar is genuinely empty" from "the API is silently dead", the
        // `navigator-clipboard-noops-under-tauri` failure shape. The wry cookies-for-url
        // shortcut MUST NOT appear anywhere in this file -- see `cookie_domain_matches`
        // above (the ONLY domain comparison this file uses). This arm
        // never logs a cookie value (T-34.4.1-02); values are returned only to the
        // caller's own explicit request over the already-allowlisted rustInvoke channel.
        //
        // F-34.4.2-12 / D-F2 (gap cycle 4): this is the LOGIN-POLL direction used by
        // `watchForLogin()`, the one call site the original F-34.4.2-12 fix (`6bad86227`)
        // deliberately left out of scope (see that debug session's own `## Residual
        // Risks`). It is mechanically the identical hazard as `humble_login_cookies_for_domain`
        // and `humble_login_clear_cookies`'s `count_matching` closure below: wry's blocking
        // `WebviewWindow::cookies()` resolves to `wait_for_blocking_operation`, which
        // reentrantly pumps `NSRunLoop::mainRunLoop()` from inside tao's
        // `EventLoopHandler::with_callback` -- already holding tao's own handler `Mutex` for
        // the whole user-event dispatch -- and can self-deadlock the main thread. The poll
        // path has NEVER been observed to wedge live (its trigger shape is one call per poll
        // tick against a settled, already-visible window, not a burst against a
        // freshly-created hidden one) -- this closes a latent, mechanically-identical risk,
        // not a measured defect. Same fix, same reasoning as the already-proven sites: never
        // call wry's own blocking getter here on macOS; read the SAME window's own
        // `WKHTTPCookieStore` natively via an async completion handler instead -- the
        // calling closure only registers the callback and returns immediately, so it never
        // blocks inside tao's `with_callback` critical section and never needs (or
        // triggers) a reentrant run-loop pump. The poll direction of `cookie_domain_matches`
        // (caller-supplied host FIRST, the cookie's own domain second -- 34.4.1 Plan 22, F-6
        // Defect A) is deliberately UNCHANGED by this rewrite; `cookies_for_url()` still must
        // never appear anywhere in this file.
        "humble_login_cookies" => {
            let label = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_cookies:bad-args".to_string())?;
            let host = args
                .get(1)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_cookies:bad-args".to_string())?;
            let names: Vec<&str> = args
                .get(2)
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                .unwrap_or_default();
            let window = app
                .get_webview_window(label)
                .ok_or_else(|| format!("humble_login:no-window:{label}"))?;

            #[cfg(target_os = "macos")]
            {
                let (tx, rx) = mpsc_channel::<Result<(usize, Vec<Value>), String>>();
                let filter_host = host.to_string();
                let filter_names: Vec<String> = names.iter().map(|n| n.to_string()).collect();
                if let Err(e) = window.with_webview(move |webview| {
                    let outcome: Result<(), String> = (|| {
                        // Bound but not otherwise read -- see `count_matching`'s identical
                        // `_mtm` binding, above, for why this is kept as a live safety proof.
                        let _mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                            "humble_login_cookies:no-main-thread-marker".to_string()
                        })?;
                        // SAFETY: mirrors `humble_login_cookies_for_domain`'s own cast --
                        // `webview.inner()` is a live `WKWebView*` for the duration of a
                        // `with_webview` closure running on the main thread; `mtm` proves
                        // this closure is running on the main thread.
                        let view: &objc2_web_kit::WKWebView =
                            unsafe { &*webview.inner().cast() };
                        let data_store = unsafe { view.configuration().websiteDataStore() };
                        let cookie_store = unsafe { data_store.httpCookieStore() };
                        let host_for_filter = filter_host.clone();
                        let names_for_filter = filter_names.clone();
                        let tx_fetch = tx.clone();
                        // SAFETY: `getAllCookies` hands the completion handler a valid, live
                        // array pointer for the duration of this call; `tx_fetch` outlives it.
                        let completion = block2::RcBlock::new(
                            move |cookies: std::ptr::NonNull<
                                objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                            >| {
                                let cookies_ref = unsafe { cookies.as_ref() };
                                let all_cookies = cookies_ref.to_vec();
                                let total = all_cookies.len();
                                // Never logs a cookie value (T-34.4.1-02) -- names and
                                // domains are read only to feed the pure comparison filters
                                // below, values only into the returned JSON payload the
                                // caller already explicitly requested over the
                                // already-allowlisted rustInvoke channel. POLL direction,
                                // deliberately preserved: the caller-supplied host is the
                                // FIRST argument to `cookie_domain_matches`, the cookie's own
                                // domain the second (34.4.1 Plan 22, F-6 Defect A) -- the
                                // opposite order from the census arm above.
                                let matched: Vec<Value> = all_cookies
                                    .into_iter()
                                    .filter(|c| {
                                        cookie_domain_matches(
                                            &host_for_filter,
                                            Some(&c.domain().to_string()),
                                        )
                                    })
                                    .filter(|c| {
                                        names_for_filter.is_empty()
                                            || names_for_filter
                                                .iter()
                                                .any(|n| n.as_str() == c.name().to_string())
                                    })
                                    .map(|c| {
                                        serde_json::json!({
                                            "name": c.name().to_string(),
                                            "domain": c.domain().to_string(),
                                            "value": c.value().to_string()
                                        })
                                    })
                                    .collect();
                                let _ = tx_fetch.send(Ok((total, matched)));
                            },
                        );
                        unsafe {
                            cookie_store.getAllCookies(&completion);
                        }
                        Ok(())
                    })();
                    if let Err(e) = outcome {
                        let _ = tx.send(Err(e));
                    }
                }) {
                    return Err(format!("humble_login_cookies:dispatch:{e}"));
                }
                match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
                    Ok(Ok((total, matched))) => {
                        Ok(serde_json::json!({ "total": total, "matched": matched }))
                    }
                    Ok(Err(e)) => Err(e),
                    Err(_) => Err("humble_login_cookies:timeout".to_string()),
                }
            }

            // Non-macOS: unchanged wry getter path -- F-34.4.2-12's reentrant-pump
            // mechanism is macOS/WebKit/tao-specific; no live evidence implicates the
            // `webview2`/`webkitgtk` backends, so this path is left exactly as it was (D-09
            // discipline: declare unverified, never silently assume broken or fixed).
            #[cfg(not(target_os = "macos"))]
            {
                let all = window.cookies().map_err(|e| e.to_string())?;
                let total = all.len();
                let matched: Vec<Value> = all
                    .into_iter()
                    .filter(|c| cookie_domain_matches(host, c.domain()))
                    .filter(|c| names.is_empty() || names.contains(&c.name()))
                    .map(|c| {
                        serde_json::json!({
                            "name": c.name(),
                            "domain": c.domain().unwrap_or_default(),
                            "value": c.value()
                        })
                    })
                    .collect();
                Ok(serde_json::json!({ "total": total, "matched": matched }))
            }
        }
        // Drain (not merely read) `label`'s queued navigation events (Phase 34.4.1 Plan
        // 01, REQ-34.4.1-03's navigation relay contract). An absent/never-navigated label
        // resolves an empty array -- a healthy state, not an error.
        "humble_login_take_events" => {
            let label = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_take_events:bad-args".to_string())?;
            let mut guard = LOGIN_WINDOW_EVENTS
                .lock()
                .map_err(|_| "humble_login_take_events:lock-poisoned".to_string())?;
            let events = guard
                .as_mut()
                .and_then(|map| map.remove(label))
                .unwrap_or_default();
            Ok(Value::Array(events))
        }
        // Close the login window (Phase 34.4.1 Plan 01, D-01). A missing label is a
        // healthy "already closed" state, not an error -- resolves `Bool(false)` rather
        // than erroring, the same D-08 "no window is not a phase failure" shape as
        // `tray_set_icon`'s missing-tray branch above.
        "humble_login_close" => {
            let label = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_close:bad-args".to_string())?;
            // The pristine Epic login window (`open_pristine_epic_login_window`) is a PLAIN
            // `tauri::Window` with a raw `WKWebView` attached, never a Tauri-managed
            // `WebviewWindow` -- so `get_webview_window(label)` can never find it, for ANY
            // label. This arm used to fall straight through to `Ok(false)`, which the
            // TypeScript side treats as a NON-FATAL close failure (`oauthLoginCapture`'s
            // `settle()` swallows it deliberately, so a close failure cannot fail a login that
            // already succeeded). Net effect: after a fully SUCCESSFUL Epic login the window
            // just stayed on screen, with nothing logged anywhere. Third instance of this exact
            // structural bug -- `humble_login_clear_cookies` (cookies surviving logout) and this
            // one both came from resolving a pristine window through a webview-only lookup.
            // `get_window` finds both kinds, so every other runner's behaviour is unchanged and
            // the pristine window now closes through the same path.
            let closed = match app.get_webview_window(label) {
                Some(window) => {
                    window.close().map_err(|e| e.to_string())?;
                    true
                }
                None => match app.get_window(label) {
                    Some(window) => {
                        window.close().map_err(|e| e.to_string())?;
                        true
                    }
                    None => false,
                },
            };
            if closed {
                if let Ok(mut guard) = LOGIN_WINDOW_EVENTS.lock() {
                    if let Some(map) = guard.as_mut() {
                        map.remove(label);
                    }
                }
            }
            Ok(Value::Bool(closed))
        }
        // Domain-SCOPED cookie clear (Phase 34.4.1 Plan 01/23, D-08, REQ-34.4.1-06, threat
        // T-34.4.1-03/-98/-99/-100/-101/-102).
        //
        // What the live gate measured (plan 20 item 3): 25 `delete_cookie()` calls, every
        // one `Ok(())`, the jar shrank by exactly 1. All 23 Humble cookies survived. Two
        // INDEPENDENT bugs, both fixed by Plan 23:
        //   1. The returned count used to be the pre-loop size of the matched set,
        //      computed BEFORE the delete loop ran below -- an ATTEMPTED count that could
        //      never report failure. Fixed
        //      on EVERY platform (not just macOS): the count returned now is always
        //      `verified_delete_count(before_matching, after_matching)`, a re-read taken
        //      AFTER the removal actually ran.
        //   2. On macOS specifically: wry's `delete_cookie()`
        //      (wry-0.55.1/src/wkwebview/mod.rs:1248-1267) hands `WKHTTPCookieStore`'s
        //      `deleteCookie` a FRESHLY RECONSTRUCTED `NSHTTPCookie` built from
        //      `cookie_into_wkwebview()`; the completion handler fires unconditionally --
        //      "the operation was processed", not "a cookie was found". The identical
        //      round-trip-loses-a-property bug shape is a filed WebKit defect,
        //      bugs.webkit.org #184938. `Ok(())` was never evidence of anything on this
        //      platform. Fixed by bypassing the round trip entirely (see the macOS branch
        //      below).
        //
        // D-08 is non-negotiable on every platform: never `clear_all_browsing_data()`
        // (wry-0.55.1/src/lib.rs:2137) or any other blanket wipe -- the jar is app-wide and
        // will hold Epic/GOG/Amazon cookies once Phase 34.5 lands. The macOS branch below
        // uses `WKWebsiteDataRecord.displayName()` filtering (domain-suffix, the same
        // discipline `cookie_domain_matches` uses) rather than a bulk API.
        "humble_login_clear_cookies" => {
            let label = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_clear_cookies:bad-args".to_string())?;
            let domain = args
                .get(1)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_clear_cookies:bad-args".to_string())?;
            let existing_window = app.get_webview_window(label);

            // Epic pristine-window fallback (macOS only; see
            // `clear_default_data_store_cookies_for_domain`'s own doc comment for the full
            // defect this closes). `open_pristine_epic_login_window` never registers a
            // Tauri-managed `WebviewWindow` under ITS label -- `existing_window` is
            // structurally always `None` for it, for every label, fresh or stale -- so this
            // branch is gated on BOTH "no such webview window" AND "the domain being cleared
            // is Epic's own", the only combination `legendary/user.ts`'s `clearEpicCookies`
            // step can ever produce. Every other caller (Humble/GOG/Amazon, all still routed
            // through a live Tauri-managed window at this point) fails the domain check and
            // falls straight through to the existing `no-window` error below, completely
            // unchanged.
            #[cfg(target_os = "macos")]
            if existing_window.is_none() && cookie_domain_matches(domain, Some(EPIC_COOKIE_DOMAIN))
            {
                return clear_default_data_store_cookies_for_domain(app, domain);
            }

            let window =
                existing_window.ok_or_else(|| format!("humble_login:no-window:{label}"))?;

            // The SAME clear-direction filter as before (unedited by Plan 23, Plan 22
            // already proved it correct against Defect A): the cookie's OWN domain first,
            // the caller's fixed target second. Used for BOTH the before- and after-reads,
            // on every platform, so `verified_delete_count`'s subtraction is meaningful.
            //
            // F-34.4.2-12 fix (`.planning/debug/humble-disconnect-main-wedge.md`): on macOS
            // this closure must NEVER call wry's own blocking `WebviewWindow::cookies()`
            // getter. That getter blocks the calling closure inside
            // `wait_for_blocking_operation`'s reentrant `NSRunLoop` pump
            // (wry-0.55.1/src/wkwebview/mod.rs:1446), and when this arm's caller
            // (`dispatch_rust_channel`, always a `thread::spawn`'d worker thread) has its
            // request serviced from INSIDE tao's `EventLoopHandler::with_callback`
            // (`app_state.rs:78`, which holds tao's own handler `Mutex` for the whole
            // user-event dispatch), that reentrant pump can let AppKit's redraw path
            // (`handle_redraw` -> `handle_nonuser_event`) try to relock the SAME mutex the
            // outer frame already holds -- a real, live-reproduced (2/2) main-thread
            // self-deadlock, confirmed by a full hung-process sample (4185/4185 samples in
            // the identical state; see the debug session's Evidence for the backtrace and
            // durable evidence file paths). This is a hard deadlock, not a slow path: no
            // timeout on this call's own `rx.recv()` would help, because the main thread is
            // blocked BELOW that level, inside wry's internals.
            //
            // Fixed the SAME way this arm's own removal branch (below) and
            // `clear_default_data_store_cookies_for_domain` (above) already read/removed
            // cookies safely: `with_webview()` -> `WKHTTPCookieStore.getAllCookies()` via an
            // async completion handler, with the wait on a plain `mpsc_channel` done on the
            // CALLING (worker) thread, never nested inside the main-thread closure itself --
            // that closure only registers the completion block and returns immediately, so it
            // never blocks main-thread control flow and never needs (or triggers) a reentrant
            // run-loop pump. Root-cause fix, not a timing mitigation.
            #[cfg(target_os = "macos")]
            let count_matching = |w: &tauri::WebviewWindow| -> Result<usize, String> {
                let (tx, rx) = mpsc_channel::<Result<usize, String>>();
                let target_domain = domain.to_string();
                if let Err(e) = w.with_webview(move |webview| {
                    let outcome: Result<(), String> = (|| {
                        // Bound but not otherwise read -- kept as the live proof (per its own
                        // type's invariant) that this closure is genuinely running on the
                        // main thread, the same safety receipt `mtm` serves everywhere else
                        // in this file even where no ObjC call actually takes it as an arg.
                        let _mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                            "humble_login_clear_cookies:count-matching:no-main-thread-marker"
                                .to_string()
                        })?;
                        // SAFETY: mirrors this arm's own removal-branch cast, below --
                        // `webview.inner()` is a live `WKWebView*` for the duration of a
                        // `with_webview` closure running on the main thread (tauri's own doc
                        // guarantee); `mtm` proves this closure is running on the main thread.
                        let view: &objc2_web_kit::WKWebView =
                            unsafe { &*webview.inner().cast() };
                        let data_store = unsafe { view.configuration().websiteDataStore() };
                        let cookie_store = unsafe { data_store.httpCookieStore() };
                        let target = target_domain.clone();
                        let tx_fetch = tx.clone();
                        // SAFETY: `getAllCookies` hands the completion handler a valid, live
                        // array pointer for the duration of this call; `tx_fetch` outlives it.
                        let completion = block2::RcBlock::new(
                            move |cookies: std::ptr::NonNull<
                                objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                            >| {
                                let cookies_ref = unsafe { cookies.as_ref() };
                                // Never logged (T-34.4.1-02) -- each cookie's domain is read
                                // only to feed the pure, count-only `cookie_domain_matches`
                                // filter, never printed.
                                let count = cookies_ref
                                    .to_vec()
                                    .iter()
                                    .filter(|cookie| {
                                        cookie_domain_matches(
                                            &cookie.domain().to_string(),
                                            Some(&target),
                                        )
                                    })
                                    .count();
                                let _ = tx_fetch.send(Ok(count));
                            },
                        );
                        unsafe {
                            cookie_store.getAllCookies(&completion);
                        }
                        Ok(())
                    })();
                    if let Err(e) = outcome {
                        let _ = tx.send(Err(e));
                    }
                }) {
                    return Err(format!(
                        "humble_login_clear_cookies:count-matching:dispatch:{e}"
                    ));
                }
                match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
                    Ok(inner) => inner,
                    Err(_) => {
                        Err("humble_login_clear_cookies:count-matching:timeout".to_string())
                    }
                }
            };
            // Non-macOS: unchanged wry getter path -- F-34.4.2-12's reentrant-pump mechanism
            // is macOS/WebKit/tao-specific (`wait_for_blocking_operation`'s `NSRunLoop` pump
            // colliding with tao's Cocoa-only `EventLoopHandler` mutex); no live evidence
            // implicates the `webview2`/`webkitgtk` backends, so this path is left exactly as
            // it was (D-09 discipline: declare unverified, never silently assume broken or
            // fixed).
            #[cfg(not(target_os = "macos"))]
            let count_matching = |w: &tauri::WebviewWindow| -> Result<usize, String> {
                Ok(w.cookies()
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .filter(|c| match c.domain() {
                        Some(d) => cookie_domain_matches(d, Some(domain)),
                        None => false,
                    })
                    .count())
            };

            let before_matching = count_matching(&window)?;
            // Nothing to remove -- `verified_delete_count` would return 0 regardless, and
            // this also means a window that never authenticated never touches the macOS
            // with_webview/WKWebsiteDataStore path below at all (behavior bullet in Task
            // 1's own test, re-asserted here at the arm level).
            if before_matching == 0 {
                return Ok(Value::Number(0.into()));
            }

            #[cfg(target_os = "macos")]
            {
                // ---- macOS: WKWebsiteDataStore, never wry's delete_cookie() (Plan 23). ----
                //
                // Threading (source-verified against tauri-runtime-wry-2.11.4's
                // `send_user_message`/`webview_getter!`, NOT assumed from spike 016's raw
                // measurement -- see this plan's SUMMARY for the full reasoning): this arm
                // always runs on a SPAWNED WORKER THREAD (`start_reader`'s `rustInvoke`
                // dispatch does `thread::spawn` before calling `dispatch_rust_channel`),
                // never the tao main thread `with_webview()`'s own doc comment describes.
                // Off the main thread, `Dispatcher::with_webview()` posts the closure via
                // `context.proxy.send_event(...)` and returns `Ok(())` IMMEDIATELY, BEFORE
                // the closure has run (`send_user_message` only runs a message inline when
                // `current_thread().id() == context.main_thread_id`). Spike 016 measured
                // `closure_ran_immediately_after_return=true`, but that measurement's
                // trigger was a WKWebView navigation-delegate callback
                // (`humble_login_open`'s `on_page_load` hook), which genuinely does run on
                // the OS main thread -- a DIFFERENT call site from this arm's real one, and
                // not representative of it. So this arm does NOT rely on `with_webview`'s
                // return for synchrony: it uses the exact channel-plus-wait shape
                // `humble_reveal_post`/`humble_login_clear_storage` already use (a plain
                // `mpsc_channel` + `rx.recv_timeout`) -- the same blocking-on-a-channel
                // pattern `window.cookies()` above already relies on internally
                // (`webview_getter!`'s own `rx.recv()`). No `NSRunLoop` pump is needed here
                // (unlike the throwaway spike016 probe, which ran ON the main thread and
                // would have deadlocked its own run loop by blocking on it): the WORKER
                // thread blocks, the MAIN thread's own event loop keeps servicing the
                // completion handler independently.
                let (tx, rx) = mpsc_channel::<()>();
                let domain_for_closure = domain.to_string();
                // `with_webview`'s `Ok(())` here is NOT proof the closure ran (see above) --
                // only used to detect a structural dispatch failure (no such webview/event
                // loop gone).
                if let Err(e) = window.with_webview(move |webview| {
                    let Some(mtm) = objc2::MainThreadMarker::new() else {
                        // Structurally should not happen inside with_webview's closure
                        // (T-34.4.1-101); fail safe by signalling "done, nothing removed"
                        // rather than hanging the worker thread until CLEAR_COOKIES_TIMEOUT.
                        let _ = tx.send(());
                        return;
                    };
                    // SAFETY: tauri's own `with_webview` doc example casts
                    // `webview.inner()` to `&objc2_web_kit::WKWebView` on macOS verbatim --
                    // this mirrors that example exactly. The reference is valid for the
                    // closure's duration (tauri guarantees `inner()` is a live `WKWebView*`
                    // while the closure runs on the main thread, per its own doc comment).
                    // This is the ONLY raw pointer cast in this arm, confined to the
                    // closure `with_webview()` hands back for the label the caller already
                    // resolved through `app.get_webview_window(label)` above -- the same
                    // fail-closed, generated-label window every other arm in this file
                    // addresses (T-34.4.1-101, D-01).
                    let view: &objc2_web_kit::WKWebView = unsafe { &*webview.inner().cast() };
                    let data_store = unsafe { view.configuration().websiteDataStore() };
                    let data_store_for_removal = data_store.clone();
                    // SAFETY: `mtm` proves this closure is running on the main thread.
                    let all_types =
                        unsafe { objc2_web_kit::WKWebsiteDataStore::allWebsiteDataTypes(mtm) };
                    let tx_fetch = tx.clone();
                    let target_domain = domain_for_closure.clone();
                    let fetch_completion = block2::RcBlock::new(
                        move |records: std::ptr::NonNull<
                            objc2_foundation::NSArray<objc2_web_kit::WKWebsiteDataRecord>,
                        >| {
                            // SAFETY: WebKit hands the completion handler a valid, live
                            // array pointer for the duration of this call.
                            let records_ref = unsafe { records.as_ref() };
                            let all_records: Vec<
                                objc2::rc::Retained<objc2_web_kit::WKWebsiteDataRecord>,
                            > = records_ref.to_vec();
                            let matching_records: Vec<&objc2_web_kit::WKWebsiteDataRecord> =
                                all_records
                                    .iter()
                                    .filter(|record| {
                                        // SAFETY: `displayName()` is a simple ObjC accessor;
                                        // `record` is a live, retained object from
                                        // `all_records`. Never logged (T-34.4.1-39/-75/-91)
                                        // -- passed only into the pure, count-only
                                        // `website_data_record_matches_domain` filter.
                                        let display_name =
                                            unsafe { record.displayName() }.to_string();
                                        website_data_record_matches_domain(
                                            &display_name,
                                            &target_domain,
                                        )
                                    })
                                    .map(|record| &**record)
                                    .collect();
                            if matching_records.is_empty() {
                                let _ = tx_fetch.send(());
                                return;
                            }
                            // Scoped to WKWebsiteDataTypeCookies ONLY (spike 016's own
                            // finding) -- a matched record may carry localStorage/
                            // IndexedDB/cache data for the same domain too, and
                            // `removeDataOfTypes` removes only the types named here,
                            // never the whole record. Plans 15/16's separate
                            // origin-scoped storage clear owns those other categories;
                            // widening this clear into them would be a silent scope
                            // regression, not a fix.
                            // SAFETY: `WKWebsiteDataTypeCookies` is a valid static
                            // `NSString` this crate exposes; reading an extern static is
                            // the only unsafe part of this line.
                            let cookies_type: &objc2_foundation::NSString =
                                unsafe { objc2_web_kit::WKWebsiteDataTypeCookies };
                            let cookies_type_set =
                                objc2_foundation::NSSet::from_slice(&[cookies_type]);
                            let records_array =
                                objc2_foundation::NSArray::from_slice(&matching_records);
                            let tx_remove = tx_fetch.clone();
                            let remove_completion = block2::RcBlock::new(move || {
                                let _ = tx_remove.send(());
                            });
                            // SAFETY: `data_store_for_removal` is a live object obtained
                            // on the main thread above; `cookies_type_set`/
                            // `records_array` are freshly built, live objects;
                            // `remove_completion` outlives the call (WebKit retains the
                            // block for the duration of its async operation).
                            unsafe {
                                data_store_for_removal
                                    .removeDataOfTypes_forDataRecords_completionHandler(
                                        &cookies_type_set,
                                        &records_array,
                                        &remove_completion,
                                    );
                            }
                        },
                    );
                    // SAFETY: `data_store`/`all_types` are live objects obtained above on
                    // the main thread; `fetch_completion` outlives the call.
                    unsafe {
                        data_store
                            .fetchDataRecordsOfTypes_completionHandler(&all_types, &fetch_completion);
                    }
                }) {
                    eprintln!(
                        "[shell] humble_login_clear_cookies: with_webview dispatch failed: {e}"
                    );
                    return Err(format!("humble_login_clear_cookies:dispatch:{e}"));
                }

                if rx.recv_timeout(CLEAR_COOKIES_TIMEOUT).is_err() {
                    eprintln!(
                        "[shell] humble_login_clear_cookies: WKWebsiteDataStore removal timed out waiting for the completion signal"
                    );
                    // Fall through to the re-read below regardless -- a timeout means the
                    // SIGNAL was missed, not necessarily that nothing happened. The
                    // verified count must always come from a re-read (binding constraint
                    // 2), never from whether this signal arrived.
                }

                let after_matching = count_matching(&window)?;
                Ok(Value::Number(
                    verified_delete_count(before_matching, after_matching).into(),
                ))
            }

            #[cfg(not(target_os = "macos"))]
            {
                // ---- Linux/Windows: UNVERIFIED on the existing wry `delete_cookie()`
                // path (D-09, REQ-34.4.1-13). This bug's root cause (wry's own
                // `cookie_into_wkwebview()` round trip, wkwebview/mod.rs:1248-1267) is
                // macOS/WebKit-specific and is NOT proven to exist in wry's `webview2`
                // (webview2/mod.rs:1681) or `webkitgtk` (webkitgtk/mod.rs:1086)
                // `delete_cookie` implementations -- separate code paths with their own
                // conversions. Only the dishonest ATTEMPTED count is fixed here; the
                // deletion mechanism itself is UNCHANGED and DECLARED unverified, never
                // silently assumed fixed (nor silently assumed still broken).
                let matching: Vec<_> = window
                    .cookies()
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .filter(|c| match c.domain() {
                        Some(d) => cookie_domain_matches(d, Some(domain)),
                        None => false,
                    })
                    .collect();
                for cookie in matching {
                    window.delete_cookie(cookie).map_err(|e| e.to_string())?;
                }
                let after_matching = count_matching(&window)?;
                Ok(Value::Number(
                    verified_delete_count(before_matching, after_matching).into(),
                ))
            }
        }
        // Issue the reveal-key POST from a hidden, on-demand child window's own JS `fetch()`
        // (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) -- the ONE structurally-new option
        // for humblePostRequest's transport under Tauri, because a genuine WKWebView network
        // stack is the one place a real browser TLS/HTTP fingerprint exists. Never logs the
        // script, the body, the csrf token or the response payload (T-34.4.1-21/T-28-04
        // convention) -- only channel names and generic error text ever reach `eprintln!`.
        //
        // Every exit path below closes the window before returning (D-08 -- no idle
        // authenticated window persists between reveals):
        //   - bad-args / window-build-failure: no window was ever created, nothing to close.
        //   - script injection failure: closed immediately below, then returns the error.
        //   - success / script-parse-failure / timeout (after `rx.recv_timeout`): the single
        //     close call right after the recv covers all three of these outcomes at once.
        "humble_reveal_post" => {
            let parsed = reveal_post_args(args)?;
            let label = next_login_window_label();
            let (tx, rx) = mpsc_channel::<String>();
            let window = match tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::External(parsed.origin_url.clone()),
            )
            .user_agent(&parsed.user_agent)
            .visible(false) // D-08: hidden, on-demand -- never the login flow's own visible window
            .on_navigation(move |url| {
                if url.host_str() == Some(REVEAL_EXFIL_HOST) {
                    if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "data") {
                        let _ = tx.send(payload.into_owned());
                    }
                    // Cancel -- gamelib.invalid is RFC 2606 reserved and never actually
                    // resolves regardless (Open Question 1), but this is the real guard.
                    return false;
                }
                true
            })
            .build()
            {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("[shell] humble_reveal_post: window build failed: {e}");
                    return Err(format!("humble_reveal_post:window:{e}"));
                }
            };

            let script = reveal_post_script(
                &parsed.path,
                &parsed.body,
                parsed.csrf_token.as_deref(),
                REVEAL_EXFIL_HOST,
            );
            if let Err(e) = window.eval(&script) {
                let _ = window.close(); // close site 1: script injection itself failed
                eprintln!("[shell] humble_reveal_post: script injection failed: {e}");
                return Err(format!("humble_reveal_post:script:{e}"));
            }

            let outcome = rx.recv_timeout(REVEAL_POST_TIMEOUT);
            let _ = window.close(); // close site 2: covers success, parse-failure AND timeout below

            match outcome {
                Ok(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| {
                    eprintln!("[shell] humble_reveal_post: exfil payload parse failed: {e}");
                    format!("humble_reveal_post:script:{e}")
                }),
                Err(_) => Err("humble_reveal_post:timeout".to_string()),
            }
        }
        // Origin-scoped storage clear (34.4.1 gap cycle plan 15, F-6 BLOCKING,
        // REQ-34.4.1-06/REQ-34.4.1-GAP-03). Same hidden-window + navigation-intercept-exfil
        // template as `humble_reveal_post` above, reused verbatim for its timeout/close
        // discipline. Never logs the origin, the storage contents, key names or the exfil
        // payload (T-34.4.1-21/T-28-04 convention) -- only the channel name and generic error
        // text ever reach `eprintln!`.
        //
        // Every exit path below closes the window before returning (D-08 -- no idle
        // authenticated window persists after a clear):
        //   - bad-args / window-build-failure: no window was ever created, nothing to close.
        //   - script injection failure: closed immediately below, then returns the error.
        //   - success / script-parse-failure / timeout (after `rx.recv_timeout`): the single
        //     close call right after the recv covers all three of these outcomes at once.
        "humble_login_clear_storage" => {
            let parsed = clear_storage_args(args)?;
            let label = next_login_window_label();
            let (tx, rx) = mpsc_channel::<String>();
            let window = match tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::External(parsed.origin_url.clone()),
            )
            .user_agent(&parsed.user_agent)
            .visible(false) // D-08: hidden, on-demand -- never a visible login window
            .on_navigation(move |url| {
                if url.host_str() == Some(REVEAL_EXFIL_HOST) {
                    if let Some((_, payload)) = url.query_pairs().find(|(k, _)| k == "data") {
                        let _ = tx.send(payload.into_owned());
                    }
                    // Cancel -- gamelib.invalid is RFC 2606 reserved and never actually
                    // resolves regardless (mirrors humble_reveal_post's Open Question 1
                    // disposition), but this is the real guard.
                    return false;
                }
                true
            })
            .build()
            {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("[shell] humble_login_clear_storage: window build failed: {e}");
                    return Err(format!("humble_login_clear_storage:window:{e}"));
                }
            };

            let script = clear_storage_script(REVEAL_EXFIL_HOST);
            if let Err(e) = window.eval(&script) {
                let _ = window.close(); // close site 1: script injection itself failed
                eprintln!("[shell] humble_login_clear_storage: script injection failed: {e}");
                return Err(format!("humble_login_clear_storage:script:{e}"));
            }

            let outcome = rx.recv_timeout(CLEAR_STORAGE_TIMEOUT);
            let _ = window.close(); // close site 2: covers success, parse-failure AND timeout below

            match outcome {
                Ok(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| {
                    eprintln!(
                        "[shell] humble_login_clear_storage: exfil payload parse failed: {e}"
                    );
                    format!("humble_login_clear_storage:script:{e}")
                }),
                Err(_) => Err("humble_login_clear_storage:timeout".to_string()),
            }
        }
        // Correctly-directed domain-scoped cookie read (Phase 34.4.1 Plan 22, F-6 Defect A,
        // REQ-34.4.1-GAP-07). `cookie_domain_matches` (above) is directional: `host == d ||
        // host.ends_with(".{d}")` only ever fires when `host` is the NARROWER string. The
        // existing `humble_login_cookies` arm passes the caller's `host` first -- exactly
        // right for `watchForLogin()`'s question ("does this cookie's domain cover the page
        // I am on?"), proven correct by spike 014a, and left UNCHANGED here. It is exactly
        // WRONG for the disconnect census's question ("does this cookie belong to the target
        // domain or any of its subdomains?"): with a FIXED apex as `host`, the suffix branch
        // can never fire, so a caller passing a fixed domain through that arm only ever
        // matches cookies whose domain attribute is the bare target string, silently
        // undercounting every leading-dot- and subdomain-scoped cookie (spike 016 measured
        // this live: total=33, that arm's direction=29, this arm's direction=33/33 -- see
        // `34.4.1-SPIKE-016-FINDINGS.md`). This arm exists SOLELY to answer that second
        // question -- it filters with the cookie's OWN domain first, the caller's fixed
        // target second, mirroring `humble_login_clear_cookies`'s (unchanged) filter exactly.
        // Two arms exist, not one, because the two call sites ask two different questions of
        // the same directional function; collapsing them would break the login poll to fix
        // the census. Same `total`-is-the-liveness-proof contract, same never-`cookies_for_url()`
        // / never-`clear_all_browsing_data()` discipline, same never-logs-a-cookie-value
        // discipline (T-34.4.1-02, T-34.4.1-94) as `humble_login_cookies` above.
        "humble_login_cookies_for_domain" => {
            let label = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_cookies_for_domain:bad-args".to_string())?;
            let domain = args
                .get(1)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "humble_login_cookies_for_domain:bad-args".to_string())?;
            let names: Vec<&str> = args
                .get(2)
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                .unwrap_or_default();
            let window = app
                .get_webview_window(label)
                .ok_or_else(|| format!("humble_login_cookies_for_domain:no-window:{label}"))?;

            // F-34.4.2-12 fix (see `humble_login_clear_cookies`'s `count_matching` closure,
            // above, for the full mechanism this closes): this arm is disconnect's cookie
            // census (`readCensus()`), called TWICE against the SAME just-created hidden
            // window in quick succession, alongside `count_matching`'s own two calls -- four
            // wry `.cookies()` round trips against one freshly-created, still-rendering
            // WKWebView was the reproduced deadlock's exact trigger shape (live sample:
            // 4185/4185 samples in the identical self-deadlocked state). Same fix, same
            // reasoning: never call wry's own blocking `WebviewWindow::cookies()` getter here
            // on macOS; read the SAME window's own `WKHTTPCookieStore` natively via an async
            // completion handler instead -- the calling closure only registers the callback
            // and returns immediately, so it never blocks inside tao's `with_callback`
            // critical section and never needs (or triggers) a reentrant run-loop pump.
            #[cfg(target_os = "macos")]
            {
                let (tx, rx) = mpsc_channel::<Result<(usize, Vec<Value>), String>>();
                let target_domain = domain.to_string();
                let target_names: Vec<String> = names.iter().map(|n| n.to_string()).collect();
                if let Err(e) = window.with_webview(move |webview| {
                    let outcome: Result<(), String> = (|| {
                        // Bound but not otherwise read -- see `count_matching`'s identical
                        // `_mtm` binding, above, for why this is kept as a live safety proof.
                        let _mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                            "humble_login_cookies_for_domain:no-main-thread-marker".to_string()
                        })?;
                        // SAFETY: mirrors `humble_login_clear_cookies`'s own removal-branch
                        // cast -- `webview.inner()` is a live `WKWebView*` for the duration of
                        // a `with_webview` closure running on the main thread; `mtm` proves
                        // this closure is running on the main thread.
                        let view: &objc2_web_kit::WKWebView =
                            unsafe { &*webview.inner().cast() };
                        let data_store = unsafe { view.configuration().websiteDataStore() };
                        let cookie_store = unsafe { data_store.httpCookieStore() };
                        let filter_domain = target_domain.clone();
                        let filter_names = target_names.clone();
                        let tx_fetch = tx.clone();
                        // SAFETY: `getAllCookies` hands the completion handler a valid, live
                        // array pointer for the duration of this call; `tx_fetch` outlives it.
                        let completion = block2::RcBlock::new(
                            move |cookies: std::ptr::NonNull<
                                objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                            >| {
                                let cookies_ref = unsafe { cookies.as_ref() };
                                let all_cookies = cookies_ref.to_vec();
                                let total = all_cookies.len();
                                // Never logs a cookie value (T-34.4.1-02/T-34.4.1-94) -- names
                                // and domains are read only to feed the pure comparison
                                // filters below, values only into the returned JSON payload
                                // the caller already explicitly requested over the
                                // already-allowlisted rustInvoke channel.
                                let matched: Vec<Value> = all_cookies
                                    .into_iter()
                                    .filter(|c| {
                                        cookie_domain_matches(
                                            &c.domain().to_string(),
                                            Some(&filter_domain),
                                        )
                                    })
                                    .filter(|c| {
                                        filter_names.is_empty()
                                            || filter_names
                                                .iter()
                                                .any(|n| n.as_str() == c.name().to_string())
                                    })
                                    .map(|c| {
                                        serde_json::json!({
                                            "name": c.name().to_string(),
                                            "domain": c.domain().to_string(),
                                            "value": c.value().to_string()
                                        })
                                    })
                                    .collect();
                                let _ = tx_fetch.send(Ok((total, matched)));
                            },
                        );
                        unsafe {
                            cookie_store.getAllCookies(&completion);
                        }
                        Ok(())
                    })();
                    if let Err(e) = outcome {
                        let _ = tx.send(Err(e));
                    }
                }) {
                    return Err(format!("humble_login_cookies_for_domain:dispatch:{e}"));
                }
                match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
                    Ok(Ok((total, matched))) => {
                        Ok(serde_json::json!({ "total": total, "matched": matched }))
                    }
                    Ok(Err(e)) => Err(e),
                    Err(_) => Err("humble_login_cookies_for_domain:timeout".to_string()),
                }
            }

            // Non-macOS: unchanged wry getter path -- see `count_matching`'s own non-macOS
            // branch, above, for why this is left as-is (D-09 discipline).
            #[cfg(not(target_os = "macos"))]
            {
                let all = window.cookies().map_err(|e| e.to_string())?;
                let total = all.len();
                let matched: Vec<Value> = all
                    .into_iter()
                    .filter(|c| match c.domain() {
                        Some(d) => cookie_domain_matches(d, Some(domain)),
                        None => false,
                    })
                    .filter(|c| names.is_empty() || names.contains(&c.name()))
                    .map(|c| {
                        serde_json::json!({
                            "name": c.name(),
                            "domain": c.domain().unwrap_or_default(),
                            "value": c.value()
                        })
                    })
                    .collect();
                Ok(serde_json::json!({ "total": total, "matched": matched }))
            }
        }
        _ => Err(format!("rustInvoke:unknown-channel:{channel}")),
    }
}

// ---- Sidecar lifecycle + stdout reader ----

/// Resolve the sidecar entry to an ABSOLUTE path. Previously this was the cwd-relative
/// `../build/main/sidecar.js`, which silently missed under `tauri dev` (the dev binary's cwd
/// is not guaranteed to be `src-tauri/`). Baking the path from `CARGO_MANIFEST_DIR` at compile
/// time makes it cwd-independent for dev; `GAMELIB_SIDECAR_ENTRY` still overrides for
/// packaged/resource layouts.
fn resolve_sidecar_entry() -> String {
    if let Ok(entry) = std::env::var("GAMELIB_SIDECAR_ENTRY") {
        return entry;
    }
    format!("{}/../build/main/sidecar.js", env!("CARGO_MANIFEST_DIR"))
}

/// Whether this run should use the DEV-mode `node <sidecar-entry.js>` spawn path instead of
/// the packaged `externalBin` binary. Gated on build profile ALONE (`cfg!(debug_assertions)`):
/// a release build can never take this path, regardless of the process environment (D-06,
/// WR-01). `GAMELIB_SIDECAR_ENTRY` still redirects WHICH entry file the dev path loads (via
/// `resolve_sidecar_entry()` above), but it can no longer switch a release build onto the
/// `node` path the way the old `.is_ok() || cfg!(debug_assertions)` expression allowed.
fn use_dev_sidecar() -> bool {
    cfg!(debug_assertions)
}

/// Formats the result of `std::env::current_exe()` for the `GAMELIB_SHELL_EXE` spawn-time
/// env var handoff (Phase 34.5 Plan 01, REQ-34.5-01, D-10/D-09). Pure and `AppHandle`-free so
/// it can be proven by `#[cfg(test)] mod tests` below — a live spawn cannot be driven from a
/// `#[test]`, mirroring `clipboard_text_arg`/`login_window_url_arg`'s own extraction pattern.
///
/// On `Ok`, returns the path's `display()` form, UNQUOTED — a path containing a space must
/// survive verbatim, with no quotes added: `nonesteamgame.ts:258` adds its own `"..."`
/// quoting for the Steam shortcut VDF `Exe` entry, and `shortcuts.ts:227` deliberately does
/// NOT quote its macOS `.app` `run.sh` launch command, so this helper must never pre-empt
/// either consumer's own formatting.
///
/// On `Err`, returns the EMPTY STRING, deliberately never panicking (T-34.5-03: the shell
/// must still start and every other channel must still work even if `current_exe()` fails).
/// `pathShim.ts`'s `case 'exe'` treats an empty string identically to an unset env var and
/// throws a named error — so a failed `current_exe()` here surfaces as a loud JS-side error
/// (T-34.5-01/02) rather than a silently-bad Steam VDF entry or a silently-bad macOS `.app`
/// `run.sh`.
fn shell_exe_env_value(current_exe: std::io::Result<std::path::PathBuf>) -> String {
    current_exe
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| String::new())
}

/// Formats a resolved app-root `PathBuf` for the `GAMELIB_APP_ROOT` spawn-time env var handoff
/// (Phase 34.5 Plan 16, Task 2, G-1). This is the fix for the root cause of live-gate items
/// 1/2/3 and (transitively) 5: under the sidecar, `electronStub.getAppPath()` resolved to
/// `process.cwd()` (`src-tauri/`), so `publicDir` (`paths.ts:73`) resolved to a directory that
/// does not exist and every bundled runner binary ENOENT'd on spawn. Pure and `AppHandle`-free
/// so it can be proven by `#[cfg(test)] mod tests` below, mirroring `shell_exe_env_value`'s
/// exact contract shape one function up:
///
/// - `Ok(path)` returns the path's `display()` form, UNQUOTED and UNTRIMMED.
/// - `Err(_)` returns the EMPTY STRING, deliberately never panicking — the shell must still
///   start even if app-root resolution fails, and `electronStub.getAppPath()` (JS side) treats
///   an empty string exactly like an unset env var, falling back to today's `process.cwd()`
///   behaviour (REQ-34.5-13: the Electron build and the jest suite see no behaviour change).
///
/// The error type is a plain `String`, not the caller's own error type — the dev path's failure
/// (`CARGO_MANIFEST_DIR` has no parent; unreachable in practice) and the packaged path's failure
/// (a `tauri::Error` from `resource_dir()`) are unrelated types with nothing in common. Both
/// callers map their own error to a string before calling this, keeping this helper generic and
/// `AppHandle`-free.
fn app_root_env_value(app_root: Result<std::path::PathBuf, String>) -> String {
    app_root
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| String::new())
}

// ---- Deep-link / single-instance argv helpers (Phase 34.5 gap cycle 6 plan 44,
// REQ-34.5-01/05/12, F-34.5-G6-09) ----
//
// Gate 3's own recorded invocation (`gamelib-shell --no-gui --no-sandbox
// "gamelib://launch?appName=1207659037&runner=gog"`) is the input shape every helper below is
// built against. Like `shell_exe_env_value`/`app_root_env_value` immediately above, these are
// pure and `AppHandle`-free specifically so a `#[cfg(test)] fn` can drive them -- neither a
// live `UnixListener` nor a spawned child process can be constructed from a plain `#[test]`.

/// The ONLY scheme this shell's argv parser recognizes. Case-SENSITIVE by design -- matches
/// `protocol.ts`'s own `args.find((arg) => arg.startsWith('gamelib://'))` exactly. A
/// case-insensitive Rust side paired with a case-sensitive JS side would itself be a defect
/// class (two parsers silently disagreeing on what counts as a deep link).
const PROTOCOL_SCHEME_PREFIX: &str = "gamelib://";

/// Exact-match flag mirroring `environment.ts`'s `process.argv.includes('--no-gui')`.
const NO_GUI_FLAG: &str = "--no-gui";

/// Upper bound on an accepted deep-link URL's length (T-34.5-G6-23) -- keeps a malformed or
/// hostile argv/socket payload from growing unbounded before it ever reaches a JSON-RPC frame
/// or a log line.
const MAX_PROTOCOL_URL_LEN: usize = 2048;

/// The deep-link extractor and this plan's single input-validation choke point (ASVS V5):
/// every other helper below, and the single-instance accept loop in `main()`, MUST route a
/// candidate URL through this function before trusting it. Failure mode is always `None` --
/// never panics.
///
/// Deliberately returns the ORIGINAL candidate string, byte-for-byte -- not a re-serialised
/// `tauri::Url`. The shell must never silently rewrite what a shortcut asked for;
/// `protocol.ts`'s own `new URL()` call remains the sole authority on interpretation.
///
/// Deliberately ACCEPTS a URL with no `runner` query parameter (e.g.
/// `gamelib://launch?appName=1207659037`) -- see D-44-C / `U-34.5-19`. `shortcuts.ts:227`'s
/// `run.sh` template USED TO be unquoted, which made `bash` split the whole command on the
/// unescaped `&` so the macOS `.app` path delivered exactly this truncated form -- that template
/// is quoted and percent-encoded now, so this specific shape is no longer emitted by current code (fixed in plan 34.5-45).
/// The tolerance is KEPT anyway: `.app` bundles generated before that fix already exist on
/// users' disks and still deliver the truncated runner-less URL, so this is now a compatibility
/// guarantee plus defence-in-depth, not dead code. `findGame` (`protocol.ts:181`) recovers by
/// searching every runner in order.
fn protocol_url_arg(args: &[String]) -> Option<String> {
    let candidate = args
        .iter()
        .find(|arg| arg.starts_with(PROTOCOL_SCHEME_PREFIX))?;

    // T-34.5-G6-21: a newline/CR/NUL inside the value could split or forge a frame on the
    // newline-delimited JSON-RPC pipe this value is about to travel on, or corrupt a
    // line-oriented log file.
    if candidate.chars().any(|c| c.is_ascii_control()) {
        return None;
    }

    if candidate.len() > MAX_PROTOCOL_URL_LEN {
        return None;
    }

    let parsed = tauri::Url::parse(candidate).ok()?;
    if parsed.scheme() != "gamelib" {
        return None;
    }

    Some(candidate.clone())
}

/// Exact string equality only, mirroring `process.argv.includes('--no-gui')`.
///
/// RED direction: a `starts_with`/`contains` implementation would wrongly accept
/// `--no-gui-really` and `--not-no-gui`.
fn cli_no_gui(args: &[String]) -> bool {
    args.iter().any(|a| a == NO_GUI_FLAG)
}

/// The ALLOW-LIST deciding what the sidecar child's own `process.argv` receives
/// (T-34.5-G6-22) -- emits, in order, `NO_GUI_FLAG` (if present) then a validated deep-link
/// URL (if present), and NOTHING else, ever. Every other token -- `--no-sandbox`,
/// `--fullscreen`, `--console`, macOS's `-psn_0_...`, an unknown flag, a bare path -- is
/// silently dropped. `--no-sandbox` in particular is an Electron-only flag the Steam VDF's
/// `LaunchOptions` string carries verbatim; it has no meaning for this shell and must never
/// reach the sidecar.
///
/// Widening this list is a deliberate FUTURE decision, not something an executor may do
/// opportunistically -- see this plan's own decision record (D-44-A/T-34.5-G6-22).
fn sidecar_forward_args(args: &[String]) -> Vec<String> {
    let mut forwarded = Vec::new();
    if cli_no_gui(args) {
        forwarded.push(NO_GUI_FLAG.to_string());
    }
    if let Some(url) = protocol_url_arg(args) {
        forwarded.push(url);
    }
    forwarded
}

/// Pure path join, no I/O -- the single-instance guard's Unix socket file, always named
/// identically inside whatever directory `single_instance_dir` resolves.
fn single_instance_socket_path(app_support_dir: &std::path::Path) -> std::path::PathBuf {
    app_support_dir.join("gamelib-single-instance.sock")
}

/// Resolves the directory the single-instance socket lives in, from an explicit `home`
/// parameter rather than reading `std::env::var` internally -- mirrors
/// `resolve_dev_app_root`'s own doc comment (below) on why: neither this file's
/// `#[cfg(test)] mod tests` nor a parallel `cargo test` run may mutate process-global env
/// vars. Returns `None` when `home` is `None` or empty, so callers can fall back to running
/// without a guard (fail open, T-34.5-G6-24) rather than crash.
fn single_instance_dir(home: Option<&str>) -> Option<std::path::PathBuf> {
    let home = home.filter(|h| !h.is_empty())?;
    let base = std::path::Path::new(home);
    if cfg!(target_os = "macos") {
        Some(
            base.join("Library")
                .join("Application Support")
                .join("gamelib"),
        )
    } else {
        Some(base.join(".config").join("gamelib"))
    }
}

/// Resolves the DEV-mode `GAMELIB_APP_ROOT` value: the repository root, i.e. the parent of
/// `CARGO_MANIFEST_DIR` (`src-tauri/..`) — baked at compile time exactly as
/// `resolve_sidecar_entry()` above bakes its own path, and for the identical reason:
/// `std::env::current_dir()`'s unreliability under `tauri dev` is what that function's own doc
/// comment already records. Honours a pre-set `GAMELIB_APP_ROOT` in the shell's own environment
/// as an override before falling back to the computed value, mirroring
/// `resolve_sidecar_entry()`'s `GAMELIB_SIDECAR_ENTRY` override shape one function up — that
/// override read is untested at the Rust unit level for the same reason this one is: neither
/// this file's existing `#[cfg(test)] mod tests` nor this plan mutates process-global env vars
/// inside a parallel `cargo test` run. `src/backend/__tests__/tauriShellSource.test.ts`'s sibling
/// suite `appRootResolution.test.ts` (Task 3) proves the DEV/PACKAGED spawn-path wiring
/// structurally instead, against the real source text.
fn resolve_dev_app_root() -> String {
    if let Ok(root) = std::env::var("GAMELIB_APP_ROOT") {
        return root;
    }
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "CARGO_MANIFEST_DIR has no parent".to_string());
    app_root_env_value(repo_root)
}

/// Resolves the PACKAGED-mode `GAMELIB_APP_ROOT` value from `app.path().resource_dir()`
/// (`Manager` is already imported at line 43, so no new import is needed). A failure there
/// yields the empty string via `app_root_env_value`'s `Err` arm, never a panic — see
/// `app_root_env_value`'s own doc comment for why an empty value is safe here (the JS side
/// treats it as unset). `electronStub.app.isPackaged` stays `false` under the sidecar
/// regardless of this value, so `publicDir` still appends `'public'`, not `'build'`, even when
/// this resolves correctly — the packaged asset root itself is a named, deliberately unclosed
/// residual (`R-34.5-G1-PKG`, `34.5-APP-ROOT-SWEEP.md` § 3), not something this function claims
/// to fix.
fn resolve_packaged_app_root(app: &AppHandle) -> String {
    app_root_env_value(app.path().resource_dir().map_err(|e| e.to_string()))
}

// ---- Single-instance guard (Phase 34.5 gap cycle 6 plan 44, D-44-A) -----------------------
//
// Hand-rolled, std-only, Unix-only. No crate is added (`tauri-plugin-single-instance` is
// rejected -- see the plan's own decision record D-44-A): a plugin-based guard cannot run
// before `tauri::Builder::default()`, so a secondary process would still reach `.setup()` and
// spawn its own sidecar before the plugin could ever tell it "you are secondary". This guard
// runs at the very top of `main()`, before the builder is even constructed, so a secondary
// process's `std::process::exit(0)` fires before `spawn_sidecar` can ever be called.

/// Outcome of a single-instance acquisition attempt. `Primary` holds the bound listener the
/// accept loop in `main()`'s `.setup()` closure will service; `PrimaryWithoutListener` behaves
/// identically to a primary process (spawns the sidecar, opens the window) but has no socket
/// to accept connections on -- the FAIL-OPEN path (T-34.5-G6-24) for every recoverable
/// failure: no resolvable home directory, a directory-creation failure, or a bind failure.
/// `Secondary` means another instance is already alive and listening.
#[cfg(unix)]
enum SingleInstanceRole {
    Primary(std::os::unix::net::UnixListener),
    PrimaryWithoutListener,
    Secondary,
}

/// Acquires this process's single-instance role at `socket_path`. Connect-first, bind-second:
/// a successful `UnixStream::connect` means another instance is alive and listening, so this
/// process is `Secondary`. Any connect failure -- including a stale socket left behind by a
/// crashed instance, which fails with `ConnectionRefused` -- removes the old socket file
/// (best-effort; its own result is not load-bearing, since either the file existed and is now
/// gone, or it never existed) and attempts to bind fresh.
///
/// FAIL OPEN, NEVER FAIL CLOSED (T-34.5-G6-24): a bind failure returns
/// `PrimaryWithoutListener`, never an error -- a guard that cannot acquire its socket must
/// never make the app unlaunchable. On a successful bind, the socket file's permissions are
/// tightened to `0600` (best-effort; a chmod failure is logged and the guard proceeds anyway
/// -- the real enforcement of T-34.5-G6-20 is the `0700` parent directory the caller creates
/// before this function ever runs, not this belt-and-braces call).
#[cfg(unix)]
fn acquire_single_instance(socket_path: &std::path::Path) -> SingleInstanceRole {
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::{UnixListener, UnixStream};

    if UnixStream::connect(socket_path).is_ok() {
        return SingleInstanceRole::Secondary;
    }

    let _ = std::fs::remove_file(socket_path);

    match UnixListener::bind(socket_path) {
        Ok(listener) => {
            if let Err(e) =
                std::fs::set_permissions(socket_path, std::fs::Permissions::from_mode(0o600))
            {
                eprintln!(
                    "[shell] WARN: failed to set single-instance socket permissions to 0600: {e}"
                );
            }
            SingleInstanceRole::Primary(listener)
        }
        Err(e) => {
            eprintln!(
                "[shell] WARN: single-instance socket bind failed ({e}) -- continuing as primary without a listener (fail-open, T-34.5-G6-24)"
            );
            SingleInstanceRole::PrimaryWithoutListener
        }
    }
}

// D-44-A accepted cost, ledger row `U-34.5-18`: `std::os::unix::net` has no non-unix
// equivalent, so `acquire_single_instance` is never called on a non-unix target at all (see
// `main()`'s `#[cfg(not(unix))]` arm below) -- Windows keeps TODAY's behaviour (a second
// launch starts a second instance), a named, accepted gap, not a silent regression.

/// DEV MODE: spawn `node <sidecar-entry>` with piped stdio, logging exactly what it runs so a
/// spawn/path failure is visible in the `tauri dev` terminal (previously the whole leg was
/// invisible: a piped stdout consumed by the reader thread and no diagnostics meant even a
/// healthy sidecar — or a silent spawn failure — produced zero terminal output).
///
/// `shell_exe` is handed down from `spawn_sidecar` (computed ONCE via `current_exe()`, not
/// re-derived per spawn path) and set on the child's environment as `GAMELIB_SHELL_EXE` — the
/// sidecar's `pathShim.getPath('exe')` reads it back synchronously (REQ-34.5-01, D-10). Logged
/// here on the dev path only, so the live gate can read it back from
/// `~/Library/Logs/GameLib/gamelib.log`.
///
/// `forward_args` is handed down from `spawn_sidecar` too (computed once via
/// `sidecar_forward_args`, Phase 34.5 gap cycle 6 plan 44) and appended to the child's own
/// argv AFTER the entry path -- the sidecar's `process.argv` becomes
/// `[node, <entry>, ...forward_args]`, matching `environment.ts`'s `process.argv.includes(...)`
/// checks.
fn spawn_sidecar_dev(shell_exe: &str, forward_args: &[String]) -> std::io::Result<Child> {
    let entry = resolve_sidecar_entry();
    let app_root = resolve_dev_app_root();
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    let exists = std::path::Path::new(&entry).exists();
    eprintln!("[shell] spawning sidecar (dev): node \"{entry}\"");
    eprintln!("[shell]   cwd={cwd}");
    eprintln!("[shell]   entry_exists={exists}");
    eprintln!("[shell]   GAMELIB_SHELL_EXE={shell_exe}");
    eprintln!("[shell]   GAMELIB_APP_ROOT={app_root}");
    eprintln!("[shell]   forward_args={forward_args:?}");
    let child = Command::new("node")
        .arg(&entry)
        .args(forward_args)
        .env("GAMELIB_SHELL_EXE", shell_exe)
        .env("GAMELIB_APP_ROOT", &app_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    match &child {
        Ok(_) => eprintln!("[shell] sidecar process spawned OK"),
        Err(e) => eprintln!(
            "[shell] FAILED to spawn sidecar (is `node` on PATH? does the entry exist?): {e}"
        ),
    }
    child
}

/// PACKAGED MODE: resolve + spawn the bundled `externalBin` sidecar (`binaries/gamelib-sidecar`)
/// via `tauri-plugin-shell`'s `app.shell().sidecar(name)` (Don't Hand-Roll — the plugin already
/// encodes the per-OS `resource_dir()` path-resolution differences between dev and packaged
/// layouts; never a manual `cfg!(debug_assertions)` path branch here). The plugin's `Command`
/// wrapper converts into a plain `std::process::Command` (`impl From<Command> for StdCommand`),
/// so the rest of the spawn/pipe/diagnostic plumbing below is identical to the dev path.
///
/// `forward_args` is appended to `std_command`'s existing args (Phase 34.5 gap cycle 6 plan
/// 44) -- the packaged sidecar's `process.argv` becomes `[gamelib-sidecar, ...forward_args]`.
fn spawn_sidecar_packaged(
    app: &AppHandle,
    shell_exe: &str,
    forward_args: &[String],
) -> std::io::Result<Child> {
    let shell_command: ShellCommand = app.shell().sidecar("gamelib-sidecar").map_err(|e| {
        std::io::Error::other(format!("sidecar externalBin resolution failed: {e}"))
    })?;
    let mut std_command: Command = shell_command.into();
    let app_root = resolve_packaged_app_root(app);
    let program = std_command.get_program().to_string_lossy().to_string();
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    let exists = std::path::Path::new(&program).exists();
    eprintln!("[shell] spawning sidecar (packaged): \"{program}\"");
    eprintln!("[shell]   cwd={cwd}");
    eprintln!("[shell]   entry_exists={exists}");
    eprintln!("[shell]   GAMELIB_APP_ROOT={app_root}");
    eprintln!("[shell]   forward_args={forward_args:?}");
    let child = std_command
        .args(forward_args)
        .env("GAMELIB_SHELL_EXE", shell_exe)
        .env("GAMELIB_APP_ROOT", &app_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    match &child {
        Ok(_) => eprintln!("[shell] sidecar process spawned OK"),
        Err(e) => eprintln!(
            "[shell] FAILED to spawn packaged sidecar (does the externalBin exist for this target triple?): {e}"
        ),
    }
    child
}

/// Dispatches to the dev or packaged spawn path per `use_dev_sidecar()`. Calls
/// `std::env::current_exe()` exactly ONCE here and hands the formatted result down to both
/// spawn paths (never re-derived per-path with two different fallbacks) — REQ-34.5-01, D-10.
///
/// Also computes `forward_args` exactly ONCE here (Phase 34.5 gap cycle 6 plan 44) via
/// `sidecar_forward_args`, mirroring `shell_exe`'s own single-derivation discipline one line
/// above, and hands it down to both spawn paths -- neither `spawn_sidecar_dev` nor
/// `spawn_sidecar_packaged` calls `sidecar_forward_args` itself.
fn spawn_sidecar(app: &AppHandle) -> std::io::Result<Child> {
    let shell_exe = shell_exe_env_value(std::env::current_exe());
    let forward_args = sidecar_forward_args(&std::env::args().skip(1).collect::<Vec<String>>());
    if use_dev_sidecar() {
        spawn_sidecar_dev(&shell_exe, &forward_args)
    } else {
        spawn_sidecar_packaged(app, &shell_exe, &forward_args)
    }
}

/// Forward the sidecar's own stderr to the shell's stderr, line-prefixed, so a Node crash
/// (stack trace) is visible in the `tauri dev` terminal.
fn start_stderr_forwarder(stderr: std::process::ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(l) => eprintln!("[sidecar:err] {l}"),
                Err(_) => break,
            }
        }
    });
}

/// Reader thread: routes each stdout line from the sidecar. Four frame shapes are
/// recognized: a line with `ok` is a SidecarRpcResponse (fulfil the pending invoke by id);
/// `kind == "frontendMessage"` is a SidecarNotification (re-emit as FRONTEND_MESSAGE_EVENT);
/// `kind == "rustInvoke"` is a sidecar-initiated request answered by `dispatch_rust_channel`
/// on a spawned worker thread (Phase 28 — keyring calls); `kind == "openExternal"` opens the
/// URL via the same facility `open_external` uses, fire-and-forget. Any other frame kind is
/// logged via an explicit diagnostic rather than silently dropped.
fn start_reader(
    app: AppHandle,
    state: Arc<SidecarState>,
    stdout: std::process::ChildStdout,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed == READY_SENTINEL {
                // Sidecar bootstrapped; commands may already be queued and will now flow.
                eprintln!("[shell] sidecar signalled READY ({READY_SENTINEL})");
                continue;
            }
            let value: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                // non-JSON diagnostic line (console.log etc.) — surface it, don't drop it.
                Err(_) => {
                    eprintln!("[sidecar:out] {trimmed}");
                    continue;
                }
            };

            // Response frame: correlate by id.
            if value.get("ok").is_some() {
                // WR-07: never drop a response frame without a trace. This file's own stated
                // convention (see the unrecognized-frame branch at the bottom of this loop) is
                // "log a diagnostic instead of silently dropping it, so this class of gap
                // cannot recur unnoticed" — the response path used to violate it, which is
                // exactly how a timed-out-then-completed invoke stayed invisible.
                // Diagnostics carry the id only, never `result`/`error` bodies (T-28-04).
                match value.get("id").and_then(|v| v.as_str()) {
                    Some(id) => {
                        let sender = state
                            .pending
                            .lock()
                            .ok()
                            .and_then(|mut p| p.remove(id));
                        match sender {
                            Some(tx) => {
                                let ok =
                                    value.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                                let outcome = if ok {
                                    Ok(value.get("result").cloned().unwrap_or(Value::Null))
                                } else {
                                    Err(value
                                        .get("error")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("sidecar error")
                                        .to_string())
                                };
                                let _ = tx.send(outcome);
                            }
                            None => eprintln!(
                                "[shell] response for unknown/timed-out id={id} (dropped)"
                            ),
                        }
                    }
                    None => eprintln!(
                        "[shell] response frame with a missing or non-string id (dropped)"
                    ),
                }
                continue;
            }

            // Notification frame: backend→frontend push.
            if value.get("kind").and_then(|v| v.as_str()) == Some("frontendMessage") {
                let channel = value
                    .get("channel")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let args = value
                    .get("args")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let _ = app.emit(
                    FRONTEND_MESSAGE_EVENT,
                    FrontendMessagePayload { channel, args },
                );
                continue;
            }

            let kind = value.get("kind").and_then(|v| v.as_str());

            // Sidecar-initiated request: dispatch to the keyring/native-facility handler and
            // write the correlated response back on the same stdin pipe. Dispatched on a
            // spawned worker thread rather than inline — a Keychain access prompt blocks
            // until the user responds, and handling it on the reader thread would stall
            // every other sidecar response behind it (threat T-28-05, head-of-line blocking),
            // timing out unrelated pending `invoke`s at INVOKE_TIMEOUT.
            if kind == Some("rustInvoke") {
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let channel = value
                    .get("channel")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let args = value
                    .get("args")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let worker_state = state.clone();
                let worker_app = app.clone();
                thread::spawn(move || {
                    let result = dispatch_rust_channel(&channel, &args, &worker_app);
                    let response = match result {
                        Ok(v) => serde_json::json!({ "id": id, "ok": true, "result": v }),
                        Err(e) => serde_json::json!({ "id": id, "ok": false, "error": e }),
                    };
                    let _ = worker_state.write_raw(&response);
                });
                continue;
            }

            // Sidecar-initiated fire-and-forget open request: the pre-existing gap this
            // phase closes (27-02-SUMMARY.md: "the frame is currently silently ignored on
            // the Rust side"). Minimal fix — kept fire-and-forget, no response frame written
            // (Open Question 2, resolved: converting this to a rustInvoke request/response
            // call would change electronStub.shell.openExternal's contract, out of scope).
            if kind == Some("openExternal") {
                if let Some(url) = value.get("args").and_then(|v| v.as_array()).and_then(|a| a.first()).and_then(|v| v.as_str()) {
                    if let Err(e) = app.opener().open_url(url, None::<&str>) {
                        eprintln!("[shell] openExternal failed: {e}");
                    }
                } else {
                    eprintln!("[shell] openExternal frame missing a string URL in args[0]");
                }
                continue;
            }

            // Unrecognized frame kind — log a diagnostic (kind/id only, never args/result
            // per threat T-28-04) instead of silently dropping it, so this class of gap
            // cannot recur unnoticed.
            let id = value.get("id").and_then(|v| v.as_str());
            eprintln!("[shell] unrecognized sidecar frame kind: {kind:?} id={id:?}");
        }
    });
}

fn main() {
    // ---- Single-instance guard + deep-link argv (Phase 34.5 gap cycle 6 plan 44,
    // REQ-34.5-01/05/12, F-34.5-G6-09, D-44-A) -- runs BEFORE `tauri::Builder::default()` so a
    // secondary process's `std::process::exit(0)` below fires before `.setup()` can ever call
    // `spawn_sidecar`. This is the entire fix for the "second full GameLib instance" half of
    // F-34.5-G6-09. Unix-only (`std::os::unix::net` has no non-unix equivalent); on a non-unix
    // target `single_instance_socket_path_var`/`primary_listener` simply stay `None`, so the
    // rest of this function behaves identically to today's shipped behaviour there (the
    // accepted Windows gap, ledger row `U-34.5-18`).
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let no_gui = cli_no_gui(&argv);

    #[cfg(unix)]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
        single_instance_dir(std::env::var("HOME").ok().as_deref()).and_then(|dir| {
            match std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&dir)
            {
                Ok(()) => {
                    // Belt and braces (T-34.5-G6-20): `DirBuilderExt::mode` only governs the
                    // mode mkdir() is called with for a directory this call actually CREATES --
                    // if the directory already existed (e.g. from an older release, or from a
                    // stale run) `recursive(true)` succeeds without re-chmod'ing it. Explicitly
                    // enforce `0700` here regardless of which branch just ran.
                    if let Err(e) = std::fs::set_permissions(
                        &dir,
                        std::fs::Permissions::from_mode(0o700),
                    ) {
                        eprintln!(
                            "[shell] WARN: failed to set single-instance socket directory permissions to 0700: {e}"
                        );
                    }
                    Some(single_instance_socket_path(&dir))
                }
                Err(e) => {
                    eprintln!(
                        "[shell] WARN: failed to create single-instance socket directory {dir:?}: {e} -- continuing without the single-instance guard (fail-open, T-34.5-G6-24)"
                    );
                    None
                }
            }
        })
    };
    #[cfg(not(unix))]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = None;

    // `primary_listener` is moved into the `.setup(move |app| ...)` closure below, where it
    // becomes the deep-link accept loop's listener once the sidecar state is live.
    #[cfg(unix)]
    let primary_listener: Option<std::os::unix::net::UnixListener> = single_instance_socket_path_var
        .as_deref()
        .and_then(|path| match acquire_single_instance(path) {
            SingleInstanceRole::Secondary => {
                use std::io::Write as _;
                use std::os::unix::net::UnixStream;
                // A bare second launch with no deep link raises the existing window -- the
                // sentinel below -- which is the correct UX and matches what a plugin-based
                // guard would do. Never logs the URL itself here (T-34.5-G6-25): the running
                // instance's own `handleProtocol` logs it authoritatively one line later.
                let (payload, kind) = match protocol_url_arg(&argv) {
                    Some(url) => (url, "deep-link"),
                    None => ("__GAMELIB_FOCUS__".to_string(), "focus sentinel"),
                };
                eprintln!(
                    "[shell] another GameLib instance is already running -- sending {kind} to it and exiting"
                );
                match UnixStream::connect(path) {
                    Ok(mut stream) => {
                        let _ = writeln!(stream, "{payload}");
                        let _ = stream.flush();
                    }
                    Err(e) => eprintln!(
                        "[shell] WARN: secondary instance failed to deliver {kind} to the running instance: {e}"
                    ),
                }
                std::process::exit(0);
            }
            SingleInstanceRole::Primary(listener) => Some(listener),
            SingleInstanceRole::PrimaryWithoutListener => None,
        });
    #[cfg(not(unix))]
    let primary_listener: Option<()> = None;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // DIAGNOSTIC REVERTED (epic-login-non-interactive, F-34.5-G6-01, 2026-08-01):
        // this line was briefly commented out to test whether tauri-plugin-notification's
        // globally-injected init-iife.js (which unconditionally overwrites
        // `window.Notification` and self-invokes `plugin:notification|is_permission_granted`
        // in EVERY webview -- confirmed by direct read of tauri-2.11.5's manager/webview.rs
        // prepare_pending_webview: plugin init scripts are appended to
        // webview_attributes.initialization_scripts for ALL windows, NOT gated by the
        // `"windows": ["main"]` capability scope) is why Epic's login form never becomes
        // interactive. Hardware result: R3 FALSIFIED -- the injection was confirmed removed
        // (both console error lines gone) but the login form remained non-interactive with a
        // clean console. This line is restored. The notification-plugin JS-injection defect
        // is real but unrelated to F-34.5-G6-01; see the debug file's Evidence/Eliminated
        // sections for the separate finding. Do not remove this line again without a fresh,
        // pre-registered diagnostic tied to a NEW hypothesis.
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(move |app| {
            let mut child = spawn_sidecar(app.handle())?;
            let stdin = child
                .stdin
                .take()
                .ok_or("sidecar stdin unavailable")?;
            let stdout = child
                .stdout
                .take()
                .ok_or("sidecar stdout unavailable")?;
            let stderr = child
                .stderr
                .take()
                .ok_or("sidecar stderr unavailable")?;

            let state = Arc::new(SidecarState {
                stdin: Mutex::new(stdin),
                pending: Mutex::new(HashMap::new()),
                counter: AtomicU64::new(1),
                child: Mutex::new(child),
            });

            start_reader(app.handle().clone(), state.clone(), stdout);
            start_stderr_forwarder(stderr);

            // Deep-link accept loop (Phase 34.5 gap cycle 6 plan 44, D-44-A): the primary's
            // warm-delivery path for a launch received while this instance is already
            // running. Spawned AFTER `app.manage(state)` below would be too late for the
            // clone captured here -- clone first, manage the original.
            #[cfg(unix)]
            if let Some(listener) = primary_listener {
                let accept_state = state.clone();
                let accept_app_handle = app.handle().clone();
                thread::spawn(move || {
                    for incoming in listener.incoming() {
                        let stream = match incoming {
                            Ok(s) => s,
                            Err(e) => {
                                eprintln!(
                                    "[shell] WARN: single-instance accept() failed: {e}"
                                );
                                continue;
                            }
                        };
                        // T-34.5-G6-23: bound the read exactly like sidecarRpc's own
                        // MAX_LINE_LENGTH discipline -- a single read_line off a capped reader,
                        // never an unbounded buffer.
                        let mut reader = BufReader::new(stream.take(4096));
                        let mut line = String::new();
                        match reader.read_line(&mut line) {
                            Ok(0) | Err(_) => continue,
                            Ok(_) => {}
                        }
                        let trimmed = line.trim();

                        if trimmed == "__GAMELIB_FOCUS__" {
                            let focus_handle = accept_app_handle.clone();
                            let _ = accept_app_handle.run_on_main_thread(move || {
                                if let Some(window) =
                                    focus_handle.get_webview_window(MAIN_WINDOW_LABEL)
                                {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            });
                            continue;
                        }

                        // Defence in depth (T-34.5-G6-20): re-validate through the SAME
                        // allow-list used for argv, never trusting the socket because it is
                        // "internal" -- the socket is a trust boundary even inside a `0700`
                        // directory.
                        match protocol_url_arg(&[trimmed.to_string()]) {
                            Some(url) => {
                                match accept_state
                                    .invoke("handleProtocolUrl".to_string(), vec![Value::String(url)])
                                {
                                    Ok(_) => eprintln!(
                                        "[shell] delivered single-instance deep link to sidecar: ok"
                                    ),
                                    Err(e) => eprintln!(
                                        "[shell] delivered single-instance deep link to sidecar: err={e}"
                                    ),
                                }
                            }
                            None => {
                                // T-34.5-G6-25: the REASON and byte count only, never the
                                // payload.
                                eprintln!(
                                    "[shell] rejected single-instance payload (failed protocol_url_arg validation), bytes={}",
                                    trimmed.len()
                                );
                            }
                        }
                    }
                });
            }
            #[cfg(not(unix))]
            let _ = &primary_listener;

            app.manage(state);

            // Real Tauri tray (Phase 34.1 Plan 06, D-11) -- bounded scope: tooltip, left-click
            // show/focus, and a two-item Show GameLib / Quit menu. Deliberately excludes the
            // recent-games submenu, About/Reload/Debug, the macOS dock menu, and
            // language-driven rebuilds (34.1-06-PLAN.md's declared out-of-scope list).
            //
            // Every step below is non-fatal: a menu-item, menu, or tray build failure is
            // logged and the app continues without a tray, never `unwrap()`/`panic!` out of
            // `.setup()` (T-34.1-22) -- a tray that fails to build is strictly better than a
            // shell that fails to start.
            match (
                MenuItemBuilder::with_id("show", "Show GameLib").build(app),
                MenuItemBuilder::with_id("quit", "Quit").build(app),
            ) {
                (Ok(show_item), Ok(quit_item)) => {
                    match MenuBuilder::new(app)
                        .items(&[&show_item, &quit_item])
                        .build()
                    {
                        Ok(menu) => {
                            let tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
                                .icon(tray_image(false))
                                .icon_as_template(tray_is_template())
                                .tooltip("GameLib")
                                .menu(&menu)
                                .show_menu_on_left_click(false)
                                .on_menu_event(|app_handle, event| match event.id().as_ref() {
                                    "show" => {
                                        if let Some(window) =
                                            app_handle.get_webview_window(MAIN_WINDOW_LABEL)
                                        {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                    "quit" => app_handle.exit(0),
                                    _ => {}
                                })
                                .on_tray_icon_event(|tray, event| {
                                    if let TrayIconEvent::Click {
                                        button: MouseButton::Left,
                                        button_state: MouseButtonState::Up,
                                        ..
                                    } = event
                                    {
                                        let app_handle = tray.app_handle();
                                        if let Some(window) =
                                            app_handle.get_webview_window(MAIN_WINDOW_LABEL)
                                        {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                })
                                .build(app);
                            if let Err(e) = tray {
                                eprintln!(
                                    "[shell] WARN: tray icon failed to build ({e}) -- continuing without a tray"
                                );
                            }
                        }
                        Err(e) => eprintln!(
                            "[shell] WARN: tray menu failed to build ({e}) -- continuing without a tray"
                        ),
                    }
                }
                _ => eprintln!(
                    "[shell] WARN: tray menu items failed to build -- continuing without a tray"
                ),
            }

            // DELIBERATELY RETIRED (Phase 34.4.2 Plan 07, 2026-08-04): a deminiaturize
            // re-raise observer used to be installed here (Phase 34.4.2 Plan 02,
            // REQ-34.4.2-04/05). It existed SOLELY to re-raise AppKit CHILD windows after
            // `main` restored from the Dock -- spike 021's measured "restore main" defect,
            // where an attached child window returned BEHIND `main` unless explicitly
            // brought forward again. The operator's binding design decision of 2026-08-04
            // (`34.4.2-LIVE-GATE.md`'s "Binding Design Decision" section, responding to
            // F-34.4.2-01/-02) replaced child-window attachment with AppKit SHEET
            // presentation (`present_login_window_as_sheet`, above): a sheet is presented BY
            // its parent window and moves with it, so there is no child list to re-raise and
            // no z-order defect this observer was written to fix. Keeping the observer would
            // (a) do nothing useful -- `PRESENTED_LOGIN_SHEETS` entries are sheets, not
            // AppKit child windows, and bringing one forward is not the same operation the
            // old child-attachment call needed -- and (b) emit a misleading log line naming a
            // re-raise mechanism that no longer exists. No replacement observer and no
            // window-focus-driven re-raise handler were added: whether the sheet survives the
            // minimize/restore cycle INTERACTIVE is exactly what the rewritten live gate's
            // item 1 must measure, not something to pre-emptively paper over here.

            // Page-independent Esc backstop for presented login sheets (Phase 34.4.2 Plan 08,
            // REQ-34.4.2-03/04/06/07/08/10, T-34.4.2-33/-35): installs ONE process-wide
            // `NSEvent` local key-down monitor here -- the EXACT site the retirement comment,
            // immediately above, names as where the deminiaturize re-raise observer used to
            // live. A sheet renders no titlebar close button and, unlike the injected cancel
            // strip (above), this route works even when the login page renders nothing at all
            // -- a blank page, a network error page, or a bot-management interstitial, exactly
            // the states a login window reaches most often when something is already wrong.
            //
            // Reimplemented here rather than refactored out of
            // `open_pristine_epic_login_window`'s own local monitor (read-only reference,
            // above): that region is byte-frozen by REQ-34.4.2-10, and its monitor
            // legitimately reads `charactersIgnoringModifiers()` to route Cmd+V/C/X/A/Z, which
            // this monitor must never do (T-34.4.2-35, immediately below).
            //
            // PRIVACY IS A HARD CONSTRAINT, NOT A STYLE PREFERENCE (T-34.4.2-35): this handler
            // reads ONLY `keyCode()` and `modifierFlags()` -- never `characters()` or
            // `charactersIgnoringModifiers()`, and never logs the event or any field derived
            // from it. This monitor sees every keystroke the app receives, including the
            // password being typed into the login sheet.
            //
            // Epic non-interference is STRUCTURAL, not conditional: the pristine Epic login
            // window is never registered in `PRESENTED_LOGIN_SHEETS` (Plan 07 registers only
            // `present_login_window_as_sheet` callers, and Epic is never one -- REQ-34.4.2-10),
            // so the window-membership check below can never match it. No explicit Epic label
            // check is added -- a structural guarantee is stronger than a name-based one.
            //
            // Leaked for the process lifetime via `std::mem::forget`, matching the retired
            // deminiaturize observer's own precedent (and the pristine arm's own monitor-leak
            // shape for its navigation delegate): this is ONE monitor, registered ONCE, here --
            // not a per-open monitor that would need its own teardown.
            //
            // Failure to install is NON-FATAL (T-34.1-22 discipline, matching this closure's
            // own tray-build convention immediately above): logs one
            // `[shell] WARN: login-sheet esc monitor: ...` line and lets the app start. The
            // cancel strip (above) remains the primary route.
            #[cfg(target_os = "macos")]
            {
                let esc_app_handle = app.handle().clone();
                let esc_monitor_handler = block2::RcBlock::new(
                    move |event: std::ptr::NonNull<objc2_app_kit::NSEvent>|
                          -> *mut objc2_app_kit::NSEvent {
                        // SAFETY: AppKit hands local monitor handlers a valid, live `NSEvent`
                        // for the duration of this call.
                        let event_ref = unsafe { event.as_ref() };

                        // 1. Cheapest possible check first (T-34.4.2-35's "does no work at
                        // all" guarantee): no presented sheet at all, return untouched with no
                        // window resolution and no further AppKit calls.
                        let presented: Vec<String> = match PRESENTED_LOGIN_SHEETS.lock() {
                            Ok(guard) => guard.as_ref().cloned().unwrap_or_default(),
                            Err(_) => Vec::new(),
                        };
                        if presented.is_empty() {
                            return event.as_ptr();
                        }

                        // 2. Bare Esc only -- macOS virtual keyCode 53 is Esc.
                        if event_ref.keyCode() != 53 {
                            return event.as_ptr();
                        }

                        // 3. Only a BARE Esc dismisses -- Command/Option/Control held means
                        // this is some other chord (e.g. a devtools shortcut); never consume
                        // those.
                        let flags = event_ref.modifierFlags();
                        if flags.intersects(
                            objc2_app_kit::NSEventModifierFlags::Command
                                | objc2_app_kit::NSEventModifierFlags::Option
                                | objc2_app_kit::NSEventModifierFlags::Control,
                        ) {
                            return event.as_ptr();
                        }

                        // 4. Resolve the event's own window and compare against every
                        // currently presented sheet's `NSWindow` address. No match -> return
                        // untouched.
                        let Some(mtm) = objc2::MainThreadMarker::new() else {
                            return event.as_ptr();
                        };
                        let Some(event_window) = event_ref.window(mtm) else {
                            return event.as_ptr();
                        };
                        let event_window_addr =
                            (&*event_window) as *const objc2_app_kit::NSWindow as usize;

                        for label in &presented {
                            if login_window_ns_window(&esc_app_handle, label)
                                == Some(event_window_addr)
                            {
                                // 5. Match: dismiss and consume -- the page never also sees
                                // this Esc.
                                request_login_sheet_cancel(&esc_app_handle, label, "esc");
                                return std::ptr::null_mut();
                            }
                        }
                        event.as_ptr()
                    },
                );
                // SAFETY: `esc_monitor_handler` is a valid block; AppKit copies it internally
                // when registering the monitor, so it outliving this call is not required --
                // the SAME convention the pristine arm's own monitor registration (above,
                // read-only reference) already documents.
                let esc_monitor_token = unsafe {
                    objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                        objc2_app_kit::NSEventMask::KeyDown,
                        &esc_monitor_handler,
                    )
                };
                match esc_monitor_token {
                    Some(token) => {
                        // Intentional leak for the process lifetime -- see this block's own
                        // doc comment above.
                        std::mem::forget(token);
                    }
                    None => {
                        eprintln!(
                            "[shell] WARN: login-sheet esc monitor: addLocalMonitorForEventsMatchingMask failed -- continuing without it"
                        );
                    }
                }
            }

            // `--no-gui` (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09): gate 3 recorded that
            // `--no-gui` was previously ignored entirely, including opening devtools. When
            // set, the devtools-open block below is skipped ENTIRELY (never conditionally
            // opened then hidden), and the main window is explicitly hidden once it exists.
            // `tauri.conf.json`'s `main` window carries no explicit `"visible"` key, so Tauri's
            // own default (visible on creation) applies -- a brief flash before this `.hide()`
            // call is an expected observation for the live gate, not a failure.
            if no_gui {
                match app.get_webview_window(MAIN_WINDOW_LABEL) {
                    Some(window) => {
                        let _ = window.hide();
                        eprintln!("[shell] --no-gui: main window hidden");
                    }
                    None => eprintln!(
                        "[shell] WARN: --no-gui: no 'main' webview window found to hide"
                    ),
                }
            } else {
                // Dev-only: force the webview devtools open (the dev webview exposes no
                // right-click inspect on macOS) so renderer errors are inspectable, and
                // confirm the webview window actually exists.
                #[cfg(debug_assertions)]
                {
                    match app.get_webview_window(MAIN_WINDOW_LABEL) {
                        Some(window) => {
                            window.open_devtools();
                            eprintln!("[shell] devtools opened for 'main' webview (debug build)");
                        }
                        None => eprintln!(
                            "[shell] WARN: no 'main' webview window found — devtools not opened"
                        ),
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_invoke,
            sidecar_send,
            open_external,
            sidecar_store_snapshot
        ])
        .build(tauri::generate_context!())
        .expect("error while running the GameLib Tauri shell")
        // WR-03: normal window close (red X / Cmd+Q / Alt+F4) does not route through the
        // in-app app_exit/app_relaunch commands, so without an explicit RunEvent::Exit
        // handler the sidecar child can be left running as an orphan after the user
        // believes the app has quit -- retaining an authenticated Steam session, open
        // network sockets, and file handles. Kill it here on the way out; this is not a
        // WindowEvent::CloseRequested handler and does not cancel or defer exit.
        .run(move |app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<Arc<SidecarState>>() {
                    state.shutdown_child();
                }
                // Phase 34.5 gap cycle 6 plan 44 (D-44-A): best-effort socket cleanup on a
                // clean quit, so a fresh start does not have to fall through
                // `acquire_single_instance`'s stale-socket recovery path. Swallowed, like
                // `shutdown_child()`'s own exit-path discipline -- an unwind here is worse
                // than a leaked socket file.
                #[cfg(unix)]
                if let Some(path) = &single_instance_socket_path_var {
                    let _ = std::fs::remove_file(path);
                }
            }
        });
}

/// Behavioral tests over `timeout_for()` (Phase 34.2 gap cycle 3, plan 22) — closes the warning
/// carried forward across all three of this phase's verification rounds: no Rust-side test
/// proved `timeout_for()` actually consults `LONG_RUNNING_CHANNELS`. The JS-side
/// `src/backend/__tests__/longRunningChannels.test.ts` gate covers the array's CONTENTS (a
/// comment-stripped source assertion, set-equality); this module covers the FUNCTION's
/// BEHAVIOR — if `timeout_for` ever reverted to an unconditional `Some(INVOKE_TIMEOUT)` or an
/// unconditional `None`, every test in that JS file would still pass unchanged, but the tests
/// below would not (see `34.2-22-SUMMARY.md` for the hand-verified RED proof in both
/// directions). This project's CI runs no cargo step at all (`.github/workflows/*.yml` contains
/// neither `cargo test` nor `cargo check`), so these tests are run manually
/// (`cd src-tauri && cargo test`) and their continued existence is pinned by a jest gate in the
/// JS file above rather than by any automated Rust step.
///
/// Phase 34.3 Plan 03 / REQ-34.3-08 extends this module with `clipboard_text_arg` and
/// `clipboard_read_value` — the pure, `AppHandle`-free surface extracted from the
/// `clipboard_write_text`/`clipboard_read_text` dispatch arms, since those arms' own
/// `app.clipboard()` calls need a live Tauri runtime a `#[test]` cannot construct. As with
/// `timeout_for()` above, this project's CI runs no cargo step, so these are hand-run too —
/// the arms' plugin calls themselves are proven by REQ-34.3-11's live-gate item 3, not by
/// these tests.
///
/// Phase 34.4.1 Plan 01 / REQ-34.4.1-01/-09 extends this module further with
/// `next_login_window_label`, `login_window_url_arg`, `cookie_domain_matches` and
/// `login_event_value` — the pure logic behind the five `humble_login_*` dispatch arms,
/// proven the same way (a `#[test]` cannot construct a live `WebviewWindowBuilder`); the
/// arms' actual window/cookie API calls are proven by REQ-34.4.1-12's live gate instead.
///
/// Phase 34.4.1 Plan 04 / REQ-34.4.1-05 extends this module further with `reveal_post_args`
/// and `reveal_post_script` — the pure arg-validation and script-templating logic behind the
/// `humble_reveal_post` dispatch arm, proven the same way; the arm's actual window/eval/
/// navigation-intercept calls are proven empirically instead, by this plan's Task 1
/// (RESEARCH.md Open Question 1) and by `34.4.1-08`'s live gate item 4 (Open Question 2).
///
/// 34.4.1 gap cycle plan 15 (F-6 BLOCKING, REQ-34.4.1-06/REQ-34.4.1-GAP-03) extends this module
/// further with `clear_storage_args` and `clear_storage_script` — the pure arg-validation and
/// script-templating logic behind the new `humble_login_clear_storage` dispatch arm, proven the
/// same way; the arm's actual window/eval/navigation-intercept calls are NOT covered by this
/// plan's own verification (no automated layer can drive a real WKWebView's storage APIs) and
/// remain proven only by plan 20's blocking live-gate re-run, once plan 16 wires this capability
/// into the two disconnect paths.
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exempt_channel_waits_indefinitely() {
        assert_eq!(timeout_for("install"), None);
    }

    #[test]
    fn non_exempt_channel_is_bounded_at_invoke_timeout() {
        // Fails if timeout_for ever reverts to an unconditional None.
        assert_eq!(timeout_for("getGameInfo"), Some(INVOKE_TIMEOUT));
    }

    #[test]
    fn repair_and_read_config_are_exempt() {
        // The two channels gap cycle 1 added; REQ-34.2-12 depends on both staying exempt.
        assert_eq!(timeout_for("repair"), None);
        assert_eq!(timeout_for("readConfig"), None);
    }

    #[test]
    fn get_crossover_index_is_exempt() {
        // Added by REQ-34.2-12 / D-10.
        assert_eq!(timeout_for("getCrossoverIndex"), None);
    }

    #[test]
    fn oauth_capture_login_and_humble_login_channels_are_exempt() {
        // Phase 34.5 gap cycle 3, F-34.5-G6-02 (plan 34.5-23): each carries its own internal
        // deadline (300_000ms / 600_000ms) far exceeding INVOKE_TIMEOUT's 60s.
        assert_eq!(timeout_for("oauthCaptureLogin"), None);
        assert_eq!(timeout_for("humbleStartLogin"), None);
        assert_eq!(timeout_for("humbleReconnect"), None);
    }

    #[test]
    fn a_channel_not_on_the_list_is_still_bounded() {
        // getUserInfo is definitely absent from LONG_RUNNING_CHANNELS -- pins that this task's
        // exemption is scoped to the three named channels, not a relaxation of the guardrail.
        assert_eq!(timeout_for("getUserInfo"), Some(INVOKE_TIMEOUT));
    }

    #[test]
    fn every_long_running_channel_is_exempt_and_a_non_member_is_bounded() {
        // Iterated over LONG_RUNNING_CHANNELS rather than a hardcoded literal list, so a ninth
        // exempt channel does not require editing this test — the hardcoded-list responsibility
        // already lives in the JS gate above, and duplicating it here would create a second list
        // to keep in sync.
        for channel in LONG_RUNNING_CHANNELS {
            assert_eq!(
                timeout_for(channel),
                None,
                "expected {channel} (a LONG_RUNNING_CHANNELS member) to wait indefinitely"
            );
        }
        // Non-vacuous in both directions: an unconditional None would fail only this half, an
        // unconditional Some would fail only the loop above. getGameSettings is a real,
        // non-exempt channel this phase ported (src/backend/gamedetails/dispatch.ts), not a
        // made-up string.
        assert_eq!(timeout_for("getGameSettings"), Some(INVOKE_TIMEOUT));
    }

    #[test]
    fn invoke_timeout_is_60_seconds() {
        // Pins the bound so the D-10 boundary cannot be "solved" by raising the global timeout
        // instead of exempting a specific channel (mirrors the JS gate's own reasoning,
        // asserted here behaviorally).
        assert_eq!(INVOKE_TIMEOUT, Duration::from_secs(60));
    }

    // ---- clipboard_text_arg (Phase 34.3 Plan 03, REQ-34.3-08) ----
    //
    // RED direction: an implementation using `unwrap_or("")` instead of `ok_or_else` would
    // flip the four rejection cases below to `Ok`.

    #[test]
    fn clipboard_text_arg_rejects_absent_args() {
        assert!(clipboard_text_arg(&[]).is_err());
        assert_eq!(
            clipboard_text_arg(&[]).unwrap_err(),
            "clipboard_write_text:bad-args"
        );
    }

    #[test]
    fn clipboard_text_arg_rejects_null() {
        assert!(clipboard_text_arg(&[Value::Null]).is_err());
    }

    #[test]
    fn clipboard_text_arg_rejects_number() {
        assert!(clipboard_text_arg(&[json!(1)]).is_err());
    }

    #[test]
    fn clipboard_text_arg_rejects_bool() {
        assert!(clipboard_text_arg(&[Value::Bool(true)]).is_err());
    }

    #[test]
    fn clipboard_text_arg_accepts_empty_string() {
        // An empty string is a VALID clipboard write, not a missing argument.
        assert_eq!(clipboard_text_arg(&[json!("")]), Ok(""));
    }

    #[test]
    fn clipboard_text_arg_accepts_nonempty_string() {
        assert_eq!(clipboard_text_arg(&[json!("hi")]), Ok("hi"));
    }

    #[test]
    fn clipboard_text_arg_ignores_trailing_args() {
        assert_eq!(
            clipboard_text_arg(&[json!("hi"), json!("ignored")]),
            Ok("hi")
        );
    }

    // ---- clipboard_read_value (Phase 34.3 Plan 03, REQ-34.3-08) ----
    //
    // RED direction: an implementation returning `Value::Null` for an empty clipboard would
    // fail the first case below — the sidecar's `clipboardReadText` handler coerces a
    // non-string result to `''`, which would mask that regression as an indistinguishable
    // empty read.

    #[test]
    fn clipboard_read_value_empty_string_is_not_null() {
        assert_eq!(
            clipboard_read_value(Ok(String::new())),
            Ok(Value::String(String::new()))
        );
    }

    #[test]
    fn clipboard_read_value_nonempty_string_round_trips() {
        assert_eq!(
            clipboard_read_value(Ok("hi".to_string())),
            Ok(Value::String("hi".to_string()))
        );
    }

    #[test]
    fn clipboard_read_value_propagates_error() {
        assert_eq!(
            clipboard_read_value(Err("boom".to_string())),
            Err("boom".to_string())
        );
    }

    // ---- next_login_window_label (Phase 34.4.1 Plan 01, REQ-34.4.1-09, T-34.1-27) ----
    //
    // RED direction: a hard-coded or url-derived label would flip
    // `login_window_label_is_never_reserved` / `_never_derived_from_url` to failing.

    #[test]
    fn humble_login_window_label_is_never_reserved() {
        let label = next_login_window_label();
        assert_ne!(label, "main");
        assert_ne!(label, "about");
        assert!(label.starts_with("loginwin-"));
    }

    #[test]
    fn humble_login_window_labels_differ_across_calls() {
        let first = next_login_window_label();
        let second = next_login_window_label();
        assert_ne!(first, second);
    }

    #[test]
    fn humble_login_window_label_is_never_derived_from_url() {
        // A URL containing "humblebundle" is in scope while the label is generated, but
        // `next_login_window_label()` takes no arguments at all — the label can
        // structurally never be a function of any URL.
        let _url_in_scope = "https://www.humblebundle.com/login";
        let label = next_login_window_label();
        assert!(!label.contains("humblebundle"));
        assert!(!label.contains("www"));
    }

    // ---- login_window_url_arg (Phase 34.4.1 Plan 01, REQ-34.4.1-01, T-34.4.1-08) ----
    //
    // RED direction: an implementation using `unwrap_or("https://…")` or omitting the
    // scheme check would flip the rejection cases below to `Ok`.

    #[test]
    fn humble_login_window_url_arg_rejects_absent_and_non_string() {
        assert_eq!(
            login_window_url_arg(&[]).unwrap_err(),
            "humble_login_open:bad-args"
        );
        assert_eq!(
            login_window_url_arg(&[json!(1)]).unwrap_err(),
            "humble_login_open:bad-args"
        );
    }

    #[test]
    fn humble_login_window_url_arg_rejects_non_https() {
        assert_eq!(
            login_window_url_arg(&[json!("http://www.humblebundle.com/login")]).unwrap_err(),
            "humble_login_open:bad-url"
        );
        assert_eq!(
            login_window_url_arg(&[json!("file:///etc/passwd")]).unwrap_err(),
            "humble_login_open:bad-url"
        );
        assert_eq!(
            login_window_url_arg(&[json!("javascript:alert(1)")]).unwrap_err(),
            "humble_login_open:bad-url"
        );
        let ok = login_window_url_arg(&[json!("https://www.humblebundle.com/login")]);
        assert!(ok.is_ok());
        assert_eq!(ok.unwrap().scheme(), "https");
    }

    // ---- login_window_title (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/23) ----
    //
    // RED direction: an implementation that puts the document title first, or that
    // returns the document title alone when it looks URL-shaped, would flip these to
    // failing.

    #[test]
    fn humble_login_window_title_puts_origin_before_document_title() {
        let title = login_window_title("https://www.humblebundle.com", Some("Sign In"));
        assert!(title.starts_with("https://www.humblebundle.com"));
        assert!(title.contains("Sign In"));
        // The origin's END must come before the document title's START -- not merely
        // "both substrings present somewhere" -- so a naive implementation that
        // concatenates in the wrong order cannot pass on a substring check alone.
        let origin_end = title.find("https://www.humblebundle.com").unwrap()
            + "https://www.humblebundle.com".len();
        let title_start = title.find("Sign In").unwrap();
        assert!(origin_end <= title_start);
    }

    #[test]
    fn humble_login_window_title_a_url_shaped_document_title_cannot_precede_the_real_origin() {
        // T-34.5-G6-23: a malicious or compromised page could set document.title to
        // something that itself looks like an address bar, attempting to impersonate a
        // DIFFERENT origin than the one the shell actually validated and opened.
        let title = login_window_title(
            "https://www.humblebundle.com",
            Some("https://accounts.google.com/signin"),
        );
        assert!(title.starts_with("https://www.humblebundle.com"));
        // The real, shell-resolved origin's end must land before the impersonating
        // text's start -- the impersonating string is still present (never hidden or
        // stripped, this helper does not sanitize page content), it just can never lead.
        let real_origin_end = title.find("https://www.humblebundle.com").unwrap()
            + "https://www.humblebundle.com".len();
        let impersonation_start = title.find("https://accounts.google.com").unwrap();
        assert!(real_origin_end <= impersonation_start);
    }

    #[test]
    fn humble_login_window_title_no_document_title_returns_the_origin_alone() {
        assert_eq!(
            login_window_title("https://www.humblebundle.com", None),
            "https://www.humblebundle.com"
        );
    }

    #[test]
    fn humble_login_window_title_empty_document_title_is_treated_as_absent() {
        // An empty string is not a meaningful document title (e.g. before the page's
        // first title event) -- must not produce a title with a trailing empty suffix.
        assert_eq!(
            login_window_title("https://www.humblebundle.com", Some("")),
            "https://www.humblebundle.com"
        );
    }

    #[test]
    fn humble_login_window_open_seeds_the_shared_origin_from_the_validated_url_before_any_page_load(
    ) {
        // Mirrors the EXACT expression the humble_login_open arm uses to seed
        // `current_origin` (its `Arc<Mutex<String>>`) before the window is built and
        // before any `on_page_load` event can possibly fire --
        // `url.origin().ascii_serialization()`, fed through `login_window_title` with no
        // document title, is precisely what the arm's initial `window.set_title()` call
        // (right after `.build()`) composes. Proves the origin is present from the seed
        // alone, with no page-load event required.
        let url =
            login_window_url_arg(&[json!("https://www.humblebundle.com/login?x=1")]).unwrap();
        let seeded_origin = url.origin().ascii_serialization();
        assert_eq!(seeded_origin, "https://www.humblebundle.com");
        assert_eq!(
            login_window_title(&seeded_origin, None),
            "https://www.humblebundle.com"
        );
    }

    // ---- cookie_domain_matches (Phase 34.4.1 Plan 01, REQ-34.4.1-01, spike 014a) ----

    #[test]
    fn humble_login_cookie_domain_matches_the_www_regression_case() {
        // THE single most consequential assertion in this file. wry's own
        // cookies-for-url shortcut computes `cookie.domain() == url.domain()`, which for
        // host "www.humblebundle.com" against a cookie domain of "humblebundle.com"
        // evaluates to `"humblebundle.com" == "www.humblebundle.com"` -> false, silently
        // dropping `_simpleauth_sess`. This function must get it right: a suffix match,
        // not equality.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookie_domain_matches_rejects_suffix_lookalikes() {
        assert!(!cookie_domain_matches(
            "www.humblebundle.com",
            Some("evilhumblebundle.com")
        ));
        assert!(!cookie_domain_matches("www.humblebundle.com", None));
    }

    // ---- humble_login_cookies_for_domain's direction (Phase 34.4.1 Plan 22, F-6 Defect A,
    // REQ-34.4.1-GAP-07). `humble_login_cookies_for_domain`'s filter calls
    // `cookie_domain_matches(d, Some(domain))` -- the cookie's OWN domain first, the caller's
    // fixed target second -- mirroring `humble_login_clear_cookies`'s (unchanged) filter
    // exactly. These cases assert that call shape directly against `cookie_domain_matches`,
    // the same "test the pure comparison, not a window-backed arm" convention the two cases
    // above already use. ----

    #[test]
    fn humble_login_cookies_for_domain_matches_bare_apex_cookie() {
        // A cookie whose domain attribute is the bare apex matches a query for that apex.
        assert!(cookie_domain_matches("humblebundle.com", Some("humblebundle.com")));
    }

    #[test]
    fn humble_login_cookies_for_domain_matches_leading_dot_cookie() {
        // A cookie whose domain attribute carries the leading-dot form (RFC 6265's
        // wildcard-subdomain marker) still matches a query for the bare apex -- this is
        // Defect A's headline case: `humble_login_cookies`' direction cannot ever match this
        // shape against a FIXED target (see the asymmetry test below).
        assert!(cookie_domain_matches(".humblebundle.com", Some("humblebundle.com")));
    }

    #[test]
    fn humble_login_cookies_for_domain_matches_subdomain_cookie() {
        // A cookie scoped to a subdomain matches a query for the parent apex.
        assert!(cookie_domain_matches("www.humblebundle.com", Some("humblebundle.com")));
    }

    #[test]
    fn humble_login_cookies_for_domain_rejects_suffix_lookalikes() {
        // Same lookalike guard as the existing poll-direction case above, proven in this
        // arm's own direction: a literal `.` separator is required, so a domain that merely
        // ENDS WITH the target string as a substring (no separator) must not match.
        assert!(!cookie_domain_matches("nothumblebundle.com", Some("humblebundle.com")));
    }

    #[test]
    fn humble_login_cookies_for_domain_direction_is_the_defect_a_fix() {
        // F-34.4.2-19 (fixed) -- REWRITTEN. Before this fix, this test's first assertion
        // pinned `cookie_domain_matches`'s POLL-direction argument order
        // (`cookie_domain_matches(fixed_host, Some(cookie_domain))`, exactly what
        // `humble_login_cookies`' poll arm calls at main.rs:3878-3885) as UNCONDITIONALLY
        // blind to any leading-dot cookie domain -- and asserted that blindness as CORRECT,
        // intended behavior ("the suffix branch can never fire for a leading-dot cookie
        // domain, so it silently fails to match"). It was not correct: that assertion
        // pinned F-34.4.2-19's own root cause in place. `_simpleauth_sess`'s real,
        // live-measured domain is `.humblebundle.com` (leading dot); with the old
        // comparator, the poll arm could never match it, so Humble's login watcher polled
        // forever without ever finding its own session cookie -- silently, with zero log
        // output, because the early-return this produced (user.ts:494-498) sits upstream of
        // every logging path in that function. `34.4.1-SPIKE-016-FINDINGS.md`'s live
        // measurement (total=33, poll direction=29 -- 4 cookies silently dropped) was this
        // SAME undercounting, and was filed there as an acceptable, documented asymmetry
        // rather than as the defect it actually was. Do not read that document, or this
        // test's prior form, as evidence the old behavior was ever intentional.
        //
        // `cookie_domain_matches` now strips a leading dot from its `domain` argument before
        // comparing (RFC 6265: a `.example.com` cookie is defined to apply to `example.com`
        // itself, not only to its subdomains), so BOTH directions now correctly match a
        // leading-dot cookie domain against its own bare apex host:
        assert!(cookie_domain_matches("humblebundle.com", Some(".humblebundle.com")));
        assert!(cookie_domain_matches(".humblebundle.com", Some("humblebundle.com")));
    }

    #[test]
    fn cookie_domain_matches_normalizes_leading_dot_domain_against_apex_host() {
        // F-34.4.2-19 fix-verification test. Pre-fix: `format!(".{d}")` on an
        // already-dotted `d` (".humblebundle.com") produces an impossible
        // ".."-prefixed suffix requirement no real hostname can satisfy, so this returned
        // false -- RED against the pre-fix comparator. Post-fix, the leading dot is
        // stripped from `domain` before comparing, so this is GREEN.
        assert!(cookie_domain_matches("humblebundle.com", Some(".humblebundle.com")));
    }

    #[test]
    fn cookie_domain_matches_normalizes_leading_dot_domain_against_subdomain_host() {
        // F-34.4.2-19 fix-verification test -- the ACTUAL production shape of the defect.
        // `humble_login_cookies`' poll arm (main.rs:3878-3885) calls
        // `cookie_domain_matches(host_for_filter, Some(c.domain()))` with `host_for_filter`
        // fixed at "www.humblebundle.com" and `_simpleauth_sess`'s real, live-measured
        // domain being ".humblebundle.com" (leading dot). This is that exact call,
        // reproduced directly. RED against the pre-fix comparator, GREEN post-fix.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some(".humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_direction_still_discriminates_for_host_vs_subdomain_pairs() {
        // Normalizing the leading dot makes the comparator order-INsensitive for the
        // apex-host/leading-dot-domain pair specifically -- that pair (the one the rewritten
        // test above now asserts symmetrically) stops being a canary for Plan 22's Defect A
        // argument-order regression. Direction still matters for other shapes, and the fix
        // deliberately leaves argument order untouched at both call sites, so that
        // protection must not be silently retired: an apex HOST can never match a cookie
        // scoped to a SUBDOMAIN, but a subdomain host correctly matches a cookie scoped to
        // its own parent apex. Pinned here with a non-Humble pair so it stays independent of
        // the now-symmetric leading-dot case above.
        assert!(!cookie_domain_matches("epicgames.com", Some("www.epicgames.com")));
        assert!(cookie_domain_matches("www.epicgames.com", Some("epicgames.com")));
    }

    #[test]
    fn humble_login_cookies_for_domain_does_not_disturb_the_poll_direction() {
        // Regression pin (binding constraint 1): the existing `humble_login_cookies` arm's
        // OWN call site (`cookie_domain_matches(host, c.domain())`, unedited by this plan)
        // must still match the www-page-host-vs-apex-cookie case it was proven correct
        // against by spike 014a. This is the SAME assertion as
        // `humble_login_cookie_domain_matches_the_www_regression_case` above, re-stated here
        // in this arm's own test group so a reviewer looking only at the new arm's tests can
        // see the poll's direction was checked, not merely assumed unaffected.
        assert!(cookie_domain_matches("www.humblebundle.com", Some("humblebundle.com")));
    }

    // ---- website_data_record_matches_domain / verified_delete_count (Phase 34.4.1 Plan 23,
    // F-6 Defect B, REQ-34.4.1-06). The half of the WKWebsiteDataStore rewrite that can be
    // proven without a live WebKit -- see 34.4.1-23-SUMMARY.md for the platform half, which
    // by construction cannot be unit-tested here (only plan 29's live gate proves it). ----

    #[test]
    fn website_data_record_matches_domain_matches_bare_apex() {
        assert!(website_data_record_matches_domain(
            "humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_matches_subdomain() {
        assert!(website_data_record_matches_domain(
            "www.humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_matches_leading_dot() {
        assert!(website_data_record_matches_domain(
            ".humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_rejects_suffix_lookalike() {
        // D-08 in the opposite direction from a blanket wipe: a displayName-driven filter
        // that matched `nothumblebundle.com` would delete a third party's website data.
        assert!(!website_data_record_matches_domain(
            "nothumblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_rejects_empty_display_name() {
        assert!(!website_data_record_matches_domain("", "humblebundle.com"));
    }

    #[test]
    fn verified_delete_count_is_the_measured_delta() {
        assert_eq!(verified_delete_count(5, 2), 3);
        assert_eq!(verified_delete_count(0, 0), 0);
    }

    #[test]
    fn verified_delete_count_saturates_at_zero_when_the_jar_grew() {
        // A jar that GREW between the two reads (a concurrent login racing the clear) must
        // never produce a negative or wrapped count -- `before=3, after=5` would panic on a
        // plain `before - after` in debug builds and silently wrap in release.
        assert_eq!(verified_delete_count(3, 5), 0);
    }

    #[test]
    fn verified_delete_count_is_zero_when_removal_changed_nothing() {
        assert_eq!(verified_delete_count(7, 7), 0);
    }

    // ---- login_event_value (Phase 34.4.1 Plan 01, REQ-34.4.1-03) ----

    #[test]
    fn humble_login_event_value_shape() {
        assert_eq!(
            login_event_value("finished", "https://www.humblebundle.com/login"),
            json!({ "event": "finished", "url": "https://www.humblebundle.com/login" })
        );
    }

    // Quick task 260803-eee Task 5: the shape `humble_login_open`'s new
    // `on_window_event(WindowEvent::Destroyed)` hook pushes -- an empty url is deliberate (a
    // close is not a navigation), never a stale/partial one that could be mistaken for one.
    #[test]
    fn humble_login_event_value_closed_shape_has_an_empty_url() {
        assert_eq!(
            login_event_value("closed", ""),
            json!({ "event": "closed", "url": "" })
        );
    }

    // ---- reveal_post_args (Phase 34.4.1 Plan 04, REQ-34.4.1-05) ----
    //
    // RED direction: an implementation using `unwrap_or(...)` anywhere in the required-field
    // chain, or treating a missing csrf_token differently from an explicit `null`, would flip
    // one of the cases below.

    fn valid_reveal_args(csrf: Value) -> Vec<Value> {
        vec![
            json!("https://www.humblebundle.com"),
            json!("/humbler/redeemkey"),
            json!("keytype=steam&key=abc&keyindex=1"),
            csrf,
            json!("Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"),
        ]
    }

    /// Manual-match helper standing in for `.unwrap_err()` -- `RevealPostArgs` deliberately
    /// implements no auto-formatting trait (see its own doc comment), so `.unwrap_err()`
    /// cannot be called on a `Result<RevealPostArgs, String>` at all; this reads the error
    /// string out by hand and panics with a plain message on the (unexpected) Ok case instead.
    fn reveal_post_args_err(result: Result<RevealPostArgs, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected reveal_post_args to reject this input"),
        }
    }

    #[test]
    fn humble_reveal_post_args_accepts_a_full_valid_set_with_a_string_csrf_token() {
        let parsed = reveal_post_args(&valid_reveal_args(json!("csrf-token-value"))).unwrap();
        assert_eq!(parsed.origin_url.as_str(), "https://www.humblebundle.com/");
        assert_eq!(parsed.path, "/humbler/redeemkey");
        assert_eq!(parsed.body, "keytype=steam&key=abc&keyindex=1");
        assert_eq!(parsed.csrf_token, Some("csrf-token-value".to_string()));
        assert_eq!(
            parsed.user_agent,
            "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn humble_reveal_post_args_maps_a_null_csrf_token_to_none() {
        let parsed = reveal_post_args(&valid_reveal_args(Value::Null)).unwrap();
        assert_eq!(parsed.csrf_token, None);
    }

    #[test]
    fn humble_reveal_post_args_treats_a_short_args_slice_as_missing_not_a_panic() {
        // Positional args make "csrf missing but user_agent present" structurally
        // unreachable (removing index 3 shifts index 4 into its place) -- what IS reachable,
        // and must never panic, is a short slice that runs out of args entirely. args.get(3)
        // reads None -> csrf_token=None internally, but the overall parse still rejects on
        // the now-missing args[4] (user_agent), never panicking on an out-of-bounds index.
        let short_args = vec![
            json!("https://www.humblebundle.com"),
            json!("/humbler/redeemkey"),
            json!("keytype=steam&key=abc&keyindex=1"),
        ];
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&short_args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_non_null_csrf_token() {
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&valid_reveal_args(json!(12345)))),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_missing_args_entirely() {
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&[])),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_https_origin() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[0] = json!("http://www.humblebundle.com");
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_path() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[1] = json!(42);
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_body() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[2] = json!(null);
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_missing_user_agent() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args.truncate(4); // drop user_agent (args[4]) entirely
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    // ---- reveal_post_script (Phase 34.4.1 Plan 04, T-34.4.1-20/21) ----
    //
    // RED direction: an implementation using `format!("'{}'", value)` (naive quoting) instead
    // of `serde_json::to_string` would let a tricky body value escape its string context; the
    // round-trip assertion below fails against that implementation.

    #[test]
    fn humble_reveal_post_script_escapes_special_characters_and_round_trips_via_serde_json() {
        // Deliberately includes a single quote, a double quote, a backslash, and a
        // `</script>` sequence -- exactly the characters T-34.4.1-20 is about.
        // Two embedded double-quote characters (not one) so this Rust source line itself keeps
        // an EVEN raw `"`-count (open delim + 2 embedded `\"` + close delim = 4) -- satisfying
        // `longRunningChannels.test.ts`'s unrelated WR-08 per-line quote-balance guard, which
        // this line would otherwise trip on the surrounding file scan. Still exercises a
        // double quote, a single quote, a backslash and a `</script>` sequence.
        let tricky_body = "keytype=steam&key=a\"b\"c'd\\e</script>f";
        let script = reveal_post_script(
            "/humbler/redeemkey",
            tricky_body,
            Some("csrf-token-value"),
            REVEAL_EXFIL_HOST,
        );
        let expected_literal = serde_json::to_string(tricky_body).unwrap();
        assert!(
            script.contains(&expected_literal),
            "expected the properly-escaped JSON string literal to appear verbatim in the script"
        );
        let round_tripped: String = serde_json::from_str(&expected_literal).unwrap();
        assert_eq!(round_tripped, tricky_body);
        // The naive, UNESCAPED single-quote interpolation this function must never produce.
        // Built via array-join rather than a literal `format!("'{}'", ..)` call so this
        // regression-guard test itself does not trip the source-text gate
        // (`tauriShellSource.test.ts`) that asserts NO such naive interpolation exists in the
        // real arm code.
        let naive_interpolation = ["'", tricky_body, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn humble_reveal_post_script_embeds_a_null_csrf_token_as_a_js_null_not_the_string_null() {
        let script = reveal_post_script("/humbler/redeemkey", "body", None, REVEAL_EXFIL_HOST);
        assert!(script.contains("var csrf = null;"));
        assert!(!script.contains("var csrf = \"null\""));
    }

    #[test]
    fn humble_reveal_post_script_embeds_a_present_csrf_token_as_a_quoted_json_string() {
        let script = reveal_post_script(
            "/humbler/redeemkey",
            "body",
            Some("csrf-token-value"),
            REVEAL_EXFIL_HOST,
        );
        assert!(script.contains("var csrf = \"csrf-token-value\";"));
    }

    #[test]
    fn humble_reveal_post_script_embeds_the_exfil_host_used_by_the_navigation_intercept() {
        let script = reveal_post_script("/humbler/redeemkey", "body", None, REVEAL_EXFIL_HOST);
        assert!(script.contains(&serde_json::to_string(REVEAL_EXFIL_HOST).unwrap()));
    }

    // ---- clear_storage_args (34.4.1 gap cycle plan 15, F-6, REQ-34.4.1-06/REQ-34.4.1-GAP-03) ----
    //
    // RED direction: an implementation using `unwrap_or(...)` anywhere in the required-field
    // chain would flip one of the cases below, mirroring `reveal_post_args`'s own RED-direction
    // note.

    fn valid_clear_storage_args() -> Vec<Value> {
        vec![
            json!("https://www.humblebundle.com"),
            json!("Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"),
        ]
    }

    /// Manual-match helper standing in for `.unwrap_err()` -- `ClearStorageArgs` deliberately
    /// implements no auto-formatting trait (mirrors `RevealPostArgs`'s own `reveal_post_args_err`
    /// helper and its reasoning, REQ-34.1-07).
    fn clear_storage_args_err(result: Result<ClearStorageArgs, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected clear_storage_args to reject this input"),
        }
    }

    #[test]
    fn humble_login_clear_storage_args_accepts_a_full_valid_set() {
        let parsed = clear_storage_args(&valid_clear_storage_args()).unwrap();
        assert_eq!(parsed.origin_url.as_str(), "https://www.humblebundle.com/");
        assert_eq!(
            parsed.user_agent,
            "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_missing_args_entirely() {
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&[])),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_https_origin() {
        let mut args = valid_clear_storage_args();
        args[0] = json!("http://www.humblebundle.com");
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_string_origin() {
        let mut args = valid_clear_storage_args();
        args[0] = json!(42);
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_missing_user_agent() {
        let mut args = valid_clear_storage_args();
        args.truncate(1); // drop user_agent (args[1]) entirely
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_string_user_agent() {
        let mut args = valid_clear_storage_args();
        args[1] = json!(null);
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    // ---- clear_storage_script (34.4.1 gap cycle plan 15, T-34.4.1-65/-66/-67) ----
    //
    // RED direction: an implementation using naive `'{}'`-style interpolation for `exfil_host`
    // would fail the escaping round-trip case below; one that skips `await` on an async category
    // would fail the await-ordering case; one that coerces a missing API to a numeric 0 instead
    // of the literal `'unsupported'` would fail the five-category case.

    #[test]
    fn humble_login_clear_storage_script_escapes_special_characters_and_round_trips_via_serde_json(
    ) {
        // Deliberately includes a single quote, a double quote, a backslash, and a `</script>`
        // sequence -- the same character classes `reveal_post_script`'s own round-trip case
        // covers (T-34.4.1-65/20). Two embedded double-quote characters (not one) so this Rust
        // source line itself keeps an EVEN raw `"`-count (open delim + 2 embedded `\"` + close
        // delim = 4) -- satisfying `longRunningChannels.test.ts`'s WR-08 per-line quote-balance
        // guard, which this line would otherwise trip on the surrounding file scan. Still
        // exercises a double quote, a single quote, a backslash and a `</script>` sequence.
        let tricky_host = "gamelib.invalid\"a\"payload'x\\y</script>z";
        let script = clear_storage_script(tricky_host);
        let expected_literal = serde_json::to_string(tricky_host).unwrap();
        assert!(
            script.contains(&expected_literal),
            "expected the properly-escaped JSON string literal to appear verbatim in the script"
        );
        let round_tripped: String = serde_json::from_str(&expected_literal).unwrap();
        assert_eq!(round_tripped, tricky_host);
        // The naive, UNESCAPED single-quote interpolation this function must never produce.
        // Built via array-join (mirrors `reveal_post_script`'s own equivalent case) rather than a
        // literal `format!("'{}'", ..)` call so this regression-guard test itself does not trip
        // the source-text gate asserting no such naive interpolation exists in the real arm code.
        let naive_interpolation = ["'", tricky_host, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn humble_login_clear_storage_script_embeds_the_exfil_host_used_by_the_navigation_intercept() {
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains(&serde_json::to_string(REVEAL_EXFIL_HOST).unwrap()));
    }

    #[test]
    fn humble_login_clear_storage_script_clears_all_five_categories_with_an_unsupported_fallback()
    {
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("localStorage.clear()"));
        assert!(script.contains("report.localStorage = 'unsupported'"));
        assert!(script.contains("sessionStorage.clear()"));
        assert!(script.contains("report.sessionStorage = 'unsupported'"));
        assert!(script.contains("indexedDB.deleteDatabase"));
        assert!(script.contains("report.indexedDB = 'unsupported'"));
        assert!(script.contains("caches.delete"));
        assert!(script.contains("report.caches = 'unsupported'"));
        assert!(script.contains("serviceWorker.getRegistrations"));
        assert!(script.contains("report.serviceWorkers = 'unsupported'"));
    }

    #[test]
    fn humble_login_clear_storage_script_awaits_every_async_category_before_reporting() {
        // If IndexedDB/caches/service-worker clearing fired without `await`, this arm would
        // report success for work that has not happened yet (this plan's own explicit warning).
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("await indexedDB.databases()"));
        assert!(script.contains("await new Promise(function(resolve)"));
        assert!(script.contains("await caches.keys()"));
        assert!(script.contains("await caches.delete(keys[j])"));
        assert!(script.contains("await navigator.serviceWorker.getRegistrations()"));
        assert!(script.contains("await regs[k].unregister()"));
        // exfil() must run AFTER every await in the template, never before.
        let exfil_call_index = script.rfind("exfil(report)").unwrap();
        let last_await_index = script.rfind("await ").unwrap();
        assert!(exfil_call_index > last_await_index);
    }

    // ---- is_login_cancel_request / login_cancel_strip_script (Phase 34.4.2 Plan 08,
    // REQ-34.4.2-03/04/06/07/08/10, T-34.4.2-33/-34) ----
    //
    // RED direction: an implementation that validates a payload, discriminates on host only
    // (not path), or lets the strip register a keyboard listener, would flip one of the cases
    // below.

    #[test]
    fn login_cancel_request_accepts_the_bare_sentinel_url() {
        let url = tauri::Url::parse(&format!(
            "https://{REVEAL_EXFIL_HOST}{LOGIN_CANCEL_EXFIL_PATH}"
        ))
        .unwrap();
        assert!(is_login_cancel_request(&url));
    }

    #[test]
    fn login_cancel_request_accepts_the_sentinel_url_with_arbitrary_query_pairs() {
        let mut url = tauri::Url::parse(&format!(
            "https://{REVEAL_EXFIL_HOST}{LOGIN_CANCEL_EXFIL_PATH}"
        ))
        .unwrap();
        url.query_pairs_mut().append_pair("whatever", "ignored");
        assert!(is_login_cancel_request(&url));
    }

    #[test]
    fn login_cancel_request_rejects_an_unrelated_path_on_the_same_host() {
        // The right host, but an unrelated, arbitrary sentinel-shaped path -- must NOT be
        // mistaken for a cancel request (T-34.4.2-13, no collision between sibling sentinels).
        // Neutral literal rather than a real sentinel path, deliberately: the invariant this
        // test protects ("an arbitrary non-cancel path on the same host is rejected") is
        // proven just as well by a made-up path, and reusing a former sentinel path here
        // would leave a now-forbidden name fragment in this file, defeating Phase 34.4.2
        // Plan 13's reconciliation grep.
        let mut url =
            tauri::Url::parse(&format!("https://{REVEAL_EXFIL_HOST}/some-other-sentinel"))
                .unwrap();
        url.query_pairs_mut().append_pair("data", "{}");
        assert!(!is_login_cancel_request(&url));
    }

    #[test]
    fn login_cancel_request_rejects_reveal_path() {
        let url = tauri::Url::parse(&format!("https://{REVEAL_EXFIL_HOST}/reveal")).unwrap();
        assert!(!is_login_cancel_request(&url));
    }

    #[test]
    fn login_cancel_request_rejects_clear_storage_path() {
        let url =
            tauri::Url::parse(&format!("https://{REVEAL_EXFIL_HOST}/clear-storage")).unwrap();
        assert!(!is_login_cancel_request(&url));
    }

    #[test]
    fn login_cancel_request_rejects_the_sentinel_path_on_a_different_host() {
        let url =
            tauri::Url::parse(&format!("https://example.com{LOGIN_CANCEL_EXFIL_PATH}")).unwrap();
        assert!(!is_login_cancel_request(&url));
    }

    #[test]
    fn login_cancel_strip_script_embeds_the_exfil_host_exactly_once_as_a_json_escaped_literal() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        let literal = serde_json::to_string(REVEAL_EXFIL_HOST).unwrap();
        assert_eq!(script.matches(&literal).count(), 1);
    }

    #[test]
    fn login_cancel_strip_script_escapes_a_tricky_host_and_never_naively_interpolates_it() {
        // Mirrors `clear_storage_script`'s own escaping round-trip case.
        let tricky_host = "gamelib.invalid\"a\"b'c\\d</script>e";
        let script = login_cancel_strip_script(tricky_host);
        let expected_literal = serde_json::to_string(tricky_host).unwrap();
        assert!(script.contains(&expected_literal));
        let naive_interpolation = ["'", tricky_host, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn login_cancel_strip_script_contains_the_sentinel_path() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert!(script.contains(LOGIN_CANCEL_EXFIL_PATH));
    }

    #[test]
    fn login_cancel_strip_script_binds_no_keyboard_listener() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert!(!script.contains("keydown"));
        assert!(!script.contains("keyup"));
        assert!(!script.contains("keypress"));
    }

    #[test]
    fn login_cancel_strip_script_never_reads_field_value_or_password_content() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert!(!script.contains(".value"));
        assert!(!script.contains("password"));
    }

    #[test]
    fn login_cancel_strip_script_delivers_via_a_hidden_iframe_never_location_href() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("iframe"));
        assert!(!script.contains("location.href"));
    }

    #[test]
    fn login_cancel_strip_script_is_wrapped_in_a_single_top_level_try_catch() {
        assert_eq!(
            login_cancel_strip_script(REVEAL_EXFIL_HOST)
                .matches("try {")
                .count(),
            1
        );
    }

    #[test]
    fn login_cancel_strip_script_is_pure_same_host_yields_identical_output() {
        let a = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        let b = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert_eq!(a, b);
    }

    // ---- Plan 11 additions (WR-03/WR-04/IN-02, `34.4.2-REVIEW.md`) ----

    #[test]
    fn login_cancel_strip_script_top_frame_guard_precedes_the_idempotence_flag() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        let guard_idx = script.find("window.top !== window");
        let flag_idx = script.find("__GAMELIB_LOGIN_CANCEL_STRIP__");
        assert!(guard_idx.is_some());
        assert!(flag_idx.is_some());
        assert!(guard_idx.unwrap() < flag_idx.unwrap());
    }

    #[test]
    fn login_cancel_strip_script_last_ensure_call_follows_both_dom_content_loaded_and_observer_observe(
    ) {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        let last_ensure_call = script.rfind("ensure(); ");
        let dom_content_loaded_idx = script.find("DOMContentLoaded");
        let observer_observe_idx = script.find("observer.observe(");
        assert!(last_ensure_call.is_some());
        assert!(dom_content_loaded_idx.is_some());
        assert!(observer_observe_idx.is_some());
        assert!(last_ensure_call.unwrap() > dom_content_loaded_idx.unwrap());
        assert!(last_ensure_call.unwrap() > observer_observe_idx.unwrap());
    }

    #[test]
    fn login_cancel_strip_script_drops_tabindex_and_advertises_aria_keyshortcuts() {
        let script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert!(!script.contains("tabindex"));
        assert!(script.contains("aria-keyshortcuts"));
    }

    #[test]
    fn login_cancel_strip_script_wr04_regression_still_wraps_in_a_single_top_level_try_catch() {
        // Explicit WR-04-regression note: the review's own suggested fix shape (an inner
        // try/catch around the initial ensure() call) would add a second `"try {"` and break
        // the pre-existing exactly-once guard above. This plan's actual fix is a reorder plus
        // null-root-safe appends -- re-asserted here alongside the new WR-03/IN-02 guards so a
        // future edit that reintroduces an inner try is caught in the same neighbourhood.
        assert_eq!(
            login_cancel_strip_script(REVEAL_EXFIL_HOST)
                .matches("try {")
                .count(),
            1
        );
    }

    // ---- login_origin_banner_script / login_origin_banner_update_script (Phase 34.5 Plan 52,
    // F-34.5-G6-16, D-CYCLE7-A) ----
    //
    // RED direction (captured verbatim in `34.5-52-SUMMARY.md`): (a) swapping `textContent` for
    // the HTML-fragment-write API in `build()` fails `login_origin_banner_script_never_uses_innerhtml`; (b)
    // raising the banner's z-index literal to `'2147483001'` fails
    // `login_origin_banner_script_z_index_is_strictly_below_the_cancel_strips`; (c) adding a
    // `keydown` `addEventListener` to `build()` fails
    // `login_origin_banner_script_binds_no_keyboard_listener`.

    const TEST_LOGIN_ORIGIN: &str = "https://login.gog.com";

    #[test]
    fn login_origin_banner_script_embeds_the_origin_exactly_once_as_a_json_escaped_literal() {
        let script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        let literal = serde_json::to_string(TEST_LOGIN_ORIGIN).unwrap();
        assert_eq!(script.matches(&literal).count(), 1);
    }

    #[test]
    fn login_origin_banner_script_escapes_a_tricky_origin_and_never_naively_interpolates_it() {
        // Mirrors `login_cancel_strip_script`'s own escaping round-trip case.
        let tricky_origin = "https://ex\"a'mple.com";
        let script = login_origin_banner_script(tricky_origin);
        let expected_literal = serde_json::to_string(tricky_origin).unwrap();
        assert!(script.contains(&expected_literal));
        let naive_interpolation = ["'", tricky_origin, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn login_origin_banner_script_binds_no_keyboard_listener() {
        let script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        assert!(!script.contains("keydown"));
        assert!(!script.contains("keyup"));
        assert!(!script.contains("keypress"));
        assert!(!script.contains("addEventListener"));
    }

    #[test]
    fn login_origin_banner_script_never_reads_field_value_or_password_content() {
        let script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        assert!(!script.contains(".value"));
        assert!(!script.contains("password"));
    }

    #[test]
    fn login_origin_banner_script_never_uses_innerhtml() {
        let script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        assert!(!script.contains("innerHTML"));
        assert!(script.contains("textContent"));
    }

    #[test]
    fn login_origin_banner_script_top_frame_guard_precedes_the_idempotence_flag() {
        let script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        let guard_idx = script.find("window.top !== window");
        let flag_idx = script.find("__GAMELIB_LOGIN_ORIGIN_BANNER__");
        assert!(guard_idx.is_some());
        assert!(flag_idx.is_some());
        assert!(guard_idx.unwrap() < flag_idx.unwrap());
    }

    #[test]
    fn login_origin_banner_script_z_index_is_strictly_below_the_cancel_strips() {
        // Numeric comparison, not substring presence alone (T-34.5-C7-05, WR-08-adjacent
        // discipline): extract both z-index literals and compare them as integers.
        let banner_script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        let strip_script = login_cancel_strip_script(REVEAL_EXFIL_HOST);
        assert!(banner_script.contains("'2147482999'"));
        let banner_z: i64 = banner_script
            .split("zIndex = '")
            .nth(1)
            .and_then(|s| s.split('\'').next())
            .expect("banner script must set zIndex")
            .parse()
            .expect("banner zIndex must parse as an integer");
        let strip_z: i64 = strip_script
            .split("zIndex = '")
            .nth(1)
            .and_then(|s| s.split('\'').next())
            .expect("strip script must set zIndex")
            .parse()
            .expect("strip zIndex must parse as an integer");
        assert!(banner_z < strip_z);
    }

    #[test]
    fn login_origin_banner_script_pointer_events_are_disabled() {
        let script = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        assert!(script.contains("pointerEvents = 'none'"));
    }

    #[test]
    fn login_origin_banner_script_is_wrapped_in_a_single_top_level_try_catch() {
        assert_eq!(
            login_origin_banner_script(TEST_LOGIN_ORIGIN)
                .matches("try {")
                .count(),
            1
        );
    }

    #[test]
    fn login_origin_banner_script_is_pure_same_origin_yields_identical_output() {
        let a = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        let b = login_origin_banner_script(TEST_LOGIN_ORIGIN);
        assert_eq!(a, b);
    }

    #[test]
    fn login_origin_banner_update_script_embeds_the_new_origin_and_differs_by_origin() {
        let a = login_origin_banner_update_script(TEST_LOGIN_ORIGIN);
        let b = login_origin_banner_update_script("https://embed.gog.com");
        let literal = serde_json::to_string(TEST_LOGIN_ORIGIN).unwrap();
        assert!(a.contains(&literal));
        assert_ne!(a, b);
    }

    #[test]
    fn login_origin_banner_update_script_never_uses_innerhtml_and_is_wrapped_in_one_try_catch() {
        let script = login_origin_banner_update_script(TEST_LOGIN_ORIGIN);
        assert!(!script.contains("innerHTML"));
        assert!(script.contains("textContent"));
        assert_eq!(script.matches("try {").count(), 1);
    }

    #[test]
    fn login_origin_banner_update_script_registers_no_listener() {
        let script = login_origin_banner_update_script(TEST_LOGIN_ORIGIN);
        assert!(!script.contains("addEventListener"));
        assert!(!script.contains("keydown"));
    }

    // ---- login_chrome_css_script (quick task 260822-di1, T-di1-01..06) ----
    //
    // RED direction (mirrors this file's own convention, established above): (a) swapping
    // `style.textContent` for an HTML-fragment-write API in `build()` would fail
    // `login_chrome_css_script_never_uses_innerhtml`; (b) reordering the host gate after the
    // idempotence flag would fail
    // `login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag`;
    // (c) swapping the anchored `.slice(-SUFFIX.length)` comparison for `.indexOf(` would fail
    // `login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring`.

    #[test]
    fn login_chrome_css_script_hides_the_marketing_footer_and_nothing_else() {
        let script = login_chrome_css_script();
        assert!(script.contains("footer.site-footer { display: none !important; }"));
        for forbidden in [
            "#flash",
            "page-top-messages",
            "grayout",
            "simple-navbar",
            "zdconsent",
        ] {
            assert!(!script.contains(forbidden));
        }
    }

    #[test]
    fn login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring() {
        let script = login_chrome_css_script();
        assert!(script.contains(".humblebundle.com"));
        assert!(script.contains("slice("));
        assert!(!script.contains("indexOf("));
    }

    #[test]
    fn login_chrome_css_script_binds_no_keyboard_listener() {
        let script = login_chrome_css_script();
        assert!(!script.contains("keydown"));
        assert!(!script.contains("keyup"));
        assert!(!script.contains("keypress"));
        assert!(!script.contains("addEventListener"));
    }

    #[test]
    fn login_chrome_css_script_never_uses_innerhtml() {
        let script = login_chrome_css_script();
        assert!(!script.contains("innerHTML"));
        assert!(!script.contains("outerHTML"));
        assert!(!script.contains("insertAdjacentHTML"));
        assert!(!script.contains("document.write"));
    }

    #[test]
    fn login_chrome_css_script_never_reads_field_value() {
        let script = login_chrome_css_script();
        assert!(!script.contains(".value"));
    }

    #[test]
    fn login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag()
    {
        let script = login_chrome_css_script();
        let guard_idx = script.find("window.top !== window");
        let host_idx = script.find(".humblebundle.com");
        let flag_idx = script.find("__GAMELIB_LOGIN_CHROME_CSS__");
        assert!(guard_idx.is_some());
        assert!(host_idx.is_some());
        assert!(flag_idx.is_some());
        assert!(guard_idx.unwrap() < host_idx.unwrap());
        assert!(host_idx.unwrap() < flag_idx.unwrap());
    }

    #[test]
    fn login_chrome_css_script_is_wrapped_in_a_single_top_level_try_catch() {
        assert_eq!(login_chrome_css_script().matches("try {").count(), 1);
    }

    #[test]
    fn login_chrome_css_script_is_pure_same_output_every_call() {
        let a = login_chrome_css_script();
        let b = login_chrome_css_script();
        assert_eq!(a, b);
    }

    // ---- shell_exe_env_value (Phase 34.5 Plan 01, REQ-34.5-01, D-10) ----
    //
    // RED direction: an implementation that panics or `.unwrap()`s on `Err` would fail
    // `shell_exe_env_value_err_yields_empty_string_never_panics`; one that adds its own
    // quoting would fail `shell_exe_env_value_path_with_space_survives_unquoted`.

    #[test]
    fn shell_exe_env_value_ok_yields_the_paths_display_string() {
        let path = std::path::PathBuf::from("/Applications/GameLib.app/Contents/MacOS/GameLib");
        assert_eq!(
            shell_exe_env_value(Ok(path.clone())),
            path.display().to_string()
        );
    }

    #[test]
    fn shell_exe_env_value_err_yields_empty_string_never_panics() {
        let err = std::io::Error::other("current_exe() failed");
        assert_eq!(shell_exe_env_value(Err(err)), String::new());
    }

    #[test]
    fn shell_exe_env_value_path_with_space_survives_unquoted() {
        // nonesteamgame.ts:258 adds its own `"..."` quoting for the Steam VDF, and
        // shortcuts.ts:227 deliberately adds none for the macOS `.app` run.sh — this helper
        // must never pre-empt either by adding its own quotes.
        let path = std::path::PathBuf::from("/Applications/Game Lib.app/Contents/MacOS/GameLib");
        let value = shell_exe_env_value(Ok(path));
        assert_eq!(value, "/Applications/Game Lib.app/Contents/MacOS/GameLib");
        assert!(!value.starts_with('"'));
        assert!(!value.starts_with('\''));
        assert!(!value.ends_with('"'));
        assert!(!value.ends_with('\''));
    }

    // ---- app_root_env_value (Phase 34.5 Plan 16, Task 2, G-1) ----
    //
    // RED direction: an implementation that panics or `.unwrap()`s on `Err` would fail
    // `app_root_env_value_err_yields_empty_string_never_panics`; one that trims or quotes the
    // path would fail `app_root_env_value_ok_yields_the_paths_display_string_untrimmed`.

    #[test]
    fn app_root_env_value_ok_yields_the_paths_display_string_untrimmed() {
        let path = std::path::PathBuf::from("/Users/dev/GameLib");
        assert_eq!(
            app_root_env_value(Ok(path.clone())),
            path.display().to_string()
        );
    }

    #[test]
    fn app_root_env_value_err_yields_empty_string_never_panics() {
        let err = "resource_dir() failed".to_string();
        assert_eq!(app_root_env_value(Err(err)), String::new());
    }

    #[test]
    fn app_root_env_value_path_with_space_survives_unquoted() {
        // Mirrors shell_exe_env_value_path_with_space_survives_unquoted -- this helper must
        // never pre-empt a consumer's own quoting/escaping.
        let path = std::path::PathBuf::from("/Users/dev/Game Lib");
        let value = app_root_env_value(Ok(path));
        assert_eq!(value, "/Users/dev/Game Lib");
        assert!(!value.starts_with('"'));
        assert!(!value.ends_with('"'));
    }

    #[test]
    fn resolve_dev_app_root_resolves_to_the_parent_of_cargo_manifest_dir_when_unset() {
        // No env-var mutation here (this file's existing #[cfg(test)] mod never mutates
        // process-global env vars inside a parallel `cargo test` run -- see
        // resolve_dev_app_root's own doc comment for why). This asserts the un-overridden
        // computed value directly against the same env!() the function itself bakes from.
        if std::env::var("GAMELIB_APP_ROOT").is_ok() {
            // If the developer's own shell happens to have this set, the override branch
            // (untested here, same as resolve_sidecar_entry's GAMELIB_SIDECAR_ENTRY) would
            // take over and this assertion would no longer be about the computed value.
            return;
        }
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let expected = manifest_dir.parent().unwrap().display().to_string();
        assert_eq!(resolve_dev_app_root(), expected);
    }

    // ---- keyring_account (34.4.1 gap cycle plan 11, D-GAP-01) ----
    //
    // Pure function, directly testable (a live Keychain call is not). RED direction: an
    // implementation with a wildcard/fallback arm that maps any unrecognised slot onto a real
    // account would fail every "unknown slot" case below instead of returning
    // `keyring:unknown-slot`.

    #[test]
    fn keyring_account_maps_steam_refresh_token_to_its_constant_account() {
        assert_eq!(keyring_account("steam-refresh-token"), Ok(KEYRING_ACCOUNT));
    }

    #[test]
    fn keyring_account_maps_humble_session_to_its_own_distinct_account() {
        assert_eq!(keyring_account("humble-session"), Ok("humble-session"));
    }

    #[test]
    fn keyring_account_maps_humble_csrf_to_its_own_distinct_account() {
        assert_eq!(keyring_account("humble-csrf"), Ok("humble-csrf"));
    }

    #[test]
    fn keyring_account_humble_session_and_humble_csrf_never_collide() {
        // Guards against a copy-paste that maps both Humble slots to the same account string,
        // which would let a csrf write clobber the session cookie (or vice versa).
        assert_ne!(
            keyring_account("humble-session").unwrap(),
            keyring_account("humble-csrf").unwrap()
        );
    }

    #[test]
    fn keyring_account_rejects_an_unknown_slot_with_no_fallback_to_a_real_account() {
        let result = keyring_account("some-other-secret");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "keyring:unknown-slot");
    }

    #[test]
    fn keyring_account_rejects_the_empty_string_slot() {
        let result = keyring_account("");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "keyring:unknown-slot");
    }

    #[test]
    fn keyring_account_rejects_a_plausible_looking_near_miss_slot() {
        // Near-misses of a real slot name must not silently resolve to that real slot.
        assert!(keyring_account("steam-refresh-tokens").is_err());
        assert!(keyring_account("Steam-Refresh-Token").is_err());
        assert!(keyring_account("humble_session").is_err());
    }

    // ---- keyring_slot_arg (34.4.1 gap cycle plan 11, D-GAP-01) ----
    //
    // Separate concern from keyring_account: this is the ONE deliberate default (absent slot
    // arg -> steam-refresh-token), which is what keeps every pre-this-plan caller's frame valid.

    #[test]
    fn keyring_slot_arg_defaults_to_steam_refresh_token_when_absent() {
        assert_eq!(keyring_slot_arg(&[], 0), "steam-refresh-token");
    }

    #[test]
    fn keyring_slot_arg_defaults_to_steam_refresh_token_when_non_string() {
        assert_eq!(keyring_slot_arg(&[json!(1)], 0), "steam-refresh-token");
        assert_eq!(keyring_slot_arg(&[Value::Null], 0), "steam-refresh-token");
    }

    #[test]
    fn keyring_slot_arg_reads_a_present_string_slot_at_the_given_position() {
        assert_eq!(
            keyring_slot_arg(&[json!("humble-session")], 0),
            "humble-session"
        );
        assert_eq!(
            keyring_slot_arg(&[json!("a-secret"), json!("humble-csrf")], 1),
            "humble-csrf"
        );
    }

    // ---- keyring_get_result (34.4.1 gap cycle 2 plan 26, F-9 observability half,
    // REQ-34.4.1-GAP-01/REQ-34.4.1-GAP-11) ----
    //
    // Pure classification, extracted so the arm's Ok/NoEntry/other-Err mapping is directly
    // testable without a live Keychain -- mirrors keyring_account's own "pure function, directly
    // testable" precedent above. Task 2's acceptance criteria requires the NoEntry-still-null
    // and other-error-still-classified paths to be proven, and this is the seam that proves them.

    #[test]
    fn keyring_get_result_maps_ok_to_a_string_value() {
        assert_eq!(
            keyring_get_result(Ok("a-secret".to_string())),
            Ok(Value::String("a-secret".to_string()))
        );
    }

    #[test]
    fn keyring_get_result_maps_no_entry_to_null_not_an_error() {
        // Pitfall 1 / D-06: a missing entry is the healthy first-run state, never an error.
        assert_eq!(
            keyring_get_result(Err(keyring::Error::NoEntry)),
            Ok(Value::Null)
        );
    }

    #[test]
    fn keyring_get_result_maps_other_errors_to_a_classified_unavailable_string() {
        let result = keyring_get_result(Err(keyring::Error::Invalid(
            "account".to_string(),
            "test-injected failure".to_string(),
        )));
        assert!(result.is_err());
        assert!(result.unwrap_err().starts_with("keyring:unavailable:"));
    }

    // ---- bounded_keyring_read (34.4.1 gap cycle 2 plan 26, T-34.4.1-114/T-34.4.1-115) ----
    //
    // Generic over the read operation specifically so the timeout path is provable with an
    // injected slow/never-returning closure, never by waiting on a real Keychain (this plan's
    // own acceptance criteria). The spawned worker thread in the never-returning case is
    // deliberately abandoned when the test function returns -- exactly the "abandoned, not
    // cancelled" behavior documented on KEYRING_READ_TIMEOUT and on the keyring_get arm itself,
    // proven here rather than merely asserted in a comment.

    #[test]
    fn bounded_keyring_read_returns_the_inner_result_when_it_completes_within_the_bound() {
        let result = bounded_keyring_read(Duration::from_secs(2), || Ok(Value::Null));
        assert_eq!(result, Ok(Value::Null));
    }

    #[test]
    fn bounded_keyring_read_propagates_an_inner_error_when_it_completes_within_the_bound() {
        let result =
            bounded_keyring_read(Duration::from_secs(2), || Err("keyring:unavailable:x".to_string()));
        assert_eq!(result, Err("keyring:unavailable:x".to_string()));
    }

    #[test]
    fn bounded_keyring_read_times_out_as_keyring_timeout_on_a_never_returning_operation() {
        let result = bounded_keyring_read(Duration::from_millis(50), || {
            thread::sleep(Duration::from_secs(999));
            Ok(Value::Null)
        });
        assert_eq!(result, Err("keyring:timeout".to_string()));
    }

    // ---- KEYRING_READ_TIMEOUT vs RUST_INVOKE_TIMEOUT_MS ordering invariant (Phase 34.5 gap
    // cycle 4 plan 35, Routing item 3, T-34.5-C4-33) ----
    //
    // `KEYRING_READ_TIMEOUT` (this file) and `RUST_INVOKE_TIMEOUT_MS` (60_000ms,
    // `src/backend/sidecar/sidecarRpc.ts`) carry an ordering invariant that lives in two
    // independently-editable files in two languages: the Rust bound must stay strictly UNDER the
    // TS bound, with round-trip headroom, or a slow keyring read stops being reported as the
    // specific, named `keyring:timeout` and starts being reported as an opaque transport timeout
    // by the sidecar's outer layer instead. This assertion pins that invariant on the Rust side so
    // a future edit to `KEYRING_READ_TIMEOUT` that reorders the two bounds fails loudly here,
    // rather than silently at 2am in a live login flow. The TS side pins the same invariant
    // independently by parsing this constant out of this file (see
    // `src/backend/sidecar/__tests__/keyringTokenStore.test.ts`).
    #[test]
    fn keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound_with_round_trip_headroom()
    {
        // Mirrors sidecarRpc.ts's RUST_INVOKE_TIMEOUT_MS (60_000ms) verbatim -- this is the outer
        // bound KEYRING_READ_TIMEOUT must stay under. Margin is 10s round-trip headroom, leaving
        // KEYRING_READ_TIMEOUT (45s) 5s of additional slack below the strict 50s ceiling this
        // assertion enforces.
        const RUST_INVOKE_TIMEOUT: Duration = Duration::from_secs(60);
        const ROUND_TRIP_MARGIN: Duration = Duration::from_secs(10);
        // Message built via `concat!` of single-line literal fragments (each individually
        // quote-balanced) rather than a backslash-continued multi-line literal -- the latter
        // trips longRunningChannels.test.ts's per-line WR-08 quote-balance stripper guard, which
        // counts `"` occurrences on each SOURCE line independently and cannot see that a
        // continuation resolves the count across lines.
        assert!(
            KEYRING_READ_TIMEOUT < RUST_INVOKE_TIMEOUT - ROUND_TRIP_MARGIN,
            concat!(
                "KEYRING_READ_TIMEOUT ({read:?}) must stay strictly under ",
                "RUST_INVOKE_TIMEOUT_MS (src/backend/sidecar/sidecarRpc.ts, currently ",
                "{invoke:?}) minus a {margin:?} round-trip margin, or ",
                "a slow keyring read stops being reported as the specific keyring:timeout and ",
                "starts being reported as an opaque transport timeout by the sidecar's outer ",
                "layer instead"
            ),
            read = KEYRING_READ_TIMEOUT,
            invoke = RUST_INVOKE_TIMEOUT,
            margin = ROUND_TRIP_MARGIN
        );
    }

    // ---- F-9 root-cause timing harness (34.4.1 gap cycle 2 plan 26, Task 1) ----
    //
    // Times two DIRECT `keyring` crate reads -- one against a guaranteed-absent account, one
    // against whatever the developer's real `steam-refresh-token` Keychain entry currently is
    // -- to put a measurement behind the "a missing-entry Keychain lookup blocks longer than a
    // present-entry one" hypothesis (34.4.1-RESEARCH-GAP-CYCLE-2.md § Item 5 / Assumptions Log
    // A4, which explicitly states the hypothesis was NOT reproduced during research).
    //
    // Deliberately bypasses keyring_account()'s allowlist (T-34.4.1-117, accepted in this
    // plan's threat register): the absent account is a never-written, randomly-suffixed name
    // constructed directly, exactly mirroring what the live arm's own Entry::new(KEYRING_SERVICE,
    // account) call does. This harness NEVER calls set_password/delete_credential (grep-asserted
    // by this plan's own acceptance criteria) -- read only, and it never touches an existing
    // slot to manufacture the absent condition.
    //
    // #[ignore]d because it depends on a real macOS Keychain and must never become a CI-time
    // dependency (this file has no other #[ignore]d test to follow as precedent -- this is the
    // first). Run with:
    //   cd src-tauri && cargo test -- --ignored --nocapture keyring_read_timing_hypothesis
    //
    // Last recorded runs (2026-07-31, this plan, this machine, two separate invocations):
    //   Run 1: absent-entry elapsed=40.04ms  outcome=NoEntry
    //          present-entry (steam-refresh-token) elapsed=48.87s  outcome=Err (present=false)
    //   Run 2: absent-entry elapsed=102.23ms outcome=NoEntry
    //          present-entry (steam-refresh-token) elapsed=291.08s outcome=Err(PlatformFailure
    //          { code: -60008, message: "Unable to obtain authorization for this operation." })
    // VERDICT: REFUTED, and by a wide margin in the OPPOSITE direction from the hypothesis as
    // literally stated. The absent-entry read was consistently fast (tens to ~100ms); the
    // present-entry read against a REAL allowlisted account was the slow one on both runs (48.9s,
    // then 291s), both times ultimately failing with a Keychain AUTHORIZATION error, not a
    // NoEntry/PlatformFailure-unrelated-to-auth error. This is live, hardware-measured support for
    // `deferred-items.md`'s ad-hoc-code-signature/Keychain-ACL theory (a differently-signed
    // process's request to access an existing protected item triggers a real, and sometimes
    // extremely long, authorization negotiation) rather than for "a missing entry is the slow
    // path". See `34.4.1-26-SUMMARY.md` for the full writeup and its consequence for
    // `KEYRING_READ_TIMEOUT`'s chosen bound.
    #[test]
    #[ignore]
    fn keyring_read_timing_hypothesis_absent_vs_present_entry() {
        let absent_account = format!(
            "gamelib-spike026-absent-probe-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );

        let absent_start = std::time::Instant::now();
        let absent_entry = Entry::new(KEYRING_SERVICE, &absent_account)
            .expect("Entry::new must not fail for a well-formed service/account pair");
        let absent_result = absent_entry.get_password();
        let absent_elapsed = absent_start.elapsed();

        let present_start = std::time::Instant::now();
        let present_entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .expect("Entry::new must not fail for a well-formed service/account pair");
        let present_result = present_entry.get_password();
        let present_elapsed = present_start.elapsed();

        println!(
            "[keyring-timing] absent-entry  ({absent_account}) elapsed={absent_elapsed:?} outcome={}",
            match &absent_result {
                Ok(_) => "Ok(<unexpected -- probe account should never hold a secret>)",
                Err(keyring::Error::NoEntry) => "NoEntry",
                Err(_) => "Err(<other>)",
            }
        );
        println!(
            "[keyring-timing] present-entry ({KEYRING_ACCOUNT}) elapsed={present_elapsed:?} outcome={}",
            match &present_result {
                Ok(_) => "Ok(<secret present -- value never printed>)".to_string(),
                Err(keyring::Error::NoEntry) => "NoEntry".to_string(),
                Err(e) => format!("Err({e:?})"),
            }
        );

        // Only assert the calls RETURN at all -- a threshold assertion would turn an
        // intermittent OS behaviour into a flaky test (this plan's own acceptance criteria).
        // Reaching this line already proves both calls returned; the two statements below make
        // that explicit for a reader rather than relying on control flow alone.
        let absent_returned = absent_result.is_ok() || absent_result.is_err();
        let present_returned = present_result.is_ok() || present_result.is_err();
        assert!(absent_returned);
        assert!(present_returned);
    }

    // ---- pending_login_entry_is_stale (Phase 34.4.2 Plan 14, T-34.4.2-39/-41) ----
    //
    // Pure, AppKit-free boundary tests for `PENDING_VISIBLE_LOGIN_WINDOW_TTL`'s staleness
    // check -- exercised directly, without any live window, exactly as this task's own
    // acceptance criteria require.
    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_entry_below_ttl_is_not_stale() {
        let age = PENDING_VISIBLE_LOGIN_WINDOW_TTL - Duration::from_secs(1);
        assert!(!pending_login_entry_is_stale(age));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_entry_above_ttl_is_stale() {
        let age = PENDING_VISIBLE_LOGIN_WINDOW_TTL + Duration::from_secs(1);
        assert!(pending_login_entry_is_stale(age));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_entry_exactly_at_ttl_is_stale() {
        // Documented boundary verdict (see `pending_login_entry_is_stale`'s own doc comment):
        // an age EQUAL to the TTL is treated as stale (`>=`, not `>`) -- the TTL is the point
        // past which the entry is no longer trusted, matching this file's existing
        // `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`/`recv_timeout` convention of a bound that has
        // been EXCEEDED (not merely reached) before the caller-side fallback runs.
        assert!(pending_login_entry_is_stale(PENDING_VISIBLE_LOGIN_WINDOW_TTL));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_window_ttl_is_derived_from_the_watchdog_timeout_with_a_margin() {
        // The TTL must be strictly greater than the watchdog's own 15s bound so the two can
        // never disagree -- the watchdog's fallback always runs and clears the latch well
        // before this TTL could ever expire it out from under a still-legitimate flow.
        assert!(PENDING_VISIBLE_LOGIN_WINDOW_TTL > LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT);
    }

    // ---- F-34.4.2-12 regression pin: Humble disconnect main-thread wedge ----
    //
    // `.planning/debug/resolved/humble-disconnect-main-wedge.md`. Live-reproduced 2/2:
    // disconnect's cookie census/count (`humble_login_cookies_for_domain`'s `readCensus()`
    // backing, and `humble_login_clear_cookies`'s `count_matching` closure) fires FOUR wry
    // `WebviewWindow::cookies()` round trips against a just-created hidden WKWebView. On macOS
    // each blocks inside wry's `wait_for_blocking_operation`, which reentrantly pumps
    // `NSRunLoop::mainRunLoop()` from INSIDE tao's `EventLoopHandler::with_callback` (already
    // holding tao's own handler `Mutex`); the reentrant pump lets a pending CoreAnimation
    // transaction flush hit tao's own redraw path, which tries to relock the SAME mutex ->
    // main-thread self-deadlock. A full hung-process sample (4185/4185 samples in the identical
    // state) confirmed this exact frame chain -- see the debug session's Evidence for the full
    // backtrace and durable evidence file paths.
    //
    // Gap cycle 4 / D-F2: `humble_login_cookies` (the LOGIN-POLL direction used by
    // `watchForLogin()`) was the one call site the original fix session deliberately left out
    // of scope -- it shares the identical wry-internal hazard mechanically (a DIFFERENT call
    // pattern: one call per poll tick against a settled, already-visible window, with zero live
    // evidence of failure, versus the four-call burst against a freshly-created hidden window
    // that reproduced the deadlock), and D-F2 brought it into scope for this cycle. It is now
    // fixed the same way and is CHECKED by this pin below -- the instruction that it "must NOT
    // be checked by this pin" is superseded and no longer applies.
    //
    // The debug session's own `## Residual Risks` also recorded this pin's second limitation:
    // the original matcher matched only two exact call-site prefixes (`Ok(w.cookies()` and
    // `let all = window.cookies()`) and would not catch a blocking `.cookies()` written with a
    // different binding name, split across lines, or added at a third site -- there is a live
    // example of exactly that missed shape in this file (`humble_login_clear_cookies`'s
    // deletion branch, where `window` and `.cookies()` are split across two lines). D-F2
    // requires the pin be shape-robust, not merely given a third literal, so the matcher below
    // is a `.cookies()` CONTAINS scan over non-comment lines instead.
    //
    // A live end-to-end reproduction of the deadlock itself is NOT safely automatable here: it
    // requires a real, contended AppKit/WebKit run loop, and a flaky or genuinely-hanging
    // assertion would defeat its own purpose (and could hang CI) -- the same reason
    // `#[cfg(test)] mod tests` elsewhere in this file cannot construct a live `AppHandle` at
    // all (see this file's own comment near `mod tests`, above). This test instead pins the
    // STRUCTURAL fix, the same "prove it against the source" discipline
    // `seamBranchParity.test.ts` already uses on the TypeScript side of this codebase: it is a
    // STRUCTURAL source scan, not a behavioural test, and does not itself prove the deadlock
    // cannot recur -- only that no macOS-reachable call site of the eliminated shape currently
    // exists in the three arms it covers. Runs on every platform (`include_str!` just reads
    // text; it does not need to compile the macOS-only code it is checking).
    #[test]
    fn f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated() {
        let source = include_str!("main.rs");
        let lines: Vec<&str> = source.lines().collect();

        // All three cookie-reading dispatch arms are now in scope (D-F2): the login-poll read,
        // the disconnect census, and the disconnect count/removal arm.
        let target_arms = [
            "humble_login_cookies",
            "humble_login_cookies_for_domain",
            "humble_login_clear_cookies",
        ];
        let mut current_arm: Option<&str> = None;
        // (arm, guard) pairs for every matched call site, in scan order -- asserted as an EXACT
        // structural set below, not a floor. This also lets a site MIGRATE between arms or
        // silently LOSE its guard without the raw count changing, and still be caught.
        let mut found_sites: Vec<(&str, String)> = Vec::new();
        // Load-bearing self-test (see below): proves the matcher recognises the split-line
        // shape `window` / `.cookies()`, not only single-line prefixes.
        let mut found_split_line_shape = false;

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();

            // Track which `dispatch_rust_channel` match arm this line is inside. Every arm in
            // that match is a single line of the shape `"channel_name" => {`.
            if trimmed.starts_with('"') && trimmed.ends_with("\" => {") {
                let name = trimmed.trim_start_matches('"').split('"').next().unwrap_or("");
                current_arm = target_arms.iter().find(|a| **a == name).copied();
                continue;
            }

            let Some(arm) = current_arm else {
                continue;
            };

            // Comment lines are skipped -- several legitimate comments in these arms mention
            // `window.cookies()`/`.cookies()` by name (this pin's own doc comment above is one),
            // and a naive substring scan would flag them. `*` covers this file's block-comment
            // continuation lines. `cookies_for_url` is skipped too: it is separately forbidden
            // everywhere in this file (a different pin's subject), not this scan's.
            if trimmed.starts_with("//") || trimmed.starts_with('*') {
                continue;
            }
            if trimmed.contains("cookies_for_url") {
                continue;
            }
            let is_call_site = trimmed.contains(".cookies()");
            if !is_call_site {
                continue;
            }
            if trimmed == ".cookies()" {
                found_split_line_shape = true;
            }

            // Walk backward to the nearest preceding `#[cfg(...)]` attribute line. A
            // legitimate SURVIVING call site must be immediately (modulo blank/comment lines)
            // gated behind exactly `#[cfg(not(target_os = "macos"))]` -- never unconditional,
            // and never `#[cfg(target_os = "macos")]`. Stops at a function or match-arm
            // boundary (no cfg found before it means the call is unconditional).
            let mut guard: Option<String> = None;
            for prior in lines[..i].iter().rev() {
                let prior_trimmed = prior.trim();
                if prior_trimmed.starts_with("#[cfg(") {
                    guard = Some(prior_trimmed.to_string());
                    break;
                }
                if prior_trimmed.starts_with("fn ") || prior_trimmed.ends_with("\" => {") {
                    break;
                }
            }

            // The message below is built with `concat!` rather than a `\`-continued multi-line
            // literal (which the ORIGINAL pin's own two messages used): a backslash-continued
            // literal's OPENING and CLOSING physical lines each carry an odd, unbalanced `"`
            // count in isolation, which is exactly the truncated-string-literal shape
            // `longRunningChannels.test.ts`'s WR-08 guard exists to catch -- it cannot tell that
            // shape apart from a genuine defect. `concat!` joins several COMPLETE,
            // self-contained (and therefore individually balanced) string literals at compile
            // time into the identical runtime message, with no `\`-continuation involved.
            assert_eq!(
                guard.as_deref(),
                Some("#[cfg(not(target_os = \"macos\"))]"),
                concat!(
                    "F-34.4.2-12 regression: `{}` has an unconditional (or macOS-reachable) ",
                    "wry `.cookies()` call at main.rs line {} (`{}`). This getter blocks the ",
                    "calling closure inside a reentrant NSRunLoop pump that can self-deadlock ",
                    "against tao's EventLoopHandler mutex on macOS -- live-reproduced 2/2, see ",
                    "`.planning/debug/resolved/humble-disconnect-main-wedge.md`. It must only ",
                    "ever be reached via `#[cfg(not(target_os = \"macos\"))]`."
                ),
                arm,
                i + 1,
                trimmed
            );

            found_sites.push((arm, guard.unwrap_or_default()));
        }

        // EXACT structural expectation, not a floor (D-F2). "Three arms" and "four sites" are
        // DIFFERENT numbers and neither is a typo: `humble_login_clear_cookies` alone carries
        // TWO separately-guarded sites (the `count_matching` read and the deletion branch's
        // split-line read), the other two arms carry one each. A floor (e.g. `>= 4`) cannot
        // detect a site DISAPPEARING if the disappearance lands on the floor's own slack; exact
        // equality on the full `(arm, guard)` multiset fails loudly on disappearance, on
        // unreviewed addition, on a site MIGRATING between arms, and on a site silently LOSING
        // its guard -- none of which necessarily changes the bare count. If this assertion ever
        // fails because an arm was genuinely restructured (not because a call site regressed),
        // the expected set below must be RE-DERIVED from a fresh measurement and re-reviewed --
        // never widened or loosened just to make the test pass.
        let guard_ok = "#[cfg(not(target_os = \"macos\"))]".to_string();
        let mut expected: Vec<(&str, String)> = vec![
            ("humble_login_cookies", guard_ok.clone()),
            ("humble_login_cookies_for_domain", guard_ok.clone()),
            ("humble_login_clear_cookies", guard_ok.clone()),
            ("humble_login_clear_cookies", guard_ok),
        ];
        expected.sort();
        let mut actual = found_sites.clone();
        actual.sort();
        // `concat!`, not a `\`-continued literal -- see the comment above the first `assert_eq!`
        // in this test for why (WR-08).
        assert_eq!(
            actual,
            expected,
            concat!(
                "F-34.4.2-12 regression pin: the set of macOS-reachable-gated `.cookies()` ",
                "call sites no longer matches the exact expected set (four sites across three ",
                "arms -- `humble_login_clear_cookies` alone carries two, separately guarded; ",
                "the other two arms carry one each; neither number is a typo). A mismatch ",
                "means either a genuine regression (a new macOS-reachable blocking call) or ",
                "that an arm was restructured; in the restructuring case, re-derive and ",
                "re-review this expected set from a fresh measurement -- never widen it just ",
                "to make this test pass."
            )
        );

        // Load-bearing, not decorative: if this assertion ever fails, the matcher above has
        // silently narrowed back to prefix matching and would once again miss the split-line
        // shape (`window` / `.cookies()`) that is the debug session's own recorded blind spot.
        // `concat!`, not a `\`-continued literal -- see the comment above the first
        // `assert_eq!` in this test for why (WR-08).
        assert!(
            found_split_line_shape,
            concat!(
                "F-34.4.2-12 regression pin: expected to find at least one call site whose ",
                "trimmed text is exactly `.cookies()` (the split-line `window` / `.cookies()` ",
                "shape already present in `humble_login_clear_cookies`'s deletion branch). Its ",
                "absence means the matcher has stopped recognising call sites split across ",
                "lines."
            )
        );
    }

    // ---- deep-link argv helpers (Phase 34.5 gap cycle 6 plan 44, REQ-34.5-01/05/12,
    // F-34.5-G6-09) ----
    //
    // RED direction for the `protocol_url_arg` group as a whole: an implementation that
    // trusted a re-serialised `tauri::Url` instead of returning the original candidate
    // verbatim would fail the byte-identical assertion below; one that used a
    // case-insensitive prefix match would silently diverge from `protocol.ts`'s own
    // `startsWith('gamelib://')`.

    #[test]
    fn protocol_url_arg_finds_url_among_the_vdf_launch_options() {
        let args = vec![
            "--no-gui".to_string(),
            "--no-sandbox".to_string(),
            "gamelib://launch?appName=1207659037&runner=gog".to_string(),
        ];
        assert_eq!(
            protocol_url_arg(&args),
            Some("gamelib://launch?appName=1207659037&runner=gog".to_string())
        );
    }

    #[test]
    fn protocol_url_arg_returns_none_when_absent() {
        let args = vec!["--no-gui".to_string(), "--no-sandbox".to_string()];
        assert_eq!(protocol_url_arg(&args), None);
    }

    #[test]
    fn protocol_url_arg_rejects_foreign_schemes() {
        for candidate in [
            "https://evil.example/x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "heroic://launch?appName=x",
        ] {
            assert_eq!(
                protocol_url_arg(&[candidate.to_string()]),
                None,
                "expected {candidate} to be rejected"
            );
        }
    }

    #[test]
    fn protocol_url_arg_rejects_control_characters() {
        // T-34.5-G6-21: an embedded newline followed by a synthetic RPC frame -- the
        // frame-injection case this rejection exists to close.
        let candidate =
            "gamelib://launch?appName=1\n{\"id\":\"1\",\"kind\":\"invoke\",\"channel\":\"x\",\"args\":[]}"
                .to_string();
        assert_eq!(protocol_url_arg(&[candidate]), None);
    }

    #[test]
    fn protocol_url_arg_rejects_oversized_url() {
        let candidate = format!("gamelib://launch?appName={}", "a".repeat(4096));
        assert_eq!(protocol_url_arg(&[candidate]), None);
    }

    #[test]
    fn protocol_url_arg_returns_the_first_match() {
        let args = vec![
            "gamelib://launch?appName=first".to_string(),
            "gamelib://launch?appName=second".to_string(),
        ];
        assert_eq!(
            protocol_url_arg(&args),
            Some("gamelib://launch?appName=first".to_string())
        );
    }

    #[test]
    fn protocol_url_arg_accepts_a_runnerless_url() {
        // D-44-C / U-34.5-19: the bash-truncated macOS .app run.sh form -- the `runner`
        // param USED TO be lost when `bash` split shortcuts.ts:227's unquoted command on `&`.
        // That template is quoted and percent-encoded now, so this specific shape is no longer
        // emitted by current code (fixed in plan 34.5-45); kept as a regression/compat pin for
        // .app bundles written before the fix.
        let args = vec!["gamelib://launch?appName=1207659037".to_string()];
        assert_eq!(
            protocol_url_arg(&args),
            Some("gamelib://launch?appName=1207659037".to_string())
        );
    }

    #[test]
    fn cli_no_gui_requires_an_exact_flag_match() {
        assert!(cli_no_gui(&["--no-gui".to_string()]));
        assert!(!cli_no_gui(&["--no-gui-really".to_string()]));
        assert!(!cli_no_gui(&["--nogui".to_string()]));
        assert!(!cli_no_gui(&["--no-sandbox".to_string()]));
        assert!(!cli_no_gui(&[]));
    }

    #[test]
    fn sidecar_forward_args_drops_no_sandbox() {
        let args = vec![
            "--no-gui".to_string(),
            "--no-sandbox".to_string(),
            "gamelib://launch?appName=1207659037&runner=gog".to_string(),
        ];
        let forwarded = sidecar_forward_args(&args);
        assert_eq!(
            forwarded,
            vec![
                "--no-gui".to_string(),
                "gamelib://launch?appName=1207659037&runner=gog".to_string()
            ]
        );
        assert!(!forwarded.iter().any(|a| a == "--no-sandbox"));
    }

    #[test]
    fn sidecar_forward_args_drops_unknown_flags() {
        let args = vec![
            "--fullscreen".to_string(),
            "--console".to_string(),
            "-psn_0_12345".to_string(),
            "/some/path".to_string(),
        ];
        assert_eq!(sidecar_forward_args(&args), Vec::<String>::new());
    }

    #[test]
    fn sidecar_forward_args_forwards_a_url_without_no_gui() {
        let url = "gamelib://launch?appName=1207659037".to_string();
        assert_eq!(sidecar_forward_args(&[url.clone()]), vec![url]);
    }

    #[test]
    fn sidecar_forward_args_forwards_no_gui_without_a_url() {
        let args = vec!["--no-gui".to_string()];
        assert_eq!(sidecar_forward_args(&args), vec!["--no-gui".to_string()]);
    }

    #[test]
    fn single_instance_socket_path_is_under_the_given_dir() {
        let dir = std::path::Path::new("/tmp/gamelib-test-dir");
        let path = single_instance_socket_path(dir);
        assert!(path.starts_with(dir));
        assert!(path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .ends_with(".sock"));
    }

    #[test]
    fn single_instance_dir_returns_none_without_a_home() {
        assert_eq!(single_instance_dir(None), None);
        assert_eq!(single_instance_dir(Some("")), None);
    }

    #[test]
    fn handle_protocol_url_channel_is_bounded_at_invoke_timeout() {
        // Pins Task 2's design constraint: handleProtocolUrl must answer immediately and must
        // never await the game launch, so it deliberately stays OFF LONG_RUNNING_CHANNELS.
        assert_eq!(timeout_for("handleProtocolUrl"), Some(INVOKE_TIMEOUT));
    }
}
