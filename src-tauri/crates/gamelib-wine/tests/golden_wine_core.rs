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
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
#[cfg(unix)]
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::command::{run_wine_command, WineCommandArgs, MAX_BUFFER};
use gamelib_wine::wine_cmd::env::{
    build_wine_env_vars, setup_env_vars, setup_wine_env_vars, EnvNote, EnvSnapshot,
    GameSettingsView, WineEnvPaths,
};
use gamelib_wine::wine_cmd::prefix::verify_wine_prefix;
use gamelib_wine::wine_cmd::valid::valid_wine;
use gamelib_wine::wine_cmd::{WineHost, WineInstallation};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// `valid_wine.json` holds 19 vectors; a later edit may raise this, never lower it.
const VALID_FLOOR: usize = 14;
/// `wine_env.json` holds 61 vectors; the plan asks for at least 40.
const ENV_FLOOR: usize = 40;
/// `golden/wine_command` holds 16 cases.
const COMMAND_FLOOR: usize = 16;

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

    /// The placeholder table, most specific root first; a root with a different real path (macOS
    /// `/var` is `/private/var`) is listed under both names.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<TOOLS>", as_text(&self.tools)),
            ("<APPFOLDER>", as_text(&self.app_folder)),
            ("<USERDATA>", as_text(&self.user_data)),
            ("<TMP>", as_text(&self.tmp)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
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
                    table.push(("<TMP>", as_text(&real.join("tmp"))));
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        table
    }

    /// Every profile root in `value`'s strings replaced by its placeholder (object keys are left
    /// alone), Windows separators folded to `/` so one golden serves every OS.
    fn normalise(&self, value: Value) -> Value {
        fn walk(value: Value, table: &[(&'static str, String)]) -> Value {
            match value {
                Value::String(mut s) => {
                    for (token, root) in table {
                        s = s.replace(root.as_str(), token);
                    }
                    if cfg!(windows)
                        && ["<TOOLS>", "<APPFOLDER>", "<USERDATA>", "<TMP>", "<HOME>"]
                            .iter()
                            .any(|t| s.contains(t))
                    {
                        s = s.replace('\\', "/");
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

    /// The eight fake-profile variables as the process environment a command would inherit.
    fn base_env(&self) -> Vec<(String, String)> {
        self.home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect()
    }

    /// Writes a case's starting state: a directory, or a file (with an optional octal `mode`).
    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            if entry["dir"].as_bool() == Some(true) {
                std::fs::create_dir_all(&target).unwrap();
            } else if let Some(text) = entry["text"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, text).unwrap();
                #[cfg(unix)]
                if let Some(mode) = entry["mode"].as_str() {
                    use std::os::unix::fs::PermissionsExt;
                    let bits = u32::from_str_radix(mode, 8).unwrap();
                    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(bits))
                        .unwrap();
                }
            } else {
                panic!("unsupported seed entry: {entry}");
            }
        }
    }

    /// The tree under HOME, as the oracle's `snapshotTree` writes it.
    fn tree(&self) -> Value {
        let mut out: Vec<(String, Value)> = Vec::new();
        walk_tree(self.root(), "", &mut out);
        out.sort_by(|a, b| a.0.cmp(&b.0));
        Value::Array(out.into_iter().map(|(_, v)| v).collect())
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

#[cfg(unix)]
fn mode_text(md: &std::fs::Metadata) -> Option<String> {
    use std::os::unix::fs::PermissionsExt;
    // The low permission bits with group and other WRITE cleared, as the oracle records them: a
    // golden that followed the machine's umask would be flaky, not a finding.
    Some(format!("{:04o}", md.permissions().mode() & 0o7755))
}

#[cfg(not(unix))]
fn mode_text(_md: &std::fs::Metadata) -> Option<String> {
    None
}

fn walk_tree(root: &Path, rel: &str, out: &mut Vec<(String, Value)>) {
    let dir = if rel.is_empty() {
        root.to_path_buf()
    } else {
        root.join(rel)
    };
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    for name in names {
        let rel_path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        let full = root.join(&rel_path);
        let md = std::fs::symlink_metadata(&full).unwrap();
        let mut entry = serde_json::Map::new();
        entry.insert("path".into(), json!(rel_path));
        let kind = if md.file_type().is_symlink() {
            "symlink"
        } else if md.is_dir() {
            "dir"
        } else {
            "file"
        };
        entry.insert("kind".into(), json!(kind));
        if let Some(mode) = mode_text(&md) {
            entry.insert("mode".into(), json!(mode));
        }
        match kind {
            "symlink" => {
                entry.insert(
                    "symlink".into(),
                    json!(std::fs::read_link(&full)
                        .unwrap()
                        .to_string_lossy()
                        .into_owned()),
                );
                out.push((rel_path, Value::Object(entry)));
            }
            "dir" => {
                out.push((rel_path.clone(), Value::Object(entry)));
                walk_tree(root, &rel_path, out);
            }
            _ => {
                let digest = Sha256::digest(std::fs::read(&full).unwrap());
                let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
                entry.insert("sha256".into(), json!(hex));
                out.push((rel_path, Value::Object(entry)));
            }
        }
    }
}

/// The golden's tree with `mode` dropped where this OS records none.
fn comparable_tree(tree: Value) -> Value {
    if cfg!(unix) {
        return tree;
    }
    Value::Array(
        tree.as_array()
            .unwrap()
            .iter()
            .cloned()
            .map(|mut entry| {
                entry.as_object_mut().unwrap().remove("mode");
                entry
            })
            .collect(),
    )
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

// ---------------------------------------------------------------------------------------------
// The env builders against wine_env.json
// ---------------------------------------------------------------------------------------------

/// One `wine_env.json` vector: both builders' maps on a fresh fake HOME, placeholders restored.
fn replay_env(vector: &Value) -> Value {
    let profile = Profile::new();
    profile.make_existing(&vector["existing"]);
    let settings: GameSettingsView =
        serde_json::from_value(profile.expand_deep(&vector["settings"])).unwrap();
    let platform = platform_of(vector["platform"].as_str().unwrap());
    let env: EnvSnapshot = serde_json::from_value(profile.expand_deep(&vector["env"])).unwrap();
    let install_path = vector["installPath"].as_str().map(|p| profile.expand(p));
    let paths = WineEnvPaths {
        flatpak_home: profile.root().to_path_buf(),
        runtime_path: profile.tools.join("runtimes"),
    };
    let actual = json!({
        "setupEnvVars": setup_env_vars(&settings, install_path.as_deref(), platform, &env),
        "setupWineEnvVars": setup_wine_env_vars(
            &settings,
            vector["gameId"].as_str(),
            platform,
            &env,
            &paths,
            &|path| path.exists(),
        ),
    });
    profile.normalise(actual)
}

#[test]
fn every_wine_env_vector_gives_the_recorded_maps() {
    let all = vectors("wine_env.json");
    check_floor("wine_env.json", all.len(), ENV_FLOOR).unwrap();
    for vector in &all {
        let id = vector["id"].as_str().unwrap();
        assert_eq!(replay_env(vector), vector["expected"], "{id}");
    }
}

#[test]
fn the_env_vectors_cover_every_wine_type_and_an_empty_list_fails() {
    let all = vectors("wine_env.json");
    let mut types: Vec<&str> = all
        .iter()
        .map(|v| v["settings"]["wineVersion"]["type"].as_str().unwrap())
        .collect();
    types.sort_unstable();
    types.dedup();
    assert_eq!(types, ["crossover", "proton", "toolkit", "wine"]);
    assert!(check_floor("wine_env.json", 0, ENV_FLOOR).is_err());
}

fn view(settings: Value) -> GameSettingsView {
    serde_json::from_value(settings).unwrap()
}

#[test]
fn a_wine_with_one_lib_folder_notes_the_fallback_and_a_deprecated_ge_name_its_workaround() {
    let paths = WineEnvPaths {
        flatpak_home: PathBuf::from("/h"),
        runtime_path: PathBuf::from("/h/runtimes"),
    };
    let env = EnvSnapshot::default();
    let wine = |name: &str, lib: Option<&str>| {
        view(json!({
            "wineVersion": {"type": "wine", "name": name, "bin": "/b/wine", "lib": lib}
        }))
    };
    let notes = |settings: &GameSettingsView, platform| {
        build_wine_env_vars(settings, None, platform, &env, &paths, &|_| false).notes
    };
    assert_eq!(
        notes(&wine("Wine-9", Some("/l")), Platform::Linux),
        [EnvNote::WineLibFoldersMissing]
    );
    // No lib folders at all is "not missing" on macOS, and still a note on Linux.
    assert!(notes(&wine("Wine-9", None), Platform::Mac).is_empty());
    assert_eq!(
        notes(&wine("Wine-9", None), Platform::Linux),
        [EnvNote::WineLibFoldersMissing]
    );
    for (name, hit) in [
        // Each expectation is what the TS regex answers (checked in Node), not what reads well.
        ("Proton-Proton8-26", true),
        ("Wine-GE-Proton8-26", true),
        ("GE-Proton7-55", true),
        ("Wine-6.0-GE-1", true),
        ("Proton-5.9-GE-2-MF", true),
        ("Wine-GE-4.", true),
        ("GE-Proton9-27", false),
        ("GE-Proton10-1", false),
        ("Wine-GE-4", false),
        ("Proton-8.0", false),
    ] {
        let settings = view(json!({
            "wineVersion": {"type": "proton", "name": name, "bin": "/b/proton"}
        }));
        let got = notes(&settings, Platform::Linux).contains(&EnvNote::DeprecatedGeWorkaround);
        assert_eq!(got, hit, "{name}");
    }
}

// ---------------------------------------------------------------------------------------------
// run_wine_command against golden/wine_command
// ---------------------------------------------------------------------------------------------

fn golden_dir() -> PathBuf {
    fixtures().join("golden/wine_command")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

/// The manifest rules every oracle suite carries: the count equals the cases, it is at or above the
/// floor, and `expected/` holds one folder per case.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    folders: &[String],
) -> Result<(), String> {
    check_floor("wine_command cases", cases.len(), floor)?;
    let count = manifest["count"].as_u64().unwrap_or(0) as usize;
    if count != cases.len() {
        return Err(format!("MANIFEST count {count} != {} cases", cases.len()));
    }
    if manifest["floor"].as_u64().unwrap_or(0) < floor as u64 {
        return Err(format!("MANIFEST floor is below {floor}"));
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
    check_manifest(&cases(), &manifest, COMMAND_FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert!(check_manifest(&[], &manifest, COMMAND_FLOOR, &[]).is_err());
}

/// A context over the profile's layout: the engine's paths, the profile's runtime directory, the
/// given spawn seam and a recording log.
fn profile_ctx(
    profile: &Profile,
    platform: Platform,
    proc: Arc<dyn SpecRunner>,
) -> (WineCtx, Arc<RecordingLog>) {
    let log = Arc::new(RecordingLog::new());
    let root = profile.root().to_path_buf();
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        EnginePaths {
            app_folder: profile.app_folder.clone(),
            user_data: profile.user_data.clone(),
            tools_path: profile.tools.clone(),
            user_home: root,
            temp: profile.tmp.clone(),
        },
        Shutdown::new(),
    )
    .with_log(log.clone())
    .with_proc(proc);
    (
        WineCtx::new(Arc::new(engine), profile.tools.join("runtimes")),
        log,
    )
}

fn scripted_runner(
    profile: &Profile,
    base: &[(String, String)],
    scripted: &Value,
) -> Arc<ScriptedSpecRunner> {
    let mut runner = ScriptedSpecRunner::new(base.to_vec());
    for entry in scripted.as_array().unwrap() {
        let program = profile.expand(entry["program"].as_str().unwrap());
        let out = SpecOutput {
            code: entry["code"].as_i64().map(|c| c as i32),
            stdout: entry["stdout"].as_str().unwrap_or_default().to_string(),
            stderr: entry["stderr"].as_str().unwrap_or_default().to_string(),
            ..SpecOutput::default()
        };
        runner = match entry["argv"].as_array() {
            Some(argv) => {
                let argv: Vec<String> = argv
                    .iter()
                    .map(|a| profile.expand(a.as_str().unwrap()))
                    .collect();
                let refs: Vec<&str> = argv.iter().map(String::as_str).collect();
                runner.on(&program, &refs, out)
            }
            None => runner.on_program(&program, out),
        };
    }
    Arc::new(runner)
}

/// The oracle's `PATH` for a case: the case's directories, then the scripted-bin directory.
fn case_env(profile: &Profile, case: &Value) -> Vec<(String, String)> {
    let mut dirs: Vec<String> = case["path"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|p| profile.expand(p.as_str().unwrap()))
        .collect();
    dirs.push(profile.expand("<HOME>/scripted-bin"));
    let mut env = profile.base_env();
    let path = std::env::join_paths(dirs).expect("the directories hold no separator");
    env.push(("PATH".to_string(), path.to_string_lossy().into_owned()));
    env
}

async fn replay_command(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let platform = platform_of(case["platform"].as_str().unwrap());
    let env = case_env(&profile, case);
    let runner = scripted_runner(&profile, &env, &case["scripted"]);
    let (ctx, log) = profile_ctx(&profile, platform, runner.clone());

    let settings: GameSettingsView =
        serde_json::from_value(profile.expand_deep(&case["settings"])).unwrap();
    let mut args: WineCommandArgs =
        serde_json::from_value(profile.expand_deep(&case["args"])).unwrap();
    let mut host = WineHost {
        env: EnvSnapshot::from_pairs(env),
        ..WineHost::default()
    };
    if case["useDefaultSettings"].as_bool() == Some(true) {
        host.default_settings = Some(settings);
    } else {
        args.game_settings = Some(settings);
    }

    let result = run_wine_command(&ctx, args, &host).await;

    let golden_dir = golden_dir().join("expected").join(id);
    let golden = |name: &str| read_json(&golden_dir.join(name));
    assert_eq!(
        result.to_json(),
        golden("result.json")["result"],
        "{id}: result"
    );

    let spawns = runner.spawns();
    let actual_spawns = Value::Array(spawns.iter().map(|s| s.to_json()).collect());
    assert_eq!(
        profile.normalise(actual_spawns),
        golden("spawns.json"),
        "{id}: spawns"
    );
    assert!(
        runner.unscripted().is_empty(),
        "{id}: unscripted {:?}",
        runner.unscripted()
    );

    // The runner options the TS chose that the spawn seam can state: the environment is replaced, the
    // command has no time limit and the wineserver wait has 30 minutes. `track` and `resolveOn` are
    // the TS runner's own (see deltas.json).
    let events = golden("events.json");
    let events = events.as_array().unwrap();
    let options: Vec<&Value> = events
        .iter()
        .filter(|e| e["kind"] == "runOptions")
        .collect();
    assert_eq!(
        options.len(),
        spawns.len(),
        "{id}: one runOptions event per spawn"
    );
    for (spawn, option) in spawns.iter().zip(&options) {
        assert_eq!(
            option["replaceEnv"],
            json!(spawn.replace_env),
            "{id}: replaceEnv"
        );
        assert_eq!(spawn.label, "wine-command", "{id}: label");
        let expected_timeout = option["timeoutMs"].as_u64().map(Duration::from_millis);
        assert_eq!(spawn.timeout, expected_timeout, "{id}: timeout");
    }

    // What the TS warned and errored; the log carries fixed text.
    let expected_log: Vec<(String, String)> = events
        .iter()
        .filter(|e| e["kind"] == "warning" || e["kind"] == "error")
        .map(|e| {
            let level = if e["kind"] == "warning" {
                "warn"
            } else {
                "error"
            };
            (
                level.to_string(),
                e["message"].as_str().unwrap().to_string(),
            )
        })
        .collect();
    let actual_log: Vec<(String, String)> = log
        .lines()
        .into_iter()
        .filter(|(level, _)| *level == "warn" || *level == "error")
        .map(|(level, text)| (level.to_string(), text))
        .collect();
    assert_eq!(actual_log, expected_log, "{id}: log");

    assert_eq!(
        profile.tree(),
        comparable_tree(golden("tree.json")),
        "{id}: tree"
    );
}

#[tokio::test]
async fn every_wine_command_golden_gives_the_recorded_spawn_trace_result_and_tree() {
    let all = cases();
    check_floor("wine_command cases", all.len(), COMMAND_FLOOR).unwrap();
    for case in &all {
        replay_command(case).await;
    }
}

#[test]
fn the_documented_deltas_name_what_the_rust_runner_leaves_to_its_callers() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut keys: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "chunked-output-and-log-writers",
            "command-parts-not-mutated",
            "track-and-resolve-on",
        ]
    );
    // Each is explained, not just named.
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 80, "{key}");
    }
    // The only golden event kinds the replay does not compare are the ones those deltas explain.
    let mut kinds: Vec<String> = Vec::new();
    for case in cases() {
        let events = read_json(
            &golden_dir()
                .join("expected")
                .join(case["id"].as_str().unwrap())
                .join("events.json"),
        );
        for event in events.as_array().unwrap() {
            let kind = event["kind"].as_str().unwrap().to_string();
            if !kinds.contains(&kind) {
                kinds.push(kind);
            }
        }
    }
    kinds.sort();
    assert_eq!(kinds, ["logWriter", "output", "runOptions", "warning"]);
}

// ---------------------------------------------------------------------------------------------
// The spawn seam, the prefix check, the op
// ---------------------------------------------------------------------------------------------

/// A spawn seam that keeps the spec it was given and answers one output, noting whether the
/// shutdown registry held a registrant while the "child" ran.
struct Capturing {
    specs: Mutex<Vec<ProcSpec>>,
    held: Mutex<Vec<Vec<&'static str>>>,
    shutdown: Shutdown,
}

impl SpecRunner for Capturing {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.specs.lock().unwrap().push(spec);
        // `drain` cancels the token and reports who still holds the registry: this test's own
        // `Shutdown`, 1 ms of budget, nothing else listens to it.
        let held = self.shutdown.drain(Duration::from_millis(1));
        self.held.lock().unwrap().push(held);
        Box::pin(async {
            SpecOutput {
                code: Some(0),
                stdout: "o".into(),
                ..SpecOutput::default()
            }
        })
    }
}

