//! Process-tree termination. Unix signals process groups. Windows has no group signal; its helper
//! tree kill is the per-helper Job Object in `job.rs`, and its stamp-checked game tree kill
//! (`kill_game_tree`) terminates the game's named Game Job, or, once that name is gone, the
//! stamped leader and its parent-linked descendants, so only that function lives here.
//! With `job.rs`, this is where `TerminateProcess` is called.
//!
//! `kill_adopted_tree` is the re-adoption kill (88.3, D-31): it takes an `adopt::AdoptProof`,
//! proves the tree again with `adopt::identify`, and only then signals.

use crate::adopt::{self, AdoptProof, Identity};
use std::time::Duration;

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
#[cfg(all(windows, feature = "harness"))]
pub use win::harness_kill_game_tree_query_only_job;
#[cfg(windows)]
pub use win::kill_game_tree;

/// Kills the tree of a game GameLib recorded as an [`AdoptProof`], for a game GameLib holds no
/// `Child` for and whose leader may already have exited (a Wine or CrossOver launcher, Pitfall 10).
///
/// Prohibition 5 at the mechanism: `adopt::identify` runs first and nothing is signalled for
/// `NotOurs` or `Gone`. A live leader with the recorded stamp is ended by `kill_game_tree`, which
/// proves the stamp again itself. A recorded member that proved the group is checked a second time
/// (alive, recorded stamp, still in group `leader_pid`) immediately before the group is signalled,
/// through the existing `terminate_known_group` and its pgid <= 1 refusal. On Windows the Game Job
/// named for the leader's pid and stamp is checked to hold a process and terminated through
/// `GameJob::terminate`; a Job whose terminate is refused answers `NotOurs` (nothing signalled).
pub fn kill_adopted_tree(proof: &AdoptProof, grace: Duration) -> KillOutcome {
    match adopt::identify(proof) {
        Identity::Leader => kill_game_tree(proof.leader_pid, proof.leader_stamp, grace),
        Identity::Member(pid) => kill_adopted_member(proof, pid, grace),
        Identity::Job => kill_adopted_job(proof, grace),
        Identity::NotOurs => KillOutcome::NotOurs,
        Identity::Gone => KillOutcome::Gone,
    }
}

#[cfg(unix)]
fn kill_adopted_member(proof: &AdoptProof, pid: u32, grace: Duration) -> KillOutcome {
    unix::kill_adopted_member(proof, pid, grace)
}

#[cfg(not(unix))]
fn kill_adopted_member(_proof: &AdoptProof, _pid: u32, _grace: Duration) -> KillOutcome {
    // Windows has no process groups: a member proof is never produced there.
    KillOutcome::Gone
}

#[cfg(windows)]
fn kill_adopted_job(proof: &AdoptProof, grace: Duration) -> KillOutcome {
    win::kill_adopted_job(proof, grace)
}

#[cfg(not(windows))]
fn kill_adopted_job(_proof: &AdoptProof, _grace: Duration) -> KillOutcome {
    // Only Windows has a Game Job: a Job proof is never produced elsewhere.
    KillOutcome::Gone
}

/// What one candidate child's own handle reports, as `select_tree` needs it. Every field is an
/// `Option` because every read can fail, and a read that failed proves nothing.
#[derive(Clone, Copy, Debug)]
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) struct ChildFacts {
    /// Creation time, as `probe::creation_time` reads it.
    pub created: Option<u64>,
    /// Whether the process is still running (`probe::handle_exited`, inverted).
    pub running: Option<bool>,
    /// The pid the process itself names as its parent
    /// (`NtQueryInformationProcess(ProcessBasicInformation)`), not the snapshot's claim.
    pub parent: Option<u32>,
}

