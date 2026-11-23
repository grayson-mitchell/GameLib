//! The bottle state primitives against the TS goldens (87-11 recorded them, 87-38 ports the state
//! half, 87-39 the create, kill and removal half; D-07, D-08, D-19): `golden/bottles` holds one case
//! per behaviour of the engine marker (record, reconcile, the three read-only views), the
//! `cxbottle.conf` writer, the provisioned check, the running-games ledger, the engine registry and
//! the prefix resolver.
//!
//! Every case replays over a fake HOME laid out as the oracle's profile (`<APPFOLDER>`, `<TOOLS>`,
//! `<HOME>`): the case's pinned-engine variant is copied from `state/engines`, each named fixture
//! bottle from `state/bottles` (the `<TOOLS>` and `<HOME>` placeholders expanded), and the case's
//! seed written. The answer, the marker bytes of every bottle, the log lines and the before and
//! after trees (path, kind, mode, sha256 over the placeholder-normalised content) are compared to the
//! golden. A count floor lives here beside the replay, so editing the JSON alone cannot lower the
//! bar, and an empty case list fails. POSIX only, as the TS oracle's replays are.
//!
//! The CrossOver create, wineserver kill and guarded removal cases (`create-crossover`, `kill`,
//! `remove-created`, 87-39) replay here too, against a scripted `SpecRunner` whose spawn trace and time
//! limits are compared as well, and so do the fallback create and the per-game ensure cases
//! (`create-fallback`, `ensure`, 87-40), which add a scripted DXVK installer whose requests are compared
//! and a cancel that fires from inside a spawn or the installer. A case whose op is in none of the
//! lists fails the suite.
#![cfg(unix)]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::FutureExt;
use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::bottles::conf::{build_cxbottle_conf, write_cxbottle_conf};
use gamelib_engine::bottles::fallback_bottle::create_fallback_bottle_with;
use gamelib_engine::bottles::lifecycle::{
    create_crossover_bottle, kill_bottle_wineserver, remove_created_bottle_dir, CreateOptions,
    KILL_TIMEOUT_MS,
};
use gamelib_engine::bottles::marker::{
    self, read_marker_summary, reconcile_with, record_crossover_with, record_pinned_with,
    restore_needs_absent_pin, Gate,
};
use gamelib_engine::bottles::paths::bottle_dir;
use gamelib_engine::bottles::per_game::{
    ensure_per_game_bottle, CreationDecision, EnsureArgs, PerGameDeps, PinOutcome,
};
use gamelib_engine::bottles::prefix::resolve_game_prefix_value;
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::dxvk::{DxvkInstaller, DxvkRequest};
use gamelib_engine::engines::{
    is_bottle_provisioned, read_bottle_engine_marker_kind, DxvkBuild, NonCrossoverEngine,
};
use gamelib_engine::offline::MarkerKind;
use gamelib_engine::pins::{pins, EnginePin};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use gamelib_store::version_gate::GateState;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::panic::AssertUnwindSafe;
use tokio_util::sync::CancellationToken;

/// `golden/bottles` holds 146 cases; a later edit may raise this, never lower it.
const CASE_FLOOR: usize = 140;

/// The ops this build replays (the state half of the slice).
const STATE_OPS: [&str; 9] = [
    "views",
    "reconcile",
    "record-pinned",
    "record-crossover",
    "provisioned",
    "conf-write",
    "ledger",
    "registry",
    "resolve-prefix",
];

/// The ops 87-39 ports: CrossOver bottle creation, the wineserver kill and the guarded removal.
const LIFECYCLE_OPS: [&str; 3] = ["create-crossover", "kill", "remove-created"];

/// The ops 87-40 ports: the fallback bottle creation and the per-game flight.
const FALLBACK_OPS: [&str; 2] = ["create-fallback", "ensure"];

/// The two replayed ops of the pinned engine the fixture markers name.
const SYNTHETIC_PIN_LABEL: &str = "Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)";
const CURRENT_PIN_ID: &str = "wine-staging-11.20";
const CURRENT_PIN_WINE_VERSION: &str = "11.20";
const CURRENT_PIN_DXVK_VERSION: &str = "v1.10.3-20230507-repack";
const WINESERVER_BIN: &str =
    "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver";
const CX_BIN_DIR: &str = "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const BOTTLE_ID_3: &str = "AAAAAAAA-0000-4000-8000-000000000003";
/// The BottleID the TS oracle's generator answered for the fallback creations.
const BOTTLE_ID_4: &str = "AAAAAAAA-0000-4000-8000-000000000004";
const WINE_BIN: &str = "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine";
const BOTTLES_REL: &str = "Library/Application Support/CrossOver/Bottles";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/bottles")
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

/// The count equals the cases, it is at or above the floor, and `expected/` holds one folder per case.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    folders: &[String],
) -> Result<(), String> {
    check_floor("bottle cases", cases.len(), floor)?;
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
    assert!(check_floor("bottle cases", CASE_FLOOR - 1, CASE_FLOOR).is_err());
    assert!(check_floor("bottle cases", CASE_FLOOR, CASE_FLOOR).is_ok());
}

