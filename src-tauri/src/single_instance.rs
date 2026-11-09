use super::*;

#[cfg(windows)]
mod windows_pipe;
#[cfg(windows)]
pub(crate) use windows_pipe::*;

mod windows_protocol;
#[cfg_attr(not(windows), allow(unused_imports))]
pub(crate) use windows_protocol::*;

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
pub(crate) fn protocol_url_arg(args: &[String]) -> Option<String> {
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

/// What the OS deep-link callback (`tauri-plugin-deep-link`'s `on_open_url`) decided about ONE
/// URL the operating system handed us. Extracted from the callback closure so the decision is
/// directly testable; the closure itself owns only the sidecar `invoke` and the log line.
///
/// The `Reject` variant carries the payload's BYTE COUNT and nothing else. That is the point of
/// modelling this as an enum rather than returning `Option<String>`: T-34.5-G6-25 / T-35-26
/// forbid a rejected, attacker-controlled deep-link payload from reaching a log file users
/// attach to bug reports, and a variant that structurally cannot hold the payload cannot leak it
/// even if a future caller logs the whole value.
pub(crate) enum DeepLinkDecision {
    Dispatch(String),
    Reject { bytes: usize },
}

/// The THIRD source of a `gamelib://` URL into this process -- after argv
/// (`sidecar_forward_args`) and the single-instance socket accept loop in `main()` -- and, like
/// the socket, NOT trusted for being "internal". Defence in depth (T-34.5-G6-20): it re-validates
/// through `protocol_url_arg`, the same allow-list the other two use, which is this file's single
/// input-validation choke point (ASVS V5). A FOURTH source belongs here too; the validation does
/// not live at any call site, it lives in that one function.
///
/// Unlike argv and the socket, the candidate here arrives as an ALREADY-PARSED `url::Url` from
/// the plugin, so there is no original byte string left to preserve -- the caller re-serialises
/// it and this function validates that. `protocol.ts`'s own `new URL()` remains the sole
/// authority on interpretation either way.
pub(crate) fn deep_link_decision(candidate: &str) -> DeepLinkDecision {
    match protocol_url_arg(&[candidate.to_string()]) {
        Some(url) => DeepLinkDecision::Dispatch(url),
        None => DeepLinkDecision::Reject {
            bytes: candidate.len(),
        },
    }
}

/// Exact string equality only, mirroring `process.argv.includes('--no-gui')`.
///
/// RED direction: a `starts_with`/`contains` implementation would wrongly accept
/// `--no-gui-really` and `--not-no-gui`.
pub(crate) fn cli_no_gui(args: &[String]) -> bool {
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
pub(crate) fn sidecar_forward_args(args: &[String]) -> Vec<String> {
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
pub(crate) fn single_instance_socket_path(app_support_dir: &std::path::Path) -> std::path::PathBuf {
    app_support_dir.join("gamelib-single-instance.sock")
}

/// Resolves the directory the single-instance socket lives in, from an explicit `home`
/// parameter rather than reading `std::env::var` internally -- mirrors
/// `resolve_dev_app_root`'s own doc comment (below) on why: neither this file's
/// `#[cfg(test)] mod tests` nor a parallel `cargo test` run may mutate process-global env
/// vars. Returns `None` when `home` is `None` or empty, so callers can fall back to running
/// without a guard (fail open, T-34.5-G6-24) rather than crash.
pub(crate) fn single_instance_dir(home: Option<&str>) -> Option<std::path::PathBuf> {
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

// ---- Windows single-instance guard: pure helpers (Phase 46 plan 46-01) --------------------
//
// Not `#[cfg(windows)]`-gated (REQ-46-07): every helper below is a pure, host-independent
// decision -- explicit parameters, no `std::env::var` inside, mirroring `single_instance_dir`'s
// own discipline directly above (neither this file's `#[cfg(test)] mod tests` nor a parallel
// `cargo test` run may mutate process-global env vars). Only Windows code calls these outside
// tests, so `#[cfg_attr(not(windows), allow(dead_code))]` on each keeps macOS/Linux builds free
// of new dead_code warnings without hiding the functions from macOS/Linux `cargo test` runs.

/// The ONE validator every derived Windows single-instance name and every SDDL string goes
/// through (T-46-07): `windows_mutex_name`, `windows_pipe_name`, and `windows_pipe_sddl` all map
/// over this function's output, so a malformed or injection-shaped SID can never reach a kernel
/// object name or a `ConvertStringSecurityDescriptorToSecurityDescriptorW` SDDL string.
///
/// The SID comes from the process token (`GetTokenInformation(TokenUser)`), never from the
/// `USERNAME` environment variable (planning-time correction 1, REQUIREMENTS.md Phase 46): the
/// env var is inherited process state -- a launcher, shortcut, or scheduled task can start
/// GameLib with a different `USERNAME` and silently produce a different mutex name, defeating the
/// guard -- and a `[A-Za-z0-9_]` sanitizer on a username is lossy (`a.b` and `a_b` collide). The
/// SID read from the process token is authoritative and unique, and it is also the only value the
/// pipe DACL can use (correction 2), so reading it once serves both call sites.
///
/// Accepts only: the literal uppercase prefix `S-1-`, at least one character after it, every
/// character after the prefix in `0-9` or `-`, and a total length of at most 184 (the documented
/// maximum Windows SID string length). Returns the input unchanged as an owned `String` --
/// this function validates, it does not normalise or rewrite.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_single_instance_key(user_sid: Option<&str>) -> Option<String> {
    let sid = user_sid.filter(|s| !s.is_empty())?;
    let rest = sid.strip_prefix("S-1-")?;
    if rest.is_empty() {
        return None;
    }
    if !rest.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return None;
    }
    if sid.len() > 184 {
        return None;
    }
    Some(sid.to_string())
}

/// The `Local\`-namespaced (session-scoped, never `Global\` -- see 46-RESEARCH.md Q1's own
/// anti-pattern note on `Global\` name-squatting) mutex name `CreateMutexW` acquires pre-`Builder`
/// to decide primary vs. secondary. Built from `windows_single_instance_key` alone, so an invalid
/// SID yields `None` rather than a malformed or unvalidated name.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_mutex_name(user_sid: Option<&str>) -> Option<String> {
    windows_single_instance_key(user_sid).map(|key| format!(r"Local\gamelib-single-instance-{key}"))
}

/// The named-pipe payload-transport name. Carries the token's SESSION id, not just its SID
/// (planning-time correction 3, REQUIREMENTS.md Phase 46): the `Local\` mutex namespace above is
/// already per-session, but the named-pipe namespace (`\\.\pipe\...`) is machine-global. Without
/// the `-s<session>` suffix, the same user signed in twice (RDP, or fast user switching back to a
/// disconnected session) would collide on ONE pipe name: the second session's primary would fail
/// `FILE_FLAG_FIRST_PIPE_INSTANCE` and run without a listener, and that session's own secondaries
/// would silently deliver their deep links to the OTHER session's window instead of their own.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_pipe_name(user_sid: Option<&str>, session_id: u32) -> Option<String> {
    windows_single_instance_key(user_sid)
        .map(|key| format!(r"\\.\pipe\gamelib-single-instance-{key}-s{session_id}"))
}

