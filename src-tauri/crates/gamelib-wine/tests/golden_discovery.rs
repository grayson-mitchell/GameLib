//! Wine discovery against the TS goldens (87-08 recorded them, 87-23 ports them; D-22, D-25 (b), D-19):
//!
//! - `golden/discovery`: one case per discovery behaviour, replayed over a fake HOME with a scripted
//!   spawn seam (`mdfind` and `--version` answer what the TS run saw);
//! - `vectors/default_wine.json`: the default wine from a `PATH` string.
//!
//! Nothing here reads the real `PATH`, `HOME` or `/Applications`: the bundles live under the fake
//! HOME, the roots are injected, and the `PATH` is the case's own. A count floor lives in this file
//! next to each replay, so editing the JSON alone cannot lower the bar, and an empty list fails.
//! The replays are POSIX only, as the TS oracle's are (`describeSkipOnWindows`).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingEmitter, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::discovery::default_wine::{default_wine_from_path, is_executable_file};
use gamelib_wine::discovery::{
    discover_alternatives, linux, mac, DiscoveryHost, DiscoveryRoots, DiscoverySettings,
    SteamLibraries,
};
use gamelib_wine::wine_cmd::WineInstallation;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// `golden/discovery` holds 51 cases (33 macOS, 18 Linux); a later edit may raise these, never lower.
const CASE_FLOOR: usize = 51;
const MAC_FLOOR: usize = 33;
/// `vectors/default_wine.json` holds 8 vectors.
const DEFAULT_FLOOR: usize = 8;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/discovery")
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

fn platform_of(name: &str) -> Platform {
    match name {
        "linux" => Platform::Linux,
        "mac" => Platform::Mac,
        other => panic!("unknown platform {other}"),
    }
}

/// The macOS half of the cases: every mac-only op, and `getAlternativeWine` on a Mac.
fn is_mac_case(case: &Value) -> bool {
    matches!(
        case["op"].as_str().unwrap(),
        "crossover" | "wine-on-mac" | "wineskin" | "gptk" | "system-gptk" | "whisky" | "mac-set"
    ) || (case["op"] == "alternative" && case["platform"] == "mac")
}

// ---------------------------------------------------------------------------------------------
// The manifest rules every oracle suite carries
// ---------------------------------------------------------------------------------------------

/// The count equals the cases, it is at or above the floor, and `expected/` holds one folder per case.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    folders: &[String],
) -> Result<(), String> {
    check_floor("discovery cases", cases.len(), floor)?;
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
    check_manifest(&cases(), &manifest, CASE_FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert!(check_manifest(&[], &manifest, CASE_FLOOR, &[]).is_err());
}

#[test]
fn the_case_list_splits_into_the_two_halves_the_floors_name() {
    let all = cases();
    let mac = all.iter().filter(|c| is_mac_case(c)).count();
    assert!(mac >= MAC_FLOOR, "{mac} macOS cases");
    assert!(all.len() - mac >= CASE_FLOOR - MAC_FLOOR);
}

// ---------------------------------------------------------------------------------------------
// The fake profile (the oracle's `buildProfile` layout rooted in a fake HOME)
// ---------------------------------------------------------------------------------------------

struct Profile {
    home: FakeHome,
    app_folder: PathBuf,
    user_data: PathBuf,
    tools: PathBuf,
    tmp: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("wine-disc-");
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

    /// The placeholder table; a root with a different real path (macOS `/var` is `/private/var`) is
    /// listed under both names.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<TOOLS>", as_text(&self.tools)),
            ("<APPFOLDER>", as_text(&self.app_folder)),
            ("<USERDATA>", as_text(&self.user_data)),
            ("<TMP>", as_text(&self.tmp)),
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
                table.push(("<TMP>", as_text(&real.join("tmp"))));
                table.push(("<HOME>", as_text(&real)));
            }
        }
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

    /// The eight fake-profile variables, the environment a spawn is diffed against.
    fn base_env(&self) -> Vec<(String, String)> {
        self.home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect()
    }

    /// Writes a case's starting state: a directory, a symlink, or a file (with an optional octal mode).
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

// ---------------------------------------------------------------------------------------------
// Replaying a case
// ---------------------------------------------------------------------------------------------

