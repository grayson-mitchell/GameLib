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

// ---- Rust-side keyring dispatch (Phase 28: sidecar->Rust rustInvoke channel) ----

/// Dispatches a `rustInvoke` frame's `channel`/`args` to the matching keyring operation.
/// The Keychain `service`/`account` are the compile-time `KEYRING_SERVICE`/`KEYRING_ACCOUNT`
/// constants ONLY — never sourced from `args` (threat T-28-03: the sidecar must not be able
/// to address an arbitrary Keychain entry). Error mapping follows this file's existing flat
/// `String` convention (`.map_err(|e| e.to_string())`, see `open_external` above); a bare
/// `keyring::Error` variant is never returned as-is.
///
/// Also dispatches `dialog_open` (Phase 30 Plan 03). `app` is threaded through for that arm:
/// the folder picker is reached via the AppHandle, not via `args` — the picked path comes
/// FROM the OS dialog, never INTO it from the renderer/sidecar (T-30-11/T-30-12).
fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {
    match channel {
        "keyring_get" => match Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
            Ok(entry) => match entry.get_password() {
                Ok(secret) => Ok(Value::String(secret)),
                // No entry yet is a healthy, expected first-run state — NOT an
                // unavailable backend (Pitfall 1 / D-06). Must not be reported as an error.
                Err(keyring::Error::NoEntry) => Ok(Value::Null),
                Err(e) => {
                    eprintln!("[shell] keyring {channel} failed: {e:?}");
                    Err(format!("keyring:unavailable:{e}"))
                }
            },
            Err(e) => {
                eprintln!("[shell] keyring {channel} failed: {e:?}");
                Err(format!("keyring:unavailable:{e}"))
            }
        },
        "keyring_set" => {
            let secret = match args.first().and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Err("keyring:bad-args".into()),
            };
            match Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
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
        "keyring_delete" => match Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
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
        },
        "keyring_available" => match Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
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
        },
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
            let text = args
                .first()
                .and_then(|v| v.as_str())
                .ok_or("clipboard_write_text:bad-args")?;
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
        "clipboard_read_text" => app
            .clipboard()
            .read_text()
            .map(Value::String)
            .map_err(|e| e.to_string()),
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

/// DEV MODE: spawn `node <sidecar-entry>` with piped stdio, logging exactly what it runs so a
/// spawn/path failure is visible in the `tauri dev` terminal (previously the whole leg was
/// invisible: a piped stdout consumed by the reader thread and no diagnostics meant even a
/// healthy sidecar — or a silent spawn failure — produced zero terminal output).
fn spawn_sidecar_dev() -> std::io::Result<Child> {
    let entry = resolve_sidecar_entry();
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    let exists = std::path::Path::new(&entry).exists();
    eprintln!("[shell] spawning sidecar (dev): node \"{entry}\"");
    eprintln!("[shell]   cwd={cwd}");
    eprintln!("[shell]   entry_exists={exists}");
    let child = Command::new("node")
        .arg(&entry)
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
fn spawn_sidecar_packaged(app: &AppHandle) -> std::io::Result<Child> {
    let shell_command: ShellCommand = app.shell().sidecar("gamelib-sidecar").map_err(|e| {
        std::io::Error::other(format!("sidecar externalBin resolution failed: {e}"))
    })?;
    let mut std_command: Command = shell_command.into();
    let program = std_command.get_program().to_string_lossy().to_string();
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    let exists = std::path::Path::new(&program).exists();
    eprintln!("[shell] spawning sidecar (packaged): \"{program}\"");
    eprintln!("[shell]   cwd={cwd}");
    eprintln!("[shell]   entry_exists={exists}");
    let child = std_command
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

/// Dispatches to the dev or packaged spawn path per `use_dev_sidecar()`.
fn spawn_sidecar(app: &AppHandle) -> std::io::Result<Child> {
    if use_dev_sidecar() {
        spawn_sidecar_dev()
    } else {
        spawn_sidecar_packaged(app)
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
                                            app_handle.get_webview_window("main")
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
                                            app_handle.get_webview_window("main")
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

            // Dev-only: force the webview devtools open (the dev webview exposes no
            // right-click inspect on macOS) so renderer errors are inspectable, and
            // confirm the webview window actually exists.
            #[cfg(debug_assertions)]
            {
                match app.get_webview_window("main") {
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
#[cfg(test)]
mod tests {
    use super::*;

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
}
