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
        match rx.recv_timeout(INVOKE_TIMEOUT) {
            Ok(result) => result,
            Err(_) => {
                self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                Err("sidecar invoke timed out".into())
            }
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
fn dispatch_rust_channel(channel: &str, args: &[Value]) -> Result<Value, String> {
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
        _ => Err(format!("rustInvoke:unknown-channel:{channel}")),
    }
}

// ---- Boot-time keyring self-check (Phase 28-06 Task 2 hardware-verification trigger) ----
//
// SCAFFOLDING (28-06 Task 1) — removed by 28-06 Task 4
//
// Three modes, selected by the value of GAMELIB_KEYRING_SELFCHECK:
//   "1"      — single-process round-trip (set -> get -> byte-compare -> delete). Proven PASS
//              on real hardware 2026-07-22 (byte-identical). Kept working so the REQ-28-01
//              evidence stays reproducible.
//   "seed"   — writes the synthetic value to the Keychain and LEAVES IT (no delete); also
//              records the value to a scratch file so a later, separate "verify" run can
//              compare against it.
//   "verify" — reads the EXISTING `-selfcheck` entry WITHOUT creating/writing it first,
//              compares against the value "seed" recorded, then deletes both the Keychain
//              entry and the scratch file.
//
// Design rationale (added after the first 28-06 Task 2 hardware checkpoint, 2026-07-22):
// macOS only presents a Keychain authorization prompt when a process accesses an item it does
// NOT already own. Mode "1" always creates the item itself in the same process that reads it
// back, so it owns the item and is never prompted — it cannot exercise the Deny path
// (REQ-28-06) or the rebuild re-prompt (REQ-28-07/D-08). Splitting seed/verify across two
// separate process launches — with a rebuild in between so the binary's code signature
// changes — is what makes the prompt reachable: "verify" accesses an item it did not create,
// so macOS treats it as a foreign, unauthorized app and prompts.

/// Distinct Keychain account suffix the self-check writes to. Never the production
/// `KEYRING_ACCOUNT` entry — see the mode docstrings below (T-28-12).
const SELFCHECK_ACCOUNT_SUFFIX: &str = "-selfcheck";

/// Scratch file recording the synthetic value written by a "seed" run, so a later "verify"
/// run (a separate process, typically after a rebuild) can compare against it without the two
/// runs sharing memory. Contains only the synthetic self-check value — never a real token
/// (T-28-04).
fn selfcheck_seed_value_path() -> std::path::PathBuf {
    std::env::temp_dir().join("gamelib-keyring-selfcheck-seed.txt")
}

/// Generates the synthetic, timestamp-unique self-check value. Never a real token — this is
/// printed to stderr and written to the scratch file above (T-28-04).
fn selfcheck_synthetic_value() -> String {
    format!(
        "gamelib-selfcheck-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    )
}

/// SCAFFOLDING (28-06 Task 1) — removed by 28-06 Task 4 (mode "1": self-check implementation)
///
/// Performs a real macOS Keychain round-trip (set -> get -> byte-compare -> delete) against
/// `KEYRING_SERVICE` / `KEYRING_ACCOUNT` + the literal `-selfcheck` suffix, so it never reads or
/// writes the production entry. Exists solely as a deliberate trigger for the plan 28-06 Task 2
/// human checkpoint: there is no login channel in this Tauri build yet (D-03), so nothing
/// naturally exercises a keyring write. Prints each step and the final byte-comparison verdict
/// to stderr with a `[shell][keyring-selfcheck]` prefix; on any error, prints the full `{:?}`
/// debug of the `keyring::Error`. Only the synthetic self-check value is ever printed — never
/// the production entry's value (T-28-04).
fn keyring_self_check() {
    let account = format!("{KEYRING_ACCOUNT}{SELFCHECK_ACCOUNT_SUFFIX}");
    let value = selfcheck_synthetic_value();
    eprintln!(
        "[shell][keyring-selfcheck] mode=1 starting: service={KEYRING_SERVICE} account={account}"
    );

    let entry = match Entry::new(KEYRING_SERVICE, &account) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[shell][keyring-selfcheck] FAILED creating entry: {e:?}");
            return;
        }
    };

    eprintln!("[shell][keyring-selfcheck] set: writing synthetic value {value:?}");
    if let Err(e) = entry.set_password(&value) {
        eprintln!("[shell][keyring-selfcheck] FAILED on set_password: {e:?}");
        return;
    }
    eprintln!("[shell][keyring-selfcheck] set: OK");

    eprintln!("[shell][keyring-selfcheck] get: reading back");
    let read_back = match entry.get_password() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[shell][keyring-selfcheck] FAILED on get_password: {e:?}");
            return;
        }
    };

    let identical = read_back == value;
    eprintln!(
        "[shell][keyring-selfcheck] verdict: byte-identical={identical} (wrote {value:?}, read {read_back:?})"
    );

    eprintln!("[shell][keyring-selfcheck] delete: cleaning up");
    match entry.delete_credential() {
        Ok(()) => eprintln!("[shell][keyring-selfcheck] delete: OK"),
        Err(e) => eprintln!("[shell][keyring-selfcheck] FAILED on delete_credential: {e:?}"),
    }
}