/// The selection rule of the Windows stamped-tree walk, with no OS call in it so every platform
/// compiles and tests it. Starting from the root (`root_pid`, created at `root_created`, both
/// proven by the caller through a handle it holds), it follows `table`, the `(pid, parent pid)`
/// pairs of a process snapshot, breadth first. For each accepted node every entry naming it as
/// parent is passed to `open`, which answers the handle and the child's own `ChildFacts`.
///
/// A child is accepted only when all three hold:
/// - it is not older than its accepted parent. This rejects children of an older incarnation of
///   a parent pid. It cannot reject a pid recycled between the snapshot and `open`, because a
///   recycled pid is always newer;
/// - it is still running;
/// - its own handle names the accepted parent's pid as its parent. This is the check that rejects
///   a child pid recycled between the snapshot and `open`: the unrelated process now holding the
///   pid has a different parent. A parent query that failed is `None` and rejects the child
///   (fail closed).
///
/// The handles of every accepted node are returned and so held by the caller from the check to
/// the terminate, which keeps each accepted parent's pid from being reassigned while its children
/// are checked. Entries with pid 0, an entry naming itself as its parent, and any pid already
/// accepted (the root included) are never passed to `open`. The answer is the accepted
/// descendants' handles in acceptance order, the root excluded.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn select_tree<H>(
    root_pid: u32,
    root_created: u64,
    table: &[(u32, u32)],
    mut open: impl FnMut(u32) -> Option<(H, ChildFacts)>,
) -> Vec<H> {
    // (pid, creation time) of every node accepted so far, root first. The root comes only from
    // the arguments: nothing here re-seeds it from a bare pid.
    let mut accepted: Vec<(u32, u64)> = vec![(root_pid, root_created)];
    let mut held: Vec<H> = Vec::new();
    let mut next = 0;
    while next < accepted.len() {
        let (parent_pid, parent_created) = accepted[next];
        next += 1;
        for &(child_pid, ppid) in table {
            if ppid != parent_pid
                || child_pid == 0
                || child_pid == ppid
                || accepted.iter().any(|(seen, _)| *seen == child_pid)
            {
                continue;
            }
            let Some((handle, facts)) = open(child_pid) else {
                continue;
            };
            let Some(created) = facts.created else {
                continue;
            };
            if created < parent_created
                || facts.running != Some(true)
                || facts.parent != Some(parent_pid)
            {
                continue;
            }
            accepted.push((child_pid, created));
            held.push(handle);
        }
    }
    held
}

#[cfg(windows)]
mod win {
    use super::{select_tree, ChildFacts, KillOutcome};
    use crate::diag::diag;
    use crate::job::GameJob;
    use crate::probe;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use std::time::{Duration, Instant};
    use windows_sys::Wdk::System::Threading::{NtQueryInformationProcess, ProcessBasicInformation};
    use windows_sys::Win32::Foundation::{
        GetLastError, ERROR_INVALID_PARAMETER, HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::SystemServices::{JOB_OBJECT_QUERY, JOB_OBJECT_TERMINATE};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_BASIC_INFORMATION,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
    };

    /// How long a terminated tree gets to end before the kill stops waiting for it. `grace`
    /// capped at this is the one deadline every wait of a single `kill_game_tree` call shares.
    const TERMINATE_SETTLE: Duration = Duration::from_secs(1);

    /// The rights every handle this walk holds carries. `PROCESS_SYNCHRONIZE` is what makes
    /// `WaitForSingleObject` (and so `probe::handle_exited`) answer instead of failing.
    const WALK_RIGHTS: u32 =
        PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE;

    /// The recorded leader, proven once and then held. The handle was opened for the pid, the
    /// process behind it was read as running, and its creation time was read through that same
    /// handle and found equal to the recorded stamp. While a `Leader` exists its pid cannot be
    /// reassigned, so everything done through it (the Job arm, the descendant walk, the
    /// terminate) is done to the process the stamp named. Only `open_verified_leader` builds one.
    struct Leader {
        pid: u32,
        stamp: u64,
        handle: OwnedHandle,
    }

    /// What `open_verified_leader` found.
    enum Pin {
        /// The leader is running and has the recorded stamp; the handle is held.
        Pinned(Leader),
        /// The leader is not alive. Nothing was signalled.
        Gone,
        /// The pid cannot be proven to be the recorded leader (a different stamp, or a read that
        /// failed). Nothing was signalled.
        NotOurs,
    }

    /// How terminating the held leader ended.
    #[derive(Debug, PartialEq, Eq)]
    enum Ended {
        /// TerminateProcess succeeded.
        Terminated,
        /// TerminateProcess failed because the leader had already exited on its own.
        ExitedOnItsOwn,
        /// TerminateProcess failed and the leader is still running (access refused).
        Refused,
    }

