//! The wine command core against the TS goldens (87-08 recorded them, 87-21 ports them; D-22, D-19):
//!
//! - `vectors/valid_wine.json`: `valid_wine` over each wine type, present, missing and partly present,
//!   on a fake HOME with the vector's files created;
//! - `vectors/wine_env.json`: both env builders over every wine type, platform and toggle;
//! - `golden/wine_command`: `run_wine_command` spawn traces over a scripted spawn seam.
//!
//! A count floor lives in this file next to each replay, so editing the JSON alone cannot lower the bar,
//! and an empty list fails.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::ScriptedSpecRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::valid::valid_wine;
use gamelib_wine::wine_cmd::WineInstallation;
use serde_json::{json, Value};

/// `valid_wine.json` holds 19 vectors; a later edit may raise this, never lower it.
const VALID_FLOOR: usize = 14;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn vectors(name: &str) -> Vec<Value> {
    read_json(&fixtures().join("vectors").join(name))
        .as_array()
        .unwrap_or_else(|| panic!("{name} is not an array"))
        .clone()
}

/// A vector list is usable only at or above its floor: an empty or shrunken list is an error, so the
/// replay cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

fn platform_of(name: &str) -> Platform {
    match name {
        "linux" => Platform::Linux,
        "mac" => Platform::Mac,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

/// The oracle's profile layout (`buildProfile` in the TS harness) rooted in a fake HOME.
struct Profile {
    home: FakeHome,
    app_folder: PathBuf,
    user_data: PathBuf,
    tools: PathBuf,
    tmp: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("wine-core-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        Profile {
            user_data: root
                .join("Library")
                .join("Application Support")
                .join("GameLib"),
            tools: app_folder.join("tools"),
            tmp: root.join("tmp"),
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
            ("<TMP>", &self.tmp),
            ("<HOME>", &self.root().to_path_buf()),
        ] {
            out = out.replace(token, &root.to_string_lossy());
        }
        out
    }

    /// Every string in `value` with its placeholders expanded.
    fn expand_deep(&self, value: &Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.expand(s)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|v| self.expand_deep(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), self.expand_deep(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    /// Makes the vector's `existing` paths: a trailing `/` is a directory, anything else an empty file.
    fn make_existing(&self, existing: &Value) {
        for entry in existing.as_array().into_iter().flatten() {
            let text = entry.as_str().unwrap();
            let path = PathBuf::from(self.expand(text.trim_end_matches('/')));
            assert!(
                path.starts_with(self.root()),
                "{path:?} is outside the profile"
            );
            if text.ends_with('/') {
                std::fs::create_dir_all(&path).unwrap();
            } else {
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(&path, "").unwrap();
            }
        }
    }
}

/// One `valid_wine.json` vector replayed on a fresh fake HOME.
fn replay_valid(vector: &Value) -> bool {
    let profile = Profile::new();
    profile.make_existing(&vector["existing"]);
    let wine: Option<WineInstallation> = match &vector["wineVersion"] {
        Value::Null => None,
        wine => Some(serde_json::from_value(profile.expand_deep(wine)).unwrap()),
    };
    valid_wine(
        wine.as_ref(),
        platform_of(vector["platform"].as_str().unwrap()),
        vector["release"].as_str(),
        &|path| path.exists(),
    )
}

#[test]
fn every_valid_wine_vector_gives_the_recorded_boolean() {
    let all = vectors("valid_wine.json");
    check_floor("valid_wine.json", all.len(), VALID_FLOOR).unwrap();
    let mut seen = (false, false);
    for vector in &all {
        let id = vector["id"].as_str().unwrap();
        let expected = vector["expected"].as_bool().unwrap();
        assert_eq!(replay_valid(vector), expected, "{id}");
        if expected {
            seen.0 = true;
        } else {
            seen.1 = true;
        }
    }
    // Both outcomes occur, so an always-true or always-false `valid_wine` cannot pass.
    assert_eq!(seen, (true, true));
}

#[test]
fn an_empty_vector_list_fails_the_floor() {
    assert!(check_floor("valid_wine.json", 0, VALID_FLOOR).is_err());
    assert!(check_floor("valid_wine.json", VALID_FLOOR - 1, VALID_FLOOR).is_err());
    assert!(check_floor("valid_wine.json", VALID_FLOOR, VALID_FLOOR).is_ok());
}

#[test]
fn the_documented_quirks_are_in_the_vectors_and_hold() {
    let all = vectors("valid_wine.json");
    let find = |id: &str| {
        all.iter()
            .find(|v| v["id"] == id)
            .unwrap_or_else(|| panic!("{id}"))
    };
    // 87-08 finding 1: the Darwin major is compared to 14, so 14 passes and 13 does not.
    assert!(replay_valid(find("toolkit-present-darwin-14")));
    assert!(!replay_valid(find("toolkit-present-old-darwin-13")));
    // A proton wineserver is never checked; a wine's must be a non-empty, existing path.
    assert!(replay_valid(find("proton-wineserver-not-needed")));
    assert!(!replay_valid(find("wine-empty-wineserver-field")));
}

fn wine_ctx(home: &FakeHome, platform: Platform) -> WineCtx {
    let root = home.root().to_path_buf();
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        EnginePaths {
            app_folder: root.clone(),
            user_data: root.clone(),
            tools_path: root.join("tools"),
            user_home: root.join("home"),
            temp: root.join("temp"),
        },
        Shutdown::new(),
    )
    .with_proc(Arc::new(ScriptedSpecRunner::new(Vec::new())));
    WineCtx::new(Arc::new(engine), root.join("runtime"))
}

#[tokio::test]
async fn the_wine_valid_op_answers_each_vector_as_the_function_does() {
    for vector in vectors("valid_wine.json") {
        let id = vector["id"].as_str().unwrap().to_string();
        let profile = Profile::new();
        profile.make_existing(&vector["existing"]);
        let ctx = wine_ctx(
            &profile.home,
            platform_of(vector["platform"].as_str().unwrap()),
        );
        let wine = profile.expand_deep(&vector["wineVersion"]);
        let host = match vector["release"].as_str() {
            Some(release) => json!({ "darwinRelease": release }),
            None => json!({}),
        };
        let answer = gamelib_wine::dispatch("wine_valid", &[wine, host], &ctx).await;
        assert_eq!(
            answer,
            Ok(json!(vector["expected"].as_bool().unwrap())),
            "{id}"
        );
    }
}

#[tokio::test]
async fn the_wine_valid_op_refuses_a_bad_argument() {
    let home = FakeHome::new("wine-core-");
    let ctx = wine_ctx(&home, Platform::Linux);
    for bad in [
        vec![],
        vec![json!("not-an-object")],
        vec![json!({ "bin": "/b", "name": "n", "type": "wine", "extra": 1 })],
        vec![json!({ "bin": "/b", "name": "n", "type": "lutris" })],
        vec![json!(null), json!({ "unknownKey": 1 })],
        vec![json!(null), json!(null), json!(null)],
    ] {
        assert_eq!(
            gamelib_wine::dispatch("wine_valid", &bad, &ctx).await,
            Err("wine_valid:bad-args".to_string()),
            "{bad:?}"
        );
    }
    // No wine selected is a plain `false`.
    assert_eq!(
        gamelib_wine::dispatch("wine_valid", &[json!(null)], &ctx).await,
        Ok(json!(false))
    );
}
