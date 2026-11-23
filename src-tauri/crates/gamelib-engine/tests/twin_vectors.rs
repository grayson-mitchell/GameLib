//! The Rust side of the shared twin vectors (Phase 87, 87-28 and 87-39, D-24 extended).
//!
//! 87-39 adds `fixtures/vectors/bottle_twin.json`: the bridge's sync bottle helpers that the TS keeps in
//! `src/backend/enginewine/twin.ts` (`getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned`,
//! `buildFallbackGameSettings`, the three marker views, `isPinnedEngineInstalled`). The second half of this
//! file replays all 216 vectors against `bottles::paths`, `bottles::marker`, `engines`, `bottles::pin_marker`
//! (through `is_pinned_engine_installed`) and `tool_settings::build_fallback_game_settings`; the TS replay is
//! `twinVectors.test.ts`, so neither side can drift without one of the two failing.
//!
//! `fixtures/vectors/engine_twin.json` pins four sync pure helpers that the TypeScript keeps until their
//! callers move (`engineKeyFor`, `isWritableEngineOverride`, `importEngineSettings`,
//! `getPerGameBottleNameFor`, in `src/backend/enginewine/twin.ts`). The 87-12 oracle recorded the vectors
//! from the TS; `src/backend/enginewine/__tests__/twinVectors.test.ts` replays them against the twin and
//! this file replays the same file against `key::engine_key_for_json`,
//! `config::is_writable_engine_override`, `config::import_engine_settings` and
//! `game_engine::per_game_bottle_name_for`, so neither side can drift without one replay failing.
//!
//! A long input is stored as a generator (`{"repeat": {"char", "count"}}`); it is expanded before the call,
//! exactly as the TS replay does. The floors live here next to the replay, so editing the JSON alone cannot
//! lower the bar, and an empty or shrunken file fails.

use gamelib_engine::config::{import_engine_settings, is_writable_engine_override};
use gamelib_engine::game_engine::per_game_bottle_name_for;
use gamelib_engine::key::engine_key_for_json;
use serde_json::Value;

const VECTORS: &str = include_str!("fixtures/vectors/engine_twin.json");

/// The file holds 386 vectors when recorded (87-12): 158, 34, 51 and 143. Never lower a floor to turn a
/// red run green.
const TOTAL_FLOOR: usize = 386;
const GROUP_FLOOR: usize = 34;
const GROUPS: [&str; 4] = [
    "engineKeyFor",
    "isWritableEngineOverride",
    "importEngineSettings",
    "getPerGameBottleNameFor",
];

/// A `{"repeat": {"char", "count"}}` generator becomes its string; everything else is copied as it is.
fn materialise(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(materialise).collect()),
        Value::Object(map) => {
            if map.len() == 1 {
                if let Some(rep) = map.get("repeat") {
                    let ch = rep["char"].as_str().expect("repeat char");
                    let count = rep["count"].as_u64().expect("repeat count") as usize;
                    return Value::String(ch.repeat(count));
                }
            }
            Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), materialise(v)))
                    .collect(),
            )
        }
        other => other.clone(),
    }
}

fn load() -> serde_json::Map<String, Value> {
    match serde_json::from_str::<Value>(VECTORS).expect("engine_twin.json parses") {
        Value::Object(map) => map,
        other => panic!("engine_twin.json is not an object: {other}"),
    }
}

/// What the Rust function answers for one (expanded) input, as the JSON the TS answered. A missing
/// property is `null`, as a missing property is `undefined` in the TS call.
fn replay(group: &str, input: &Value) -> Value {
    let field = |name: &str| input.get(name).cloned().unwrap_or(Value::Null);
    match group {
        "engineKeyFor" => engine_key_for_json(&field("runner"), &field("appName"))
            .map_or(Value::Null, Value::String),
        "isWritableEngineOverride" => Value::Bool(is_writable_engine_override(&field("value"))),
        "importEngineSettings" => import_engine_settings(
            &field("runner"),
            &field("appName"),
            &field("engineOverride"),
        )
        .unwrap_or(Value::Null),
        "getPerGameBottleNameFor" => {
            per_game_bottle_name_for(input).map_or(Value::Null, Value::String)
        }
        other => panic!("unknown vector group {other}"),
    }
}