#[test]
fn every_case_op_is_replayed_here() {
    for case in cases() {
        let op = case["op"].as_str().unwrap();
        assert!(
            STATE_OPS.contains(&op) || LIFECYCLE_OPS.contains(&op) || FALLBACK_OPS.contains(&op),
            "case {} has op {op}, which no list names",
            case["id"]
        );
    }
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
        let home = FakeHome::new("engine-bottles-");
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

    fn bottles_root(&self) -> PathBuf {
        self.root().join(BOTTLES_REL)
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

    /// Every profile root in `text` replaced by its placeholder (`normalisePaths`).
    fn normalise_text(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in self.placeholders() {
            out = out.replace(root.as_str(), token);
        }
        out
    }

    /// [`Profile::normalise_text`] over every string of `value` (object keys are left alone).
    fn normalise(&self, value: Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.normalise_text(&s)),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.normalise(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, self.normalise(v)))
                    .collect(),
            ),
            other => other,
        }
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
                std::os::unix::fs::symlink(self.expand(link), &target).unwrap();
            } else if let Some(text) = entry["text"].as_str() {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, self.expand(text)).unwrap();
            } else {
                panic!("unsupported seed entry: {entry}");
            }
        }
    }

    /// The pinned-engine directory variant a case builds under `<TOOLS>`: a copy of the committed
    /// `state/engines/<variant>` tree, modes kept. `none` and an absent variant are no directory.
    fn build_engines(&self, variant: &str) {
        copy_tree(
            &fixtures().join("state/engines").join(variant),
            &self.tools,
            None,
        );
    }

    /// A fixture bottle: the committed `state/bottles/<name>` tree under the Bottles root, with the
    /// `<TOOLS>` and `<HOME>` placeholders of its text expanded and its modes kept.
    fn build_bottle(&self, name: &str) {
        self.build_bottle_as(name, name);
    }

    /// The fixture bottle `fixture` laid down under the name `name` (what a scripted `cxbottle` leaves).
    fn build_bottle_as(&self, fixture: &str, name: &str) {
        copy_tree(
            &fixtures().join("state/bottles").join(fixture),
            &self.bottles_root().join(name),
            Some(self),
        );
    }

    fn ctx(&self, log: Arc<RecordingLog>) -> EngineCtx {
        self.ctx_with(log, None)
    }

    fn ctx_with(&self, log: Arc<RecordingLog>, proc: Option<Arc<dyn SpecRunner>>) -> EngineCtx {
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
            Platform::Mac,
            paths,
            Shutdown::new(),
        );
        let ctx = match proc {
            Some(proc) => ctx.with_proc(proc),
            None => ctx,
        };
        ctx.with_log(log)
    }

    /// `snapshotNormalised`: every entry under the profile, sorted by path, with each file's sha256
    /// taken over its content with the profile roots as placeholders and a symlink's target likewise.
    fn snapshot(&self) -> Value {
        let mut entries = Vec::new();
        self.walk(Path::new(""), &mut entries);
        entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        Value::Array(entries)
    }

    fn walk(&self, rel: &Path, out: &mut Vec<Value>) {
        let dir = self.root().join(rel);
        for entry in std::fs::read_dir(&dir).unwrap().flatten() {
            let rel_path = rel.join(entry.file_name());
            let full = self.root().join(&rel_path);
            let meta = std::fs::symlink_metadata(&full).unwrap();
            let path = rel_path.to_string_lossy().into_owned();
            let mode = format!("{:04o}", meta.permissions().mode() & 0o7755);
            if meta.file_type().is_symlink() {
                let target = std::fs::read_link(&full).unwrap();
                out.push(json!({
                    "path": path, "kind": "symlink", "mode": mode,
                    "symlink": self.normalise_text(&target.to_string_lossy()),
                }));
            } else if meta.is_dir() {
                out.push(json!({"path": path, "kind": "dir", "mode": mode}));
                self.walk(&rel_path, out);
            } else {
                let text = String::from_utf8_lossy(&std::fs::read(&full).unwrap()).into_owned();
                out.push(json!({
                    "path": path, "kind": "file", "mode": mode,
                    "sha256": sha256_hex(self.normalise_text(&text).as_bytes()),
                }));
            }
        }
    }

    /// The engine marker bytes of every bottle under the Bottles root, by bottle name.
    fn marker_bytes(&self) -> Value {
        let mut out = serde_json::Map::new();
        let mut names: Vec<String> = std::fs::read_dir(self.bottles_root())
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        for name in names {
            let file = self.bottles_root().join(&name).join(".gamelib-engine.json");
            if let Ok(bytes) = std::fs::read(&file) {
                out.insert(
                    name,
                    Value::String(self.normalise_text(&String::from_utf8_lossy(&bytes))),
                );
            }
        }
        Value::Object(out)
    }

    fn marker_sha(&self, bottle: &str) -> Value {
        let file = self
            .bottles_root()
            .join(bottle)
            .join(".gamelib-engine.json");
        match std::fs::read(&file) {
            Ok(bytes) => Value::String(sha256_hex(
                self.normalise_text(&String::from_utf8_lossy(&bytes))
                    .as_bytes(),
            )),
            Err(_) => Value::Null,
        }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Copies `source` into `target`, keeping each file's mode. With a `profile`, text files get their
/// `<TOOLS>` and `<HOME>` placeholders expanded (a marker holds an absolute wineserver path).
fn copy_tree(source: &Path, target: &Path, profile: Option<&Profile>) {
    std::fs::create_dir_all(target).unwrap();
    for entry in std::fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let to = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &to, profile);
            continue;
        }
        let mode = std::fs::metadata(entry.path())
            .unwrap()
            .permissions()
            .mode();
        match (profile, std::fs::read_to_string(entry.path())) {
            (Some(profile), Ok(text)) => std::fs::write(&to, profile.expand(&text)).unwrap(),
            _ => {
                std::fs::copy(entry.path(), &to).unwrap();
            }
        }
        std::fs::set_permissions(&to, std::fs::Permissions::from_mode(mode & 0o7777)).unwrap();
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

// ---------------------------------------------------------------------------------------------
// The scripted spawn seam of the lifecycle cases (what the oracle's spawn tracer did)
// ---------------------------------------------------------------------------------------------

/// The program an effect fires on, and what it does.
type Effect = (String, Box<dyn FnOnce() + Send>);

/// A scripted runner that also runs an effect when its program is first spawned (what `cxbottle
/// --create` or `wineboot` leaves in the bottle, or a signal that fires while it runs) and records the
/// time limit and the cancel wiring of every spawn (the oracle's `spawnLimits`). A run yields once
/// before it answers, as a real child does, so two callers started together really overlap.
struct EffectRunner {
    inner: ScriptedSpecRunner,
    effects: Mutex<Vec<Effect>>,
    limits: Mutex<Vec<Value>>,
}

