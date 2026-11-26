//! Unix process-group termination. Windows has no group-signal equivalent; its tree kill is the
//! per-helper Job Object in `job.rs`, so this module is empty there.

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
