//! The engine configuration against the TS goldens (87-12 recorded them, 87-25 ports them; D-04,
//! D-19): `golden/config` holds one case per behaviour of the effective engine, the global engine,
//! the key and id grammars, the per-game bottle name, the option list, the default engine, tool
//! settings, eligibility and the offline block.
//!
//! Every case replays over a fake HOME laid out as the oracle's profile (`<APPFOLDER>`,
//! `<USERDATA>`, `<TOOLS>`, `<HOME>`), with the case's seed written first; the answer is compared
//! to the golden's `outcome` after the profile roots are turned back into placeholders. A count
//! floor lives here next to the replay, so editing the JSON alone cannot lower the bar, and an empty
//! case list fails. The replays are POSIX only, as the TS oracle's are (`describeSkipOnWindows`).

use std::path::{Path, PathBuf};

use gamelib_engine::game_engine::per_game_bottle_name_for;
use gamelib_engine::ids::parse_engine_override;
use gamelib_engine::key::{app_name_of, engine_key_if_eligible, is_engine_key, GameIdentity};
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// `golden/config` holds 70 cases; a later edit may raise this, never lower it.
const CASE_FLOOR: usize = 70;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/config")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

fn expected_outcome(id: &str) -> Value {
    read_json(&golden_dir().join("expected").join(id).join("result.json"))["outcome"].clone()
}

/// A list is usable only at or above its floor: an empty or shrunken list is an error, so a replay
/// cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

/// The count equals the cases, it is at or above the floor, and `expected/` holds one folder per case.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    folders: &[String],
) -> Result<(), String> {
    check_floor("config cases", cases.len(), floor)?;
    let count = manifest["count"].as_u64().unwrap_or(0) as usize;
    if count != cases.len() {
        return Err(format!("MANIFEST count {count} != {} cases", cases.len()));
    }
    if manifest["floor"].as_u64().unwrap_or(0) < 20 {
        return Err("MANIFEST floor is below 20".to_string());
    }
    let mut ids: Vec<String> = cases
        .iter()
        .map(|c| c["id"].as_str().unwrap_or_default().to_string())
        .collect();
    ids.sort();
    let mut have = folders.to_vec();
    have.sort();
    if ids != have {
        return Err(format!("expected/ folders {have:?} != case ids {ids:?}"));
    }
    Ok(())
}

fn expected_folders() -> Vec<String> {
    std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

#[test]
fn the_manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(&cases(), &manifest, CASE_FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert!(check_manifest(&[], &manifest, CASE_FLOOR, &[]).is_err());
}

#[test]
fn a_shrunken_case_list_fails_the_floor() {
    assert!(check_floor("config cases", CASE_FLOOR - 1, CASE_FLOOR).is_err());
    assert!(check_floor("config cases", CASE_FLOOR, CASE_FLOOR).is_ok());
}

// ---------------------------------------------------------------------------------------------
// The fake profile (the oracle's layout rooted in a fake HOME)
// ---------------------------------------------------------------------------------------------

struct Profile {
    home: FakeHome,
    app_folder: PathBuf,
    user_data: PathBuf,
    tools: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("engine-config-");
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

    /// A placeholder path (`<TOOLS>/wine/x`) as a real one.
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

    /// The placeholder table; a root with a different real path (macOS `/var` is `/private/var`) is
    /// listed under both names. Longest roots first, so `<TOOLS>` wins over `<HOME>`.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
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
                    as_text(
                        &real
                            .join("Library")
                            .join("Application Support")
                            .join("GameLib"),
                    ),
                ));
                table.push(("<HOME>", as_text(&real)));
            }
        }
        table.sort_by_key(|(_, root)| std::cmp::Reverse(root.len()));
        table
    }

    /// Every profile root in `value`'s strings replaced by its placeholder (object keys are left
    /// alone).
    fn normalise(&self, value: Value) -> Value {
        fn walk(value: Value, table: &[(&'static str, String)]) -> Value {
            match value {
                Value::String(mut s) => {
                    for (token, root) in table {
                        s = s.replace(root.as_str(), token);
                    }
                    Value::String(s)
                }
                Value::Array(items) => {
                    Value::Array(items.into_iter().map(|v| walk(v, table)).collect())
                }
                Value::Object(map) => {
                    Value::Object(map.into_iter().map(|(k, v)| (k, walk(v, table))).collect())
                }
                other => other,
            }
        }
        walk(value, &self.placeholders())
    }

    /// `expandDeep`: every placeholder in every string of `value` as a real path.
    fn expand_value(&self, value: &Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.expand(s)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|v| self.expand_value(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), self.expand_value(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    /// Writes a case's starting state: a directory, a symlink, or a file.
    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            if entry["dir"].as_bool() == Some(true) {
                std::fs::create_dir_all(&target).unwrap();
            } else if let Some(link) = entry["symlink"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                #[cfg(unix)]
                std::os::unix::fs::symlink(self.expand(link), &target).unwrap();
                #[cfg(not(unix))]
                let _ = link;
            } else if let Some(text) = entry["text"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, self.expand(text)).unwrap();
            } else {
                panic!("unsupported seed entry: {entry}");
            }
        }
    }

    /// The pinned-engine directory variant a case builds under `<TOOLS>`: a copy of the committed
    /// `state/engines/<variant>` tree, modes kept. `none` is no directory.
    fn build_engines(&self, variant: &str) {
        let source = fixtures().join("state/engines").join(variant);
        copy_tree(&source, &self.tools);
    }

    /// Every file under the profile with its bytes, sorted: two snapshots are equal only when no
    /// file was created, edited or removed (reading engine state never writes, 59-UAT G11).
    fn snapshot(&self) -> Vec<(String, Vec<u8>)> {
        let mut out = Vec::new();
        collect_files(self.root(), self.root(), &mut out);
        out.sort();
        out
    }
}

