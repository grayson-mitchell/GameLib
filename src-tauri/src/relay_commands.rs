use super::*;

// ---- The four relay commands (names mirror the transport contract constants) ----

/// Longest channel-name prefix echoed into a relay error or log line (T-67-61).
const RELAY_CHANNEL_ECHO_MAX: usize = 64;

/// A channel name made safe to echo: cut to 64 characters and anything that is not printable
/// ASCII replaced by `?`, so a hostile name can neither flood nor forge a log line.
fn echo_channel(channel: &str) -> String {
    channel
        .chars()
        .take(RELAY_CHANNEL_ECHO_MAX)
        .map(|c| if c.is_ascii_graphic() || c == ' ' { c } else { '?' })
        .collect()
}

/// D-14: the renderer may name only channels on the generated allow-list. Checked before anything
/// crosses the pipe; arguments are still validated only in the sidecar.
pub(crate) fn relay_channel_verdict(channel: &str) -> Result<(), String> {
    if is_renderer_channel(channel) {
        Ok(())
    } else {
        Err(format!(
            "{IPC_INVALID_CHANNEL_MARKER} channel not allowed: {}",
            echo_channel(channel)
        ))
    }
}

/// ipcRenderer.invoke parity: req/resp round-trip to the sidecar.
#[tauri::command]
pub(crate) async fn sidecar_invoke(
    channel: String,
    args: Vec<Value>,
    state: State<'_, Arc<SidecarState>>,
) -> Result<Value, String> {
    relay_channel_verdict(&channel)?;
    let state = state.inner().clone();
    // Run the blocking channel-write + recv off the async runtime's worker.
    tauri::async_runtime::spawn_blocking(move || state.invoke(channel, args))
        .await
        .map_err(|e| e.to_string())?
}

/// Whether the per-call send-path entry trace is armed (`GAMELIB_TRACE_SEND=1`). **Opt-in.**
///
/// Settled by plan 34.6-16 Task 3, after this flag's default was flipped twice:
///
/// It shipped opt-in. The first live drive produced no entry line, on a binary PROVEN fresh
/// (mtime 07:56:16 against commit `cc99cbe93` at 07:52:13) with the sink PROVEN working (the
/// shell's other `eprintln!`s reached the operator's terminal in that same run). Two
/// explanations survived — the flag not propagating through `pnpm tauri:dev`, or a truncated
/// observation — and separating them would have cost another rebuild cycle, so the default was
/// inverted to ON instead. That run then found the root cause immediately (427 traced sends,
/// `winetricksInstall` absent from all of them).
///
/// **Returned to opt-in now that the trace is no longer load-bearing for any gate.**
/// `sidecar_send` is the hot path all 57 send channels cross — boot alone produced 427 lines —
/// and Step 4's re-drive is scored by the D-11 observable in `gamelib.log`, not by this trace.
/// So an unarmed trace can no longer invalidate a gate item, which is what made ON the right
/// default while the cause was unknown and the wrong one now.
///
/// **STILL UNVERIFIED: whether `GAMELIB_TRACE_SEND` propagates through `pnpm tauri:dev` at all.**
/// The second run never tested it — the trace fired because the default was ON, not because the
/// flag was read. Cheap check, folded into plan 34.6-17's Step 4 drive at zero extra cost:
/// launch once with `GAMELIB_TRACE_SEND=1` and confirm the lines appear. If they do not, this
/// gate is unusable in dev and the entry line should become unconditional.
///
/// Cached in a `OnceLock` so the env read happens once per process rather than per call.
pub(crate) fn send_trace_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("GAMELIB_TRACE_SEND").as_deref() == Ok("1"))
}