/// A context over the profile's layout. The stores live in a second fake HOME so that a case that
/// stores a release list leaves the profile tree as the TS left it (the TS stubbed the store).
fn profile_ctx(
    profile: &Profile,
    store_home: &FakeHome,
    platform: Platform,
    proc: Arc<dyn SpecRunner>,
) -> (WineCtx, Arc<RecordingEmitter>) {
    let emitter = Arc::new(RecordingEmitter::new());
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        EnginePaths {
            app_folder: profile.app_folder.clone(),
            user_data: store_home.root().join("userdata"),
            tools_path: profile.tools.clone(),
            user_home: profile.root().to_path_buf(),
            temp: profile.tmp.clone(),
        },
        Shutdown::new(),
    )
    .with_emitter(emitter.clone())
    .with_proc(proc);
    (
        WineCtx::new(Arc::new(engine), profile.tools.join("runtimes")),
        emitter,
    )
}

fn scripted_runner(profile: &Profile, scripted: &Value) -> Arc<ScriptedSpecRunner> {
    let mut runner = ScriptedSpecRunner::new(profile.base_env());
    for entry in scripted.as_array().unwrap() {
        let program = profile.expand(entry["program"].as_str().unwrap());
        let out = SpecOutput {
            code: entry["code"].as_i64().map(|c| c as i32),
            stdout: profile.expand(entry["stdout"].as_str().unwrap_or_default()),
            stderr: profile.expand(entry["stderr"].as_str().unwrap_or_default()),
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
fn case_path(profile: &Profile, case: &Value) -> String {
    let mut dirs: Vec<String> = case["path"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|p| profile.expand(p.as_str().unwrap()))
        .collect();
    let scripted_bin = profile.expand("<HOME>/scripted-bin");
    if !dirs.contains(&scripted_bin) {
        dirs.push(scripted_bin);
    }
    std::env::join_paths(dirs)
        .expect("the directories hold no separator")
        .to_string_lossy()
        .into_owned()
}

/// What the shell would hand `discover_alternatives` for this case: the fake HOME's roots, the case's
/// `PATH`, settings and Steam-library answer. `/usr/share/steam` is left out (the oracle made it
/// non-existent), so no test reads the machine's.
fn host_for(profile: &Profile, case: &Value) -> DiscoveryHost {
    let settings = case.get("settings").filter(|s| s.is_object());
    let custom_wine_paths = settings
        .map(|s| &s["customWinePaths"])
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|p| profile.expand(p.as_str().unwrap()))
        .collect();
    let steam_libraries = match case.get("steamLibraries") {
        None => Some(SteamLibraries {
            exists: false,
            parsed: false,
            paths: Vec::new(),
        }),
        Some(Value::String(s)) if s == "throws" => None,
        Some(answer) => Some(SteamLibraries {
            exists: answer["exists"].as_bool().unwrap(),
            parsed: answer["parsed"].as_bool().unwrap(),
            paths: answer["paths"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| profile.expand(p.as_str().unwrap()))
                .collect(),
        }),
    };
    DiscoveryHost {
        roots: DiscoveryRoots {
            home: profile.root().to_path_buf(),
            config_path: profile.app_folder.join("config.json"),
            system_steam: None,
        },
        path: Some(case_path(profile, case)),
        settings: DiscoverySettings {
            custom_wine_paths,
            show_valve_proton: settings
                .and_then(|s| s["showValveProton"].as_bool())
                .unwrap_or(false),
        },
        steam_libraries,
        scan_custom: case["scanCustom"].as_bool(),
    }
}

/// Seeds the wine-manager store with a one-entry release list, where the case says the store held one.
fn store_releases(store_home: &FakeHome) {
    let dir = store_home.root().join("userdata").join("store");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("wine-downloader-info.json"),
        r#"{"wine-releases":[{"version":"stored"}]}"#,
    )
    .unwrap();
}

async fn replay(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let store_home = FakeHome::new("wine-disc-store-");
    if case["releasesStored"].as_bool() == Some(true) {
        store_releases(&store_home);
    }
    let platform = platform_of(case["platform"].as_str().unwrap());
    let runner = scripted_runner(&profile, &case["scripted"]);
    let (ctx, emitter) = profile_ctx(&profile, &store_home, platform, runner.clone());
    let host = host_for(&profile, case);

    let found: Vec<WineInstallation> = match case["op"].as_str().unwrap() {
        "crossover" => mac::crossover(&ctx).await,
        "wine-on-mac" => mac::wine_on_mac(&ctx).await,
        "wineskin" => mac::wineskin(&ctx).await,
        "gptk" => mac::game_porting_toolkit(&ctx),
        "system-gptk" => mac::system_gptk(&ctx).await,
        "whisky" => mac::whisky(&ctx),
        "mac-set" => mac::mac_wine_set(&ctx).await,
        // `getLinuxWineSet(deps, scanCustom)`: an absent `scanCustom` is `undefined`, falsy.
        "linux-set" => linux::linux_wine_set(&ctx, &host, host.scan_custom.unwrap_or(false)).await,
        "alternative" => discover_alternatives(&ctx, &host).await,
        other => panic!("{id}: unknown op {other}"),
    };

    let golden = |name: &str| read_json(&golden_dir().join("expected").join(id).join(name));
    let actual = profile.normalise(serde_json::to_value(&found).unwrap());
    assert_eq!(actual, golden("result.json")["result"], "{id}: result");

    let spawns = Value::Array(runner.spawns().iter().map(|s| s.to_json()).collect());
    assert_eq!(
        profile.normalise(spawns),
        golden("spawns.json"),
        "{id}: spawns"
    );
    assert!(
        runner.unscripted().is_empty(),
        "{id}: unscripted {:?}",
        runner.unscripted()
    );
    // Every case stores a release list (or runs no alternative), so no refresh ran.
    assert!(emitter.pushed().is_empty(), "{id}: a refresh ran");
    assert_eq!(
        profile.tree(),
        comparable_tree(golden("tree.json")),
        "{id}: tree"
    );
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

#[cfg(unix)]
#[tokio::test]
async fn every_mac_discovery_golden_gives_the_recorded_list_spawns_and_tree() {
    let mac: Vec<Value> = cases().into_iter().filter(is_mac_case).collect();
    check_floor("macOS discovery cases", mac.len(), MAC_FLOOR).unwrap();
    for case in &mac {
        replay(case).await;
    }
}

#[cfg(unix)]
#[tokio::test]
async fn every_linux_discovery_golden_gives_the_recorded_list_spawns_and_tree() {
    let linux_cases: Vec<Value> = cases().into_iter().filter(|c| !is_mac_case(c)).collect();
    check_floor(
        "Linux discovery cases",
        linux_cases.len(),
        CASE_FLOOR - MAC_FLOOR,
    )
    .unwrap();
    for case in &linux_cases {
        replay(case).await;
    }
}

#[test]
fn the_documented_deltas_name_what_the_rust_discovery_does_differently() {
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
            "executable-probe-is-the-mode-bits",
            "refresh-failure-does-not-reject",
            "steam-libraries-are-an-input",
            "unreadable-plist-skips-the-bundle",
            "windows-answers-empty",
        ]
    );
    // Each is explained, not just named.
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 80, "{key}");
    }
    // The only golden event the replay does not compare is the Steam-library invoke that delta explains.
    let mut kinds: Vec<(String, String)> = Vec::new();
    for case in cases() {
        let events = read_json(
            &golden_dir()
                .join("expected")
                .join(case["id"].as_str().unwrap())
                .join("events.json"),
        );
        for event in events.as_array().unwrap() {
            let kind = (
                event["kind"].as_str().unwrap().to_string(),
                event["channel"].as_str().unwrap_or_default().to_string(),
            );
            if !kinds.contains(&kind) {
                kinds.push(kind);
            }
        }
    }
    assert_eq!(
        kinds,
        [(
            "rustInvoke".to_string(),
            "steamfiles_read_library_folders".to_string()
        )]
    );
}

