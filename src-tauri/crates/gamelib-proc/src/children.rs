//! The helper `ChildSet`: every process GameLib spawned as `SpawnClass::Helper` and still owns.
//! The exit path drains it (`terminate_all`). Games are never registered here (D-08).

use crate::diag::diag;
use crate::job::JobSlot;
use std::collections::HashMap;
use std::process::Child;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::Duration;

struct Entry {
    label: &'static str,
    /// Per-process start stamp, to detect pid reuse before signalling a pid we hold no `Child`
    /// for.
    #[cfg_attr(windows, allow(dead_code))]
    start: Option<u64>,
    /// `Some` for `spawn_helper` (the set owns and reaps the child); `None` for a tokio child
    /// that its own task owns and only registered through a `HelperGuard`.
    owned: Option<Child>,
    /// Windows: the helper's own kill-on-close Job (closed, so the members killed, when the entry
    /// is dropped, unless `ChildSet::release` cleared kill-on-close first because the helper ended
    /// on its own). Nothing on other platforms.
    #[cfg_attr(not(windows), allow(dead_code))]
    job: JobSlot,
}

pub struct ChildSet {
    inner: Mutex<HashMap<u32, Entry>>,
}

impl ChildSet {
    fn new() -> ChildSet {
        ChildSet {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Poison-tolerant: an unwind on the exit path is worse than a leak.
    fn lock(&self) -> MutexGuard<'_, HashMap<u32, Entry>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn register_owned(&self, label: &'static str, child: Child, job: JobSlot) -> u32 {
        let pid = child.id();
        let entry = Entry {
            label,
            start: crate::probe::start_time(pid),
            owned: Some(child),
            job,
        };
        self.lock().insert(pid, entry);
        register_with_reaper(pid, label);
        pid
    }

    pub(crate) fn register_pid(&self, label: &'static str, pid: u32, job: JobSlot) {
        let entry = Entry {
            label,
            start: crate::probe::start_time(pid),
            owned: None,
            job,
        };
        self.lock().insert(pid, entry);
        register_with_reaper(pid, label);
    }

    pub(crate) fn unregister(&self, pid: u32) {
        self.lock().remove(&pid);
        unregister_with_reaper(pid);
    }

    /// Unregisters a helper whose leader ended on its own (`HelperGuard::ended_on_its_own`): what it
    /// left running is left running, as on unix. Windows: the entry's Job has kill-on-close
    /// cleared before the entry (and so the handle) is dropped; if that fails it is logged with the
    /// helper's static label and the Job closes with kill-on-close still set, the old behaviour.
    /// Unix: the same as `unregister`. Nothing here ends a process.
    pub(crate) fn release(&self, pid: u32) {
        let entry = self.lock().remove(&pid);
        #[cfg(windows)]
        if let Some(entry) = &entry {
            if let Some(job) = &entry.job {
                if !job.release() {
                    diag(&format!(
                        "helper '{}': could not release its job; its processes end with it",
                        entry.label
                    ));
                }
            }
        }
        // Dropped here, after the release: closing the handle now leaves the members running.
        drop(entry);
        unregister_with_reaper(pid);
    }

    /// Number of registered helpers.
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Labels of the registered helpers, sorted (duplicates kept).
    pub fn labels(&self) -> Vec<&'static str> {
        let mut v: Vec<&'static str> = self.lock().values().map(|e| e.label).collect();
        v.sort_unstable();
        v
    }

