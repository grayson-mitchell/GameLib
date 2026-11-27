//! Process-tree termination. Unix signals process groups. Windows has no group signal; its helper
//! tree kill is the per-helper Job Object in `job.rs`, and its stamp-checked game tree kill
//! (`kill_game_tree`) terminates the game's named Game Job, or, once that name is gone, the
//! stamped leader and its parent-linked descendants, so only that function lives here.
//! With `job.rs`, this is where `TerminateProcess` is called.

/// How a stamp-checked game tree kill ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KillOutcome {
    /// The tree was signalled and its group is now empty (or was SIGKILLed after the grace).
    Killed,
    /// The pid is alive but its start stamp is not the recorded one: pid reuse. Nothing was
    /// signalled.
    NotOurs,
    /// The pid (or, for an own handle, the whole group) is not alive. Nothing was signalled.
    Gone,
}

#[cfg(unix)]
pub use unix::{kill_game_tree, kill_process_group, terminate_group};
#[cfg(unix)]
pub(crate) use unix::{signal_group, terminate_known_group};
#[cfg(windows)]
pub use win::kill_game_tree;

#[cfg(windows)]
mod win {
    use super::KillOutcome;
    use crate::diag::diag;
    use crate::job::GameJob;
    use crate::probe;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{
        GetLastError, ERROR_INVALID_PARAMETER, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_TERMINATE,
    };

    /// How long a terminated Job gets to empty before the kill stops waiting for it.
    const TERMINATE_SETTLE: Duration = Duration::from_secs(1);

    /// Kills the tree of a game GameLib recorded as `pid` plus start `stamp` (`probe::start_time`
    /// at spawn), for the case where GameLib holds no `Child` for it (re-adoption after a
    /// restart, quit-kill).
    ///
    /// Prohibition 5 at the mechanism: nothing is terminated unless the pid's creation time equals
    /// `stamp`, so a recycled pid is never touched, and the Game Job opened afterwards carries both
    /// the pid and the stamp in its name. `Gone` when the leader is not alive, `NotOurs` on a stamp
    /// mismatch. Windows has no graceful signal, so `grace` only bounds the wait for the tree to
    /// end after it has been terminated.
    ///
    /// When no Game Job of that name can be opened (the process that created it is gone, which
    /// removes the name, or it was never created) the tree is found by parentage instead
    /// (`terminate_stamped_tree`) and the line `game job not found; walking the descendants of the
    /// stamped leader` is logged.
    pub fn kill_game_tree(pid: u32, stamp: u64, grace: Duration) -> KillOutcome {
        if !probe::is_alive(pid) {
            return KillOutcome::Gone;
        }
        if probe::start_time(pid) != Some(stamp) {
            return KillOutcome::NotOurs;
        }
        match GameJob::open(pid, stamp) {
            Some(job) => {
                job.terminate();
                let deadline = Instant::now() + grace.min(TERMINATE_SETTLE);
                while Instant::now() < deadline && job.active_processes().is_some_and(|n| n > 0) {
                    std::thread::sleep(Duration::from_millis(20));
                }
                KillOutcome::Killed
            }
            None => {
                diag("game job not found; walking the descendants of the stamped leader");
                terminate_stamped_tree(pid, stamp, grace)
            }
        }
    }

    /// How many times the descendant walk repeats to catch a process the tree started while it
    /// was being terminated.
    const WALK_PASSES: usize = 3;

