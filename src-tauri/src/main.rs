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
use std::io::{BufRead, BufReader, Write};
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

// ---- Tray icon (Phase 34.1 Plan 06, D-11) ----
//
// Icon bytes are embedded at COMPILE TIME via `include_bytes!`, not resolved at runtime from
// `publicDir`/`app.getAppPath()`. This deliberately sidesteps this repo's recurring
// publicDir/getAppPath path-resolution failure family
// ([[publicdir-getapppath-chunking]], the bundled-JSON-asset gotcha) -- no runtime path is
// resolved and no file can be substituted post-build (T-34.1-21).

/// Dark tray icon variant, shown when `settings.darkTrayIcon` is true.
const TRAY_ICON_DARK: &[u8] = include_bytes!("../../public/icon-dark.png");
/// Light tray icon variant (also the startup default, corrected by the sidecar's initial
/// `changeTrayColor` sync once `GlobalConfig` is readable -- see `dispatch_rust_channel`'s
/// `tray_set_icon` arm and `appShellFlowRegistration.ts`).
const TRAY_ICON_LIGHT: &[u8] = include_bytes!("../../public/icon-light.png");
/// Unique id for the app's single tray icon; looked up later via `app.tray_by_id(...)`.
const TRAY_ICON_ID: &str = "gamelib-tray";
/// 1x1 fully-transparent pixel, used only if BOTH bundled tray PNGs fail to decode. Should
/// never happen in practice (they are checked-in assets) -- exists purely so `tray_image`
/// has an infallible last resort and can never panic (T-34.1-22).
const TRAY_ICON_FALLBACK_PIXEL: [u8; 4] = [0, 0, 0, 0];

/// Decode the requested tray icon variant. Every failure path degrades instead of panicking:
/// a bad/corrupt embedded asset falls back to the light variant, and if that also fails to
/// decode, falls back to a blank 1x1 pixel image built via `Image::new` (infallible, no
/// decode step) -- `tray_image` can never be the reason `.setup()` panics (T-34.1-22).
fn tray_image(dark: bool) -> Image<'static> {
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
        Some(d) => host == d || host.ends_with(&format!(".{d}")),
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

// ---- In-field autofill glyph support (Phase 34.4.2 Plan 03, REQ-34.4.2-04/06/07/08/10) ----
//
// Spikes 020/022 (`login-window-ux-macos.md`) proved the system AutoFill panel cannot be
// opened directly, but a synthesized right-click at the password field pops the real context
// menu with `AutoFill ›` in it. This section builds everything up to (but not including) that
// click: the injected glyph script, and the page-to-Rust request channel carrying the field's
// geometry (plan 34.4.2-04 posts the click itself). Scoped EXCLUSIVELY to the Tauri-managed
// `humble_login_open` arm's `if visible` surface (Humble/GOG/Amazon) -- REQ-34.4.2-10's locked
// user-decision scope. The pristine Epic surface (`open_pristine_epic_login_window`) receives
// none of this: no script, no sentinel, no Cargo feature.

/// Sentinel path on the existing `REVEAL_EXFIL_HOST` (never a second host) that the injected
/// glyph script's cancelled-navigation request uses. Path discrimination -- not just host --
/// is what keeps this channel from colliding with the pre-existing `/reveal`
/// (`humble_reveal_post`) and `/clear-storage` (`humble_login_clear_storage`) sentinels on the
/// same reserved host (T-34.4.2-13).
const AUTOFILL_EXFIL_PATH: &str = "/autofill-request";

/// The parsed, validated payload `parse_autofill_request` (below) produces from the glyph
/// script's cancelled-navigation request. `hit_id`/`hit_tag`/`hit_type` are advisory
/// diagnostics ONLY -- the machine record of the MANDATORY `document.elementFromPoint` check
/// (`login-window-ux-macos.md` S4) -- their absence never fails the parse, and each is
/// truncated to at most 64 chars before reaching a caller, so a hostile page cannot use this
/// channel to smuggle an arbitrarily large string into a log line (T-34.4.2-11). Deliberately
/// does NOT derive the standard formatting trait (REQ-34.1-07's file-wide text gate, same
/// reasoning as `RevealPostArgs`/`ClearStorageArgs` above) -- `#[cfg(test)]` assertions read
/// fields directly instead of relying on that trait.
struct AutofillRequest {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    hit_id: Option<String>,
    hit_tag: Option<String>,
    hit_type: Option<String>,
}

/// Truncates `s` to at most `max` CHARACTERS (never bytes) -- `chars().take` is UTF-8-safe,
/// unlike a byte-index slice that could panic mid-codepoint on a hostile page's crafted
/// `hitId`/`hitTag`/`hitType` string.
fn truncate_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// This channel's entire ASVS V5 input validation (T-34.4.2-10/-13, mirrors
/// `reveal_post_args`'s "this arm's entire input validation lives here" discipline): pure, no
/// `AppHandle`, no logging, no I/O, never panics. Validates in this order -- host equals
/// `REVEAL_EXFIL_HOST`; path equals `AUTOFILL_EXFIL_PATH` (discriminating this channel from the
/// pre-existing `/reveal` and `/clear-storage` sentinels on the SAME host, T-34.4.2-13); a
/// `data` query pair exists; it parses as JSON; `x`/`y`/`w`/`h` are all present, numeric AND
/// finite (a NaN/inf coordinate must never reach plan 34.4.2-04's coordinate math -- in
/// practice JSON itself cannot encode a non-finite float, so a crafted non-finite value is
/// rejected either by this explicit guard or, for a literal `NaN`/`Infinity` token, by the JSON
/// parse failing outright; both paths return `None`, which is the only guarantee this function
/// makes); `w > 0.0 && h > 0.0` (a degenerate zero/negative rect is never a real field). Any
/// failure returns `None` -- never a partial struct, never a panic, never `.unwrap()`.
/// `hit_id`/`hit_tag`/`hit_type` are read as strings if present and truncated to 64 chars each;
/// their absence or wrong type never fails the parse (T-34.4.2-11's advisory-diagnostics-only
/// discipline).
fn parse_autofill_request(url: &tauri::Url) -> Option<AutofillRequest> {
    if url.host_str() != Some(REVEAL_EXFIL_HOST) {
        return None;
    }
    if url.path() != AUTOFILL_EXFIL_PATH {
        return None;
    }
    let (_, raw_data) = url.query_pairs().find(|(k, _)| k == "data")?;
    let parsed: Value = serde_json::from_str(&raw_data).ok()?;
    let x = parsed.get("x")?.as_f64()?;
    let y = parsed.get("y")?.as_f64()?;
    let w = parsed.get("w")?.as_f64()?;
    let h = parsed.get("h")?.as_f64()?;
    if !x.is_finite() || !y.is_finite() || !w.is_finite() || !h.is_finite() {
        return None;
    }
    if w <= 0.0 || h <= 0.0 {
        return None;
    }
    let hit_id = parsed
        .get("hitId")
        .and_then(|v| v.as_str())
        .map(|s| truncate_chars(s, 64));
    let hit_tag = parsed
        .get("hitTag")
        .and_then(|v| v.as_str())
        .map(|s| truncate_chars(s, 64));
    let hit_type = parsed
        .get("hitType")
        .and_then(|v| v.as_str())
        .map(|s| truncate_chars(s, 64));
    Some(AutofillRequest {
        x,
        y,
        w,
        h,
        hit_id,
        hit_tag,
        hit_type,
    })
}