/// A list is usable only at or above its floor: an empty or shrunken list is an error.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

#[test]
fn the_vector_file_holds_the_four_groups_over_their_floors_and_answers_both_ways() {
    let groups = load();
    let mut names: Vec<&str> = groups.keys().map(String::as_str).collect();
    names.sort_unstable();
    let mut expected = GROUPS.to_vec();
    expected.sort_unstable();
    assert_eq!(names, expected);
    let total: usize = groups
        .values()
        .map(|v| v.as_array().map_or(0, Vec::len))
        .sum();
    check_floor("engine twin vectors", total, TOTAL_FLOOR).unwrap();
    for (name, list) in &groups {
        let list = list.as_array().expect("a group is an array");
        check_floor(name, list.len(), GROUP_FLOOR).unwrap();
        let mut ids: Vec<&str> = list.iter().map(|v| v["id"].as_str().unwrap()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), list.len(), "{name}: duplicate ids");
        // A group that only ever answers null (or only false) would pass a function that refuses all.
        let falsy = |v: &Value| v["expected"].is_null() || v["expected"] == Value::Bool(false);
        assert!(list.iter().any(falsy), "{name}: no refusal vector");
        assert!(
            list.iter().any(|v| !falsy(v)),
            "{name}: no acceptance vector"
        );
    }
}

#[test]
fn every_recorded_vector_replays_against_the_rust_functions() {
    let groups = load();
    let mut replayed = 0;
    for group in GROUPS {
        let list = groups[group].as_array().expect("a group is an array");
        let mismatches: Vec<String> = list
            .iter()
            .filter_map(|vector| {
                let input = materialise(&vector["input"]);
                let got = replay(group, &input);
                (got != vector["expected"]).then(|| {
                    format!(
                        "{group}/{}: expected {}, got {got}",
                        vector["id"].as_str().unwrap(),
                        vector["expected"]
                    )
                })
            })
            .collect();
        assert!(mismatches.is_empty(), "{mismatches:#?}");
        replayed += list.len();
    }
    check_floor("replayed twin vectors", replayed, TOTAL_FLOOR).unwrap();
}

#[test]
fn a_shrunken_list_and_a_wrong_answer_are_caught() {
    assert!(check_floor("empty", 0, TOTAL_FLOOR).is_err());
    assert!(check_floor("shrunken", TOTAL_FLOOR - 1, TOTAL_FLOOR).is_err());
    // The replay is not vacuous: a tampered expected answer is a mismatch.
    let input = serde_json::json!({"runner": "gog", "appName": "620"});
    assert_eq!(replay("getPerGameBottleNameFor", &input), "GameLib-gog-620");
    assert_ne!(replay("getPerGameBottleNameFor", &input), "GameLib-gog-621");
}

// ---------------------------------------------------------------------------------------------
// bottle_twin.json (87-39)
// ---------------------------------------------------------------------------------------------

#[cfg(unix)]
mod bottle_twin {
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;

    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::bottles::marker::{read_marker_summary, restore_needs_absent_pin};
    use gamelib_engine::bottles::paths::{bottle_dir, sanitize_bottle_name};
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_engine::engines::{
        is_bottle_provisioned, is_pinned_engine_installed, read_bottle_engine_marker_kind,
        DxvkBuild, NonCrossoverEngine,
    };
    use gamelib_engine::offline::MarkerKind;
    use gamelib_engine::pins::{pins, EnginePin};
    use gamelib_engine::tool_settings::build_fallback_game_settings;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::{json, Value};

    use super::{check_floor, materialise};

    const VECTORS: &str = include_str!("fixtures/vectors/bottle_twin.json");

