//! Independent process probes. "Alive" means the process exists AND is not a zombie: a killed
//! child whose parent has not reaped it still has a process-table entry (a reaper-less Linux
//! container never reaps orphans), so a bare `kill(pid, 0)` would call it alive forever.

/// `true` while `pid` exists and has not exited.
pub fn is_alive(pid: u32) -> bool {
    imp::is_alive(pid)
}

/// An opaque per-process start stamp, used to detect pid reuse before signalling a pid we do not
/// own a `Child` for. `None` where the platform offers no cheap stamp (Windows) or the process is
/// gone.
pub fn start_time(pid: u32) -> Option<u64> {
    imp::start_time(pid)
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
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    /// `STILL_ACTIVE` as `GetExitCodeProcess` reports it.
    const STILL_ACTIVE_CODE: u32 = 259;

    pub fn is_alive(pid: u32) -> bool {
        // SAFETY: OpenProcess takes plain values and returns null on failure; the handle is
        // closed below and never escapes this function.
        let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            return false;
        }
        let mut code: u32 = 0;
        // SAFETY: `h` is a valid process handle and `code` outlives the call.
        let ok = unsafe { GetExitCodeProcess(h, &mut code) };
        // SAFETY: `h` was opened above and is closed exactly once.
        unsafe { CloseHandle(h) };
        ok != 0 && code == STILL_ACTIVE_CODE
    }

    pub fn start_time(_pid: u32) -> Option<u64> {
        None
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
}
