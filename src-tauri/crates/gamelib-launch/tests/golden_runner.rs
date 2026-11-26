//! The Rust replay of `golden/runner` (88.2-01 recorded 93 `callRunner` cases from the TypeScript):
//! spawn (program, argv, the whole env, cwd, the timeout opt-out, the hidden-window flag, the tracked key),
//! the log entries at the writer boundary with their rotate flags, the general log lines, the stream the
//! caller saw, the abort and error-handler calls in order, and the result.
//!
//! A run goes through a scripted spawn seam (`CaseRunner`) that delivers the recorded chunks in order, so a
//! difference here is the runner's, not the pipe's. Read boundaries are an OS artefact (the
//! `chunk-boundaries` delta) and `runner_real.rs` covers them with real children.
//!
//! The cases whose recorded options carry a log sanitizer (`NEEDS_SANITIZER`) replay in 88.2-08, which adds
//! the sanitizers; the redaction and sanitizer vectors replay there too. A count floor lives here next to the
//! replay (equal to the cases it compares), so editing the JSON alone cannot lower the bar.
//!
//! The 24 cases recorded under the `runner.call.launch` site belong to the game class. The shared part of
//! the function (preamble, logs, results) is the same code, so they replay here through the helper spawn
//! class; the spawn class itself is not observable through a scripted seam, and 88.2-10 and 88.2-11 point
//! them at the game path.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{
    BoxFuture, ChunkSink, LineSink, Pipe, ProcSpec, SpecOutput, SpecRunner,
};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::runner::call_runner::{
    call_runner, join_path, run_abort, EnvList, RunnerCallArgs, RunnerHost, RunnerProps,
    SpawnClassArg,
};
use gamelib_launch::runner::redact::get_runner_call_without_credentials;
use gamelib_launch::runner::stream::{LaunchLogSink, LogHandOff, OutputSink};
use gamelib_launch::runner::{RunnerErrors, RunnerEvent, RunnerName, RunnerTables};
use gamelib_log::frame::FrameTarget;
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde::Deserialize;
use serde_json::{json, Value};

/// The cases this file compares. `golden/runner` holds 93; the one case whose options carry a log
/// sanitizer replays in 88.2-08. A later edit may raise this, never lower it.
const RUNNER_FLOOR: usize = 92;

/// Cases whose recorded options carry a log sanitizer: skipped here by name, replayed in 88.2-08.
const NEEDS_SANITIZER: [&str; 1] = [
    "commandRunner--layer-2-callrunner-characterization-66-1-mh-4-layer-2-applies-logsanitizer-to-the-writers-but-hands-onoutput-the-raw-chunk",
];

/// What `Math.random()` pinned to in the TS cases, so the abort id of a call with no app name is this.
const TS_RANDOM_ID: &str = "0.4242";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// The recorded cases
// ---------------------------------------------------------------------------------------------

/// `Option<Option<T>>` so an explicit `null` is told from an absent key.
fn present<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}

