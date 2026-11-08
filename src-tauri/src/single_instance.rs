use super::*;

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

// ---- Windows `gamelib://` self-heal: the DECISION half (quick-260925-uok) -------------------
//
// (1) These eight functions are the deciding half of the Windows `gamelib://` HKCU self-heal;
// `repair_windows_gamelib_protocol_registration` (in the `#[cfg(windows)]` FFI tier below) does
// the I/O and nothing else. The split is not stylistic -- it is REQ-46-07's precedent, restated
// in the banner immediately below this block: every non-FFI decision is a plain function,
// unit-tested in `#[cfg(test)] mod tests` on ANY host, because the FFI tier is testable nowhere.
// None of these eight is `#[cfg(...)]`-gated, so they compile and are exercised on the macOS and
// Linux CI legs too. (The `#[cfg_attr(not(windows), allow(dead_code))]` each carries is a
// conditional LINT attribute, not conditional compilation -- the same annotation every pure
// `windows_*` single-instance helper above already uses, and for the same reason: their only
// non-test caller is `#[cfg(windows)]`.) The last two of the eight
// (`gamelib_protocol_dev_build_dirs` / `gamelib_protocol_exe_is_dev_build`, quick-260926-f3l) are
// a second decision bolted onto the same repair: whether the running exe is a dev build of THIS
// tree, in which case the repair must skip rather than hijack the scheme away from an install.
//
// (2) Byte-compatibility with the NSIS installer is the whole correctness criterion for the
// writer, so the exact shapes are pinned here. The generated installer script writes four values
// under `SHCTX` (= HKCU: `!define INSTALLMODE "currentUser"`), with `$\"` being NSIS's escaped
// double-quote:
//
//     Software\Classes\gamelib                     "URL Protocol"  = ""            (empty REG_SZ)
//     Software\Classes\gamelib                     (default)       = "URL:<bundle id> protocol"
//     Software\Classes\gamelib\DefaultIcon         (default)       = "<exe>",0
//     Software\Classes\gamelib\shell\open\command  (default)       = "<exe>" "%1"
//
// Source: `src-tauri/target/debug/nsis/x64/installer.nsi:922-925` -- NOTE that path is a
// GENERATED BUILD ARTEFACT (`src-tauri/.gitignore:2`) and does NOT resolve on a clean checkout;
// re-derive it with a Windows bundle build if you need to re-read it. The bundle id is NEVER
// hardcoded here: the caller passes `app.config().identifier`, so the written value cannot drift
// from `tauri.conf.json`.
//
// (3) Path comparison is deliberately FILESYSTEM-FREE -- no `canonicalize()`, no `exists()`. The
// live 2026-09-25 incident that motivated this feature left the stored value pointing at a
// DELETED executable, so any comparison that touched the disk would fail on precisely the case
// the repair exists to fix.

/// Extracts the executable path from a `shell\open\command` value, or `None` if the value is
/// empty, whitespace-only, or malformed. Handles all four shapes Windows accepts: a quoted exe
/// with a quoted `"%1"`, a quoted exe with a bare `%1`, an unquoted (space-free) exe, and an exe
/// with no argument at all. An unterminated opening quote yields `None` rather than a guess --
/// this string is untrusted third-party data written by whatever last claimed the scheme
/// (T-UOK-04), and `None` routes to "repair needed", which is the safe outcome.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_command_exe(command: &str) -> Option<String> {
    let trimmed = command.trim();
    let exe = match trimmed.strip_prefix('"') {
        Some(rest) => {
            let end = rest.find('"')?;
            &rest[..end]
        }
        None => trimmed.split_whitespace().next()?,
    };
    if exe.trim().is_empty() {
        return None;
    }
    Some(exe.to_string())
}

/// Whether two executable paths name the same file, for the purposes of the self-heal decision.
/// Ordinal ignore-case (`eq_ignore_ascii_case`, NOT a locale-aware fold -- Windows path
/// comparison is ordinal), surrounding whitespace ignored, and a leading `\\?\` extended-length
/// prefix stripped from either side because `std::env::current_exe()` can return one. Two empty
/// paths are NOT equivalent: an empty stored value must route to repair, not to "already fine".
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_paths_equivalent(a: &str, b: &str) -> bool {
    fn normalised(path: &str) -> &str {
        let trimmed = path.trim();
        match trimmed.strip_prefix(r"\\?\") {
            Some(rest) => rest,
            None => trimmed,
        }
    }
    let (a, b) = (normalised(a), normalised(b));
    !a.is_empty() && a.eq_ignore_ascii_case(b)
}

/// The self-heal decision itself: does `HKCU\Software\Classes\gamelib\shell\open\command`'s
/// stored default value need rewriting to point at `current_exe`? `None` (key or value absent),
/// an empty value, an unparseable value, and a value naming a DIFFERENT executable all mean yes.
/// A value naming the current executable -- in any case, with or without its `"%1"` argument --
/// means NO, and that arm is load-bearing: a naive string equality here would rewrite the user's
/// registry on every single launch for the life of the install.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_repair_needed(stored: Option<&str>, current_exe: &str) -> bool {
    match stored.and_then(gamelib_protocol_command_exe) {
        Some(exe) => !gamelib_protocol_paths_equivalent(&exe, current_exe),
        None => true,
    }
}

/// The `shell\open\command` default value the repair writes: `"<exe>" "%1"`, byte-identical in
/// shape to the installer's row 4 above.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_open_command(exe: &str) -> String {
    format!("\"{exe}\" \"%1\"")
}

/// The `Software\Classes\gamelib` default value the repair writes: `URL:<identifier> protocol`,
/// the installer's row 2. `identifier` is `app.config().identifier`, never a literal.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_default_value(identifier: &str) -> String {
    format!("URL:{identifier} protocol")
}

/// The `DefaultIcon` default value the repair writes: `"<exe>",0`, the installer's row 3. There
/// is deliberately NO space after the comma -- the NSIS output has none.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_default_icon(exe: &str) -> String {
    format!("\"{exe}\",0")
}