    /// The fallback when the named Game Job cannot be reopened. A named Job's name is removed from
    /// the object namespace once its last handle closes, even while members run, so after the
    /// process that created it is gone (a GameLib restart, or its death) the name is dead and the
    /// tree has to be found by parentage instead.
    ///
    /// The tree is every live process reachable from `pid` through parent pids where each is
    /// newer than the process it names as its parent (the root's age being `stamp`): a pid that
    /// was recycled to an unrelated, newer process is therefore never followed. Every descendant
    /// is held as an open handle from the check to the terminate, so its pid cannot be recycled
    /// between them. The descendants are collected before the leader is terminated, while the
    /// parent links are intact, and the walk repeats (`WALK_PASSES`) for anything started in the
    /// gap. Unlike a Job this does not follow a process that was reparented away or whose parent
    /// died and whose pid was reused.
    fn terminate_stamped_tree(pid: u32, stamp: u64, grace: Duration) -> KillOutcome {
        let first = collect_descendants(pid, stamp);
        let outcome = terminate_stamped_leader(pid, stamp, grace);
        if outcome == KillOutcome::NotOurs {
            return outcome;
        }
        let deadline = Instant::now() + grace.min(TERMINATE_SETTLE);
        let mut batch = first;
        for _ in 0..WALK_PASSES {
            if batch.is_empty() {
                break;
            }
            for member in &batch {
                // SAFETY: `member` holds a valid process handle opened with terminate rights; a
                // process that already ended makes this fail, which is the outcome wanted.
                unsafe { TerminateProcess(member.as_raw_handle() as _, 1) };
            }
            for member in &batch {
                let left = deadline.saturating_duration_since(Instant::now());
                let wait_ms = u32::try_from(left.as_millis()).unwrap_or(0);
                // SAFETY: a valid process handle; it is signalled when the process exits.
                unsafe { WaitForSingleObject(member.as_raw_handle() as _, wait_ms) };
            }
            batch = collect_descendants(pid, stamp);
        }
        KillOutcome::Killed
    }

    /// Open handles (terminate and query rights) to every live descendant of `root`, found from a
    /// process snapshot and kept only where each process is newer than its named parent, the
    /// root counting as created at `root_stamp`. Empty when the snapshot cannot be taken.
    fn collect_descendants(root: u32, root_stamp: u64) -> Vec<OwnedHandle> {
        let Some(table) = process_table() else {
            return Vec::new();
        };
        // (pid, creation time) of every process already accepted into the tree, root first.
        let mut accepted: Vec<(u32, u64)> = vec![(root, root_stamp)];
        let mut held: Vec<OwnedHandle> = Vec::new();
        let mut next = 0;
        while next < accepted.len() {
            let (parent_pid, parent_created) = accepted[next];
            next += 1;
            for &(child_pid, ppid) in &table {
                if ppid != parent_pid
                    || child_pid == 0
                    || accepted.iter().any(|(seen, _)| *seen == child_pid)
                {
                    continue;
                }
                // SAFETY: OpenProcess takes plain values and returns null on failure.
                let raw = unsafe {
                    OpenProcess(
                        PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION,
                        0,
                        child_pid,
                    )
                };
                if raw.is_null() {
                    continue;
                }
                // SAFETY: `raw` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
                let handle = unsafe { OwnedHandle::from_raw_handle(raw as _) };
                let Some(created) = probe::creation_time(handle.as_raw_handle() as _) else {
                    continue;
                };
                if created < parent_created || !probe::is_alive(child_pid) {
                    continue;
                }
                accepted.push((child_pid, created));
                held.push(handle);
            }
        }
        held
    }

    /// `(pid, parent pid)` of every process in a snapshot taken now, `None` when none can be taken.
    fn process_table() -> Option<Vec<(u32, u32)>> {
        // SAFETY: plain values; the result is checked against INVALID_HANDLE_VALUE below.
        let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if raw == INVALID_HANDLE_VALUE {
            // SAFETY: GetLastError has no preconditions.
            let err = unsafe { GetLastError() };
            diag(&format!("process snapshot failed (error {err})"));
            return None;
        }
        // SAFETY: `raw` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
        let snapshot = unsafe { OwnedHandle::from_raw_handle(raw as _) };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut table = Vec::new();
        // SAFETY: a valid snapshot handle and an entry whose dwSize is set; it outlives the call.
        let mut more = unsafe { Process32FirstW(snapshot.as_raw_handle() as _, &mut entry) } != 0;
        while more {
            table.push((entry.th32ProcessID, entry.th32ParentProcessID));
            // SAFETY: as above.
            more = unsafe { Process32NextW(snapshot.as_raw_handle() as _, &mut entry) } != 0;
        }
        Some(table)
    }