/// The pipe's security descriptor, as an SDDL string for
/// `ConvertStringSecurityDescriptorToSecurityDescriptorW` (never hand-rolled
/// `SECURITY_DESCRIPTOR` bytes -- see 46-RESEARCH.md "Don't Hand-Roll"). `O:<sid>` sets the
/// owner explicitly to the validated user SID, NOT the SDDL alias `OW` (planning-time correction
/// 2, REQUIREMENTS.md Phase 46): `OW` (OWNER RIGHTS) grants access to whoever the object's
/// *default owner* is, and for an elevated administrator token that default owner is
/// `BUILTIN\Administrators`, not the user -- an elevated primary would then create a pipe its own
/// non-elevated secondary could not open. `D:P(A;;GA;;;<sid>)` is a DACL (`D:`) marked protected
/// (`P`, so it is not silently merged with an inherited ACE from a parent container) with exactly
/// one ACE granting Generic-All (`GA`) to that same SID -- nobody else, at all.
///
/// Decision point (b), operator-overridable (REQUIREMENTS.md Phase 46 "Open decision points"):
/// the ACE trustee here is the per-user TOKEN SID (`TokenUser`), NOT the logon SID. This matches
/// the Unix guard's own per-`$HOME` (i.e. per-user, not per-session) trust boundary. Per-session
/// ROUTING is already handled by the session-scoped pipe name above (correction 3) -- it does not
/// need to also come from the ACL.
///
/// To override: in `current_user_identity`, additionally read the logon SID
/// (`GetTokenInformation(TokenLogonSid)`, or walk `GetTokenInformation(TokenGroups)` for the group
/// whose `Attributes` has `SE_GROUP_LOGON_ID` set), thread it into this function as a second,
/// separately-validated (logon-SID-shaped) parameter, and emit IT as the ACE trustee while
/// KEEPING `O:` as the user SID (so the secondary's `windows_pipe_owner_matches` owner check,
/// which compares against the user SID, stays valid). Then flip this decision's pinning unit test
/// (`windows_pipe_sddl_req_46_03_decision_point_b_operator_overridable_dacl_is_per_user_token_sid`)
/// and the matching TS source gate in `tauriShellSource.test.ts` (plan 46-03).
///
/// What the override changes for a same-user connect from another logon session: across two
/// Windows TERMINAL SESSIONS, nothing changes -- the `Local\` mutex and the `-s<session>` pipe
/// name already keep sessions apart, so each session becomes its own primary either way. WITHIN
/// one terminal session, a same-user process running under a DIFFERENT logon SID (for example, a
/// `runas` of the same account) collides on the mutex today and becomes a secondary that
/// successfully delivers its payload; after the override, that secondary's pipe connect is denied
/// with `ERROR_ACCESS_DENIED` (5) -- which `windows_pipe_connect_should_retry` never retries -- so
/// it exits 0 with its deep link lost (fail-open, never a second instance).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_pipe_sddl(user_sid: Option<&str>) -> Option<String> {
    windows_single_instance_key(user_sid).map(|key| format!("O:{key}D:P(A;;GA;;;{key})"))
}

