//! Spawn classes (D-15). A `Helper` is something GameLib runs for its own purposes and must clean
//! up on exit; a `Game` is the user's, and outlives GameLib.

use crate::children::{global, HelperGuard};
use crate::job::JobSlot;
use crate::kill_tree::KillOutcome;
use crate::probe;
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpawnClass {
    /// Own process group (unix) or own kill-on-close Job (Windows); registered in the `ChildSet`.
    Helper,
    /// Own session on unix; never in a Job, never registered, never `kill_on_drop`.
    Game,
}

/// Spawns `cmd` as a `SpawnClass::Helper` and hands the child to the global `ChildSet`.
/// Returns its pid. The caller's stdio choices are kept; any pipe stays inside the registered
/// child.
pub fn spawn_helper(cmd: Command, label: &'static str) -> std::io::Result<u32> {
    spawn_helper_with_pipes(cmd, label).map(|(pid, _)| pid)
}

/// The caller's ends of a helper's stdio pipes (each `Some` only if the command asked for it).
#[derive(Debug, Default)]
pub struct HelperPipes {
    pub stdin: Option<ChildStdin>,
    pub stdout: Option<ChildStdout>,
}

/// As `spawn_helper`, but takes the child's piped stdin and stdout (if the caller asked for them)
/// before the child goes into the `ChildSet`, so the caller can talk to it. The pid is returned
/// only after the Windows Job assignment, so a helper can be told to start work (and spawn
/// grandchildren) once that has happened.
pub fn spawn_helper_with_pipes(
    mut cmd: Command,
    label: &'static str,
) -> std::io::Result<(u32, HelperPipes)> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // pgid == the child's own pid, so one group signal reaches the helper and every
        // descendant, and never the shell's own group.
        cmd.process_group(0);
    }
    let mut child = cmd.spawn()?;
    let pipes = HelperPipes {
        stdin: child.stdin.take(),
        stdout: child.stdout.take(),
    };
    // `JobSlot` is `()` off Windows, so on unix this binding is a unit value (clippy::let_unit_value)
    // by construction: the Windows build needs the Job taken from the child BEFORE the child moves
    // into the set, and the call must stay one shape on every OS.
    #[allow(clippy::let_unit_value)]
    let job = job_for(&child);
    let pid = global().register_owned(label, child, job);
    Ok((pid, pipes))
}

/// Windows: assigns the just-spawned helper to its own kill-on-close Job. Known limit: a
/// grandchild created before the assignment would escape; helpers are expected to spawn nothing
/// before they have been assigned. Elsewhere the process group set at spawn time does this job.
#[cfg(windows)]
fn job_for(child: &Child) -> JobSlot {
    use std::os::windows::io::AsRawHandle;
    crate::job::Job::create_for(child.as_raw_handle())
}

#[cfg(not(windows))]
fn job_for(_child: &Child) -> JobSlot {}

/// Windows: as `job_for`, for a tokio child (the raw handle is `None` once it has exited).
#[cfg(windows)]
fn tokio_job_for(child: &tokio::process::Child) -> JobSlot {
    child.raw_handle().and_then(crate::job::Job::create_for)
}

#[cfg(not(windows))]
fn tokio_job_for(_child: &tokio::process::Child) -> JobSlot {}

/// Spawns a tokio `cmd` as a `SpawnClass::Helper`: own process group (unix) or own kill-on-close
/// Job (Windows), `kill_on_drop(true)`, and the pid registered in the global `ChildSet` WITHOUT
/// owning the child. Move the returned `HelperGuard` into the same future or task as the child,
/// so the pid is unregistered exactly when the child is gone.
///
/// `kill_on_drop` kills the leader only; the exit path's `ChildSet::terminate_all` is what reaches
/// its descendants.
pub fn spawn_helper_tokio(
    cmd: &mut tokio::process::Command,
    label: &'static str,
) -> std::io::Result<(tokio::process::Child, HelperGuard)> {
    #[cfg(unix)]
    cmd.process_group(0);
    cmd.kill_on_drop(true);
    let child = cmd.spawn()?;
    let pid = child
        .id()
        .ok_or_else(|| std::io::Error::other("helper exited before it could be registered"))?;
    // `JobSlot` is `()` off Windows, so on unix this argument is a unit value (clippy::unit_arg); a
    // `let` binding instead trips clippy::let_unit_value. The Job must be taken from the child before
    // `child` moves into the return tuple, and the call stays one shape on every OS.
    #[allow(clippy::unit_arg)]
    global().register_pid(label, pid, tokio_job_for(&child));
    Ok((child, HelperGuard::new(pid)))
}