#[derive(Debug, Clone, Deserialize)]
struct ScriptChunk {
    stream: String,
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Step {
    program: Option<String>,
    #[serde(default)]
    chunks: Vec<ScriptChunk>,
    #[serde(default, deserialize_with = "present")]
    code: Option<Option<i32>>,
    signal: Option<String>,
    #[serde(default)]
    killed_by_us: bool,
    #[serde(default)]
    hold: bool,
    #[serde(default)]
    abort_while_held: bool,
    #[serde(default)]
    abort_after_exit: bool,
    throws: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CaseRunnerSpec {
    name: RunnerName,
    bin: String,
    dir: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseOptions {
    #[serde(default)]
    env: EnvList,
    cwd: Option<String>,
    abort_id: Option<String>,
    track_key: Option<String>,
    #[serde(default)]
    observe: bool,
    #[serde(default)]
    skip_error_handler: bool,
    log_message_prefix: Option<String>,
    sanitizer: Option<String>,
    #[serde(default)]
    extra_writers: usize,
}

#[derive(Debug, Deserialize)]
struct CaseCall {
    runner: CaseRunnerSpec,
    #[serde(rename = "commandParts")]
    command_parts: Vec<String>,
    #[serde(default)]
    options: CaseOptions,
    instance: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct Direct {
    command: Value,
    #[serde(default)]
    env: EnvList,
    #[serde(rename = "runnerPath")]
    runner_path: String,
    #[serde(default)]
    converts: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    call_site: String,
    platform: String,
    #[serde(default)]
    on_path: Vec<String>,
    #[serde(default)]
    process_env: BTreeMap<String, String>,
    #[serde(default)]
    concurrent: bool,
    instances: Option<usize>,
    direct: Option<Direct>,
    calls: Vec<CaseCall>,
    script: Vec<Step>,
}

fn load_cases() -> Vec<Case> {
    let path = fixtures().join("golden/runner/cases.json");
    serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn class_of(site: &str) -> String {
    read_json(&fixtures().join("golden/classes.json"))[site]
        .as_str()
        .unwrap_or_else(|| panic!("{site} has no class in classes.json"))
        .to_string()
}

// ---------------------------------------------------------------------------------------------
// The scripted spawn seam
// ---------------------------------------------------------------------------------------------

struct CaseRunner {
    steps: Mutex<Vec<(Step, bool)>>,
    specs: Mutex<Vec<ProcSpec>>,
    held: Arc<AtomicUsize>,
    release: tokio::sync::watch::Sender<bool>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl CaseRunner {
    fn new(script: &[Step]) -> CaseRunner {
        CaseRunner {
            steps: Mutex::new(script.iter().cloned().map(|s| (s, false)).collect()),
            specs: Mutex::new(Vec::new()),
            held: Arc::new(AtomicUsize::new(0)),
            release: tokio::sync::watch::channel(false).0,
        }
    }

    fn take(&self, program: &str) -> Option<Step> {
        let mut steps = lock(&self.steps);
        for (step, used) in steps.iter_mut() {
            if *used {
                continue;
            }
            if step.program.as_deref().is_some_and(|p| p != program) {
                continue;
            }
            *used = true;
            return Some(step.clone());
        }
        None
    }

    fn unused(&self) -> usize {
        lock(&self.steps).iter().filter(|(_, used)| !used).count()
    }
}

fn exit_of(step: &Step) -> SpecOutput {
    let signal = step.signal.as_deref().map(|name| match name {
        "SIGTERM" => 15,
        other => panic!("the replay knows no signal {other}"),
    });
    SpecOutput {
        code: match step.code {
            None => Some(0),
            Some(code) => code,
        },
        signal,
        ..SpecOutput::default()
    }
}

impl SpecRunner for CaseRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.run_streamed(spec, Box::new(|_, _| {}))
    }

    fn run_streamed(&self, spec: ProcSpec, mut on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        lock(&self.specs).push(spec.clone());
        let Some(step) = self.take(&spec.program) else {
            return Box::pin(async move {
                SpecOutput {
                    stderr: format!("unscripted process call: {}", spec.program),
                    ..SpecOutput::default()
                }
            });
        };
        let held = Arc::clone(&self.held);
        let mut release = self.release.subscribe();
        Box::pin(async move {
            if let Some(reason) = &step.throws {
                return SpecOutput {
                    stderr: format!("spawn {}: {reason} (the OS error text)", spec.program),
                    ..SpecOutput::default()
                };
            }
            for chunk in &step.chunks {
                let pipe = if chunk.stream == "stdout" {
                    Pipe::Stdout
                } else {
                    Pipe::Stderr
                };
                on_chunk(pipe, &chunk.text);
            }
            let cancelled = SpecOutput {
                cancelled: true,
                ..SpecOutput::default()
            };
            if step.hold {
                let cancel = spec
                    .cancel
                    .clone()
                    .expect("a runner run carries a cancel token");
                if cancel.is_cancelled() {
                    return cancelled;
                }
                held.fetch_add(1, Ordering::SeqCst);
                if step.abort_while_held {
                    tokio::task::yield_now().await;
                    cancel.cancel();
                    return cancelled;
                }
                tokio::select! {
                    _ = cancel.cancelled() => return cancelled,
                    _ = release.wait_for(|released| *released) => {}
                }
            } else {
                tokio::task::yield_now().await;
            }
            if step.abort_after_exit {
                if let Some(cancel) = &spec.cancel {
                    cancel.cancel();
                }
            }
            if step.killed_by_us {
                return cancelled;
            }
            exit_of(&step)
        })
    }
}

// ---------------------------------------------------------------------------------------------
// The recording seams
// ---------------------------------------------------------------------------------------------

#[derive(Default)]
struct RecordingLogSink {
    frames: Mutex<Vec<Value>>,
    general: Mutex<Vec<(Level, Prefix, String)>>,
}

fn target_json(target: &gamelib_core::paths::LogTarget) -> Value {
    use gamelib_core::paths::LogTarget;
    match target {
        LogTarget::General => json!({ "kind": "general" }),
        LogTarget::GogRedist => json!({ "kind": "gogRedist" }),
        LogTarget::Runner(runner) => json!({ "kind": "runner", "runner": runner.as_str() }),
        LogTarget::Game {
            app_name,
            runner,
            kind,
        } => {
            json!({ "kind": "game", "appName": app_name, "runner": runner.as_str(), "type": kind.as_str() })
        }
    }
}

impl LaunchLogSink for RecordingLogSink {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }

    fn submit(&self, batches: Vec<TargetBatch>) {
        let mut frames = lock(&self.frames);
        for batch in batches {
            for (index, entry) in batch.entries.iter().enumerate() {
                let rotate = batch.rotate && index == 0;
                frames.push(match entry {
                    Entry::Raw(text) => json!({
                        "target": target_json(&batch.target),
                        "rotate": rotate,
                        "raw": text,
                    }),
                    Entry::Line {
                        level, prefix, msg, ..
                    } => json!({
                        "target": target_json(&batch.target),
                        "rotate": rotate,
                        "line": { "level": level.as_str(), "prefix": prefix.as_str(), "message": msg },
                    }),
                });
            }
        }
    }

    fn general(&self, prefix: Prefix, level: Level, msg: &str) {
        lock(&self.general).push((level, prefix, msg.to_string()));
    }
}

struct RecordingErrors {
    tables: Arc<RunnerTables>,
}

impl RunnerErrors for RecordingErrors {
    fn handle(&self, error: &str, app_name: &str, runner: RunnerName) {
        self.tables.note(RunnerEvent::ErrorHandler {
            error: error.to_string(),
            app_name: app_name.to_string(),
            runner: runner.as_str().to_string(),
        });
    }
}

#[derive(Default)]
struct StreamRecorder {
    chunks: Mutex<Vec<String>>,
}

impl OutputSink for StreamRecorder {
    fn chunk(&self, _pipe: Pipe, text: &str) {
        lock(&self.chunks).push(text.to_string());
    }
}

// ---------------------------------------------------------------------------------------------
// The profile a case runs in
// ---------------------------------------------------------------------------------------------

struct Rig {
    home: FakeHome,
}

impl Rig {
    fn new() -> Rig {
        Rig {
            home: FakeHome::new("launch-runner-"),
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn tools(&self) -> PathBuf {
        self.root().join(".config").join("GameLib").join("tools")
    }

    /// The environment the TS ran in: the profile's eight variables and the three pinned ones.
    fn base_env(&self) -> BTreeMap<String, String> {
        let root = self.root().to_string_lossy().into_owned();
        [
            ("HOME", root.clone()),
            ("USERPROFILE", root.clone()),
            ("APPDATA", format!("{root}/AppData/Roaming")),
            ("LOCALAPPDATA", format!("{root}/AppData/Local")),
            ("XDG_CONFIG_HOME", format!("{root}/.config")),
            ("XDG_STATE_HOME", format!("{root}/.local/state")),
            ("XDG_DATA_HOME", format!("{root}/.local/share")),
            ("XDG_CACHE_HOME", format!("{root}/.cache")),
            ("PATH", "/usr/bin:/bin".to_string()),
            ("LANG", "C.UTF-8".to_string()),
            ("USER", "gamelib-oracle".to_string()),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect()
    }

    fn expand(&self, text: &str) -> String {
        text.replace("<TOOLS>", &self.tools().to_string_lossy())
            .replace("<HOME>", &self.root().to_string_lossy())
    }

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`).
    fn normalise_text(&self, text: &str) -> String {
        let mut roots = vec![self.root().to_path_buf()];
        if let Ok(real) = std::fs::canonicalize(self.root()) {
            if real != self.root() {
                roots.insert(0, real);
            }
        }
        let mut out = text.to_string();
        for root in roots {
            let tools = root.join(".config").join("GameLib").join("tools");
            out = out
                .replace(tools.to_string_lossy().as_ref(), "<TOOLS>")
                .replace(root.to_string_lossy().as_ref(), "<HOME>");
        }
        out
    }

    fn launch_ctx(&self, platform: Platform, runner: Arc<dyn SpecRunner>) -> LaunchCtx {
        let root = self.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let engine = Arc::new(
            EngineCtx::new(
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
            .with_proc(runner),
        );
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
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
            "0.0.0".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        LaunchCtx::new(engine, knownfix, wine, info)
    }
}

fn platform_of(name: &str) -> Platform {
    match name {
        "linux" => Platform::Linux,
        "darwin" => Platform::Mac,
        "win32" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

fn log_prefix_of(runner: RunnerName) -> &'static str {
    match runner {
        RunnerName::Legendary => "Legendary",
        RunnerName::Gog => "Gog",
        RunnerName::Nile => "Nile",
        RunnerName::Sideload => "Sideload",
        RunnerName::Steam => "Steam",
    }
}

// ---------------------------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------------------------

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
}

fn is_spawn_failure(text: &str) -> bool {
    text.starts_with("spawn ")
}

/// A random abort id of the TS golden and the one Rust took are the same thing under the delta.
fn id_class(id: &str) -> String {
    if id == TS_RANDOM_ID || id.starts_with("runner-") {
        "<random>".to_string()
    } else {
        id.to_string()
    }
}

fn replay_direct(case: &Case, direct: &Direct, rig: &Rig, expected: &Path) -> Result<(), String> {
    let command: Vec<String> = match &direct.command {
        Value::Array(items) => items
            .iter()
            .map(|v| v.as_str().unwrap_or_default().to_string())
            .collect(),
        // The legendary command object: the adapter converts it to argv before the call.
        _ => direct.converts.clone(),
    };
    let mut own_env = rig.base_env();
    own_env.extend(case.process_env.clone());
    let line =
        get_runner_call_without_credentials(&command, &direct.env.0, &own_env, &direct.runner_path);
    let want = read_json(&expected.join("result.json"));
    let want_line = want["results"][0]["line"].as_str().unwrap_or_default();
    if rig.normalise_text(&line) != want_line {
        return Err(format!(
            "{}: redacted line {line:?}, want {want_line:?}",
            case.id
        ));
    }
    Ok(())
}

struct Outcome {
    results: Vec<Value>,
    streams: Vec<Option<Vec<String>>>,
}

fn replay(case: &Case, rig: &Rig) -> Result<(), String> {
    let expected = fixtures().join("golden/runner/expected").join(&case.id);
    if let Some(direct) = &case.direct {
        return replay_direct(case, direct, rig, &expected);
    }

    let runner = Arc::new(CaseRunner::new(&case.script));
    let sink = Arc::new(RecordingLogSink::default());
    let events = Arc::new(Mutex::new(Vec::new()));
    let instance_count = case.instances.unwrap_or(1);
    let platform = platform_of(&case.platform);

    // PowerShell is found on the host PATH when the case says it is.
    let bin_dir = rig.root().join("path-bin");
    std::fs::create_dir_all(&bin_dir).unwrap();
    for name in &case.on_path {
        std::fs::write(bin_dir.join(format!("{name}.exe")), b"").unwrap();
    }
    let mut host_env = rig.base_env();
    host_env.extend(case.process_env.clone());
    let host = RunnerHost {
        env: host_env,
        path: bin_dir.to_string_lossy().into_owned(),
    };

    let ctxs: Vec<LaunchCtx> = (0..instance_count)
        .map(|_| {
            let tables = Arc::new(RunnerTables::recording_into(events.clone()));
            rig.launch_ctx(platform, runner.clone())
                .with_log_sink(sink.clone())
                .with_runner_tables(tables.clone())
                .with_errors(Arc::new(RecordingErrors { tables }))
        })
        .collect();

    let holds = case
        .script
        .iter()
        .filter(|s| s.hold && !s.abort_while_held)
        .count();
    let mut seen_runner_writers: BTreeSet<&'static str> = BTreeSet::new();

    let mut built: Vec<(usize, RunnerCallArgs, Option<Arc<StreamRecorder>>)> = Vec::new();
    for call in &case.calls {
        let o = &call.options;
        if o.sanitizer.is_some() {
            return Err(format!("{}: carries a sanitizer", case.id));
        }
        let name = call.runner.name;
        let mut log_targets: Vec<LogHandOff> = (0..o.extra_writers)
            .map(|_| LogHandOff {
                target: FrameTarget {
                    kind: "game".into(),
                    app_name: Some("game-writer".into()),
                    runner: Some(name.as_str().into()),
                    log_type: Some("launch".into()),
                },
                disabled: false,
                rotate: true,
            })
            .collect();
        // The runner's own writer is cached per runner for the case: it rotates on its first use only.
        let first_use = seen_runner_writers.insert(name.as_str());
        log_targets.push(LogHandOff {
            target: FrameTarget {
                kind: "runner".into(),
                app_name: None,
                runner: Some(name.as_str().into()),
                log_type: None,
            },
            disabled: false,
            rotate: first_use,
        });
        let args = RunnerCallArgs {
            stream_id: String::new(),
            command_parts: call.command_parts.clone(),
            runner: RunnerProps {
                name,
                bin: rig.expand(&call.runner.bin),
                dir: call.runner.dir.as_deref().map(|d| rig.expand(d)),
                log_prefix: log_prefix_of(name).to_string(),
            },
            env: o.env.clone(),
            wrappers: Vec::new(),
            log_message_prefix: o.log_message_prefix.clone(),
            log_targets,
            log_sanitizer: None,
            abort_id: o.abort_id.clone(),
            track_key: o.track_key.clone(),
            cwd: o.cwd.as_deref().map(|c| rig.expand(c)),
            skip_error_handler: o.skip_error_handler,
            observe: o.observe,
            spawn_class: SpawnClassArg::Helper,
        };
        let recorder = o.observe.then(|| Arc::new(StreamRecorder::default()));
        built.push((call.instance.unwrap_or(0), args, recorder));
    }

    let rt = runtime();
    let outcome: Outcome = rt.block_on(async {
        let mut results = Vec::new();
        if case.concurrent {
            let mut handles = Vec::new();
            for (instance, args, recorder) in &built {
                let ctx = ctxs[*instance].clone();
                let args = args.clone();
                let host = host.clone();
                let sink: Arc<dyn OutputSink> = match recorder {
                    Some(r) => r.clone(),
                    None => Arc::new(gamelib_launch::runner::stream::NullSink),
                };
                handles.push(tokio::spawn(async move {
                    call_runner(&ctx, args, &host, sink).await
                }));
            }
            // Release the held runs once every one that is going to hold has.
            for _ in 0..1000 {
                if runner.held.load(Ordering::SeqCst) >= holds {
                    break;
                }
                tokio::task::yield_now().await;
            }
            let _ = runner.release.send(true);
            for handle in handles {
                results.push(serde_json::to_value(handle.await.expect("task")).unwrap());
            }
        } else {
            for (instance, args, recorder) in &built {
                let sink: Arc<dyn OutputSink> = match recorder {
                    Some(r) => r.clone(),
                    None => Arc::new(gamelib_launch::runner::stream::NullSink),
                };
                let result = call_runner(&ctxs[*instance], args.clone(), &host, sink).await;
                results.push(serde_json::to_value(result).unwrap());
                if holds > 0 {
                    let _ = runner.release.send(true);
                }
            }
        }
        Outcome {
            results,
            streams: built
                .iter()
                .map(|(_, _, r)| r.as_ref().map(|r| lock(&r.chunks).clone()))
                .collect(),
        }
    });
    drop(rt);

    if runner.unused() > 0 {
        return Err(format!("{}: a scripted spawn never happened", case.id));
    }
    let id = &case.id;
    // `windows-path-separator`: the joined runner path of a win32 case, slash-joined as the golden has it.
    let joins: Vec<(String, String)> = if platform == Platform::Windows {
        built
            .iter()
            .filter_map(|(_, args, _)| {
                let dir = args.runner.dir.as_deref().filter(|d| !d.is_empty())?;
                Some((
                    join_path(true, dir, &args.runner.bin),
                    join_path(false, dir, &args.runner.bin),
                ))
            })
            .collect()
    } else {
        Vec::new()
    };
    let fold_text = |text: &str| {
        let mut out = text.to_string();
        for (windows, posix) in &joins {
            out = out.replace(windows, posix);
        }
        rig.normalise_text(&out)
    };
    fn walk(value: &Value, f: &dyn Fn(&str) -> String) -> Value {
        match value {
            Value::String(s) => Value::String(f(s)),
            Value::Array(items) => Value::Array(items.iter().map(|v| walk(v, f)).collect()),
            Value::Object(map) => {
                Value::Object(map.iter().map(|(k, v)| (k.clone(), walk(v, f))).collect())
            }
            other => other.clone(),
        }
    }
    let norm = |v: &Value| walk(v, &fold_text);

    // result.json
    let want_result = read_json(&expected.join("result.json"));
    let want_results = want_result["results"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if want_results.len() != outcome.results.len() {
        return Err(format!(
            "{id}: {} results, want {}",
            outcome.results.len(),
            want_results.len()
        ));
    }
    let spawn_errors: Vec<bool> = want_results
        .iter()
        .map(|w| w["error"].as_str().is_some_and(is_spawn_failure))
        .collect();
    for (index, (got, want)) in outcome.results.iter().zip(&want_results).enumerate() {
        let got = norm(got);
        if spawn_errors[index] {
            // `spawn-error-text`: the OS error Rust reports is not Node's `spawn <bin> ENOENT`.
            let error = got["error"].as_str().unwrap_or_default();
            let ok = is_spawn_failure(error)
                && got["stderr"] == got["error"]
                && got["stdout"] == want["stdout"]
                && got["fullCommand"] == want["fullCommand"];
            if !ok {
                return Err(format!(
                    "{id}: result {index} is {got}, want a spawn failure like {want}"
                ));
            }
        } else if got != *want {
            return Err(format!("{id}: result {index} is {got}, want {want}"));
        }
    }
    if let Some(identical) = want_result.get("identical").and_then(Value::as_array) {
        let groups: BTreeSet<u64> = identical.iter().filter_map(Value::as_u64).collect();
        let spawned = lock(&runner.specs).len();
        if groups.len() != spawned {
            return Err(format!(
                "{id}: calls make {} distinct results, but {spawned} children ran",
                groups.len()
            ));
        }
        for (index, group) in identical.iter().enumerate() {
            let first = group.as_u64().unwrap_or(0) as usize;
            if outcome.results[index] != outcome.results[first] {
                return Err(format!(
                    "{id}: call {index} should share call {first}'s result"
                ));
            }
        }
    }

    // spawns.json
    let want_spawns = read_json(&expected.join("spawns.json"));
    let want_spawns = want_spawns.as_array().cloned().unwrap_or_default();
    let specs = lock(&runner.specs).clone();
    if specs.len() != want_spawns.len() {
        return Err(format!(
            "{id}: {} spawns, want {}",
            specs.len(),
            want_spawns.len()
        ));
    }
    let class = class_of(&case.call_site);
    if class != "helper" && class != "game" {
        return Err(format!(
            "{id}: call site {} has class {class}",
            case.call_site
        ));
    }
    let recorded_events = lock(&events).clone();
    let tracks: Vec<(String, String)> = recorded_events
        .iter()
        .filter_map(|e| match e {
            RunnerEvent::Track { runner, key } => Some((runner.clone(), id_class(key))),
            _ => None,
        })
        .collect();
    for (index, (spec, want)) in specs.iter().zip(&want_spawns).enumerate() {
        let env: BTreeMap<String, String> = spec.env.iter().cloned().collect();
        let got = json!({
            "program": spec.program,
            "argv": spec.argv,
            "env": env,
            "cwd": spec.cwd.as_ref().map(|c| c.to_string_lossy().into_owned()),
            "replaceEnv": spec.replace_env,
            "timeout": spec.timeout.is_none(),
            "windowsHide": spec.hide_window,
            "hasSignal": spec.cancel.is_some(),
            "label": spec.label,
        });
        let got = norm(&got);
        let want_track = &want["track"];
        let wanted = json!({
            "program": want["program"],
            "argv": want["argv"],
            "env": want["env"],
            "cwd": want["cwd"],
            "replaceEnv": want["replaceEnv"],
            "timeout": want["timeout"]["none"] == json!(true),
            "windowsHide": want["windowsHide"],
            "hasSignal": want["hasSignal"],
            "label": "runner-call",
        });
        if got != wanted {
            return Err(format!("{id}: spawn {index} is {got}, want {wanted}"));
        }
        if want["timeoutMs"] != Value::Null {
            return Err(format!(
                "{id}: spawn {index} has a finite timeout in the golden"
            ));
        }
        let want_pair = (
            want_track["runner"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            id_class(want_track["key"].as_str().unwrap_or_default()),
        );
        if tracks.get(index) != Some(&want_pair) {
            return Err(format!(
                "{id}: spawn {index} tracked as {:?}, want {want_pair:?}",
                tracks.get(index)
            ));
        }
    }

    // calls.json: the abort registry and the error handler, in order
    let want_calls = read_json(&expected.join("calls.json"));
    let want_seq: Vec<Value> = want_calls
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|c| c["seam"] != "searchForExecutableOnPath" && c["seam"] != "commandToArgsArray")
        .map(|c| match c["seam"].as_str() {
            Some("abort.create") => {
                json!(["create", id_class(c["id"].as_str().unwrap_or_default())])
            }
            Some("abort.remove") => json!([
                "remove",
                id_class(c["id"].as_str().unwrap_or_default()),
                c["aborted"]
            ]),
            _ => {
                let error = c["error"].as_str().unwrap_or_default();
                json!([
                    "error",
                    if is_spawn_failure(error) {
                        "<spawn failure>"
                    } else {
                        error
                    },
                    c["appName"],
                    c["runner"]
                ])
            }
        })
        .collect();
    let got_seq: Vec<Value> = recorded_events
        .iter()
        .filter_map(|e| match e {
            RunnerEvent::AbortCreate(i) => Some(json!(["create", id_class(i)])),
            RunnerEvent::AbortRemove { id, aborted } => {
                Some(json!(["remove", id_class(id), aborted]))
            }
            RunnerEvent::ErrorHandler {
                error,
                app_name,
                runner,
            } => Some(json!([
                "error",
                if is_spawn_failure(error) {
                    "<spawn failure>"
                } else {
                    error.as_str()
                },
                app_name,
                runner
            ])),
            RunnerEvent::Track { .. } => None,
        })
        .map(|v| norm(&v))
        .collect();
    // Calls made together settle in an order that is an artefact of the TS microtask queue (an error
    // handler call of each, then each remove), so for those cases the creates are compared in order and
    // the errors and removes as sets; one call after another is compared exactly.
    let kind_of = |v: &Value| v[0].as_str().unwrap_or_default().to_string();
    let same_calls = if case.concurrent {
        let by = |seq: &[Value], kind: &str, sort: bool| {
            let mut list: Vec<String> = seq
                .iter()
                .filter(|v| kind_of(v) == kind)
                .map(Value::to_string)
                .collect();
            if sort {
                list.sort();
            }
            list
        };
        by(&got_seq, "create", false) == by(&want_seq, "create", false)
            && by(&got_seq, "error", true) == by(&want_seq, "error", true)
            && by(&got_seq, "remove", true) == by(&want_seq, "remove", true)
    } else {
        got_seq == want_seq
    };
    if !same_calls {
        return Err(format!(
            "{id}: abort and error calls are {got_seq:?}, want {want_seq:?}"
        ));
    }

    // stream.json
    let want_streams = read_json(&expected.join("stream.json"));
    let want_streams = want_streams.as_array().cloned().unwrap_or_default();
    let got_streams: Vec<Value> = outcome
        .streams
        .iter()
        .map(|s| match s {
            Some(chunks) => json!(chunks),
            None => Value::Null,
        })
        .collect();
    if norm(&Value::Array(got_streams.clone())) != Value::Array(want_streams.clone()) {
        return Err(format!(
            "{id}: stream is {got_streams:?}, want {want_streams:?}"
        ));
    }

    // logFrames.json
    let want_frames = read_json(&expected.join("logFrames.json"));
    let want_frames = want_frames.as_array().cloned().unwrap_or_default();
    let got_frames = lock(&sink.frames).clone();
    let got_frames: Vec<Value> = got_frames.iter().map(norm).collect();
    if got_frames != want_frames {
        return Err(format!(
            "{id}: log frames are {got_frames:?}, want {want_frames:?}"
        ));
    }

    // events.json: the general log, one line per `{ level, prefix, parts }`
    let want_events = read_json(&expected.join("events.json"));
    let want_events = want_events.as_array().cloned().unwrap_or_default();
    let got_general = lock(&sink.general).clone();
    if got_general.len() != want_events.len() {
        return Err(format!(
            "{id}: {} general log lines, want {}",
            got_general.len(),
            want_events.len()
        ));
    }
    for (index, ((level, prefix, msg), want)) in got_general.iter().zip(&want_events).enumerate() {
        let msg = fold_text(msg);
        let parts = want["parts"].as_array().cloned().unwrap_or_default();
        let level_ok = level.as_str().to_lowercase() == want["level"].as_str().unwrap_or_default();
        let prefix_ok = prefix.as_str() == want["prefix"].as_str().unwrap_or_default();
        let text_ok = if want["level"] == "error" {
            // The last part is the Error object the TS stringified; Rust writes its message instead.
            let head = parts[..3]
                .iter()
                .map(|p| p.as_str().unwrap_or_default())
                .collect::<Vec<_>>()
                .join(" ");
            msg.starts_with(&format!("{head} "))
        } else {
            msg == parts
                .iter()
                .map(|p| p.as_str().unwrap_or_default())
                .collect::<Vec<_>>()
                .join(" ")
        };
        if !(level_ok && prefix_ok && text_ok) {
            return Err(format!(
                "{id}: general line {index} is {level:?} {prefix:?} {msg:?}, want {want}"
            ));
        }
    }
    Ok(())
}

#[test]
fn golden_runner_replays_every_case() {
    let cases = load_cases();
    let names: BTreeSet<&str> = cases.iter().map(|c| c.id.as_str()).collect();
    for skipped in NEEDS_SANITIZER {
        assert!(
            names.contains(skipped),
            "NEEDS_SANITIZER names a case that is not recorded: {skipped}"
        );
    }
    // A call site with no class fails by name, before anything runs.
    for case in &cases {
        class_of(&case.call_site);
    }
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for case in &cases {
        let carries_sanitizer = case.calls.iter().any(|c| c.options.sanitizer.is_some());
        if NEEDS_SANITIZER.contains(&case.id.as_str()) {
            assert!(
                carries_sanitizer,
                "{} is listed as needing a sanitizer but carries none",
                case.id
            );
            continue;
        }
        assert!(
            !carries_sanitizer,
            "{} carries a sanitizer but is not in NEEDS_SANITIZER",
            case.id
        );
        let rig = Rig::new();
        match replay(case, &rig) {
            Ok(()) => compared += 1,
            Err(why) => failures.push(why),
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {} cases differ from the TS golden:\n{}",
        failures.len(),
        cases.len(),
        failures
            .iter()
            .take(5)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
    check_floor("golden/runner", compared, RUNNER_FLOOR).unwrap();
    println!("compared {compared} floor {RUNNER_FLOOR}");
}

#[test]
fn an_empty_or_shrunken_case_list_fails_the_floor() {
    assert!(check_floor("x", 0, RUNNER_FLOOR).is_err());
    assert!(check_floor("x", RUNNER_FLOOR - 1, RUNNER_FLOOR).is_err());
    assert!(check_floor("x", RUNNER_FLOOR, RUNNER_FLOOR).is_ok());
}

#[test]
fn the_manifest_count_is_at_least_the_floor() {
    let manifest = read_json(&fixtures().join("golden/runner/MANIFEST.json"));
    assert!(manifest["count"].as_u64().unwrap_or(0) as usize > RUNNER_FLOOR);
}

#[test]
fn deltas_json_names_each_delta_with_a_reason() {
    let deltas = read_json(&fixtures().join("golden/runner/deltas.json"));
    for name in ["random-abort-id", "chunk-boundaries", "spawn-error-text"] {
        let reason = deltas[name].as_str().unwrap_or_default();
        assert!(reason.len() > 20, "delta {name} has no reason");
    }
}

#[test]
fn run_abort_on_an_unknown_id_answers_false() {
    let rig = Rig::new();
    let ctx = rig.launch_ctx(Platform::Linux, Arc::new(CaseRunner::new(&[])));
    assert!(!run_abort(&ctx, "nothing-here"));
}