/// Whether a secondary's pipe-connect attempt should be retried, given the raw OS error from a
/// failed `std::fs::OpenOptions::open` on the pipe path. Only `ERROR_FILE_NOT_FOUND` (2, the
/// primary has not created the pipe instance yet) and `ERROR_PIPE_BUSY` (231, every existing
/// instance is currently connected) are transient. `ERROR_ACCESS_DENIED` (5) is deliberately never
/// retried: it means a DACL we do not own (either the pipe is not actually ours, or decision point
/// (b) above has been overridden and this is a different logon session) -- retrying would not help
/// and would delay the unconditional fail-open exit.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_pipe_connect_should_retry(raw_os_error: Option<i32>) -> bool {
    matches!(raw_os_error, Some(2) | Some(231))
}

/// Whether the secondary should trust the pipe server it just connected to, per planning-time
/// correction 4 (REQUIREMENTS.md Phase 46): the pipe namespace is machine-global, so another local
/// user could pre-create the SAME name before this process's primary does. The secondary reads
/// the pipe's owner SID (via `GetNamedPipeHandleStateW`/`GetSecurityInfo` at the FFI call site,
/// which is out of scope for this pure function) and calls this to decide whether to write its
/// payload at all. Both arguments must independently pass `windows_single_instance_key` --
/// neither side gets a free pass for being merely non-empty -- and, once validated, they must be
/// byte-equal.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_pipe_owner_matches(pipe_owner_sid: &str, user_sid: &str) -> bool {
    match (
        windows_single_instance_key(Some(pipe_owner_sid)),
        windows_single_instance_key(Some(user_sid)),
    ) {
        (Some(owner), Some(user)) => owner == user,
        _ => false,
    }
}

/// The sentinel a secondary sends down the pipe (or Unix socket) when it has no validated deep
/// link to deliver, telling the primary to merely show/focus its window. Shared with the existing
/// Unix path's own literal (main()'s `#[cfg(unix)]` Secondary arm) -- this constant is for the
/// WINDOWS paths only; the Unix arm keeps its own literal unchanged (see `single_instance_payload`
/// below for why it is not refactored to share this constant directly).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) const SINGLE_INSTANCE_FOCUS_SENTINEL: &str = "__GAMELIB_FOCUS__";

/// The secondary-path payload decision: a validated deep-link URL, or the focus sentinel.
/// Mirrors the Unix Secondary arm's own inline
/// `match protocol_url_arg(&argv) { Some(url) => (url, "deep-link"), None => (FOCUS, "focus sentinel") }`
/// exactly -- byte for byte the same choke point (`protocol_url_arg`), the same two outcomes. The
/// Unix arm is deliberately NOT refactored to call this function: D-44-A's Unix single-instance
/// path is live-gated on macOS, and this phase does not churn code outside its own scope.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn single_instance_payload(argv: &[String]) -> (String, &'static str) {
    match protocol_url_arg(argv) {
        Some(url) => (url, "deep-link"),
        None => (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel"),
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
pub(crate) fn resolve_dev_app_root() -> String {
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
/// treats it as unset). `platformApi.app.isPackaged` stays `false` under the sidecar
/// regardless of this value, so `publicDir` still appends `'public'`, not `'build'`, even when
/// this resolves correctly — the packaged asset root itself is a named, deliberately unclosed
/// residual (`R-34.5-G1-PKG`, `34.5-APP-ROOT-SWEEP.md` § 3), not something this function claims
/// to fix.
pub(crate) fn resolve_packaged_app_root(app: &AppHandle) -> String {
    app_root_env_value(app.path().resource_dir().map_err(|e| e.to_string()))
}

// ---- Single-instance guard (Phase 34.5 gap cycle 6 plan 44, D-44-A; Windows half added
// Phase 46) -----------------------------------------------------------------------------------
//
// Hand-rolled. Unix is std-only (`std::os::unix::net`); Windows (Phase 46) uses `windows-sys` FFI
// (`CreateMutexW`/`CreateNamedPipeW`), since std has no cross-platform single-instance primitive.
// No plugin crate is added for either target (`tauri-plugin-single-instance` is rejected -- see
// the plan's own decision record D-44-A): a plugin-based guard cannot run before
// `tauri::Builder::default()`, so a secondary process would still reach `.setup()` and spawn its
// own sidecar before the plugin could ever tell it "you are secondary". This guard runs at the
// very top of `main()`, before the builder is even constructed, so a secondary process's
// `std::process::exit(0)` fires before `spawn_sidecar` can ever be called.

/// Outcome of a single-instance acquisition attempt. `Primary` holds the bound listener the
/// accept loop in `main()`'s `.setup()` closure will service; `PrimaryWithoutListener` behaves
/// identically to a primary process (spawns the sidecar, opens the window) but has no socket
/// to accept connections on -- the FAIL-OPEN path (T-34.5-G6-24) for every recoverable
/// failure: no resolvable home directory, a directory-creation failure, or a bind failure.
/// `Secondary` means another instance is already alive and listening.
#[cfg(unix)]
pub(crate) enum SingleInstanceRole {
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
pub(crate) fn acquire_single_instance(socket_path: &std::path::Path) -> SingleInstanceRole {
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
                shell_eprintln!(
                    "[shell] WARN: failed to set single-instance socket permissions to 0600: {e}"
                );
            }
            SingleInstanceRole::Primary(listener)
        }
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: single-instance socket bind failed ({e}) -- continuing as primary without a listener (fail-open, T-34.5-G6-24)"
            );
            SingleInstanceRole::PrimaryWithoutListener
        }
    }
}