impl SpecRunner for EffectRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.limits.lock().unwrap().push(json!({
            "program": spec.program,
            "argv": spec.argv,
            "timeoutMs": spec.timeout.map(|d| d.as_millis() as u64),
            "unbounded": spec.timeout.is_none(),
            "signal": spec.cancel.is_some(),
        }));
        let fire = {
            let mut effects = self.effects.lock().unwrap();
            effects
                .iter()
                .position(|(program, _)| *program == spec.program)
                .map(|i| effects.remove(i).1)
        };
        if let Some(effect) = fire {
            effect();
        }
        let run = self.inner.run(spec, on_line);
        Box::pin(async move {
            tokio::task::yield_now().await;
            run.await
        })
    }
}

/// What a case's scripted process answers: `code` (an exit code, or `null` for a run cut by its
/// timeout), `stderr`, or `throws` (the spawn failed, as Node's `String(error)` says it).
fn scripted_output(script: &Value) -> SpecOutput {
    if let Some(reason) = script["throws"].as_str() {
        return SpecOutput {
            code: None,
            stderr: format!("Error: {reason}"),
            ..SpecOutput::default()
        };
    }
    match script.get("code") {
        Some(Value::Null) => SpecOutput {
            code: None,
            timed_out: true,
            ..SpecOutput::default()
        },
        code => SpecOutput {
            code: Some(code.and_then(Value::as_i64).unwrap_or(0) as i32),
            stderr: script["stderr"].as_str().unwrap_or_default().to_string(),
            ..SpecOutput::default()
        },
    }
}

/// The scripts, the effect and the cancel token a lifecycle case runs under (`scriptsFor`).
fn lifecycle_runner(
    profile: &Arc<Profile>,
    case: &Value,
    args: &Value,
    cancel: &CancellationToken,
) -> Arc<EffectRunner> {
    let base: Vec<(String, String)> = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let mut inner = ScriptedSpecRunner::new(base);
    let mut effects: Vec<Effect> = Vec::new();
    let op = case["op"].as_str().unwrap_or_default();
    let bottle = args["bottle"].as_str().unwrap_or_default().to_string();
    if op == "create-fallback" || op == "ensure" {
        // `cxbottle --create` first when the ensure's decision is CrossOver and a bin dir resolves.
        if op == "ensure" && args["decision"] == "crossover" && args["binDirPresent"] != false {
            let bin_dir = args["binDir"].as_str().unwrap_or(CX_BIN_DIR);
            let cxbottle = format!("{bin_dir}/cxbottle");
            let script = &args["cxbottle"];
            inner = inner
                .on_program(&cxbottle, scripted_output(script))
                .on_program(
                    &format!("{bin_dir}/wineserver"),
                    scripted_output(&json!({"code": 0})),
                );
            let fixture = script["writes"].as_str().map(str::to_string);
            let (during, cancel, profile, bottle) = (
                args["abort"] == "during",
                cancel.clone(),
                profile.clone(),
                bottle.clone(),
            );
            effects.push((
                cxbottle,
                Box::new(move || {
                    if let Some(fixture) = &fixture {
                        profile.build_bottle_as(fixture, &bottle);
                    }
                    if during {
                        cancel.cancel();
                    }
                }),
            ));
        }
        // Then the built-in engine: wineboot, the wait (cut by its cap when the case says so), the stop.
        let wine = profile.expand(WINE_BIN);
        let wineserver = profile.expand(WINESERVER_BIN);
        let boot = &args["boot"];
        let wait = if args["wait"] == "timeout" {
            json!({"code": null})
        } else {
            json!({"code": 0})
        };
        inner = inner
            .on(&wine, &["wineboot", "-i"], scripted_output(boot))
            .on(&wineserver, &["-w"], scripted_output(&wait))
            .on(&wineserver, &["-k"], scripted_output(&json!({"code": 0})));
        let fixture = boot["writes"].as_str().map(str::to_string);
        let (after_boot, cancel, profile) = (
            args["abort"] == "after-boot",
            cancel.clone(),
            profile.clone(),
        );
        effects.push((
            wine,
            Box::new(move || {
                if let Some(fixture) = &fixture {
                    profile.build_bottle_as(fixture, &bottle);
                }
                if after_boot {
                    cancel.cancel();
                }
            }),
        ));
    }
    match op {
        "kill" => {
            let answer = match args["script"].as_str() {
                Some("throws") => scripted_output(&json!({"throws": "spawn wineserver ENOENT"})),
                Some("timeout") => scripted_output(&json!({"code": null})),
                _ => scripted_output(&json!({"code": 0})),
            };
            inner = inner.on_program(&profile.expand(WINESERVER_BIN), answer);
        }
        "create-crossover" => {
            let bin_dir = args["binDir"].as_str().unwrap_or(CX_BIN_DIR);
            let cxbottle = format!("{bin_dir}/cxbottle");
            let script = &args["cxbottle"];
            inner = inner
                .on_program(&cxbottle, scripted_output(script))
                .on_program(
                    &format!("{bin_dir}/wineserver"),
                    scripted_output(&json!({"code": 0})),
                );
            let fixture = script["writes"].as_str().map(str::to_string);
            let bottle = args["bottle"].as_str().unwrap_or_default().to_string();
            let (during, cancel) = (args["abort"] == "during", cancel.clone());
            let profile = profile.clone();
            effects.push((
                cxbottle,
                Box::new(move || {
                    if let Some(fixture) = &fixture {
                        profile.build_bottle_as(fixture, &bottle);
                    }
                    if during {
                        cancel.cancel();
                    }
                }),
            ));
        }
        _ => {}
    }
    Arc::new(EffectRunner {
        inner,
        effects: Mutex::new(effects),
        limits: Mutex::new(Vec::new()),
    })
}

// ---------------------------------------------------------------------------------------------
// The DXVK installer and the ensure collaborators of the fallback cases
// ---------------------------------------------------------------------------------------------

/// The oracle's installer double: one outcome (`ok` writes `current_dxvk-macOS` the way the real tool
/// does, `fails`, `no-marker` answers true and writes nothing, `throws`), and a cancel that fires when
/// the case says the abort comes during the DXVK step. A TS throw is a panic here; the creation reports
/// it as the TS reported a throw.
struct BottleInstaller {
    how: String,
    abort_after: Option<CancellationToken>,
    requests: Mutex<Vec<Value>>,
}

