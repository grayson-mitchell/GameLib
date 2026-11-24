//! The tier-2 registry and dllOverrides fixes against the TS goldens (88-06 recorded them, 88-09 replays
//! them; D-15, D-22). `golden/registry` holds 57 cases, each a list of steps run on a fresh fake HOME:
//!
//! - pure steps (`validate`, `dllCompile`, `profileFixes`, `commandParts`, `regIsSet`, `prefixDir`,
//!   `timeout`): the module's functions over the step's input, compared with `result.json` and the
//!   warnings with `events.json`;
//! - `apply`: `apply_registry_fixes` over a recording [`RegistryRun`] scripted from the step's outcomes,
//!   compared with `result.json`, `events.json` and `calls.json`;
//! - `profileApply`: the profile read and the application over the same recording run (seam
//!   `scripted`), or over gamelib-wine's command core on a scripted spawn seam (seam `real`).
//!
//! Documented differences (`deltas.json`): a timed-out `reg add` is killed through its helper's group, so
//! the replay records the kill without the signal name; the events' `prefix` field (the TS log prefix) is
//! not a Rust concept. A count floor lives in this file, so editing the JSON alone cannot lower the bar,
//! and an empty case list fails (D-22: every case runs on a gamelib_testutil FakeHome).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::jsvalue::JsValue;
use gamelib_knownfix::registry::{
    apply_known_fix_profile_registry, apply_known_fix_profile_registry_with, apply_registry_fixes,
    command_parts, dll_overrides_to_registry_fixes, prefix_dir, profile_registry_fixes_js,
    validate_registry_fixes, value_is_set, RegistryRun, RegistryRunOutcome, RunFuture, RunOptions,
    ValidRegistryFix, BRIDGE_RUN_OPTIONS, LAUNCHER_RUN_OPTIONS, REGISTRY_FIX_TIMEOUT,
};
use gamelib_knownfix::types::Runner;
use gamelib_knownfix::CancellationToken;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::env::EnvSnapshot;
use gamelib_wine::wine_cmd::WineHost;
use serde_json::{json, Value};

/// `golden/registry` holds 57 cases, all compared: 52 over the recording seam and 5 launcher-path cases
/// over the wine command core. The plan asks for at least 50. A later edit may raise this, never lower it.
const REGISTRY_FLOOR: usize = 57;

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/registry")
}

fn read_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&read_text(path)).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

/// The oracle's profile layout rooted in a fake HOME: the app folder is `<HOME>/.config/GameLib` and the
/// bundled fixes `<HOME>/public/fixes`.
struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    ctx: KnownFixCtx,
    /// The spawn seam of a wine-core rig: what the scripted `reg add` children saw.
    runner: Option<Arc<ScriptedSpecRunner>>,
}

impl Rig {
    fn new() -> Rig {
        Rig::build(Platform::Mac, None)
    }

    /// The oracle's pinned base environment: the fake HOME's eight variables, then PATH, LANG and USER.
    fn base_env(home: &FakeHome) -> Vec<(String, String)> {
        let mut env: Vec<(String, String)> = home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect();
        env.push(("PATH".to_string(), "/usr/bin:/bin".to_string()));
        env.push(("LANG".to_string(), "C.UTF-8".to_string()));
        env.push(("USER".to_string(), "gamelib-oracle".to_string()));
        env
    }

