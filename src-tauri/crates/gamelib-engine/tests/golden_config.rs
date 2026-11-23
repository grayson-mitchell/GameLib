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

use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::BoxFuture;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::config::{
    derive_engine_from_wine, engine_id_of, engine_id_of_value, read_engine_for_game,
    read_stored_game_config, resolve_effective_engine, resolve_global_engine, ResolveOptions,
};
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::engines::NonCrossoverEngine;
use gamelib_engine::game_engine::{
    default_engine, list_game_engine_options, per_game_bottle_name_for,
};
use gamelib_engine::ids::parse_engine_override;
use gamelib_engine::key::{
    app_name_of, engine_key_for, engine_key_if_eligible, is_engine_key, GameIdentity,
};
use gamelib_engine::offline::{
    offline_launch_certainly_blocked, verdict_value, MarkerKind, OfflineRefusalInput,
};
use gamelib_engine::tool_settings::{
    build_crossover_game_settings, build_fallback_game_settings, build_plain_prefix_settings,
    resolve_tool_settings, resolve_tool_settings_for_id, CtxToolSettingsDeps, EnsureBottleRequest,
    ToolGameId, ToolSettingsDeps,
};
use gamelib_store::host::StoreHost;
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

/// The golden's outcome, with the one documented delta applied (`deltas.json`,
/// `unplain-game-config-name-reads-as-no-entry`): a GamesConfig name the store host refuses reads as
/// no entry, where the TS read the hand-placed file.
fn expected_outcome(id: &str) -> Value {
    let mut outcome =
        read_json(&golden_dir().join("expected").join(id).join("result.json"))["outcome"].clone();
    if id == "read-stored-name-guards" {
        for item in outcome.as_array_mut().unwrap() {
            if item["input"]["appName"] == "dots..in" {
                item["entry"] = Value::Null;
            }
        }
    }
    outcome
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

    /// The engine context over this profile: the case's platform, and CrossOver where the case
    /// scripts it (the real locator probes `/Applications` and Spotlight, the operator's machine).
    fn ctx(&self, case: &Value) -> EngineCtx {
        let platform = match case["platform"].as_str() {
            Some("linux") => Platform::Linux,
            Some("windows") => Platform::Windows,
            _ => Platform::Mac,
        };
        let paths = EnginePaths {
            app_folder: self.app_folder.clone(),
            user_data: self.user_data.clone(),
            tools_path: self.tools.clone(),
            user_home: self.root().to_path_buf(),
            temp: self.root().join("tmp"),
        };
        let ctx = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            paths,
            Shutdown::new(),
        );
        if case["crossover"].as_str() == Some("present") {
            let bin_dir = self
                .expand("<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin");
            return ctx.with_crossover_bin_dir(Arc::new(move || {
                let bin_dir = bin_dir.clone();
                Box::pin(async move { Some(bin_dir) })
            }));
        }
        ctx
    }

    /// What the shell's boot sweep does to the settings documents: opens each through the host.
    fn boot_sweep(&self, ctx: &EngineCtx) {
        let global = self.app_folder.join("config.json");
        if global.exists() {
            let _ = ctx.host.open_doc("settings/global", global);
        }
        let games = self.app_folder.join("GamesConfig");
        for entry in std::fs::read_dir(&games).into_iter().flatten().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(app) = name.strip_suffix(".json") {
                let _ = ctx
                    .host
                    .open_doc(&format!("GamesConfig/{app}"), entry.path());
            }
        }
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

fn block_on<F: Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}

/// The in-memory half the tool-settings golden scripts: the engine registry's live selection and
/// its launch overlay (`setEngineSelection`, `getLaunchSettings`), and the bottle flight, which
/// records its arguments. Everything else is the crate's own reads over the fake profile.
struct ScriptedDeps<'a> {
    ctx: &'a EngineCtx,
    base: CtxToolSettingsDeps<'a>,
    selection: Option<Value>,
    context: Option<Value>,
    ensure_error: bool,
    ensure_calls: Mutex<Vec<Value>>,
}