/// The set of directories a `current_exe()` value must be inside for
/// `gamelib_protocol_exe_is_dev_build` to treat it as a dev build of this repo (quick-260926-f3l).
/// Baked entirely from compile-time environment -- `env!("CARGO_MANIFEST_DIR")` and
/// `option_env!("CARGO_TARGET_DIR")` -- never read from disk.
///
/// `manifest_dir` contributes `<manifest_dir>\target` (cargo's default output dir) when non-blank
/// after trimming; a blank `manifest_dir` contributes nothing (never the bare `\target`).
/// `cargo_target_dir`, when `Some` and non-blank after trimming, contributes a SECOND directory:
/// used AS-IS when it is Windows-absolute, or joined to `manifest_dir` with `\` otherwise -- this
/// approximates cargo's own rule that a relative `CARGO_TARGET_DIR` resolves relative to the
/// directory cargo was invoked from, which for `tauri dev` is `src-tauri` (=
/// `CARGO_MANIFEST_DIR`). "Windows-absolute" is decided with a plain STRING check (a leading `\\`
/// or `\`, or a drive letter + `:` + `\`/`/`), never `std::path::Path::is_absolute`, because that
/// method is host-dependent -- `C:\x` is NOT absolute on the macOS/Linux CI legs, which would make
/// this function (and its unit tests) disagree across hosts.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_dev_build_dirs(
    manifest_dir: &str,
    cargo_target_dir: Option<&str>,
) -> Vec<String> {
    fn is_windows_absolute(path: &str) -> bool {
        if path.starts_with('\\') {
            return true;
        }
        let bytes = path.as_bytes();
        bytes.len() >= 2
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes.len() == 2 || bytes[2] == b'\\' || bytes[2] == b'/')
    }

    let mut dirs = Vec::new();
    let manifest_trimmed = manifest_dir.trim();
    if !manifest_trimmed.is_empty() {
        dirs.push(format!("{manifest_trimmed}\\target"));
    }
    if let Some(target_dir) = cargo_target_dir {
        let target_trimmed = target_dir.trim();
        if !target_trimmed.is_empty() {
            if is_windows_absolute(target_trimmed) {
                dirs.push(target_trimmed.to_string());
            } else if !manifest_trimmed.is_empty() {
                dirs.push(format!("{manifest_trimmed}\\{target_trimmed}"));
            } else {
                dirs.push(target_trimmed.to_string());
            }
        }
    }
    dirs
}

/// The dev-build decision itself (quick-260926-f3l): is `current_exe` running from inside one of
/// `build_dirs`? Pure and FILESYSTEM-FREE, for the identical reason as point (3) in the DECISION
/// block banner above -- no `canonicalize()`, no `exists()`.
///
/// Both sides are normalised identically before comparing: trimmed, a leading `\\?\`
/// extended-length prefix stripped, `/` replaced with `\`, and (for the directory) a trailing `\`
/// trimmed. The comparison itself is ordinal ASCII ignore-case (`to_ascii_lowercase`), matching
/// `gamelib_protocol_paths_equivalent`'s own rule -- Windows path comparison is ordinal, not
/// locale-aware. `current_exe` must start with a `dir` (lowercased) followed by a `\` separator,
/// AND have at least one character after that separator: `dir` itself is NOT inside `dir`, and a
/// sibling directory sharing `dir` as a mere text prefix (e.g. `target-other`) is not either --
/// the separator is the boundary, not a bare `starts_with`.
///
/// Every doubt here returns `false`, which routes to REPAIR (T-F3L-01): an empty `current_exe`,
/// an empty `build_dirs`, or `build_dirs` holding only blank entries. A false positive here would
/// silently stop an INSTALLED app from self-healing, which is the uok regression this function
/// must never cause.
///
/// Three predicates were considered for "is this a dev build" and this is the CHOSEN one.
/// `cfg!(debug_assertions)` was rejected because the debug NSIS installer build installed at
/// `%LOCALAPPDATA%\GameLib` is also a debug build, and it must still self-heal. Allow-listing the
/// install root was rejected because the NSIS install directory is not fixed -- user-chosen,
/// per-machine, or a portable copy -- and an allow-list would silently stop repairing every
/// legitimate install outside the one path it knows. Chosen: deny-list exactly THIS build's own
/// cargo target dir, baked at compile time via `env!("CARGO_MANIFEST_DIR")` /
/// `option_env!("CARGO_TARGET_DIR")`, so it names only the tree that produced this binary -- an
/// installed copy of the same binary never runs from inside it.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn gamelib_protocol_exe_is_dev_build(current_exe: &str, build_dirs: &[String]) -> bool {
    fn normalised(path: &str) -> String {
        let trimmed = path.trim();
        let stripped = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);
        stripped.replace('/', "\\")
    }

    let exe = normalised(current_exe).to_ascii_lowercase();
    if exe.is_empty() {
        return false;
    }
    build_dirs.iter().any(|dir| {
        let dir_normalised = normalised(dir);
        let dir_trimmed = dir_normalised.trim_end_matches('\\');
        if dir_trimmed.is_empty() {
            return false;
        }
        let prefix = format!("{}\\", dir_trimmed.to_ascii_lowercase());
        exe.starts_with(&prefix) && exe.len() > prefix.len()
    })
}

// ---- Windows single-instance guard: FFI (Phase 46 plan 46-02) -----------------------------
//
// Everything below is `#[cfg(windows)]`-only and calls `windows-sys` Win32 FFI directly -- unlike
// the pure name/SDDL helpers above (plan 46-01), these functions are not unit-tested (mirrors
// `acquire_single_instance`'s own precedent: exercised by the live gate, REQ-46-10, not `cargo
// test`). Every failure here degrades to `PrimaryWithoutListener` or `None` (T-34.5-G6-24,
// fail-open) -- never a panic, never an abort.

/// Windows counterpart to `SingleInstanceRole` above. `Primary` holds the first pipe instance the
/// accept loop in `main()`'s `.setup()` closure will service (wired in plan 46-03, not this one).
/// `PrimaryWithoutListener` behaves identically to a primary process (spawns the sidecar, opens
/// the window) but has no pipe to accept connections on -- the FAIL-OPEN path (T-34.5-G6-24) for
/// every recoverable failure: SID/session lookup failure, mutex creation failure, SDDL derivation
/// failure, or pipe creation failure. `Secondary` means another instance already holds the mutex.
///
/// Stricter than the Unix `PrimaryWithoutListener`: a Windows `PrimaryWithoutListener` STILL
/// holds the mutex (acquired before this enum is even constructed), so every LATER launch in this
/// session still exits as a `Secondary` -- it loses the deep link (no pipe to write to) but never
/// becomes a second full instance. The Unix `PrimaryWithoutListener` has no mutex-equivalent
/// holding it exclusive, so the Unix guard's next launch can still bind the socket and become
/// primary itself.
#[cfg(windows)]
pub(crate) struct WindowsPrimaryPipe {
    #[allow(dead_code)] // consumed by plan 46-03's accept loop, not this plan
    first_instance: std::os::windows::io::OwnedHandle,
    #[allow(dead_code)] // consumed by plan 46-03's accept loop, not this plan
    pipe_name: String,
    #[allow(dead_code)] // consumed by plan 46-03's accept loop, not this plan
    sddl: String,
}

#[cfg(windows)]
pub(crate) enum WindowsSingleInstanceRole {
    Primary(WindowsPrimaryPipe),
    PrimaryWithoutListener,
    Secondary { pipe_name: String, user_sid: String },
}