    /// A rig on `platform`; with `scripted`, the context carries a wine core over a scripted spawn seam.
    fn build(platform: Platform, scripted: Option<&Value>) -> Rig {
        let home = FakeHome::new("knownfix-registry-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let base = Rig::base_env(&home);
        let runner = scripted.map(|script| {
            let mut runner = ScriptedSpecRunner::new(base.clone());
            for entry in script.as_array().unwrap() {
                let program = entry["program"]
                    .as_str()
                    .unwrap()
                    .replace("<TOOLS>", &app_folder.join("tools").to_string_lossy())
                    .replace("<HOME>", &root.to_string_lossy());
                runner = runner.on_program(
                    &program,
                    SpecOutput {
                        code: entry["code"].as_i64().map(|c| c as i32),
                        stdout: entry["stdout"].as_str().unwrap_or_default().to_string(),
                        stderr: entry["stderr"].as_str().unwrap_or_default().to_string(),
                        ..SpecOutput::default()
                    },
                );
            }
            Arc::new(runner)
        });
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
        if let Some(runner) = &runner {
            engine = engine.with_proc(runner.clone());
        }
        let engine = Arc::new(engine);
        let mut ctx = KnownFixCtx::new(
            Arc::clone(&engine),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        );
        if runner.is_some() {
            let wine = WineCtx::new(engine, app_folder.join("tools").join("runtimes"));
            let host = WineHost {
                env: EnvSnapshot::from_pairs(base),
                ..WineHost::default()
            };
            ctx = ctx.with_wine(Arc::new(wine), host);
        }
        Rig {
            home,
            log,
            ctx,
            runner,
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn expand(&self, text: &str) -> String {
        text.replace(
            "<TOOLS>",
            &self
                .root()
                .join(".config")
                .join("GameLib")
                .join("tools")
                .to_string_lossy(),
        )
        .replace(
            "<APPFOLDER>",
            &self
                .root()
                .join(".config")
                .join("GameLib")
                .to_string_lossy(),
        )
        .replace("<HOME>", &self.root().to_string_lossy())
    }

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

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`, so the
    /// real name is listed too), Windows separators folded to `/`.
    fn normalise_text(&self, text: &str) -> String {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let app = self.root().join(".config").join("GameLib");
        let mut table = vec![
            ("<TOOLS>", as_text(&app.join("tools"))),
            ("<APPFOLDER>", as_text(&app)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    let real_app = real.join(".config").join("GameLib");
                    table.insert(0, ("<TOOLS>", as_text(&real_app.join("tools"))));
                    table.insert(1, ("<APPFOLDER>", as_text(&real_app)));
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        let mut s = text.to_string();
        for (token, root) in table {
            s = s.replace(root.as_str(), token);
        }
        if cfg!(windows)
            && (s.contains("<APPFOLDER>") || s.contains("<HOME>") || s.contains("<TOOLS>"))
        {
            s = s.replace('\\', "/");
        }
        s
    }

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

    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            if entry["dir"].as_bool() == Some(true) {
                std::fs::create_dir_all(&target).unwrap();
            } else {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
            }
        }
    }
}

/// An object's value under `key` in an order-preserving parsed tree, when present.
fn member<'a>(value: &'a JsValue, key: &str) -> Option<&'a JsValue> {
    match value {
        JsValue::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
        _ => None,
    }
}

fn items(value: &JsValue) -> &[JsValue] {
    match value {
        JsValue::Array(items) => items,
        other => panic!("{} is not an array", other.stringify()),
    }
}

/// One scripted `reg add` run: how it settles (`outcomes` of a step).
#[derive(Debug, Clone)]
struct Scripted {
    code: Option<i32>,
    result: String,
    message: String,
    child: Option<(u32, bool)>,
}

impl Scripted {
    fn parse(value: &Value) -> Scripted {
        let result = value["result"].as_str().unwrap_or("code").to_string();
        Scripted {
            code: Some(value["code"].as_i64().map(|c| c as i32).unwrap_or(0)),
            result,
            message: value["message"].as_str().unwrap_or("rejected").to_string(),
            child: value
                .get("child")
                .map(|c| (c["pid"].as_u64().unwrap() as u32, c["exitCode"].is_null())),
        }
    }
}

/// What a recording run says its calls look like: a plain run records the command parts only; a
/// wine-shaped one also records what the wine command was asked with.
#[derive(Clone)]
enum Seam {
    Plain,
    Wine {
        options: RunOptions,
        wine_prefix: Option<String>,
    },
}

/// A [`RegistryRun`] that records each call and settles from a script. A run that "never" settles ends
/// when its cancel token fires, killing its scripted child when that is still running.
struct RecordingRun {
    step: usize,
    seam: Seam,
    outcomes: Mutex<VecDeque<Scripted>>,
    otherwise: Option<Scripted>,
    calls: Arc<Mutex<Vec<Value>>>,
}

impl RecordingRun {
    fn left(&self) -> usize {
        self.outcomes.lock().unwrap().len()
    }
}

impl RegistryRun for RecordingRun {
    fn run(&self, parts: Vec<String>, cancel: CancellationToken) -> RunFuture<'_> {
        let step = self.step;
        let call = match &self.seam {
            Seam::Plain => json!({"step": step, "kind": "run", "commandParts": parts}),
            Seam::Wine {
                options,
                wine_prefix,
            } => json!({
                "step": step,
                "kind": "runWineCommand",
                "commandParts": parts,
                "wait": false,
                "protonVerb": options.proton_verb,
                "skipPrefixCheckIKnowWhatImDoing": if options.skip_prefix_check { json!(true) } else { Value::Null },
                "winePrefix": wine_prefix,
            }),
        };
        self.calls.lock().unwrap().push(call);
        let scripted = self
            .outcomes
            .lock()
            .unwrap()
            .pop_front()
            .or_else(|| self.otherwise.clone())
            .unwrap_or_else(|| Scripted::parse(&json!({})));
        let calls = Arc::clone(&self.calls);
        Box::pin(async move {
            match scripted.result.as_str() {
                "undefined" => RegistryRunOutcome::Code(None),
                "reject" => RegistryRunOutcome::Failed(scripted.message),
                "never" => {
                    cancel.cancelled().await;
                    match scripted.child {
                        Some((pid, true)) => {
                            calls
                                .lock()
                                .unwrap()
                                .push(json!({"step": step, "kind": "kill", "pid": pid}));
                            RegistryRunOutcome::Killed(Some(pid))
                        }
                        _ => RegistryRunOutcome::Cancelled,
                    }
                }
                _ => RegistryRunOutcome::Code(scripted.code),
            }
        })
    }
}

fn options_of(seam: &str) -> Seam {
    match seam {
        "plain" => Seam::Plain,
        other => panic!("unknown seam {other}"),
    }
}

/// The three results every step of a case produces.
struct Step {
    result: Value,
}

fn fix_of(value: &Value) -> ValidRegistryFix {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("{value}: {e}"))
}

fn views_of(value: &Value) -> u8 {
    value.as_u64().unwrap() as u8
}

fn validated_json(fixes: &[ValidRegistryFix]) -> Value {
    serde_json::to_value(fixes).unwrap()
}

/// Runs one step; returns its `result.json` entry. Calls and events are filed by the caller.
async fn run_step(
    rig: &Rig,
    index: usize,
    step: &Value,
    ordered: &JsValue,
    calls: &Arc<Mutex<Vec<Value>>>,
) -> Step {
    let op = step["op"].as_str().unwrap();
    let raw = member(ordered, "raw");
    let label = "gog 123";
    let result = match op {
        "validate" => {
            let got = validate_registry_fixes(&rig.ctx, raw, label);
            json!({"op": op, "raw": step["raw"], "result": validated_json(&got)})
        }
        "dllCompile" => {
            let compiled = dll_overrides_to_registry_fixes(&rig.ctx, raw, label);
            let compiled_json: Vec<Value> = compiled.iter().map(JsValue::to_value).collect();
            let mut out = json!({
                "op": op,
                "raw": step.get("raw").cloned().unwrap_or(Value::Null),
                "compiled": compiled_json,
            });
            if step["thenValidate"].as_bool() == Some(true) {
                let tree = JsValue::Array(compiled);
                let got = validate_registry_fixes(&rig.ctx, Some(&tree), label);
                out["validated"] = validated_json(&got);
            }
            out
        }
        "profileFixes" => {
            let profile = member(ordered, "profile").unwrap();
            let got = profile_registry_fixes_js(
                &rig.ctx,
                member(profile, "registry"),
                member(profile, "dllOverrides"),
                label,
            );
            json!({
                "op": op,
                "profile": step["profile"],
                "result": got.as_ref().map(JsValue::to_value).unwrap_or(Value::Null),
                "isUndefined": got.is_none(),
                "isTheProfileRegistry": member(profile, "dllOverrides").is_none(),
            })
        }
        "commandParts" => {
            let fix = fix_of(&step["fix"]);
            let parts = command_parts(&fix, views_of(&step["view"]));
            json!({"op": op, "fix": step["fix"], "view": step["view"], "parts": parts})
        }
        "regIsSet" => {
            let fix = fix_of(&step["fix"]);
            let set = value_is_set(
                step["regText"].as_str().unwrap(),
                &fix,
                views_of(&step["view"]),
            );
            json!({"op": op, "fix": step["fix"], "view": step["view"], "isSet": set})
        }
        "prefixDir" => {
            let settings = rig.expand_deep(&step["settings"]);
            let dir = prefix_dir(rig.root(), &settings)
                .map(|p| Value::String(p.to_string_lossy().into_owned()))
                .unwrap_or(Value::Null);
            json!({"op": op, "settings": step["settings"], "dir": dir})
        }
        "timeout" => json!({"op": op, "ms": REGISTRY_FIX_TIMEOUT.as_millis() as u64}),
        "apply" => {
            let prefix = step["prefix"].as_str().map(|p| rig.expand(p));
            if let Some(entries) = step.get("seed") {
                rig.seed(entries);
            }
            let seam = match step["seam"].as_str().unwrap() {
                "bridge" => Seam::Wine {
                    options: BRIDGE_RUN_OPTIONS,
                    wine_prefix: prefix.clone(),
                },
                other => options_of(other),
            };
            let run = RecordingRun {
                step: index,
                seam,
                outcomes: Mutex::new(
                    step["outcomes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(Scripted::parse)
                        .collect(),
                ),
                otherwise: None,
                calls: Arc::clone(calls),
            };
            apply_registry_fixes(
                &rig.ctx,
                raw,
                step["label"].as_str().unwrap(),
                &run,
                prefix.as_deref().map(Path::new),
            )
            .await;
            json!({
                "op": op,
                "raw": step["raw"],
                "label": step["label"],
                "logPrefix": step["logPrefix"],
                "seam": step["seam"],
                "prefix": step["prefix"].as_str().map(Value::from).unwrap_or(Value::Null),
                "settled": true,
                "outcomesLeft": run.left(),
            })
        }
        "profileApply" => {
            rig.seed(&step["seed"]);
            let settings = rig.expand_deep(&step["settings"]);
            let runner = Runner::parse(step["runner"].as_str().unwrap()).unwrap();
            let run = RecordingRun {
                step: index,
                seam: Seam::Wine {
                    options: LAUNCHER_RUN_OPTIONS,
                    wine_prefix: settings["winePrefix"].as_str().map(str::to_string),
                },
                outcomes: Mutex::new(
                    step["outcomes"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(Scripted::parse)
                        .collect(),
                ),
                otherwise: step.get("otherwise").map(Scripted::parse),
                calls: Arc::clone(calls),
            };
            apply_known_fix_profile_registry_with(
                &rig.ctx,
                step["appName"].as_str().unwrap(),
                runner,
                &settings,
                &run,
            )
            .await;
            json!({
                "op": op,
                "appName": step["appName"],
                "runner": step["runner"],
                "seam": step["seam"],
                "settled": true,
            })
        }
        other => panic!("unknown step op {other}"),
    };
    Step { result }
}

/// The call site the TS recorded for every `reg add` of this module, and the spawn class the shell
/// assigns it (`golden/classes.json`).
const CALL_SITE: &str = "knownfix.registry.reg_add";

fn classes() -> Value {
    read_json(&golden_dir().parent().unwrap().join("classes.json"))
}

/// What a launcher-path case produced: the answer and log, the `runWineCommand` calls as the spawns show
/// them, and the whole spawn (program, argv, full environment, cwd) of each `reg add`.
struct RealRun {
    result: Value,
    events: Value,
    calls: Value,
    spawns: Value,
}

/// Runs a `real` case: the profile hook over `gamelib-wine`'s command core on a scripted spawn seam. The
/// settings carry a real wine installation under the fake HOME and the prefix files are seeded, so the
/// command core's prefix check, environment merge and spawn all run as in the app.
async fn run_real_case(case: &Value) -> RealRun {
    let platform = match case["platform"].as_str().unwrap() {
        "mac" => Platform::Mac,
        "linux" => Platform::Linux,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    };
    let rig = Rig::build(platform, Some(&case["scripted"]));
    let steps = case["steps"].as_array().unwrap();
    assert_eq!(steps.len(), 1, "a launcher-path case is one step");
    let step = &steps[0];
    assert_eq!(step["op"], "profileApply");
    rig.seed(&step["seed"]);
    let settings = rig.expand_deep(&step["settings"]);
    let runner = Runner::parse(step["runner"].as_str().unwrap()).unwrap();
    apply_known_fix_profile_registry(
        &rig.ctx,
        step["appName"].as_str().unwrap(),
        runner,
        &settings,
    )
    .await
    .expect("the wine core is installed");

    let scripted = rig.runner.as_ref().unwrap();
    assert!(
        scripted.unscripted().is_empty(),
        "unscripted spawns: {:?}",
        scripted.unscripted()
    );
    let base: std::collections::BTreeMap<String, String> =
        Rig::base_env(&rig.home).into_iter().collect();
    let classes = classes();
    let class = classes[CALL_SITE].clone();
    let mut calls = Vec::new();
    let mut spawns = Vec::new();
    for spawn in scripted.spawns() {
        // The environment the child saw: the base without what the spawn unset, plus what it set.
        let mut env = base.clone();
        for key in &spawn.env_unset {
            env.remove(key);
        }
        env.extend(spawn.env_set.clone());
        let verb = env.get("PROTON_VERB").cloned();
        let mut parts = spawn.argv.clone();
        // A proton wine takes its verb as the first argument; the command parts are what follows.
        if spawn.program.ends_with("/proton")
            && parts.first().map(String::as_str) == verb.as_deref()
        {
            parts.remove(0);
        }
        calls.push(json!({
            "step": 0,
            "kind": "runWineCommand",
            "commandParts": parts,
            "wait": false,
            "protonVerb": verb,
            "skipPrefixCheckIKnowWhatImDoing": Value::Null,
            "winePrefix": settings["winePrefix"],
        }));
        assert_eq!(spawn.label, "wine-command");
        assert!(
            spawn.timeout.is_none(),
            "a reg add is bounded by its cancel, not a spec timeout"
        );
        spawns.push(json!({
            "callSite": CALL_SITE,
            "program": spawn.program,
            "argv": spawn.argv,
            "env": env,
            "unsetEnv": spawn.env_unset,
            "cwd": spawn.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
            "stdin": spawn.stdin,
            "via": "run",
            "result": {
                "code": spawn.result.code,
                "stdout": spawn.result.stdout,
                "stderr": spawn.result.stderr,
            },
            "class": class,
        }));
    }
    let events: Vec<Value> = rig
        .log
        .lines()
        .into_iter()
        .filter(|(level, _)| *level != "error")
        .map(|(level, line)| {
            json!({
                "step": 0,
                "level": if level == "warn" { "warning" } else { level },
                "text": line,
            })
        })
        .collect();
    RealRun {
        result: rig.normalise(json!({"steps": [{
            "op": "profileApply",
            "appName": step["appName"],
            "runner": step["runner"],
            "seam": step["seam"],
            "settled": true,
        }]})),
        events: rig.normalise(Value::Array(events)),
        calls: rig.normalise(Value::Array(calls)),
        spawns: rig.normalise(Value::Array(spawns)),
    }
}

fn is_real_seam(case: &Value) -> bool {
    case["steps"]
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["seam"] == "real")
}

/// Runs one case on a fresh fake HOME; returns `(result, events, calls)` normalised like the golden.
async fn run_case(case: &Value, ordered: &JsValue) -> (Value, Value, Value) {
    let rig = Rig::new();
    let calls = Arc::new(Mutex::new(Vec::new()));
    let mut results = Vec::new();
    let mut events = Vec::new();
    let ordered_steps = member(ordered, "steps").unwrap();
    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        let before = rig.log.lines().len();
        let done = run_step(&rig, index, step, &items(ordered_steps)[index], &calls).await;
        results.push(done.result);
        for (level, line) in rig.log.lines().into_iter().skip(before) {
            events.push(json!({
                "step": index,
                "level": if level == "warn" { "warning" } else { level },
                "text": line,
            }));
        }
    }
    let calls = calls.lock().unwrap().clone();
    (
        rig.normalise(json!({ "steps": results })),
        rig.normalise(Value::Array(events)),
        rig.normalise(Value::Array(calls)),
    )
}

/// The golden's events without the TS log prefix, which has no Rust counterpart.
fn golden_events(dir: &Path) -> Value {
    let mut events = read_json(&dir.join("events.json"));
    for event in events.as_array_mut().unwrap() {
        event.as_object_mut().unwrap().remove("prefix");
    }
    events
}

/// The golden's calls as the replay can state them: the wine runner's own `runner.run` lines belong to
/// the spawn-level comparison, the TS-only `hasOnSpawn` and `gameSettingsIsTheCallers` flags are true by
/// construction in Rust (the seam takes the settings and a cancel), and a kill is recorded without the
/// signal name because the helper's whole group is killed (`deltas.json`).
fn golden_calls(dir: &Path) -> Value {
    let calls = read_json(&dir.join("calls.json"));
    let mut out = Vec::new();
    for mut call in calls.as_array().unwrap().iter().cloned() {
        let object = call.as_object_mut().unwrap();
        match object["kind"].as_str().unwrap() {
            "runner.run" => continue,
            "kill" => {
                object.remove("signal");
            }
            "runWineCommand" => {
                assert_eq!(object.remove("hasOnSpawn"), Some(json!(true)));
                assert_eq!(object.remove("gameSettingsIsTheCallers"), Some(json!(true)));
            }
            _ => {}
        }
        out.push(call);
    }
    Value::Array(out)
}

fn load_cases() -> (Vec<Value>, Vec<JsValue>) {
    let path = golden_dir().join("cases.json");
    let ordered = JsValue::parse(&read_text(&path)).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let cases = match ordered.to_value() {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    };
    (cases, items(&ordered).to_vec())
}

/// One paused-clock replay of every case: the recording seam and the wine-core launcher path. The clock is
/// paused so a `reg add` that never settles hits its 15 s bound without waiting for it.
#[tokio::test(start_paused = true)]
async fn every_registry_golden_replays() {
    let (cases, ordered) = load_cases();
    let started = std::time::Instant::now();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for (case, ordered) in cases.iter().zip(&ordered) {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let mut checks = Vec::new();
        if is_real_seam(case) {
            let run = run_real_case(case).await;
            checks.push(("result", run.result, read_json(&dir.join("result.json"))));
            checks.push(("events", run.events, golden_events(&dir)));
            checks.push(("calls", run.calls, golden_calls(&dir)));
            checks.push(("spawns", run.spawns, read_json(&dir.join("spawns.json"))));
        } else {
            let (result, events, calls) = run_case(case, ordered).await;
            checks.push(("result", result, read_json(&dir.join("result.json"))));
            checks.push(("events", events, golden_events(&dir)));
            checks.push(("calls", calls, golden_calls(&dir)));
        }
        for (what, got, want) in checks {
            if got != want {
                failures.push(format!("{id}: {what}\n  want {want}\n  got  {got}"));
            }
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor("golden/registry cases compared", compared, REGISTRY_FLOOR).unwrap();
    // Four cases wait out 15 s of virtual time each; none of that was real.
    assert!(
        started.elapsed() < std::time::Duration::from_secs(10),
        "the replay waited on the wall clock"
    );
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let (cases, _) = load_cases();
    assert_eq!(manifest["count"].as_u64(), Some(cases.len() as u64));
    assert!(REGISTRY_FLOOR <= cases.len());
    assert!(
        cases.len() >= 57,
        "{} cases, below the 57 recorded",
        cases.len()
    );
    let ids: std::collections::BTreeSet<&str> =
        cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), cases.len(), "case ids repeat");
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "one expected folder per case");
    let err = check_floor("golden/registry cases", 0, REGISTRY_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

/// A fix as a test names it.
fn dword(key: &str, name: &str, value: u32) -> Value {
    json!({"key": key, "name": name, "type": "REG_DWORD", "value": value})
}

fn plain_run(outcomes: &[Value]) -> (RecordingRun, Arc<Mutex<Vec<Value>>>) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    (
        RecordingRun {
            step: 0,
            seam: Seam::Plain,
            outcomes: Mutex::new(outcomes.iter().map(Scripted::parse).collect()),
            otherwise: None,
            calls: Arc::clone(&calls),
        },
        calls,
    )
}

#[tokio::test(start_paused = true)]
async fn a_run_that_never_settles_is_cancelled_at_15_s_and_the_next_fix_still_runs() {
    let rig = Rig::new();
    let raw = JsValue::from_value(&json!([
        dword("HKCU\\Software\\Foo", "A", 1),
        dword("HKCU\\Software\\Foo", "B", 1),
    ]));
    // The first fix's first view never settles (its child is alive); everything after settles.
    let mut script = vec![json!({"result": "never", "child": {"pid": 4242, "exitCode": null}})];
    script.extend(std::iter::repeat(json!({})).take(3));
    let (run, calls) = plain_run(&script);
    let begun = tokio::time::Instant::now();
    apply_registry_fixes(&rig.ctx, Some(&raw), "gog 123", &run, None).await;
    assert_eq!(begun.elapsed(), REGISTRY_FIX_TIMEOUT, "virtual time spent");
    let lines = rig.log.lines();
    assert_eq!(lines.len(), 1, "{lines:?}");
    assert_eq!(
        lines[0].1,
        "gog 123: registry fix HKCU\\Software\\Foo A (/reg:32) timed out after 15000 ms; killed reg add (pid 4242)"
    );
    // Four runs in all: the timed-out one did not stop the rest.
    let runs = calls
        .lock()
        .unwrap()
        .iter()
        .filter(|c| c["kind"] == "run")
        .count();
    assert_eq!(runs, 4);
    assert_eq!(run.left(), 0);
}

#[tokio::test(start_paused = true)]
async fn a_run_that_ignores_the_cancel_is_abandoned_after_the_grace_with_the_no_child_warning() {
    struct Stuck;
    impl RegistryRun for Stuck {
        fn run(&self, _parts: Vec<String>, _cancel: CancellationToken) -> RunFuture<'_> {
            Box::pin(std::future::pending())
        }
    }
    let rig = Rig::new();
    let raw = JsValue::from_value(&json!([dword("HKCU\\Software\\Foo", "A", 1)]));
    let begun = tokio::time::Instant::now();
    apply_registry_fixes(&rig.ctx, Some(&raw), "gog 123", &Stuck, None).await;
    // Two views, each bounded: never an unbounded wait.
    assert!(begun.elapsed() < 2 * (REGISTRY_FIX_TIMEOUT + std::time::Duration::from_secs(10)));
    let lines = rig.log.lines();
    assert_eq!(lines.len(), 2, "{lines:?}");
    assert!(lines[0].1.ends_with("timed out (no running child to kill)"));
}

#[tokio::test(start_paused = true)]
async fn an_application_after_shutdown_began_runs_nothing() {
    let rig = Rig::new();
    rig.ctx.engine.shutdown.token().cancel();
    let raw = JsValue::from_value(&json!([dword("HKCU\\Software\\Foo", "A", 1)]));
    let (run, calls) = plain_run(&[]);
    apply_registry_fixes(&rig.ctx, Some(&raw), "gog 123", &run, None).await;
    assert!(calls.lock().unwrap().is_empty());
    assert!(rig.log.lines().is_empty());
}

#[test]
fn every_recorded_reg_add_is_the_one_call_site_and_the_class_is_helper() {
    // The shell classes `knownfix.registry.reg_add` as a helper: a child GameLib starts for itself, never a
    // game that must outlive it (the Rust shutdown contract).
    assert_eq!(classes()[CALL_SITE], "helper");
    let (cases, _) = load_cases();
    let mut seen = 0usize;
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let spawns = read_json(&golden_dir().join("expected").join(id).join("spawns.json"));
        for spawn in spawns.as_array().unwrap() {
            assert_eq!(spawn["callSite"], CALL_SITE, "{id}");
            assert_eq!(spawn["class"], "helper", "{id}");
            seen += 1;
        }
    }
    assert!(seen >= 7, "{seen} recorded spawns");
}

/// A wine installation under the fake HOME whose binaries exist, on the settings shape the renderer holds.
fn wine_settings(rig: &Rig, kind: &str) -> Value {
    let bin = rig.root().join("wine").join("bin").join("wine");
    std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
    std::fs::write(&bin, "").unwrap();
    std::fs::write(bin.with_file_name("wineserver"), "").unwrap();
    json!({
        "winePrefix": rig.root().join("prefix").to_string_lossy(),
        "wineVersion": {
            "type": kind,
            "name": "Wine-9",
            "bin": bin.to_string_lossy(),
            "wineserver": bin.with_file_name("wineserver").to_string_lossy(),
        },
    })
}

#[tokio::test(start_paused = true)]
async fn the_bridge_reads_the_steam_profile_itself_and_never_checks_the_prefix() {
    let scripted = json!([{"program": "<HOME>/wine/bin/wine", "code": 0}]);
    let rig = Rig::build(Platform::Linux, Some(&scripted));
    rig.seed(&json!([{
        "path": "<APPFOLDER>/fixes/local/284100-steam.profile.json",
        "text": r#"{"title":"t","registry":[{"key":"HKCU\\Software\\Foo","name":"Bar","type":"REG_DWORD","value":1}],"dllOverrides":[{"exe":"Game.exe","dlls":{"d3d9":"native"}}]}"#
    }]));
    // A tier-2 profile for another store is not this game's.
    rig.seed(&json!([{
        "path": "<APPFOLDER>/fixes/local/284100-gog.profile.json",
        "text": r#"{"registry":[{"key":"HKCU\\Software\\Other","name":"X","type":"REG_DWORD","value":1}]}"#
    }]));
    let settings = wine_settings(&rig, "wine");
    // Bridge: the prefix directory is missing, and the prefix check is skipped, so nothing but the three
    // `reg add` children starts.
    gamelib_knownfix::registry::apply_bridge_registry_fixes(
        &rig.ctx,
        "284100",
        "Steam 284100",
        &settings,
        None,
    )
    .await
    .expect("the wine core is installed");
    let spawns = rig.runner.as_ref().unwrap().spawns();
    let parts: Vec<Vec<String>> = spawns.iter().map(|s| s.argv.clone()).collect();
    assert_eq!(parts.len(), 3, "{parts:?}");
    assert!(
        parts.iter().all(|argv| argv[..2] == ["reg", "add"]),
        "{parts:?}"
    );
    assert!(parts[0].contains(&"HKCU\\Software\\Foo".to_string()));
    assert!(
        parts[2].contains(&"d3d9".to_string()),
        "registry then dllOverrides"
    );
    assert!(spawns
        .iter()
        .all(|s| s.env_set.get("PROTON_VERB").map(String::as_str) == Some("run")));
    // The wine core notes the missing library folders of this bare installation; the fixes themselves
    // warn about nothing.
    assert!(
        rig.log.lines().iter().all(|(level, _)| *level == "error"),
        "{:?}",
        rig.log.lines()
    );

    // The same settings through the launcher's options check the prefix first, and the missing prefix is
    // created before any `reg add` runs.
    let rig2 = Rig::build(Platform::Linux, Some(&scripted));
    rig2.seed(&json!([{
        "path": "<APPFOLDER>/fixes/local/GOGAPP-gog.profile.json",
        "text": r#"{"registry":[{"key":"HKCU\\Software\\Foo","name":"Bar","type":"REG_DWORD","value":1,"views":[64]}]}"#
    }]));
    let settings2 = wine_settings(&rig2, "wine");
    apply_known_fix_profile_registry(&rig2.ctx, "GOGAPP", Runner::Gog, &settings2)
        .await
        .unwrap();
    let first = rig2.runner.as_ref().unwrap().spawns();
    assert!(first.len() >= 2, "the prefix is verified first: {first:?}");
    assert_ne!(first[0].argv[..2], ["reg", "add"]);
}

#[tokio::test(start_paused = true)]
async fn the_registry_ops_run_through_dispatch_and_hold_the_knownfix_registrant() {
    let scripted = json!([{"program": "<HOME>/wine/bin/wine", "code": 0}]);
    let rig = Rig::build(Platform::Linux, Some(&scripted));
    rig.seed(&json!([{
        "path": "<APPFOLDER>/fixes/local/GOGAPP-gog.profile.json",
        "text": r#"{"registry":[{"key":"HKCU\\Software\\Foo","name":"Bar","type":"REG_DWORD","value":1,"views":[64]}]}"#
    }]));
    let mut settings = wine_settings(&rig, "wine");
    // A complete prefix, so the launcher's check passes and exactly one `reg add` runs.
    let prefix = PathBuf::from(settings["winePrefix"].as_str().unwrap());
    for dir in ["dosdevices", "drive_c"] {
        std::fs::create_dir_all(prefix.join(dir)).unwrap();
    }
    for file in ["system.reg", "user.reg", "userdef.reg"] {
        std::fs::write(prefix.join(file), "").unwrap();
    }
    settings["winePrefix"] = Value::String(prefix.to_string_lossy().into_owned());
    let answer = gamelib_knownfix::dispatch(
        "knownfix_apply_profile_registry",
        &[json!({"appName": "GOGAPP", "runner": "gog", "gameSettings": settings})],
        &rig.ctx,
    )
    .await;
    assert_eq!(answer, Ok(Value::Null));
    let spawns = rig.runner.as_ref().unwrap().spawns();
    assert_eq!(spawns.len(), 1, "{spawns:?}");
    assert_eq!(spawns[0].argv[..2], ["reg", "add"]);
    // The registrant was released when the op answered.
    assert!(rig
        .ctx
        .engine
        .shutdown
        .drain(std::time::Duration::from_millis(50))
        .is_empty());
}

/// The production seam end to end on unix: a real child through `gamelib-proc`'s `SpecProcRunner` (the
/// app's `SpawnClass::Helper` runner), ended by the run's cancel token. Real time, no paused clock.
#[cfg(unix)]
#[tokio::test]
async fn a_cancelled_reg_add_is_a_helper_child_that_is_gone_afterwards() {
    use gamelib_knownfix::registry::WineRegistryRun;
    use gamelib_proc::spec::SpecProcRunner;
    use std::os::unix::fs::PermissionsExt;

    let home = FakeHome::new("knownfix-registry-proc-");
    let root = home.root().to_path_buf();
    let pid_file = root.join("child.pid");
    let bin = root.join("wine").join("bin").join("wine");
    std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
    std::fs::write(
        &bin,
        format!(
            "#!/bin/sh\necho $$ > '{}'\nexec /bin/sleep 60\n",
            pid_file.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::write(bin.with_file_name("wineserver"), "").unwrap();
    let settings = json!({
        "winePrefix": root.join("prefix").to_string_lossy(),
        "wineVersion": {
            "type": "wine",
            "name": "Wine-9",
            "bin": bin.to_string_lossy(),
            "wineserver": bin.with_file_name("wineserver").to_string_lossy(),
        },
    });
    let engine = Arc::new(
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_proc(Arc::new(SpecProcRunner)),
    );
    let wine = Arc::new(WineCtx::new(Arc::clone(&engine), root.join("runtime")));
    let host = WineHost {
        env: EnvSnapshot::from_pairs(Rig::base_env(&home)),
        ..WineHost::default()
    };
    let run = WineRegistryRun::new(wine, host, &settings, BRIDGE_RUN_OPTIONS);
    let cancel = CancellationToken::new();
    let parts = vec!["reg".to_string(), "add".to_string()];
    let handle = tokio::spawn({
        let cancel = cancel.clone();
        async move { run.run(parts, cancel).await }
    });
    // Wait (bounded) for the child to write its pid, then cancel.
    let mut pid = None;
    for _ in 0..200 {
        if let Ok(text) = std::fs::read_to_string(&pid_file) {
            if let Ok(parsed) = text.trim().parse::<i32>() {
                pid = Some(parsed);
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    let pid = pid.expect("the fake wine started");
    let alive = |pid: i32| {
        std::process::Command::new("/bin/kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    };
    assert!(alive(pid), "the child runs until it is cancelled");
    cancel.cancel();
    let outcome = tokio::time::timeout(std::time::Duration::from_secs(10), handle)
        .await
        .expect("the run answers soon after its cancel")
        .unwrap();
    assert_eq!(outcome, RegistryRunOutcome::Killed(None));
    let mut gone = false;
    for _ in 0..80 {
        if !alive(pid) {
            gone = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    assert!(gone, "the cancelled child is gone");
}
