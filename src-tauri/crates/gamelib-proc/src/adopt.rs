//! Re-adoption identity (88.3, D-08, D-31): after a GameLib crash a game's leader is reaped by init,
//! and for a Wine or CrossOver launch it has usually exited already (Pitfall 10, the loader leaves
//! about a second in), so a bare `kill_game_tree(pid, stamp)` answers `Gone` while the game runs.
//! An [`AdoptProof`] is what GameLib keeps so the game can still be matched: the leader's pid and
//! start stamp plus the live members seen while GameLib ran ([`snapshot_members`]).
//! [`identify`] answers which part of the proof still holds; `kill_tree::kill_adopted_tree` signals
//! only after it has proved the tree again in the same call (prohibition 5).
//!
//! Flagged assumption (unix): a pid is not reissued while a process group with that id has a
//! member, so a live member with its recorded start stamp and still in group `leader_pid` proves
//! the group is the recorded game's. Windows: a tree is the game's named Game Job
//! (`Local\GameLib-Game-<pid>-<stamp>`), openable only while some process holds a handle to it.

use crate::probe;

/// A process GameLib saw in the game's tree: its pid and `probe::start_time` stamp.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Member {
    pub pid: u32,
    pub stamp: u64,
}

/// What GameLib recorded about a launched game: the leader's pid and start stamp, and the live
/// members of its tree (the leader excluded) with their stamps, taken while GameLib ran.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdoptProof {
    pub leader_pid: u32,
    pub leader_stamp: u64,
    pub members: Vec<Member>,
}

/// Which part of an [`AdoptProof`] still holds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Identity {
    /// The leader is alive with the recorded start stamp.
    Leader,
    /// The leader is gone and this recorded member is alive with its recorded stamp and still in
    /// process group `leader_pid` (unix).
    Member(u32),
    /// Windows: the leader is gone and the Game Job named for the leader's pid and stamp still
    /// holds a process.
    Job,
    /// The leader's pid is alive but with another start stamp (pid reuse). Nothing is consulted
    /// further and nothing may be signalled.
    NotOurs,
    /// Nothing the proof names is alive.
    Gone,
}

/// Answers which part of `proof` holds right now. Order: a live leader decides alone (the recorded
/// stamp is `Leader`, any other stamp is `NotOurs` and no member is consulted); otherwise the tree
/// is looked for through a recorded member (unix) or the Game Job (Windows); otherwise `Gone`.
/// It reads process facts only and signals nothing.
pub fn identify(proof: &AdoptProof) -> Identity {
    if probe::is_alive(proof.leader_pid) {
        return if probe::start_time(proof.leader_pid) == Some(proof.leader_stamp) {
            Identity::Leader
        } else {
            Identity::NotOurs
        };
    }
    identify_without_leader(proof)
}

#[cfg(unix)]
fn identify_without_leader(proof: &AdoptProof) -> Identity {
    // A pid that does not fit an i32, or is 0 or 1, is not a group this crate created.
    if !matches!(i32::try_from(proof.leader_pid), Ok(p) if p > 1) {
        return Identity::Gone;
    }
    proof
        .members
        .iter()
        .find(|m| m.pid != proof.leader_pid && member_holds(proof.leader_pid, m))
        .map_or(Identity::Gone, |m| Identity::Member(m.pid))
}

#[cfg(windows)]
fn identify_without_leader(proof: &AdoptProof) -> Identity {
    use crate::job::GameJob;
    let holds = GameJob::open(proof.leader_pid, proof.leader_stamp)
        .and_then(|job| job.active_processes())
        .is_some_and(|n| n > 0);
    if holds {
        Identity::Job
    } else {
        Identity::Gone
    }
}

#[cfg(not(any(unix, windows)))]
fn identify_without_leader(_proof: &AdoptProof) -> Identity {
    Identity::Gone
}

/// `true` while `member` is alive with its recorded start stamp and is still in process group
/// `leader_pid`: the three facts that, together, prove the group is the recorded game's. The kill
/// repeats this immediately before it signals.
#[cfg(unix)]
pub(crate) fn member_holds(leader_pid: u32, member: &Member) -> bool {
    probe::is_alive(member.pid)
        && probe::start_time(member.pid) == Some(member.stamp)
        && probe::pgid_of(member.pid) == Some(leader_pid)
}

/// The live members of a game's tree other than the leader, with their start stamps, in pid order,
/// so a caller can keep a proof that survives the leader exiting (Pitfall 10).
///
/// Unix: the non-zombie members of process group `pgid` (a game leader is its own group leader, so
/// `pgid` is `leader_pid`), through `probe::group_pids`; a member whose stamp cannot be read is
/// left out (it proves nothing). Windows has no groups, so `pgid` is ignored and the list is the
/// processes of the Game Job named for `leader_pid` and the leader's own start stamp, which is
/// readable only while the leader lives: an exited leader answers an empty list.
pub fn snapshot_members(pgid: u32, leader_pid: u32) -> Vec<Member> {
    snapshot_impl(pgid, leader_pid)
}

