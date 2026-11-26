//! The tracked registry (D-07, first half): every game run is registered under `{ runner, key }` with its
//! `GameHandle` while it runs and unregistered when it ends. 88.2-11 adds the reads, kills and ops over it.
//!
//! The handle is shared (`Arc<Mutex<GameHandle>>`): the run that owns the game watches it without holding
//! the lock across a wait, so a kill through the registry can take the lock and end the tree while the run
//! is still waiting.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};

use gamelib_proc::GameHandle;

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// A game's handle as the registry and the run that owns it share it.
pub type SharedGame = Arc<Mutex<GameHandle>>;

/// One registration. Unique per registration within a registry, so two runs under one key (single flight
/// is the TS's until 88.3) never unregister each other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EntryId(pub u64);

/// A registered game run.
#[derive(Clone)]
pub struct GameEntry {
    pub id: EntryId,
    /// The runner's name as the renderer spells it (`gog`, `legendary`, ...).
    pub runner: String,
    /// The key the caller tracks the run under (its `trackKey`, or its abort id).
    pub key: String,
    /// The game leader's pid.
    pub pid: u32,
    /// The leader's start stamp read at spawn (`None` when it had already exited).
    pub stamp: Option<u64>,
    pub handle: SharedGame,
}

#[derive(Default)]
struct Inner {
    next: u64,
    games: BTreeMap<u64, GameEntry>,
}

/// What a context keeps of the runs that spawned a process it must be able to find again.
#[derive(Default)]
pub struct TrackedRegistry {
    inner: Mutex<Inner>,
}

impl TrackedRegistry {
    pub fn new() -> TrackedRegistry {
        TrackedRegistry::default()
    }

    /// Registers a running game under `{ runner, key }`; the entry's id is the receipt [`unregister`] takes.
    ///
    /// [`unregister`]: TrackedRegistry::unregister
    pub fn register_game(&self, runner: &str, key: &str, handle: GameHandle) -> EntryId {
        let pid = handle.pid;
        let stamp = handle.stamp;
        let mut inner = lock(&self.inner);
        let id = EntryId(inner.next);
        inner.next += 1;
        inner.games.insert(
            id.0,
            GameEntry {
                id,
                runner: runner.to_string(),
                key: key.to_string(),
                pid,
                stamp,
                handle: Arc::new(Mutex::new(handle)),
            },
        );
        id
    }

    /// Removes the entry, answering it; `None` when it was already removed.
    pub fn unregister(&self, id: EntryId) -> Option<GameEntry> {
        lock(&self.inner).games.remove(&id.0)
    }

    /// The registered entry, if it is still there.
    pub fn entry(&self, id: EntryId) -> Option<GameEntry> {
        lock(&self.inner).games.get(&id.0).cloned()
    }

    /// Whether a run is registered under `{ runner, key }`.
    pub fn contains(&self, runner: &str, key: &str) -> bool {
        lock(&self.inner)
            .games
            .values()
            .any(|e| e.runner == runner && e.key == key)
    }

    /// How many game runs are registered.
    pub fn len(&self) -> usize {
        lock(&self.inner).games.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Unregisters its entry when dropped, so a run that is dropped (the shutdown token fired) or panics
/// still leaves the registry clean. Unregistering is idempotent.
pub struct GameGuard {
    registry: Arc<TrackedRegistry>,
    id: EntryId,
}

impl GameGuard {
    pub fn new(registry: Arc<TrackedRegistry>, id: EntryId) -> GameGuard {
        GameGuard { registry, id }
    }
}

impl Drop for GameGuard {
    fn drop(&mut self) {
        self.registry.unregister(self.id);
    }
}
