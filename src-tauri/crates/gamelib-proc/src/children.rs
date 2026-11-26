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
    /// is dropped). Nothing on other platforms.
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
    /// Unix: SIGTERM to each helper's group, wait up to `grace` for every leader, SIGKILL the
    /// groups whose leader is still alive, then reap the children this set owns. Returns the
    /// labels that needed the hard kill. Only groups this crate created with `process_group(0)`
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
        Some(s) => crate::probe::start_time(pid) == Some(s),
        None => crate::probe::is_alive(pid),
    }
}

#[cfg(unix)]
fn exited(pid: u32, e: &mut Entry) -> bool {
    match e.owned.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(_)) => true,
            Ok(None) => false,
            Err(err) => {
                diag(&format!("try_wait failed for helper '{}': {err}", e.label));
                true
            }
        },
        None => !crate::probe::is_alive(pid),
    }
}

#[cfg(unix)]
fn terminate_entries(mut entries: Vec<(u32, Entry)>, grace: Duration) -> Vec<&'static str> {
    use crate::kill_tree::signal_group;
    use std::time::Instant;

    for (pid, e) in &entries {
        if !still_ours(*pid, e) {
            continue;
        }
        if let Ok(pgid) = i32::try_from(*pid) {
            if let Err(err) = signal_group(pgid, libc::SIGTERM) {
                if err.raw_os_error() != Some(libc::ESRCH) {
                    diag(&format!("SIGTERM to helper '{}' failed: {err}", e.label));
                }
            }
        }
    }

    let deadline = Instant::now() + grace;
    let mut pending: Vec<usize> = (0..entries.len()).collect();
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
        hard_killed.push(e.label);
        if !still_ours(*pid, e) {
            continue;
        }
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
}

impl HelperGuard {
    pub(crate) fn new(pid: u32) -> HelperGuard {
        HelperGuard { pid }
    }
}

impl Drop for HelperGuard {
    fn drop(&mut self) {
        global().unregister(self.pid);
    }
}