/// SCAFFOLDING (28-06 Task 1) — removed by 28-06 Task 4 (mode "seed")
///
/// Writes the synthetic self-check value to the `-selfcheck` Keychain entry and deliberately
/// does NOT delete it — the entry must survive this process's exit so a later, separate
/// "verify" run (see `keyring_self_check_verify`) can read an item it did not create, which is
/// what makes macOS present the authorization prompt. Also records the value to a scratch file
/// (`selfcheck_seed_value_path`) so "verify" has something to compare against across the
/// process boundary. On any error, prints the full `{:?}` debug of the `keyring::Error`.
fn keyring_self_check_seed() {
    let account = format!("{KEYRING_ACCOUNT}{SELFCHECK_ACCOUNT_SUFFIX}");
    let value = selfcheck_synthetic_value();
    eprintln!(
        "[shell][keyring-selfcheck] mode=seed starting: service={KEYRING_SERVICE} account={account}"
    );

    let entry = match Entry::new(KEYRING_SERVICE, &account) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[shell][keyring-selfcheck] FAILED creating entry: {e:?}");
            return;
        }
    };

    eprintln!("[shell][keyring-selfcheck] seed: writing synthetic value {value:?}");
    if let Err(e) = entry.set_password(&value) {
        eprintln!("[shell][keyring-selfcheck] FAILED on set_password: {e:?}");
        return;
    }
    eprintln!("[shell][keyring-selfcheck] seed: OK — value intentionally LEFT in the Keychain (not deleted)");

    let seed_path = selfcheck_seed_value_path();
    match std::fs::write(&seed_path, &value) {
        Ok(()) => eprintln!(
            "[shell][keyring-selfcheck] seed: recorded expected value to {} for a later verify run",
            seed_path.display()
        ),
        Err(e) => eprintln!(
            "[shell][keyring-selfcheck] WARNING: failed to write scratch file {}: {e}",
            seed_path.display()
        ),
    }

    eprintln!(
        "[shell][keyring-selfcheck] seed: DONE. To reach the prompt: change the binary's code \
         signature (e.g. touch a source file, then `cd src-tauri && cargo build`) and relaunch \
         with GAMELIB_KEYRING_SELFCHECK=verify."
    );
}

