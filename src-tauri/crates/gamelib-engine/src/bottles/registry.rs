//! The session-scoped engine registry (Phase 59, D-07, ported from `engineRegistry.ts`).
//!
//! The engine chosen for a title lives only in this in-memory map: set per launch by the launch path,
//! cleared when the game stops, on the launch deadline path and on the launch-error path. Nothing is
//! persisted, so falling back is never stored state. The map is empty at construction.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use crate::engines::NonCrossoverEngine;
use crate::key::is_engine_key;
use crate::sinks::EngineLog;

/// The engine a launch uses (`EngineSelection`): CrossOver, a pinned fallback engine or a Wine Manager
/// build. A non-CrossOver selection carries the engine's binaries and its DXVK, if any.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum EngineSelection {
    #[serde(rename_all = "camelCase")]
    Crossover {
        reason: String,
        crossover_build: Option<String>,
        bin_dir: String,
    },
    #[serde(rename_all = "camelCase")]
    Pinned {
        pin_id: String,
        reason: String,
        #[serde(flatten)]
        engine: NonCrossoverEngine,
    },
    #[serde(rename_all = "camelCase")]
    WineManager {
        manager_version: String,
        reason: String,
        #[serde(flatten)]
        engine: NonCrossoverEngine,
    },
}

impl EngineSelection {
    /// The binaries of a non-CrossOver selection (`isNonCrossover`).
    pub fn engine(&self) -> Option<&NonCrossoverEngine> {
        match self {
            EngineSelection::Crossover { .. } => None,
            EngineSelection::Pinned { engine, .. }
            | EngineSelection::WineManager { engine, .. } => Some(engine),
        }
    }

    /// `engineLogLabel`: the exact engine and version launch-log line (D-14).
    pub fn log_label(&self) -> String {
        match self {
            EngineSelection::Crossover {
                reason,
                crossover_build,
                ..
            } => format!(
                "engine=crossover build={} reason={reason}",
                crossover_build.as_deref().unwrap_or("unknown")
            ),
            EngineSelection::Pinned { reason, engine, .. } => format!(
                "engine=pinned name=\"{}\" version={} reason={reason}",
                engine.label, engine.version
            ),
            EngineSelection::WineManager { reason, engine, .. } => format!(
                "engine=wine-manager name=\"{}\" version={} reason={reason}",
                engine.label, engine.version
            ),
        }
    }
}

/// The selection of every running title, by engine key.
#[derive(Debug, Default)]
pub struct Registry {
    selections: Mutex<HashMap<String, EngineSelection>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

impl Registry {
    pub fn new() -> Registry {
        Registry::default()
    }

    /// `setEngineSelection`: false, storing nothing, for a key that is not an engine key and for a
    /// non-CrossOver selection whose Wine or wineserver is not on disk. A later set replaces the
    /// earlier one. The stored value is the caller's own (an owned copy, as the TS made one).
    pub fn set_engine_selection(
        &self,
        log: Option<&dyn EngineLog>,
        key: &str,
        selection: EngineSelection,
    ) -> bool {
        if !is_engine_key(key) {
            return false;
        }
        if let Some(engine) = selection.engine() {
            if !Path::new(&engine.wine_bin).exists() || !Path::new(&engine.wineserver_bin).exists()
            {
                return false;
            }
        }
        if let Some(log) = log {
            log.info(&format!("Engine: {key} uses {}", selection.log_label()));
        }
        lock(&self.selections).insert(key.to_string(), selection);
        true
    }

    /// `getEngineSelection`.
    pub fn get_engine_selection(&self, key: &str) -> Option<EngineSelection> {
        lock(&self.selections).get(key).cloned()
    }

    /// `clearEngineSelection`: harmless for a key that has none.
    pub fn clear_engine_selection(&self, key: &str) {
        lock(&self.selections).remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_crossover_selection_needs_no_binaries_and_round_trips_through_json() {
        let registry = Registry::new();
        let selection: EngineSelection = serde_json::from_value(json!({
            "kind": "crossover", "reason": "cx-healthy", "crossoverBuild": "26.3", "binDir": "/cx/bin"
        }))
        .unwrap();
        assert!(registry.set_engine_selection(None, "620", selection.clone()));
        assert_eq!(
            registry.get_engine_selection("620"),
            Some(selection.clone())
        );
        assert_eq!(
            serde_json::to_value(&selection).unwrap(),
            json!({"kind": "crossover", "reason": "cx-healthy", "crossoverBuild": "26.3", "binDir": "/cx/bin"})
        );
        registry.clear_engine_selection("620");
        registry.clear_engine_selection("620");
        assert_eq!(registry.get_engine_selection("620"), None);
    }

    #[test]
    fn a_pinned_selection_reads_its_engine_fields_flat_and_labels_itself() {
        let selection: EngineSelection = serde_json::from_value(json!({
            "kind": "pinned", "pinId": "p", "reason": "cx-missing", "wineBin": "/w", "wineserverBin": "/ws",
            "label": "Pinned", "version": "11.20", "dxvk": null
        }))
        .unwrap();
        assert_eq!(
            selection.log_label(),
            "engine=pinned name=\"Pinned\" version=11.20 reason=cx-missing"
        );
        let back = serde_json::to_value(&selection).unwrap();
        assert_eq!(back["dxvk"], serde_json::Value::Null);
        assert_eq!(back["pinId"], "p");
    }

    #[test]
    fn a_bad_key_and_missing_binaries_are_refused() {
        let registry = Registry::new();
        let crossover = EngineSelection::Crossover {
            reason: "cx-healthy".into(),
            crossover_build: None,
            bin_dir: "/b".into(),
        };
        assert!(!registry.set_engine_selection(None, "abc", crossover.clone()));
        assert!(!registry.set_engine_selection(None, "steam:620", crossover));
        let pinned: EngineSelection = serde_json::from_value(json!({
            "kind": "pinned", "pinId": "p", "reason": "cx-missing",
            "wineBin": "/no/such/wine", "wineserverBin": "/no/such/wineserver",
            "label": "x", "version": "1", "dxvk": null
        }))
        .unwrap();
        assert!(!registry.set_engine_selection(None, "gog:1", pinned));
        assert_eq!(registry.get_engine_selection("gog:1"), None);
    }
}
