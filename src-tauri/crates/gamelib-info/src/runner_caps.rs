//! What the leaf services need to know about a runner, read from the one file both sides share:
//! `src/common/runnerCapabilities.json` (86-19). The TS keeps its own tables (`common/storeCapabilities.ts`,
//! `common/utils.ts` `storeMap`, the umu `storeMapping`) until their callers move; the jest test
//! `runnerCapabilities.test.ts` proves the JSON equals each of them, so the two sides cannot drift.
//!
//! The file is parsed once. It is compiled into the crate, so a malformed copy is a build-time mistake
//! that the first test run catches; at run time a parse failure reads as an empty table (every runner
//! unknown) rather than a panic.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

const RUNNER_CAPABILITIES_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../src/common/runnerCapabilities.json"
));

/// The two flags of `storeCapabilities` the leaf services read.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunnerCaps {
    /// The runner's `app_name` is a Steam appId (the wiki, ProtonDB and CrossOver joins).
    pub app_name_is_steam_app_id: bool,
    /// The runner has a store-provided catalog (everything but sideload).
    pub has_store_catalog: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Table {
    runners: HashMap<String, RunnerCaps>,
    store_map: HashMap<String, Option<String>>,
    umu_store: HashMap<String, String>,
}

fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    TABLE.get_or_init(|| {
        serde_json::from_str(RUNNER_CAPABILITIES_JSON).unwrap_or(Table {
            runners: HashMap::new(),
            store_map: HashMap::new(),
            umu_store: HashMap::new(),
        })
    })
}

/// The capability flags of `runner`, or `None` for a name that is not a runner (the TS table lookup
/// would be `undefined`).
pub fn caps(runner: &str) -> Option<RunnerCaps> {
    table().runners.get(runner).copied()
}

/// `common/utils.ts` `storeMap[runner]`: the store name the wiki lookups use. `None` for sideload (TS
/// `undefined`) and for a name that is not a runner.
pub fn store_map(runner: &str) -> Option<&'static str> {
    table().store_map.get(runner)?.as_deref()
}

/// The umu `storeMapping[runner]`: the store name umu's API takes (`egs` for Epic).
pub fn umu_store(runner: &str) -> Option<&'static str> {
    table().umu_store.get(runner).map(String::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shared_file_parses_and_names_the_five_runners() {
        let t: Table = serde_json::from_str(RUNNER_CAPABILITIES_JSON).unwrap();
        let mut names: Vec<&str> = t.runners.keys().map(String::as_str).collect();
        names.sort_unstable();
        assert_eq!(names, ["gog", "legendary", "nile", "sideload", "steam"]);
        assert_eq!(t.store_map.len(), 5);
        assert_eq!(t.umu_store.len(), 5);
    }

    #[test]
    fn flags_follow_the_store_capability_table() {
        assert_eq!(
            caps("steam"),
            Some(RunnerCaps {
                app_name_is_steam_app_id: true,
                has_store_catalog: true
            })
        );
        assert_eq!(
            caps("sideload"),
            Some(RunnerCaps {
                app_name_is_steam_app_id: false,
                has_store_catalog: false
            })
        );
        assert!(caps("legendary").is_some_and(|c| c.has_store_catalog));
        assert_eq!(caps("humble"), None);
    }

    #[test]
    fn the_store_names_match_the_ts_maps() {
        assert_eq!(store_map("legendary"), Some("epic"));
        assert_eq!(store_map("nile"), Some("amazon"));
        assert_eq!(store_map("sideload"), None);
        assert_eq!(store_map("unknown"), None);
        assert_eq!(umu_store("legendary"), Some("egs"));
        assert_eq!(umu_store("sideload"), Some("sideload"));
        assert_eq!(umu_store("steam"), Some("steam"));
        assert_eq!(umu_store("unknown"), None);
    }
}