/// Reads the current process token's user SID (as an `S-1-...` string) and Terminal Services
/// session id -- the two values `windows_mutex_name`/`windows_pipe_name`/`windows_pipe_sddl`
/// derive every Windows single-instance name and DACL from. Returns `None` on ANY failure
/// (T-34.5-G6-24, fail-open): a missing/unreadable token, a `GetTokenInformation` failure, or a
/// SID-string conversion failure all fall back to `PrimaryWithoutListener`/no guard at the call
/// site, never a panic. The token handle is closed on every exit path -- there is no early
/// `return`/`?` between a successful `OpenProcessToken` and the final `CloseHandle` below.
///
/// Decision point (b), operator-overridable: see `windows_pipe_sddl`'s doc comment (plan 46-01,
/// REQUIREMENTS.md Phase 46 "Open decision points") for the full override recipe and its
/// same-user cross-logon-session consequence. This function reads the token's USER SID
/// (`TokenUser`) only, and deliberately does NOT read the logon SID (`TokenLogonSid`, or
/// `TokenGroups` walked for `SE_GROUP_LOGON_ID`) -- the pipe DACL default is per-user, not
/// per-logon-session. Do not add either of those calls here without also flipping
/// `windows_pipe_sddl`'s pinned decision unit test and the matching TS source gate (plan 46-03).
#[cfg(windows)]
pub(crate) fn current_user_identity() -> Option<(String, u32)> {
    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE};
    use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenSessionId, TokenUser, TOKEN_QUERY, TOKEN_USER,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    // SAFETY: every Win32 call below is documented at its own call site. `token`, once
    // successfully opened by `OpenProcessToken`, is closed exactly once via the unconditional
    // `CloseHandle(token)` after the IIFE below returns -- the IIFE itself never closes it, so no
    // path (success or any of its early `None` returns) can double-close or leak the handle.
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return None;
        }

        let result: Option<(String, u32)> = (|| {
            // Two-call size-probe pattern: the first call with a zero-length buffer reports the
            // required size via `needed`, regardless of its own BOOL return value.
            let mut needed: u32 = 0;
            GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut needed);
            if needed == 0 {
                return None;
            }
            let mut buf: Vec<u8> = vec![0u8; needed as usize];
            let mut written = needed;
            if GetTokenInformation(
                token,
                TokenUser,
                buf.as_mut_ptr() as *mut core::ffi::c_void,
                needed,
                &mut written,
            ) == 0
            {
                return None;
            }
            // SAFETY: `buf` was sized by the probe call above and filled by this call for
            // `TokenUser`, which documents its output as a `TOKEN_USER` struct at the start of
            // the buffer.
            let token_user = &*(buf.as_ptr() as *const TOKEN_USER);

            let mut sid_str_ptr: windows_sys::core::PWSTR = std::ptr::null_mut();
            if ConvertSidToStringSidW(token_user.User.Sid, &mut sid_str_ptr) == 0 {
                return None;
            }
            // SAFETY: on success `sid_str_ptr` is a non-null, NUL-terminated wide string, per
            // `ConvertSidToStringSidW`'s documented contract; copied into an owned `String` and
            // freed with `LocalFree` immediately below, so the allocation never outlives this
            // scope.
            let sid_len = (0..).take_while(|&i| *sid_str_ptr.add(i) != 0).count();
            let sid_slice = std::slice::from_raw_parts(sid_str_ptr, sid_len);
            let sid = String::from_utf16_lossy(sid_slice);
            LocalFree(sid_str_ptr as *mut core::ffi::c_void);

            let mut session_id: u32 = 0;
            let mut session_len: u32 = std::mem::size_of::<u32>() as u32;
            if GetTokenInformation(
                token,
                TokenSessionId,
                &mut session_id as *mut u32 as *mut core::ffi::c_void,
                session_len,
                &mut session_len,
            ) == 0
            {
                return None;
            }

            Some((sid, session_id))
        })();

        CloseHandle(token);
        result
    }
}

