//! Independent process probes. "Alive" means the process exists AND is not a zombie: a killed
//! child whose parent has not reaped it still has a process-table entry (a reaper-less Linux
//! container never reaps orphans), so a bare `kill(pid, 0)` would call it alive forever.

/// `true` while `pid` exists and has not exited.
pub fn is_alive(pid: u32) -> bool {
    imp::is_alive(pid)
}

/// An opaque per-process start stamp, used to detect pid reuse before signalling a pid we do not
/// own a `Child` for. `None` where the platform offers no cheap stamp or the process is gone (on
/// Windows the creation time from `GetProcessTimes`, a FILETIME as a `u64`).
pub fn start_time(pid: u32) -> Option<u64> {
    imp::start_time(pid)
}

/// `true` while any non-zombie process has process group `pgid`. A group outlives its leader while
/// any member remains, so this is how a game tree is watched after the leader has gone. `false`
/// for `pgid <= 1` (those are never a group GameLib created) and, off unix, always.
pub fn group_alive(pgid: u32) -> bool {
    match i32::try_from(pgid) {
        Ok(p) if p > 1 => imp::group_alive(pgid),
        _ => false,
    }
}

/// Windows: the creation time of the process `handle` names, read through that handle so a caller
/// holding it can check a stamp and then act on the very same process.
#[cfg(windows)]
pub(crate) fn creation_time(handle: windows_sys::Win32::Foundation::HANDLE) -> Option<u64> {
    imp::creation_time(handle)
}

/// Windows: whether the process `handle` names has exited, by a zero-timeout wait on it (`Some(true)`
/// signalled, `Some(false)` still running, `None` when the wait could not be made). 88.2-27's
/// held-leader walk reuses it; until then only `imp::is_alive` calls it, so this re-export is unused.
#[cfg(windows)]
#[allow(dead_code)]
pub(crate) fn handle_exited(handle: windows_sys::Win32::Foundation::HANDLE) -> Option<bool> {
    imp::handle_exited(handle)
}

#[cfg(target_os = "linux")]
mod imp {
    /// The part of `/proc/<pid>/stat` after the last ')' (the comm field may itself contain
    /// parentheses and spaces). Field 3 (state) is its first token.
    fn stat_after_comm(pid: u32) -> Option<String> {
        let s = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        let i = s.rfind(')')?;
        Some(s[i + 1..].to_string())
    }

    pub fn is_alive(pid: u32) -> bool {
        match stat_after_comm(pid) {
            Some(rest) => !matches!(rest.trim_start().chars().next(), Some('Z') | Some('X')),
            None => false,
        }
    }

    pub fn start_time(pid: u32) -> Option<u64> {
        // Field 22 (starttime) is token 19 after the state field (field 3 is token 0).
        stat_after_comm(pid)?
            .split_whitespace()
            .nth(19)?
            .parse()
            .ok()
    }

    /// Field 5 (pgrp) is token 2 after the comm field (state is token 0, ppid token 1). Zombies
    /// (Z) and the dead (X) do not count: a killed member nobody has reaped yet is not alive.
    pub fn group_alive(pgid: u32) -> bool {
        let Ok(dir) = std::fs::read_dir("/proc") else {
            return false;
        };
        dir.flatten().any(|entry| {
            let Some(pid) = entry
                .file_name()
                .to_str()
                .and_then(|n| n.parse::<u32>().ok())
            else {
                return false;
            };
            let Some(rest) = stat_after_comm(pid) else {
                return false;
            };
            let mut fields = rest.split_whitespace();
            let state = fields.next();
            let pgrp = fields.nth(1).and_then(|f| f.parse::<u32>().ok());
            !matches!(state, Some("Z") | Some("X")) && pgrp == Some(pgid)
        })
    }
}

#[cfg(target_os = "macos")]
mod imp {
    fn bsd_info(pid: u32) -> Option<libc::proc_bsdinfo> {
        // SAFETY: proc_bsdinfo is plain-old-data (all-zero is valid); proc_pidinfo writes at most
        // `size` bytes into it and returns the number of bytes written (<= 0 on failure).
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
        let n = unsafe {
            libc::proc_pidinfo(
                pid as libc::c_int,
                libc::PROC_PIDTBSDINFO,
                0,
                &mut info as *mut libc::proc_bsdinfo as *mut libc::c_void,
                size,
            )
        };
        if n == size {
            Some(info)
        } else {
            None
        }
    }