impl ScriptedDeps<'_> {
    fn engine_of(selection: &Value) -> NonCrossoverEngine {
        let text = |key: &str| selection[key].as_str().unwrap_or_default().to_string();
        NonCrossoverEngine {
            wine_bin: text("wineBin"),
            wineserver_bin: text("wineserverBin"),
            label: text("label"),
            version: text("version"),
            dxvk: None,
        }
    }
}

impl ToolSettingsDeps for ScriptedDeps<'_> {
    fn has_live_selection(&self, _key: &str) -> bool {
        self.selection.is_some()
    }

    fn overlay(&self, _key: &str, stored: &Value) -> Value {
        let (Some(selection), Some(context)) = (&self.selection, &self.context) else {
            return stored.clone();
        };
        let bottle = (context["prefix"]["kind"] == "bottle")
            .then(|| context["prefix"]["bottleName"].as_str().unwrap_or_default());
        if selection["kind"] == "crossover" {
            let Some(bottle) = bottle else {
                return stored.clone();
            };
            let bin_dir = context["binDir"]
                .as_str()
                .or_else(|| selection["binDir"].as_str())
                .unwrap_or_default();
            return build_crossover_game_settings(
                stored,
                bottle,
                bin_dir,
                selection["crossoverBuild"].as_str(),
            );
        }
        let engine = Self::engine_of(selection);
        match bottle {
            Some(bottle) => build_fallback_game_settings(self.ctx, bottle, &engine, stored),
            None => build_plain_prefix_settings(stored, &engine),
        }
    }

    fn is_provisioned(&self, bottle_name: &str) -> bool {
        self.base.is_provisioned(bottle_name)
    }

    fn ensure_game_bottle(&self, request: EnsureBottleRequest) -> BoxFuture<bool> {
        self.ensure_calls.lock().unwrap().push(json!({
            "key": request.key,
            "bottleName": request.bottle_name,
            "appName": request.app_name,
            "runner": request.runner,
        }));
        let ok = !self.ensure_error;
        Box::pin(async move { ok })
    }

    fn marker_kind(&self, bottle_name: &str) -> Option<MarkerKind> {
        self.base.marker_kind(bottle_name)
    }

    fn crossover_bin_dir(&self) -> BoxFuture<Option<String>> {
        self.base.crossover_bin_dir()
    }

    fn non_crossover_engine(&self, engine_id: &str) -> Option<NonCrossoverEngine> {
        self.base.non_crossover_engine(engine_id)
    }
}