    /// Terminates every registered helper tree and empties the set.
    ///
    /// Unix: SIGTERM to each helper's group, wait up to `grace` for every group to be empty (the
    /// group, not the leader: a member that ignores SIGTERM keeps its helper pending), SIGKILL the
    /// groups still alive, then reap the children this set owns. Returns the labels whose group
    /// needed the hard kill. Only groups this crate created with `process_group(0)`
    /// are ever signalled, never by name and never `pgid <= 1`.
    ///
    /// Windows: there is no graceful signal reachable from here, so each helper is terminated
    /// outright and the returned list is empty (no helper was given a grace period to overrun).
    pub fn terminate_all(&self, grace: Duration) -> Vec<&'static str> {
        // Take the entries out first: waiting up to `grace` under the lock would stall every
        // `HelperGuard::drop` on a tokio worker. A drained entry's later unregister is a no-op.
        let entries: Vec<(u32, Entry)> = self.lock().drain().collect();
        let pids: Vec<u32> = entries.iter().map(|(pid, _)| *pid).collect();
        let hard_killed = terminate_entries(entries, grace);
        // Every group is gone (or was never ours to keep): tell the reaper so it cannot later
        // signal a recycled id.
        for pid in pids {
            unregister_with_reaper(pid);
        }
        hard_killed
    }

    /// Ends one registered helper's whole tree and unregisters it; every other helper, and every
    /// game (a game is never registered), is untouched. Answers whether an entry was found.
    ///
    /// Unix: SIGTERM to the helper's own group, poll until the group is empty (the leader's reaped
    /// zombie does not count) up to `grace`, SIGKILL whatever remains, then reap the child if the
    /// set owns it. Windows: terminate the entry's Job when it has one, else kill the owned child.
    ///
    /// The set's lock is held only to take the entry out, never while waiting, so a
    /// `HelperGuard::drop` on a tokio worker is never stalled behind a slow kill.
    pub fn terminate_one(&self, pid: u32, grace: Duration) -> bool {
        let entry = self.lock().remove(&pid);
        let Some(entry) = entry else {
            return false;
        };
        terminate_entry(pid, entry, grace);
        // The group is gone (or was never ours to keep): tell the reaper so it cannot later
        // signal a recycled id.
        unregister_with_reaper(pid);
        true
    }
}

/// A helper's pid is its process group id (unix `process_group(0)`); a pid that does not fit an
/// `i32` cannot be a group the reaper could signal, so it is not registered.
fn register_with_reaper(pid: u32, label: &str) {
    if let Ok(pgid) = i32::try_from(pid) {
        crate::reaper::register_group(pgid, label);
    }
}

fn unregister_with_reaper(pid: u32) {
    if let Ok(pgid) = i32::try_from(pid) {
        crate::reaper::unregister_group(pgid);
    }
}

#[cfg(unix)]
fn still_ours(pid: u32, e: &Entry) -> bool {
    if e.owned.is_some() {
        // We hold the unreaped child, so the pid (and the group id) cannot have been recycled.
        return true;
    }
    match e.start {
        Some(s) => match crate::probe::start_time(pid) {
            Some(now) => now == s,
            // The leader's stamp cannot be read: it is gone and reaped (a tokio task owns and
            // awaits it). A process group id still in use is never handed to a new process, so a
            // live group under this id can only be the helper's own members. A leader that is
            // there but carries a different stamp (above) is a recycled pid and is refused.
            None => crate::probe::group_alive(pid),
        },
        None => crate::probe::is_alive(pid),
    }
}

/// `true` once the helper's whole process group is empty. The group, not the leader, decides: a
/// member that ignores SIGTERM outlives a leader that left. An owned leader is reaped here as soon
/// as it exits (its zombie would otherwise keep counting), which is safe because the group id
/// cannot be reused while any member remains.
#[cfg(unix)]
fn exited(pid: u32, e: &mut Entry) -> bool {
    if let Some(child) = e.owned.as_mut() {
        if let Err(err) = child.try_wait() {
            diag(&format!("try_wait failed for helper '{}': {err}", e.label));
        }
    }
    !crate::probe::group_alive(pid)
}

