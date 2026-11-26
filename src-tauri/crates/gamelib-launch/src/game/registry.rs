//! The tracked registry (D-07): every runner call that spawned a process GameLib must be able to find again
//! is registered under `{ runner, key }` while it runs and unregistered when it ends. A game entry holds the
//! run's `GameHandle` and is what `games_running` reads; a helper entry holds the run's cancel token.
//!
//! The handle is shared (`Arc<Mutex<GameHandle>>`): the run that owns the game watches it without holding
//! the lock across a wait, so a kill through the registry can take the lock and end the tree while the run
//! is still waiting.
//!
//! Kills (D-06 as amended by D-27, prohibition 5): a game is ended only through its own
//! `GameHandle::kill_tree`, whose leader stays unreaped until the run reaps it under the same lock, and
//! never once the run has reaped it (the pid and its group id could be anyone's by then). A helper is ended
//! through its run's cancel token, which the spec runner answers by ending the child's group through the
//! child it owns. A run ended by a kill reads as a cancellation (`killed_by_us`, the TS `killedByUs`).

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use gamelib_core::shutdown::{ExitBudget, Shutdown};
use gamelib_proc::{GameHandle, KillOutcome};
use tokio_util::sync::CancellationToken;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// How long a quit-kill (or any registry kill) gives a game tree between SIGTERM and SIGKILL (D-16).
pub const KILL_GRACE: Duration = ExitBudget::DEFAULT.child_grace;

/// How much longer than [`KILL_GRACE`] a kill waits for the killers to report, so one that is stuck cannot
/// hold the quit.
const KILL_SLACK: Duration = Duration::from_millis(500);

/// A game's handle as the registry and the run that owns it share it.
pub type SharedGame = Arc<Mutex<GameHandle>>;

/// One registration. Unique per registration within a registry, so two runs under one key (single flight
/// is the TS's until 88.3) never unregister each other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EntryId(pub u64);

/// What a run is known by. A kill filter and the ops that end a run read these.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunIds {
    /// The runner's name as the renderer spells it (`gog`, `legendary`, ...).
    pub runner: String,
    /// The key the caller tracks the run under (its `trackKey`, or its abort id).
    pub key: String,
    /// The abort id the run answers to (`launch_runner_abort`).
    pub abort_id: String,
    /// The stream id of a call that watches the stream; empty when it has none (`launch_runner_kill`).
    pub stream_id: String,
}

/// A registered game run.
#[derive(Clone)]
pub struct GameEntry {
    pub id: EntryId,
    pub ids: RunIds,
    /// The game leader's pid.
    pub pid: u32,
    /// The leader's start stamp read at spawn (`None` when it had already exited).
    pub stamp: Option<u64>,
    /// When the run registered, in the context clock's milliseconds.
    pub started_at: u64,
    pub handle: SharedGame,
    /// Set (under the handle's lock) by a kill that ended the tree, read by the run after it has waited:
    /// the run then answers `{ abort: true }`.
    pub killed_by_us: Arc<AtomicBool>,
    /// Set (under the handle's lock) by the run when it has reaped the leader: nothing may be signalled
    /// after that.
    pub ended: Arc<AtomicBool>,
    /// The run's abort token: an abort cancels it, a tracked kill does not.
    pub cancel: CancellationToken,
}

impl GameEntry {
    /// Whether a kill ended this game tree (the run reads it once it has waited).
    pub fn was_killed(&self) -> bool {
        self.killed_by_us.load(Ordering::SeqCst)
    }

    /// Ends the game's tree through its own handle (blocking: it polls the group up to `grace`). `true` when
    /// this call ended it; `false` when the run had already reaped the leader or the tree was already gone.
    fn kill(&self, grace: Duration) -> bool {
        let mut handle = lock(&self.handle);
        if self.ended.load(Ordering::SeqCst) {
            return false;
        }
        let before = self.killed_by_us.swap(true, Ordering::SeqCst);
        match handle.kill_tree(grace) {
            KillOutcome::Killed => true,
            KillOutcome::Gone | KillOutcome::NotOurs => {
                self.killed_by_us.store(before, Ordering::SeqCst);
                false
            }
        }
    }
}

/// A registered helper run (a store CLI, a prefix command): it is ended through its cancel token.
#[derive(Clone)]
pub struct HelperEntry {
    pub id: EntryId,
    pub ids: RunIds,
    pub cancel: CancellationToken,
}

/// What 88.3 shows of a running game.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameSummary {
    pub runner: String,
    pub key: String,
    pub abort_id: String,
    pub pid: u32,
    pub stamp: Option<u64>,
    pub started_at: u64,
}

#[derive(Default)]
struct Inner {
    next: u64,
    games: BTreeMap<u64, GameEntry>,
    helpers: BTreeMap<u64, HelperEntry>,
}

/// What a context keeps of the runs that spawned a process it must be able to find again.
#[derive(Default)]
pub struct TrackedRegistry {
    inner: Mutex<Inner>,
}

