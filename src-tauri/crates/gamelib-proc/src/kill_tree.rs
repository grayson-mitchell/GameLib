//! Unix process-group termination. Windows has no group-signal equivalent; its tree kill is the
//! per-helper Job Object in `job.rs`, so this module is empty there.

#[cfg(unix)]
pub(crate) use unix::signal_group;
#[cfg(unix)]
pub use unix::{kill_process_group, terminate_group};

#[cfg(unix)]
mod unix {
    use crate::diag::diag;
    use std::process::Child;
    use std::time::{Duration, Instant};

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

    #[cfg(test)]
    mod tests {
        use super::*;
        use gamelib_testutil::FakeHome;
        use std::io::{BufRead, BufReader, Read};
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

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
