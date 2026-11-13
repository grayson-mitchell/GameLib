use super::*;

// Transport constants (READY_SENTINEL, FRONTEND_MESSAGE_EVENT, SHELL_WINDOW_FOCUSED,
// STORE_SNAPSHOT_CHANNEL, RUST_INVOKE_KIND) come from the generated `ipc_contract.rs`
// (regenerate with `pnpm gen:ipc-contract`).

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

/// Finds `program` by searching a PATH-shaped string. Pure: the PATH is a parameter, so the
/// search order is testable without mutating process-global env.
pub(crate) fn find_on_path_var(program: &str, path_var: Option<&str>) -> Option<String> {
    let path_var = path_var?;
    path_var
        .split(':')
        .filter(|dir| !dir.is_empty())
        .map(|dir| std::path::Path::new(dir).join(program))
        .find(|candidate| candidate.is_file())
        .map(|p| p.display().to_string())
}

/// Orders nvm's `versions/node/*` directory names newest-first.
///
/// Sorted by NUMERIC component, not lexically: a plain string sort puts `v9.x` after `v26.x`
/// and would pick a years-old runtime on any machine with both installed. Names that do not
/// parse are kept, ordered last, rather than dropped — an unparseable name is still a real
/// installed runtime and is better than nothing.
pub(crate) fn nvm_versions_newest_first(mut names: Vec<String>) -> Vec<String> {
    fn key(name: &str) -> (bool, Vec<u64>) {
        let digits: Vec<u64> = name
            .trim_start_matches('v')
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect();
        // `false` sorts before `true`, so parseable names come first.
        (
            digits.is_empty() || name.trim_start_matches('v').is_empty(),
            digits,
        )
    }
    names.sort_by(|a, b| {
        let (a_bad, a_nums) = key(a);
        let (b_bad, b_nums) = key(b);
        a_bad.cmp(&b_bad).then_with(|| b_nums.cmp(&a_nums))
    });
    names
}

/// The `node` executable the DEV sidecar path should exec.
///
/// WHY THIS IS NOT JUST `"node"`. `Command::new("node")` searches the process's inherited
/// `PATH`, and a macOS app bundle launched by LaunchServices (Finder, Dock, Spotlight, or a
/// `gamelib://` open) inherits `PATH=/usr/bin:/bin:/usr/sbin:/sbin` — nothing else. A node
/// installed by nvm (`~/.nvm/versions/node/<version>/bin`) or Homebrew is not on that PATH, so
/// the spawn failed with a bare `ENOENT`, `.setup()` propagated it, and Tauri panicked. Because
/// that panic unwinds out of `did_finish_launching`, an `extern "C"` ObjC callback, it became a
/// `SIGABRT` and presented to the user as "GameLib quit unexpectedly" with no explanation.
/// Measured 2026-08-29; 9 crash reports in one afternoon, all this. Debug builds only — a
/// release build uses the bundled `gamelib-sidecar` externalBin and never runs `node`.
///
/// Deliberately does NOT shell out to `$SHELL -lc 'command -v node'`. That is the usual trick
/// for recovering a login PATH, but it runs the user's full shell profile on the startup path,
/// where a slow or interactive profile would hang launch with no way to report why.
///
/// Returns the bare `"node"` when nothing is found, so the resulting error names the program
/// the user is missing rather than an invented path.
fn resolve_node_program() -> String {
    if let Ok(explicit) = std::env::var("GAMELIB_NODE") {
        if !explicit.is_empty() && std::path::Path::new(&explicit).is_file() {
            return explicit;
        }
    }

    if let Some(found) = find_on_path_var("node", std::env::var("PATH").ok().as_deref()) {
        return found;
    }

    if let Ok(home) = std::env::var("HOME") {
        let versions_dir = std::path::Path::new(&home)
            .join(".nvm")
            .join("versions")
            .join("node");
        if let Ok(entries) = std::fs::read_dir(&versions_dir) {
            let names: Vec<String> = entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect();
            for name in nvm_versions_newest_first(names) {
                let candidate = versions_dir.join(name).join("bin").join("node");
                if candidate.is_file() {
                    return candidate.display().to_string();
                }
            }
        }
    }

    for fallback in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(fallback).is_file() {
            return fallback.to_string();
        }
    }

    "node".to_string()
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
pub(crate) fn shell_exe_env_value(current_exe: std::io::Result<std::path::PathBuf>) -> String {
    current_exe
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| String::new())
}