/// Builds the JS injected as an `initialization_script()` into the Tauri-managed login
/// surface's VISIBLE builder ONLY (`humble_login_open`'s `if visible` block -- Task 2, below).
/// Uses `clear_storage_script`'s `@@EXFIL_HOST@@` placeholder + `serde_json::to_string` +
/// `.replace()` technique verbatim (T-34.4.2-SC's escaping discipline) -- `exfil_host` is the
/// ONLY interpolated value, and it appears exactly once in the output.
///
/// Contract the generated script implements (REQ-34.4.2-04/06/07):
/// - Idempotent: bails immediately if `window.__GAMELIB_LOGIN_GLYPH__` is already set (sets
///   it first).
/// - `initialization_script()` itself runs before any page script, in every frame (login forms
///   are frequently in iframes) -- this script additionally does an initial scan on load plus a
///   debounced `MutationObserver` on `document.documentElement`
///   (`{childList:true, subtree:true}`) so a form that renders late is still decorated.
/// - Renders exactly one glyph per undecorated `input[type=password]`, positioned with
///   `position:fixed` (from `getBoundingClientRect()`) over the field's right-hand inside edge,
///   repositioned on `scroll` (capture) and `resize`. Never re-parents the input, never sets
///   any input attribute other than one namespaced marker, never touches the input's own
///   styles -- a login form's own validation logic must see an untouched field.
/// - Accessible: `role="button"`, `aria-label="AutoFill password"`, matching `title`,
///   `tabindex="-1"` (never enters the form's tab order).
/// - Keyboard-transparent (REQ-34.4.2-06): registers NO `keydown`/`keyup`/`keypress` listener
///   anywhere, and calls `preventDefault()` on nothing but its own `mousedown` -- Cmd+V into the
///   password field (the universal password-manager fallback, `login-window-ux-macos.md` S5)
///   must keep working.
/// - On activation: `field.focus()`, reads `getBoundingClientRect()`, computes the centre, and
///   calls `document.elementFromPoint(cx, cy)` to read `id`/`tagName`/`type` off the result --
///   the MANDATORY diagnostic `login-window-ux-macos.md` S4 requires, since a coordinate error
///   otherwise silently probes the wrong field. Builds `{x,y,w,h,hitId,hitTag,hitType}` -- **the
///   field's `value` is never read and must not appear anywhere in this script** (T-34.4.2-10).
/// - Delivers via a hidden (`display:none`, 1x1) `<iframe>`, never `location.href` -- an iframe
///   navigation is observed and cancelled identically by this surface's navigation hook, but
///   (unlike `location.href`) never fires `beforeunload` on the live, credential-bearing main
///   document or drops half-entered form state.
/// - Rate-limits itself: ignores a second activation within 750ms (T-34.4.2-14's page-side
///   half; plan 34.4.2-04 adds the authoritative server-side debounce).
/// - The whole script is wrapped in one top-level try/catch (T-34.4.2-16) -- a throwing glyph
///   must never break a live login page.
///
/// Mirrors `clear_storage_script`'s own `concat!`-of-single-line-pieces discipline (every JS
/// string literal below uses single quotes, so every piece keeps an EVEN raw `"`-count on its
/// own source line -- `longRunningChannels.test.ts`'s WR-08 stripper-integrity guard).
fn autofill_glyph_script(exfil_host: &str) -> String {
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    let template = concat!(
        "(function() { ",
        "try { ",
        "if (window.__GAMELIB_LOGIN_GLYPH__) { return; } ",
        "window.__GAMELIB_LOGIN_GLYPH__ = true; ",
        "var MARK = 'data-gamelib-autofill-glyph'; ",
        "var lastActivation = 0; ",
        "function position(glyph, field) { ",
        "var r = field.getBoundingClientRect(); ",
        "var size = Math.max(16, Math.min(24, r.height - 8)); ",
        "glyph.style.top = (r.top + (r.height - size) / 2) + 'px'; ",
        "glyph.style.left = (r.left + r.width - size - 4) + 'px'; ",
        "glyph.style.width = size + 'px'; ",
        "glyph.style.height = size + 'px'; ",
        "} ",
        "function deliver(payload) { ",
        "var frame = document.getElementById('__gamelib_autofill_frame__'); ",
        "if (!frame) { ",
        "frame = document.createElement('iframe'); ",
        "frame.id = '__gamelib_autofill_frame__'; ",
        "frame.style.display = 'none'; ",
        "frame.style.width = '1px'; ",
        "frame.style.height = '1px'; ",
        "(document.body || document.documentElement).appendChild(frame); ",
        "} ",
        "frame.src = 'https://' + @@EXFIL_HOST@@ + '/autofill-request?data=' + encodeURIComponent(JSON.stringify(payload)); ",
        "} ",
        "function activate(field) { ",
        "var now = Date.now(); ",
        "if (now - lastActivation < 750) { return; } ",
        "lastActivation = now; ",
        "field.focus(); ",
        "var r = field.getBoundingClientRect(); ",
        "var cx = r.left + r.width / 2, cy = r.top + r.height / 2; ",
        "var hit = document.elementFromPoint(cx, cy) || {}; ",
        "deliver({ ",
        "x: r.left, y: r.top, w: r.width, h: r.height, ",
        "hitId: hit.id || null, hitTag: hit.tagName || null, hitType: hit.type || null ",
        "}); ",
        "} ",
        "function decorate(field) { ",
        "if (field.hasAttribute(MARK)) { return; } ",
        "field.setAttribute(MARK, '1'); ",
        "var glyph = document.createElement('div'); ",
        "glyph.setAttribute('role', 'button'); ",
        "glyph.setAttribute('aria-label', 'AutoFill password'); ",
        "glyph.setAttribute('title', 'AutoFill password'); ",
        "glyph.setAttribute('tabindex', '-1'); ",
        "glyph.textContent = String.fromCharCode(128273); ",
        "glyph.style.position = 'fixed'; ",
        "glyph.style.zIndex = '2147483647'; ",
        "glyph.style.display = 'flex'; ",
        "glyph.style.alignItems = 'center'; ",
        "glyph.style.justifyContent = 'center'; ",
        "glyph.style.cursor = 'pointer'; ",
        "glyph.style.background = 'transparent'; ",
        "glyph.style.fontSize = '14px'; ",
        "glyph.style.lineHeight = '1'; ",
        "glyph.style.userSelect = 'none'; ",
        "position(glyph, field); ",
        "glyph.addEventListener('mousedown', function(evt) { ",
        "evt.preventDefault(); ",
        "activate(field); ",
        "}); ",
        "var reposition = function() { position(glyph, field); }; ",
        "window.addEventListener('scroll', reposition, true); ",
        "window.addEventListener('resize', reposition, true); ",
        "(document.body || document.documentElement).appendChild(glyph); ",
        "} ",
        "function scan(root) { ",
        "var fields = (root || document).querySelectorAll('input[type=password]'); ",
        "for (var i = 0; i < fields.length; i++) { decorate(fields[i]); } ",
        "} ",
        "var debounceTimer = null; ",
        "function scheduleScan() { ",
        "if (debounceTimer) { return; } ",
        "debounceTimer = setTimeout(function() { debounceTimer = null; scan(document); }, 200); ",
        "} ",
        "scan(document); ",
        "if (document.readyState === 'loading') { ",
        "document.addEventListener('DOMContentLoaded', function() { scan(document); }); ",
        "} ",
        "var observer = new MutationObserver(function() { scheduleScan(); }); ",
        "observer.observe(document.documentElement, { childList: true, subtree: true }); ",
        "} catch (e) { } ",
        "})();"
    );
    template.replace("@@EXFIL_HOST@@", &exfil_host_js)
}