// `std::os::unix::net` has no non-unix equivalent, so `acquire_single_instance` above is never
// called on a non-unix target -- Windows gets its own guard below (`acquire_single_instance_windows`,
// mutex decision + named-pipe transport), closing ledger row `U-34.5-18` (Phase 46). See that
// function's own doc comment for the mutex+pipe split and how Windows's self-cleaning kernel-object
// lifetime (46-RESEARCH.md Q1) removes the stale-socket-removal branch `acquire_single_instance`
// above needs on Unix.

#[cfg(test)]
mod tests {
    use super::*;

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

    // ---- OS deep-link callback decision (Phase 35 plan 07, D-07, REQ-35-05/REQ-35-16) ----
    //
    // These cover the callback's VALIDATION branch, deliberately reusing the argv fixtures
    // above rather than inventing new URL shapes: the whole design claim is that the OS
    // callback is not a second allow-list but the same one, so the same fixtures must produce
    // the same verdicts. A fixture that only these tests knew about would hide a divergence
    // instead of catching it.

    #[test]
    fn deep_link_decision_dispatches_a_well_formed_gamelib_url() {
        // Mirrors the callback exactly: `tauri-plugin-deep-link` hands over an ALREADY-PARSED
        // `Url`, so the closure re-serialises it with `to_string()` before validating. This
        // pins that the round trip does not perturb the URL out of `protocol_url_arg`'s
        // allow-list -- the one step of the OS path that argv and the socket do not perform.
        let parsed = tauri::Url::parse("gamelib://launch?appName=1207659037&runner=gog")
            .expect("fixture must parse");
        match deep_link_decision(&parsed.to_string()) {
            DeepLinkDecision::Dispatch(url) => {
                assert_eq!(url, "gamelib://launch?appName=1207659037&runner=gog")
            }
            DeepLinkDecision::Reject { bytes } => {
                panic!("expected a well-formed gamelib:// URL to dispatch, got Reject{{bytes:{bytes}}}")
            }
        }
    }

    #[test]
    fn deep_link_decision_dispatches_the_runnerless_url_too() {
        // D-44-C / U-34.5-19 compatibility shape, same as the argv test above -- the OS path
        // must not be stricter than argv, or a pre-fix `.app` bundle would work from a
        // shortcut and fail from an `open gamelib://...`.
        let parsed =
            tauri::Url::parse("gamelib://launch?appName=1207659037").expect("fixture must parse");
        match deep_link_decision(&parsed.to_string()) {
            DeepLinkDecision::Dispatch(url) => {
                assert_eq!(url, "gamelib://launch?appName=1207659037")
            }
            DeepLinkDecision::Reject { bytes } => {
                panic!("expected the runnerless URL to dispatch, got Reject{{bytes:{bytes}}}")
            }
        }
    }

    #[test]
    fn deep_link_decision_rejects_the_same_foreign_schemes_argv_rejects() {
        // T-35-25: identical fixture list to `protocol_url_arg_rejects_foreign_schemes`. RED
        // direction: a callback that dispatched whatever the OS handed it, on the reasoning
        // that the OS "already matched our scheme", would pass every other test in this file.
        for candidate in [
            "https://evil.example/x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "heroic://launch?appName=x",
        ] {
            match deep_link_decision(candidate) {
                DeepLinkDecision::Reject { bytes } => assert_eq!(
                    bytes,
                    candidate.len(),
                    "expected {candidate} to be rejected with its own byte count"
                ),
                DeepLinkDecision::Dispatch(url) => {
                    panic!("expected {candidate} to be rejected, but it dispatched as {url}")
                }
            }
        }
    }