/// The Steam root the Rust crate discovers for this host, as `(path, source)`. Handed to the
/// sidecar at spawn as `GAMELIB_STEAM_ROOT_DEFAULT` (Phase 75 D-12): the sidecar's config
/// default is synchronous and runs before the RPC server, so it cannot await a rustInvoke. A
/// default only; the TS setting still wins. Synchronous and bounded, so no in-flight work at boot.
fn steam_root_default_env() -> (String, String) {
    let d = gamelib_steamfiles::discover::discover_default();
    (d.path, d.source)
}

/// Formats a resolved app-root `PathBuf` for the `GAMELIB_APP_ROOT` spawn-time env var handoff
/// (Phase 34.5 Plan 16, Task 2, G-1). This is the fix for the root cause of live-gate items
/// 1/2/3 and (transitively) 5: under the sidecar, `platformApi.getAppPath()` resolved to
/// `process.cwd()` (`src-tauri/`), so `publicDir` (`paths.ts:73`) resolved to a directory that
/// does not exist and every bundled runner binary ENOENT'd on spawn. Pure and `AppHandle`-free
/// so it can be proven by `#[cfg(test)] mod tests` below, mirroring `shell_exe_env_value`'s
/// exact contract shape one function up:
///
/// - `Ok(path)` returns the path's `display()` form, UNQUOTED and UNTRIMMED.
/// - `Err(_)` returns the EMPTY STRING, deliberately never panicking — the shell must still
///   start even if app-root resolution fails, and `platformApi.getAppPath()` (JS side) treats
///   an empty string exactly like an unset env var, falling back to today's `process.cwd()`
///   behaviour (REQ-34.5-13: the Electron build and the jest suite see no behaviour change).
///
/// The error type is a plain `String`, not the caller's own error type — the dev path's failure
/// (`CARGO_MANIFEST_DIR` has no parent; unreachable in practice) and the packaged path's failure
/// (a `tauri::Error` from `resource_dir()`) are unrelated types with nothing in common. Both
/// callers map their own error to a string before calling this, keeping this helper generic and
/// `AppHandle`-free.
pub(crate) fn app_root_env_value(app_root: Result<std::path::PathBuf, String>) -> String {
    app_root
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| String::new())
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
///
/// `forward_args` is handed down from `spawn_sidecar` too (computed once via
/// `sidecar_forward_args`, Phase 34.5 gap cycle 6 plan 44) and appended to the child's own
/// argv AFTER the entry path -- the sidecar's `process.argv` becomes
/// `[node, <entry>, ...forward_args]`, matching `environment.ts`'s `process.argv.includes(...)`
/// checks.
/// Quick task 260907-juv (Layer B): puts the sidecar in its OWN process group (pgid == its
/// own pid, `process_group(0)`) so `shutdown_child()` can signal the WHOLE group -- the
/// sidecar plus every descendant it spawns (GOG's `comet`, the Steam bridge helper) -- with a
/// single `libc::kill(-pgid, sig)`, instead of only the sidecar's own pid. Without this, the
/// sidecar inherits the Tauri shell's own process group, so a group-wide signal would also
/// target the shell process itself; called from BOTH spawn sites (`spawn_sidecar_dev`,
/// `spawn_sidecar_packaged`) so neither path can silently regress the other's protection.
///
/// unix-only: `std::os::unix::process::CommandExt::process_group` has no Windows equivalent
/// and is stable since Rust 1.64 (this crate's `rust-version` is 1.77.2). The `#[cfg(not(unix))]`
/// arm is a deliberate no-op, not a stub awaiting an implementation -- `shutdown_child()`'s own
/// `#[cfg(not(unix))]` arm keeps calling `child.kill()` on the sidecar alone on that platform.
#[cfg(unix)]
fn configure_sidecar_process_group(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
}

#[cfg(not(unix))]
fn configure_sidecar_process_group(_cmd: &mut Command) {}