/// Self-heals the Windows `gamelib://` protocol registration under
/// `HKCU\Software\Classes\gamelib` when it is missing, dangling, or pointing at a different
/// executable, rewriting all four installer-shaped values to point at the CURRENTLY-RUNNING
/// executable. Closes the todo
/// `2026-09-25-windows-gamelib-registration-is-install-time-only.md` (quick-260925-uok, option 1
/// of its Options list). See the decision-point (a) comment block in `.setup()` for why this is
/// deliberately narrower than the deep-link plugin's own whole-scheme registration, and for the
/// last-launch-wins consequence on a machine carrying two GameLib installs.
///
/// FAIL OPEN, NEVER FAIL CLOSED (T-34.5-G6-24, T-UOK-03): returns `()` and is infallible by
/// construction, exactly like `shell_diag`. A missing key, an access-denied, a failed read, a
/// failed write -- every one logs a warning and moves on. There is no `unwrap()`, `expect(`,
/// `panic!` or `?` anywhere in this body (pinned by a region-scoped source gate in
/// `src/backend/__tests__/tauriShellSource.test.ts`), because a protocol registration that could
/// not be repaired must degrade deep links, never abort startup.
///
/// `CI=e2e` returns BEFORE the first registry call (T-UOK-02). That guard is load-bearing HERE in
/// a way it is not on the Linux `register_all()` arm: this path WRITES to the real user registry,
/// so an automated run that skipped it would rewrite the host's protocol association as a side
/// effect of merely starting the app.
///
/// Also skips, before any registry call, when the running exe is a DEV BUILD of this repo --
/// running in place from this build's own cargo target dir (quick-260926-f3l). Without this, every
/// `pnpm tauri:dev` re-pointed the scheme at `src-tauri\target\debug\gamelib-shell.exe` and left it
/// there after the dev session ended, last-launch-wins stealing the scheme from an installed copy
/// (the todo `2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md`). The
/// decision is `gamelib_protocol_exe_is_dev_build`, the unit-tested half.
///
/// LOG DISCIPLINE (T-UOK-01, the same rule as the deep-link path's T-34.5-G6-25): the stored
/// command value is attacker-controlled, unbounded-length third-party data written by whatever
/// last claimed the scheme. It is NEVER logged verbatim -- only the registry subkey path (our own
/// constants), the outcome, and a coarse classification of `absent` / `unparseable` /
/// `points-elsewhere`.
///
/// Like every other function in this tier it is exercised by NO automated test; the decision it
/// delegates to (`gamelib_protocol_repair_needed`) is the unit-tested half.
#[cfg(windows)]
pub(crate) fn repair_windows_gamelib_protocol_registration(identifier: &str) {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_EXPAND_SZ, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    const ROOT_SUBKEY: &str = r"Software\Classes\gamelib";
    const ICON_SUBKEY: &str = r"Software\Classes\gamelib\DefaultIcon";
    const COMMAND_SUBKEY: &str = r"Software\Classes\gamelib\shell\open\command";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    if std::env::var("CI").as_deref() == Ok("e2e") {
        shell_eprintln!(
            "[shell] CI=e2e -- skipping the gamelib:// HKCU registration repair (unlike the Linux arm, this path WRITES to the real user registry)"
        );
        return;
    }

    let exe_path = match std::env::current_exe() {
        Ok(path) => path,
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: gamelib:// HKCU repair skipped -- current_exe() failed ({e}) (fail-open, T-34.5-G6-24)"
            );
            return;
        }
    };
    let Some(exe) = exe_path.to_str() else {
        shell_eprintln!(
            "[shell] WARN: gamelib:// HKCU repair skipped -- the executable path is not valid UTF-8 (fail-open, T-34.5-G6-24)"
        );
        return;
    };

    let dev_build_dirs = gamelib_protocol_dev_build_dirs(
        env!("CARGO_MANIFEST_DIR"),
        option_env!("CARGO_TARGET_DIR"),
    );
    if gamelib_protocol_exe_is_dev_build(exe, &dev_build_dirs) {
        shell_eprintln!(
            "[shell] dev build running from its cargo target dir -- skipping the gamelib:// HKCU registration repair (the installed app owns the scheme; quick-260926-f3l)"
        );
        return;
    }

    // SAFETY: every Win32 call below is a registry call taking NUL-terminated wide strings that
    // are kept alive (`command_w`, `empty_name_w`, and the per-write `subkey_w`/`value_name_w`/
    // `value_w`) for the whole of the call that reads them. Both `HKEY`s are local: the read
    // handle is closed by the unconditional `RegCloseKey(key)` at the end of its own `if` body,
    // with no early `return` between the successful `RegOpenKeyExW` and that close; each write
    // handle is closed by the `RegCloseKey(write_key)` immediately after its `RegSetValueExW`,
    // on both the success and the failure path, before the loop can `continue`. `buf` is sized
    // from the two-call `cbData` size probe and the read-back length is re-clamped to
    // `buf.len()` before slicing, so no out-of-bounds read is possible even if the value grew
    // between the probe and the read.
    unsafe {
        let command_w = wide(COMMAND_SUBKEY);
        let empty_name_w: [u16; 1] = [0];

        let mut stored: Option<String> = None;
        let mut key: HKEY = std::ptr::null_mut();
        // ANY non-success open -- including ERROR_FILE_NOT_FOUND, the dangling case -- leaves
        // `stored` as `None`, which is a legitimate "repair needed" input, not an error to bail
        // on. That is the whole point of the feature.
        if RegOpenKeyExW(HKEY_CURRENT_USER, command_w.as_ptr(), 0, KEY_READ, &mut key)
            == ERROR_SUCCESS
        {
            let mut value_type: u32 = 0;
            let mut cb_data: u32 = 0;
            // Two-call size probe: the first call with a null `lpData` reports the byte length.
            if RegQueryValueExW(
                key,
                empty_name_w.as_ptr(),
                std::ptr::null(),
                &mut value_type,
                std::ptr::null_mut(),
                &mut cb_data,
            ) == ERROR_SUCCESS
                && (value_type == REG_SZ || value_type == REG_EXPAND_SZ)
                && cb_data > 0
            {
                let mut buf: Vec<u16> = vec![0u16; (cb_data as usize).div_ceil(2)];
                let mut cb_read = (buf.len() * 2) as u32;
                if RegQueryValueExW(
                    key,
                    empty_name_w.as_ptr(),
                    std::ptr::null(),
                    &mut value_type,
                    buf.as_mut_ptr() as *mut u8,
                    &mut cb_read,
                ) == ERROR_SUCCESS
                    && (value_type == REG_SZ || value_type == REG_EXPAND_SZ)
                {
                    let chars = ((cb_read as usize) / 2).min(buf.len());
                    let slice = &buf[..chars];
                    // A REG_SZ read back this way is not guaranteed to be NUL-terminated, and
                    // may carry more than one trailing NUL. Cut at the first one, or take the
                    // whole slice when there is none.
                    let end = match slice.iter().position(|&unit| unit == 0) {
                        Some(index) => index,
                        None => chars,
                    };
                    stored = Some(String::from_utf16_lossy(&slice[..end]));
                }
            }
            RegCloseKey(key);
        }

        if !gamelib_protocol_repair_needed(stored.as_deref(), exe) {
            // The overwhelmingly common path: the key already points at us. Write nothing and
            // log nothing -- a line here would append to the diagnostic file on every launch.
            return;
        }

        let classification = match stored.as_deref() {
            None => "absent",
            Some(value) if gamelib_protocol_command_exe(value).is_none() => "unparseable",
            Some(_) => "points-elsewhere",
        };

        let root_default = gamelib_protocol_default_value(identifier);
        let icon_default = gamelib_protocol_default_icon(exe);
        let command_default = gamelib_protocol_open_command(exe);

        // All FOUR of the installer's values, in the installer's own order -- not just the
        // command. Whatever rewrote `shell\open\command` may equally have rewritten the default
        // and the icon, and writing the complete installer-shaped set is what leaves the key
        // byte-compatible with a fresh install rather than a third divergent shape.
        let writes: [(&str, &str, &str); 4] = [
            (ROOT_SUBKEY, "URL Protocol", ""),
            (ROOT_SUBKEY, "", root_default.as_str()),
            (ICON_SUBKEY, "", icon_default.as_str()),
            (COMMAND_SUBKEY, "", command_default.as_str()),
        ];

        let mut written = 0usize;
        for (subkey, value_name, value) in writes {
            let subkey_w = wide(subkey);
            let value_name_w = wide(value_name);
            let value_w = wide(value);

            let mut write_key: HKEY = std::ptr::null_mut();
            let created = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                subkey_w.as_ptr(),
                0,
                std::ptr::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                std::ptr::null(),
                &mut write_key,
                std::ptr::null_mut(),
            );
            if created != ERROR_SUCCESS {
                shell_eprintln!(
                    "[shell] WARN: gamelib:// HKCU repair could not open HKCU\\{subkey} for writing (error {created}) -- continuing with the remaining values (fail-open, T-34.5-G6-24)"
                );
                continue;
            }

            // `cbData` counts BYTES and must include the NUL terminator `wide()` appended.
            let set = RegSetValueExW(
                write_key,
                value_name_w.as_ptr(),
                0,
                REG_SZ,
                value_w.as_ptr() as *const u8,
                (value_w.len() * 2) as u32,
            );
            RegCloseKey(write_key);

            if set == ERROR_SUCCESS {
                written += 1;
            } else {
                shell_eprintln!(
                    "[shell] WARN: gamelib:// HKCU repair could not write HKCU\\{subkey} value '{value_name}' (error {set}) -- continuing with the remaining values (fail-open, T-34.5-G6-24)"
                );
            }
        }

        // One line, through the file-backed sink, because a bundled app's stderr is discarded and
        // "did the repair run, and what did it decide?" is exactly what this sink exists for.
        // The classification, never the stored value itself (T-UOK-01).
        shell_diag(&format!(
            "repaired the gamelib:// HKCU registration (prior value: {classification}) -- {written}/4 installer-shaped values written under HKCU\\{ROOT_SUBKEY}"
        ));
    }
}