impl DxvkInstaller for BottleInstaller {
    fn install_remove(&self, req: DxvkRequest) -> BoxFuture<bool> {
        self.requests.lock().unwrap().push(json!({
            "tool": req.tool.as_str(),
            "action": req.action.as_str(),
            "source": req.source.as_ref().map(|s| json!({"dir": s.dir, "version": s.version})),
            "settings": req.settings,
        }));
        if self.how == "throws" {
            panic!("Error: DXVK installer blew up");
        }
        let answer = match self.how.as_str() {
            "fails" => false,
            how => {
                if how == "ok" {
                    let prefix = req.settings["winePrefix"].as_str().unwrap_or_default();
                    std::fs::write(
                        Path::new(prefix).join("current_dxvk-macOS"),
                        format!("{CURRENT_PIN_DXVK_VERSION}\n"),
                    )
                    .unwrap();
                }
                if let Some(cancel) = &self.abort_after {
                    cancel.cancel();
                }
                true
            }
        };
        Box::pin(async move { answer })
    }
}

/// The collaborators of `ensure` the oracle replaced: the decision, where CrossOver is, how the pin is
/// made available (`ok`, `offline`, `aborted`) and the global settings.
struct EnsureHarness {
    crossover: bool,
    bin_dir: Option<String>,
    pin: String,
    engine: NonCrossoverEngine,
}

impl PerGameDeps for EnsureHarness {
    fn decide(&self, _key: &str) -> BoxFuture<CreationDecision> {
        let decision = if self.crossover {
            CreationDecision::Crossover {
                create_timeout: Duration::from_millis(120_000),
            }
        } else {
            CreationDecision::Pinned {
                pin: Box::new(pins().unwrap().current.clone()),
            }
        };
        Box::pin(async move { decision })
    }

    fn resolve_bin_dir(&self) -> BoxFuture<Option<String>> {
        let bin_dir = self.bin_dir.clone();
        Box::pin(async move { bin_dir })
    }

    fn ensure_pin(&self, _pin: EnginePin, _args: &EnsureArgs) -> BoxFuture<PinOutcome> {
        let outcome = match self.pin.as_str() {
            "offline" => PinOutcome::Failed("offline: the pinned engine is not installed".into()),
            "aborted" => PinOutcome::Aborted,
            _ => PinOutcome::Ready(self.engine.clone()),
        };
        Box::pin(async move { outcome })
    }

    fn current_pin(&self) -> Option<EnginePin> {
        pins().ok().map(|t| t.current.clone())
    }

    fn global_game_settings(&self) -> Value {
        global_settings()
    }

    fn new_bottle_id(&self) -> String {
        BOTTLE_ID_4.to_lowercase()
    }
}

