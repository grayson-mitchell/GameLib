//! The launch step's Rust side, a module per piece as the plans that move it land.
//!
//! - [`step`]: the launch-time engine selection (87-50, D-01).
//! - [`settings`]: the per-launch settings overlay (59 D-07, D-08).
//! - [`process_listing`]: the `ps` listing the first-match watcher polls (87-44).

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

pub mod process_listing;
pub mod settings;
pub mod step;

/// The per-launch bookkeeping of the engine step (the TS `LaunchEngineState`): the bottle each key was
/// marked running in, so the end of the launch can release it. In memory only: empty at construction,
/// no timer and no I/O. The watchers and deadlines of an armed launch join it with the deadline port.
#[derive(Debug, Default)]
pub struct LaunchState {
    ledger_bottles: Mutex<HashMap<String, String>>,
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
}