/// One tool-settings item: `setEngineSelection` (refusing a bad key or missing binaries), then the
/// resolver through the game or the id entry point.
fn tool_settings_item(ctx: &EngineCtx, item: Value) -> Value {
    let spec = &item["game"];
    let runner = spec["runner"].as_str().unwrap_or_default();
    let app_name = spec["appName"].as_str().unwrap_or_default();
    let key = engine_key_for(runner, app_name);
    let live = item.get("live");
    let mut live_set = Value::Null;
    let mut selection = None;
    if let (Some(live), Some(key)) = (live, key.as_deref()) {
        let candidate = live["selection"].clone();
        let accepted = is_engine_key(key)
            && (candidate["kind"] == "crossover"
                || (Path::new(candidate["wineBin"].as_str().unwrap_or("")).exists()
                    && Path::new(candidate["wineserverBin"].as_str().unwrap_or("")).exists()));
        live_set = json!(accepted);
        if accepted {
            selection = Some(candidate);
        }
    }
    let deps = ScriptedDeps {
        ctx,
        base: CtxToolSettingsDeps::new(ctx),
        selection,
        context: live.and_then(|l| l.get("context")).cloned(),
        ensure_error: item["ensure"] == "error",
        ensure_calls: Mutex::new(Vec::new()),
    };
    let stored = item["stored"].clone();
    let ensure_bottle = item["ensureBottle"].as_bool().unwrap_or(false);
    let platform = spec["platform"].as_str();
    let result = if item["via"] == "id" {
        let id = ToolGameId {
            runner,
            app_name,
            platform,
        };
        block_on(resolve_tool_settings_for_id(
            ctx,
            &deps,
            &id,
            &stored,
            ensure_bottle,
        ))
    } else {
        let game = GameIdentity {
            runner,
            app_name,
            native: spec["native"].as_bool() == Some(true),
            install_platform: platform,
        };
        block_on(resolve_tool_settings(
            ctx,
            &deps,
            &game,
            &stored,
            ensure_bottle,
        ))
    };
    let calls = deps.ensure_calls.lock().unwrap().clone();
    json!({"input": item, "liveSet": live_set, "result": result.to_value(), "ensureCalls": calls})
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
    let ctx = profile.ctx(case);
    // The shell opens (and migrates) every settings document at boot, before any engine read: the
    // seeds are the oldest shape, so the sweep stands in for that boot. After it, a read writes
    // nothing.
    profile.boot_sweep(&ctx);
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
        "derive" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let effective = derive_engine_from_wine(&ctx, item.get("wine"));
                    json!({"input": item, "effective": effective.to_value(), "id": engine_id_of(&effective)})
                })
                .collect(),
        ),
        "effective" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let effective = resolve_effective_engine(
                        &ctx,
                        item.get("entry").and_then(Value::as_object),
                        item.get("inherited"),
                        &ResolveOptions {
                            legacy_key: item.get("legacyKey").and_then(Value::as_str),
                            derive: item["derive"].as_bool().unwrap_or(false),
                        },
                    );
                    json!({"input": item, "effective": effective.to_value(), "id": engine_id_of(&effective)})
                })
                .collect(),
        ),
        "read-for-game" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let runner = item["runner"].as_str().unwrap();
                    let effective =
                        read_engine_for_game(&ctx, runner, item["appName"].as_str().unwrap());
                    json!({
                        "input": item,
                        "steamStore": gamelib_engine::key::uses_bottle_runtime(runner),
                        "effective": effective.to_value(),
                        "id": engine_id_of(&effective),
                    })
                })
                .collect(),
        ),
        "read-stored" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let entry = item["appName"]
                        .as_str()
                        .and_then(|name| read_stored_game_config(&ctx, name));
                    json!({"input": item, "entry": entry.map_or(Value::Null, Value::Object)})
                })
                .collect(),
        ),
        "global" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let settings = item.as_object().cloned().unwrap_or_default();
                    let effective = resolve_global_engine(&ctx, &settings);
                    json!({"input": item, "effective": effective.to_value(), "id": engine_id_of(&effective)})
                })
                .collect(),
        ),
        "engine-id" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| json!({"id": engine_id_of_value(&item), "input": item}))
                .collect(),
        ),
        "options" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let options = block_on(list_game_engine_options(&ctx, &item));
                    json!({"input": item, "options": options})
                })
                .collect(),
        ),
        "default-engine" => default_engine(&ctx).to_value(),
        "offline" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| {
                    let input = OfflineRefusalInput::from_value(&item);
                    json!({"input": item, "verdict": verdict_value(offline_launch_certainly_blocked(&input))})
                })
                .collect(),
        ),
        "tool-settings" => Value::Array(
            items_of(&args)
                .into_iter()
                .map(|item| tool_settings_item(&ctx, item))
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

fn replay(ops: &[&str], floor: usize) {
    let selected: Vec<Value> = cases()
        .into_iter()
        .filter(|c| ops.contains(&c["op"].as_str().unwrap()))
        .collect();
    check_floor("replayed config cases", selected.len(), floor).unwrap();
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
fn the_documented_deltas_are_exactly_the_three_this_replay_treats_differently() {
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
            "registry-log-lines-and-tree-hashes-are-not-replayed",
            "settings-documents-are-the-hosts-view",
            "unplain-game-config-name-reads-as-no-entry",
        ]
    );
    // Each is explained, not just named.
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 200, "{key}");
    }
}

#[test]
fn the_tracer_goldens_replay() {
    replay(&TRACER_OPS, 7);
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
    replay(&ALL_OPS, CASE_FLOOR);
}

#[test]
fn the_tracer_ops_cover_the_names_the_task_promises() {
    let all = cases();
    for op in TRACER_OPS {
        let count = all.iter().filter(|c| c["op"] == op).count();
        assert!(count >= 1, "no golden case for op {op}");
    }
}