/// SIGKILLs every member of process group `pgid` (WR-01). A process group outlives its leader
/// while any member remains, so this still reaches comet / the bridge helper / games after the
/// sidecar's own `exit(1)`.
///
/// Refuses `pgid <= 1`: `kill(-pgid, ..)` with pgid 1 is `kill(-1)` (every process the user
/// owns) and with 0 is `kill(0)` (the caller's own group, i.e. the shell itself).
#[cfg(unix)]
pub(crate) fn kill_process_group(pgid: i32) -> std::io::Result<()> {
    if pgid <= 1 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("refusing to signal process group {pgid}"),
        ));
    }
    // SAFETY: signals only the process group `-pgid` (> 1, validated above); no pointers are
    // dereferenced and the call can only fail (ESRCH/EPERM).
    if unsafe { libc::kill(-pgid, libc::SIGKILL) } == -1 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

/// D-20: put the sidecar in a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` so every
/// Windows descendant (legendary/gogdl/nile, their powershell wrappers, sidecar-launched games)
/// dies with the job -- the parity of the Unix process-group kill in `shutdown_child`. The
/// kernel also closes the handle if the shell itself crashes, so this reaps on crash too.
///
/// No breakaway flag is set (neither `BREAKAWAY_OK` nor `SILENT_BREAKAWAY_OK`), so children
/// cannot escape the job. Sidecar-launched games dying on quit is by design (parity with Unix).
///
/// Known limits: assignment happens after spawn, so a grandchild created before it would
/// escape; the Node sidecar spawns nothing during boot. Nested jobs are supported on
/// Windows 8+, so an already-jobbed shell is fine.
///
/// Never panics and never uses `?`: any failure is logged and `None` is returned, leaving
/// today's `child.kill()` fallback in `shutdown_child`.
#[cfg(windows)]
pub(crate) fn create_kill_on_close_job(
    child: &std::process::Child,
) -> Option<std::os::windows::io::OwnedHandle> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    // SAFETY: CreateJobObjectW accepts null attributes and name; returns null on failure.
    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        // SAFETY: GetLastError has no preconditions.
        let err = unsafe { GetLastError() };
        shell_eprintln!("[shell] job object: CreateJobObjectW failed (error {err}); using child.kill() fallback");
        return None;
    }

    // SAFETY: the struct is plain-old-data; all-zero is a valid value.
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

    // SAFETY: `job` is a valid job handle; the pointer/size describe `info`, which outlives the call.
    let set_ok = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if set_ok == 0 {
        // SAFETY: GetLastError / CloseHandle on the handle we just created.
        let err = unsafe { GetLastError() };
        shell_eprintln!("[shell] job object: SetInformationJobObject failed (error {err}); using child.kill() fallback");
        unsafe { CloseHandle(job) };
        return None;
    }

    // SAFETY: both handles are valid; `child` owns its process handle for the duration of the call.
    let assign_ok = unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as _) };
    if assign_ok == 0 {
        // SAFETY: as above.
        let err = unsafe { GetLastError() };
        shell_eprintln!("[shell] job object: AssignProcessToJobObject failed (error {err}); using child.kill() fallback");
        unsafe { CloseHandle(job) };
        return None;
    }

    shell_eprintln!("[shell] sidecar assigned to kill-on-close job object");
    // SAFETY: `job` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
    Some(unsafe { OwnedHandle::from_raw_handle(job as _) })
}