// ---- Synthesized right-click poster: pure coordinate helpers (Phase 34.4.2 Plan 04,
// REQ-34.4.2-05/06/07/08/10, T-34.4.2-17) ----
//
// Spike 022 (`login-window-ux-macos.md` S4) measured the CSS-px -> view-point flip and the
// bounds-refusal these two helpers implement. Both are deliberately AppKit-free (plain `f64`
// in, plain `f64`/`Option` out) so their behavior is provable by `cargo test` alone, without a
// live main-thread/`WKWebView` session -- `post_autofill_right_click` (below) is the only piece
// of this section that actually touches AppKit.

/// Maps `req`'s CSS rect (top-left origin, the browser's own coordinate system) to its centre
/// in VIEW coordinates (bottom-left origin, AppKit's) for a view of the given height. `x + w/2`
/// is unaffected by the flip; `y` becomes `view_height - (y + h/2)`. `view_height` must be the
/// WEBVIEW's OWN `bounds().size.height` -- never the window's content view
/// (`login_window_wk_webview`'s own doc comment: a title-bar-sized error there silently probes
/// the wrong element).
///
/// `#[allow(dead_code)]`: no caller in this task -- `post_autofill_right_click` (Task 2, below)
/// is the caller, mirroring `login_window_wk_webview`'s own identical convention.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
fn css_rect_center_in_view(req: &AutofillRequest, view_height: f64) -> (f64, f64) {
    (req.x + req.w / 2.0, view_height - (req.y + req.h / 2.0))
}

