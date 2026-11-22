//! The store table (D-11): every persisted store, as one generated JSON both sides read.
//!
//! `src/common/types/ipc/storeTable.json` is written by `meta/genStoreTable.ts` and compiled in here
//! with `include_str!`, so the Rust host and the TS drift test describe the same stores. A row says
//! where the file lives, which kind it is, which family decides how the host treats it, whether it
//! carries tokens, whether its keys are dot paths, which codec carries its version, and which
//! migration chain applies.
//!
//! Families: `cache` (rebuildable), `user-state`, `account` (token-bearing or a sign-in `config`),
//! `settings` (the settings mirror store and the `config.json` / `GamesConfig` documents), `native`
//! (already owned by a Rust module, the logger's `uploadedLogs`) and `excluded` (Rust never opens it:
//! `store/migrations`, D-07).

use std::path::{Component, Path};
use std::sync::OnceLock;

use serde::Deserialize;

use crate::backup::is_side_file;
use crate::engine::{Flavour, StoreKind};

const TABLE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../src/common/types/ipc/storeTable.json"
));

/// `declaration.kind` of the TS store: whether the data can be rebuilt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    Cache,
    UserState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Family {
    Cache,
    UserState,
    Account,
    Settings,
    Native,
    Excluded,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRow {
    pub key: String,
    pub dir: String,
    /// The file name without `.json`; `None` for the `settings/game` pattern row.
    pub name: Option<String>,
    pub ts_names: Vec<String>,
    pub kind: Kind,
    pub family: Family,
    pub token_bearing: bool,
    pub dot_paths: bool,
    pub flavour: Flavour,
    /// The migration chain key, when the generator's `CHAIN_VERSIONS` names one (it mirrors
    /// `Chains::baseline`, held equal by `table_chain_versions_equal_the_shell_chains`); `None` is
    /// the baseline v1.
    pub chain: Option<String>,
}

impl TableRow {
    /// The engine kind this row opens as; `None` for a family Rust does not open.
    pub fn store_kind(&self) -> Option<StoreKind> {
        match self.family {
            Family::Cache => Some(StoreKind::Cache),
            Family::UserState => Some(StoreKind::UserState),
            Family::Account => Some(StoreKind::Account),
            Family::Settings => Some(StoreKind::Settings),
            Family::Native | Family::Excluded => None,
        }
    }

    /// The key the engine looks the chain up by: the registered chain, else the row key (a baseline
    /// store has no steps, so the key only names it).
    pub fn chain_key(&self) -> &str {
        self.chain.as_deref().unwrap_or(&self.key)
    }
}

#[derive(Deserialize)]
struct TableFile {
    rows: Vec<TableRow>,
}

/// Every row, parsed once. A table that does not parse is a build defect, so this panics.
pub fn table() -> &'static [TableRow] {
    static TABLE: OnceLock<Vec<TableRow>> = OnceLock::new();
    TABLE.get_or_init(|| {
        serde_json::from_str::<TableFile>(TABLE_JSON)
            .unwrap_or_else(|e| panic!("storeTable.json does not parse: {e}"))
            .rows
    })
}

/// The row for a store key (`store/config`, `store_cache/steam_library`, `settings/global`).
pub fn row_for_key(key: &str) -> Option<&'static TableRow> {
    table().iter().find(|r| r.key == key)
}

fn json_stem(name: &std::ffi::OsStr) -> Option<&str> {
    name.to_str()?.strip_suffix(".json")
}