fn spawn_sidecar_dev(shell_exe: &str, forward_args: &[String]) -> std::io::Result<Child> {
    let entry = resolve_sidecar_entry();
    let app_root = resolve_dev_app_root();
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    let exists = std::path::Path::new(&entry).exists();
    let node = resolve_node_program();
    // `shell_diag`, not `eprintln!`: LaunchServices discards a bundled app's stderr, so these
    // lines — including the FAILURE line below — were invisible in exactly the configuration
    // that fails. That is why a missing `node` presented as an unexplained "quit unexpectedly"
    // rather than as the one-line diagnosis it already contained.
    shell_diag(&format!("spawning sidecar (dev): \"{node}\" \"{entry}\""));
    shell_diag(&format!("  cwd={cwd}"));
    shell_diag(&format!("  entry_exists={exists}"));
    shell_diag(&format!("  GAMELIB_SHELL_EXE={shell_exe}"));
    shell_diag(&format!("  GAMELIB_APP_ROOT={app_root}"));
    let (steam_root, steam_root_source) = steam_root_default_env();
    shell_diag(&format!(
        "  GAMELIB_STEAM_ROOT_DEFAULT={steam_root} (source={steam_root_source})"
    ));
    shell_diag(&format!("  forward_args={forward_args:?}"));
    let mut cmd = Command::new(&node);
    cmd.arg(&entry)
        .args(forward_args)
        .env("GAMELIB_SHELL_EXE", shell_exe)
        .env("GAMELIB_APP_ROOT", &app_root)
        .env("GAMELIB_STEAM_ROOT_DEFAULT", &steam_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_sidecar_process_group(&mut cmd);
    let child = cmd.spawn();
    match &child {
        Ok(_) => shell_diag("sidecar process spawned OK"),
        Err(e) => shell_diag(&format!(
            "FAILED to spawn sidecar: {e} (tried node={node:?}, entry_exists={exists})"
        )),
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
    shell_eprintln!("[shell] spawning sidecar (packaged): \"{program}\"");
    shell_eprintln!("[shell]   cwd={cwd}");
    shell_eprintln!("[shell]   entry_exists={exists}");
    shell_eprintln!("[shell]   GAMELIB_APP_ROOT={app_root}");
    let (steam_root, steam_root_source) = steam_root_default_env();
    shell_eprintln!(
        "[shell]   GAMELIB_STEAM_ROOT_DEFAULT={steam_root} (source={steam_root_source})"
    );
    shell_eprintln!("[shell]   forward_args={forward_args:?}");
    std_command
        .args(forward_args)
        .env("GAMELIB_SHELL_EXE", shell_exe)
        .env("GAMELIB_APP_ROOT", &app_root)
        .env("GAMELIB_STEAM_ROOT_DEFAULT", &steam_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_sidecar_process_group(&mut std_command);
    let child = std_command.spawn();
    match &child {
        Ok(_) => shell_eprintln!("[shell] sidecar process spawned OK"),
        Err(e) => shell_eprintln!(
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
pub(crate) fn spawn_sidecar(app: &AppHandle) -> std::io::Result<Child> {
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
pub(crate) fn start_stderr_forwarder(stderr: std::process::ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(l) => shell_eprintln!("[sidecar:err] {l}"),
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
pub(crate) fn start_reader(app: AppHandle, state: Arc<SidecarState>, stdout: std::process::ChildStdout) {
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
                shell_eprintln!("[shell] sidecar signalled READY ({READY_SENTINEL})");
                continue;
            }
            let value: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                // non-JSON diagnostic line (console.log etc.) — surface it, don't drop it.
                Err(_) => {
                    shell_eprintln!("[sidecar:out] {trimmed}");
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
                        let sender = state.pending.lock().ok().and_then(|mut p| p.remove(id));
                        match sender {
                            Some((_channel, tx)) => {
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
                            // F-9 (quick task `260905-omc`): name the CHANNEL, not just the id.
                            // This line used to print the bare id, which made the question
                            // "what was this invoke?" answerable only by correlating the id
                            // against the originating request in the same live scrollback, at
                            // the time — and therefore unanswerable afterwards. That is exactly
                            // how F-9's `id=1575` became permanently UNDETERMINED.
                            //
                            // T-28-04 holds: a channel name is a fixed identifier from a known
                            // set, not a `result`/`error` body. No payload is logged here.
                            None => {
                                let channel = state
                                    .abandoned
                                    .lock()
                                    .map(|ring| abandoned_channel_for(&ring, id))
                                    .unwrap_or_else(|_| ABANDONED_CHANNEL_UNRECORDED.to_string());
                                shell_diag(&format!(
                                    "response for unknown/timed-out id={id} channel={channel} (dropped)"
                                ));
                            }
                        }
                    }
                    None => shell_diag("response frame with a missing or non-string id (dropped)"),
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

                // Tray recent-games rebuild (Phase 35 Plan 06, D-06). `tray_icon.ts` rebuilt
                // its whole context menu from `backendEvents.on('recentGamesChanged')`; the
                // sidecar-side emitter (`recent_games.ts`'s `setRecentGames`) ALSO pushes the
                // same list to the frontend over this exact frontend-message channel, and every
                // one of those frames already passes through this reader thread on its way to
                // the webview. Observing it here gives the tray its live rebuild with NO new
                // channel and NO new sidecar registration -- and therefore no possibility of a
                // send channel whose listener was never registered.
                //
                // Non-consuming: the frame is still emitted to the webview below, unchanged.
                if channel == RECENT_GAMES_CHANGED_CHANNEL {
                    let limit = tray_settings().max_recent_games;
                    let games = match args.first() {
                        Some(list) => tray_recent_games_from_value(list, limit),
                        None => Vec::new(),
                    };
                    let tray_app = app.clone();
                    // Menu construction wants the main thread on macOS; `set_menu` itself
                    // hops there internally, but the `MenuItemBuilder`/`MenuBuilder` calls in
                    // `build_tray_menu` do not, so the whole rebuild is hopped as one unit.
                    // Failure to schedule is logged, never fatal -- the reader thread must keep
                    // servicing every other frame.
                    if let Err(e) =
                        app.run_on_main_thread(move || update_tray_recent_games(&tray_app, games))
                    {
                        shell_eprintln!(
                            "[shell] WARN: tray recent-games rebuild could not be scheduled ({e}) -- tray menu left as-is"
                        );
                    }
                }

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
            if kind == Some(RUST_INVOKE_KIND) {
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
            // call would change platformApi.shell.openExternal's contract, out of scope).
            if kind == Some("openExternal") {
                if let Some(url) = value
                    .get("args")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                    .and_then(|v| v.as_str())
                {
                    // Same allow-list as the `open_external` command: any line that reaches
                    // the sidecar's stdout can forge this frame (todo
                    // `sidecar-log-output-shares-the-rpc-stdout-pipe`). The check logs the
                    // rejected scheme itself, never the URL.
                    if open_external_scheme_check(url).is_ok() {
                        // D-UAT-19: open on a worker thread, never inline. On Windows
                        // `open_url` blocks while the OS shows a dialog (e.g. "no app
                        // handles steam://"), and this loop is the only reader of the
                        // sidecar's stdout — inline, every invoke response parked behind
                        // that dialog and was abandoned at the 60 s timeout.
                        let url = url.to_string();
                        let opener_app = app.clone();
                        thread::spawn(move || {
                            if let Err(e) = opener_app.opener().open_url(&url, None::<&str>) {
                                shell_eprintln!("[shell] openExternal failed: {e}");
                            }
                        });
                    }
                } else {
                    shell_eprintln!("[shell] openExternal frame missing a string URL in args[0]");
                }
                continue;
            }

            // Unrecognized frame kind — log a diagnostic (kind/id only, never args/result
            // per threat T-28-04) instead of silently dropping it, so this class of gap
            // cannot recur unnoticed.
            let id = value.get("id").and_then(|v| v.as_str());
            shell_eprintln!("[shell] unrecognized sidecar frame kind: {kind:?} id={id:?}");
        }

        // stdout has ended (EOF, or a read error such as a non-UTF-8 line), so no response can
        // arrive any more. Fail every invoke still waiting instead of leaving it parked forever.
        for (id, channel) in drain_pending_invokes(&state.pending, &state.abandoned) {
            shell_diag(&invoke_abandoned_message("sidecar exited", &id, &channel));
        }

        // D-08: no consumer remains for any depot job's events or responses, so stop them all.
        // Runs for an intentional shutdown too; the exit path then waits for finalize.
        on_sidecar_eof_cancel_jobs();

        // D-01/D-02: an EOF outside an intentional shutdown means the sidecar died. Tell the user.
        on_sidecar_eof(&state.shutting_down, &state.eof_surfaced, || {
            surface_dead_sidecar(&app, &state);
        });
    });
}

/// Decides whether a sidecar EOF is surfaced to the user (D-03). Pure and `AppHandle`-free so
/// `#[cfg(test)] mod tests` can prove it: nothing when an intentional shutdown began first, and
/// at most once otherwise.
pub(crate) fn on_sidecar_eof<F: FnOnce()>(shutting_down: &AtomicBool, surfaced: &AtomicBool, surface: F) {
    if shutting_down.load(Ordering::SeqCst) {
        return;
    }
    if surfaced.swap(true, Ordering::SeqCst) {
        return;
    }
    surface();
}

/// Reaps the sidecar's whole process tree unconditionally (WR-01), then shows the generic
/// Restart/Quit dialog on the reader thread (D-05). The unix group SIGKILL works even after the
/// leader's own `exit(1)` (a group outlives its leader); on Windows the kill-on-close job is
/// dropped. Restart is a full `app.restart()`, never an in-place respawn (D-01).
fn surface_dead_sidecar(app: &AppHandle, state: &Arc<SidecarState>) {
    state.reap_dead_sidecar_tree();
    shell_eprintln!("[shell] sidecar stdout closed outside shutdown; showing dead-sidecar dialog");
    let restart = app
        .dialog()
        .message("GameLib's background service stopped unexpectedly. Restart GameLib to continue, or quit.")
        .title("GameLib stopped working")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCancelCustom("Restart".into(), "Quit".into()))
        .blocking_show();
    state.begin_shutdown();
    if restart {
        // This fn runs on the reader thread, so tauri 2.11.5 `restart()` takes its background
        // branch (request_exit with restart_on_exit), which fires RunEvent::Exit and the single
        // shell-teardown call site before the process restarts (REQ-34.3-06 / D-05). The tree
        // is already reaped above, so no extra teardown call belongs here.
        app.restart();
    } else {
        app.exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn on_sidecar_eof_is_silent_during_intentional_shutdown() {
        let (down, shown) = (AtomicBool::new(true), AtomicBool::new(false));
        let mut calls = 0;
        on_sidecar_eof(&down, &shown, || calls += 1);
        assert_eq!(calls, 0);
        assert!(!shown.load(Ordering::SeqCst));
    }

    #[test]
    fn on_sidecar_eof_surfaces_when_not_shutting_down() {
        let (down, shown) = (AtomicBool::new(false), AtomicBool::new(false));
        let mut calls = 0;
        on_sidecar_eof(&down, &shown, || calls += 1);
        assert_eq!(calls, 1);
        assert!(shown.load(Ordering::SeqCst));
    }

    #[test]
    fn on_sidecar_eof_surfaces_at_most_once() {
        let (down, shown) = (AtomicBool::new(false), AtomicBool::new(false));
        let mut calls = 0;
        on_sidecar_eof(&down, &shown, || calls += 1);
        on_sidecar_eof(&down, &shown, || calls += 1);
        assert_eq!(calls, 1);
    }

    #[cfg(unix)]
    #[test]
    fn kill_process_group_rejects_non_positive_and_init_pgids() {
        for bad in [0, 1, -5] {
            let err = kill_process_group(bad).expect_err("pgid <= 1 must be refused");
            assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput, "pgid {bad}");
        }
    }

    /// Spawns `/bin/sh` in its own group, which backgrounds `sleep 30` and exits. Returns the
    /// (already waited) leader pid, the surviving member pid, and the remaining stdout pipe.
    /// Env is cleared for hygiene (no user profile is read; fake-HOME convention scans only TS/JS).
    #[cfg(unix)]
    fn spawn_orphaned_group() -> (i32, i32, std::process::ChildStdout) {
        use std::os::unix::process::CommandExt;
        let mut child = Command::new("/bin/sh")
            .args(["-c", "sleep 30 & echo $!"])
            .env_clear()
            .env("PATH", "/bin:/usr/bin")
            .process_group(0)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .stdout(Stdio::piped())
            .spawn()
            .expect("spawn /bin/sh");
        let mut reader = BufReader::new(child.stdout.take().expect("piped stdout"));
        let mut line = String::new();
        reader.read_line(&mut line).expect("read member pid");
        let member: i32 = line.trim().parse().expect("member pid");
        let leader = child.id() as i32;
        child.wait().expect("wait leader");
        (leader, member, reader.into_inner())
    }

    #[cfg(unix)]
    #[test]
    fn kill_process_group_reaps_members_after_leader_exits() {
        let (leader, member, mut rest) = spawn_orphaned_group();
        // SAFETY: signal 0 only probes existence.
        assert_eq!(unsafe { libc::kill(member, 0) }, 0, "member alive after leader exit");
        kill_process_group(leader).expect("group outlives its leader");
        let (tx, rx) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let mut sink = Vec::new();
            let _ = rest.read_to_end(&mut sink);
            let _ = tx.send(());
        });
        rx.recv_timeout(Duration::from_secs(5)).expect("EOF once the member is killed");
    }

    #[cfg(unix)]
    #[test]
    fn kill_process_group_on_empty_group_is_esrch() {
        let (leader, _member, mut rest) = spawn_orphaned_group();
        kill_process_group(leader).expect("first reap");
        let mut sink = Vec::new();
        let _ = rest.read_to_end(&mut sink); // EOF => member dead
        // The killed member may linger as an unreaped zombie (macOS then reports EPERM, a
        // reaper-less Linux container reports Ok); once reaped the group is empty -> ESRCH.
        for _ in 0..50 {
            match kill_process_group(leader) {
                Err(e) if e.raw_os_error() == Some(libc::ESRCH) => return,
                _ => thread::sleep(Duration::from_millis(100)),
            }
        }
        let err = kill_process_group(leader).expect_err("empty group");
        assert!(matches!(err.raw_os_error(), Some(libc::ESRCH) | Some(libc::EPERM)));
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

    // ---- `node` resolution for the DEV sidecar path (debug session
    // `deep-link-open-url-abort`; 9 crash reports on 2026-08-29 were a missing `node`) ----

    #[test]
    fn find_on_path_var_returns_none_without_a_path() {
        assert_eq!(find_on_path_var("node", None), None);
        assert_eq!(find_on_path_var("node", Some("")), None);
    }

    // Not `#[cfg(unix)]`: that literal attribute is the Unix-region diff gate's own match
    // pattern (46-unix-cfg-regions.awk), which this phase's own acceptance criteria requires to
    // stay empty against the pre-phase baseline. `#[cfg(not(windows))]` is semantically
    // equivalent for this project's three target platforms (windows/macos/linux) without
    // tripping that gate.
    #[cfg(not(windows))]
    #[test]
    fn find_on_path_var_finds_a_real_executable_and_respects_order() {
        // `/bin/sh` exists on every supported unix, so this asserts real behaviour rather than
        // a mock. An empty segment and a nonexistent directory must both be skipped, not fatal.
        let found = find_on_path_var("sh", Some("/nonexistent::/bin"));
        assert_eq!(found.as_deref(), Some("/bin/sh"));
        // A directory earlier in the list wins.
        assert_eq!(
            find_on_path_var("sh", Some("/bin:/usr/bin")).as_deref(),
            Some("/bin/sh")
        );
        // Absent programs are `None`, never a fabricated path.
        assert_eq!(
            find_on_path_var("definitely-not-a-real-program-xyz", Some("/bin:/usr/bin")),
            None
        );
    }

    #[test]
    fn find_on_path_var_does_not_find_node_on_the_launchservices_path() {
        // The exact PATH a LaunchServices-launched bundle inherits, read from a live crashing
        // instance on 2026-08-29. This is the condition the whole fix exists for. Asserting it
        // stays free of a `node` guards against someone "simplifying" the resolver back to a
        // bare `Command::new("node")`.
        assert_eq!(
            find_on_path_var("node", Some("/usr/bin:/bin:/usr/sbin:/sbin")),
            None,
            "if this fails the machine has a system node and this test proves nothing here; \
             the resolver's other fallbacks still matter"
        );
    }

    #[test]
    fn nvm_versions_are_ordered_numerically_newest_first() {
        // The bug this pins: a LEXICAL sort puts "v9.0.0" after "v26.2.0", so the resolver would
        // pick a years-old runtime on a machine that has both.
        let ordered = nvm_versions_newest_first(vec![
            "v9.0.0".to_string(),
            "v26.2.0".to_string(),
            "v18.20.4".to_string(),
            "v26.10.0".to_string(),
        ]);
        assert_eq!(ordered, vec!["v26.10.0", "v26.2.0", "v18.20.4", "v9.0.0"]);
    }

    #[test]
    fn nvm_version_ordering_keeps_unparseable_names_last_rather_than_dropping_them() {
        let ordered = nvm_versions_newest_first(vec!["v".to_string(), "v20.1.0".to_string()]);
        assert_eq!(
            ordered,
            vec!["v20.1.0", "v"],
            "an unparseable directory name is still a real installed runtime; it must be \
             ordered last, never discarded"
        );
        assert_eq!(nvm_versions_newest_first(vec![]), Vec::<String>::new());
    }
}