    #[test]
    fn deep_link_decision_rejects_control_characters_and_oversized_urls() {
        // Same two fixtures as the argv tests (T-34.5-G6-21 / T-34.5-G6-23). Asserted against
        // the raw string form because that is what `deep_link_decision` takes -- note that
        // `Url::parse` would itself strip an embedded newline before the callback ever saw it,
        // so this rejection is the belt to the parser's braces, not a duplicate of it.
        let with_newline =
            "gamelib://launch?appName=1\n{\"id\":\"1\",\"kind\":\"invoke\",\"channel\":\"x\",\"args\":[]}";
        let oversized = format!("gamelib://launch?appName={}", "a".repeat(4096));
        for candidate in [with_newline, oversized.as_str()] {
            match deep_link_decision(candidate) {
                DeepLinkDecision::Reject { .. } => {}
                DeepLinkDecision::Dispatch(url) => {
                    panic!("expected the candidate to be rejected, but it dispatched as {url}")
                }
            }
        }
    }

    #[test]
    fn deep_link_decision_reject_carries_a_byte_count_and_nothing_else() {
        // T-35-26 / T-34.5-G6-25: an attacker-controlled deep-link payload must never reach a
        // log file a user attaches to a bug report. This is the STRUCTURAL half of that
        // mitigation -- `Reject` has no field that could hold the payload, so a future caller
        // cannot leak it even by logging the whole value. RED direction: an
        // `Option<String>`-shaped return, or a `Reject { payload }` variant, would make the
        // leak reachable again while every other assertion here still passed.
        let candidate = "heroic://launch?appName=would-be-logged-verbatim";
        match deep_link_decision(candidate) {
            DeepLinkDecision::Reject { bytes } => assert_eq!(bytes, candidate.len()),
            DeepLinkDecision::Dispatch(url) => {
                panic!("expected a foreign scheme to be rejected, got {url}")
            }
        }
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

    // ---- Windows single-instance guard: pure helpers (Phase 46 plan 46-01) --------------------
    //
    // Cross-platform-testable per REQ-46-07: none of these are `#[cfg(windows)]`-gated, so this
    // whole group runs (and proves the SID validator, name/SDDL derivation, retry classifier and
    // owner check) on macOS/Linux CI runners too, exactly like `single_instance_dir` above.

    const WINDOWS_TEST_VALID_SID: &str = "S-1-5-21-1004336348-1177238915-682003330-1001";

    const WINDOWS_TEST_OTHER_VALID_SID: &str = "S-1-5-21-1004336348-1177238915-682003330-1002";

    #[test]
    fn windows_single_instance_key_accepts_a_valid_sid_unchanged() {
        assert_eq!(
            windows_single_instance_key(Some(WINDOWS_TEST_VALID_SID)),
            Some(WINDOWS_TEST_VALID_SID.to_string())
        );
    }

    #[test]
    fn windows_single_instance_key_returns_none_without_a_sid() {
        assert_eq!(windows_single_instance_key(None), None);
        assert_eq!(windows_single_instance_key(Some("")), None);
    }

    #[test]
    fn windows_single_instance_key_rejects_malformed_or_injection_shaped_sids() {
        let oversized = format!("S-1-{}", "1".repeat(181)); // 185 chars total, over the 184 cap
        assert_eq!(oversized.len(), 185);
        let rejected = [
            "S-1-",                    // nothing after the prefix
            "s-1-5-21-1",              // lowercase prefix
            "S-1-5-21-1;(A;;GA;;;WD)", // SDDL injection
            "S-1-5-21-1)(A;;GA;;;WD",  // SDDL injection
            "S-1-5-21-1\\evil",        // backslash
            "S-1-5-21-1 ",             // trailing space
            "grays",                   // a username, not a SID
            oversized.as_str(),        // over the length cap
        ];
        for candidate in rejected {
            assert_eq!(
                windows_single_instance_key(Some(candidate)),
                None,
                "expected None for {candidate:?}"
            );
        }
    }

    #[test]
    fn windows_mutex_name_formats_the_validated_key() {
        assert_eq!(
            windows_mutex_name(Some(WINDOWS_TEST_VALID_SID)),
            Some(format!(
                "Local\\gamelib-single-instance-{WINDOWS_TEST_VALID_SID}"
            ))
        );
    }

    #[test]
    fn windows_mutex_name_returns_none_for_an_invalid_sid() {
        assert_eq!(windows_mutex_name(Some("grays")), None);
    }

    #[test]
    fn windows_pipe_name_formats_the_validated_key_and_session() {
        assert_eq!(
            windows_pipe_name(Some(WINDOWS_TEST_VALID_SID), 3),
            Some(format!(
                "\\\\.\\pipe\\gamelib-single-instance-{WINDOWS_TEST_VALID_SID}-s3"
            ))
        );
        // Two different session ids give two different names.
        assert_ne!(
            windows_pipe_name(Some(WINDOWS_TEST_VALID_SID), 3),
            windows_pipe_name(Some(WINDOWS_TEST_VALID_SID), 4)
        );
    }

    #[test]
    fn windows_pipe_name_returns_none_for_an_invalid_sid() {
        assert_eq!(windows_pipe_name(Some("grays"), 1), None);
    }

    #[test]
    fn windows_pipe_sddl_formats_owner_and_ace_from_the_validated_key() {
        assert_eq!(
            windows_pipe_sddl(Some(WINDOWS_TEST_VALID_SID)),
            Some(format!(
                "O:{WINDOWS_TEST_VALID_SID}D:P(A;;GA;;;{WINDOWS_TEST_VALID_SID})"
            ))
        );
    }

    #[test]
    fn windows_pipe_sddl_never_emits_a_well_known_sid_alias_as_the_trustee() {
        let sddl = windows_pipe_sddl(Some(WINDOWS_TEST_VALID_SID)).expect("valid sid");
        for alias in ["OW", "WD", "AN", "EV"] {
            assert!(
                !sddl.contains(alias),
                "sddl {sddl:?} must never contain the well-known alias {alias:?}"
            );
        }
    }

    #[test]
    fn windows_pipe_sddl_returns_none_for_an_invalid_sid() {
        assert_eq!(windows_pipe_sddl(Some("grays")), None);
    }

    // REQ-46-03 decision point (b) pin: the ACE trustee is the per-user TOKEN SID, not the logon
    // SID. Flip this test together with `windows_pipe_sddl`'s own doc-comment override recipe (and
    // the matching TS source gate in `tauriShellSource.test.ts`, plan 46-03) if that decision is
    // ever reversed.
    #[test]
    fn windows_pipe_sddl_req_46_03_decision_point_b_operator_overridable_dacl_is_per_user_token_sid(
    ) {
        let sddl = windows_pipe_sddl(Some(WINDOWS_TEST_VALID_SID)).expect("valid sid");
        // Exactly one ACE.
        assert_eq!(sddl.matches("(A;").count(), 1);
        // The ACE's trustee is the text after the last ';' and before the closing ')'.
        let ace_end = sddl.rfind(')').expect("sddl must contain a closing paren");
        let ace_start = sddl
            .rfind(';')
            .expect("sddl must contain a trustee separator");
        let trustee = &sddl[ace_start + 1..ace_end];
        assert_eq!(trustee, WINDOWS_TEST_VALID_SID);
        // The owner (`O:`) is also that same SID.
        assert!(sddl.starts_with(&format!("O:{WINDOWS_TEST_VALID_SID}")));
        // Never a logon-SID prefix.
        assert!(!sddl.contains("S-1-5-5-"));
    }

    #[test]
    fn windows_pipe_connect_should_retry_only_for_file_not_found_and_pipe_busy() {
        assert!(windows_pipe_connect_should_retry(Some(2))); // ERROR_FILE_NOT_FOUND
        assert!(windows_pipe_connect_should_retry(Some(231))); // ERROR_PIPE_BUSY
        assert!(!windows_pipe_connect_should_retry(Some(5))); // ERROR_ACCESS_DENIED: never retried
        assert!(!windows_pipe_connect_should_retry(Some(0)));
        assert!(!windows_pipe_connect_should_retry(None));
    }

    #[test]
    fn windows_pipe_owner_matches_requires_both_sids_to_be_valid_and_equal() {
        assert!(windows_pipe_owner_matches(
            WINDOWS_TEST_VALID_SID,
            WINDOWS_TEST_VALID_SID
        ));
        assert!(!windows_pipe_owner_matches(
            WINDOWS_TEST_VALID_SID,
            WINDOWS_TEST_OTHER_VALID_SID
        ));
        assert!(!windows_pipe_owner_matches("grays", "grays"));
        assert!(!windows_pipe_owner_matches("", ""));
    }

    #[test]
    fn single_instance_payload_returns_the_validated_url_for_a_deep_link_arg() {
        let url = "gamelib://launch?appName=1&runner=gog".to_string();
        assert_eq!(single_instance_payload(&[url.clone()]), (url, "deep-link"));
    }

    #[test]
    fn single_instance_payload_returns_the_focus_sentinel_for_empty_argv() {
        assert_eq!(
            single_instance_payload(&[]),
            (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel")
        );
    }

    #[test]
    fn single_instance_payload_returns_the_focus_sentinel_for_non_deep_link_flags() {
        assert_eq!(
            single_instance_payload(&["--no-gui".to_string()]),
            (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel")
        );
        // A non-allow-listed scheme is never forwarded -- it degrades to the focus sentinel too.
        assert_eq!(
            single_instance_payload(&["evil://payload".to_string()]),
            (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel")
        );
    }

    // ---- quick-260925-uok: the Windows `gamelib://` HKCU self-heal decision helpers ----
    //
    // The PURE half of the repair, following REQ-46-07's precedent exactly: every non-FFI
    // decision is a plain function unit-tested on ANY host, while the `#[cfg(windows)]` FFI half
    // (`repair_windows_gamelib_protocol_registration`) does I/O and nothing else and is exercised
    // by no test at all. These cases are therefore the ONLY automated coverage of what the repair
    // decides -- see the completed todo
    // `.planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md`
    // for the live Windows gate that has NOT been run.

    #[test]
    fn gamelib_protocol_command_exe_extracts_the_exe_from_every_shape_the_registry_can_hold() {
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\Program Files\GameLib\gamelib-shell.exe" "%1""#),
            Some(r"C:\Program Files\GameLib\gamelib-shell.exe".to_string()),
            "the NSIS installer's own shape"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\a\b.exe" %1"#),
            Some(r"C:\a\b.exe".to_string()),
            "an UNQUOTED %1 placeholder is still a legal handler command"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#"C:\nospaces\b.exe "%1""#),
            Some(r"C:\nospaces\b.exe".to_string()),
            "an unquoted exe path is legal when it contains no spaces"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\a\b.exe""#),
            Some(r"C:\a\b.exe".to_string()),
            "no argument at all"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#"   "C:\a\b.exe" "%1"   "#),
            Some(r"C:\a\b.exe".to_string()),
            "surrounding whitespace is not part of the path"
        );
    }

    #[test]
    fn gamelib_protocol_command_exe_returns_none_for_every_malformed_shape() {
        assert_eq!(gamelib_protocol_command_exe(""), None);
        assert_eq!(gamelib_protocol_command_exe("   "), None);
        assert_eq!(
            gamelib_protocol_command_exe(r#""" "%1""#),
            None,
            "an EMPTY quoted path is malformed, not a handler living at the empty path"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\a\b.exe"#),
            None,
            "an unterminated opening quote is malformed -- guessing where it ends would be \
             inventing data out of an untrusted third-party registry value (T-UOK-04)"
        );
    }

    #[test]
    fn gamelib_protocol_paths_equivalent_compares_ordinal_ignore_case_without_touching_the_disk() {
        assert!(gamelib_protocol_paths_equivalent(
            r"C:\A\B.EXE",
            r"c:\a\b.exe"
        ));
        assert!(gamelib_protocol_paths_equivalent(
            r"  C:\a\b.exe  ",
            r"C:\a\b.exe"
        ));
        assert!(
            gamelib_protocol_paths_equivalent(r"\\?\C:\a\b.exe", r"C:\a\b.exe"),
            "std::env::current_exe() can return an extended-length prefix"
        );
        assert!(gamelib_protocol_paths_equivalent(
            r"C:\a\b.exe",
            r"\\?\C:\a\b.exe"
        ));
        assert!(!gamelib_protocol_paths_equivalent(
            r"C:\a\b.exe",
            r"C:\a\c.exe"
        ));
        assert!(
            !gamelib_protocol_paths_equivalent("", ""),
            "two empty paths are not a match -- an empty stored value must route to repair"
        );
        assert!(
            gamelib_protocol_paths_equivalent(
                r"C:\Nonexistent\deleted\gamelib-shell.exe",
                r"c:\NONEXISTENT\DELETED\gamelib-shell.exe"
            ),
            "a DANGLING path must still compare -- canonicalize() would fail on exactly the case \
             this feature exists for, so the comparison is deliberately filesystem-free"
        );
    }

    #[test]
    fn gamelib_protocol_repair_needed_is_true_for_absent_empty_and_malformed_values() {
        let exe = r"C:\Program Files\GameLib\gamelib-shell.exe";
        assert!(
            gamelib_protocol_repair_needed(None, exe),
            "the key or its default value is absent"
        );
        assert!(
            gamelib_protocol_repair_needed(Some(""), exe),
            "present but empty"
        );
        assert!(
            gamelib_protocol_repair_needed(Some(r#""C:\a"#), exe),
            "unparseable -- routes to repair, never to a crash (T-UOK-04)"
        );
        assert!(
            gamelib_protocol_repair_needed(Some(r#""C:\Other\thief.exe" "%1""#), exe),
            "points at a DIFFERENT executable -- the hijack this feature exists for"
        );
    }

    #[test]
    fn gamelib_protocol_repair_needed_is_false_when_the_value_already_points_at_us() {
        // The anti-churn case. A naive string equality here produces a registry rewrite on
        // every single launch, forever.
        let exe = r"C:\Program Files\GameLib\gamelib-shell.exe";
        assert!(!gamelib_protocol_repair_needed(
            Some(r#""C:\Program Files\GameLib\gamelib-shell.exe" "%1""#),
            exe
        ));
        assert!(
            !gamelib_protocol_repair_needed(
                Some(r#""c:\program files\gamelib\GAMELIB-SHELL.EXE" "%1""#),
                exe
            ),
            "Windows path comparison is ordinal-ignore-case"
        );
        assert!(
            !gamelib_protocol_repair_needed(
                Some(r#""C:\Program Files\GameLib\gamelib-shell.exe""#),
                exe
            ),
            "still OUR exe with the argument omitted"
        );
    }

    #[test]
    fn gamelib_protocol_written_values_are_byte_identical_in_shape_to_the_nsis_installer() {
        assert_eq!(
            gamelib_protocol_open_command(r"C:\Program Files\GameLib\gamelib-shell.exe"),
            r#""C:\Program Files\GameLib\gamelib-shell.exe" "%1""#
        );
        assert_eq!(
            gamelib_protocol_default_value("com.gamelib.shell"),
            "URL:com.gamelib.shell protocol"
        );
        assert_eq!(
            gamelib_protocol_default_icon(r"C:\Program Files\GameLib\gamelib-shell.exe"),
            r#""C:\Program Files\GameLib\gamelib-shell.exe",0"#,
            "NO space after the comma -- the NSIS template writes exactly `\"<exe>\",0`"
        );
    }

    #[test]
    fn gamelib_protocol_repair_output_satisfies_its_own_detector() {
        // The round trip is the one that matters most: a repair whose OWN output still reads as
        // "repair needed" rewrites the key on every launch for the life of the install.
        let exe = r"C:\Program Files\GameLib\gamelib-shell.exe";
        let produced = gamelib_protocol_open_command(exe);
        assert!(!gamelib_protocol_repair_needed(Some(&produced), exe));
    }

    // ---- quick-260926-f3l: dev builds do not claim gamelib:// ----

    #[test]
    fn gamelib_protocol_dev_build_dirs_bakes_the_manifest_dir_target() {
        assert_eq!(
            gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", None),
            vec![r"C:\repo\src-tauri\target".to_string()]
        );
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_adds_an_absolute_cargo_target_dir() {
        let dirs = gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some(r"D:\cargo-out"));
        assert!(dirs.contains(&r"C:\repo\src-tauri\target".to_string()));
        assert!(dirs.contains(&r"D:\cargo-out".to_string()));
        assert_eq!(dirs.len(), 2);
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_joins_a_relative_cargo_target_dir_to_the_manifest_dir() {
        let dirs = gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some("out"));
        assert!(
            dirs.contains(&r"C:\repo\src-tauri\out".to_string()),
            "a relative CARGO_TARGET_DIR is joined to the manifest dir, approximating cargo's \
             own cwd-relative rule: {dirs:?}"
        );
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_treats_blank_cargo_target_dir_as_none() {
        assert_eq!(
            gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some("")),
            vec![r"C:\repo\src-tauri\target".to_string()]
        );
        assert_eq!(
            gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some("   ")),
            vec![r"C:\repo\src-tauri\target".to_string()]
        );
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_yields_no_bare_target_entry_for_a_blank_manifest_dir() {
        assert_eq!(
            gamelib_protocol_dev_build_dirs("", None),
            Vec::<String>::new()
        );
        assert_eq!(
            gamelib_protocol_dev_build_dirs("   ", None),
            Vec::<String>::new()
        );
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_matches_only_inside_the_cargo_target_dir() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(gamelib_protocol_exe_is_dev_build(
            r"C:\repo\src-tauri\target\debug\gamelib-shell.exe",
            &target
        ));
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_ignores_case_slash_style_and_extended_length_prefix() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(
            gamelib_protocol_exe_is_dev_build(r"c:\REPO\SRC-TAURI\TARGET\debug\x.exe", &target),
            "case differences must not matter"
        );
        assert!(
            gamelib_protocol_exe_is_dev_build("C:/repo/src-tauri/target/debug/x.exe", &target),
            "forward slashes must normalise the same as backslashes"
        );
        assert!(
            gamelib_protocol_exe_is_dev_build(r"\\?\C:\repo\src-tauri\target\debug\x.exe", &target),
            "a \\\\?\\ extended-length prefix on the exe must be stripped"
        );
        let target_with_prefix = vec![r"\\?\C:\repo\src-tauri\target".to_string()];
        assert!(
            gamelib_protocol_exe_is_dev_build(
                r"C:\repo\src-tauri\target\debug\x.exe",
                &target_with_prefix
            ),
            "a \\\\?\\ extended-length prefix on the dir must be stripped too"
        );
        let target_trailing_slash = vec![r"C:\repo\src-tauri\target\".to_string()];
        assert!(
            gamelib_protocol_exe_is_dev_build(
                r"C:\repo\src-tauri\target\debug\x.exe",
                &target_trailing_slash
            ),
            "a trailing backslash on the dir must not change the outcome"
        );
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_respects_the_separator_boundary() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\target-other\x.exe", &target),
            "a sibling dir sharing `target` as a text prefix must not match"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\targetx.exe", &target),
            "a filename sharing `target` as a text prefix must not match"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\target", &target),
            "the dir itself, with nothing after the separator, must not match"
        );
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_is_false_for_installed_paths() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(!gamelib_protocol_exe_is_dev_build(
            r"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe",
            &target
        ));
        assert!(!gamelib_protocol_exe_is_dev_build(
            r"C:\Program Files\GameLib\gamelib-shell.exe",
            &target
        ));
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_routes_every_doubt_to_repair() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(
            !gamelib_protocol_exe_is_dev_build("", &target),
            "an empty exe must route to repair, not to skip"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\target\debug\x.exe", &[]),
            "an empty build_dirs must route to repair"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(
                r"C:\repo\src-tauri\target\debug\x.exe",
                &["".to_string()]
            ),
            "build_dirs holding only a blank entry must route to repair"
        );
    }
}