fn copy_tree(source: &Path, target: &Path) {
    std::fs::create_dir_all(target).unwrap();
    for entry in std::fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let to = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &to);
        } else {
            std::fs::copy(entry.path(), &to).unwrap();
        }
    }
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<(String, Vec<u8>)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries {
        let entry = entry.unwrap();
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .into_owned();
        if entry.file_type().unwrap().is_dir() {
            out.push((format!("{rel}/"), Vec::new()));
            collect_files(root, &path, out);
        } else {
            out.push((rel, std::fs::read(&path).unwrap_or_default()));
        }
    }
}

/// `materialise`: `{repeat: {char, count}}` is a long string stored as a generator.
fn materialise(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(materialise).collect()),
        Value::Object(map) => {
            if map.len() == 1 {
                if let Some(spec) = map.get("repeat") {
                    let ch = spec["char"].as_str().unwrap();
                    let count = spec["count"].as_u64().unwrap() as usize;
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

fn items_of(args: &Value) -> Vec<Value> {
    args["items"].as_array().cloned().unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

/// The ops this build ports; every case's op is in one of the two lists below.
const TRACER_OPS: [&str; 4] = ["bottle-name", "ids", "keys", "eligibility"];

fn run_case(case: &Value) -> Value {
    let profile = Profile::new();
    if let Some(variant) = case["engines"].as_str() {
        profile.build_engines(variant);
    }
    profile.seed(&case["seed"]);
    let before = profile.snapshot();
    let args = profile.expand_value(&materialise(&case["args"]));

    let outcome = match case["op"].as_str().unwrap() {
        "bottle-name" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let name = per_game_bottle_name_for(&item);
                    json!({"input": item, "name": name})
                })
                .collect(),
        ),
        "ids" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let parsed = parse_engine_override(item.get("value").unwrap_or(&Value::Null));
                    json!({"input": item, "parsed": parsed})
                })
                .collect(),
        ),
        "keys" => Value::Array(
            args["keys"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .map(|key| {
                    let text = key.as_str().filter(|k| is_engine_key(k));
                    let app_name = text.map(|k| app_name_of(k).to_string());
                    json!({"key": key, "isEngineKey": text.is_some(), "appNameOf": app_name})
                })
                .collect(),
        ),
        "eligibility" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let key = eligibility_key(&item);
                    json!({"input": item, "key": key})
                })
                .collect(),
        ),
        other => panic!("op {other} is not ported by this build"),
    };

    assert_eq!(
        profile.snapshot(),
        before,
        "reading engine state must not create or edit a file"
    );
    profile.normalise(outcome)
}

fn eligibility_key(item: &Value) -> Option<String> {
    let game = &item["game"];
    let runner = game["runner"].as_str()?;
    let app_name = game["appName"].as_str()?;
    let identity = GameIdentity {
        runner,
        app_name,
        native: game["native"].as_bool() == Some(true),
        install_platform: game["platform"].as_str(),
    };
    engine_key_if_eligible(&identity, item["mac"].as_bool() == Some(true))
}

fn replay(ops: &[&str]) {
    let selected: Vec<Value> = cases()
        .into_iter()
        .filter(|c| ops.contains(&c["op"].as_str().unwrap()))
        .collect();
    check_floor("replayed config cases", selected.len(), 1).unwrap();
    let mut failures = Vec::new();
    for case in &selected {
        let id = case["id"].as_str().unwrap();
        let actual = run_case(case);
        let expected = expected_outcome(id);
        if actual != expected {
            failures.push(format!(
                "{id}:\n  expected {}\n  actual   {}",
                serde_json::to_string(&expected).unwrap(),
                serde_json::to_string(&actual).unwrap()
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn the_tracer_goldens_replay() {
    replay(&TRACER_OPS);
}

/// Every config golden, the 87-25 contract: `MANIFEST count >= 20` and all of them pass.
const ALL_OPS: [&str; 14] = [
    "derive",
    "effective",
    "read-for-game",
    "read-stored",
    "global",
    "engine-id",
    "options",
    "default-engine",
    "bottle-name",
    "ids",
    "keys",
    "eligibility",
    "tool-settings",
    "offline",
];

#[test]
fn every_config_golden_replays() {
    replay(&ALL_OPS);
}

#[test]
fn the_tracer_ops_cover_the_names_the_task_promises() {
    let all = cases();
    for op in TRACER_OPS {
        let count = all.iter().filter(|c| c["op"] == op).count();
        assert!(count >= 1, "no golden case for op {op}");
    }
}