/// Creates one instance of the single-instance named pipe, from a pure SDDL string (never
/// hand-rolled `SECURITY_DESCRIPTOR` bytes -- see 46-RESEARCH.md "Don't Hand-Roll"). `first` sets
/// `FILE_FLAG_FIRST_PIPE_INSTANCE`: on the primary's very first pipe instance this makes
/// `CreateNamedPipeW` FAIL (rather than silently join) if another process already created a pipe
/// of the same name (T-46-01) -- a squatted or cross-session-collided name falls back to
/// `PrimaryWithoutListener` at the call site, never a hard error.
///
/// `lpSecurityAttributes` is never `NULL`: the default pipe DACL grants Everyone/Anonymous read
/// (46-RESEARCH.md Q2), far broader than this per-user guard's trust boundary. Uses
/// `PIPE_ACCESS_INBOUND`, not the more permissive `PIPE_ACCESS_DUPLEX` RESEARCH sketched: the
/// primary only ever reads a payload off this pipe (deviation from RESEARCH, least privilege).
#[cfg(windows)]
fn create_single_instance_pipe_instance(
    pipe_name: &str,
    sddl: &str,
    first: bool,
) -> std::io::Result<std::os::windows::io::OwnedHandle> {
    use windows_sys::Win32::Foundation::{LocalFree, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Security::Authorization::{
        ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
    };
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_INBOUND,
    };
    use windows_sys::Win32::System::Pipes::{
        CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE,
        PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
    };

    let name_w: Vec<u16> = pipe_name.encode_utf16().chain(std::iter::once(0)).collect();
    let sddl_w: Vec<u16> = sddl.encode_utf16().chain(std::iter::once(0)).collect();

    // SAFETY: `name_w`/`sddl_w` are NUL-terminated wide strings kept alive for the duration of
    // this block. `psd` is allocated by `ConvertStringSecurityDescriptorToSecurityDescriptorW` on
    // success and freed by the `LocalFree(psd)` below on every path -- including the error path,
    // since `result` (which may already carry the captured last-error) is computed BEFORE
    // `LocalFree` runs, so `LocalFree` can never clobber the error this function returns.
    unsafe {
        let mut psd: *mut core::ffi::c_void = std::ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl_w.as_ptr(),
            SDDL_REVISION_1,
            &mut psd,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(std::io::Error::last_os_error());
        }

        let sa = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: psd,
            bInheritHandle: 0,
        };

        let open_mode = PIPE_ACCESS_INBOUND
            | if first {
                FILE_FLAG_FIRST_PIPE_INSTANCE
            } else {
                0
            };
        let handle = CreateNamedPipeW(
            name_w.as_ptr(),
            open_mode,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            PIPE_UNLIMITED_INSTANCES,
            4096,
            4096,
            0,
            &sa,
        );

        let result = if handle == INVALID_HANDLE_VALUE {
            Err(std::io::Error::last_os_error())
        } else {
            use std::os::windows::io::{FromRawHandle, OwnedHandle, RawHandle};
            Ok(OwnedHandle::from_raw_handle(handle as RawHandle))
        };

        LocalFree(psd);
        result
    }
}

/// Acquires this process's Windows single-instance role. `CreateMutexW` on
/// `Local\gamelib-single-instance-<sid>` decides primary vs. secondary (Pitfall 1: check
/// `GetLastError()` IMMEDIATELY after a non-null return, never rely on the handle's nullness
/// alone -- `CreateMutexW` returns a valid handle to the EXISTING mutex even when
/// `ERROR_ALREADY_EXISTS` fires). Called with a NULL `lpMutexAttributes`, which Microsoft
/// documents as non-inheritable (Pitfall 2).
///
/// The mutex handle is DELIBERATELY never closed on the primary path: it is held for the
/// process's entire lifetime, and OS teardown at exit is what releases it (46-RESEARCH.md Q1).
/// There is no stale-holder branch, unlike the Unix guard's own connect-then-unlink dance --
/// Windows named-object lifetime is reference-counted and self-cleaning: the kernel destroys the
/// mutex when its last handle closes, including on a crash, so the next launch's `CreateMutexW`
/// simply succeeds cleanly with no cleanup code needed here.
///
/// T-46-03 accepted residual, Microsoft's own documented caveat: "a malicious user can create
/// this mutex before you do and prevent your application from starting." This is shared by every
/// named-mutex single-instance implementation (including `tauri-plugin-single-instance`'s own),
/// not something this design introduces -- a denial-of-service against availability, not a
/// confidentiality/integrity issue; fail-open does not help here, because the attacker IS holding
/// the mutex successfully, not causing an error. The pipe has a sibling residual in the same
/// class, after the accept loop gives up: see the 46-REVIEW WR-02 note inside
/// `run_windows_single_instance_accept_loop`.
///
/// 46-RESEARCH.md Q8's shared-with-Unix residual, recorded here rather than fixed: the mutex is
/// released (self-cleaning, near-instantaneous on process exit) before `shutdown_child()` finishes
/// reaping the sidecar, so a narrow window exists where a NEW launch could start spawning its own
/// sidecar while the PREVIOUS instance's sidecar is still tearing down -- already an accepted,
/// shared-with-Unix category of risk, out of this phase's scope to close.
#[cfg(windows)]
pub(crate) fn acquire_single_instance_windows(user_sid: &str, session_id: u32) -> WindowsSingleInstanceRole {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    let (Some(mutex_name), Some(pipe_name), Some(sddl)) = (
        windows_mutex_name(Some(user_sid)),
        windows_pipe_name(Some(user_sid), session_id),
        windows_pipe_sddl(Some(user_sid)),
    ) else {
        shell_eprintln!(
            "[shell] WARN: could not derive the Windows single-instance mutex/pipe name from the current SID -- continuing as primary without a listener (fail-open, T-34.5-G6-24)"
        );
        return WindowsSingleInstanceRole::PrimaryWithoutListener;
    };

    let mutex_name_w: Vec<u16> = mutex_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    // SAFETY: `mutex_name_w` is a NUL-terminated wide string built immediately above and kept
    // alive for the duration of this call. A NULL `lpMutexAttributes` is documented as safe and
    // yields a non-inheritable handle (Pitfall 2).
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_name_w.as_ptr()) };

    if handle.is_null() {
        shell_eprintln!(
            "[shell] WARN: CreateMutexW failed for the Windows single-instance mutex -- continuing as primary without a listener (fail-open, T-34.5-G6-24)"
        );
        return WindowsSingleInstanceRole::PrimaryWithoutListener;
    }

    // Pitfall 1: read GetLastError() immediately -- a non-null handle is returned even when
    // ERROR_ALREADY_EXISTS fires, so nullness alone cannot distinguish primary from secondary.
    let already_exists = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;

    if already_exists {
        // Deliberately does not close `handle`: this process exits shortly after (main()'s
        // Secondary arm), and OS teardown reclaims it -- mirrors the primary path's own "never
        // CloseHandle" discipline below.
        return WindowsSingleInstanceRole::Secondary {
            pipe_name,
            user_sid: user_sid.to_string(),
        };
    }

    // Primary: the mutex handle above is deliberately never closed (see doc comment).
    match create_single_instance_pipe_instance(&pipe_name, &sddl, true) {
        Ok(first_instance) => WindowsSingleInstanceRole::Primary(WindowsPrimaryPipe {
            first_instance,
            pipe_name,
            sddl,
        }),
        Err(e) => {
            shell_eprintln!(
                "[shell] WARN: single-instance pipe creation failed ({e}) -- continuing as primary without a listener (fail-open, T-34.5-G6-24)"
            );
            WindowsSingleInstanceRole::PrimaryWithoutListener
        }
    }
}