    /// Terminates the process `pid` if, and only if, the handle opened for it reports creation
    /// time `stamp`. The check and the terminate use one handle, so the pid cannot be recycled
    /// between them.
    fn terminate_stamped_leader(pid: u32, stamp: u64, grace: Duration) -> KillOutcome {
        // SAFETY: OpenProcess takes plain values and returns null on failure.
        let raw = unsafe {
            OpenProcess(
                PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION,
                0,
                pid,
            )
        };
        if raw.is_null() {
            // SAFETY: GetLastError has no preconditions.
            let err = unsafe { GetLastError() };
            if err == ERROR_INVALID_PARAMETER {
                return KillOutcome::Gone;
            }
            diag(&format!("game leader: OpenProcess failed (error {err})"));
            return KillOutcome::NotOurs;
        }
        // SAFETY: `raw` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
        let handle = unsafe { OwnedHandle::from_raw_handle(raw as _) };
        if probe::creation_time(handle.as_raw_handle() as _) != Some(stamp) {
            return KillOutcome::NotOurs;
        }
        // SAFETY: `handle` is a valid process handle with terminate rights.
        if unsafe { TerminateProcess(handle.as_raw_handle() as _, 1) } == 0 {
            // SAFETY: GetLastError has no preconditions.
            let err = unsafe { GetLastError() };
            diag(&format!(
                "game leader: TerminateProcess failed (error {err})"
            ));
            return KillOutcome::NotOurs;
        }
        let wait_ms = u32::try_from(grace.min(TERMINATE_SETTLE).as_millis()).unwrap_or(1000);
        // SAFETY: `handle` is a valid process handle; a process handle is signalled on exit.
        unsafe { WaitForSingleObject(handle.as_raw_handle() as _, wait_ms) };
        KillOutcome::Killed
    }
}

#[cfg(unix)]
mod unix {
    use super::KillOutcome;
    use crate::diag::diag;
    use crate::probe;
    use std::process::Child;
    use std::time::{Duration, Instant};

    /// How long a SIGKILLed group gets to empty before the kill stops waiting for it.
    const SIGKILL_SETTLE: Duration = Duration::from_secs(1);