/// The row a file belongs to. `app_folder` holds `config.json` and `GamesConfig/<app>.json`;
/// `user_data` holds `<dir>/<name>.json` (the two may be the same directory). A backup, a corrupt
/// copy, a temp file or anything unlisted has no row.
pub fn row_for_path(user_data: &Path, app_folder: &Path, path: &Path) -> Option<&'static TableRow> {
    let comps = |root: &Path| -> Option<Vec<std::ffi::OsString>> {
        let rel = path.strip_prefix(root).ok()?;
        rel.components()
            .map(|c| match c {
                Component::Normal(n) => Some(n.to_os_string()),
                _ => None,
            })
            .collect()
    };
    if let Some(parts) = comps(app_folder) {
        match parts.as_slice() {
            [file] if file == "config.json" => return row_for_key("settings/global"),
            [dir, file] if dir == "GamesConfig" => {
                let stem = json_stem(file)?;
                if stem.is_empty() || is_side_file(file.to_str()?) {
                    return None;
                }
                return row_for_key("settings/game");
            }
            _ => {}
        }
    }
    let parts = comps(user_data)?;
    let [dir, file] = parts.as_slice() else {
        return None;
    };
    let key = format!("{}/{}", dir.to_str()?, json_stem(file)?);
    row_for_key(&key).filter(|r| !r.key.starts_with("settings/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::path::PathBuf;

    /// The family rule the generator applies, restated here so a drifted table fails.
    fn rule(r: &TableRow) -> Family {
        let key = r.key.as_str();
        if key == "store/migrations" {
            Family::Excluded
        } else if key == "store/uploadedLogs" {
            Family::Native
        } else if key == "store/config" || key.starts_with("settings/") {
            Family::Settings
        } else if r.token_bearing
            || (r.name.as_deref() == Some("config")
                && ["gog_store", "nile_store", "legendary_store"].contains(&r.dir.as_str()))
        {
            Family::Account
        } else if r.kind == Kind::Cache {
            Family::Cache
        } else {
            Family::UserState
        }
    }

    /// The file's `chainVersions` map (chain key to the version a store at rest has) is what the TS
    /// side reads for a stamped version since the TS migration registry was deleted (85-24): the
    /// generator, the test disk sink's `storeSchemaVersions.ts` and the corpus harvester's
    /// `CHAIN_CURRENT` are held equal to it in jest. This holds it, and every row's chain, equal to
    /// the chains the shell actually runs, in both directions.
    #[test]
    fn table_chain_versions_equal_the_shell_chains() {
        let file: serde_json::Value =
            serde_json::from_str(TABLE_JSON).expect("storeTable.json parses");
        let versions = file
            .get("chainVersions")
            .and_then(serde_json::Value::as_object)
            .expect("storeTable.json has a chainVersions object");
        assert!(!versions.is_empty(), "chainVersions is empty");
        let chains = crate::migrate::Chains::baseline();
        for (key, v) in versions {
            let v = v.as_u64().expect("a chain version is an integer");
            assert_eq!(
                u64::from(chains.current_version_of(key)),
                v,
                "chainVersions[{key}]"
            );
            assert!(v > 1, "chainVersions[{key}] lists a baseline store");
        }
        for r in table() {
            let listed = versions.get(&r.key).and_then(serde_json::Value::as_u64);
            assert_eq!(
                u64::from(chains.current_version_of(r.chain_key())),
                listed.unwrap_or(1),
                "{}",
                r.key
            );
            assert_eq!(r.chain.is_some(), listed.is_some(), "{}", r.key);
        }
    }

    #[test]
    fn every_row_parses_and_its_family_follows_the_rule() {
        let rows = table();
        assert!(rows.len() >= 50, "the table shrank to {} rows", rows.len());
        let mut keys = HashSet::new();
        for r in rows {
            assert!(keys.insert(r.key.clone()), "duplicate key {}", r.key);
            assert_eq!(r.family, rule(r), "{}", r.key);
            // The settings rows are keyed by document, not by `<dir>/<name>`.
            if let (Some(name), false) = (&r.name, r.key.starts_with("settings/")) {
                assert_eq!(r.key, format!("{}/{name}", r.dir), "{}", r.key);
            }
            assert_eq!(
                r.flavour == Flavour::Settings,
                r.key.starts_with("settings/"),
                "{}",
                r.key
            );
        }
    }

    #[test]
    fn the_special_rows_are_where_the_decisions_put_them() {
        let family = |k: &str| {
            row_for_key(k)
                .unwrap_or_else(|| panic!("no row {k}"))
                .family
        };
        assert_eq!(family("store/migrations"), Family::Excluded);
        assert_eq!(family("store/uploadedLogs"), Family::Native);
        assert_eq!(family("steam_store/config"), Family::Account);
        assert_eq!(family("humble_store/config"), Family::Account);
        assert_eq!(family("gog_store/config"), Family::Account);
        assert_eq!(family("store/config"), Family::Settings);
        assert_eq!(family("settings/global"), Family::Settings);
        assert_eq!(family("store_cache/steam_library"), Family::UserState);
        assert_eq!(family("store_cache/steam_metadata"), Family::Cache);
        assert!(!row_for_key("store/uploadedLogs").unwrap().dot_paths);
        let steam = row_for_key("steam_store/config").unwrap();
        assert!(steam.token_bearing);
        assert_eq!(
            steam.ts_names.len(),
            2,
            "steam's two TS stores share one file"
        );
        assert_eq!(
            table()
                .iter()
                .filter(|r| r.family == Family::Excluded)
                .count(),
            1
        );
    }

    #[test]
    fn a_row_opens_as_the_engine_kind_its_family_names() {
        assert_eq!(
            row_for_key("store_cache/steam_sync").unwrap().store_kind(),
            Some(StoreKind::Cache)
        );
        assert_eq!(
            row_for_key("steam_store/config").unwrap().store_kind(),
            Some(StoreKind::Account)
        );
        assert_eq!(row_for_key("store/migrations").unwrap().store_kind(), None);
        assert_eq!(
            row_for_key("store/uploadedLogs").unwrap().store_kind(),
            None
        );
        assert_eq!(
            row_for_key("store_cache/steam_library")
                .unwrap()
                .chain_key(),
            "store_cache/steam_library"
        );
        assert_eq!(
            row_for_key("store/timestamp").unwrap().chain_key(),
            "store/timestamp"
        );
    }

    #[test]
    fn a_path_finds_its_row_and_a_side_file_finds_none() {
        let ud = PathBuf::from("/profile/ud");
        let af = PathBuf::from("/profile/app");
        let key = |p: &str| row_for_path(&ud, &af, Path::new(p)).map(|r| r.key.as_str());
        assert_eq!(
            key("/profile/ud/store/timestamp.json"),
            Some("store/timestamp")
        );
        assert_eq!(
            key("/profile/ud/store_cache/steam_library.json"),
            Some("store_cache/steam_library")
        );
        assert_eq!(key("/profile/app/config.json"), Some("settings/global"));
        assert_eq!(
            key("/profile/app/GamesConfig/480.json"),
            Some("settings/game")
        );
        assert_eq!(
            key("/profile/app/GamesConfig/my.game.json"),
            Some("settings/game")
        );
        assert_eq!(
            key("/profile/app/GamesConfig/480.v0.20261121T090000000Z.bak.json"),
            None
        );
        assert_eq!(
            key("/profile/ud/store/timestamp.v1.20261121T090000000Z.bak.json"),
            None
        );
        assert_eq!(
            key("/profile/ud/store/timestamp.corrupt.20261121T090000000Z.json"),
            None
        );
        assert_eq!(key("/profile/ud/store/nope.json"), None);
        assert_eq!(key("/profile/ud/store/timestamp.json.tmp-1"), None);
        assert_eq!(key("/profile/elsewhere/store/timestamp.json"), None);
        assert_eq!(
            key("/profile/ud/config.json"),
            None,
            "config.json is the app folder's"
        );
    }

    #[test]
    fn one_directory_can_be_both_roots() {
        let root = PathBuf::from("/p");
        let key = |s: &str| row_for_path(&root, &root, Path::new(s)).map(|r| r.key.as_str());
        assert_eq!(key("/p/config.json"), Some("settings/global"));
        assert_eq!(key("/p/store/config.json"), Some("store/config"));
        assert_eq!(key("/p/GamesConfig/x.json"), Some("settings/game"));
    }
}
