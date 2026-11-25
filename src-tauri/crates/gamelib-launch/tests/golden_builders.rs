//! The Rust replay of the launch builder goldens 88.1-01 recorded from the TypeScript:
//!
//! - `golden/builders` (113 cases): `setupWrapperEnvVars`, `setupWrappers` pairwise, npm shlex split and
//!   join vectors, the tier-1 known-fix env over seeded layers, `removeQuoteIfNecessary`,
//!   `isMacSonomaOrHigher` with its log lines, and the `setupWineEnvVars` library-folder incident cases;
//! - `golden/gamescope` (65 cases): `buildGameScopeCommand` rows and the `gamescope --help` probe over a
//!   scripted spawn seam.
//!
//! A count floor lives in this file next to each replay (equal to the MANIFEST's), so editing the JSON
//! alone cannot lower the bar, and an empty list fails. The only differences from the TS are the entries
//! of each slice's `deltas.json`, each with its reason; a delta that no case uses is itself an error.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::builders::env::{is_mac_sonoma_or_higher, remove_quote_if_necessary};
use gamelib_launch::builders::gamescope::{
    build_gamescope_command, probe_gamescope_help, GamescopeSettings,
};
use gamelib_launch::builders::wrappers::{join, split};
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::dispatch;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::{json, Value};

/// `golden/builders` holds 113 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const BUILDERS_FLOOR: usize = 113;
/// `golden/gamescope` holds 65 cases, the MANIFEST floor.
const GAMESCOPE_FLOOR: usize = 65;

/// Every `call.op` of `golden/builders` this file replays. The test fails when `cases.json` holds a kind
/// that is not listed, so a new kind cannot be counted without being compared.
const HANDLED_KINDS: [&str; 8] = [
    "knownFixEnv",
    "removeQuote",
    "shlexJoin",
    "shlexSplit",
    "sonoma",
    "wineEnv",
    "wrapperEnvVars",
    "wrappers",
];
const GAMESCOPE_KINDS: [&str; 3] = ["build", "probe", "probeThenBuild"];

const BIN: &str = "/usr/bin/gamescope";
/// The call site the probe's spawn is recorded under; its class is in `golden/classes.json`.
const PROBE_SITE: &str = "prepare_launch.gamescope_help";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// A case list is usable only at or above its floor: an empty or shrunken list is an error, so the
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

// ---------------------------------------------------------------------------------------------
// The profile the cases run in
// ---------------------------------------------------------------------------------------------

/// The oracle's profile layout (`buildProfile` in the TS harness) rooted in a fake HOME: the app folder is
/// `<HOME>/.config/GameLib` and the bundled known-fix layer `<HOME>/public/fixes`.
struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    ctx: LaunchCtx,
}