fn wine_settings(profile: &Profile) -> Value {
    json!({
        "winePrefix": profile.expand("<HOME>/Games/prefix"),
        "wineVersion": {
            "type": "wine", "name": "Wine-9",
            "bin": profile.expand("<TOOLS>/wine/Wine-9/bin/wine"),
            "wineserver": profile.expand("<TOOLS>/wine/Wine-9/bin/wineserver"),
        }
    })
}

fn seed_wine(profile: &Profile) {
    profile.seed(&json!([
        {"path": "<TOOLS>/wine/Wine-9/bin/wine", "text": ""},
        {"path": "<TOOLS>/wine/Wine-9/bin/wineserver", "text": ""},
    ]));
}

#[tokio::test]
async fn a_command_runs_as_a_labelled_capped_child_holding_a_registrant_and_ending_on_shutdown() {
    let profile = Profile::new();
    seed_wine(&profile);
    let shutdown = Shutdown::new();
    let capturing = Arc::new(Capturing {
        specs: Mutex::new(Vec::new()),
        held: Mutex::new(Vec::new()),
        shutdown: shutdown.clone(),
    });
    let (mut ctx, _log) = profile_ctx(&profile, Platform::Linux, capturing.clone());
    let engine = Arc::get_mut(&mut ctx.engine).expect("the engine is not shared yet");
    engine.shutdown = shutdown;

    let args: WineCommandArgs = serde_json::from_value(json!({
        "gameSettings": wine_settings(&profile),
        "commandParts": ["game.exe"],
        "skipPrefixCheckIKnowWhatImDoing": true,
    }))
    .unwrap();
    let result = run_wine_command(&ctx, args, &WineHost::default()).await;
    assert_eq!(result.stdout, "o");

    let specs = capturing.specs.lock().unwrap();
    assert_eq!(specs.len(), 1);
    assert_eq!(specs[0].label, "wine-command");
    assert!(specs[0].replace_env);
    assert_eq!(specs[0].max_buffer, MAX_BUFFER);
    const _: () = assert!(MAX_BUFFER <= 8 * 1024 * 1024, "the cap is a bound");
    assert_eq!(specs[0].timeout, None);
    // The spec's cancel is the child of the shutdown token: `drain` cancelled the token, so by now the
    // spec's token reads cancelled.
    assert!(specs[0].cancel.as_ref().is_some_and(|c| c.is_cancelled()));
    // A registrant was held while the child ran.
    assert_eq!(capturing.held.lock().unwrap()[0], ["wine-command"]);
}