/// Which registered runs a kill reaches.
enum Select<'a> {
    /// The TS filter: no field is everything, `runner` alone is every run of it, both is one key.
    Filter {
        runner: Option<&'a str>,
        key: Option<&'a str>,
    },
    /// The runs of the call that watches this stream.
    Stream(&'a str),
    /// The run that answers to this abort id.
    Abort(&'a str),
}

impl Select<'_> {
    fn matches(&self, ids: &RunIds) -> bool {
        match self {
            Select::Filter { runner, key } => {
                runner.map_or(true, |r| ids.runner == r) && key.map_or(true, |k| ids.key == k)
            }
            Select::Stream(stream) => !stream.is_empty() && ids.stream_id == *stream,
            Select::Abort(abort) => ids.abort_id == *abort,
        }
    }
}

impl TrackedRegistry {
    pub fn new() -> TrackedRegistry {
        TrackedRegistry::default()
    }

    /// Registers a running game; the entry's id is the receipt [`unregister`] takes. `cancel` is the run's
    /// abort token.
    ///
    /// [`unregister`]: TrackedRegistry::unregister
    pub fn register_game(
        &self,
        ids: RunIds,
        started_at: u64,
        cancel: CancellationToken,
        handle: GameHandle,
    ) -> EntryId {
        let pid = handle.pid;
        let stamp = handle.stamp;
        let mut inner = lock(&self.inner);
        let id = EntryId(inner.next);
        inner.next += 1;
        inner.games.insert(
            id.0,
            GameEntry {
                id,
                ids,
                pid,
                stamp,
                started_at,
                handle: Arc::new(Mutex::new(handle)),
                killed_by_us: Arc::new(AtomicBool::new(false)),
                ended: Arc::new(AtomicBool::new(false)),
                cancel,
            },
        );
        id
    }

    /// Registers a running helper run, ended through `cancel`.
    pub fn register_helper(&self, ids: RunIds, cancel: CancellationToken) -> EntryId {
        let mut inner = lock(&self.inner);
        let id = EntryId(inner.next);
        inner.next += 1;
        inner.helpers.insert(id.0, HelperEntry { id, ids, cancel });
        id
    }

    /// Removes the game entry, answering it; `None` when it was already removed.
    pub fn unregister(&self, id: EntryId) -> Option<GameEntry> {
        lock(&self.inner).games.remove(&id.0)
    }

    /// Removes the helper entry; `true` when it was still there.
    pub fn unregister_helper(&self, id: EntryId) -> bool {
        lock(&self.inner).helpers.remove(&id.0).is_some()
    }

    /// The registered game entry, if it is still there.
    pub fn entry(&self, id: EntryId) -> Option<GameEntry> {
        lock(&self.inner).games.get(&id.0).cloned()
    }

    /// Whether a game run is registered under `{ runner, key }`.
    pub fn contains(&self, runner: &str, key: &str) -> bool {
        lock(&self.inner)
            .games
            .values()
            .any(|e| e.ids.runner == runner && e.ids.key == key)
    }