/// The global settings the oracle's fallback settings were built over.
fn global_settings() -> Value {
    json!({
        "enviromentOptions": [
            {"key": "FOO", "value": "bar"},
            {"key": "user", "value": "someone"},
            {"key": "WINEDEBUG", "value": "+all"}
        ],
        "autoInstallDxvk": true,
        "launcherArgs": "-skip"
    })
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

/// The gate a case runs under: the in-process one, or the TS fake of the Rust channel when the case
/// scripts it (`reject`: Rust cannot be asked; `answer`: the state it always gives).
type BoxedGate = Box<dyn Fn(&Path) -> Option<GateState>>;

fn gate_of(case: &Value) -> BoxedGate {
    let gate = &case["gate"];
    if gate["reject"].as_bool() == Some(true) {
        return Box::new(|_| None);
    }
    match gate["answer"].as_str() {
        Some("newer") => Box::new(|_| Some(GateState::Newer)),
        Some("ok") => Box::new(|_| Some(GateState::Ok)),
        Some("absent") => Box::new(|_| Some(GateState::Absent)),
        Some("unreadable") => Box::new(|_| Some(GateState::Unreadable)),
        _ => Box::new(marker::process_gate),
    }
}

/// The non-CrossOver engine a `record-pinned` case hands over (`engine('with-dxvk' | 'no-dxvk')`).
fn engine_of(profile: &Profile, variant: Option<&str>) -> NonCrossoverEngine {
    let engines = "<TOOLS>/steam-engines";
    NonCrossoverEngine {
        wine_bin: profile.expand(&format!(
            "{engines}/{CURRENT_PIN_ID}/Contents/Resources/wine/bin/wine"
        )),
        wineserver_bin: profile.expand(&format!(
            "{engines}/{CURRENT_PIN_ID}/Contents/Resources/wine/bin/wineserver"
        )),
        label: SYNTHETIC_PIN_LABEL.to_string(),
        version: CURRENT_PIN_WINE_VERSION.to_string(),
        dxvk: (variant != Some("no-dxvk")).then(|| DxvkBuild {
            dir: profile.expand(&format!("{engines}/dxvk-macOS-{CURRENT_PIN_DXVK_VERSION}")),
            version: CURRENT_PIN_DXVK_VERSION.to_string(),
        }),
    }
}

fn names_of(args: &Value) -> Vec<String> {
    args["names"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|n| n.as_str().unwrap_or_default().to_string())
        .collect()
}

fn times_of(args: &Value) -> usize {
    args["times"].as_u64().unwrap_or(1) as usize
}

fn kind_text(kind: Option<MarkerKind>) -> Value {
    match kind {
        Some(MarkerKind::Crossover) => json!("crossover"),
        Some(MarkerKind::NonCrossover) => json!("non-crossover"),
        None => Value::Null,
    }
}

/// The ledger and registry steps of a case, in order (each step's own result).
fn run_steps(ctx: &EngineCtx, op: &str, steps: &[Value], profile: &Profile) -> Value {
    let log = ctx.log.as_deref();
    let mut out = Vec::new();
    for step in steps {
        let call = step["call"].as_str().unwrap_or_default();
        let mut item = step.clone();
        let returned = match (op, call) {
            ("ledger", "markGameRunning") => json!(ctx.ledger.mark_game_running(
                log,
                step["bottle"].as_str().unwrap_or_default(),
                step["key"].as_str().unwrap_or_default()
            )),
            ("ledger", "markGameStopped") => {
                ctx.ledger.mark_game_stopped(
                    step["bottle"].as_str().unwrap_or_default(),
                    step["key"].as_str().unwrap_or_default(),
                );
                Value::Null
            }
            ("ledger", "gamesRunningIn") => {
                json!(ctx
                    .ledger
                    .games_running_in(step["bottle"].as_str().unwrap_or_default()))
            }
            ("ledger", "otherGamesRunning") => json!(ctx.ledger.other_games_running(
                step["bottle"].as_str().unwrap_or_default(),
                step["key"].as_str().unwrap_or_default()
            )),
            ("ledger", _) => json!(ctx.ledger.size()),
            ("registry", "set") => {
                let selection: EngineSelection =
                    serde_json::from_value(profile.expand_value(&step["selection"]))
                        .expect("a selection of the goldens decodes");
                json!(ctx.registry.set_engine_selection(
                    log,
                    step["key"].as_str().unwrap_or_default(),
                    selection
                ))
            }
            ("registry", "get") => ctx
                .registry
                .get_engine_selection(step["key"].as_str().unwrap_or_default())
                .map_or(Value::Null, |s| serde_json::to_value(s).unwrap()),
            ("registry", _) => {
                ctx.registry
                    .clear_engine_selection(step["key"].as_str().unwrap_or_default());
                Value::Null
            }
            other => panic!("unsupported step {other:?}"),
        };
        // The oracle echoes the step; `mutateInput` only exists to prove the registry copies, which
        // an owned Rust value does by construction, so the flag is not echoed back.
        if op == "registry" {
            item = json!({"call": call, "key": step["key"]});
        }
        item["returned"] = returned;
        out.push(item);
    }
    Value::Array(out)
}

struct Replayed {
    before: Value,
    outcome: Value,
    markers: Value,
    logs: Vec<String>,
    after: Value,
    /// The spawn trace (program, argv, env diff) and the time limit and cancel wiring of each spawn.
    spawns: Value,
    limits: Value,
    /// The DXVK installer's requests (fallback and ensure cases).
    installer: Value,
}

fn run_case(case: &Value) -> Replayed {
    let profile = Arc::new(Profile::new());
    if let Some(variant) = case["engines"].as_str() {
        if variant != "none" {
            profile.build_engines(variant);
        }
    }
    for name in case["bottles"].as_array().into_iter().flatten() {
        profile.build_bottle(name.as_str().unwrap());
    }
    profile.seed(&case["seed"]);
    let log = Arc::new(RecordingLog::new());
    let args = profile.expand_value(&materialise(&case["args"]));
    let cancel = CancellationToken::new();
    if args["abort"] == "before" {
        cancel.cancel();
    }
    let runner = lifecycle_runner(&profile, case, &args, &cancel);
    let installer = Arc::new(BottleInstaller {
        how: args["installer"].as_str().unwrap_or("ok").to_string(),
        abort_after: (args["abort"] == "after-installer").then(|| cancel.clone()),
        requests: Mutex::new(Vec::new()),
    });
    let ctx = profile
        .ctx_with(log.clone(), Some(runner.clone()))
        .with_dxvk(installer.clone());
    let before = profile.snapshot();
    let gate = gate_of(case);
    let gate: Gate<'_> = &*gate;
    let op = case["op"].as_str().unwrap();
    let bottle = args["bottle"].as_str().unwrap_or_default();

    let outcome = match op {
        "views" => Value::Array(
            names_of(&args)
                .into_iter()
                .map(|name| {
                    json!({
                        "name": name,
                        "kind": kind_text(read_bottle_engine_marker_kind(&ctx, &name)),
                        "summary": read_marker_summary(&ctx, &name)
                            .map_or(Value::Null, |s| s.to_value()),
                        "restoreNeedsAbsentPin": restore_needs_absent_pin(&ctx, &name),
                    })
                })
                .collect(),
        ),
        "reconcile" => Value::Array(
            (0..times_of(&args))
                .map(|_| {
                    reconcile_with(&ctx, gate, bottle).map_or(Value::Null, |r| json!(r.as_str()))
                })
                .collect(),
        ),
        "record-pinned" => Value::Array(
            (0..times_of(&args))
                .map(|_| {
                    let engine = engine_of(&profile, args["engine"].as_str());
                    let pin_id = args["pinId"].as_str().unwrap_or(CURRENT_PIN_ID);
                    json!({
                        "returned": record_pinned_with(&ctx, gate, bottle, pin_id, &engine),
                        "markerSha256": profile.marker_sha(bottle),
                    })
                })
                .collect(),
        ),
        "record-crossover" => Value::Array(
            (0..times_of(&args))
                .map(|_| {
                    let bin_dir = args["binDir"].as_str().unwrap_or(CX_BIN_DIR);
                    json!({
                        "returned": record_crossover_with(&ctx, gate, bottle, bin_dir),
                        "markerSha256": profile.marker_sha(bottle),
                    })
                })
                .collect(),
        ),
        "provisioned" => Value::Array(
            names_of(&args)
                .into_iter()
                .map(
                    |name| json!({"name": name, "provisioned": is_bottle_provisioned(&ctx, &name)}),
                )
                .collect(),
        ),
        "conf-write" => {
            let dir = PathBuf::from(bottle_dir(profile.root(), bottle));
            let calls: Vec<Value> = (0..times_of(&args))
                .map(|_| {
                    let returned = write_cxbottle_conf(Some(log.as_ref()), &dir, || {
                        BOTTLE_ID_3.to_lowercase()
                    });
                    let conf = std::fs::read_to_string(dir.join("cxbottle.conf")).ok();
                    json!({"returned": returned, "conf": conf})
                })
                .collect();
            json!({"built": build_cxbottle_conf(BOTTLE_ID_3), "calls": calls})
        }
        "ledger" | "registry" => run_steps(
            &ctx,
            op,
            args["steps"].as_array().map_or(&[][..], Vec::as_slice),
            &profile,
        ),
        "resolve-prefix" => Value::Array(
            args["inputs"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|input| json!({"input": input, "returned": resolve_game_prefix_value(input)}))
                .collect(),
        ),
        "kill" => {
            let extra_env: Vec<(String, String)> = args["extraEnv"].as_object().map_or_else(
                || vec![("USER".to_string(), "crossover".to_string())],
                |map| {
                    map.iter()
                        .map(|(k, v)| (k.clone(), v.as_str().unwrap_or_default().to_string()))
                        .collect()
                },
            );
            let timeout =
                Duration::from_millis(args["timeoutMs"].as_u64().unwrap_or(KILL_TIMEOUT_MS));
            let wineserver = profile.expand(WINESERVER_BIN);
            let mut out = Vec::new();
            for name in names_of(&args) {
                let returned = block_on(kill_bottle_wineserver(
                    &ctx,
                    &name,
                    &wineserver,
                    &extra_env,
                    timeout,
                ));
                out.push(json!({"name": name, "returned": returned}));
            }
            Value::Array(out)
        }
        "remove-created" => Value::Array(
            names_of(&args)
                .into_iter()
                .map(|name| {
                    remove_created_bottle_dir(&ctx, &name);
                    json!({"name": name, "returned": null})
                })
                .collect(),
        ),
        "create-crossover" => {
            let mut opts = CreateOptions {
                cancel: Some(cancel.clone()),
                ..CreateOptions::default()
            };
            if let Some(ms) = args["createTimeoutMs"].as_u64() {
                opts.create_timeout = Duration::from_millis(ms);
            }
            let bin_dir = args["binDir"].as_str().unwrap_or(CX_BIN_DIR);
            block_on(create_crossover_bottle(&ctx, bottle, bin_dir, &opts)).to_value()
        }
        "create-fallback" => {
            let engine = engine_of(
                &profile,
                Some(if args["dxvk"] == false {
                    "no-dxvk"
                } else {
                    "with-dxvk"
                }),
            );
            let settings = global_settings();
            let new_id = || BOTTLE_ID_4.to_lowercase();
            block_on(async {
                match AssertUnwindSafe(create_fallback_bottle_with(
                    &ctx,
                    bottle,
                    &engine,
                    &settings,
                    Some(&cancel),
                    &new_id,
                ))
                .catch_unwind()
                .await
                {
                    Ok(result) => result.to_value(),
                    Err(_) => json!({"status": "error", "error": "the creation panicked"}),
                }
            })
        }
        "ensure" => {
            let runner_name = args["runner"].as_str().unwrap_or("gog").to_string();
            let app_name = args["appName"].as_str().unwrap_or("1207658924").to_string();
            let key = if runner_name == "steam" {
                app_name.clone()
            } else {
                format!("{runner_name}:{app_name}")
            };
            let deps = EnsureHarness {
                crossover: args["decision"] == "crossover",
                bin_dir: (args["binDirPresent"] != false)
                    .then(|| args["binDir"].as_str().unwrap_or(CX_BIN_DIR).to_string()),
                pin: args["pin"].as_str().unwrap_or("ok").to_string(),
                engine: engine_of(
                    &profile,
                    Some(if args["dxvk"] == false {
                        "no-dxvk"
                    } else {
                        "with-dxvk"
                    }),
                ),
            };
            let ensure = EnsureArgs {
                key,
                bottle_name: bottle.to_string(),
                app_name,
                runner: runner_name,
                cancel: Some(cancel.clone()),
            };
            let call = || async {
                ensure_per_game_bottle(&ctx, &deps, &ensure)
                    .await
                    .to_value()
            };
            match args["mode"].as_str() {
                Some("twice") => block_on(async {
                    let first = call().await;
                    let second = call().await;
                    json!({"first": first, "second": second})
                }),
                Some("concurrent") => block_on(async {
                    let (first, second) = tokio::join!(call(), call());
                    json!({"first": first, "second": second})
                }),
                _ => block_on(call()),
            }
        }
        other => panic!("op {other} is not ported by this build"),
    };

    let spawns = Value::Array(
        runner
            .inner
            .spawns()
            .iter()
            .map(|spawn| {
                let mut entry = spawn.to_json();
                // The scripted answer is an input, not an observation.
                entry["result"] = Value::Null;
                entry
            })
            .collect(),
    );
    let limits = Value::Array(runner.limits.lock().unwrap().clone());
    let installer_requests = Value::Array(installer.requests.lock().unwrap().clone());
    let logs = log
        .lines()
        .into_iter()
        .map(|(level, line)| {
            let level = match level {
                "warn" => "WARNING",
                "error" => "ERROR",
                _ => "INFO",
            };
            format!("{level}: {}", profile.normalise_text(&line))
        })
        .collect();
    Replayed {
        before,
        outcome: profile.normalise(outcome),
        markers: profile.marker_bytes(),
        logs,
        after: profile.snapshot(),
        spawns: profile.normalise(spawns),
        limits: profile.normalise(limits),
        installer: profile.normalise(installer_requests),
    }
}

/// Runs one future to its end on a small runtime of its own (the scripted runner never blocks).
fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}

