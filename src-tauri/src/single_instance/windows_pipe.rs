use super::*;

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
