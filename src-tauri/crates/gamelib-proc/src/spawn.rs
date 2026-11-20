//! Spawn classes (D-15). A `Helper` is something GameLib runs for its own purposes and must clean
//! up on exit; a `Game` is the user's, and outlives GameLib.

use crate::children::global;
use crate::job::JobSlot;
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