    pub fn is_alive(pid: u32) -> bool {
        match bsd_info(pid) {
            Some(info) => info.pbi_status != libc::SZOMB,
            None => false,
        }
    }

    pub fn start_time(pid: u32) -> Option<u64> {
        let info = bsd_info(pid)?;
        Some(info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec)
    }

    /// `PROC_PGRP_ONLY` from `<sys/proc_info.h>` (the `proc_listpids` selector that takes a
    /// process group id as `typeinfo`); libc 0.2.186 does not export it.
    const PROC_PGRP_ONLY: u32 = 2;

    /// Lists the pids whose process group is `pgid` and keeps the ones that are not zombies.
    pub fn group_alive(pgid: u32) -> bool {
        let unit = std::mem::size_of::<libc::c_int>();
        // SAFETY: a null buffer with size 0 only asks for the byte count `proc_listpids` needs.
        let needed = unsafe { libc::proc_listpids(PROC_PGRP_ONLY, pgid, std::ptr::null_mut(), 0) };
        if needed <= 0 {
            return false;
        }
        // Headroom for members forked between the two calls.
        let cap = needed as usize / unit + 8;
        let mut pids: Vec<libc::c_int> = vec![0; cap];
        // SAFETY: `pids` is `cap * unit` writable bytes and `proc_listpids` writes at most the
        // size it is given; it returns the number of bytes written (<= 0 on failure).
        let written = unsafe {
            libc::proc_listpids(
                PROC_PGRP_ONLY,
                pgid,
                pids.as_mut_ptr() as *mut libc::c_void,
                (cap * unit) as libc::c_int,
            )
        };
        if written <= 0 {
            return false;
        }
        let count = (written as usize / unit).min(cap);
        pids[..count].iter().any(|&p| p > 0 && is_alive(p as u32))
    }
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
mod imp {
    pub fn is_alive(pid: u32) -> bool {
        // SAFETY: signal 0 only probes existence; no pointers.
        let r = unsafe { libc::kill(pid as libc::pid_t, 0) };
        r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }

    pub fn start_time(_pid: u32) -> Option<u64> {
        None
    }

