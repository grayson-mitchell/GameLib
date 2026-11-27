//! When a game run is over (D-05). `close`, the default, is the TS's resolve on stdio close: the leader has
//! exited and so has everything in its process group (unix) or Game Job (Windows). `exit` is the leader
//! plus the TS's drain grace.
//!
//! The leader is watched by polling `probe::is_alive`, not by a blocking `waitid`: a wait that holds the
//! handle would stand in the way of a kill through the registry (88.2-11), which needs the same handle
//! while the run is still waiting. The leader stays unreaped (nothing waits on it) until the run reaps
//! it below, so its pid, and its group id, cannot be recycled in the meantime.
//!
//! The run never waits on the handle's std `Mutex` inside the async fn (88.2-26, WR-02): a registry kill
//! holds that lock for its whole kill (D-27, up to the child grace), and a blocking `lock` here would park a
//! tokio worker for that long, with a shutdown unanswered. A busy handle reads as "still running", and the
//! run sleeps one poll period through `cancelled_during` and tries again.

use std::process::ExitStatus;
use std::time::Duration;

use gamelib_proc::probe;
use tokio_util::sync::CancellationToken;

use std::sync::atomic::Ordering;

use super::registry::GameEntry;

/// How often the leader's liveness is looked at.
pub const LEADER_POLL: Duration = Duration::from_millis(100);

/// How often the group's liveness is looked at after the leader has gone.
pub const GROUP_POLL: Duration = Duration::from_millis(250);

/// The TS `DRAIN_GRACE_MS` of `process/runner.ts`: how long after the leader's exit the pipes were given
/// when a run resolved on exit.
pub const EXIT_DRAIN_GRACE: Duration = Duration::from_millis(250);

/// When a game run resolves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GameEnd {
    /// The leader and its whole group have ended.
    #[default]
    Close,
    /// The leader has ended, and the drain grace has passed.
    Exit,
}

/// How a wait for the end of a game run finished.
#[derive(Debug)]
pub enum Ended {
    /// The game is over and its leader reaped; `None` when the leader's status could not be read.
    Finished(Option<ExitStatus>),
    /// The shutdown token fired first. Nothing was signalled: the game keeps running.
    Shutdown,
}

/// Waits for `end` and reaps the leader. Returns [`Ended::Shutdown`] the moment `shutdown` fires (within
/// one poll period when a kill holds the handle), never having signalled anything. The handle is only ever
/// taken with `try_lock`: a busy handle (a kill is ending the tree) reads as still running and is tried
/// again one poll period later, so no std lock is waited on inside this async fn. The reap marks the entry
/// `ended` under the handle's lock, so a kill through the registry never signals a group whose leader this
/// run has reaped.
pub async fn wait_end(entry: &GameEntry, end: GameEnd, shutdown: &CancellationToken) -> Ended {
    wait_end_observed(entry, end, shutdown, &mut || {}).await
}

/// [`wait_end`] with an observer (88.3-07, Pitfall 10): `on_group_alive` is called each time the leader is gone
/// and the group still lives (once right after the leader's exit, then every [`GROUP_POLL`]), so the caller can
/// keep a proof of the members of a tree whose leader has already left (the Wine loader). It runs on this
/// task, so it must be short and bounded; the launch record's rewrite is (it writes only when the member set
/// changed).
pub async fn wait_end_observed(
    entry: &GameEntry,
    end: GameEnd,
    shutdown: &CancellationToken,
    on_group_alive: &mut (dyn FnMut() + Send),
) -> Ended {
    let game = &entry.handle;
    let pid = entry.pid;
    while probe::is_alive(pid) {
        if cancelled_during(shutdown, LEADER_POLL).await {
            return Ended::Shutdown;
        }
    }
    match end {
        GameEnd::Close => {
            // A busy handle is a kill in progress: the tree is still being ended, so it reads as alive.
            while try_lock_game(game).map_or(true, |handle| handle.group_alive()) {
                on_group_alive();
                if cancelled_during(shutdown, GROUP_POLL).await {
                    return Ended::Shutdown;
                }
            }
        }
        GameEnd::Exit => {
            if cancelled_during(shutdown, EXIT_DRAIN_GRACE).await {
                return Ended::Shutdown;
            }
        }
    }
    // The leader has exited, so the reap returns at once once the handle is free.
    loop {
        if let Some(mut handle) = try_lock_game(game) {
            let status = handle.reap_status().ok();
            entry.ended.store(true, Ordering::SeqCst);
            return Ended::Finished(status);
        }
        if cancelled_during(shutdown, LEADER_POLL).await {
            return Ended::Shutdown;
        }
    }
}

/// Sleeps `period`; true when `shutdown` fired first.
async fn cancelled_during(shutdown: &CancellationToken, period: Duration) -> bool {
    tokio::select! {
        biased;
        _ = shutdown.cancelled() => true,
        _ = tokio::time::sleep(period) => false,
    }
}

/// The handle's guard, or `None` while it is busy (a registry kill holds it for its whole kill). A poisoned
/// lock yields its inner guard, as the registry's `lock` does.
fn try_lock_game(
    game: &super::registry::SharedGame,
) -> Option<std::sync::MutexGuard<'_, gamelib_proc::GameHandle>> {
    match game.try_lock() {
        Ok(guard) => Some(guard),
        Err(std::sync::TryLockError::Poisoned(e)) => Some(e.into_inner()),
        Err(std::sync::TryLockError::WouldBlock) => None,
    }
}
