//! The Rust replays of the prepare-step goldens recorded from the TypeScript:
//!
//! - `golden/prepare_launch` (88.1-02, 582 cases): the whole step a store manager runs before it builds its game
//!   command, through `gamelib_launch::prepare::launch::prepare_launch` over `ScriptedPrepareDeps`;
//! - `golden/prepare_wine` (88.1-03, 391 cases), the begin half (88.1-12), further down: `prepare_wine_begin`, the
//!   part of `prepareWineLaunch` up to the store-setup point.
//!
//! The first replay:
//!
//! What a case compares, after the documented differences below:
//! - the reply (`result.json`): success, failureReason, mangoHudCommand, gameModeBin, gameScopeCommand and
//!   offlineMode;
//! - the per-game log entries (`log.json`) as `{ level, parts }`, in order (D-30 interim: the TS `LogWriter`
//!   writes them, this step only returns them);
//! - the spawns (`spawns.json`): the program, argv, time limit, environment difference, working directory and
//!   result of the gamescope help probe and of the CrossOver bottle query, each with its spawn class from
//!   `golden/classes.json` (D-21: both are Helper spawns through the context's runner);
//! - the requests (`requests.json`): the Epic status GET (served by gamelib-engine's `Replay` over
//!   `recorded/epic_status`, so no case opens a socket) and, in order, the in-process calls that stand for the
//!   TS's `rustInvoke` requests (the anti-cheat lookup and the umu runtime check and download);
//! - the app's own log lines and the notification (`events.json`).
//!
//! Documented differences (each must be used by at least one case, or the replay fails):
//! - `observation-points`: the `online-monitor` and `hook` events are the TS's own observation points (how often
//!   the monitor was asked, the call of the store hook that resolves offline mode); the Rust step reads the
//!   online flag and applies the same rule in process, and the answer they produced is compared through
//!   `result.json`.
//! - `epic-status-log-fixed-text` (`golden/epic_status/deltas.json`): the unreachable warning leaves the transport
//!   code out.
//! - `wine-spawn-failure-line`: the TS command runner logged `Wine command failed to run: Error: spawn ENOENT`
//!   when the CrossOver query could not start; Rust's wine command core answers that failure in its result and
//!   logs nothing, and the bottle folder is `None` either way.
//! - `discord-rpc-dropped` (`golden/prepare_launch/deltas.json`): no case enables Discord presence, and the
//!   reply never carries a client.
//! - the settings object in the `Game Settings:` entry is compared as JSON, so the order of its keys (the TS
//!   kept merge order, Rust's maps are sorted) is not compared; every key and value is.
//!
//! A count floor lives in this file next to the replay (equal to the MANIFEST's), so editing the JSON alone
//! cannot lower the bar, and an empty case list fails.
//!
//! Unix only: the recorded paths are POSIX and the fake HOME's roots are normalised to placeholders; a non-unix
//! run prints the skip by name (WR-10).

#![cfg_attr(not(unix), allow(dead_code, unused_imports))]

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::Replay;
use gamelib_engine::testing::{RecordingLog, RecordingUi, ScriptedSpecRunner, UiEvent};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::prepare::deps::testing::ScriptedPrepareDeps;
use gamelib_launch::prepare::launch::{prepare_launch, PrepareHost, PrepareLaunchArgs};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::{json, Map, Value};

/// `golden/prepare_launch` holds 582 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const PREPARE_LAUNCH_FLOOR: usize = 582;

/// The version the oracle's requests carried in their `User-Agent` (`GameLib/oracle (+...)`).
const ORACLE_VERSION: &str = "oracle";

const GAMESCOPE: &str = "/usr/bin/gamescope";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/prepare_launch")
}

fn locales_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// A case list is usable only at or above its floor: an empty or shrunken list is an error, so the replay
/// cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

fn platform_of(name: &str) -> Option<Platform> {
    match name {
        "linux" => Some(Platform::Linux),
        "mac" => Some(Platform::Mac),
        "windows" => Some(Platform::Windows),
        _ => None,
    }
}