    /// Sends `sig` to every member of group `pgid`.
    ///
    /// Refuses `pgid <= 1`: `kill(-pgid, ..)` with pgid 1 is `kill(-1)` (every process the user
    /// owns) and with 0 is `kill(0)` (the caller's own group, i.e. the shell itself).
    pub(crate) fn signal_group(pgid: i32, sig: i32) -> std::io::Result<()> {
        if pgid <= 1 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("refusing to signal process group {pgid}"),
            ));
        }
        // SAFETY: signals only the process group `-pgid` (> 1, validated above); no pointers are
        // dereferenced and the call can only fail (ESRCH/EPERM).
        if unsafe { libc::kill(-pgid, sig) } == -1 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    /// SIGKILLs every member of process group `pgid` (WR-01). A process group outlives its leader
    /// while any member remains, so this still reaches comet / the bridge helper / games after the
    /// sidecar's own `exit(1)`.
    ///
    /// Refuses `pgid <= 1`: `kill(-pgid, ..)` with pgid 1 is `kill(-1)` (every process the user
    /// owns) and with 0 is `kill(0)` (the caller's own group, i.e. the shell itself).
    pub fn kill_process_group(pgid: i32) -> std::io::Result<()> {
        signal_group(pgid, libc::SIGKILL)
    }

    fn log_signal_failure(what: &str, pgid: i32, e: &std::io::Error) {
        // ESRCH: the group is already gone, which is the outcome we wanted.
        if e.raw_os_error() != Some(libc::ESRCH) {
            diag(&format!("{what} to process group {pgid} failed: {e}"));
        }
    }

    /// The shell's `shutdown_child` unix sequence, made reusable: SIGTERM to `-pgid` (catchable,
    /// so children get a graceful exit), poll `try_wait` every 50 ms up to `grace`, SIGKILL to
    /// `-pgid` if the leader is still alive, then `wait()`.
    ///
    /// `child` must be the leader of `pgid` (spawned with `process_group(0)`), and must not have
    /// been reaped yet: an unreaped leader keeps its pid, and so the pgid, from being recycled.
    pub fn terminate_group(pgid: i32, child: &mut Child, grace: Duration) {
        if let Err(e) = signal_group(pgid, libc::SIGTERM) {
            log_signal_failure("SIGTERM", pgid, &e);
        }
        let deadline = Instant::now() + grace;
        let mut exited = false;
        while Instant::now() < deadline {
            match child.try_wait() {
                Ok(Some(_)) => {
                    exited = true;
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(e) => {
                    diag(&format!("try_wait failed during group termination: {e}"));
                    break;
                }
            }
        }
        if !exited {
            if let Err(e) = kill_process_group(pgid) {
                log_signal_failure("SIGKILL", pgid, &e);
            }
        }
        if let Err(e) = child.wait() {
            diag(&format!("wait failed during group termination: {e}"));
        }
    }

    /// Ends the whole tree of process group `pgid`, a group the caller has already proven is the
    /// one it means (an own unreaped leader, or a pid whose start stamp matched): SIGTERM to the
    /// group, poll `probe::group_alive` every 50 ms up to `grace`, SIGKILL if members remain, then
    /// wait a short bounded time for the group to empty. Answers `Gone` without signalling when the
    /// group is already empty, since an empty group's id may have been recycled.
    ///
    /// Every signal goes through `signal_group`, so `pgid <= 1` is refused (and answers `Gone`).
    pub(crate) fn terminate_known_group(pgid: i32, grace: Duration) -> KillOutcome {
        // `pgid <= 1` is not a group this crate created: `group_alive` answers false for it, so
        // it is `Gone` here and never reaches `signal_group`.
        let alive = |pgid: i32| probe::group_alive(pgid as u32);
        if !alive(pgid) {
            return KillOutcome::Gone;
        }
        if let Err(e) = signal_group(pgid, libc::SIGTERM) {
            log_signal_failure("SIGTERM", pgid, &e);
        }
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline && alive(pgid) {
            std::thread::sleep(Duration::from_millis(50));
        }
        if alive(pgid) {
            if let Err(e) = kill_process_group(pgid) {
                log_signal_failure("SIGKILL", pgid, &e);
            }
            let settle = Instant::now() + SIGKILL_SETTLE;
            while Instant::now() < settle && alive(pgid) {
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        KillOutcome::Killed
    }

    /// Kills the tree of a game GameLib recorded as `pid` plus start `stamp` (`probe::start_time`
    /// at spawn), for the case where GameLib holds no `Child` for it (re-adoption after a
    /// restart, quit-kill).
    ///
    /// Prohibition 5 at the mechanism: nothing is signalled unless the pid's start stamp equals
    /// `stamp`, so a recycled pid is never touched. A Game leader is its own session and group
    /// leader (`setsid`), so its pgid is its pid. The check and the signal are two steps; the
    /// window between them is the stamp's own resolution (microseconds on macOS, clock ticks on
    /// Linux) against a pid that must also be recycled inside it.
    pub fn kill_game_tree(pid: u32, stamp: u64, grace: Duration) -> KillOutcome {
        if !probe::is_alive(pid) {
            return KillOutcome::Gone;
        }
        if probe::start_time(pid) != Some(stamp) {
            return KillOutcome::NotOurs;
        }
        match i32::try_from(pid) {
            Ok(pgid) => terminate_known_group(pgid, grace),
            // A pid that does not fit an i32 cannot be a group this crate could signal.
            Err(_) => KillOutcome::NotOurs,
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use gamelib_testutil::FakeHome;
        use std::io::{BufRead, BufReader, Read};
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

        #[test]
        fn kill_game_tree_on_a_reaped_pid_is_gone_and_signals_nothing() {
            let mut child = Command::new("/bin/sh")
                .args(["-c", "exit 0"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn /bin/sh");
            let pid = child.id();
            child.wait().expect("reap");
            assert_eq!(
                kill_game_tree(pid, 1, Duration::from_millis(100)),
                KillOutcome::Gone
            );
        }

        #[test]
        fn terminate_known_group_refuses_the_pgids_that_are_never_ours() {
            for bad in [0, 1, -1] {
                assert_eq!(
                    terminate_known_group(bad, Duration::from_millis(10)),
                    KillOutcome::Gone,
                    "pgid {bad}"
                );
            }
        }

        #[test]
        fn kill_process_group_rejects_non_positive_and_init_pgids() {
            for bad in [0, 1, -5] {
                let err = kill_process_group(bad).expect_err("pgid <= 1 must be refused");
                assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput, "pgid {bad}");
            }
        }

        /// Spawns `/bin/sh` in its own group, which backgrounds `sleep 30` and exits. Returns the
        /// (already waited) leader pid, the surviving member pid, and the remaining stdout pipe.
        /// The fake profile keeps any real HOME out of the child; PATH is kept so `sleep` resolves.
        fn spawn_orphaned_group(home: &FakeHome) -> (i32, i32, std::process::ChildStdout) {
            let mut cmd = Command::new("/bin/sh");
            cmd.args(["-c", "sleep 30 & echo $!"])
                .env_clear()
                .env("PATH", "/bin:/usr/bin")
                .process_group(0)
                .stdin(Stdio::null())
                .stderr(Stdio::null())
                .stdout(Stdio::piped());
            home.apply(&mut cmd);
            let mut child = cmd.spawn().expect("spawn /bin/sh");
            let mut reader = BufReader::new(child.stdout.take().expect("piped stdout"));
            let mut line = String::new();
            reader.read_line(&mut line).expect("read member pid");
            let member: i32 = line.trim().parse().expect("member pid");
            let leader = child.id() as i32;
            child.wait().expect("wait leader");
            (leader, member, reader.into_inner())
        }

        #[test]
        fn kill_process_group_reaps_members_after_leader_exits() {
            let home = FakeHome::new("gamelib-proc-kill-");
            let (leader, member, mut rest) = spawn_orphaned_group(&home);
            // SAFETY: signal 0 only probes existence.
            assert_eq!(
                unsafe { libc::kill(member, 0) },
                0,
                "member alive after leader exit"
            );
            kill_process_group(leader).expect("group outlives its leader");
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let mut sink = Vec::new();
                let _ = rest.read_to_end(&mut sink);
                let _ = tx.send(());
            });
            rx.recv_timeout(Duration::from_secs(5))
                .expect("EOF once the member is killed");
        }

        #[test]
        fn terminate_group_ends_a_sigterm_responsive_leader_and_reaps_it() {
            let home = FakeHome::new("gamelib-proc-kill-");
            let mut cmd = Command::new("/bin/sh");
            cmd.args(["-c", "sleep 30"])
                .env_clear()
                .env("PATH", "/bin:/usr/bin")
                .process_group(0)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            home.apply(&mut cmd);
            let mut child = cmd.spawn().expect("spawn /bin/sh");
            let pgid = child.id() as i32;
            let started = Instant::now();
            terminate_group(pgid, &mut child, Duration::from_secs(5));
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "SIGTERM should end the leader inside the grace period"
            );
            // `wait()` already reaped it, so a second try_wait still reports the exit status.
            assert!(matches!(child.try_wait(), Ok(Some(_))));
        }

        #[test]
        fn kill_process_group_on_empty_group_is_esrch() {
            let home = FakeHome::new("gamelib-proc-kill-");
            let (leader, _member, mut rest) = spawn_orphaned_group(&home);
            kill_process_group(leader).expect("first reap");
            let mut sink = Vec::new();
            let _ = rest.read_to_end(&mut sink); // EOF => member dead
                                                 // The killed member may linger as an unreaped zombie (macOS then reports EPERM, a
                                                 // reaper-less Linux container reports Ok); once reaped the group is empty -> ESRCH.
            for _ in 0..50 {
                match kill_process_group(leader) {
                    Err(e) if e.raw_os_error() == Some(libc::ESRCH) => return,
                    _ => std::thread::sleep(Duration::from_millis(100)),
                }
            }
            let err = kill_process_group(leader).expect_err("empty group");
            assert!(matches!(
                err.raw_os_error(),
                Some(libc::ESRCH) | Some(libc::EPERM)
            ));
        }
    }
}