/// A wine whose binary is a shell script, over a profile whose environment is the fake HOME's plus a
/// `PATH` for `sh` and its tools. `SpecProcRunner` really spawns it.
#[cfg(unix)]
fn script_wine(profile: &Profile, body: &str) -> (Value, WineHost) {
    use std::os::unix::fs::PermissionsExt;
    let bin = profile.tools.join("wine").join("Wine-9").join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    let wine = bin.join("wine");
    std::fs::write(&wine, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&wine, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::write(bin.join("wineserver"), "").unwrap();
    let mut env = profile.base_env();
    env.push(("PATH".to_string(), "/usr/bin:/bin".to_string()));
    (
        json!({
            "winePrefix": profile.expand("<HOME>/Games/prefix"),
            "wineVersion": {
                "type": "wine", "name": "Wine-9",
                "bin": wine.to_string_lossy(),
                "wineserver": bin.join("wineserver").to_string_lossy(),
            }
        }),
        WineHost {
            env: EnvSnapshot::from_pairs(env),
            ..WineHost::default()
        },
    )
}

#[cfg(unix)]
#[tokio::test]
async fn output_past_the_cap_is_truncated_through_the_real_spawn_seam() {
    let profile = Profile::new();
    let (settings, host) = script_wine(&profile, "head -c 5000000 /dev/zero | tr '\\0' x");
    let (ctx, _log) = profile_ctx(&profile, Platform::Linux, Arc::new(SpecProcRunner));
    let args: WineCommandArgs = serde_json::from_value(json!({
        "gameSettings": settings, "commandParts": ["x"],
        "skipPrefixCheckIKnowWhatImDoing": true,
    }))
    .unwrap();
    let result = tokio::time::timeout(Duration::from_secs(30), run_wine_command(&ctx, args, &host))
        .await
        .expect("the command finishes");
    assert_eq!(result.code, Some(0));
    assert_eq!(result.stdout.len(), MAX_BUFFER);
    assert!(result.truncated);
}

#[cfg(unix)]
#[tokio::test(flavor = "multi_thread")]
async fn a_cancel_and_the_shutdown_token_each_end_a_running_child() {
    for via_shutdown in [false, true] {
        let profile = Profile::new();
        let (settings, mut host) = script_wine(&profile, "sleep 30");
        let cancel = tokio_util::sync::CancellationToken::new();
        host.cancel = Some(cancel.clone());
        let (ctx, _log) = profile_ctx(&profile, Platform::Linux, Arc::new(SpecProcRunner));
        let shutdown = ctx.engine.shutdown.clone();
        let args: WineCommandArgs = serde_json::from_value(json!({
            "gameSettings": settings, "commandParts": ["x"],
            "skipPrefixCheckIKnowWhatImDoing": true,
        }))
        .unwrap();
        let started = std::time::Instant::now();
        let stopper = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(300)).await;
            if via_shutdown {
                // Cancels the token and returns the names still held after 1 ms.
                let _ =
                    tokio::task::spawn_blocking(move || shutdown.drain(Duration::from_millis(1)))
                        .await;
            } else {
                cancel.cancel();
            }
        });
        let result =
            tokio::time::timeout(Duration::from_secs(20), run_wine_command(&ctx, args, &host))
                .await
                .expect("a cancelled command returns");
        stopper.await.unwrap();
        assert!(
            result.ran,
            "via_shutdown={via_shutdown}: the child was started"
        );
        assert_eq!(result.code, None, "via_shutdown={via_shutdown}");
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "the child was ended, not waited out"
        );
    }
}

