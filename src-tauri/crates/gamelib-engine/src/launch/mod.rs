//! The launch step's Rust side, a module per piece as the plans that move it land.
//!
//! - [`step`]: the launch-time engine selection (87-50, D-01).
//! - [`dialogs`]: the dialogs, notices and toast of the step, and their acknowledgements (87-50, D-02).
//! - [`settings`]: the per-launch settings overlay (59 D-07, D-08).
//! - [`process_listing`]: the `ps` listing the first-match watcher polls (87-44).
//! - [`deadline`]: the 180 s launch deadline and its bridge event (87-51, D-17).
//! - [`watch`]: the process watch that ends the deadline when the game is seen (87-51, D-08).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};

use tokio_util::sync::CancellationToken;

pub mod deadline;
pub mod dialogs;
pub mod process_listing;
pub mod settings;
pub mod step;
pub mod watch;

/// One armed task (a deadline or a watch) of a key: which arming it is, and the token that ends it.
#[derive(Debug)]
struct Armed {
    generation: u64,
    token: CancellationToken,
}

/// The per-launch bookkeeping of the engine step (the TS `LaunchEngineState` and the deadline registry):
/// the bottle each key was marked running in, so the end of the launch can release it, and the deadline
/// and the process watch each armed key holds. In memory only: empty at construction, no timer and no
/// I/O.
///
/// An entry is claimed by whoever removes it: the task that fires or ends, or the caller that cancels.
/// A task claims its own entry by generation, so one that was superseded or cancelled never touches the
/// entry of the arming that replaced it.
#[derive(Debug, Default)]
pub struct LaunchState {
    ledger_bottles: Mutex<HashMap<String, String>>,
    deadlines: Mutex<HashMap<String, Armed>>,
    watchers: Mutex<HashMap<String, Armed>>,
    generation: AtomicU64,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

impl LaunchState {
    pub fn new() -> LaunchState {
        LaunchState::default()
    }

    /// Remembers the bottle `key` was marked running in.
    pub fn remember_ledger_bottle(&self, key: &str, bottle_name: &str) {
        lock(&self.ledger_bottles).insert(key.to_string(), bottle_name.to_string());
    }

    /// Returns and forgets the bottle `key` was marked running in.
    pub fn take_ledger_bottle(&self, key: &str) -> Option<String> {
        lock(&self.ledger_bottles).remove(key)
    }

    fn next_generation(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Records a new deadline for `key` and answers its generation and the token that ends its task.
    /// The caller cancels a previous one first ([`deadline::cancel`]), so none is replaced here.
    pub(crate) fn begin_deadline(&self, key: &str) -> (u64, CancellationToken) {
        let generation = self.next_generation();
        let token = CancellationToken::new();
        lock(&self.deadlines).insert(
            key.to_string(),
            Armed {
                generation,
                token: token.clone(),
            },
        );
        (generation, token)
    }

    /// Removes the deadline of `key`, whichever arming it is, and answers its token (not yet cancelled).
    pub(crate) fn take_deadline(&self, key: &str) -> Option<CancellationToken> {
        lock(&self.deadlines).remove(key).map(|armed| armed.token)
    }

    /// Removes the deadline of `key` only if it is still arming `generation`: `true` for the task that
    /// owns it, `false` for one that was cancelled or superseded meanwhile.
    pub(crate) fn claim_deadline(&self, key: &str, generation: u64) -> bool {
        let mut deadlines = lock(&self.deadlines);
        if deadlines
            .get(key)
            .is_some_and(|armed| armed.generation == generation)
        {
            deadlines.remove(key);
            true
        } else {
            false
        }
    }

    /// Whether `key` holds an armed deadline.
    pub fn deadline_armed(&self, key: &str) -> bool {
        lock(&self.deadlines).contains_key(key)
    }

    /// The deadlines armed now.
    pub fn active_deadlines(&self) -> usize {
        lock(&self.deadlines).len()
    }

    /// Records a new process watch for `key`, ending the one it replaces.
    pub(crate) fn begin_watcher(&self, key: &str) -> (u64, CancellationToken) {
        let generation = self.next_generation();
        let token = CancellationToken::new();
        let replaced = lock(&self.watchers).insert(
            key.to_string(),
            Armed {
                generation,
                token: token.clone(),
            },
        );
        if let Some(replaced) = replaced {
            replaced.token.cancel();
        }
        (generation, token)
    }

    /// Ends the process watch of `key` (`stopWatcher`); `true` when one was running.
    pub fn stop_watcher(&self, key: &str) -> bool {
        match lock(&self.watchers).remove(key) {
            Some(armed) => {
                armed.token.cancel();
                true
            }
            None => false,
        }
    }

    /// Removes the watch of `key` only if it is still `generation` (the watch that ended by itself):
    /// `true` for the task that owns the entry.
    pub(crate) fn claim_watcher(&self, key: &str, generation: u64) -> bool {
        let mut watchers = lock(&self.watchers);
        if watchers
            .get(key)
            .is_some_and(|armed| armed.generation == generation)
        {
            watchers.remove(key);
            true
        } else {
            false
        }
    }

    /// The process watches running now.
    pub fn active_watchers(&self) -> usize {
        lock(&self.watchers).len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ledger_bottle_is_remembered_once_and_taken_once() {
        let state = LaunchState::new();
        assert_eq!(state.take_ledger_bottle("gog:1"), None);
        state.remember_ledger_bottle("gog:1", "GameLib-gog-1");
        assert_eq!(
            state.take_ledger_bottle("gog:1").as_deref(),
            Some("GameLib-gog-1")
        );
        assert_eq!(state.take_ledger_bottle("gog:1"), None);
    }

    #[test]
    fn a_deadline_is_claimed_by_the_arming_that_owns_it() {
        let state = LaunchState::new();
        let (first, _) = state.begin_deadline("gog:1");
        assert!(state.deadline_armed("gog:1"));
        assert_eq!(state.active_deadlines(), 1);
        // A newer arming replaces the entry; the first task's claim is refused and the second's holds.
        let (second, _) = state.begin_deadline("gog:1");
        assert!(!state.claim_deadline("gog:1", first));
        assert!(state.deadline_armed("gog:1"));
        assert!(state.claim_deadline("gog:1", second));
        assert!(!state.claim_deadline("gog:1", second));
        assert_eq!(state.active_deadlines(), 0);
        assert!(state.take_deadline("gog:1").is_none());
    }

    #[test]
    fn a_new_watch_ends_the_one_it_replaces_and_stop_ends_the_current() {
        let state = LaunchState::new();
        let (first, first_token) = state.begin_watcher("gog:1");
        let (second, second_token) = state.begin_watcher("gog:1");
        assert!(first_token.is_cancelled());
        assert!(!second_token.is_cancelled());
        assert!(!state.claim_watcher("gog:1", first));
        assert_eq!(state.active_watchers(), 1);
        assert!(state.stop_watcher("gog:1"));
        assert!(second_token.is_cancelled());
        assert!(!state.claim_watcher("gog:1", second));
        assert!(!state.stop_watcher("gog:1"));
        assert_eq!(state.active_watchers(), 0);
    }
}