    /// How many game runs are registered.
    pub fn len(&self) -> usize {
        lock(&self.inner).games.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Whether a game run is registered: the answer the quit check reads (D-07).
    pub fn games_running(&self) -> bool {
        !self.is_empty()
    }

    /// The running games, oldest registration first, for 88.3.
    pub fn games(&self) -> Vec<GameSummary> {
        lock(&self.inner)
            .games
            .values()
            .map(|e| GameSummary {
                runner: e.ids.runner.clone(),
                key: e.ids.key.clone(),
                abort_id: e.ids.abort_id.clone(),
                pid: e.pid,
                stamp: e.stamp,
                started_at: e.started_at,
            })
            .collect()
    }

    /// Ends the runs the TS filter selects (`killTracked`): `None` for a field matches every run. Answers how
    /// many were ended. A run ended this way reads as a cancellation.
    pub async fn kill_tracked(
        &self,
        shutdown: &Shutdown,
        runner: Option<&str>,
        key: Option<&str>,
    ) -> usize {
        self.kill(shutdown, Select::Filter { runner, key }, false)
            .await
    }

    /// Ends every registered run (`killAllTracked`): the quit's Yes. Holds a shutdown registrant for the kill
    /// only and is bounded by [`KILL_GRACE`] (plus a short slack for the killers to report).
    pub async fn kill_all(&self, shutdown: &Shutdown) -> usize {
        self.kill(
            shutdown,
            Select::Filter {
                runner: None,
                key: None,
            },
            false,
        )
        .await
    }

    /// Ends the runs of the call that watches `stream_id` (`launch_runner_kill`).
    pub async fn kill_stream(&self, shutdown: &Shutdown, stream_id: &str) -> usize {
        self.kill(shutdown, Select::Stream(stream_id), false).await
    }

    /// Ends the run that answers to `abort_id` and cancels its token (the TS `abortController.abort()`),
    /// for a game run (helper runs have their abort table). `true` when a run was found.
    pub async fn abort_game(&self, shutdown: &Shutdown, abort_id: &str) -> bool {
        let found = lock(&self.inner)
            .games
            .values()
            .any(|e| Select::Abort(abort_id).matches(&e.ids));
        if !found {
            return false;
        }
        self.kill(shutdown, Select::Abort(abort_id), true).await;
        true
    }

    async fn kill(&self, shutdown: &Shutdown, select: Select<'_>, cancel: bool) -> usize {
        let (games, helpers): (Vec<GameEntry>, Vec<HelperEntry>) = {
            let inner = lock(&self.inner);
            let games = inner
                .games
                .values()
                .filter(|e| select.matches(&e.ids))
                .cloned();
            let helpers = inner
                .helpers
                .values()
                .filter(|e| !matches!(select, Select::Abort(_)) && select.matches(&e.ids))
                .cloned();
            (games.collect(), helpers.collect())
        };
        let mut killed = 0;
        for helper in &helpers {
            helper.cancel.cancel();
            killed += 1;
        }
        if games.is_empty() {
            return killed;
        }
        // Held for the kill only: dropped when this function returns, whatever the games do after.
        let _registrant = shutdown.register("game-kill");
        let mut killers = tokio::task::JoinSet::new();
        for game in games {
            if cancel {
                game.cancel.cancel();
            }
            killers.spawn_blocking(move || game.kill(KILL_GRACE));
        }
        let drain = async {
            let mut ended = 0;
            while let Some(done) = killers.join_next().await {
                if matches!(done, Ok(true)) {
                    ended += 1;
                }
            }
            ended
        };
        killed
            + tokio::time::timeout(KILL_GRACE + KILL_SLACK, drain)
                .await
                .unwrap_or(0)
    }
}

/// Unregisters its entry when dropped, so a run that is dropped (the shutdown token fired) or panics
/// still leaves the registry clean. Unregistering is idempotent.
pub struct GameGuard {
    registry: Arc<TrackedRegistry>,
    id: EntryId,
    helper: bool,
}

impl GameGuard {
    pub fn new(registry: Arc<TrackedRegistry>, id: EntryId) -> GameGuard {
        GameGuard {
            registry,
            id,
            helper: false,
        }
    }

    /// The guard of a helper entry.
    pub fn helper(registry: Arc<TrackedRegistry>, id: EntryId) -> GameGuard {
        GameGuard {
            registry,
            id,
            helper: true,
        }
    }
}

impl Drop for GameGuard {
    fn drop(&mut self) {
        if self.helper {
            self.registry.unregister_helper(self.id);
        } else {
            self.registry.unregister(self.id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(runner: &str, key: &str, stream: &str) -> RunIds {
        RunIds {
            runner: runner.into(),
            key: key.into(),
            abort_id: key.into(),
            stream_id: stream.into(),
        }
    }

    #[tokio::test]
    async fn a_helper_is_ended_through_its_token_and_the_filter_keeps_the_ts_rules() {
        let registry = TrackedRegistry::new();
        let shutdown = Shutdown::new();
        let a = CancellationToken::new();
        let b = CancellationToken::new();
        let c = CancellationToken::new();
        registry.register_helper(ids("gog", "one", "s1"), a.clone());
        registry.register_helper(ids("gog", "two", ""), b.clone());
        registry.register_helper(ids("nile", "one", ""), c.clone());

        // A runner and a key that match nothing end nothing.
        assert_eq!(
            registry
                .kill_tracked(&shutdown, Some("gog"), Some("zzz"))
                .await,
            0
        );
        assert!(!a.is_cancelled() && !b.is_cancelled() && !c.is_cancelled());
        // The runner alone is every run of that runner.
        assert_eq!(registry.kill_tracked(&shutdown, Some("gog"), None).await, 2);
        assert!(a.is_cancelled() && b.is_cancelled() && !c.is_cancelled());
        // No filter is everything.
        assert_eq!(registry.kill_all(&shutdown).await, 3);
        assert!(c.is_cancelled());
    }

    #[tokio::test]
    async fn a_stream_selects_its_own_run_and_an_empty_stream_selects_none() {
        let registry = TrackedRegistry::new();
        let shutdown = Shutdown::new();
        let a = CancellationToken::new();
        let b = CancellationToken::new();
        registry.register_helper(ids("gog", "one", "stream-a"), a.clone());
        registry.register_helper(ids("gog", "two", ""), b.clone());
        assert_eq!(registry.kill_stream(&shutdown, "").await, 0);
        assert_eq!(registry.kill_stream(&shutdown, "stream-a").await, 1);
        assert!(a.is_cancelled() && !b.is_cancelled());
    }

    #[test]
    fn an_unregistered_helper_is_not_reachable() {
        let registry = Arc::new(TrackedRegistry::new());
        let id = registry.register_helper(ids("gog", "one", ""), CancellationToken::new());
        drop(GameGuard::helper(Arc::clone(&registry), id));
        assert!(!registry.unregister_helper(id));
        assert!(!registry.games_running());
    }
}