// ---------------------------------------------------------------------------------------------
// The ops
// ---------------------------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn the_crossover_op_answers_the_list_as_the_function_does_and_refuses_an_argument() {
    let case = cases()
        .into_iter()
        .find(|c| c["id"] == "crossover-two-installs")
        .unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let store_home = FakeHome::new("wine-disc-store-");
    let runner = scripted_runner(&profile, &case["scripted"]);
    let (ctx, _) = profile_ctx(&profile, &store_home, Platform::Mac, runner);

    let answer = gamelib_wine::dispatch("wine_discover_crossover", &[], &ctx)
        .await
        .unwrap();
    let golden = read_json(&golden_dir().join("expected/crossover-two-installs/result.json"));
    assert_eq!(profile.normalise(answer), golden["result"]);

    let err = gamelib_wine::dispatch("wine_discover_crossover", &[json!(1)], &ctx)
        .await
        .unwrap_err();
    assert_eq!(err, "wine_discover_crossover:bad-args");
}

#[cfg(unix)]
#[tokio::test]
async fn the_alternatives_op_takes_one_strict_host_object_and_answers_the_list() {
    let case = cases()
        .into_iter()
        .find(|c| c["id"] == "alternative-wine-mac")
        .unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let store_home = FakeHome::new("wine-disc-store-");
    store_releases(&store_home);
    let runner = scripted_runner(&profile, &case["scripted"]);
    let (ctx, _) = profile_ctx(&profile, &store_home, Platform::Mac, runner);

    let host = json!({
        "roots": { "home": profile.root(), "configPath": profile.app_folder.join("config.json") },
    });
    let answer = gamelib_wine::dispatch("wine_discover_alternatives", &[host], &ctx)
        .await
        .unwrap();
    let golden = read_json(&golden_dir().join("expected/alternative-wine-mac/result.json"));
    assert_eq!(profile.normalise(answer), golden["result"]);

    for bad in [
        vec![],
        vec![json!("x")],
        vec![json!({})],
        vec![json!({ "roots": { "home": "/h", "configPath": "/c", "extra": 1 } })],
        vec![json!({ "roots": { "home": "/h", "configPath": "/c" }, "extra": 1 })],
    ] {
        let err = gamelib_wine::dispatch("wine_discover_alternatives", &bad, &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "wine_discover_alternatives:bad-args", "{bad:?}");
    }
}