/// Secondary-side authenticated delivery over the Windows single-instance pipe (T-46-01/02,
/// REQ-46-03). Connects write-only with `SECURITY_ANONYMOUS` quality of service so the pipe
/// server can never impersonate this client (T-46-02), verifies the pipe's owner SID matches
/// this process's own BEFORE writing a single byte (T-46-01), and only then writes the payload.
/// Mirrors the Unix Secondary arm's own fail-open shape exactly (main()'s `#[cfg(unix)]` block,
/// 46-RESEARCH.md Q5's own quoted excerpt): a delivery failure is returned to the caller for a
/// WARN-level log only -- the caller always calls `std::process::exit(0)` regardless of this
/// function's result. A second sidecar over one set of store files and one download queue
/// (D-44-A's whole reason for existing) is a strictly worse outcome than an occasionally-lost
/// deep link.
///
/// No error string returned here ever carries `payload` or the URL (T-34.5-G6-25): only a fixed
/// English reason, or an OS error's own `Display` text (which reports what the OS says about the
/// open/write attempt itself, never what we tried to write).
///
/// Since plan 46-06 (T-46-16, closing `46-LIVE-GATE.md` Check 3's foreground-lock candidate),
/// this function also grants the verified server process foreground rights via
/// `AllowSetForegroundWindow`, AFTER the owner-SID check above passes and BEFORE the payload is
/// written. This secondary is the process the user just launched -- it may itself hold the
/// Windows foreground lock -- and it exits immediately after writing, so pre-authorizing the
/// verified primary here gives the primary's own raise (`SetForegroundWindow` inside
/// `force_window_active`) its best chance of succeeding without the Alt-key `SendInput` fallback.
#[cfg(windows)]
pub(crate) fn deliver_to_running_instance_windows(
    pipe_name: &str,
    user_sid: &str,
    payload: &str,
) -> Result<(), String> {
    use std::io::Write as _;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{LocalFree, ERROR_ACCESS_DENIED, GENERIC_WRITE, HANDLE};
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, GetSecurityInfo, SE_KERNEL_OBJECT,
    };
    use windows_sys::Win32::Security::OWNER_SECURITY_INFORMATION;
    use windows_sys::Win32::Storage::FileSystem::{
        READ_CONTROL, SECURITY_ANONYMOUS, SECURITY_SQOS_PRESENT,
    };
    use windows_sys::Win32::System::Pipes::GetNamedPipeServerProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow;

    // Reads the connected pipe's owner SID off `file`'s raw handle. Returns the raw WIN32_ERROR
    // status on failure (never `Ok` unless `status == 0`), so the caller can special-case
    // `ERROR_ACCESS_DENIED` for the READ_CONTROL re-open below (step 2's own instruction: "Do
    // not skip the check").
    //
    // SAFETY: `file`'s raw handle is valid for the duration of this closure's call. `psd` is
    // allocated by `GetSecurityInfo` on success and freed by `LocalFree(psd)` before returning.
    // `owner_str_ptr` (when set) is allocated by `ConvertSidToStringSidW` and freed immediately
    // after being copied into an owned `String`, so neither allocation outlives this call.
    let read_owner_sid = |file: &std::fs::File| -> Result<String, u32> {
        unsafe {
            let handle = file.as_raw_handle() as HANDLE;
            let mut owner: windows_sys::Win32::Security::PSID = std::ptr::null_mut();
            let mut psd: *mut core::ffi::c_void = std::ptr::null_mut();
            let status = GetSecurityInfo(
                handle,
                SE_KERNEL_OBJECT,
                OWNER_SECURITY_INFORMATION,
                &mut owner,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut psd,
            );
            if status != 0 {
                return Err(status);
            }
            let mut owner_str_ptr: windows_sys::core::PWSTR = std::ptr::null_mut();
            let converted = ConvertSidToStringSidW(owner, &mut owner_str_ptr) != 0;
            let result = if converted {
                let len = (0..).take_while(|&i| *owner_str_ptr.add(i) != 0).count();
                let slice = std::slice::from_raw_parts(owner_str_ptr, len);
                Ok(String::from_utf16_lossy(slice))
            } else {
                // Conversion failure, not itself a WIN32_ERROR -- treated as non-retryable below.
                Err(0)
            };
            if !owner_str_ptr.is_null() {
                LocalFree(owner_str_ptr as *mut core::ffi::c_void);
            }
            LocalFree(psd);
            result
        }
    };

    // Step 1: bounded-retry connect, write-only, anonymous SQOS (T-46-02).
    let mut file: Option<std::fs::File> = None;
    for _ in 0..10 {
        match std::fs::OpenOptions::new()
            .write(true)
            .security_qos_flags(SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS)
            .open(pipe_name)
        {
            Ok(f) => {
                file = Some(f);
                break;
            }
            Err(e) => {
                if windows_pipe_connect_should_retry(e.raw_os_error()) {
                    thread::sleep(Duration::from_millis(100));
                    continue;
                }
                return Err(format!("connect failed: {e}"));
            }
        }
    }
    let Some(mut file) = file else {
        return Err("running instance's pipe did not become available".to_string());
    };

    // Step 2: verify the server owns the pipe (T-46-01) BEFORE writing a single byte.
    let owner_sid = match read_owner_sid(&file) {
        Ok(sid) => sid,
        Err(status) if status == ERROR_ACCESS_DENIED => {
            // A write-only open's GENERIC_WRITE access mask alone does not include
            // READ_CONTROL, even though the pipe's DACL would grant it via GA to the same-SID
            // owner -- re-open with READ_CONTROL so the OWNER_SECURITY_INFORMATION query is
            // permitted, and retry the check exactly once more.
            drop(file);
            file = match std::fs::OpenOptions::new()
                .access_mode(GENERIC_WRITE | READ_CONTROL)
                .security_qos_flags(SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS)
                .open(pipe_name)
            {
                Ok(f) => f,
                Err(e) => return Err(format!("connect failed: {e}")),
            };
            match read_owner_sid(&file) {
                Ok(sid) => sid,
                Err(_) => {
                    return Err(
                        "running-instance pipe is not owned by the current user; refusing to deliver"
                            .to_string(),
                    );
                }
            }
        }
        Err(_) => {
            return Err(
                "running-instance pipe is not owned by the current user; refusing to deliver"
                    .to_string(),
            );
        }
    };

    if !windows_pipe_owner_matches(&owner_sid, user_sid) {
        return Err(
            "running-instance pipe is not owned by the current user; refusing to deliver"
                .to_string(),
        );
    }

    // Grant the verified server process the right to take the foreground (T-46-16, defence in
    // depth for the Windows foreground lock). Issued only AFTER the owner-SID check above
    // passes, and only BEFORE the payload is written, so the grant only ever reaches a process
    // this same user already owns. A failed grant is a WARN, never fatal -- the running
    // instance's window may simply flash in the taskbar instead of coming to the front, and
    // delivery must proceed regardless.
    //
    // SAFETY: `file`'s raw handle is valid for the duration of this call. `server_pid` is only
    // read after `GetNamedPipeServerProcessId` reports success.
    let mut server_pid: u32 = 0;
    let got_pid = unsafe {
        GetNamedPipeServerProcessId(file.as_raw_handle() as HANDLE, &mut server_pid) != 0
    };
    if !got_pid {
        shell_eprintln!(
            "[shell] WARN: could not grant foreground rights to the running instance (GetNamedPipeServerProcessId failed: {}) -- its window may flash in the taskbar instead of coming to the front",
            std::io::Error::last_os_error()
        );
    } else if unsafe { AllowSetForegroundWindow(server_pid) } != 0 {
        // Pass the verified server PID only -- never the wildcard: least privilege, so only the
        // verified same-user owner may take the foreground.
        shell_eprintln!(
            "[shell] granted foreground rights to the running instance (pid={server_pid})"
        );
    } else {
        shell_eprintln!(
            "[shell] WARN: could not grant foreground rights to the running instance (AllowSetForegroundWindow failed: {}) -- its window may flash in the taskbar instead of coming to the front",
            std::io::Error::last_os_error()
        );
    }

    // Step 3: only now write the payload.
    writeln!(file, "{payload}").map_err(|e| format!("write failed: {e}"))?;
    file.flush().map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}