    /// `kill(-pgid, 0)` probes the whole group; EPERM means it exists but is not ours to signal.
    /// A zombie cannot be told apart here, so this can over-report on a reaper-less system.
    pub fn group_alive(pgid: u32) -> bool {
        // SAFETY: signal 0 only probes existence; `pgid` was checked to be > 1 by the caller.
        let r = unsafe { libc::kill(-(pgid as libc::pid_t), 0) };
        r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{
        CloseHandle, FILETIME, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, GetProcessTimes, OpenProcess, WaitForSingleObject,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
    };

    /// `STILL_ACTIVE` as `GetExitCodeProcess` reports it. 259 is also a legal exit code, so a process
    /// that exited with it reads as running here: the zero-timeout wait ([`handle_exited`]) is
    /// preferred, and this read is only the fallback for a handle the wait could not be made on.
    const STILL_ACTIVE_CODE: u32 = 259;

    /// Whether the process `handle` names has exited, by a zero-timeout wait on it: `Some(true)`
    /// signalled (exited), `Some(false)` still running, `None` when the wait could not be made (a
    /// handle opened without `SYNCHRONIZE`, say). Unlike the exit-code read it cannot mistake a
    /// legal exit code of 259 for a running process.
    pub fn handle_exited(handle: HANDLE) -> Option<bool> {
        // SAFETY: `handle` is a valid handle supplied by the caller; a zero timeout never blocks.
        match unsafe { WaitForSingleObject(handle, 0) } {
            WAIT_OBJECT_0 => Some(true),
            WAIT_TIMEOUT => Some(false),
            _ => None,
        }
    }

    /// The old liveness read: the exit code answers `STILL_ACTIVE` while the process runs.
    fn exit_code_says_alive(handle: HANDLE) -> bool {
        let mut code: u32 = 0;
        // SAFETY: `handle` is a valid process handle and `code` outlives the call.
        let ok = unsafe { GetExitCodeProcess(handle, &mut code) };
        ok != 0 && code == STILL_ACTIVE_CODE
    }

    pub fn is_alive(pid: u32) -> bool {
        // SAFETY: OpenProcess takes plain values and returns null on failure; the handle is
        // closed below and never escapes this function.
        let h = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                0,
                pid,
            )
        };
        if !h.is_null() {
            let alive = match handle_exited(h) {
                Some(exited) => !exited,
                None => exit_code_says_alive(h),
            };
            // SAFETY: `h` was opened above and is closed exactly once.
            unsafe { CloseHandle(h) };
            return alive;
        }
        // A process that grants query but not synchronize rights: the exit-code read.
        // SAFETY: as above.
        let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            return false;
        }
        let alive = exit_code_says_alive(h);
        // SAFETY: `h` was opened above and is closed exactly once.
        unsafe { CloseHandle(h) };
        alive
    }

    pub fn start_time(pid: u32) -> Option<u64> {
        // SAFETY: OpenProcess takes plain values and returns null on failure; the handle is
        // closed below and never escapes this function.
        let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            return None;
        }
        let t = creation_time(h);
        // SAFETY: `h` was opened above and is closed exactly once.
        unsafe { CloseHandle(h) };
        t
    }

    /// The creation FILETIME of the process `handle` names (it needs query rights), 100 ns ticks
    /// since 1601 as one `u64`. `None` when the call fails.
    pub fn creation_time(handle: HANDLE) -> Option<u64> {
        let zero = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
        // SAFETY: `handle` is a valid process handle supplied by the caller and the four
        // FILETIMEs outlive the call.
        let ok =
            unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) };
        (ok != 0)
            .then(|| (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime))
    }

    /// Windows has no process groups; a game tree there is a Job (88.2-06).
    pub fn group_alive(_pgid: u32) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn this_process_is_alive() {
        assert!(is_alive(std::process::id()));
    }

    #[test]
    fn a_reaped_child_is_not_alive() {
        #[cfg(unix)]
        let mut cmd = std::process::Command::new("/bin/sh");
        #[cfg(unix)]
        cmd.args(["-c", "exit 0"]);
        #[cfg(windows)]
        let mut cmd = std::process::Command::new("cmd");
        #[cfg(windows)]
        cmd.args(["/C", "exit 0"]);
        let mut child = cmd.spawn().expect("spawn");
        let pid = child.id();
        child.wait().expect("wait");
        assert!(!is_alive(pid));
    }

    #[test]
    fn group_alive_refuses_the_pgids_that_are_never_ours() {
        for bad in [0, 1, u32::MAX] {
            assert!(!group_alive(bad), "pgid {bad}");
        }
    }

    #[test]
    fn this_process_has_a_start_stamp_that_is_stable() {
        let pid = std::process::id();
        let first = start_time(pid);
        assert!(first.is_some_and(|t| t > 0), "own start stamp readable");
        assert_eq!(start_time(pid), first);
    }

    /// WR-07: 259 is `STILL_ACTIVE` as `GetExitCodeProcess` reports it, and also a legal exit code. A
    /// process that exited with it is over. The `Child` stays held so the pid cannot be recycled.
    #[cfg(windows)]
    #[test]
    fn an_exit_code_of_259_is_not_alive() {
        let mut child = std::process::Command::new("cmd")
            .args(["/C", "exit 259"])
            .spawn()
            .expect("spawn");
        let pid = child.id();
        let status = child.wait().expect("wait");
        assert_eq!(status.code(), Some(259));
        assert!(
            !is_alive(pid),
            "a process that exited with 259 is not alive"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_fresh_group_is_alive_and_a_killed_one_is_not() {
        use std::os::unix::process::CommandExt;
        let mut child = std::process::Command::new("/bin/sh")
            .args(["-c", "sleep 30"])
            .process_group(0)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("spawn /bin/sh");
        let pgid = child.id();
        assert!(group_alive(pgid), "a fresh group is alive");
        crate::kill_tree::kill_process_group(pgid as i32).expect("kill the group");
        // The killed leader is still a zombie until it is reaped, and a zombie is not alive.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while group_alive(pgid) {
            assert!(
                std::time::Instant::now() < deadline,
                "group still alive after SIGKILL"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        child.wait().expect("reap");
        assert!(!group_alive(pgid), "an empty group is not alive");
    }
}