#[tokio::test]
async fn a_proton_prefix_is_created_by_umu_not_by_mkdir_and_waits_only_for_a_wineserver() {
    let profile = Profile::new();
    profile.seed(&json!([
        {"path": "<TOOLS>/proton/GE-Proton9-27/proton", "text": ""},
        {"path": "<HOME>/scripted-bin/umu-run", "text": "", "mode": "0755"},
    ]));
    let case = json!({"path": ["<HOME>/scripted-bin"]});
    let env = case_env(&profile, &case);
    let runner = Arc::new(ScriptedSpecRunner::new(env.clone()).on_program(
        &profile.expand("<HOME>/scripted-bin/umu-run"),
        SpecOutput {
            code: Some(0),
            ..SpecOutput::default()
        },
    ));
    let (ctx, _log) = profile_ctx(&profile, Platform::Linux, runner.clone());
    let settings: GameSettingsView = serde_json::from_value(json!({
        "winePrefix": profile.expand("<HOME>/Games/prefix"),
        "wineVersion": {
            "type": "proton", "name": "GE-Proton9-27",
            "bin": profile.expand("<TOOLS>/proton/GE-Proton9-27/proton"),
        }
    }))
    .unwrap();
    let host = WineHost {
        env: EnvSnapshot::from_pairs(env),
        ..WineHost::default()
    };
    verify_wine_prefix(&ctx, &settings, &host).await.unwrap();
    let spawns = runner.spawns();
    assert_eq!(spawns.len(), 1);
    assert!(spawns[0].program.ends_with("umu-run"));
    assert_eq!(spawns[0].argv, ["createprefix"]);
    // umu makes the prefix itself: nothing created the directory.
    assert!(!profile.root().join("Games").exists());
}

