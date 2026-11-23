//! The pinned fallback engine table (Phase 59 D-08 release lever), read from the one file both
//! languages share: `src/common/enginePins.json`. The TS keeps `ENGINE_PINS` in
//! `src/backend/engine/enginePins.ts` until its callers move; the jest test `enginePins.test.ts`
//! proves the JSON equals it field for field, so the two sides cannot drift.
//!
//! Each GameLib release ships exactly one `current` pin. The release assets are not immutable, so
//! the exact build is fixed by size and sha256 and a downloader refuses anything else.
//!
//! The file is compiled into the crate, so a malformed copy is a build-time mistake that the first
//! test run catches. At run time a parse failure is an error, never an empty table: an empty
//! table would read as "nothing is pinned" to a prune.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const ENGINE_PINS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../src/common/enginePins.json"
));

/// One pinned download: the exact build, fixed by size and sha256.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PinnedArtifact {
    pub version: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    pub archive_name: String,
}

/// One pinned engine: a Wine build and the DXVK build that goes with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EnginePin {
    pub id: String,
    pub label: String,
    pub wine: PinnedArtifact,
    pub dxvk: PinnedArtifact,
}

/// The release's pins. `previous` is the rollback target, `null` until a release bumps the pin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EnginePins {
    pub current: EnginePin,
    pub previous: Option<EnginePin>,
}

/// The table, parsed once. `Err` is a fixed word: the file's text never reaches it.
pub fn pins() -> Result<&'static EnginePins, &'static str> {
    static PINS: OnceLock<Result<EnginePins, &'static str>> = OnceLock::new();
    PINS.get_or_init(|| {
        serde_json::from_str(ENGINE_PINS_JSON).map_err(|_| "engine-pins:corrupt-table")
    })
    .as_ref()
    .map_err(|e| *e)
}

/// The ids of the pins retention keeps, current first (`pinnedEngineIdsFrom`).
pub fn pinned_engine_ids_from(pins: &EnginePins) -> Vec<String> {
    match &pins.previous {
        Some(previous) => vec![pins.current.id.clone(), previous.id.clone()],
        None => vec![pins.current.id.clone()],
    }
}

/// [`pinned_engine_ids_from`] over the shared table (`pinnedEngineIds`).
pub fn pinned_engine_ids() -> Result<Vec<String>, &'static str> {
    pins().map(pinned_engine_ids_from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shared_table_parses_and_names_the_current_pin() {
        let table = pins().expect("table parses");
        assert_eq!(table.current.id, "wine-staging-11.20");
        assert_eq!(table.current.wine.sha256.len(), 64);
        assert_eq!(table.current.dxvk.sha256.len(), 64);
        assert!(table.previous.is_none());
    }

    #[test]
    fn the_retained_ids_list_current_then_previous() {
        let table = pins().expect("table parses");
        assert_eq!(pinned_engine_ids().unwrap(), vec!["wine-staging-11.20"]);
        let mut with_previous = table.clone();
        let mut older = table.current.clone();
        older.id = "wine-staging-11.19".to_string();
        with_previous.previous = Some(older);
        assert_eq!(
            pinned_engine_ids_from(&with_previous),
            vec!["wine-staging-11.20", "wine-staging-11.19"]
        );
    }

    #[test]
    fn an_unknown_field_is_refused() {
        let json = r#"{"current":{"id":"a","label":"b","extra":1},"previous":null}"#;
        assert!(serde_json::from_str::<EnginePins>(json).is_err());
    }
}