/// The first half of the log line a refused removal writes.
const REMOVAL_REFUSED: &str =
    "provisionBridgeBottle: not removing partial bottle outside the Bottles root: ";

/// The golden's log lines as `<LEVEL>: <message>`, with the two documented deltas applied
/// (`deltas.json`): the TS asked Rust over a channel and logged when it could not (an in-process
/// gate cannot fail), and the conf writer names its bottle's directory name, not its path.
fn expected_logs(golden: &Value) -> Vec<String> {
    let bottles_prefix = "<HOME>/Library/Application Support/CrossOver/Bottles/";
    let mut refused_names = golden["args"]["names"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|n| n.as_str().unwrap_or_default().to_string());
    golden["logs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| {
            !l["message"]
                .as_str()
                .unwrap()
                .starts_with("bottle version gate: Rust could not be asked")
        })
        .map(|l| {
            let message = l["message"].as_str().unwrap();
            // The removal's refusal names the bottle name it was given, not the path it resolved to
            // (T-86-15: the engine log carries no profile path); the golden's line has the path.
            if message.starts_with(REMOVAL_REFUSED) {
                let name = refused_names.next().unwrap_or_default();
                return format!(
                    "{}: {REMOVAL_REFUSED}\"{name}\"",
                    l["level"].as_str().unwrap()
                );
            }
            format!(
                "{}: {}",
                l["level"].as_str().unwrap(),
                message.replace(bottles_prefix, "")
            )
        })
        .collect()
}