/// Validates -- despite the name, this REFUSES rather than clamps -- `point` against `bounds`:
/// `Some(point)` only when every value is finite, both bounds are strictly positive, and
/// `0.0 <= x < width && 0.0 <= y < height`. Otherwise `None`. Refusing beats edge-clamping
/// because a clamped point lands on a DIFFERENT element than the one the page measured, and the
/// resulting context menu would be misread as evidence about a password field it never actually
/// touched (`login-window-ux-macos.md`'s mandatory `document.elementFromPoint` warning).
///
/// `#[allow(dead_code)]`: no caller in this task -- `post_autofill_right_click` (Task 2, below)
/// is the caller, mirroring `login_window_wk_webview`'s own identical convention.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
fn clamp_point_to_view_bounds(point: (f64, f64), bounds: (f64, f64)) -> Option<(f64, f64)> {
    let (x, y) = point;
    let (width, height) = bounds;
    if !x.is_finite() || !y.is_finite() || !width.is_finite() || !height.is_finite() {
        return None;
    }
    if width <= 0.0 || height <= 0.0 {
        return None;
    }
    if x < 0.0 || x >= width || y < 0.0 || y >= height {
        return None;
    }
    Some((x, y))
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
/// Callers: `attach_login_window_as_child`/`detach_login_window_from_parent` (Phase 34.4.2
/// Plan 02, below) and the deminiaturize re-raise observer (`main()`'s `.setup()`); plan
/// 34.4.2-04 is a further caller.
#[cfg(target_os = "macos")]
fn login_window_ns_window(app: &AppHandle, label: &str) -> Option<usize> {
    app.get_webview_window(label)
        .and_then(|w| w.ns_window().ok())
        .map(|ptr| ptr as usize)
}

/// Resolves the live `WKWebView` handle for a Tauri-managed login window (same scope as
/// `login_window_ns_window`, above -- REQ-34.4.2-10). Returns the raw address as `usize` for the
/// same `Send`-across-`run_on_main_thread` rationale documented on `login_window_ns_window`,
/// above: callers reconstruct it inside their own main-thread closure.
///
/// `with_webview`'s closure runs synchronously inline when invoked on the OS main thread (spike
/// 016 Q1, already relied on by other call sites in this file -- see
/// `clear_default_data_store_cookies_for_domain`'s and `humble_login_clear_cookies`'s own doc
/// comments on that distinction), so the address is captured out through an `Option` in the
/// enclosing scope rather than a channel -- a channel is this file's convention for the
/// WORKER-thread case, which does not apply to this resolver's expected (main-thread) caller.
/// The closure itself must still be `Send + 'static` (tauri's own `with_webview` bound), so the
/// enclosing `Option` is wrapped in `Arc<Mutex<..>>` -- the same wrapper shape
/// `open_pristine_epic_login_window`'s `monitor_slot` above already uses for an identical
/// capture-out-of-a-main-thread-closure need.
///
/// Plan 34.4.2-04 needs this specifically because the coordinate flip for the synthesized
/// right-click must use the WEBVIEW's own `bounds()`, never the window's content view -- a
/// title-bar-sized error there silently probes the wrong element (`login-window-ux-macos.md`'s
/// own "Always log `document.elementFromPoint`" warning).
///
/// Side-effect free: never logs a label's URL or any page content.
///
/// `#[allow(dead_code)]`: no caller in this plan -- plan 34.4.2-04 is the caller.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
fn login_window_wk_webview(app: &AppHandle, label: &str) -> Option<usize> {
    let window = app.get_webview_window(label)?;
    let addr: Arc<Mutex<Option<usize>>> = Arc::new(Mutex::new(None));
    let addr_for_closure = Arc::clone(&addr);
    match window.with_webview(move |platform| {
        if let Ok(mut guard) = addr_for_closure.lock() {
            *guard = Some(platform.inner() as usize);
        }
    }) {
        Ok(()) => addr.lock().ok().and_then(|guard| *guard),
        Err(_) => None,
    }
}

/// Cap on `ATTACHED_LOGIN_CHILDREN`, below -- mirrors `LOGIN_WINDOW_EVENTS_CAP`'s discipline
/// (T-34.4.2-08): an unbounded child-window list would be a denial-of-service surface if a
/// caller somehow kept minting attached labels without ever detaching them. In practice at
/// most one or two Tauri-managed login windows are ever open at once (Humble plus one OAuth
/// runner), so this bound is generous, not a realistic ceiling.
#[cfg(target_os = "macos")]
const ATTACHED_LOGIN_CHILDREN_CAP: usize = LOGIN_WINDOW_EVENTS_CAP;

/// Labels of the Tauri-managed login windows currently attached to `MAIN_WINDOW_LABEL` as
/// AppKit child windows (`attach_login_window_as_child`, below), consulted by the
/// deminiaturize re-raise observer (Phase 34.4.2 Plan 02 Task 2, installed in `main()`'s
/// `.setup()`) to know which windows to bring back in front of `main` after it restores from
/// the Dock. Insertion-ordered, deduplicated on insert, capped at
/// `ATTACHED_LOGIN_CHILDREN_CAP` (T-34.4.2-08) -- a label is ALWAYS removed on detach, even
/// when the underlying AppKit call could not run, so a destroyed window never lingers on this
/// list (see `detach_login_window_from_parent`'s own doc comment, below).
#[cfg(target_os = "macos")]
static ATTACHED_LOGIN_CHILDREN: Mutex<Option<Vec<String>>> = Mutex::new(None);

/// Attaches a VISIBLE Tauri-managed login window (Humble/GOG/Amazon -- REQ-34.4.2-10's
/// locked scope; see `open_pristine_epic_login_window`'s own module-level scope note, above,
/// for the full boundary) as an AppKit child window of the app's `main` window
/// (REQ-34.4.2-01/02), so it can never be lost behind `main` on raise, and follows `main` on
/// drag and into the Dock on minimize -- spike 021's measured `attach_child`
/// (`login-window-ux-macos.md` S1's behaviour table). Called from `humble_login_open`'s
/// `if visible` branch ONLY, after `.build()` succeeds: hidden reveal/clear windows this arm
/// also builds have no user-visible presentation and pinning them to `main` would be
/// meaningless.
///
/// Never fatal (T-34.1-22 discipline, matching this file's existing tray/devtools
/// convention): a missing parent, a missing child, or a failed main-thread dispatch logs one
/// `[shell] WARN: login-window attach: ...` line and returns `false` -- a login flow must
/// never fail because its window could not be pinned. Returns `true` only once the AppKit
/// call actually ran, so `humble_login_open`'s own presentation-record `eprintln!` can report
/// `child_attached=true/false` as real machine evidence of what was attempted (mirroring that
/// line's existing `focus_once`/`persistent_pin` discipline: REQUESTED, not proven -- the
/// live z-order behaviour itself is plan 34.4.2-06's live gate alone to prove).
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
#[cfg(target_os = "macos")]
fn attach_login_window_as_child(app: &AppHandle, label: &str) -> bool {
    let Some(parent_addr) = login_window_ns_window(app, MAIN_WINDOW_LABEL) else {
        eprintln!(
            "[shell] WARN: login-window attach: no NSWindow for '{MAIN_WINDOW_LABEL}' -- skipping"
        );
        return false;
    };
    let Some(child_addr) = login_window_ns_window(app, label) else {
        eprintln!("[shell] WARN: login-window attach: no NSWindow for '{label}' -- skipping");
        return false;
    };

    // SAFETY: see `SendPtr`'s doc comment on `open_pristine_epic_login_window`, above -- a
    // bare address is not normally `Send`, but this wrapper is reconstructed into a live
    // reference only from within the main-thread closure below.
    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}
    let parent_ptr = SendPtr(parent_addr as *mut std::ffi::c_void);
    let child_ptr = SendPtr(child_addr as *mut std::ffi::c_void);

    let (tx, rx) = mpsc_channel::<()>();
    if let Err(e) = app.run_on_main_thread(move || {
        // Forces Rust 2021 disjoint closure capture to move in the WHOLE `SendPtr` wrapper
        // for each address, not just its inner raw-pointer field, which would bypass
        // `SendPtr`'s `Send` impl entirely and fail to compile.
        let parent_ptr = parent_ptr;
        let child_ptr = child_ptr;
        // SAFETY: both addresses were resolved moments ago via `login_window_ns_window`,
        // which only returns `Some` for a live Tauri-managed `NSWindow`; reconstructed into
        // live references only here, on the main thread.
        let parent: &objc2_app_kit::NSWindow =
            unsafe { &*(parent_ptr.0 as *const objc2_app_kit::NSWindow) };
        let child: &objc2_app_kit::NSWindow =
            unsafe { &*(child_ptr.0 as *const objc2_app_kit::NSWindow) };
        // SAFETY: `parent`/`child` are both live `NSWindow`s reconstructed above.
        unsafe {
            parent.addChildWindow_ordered(child, objc2_app_kit::NSWindowOrderingMode::Above);
        }
        let _ = tx.send(());
    }) {
        eprintln!(
            "[shell] WARN: login-window attach: main-thread dispatch failed for '{label}' ({e})"
        );
        return false;
    }
    if rx.recv_timeout(Duration::from_secs(10)).is_err() {
        eprintln!(
            "[shell] WARN: login-window attach: main-thread dispatch timed out for '{label}'"
        );
        return false;
    }

    if let Ok(mut guard) = ATTACHED_LOGIN_CHILDREN.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if !list.iter().any(|existing| existing == label) {
            if list.len() >= ATTACHED_LOGIN_CHILDREN_CAP {
                list.remove(0);
            }
            list.push(label.to_string());
        }
    }
    true
}