    /// Opens `pid` and proves it is the recorded leader. Liveness is judged before the stamp (the
    /// unix order), so an exited leader is `Gone` whatever its stamp says.
    fn open_verified_leader(pid: u32, stamp: u64) -> Pin {
        // SAFETY: OpenProcess takes plain values and returns null on failure.
        let raw = unsafe { OpenProcess(WALK_RIGHTS, 0, pid) };
        if raw.is_null() {
            // SAFETY: GetLastError has no preconditions.
            let err = unsafe { GetLastError() };
            if err == ERROR_INVALID_PARAMETER {
                return Pin::Gone;
            }
            diag(&format!("game leader: OpenProcess failed (error {err})"));
            return Pin::NotOurs;
        }
        // SAFETY: `raw` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
        let handle = unsafe { OwnedHandle::from_raw_handle(raw as _) };
        match probe::handle_exited(handle.as_raw_handle() as _) {
            Some(true) => return Pin::Gone,
            Some(false) => {}
            None => {
                diag("game leader: liveness could not be read; not terminating");
                return Pin::NotOurs;
            }
        }
        if probe::creation_time(handle.as_raw_handle() as _) != Some(stamp) {
            return Pin::NotOurs;
        }
        Pin::Pinned(Leader { pid, stamp, handle })
    }

    impl Leader {
        fn raw(&self) -> HANDLE {
            self.handle.as_raw_handle() as _
        }

        /// Waits for the leader to exit, no longer than `deadline`. `true` when it has exited.
        fn wait_until(&self, deadline: Instant) -> bool {
            wait_until(self.raw(), deadline)
        }

        /// Terminates the leader through the held handle.
        fn terminate(&self) -> Ended {
            // SAFETY: `self.handle` is a valid process handle with terminate rights.
            if unsafe { TerminateProcess(self.raw(), 1) } != 0 {
                return Ended::Terminated;
            }
            // SAFETY: GetLastError has no preconditions.
            let err = unsafe { GetLastError() };
            if probe::handle_exited(self.raw()) == Some(true) {
                return Ended::ExitedOnItsOwn;
            }
            diag(&format!(
                "game leader: TerminateProcess failed (error {err})"
            ));
            Ended::Refused
        }
    }

    /// Waits on `handle` until it is signalled or `deadline` passes. `true` when it is signalled.
    fn wait_until(handle: HANDLE, deadline: Instant) -> bool {
        let left = deadline.saturating_duration_since(Instant::now());
        let wait_ms = u32::try_from(left.as_millis()).unwrap_or(0);
        // SAFETY: a valid handle opened with `SYNCHRONIZE`; a process handle is signalled on exit.
        unsafe { WaitForSingleObject(handle, wait_ms) == WAIT_OBJECT_0 }
    }

    /// Kills the tree of a game GameLib recorded as `pid` plus start `stamp` (`probe::start_time`
    /// at spawn), for the case where GameLib holds no `Child` for it (re-adoption after a
    /// restart, quit-kill).
    ///
    /// Prohibition 5 at the mechanism. The leader is opened once, at the top, and its identity is
    /// proven through that handle (running, and creation time equal to `stamp`); the handle is
    /// held through the Job arm and the whole descendant walk, so the pid cannot be reassigned
    /// while anything is collected or terminated, and nothing re-seeds the root from a bare pid.
    /// Descendants are taken only by `select_tree`, on handles held from the check to the
    /// terminate. `Gone` when the leader is not alive and nothing was terminated, `NotOurs` when
    /// the stamp differs or the leader is running but refuses termination (nothing signalled).
    /// Windows has no graceful signal, so `grace` (capped at `TERMINATE_SETTLE`) is the one
    /// deadline that bounds every wait of the call.
    ///
    /// When no Game Job of that name can be opened (the process that created it is gone, which
    /// removes the name, or it was never created) the tree is found by parentage instead
    /// (`terminate_stamped_tree`) and the line `game job not found; walking the descendants of the
    /// stamped leader` is logged.
    pub fn kill_game_tree(pid: u32, stamp: u64, grace: Duration) -> KillOutcome {
        kill_with_job_access(pid, stamp, grace, JOB_OBJECT_TERMINATE | JOB_OBJECT_QUERY)
    }