fn replay(ops: &[&str], floor: usize) {
    let selected: Vec<Value> = cases()
        .into_iter()
        .filter(|c| ops.contains(&c["op"].as_str().unwrap()))
        .collect();
    check_floor("replayed bottle cases", selected.len(), floor).unwrap();
    let mut failures = Vec::new();
    for case in &selected {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let golden = read_json(&dir.join("result.json"));
        let actual = run_case(case);
        let mut problems = Vec::new();
        let mut check = |what: &str, ok: bool, expected: String, got: String| {
            if !ok {
                problems.push(format!(
                    "{what}:\n    expected {expected}\n    actual   {got}"
                ));
            }
        };
        let text = |v: &Value| serde_json::to_string(v).unwrap();
        check(
            "outcome",
            actual.outcome == golden["outcome"],
            text(&golden["outcome"]),
            text(&actual.outcome),
        );
        check(
            "marker bytes",
            actual.markers == golden["markers"],
            text(&golden["markers"]),
            text(&actual.markers),
        );
        let want_logs = expected_logs(&golden);
        check(
            "logs",
            actual.logs == want_logs,
            format!("{want_logs:?}"),
            format!("{:?}", actual.logs),
        );
        check(
            "tree before",
            actual.before == golden["before"],
            "the golden's before tree".into(),
            first_difference(&golden["before"], &actual.before),
        );
        let op = case["op"].as_str().unwrap();
        if LIFECYCLE_OPS.contains(&op) || FALLBACK_OPS.contains(&op) {
            let want_spawns: Vec<Value> = read_json(&dir.join("spawns.json"))
                .as_array()
                .unwrap()
                .iter()
                .map(|spawn| {
                    // The scripted answer is an input; the trace is program, argv and env diff.
                    let mut spawn = spawn.clone();
                    spawn["result"] = Value::Null;
                    spawn
                })
                .collect();
            check(
                "spawn trace",
                actual.spawns == Value::Array(want_spawns.clone()),
                text(&Value::Array(want_spawns)),
                text(&actual.spawns),
            );
            check(
                "spawn limits",
                actual.limits == golden["spawnLimits"],
                text(&golden["spawnLimits"]),
                text(&actual.limits),
            );
        }
        if FALLBACK_OPS.contains(&op) {
            let want = golden.get("installRemove").cloned().unwrap_or(json!([]));
            check(
                "installer requests",
                actual.installer == want,
                text(&want),
                text(&actual.installer),
            );
        }
        let want_after = read_json(&dir.join("tree.json"));
        check(
            "tree after",
            actual.after == want_after,
            "the golden's after tree".into(),
            first_difference(&want_after, &actual.after),
        );
        if !problems.is_empty() {
            failures.push(format!("{id}:\n  {}", problems.join("\n  ")));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Where two trees first differ, as text.
fn first_difference(want: &Value, got: &Value) -> String {
    let (want, got) = (want.as_array().unwrap(), got.as_array().unwrap());
    for i in 0..want.len().max(got.len()) {
        if want.get(i) != got.get(i) {
            return format!(
                "entry {i}: golden {:?}, replay {:?}",
                want.get(i),
                got.get(i)
            );
        }
    }
    "no difference".to_string()
}

const TRACER_OPS: [&str; 1] = ["record-pinned"];

#[test]
fn the_tracer_goldens_replay() {
    replay(&TRACER_OPS, 18);
}

#[test]
fn every_state_golden_replays() {
    replay(&STATE_OPS, 98);
}

/// The 21 CrossOver create, wineserver kill and removal goldens (12 + 5 + 4): outcome, logs, the
/// before and after trees (a sibling bottle is byte-identical), the spawn trace and the time limit and
/// cancel wiring of every spawn.
#[test]
fn every_lifecycle_golden_replays() {
    replay(&LIFECYCLE_OPS, 21);
}

/// The 27 fallback create and per-game ensure goldens (16 + 11): outcome, logs, the before and after
/// trees, the spawn trace and the time limit and cancel wiring of every spawn (wineboot 180 s and the
/// wait 60 s with the creation's cancel, the stops 15 s with none) and the DXVK installer's requests.
#[test]
fn every_fallback_golden_replays() {
    replay(&FALLBACK_OPS, 27);
}

#[test]
fn the_documented_deltas_are_exactly_those_this_replay_treats_differently() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut keys: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    // Entries for behaviour changed after the port (quick 261124-8f3) edit their goldens instead of
    // being treated in this replay.
    assert_eq!(
        keys,
        [
            "conf-log-lines-name-the-bottle-not-its-path",
            "gate-is-in-process-and-cannot-fail",
            "installer-answers-a-bool-and-a-throw-is-a-panic",
            "provisioned-answers-false-for-an-unclean-name",
            "removal-goes-through-the-safety-guard",
            "removal-refusal-names-the-bottle-not-its-path",
            "spawn-failure-text-is-the-runners-not-nodes",
            "unreadable-marker-is-rewritten-as-the-ts-did",
        ]
    );
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 150, "{key}");
    }
}

#[test]
fn the_replayed_ops_each_have_a_case() {
    let all = cases();
    for op in STATE_OPS
        .iter()
        .chain(LIFECYCLE_OPS.iter())
        .chain(FALLBACK_OPS.iter())
    {
        assert!(
            all.iter().any(|c| c["op"] == *op),
            "no golden case for op {op}"
        );
    }
}