/// The primary's warm-delivery accept loop for the Windows named pipe (REQ-46-04). Mirrors the
/// `#[cfg(unix)] if let Some(listener) = primary_listener { ... listener.incoming() ... }` loop
/// above byte-for-byte in intent: a bounded (4096-byte) single-line read, the
/// `__GAMELIB_FOCUS__` sentinel's show+focus dance, and re-validation of every non-sentinel
/// payload through `protocol_url_arg` before it ever reaches the sidecar -- this pipe is the
/// THIRD `gamelib://` source into this process (after argv and the Unix single-instance socket
/// accept loop above; see the OS deep-link section below for the fourth). It is a trust boundary
/// even with the per-user owner-only DACL `windows_pipe_sddl` builds (T-34.5-G6-20, defence in
/// depth): a per-user DACL narrows WHO can write, it does not certify WHAT they wrote.
///
/// `ConnectNamedPipe` returning zero with `GetLastError() == ERROR_PIPE_CONNECTED` means a
/// client connected in the window between `CreateNamedPipeW` and this call -- documented Win32
/// behaviour (Microsoft Learn, `ConnectNamedPipe` function reference; matches
/// 46-RESEARCH.md Q4/A1), treated identically to a nonzero (successful) return, never as an
/// error.
///
/// The NEXT pipe instance is always created before the current connection is read
/// (T-34.5-G6-24): a listening instance exists continuously, so a fast second launch is never
/// refused. Each accepted connection is then read on its own short-lived worker thread, never
/// on this loop's thread (46-REVIEW WR-01), so one client that connects and never writes cannot
/// stop the loop from accepting everyone after it. If a later instance cannot be created, the
/// already-accepted connection is still
/// serviced once, and this function then returns -- the WARN below, not a panic or an abort --
/// ending only THIS thread; the app and its main window keep running (fail-open).
#[cfg(windows)]
pub(crate) fn run_windows_single_instance_accept_loop(
    primary: WindowsPrimaryPipe,
    accept_state: Arc<SidecarState>,
    accept_app_handle: AppHandle,
) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{GetLastError, HANDLE};
    use windows_sys::Win32::System::Pipes::ConnectNamedPipe;

    let WindowsPrimaryPipe {
        first_instance,
        pipe_name,
        sddl,
    } = primary;
    let mut current = first_instance;

    loop {
        // SAFETY: `current` is a valid, open pipe-instance handle for the duration of this
        // call. `lpOverlapped` is NULL: the pipe was created without `FILE_FLAG_OVERLAPPED`
        // (`PIPE_WAIT`, synchronous), so a blocking `ConnectNamedPipe` call is correct here.
        let connected =
            unsafe { ConnectNamedPipe(current.as_raw_handle() as HANDLE, std::ptr::null_mut()) };
        if connected == 0 {
            // SAFETY: called immediately after the failing `ConnectNamedPipe` return, per its
            // documented contract.
            let last_error = unsafe { GetLastError() };
            if last_error != windows_sys::Win32::Foundation::ERROR_PIPE_CONNECTED {
                shell_eprintln!(
                    "[shell] WARN: single-instance ConnectNamedPipe failed: {}",
                    std::io::Error::from_raw_os_error(last_error as i32)
                );
                // 46-REVIEW WR-02: the replacement is created BEFORE the failed instance is
                // released, never after. Dropping first could leave the pipe name with no
                // instance at all for a moment, and a same-user process that created an
                // instance in that gap would be JOINED, not detected -- replacements are created
                // with `first=false`, so `FILE_FLAG_FIRST_PIPE_INSTANCE` cannot catch it here.
                // Holding the failed handle until the replacement exists keeps the name
                // continuously claimed by this process. `current = replacement` drops the old
                // handle only after the new one is live.
                //
                // Residual, accepted in the same class as T-46-03 (see
                // `acquire_single_instance_windows`): when a replacement CANNOT be created, the
                // failed instance is released as this function returns, and once no other
                // instance of it remains open the pipe name is unclaimed for the rest of the
                // session (the same holds for the terminal branch below). A later same-user instance of that
                // name is not rejected by the secondary's owner-SID check (T-46-01) -- it has
                // the same owner SID -- so it would receive the secondary's payload. That is
                // availability only, inside the per-user trust boundary: a same-user process can
                // already act as the user directly, and a different-user squatter is still
                // rejected by T-46-01 before any byte is written.
                match create_single_instance_pipe_instance(&pipe_name, &sddl, false) {
                    Ok(replacement) => {
                        current = replacement;
                        continue;
                    }
                    Err(e) => {
                        shell_eprintln!(
                            "[shell] WARN: could not create the next single-instance pipe instance ({e}) -- warm deep-link delivery disabled for this session (fail-open, T-34.5-G6-24)"
                        );
                        return;
                    }
                }
            }
            // else: ERROR_PIPE_CONNECTED -- a client connected between create and connect.
            // Not an error; fall through and treat this exactly like a successful connect.
        }

        // Create the NEXT instance BEFORE reading the current connection, so a listening
        // instance always exists and a near-simultaneous secondary is not refused
        // (T-34.5-G6-24).
        match create_single_instance_pipe_instance(&pipe_name, &sddl, false) {
            Ok(next) => {
                // 46-REVIEW WR-01: the connection is serviced on its OWN short-lived worker
                // thread, never inline. The read below is a blocking `PIPE_WAIT` read with no
                // deadline, so servicing it inline let one same-user client that connects and
                // never writes or closes park THIS thread forever -- `ConnectNamedPipe` was
                // never reached again, and every later secondary's write was absorbed by the
                // pipe buffer and silently never read, for the rest of the session. Handing
                // the connection off means a stalled client can only ever park its own worker,
                // which ends by itself the moment that client writes or closes its handle.
                spawn_windows_single_instance_connection_worker(
                    current,
                    &accept_state,
                    &accept_app_handle,
                );
                current = next;
            }
            Err(e) => {
                shell_eprintln!(
                    "[shell] WARN: could not create the next single-instance pipe instance ({e}) -- warm deep-link delivery disabled for this session (fail-open, T-34.5-G6-24)"
                );
                // Inline is deliberate here: the loop is ending, so parking this now-terminal
                // thread on a stalled client costs no future delivery.
                handle_windows_single_instance_connection(
                    current,
                    &accept_state,
                    &accept_app_handle,
                );
                return;
            }
        }
    }

    // 46-REVIEW WR-01: services one connected pipe instance on a detached, short-lived worker
    // thread so the accept loop above is never blocked by a non-cooperative client. The worker
    // is detached like the accept thread itself (never joined), so it cannot hold the process
    // alive past shutdown: process exit tears it down, and the OS closes the pipe handle it
    // owns. If the spawn itself fails (resource exhaustion), only this one connection is
    // dropped -- the handle closes with the un-run closure -- and the loop keeps listening
    // (fail-open, T-34.5-G6-24); the WARN makes that loss observable rather than silent.
    fn spawn_windows_single_instance_connection_worker(
        handle: std::os::windows::io::OwnedHandle,
        accept_state: &Arc<SidecarState>,
        accept_app_handle: &AppHandle,
    ) {
        let worker_state = Arc::clone(accept_state);
        let worker_app_handle = accept_app_handle.clone();
        let spawned = thread::Builder::new()
            .name("gamelib-single-instance-conn".to_string())
            .spawn(move || {
                handle_windows_single_instance_connection(handle, &worker_state, &worker_app_handle)
            });
        if let Err(e) = spawned {
            shell_eprintln!(
                "[shell] WARN: could not spawn a single-instance connection worker ({e}) -- dropping this one connection; the accept loop keeps listening (fail-open, T-34.5-G6-24)"
            );
        }
    }

    // Handles one already-connected pipe instance: bounded read (T-34.5-G6-23), the
    // `__GAMELIB_FOCUS__` sentinel's show+focus dance, or `protocol_url_arg` re-validation and
    // dispatch (T-34.5-G6-20/25) -- the same steps the Unix loop's own per-connection body runs.
    // A nested `fn`, not a closure: Rust hoists nested `fn` items to the top of their enclosing
    // block, so the loop above can call it even though it is written after the loop -- every
    // branch that skips ahead (an empty/errored read, or the focus sentinel) returns from here
    // without touching `current`, so the loop above always reaches its own `current = next`
    // reassignment and a listening instance is never left absent.
    fn handle_windows_single_instance_connection(
        handle: std::os::windows::io::OwnedHandle,
        accept_state: &Arc<SidecarState>,
        accept_app_handle: &AppHandle,
    ) {
        let file = std::fs::File::from(handle);
        let mut reader = BufReader::new(file.take(4096));
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => return,
            Ok(_) => {}
        }
        let trimmed = line.trim();

        // On Windows, `unminimize()` is the load-bearing call here, not `show()` + `set_focus()`
        // alone -- measured wrong at `46-LIVE-GATE.md` Check 3 (2026-09-24); see the corrected
        // `open_about_window_from_tray` comment above for the full correction. Per tao-0.35.3
        // (`platform_impl/windows/window.rs:164-172`), `set_visible(true)` only diffs the
        // VISIBLE flag -- on a window that is already visible-but-minimized that diff is empty,
        // so no `ShowWindow` call is issued and the window stays minimized. `set_focus()`
        // (`window.rs:175-186`) is gated on `!is_minimized && is_visible`, so it is a no-op while
        // minimized. Only `set_minimized(false)` (`unminimize()`, `window.rs:584-597`) issues
        // `ShowWindow(hwnd, SW_RESTORE)` (`window_state.rs:390-402`), and it runs synchronously
        // because `execute_in_thread` executes inline when already on the event-loop thread --
        // which `run_on_main_thread` guarantees -- so by the time `set_focus()` runs next, the
        // MINIMIZED flag is already cleared.
        if trimmed == SINGLE_INSTANCE_FOCUS_SENTINEL {
            shell_eprintln!(
                "[shell] received single-instance focus sentinel -- raising the main window"
            );
            let focus_handle = accept_app_handle.clone();
            let scheduled =
                accept_app_handle.run_on_main_thread(move || {
                    let render = |r: tauri::Result<()>| match r {
                        Ok(()) => "ok".to_string(),
                        Err(e) => format!("err={e}"),
                    };
                    match focus_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                        Some(window) => {
                            let unminimize_result = render(window.unminimize());
                            let show_result = render(window.show());
                            let set_focus_result = render(window.set_focus());
                            shell_eprintln!(
                            "[shell] focus sentinel raise: unminimize={}, show={}, set_focus={}",
                            unminimize_result, show_result, set_focus_result
                        );
                        }
                        None => {
                            shell_eprintln!(
                            "[shell] WARN: focus sentinel: no '{MAIN_WINDOW_LABEL}' window to raise"
                        );
                        }
                    }
                });
            if let Err(e) = scheduled {
                shell_eprintln!(
                    "[shell] WARN: focus sentinel: could not schedule the raise on the main thread: {e}"
                );
            }
            return;
        }

        // Defence in depth (T-34.5-G6-20): re-validate through the SAME allow-list used for
        // argv and the Unix socket, never trusting the pipe because it is "internal" -- the
        // pipe is a trust boundary even inside an owner-only DACL.
        match protocol_url_arg(&[trimmed.to_string()]) {
            Some(url) => {
                match accept_state.invoke("handleProtocolUrl".to_string(), vec![Value::String(url)])
                {
                    Ok(_) => {
                        shell_eprintln!(
                            "[shell] delivered single-instance deep link to sidecar: ok"
                        )
                    }
                    Err(e) => {
                        shell_eprintln!(
                            "[shell] delivered single-instance deep link to sidecar: err={e}"
                        )
                    }
                }
            }
            None => {
                // T-34.5-G6-25: the REASON and byte count only, never the payload.
                shell_eprintln!(
                    "[shell] rejected single-instance payload (failed protocol_url_arg validation), bytes={}",
                    trimmed.len()
                );
            }
        }
    }
}

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