#[tokio::test]
async fn verifying_a_crossover_or_an_invalid_wine_runs_nothing() {
    let profile = Profile::new();
    let runner = Arc::new(ScriptedSpecRunner::new(profile.base_env()));
    let (ctx, _log) = profile_ctx(&profile, Platform::Mac, runner.clone());
    let missing: GameSettingsView = serde_json::from_value(json!({
        "winePrefix": profile.expand("<HOME>/Games/prefix"),
        "wineVersion": {"type": "wine", "name": "W", "bin": profile.expand("<TOOLS>/nope/wine")}
    }))
    .unwrap();
    let host = WineHost::default();
    verify_wine_prefix(&ctx, &missing, &host).await.unwrap();
    profile.seed(&json!([{"path": "<HOME>/cx/wine", "text": ""}]));
    let crossover: GameSettingsView = serde_json::from_value(json!({
        "winePrefix": profile.expand("<HOME>/Games/prefix"),
        "wineVersion": {"type": "crossover", "name": "CX", "bin": profile.expand("<HOME>/cx/wine")}
    }))
    .unwrap();
    verify_wine_prefix(&ctx, &crossover, &host).await.unwrap();
    assert!(runner.spawns().is_empty());

    // Control: a valid wine with no prefix does run `wineboot --init`, so the two silences above are
    // the guards, not a verify that never runs anything.
    seed_wine(&profile);
    let valid: GameSettingsView = serde_json::from_value(wine_settings(&profile)).unwrap();
    verify_wine_prefix(&ctx, &valid, &host).await.unwrap();
    let spawns = runner.spawns();
    assert_eq!(
        spawns.len(),
        2,
        "wineboot, then wineserver --wait for the missing registry"
    );
    assert_eq!(spawns[0].argv, ["wineboot", "--init"]);
}