fn class_of(site: &str) -> String {
    read_json(&fixtures().join("golden/classes.json"))[site]
        .as_str()
        .unwrap_or_else(|| panic!("{site} has no class in classes.json"))
        .to_string()
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

/// Which documented differences a run applied.
#[derive(Default)]
struct Used(BTreeSet<&'static str>);

// ---------------------------------------------------------------------------------------------
// The profile a case runs in
// ---------------------------------------------------------------------------------------------

/// The paths of a fake HOME: the placeholders the goldens use (`<HOME>`, `<APPFOLDER>`) as real paths and back.
struct Profile {
    root: PathBuf,
    env: Vec<(String, String)>,
}

impl Profile {
    fn of(home: &FakeHome) -> Profile {
        Profile {
            root: home.root().to_path_buf(),
            env: home
                .env()
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
                .collect(),
        }
    }

    fn app_folder(&self) -> PathBuf {
        self.root.join(".config").join("GameLib")
    }

    /// `<HOME>`, `<APPFOLDER>` and `<TOOLS>` (`<APPFOLDER>/tools`) in `text` as real paths.
    fn expand(&self, text: &str) -> String {
        text.replace("<TOOLS>", "<APPFOLDER>/tools")
            .replace("<APPFOLDER>", &self.app_folder().to_string_lossy())
            .replace("<HOME>", &self.root.to_string_lossy())
    }

    /// `value` with every string expanded.
    fn expand_value(&self, value: &Value) -> Value {
        match value {
            Value::String(text) => Value::String(self.expand(text)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|v| self.expand_value(v)).collect())
            }
            Value::Object(fields) => Value::Object(
                fields
                    .iter()
                    .map(|(k, v)| (k.clone(), self.expand_value(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`, so the
    /// canonical root is listed too).
    fn normalise_text(&self, text: &str) -> String {
        let mut roots = vec![self.root.clone()];
        if let Ok(real) = std::fs::canonicalize(&self.root) {
            if real != self.root {
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
        out.replace("<APPFOLDER>/tools", "<TOOLS>")
    }

    fn normalise(&self, value: &Value) -> Value {
        match value {
            Value::String(text) => Value::String(self.normalise_text(text)),
            Value::Array(items) => Value::Array(items.iter().map(|v| self.normalise(v)).collect()),
            Value::Object(fields) => Value::Object(
                fields
                    .iter()
                    .map(|(k, v)| (k.clone(), self.normalise(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    /// The process facts the TS pinned (`withPinnedBaseEnv`): the fake HOME's eight variables and a fixed
    /// `PATH`, `LANG` and `USER`; the crate itself reads none of them.
    fn host(&self, facts: &Value) -> PrepareHost {
        let mut env = Map::new();
        for (key, value) in &self.env {
            env.insert(key.clone(), json!(value));
        }
        env.insert("PATH".into(), json!("/usr/bin:/bin"));
        env.insert("LANG".into(), json!("C.UTF-8"));
        env.insert("USER".into(), json!("gamelib-oracle"));
        serde_json::from_value(json!({
            "wine": { "env": env },
            "steamDeckGameMode": facts["steamDeckGameMode"],
            "flatpak": facts["flatpak"],
            "flatpakRuntimeVersion": facts["flatpakRuntimeVersion"],
        }))
        .unwrap()
    }
}

struct Rig {
    _home: FakeHome,
    profile: Profile,
    ctx: LaunchCtx,
    log: Arc<RecordingLog>,
    ui: Arc<RecordingUi>,
    runner: Arc<ScriptedSpecRunner>,
    replay: Arc<Replay>,
    _exchanges: tempfile::TempDir,
}

impl Rig {
    fn new(
        home: FakeHome,
        platform: Platform,
        epic_exchange: Option<&str>,
        online: bool,
        runner: ScriptedSpecRunner,
    ) -> Rig {
        let runner = Arc::new(runner);
        Rig::with_proc(
            home,
            platform,
            epic_exchange,
            online,
            runner.clone(),
            runner,
        )
    }

    /// A rig whose spawn seam is `proc` (a wrapper over the scripted `runner`, which still records the spawns).
    fn with_proc(
        home: FakeHome,
        platform: Platform,
        epic_exchange: Option<&str>,
        online: bool,
        runner: Arc<ScriptedSpecRunner>,
        proc: Arc<dyn SpecRunner>,
    ) -> Rig {
        let profile = Profile::of(&home);
        let root = profile.root.clone();
        let app_folder = profile.app_folder();
        // The Epic status request is served from the recorded exchange; every other case replays an empty list,
        // so a request the case did not script fails it.
        let exchanges = tempfile::tempdir().unwrap();
        match epic_exchange {
            Some(id) => {
                let source = fixtures().join("recorded/epic_status").join(id);
                for entry in std::fs::read_dir(&source).unwrap() {
                    let entry = entry.unwrap();
                    std::fs::copy(entry.path(), exchanges.path().join(entry.file_name())).unwrap();
                }
            }
            None => std::fs::write(exchanges.path().join("exchanges.json"), "[]").unwrap(),
        }
        let replay = Arc::new(Replay::from_case(exchanges.path()).unwrap());
        let log = Arc::new(RecordingLog::new());
        let ui = Arc::new(RecordingUi::new());
        let engine = EngineCtx::new(
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
        .with_proc(proc)
        .with_fetch(replay.clone())
        .with_ui(ui.clone())
        .with_log(log.clone())
        .with_i18n(Arc::new(gamelib_i18n::Catalog::load(&locales_dir(), "en")))
        .with_app_version(ORACLE_VERSION)
        .with_online(online);
        let engine = Arc::new(engine);
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            None,
            "https://relay.test",
            ORACLE_VERSION,
        ));
        // `<TOOLS>/runtimes` is the wine runtime path (the harness's own layout).
        let wine = Arc::new(WineCtx::new(
            engine.clone(),
            app_folder.join("tools").join("runtimes"),
        ));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: app_folder.clone(),
                user_data: app_folder,
                temp: root.join("tmp"),
                public_dir: None,
            },
            ORACLE_VERSION.to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        Rig {
            ctx: LaunchCtx::new(engine, knownfix, wine, info),
            profile,
            _home: home,
            log,
            ui,
            runner,
            replay,
            _exchanges: exchanges,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The scripted spawns and the case's arguments
// ---------------------------------------------------------------------------------------------

/// The runner a case's input scripts: the CrossOver bottle query (its stderr, or a spawn that could not start)
/// and the gamescope help probe, answered with what the recorded spawn's child answered.
fn scripted_runner(
    input: &Value,
    expected_spawns: &Value,
    base_env: Vec<(String, String)>,
    wine_bin: &str,
) -> ScriptedSpecRunner {
    let mut runner = ScriptedSpecRunner::new(base_env);
    if let Some(bottle) = input["crossoverBottle"].as_object() {
        let output = match bottle.get("spawnError").and_then(Value::as_str) {
            Some(reason) => SpecOutput {
                code: None,
                stderr: reason.to_string(),
                ..SpecOutput::default()
            },
            None => SpecOutput {
                code: Some(0),
                stderr: bottle["stderr"].as_str().unwrap_or_default().to_string(),
                ..SpecOutput::default()
            },
        };
        let bottle_name = input["gameSettings"]["wineCrossoverBottle"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        runner = runner.on(
            wine_bin,
            &["--bottle", &bottle_name, "--verbose", "whoami"],
            output,
        );
    }
    for spawn in expected_spawns.as_array().into_iter().flatten() {
        if spawn["callSite"] == "prepare_launch.gamescope_help" {
            let result = &spawn["result"];
            runner = runner.on(
                GAMESCOPE,
                &["--help"],
                SpecOutput {
                    code: result["code"].as_i64().map(|c| c as i32),
                    stderr: result["stderr"].as_str().unwrap_or_default().to_string(),
                    timed_out: result["timedOut"].as_bool().unwrap_or(false),
                    ..SpecOutput::default()
                },
            );
        }
    }
    runner
}

/// `PrepareLaunchArgs` from the facts the TS recorded: the game info, the settings and the TS-only facts.
fn args_of(profile: &Profile, input: &Value) -> PrepareLaunchArgs {
    let info = &input["gameInfo"];
    let mut args = json!({
        "settings": profile.expand_value(&input["gameSettings"]),
        "runner": input["runner"],
        "appName": info["app_name"],
        "title": info["title"],
        "canRunOffline": info["canRunOffline"].as_bool().unwrap_or(false),
        "isNative": input["isNative"],
        "storeExpired": input["storeExpired"],
    });
    let fields = args.as_object_mut().unwrap();
    if let Some(app) = info["thirdPartyManagedApp"].as_str() {
        fields.insert("thirdPartyManagedApp".into(), json!(app));
    }
    // `isStore(gameInfo, 'sideload') ? folder_name : install.install_path`.
    let install = if input["runner"] == "sideload" {
        info["folder_name"].as_str()
    } else {
        info["install"]["install_path"].as_str()
    };
    if let Some(path) = install {
        fields.insert("installPath".into(), json!(profile.expand(path)));
    }
    if input["runner"] == "legendary" {
        if let Some(namespace) = info["namespace"].as_str() {
            fields.insert("namespace".into(), json!(namespace));
        }
    }
    serde_json::from_value(args).unwrap_or_else(|e| panic!("the case's arguments: {e}"))
}

// ---------------------------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------------------------

/// The spawn the Rust side made, in the golden's `spawns.json` vocabulary (the fields the Rust runner has: the
/// program, argv, limit, environment difference, directory and result, plus the class of its call site).
fn spawn_value(spawn: &gamelib_engine::testing::RecordedSpawn) -> Value {
    let site = match spawn.label {
        "gamescope-help" => "prepare_launch.gamescope_help",
        "wine-command" => "prepare_launch.crossover_bottle_folder",
        other => panic!("a spawn under an unknown label: {other}"),
    };
    spawn_value_at(spawn, site)
}

/// [`spawn_value`] for a spawn whose call site the caller knows.
fn spawn_value_at(spawn: &gamelib_engine::testing::RecordedSpawn, site: &str) -> Value {
    let mut result = json!({
        "code": spawn.result.code,
        "stdout": spawn.result.stdout,
        "stderr": spawn.result.stderr,
    });
    if spawn.result.timed_out {
        result["timedOut"] = json!(true);
    }
    // The TS reported a program that could not start as `{ error }` with an empty stderr.
    if spawn.result.code.is_none()
        && !spawn.result.timed_out
        && spawn.result.stderr.starts_with("spawn ")
    {
        result["error"] = json!(spawn.result.stderr);
        result["stderr"] = json!("");
    }
    json!({
        "callSite": site,
        "program": spawn.program,
        "argv": spawn.argv,
        "timeoutMs": spawn.timeout.map(|t| t.as_millis() as u64),
        "envDiff": { "set": spawn.env_set, "unset": spawn.env_unset },
        "cwd": spawn.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
        "result": result,
        "class": class_of(site),
    })
}

/// The golden spawn reduced to the fields the Rust runner has (`replaceEnv`, `resolveOn`, `timeoutNone` and
/// `windowsHide` are options of the TS spawn wrapper; the Rust seam's twins are fixed by its own tests).
fn golden_spawn_value(spawn: &Value) -> Value {
    let mut out = Map::new();
    for key in [
        "callSite",
        "program",
        "argv",
        "timeoutMs",
        "envDiff",
        "cwd",
        "result",
        "class",
    ] {
        out.insert(key.to_string(), spawn[key].clone());
    }
    Value::Object(out)
}

/// Whether Rust's `got` line is the fixed-text twin of the TS `want` line (`epic-status-log-fixed-text`):
/// the unreachable warning leaves the transport code out.
fn same_epic_unreachable(want: &str, got: &str) -> bool {
    const UNREACHABLE: &str = "Could not reach the Epic status page";
    if !want.starts_with(UNREACHABLE) {
        return false;
    }
    let (Some(open), Some(close)) = (want.find(" ( "), want.find(" ),")) else {
        return false;
    };
    got == format!("{}{}", &want[..open], &want[close + 2..])
}

/// The app's own log lines and the notification of a case, compared with the golden's events.
fn compare_events(id: &str, rig: &Rig, events: &Value, used: &mut Used) -> Result<(), String> {
    let mut want_lines: Vec<(String, String)> = Vec::new();
    let mut want_notes: Vec<(String, String)> = Vec::new();
    for event in events.as_array().unwrap() {
        match event["kind"].as_str().unwrap() {
            "backend-log" => {
                let text = event["text"].as_str().unwrap().to_string();
                if text.starts_with("Wine command failed to run:") {
                    used.0.insert("wine-spawn-failure-line");
                    continue;
                }
                want_lines.push((event["level"].as_str().unwrap().to_string(), text));
            }
            "notification" => want_notes.push((
                event["title"].as_str().unwrap().to_string(),
                event["body"].as_str().unwrap().to_string(),
            )),
            "online-monitor" | "hook" => {
                used.0.insert("observation-points");
            }
            other => {
                return Err(format!(
                    "{id}: an event kind this replay does not handle: {other}"
                ))
            }
        }
    }
    let got_lines: Vec<(String, String)> = rig
        .log
        .lines()
        .into_iter()
        .map(|(level, text)| {
            let level = if level == "warn" { "warning" } else { level };
            (level.to_string(), rig.profile.normalise_text(&text))
        })
        .collect();
    if want_lines.len() != got_lines.len() {
        return Err(format!(
            "{id}: log lines want {want_lines:?} got {got_lines:?}"
        ));
    }
    for (want, got) in want_lines.iter().zip(&got_lines) {
        if want.0 != got.0 {
            return Err(format!("{id}: log line level want {want:?} got {got:?}"));
        }
        if want.1 == got.1 {
            continue;
        }
        if same_epic_unreachable(&want.1, &got.1) {
            used.0.insert("epic-status-log-fixed-text");
            continue;
        }
        return Err(format!("{id}: log line want {want:?} got {got:?}"));
    }
    let got_notes: Vec<(String, String)> = rig
        .ui
        .events()
        .into_iter()
        .map(|event| match event {
            UiEvent::Notify { title, body } => (title, body),
            other => panic!("{id}: an unexpected UI call {other:?}"),
        })
        .collect();
    if want_notes != got_notes {
        return Err(format!(
            "{id}: notifications want {want_notes:?} got {got_notes:?}"
        ));
    }
    Ok(())
}

fn replay_case(case: &Value, used: &mut Used) -> Result<(), String> {
    let id = case["id"].as_str().unwrap();
    let dir = golden_dir().join("expected").join(id);
    let input = read_json(&dir.join("input.json"));
    let platform = platform_of(input["os"].as_str().unwrap()).expect("a known OS");
    assert_eq!(
        input["globalSettings"]["discordRPC"], false,
        "{id}: a case with Discord presence on"
    );
    used.0.insert("discord-rpc-dropped");

    // The runner is scripted over the fake HOME's own paths, so the HOME is made first.
    let home = FakeHome::new("launch-prepare-");
    let profile = Profile::of(&home);
    let expected_spawns = read_json(&dir.join("spawns.json"));
    let wine_bin = profile.expand(
        input["gameSettings"]["wineVersion"]["bin"]
            .as_str()
            .unwrap_or_default(),
    );
    if input["crossoverBottle"].is_object() {
        // The CrossOver wine has to exist for `validWine` to let the query run.
        std::fs::create_dir_all(Path::new(&wine_bin).parent().unwrap()).unwrap();
        std::fs::write(&wine_bin, "").unwrap();
    }
    let runner = scripted_runner(&input, &expected_spawns, profile.env.clone(), &wine_bin);
    let epic = input["epicStatusExchange"].as_str();
    let rig = Rig::new(
        home,
        platform,
        epic,
        input["onlineMonitor"].as_bool().unwrap(),
        runner,
    );

    let args = args_of(&rig.profile, &input);
    let host = rig.profile.host(&input["host"]);
    let mut deps = ScriptedPrepareDeps::new(&rig.ctx, &host.wine);
    deps.system_info = Some(system_info_text(&input["systemInfo"], platform));
    deps.anticheat = input["anticheat"].clone();
    for (name, path) in input["executables"].as_object().unwrap() {
        deps.executables
            .insert(name.clone(), path.as_str().map(str::to_string));
    }
    deps.runtime_installed = input["umu"]["installed"].as_bool().unwrap();
    deps.download_answer = input["umu"]["downloadAnswer"].as_bool().unwrap();

    let reply = runtime()
        .block_on(prepare_launch(&rig.ctx, &deps, args, &host))
        .map_err(|e| format!("{id}: the step failed: {e}"))?;

    let want_result = read_json(&dir.join("result.json"));
    if want_result != reply.result_value() {
        return Err(format!(
            "{id}: result want {want_result} got {}",
            reply.result_value()
        ));
    }

    let want_log = read_json(&dir.join("log.json"));
    let got_log = rig
        .profile
        .normalise(&serde_json::to_value(&reply.log).unwrap());
    if want_log != got_log {
        return Err(format!("{id}: log want {want_log} got {got_log}"));
    }

    let want_spawns: Vec<Value> = expected_spawns
        .as_array()
        .unwrap()
        .iter()
        .map(golden_spawn_value)
        .collect();
    let got_spawns: Vec<Value> = rig
        .runner
        .spawns()
        .iter()
        .map(|spawn| rig.profile.normalise(&spawn_value(spawn)))
        .collect();
    if want_spawns != got_spawns {
        return Err(format!(
            "{id}: spawns want {}\n got {}",
            Value::Array(want_spawns),
            Value::Array(got_spawns)
        ));
    }
    if !rig.runner.unscripted().is_empty() {
        return Err(format!(
            "{id}: an unscripted spawn: {:?}",
            rig.runner.unscripted()
        ));
    }

    // The requests: the Epic GET is the replay's (it fails on a request the recording lacks, and `finish` on a
    // recorded one that was not made); the rest are the in-process calls, in order.
    rig.replay
        .finish()
        .map_err(|problem| format!("{id}: {problem}"))?;
    let want_requests = read_json(&dir.join("requests.json"));
    let want_http = want_requests
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["kind"] == "http")
        .count();
    if want_http != usize::from(epic.is_some()) {
        return Err(format!(
            "{id}: the golden recorded {want_http} GET(s) for exchange {epic:?}"
        ));
    }
    let want_calls: Vec<Value> = want_requests
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["kind"] != "http")
        .cloned()
        .collect();
    let got_calls: Vec<Value> = deps.calls().iter().map(|call| call.to_request()).collect();
    if want_calls != got_calls {
        return Err(format!(
            "{id}: requests want {} got {}",
            Value::Array(want_calls),
            Value::Array(got_calls)
        ));
    }

    compare_events(id, &rig, &read_json(&dir.join("events.json")), used)
}

/// The text the system-information line prints, from the `SystemInformation` the TS scripted: the same
/// `format_system_info` the production deps use, over the recorded values.
fn system_info_text(info: &Value, platform: Platform) -> String {
    use gamelib_info::sysinfo::deck::SteamDeckInfo;
    use gamelib_info::sysinfo::gpu::PartialGpu;
    use gamelib_info::sysinfo::memory::MemoryInfo;
    use gamelib_info::sysinfo::pci_ids::GpuInfo;
    use gamelib_info::sysinfo::versions::SoftwareVersions;
    use gamelib_info::sysinfo::{SystemInformation, SystemProbe};

    let text = |value: &Value| value.as_str().unwrap_or_default().to_string();
    let optional = |value: &Value| value.as_str().map(str::to_string);
    let gpus = info["GPUs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|gpu| GpuInfo {
            gpu: PartialGpu {
                vendor_id: text(&gpu["vendorId"]),
                device_id: text(&gpu["deviceId"]),
                subvendor_id: optional(&gpu["subvendorId"]),
                subdevice_id: optional(&gpu["subdeviceId"]),
                driver_version: optional(&gpu["driverVersion"]),
            },
            device_string: text(&gpu["deviceString"]),
            vendor_string: text(&gpu["vendorString"]),
        })
        .collect();
    let deck = &info["steamDeckInfo"];
    let steam_deck = if deck["isDeck"] == true {
        SteamDeckInfo::Deck {
            model: if deck["model"] == "OLED" {
                "OLED"
            } else {
                "LCD"
            },
            game_mode: deck["mode"] == "game",
        }
    } else {
        SteamDeckInfo::NotDeck
    };
    let memory = MemoryInfo {
        total: info["memory"]["total"].as_u64().unwrap(),
        used: info["memory"]["used"].as_u64().unwrap(),
    };
    let software = &info["softwareInUse"];
    let information = SystemInformation {
        total_formatted: text(&info["memory"]["totalFormatted"]),
        used_formatted: text(&info["memory"]["usedFormatted"]),
        probe: SystemProbe {
            cpu_model: text(&info["CPU"]["model"]),
            cores: info["CPU"]["cores"].as_u64().unwrap() as usize,
            memory,
            gpus,
            os_platform: match platform {
                Platform::Linux => "linux",
                Platform::Mac => "darwin",
                Platform::Windows => "win32",
            },
            os_name: text(&info["OS"]["name"]),
            os_version: text(&info["OS"]["version"]),
            steam_deck,
            is_flatpak: info["isFlatpak"] == true,
            is_app_image: info["isAppImage"] == true,
        },
        software: SoftwareVersions {
            heroic_version: text(&software["heroicVersion"]),
            legendary_version: text(&software["legendaryVersion"]),
            gogdl_version: text(&software["gogdlVersion"]),
            comet_version: text(&software["cometVersion"]),
            nile_version: text(&software["nileVersion"]),
        },
    };
    let info_platform = match platform {
        Platform::Linux => InfoPlatform::Linux,
        Platform::Mac => InfoPlatform::Mac,
        Platform::Windows => InfoPlatform::Windows,
    };
    gamelib_info::sysinfo::format::format_system_info(&information, info_platform)
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

/// The differences this file documents; each must be used by at least one case.
const DELTAS: [&str; 5] = [
    "observation-points",
    "epic-status-log-fixed-text",
    "wine-spawn-failure-line",
    "discord-rpc-dropped",
    "settings-key-order",
];

#[test]
#[cfg(unix)]
fn every_golden_prepare_launch_case_replays() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden prepare_launch", cases.len(), PREPARE_LAUNCH_FLOOR).unwrap();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(
        manifest["count"].as_u64().unwrap() as usize,
        cases.len(),
        "MANIFEST count"
    );
    assert!(
        manifest["floor"].as_u64().unwrap() as usize <= PREPARE_LAUNCH_FLOOR,
        "the MANIFEST floor is above the one this file holds"
    );

    let mut failures = Vec::new();
    let mut used = Used::default();
    // The key order of the settings is never compared (JSON values are), so that delta is always in play.
    used.0.insert("settings-key-order");
    let mut compared = 0usize;
    let mut linux = 0usize;
    for case in cases {
        linux += usize::from(case["os"] == "linux");
        compared += 1;
        if let Err(problem) = replay_case(case, &mut used) {
            failures.push(problem);
        }
    }
    println!(
        "golden prepare_launch: compared {compared} (linux {linux}) of {} floor {PREPARE_LAUNCH_FLOOR}",
        cases.len()
    );
    assert!(
        failures.is_empty(),
        "{} case(s) differ:\n{}",
        failures.len(),
        failures
            .iter()
            .take(8)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
    assert_eq!(compared, cases.len());
    assert!(linux > 0, "the Linux cases are in the replay");
    for delta in DELTAS {
        assert!(
            used.0.contains(delta),
            "the delta {delta} was never used by a case"
        );
    }
}

#[test]
fn an_empty_case_list_is_below_the_floor() {
    assert!(check_floor("golden prepare_launch", 0, PREPARE_LAUNCH_FLOOR).is_err());
    assert!(check_floor(
        "golden prepare_launch",
        PREPARE_LAUNCH_FLOOR,
        PREPARE_LAUNCH_FLOOR
    )
    .is_ok());
}

#[test]
#[cfg(not(unix))]
fn the_prepare_launch_replay_is_unix_only() {
    println!("golden prepare_launch: skipped on this platform (POSIX recordings, WR-10)");
}

// =============================================================================================
// golden/prepare_wine, the begin half (88.1-12)
// =============================================================================================
//
// `prepare_wine_begin` replays the `begin.json` half of every `golden/prepare_wine` case: the ordered trace of
// `prepareWineLaunch` up to the store-setup point, cut by the rule 88.1-03 recorded. What a case compares:
//
// - the reply: success, failureReason (`result.json` of the early exits, which end inside this half),
//   `prefixUpdated`, the launch settings it hands to the finish step (the engine overlay's answer) and the
//   launch log lines in order, where the TS's `isOverlayEnabled` hook call and its `EOS Overlay:` line are the
//   reply's `{ slot: "eosOverlay" }` entry;
// - the in-process calls that stand for the TS's `rustInvoke` requests, in order: the engine's launch settings,
//   the game wine's and the default wine's validity, and the winetricks list;
// - the spawns of the wine prefix creation and of the CrossOver bottle query: program, argv, time limit, the
//   whole environment (the scripted runner's base environment is empty, as the TS tracer's was), working
//   directory and result, each with its class from `golden/classes.json` (D-21: every one is a Helper spawn
//   through gamelib-wine's command core);
// - the in-app dialog of a missing CrossOver bottle through a recording `EngineUi`: the window raise and one
//   `ERROR` dialog, no system notification;
// - the app's own log lines;
// - the tree afterwards (`tree.json`): the prefix, bottle and engine folders under the fake HOME, with the
//   `installed_games` bytes. A wineboot is scripted to leave what a real one leaves (the prefix files), as in
//   the TS oracle. The finish half's own work (the GOG dummy under `drive_c/ProgramData`) is not in this tree.
//
// Documented differences (each must be used by at least one case, or the replay fails):
// - `in-process-wine-valid`: the TS asked the `wine_valid` channel again from inside `verifyWinePrefix` and the
//   wine command (once or twice per prefix check); both run in process now, so the calls are not requests.
// - `eos-overlay-slot`: the TS called the runner's `isOverlayEnabled` hook and logged its answer in place; the
//   step returns the slot and the adapter (88.1-15) fills it from the same hook.
// - `adapter-writes-prefix-line`: `Created/Updated Wineprefix at <prefix>` names a path, so it stays the
//   adapter's app-log line (written when `prefixUpdated` is true, from `settings.winePrefix`); the step logs no
//   path. The replay proves the line is there exactly when the step says the prefix was updated.
// - `wine-spawn-failure-line`: as in the prepare_launch replay, the TS command runner logged
//   `Wine command failed to run: ...` when the CrossOver query could not start; Rust logs nothing there.
// - `dialog-without-ack-id`: the TS dialog carried no acknowledgement id (`null`); the Rust frame carries the
//   empty one the wine installer's error dialog carries, since the launch waits for no confirmation.
//
// Rig facts (not differences): the TS oracle put `<HOME>/bin/umu-run` on the PATH through its executable seam
// and left `PATH` itself pinned, while Rust finds umu on the host's `PATH`; the replay prepends `<HOME>/bin` to
// the host `PATH` of a umu case and removes it again from the recorded spawn's `PATH` before comparing.

#[cfg(unix)]
mod wine_begin_replay {
    use std::collections::{BTreeMap, BTreeSet};
    use std::os::unix::fs::PermissionsExt;

    use gamelib_engine::testing::RecordedSpawn;
    use gamelib_launch::prepare::wine_begin::{prepare_wine_begin, PrepareWineBeginArgs};
    use gamelib_wine::wine_cmd::{WineHost, WineInstallation};
    use sha2::{Digest, Sha256};

    use super::*;

    /// `golden/prepare_wine` holds 391 cases, the MANIFEST floor; a later edit may raise this, never lower it.
    const PREPARE_WINE_FLOOR: usize = 391;

    const DELTAS: [&str; 5] = [
        "in-process-wine-valid",
        "eos-overlay-slot",
        "adapter-writes-prefix-line",
        "wine-spawn-failure-line",
        "dialog-without-ack-id",
    ];

    fn wine_dir() -> PathBuf {
        fixtures().join("golden/prepare_wine")
    }

    /// The Darwin release the shell would read on a Mac that runs a toolkit (`isMacSonomaOrHigher`).
    const DARWIN_RELEASE: &str = "24.0.0";

    /// A runner that makes what a real `wineboot --init` or `umu-run createprefix` leaves behind (the TS
    /// oracle's scripted wineboot did the same), then answers from the scripted one.
    struct PrefixMakingRunner {
        inner: Arc<ScriptedSpecRunner>,
        prefix: PathBuf,
        kind: String,
    }

    impl PrefixMakingRunner {
        /// `createPrefix` of the oracle: the folders and the empty files of a complete prefix of this type.
        fn make(&self) {
            let (dirs, files): (&[&str], &[&str]) = if self.kind == "proton" {
                (
                    &["pfx/dosdevices", "pfx/drive_c"],
                    &[
                        "pfx.lock",
                        "tracked_files",
                        "version",
                        "config_info",
                        "pfx/system.reg",
                        "pfx/user.reg",
                        "pfx/userdef.reg",
                    ],
                )
            } else {
                (
                    &["dosdevices", "drive_c"],
                    &["system.reg", "user.reg", "userdef.reg"],
                )
            };
            for dir in dirs {
                std::fs::create_dir_all(self.prefix.join(dir)).unwrap();
            }
            for file in files {
                let path = self.prefix.join(file);
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(path, "").unwrap();
            }
        }
    }

    impl SpecRunner for PrefixMakingRunner {
        fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
            if spec
                .argv
                .iter()
                .any(|arg| arg == "wineboot" || arg == "createprefix")
            {
                self.make();
            }
            self.inner.run(spec, on_line)
        }
    }

    /// One entry of the tree snapshot, in `snapshotTree`'s shape.
    fn tree_entry(path: &Path, rel: &str) -> Value {
        let meta = std::fs::symlink_metadata(path).unwrap();
        // The owner and execute bits stay, the group and other write bits go (the TS snapshot's umask rule).
        let mode = format!("{:04o}", meta.permissions().mode() & 0o7755);
        if meta.is_dir() {
            json!({ "path": rel, "kind": "dir", "mode": mode })
        } else {
            let digest = Sha256::digest(std::fs::read(path).unwrap());
            json!({ "path": rel, "kind": "file", "mode": mode, "sha256": format!("{digest:x}") })
        }
    }

    fn walk(dir: &Path, rel: &str, out: &mut Vec<Value>) {
        let mut names: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        for name in names {
            let path = dir.join(&name);
            let rel = format!("{rel}/{name}");
            out.push(tree_entry(&path, &rel));
            if std::fs::symlink_metadata(&path).unwrap().is_dir() {
                walk(&path, &rel, out);
            }
        }
    }

    /// `snapshotTree` of `<HOME>/Games`, `<HOME>/bottles` and `<HOME>/engine`, as `tree.json` holds them,
    /// without the paths `laid_out` names (the fake wines this replay made: the TS oracle scripted wine's
    /// validity and left no wine on disk).
    fn tree_of(profile: &Profile, laid_out: &BTreeSet<String>) -> Vec<Value> {
        let mut out = Vec::new();
        for root in ["Games", "bottles", "engine"] {
            let dir = profile.root.join(root);
            if dir.exists() {
                walk(&dir, root, &mut out);
            }
        }
        out.retain(|entry| !laid_out.contains(entry["path"].as_str().unwrap()));
        out.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        out
    }

    /// Lays out the case's seeded files and folders (`input.seed`).
    fn seed(profile: &Profile, input: &Value) {
        for entry in input["seed"].as_array().unwrap() {
            let path = PathBuf::from(profile.expand(entry["path"].as_str().unwrap()));
            if entry["dir"] == true {
                std::fs::create_dir_all(&path).unwrap();
                continue;
            }
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, entry["text"].as_str().unwrap()).unwrap();
            if let Some(mode) = entry["mode"].as_str() {
                let mode = u32::from_str_radix(mode, 8).unwrap();
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
            }
        }
    }

    /// Makes `wine` exist as its type requires when the case says it is valid, with the library folders the TS
    /// oracle's fake wines carried (a wine with a missing library folder logs an error the goldens do not hold).
    ///
    /// Everything made is recorded in `laid_out` (HOME-relative, with its parent folders) so the tree
    /// comparison can leave it out.
    fn lay_out_wine(profile: &Profile, wine: &Value, valid: bool, laid_out: &mut BTreeSet<String>) {
        let mut note = |path: &Path| {
            for ancestor in path.ancestors() {
                if let Ok(rel) = ancestor.strip_prefix(&profile.root) {
                    if !rel.as_os_str().is_empty() {
                        laid_out.insert(rel.to_string_lossy().into_owned());
                    }
                }
            }
        };
        for key in ["lib", "lib32"] {
            if let Some(dir) = wine[key].as_str() {
                let dir = PathBuf::from(profile.expand(dir));
                std::fs::create_dir_all(&dir).unwrap();
                note(&dir);
            }
        }
        if !valid {
            return;
        }
        let mut files = vec![wine["bin"].as_str().unwrap()];
        if wine["type"] == "wine" {
            files.extend(wine["wineserver"].as_str());
        }
        for file in files {
            let path = PathBuf::from(profile.expand(file));
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, "").unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            note(&path);
        }
    }

    /// The scripted runner of a case: every spawn the TS recorded in its begin half, answered with the result
    /// the TS scripted. The base environment is empty, so a spawn's `envDiff.set` is its whole environment.
    fn scripted(profile: &Profile, spawns: &[&Value]) -> ScriptedSpecRunner {
        let mut runner = ScriptedSpecRunner::new(Vec::new());
        for spawn in spawns {
            let result = &spawn["result"];
            let output = match result["error"].as_str() {
                Some(reason) => SpecOutput {
                    code: None,
                    stderr: reason.to_string(),
                    ..SpecOutput::default()
                },
                None => SpecOutput {
                    code: result["code"].as_i64().map(|c| c as i32),
                    stdout: profile.expand(result["stdout"].as_str().unwrap_or_default()),
                    stderr: profile.expand(result["stderr"].as_str().unwrap_or_default()),
                    ..SpecOutput::default()
                },
            };
            let argv: Vec<String> = spawn["argv"]
                .as_array()
                .unwrap()
                .iter()
                .map(|arg| profile.expand(arg.as_str().unwrap()))
                .collect();
            let argv: Vec<&str> = argv.iter().map(String::as_str).collect();
            runner = runner.on(
                &profile.expand(spawn["program"].as_str().unwrap()),
                &argv,
                output,
            );
        }
        runner
    }

    /// The call site a Rust spawn of this half belongs to: the bottle query is the `whoami`, everything else
    /// is the prefix creation (wineboot, umu's createprefix, the wineserver wait).
    fn site_of(spawn: &RecordedSpawn) -> &'static str {
        if spawn.argv.iter().any(|arg| arg == "whoami") {
            "prepare_wine.crossover_bottle_folder"
        } else {
            "prepare_wine.verify_prefix"
        }
    }

    /// The golden spawn reduced to the fields the Rust runner has (`options.timeoutMs` is the time limit).
    fn golden_wine_spawn(spawn: &Value) -> Value {
        let mut result = Map::new();
        for key in ["code", "stdout", "stderr", "error"] {
            if !spawn["result"][key].is_null() || key == "code" {
                result.insert(key.to_string(), spawn["result"][key].clone());
            }
        }
        json!({
            "callSite": spawn["callSite"],
            "program": spawn["program"],
            "argv": spawn["argv"],
            "timeoutMs": spawn["options"]["timeoutMs"],
            "envDiff": spawn["envDiff"],
            "cwd": spawn["cwd"],
            "result": Value::Object(result),
            "class": spawn["class"],
        })
    }

    /// What a golden trace entry is, in the replay's own vocabulary.
    struct Expected {
        calls: Vec<Value>,
        log: Vec<Value>,
        spawns: Vec<Value>,
        app_lines: Vec<(String, String)>,
        prefix_line: Option<String>,
        ui: Vec<Value>,
    }

    fn expected_of(begin: &Value, used: &mut Used) -> Result<Expected, String> {
        let trace = begin["trace"].as_array().unwrap();
        // The requests up to and including the winetricks list are the step's own; the `wine_valid` ones after
        // it were asked from inside `verifyWinePrefix` and the wine command, which run in process now.
        let winetricks_at = trace
            .iter()
            .position(|e| e["channel"] == "wine_winetricks_list_installed");
        let mut want = Expected {
            calls: Vec::new(),
            log: Vec::new(),
            spawns: Vec::new(),
            app_lines: Vec::new(),
            prefix_line: None,
            ui: Vec::new(),
        };
        for (at, entry) in trace.iter().enumerate() {
            match entry["kind"].as_str().unwrap() {
                "rust" => {
                    if winetricks_at.is_some_and(|w| at > w) {
                        if entry["channel"] != "wine_valid" {
                            return Err(format!("a request after the winetricks list: {entry}"));
                        }
                        used.0.insert("in-process-wine-valid");
                    } else {
                        want.calls.push(json!({
                            "kind": "rust",
                            "channel": entry["channel"],
                            "args": entry["args"],
                        }));
                    }
                }
                "hook" => {
                    if entry["member"] != "isOverlayEnabled" {
                        return Err(format!("a hook this half does not call: {entry}"));
                    }
                }
                "log" => {
                    let parts = &entry["parts"];
                    if parts[0]
                        .as_str()
                        .is_some_and(|text| text.starts_with("EOS Overlay:"))
                    {
                        used.0.insert("eos-overlay-slot");
                        want.log.push(json!({ "slot": "eosOverlay" }));
                    } else {
                        want.log
                            .push(json!({ "level": entry["level"], "parts": parts }));
                    }
                }
                "spawn" => want.spawns.push(golden_wine_spawn(entry)),
                "backend-log" => {
                    let text = entry["text"].as_str().unwrap();
                    if text.starts_with("Created/Updated Wineprefix at ") {
                        used.0.insert("adapter-writes-prefix-line");
                        want.prefix_line = Some(text.to_string());
                    } else if text.starts_with("Wine command failed to run:") {
                        used.0.insert("wine-spawn-failure-line");
                    } else {
                        want.app_lines.push((
                            entry["level"].as_str().unwrap().to_string(),
                            text.to_string(),
                        ));
                    }
                }
                "app-state" => {
                    if entry["member"] != "raiseMainWindowForInAppDialog" {
                        return Err(format!(
                            "an app-state call this half does not make: {entry}"
                        ));
                    }
                    want.ui.push(json!("raise"));
                }
                "frontend" => {
                    if entry["channel"] != "showDialog" {
                        return Err(format!("a frontend push this half does not make: {entry}"));
                    }
                    let args = &entry["args"];
                    if !args[4].is_null() {
                        return Err(format!("a dialog with an acknowledgement id: {entry}"));
                    }
                    want.ui
                        .push(json!({ "dialog": [args[0], args[1], args[2]] }));
                }
                other => {
                    return Err(format!(
                        "a trace entry kind this replay does not handle: {other}"
                    ))
                }
            }
        }
        Ok(want)
    }

    fn replay_wine_case(case: &Value, used: &mut Used) -> Result<(), String> {
        let id = case["id"].as_str().unwrap();
        let dir = wine_dir().join("expected").join(id);
        let input = read_json(&dir.join("input.json"));
        let begin = read_json(&dir.join("begin.json"));
        let platform = platform_of(input["os"].as_str().unwrap()).expect("a known OS");
        let want = expected_of(&begin, used).map_err(|e| format!("{id}: {e}"))?;
        let trace = begin["trace"].as_array().unwrap();

        let home = FakeHome::new("launch-wine-");
        let profile = Profile::of(&home);
        seed(&profile, &input);

        // The engine overlay's answer is the first request's reply; the wines the case lays out are the
        // game's stored one, the overlay's and the global default.
        let launch_request = trace
            .iter()
            .find(|e| e["channel"] == "engine_launch_settings_get")
            .ok_or_else(|| format!("{id}: no launch settings request"))?;
        let effective = profile.expand_value(&launch_request["reply"]);
        let stored = profile.expand_value(&input["storedSettings"]);
        let default_wine = profile.expand_value(&input["defaultWine"]);
        let mut laid_out = BTreeSet::new();
        for wine in [
            &stored["wineVersion"],
            &effective["wineVersion"],
            &default_wine,
        ] {
            let valid = input["wineValid"][wine["name"].as_str().unwrap()]
                .as_bool()
                .unwrap_or(false);
            lay_out_wine(&profile, wine, valid, &mut laid_out);
        }

        let spawns: Vec<&Value> = trace.iter().filter(|e| e["kind"] == "spawn").collect();
        let scripted_runner = Arc::new(scripted(&profile, &spawns));
        let proc = Arc::new(PrefixMakingRunner {
            inner: scripted_runner.clone(),
            prefix: PathBuf::from(effective["winePrefix"].as_str().unwrap_or_default()),
            kind: effective["wineVersion"]["type"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
        });
        let rig = Rig::with_proc(
            home,
            platform,
            None,
            input["online"].as_bool().unwrap(),
            scripted_runner.clone(),
            proc,
        );

        // The host: the fake HOME's variables, the pinned PATH, and on a Mac the Darwin release a toolkit needs.
        let umu = input["umu"] == true;
        let mut host: WineHost = rig
            .profile
            .host(&json!({
                "steamDeckGameMode": false, "flatpak": false, "flatpakRuntimeVersion": "",
            }))
            .wine;
        if umu {
            let path = host.env.vars().get("PATH").cloned().unwrap_or_default();
            let mut vars: BTreeMap<String, String> = host.env.vars().clone();
            vars.insert(
                "PATH".into(),
                format!("{}/bin:{path}", rig.profile.root.to_string_lossy()),
            );
            host.env = serde_json::from_value(json!(vars)).unwrap();
        }
        if platform == Platform::Mac {
            host.darwin_release = Some(DARWIN_RELEASE.to_string());
        }

        let mut deps = ScriptedPrepareDeps::new(&rig.ctx, &host);
        deps.launch_settings_reply = Some(effective.clone());
        deps.wine_validity = input["wineValid"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(name, valid)| (name.clone(), valid.as_bool().unwrap()))
            .collect();
        deps.default_wine = serde_json::from_value::<WineInstallation>(default_wine).ok();
        deps.winetricks = trace
            .iter()
            .find(|e| e["channel"] == "wine_winetricks_list_installed")
            .map(|e| {
                e["reply"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|line| line.as_str().unwrap().to_string())
                    .collect()
            })
            .unwrap_or_default();

        let info = &input["gameInfo"];
        let args: PrepareWineBeginArgs = serde_json::from_value(json!({
            "runner": input["runner"],
            "appName": input["appName"],
            "title": info["title"],
            "canRunOffline": info["canRunOffline"].as_bool().unwrap_or(false),
            "folderName": info["folder_name"],
            "storedSettings": stored,
        }))
        .map_err(|e| format!("{id}: the case's arguments: {e}"))?;

        let reply = runtime()
            .block_on(prepare_wine_begin(&rig.ctx, &deps, args, &host))
            .map_err(|e| format!("{id}: the step failed: {e}"))?;

        // The reply.
        if reply.prefix_updated != begin["prefixUpdated"].as_bool().unwrap() {
            return Err(format!(
                "{id}: prefixUpdated want {} got {}",
                begin["prefixUpdated"], reply.prefix_updated
            ));
        }
        let result = read_json(&dir.join("result.json"));
        if begin["split"] == "none" {
            // An early exit: the whole step is this half, so the TS reply is this half's.
            let want_reason = result["failureReason"].as_str().map(str::to_string);
            if result["success"] != false || reply.success || reply.failure_reason != want_reason {
                return Err(format!(
                    "{id}: an early exit want {result} got success {} reason {:?}",
                    reply.success, reply.failure_reason
                ));
            }
        } else if !reply.success || reply.failure_reason.is_some() {
            return Err(format!("{id}: the step stopped: {reply:?}"));
        }
        if reply.success && reply.settings.as_ref() != Some(&effective) {
            return Err(format!(
                "{id}: the settings handed to the finish step differ: {:?}",
                reply.settings
            ));
        }
        let got_log = serde_json::to_value(&reply.log).unwrap();
        if Value::Array(want.log.clone()) != rig.profile.normalise(&got_log) {
            return Err(format!(
                "{id}: log want {} got {got_log}",
                Value::Array(want.log)
            ));
        }
        // The app-log line the adapter writes: there exactly when the prefix was updated, from the settings.
        let want_prefix_line = reply
            .settings
            .as_ref()
            .filter(|_| reply.prefix_updated)
            .map(|settings| {
                format!(
                    "Created/Updated Wineprefix at {}",
                    rig.profile
                        .normalise_text(settings["winePrefix"].as_str().unwrap_or_default())
                )
            });
        if want_prefix_line != want.prefix_line {
            return Err(format!(
                "{id}: the prefix line want {:?} got {want_prefix_line:?}",
                want.prefix_line
            ));
        }

        // The in-process calls.
        let got_calls: Vec<Value> = deps
            .calls()
            .iter()
            .map(|call| rig.profile.normalise(&call.to_request()))
            .collect();
        if want.calls != got_calls {
            return Err(format!(
                "{id}: calls want {}\n got {}",
                Value::Array(want.calls),
                Value::Array(got_calls)
            ));
        }

        // The spawns.
        let got_spawns: Vec<Value> = scripted_runner
            .spawns()
            .iter()
            .map(|spawn| {
                let mut value = rig
                    .profile
                    .normalise(&spawn_value_at(spawn, site_of(spawn)));
                if umu {
                    // The rig's `<HOME>/bin` on the PATH, taken off again (see the module header).
                    if let Some(path) = value["envDiff"]["set"]["PATH"].as_str() {
                        if let Some(rest) = path.strip_prefix("<HOME>/bin:") {
                            value["envDiff"]["set"]["PATH"] = json!(rest);
                        }
                    }
                }
                value
            })
            .collect();
        if want.spawns != got_spawns {
            return Err(format!(
                "{id}: spawns want {}\n got {}",
                Value::Array(want.spawns),
                Value::Array(got_spawns)
            ));
        }
        if !scripted_runner.unscripted().is_empty() {
            return Err(format!(
                "{id}: an unscripted spawn: {:?}",
                scripted_runner.unscripted()
            ));
        }

        // The dialog and the window raise.
        let mut got_ui: Vec<Value> = Vec::new();
        for event in rig.ui.events() {
            match event {
                UiEvent::RaiseMainWindow => got_ui.push(json!("raise")),
                UiEvent::ShowDialog {
                    title,
                    body,
                    kind,
                    ack_id,
                } => {
                    if !ack_id.is_empty() {
                        return Err(format!(
                            "{id}: a dialog with an acknowledgement id {ack_id}"
                        ));
                    }
                    used.0.insert("dialog-without-ack-id");
                    got_ui.push(json!({ "dialog": [title, body, kind] }));
                }
                other => return Err(format!("{id}: an unexpected UI call {other:?}")),
            }
        }
        if want.ui != got_ui {
            return Err(format!(
                "{id}: UI want {} got {}",
                Value::Array(want.ui),
                Value::Array(got_ui)
            ));
        }

        // The app's own log lines.
        let got_lines: Vec<(String, String)> = rig
            .log
            .lines()
            .into_iter()
            .map(|(level, text)| {
                let level = if level == "warn" { "warning" } else { level };
                (level.to_string(), rig.profile.normalise_text(&text))
            })
            .collect();
        if want.app_lines != got_lines {
            return Err(format!(
                "{id}: app log want {:?} got {got_lines:?}",
                want.app_lines
            ));
        }

        // The tree: this half's work, so the finish half's GOG dummy (`drive_c/ProgramData/...`, and the
        // `drive_c` folder it made under a Proton prefix that has none yet) is left out of the golden's.
        let got_tree = tree_of(&rig.profile, &laid_out);
        let got_paths: BTreeSet<&str> = got_tree
            .iter()
            .map(|entry| entry["path"].as_str().unwrap())
            .collect();
        let golden_tree = read_json(&dir.join("tree.json"));
        let golden_tree = golden_tree.as_array().unwrap();
        let finish_made: Vec<&str> = golden_tree
            .iter()
            .map(|entry| entry["path"].as_str().unwrap())
            .filter(|path| path.contains("/drive_c/ProgramData"))
            .collect();
        let finish_owned = |path: &str| {
            finish_made.contains(&path)
                || (!got_paths.contains(path)
                    && finish_made
                        .iter()
                        .any(|made| made.starts_with(&format!("{path}/"))))
        };
        let want_tree: Vec<Value> = golden_tree
            .iter()
            .filter(|entry| !finish_owned(entry["path"].as_str().unwrap()))
            .cloned()
            .collect();
        if want_tree != got_tree {
            let missing: Vec<&Value> = want_tree.iter().filter(|e| !got_tree.contains(e)).collect();
            let extra: Vec<&Value> = got_tree.iter().filter(|e| !want_tree.contains(e)).collect();
            return Err(format!("{id}: tree missing {missing:?} extra {extra:?}"));
        }
        // The missing-bottle case, named: the window raise and one `ERROR` dialog, and no `installed_games`.
        if id == "named-crossover-bottle-missing" {
            let dialogs: Vec<&Value> = got_ui.iter().filter(|e| e["dialog"].is_array()).collect();
            if dialogs.len() != 1
                || dialogs[0]["dialog"][2] != "ERROR"
                || got_tree
                    .iter()
                    .any(|e| e["path"].as_str().unwrap().ends_with("/installed_games"))
            {
                return Err(format!(
                    "{id}: want one ERROR dialog and no installed_games, got {got_ui:?}"
                ));
            }
            used.0.insert("named-bottle-missing-case");
        }
        Ok(())
    }

    #[test]
    fn every_golden_prepare_wine_begin_half_replays() {
        let cases = read_json(&wine_dir().join("cases.json"));
        let cases = cases.as_array().expect("cases.json is an array");
        check_floor("golden prepare_wine", cases.len(), PREPARE_WINE_FLOOR).unwrap();
        let manifest = read_json(&wine_dir().join("MANIFEST.json"));
        assert_eq!(
            manifest["count"].as_u64().unwrap() as usize,
            cases.len(),
            "MANIFEST count"
        );
        assert!(
            manifest["floor"].as_u64().unwrap() as usize <= PREPARE_WINE_FLOOR,
            "the MANIFEST floor is above the one this file holds"
        );

        let mut failures = Vec::new();
        let mut used = Used::default();
        let mut compared = 0usize;
        let mut linux = 0usize;
        let mut mac = 0usize;
        for case in cases {
            let os = read_json(
                &wine_dir()
                    .join("expected")
                    .join(case["id"].as_str().unwrap())
                    .join("input.json"),
            )["os"]
                .clone();
            linux += usize::from(os == "linux");
            mac += usize::from(os == "mac");
            compared += 1;
            if let Err(problem) = replay_wine_case(case, &mut used) {
                failures.push(problem);
            }
        }
        println!(
            "golden prepare_wine: compared {compared} (linux {linux}, mac {mac}) of {} floor {PREPARE_WINE_FLOOR}",
            cases.len()
        );
        assert!(
            failures.is_empty(),
            "{} case(s) differ:\n{}",
            failures.len(),
            failures
                .iter()
                .take(8)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
        assert_eq!(compared, cases.len());
        assert!(
            linux > 0 && mac > 0,
            "both Linux and Mac cases are replayed"
        );
        for delta in DELTAS {
            assert!(
                used.0.contains(delta),
                "the delta {delta} was never used by a case"
            );
        }
        assert!(
            used.0.contains("named-bottle-missing-case"),
            "the missing-CrossOver-bottle case was not replayed"
        );
    }

    #[test]
    fn an_empty_wine_case_list_is_below_the_floor() {
        assert!(check_floor("golden prepare_wine", 0, PREPARE_WINE_FLOOR).is_err());
        assert!(check_floor(
            "golden prepare_wine",
            PREPARE_WINE_FLOOR,
            PREPARE_WINE_FLOOR
        )
        .is_ok());
    }
}

#[test]
#[cfg(not(unix))]
fn the_prepare_wine_replay_is_unix_only() {
    println!("golden prepare_wine: skipped on this platform (POSIX recordings, WR-10)");
}