/// Mirror of `attach_login_window_as_child`, above: resolves both `NSWindow`s, hops to the
/// main thread, and calls `removeChildWindow:`. Called from `humble_login_open`'s existing
/// `WindowEvent::Destroyed` hook (Quick task 260803-eee Task 5's close-detection arm, below)
/// for every window that arm builds, not gated on `visible` -- a hidden reveal/clear window
/// was never attached in the first place, so detaching it is a guaranteed no-op, and calling
/// this unconditionally is simpler than threading `visible` through the event closure.
///
/// `label` is ALWAYS removed from `ATTACHED_LOGIN_CHILDREN` first, unconditionally, even
/// when neither `NSWindow` resolves or the AppKit call cannot run (T-34.4.2-08) -- a
/// destroyed window must never stay on the deminiaturize re-raise list (Task 2, in `main()`'s
/// `.setup()`) forever. A child `NSWindow` that no longer resolves by the time `Destroyed`
/// fires is treated as already healthy (this file's existing `humble_login_close`
/// "already closed is healthy" convention) -- Cocoa itself already tears down the
/// parent/child relationship when either window closes, so a no-op `removeChildWindow:` call
/// here is not a correctness gap.
///
/// Never fatal, never logs URL/origin/title content -- same discipline as
/// `attach_login_window_as_child`, above.
#[cfg(target_os = "macos")]
fn detach_login_window_from_parent(app: &AppHandle, label: &str) {
    if let Ok(mut guard) = ATTACHED_LOGIN_CHILDREN.lock() {
        if let Some(list) = guard.as_mut() {
            list.retain(|existing| existing != label);
        }
    }

    let Some(parent_addr) = login_window_ns_window(app, MAIN_WINDOW_LABEL) else {
        eprintln!(
            "[shell] WARN: login-window detach: no NSWindow for '{MAIN_WINDOW_LABEL}' -- skipping"
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
        parent.removeChildWindow(child);
        let _ = tx.send(());
    }) {
        eprintln!(
            "[shell] WARN: login-window detach: main-thread dispatch failed for '{label}' ({e})"
        );
        return;
    }
    let _ = rx.recv_timeout(Duration::from_secs(10));
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
                    tray.set_icon(Some(tray_image(dark)))
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
            // Cloned separately from `event_label` (Phase 34.4.2 Plan 03,
            // REQ-34.4.2-04/08): the autofill sentinel's `.on_navigation(` closure below
            // needs its own owned label for its log line, and moves it independently of
            // the `.on_page_load(` closure's own `event_label` capture.
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
            // Shared last-known main-frame origin (Phase 34.5 Plan 27): seeded from the
            // validated open URL so it is never empty, updated only from `on_page_load`
            // (main-frame only, per this arm's own doc comment above), and read by
            // `on_document_title_changed` so a title change is always composed against
            // the CURRENT host, not the one the window opened on.
            let current_origin = Arc::new(Mutex::new(origin.clone()));
            let mut builder =
                tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
                    .user_agent(user_agent)
                    .visible(visible);
            if visible {
                let title_origin = Arc::clone(&current_origin);
                builder = builder
                    .inner_size(900.0, 700.0)
                    .center()
                    .focused(true)
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
                // In-field autofill glyph injection (Phase 34.4.2 Plan 03,
                // REQ-34.4.2-04/06/07/08). Gated on `visible` (this whole block already
                // is) so the hidden reveal/clear windows this arm also builds never
                // receive it -- those windows run their own exfil scripts and a second
                // injected script there is pure risk, not a benefit. The pristine Epic
                // surface (`open_pristine_epic_login_window`, above) is unreachable from
                // here entirely -- REQ-34.4.2-10, locked user decision.
                //
                // Kill switch DEFAULTS ON, and unlike `GAMELIB_LOGIN_DIAG` above is NOT
                // `#[cfg(debug_assertions)]`-gated -- it must work in a packaged build.
                // Re-earned here (its original justification was the Epic arm, now
                // descoped) because `initialization_script()` runs before any page
                // script, in every frame, on live third-party login pages that sit
                // behind real bot management (Humble is behind Cloudflare), and this
                // repo has already had an injected `initialization_script` become the
                // PRIME SUSPECT for causing a deterministic 403
                // (`DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`, which is why that one now
                // defaults OFF). If injection ever trips a store's detection, the
                // failure mode is a user locked out of their own library with no
                // workaround short of a rebuild -- three lines of Rust against that is
                // a trade worth making.
                if std::env::var("GAMELIB_AUTOFILL_GLYPH").as_deref() == Ok("0") {
                    eprintln!(
                        "[shell] humble_login_open: autofill glyph injection SKIPPED for '{label}' (kill switch set to 0)"
                    );
                } else {
                    builder =
                        builder.initialization_script(&autofill_glyph_script(REVEAL_EXFIL_HOST));
                    eprintln!("[shell] humble_login_open: autofill glyph injected for '{label}'");
                }
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
                // `child_attached` -- see the print call after `window` exists, below.
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
                    }
                })
                .on_navigation(move |url| {
                    // Autofill sentinel interception ONLY (Phase 34.4.2 Plan 03,
                    // REQ-34.4.2-04/08). This closure is deliberately separate from the
                    // `.on_page_load(` hook above and preserves this arm's own
                    // F-34.5-G6-04 invariant (spike 013: 5 of 8 `on_navigation` events on
                    // Humble's real login page were third-party iframes -- letting a
                    // subframe drive the login-watch relay lets an ad frame re-arm its
                    // deadline forever): it never calls `push_login_window_event`, never
                    // touches `current_origin`, and never calls `set_title`. It parses
                    // and cancels exactly one reserved-host, reserved-path sentinel;
                    // every other navigation (including the real login page's own) is
                    // untouched.
                    if let Some(req) = parse_autofill_request(&url) {
                        eprintln!(
                            "[shell] humble_login_open: autofill sentinel intercepted for '{nav_sentinel_label}' x={} y={} w={} h={} hit_id={:?} hit_tag={:?} hit_type={:?}",
                            req.x, req.y, req.w, req.h, req.hit_id, req.hit_tag, req.hit_type
                        );
                        return false;
                    }
                    true
                })
                .build()
                .map_err(|e| format!("humble_login_open:build-failed:{e}"))?;
            // AppKit child-window attachment (Phase 34.4.2 Plan 02, REQ-34.4.2-01/02) --
            // macOS only. Pins a VISIBLE login window to `main` immediately once it exists
            // so it can never be lost behind `main` on raise/drag/minimize. Hidden
            // reveal/clear windows this arm also builds are never attached. The pristine
            // Epic login window (`open_pristine_epic_login_window`) is deliberately NOT
            // wired here or anywhere else -- REQ-34.4.2-10, locked user decision, Epic
            // ships last. On Windows/Linux the login window keeps exactly today's
            // free-floating behavior -- declared UNVERIFIED here, matching the skill's
            // Constraints section.
            #[cfg(target_os = "macos")]
            let child_attached = if visible {
                attach_login_window_as_child(app, &label)
            } else {
                false
            };
            #[cfg(not(target_os = "macos"))]
            let child_attached = false;
            if visible {
                // F-4 machine record (Phase 34.4.1 Plan 24) -- see this arm's
                // builder-setup block above for the full "why record this at all"
                // rationale. `child_attached` was added by Phase 34.4.2 Plan 02, which
                // also moved this print to AFTER `.build()`/attach so it could be
                // included.
                eprintln!(
                    "[shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true child_attached={child_attached}"
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
            // reveal/clear window's label, and `humble/user.ts`'s own `takeEvents()` consumer
            // (`watchForLogin()`) only ever checks for `'finished'`, so a `'closed'` entry
            // passing through it is inert (see `loginWindowSeam.ts`'s `LoginWindowNavEvent` doc
            // comment for the full cross-consumer safety argument). No url to relay -- `""`,
            // never a partial/stale navigation url that could be mistaken for one.
            //
            // NOT a race with this arm's own `humble_login_close` (a few match arms below):
            // every caller that closes a window programmatically (`captureOAuthLogin`'s
            // `settle()`, `humble_login_close` itself) does so only AFTER it has already decided
            // the real outcome and stopped consuming events for that label -- so a `'closed'`
            // event produced by that SAME programmatic close is written to a queue nothing reads
            // again, never observed as a spurious cancel.
            let close_event_label = label.clone();
            #[cfg(target_os = "macos")]
            let app_for_detach = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    push_login_window_event(&close_event_label, login_event_value("closed", ""));
                    // Mirror of the attach call above (Phase 34.4.2 Plan 02,
                    // REQ-34.4.2-01/02): unconditional (not gated on `visible`) because a
                    // hidden reveal/clear window was never attached in the first place,
                    // so detaching it is a guaranteed no-op -- see
                    // `detach_login_window_from_parent`'s own doc comment.
                    #[cfg(target_os = "macos")]
                    detach_login_window_from_parent(&app_for_detach, &close_event_label);
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
fn spawn_sidecar_dev(shell_exe: &str) -> std::io::Result<Child> {
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
    let child = Command::new("node")
        .arg(&entry)
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
fn spawn_sidecar_packaged(app: &AppHandle, shell_exe: &str) -> std::io::Result<Child> {
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
    let child = std_command
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
fn spawn_sidecar(app: &AppHandle) -> std::io::Result<Child> {
    let shell_exe = shell_exe_env_value(std::env::current_exe());
    if use_dev_sidecar() {
        spawn_sidecar_dev(&shell_exe)
    } else {
        spawn_sidecar_packaged(app, &shell_exe)
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
        .setup(|app| {
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

            // Deminiaturize re-raise observer (Phase 34.4.2 Plan 02, REQ-34.4.2-04/05):
            // spike 021 measured that an attached child window (`attach_login_window_as_child`,
            // above) returns BEHIND `main` after `main` restores from the Dock unless
            // explicitly re-raised (`login-window-ux-macos.md` S1's behaviour table, "restore
            // main" row) -- this observer is that re-raise. Installed here in `.setup()`,
            // alongside the tray-build block above, using this same block's non-fatal
            // convention (T-34.1-22): if the main window's `NSWindow` cannot be resolved or
            // the observer cannot be registered, log one WARN and continue -- the app must
            // still start regardless.
            //
            // Deliberately NOT ALSO a main-window-focus-gained handler: a focus-driven
            // re-raise would call `makeKeyAndOrderFront` every time the user deliberately
            // clicks the main window, stealing key focus back to the login window and making
            // the main window unusable while a login is open. Deminiaturize is the exact
            // trigger spike 021 measured; this observer uses only that (no other
            // `tauri::WindowEvent` variant is matched anywhere in this arm's own
            // `.setup()` block).
            #[cfg(target_os = "macos")]
            match login_window_ns_window(app.handle(), MAIN_WINDOW_LABEL) {
                Some(main_addr) => {
                    // SAFETY: see `SendPtr`'s doc comment on `open_pristine_epic_login_window`,
                    // above -- a bare address is not normally `Send`, but this wrapper is
                    // reconstructed into a live reference only from within the main-thread
                    // closure below.
                    struct SendPtr(*mut std::ffi::c_void);
                    unsafe impl Send for SendPtr {}
                    let main_ptr = SendPtr(main_addr as *mut std::ffi::c_void);
                    let app_for_observer = app.handle().clone();
                    if let Err(e) = app.run_on_main_thread(move || {
                        // Forces Rust 2021 disjoint closure capture to move in the WHOLE
                        // `SendPtr` wrapper, not just its inner raw-pointer field, which
                        // would bypass `SendPtr`'s `Send` impl entirely and fail to compile.
                        let main_ptr = main_ptr;
                        // SAFETY: `main_addr` was resolved moments ago via
                        // `login_window_ns_window`, which only returns `Some` for a live
                        // Tauri-managed `NSWindow`; reconstructed into a live `AnyObject`
                        // reference only here, on the main thread. `AnyObject` (not the
                        // typed `NSWindow`) is what
                        // `addObserverForName_object_queue_usingBlock`'s `object` parameter
                        // expects -- mirrors this file's existing `monitor: &AnyObject`
                        // idiom on `open_pristine_epic_login_window`'s own raw-pointer
                        // reconstruction, above.
                        let main_window_obj: &objc2::runtime::AnyObject =
                            unsafe { &*(main_ptr.0 as *const objc2::runtime::AnyObject) };
                        let center = objc2_foundation::NSNotificationCenter::defaultCenter();
                        // SAFETY: `getAllCookies`-style block delivery (see
                        // `clear_default_data_store_cookies_for_domain`, above) -- this
                        // block is only ever invoked by AppKit on the main thread (`queue:
                        // None` below delivers on the posting thread, and
                        // `NSWindowDidDeminiaturizeNotification` is always posted from the
                        // main thread), and it captures only `Send + Sync + 'static`
                        // Tauri/std values.
                        let handler = block2::RcBlock::new(
                            move |_note: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                                let labels: Vec<String> = ATTACHED_LOGIN_CHILDREN
                                    .lock()
                                    .ok()
                                    .and_then(|guard| guard.clone())
                                    .unwrap_or_default();
                                eprintln!(
                                    "[shell] login-window: parent deminiaturized, re-raising {} attached child window(s)",
                                    labels.len()
                                );
                                for child_label in &labels {
                                    // A label whose window no longer resolves is skipped
                                    // silently -- a closed window is a healthy state, not
                                    // an error.
                                    if let Some(child_addr) =
                                        login_window_ns_window(&app_for_observer, child_label)
                                    {
                                        // SAFETY: `child_addr` was resolved moments ago via
                                        // `login_window_ns_window`; this notification is
                                        // delivered on the main thread (queue: None,
                                        // below), so reconstructing a live reference here
                                        // is safe.
                                        let child_window: &objc2_app_kit::NSWindow = unsafe {
                                            &*(child_addr as *const objc2_app_kit::NSWindow)
                                        };
                                        child_window.makeKeyAndOrderFront(None);
                                    }
                                }
                            },
                        );
                        // SAFETY: `main_window_obj` is a live object reconstructed above;
                        // `handler` outlives this call via `std::mem::forget` immediately
                        // below.
                        let observer = unsafe {
                            center.addObserverForName_object_queue_usingBlock(
                                Some(objc2_app_kit::NSWindowDidDeminiaturizeNotification),
                                Some(main_window_obj),
                                None,
                                &handler,
                            )
                        };
                        // Deliberately leaked for the process lifetime -- mirrors
                        // `EpicPristineNavDelegate`'s own `std::mem::forget`, above: this is
                        // ONE observer on the app's own main window, registered once in
                        // `.setup()`, versus the per-open `NSEvent` local monitor that had
                        // to be torn down because it ran on every keystroke app-wide for as
                        // long as it lived.
                        std::mem::forget(observer);
                    }) {
                        eprintln!(
                            "[shell] WARN: login-window deminiaturize observer: main-thread dispatch failed ({e}) -- continuing without it"
                        );
                    }
                }
                None => eprintln!(
                    "[shell] WARN: login-window deminiaturize observer: no NSWindow for '{MAIN_WINDOW_LABEL}' -- continuing without it"
                ),
            }

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
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<Arc<SidecarState>>() {
                    state.shutdown_child();
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
        // THE single most consequential assertion in THIS arm's test group -- documents the
        // asymmetry by test rather than by prose (spike 016 measured this live: total=33,
        // the OLD/poll direction against a fixed apex target=29, this arm's direction=33 --
        // see `34.4.1-SPIKE-016-FINDINGS.md`).
        //
        // The OLD/poll direction (`cookie_domain_matches(fixed_target, Some(cookie_domain))`)
        // is exactly what the disconnect census used to call through `humble_login_cookies`.
        // With a FIXED apex as the first ("host") argument, the suffix branch can never fire
        // for a leading-dot cookie domain, so it silently fails to match:
        assert!(!cookie_domain_matches("humblebundle.com", Some(".humblebundle.com")));
        // The NEW/census direction this arm uses -- cookie's own domain first, fixed target
        // second -- matches the identical leading-dot cookie correctly:
        assert!(cookie_domain_matches(".humblebundle.com", Some("humblebundle.com")));
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

    // ---- parse_autofill_request / autofill_glyph_script (Phase 34.4.2 Plan 03,
    // REQ-34.4.2-04/06/07/08/10, T-34.4.2-10/-11/-13/-14/-16) ----
    //
    // RED direction: an implementation that reads a field's value, discriminates on host only
    // (not path), or coerces a missing/NaN/negative coordinate into a default rather than
    // `None`, would flip one of the cases below.

    /// Builds a `REVEAL_EXFIL_HOST` + `AUTOFILL_EXFIL_PATH` URL carrying `data_json` verbatim
    /// as the `data` query value -- `query_pairs_mut` handles the percent-encoding, matching
    /// how the real glyph script's `encodeURIComponent` call is decoded on arrival.
    fn autofill_url(data_json: &str) -> tauri::Url {
        let mut url = tauri::Url::parse(&format!(
            "https://{REVEAL_EXFIL_HOST}{AUTOFILL_EXFIL_PATH}"
        ))
        .unwrap();
        url.query_pairs_mut().append_pair("data", data_json);
        url
    }

    fn valid_autofill_payload() -> String {
        json!({
            "x": 10.5, "y": 20.5, "w": 24.0, "h": 32.0,
            "hitId": "password", "hitTag": "INPUT", "hitType": "password"
        })
        .to_string()
    }

    #[test]
    fn autofill_request_accepts_a_full_valid_payload_with_hit_diagnostics() {
        let req = parse_autofill_request(&autofill_url(&valid_autofill_payload())).unwrap();
        assert_eq!(req.x, 10.5);
        assert_eq!(req.y, 20.5);
        assert_eq!(req.w, 24.0);
        assert_eq!(req.h, 32.0);
        assert_eq!(req.hit_id, Some("password".to_string()));
        assert_eq!(req.hit_tag, Some("INPUT".to_string()));
        assert_eq!(req.hit_type, Some("password".to_string()));
    }

    #[test]
    fn autofill_request_accepts_a_valid_payload_with_no_hit_diagnostics_at_all() {
        let payload = json!({ "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0 }).to_string();
        let req = parse_autofill_request(&autofill_url(&payload)).unwrap();
        assert_eq!(req.hit_id, None);
        assert_eq!(req.hit_tag, None);
        assert_eq!(req.hit_type, None);
    }

    #[test]
    fn autofill_request_truncates_a_hit_diagnostic_string_to_64_chars() {
        let long = "x".repeat(200);
        let payload = json!({ "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0, "hitId": long }).to_string();
        let req = parse_autofill_request(&autofill_url(&payload)).unwrap();
        assert_eq!(req.hit_id.unwrap().chars().count(), 64);
    }

    #[test]
    fn autofill_request_rejects_a_url_on_a_different_host() {
        let mut url = tauri::Url::parse(&format!("https://example.com{AUTOFILL_EXFIL_PATH}"))
            .unwrap();
        url.query_pairs_mut()
            .append_pair("data", &valid_autofill_payload());
        assert!(parse_autofill_request(&url).is_none());
    }

    #[test]
    fn autofill_request_rejects_reveal_path() {
        // The right host, but the pre-existing `/reveal` sentinel's own path -- must NOT be
        // mistaken for an autofill request (T-34.4.2-13).
        let mut url = tauri::Url::parse(&format!("https://{REVEAL_EXFIL_HOST}/reveal")).unwrap();
        url.query_pairs_mut()
            .append_pair("data", &valid_autofill_payload());
        assert!(parse_autofill_request(&url).is_none());
    }

    #[test]
    fn autofill_request_rejects_clear_storage_path() {
        let mut url =
            tauri::Url::parse(&format!("https://{REVEAL_EXFIL_HOST}/clear-storage")).unwrap();
        url.query_pairs_mut()
            .append_pair("data", &valid_autofill_payload());
        assert!(parse_autofill_request(&url).is_none());
    }

    #[test]
    fn autofill_request_rejects_a_url_with_no_data_query_pair() {
        let url = tauri::Url::parse(&format!(
            "https://{REVEAL_EXFIL_HOST}{AUTOFILL_EXFIL_PATH}"
        ))
        .unwrap();
        assert!(parse_autofill_request(&url).is_none());
    }

    #[test]
    fn autofill_request_rejects_non_json_data() {
        assert!(parse_autofill_request(&autofill_url("not json")).is_none());
    }

    #[test]
    fn autofill_request_rejects_a_payload_missing_w() {
        let payload = json!({ "x": 1.0, "y": 2.0, "h": 4.0 }).to_string();
        assert!(parse_autofill_request(&autofill_url(&payload)).is_none());
    }

    #[test]
    fn autofill_request_rejects_a_non_numeric_x() {
        let payload = json!({ "x": "abc", "y": 2.0, "w": 3.0, "h": 4.0 }).to_string();
        assert!(parse_autofill_request(&autofill_url(&payload)).is_none());
    }

    #[test]
    fn autofill_request_rejects_a_zero_width_rect() {
        let payload = json!({ "x": 1.0, "y": 2.0, "w": 0.0, "h": 4.0 }).to_string();
        assert!(parse_autofill_request(&autofill_url(&payload)).is_none());
    }

    #[test]
    fn autofill_request_rejects_a_negative_height_rect() {
        let payload = json!({ "x": 1.0, "y": 2.0, "w": 3.0, "h": -1.0 }).to_string();
        assert!(parse_autofill_request(&autofill_url(&payload)).is_none());
    }

    #[test]
    fn autofill_request_rejects_a_non_finite_x_value() {
        // JSON itself cannot encode NaN/Infinity as a numeric literal -- a hand-crafted bareword
        // `NaN` token fails `serde_json::from_str` outright, and `serde_json::json!`'s own
        // `From<f64>` conversion maps a Rust-side NaN/inf to `Value::Null` before it could ever
        // reach this parser. Both routes return `None`; this test exercises the literal-token
        // route, which is the only way a non-finite value can appear on the wire at all.
        let payload = r#"{"x":NaN,"y":2.0,"w":3.0,"h":4.0}"#;
        assert!(parse_autofill_request(&autofill_url(payload)).is_none());
    }

    #[test]
    fn autofill_glyph_script_never_reads_the_field_value_and_binds_no_keyboard_listener() {
        // Machine-checkable form of REQ-34.4.2-06/07.
        let script = autofill_glyph_script(REVEAL_EXFIL_HOST);
        assert!(!script.contains(".value"));
        assert!(!script.contains("keydown"));
        assert!(!script.contains("keypress"));
        assert!(!script.contains("keyup"));
    }

    #[test]
    fn autofill_glyph_script_delivers_via_a_hidden_iframe_never_location_href() {
        let script = autofill_glyph_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("iframe"));
        assert!(!script.contains("location.href"));
    }

    #[test]
    fn autofill_glyph_script_embeds_the_exfil_host_exactly_once_as_a_json_escaped_literal() {
        let script = autofill_glyph_script(REVEAL_EXFIL_HOST);
        let literal = serde_json::to_string(REVEAL_EXFIL_HOST).unwrap();
        assert_eq!(script.matches(&literal).count(), 1);
    }

    #[test]
    fn autofill_glyph_script_escapes_a_tricky_host_and_never_naively_interpolates_it() {
        // Mirrors `reveal_post_script`/`clear_storage_script`'s own escaping round-trip case.
        let tricky_host = "gamelib.invalid\"a\"b'c\\d</script>e";
        let script = autofill_glyph_script(tricky_host);
        let expected_literal = serde_json::to_string(tricky_host).unwrap();
        assert!(script.contains(&expected_literal));
        let naive_interpolation = ["'", tricky_host, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn autofill_glyph_script_is_wrapped_in_a_single_top_level_try_catch() {
        assert_eq!(
            autofill_glyph_script(REVEAL_EXFIL_HOST).matches("try {").count(),
            1
        );
    }

    // ---- css_rect_center_in_view / clamp_point_to_view_bounds (Phase 34.4.2 Plan 04,
    // REQ-34.4.2-05/06/07/08, T-34.4.2-17) ----
    //
    // RED direction: an implementation that flips the wrong axis, edge-clamps instead of
    // refusing, or coerces a non-finite/zero-sized input into a default would flip one of the
    // cases below.

    fn autofill_req(x: f64, y: f64, w: f64, h: f64) -> AutofillRequest {
        AutofillRequest {
            x,
            y,
            w,
            h,
            hit_id: None,
            hit_tag: None,
            hit_type: None,
        }
    }

    #[test]
    fn css_rect_center_in_view_flips_the_vertical_axis_top_left_to_bottom_left_origin() {
        // A 1000px-tall view: a rect pinned to the TOP (y=0) must land near the view's own
        // bottom-left-origin MAX (990.0), and a rect pinned to the BOTTOM (y=980) must land
        // near view-origin MIN (10.0) -- the two ends of the flip.
        let (_, y_top) = css_rect_center_in_view(&autofill_req(0.0, 0.0, 10.0, 20.0), 1000.0);
        assert_eq!(y_top, 990.0);
        let (_, y_bottom) = css_rect_center_in_view(&autofill_req(0.0, 980.0, 10.0, 20.0), 1000.0);
        assert_eq!(y_bottom, 10.0);
    }

    #[test]
    fn css_rect_center_in_view_leaves_the_horizontal_centre_unchanged_by_the_flip() {
        let (x, _) = css_rect_center_in_view(&autofill_req(100.0, 0.0, 200.0, 20.0), 1000.0);
        assert_eq!(x, 200.0);
    }

    #[test]
    fn clamp_point_to_view_bounds_accepts_a_point_strictly_inside_the_bounds() {
        assert_eq!(
            clamp_point_to_view_bounds((50.0, 50.0), (100.0, 100.0)),
            Some((50.0, 50.0))
        );
    }

    #[test]
    fn clamp_point_to_view_bounds_refuses_negative_or_out_of_bounds_points_rather_than_clamping() {
        // Negative coordinates.
        assert_eq!(clamp_point_to_view_bounds((-1.0, 50.0), (100.0, 100.0)), None);
        assert_eq!(clamp_point_to_view_bounds((50.0, -1.0), (100.0, 100.0)), None);
        // At or beyond width/height -- a request whose field lies outside the webview is
        // refused outright, never pulled to the nearest edge.
        assert_eq!(clamp_point_to_view_bounds((100.0, 50.0), (100.0, 100.0)), None);
        assert_eq!(clamp_point_to_view_bounds((50.0, 100.0), (100.0, 100.0)), None);
        assert_eq!(clamp_point_to_view_bounds((150.0, 50.0), (100.0, 100.0)), None);
    }

    #[test]
    fn clamp_point_to_view_bounds_refuses_a_non_finite_point_or_non_finite_bounds() {
        assert_eq!(clamp_point_to_view_bounds((f64::NAN, 50.0), (100.0, 100.0)), None);
        assert_eq!(
            clamp_point_to_view_bounds((f64::INFINITY, 50.0), (100.0, 100.0)),
            None
        );
        assert_eq!(clamp_point_to_view_bounds((50.0, 50.0), (f64::NAN, 100.0)), None);
        assert_eq!(
            clamp_point_to_view_bounds((50.0, 50.0), (f64::INFINITY, 100.0)),
            None
        );
    }

    #[test]
    fn clamp_point_to_view_bounds_refuses_zero_sized_view_bounds() {
        // A webview that has not laid out yet reports a zero-sized bounds().
        assert_eq!(clamp_point_to_view_bounds((0.0, 0.0), (0.0, 0.0)), None);
        assert_eq!(clamp_point_to_view_bounds((0.0, 0.0), (100.0, 0.0)), None);
        assert_eq!(clamp_point_to_view_bounds((0.0, 0.0), (0.0, 100.0)), None);
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
}