/// ipcRenderer.send parity: fire-and-forget, no response awaited.
///
/// SEND-PATH TRACE (Phase 34.6 Plan 16, gap cycle for the live gate's Step 4 FAIL).
///
/// `winetricksInstall` is a live silent no-op: the listener IS registered (`platform/index.ts`'s
/// `ipcMain.on` is an unconditional `Map` insert with no failure mode, on a path proven to
/// execute), so the frame never arrives. Ten hypotheses are already excluded by code reading;
/// what remains needs runtime observation.
///
/// The trace lives HERE, in Rust, and not in the preload, for one reason: the preload's
/// `send()` surfaces its rejections through `window.api.logError`, which is ITSELF a send-kind
/// channel. A send-kind diagnostic for a send-kind defect is unfalsifiable — a rejection on
/// this channel would route to `logError`, and if that also failed it falls back to renderer
/// `console.error`, which does not reach `gamelib.log`. That chain reproduces the observed
/// symptom (zero bytes written) exactly. `eprintln!` here goes to the shell's stderr, which is
/// one of the two sinks the live gate captures, and is reachable by neither failure mode.
///
/// Two lines, deliberately gated differently:
///
///   - **entry** — armed by `GAMELIB_TRACE_SEND=1`. Fires per call, so it is opt-in.
///   - **`write_frame` failure** — ALWAYS on, and it is the higher-value half. This error is
///     currently invisible: it returns to the renderer as an invoke rejection, which lands in
///     the very `.catch` -> `logError` chain described above and is lost. It is also rare
///     (serialization failure, a poisoned stdin mutex, or a stdin write/flush IO error), so
///     always-on costs nothing in the normal case.
///
/// Together they partition the space in ONE drive:
///
///   - entry line + no failure line -> the frame reached the sidecar's stdin; the defect is
///     sidecar-side, between `write_frame` and `handleFrame`
///   - entry line + failure line -> the error string names the cause directly
///   - no entry line -> the renderer's `send()` was never entered, or its invoke rejected
///     before reaching this command; the defect is renderer-side
///
/// T-34.6-16-02: the channel NAME only, never `args` — token material travels in those fields
/// (the same constraint `sidecarRpc.ts`'s unrecognized-frame branch carries as T-28-04).
///
/// MAIN THREAD (todo 2026-10-05 tauri-rpc-transport-minor-defects, defect 2): a non-`async`
/// command runs on the main thread in Tauri v2, and this one used to take the stdin mutex and
/// do a blocking `write_all`/`flush` there -- with the sidecar's JS thread busy and a pipe
/// buffer of frames queued, the UI froze until the write completed. It now only ENQUEUES onto
/// `SidecarSendQueue`'s single writer thread, which preserves send order (an `async` +
/// `spawn_blocking` pool would not). The always-on `write_frame` failure line moved there with
/// the write; an IO failure no longer reaches the renderer as a rejection, which -- per the
/// paragraph above -- was the path where it got lost anyway.
#[tauri::command]
pub(crate) fn sidecar_send(
    channel: String,
    args: Vec<Value>,
    state: State<'_, Arc<SidecarState>>,
    queue: State<'_, SidecarSendQueue>,
) -> Result<(), String> {
    if let Err(e) = relay_channel_verdict(&channel) {
        shell_eprintln!("[shell] relay rejected send: {}", echo_channel(&channel));
        return Err(e);
    }
    let req = SidecarRpcRequest {
        id: state.next_id(),
        kind: "send",
        channel,
        args,
    };
    if send_trace_enabled() {
        shell_eprintln!(
            "[shell] send-trace: sidecar_send entered for '{}'",
            req.channel
        );
    }
    queue.0.send(req).map_err(|rejected| {
        let message = format!(
            "send writer thread is gone; frame for '{}' not written",
            rejected.0.channel
        );
        shell_eprintln!("[shell] send-trace: {message}");
        message
    })
}

/// The FIFO hand-off between `sidecar_send` (main thread) and the one thread that writes its
/// frames to the sidecar's stdin. See `sidecar_send`'s MAIN THREAD paragraph.
pub(crate) struct SidecarSendQueue(pub(crate) Sender<SidecarRpcRequest>);

/// Spawn the `sidecar_send` writer thread over `write` and return its queue. Generic over the
/// write so `#[cfg(test)]` can prove ordering and non-blocking enqueue without a child process.
/// The thread ends when every `Sender` is dropped; in the app the managed queue lives for the
/// process, and a parked std thread does not hold the process open.
pub(crate) fn spawn_send_writer<W>(write: W) -> Sender<SidecarRpcRequest>
where
    W: Fn(&SidecarRpcRequest) -> Result<(), String> + Send + 'static,
{
    let (tx, rx) = mpsc_channel::<SidecarRpcRequest>();
    thread::spawn(move || {
        for req in rx {
            if let Err(e) = write(&req) {
                shell_eprintln!(
                    "[shell] send-trace: write_frame FAILED for '{}': {e}",
                    req.channel
                );
            }
        }
    });
    tx
}

/// The only schemes the renderer may ask the shell to hand to the OS (CR-01,
/// `35-REVIEW.md`). `steam:` is the reason this command exists at all -- the `opener`
/// plugin's own `allow-default-urls` scope (`capabilities/default.json`) excludes it, so a
/// call through `plugin:opener|open_url` directly would never reach Steam. The other four
/// mirror that same plugin scope exactly, so this app-defined arm is never WIDER than the
/// plugin arm the capability file already restricts. `open_external` is an app-defined
/// command, so `generate_handler!` reaches it without the capability system being consulted
/// at all (Rust-side plugin calls bypass capabilities) -- this const is the only allow-list
/// this command has.
pub(crate) const OPEN_EXTERNAL_ALLOWED_SCHEMES: &[&str] = &["https", "http", "mailto", "tel", "steam"];

