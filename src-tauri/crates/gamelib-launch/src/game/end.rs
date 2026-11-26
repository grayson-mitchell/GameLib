//! When a game run is over (D-05). `close`, the default, is the TS's resolve on stdio close: the leader has
//! exited and so has everything in its process group (unix) or Game Job (Windows). `exit` is the leader
//! plus the TS's drain grace.
//!
//! The leader is watched by polling `probe::is_alive`, not by a blocking `waitid`: a wait that holds the
//! handle would stand in the way of a kill through the registry (88.2-11), which needs the same handle
//! while the run is still waiting. The leader stays unreaped (nothing waits on it) until the run reaps
//! it below, so its pid, and its group id, cannot be recycled in the meantime.

use std::process::ExitStatus;
use std::time::Duration;

use gamelib_proc::probe;
use tokio_util::sync::CancellationToken;

use super::registry::SharedGame;

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

/// Waits for `end` and reaps the leader. Returns [`Ended::Shutdown`] the moment `shutdown` fires, never
/// having signalled anything.
pub async fn wait_end(game: &SharedGame, end: GameEnd, shutdown: &CancellationToken) -> Ended {
    let pid = lock(game).pid;
    while probe::is_alive(pid) {
        if cancelled_during(shutdown, LEADER_POLL).await {
            return Ended::Shutdown;
        }
    }
    match end {
        GameEnd::Close => {
            while lock(game).group_alive() {
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
    // The leader has exited, so this returns at once.
    Ended::Finished(lock(game).reap_status().ok())
}

/// Sleeps `period`; true when `shutdown` fired first.
async fn cancelled_during(shutdown: &CancellationToken, period: Duration) -> bool {
    tokio::select! {
        biased;
        _ = shutdown.cancelled() => true,
        _ = tokio::time::sleep(period) => false,
    }
}

fn lock(game: &SharedGame) -> std::sync::MutexGuard<'_, gamelib_proc::GameHandle> {
    game.lock().unwrap_or_else(|e| e.into_inner())
}