/// SCAFFOLDING (28-06 Task 1) — removed by 28-06 Task 4 (mode "verify")
///
/// Reads the EXISTING `-selfcheck` Keychain entry WITHOUT calling `set_password` first in this
/// process — accessing an item this process did not create is exactly what makes macOS treat it
/// as foreign and present the authorization prompt (see the module-level design rationale
/// above). Compares the read-back value against the scratch file `keyring_self_check_seed`
/// wrote, then deletes both the Keychain entry and the scratch file. On ANY keyring failure —
/// including a Deny click — prints the full `{:?}` debug of the `keyring::Error`, prefixed
/// `[shell][keyring-selfcheck]`. This is the deliverable that closes RESEARCH Assumption A1 /
/// Open Question 1 (REQ-28-06).
fn keyring_self_check_verify() {
    let account = format!("{KEYRING_ACCOUNT}{SELFCHECK_ACCOUNT_SUFFIX}");
    eprintln!(
        "[shell][keyring-selfcheck] mode=verify starting: service={KEYRING_SERVICE} account={account}"
    );

    let seed_path = selfcheck_seed_value_path();
    let expected = match std::fs::read_to_string(&seed_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!(
                "[shell][keyring-selfcheck] FAILED to read seed scratch file {}: {e}. Run with \
                 GAMELIB_KEYRING_SELFCHECK=seed first.",
                seed_path.display()
            );
            return;
        }
    };

    // Deliberately no `set_password` call here — see module-level design rationale above.
    let entry = match Entry::new(KEYRING_SERVICE, &account) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[shell][keyring-selfcheck] FAILED creating entry handle: {e:?}");
            return;
        }
    };

    eprintln!(
        "[shell][keyring-selfcheck] verify: reading existing entry this process did not create \
         (expected to prompt if the binary's code signature changed since the seed run)"
    );
    let read_back = match entry.get_password() {
        Ok(v) => v,
        Err(e) => {
            eprintln!(
                "[shell][keyring-selfcheck] verify: get_password FAILED — this is the Deny-path \
                 observation (REQ-28-06 / RESEARCH Assumption A1). Full keyring::Error debug: {e:?}"
            );
            return;
        }
    };

    let identical = read_back == expected;
    eprintln!(
        "[shell][keyring-selfcheck] verdict: byte-identical={identical} (expected {expected:?}, read {read_back:?})"
    );

    eprintln!("[shell][keyring-selfcheck] verify: delete: cleaning up Keychain entry");
    match entry.delete_credential() {
        Ok(()) => eprintln!("[shell][keyring-selfcheck] verify: delete: OK"),
        Err(e) => eprintln!(
            "[shell][keyring-selfcheck] verify: FAILED on delete_credential: {e:?}"
        ),
    }

    match std::fs::remove_file(&seed_path) {
        Ok(()) => eprintln!(
            "[shell][keyring-selfcheck] verify: removed scratch file {}",
            seed_path.display()
        ),
        Err(e) => eprintln!(
            "[shell][keyring-selfcheck] WARNING: failed to remove scratch file {}: {e}",
            seed_path.display()
        ),
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
                if let Some(id) = value.get("id").and_then(|v| v.as_str()) {
                    let sender = state
                        .pending
                        .lock()
                        .ok()
                        .and_then(|mut p| p.remove(id));
                    if let Some(tx) = sender {
                        let ok = value.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
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
                thread::spawn(move || {
                    let result = dispatch_rust_channel(&channel, &args);
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

            // SCAFFOLDING (28-06 Task 1) — removed by 28-06 Task 4 (env-var read)
            // This env var is a DIAGNOSTIC TRIGGER, not a D-08 escape hatch (T-28-13): it
            // cannot select a storage backend, enable a fallback, or alter the production
            // token path — it only gates a synthetic round-trip against a `-selfcheck`
            // Keychain account, never the production KEYRING_ACCOUNT entry. Three modes:
            // "1" (single-process round-trip), "seed" (write + leave for a later verify run),
            // "verify" (read an item this process did not create, to reach the Deny-path /
            // rebuild-re-prompt behavior — see the module docstring above `keyring_self_check`).
            let keyring_selfcheck_mode = std::env::var("GAMELIB_KEYRING_SELFCHECK").ok();
            // SCAFFOLDING (28-06 Task 1) — removed by 28-06 Task 4 (self-check call site)
            match keyring_selfcheck_mode.as_deref() {
                Some("1") => keyring_self_check(),
                Some("seed") => keyring_self_check_seed(),
                Some("verify") => keyring_self_check_verify(),
                _ => {}
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
        .run(tauri::generate_context!())
        .expect("error while running the GameLib Tauri shell");
}
