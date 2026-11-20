//! Spawn classes (D-15). A `Helper` is something GameLib runs for its own purposes and must clean
//! up on exit; a `Game` is the user's, and outlives GameLib.

use crate::children::global;
use std::process::{ChildStdout, Command};

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
    spawn_helper_with_stdout(cmd, label).map(|(pid, _)| pid)
}

/// As `spawn_helper`, but takes the child's piped stdout (if the caller asked for one) before the
/// child goes into the `ChildSet`, so the caller can read it.
pub fn spawn_helper_with_stdout(
    mut cmd: Command,
    label: &'static str,
) -> std::io::Result<(u32, Option<ChildStdout>)> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // pgid == the child's own pid, so one group signal reaches the helper and every
        // descendant, and never the shell's own group.
        cmd.process_group(0);
    }
    let mut child = cmd.spawn()?;
    let stdout = child.stdout.take();
    let pid = global().register_owned(label, child);
    Ok((pid, stdout))
}
