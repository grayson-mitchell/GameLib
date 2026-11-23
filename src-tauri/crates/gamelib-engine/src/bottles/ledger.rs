//! The per-bottle running-games ledger (Phase 61 D-16, ported from `bottleLedger.ts`).
//!
//! Maps a bottle name to the engine keys running in it, for every store, so an engine step can see
//! another game in the same bottle before it tears the shared wineserver down. In memory only: empty
//! at construction, no file, no timer and no I/O (research: there is no ledger file).

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use super::paths::is_clean_bottle_name;
use crate::key::is_engine_key;
use crate::sinks::EngineLog;

/// The running games of every bottle. A bottle's keys keep the order they were marked in (the TS set's
/// insertion order); marking a key twice keeps one.
#[derive(Debug, Default)]
pub struct Ledger {
    games: Mutex<HashMap<String, Vec<String>>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

impl Ledger {
    pub fn new() -> Ledger {
        Ledger::default()
    }

    /// `markGameRunning`: false, recording nothing, for an unsafe bottle name or a key that is not an
    /// engine key.
    pub fn mark_game_running(
        &self,
        log: Option<&dyn EngineLog>,
        bottle_name: &str,
        key: &str,
    ) -> bool {
        if !is_clean_bottle_name(bottle_name) || !is_engine_key(key) {
            return false;
        }
        {
            let mut games = lock(&self.games);
            let keys = games.entry(bottle_name.to_string()).or_default();
            if !keys.iter().any(|k| k == key) {
                keys.push(key.to_string());
            }
        }
        if let Some(log) = log {
            log.info(&format!("BottleLedger: {key} running in {bottle_name}"));
        }
        true
    }

    /// `markGameStopped`: drops the key, and the bottle when it was the last one. Harmless for a
    /// bottle or key that is not recorded.
    pub fn mark_game_stopped(&self, bottle_name: &str, key: &str) {
        let mut games = lock(&self.games);
        let Some(keys) = games.get_mut(bottle_name) else {
            return;
        };
        keys.retain(|k| k != key);
        if keys.is_empty() {
            games.remove(bottle_name);
        }
    }

    /// `gamesRunningIn`: the keys running in the bottle, in the order they were marked; empty for an
    /// unsafe name.
    pub fn games_running_in(&self, bottle_name: &str) -> Vec<String> {
        if !is_clean_bottle_name(bottle_name) {
            return Vec::new();
        }
        lock(&self.games)
            .get(bottle_name)
            .cloned()
            .unwrap_or_default()
    }

    /// `otherGamesRunning`: [`Ledger::games_running_in`] without `key`.
    pub fn other_games_running(&self, bottle_name: &str, key: &str) -> Vec<String> {
        self.games_running_in(bottle_name)
            .into_iter()
            .filter(|k| k != key)
            .collect()
    }

    /// The number of bottles with at least one running game.
    pub fn size(&self) -> usize {
        lock(&self.games).len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_kept_in_marking_order_and_a_bottle_leaves_with_its_last_game() {
        let ledger = Ledger::new();
        assert!(ledger.mark_game_running(None, "GameLib-gog-1", "gog:1"));
        assert!(ledger.mark_game_running(None, "GameLib-gog-1", "620"));
        assert!(ledger.mark_game_running(None, "GameLib-gog-1", "gog:1"));
        assert_eq!(ledger.games_running_in("GameLib-gog-1"), ["gog:1", "620"]);
        assert_eq!(
            ledger.other_games_running("GameLib-gog-1", "gog:1"),
            ["620"]
        );
        assert_eq!(ledger.size(), 1);
        ledger.mark_game_stopped("GameLib-gog-1", "gog:1");
        ledger.mark_game_stopped("GameLib-gog-1", "620");
        assert_eq!(ledger.size(), 0);
        ledger.mark_game_stopped("GameLib-gog-1", "620");
    }

    #[test]
    fn an_unsafe_bottle_or_a_bad_key_is_refused_and_never_recorded() {
        let ledger = Ledger::new();
        assert!(!ledger.mark_game_running(None, "a/b", "gog:1"));
        assert!(!ledger.mark_game_running(None, " padded ", "gog:1"));
        assert!(!ledger.mark_game_running(None, "GameLib-x", "bad key"));
        assert!(!ledger.mark_game_running(None, "GameLib-x", "steam:620"));
        assert_eq!(ledger.size(), 0);
        assert!(ledger.games_running_in("a/b").is_empty());
    }
}