// ---------------------------------------------------------------------------------------------
// The default wine from PATH (vectors/default_wine.json)
// ---------------------------------------------------------------------------------------------

fn default_vectors() -> Vec<Value> {
    read_json(&fixtures().join("vectors/default_wine.json"))
        .as_array()
        .unwrap()
        .clone()
}

/// One vector replayed on a fresh fake HOME with the vector's `PATH` (`null` leaves it unset).
fn replay_default(vector: &Value) -> Value {
    let profile = Profile::new();
    profile.seed(&vector["seed"]);
    let path = vector["path"].as_array().map(|dirs| {
        let dirs: Vec<String> = dirs
            .iter()
            .map(|d| profile.expand(d.as_str().unwrap()))
            .collect();
        std::env::join_paths(dirs)
            .unwrap()
            .to_string_lossy()
            .into_owned()
    });
    let wine = default_wine_from_path(path.as_deref(), &is_executable_file, &|p| p.exists());
    profile.normalise(serde_json::to_value(wine).unwrap())
}

#[cfg(unix)]
#[test]
fn every_default_wine_vector_gives_the_recorded_installation() {
    let all = default_vectors();
    check_floor("default_wine vectors", all.len(), DEFAULT_FLOOR).unwrap();
    for vector in &all {
        assert_eq!(
            replay_default(vector),
            vector["expected"],
            "{}",
            vector["id"]
        );
    }
}

#[test]
fn an_empty_default_vector_list_fails_the_floor_and_both_outcomes_are_present() {
    assert!(check_floor("default_wine vectors", 0, DEFAULT_FLOOR).is_err());
    let names: Vec<String> = default_vectors()
        .iter()
        .map(|v| v["expected"]["name"].as_str().unwrap().to_string())
        .collect();
    // A function that always finds, or never finds, wine cannot pass.
    assert!(names.contains(&"Default Wine - Not Found".to_string()));
    assert!(names.contains(&"wine".to_string()));
}

#[cfg(unix)]
#[tokio::test]
async fn the_default_wine_op_answers_the_installation_and_refuses_a_bad_argument() {
    let vector = default_vectors()
        .into_iter()
        .find(|v| v["id"] == "wine-with-wineserver")
        .unwrap();
    let profile = Profile::new();
    profile.seed(&vector["seed"]);
    let store_home = FakeHome::new("wine-disc-store-");
    let (ctx, _) = profile_ctx(
        &profile,
        &store_home,
        Platform::Linux,
        Arc::new(ScriptedSpecRunner::new(Vec::new())),
    );

    let path = profile.expand(vector["path"][0].as_str().unwrap());
    let answer = gamelib_wine::dispatch("wine_default_wine", &[json!(path)], &ctx)
        .await
        .unwrap();
    assert_eq!(profile.normalise(answer), vector["expected"]);
    // No PATH is "not found", as an unset PATH is.
    let unset = gamelib_wine::dispatch("wine_default_wine", &[], &ctx)
        .await
        .unwrap();
    assert_eq!(unset["name"], "Default Wine - Not Found");

    for bad in [
        vec![json!(1)],
        vec![json!("a"), json!("b")],
        vec![json!({})],
    ] {
        let err = gamelib_wine::dispatch("wine_default_wine", &bad, &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, "wine_default_wine:bad-args", "{bad:?}");
    }
}
