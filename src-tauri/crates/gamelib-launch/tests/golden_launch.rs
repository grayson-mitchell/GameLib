//! The Rust replay of the `prepare_launch` golden 88.1-02 recorded from the TypeScript (`golden/prepare_launch`,
//! 582 cases): the whole step a store manager runs before it builds its game command, through
//! `gamelib_launch::prepare::launch::prepare_launch` over `ScriptedPrepareDeps`.
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
use gamelib_core::process::SpecOutput;
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

    /// `<HOME>` and `<APPFOLDER>` in `text` as real paths.
    fn expand(&self, text: &str) -> String {
        text.replace("<APPFOLDER>", &self.app_folder().to_string_lossy())
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
        out
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
        let runner = Arc::new(runner);
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
        .with_proc(runner.clone())
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
        let wine = Arc::new(WineCtx::new(engine.clone(), app_folder.join("tools")));
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