#[cfg(unix)]
fn terminate_entries(mut entries: Vec<(u32, Entry)>, grace: Duration) -> Vec<&'static str> {
    use crate::kill_tree::signal_group;
    use std::time::Instant;

    // Ownership is decided once, before any signal: an entry that is not ours is never signalled,
    // so polling its group would only burn the grace.
    let mut pending: Vec<usize> = Vec::new();
    for (i, (pid, e)) in entries.iter().enumerate() {
        if !still_ours(*pid, e) {
            continue;
        }
        pending.push(i);
        if let Ok(pgid) = i32::try_from(*pid) {
            if let Err(err) = signal_group(pgid, libc::SIGTERM) {
                if err.raw_os_error() != Some(libc::ESRCH) {
                    diag(&format!("SIGTERM to helper '{}' failed: {err}", e.label));
                }
            }
        }
    }

    let deadline = Instant::now() + grace;
    loop {
        pending.retain(|&i| {
            let (pid, e) = &mut entries[i];
            !exited(*pid, e)
        });
        if pending.is_empty() || Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let mut hard_killed: Vec<&'static str> = Vec::new();
    for &i in &pending {
        let (pid, e) = &entries[i];
        // Re-checked at the deadline: still ours and still alive, so a group that emptied since
        // the last poll (and may now be a recycled id) is never signalled.
        if !still_ours(*pid, e) || !crate::probe::group_alive(*pid) {
            continue;
        }
        hard_killed.push(e.label);
        if let Ok(pgid) = i32::try_from(*pid) {
            if let Err(err) = signal_group(pgid, libc::SIGKILL) {
                if err.raw_os_error() != Some(libc::ESRCH) {
                    diag(&format!("SIGKILL to helper '{}' failed: {err}", e.label));
                }
            }
        }
    }
    for &i in &pending {
        if let Some(child) = entries[i].1.owned.as_mut() {
            if let Err(err) = child.wait() {
                diag(&format!("wait failed for helper: {err}"));
            }
        }
    }
    hard_killed.sort_unstable();
    hard_killed
}

/// One entry's share of `terminate_all`, run to completion: the group is empty (or `grace` has
/// passed and it was SIGKILLed) when this returns.
#[cfg(unix)]
fn terminate_entry(pid: u32, mut e: Entry, grace: Duration) {
    use crate::kill_tree::{kill_process_group, signal_group};
    use std::time::Instant;

    let label = e.label;
    let pgid = match i32::try_from(pid) {
        Ok(pgid) if still_ours(pid, &e) => pgid,
        // Not a group this set can prove is the helper's: signal nothing, but still reap what the
        // set owns so no zombie is left behind.
        _ => {
            if let Some(child) = e.owned.as_mut() {
                let _ = child.try_wait();
            }
            return;
        }
    };
    if let Err(err) = signal_group(pgid, libc::SIGTERM) {
        if err.raw_os_error() != Some(libc::ESRCH) {
            diag(&format!("SIGTERM to helper '{label}' failed: {err}"));
        }
    }
    let deadline = Instant::now() + grace;
    loop {
        // Reaping the owned leader as soon as it exits is safe: the group id cannot be reused
        // while any member remains, and the checks below read the group, not the leader.
        if let Some(child) = e.owned.as_mut() {
            if let Err(err) = child.try_wait() {
                diag(&format!("try_wait failed for helper '{label}': {err}"));
            }
        }
        if !crate::probe::group_alive(pid) || Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    if crate::probe::group_alive(pid) {
        if let Err(err) = kill_process_group(pgid) {
            if err.raw_os_error() != Some(libc::ESRCH) {
                diag(&format!("SIGKILL to helper '{label}' failed: {err}"));
            }
        }
    }
    if let Some(child) = e.owned.as_mut() {
        if let Err(err) = child.wait() {
            diag(&format!("wait failed for helper '{label}': {err}"));
        }
    }
}

/// Windows: the entry's Job kills the helper and every descendant it still has; without one
/// (creation failed and was logged) fall back to killing the owned child alone. Dropping the
/// entry closes the Job handle.
#[cfg(windows)]
fn terminate_entry(_pid: u32, mut e: Entry, _grace: Duration) {
    let jobbed = e.job.as_ref().is_some_and(|j| j.terminate());
    if let Some(child) = e.owned.as_mut() {
        if !jobbed {
            if let Err(err) = child.kill() {
                diag(&format!("kill failed for helper '{}': {err}", e.label));
            }
        }
        if let Err(err) = child.wait() {
            diag(&format!("wait failed for helper '{}': {err}", e.label));
        }
    }
}

#[cfg(windows)]
fn terminate_entries(mut entries: Vec<(u32, Entry)>, _grace: Duration) -> Vec<&'static str> {
    for (_, e) in entries.iter_mut() {
        // The Job kills the helper and every descendant it still has; without one (creation
        // failed and was logged) fall back to killing the helper alone.
        let jobbed = e.job.as_ref().is_some_and(|j| j.terminate());
        if let Some(child) = e.owned.as_mut() {
            if !jobbed {
                if let Err(err) = child.kill() {
                    diag(&format!("kill failed for helper '{}': {err}", e.label));
                }
            }
            if let Err(err) = child.wait() {
                diag(&format!("wait failed for helper '{}': {err}", e.label));
            }
        }
    }
    // Dropping the entries closes each Job handle.
    Vec::new()
}