    /// Test seam, compiled only with the `harness` feature (enabled by this crate's own
    /// dev-dependency, never by the shell): `kill_game_tree` with the Game Job opened with query
    /// rights only, so the Job's terminate is refused and the kill must fall back to the walk.
    #[cfg(feature = "harness")]
    pub fn harness_kill_game_tree_query_only_job(
        pid: u32,
        stamp: u64,
        grace: Duration,
    ) -> KillOutcome {
        kill_with_job_access(pid, stamp, grace, JOB_OBJECT_QUERY)
    }

    /// The body of `kill_game_tree`, with the access mask the Game Job is opened with.
    ///
    /// The Job arm answers `Killed` only when the Job's terminate succeeded and the held leader is
    /// signalled by the end of the settle wait. A Job whose terminate failed, or a Job of that name
    /// that does not hold the leader (an empty one squatting the name terminates "successfully"
    /// and reports no active processes), did not end the leader: the kill logs `game job did not
    /// end the stamped leader; walking the descendants of the stamped leader` and walks instead.
    fn kill_with_job_access(pid: u32, stamp: u64, grace: Duration, job_access: u32) -> KillOutcome {
        let leader = match open_verified_leader(pid, stamp) {
            Pin::Pinned(leader) => leader,
            Pin::Gone => return KillOutcome::Gone,
            Pin::NotOurs => return KillOutcome::NotOurs,
        };
        let deadline = Instant::now() + grace.min(TERMINATE_SETTLE);
        match GameJob::open_with_access(pid, stamp, job_access) {
            Some(job) => {
                if job.terminate() {
                    while Instant::now() < deadline && job.active_processes().is_some_and(|n| n > 0)
                    {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                    if leader.wait_until(deadline) {
                        return KillOutcome::Killed;
                    }
                }
                diag("game job did not end the stamped leader; walking the descendants of the stamped leader");
                terminate_stamped_tree(&leader, deadline)
            }
            None => {
                diag("game job not found; walking the descendants of the stamped leader");
                terminate_stamped_tree(&leader, deadline)
            }
        }
    }

    /// The Job arm of `kill_adopted_tree`: the Game Job named for the leader's pid and stamp is
    /// opened again and must still hold a process, then it is terminated and given `grace` (capped
    /// at `TERMINATE_SETTLE`) to empty. `Gone` when no such Job opens or it holds nothing (an empty
    /// squatter included: nothing is terminated); `NotOurs` when the terminate is refused.
    pub fn kill_adopted_job(proof: &crate::adopt::AdoptProof, grace: Duration) -> KillOutcome {
        let Some(job) = GameJob::open(proof.leader_pid, proof.leader_stamp) else {
            return KillOutcome::Gone;
        };
        if !matches!(job.active_processes(), Some(n) if n > 0) {
            return KillOutcome::Gone;
        }
        if !job.terminate() {
            return KillOutcome::NotOurs;
        }
        let deadline = Instant::now() + grace.min(TERMINATE_SETTLE);
        while Instant::now() < deadline && job.active_processes().is_some_and(|n| n > 0) {
            std::thread::sleep(Duration::from_millis(20));
        }
        KillOutcome::Killed
    }

    /// How many times the descendant walk repeats to catch a process the tree started while it
    /// was being terminated.
    const WALK_PASSES: usize = 3;

    /// The fallback when the named Game Job cannot be reopened. A named Job's name is removed from
    /// the object namespace once its last handle closes, even while members run, so after the
    /// process that created it is gone (a GameLib restart, or its death) the name is dead and the
    /// tree has to be found by parentage instead.
    ///
    /// The tree is what `select_tree` accepts from `leader`: every live process reachable through
    /// parent pids that is no older than its parent and whose own handle names that parent. The
    /// `leader` is held for the whole call, so the root pid is never reassigned and never
    /// re-seeded from a bare pid, and every accepted descendant is held as an open handle from the
    /// check to the terminate. The descendants are collected before the leader is terminated,
    /// while the parent links are intact, and the walk repeats (`WALK_PASSES`) for anything
    /// started in the gap. Unlike a Job this does not follow a process that was reparented away
    /// or whose parent died and whose pid was reused.
    ///
    /// A leader that refuses termination while still running answers `NotOurs` before any
    /// descendant is terminated. `Killed` when the leader was terminated or any descendant's
    /// terminate succeeded, otherwise `Gone` (the leader ended on its own and left nothing).
    fn terminate_stamped_tree(leader: &Leader, deadline: Instant) -> KillOutcome {
        let mut batch = collect_descendants(leader);
        let mut signalled = match leader.terminate() {
            Ended::Refused => return KillOutcome::NotOurs,
            Ended::Terminated => true,
            Ended::ExitedOnItsOwn => false,
        };
        leader.wait_until(deadline);
        for _ in 0..WALK_PASSES {
            if batch.is_empty() {
                break;
            }
            for member in &batch {
                // SAFETY: `member` holds a valid process handle opened with terminate rights; a
                // process that already ended makes this fail, which is not a signal.
                if unsafe { TerminateProcess(member.as_raw_handle() as _, 1) } != 0 {
                    signalled = true;
                }
            }
            for member in &batch {
                wait_until(member.as_raw_handle() as _, deadline);
            }
            batch = collect_descendants(leader);
        }
        if signalled {
            KillOutcome::Killed
        } else {
            KillOutcome::Gone
        }
    }

    /// Open handles (`WALK_RIGHTS`) to every descendant of the held `leader` that `select_tree`
    /// accepts. Empty when the snapshot cannot be taken.
    fn collect_descendants(leader: &Leader) -> Vec<OwnedHandle> {
        let Some(table) = process_table() else {
            return Vec::new();
        };
        select_tree(leader.pid, leader.stamp, &table, |child_pid| {
            // SAFETY: OpenProcess takes plain values and returns null on failure.
            let raw = unsafe { OpenProcess(WALK_RIGHTS, 0, child_pid) };
            if raw.is_null() {
                return None;
            }
            // SAFETY: `raw` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
            let handle = unsafe { OwnedHandle::from_raw_handle(raw as _) };
            let h = handle.as_raw_handle() as HANDLE;
            let facts = ChildFacts {
                created: probe::creation_time(h),
                running: probe::handle_exited(h).map(|exited| !exited),
                parent: parent_pid_of(h),
            };
            Some((handle, facts))
        })
    }

    /// The pid the process behind `handle` names as its parent, read through the handle with
    /// `NtQueryInformationProcess`. `None` when the query fails.
    fn parent_pid_of(handle: HANDLE) -> Option<u32> {
        // SAFETY: the struct is plain-old-data; all-zero is a valid value.
        let mut info: PROCESS_BASIC_INFORMATION = unsafe { std::mem::zeroed() };
        // SAFETY: a valid process handle with query rights; the pointer and size describe `info`,
        // which outlives the call; the returned length is not needed.
        let status = unsafe {
            NtQueryInformationProcess(
                handle,
                ProcessBasicInformation,
                &mut info as *mut _ as *mut core::ffi::c_void,
                std::mem::size_of::<PROCESS_BASIC_INFORMATION>() as u32,
                std::ptr::null_mut(),
            )
        };
        if status < 0 {
            return None;
        }
        u32::try_from(info.InheritedFromUniqueProcessId).ok()
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

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::process::{Command, Stdio};

        #[test]
        fn kill_game_tree_on_a_reaped_pid_is_gone_and_signals_nothing() {
            let mut child = Command::new("cmd")
                .args(["/C", "exit 0"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn cmd");
            let pid = child.id();
            child.wait().expect("wait");
            // The std Child still holds its handle, so the pid cannot have been reused and the
            // open succeeds: the exited check, before the stamp check, is what answers Gone.
            assert_eq!(
                kill_game_tree(pid, 1, Duration::from_millis(100)),
                KillOutcome::Gone
            );
        }
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

    /// The member arm of `kill_adopted_tree`: `pid` is the recorded member `identify` proved. The
    /// proof is repeated here, immediately before the signal (alive, recorded stamp, still in group
    /// `leader_pid`), and the group is then ended through `terminate_known_group`, which refuses
    /// `pgid <= 1` and answers `Gone` for an empty group. The group cannot have been recycled while
    /// the proven member lives.
    pub(crate) fn kill_adopted_member(
        proof: &crate::adopt::AdoptProof,
        pid: u32,
        grace: Duration,
    ) -> KillOutcome {
        let Some(member) = proof.members.iter().find(|m| m.pid == pid) else {
            return KillOutcome::Gone;
        };
        if !crate::adopt::member_holds(proof.leader_pid, member) {
            return KillOutcome::Gone;
        }
        match i32::try_from(proof.leader_pid) {
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

#[cfg(test)]
mod selection_tests {
    use super::{select_tree, ChildFacts};
    use std::collections::HashMap;

    /// Facts a fake open answers per pid; a pid missing from the map cannot be opened.
    fn facts(created: u64, running: bool, parent: Option<u32>) -> ChildFacts {
        ChildFacts {
            created: Some(created),
            running: Some(running),
            parent,
        }
    }

    /// Runs `select_tree` over `table` with root 100 created at 1000. Returns the accepted pids
    /// and every pid the open closure was asked for.
    fn run(table: &[(u32, u32)], known: HashMap<u32, ChildFacts>) -> (Vec<u32>, Vec<u32>) {
        let mut asked = Vec::new();
        let taken = select_tree(100, 1000, table, |pid| {
            asked.push(pid);
            known.get(&pid).map(|f| (pid, *f))
        });
        (taken, asked)
    }

    #[test]
    fn the_tree_is_followed_through_live_descendants_only() {
        let table = [(101, 100), (102, 101), (103, 100), (104, 103)];
        let known = HashMap::from([
            (101, facts(1001, true, Some(100))),
            (102, facts(1002, true, Some(101))),
            (103, facts(1003, false, Some(100))),
            (104, facts(1004, true, Some(103))),
        ]);
        let (taken, asked) = run(&table, known);
        assert_eq!(taken, vec![101, 102]);
        assert!(
            !asked.contains(&104),
            "a child of a rejected node is never opened"
        );
    }

    #[test]
    fn a_child_whose_real_parent_differs_is_never_taken() {
        // Listed under 100 in the snapshot, but the pid was recycled before the open: its own
        // handle names another parent. A recycled pid is always newer, so age cannot catch it.
        let table = [(105, 100), (106, 100)];
        let known = HashMap::from([
            (105, facts(1500, true, Some(777))),
            (106, facts(1500, true, None)),
        ]);
        let (taken, _) = run(&table, known);
        assert!(taken.is_empty(), "{taken:?}");
    }

    #[test]
    fn an_older_child_of_a_recycled_parent_pid_is_never_taken() {
        let table = [(106, 100)];
        let known = HashMap::from([(106, facts(999, true, Some(100)))]);
        let (taken, _) = run(&table, known);
        assert!(taken.is_empty(), "{taken:?}");
    }

    #[test]
    fn a_child_with_unknown_age_or_liveness_is_never_taken() {
        let table = [(107, 100), (108, 100)];
        let known = HashMap::from([
            (
                107,
                ChildFacts {
                    created: None,
                    running: Some(true),
                    parent: Some(100),
                },
            ),
            (
                108,
                ChildFacts {
                    created: Some(1100),
                    running: None,
                    parent: Some(100),
                },
            ),
        ]);
        let (taken, _) = run(&table, known);
        assert!(taken.is_empty(), "{taken:?}");
    }

    #[test]
    fn unrelated_and_degenerate_entries_are_never_opened() {
        // pid 0, a self-parented entry, the root named as a child, and a bystander under 999.
        let table = [(0, 100), (110, 110), (100, 100), (120, 999), (130, 100)];
        let known = HashMap::from([
            (110, facts(1100, true, Some(110))),
            (120, facts(1100, true, Some(999))),
            // 130 cannot be opened.
        ]);
        let (taken, asked) = run(&table, known);
        assert!(taken.is_empty(), "{taken:?}");
        assert_eq!(asked, vec![130], "only the real child entry reaches open");
    }
}