/// Spawns `cmd` as a `SpawnClass::Game`: the user's process, which outlives GameLib.
///
/// stdin is null; stdout and stderr go to null, or are appended to `log`. Never a pipe back to
/// GameLib: a game holding the read end of a pipe whose writer died can take SIGPIPE (Pitfall 5).
/// On unix the child starts its own session (`setsid`), so neither a group signal aimed at
/// GameLib nor the closing of GameLib's terminal reaches it. It is never put in a Job, never
/// registered in the `ChildSet` and never `kill_on_drop`.
pub fn spawn_game(mut cmd: Command, log: Option<&Path>) -> std::io::Result<Child> {
    cmd.stdin(Stdio::null());
    match log {
        Some(path) => {
            let out = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)?;
            let err = out.try_clone()?;
            cmd.stdout(Stdio::from(out)).stderr(Stdio::from(err));
        }
        None => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: the closure runs between fork and exec and calls only `setsid` (async-signal-
        // safe) and `last_os_error` (reads errno); it allocates nothing.
        unsafe {
            cmd.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    cmd.spawn()
}

/// A running `SpawnClass::Game` child that GameLib can later prove is the same process.
///
/// Built by `spawn_game_tracked`, which goes through `spawn_game` unchanged: own session, no Job,
/// never in the `ChildSet`, never `kill_on_drop`, and no pipe to the game. Dropping the handle
/// does not touch the game.
#[derive(Debug)]
pub struct GameHandle {
    child: Child,
    /// The game leader's pid; on unix also its process group id (it is its own session leader).
    pub pid: u32,
    /// `probe::start_time(pid)` read right after the spawn: what a later pid-only kill checks
    /// before it signals anything. `None` where the platform has no cheap stamp, and for a game
    /// that had already exited by the time it was read.
    pub stamp: Option<u64>,
}

/// As `spawn_game`, returning a `GameHandle` that carries the leader's pid and start stamp.
pub fn spawn_game_tracked(cmd: Command, log: Option<&Path>) -> std::io::Result<GameHandle> {
    let child = spawn_game(cmd, log)?;
    let pid = child.id();
    Ok(GameHandle {
        child,
        pid,
        stamp: probe::start_time(pid),
    })
}

impl GameHandle {
    /// Blocks until the leader has exited WITHOUT reaping it (unix: `waitid` with `WNOWAIT`), so
    /// the leader stays a zombie and its pid, and so its process group id, cannot be recycled
    /// while the handle can still signal the group. The handle never needs a stamp read for that:
    /// it owns the unreaped leader. (Measured: Linux's `start_time` still reads the zombie, macOS's
    /// `proc_pidinfo` does not, so a pid-only kill of a game whose leader has exited answers
    /// `Gone` there.) Retried on EINTR. Off unix there is no pid recycling to guard against while
    /// the handle is held, and this is a plain `wait`.
    pub fn wait_leader_exit(&mut self) -> std::io::Result<()> {
        #[cfg(unix)]
        {
            loop {
                // SAFETY: an all-zero `siginfo_t` is valid; `waitid` fills it in for a child of
                // this process, and `WNOWAIT` leaves that child's exit status to be reaped later.
                let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
                let r = unsafe {
                    libc::waitid(
                        libc::P_PID,
                        self.pid as libc::id_t,
                        &mut info,
                        libc::WEXITED | libc::WNOWAIT,
                    )
                };
                if r == 0 {
                    return Ok(());
                }
                let err = std::io::Error::last_os_error();
                if err.kind() != std::io::ErrorKind::Interrupted {
                    return Err(err);
                }
            }
        }
        #[cfg(not(unix))]
        {
            self.child.wait().map(|_| ())
        }
    }

    /// Whether any process of the game's group (the leader's own session and group) is still
    /// running. The leader's zombie does not count, so this is the answer after the leader has
    /// exited.
    #[cfg(unix)]
    pub fn group_alive(&self) -> bool {
        probe::group_alive(self.pid)
    }

    /// Ends the whole game tree through this handle: SIGTERM to the group, poll `group_alive`,
    /// SIGKILL if members remain after `grace`. No stamp read: the handle owns the leader and,
    /// unless it was reaped, the pid cannot have been recycled (see `wait_leader_exit`). `Gone`
    /// when the group is already empty.
    #[cfg(unix)]
    pub fn kill_tree(&mut self, grace: std::time::Duration) -> KillOutcome {
        match i32::try_from(self.pid) {
            Ok(pgid) => crate::kill_tree::terminate_known_group(pgid, grace),
            Err(_) => KillOutcome::Gone,
        }
    }

    /// Reaps the leader. Call it only after the game's group is empty (`group_alive()` false on
    /// unix): until the leader is reaped its pid, and so its pgid, cannot be recycled.
    pub fn reap(mut self) -> std::io::Result<()> {
        self.child.wait().map(|_| ())
    }
}