// ---------------------------------------------------------------------------------------------
// The twin vectors of the bottle helpers (`vectors/bottle_twin.json`, T-87-36)
// ---------------------------------------------------------------------------------------------
//
// The TS keeps `getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned` and the marker readers as
// a twin until their callers move (D-24); the 87-11 oracle recorded the vectors from the TS and the
// TS replay is `bottles.oracle.test.ts`. This replays the same file against the Rust functions, so
// the one sanitiser of each language is pinned by one shared list of inputs and neither side can
// drift without one replay failing. The `buildFallbackGameSettings` and `isPinnedEngineInstalled`
// groups are not replayed here: the first belongs to the tool-settings slice and the second to the
// pinned-engine one, each with their own goldens.

const TWIN_VECTORS: &str = include_str!("fixtures/vectors/bottle_twin.json");

/// The groups replayed here with the counts the file held when recorded (87-11); never lower one.
const TWIN_GROUP_FLOORS: [(&str, usize); 6] = [
    ("getBottleDir", 16),
    ("sanitizeBottleName", 31),
    ("isBottleProvisioned", 25),
    ("readBottleEngineMarkerKind", 25),
    ("readBottleEngineMarkerSummary", 25),
    ("restoreNeedsAbsentPin", 46),
];

fn twin_replay(group: &str, input: &Value) -> Value {
    let profile = Profile::new();
    if let Some(variant) = input["engines"].as_str() {
        if variant != "none" {
            profile.build_engines(variant);
        }
    }
    for name in input["fixtures"].as_array().into_iter().flatten() {
        profile.build_bottle(name.as_str().unwrap());
    }
    profile.seed(&input["seed"]);
    let ctx = profile.ctx(Arc::new(RecordingLog::new()));
    let bottle = input["bottle"].as_str().unwrap_or_default();
    let answer = match group {
        "getBottleDir" => {
            let home = profile.expand(input["userHome"].as_str().unwrap());
            json!(bottle_dir(
                Path::new(&home),
                input["name"].as_str().unwrap_or_default()
            ))
        }
        "sanitizeBottleName" => match (input["kind"].as_str(), input["value"].as_str()) {
            (Some("string"), Some(text)) => {
                gamelib_engine::bottles::paths::sanitize_bottle_name(text)
                    .map_or(Value::Null, Value::String)
            }
            // A null, an undefined, a number and an object are not names.
            _ => Value::Null,
        },
        "isBottleProvisioned" => json!(is_bottle_provisioned(&ctx, bottle)),
        "readBottleEngineMarkerKind" => kind_text(read_bottle_engine_marker_kind(&ctx, bottle)),
        "readBottleEngineMarkerSummary" => {
            read_marker_summary(&ctx, bottle).map_or(Value::Null, |s| s.to_value())
        }
        "restoreNeedsAbsentPin" => json!(restore_needs_absent_pin(&ctx, bottle)),
        other => panic!("unknown vector group {other}"),
    };
    profile.normalise(answer)
}

#[test]
fn every_recorded_bottle_twin_vector_replays_against_the_rust_functions() {
    let file: Value = serde_json::from_str(TWIN_VECTORS).expect("bottle_twin.json parses");
    let mut replayed = 0;
    for (group, floor) in TWIN_GROUP_FLOORS {
        let list = file[group].as_array().expect("a group is an array");
        check_floor(group, list.len(), floor).unwrap();
        let mismatches: Vec<String> = list
            .iter()
            .filter_map(|vector| {
                let input = materialise(&vector["input"]);
                let got = twin_replay(group, &input);
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
    check_floor("replayed bottle twin vectors", replayed, 168).unwrap();
}

#[test]
fn the_twin_replay_is_not_vacuous() {
    assert!(check_floor("empty", 0, 168).is_err());
    let input = json!({"kind": "string", "value": " GameLib-x "});
    assert_eq!(twin_replay("sanitizeBottleName", &input), "GameLib-x");
    assert_ne!(twin_replay("sanitizeBottleName", &input), " GameLib-x ");
}

// ---------------------------------------------------------------------------------------------
// The selection registry sequences (`vectors/selection_registry.json`)
// ---------------------------------------------------------------------------------------------
//
// 11 set, get and clear sequences the TS recorded for the write-through selection view (87-11): the
// registry is the one in-memory map both languages must agree on until the TS one is deleted.

const REGISTRY_VECTORS: &str = include_str!("fixtures/vectors/selection_registry.json");
const REGISTRY_SEQUENCE_FLOOR: usize = 11;

#[test]
fn every_recorded_selection_registry_sequence_replays_against_the_registry() {
    let list: Vec<Value> =
        serde_json::from_str(REGISTRY_VECTORS).expect("selection_registry.json parses");
    check_floor("registry sequences", list.len(), REGISTRY_SEQUENCE_FLOOR).unwrap();
    let mut mismatches = Vec::new();
    for sequence in &list {
        let profile = Profile::new();
        if let Some(variant) = sequence["engines"].as_str() {
            if variant != "none" {
                profile.build_engines(variant);
            }
        }
        let ctx = profile.ctx(Arc::new(RecordingLog::new()));
        let steps = sequence["steps"].as_array().unwrap();
        let got = profile.normalise(run_steps(&ctx, "registry", steps, &profile));
        if got != sequence["expected"] {
            mismatches.push(format!(
                "{}: expected {}, got {got}",
                sequence["id"], sequence["expected"]
            ));
        }
    }
    assert!(mismatches.is_empty(), "{mismatches:#?}");
}

#[test]
fn a_selection_whose_binaries_are_not_on_disk_is_not_stored() {
    // The same pinned selection as the sequences use, in a profile with no engine installed.
    let profile = Profile::new();
    let ctx = profile.ctx(Arc::new(RecordingLog::new()));
    let steps = vec![
        json!({"call": "set", "key": "gog:1", "selection": {
            "kind": "pinned", "pinId": "wine-staging-11.20", "reason": "cx-missing",
            "wineBin": "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine",
            "wineserverBin": "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver",
            "label": "Pinned", "version": "11.20", "dxvk": null}}),
        json!({"call": "get", "key": "gog:1"}),
    ];
    let got = run_steps(&ctx, "registry", &steps, &profile);
    assert_eq!(got[0]["returned"], json!(false));
    assert_eq!(got[1]["returned"], Value::Null);
}
