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
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

// ---- Contract mirror (keep in lockstep with src/common/types/sidecarTransport.ts) ----

/// Printed once by the sidecar on stdout when it has installed its Electron shims and
/// finished importing the backend modules. Mirrors READY_SENTINEL.
const READY_SENTINEL: &str = "__GAMELIB_SIDECAR_READY__";

/// Tauri event name re-emitted to the webview for every SidecarNotification.
/// Mirrors FRONTEND_MESSAGE_EVENT.
const FRONTEND_MESSAGE_EVENT: &str = "frontend_message";

/// Reserved channel the store-snapshot command invokes on.
const STORE_SNAPSHOT_CHANNEL: &str = "sidecar:store-snapshot";

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
const LONG_RUNNING_CHANNELS: &[&str] = &[
    "install",
    "updateGame",
    "uninstall",
    "checkGameUpdates",
    "refreshLibrary",
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
    /// Kept alive so the child is not reaped; the shell owns the sidecar's lifetime.
    _child: Mutex<Child>,
}

impl SidecarState {
    fn next_id(&self) -> String {
        self.counter.fetch_add(1, Ordering::Relaxed).to_string()
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

/// Spawn `node <sidecar-entry>` with piped stdio, logging exactly what it runs so a spawn/path
/// failure is visible in the `tauri dev` terminal (previously the whole leg was invisible: a
/// piped stdout consumed by the reader thread and no diagnostics meant even a healthy sidecar —
/// or a silent spawn failure — produced zero terminal output).
fn spawn_sidecar() -> std::io::Result<Child> {
    let entry = resolve_sidecar_entry();
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    let exists = std::path::Path::new(&entry).exists();
    eprintln!("[shell] spawning sidecar: node \"{entry}\"");
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
        .setup(|app| {
            let mut child = spawn_sidecar()?;
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
                _child: Mutex::new(child),
            });

            start_reader(app.handle().clone(), state.clone(), stdout);
            start_stderr_forwarder(stderr);
            app.manage(state);

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
        .run(tauri::generate_context!())
        .expect("error while running the GameLib Tauri shell");
}