    /// The group counts the file held when recorded (87-11); never lower one.
    const GROUP_FLOORS: [(&str, usize); 8] = [
        ("getBottleDir", 16),
        ("sanitizeBottleName", 31),
        ("isBottleProvisioned", 25),
        ("buildFallbackGameSettings", 12),
        ("readBottleEngineMarkerKind", 25),
        ("readBottleEngineMarkerSummary", 25),
        ("restoreNeedsAbsentPin", 46),
        ("isPinnedEngineInstalled", 36),
    ];
    const TOTAL_FLOOR: usize = 216;
    const SYNTHETIC_PIN_LABEL: &str = "Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)";
    const BOTTLES_REL: &str = "Library/Application Support/CrossOver/Bottles";

    fn fixtures() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
    }

    /// A fresh fake profile laid out as the oracle's (`<HOME>`, `<APPFOLDER>`, `<TOOLS>`, `<USERDATA>`).
    struct Profile {
        home: FakeHome,
        app_folder: PathBuf,
        user_data: PathBuf,
        tools: PathBuf,
    }

    impl Profile {
        fn new() -> Profile {
            let home = FakeHome::new("engine-twin-");
            let root = home.root().to_path_buf();
            let app_folder = root.join(".config").join("GameLib");
            Profile {
                user_data: root
                    .join("Library")
                    .join("Application Support")
                    .join("GameLib"),
                tools: app_folder.join("tools"),
                app_folder,
                home,
            }
        }

        fn root(&self) -> &Path {
            self.home.root()
        }

        fn expand(&self, text: &str) -> String {
            let mut out = text.to_string();
            for (token, root) in [
                ("<TOOLS>", &self.tools),
                ("<APPFOLDER>", &self.app_folder),
                ("<USERDATA>", &self.user_data),
                ("<HOME>", &self.root().to_path_buf()),
            ] {
                out = out.replace(token, &root.to_string_lossy());
            }
            out
        }

        /// Every profile root in the answer as its placeholder, longest root first (a root with a
        /// different real path, macOS `/var` against `/private/var`, is listed under both names).
        fn normalise(&self, value: Value) -> Value {
            let as_text = |p: &Path| p.to_string_lossy().into_owned();
            let mut table = vec![
                ("<TOOLS>", as_text(&self.tools)),
                ("<APPFOLDER>", as_text(&self.app_folder)),
                ("<USERDATA>", as_text(&self.user_data)),
                ("<HOME>", as_text(self.root())),
            ];
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    let app = real.join(".config").join("GameLib");
                    table.push(("<TOOLS>", as_text(&app.join("tools"))));
                    table.push(("<APPFOLDER>", as_text(&app)));
                    table.push((
                        "<USERDATA>",
                        as_text(&real.join("Library/Application Support/GameLib")),
                    ));
                    table.push(("<HOME>", as_text(&real)));
                }
            }
            table.sort_by_key(|(_, root)| std::cmp::Reverse(root.len()));
            fn walk(value: Value, table: &[(&'static str, String)]) -> Value {
                match value {
                    Value::String(text) => Value::String(
                        table
                            .iter()
                            .fold(text, |out, (token, root)| out.replace(root.as_str(), token)),
                    ),
                    Value::Array(items) => {
                        Value::Array(items.into_iter().map(|v| walk(v, table)).collect())
                    }
                    Value::Object(map) => {
                        Value::Object(map.into_iter().map(|(k, v)| (k, walk(v, table))).collect())
                    }
                    other => other,
                }
            }
            walk(value, &table)
        }

        /// Copies a committed fixture tree, expanding placeholders in text files and keeping modes.
        fn copy_tree(&self, source: &Path, target: &Path) {
            std::fs::create_dir_all(target).unwrap();
            for entry in std::fs::read_dir(source).unwrap() {
                let entry = entry.unwrap();
                let to = target.join(entry.file_name());
                if entry.file_type().unwrap().is_dir() {
                    self.copy_tree(&entry.path(), &to);
                    continue;
                }
                let mode = std::fs::metadata(entry.path())
                    .unwrap()
                    .permissions()
                    .mode();
                match std::fs::read_to_string(entry.path()) {
                    Ok(text) => std::fs::write(&to, self.expand(&text)).unwrap(),
                    Err(_) => {
                        std::fs::copy(entry.path(), &to).unwrap();
                    }
                }
                std::fs::set_permissions(&to, std::fs::Permissions::from_mode(mode & 0o7777))
                    .unwrap();
            }
        }

        fn lay(&self, input: &Value) {
            if let Some(variant) = input["engines"].as_str().filter(|v| *v != "none") {
                self.copy_tree(&fixtures().join("state/engines").join(variant), &self.tools);
            }
            for name in input["fixtures"].as_array().into_iter().flatten() {
                let name = name.as_str().unwrap();
                self.copy_tree(
                    &fixtures().join("state/bottles").join(name),
                    &self.root().join(BOTTLES_REL).join(name),
                );
            }
            for entry in input["seed"].as_array().into_iter().flatten() {
                let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
                assert!(
                    target.starts_with(self.root()),
                    "seed {target:?} is outside"
                );
                if entry["dir"].as_bool() == Some(true) {
                    std::fs::create_dir_all(&target).unwrap();
                    continue;
                }
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                if let Some(link) = entry["symlink"].as_str() {
                    std::os::unix::fs::symlink(self.expand(link), &target).unwrap();
                } else {
                    std::fs::write(
                        &target,
                        self.expand(entry["text"].as_str().unwrap_or_default()),
                    )
                    .unwrap();
                }
            }
        }

        fn ctx(&self) -> EngineCtx {
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                Platform::Mac,
                EnginePaths {
                    app_folder: self.app_folder.clone(),
                    user_data: self.user_data.clone(),
                    tools_path: self.tools.clone(),
                    user_home: self.root().to_path_buf(),
                    temp: self.root().join("tmp"),
                },
                Shutdown::new(),
            )
        }
    }

    fn kind_text(kind: Option<MarkerKind>) -> Value {
        match kind {
            Some(MarkerKind::Crossover) => json!("crossover"),
            Some(MarkerKind::NonCrossover) => json!("non-crossover"),
            None => Value::Null,
        }
    }

    /// The pin a `isPinnedEngineInstalled` vector names, derived from the current pin.
    fn pin_variant(name: &str) -> EnginePin {
        let mut pin = pins().expect("table parses").current.clone();
        match name {
            "current" => {}
            "wine-sha-differs" => pin.wine.sha256 = "f".repeat(64),
            "dxvk-sha-differs" => pin.dxvk.sha256 = "f".repeat(64),
            "other-id" => pin.id = "wine-staging-0.0".to_string(),
            other => panic!("unknown pin variant {other}"),
        }
        pin
    }

    /// What the Rust function answers for one (expanded) vector input, over a fresh profile when it needs one.
    fn replay(group: &str, input: &Value) -> Value {
        match group {
            "getBottleDir" => {
                let home = input["userHome"].as_str().unwrap_or_default();
                json!(bottle_dir(
                    Path::new(home),
                    input["name"].as_str().unwrap_or_default()
                ))
            }
            // A null, an undefined, a number and an object are not names.
            "sanitizeBottleName" => match (input["kind"].as_str(), input["value"].as_str()) {
                (Some("string"), Some(text)) => {
                    sanitize_bottle_name(text).map_or(Value::Null, Value::String)
                }
                _ => Value::Null,
            },
            _ => {
                let profile = Profile::new();
                profile.lay(input);
                let ctx = profile.ctx();
                let bottle = input["bottle"].as_str().unwrap_or_default();
                let answer = match group {
                    "isBottleProvisioned" => json!(is_bottle_provisioned(&ctx, bottle)),
                    "readBottleEngineMarkerKind" => {
                        kind_text(read_bottle_engine_marker_kind(&ctx, bottle))
                    }
                    "readBottleEngineMarkerSummary" => {
                        read_marker_summary(&ctx, bottle).map_or(Value::Null, |s| s.to_value())
                    }
                    "restoreNeedsAbsentPin" => json!(restore_needs_absent_pin(&ctx, bottle)),
                    "buildFallbackGameSettings" => {
                        let engine = NonCrossoverEngine {
                            wine_bin: profile.expand(
                                "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine",
                            ),
                            wineserver_bin: profile.expand(
                                "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver",
                            ),
                            label: SYNTHETIC_PIN_LABEL.to_string(),
                            version: pins().expect("table parses").current.wine.version.clone(),
                            dxvk: (input["engine"] != "no-dxvk").then(|| DxvkBuild {
                                dir: profile.expand("<TOOLS>/steam-engines/dxvk"),
                                version: "v1".to_string(),
                            }),
                        };
                        let base: Value =
                            serde_json::from_str(&profile.expand(&input["base"].to_string()))
                                .expect("the expanded base parses");
                        build_fallback_game_settings(&ctx, bottle, &engine, &base)
                    }
                    "isPinnedEngineInstalled" => json!(is_pinned_engine_installed(
                        &ctx,
                        &pin_variant(input["pin"].as_str().unwrap_or_default())
                    )),
                    other => panic!("unknown vector group {other}"),
                };
                profile.normalise(answer)
            }
        }
    }

    fn load() -> serde_json::Map<String, Value> {
        match serde_json::from_str::<Value>(VECTORS).expect("bottle_twin.json parses") {
            Value::Object(map) => map,
            other => panic!("bottle_twin.json is not an object: {other}"),
        }
    }

    #[test]
    fn the_bottle_vector_file_holds_the_eight_groups_over_their_floors() {
        let groups = load();
        let mut names: Vec<&str> = groups.keys().map(String::as_str).collect();
        names.sort_unstable();
        let mut expected: Vec<&str> = GROUP_FLOORS.iter().map(|(name, _)| *name).collect();
        expected.sort_unstable();
        assert_eq!(names, expected);
        let total: usize = groups
            .values()
            .map(|v| v.as_array().map_or(0, Vec::len))
            .sum();
        check_floor("bottle twin vectors", total, TOTAL_FLOOR).unwrap();
        for (group, floor) in GROUP_FLOORS {
            let list = groups[group].as_array().expect("a group is an array");
            check_floor(group, list.len(), floor).unwrap();
            let mut ids: Vec<&str> = list.iter().map(|v| v["id"].as_str().unwrap()).collect();
            ids.sort_unstable();
            ids.dedup();
            assert_eq!(ids.len(), list.len(), "{group}: duplicate ids");
            let mut answers: Vec<String> = list.iter().map(|v| v["expected"].to_string()).collect();
            answers.sort_unstable();
            answers.dedup();
            assert!(answers.len() > 1, "{group}: one answer for every input");
        }
    }

    #[test]
    fn every_recorded_bottle_vector_replays_against_the_rust_functions() {
        let groups = load();
        let mut replayed = 0;
        for (group, _) in GROUP_FLOORS {
            let list = groups[group].as_array().expect("a group is an array");
            let mismatches: Vec<String> = list
                .iter()
                .filter_map(|vector| {
                    let input = materialise(&vector["input"]);
                    let got = replay(group, &input);
                    (got != vector["expected"]).then(|| {
                        format!(
                            "{group}/{}: expected {}, got {got}",
                            vector["id"].as_str().unwrap(),
                            vector["expected"]
                        )
                    })
                })
                .collect();
            assert!(mismatches.is_empty(), "{mismatches:#?}");
            replayed += list.len();
        }
        check_floor("replayed bottle twin vectors", replayed, TOTAL_FLOOR).unwrap();
    }

    #[test]
    fn the_bottle_replay_is_not_vacuous() {
        assert!(check_floor("empty", 0, TOTAL_FLOOR).is_err());
        let input = json!({"kind": "string", "value": " GameLib-x "});
        assert_eq!(replay("sanitizeBottleName", &input), "GameLib-x");
        assert_ne!(replay("sanitizeBottleName", &input), " GameLib-x ");
        // A pin whose sha256 differs is not installed, the current one over the installed engines is.
        let installed = json!({"engines": "installed", "pin": "current"});
        let differs = json!({"engines": "installed", "pin": "wine-sha-differs"});
        assert_eq!(replay("isPinnedEngineInstalled", &installed), true);
        assert_eq!(replay("isPinnedEngineInstalled", &differs), false);
    }
}