/// Exact URLs allowed in addition to the scheme list (quick 261026-b9r, T-b9r-01). The macOS
/// App Management deep link is allowed byte-for-byte and case-sensitively; the
/// `x-apple.systempreferences` scheme is deliberately NOT in `OPEN_EXTERNAL_ALLOWED_SCHEMES`,
/// because that would let a forged sidecar frame or renderer call open any System Settings pane.
const OPEN_EXTERNAL_ALLOWED_EXACT_URLS: &[&str] =
    &["x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles"];

/// Pure scheme-validation half of `open_external` (CR-01), extracted so it can be proven by
/// `#[cfg(test)] mod tests` without constructing an `AppHandle`. Splits on the FIRST `:` only
/// and lowercases ASCII-wise before comparing, so `STEAM://…` and `Steam://…` are accepted
/// exactly like `steam://…`. Returns a scheme-only error string in both rejection branches --
/// never the URL (T-28-04) -- because the URL is renderer-controlled and this string can reach
/// a log a user attaches to a public bug report.
pub(crate) fn open_external_scheme_check(url: &str) -> Result<(), String> {
    if OPEN_EXTERNAL_ALLOWED_EXACT_URLS.contains(&url) {
        return Ok(());
    }
    let scheme = url
        .split_once(':')
        .map(|(s, _)| s.to_ascii_lowercase())
        .ok_or_else(|| "open_external: rejected a URL with no scheme".to_string())?;
    if !OPEN_EXTERNAL_ALLOWED_SCHEMES.contains(&scheme.as_str()) {
        // Scheme name only, never the URL (T-28-04 convention).
        shell_eprintln!("[shell] open_external: rejected scheme '{scheme}'");
        return Err("open_external: scheme not allowed".to_string());
    }
    Ok(())
}

/// shell.openExternal parity — opens the URL (e.g. steam://rungameid/<appId>) via
/// tauri-plugin-opener (/usr/bin/open → Steam.app, the registered steam:// handler).
/// The URL is built upstream by the backend's numeric-appId-guarded buildSteamProtocolUrl
/// (threat T-27-02), but that upstream guarantee does not reach this command -- the renderer
/// invokes it directly (`withGlobalTauri: true`, `security.csp` is `null`), so `url` here is
/// renderer-controlled and validated against `OPEN_EXTERNAL_ALLOWED_SCHEMES` before anything
/// is opened (CR-01, `35-REVIEW.md`).
#[tauri::command]
pub(crate) fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    open_external_scheme_check(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Requests the sidecar's minimal store snapshot for the renderer's synchronous store bridge.
#[tauri::command]
pub(crate) async fn sidecar_store_snapshot(state: State<'_, Arc<SidecarState>>) -> Result<Value, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.invoke(STORE_SNAPSHOT_CHANNEL.to_string(), vec![])
    })
    .await
    .map_err(|e| e.to_string())?
}


#[cfg(test)]
mod relay_allow_list_tests {
    use super::*;

    #[test]
    fn ipc_contract_relay_allows_renderer_channel() {
        assert!(relay_channel_verdict("pathExists").is_ok());
    }

    #[test]
    fn ipc_contract_relay_rejects_shell_only_channel() {
        let e = relay_channel_verdict("handleProtocolUrl").unwrap_err();
        assert!(e.starts_with(IPC_INVALID_CHANNEL_MARKER));
        assert!(e.contains("handleProtocolUrl"));
    }

    #[test]
    fn ipc_contract_relay_rejects_unknown_channel() {
        assert!(relay_channel_verdict("definitelyNotAChannel").is_err());
        assert!(relay_channel_verdict("").is_err());
        assert!(relay_channel_verdict(STORE_SNAPSHOT_CHANNEL).is_err());
    }

    #[test]
    fn ipc_contract_relay_truncates_hostile_channel_name() {
        let hostile = "\u{1b}[31m\n\u{e9}".repeat(2000) + &"x".repeat(10_240);
        let e = relay_channel_verdict(&hostile).unwrap_err();
        assert!(e.len() < 200, "error was {} bytes", e.len());
        assert!(!e.contains('\n') && !e.contains('\u{1b}'));
        assert!(echo_channel(&hostile).len() <= RELAY_CHANNEL_ECHO_MAX);
    }
}
