//! The migration registry (Phase 68 `storeMigrations/index.ts`): per chain key, the steps that move
//! a file's data from one schema version to the next.
//!
//! A chain key is `<directory basename>/<file name without .json>` (`store/config`,
//! `store_cache/steam_library`) or `settings/global` / `settings/game` for the settings documents.
//! A store with no steps sits at the baseline version 1: `current_version_of` is
//! `max(1, highest step target)`, and a file at version 0 (no stamp, or a stamp that is not a valid
//! version) is adopted into v1 by an implicit identity step that writes nothing. This module is the
//! registry only; the real steps (settings, library strips) are registered by plan 85-08.

use std::collections::BTreeMap;
use std::sync::Arc;

use crate::json::Json;

/// What a step does to a document in place. An `Err` is a failed migration (the store opens
/// read-only); the message may reach a log, so it must never carry file contents.
pub type StepFn = Arc<dyn Fn(&mut Json) -> Result<(), String> + Send + Sync>;

/// One migration: brings a document up to schema version `to`. `identity` marks a step that changes
/// nothing, so a chain made only of identity steps adopts the file without rewriting it (D-12).
#[derive(Clone)]
pub struct Step {
    pub id: String,
    pub to: u32,
    pub identity: bool,
    pub run: StepFn,
}

impl Step {
    pub fn new(
        id: impl Into<String>,
        to: u32,
        run: impl Fn(&mut Json) -> Result<(), String> + Send + Sync + 'static,
    ) -> Step {
        Step {
            id: id.into(),
            to,
            identity: false,
            run: Arc::new(run),
        }
    }

    pub fn identity(id: impl Into<String>, to: u32) -> Step {
        Step {
            id: id.into(),
            to,
            identity: true,
            run: Arc::new(|_| Ok(())),
        }
    }
}

/// The chain keys `storeMigrations/index.ts` (`STORE_MIGRATIONS`) names. Each is registered here
/// with an empty step list until the plan that ports its steps fills it in.
const TS_CHAIN_KEYS: [&str; 11] = [
    "settings/global",
    "settings/game",
    "steam_bridge/shared-redists",
    "engine/gamelib-engine-marker",
    "store_cache/steam_library",
    "store_cache/gog_library",
    "gog_store/installed",
    "store_cache/legendary_library",
    "store_cache/nile_library",
    "sideload_apps/library",
    "store/download-manager",
];

/// Chain key to steps. A key with no entry is a baseline v1 store.
#[derive(Clone, Default)]
pub struct Chains {
    chains: BTreeMap<String, Vec<Step>>,
}

impl Chains {
    /// Every chain `STORE_MIGRATIONS` names, each with no steps yet (85-08 registers them).
    pub fn baseline() -> Chains {
        Chains {
            chains: TS_CHAIN_KEYS
                .iter()
                .map(|k| ((*k).to_string(), Vec::new()))
                .collect(),
        }
    }

    /// Replaces (or adds) the chain for `key`: the test seam `MigrationOverrides` was in TS.
    #[must_use]
    pub fn with_override(mut self, key: &str, steps: Vec<Step>) -> Chains {
        self.chains.insert(key.to_string(), steps);
        self
    }

    fn chain_of(&self, key: &str) -> &[Step] {
        self.chains.get(key).map_or(&[], Vec::as_slice)
    }

    /// `max(1, highest target)`: the version a store at rest should have.
    pub fn current_version_of(&self, key: &str) -> u32 {
        self.chain_of(key)
            .iter()
            .map(|s| s.to)
            .max()
            .unwrap_or(0)
            .max(1)
    }

    /// The steps a file at `from` still has to run, lowest target first. A file below v1 in a chain
    /// that declares no v1 step gets the implicit identity adoption step in front.
    pub fn pending(&self, key: &str, from: u32) -> Vec<Step> {
        let chain = self.chain_of(key);
        let mut steps: Vec<Step> = chain.iter().filter(|s| s.to > from).cloned().collect();
        steps.sort_by_key(|s| s.to);
        let declares_v1 = chain.iter().any(|s| s.to == 1);
        if from < 1 && !declares_v1 {
            steps.insert(0, Step::identity("adopt-v1", 1));
        }
        steps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(to: u32) -> Step {
        Step::new(format!("to-{to}"), to, |_| Ok(()))
    }

    #[test]
    fn a_baseline_chain_is_v1_and_adopts_an_unstamped_file() {
        let c = Chains::baseline();
        assert_eq!(c.current_version_of("store/config"), 1);
        assert_eq!(c.current_version_of("settings/global"), 1);
        let pending = c.pending("store/config", 0);
        assert_eq!(pending.len(), 1);
        assert!(pending.iter().all(|s| s.identity));
        assert!(c.pending("store/config", 1).is_empty());
    }

    #[test]
    fn the_baseline_names_every_ts_chain() {
        let c = Chains::baseline();
        assert_eq!(c.chains.len(), TS_CHAIN_KEYS.len());
        for key in TS_CHAIN_KEYS {
            assert!(c.chains.contains_key(key), "{key}");
        }
    }

    #[test]
    fn current_is_the_highest_target_and_pending_runs_in_order() {
        let c = Chains::baseline().with_override("store/x", vec![step(3), step(2)]);
        assert_eq!(c.current_version_of("store/x"), 3);
        let to: Vec<u32> = c.pending("store/x", 1).iter().map(|s| s.to).collect();
        assert_eq!(to, [2, 3]);
        // From 0 the implicit adoption step leads the chain, and it is not an identity-only chain.
        let from0 = c.pending("store/x", 0);
        assert_eq!(from0.iter().map(|s| s.to).collect::<Vec<_>>(), [1, 2, 3]);
        assert!(from0[0].identity && !from0[1].identity);
    }

    #[test]
    fn a_declared_v1_step_replaces_the_implicit_adoption() {
        let c = Chains::baseline().with_override("store/x", vec![Step::identity("v1", 1)]);
        let pending = c.pending("store/x", 0);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "v1");
    }
}