/// The one app-wide set the exit path drains.
pub fn global() -> &'static ChildSet {
    static SET: OnceLock<ChildSet> = OnceLock::new();
    SET.get_or_init(ChildSet::new)
}

/// Unregisters a tokio-owned helper when dropped. Move it into the same future or task as the
/// child so it goes away exactly when the child does.
pub struct HelperGuard {
    pid: u32,
    /// Set by `ended_on_its_own`; decides release (leave the helper's descendants running) over
    /// unregister (close=kill) on drop.
    ended_on_its_own: bool,
}

impl HelperGuard {
    pub(crate) fn new(pid: u32) -> HelperGuard {
        HelperGuard {
            pid,
            ended_on_its_own: false,
        }
    }

    /// Call only when the helper's leader ended by itself (not a timeout, cancel, shutdown or
    /// kill): what it left running is then left running, as on unix. On Windows the helper's
    /// kill-on-close Job is released before it closes. Without this call the drop keeps close=kill.
    pub fn ended_on_its_own(&mut self) {
        self.ended_on_its_own = true;
    }
}

impl Drop for HelperGuard {
    fn drop(&mut self) {
        if self.ended_on_its_own {
            global().release(self.pid);
        } else {
            global().unregister(self.pid);
        }
    }
}

// `JobSlot` is `()` on unix, so a registration call passes a unit value (clippy::unit_arg).
#[cfg(all(test, unix))]
#[allow(clippy::unit_arg)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use std::io::{BufRead, BufReader};
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::Instant;

    /// A helper whose group holds one member that ignores SIGTERM; the leader execs a plain sleep.
    /// The member prints its own pid only after its `trap` is in place (an ignored signal stays
    /// ignored across `exec`), so a test that reads the line cannot signal it before the trap.
    const STUBBORN_GROUP: &str = "sh -c 'trap \"\" TERM; echo $$; exec sleep 60' & exec sleep 60";
    /// A helper whose whole group ends on SIGTERM.
    const COOPERATIVE_GROUP: &str = "sleep 60 & echo $!; wait";

    /// SIGKILLs a helper's group and its member when dropped, so a red assertion leaves no
    /// SIGTERM-ignoring sleeper behind.
    struct Sweep {
        pgid: i32,
        member: i32,
    }

    impl Drop for Sweep {
        fn drop(&mut self) {
            // SAFETY: plain SIGKILLs to a group this test created and to its member; the pgid is
            // a real, positive helper pid (> 1), never 0 or -1.
            unsafe {
                libc::kill(-self.pgid, libc::SIGKILL);
                libc::kill(self.member, libc::SIGKILL);
            }
        }
    }

    fn command(home: &FakeHome, script: &str) -> Command {
        let mut cmd = Command::new("/bin/sh");
        cmd.args(["-c", script])
            .env_clear()
            .env("PATH", "/bin:/usr/bin")
            .process_group(0)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .stdout(Stdio::piped());
        home.apply(&mut cmd);
        cmd
    }

    fn wait_dead(pid: u32, within: Duration) -> bool {
        let deadline = Instant::now() + within;
        loop {
            if !crate::probe::is_alive(pid) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    fn read_member(stdout: std::process::ChildStdout) -> i32 {
        let mut line = String::new();
        BufReader::new(stdout)
            .read_line(&mut line)
            .expect("read member pid");
        line.trim().parse().expect("member pid")
    }

    #[test]
    fn terminate_all_sigkills_an_owned_helpers_member_that_ignores_sigterm() {
        let home = FakeHome::new("gamelib-proc-children-");
        let mut child = command(&home, STUBBORN_GROUP)
            .spawn()
            .expect("spawn /bin/sh");
        let pgid = child.id() as i32;
        let member = read_member(child.stdout.take().expect("piped stdout"));
        let _sweep = Sweep { pgid, member };

        let set = ChildSet::new();
        set.register_owned("stubborn-owned", child, Default::default());
        let hard = set.terminate_all(Duration::from_millis(1500));

        assert_eq!(hard, vec!["stubborn-owned"], "the group needed SIGKILL");
        assert!(
            wait_dead(member as u32, Duration::from_secs(5)),
            "the SIGTERM-ignoring member must not outlive terminate_all"
        );
    }

    #[test]
    fn terminate_all_sigkills_a_tokio_helpers_member_that_ignores_sigterm() {
        let home = FakeHome::new("gamelib-proc-children-");
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .expect("runtime");
        // The SpecProcRunner shape: a task owns, awaits and so reaps the child; the set only holds
        // the pid.
        let (pgid, member) = rt.block_on(async {
            use tokio::io::AsyncBufReadExt;
            let mut cmd = tokio::process::Command::from(command(&home, STUBBORN_GROUP));
            let mut child = cmd.spawn().expect("spawn /bin/sh");
            let pid = child.id().expect("pid");
            let mut lines =
                tokio::io::BufReader::new(child.stdout.take().expect("piped stdout")).lines();
            let line = lines.next_line().await.expect("read").expect("member line");
            let member: i32 = line.trim().parse().expect("member pid");
            let set_pid = pid;
            // Registered below by the caller; the task reaps the leader the moment it exits.
            tokio::spawn(async move {
                let _ = child.wait().await;
            });
            (set_pid as i32, member)
        });
        let _sweep = Sweep { pgid, member };

        let set = ChildSet::new();
        set.register_pid("stubborn-tokio", pgid as u32, Default::default());
        let hard = set.terminate_all(Duration::from_millis(1500));

        assert_eq!(hard, vec!["stubborn-tokio"], "the group needed SIGKILL");
        assert!(
            wait_dead(member as u32, Duration::from_secs(5)),
            "the SIGTERM-ignoring member must not outlive terminate_all"
        );
        drop(rt);
    }

    #[test]
    fn a_cooperative_group_ends_inside_the_grace_with_no_hard_kill() {
        let home = FakeHome::new("gamelib-proc-children-");
        let mut child = command(&home, COOPERATIVE_GROUP)
            .spawn()
            .expect("spawn /bin/sh");
        let pgid = child.id() as i32;
        let member = read_member(child.stdout.take().expect("piped stdout"));
        let _sweep = Sweep { pgid, member };

        let set = ChildSet::new();
        set.register_owned("cooperative", child, Default::default());
        let started = Instant::now();
        let hard = set.terminate_all(Duration::from_secs(5));

        assert!(
            started.elapsed() < Duration::from_secs(3),
            "a group that ends on SIGTERM must not burn the grace"
        );
        assert!(hard.is_empty(), "nothing was hard-killed: {hard:?}");
        assert!(wait_dead(member as u32, Duration::from_secs(5)));
    }
}