#[cfg(unix)]
fn snapshot_impl(pgid: u32, leader_pid: u32) -> Vec<Member> {
    let mut members: Vec<Member> = probe::group_pids(pgid)
        .into_iter()
        .filter(|&pid| pid != leader_pid)
        .filter_map(|pid| probe::start_time(pid).map(|stamp| Member { pid, stamp }))
        .collect();
    members.sort_by_key(|m| m.pid);
    members
}

#[cfg(windows)]
fn snapshot_impl(_pgid: u32, leader_pid: u32) -> Vec<Member> {
    use crate::job::GameJob;
    use windows_sys::Win32::System::SystemServices::JOB_OBJECT_QUERY;
    let Some(leader_stamp) = probe::start_time(leader_pid) else {
        return Vec::new();
    };
    let Some(pids) = GameJob::open_with_access(leader_pid, leader_stamp, JOB_OBJECT_QUERY)
        .and_then(|job| job.process_ids())
    else {
        return Vec::new();
    };
    let mut members: Vec<Member> = pids
        .into_iter()
        .filter(|&pid| pid != leader_pid)
        // `start_time` opens the process once and reads its creation time through that handle.
        .filter_map(|pid| probe::start_time(pid).map(|stamp| Member { pid, stamp }))
        .collect();
    members.sort_by_key(|m| m.pid);
    members
}

#[cfg(not(any(unix, windows)))]
fn snapshot_impl(_pgid: u32, _leader_pid: u32) -> Vec<Member> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn own_proof(stamp_offset: u64) -> AdoptProof {
        let pid = std::process::id();
        AdoptProof {
            leader_pid: pid,
            leader_stamp: probe::start_time(pid).expect("own stamp") + stamp_offset,
            members: Vec::new(),
        }
    }

    #[test]
    fn a_live_leader_with_the_recorded_stamp_is_the_leader() {
        assert_eq!(identify(&own_proof(0)), Identity::Leader);
    }

    #[test]
    fn a_live_leader_with_another_stamp_is_not_ours_and_no_member_is_consulted() {
        let mut proof = own_proof(1);
        // A member that would match on its own: the leader's verdict still comes first.
        let pid = std::process::id();
        proof.members.push(Member {
            pid,
            stamp: probe::start_time(pid).expect("own stamp"),
        });
        assert_eq!(identify(&proof), Identity::NotOurs);
    }

    #[test]
    fn nothing_alive_is_gone() {
        let mut child = if cfg!(windows) {
            let mut c = std::process::Command::new("cmd");
            c.args(["/C", "exit 0"]);
            c
        } else {
            let mut c = std::process::Command::new("/bin/sh");
            c.args(["-c", "exit 0"]);
            c
        }
        .spawn()
        .expect("spawn");
        let pid = child.id();
        child.wait().expect("reap");
        let proof = AdoptProof {
            leader_pid: pid,
            leader_stamp: 1,
            members: Vec::new(),
        };
        assert_eq!(identify(&proof), Identity::Gone);
    }

    #[cfg(unix)]
    #[test]
    fn the_pgids_that_are_never_ours_are_gone_whatever_the_members_say() {
        let pid = std::process::id();
        let stamp = probe::start_time(pid).expect("own stamp");
        for bad in [0u32, 1] {
            let proof = AdoptProof {
                leader_pid: bad,
                leader_stamp: u64::MAX,
                members: vec![Member { pid, stamp }],
            };
            // pid 0/1 may be alive (launchd, init): then the stamp is what refuses it.
            assert!(
                matches!(identify(&proof), Identity::Gone | Identity::NotOurs),
                "leader pid {bad}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn snapshot_members_lists_the_group_without_the_leader_in_pid_order() {
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};
        // A group of two live processes: the leader (`sh`) and its background `sleep`.
        let mut leader = Command::new("/bin/sh")
            .args(["-c", "sleep 30 & wait"])
            .process_group(0)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn /bin/sh");
        let pgid = leader.id();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let members = loop {
            let m = snapshot_members(pgid, pgid);
            if !m.is_empty() {
                break m;
            }
            assert!(std::time::Instant::now() < deadline, "no member appeared");
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        assert!(
            members.iter().all(|m| m.pid != pgid),
            "the leader is left out"
        );
        assert!(members.windows(2).all(|w| w[0].pid < w[1].pid), "pid order");
        for m in &members {
            assert_eq!(probe::start_time(m.pid), Some(m.stamp));
            assert_eq!(probe::pgid_of(m.pid), Some(pgid));
        }
        crate::kill_tree::kill_process_group(pgid as i32).expect("kill the group");
        leader.wait().expect("reap");
    }
}