impl Rig {
    fn new(platform: Platform, scripted: Option<Arc<ScriptedSpecRunner>>) -> Rig {
        let home = FakeHome::new("launch-builders-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let mut engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: root
                    .join("Library")
                    .join("Application Support")
                    .join("GameLib"),
                app_folder: app_folder.clone(),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone());
        if let Some(runner) = scripted {
            engine = engine.with_proc(runner);
        }
        let engine = Arc::new(engine);
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), app_folder.join("tools")));
        Rig {
            ctx: LaunchCtx::new(engine, knownfix, wine),
            home,
            log,
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    /// A placeholder path (`<APPFOLDER>/fixes/local/x.json`) as a real one.
    fn expand(&self, text: &str) -> String {
        text.replace(
            "<APPFOLDER>",
            &self
                .root()
                .join(".config")
                .join("GameLib")
                .to_string_lossy(),
        )
        .replace("<HOME>", &self.root().to_string_lossy())
    }

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`, so the
    /// canonical root is listed too).
    fn normalise_text(&self, text: &str) -> String {
        let mut roots = vec![self.root().to_path_buf()];
        if let Ok(real) = std::fs::canonicalize(self.root()) {
            if real != self.root() {
                roots.insert(0, real);
            }
        }
        let mut out = text.to_string();
        for root in roots {
            let app = root.join(".config").join("GameLib");
            out = out
                .replace(app.to_string_lossy().as_ref(), "<APPFOLDER>")
                .replace(root.to_string_lossy().as_ref(), "<HOME>");
        }
        out
    }

    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            std::fs::create_dir_all(target.parent().unwrap()).unwrap();
            std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
        }
    }

    /// The lines the case logged, in the golden's vocabulary.
    fn events(&self) -> Value {
        Value::Array(
            self.log
                .lines()
                .into_iter()
                .map(|(level, text)| {
                    json!({
                        "level": if level == "warn" { "warning" } else { level },
                        "text": self.normalise_text(&text),
                    })
                })
                .collect(),
        )
    }

    /// The process facts the TS pinned (`withPinnedBaseEnv`): the fake HOME's eight variables and a fixed
    /// `PATH`, `LANG` and `USER`; the crate itself reads none of them.
    fn host(&self, darwin_release: Option<&str>) -> Value {
        let mut env = serde_json::Map::new();
        for (key, path) in self.home.env() {
            env.insert(key.to_string(), json!(path.to_string_lossy()));
        }
        env.insert("PATH".into(), json!("/usr/bin:/bin"));
        env.insert("LANG".into(), json!("C.UTF-8"));
        env.insert("USER".into(), json!("gamelib-oracle"));
        json!({ "env": env, "darwinRelease": darwin_release })
    }
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

// ---------------------------------------------------------------------------------------------
// The deltas
// ---------------------------------------------------------------------------------------------

/// One documented difference between the TS golden and the Rust answer (D-19, D-20).
struct Delta {
    id: String,
    file: String,
    kind: String,
    rust: Option<Value>,
}

struct Deltas {
    entries: Vec<Delta>,
    used: std::cell::RefCell<BTreeSet<usize>>,
}

impl Deltas {
    fn load(slice: &str) -> Deltas {
        let list = read_json(&fixtures().join(slice).join("deltas.json"));
        let entries = list
            .as_array()
            .expect("deltas.json is an array")
            .iter()
            .map(|d| {
                let reason = d["reason"].as_str().unwrap_or_default();
                assert!(
                    reason.len() > 20,
                    "a delta without a reason of its own is not documented: {d}"
                );
                let kind = d["kind"].as_str().expect("delta kind").to_string();
                assert!(
                    kind == "replace" || kind == "parser-message",
                    "unknown delta kind {kind}"
                );
                Delta {
                    id: d["id"].as_str().expect("delta id").to_string(),
                    file: d["file"].as_str().expect("delta file").to_string(),
                    kind,
                    rust: d.get("rust").cloned(),
                }
            })
            .collect();
        Deltas {
            entries,
            used: Default::default(),
        }
    }

    fn find(&self, id: &str, file: &str) -> Option<&Delta> {
        let at = self
            .entries
            .iter()
            .position(|d| d.id == id && d.file == file)?;
        self.used.borrow_mut().insert(at);
        Some(&self.entries[at])
    }

    /// What the golden says the case's `file` holds, with its documented delta applied to both sides.
    fn compare(&self, id: &str, file: &str, want: Value, got: Value) -> Option<String> {
        let (want, got) = match self.find(id, file) {
            None => (want, got),
            Some(d) if d.kind == "replace" => (d.rust.clone().expect("replace needs rust"), got),
            Some(_) => (
                neutralise_parser_message(&want),
                neutralise_parser_message(&got),
            ),
        };
        (want != got).then(|| format!("{id}: {file}\n  want {want}\n  got  {got}"))
    }

    fn assert_all_used(&self, slice: &str) {
        let used = self.used.borrow();
        for (at, d) in self.entries.iter().enumerate() {
            assert!(
                used.contains(&at),
                "{slice}: the delta for {} {} was never used by a case",
                d.id,
                d.file
            );
        }
    }
}

/// The parser message after `ignoring.\n` is the JSON parser's own (V8's in the golden, serde_json's
/// here): replaced by a marker, after requiring it to be non-empty.
fn neutralise_parser_message(events: &Value) -> Value {
    const MARKER: &str = "ignoring.\n";
    let mut out = events.clone();
    for event in out.as_array_mut().into_iter().flatten() {
        let text = event["text"].as_str().unwrap_or_default().to_string();
        if !text.starts_with("Known fixes could not be applied") {
            continue;
        }
        if let Some(at) = text.find(MARKER) {
            let (head, message) = text.split_at(at + MARKER.len());
            assert!(!message.is_empty(), "the parser message is empty: {text:?}");
            event["text"] = json!(format!("{head}<PARSER-MESSAGE>"));
        }
    }
    out
}

// ---------------------------------------------------------------------------------------------
// golden/builders
// ---------------------------------------------------------------------------------------------

/// A thrown TS error is the answer `{ error }`; an op's `<op>:<message>` is the same text.
fn answer_of(op: &str, answer: Result<Value, String>) -> Value {
    match answer {
        Ok(value) => value,
        Err(e) => {
            let prefix = format!("{op}:");
            let message = e
                .strip_prefix(&prefix)
                .unwrap_or_else(|| panic!("an op error of the wrong shape: {e}"));
            json!({ "error": message })
        }
    }
}

fn words(value: &Value) -> Vec<String> {
    value
        .as_array()
        .unwrap()
        .iter()
        .map(|w| w.as_str().unwrap().to_string())
        .collect()
}

/// Runs one `golden/builders` case on a fresh fake HOME; returns `(result, events)`.
fn run_builders_case(case: &Value) -> (Value, Value) {
    let call = &case["call"];
    let platform = platform_of(case["platform"].as_str().unwrap_or("linux"));
    let rig = Rig::new(platform, None);
    let rt = runtime();
    let ctx = &rig.ctx;
    let result = match call["op"].as_str().unwrap() {
        "wrapperEnvVars" => {
            let op = "launch_setup_wrapper_env_vars";
            let args = [json!({ "appName": call["appName"], "appRunner": call["appRunner"] })];
            answer_of(op, rt.block_on(dispatch(op, &args, ctx)))
        }
        "wrappers" => {
            let op = "launch_setup_wrappers";
            let args = [
                json!({ "wrapperOptions": call["wrapperOptions"] }),
                call["mangoHud"].clone(),
                call["gameMode"].clone(),
                call["gameScope"].clone(),
            ];
            answer_of(op, rt.block_on(dispatch(op, &args, ctx)))
        }
        "shlexSplit" => match split(call["input"].as_str().unwrap()) {
            Ok(parts) => json!(parts),
            Err(e) => json!({ "error": e.message() }),
        },
        "shlexJoin" => {
            let parts = words(&call["words"]);
            json!(join(parts.iter().map(String::as_str)))
        }
        "knownFixEnv" => {
            rig.seed(&call["seed"]);
            let op = "launch_known_fix_env";
            let args = [call["appName"].clone(), call["runner"].clone()];
            answer_of(op, rt.block_on(dispatch(op, &args, ctx)))
        }
        "removeQuote" => json!(remove_quote_if_necessary(call["value"].as_str().unwrap())),
        "sonoma" => json!(is_mac_sonoma_or_higher(ctx, call["release"].as_str())),
        "wineEnv" => {
            let op = "launch_setup_wine_env_vars";
            let args = [call["settings"].clone(), Value::Null, rig.host(None)];
            answer_of(op, rt.block_on(dispatch(op, &args, ctx)))
        }
        other => panic!("{}: unhandled kind {other}", case["id"]),
    };
    (rig.normalise_value(result), rig.events())
}

impl Rig {
    fn normalise_value(&self, value: Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.normalise_text(&s)),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.normalise_value(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, self.normalise_value(v)))
                    .collect(),
            ),
            other => other,
        }
    }
}

fn load_cases(slice: &str) -> Vec<Value> {
    match read_json(&fixtures().join(slice).join("cases.json")) {
        Value::Array(cases) => cases,
        other => panic!("{slice}/cases.json is not an array: {other}"),
    }
}

fn expected(slice: &str, id: &str, file: &str) -> Value {
    read_json(&fixtures().join(slice).join("expected").join(id).join(file))
}

fn manifest(slice: &str) -> Value {
    read_json(&fixtures().join(slice).join("MANIFEST.json"))
}

#[test]
fn every_builders_golden_replays() {
    let cases = load_cases("builders");
    check_floor("golden/builders cases", cases.len(), BUILDERS_FLOOR).unwrap();
    let kinds: BTreeSet<&str> = cases
        .iter()
        .map(|c| c["call"]["op"].as_str().unwrap())
        .collect();
    let handled: BTreeSet<&str> = HANDLED_KINDS.into_iter().collect();
    assert_eq!(
        kinds, handled,
        "cases.json holds a kind this replay does not handle, or the reverse"
    );
    let deltas = Deltas::load("builders");
    let mut failures = Vec::new();
    let mut compared = 0usize;
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let (result, events) = run_builders_case(case);
        failures.extend(deltas.compare(
            id,
            "result.json",
            expected("builders", id, "result.json"),
            result,
        ));
        failures.extend(deltas.compare(
            id,
            "events.json",
            expected("builders", id, "events.json"),
            events,
        ));
        compared += 1;
    }
    deltas.assert_all_used("builders");
    eprintln!("golden builders: compared {compared} floor {BUILDERS_FLOOR}");
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor("golden/builders cases compared", compared, BUILDERS_FLOOR).unwrap();
}

// ---------------------------------------------------------------------------------------------
// golden/gamescope
// ---------------------------------------------------------------------------------------------

fn class_of(site: &str) -> String {
    read_json(&fixtures().join("classes.json"))[site]
        .as_str()
        .unwrap_or_else(|| panic!("{site} has no class in classes.json"))
        .to_string()
}

/// One build's answer: the argv, or `{ error }` when the builder threw.
fn build_one(settings: &Value, help: &str, show_mangohud: bool) -> Value {
    let settings: GamescopeSettings = serde_json::from_value(settings.clone()).unwrap();
    match build_gamescope_command(BIN, &settings, help, show_mangohud) {
        Ok(argv) => json!(argv),
        Err(e) => json!({ "error": e.message() }),
    }
}

/// The scripted answer of a recorded probe: a throw is a spawn failure (`code: None`, the reason in
/// stderr); a timeout carries its stderr and no code.
fn scripted_output(scripted: &Value) -> SpecOutput {
    if let Some(reason) = scripted["throws"].as_str() {
        return SpecOutput {
            code: None,
            stderr: reason.to_string(),
            ..SpecOutput::default()
        };
    }
    SpecOutput {
        code: scripted["code"].as_i64().map(|c| c as i32),
        stderr: scripted["stderr"].as_str().unwrap_or_default().to_string(),
        timed_out: scripted["timedOut"].as_bool().unwrap_or(false),
        ..SpecOutput::default()
    }
}

/// Runs the probe over a scripted runner; returns the help text and the recorded spawn in the golden's
/// `spawns.json` shape.
fn run_probe(scripted: &Value) -> (String, Value) {
    let home = FakeHome::new("launch-gamescope-");
    let base: Vec<(String, String)> = home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let runner =
        Arc::new(ScriptedSpecRunner::new(base).on(BIN, &["--help"], scripted_output(scripted)));
    let help = runtime().block_on(probe_gamescope_help(runner.as_ref(), BIN));
    assert!(runner.unscripted().is_empty());
    let spawns: Vec<Value> = runner
        .spawns()
        .iter()
        .map(|spawn| {
            let mut result = json!({
                "code": spawn.result.code,
                "stdout": spawn.result.stdout,
                "stderr": spawn.result.stderr,
            });
            if spawn.result.timed_out {
                result["timedOut"] = json!(true);
            }
            if let Some(reason) = scripted["throws"].as_str() {
                result["stderr"] = json!("");
                result["error"] = json!(reason);
            }
            assert_eq!(spawn.label, "gamescope-help");
            json!({
                "callSite": PROBE_SITE,
                "program": spawn.program,
                "argv": spawn.argv,
                "timeoutMs": spawn.timeout.map(|t| t.as_millis() as u64),
                "envDiff": { "set": spawn.env_set, "unset": spawn.env_unset },
                "cwd": spawn.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
                "result": result,
                "class": class_of(PROBE_SITE),
            })
        })
        .collect();
    (help, Value::Array(spawns))
}

fn run_gamescope_case(case: &Value) -> (Value, Value) {
    let call = &case["call"];
    match call["op"].as_str().unwrap() {
        "build" => {
            let builds = call["builds"].as_array().unwrap();
            let answers = builds
                .iter()
                .map(|b| {
                    build_one(
                        &b["settings"],
                        b["help"].as_str().unwrap(),
                        b["showMangohud"].as_bool().unwrap_or(false),
                    )
                })
                .collect();
            (Value::Array(answers), json!([]))
        }
        "probe" => {
            let (help, spawns) = run_probe(&call["scripted"]);
            (json!({ "help": help }), spawns)
        }
        "probeThenBuild" => {
            let (help, spawns) = run_probe(&call["scripted"]);
            let argv = build_one(&call["settings"], &help, false);
            (json!({ "help": help, "argv": argv }), spawns)
        }
        other => panic!("{}: unhandled kind {other}", case["id"]),
    }
}

#[test]
fn every_gamescope_golden_replays() {
    let cases = load_cases("gamescope");
    check_floor("golden/gamescope cases", cases.len(), GAMESCOPE_FLOOR).unwrap();
    let kinds: BTreeSet<&str> = cases
        .iter()
        .map(|c| c["call"]["op"].as_str().unwrap())
        .collect();
    let handled: BTreeSet<&str> = GAMESCOPE_KINDS.into_iter().collect();
    assert_eq!(kinds, handled);
    let deltas = Deltas::load("gamescope");
    let mut failures = Vec::new();
    let mut compared = 0usize;
    let mut probes = BTreeSet::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let (result, spawns) = run_gamescope_case(case);
        if case["call"]["op"] != "build" {
            probes.insert(case["call"]["scripted"].to_string());
        }
        failures.extend(deltas.compare(
            id,
            "result.json",
            expected("gamescope", id, "result.json"),
            result,
        ));
        failures.extend(deltas.compare(
            id,
            "spawns.json",
            expected("gamescope", id, "spawns.json"),
            spawns,
        ));
        compared += 1;
    }
    deltas.assert_all_used("gamescope");
    // The three probe forms (a normal exit, a timeout, a spawn error) and the old-CLI help are all in.
    assert!(probes.len() >= 4, "probe forms replayed: {probes:?}");
    eprintln!("golden gamescope: compared {compared} floor {GAMESCOPE_FLOOR}");
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor("golden/gamescope cases compared", compared, GAMESCOPE_FLOOR).unwrap();
}

// ---------------------------------------------------------------------------------------------
// The floors and the manifests
// ---------------------------------------------------------------------------------------------

#[test]
fn the_floors_match_the_manifests_and_an_empty_list_fails() {
    for (slice, floor) in [("builders", BUILDERS_FLOOR), ("gamescope", GAMESCOPE_FLOOR)] {
        let manifest = manifest(slice);
        let cases = load_cases(slice);
        assert_eq!(
            manifest["count"].as_u64(),
            Some(cases.len() as u64),
            "{slice}"
        );
        assert_eq!(
            manifest["floor"].as_u64(),
            Some(floor as u64),
            "{slice}: the floor in this file equals the MANIFEST's"
        );
        let ids: BTreeSet<&str> = cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
        assert_eq!(ids.len(), cases.len(), "{slice}: case ids repeat");
        let folders = std::fs::read_dir(fixtures().join(slice).join("expected"))
            .unwrap()
            .count();
        assert_eq!(
            folders,
            cases.len(),
            "{slice}: one expected folder per case"
        );
        let err = check_floor(slice, 0, floor).unwrap_err();
        assert!(err.contains("below the floor"), "{err}");
    }
}

// ---------------------------------------------------------------------------------------------
// Fixed-text assertions the goldens cannot make
// ---------------------------------------------------------------------------------------------

#[test]
fn a_remote_tier_1_file_carrying_tier_2_keys_yields_an_env_with_no_tier_2_key() {
    let case = load_cases("builders")
        .into_iter()
        .find(|c| c["id"] == "known-fix-env-remote-file-with-tier-2-keys")
        .unwrap();
    let (result, events) = run_builders_case(&case);
    assert_eq!(result, json!({ "FROM_REMOTE": "1" }));
    // The warnings name the key and the layer, never a profile path.
    for event in events.as_array().unwrap() {
        let text = event["text"].as_str().unwrap();
        assert!(!text.contains("GameLib/fixes"), "{text}");
    }
}

#[test]
fn the_env_notes_are_fixed_text_with_no_wine_name_or_path() {
    let case = load_cases("builders")
        .into_iter()
        .find(|c| c["platform"] == "linux" && c["call"]["op"] == "wineEnv")
        .unwrap();
    let (_, events) = run_builders_case(&case);
    let text = events[0]["text"].as_str().unwrap();
    assert_eq!(events[0]["level"], "error");
    assert!(
        !text.contains("Wine-Staging") && !text.contains("/pins/") && !text.contains("undefined")
    );
}