#[tokio::test]
async fn the_wine_run_command_op_runs_a_command_and_refuses_a_bad_argument() {
    let profile = Profile::new();
    seed_wine(&profile);
    let env = profile.base_env();
    let runner = Arc::new(ScriptedSpecRunner::new(env.clone()).on_program(
        &profile.expand("<TOOLS>/wine/Wine-9/bin/wine"),
        SpecOutput {
            code: Some(0),
            stdout: "hi".into(),
            ..SpecOutput::default()
        },
    ));
    let (ctx, _log) = profile_ctx(&profile, Platform::Linux, runner.clone());
    let command = json!({
        "gameSettings": wine_settings(&profile),
        "commandParts": ["game.exe"],
        "skipPrefixCheckIKnowWhatImDoing": true,
    });
    let host = json!({"env": env.iter().cloned().collect::<std::collections::BTreeMap<_, _>>()});
    let answer = gamelib_wine::dispatch("wine_run_command", &[command.clone(), host], &ctx).await;
    assert_eq!(answer, Ok(json!({"stdout": "hi", "stderr": "", "code": 0})));
    assert_eq!(runner.spawns().len(), 1);

    for bad in [
        vec![],
        vec![json!("x")],
        vec![json!({"commandParts": ["x"], "surprise": 1})],
        vec![json!({"commandParts": "x"})],
        vec![command.clone(), json!({"nope": 1})],
        vec![command.clone(), json!({}), json!({})],
    ] {
        assert_eq!(
            gamelib_wine::dispatch("wine_run_command", &bad, &ctx).await,
            Err("wine_run_command:bad-args".to_string()),
            "{bad:?}"
        );
    }
    assert_eq!(runner.spawns().len(), 1, "a refused call spawns nothing");
}
