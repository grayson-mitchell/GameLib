//! The Rust replay of the wine launch variant (88.2-12, D-22): `launch_wine_command` against
//!
//! - `golden/wine_launch`: 41 `runWineCommand` cases 88.2-04 recorded from the TypeScript (the tracer, the
//!   21 named `commandRunner.test.ts` titles and 19 pairwise rows): spawn (program, argv, the whole env, cwd,
//!   the timeout, the tracked key, the class), the `Wine Command:` header and every chunk at the log writer
//!   boundary with their rotate flags, the stream the caller saw, the general log lines and the result;
//! - `gamelib-wine/tests/fixtures/golden/wine_command`: the 16 cases 87 replays against `run_wine_command`,
//!   replayed here through the launch variant with NO entry of that crate's `deltas.json` applied: the
//!   result, the spawns, the tree, the chunks the log writer and the observer saw, and the list the TS left in
//!   the caller's hand (the argv the child was given).
//!
//! The wine side runs over a scripted spawn seam (`CaseRunner`) that delivers the recorded chunks in order,
//! so a difference here is the variant's, not the pipe's. A game-class case (`runner.wine_command.launch`)
//! asks a scripted `GameSpawner`, which writes the recorded chunks to the capture file the run handed it and
//! starts a real stub process (`gamelib-launch-stub-game exit --code N`); a game's two streams share one
//! capture file, so those cases are compared under the `game-merged-streams` delta
//! (`golden/wine_launch/deltas.json`). A count floor lives here next to each replay (equal to the cases it
//! compares), so editing the JSON alone cannot lower the bar.

// Task 1 (the tracer) compares one case; the rest of the replay lands with Task 2, which removes this.
#![allow(dead_code, unused_imports)]

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{
    BoxFuture, ChunkSink, LineSink, Pipe, ProcSpec, SpecOutput, SpecRunner,
};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::game::registry::TrackedRegistry;
use gamelib_launch::game::spawn::{GameSpawn, GameSpawner};
use gamelib_launch::runner::stream::{LaunchLogSink, LogHandOff, OutputSink};
use gamelib_launch::runner::wine_command::{
    launch_wine_command, LaunchWineCommandArgs, WineLaunchResult, WINE_RUNNER,
};
use gamelib_launch::runner::{RunnerEvent, RunnerTables};
use gamelib_log::frame::FrameTarget;
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::env::{EnvSnapshot, GameSettingsView};
use gamelib_wine::wine_cmd::WineHost;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The cases of `golden/wine_launch` this file compares. A later edit may raise this, never lower it.
const WINE_LAUNCH_FLOOR: usize = 41;
/// The cases of gamelib-wine's `golden/wine_command` this file compares through the launch variant.
const WINE_COMMAND_FLOOR: usize = 16;

/// The stub game the scripted spawner starts (feature `harness`).
const STUB: &str = env!("CARGO_BIN_EXE_gamelib-launch-stub-game");

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn wine_fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../gamelib-wine/tests/fixtures")
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

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
}

fn class_of(site: &str) -> String {
    read_json(&fixtures().join("golden/classes.json"))[site]
        .as_str()
        .unwrap_or_else(|| panic!("{site} has no class in classes.json"))
        .to_string()
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
            home: FakeHome::new("launch-wine-"),
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn app_folder(&self) -> PathBuf {
        self.root().join(".config").join("GameLib")
    }

    fn tools(&self) -> PathBuf {
        self.app_folder().join("tools")
    }

    fn user_data(&self) -> PathBuf {
        self.root()
            .join("Library")
            .join("Application Support")
            .join("GameLib")
    }

    fn tmp(&self) -> PathBuf {
        self.root().join("tmp")
    }

    /// A placeholder path (`<TOOLS>/wine/x`) as a real one.
    fn expand(&self, text: &str) -> String {
        let as_text = |p: PathBuf| p.to_string_lossy().into_owned();
        text.replace("<TOOLS>", &as_text(self.tools()))
            .replace("<APPFOLDER>", &as_text(self.app_folder()))
            .replace("<USERDATA>", &as_text(self.user_data()))
            .replace("<TMP>", &as_text(self.tmp()))
            .replace("<HOME>", &as_text(self.root().to_path_buf()))
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

    /// The placeholder table, most specific root first; a root with a different real path (macOS `/var` is
    /// `/private/var`) is listed under both names.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<TOOLS>", as_text(&self.tools())),
            ("<APPFOLDER>", as_text(&self.app_folder())),
            ("<USERDATA>", as_text(&self.user_data())),
            ("<TMP>", as_text(&self.tmp())),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    let app = real.join(".config").join("GameLib");
                    table.insert(0, ("<TOOLS>", as_text(&app.join("tools"))));
                    table.insert(1, ("<APPFOLDER>", as_text(&app)));
                    table.insert(
                        2,
                        (
                            "<USERDATA>",
                            as_text(
                                &real
                                    .join("Library")
                                    .join("Application Support")
                                    .join("GameLib"),
                            ),
                        ),
                    );
                    table.insert(3, ("<TMP>", as_text(&real.join("tmp"))));
                    table.insert(4, ("<HOME>", as_text(&real)));
                }
            }
        }
        table
    }

    /// Every profile root in `value`'s strings replaced by its placeholder (object keys are left alone).
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

    fn norm_text(&self, text: &str) -> String {
        match self.normalise(Value::String(text.to_string())) {
            Value::String(s) => s,
            _ => unreachable!("a string stays a string"),
        }
    }

    /// The environment the TS ran in: the profile's eight variables and the three pinned ones.
    fn pinned_env(&self) -> BTreeMap<String, String> {
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

    /// The eight fake-profile variables as the process environment a wine_command case inherits.
    fn fake_home_env(&self) -> Vec<(String, String)> {
        self.home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect()
    }

    /// Writes a case's starting state: a directory, or a file.
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

    fn launch_ctx(
        &self,
        platform: Platform,
        runner: Arc<dyn SpecRunner>,
        log: Arc<RecordingLog>,
    ) -> LaunchCtx {
        let root = self.root().to_path_buf();
        let app_folder = self.app_folder();
        let engine = Arc::new(
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                platform,
                EnginePaths {
                    tools_path: self.tools(),
                    user_data: self.user_data(),
                    app_folder: app_folder.clone(),
                    user_home: root.clone(),
                    temp: self.tmp(),
                },
                Shutdown::new(),
            )
            .with_log(log)
            .with_proc(runner),
        );
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), self.tools().join("runtimes")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: app_folder.clone(),
                user_data: app_folder,
                temp: self.tmp(),
                public_dir: None,
            },
            "0.0.0".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        LaunchCtx::new(engine, knownfix, wine, info)
    }
}

#[cfg(unix)]
fn mode_text(md: &std::fs::Metadata) -> Option<String> {
    use std::os::unix::fs::PermissionsExt;
    // The low permission bits with group and other WRITE cleared, as the oracle records them.
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

/// The observer: every chunk, and what the tracked registry held when the first one arrived (a game is
/// registered while it runs, so a chunk is read inside that window).
struct StreamRecorder {
    chunks: Mutex<Vec<String>>,
    registry: Arc<TrackedRegistry>,
    at_first_chunk: Mutex<Option<Vec<(String, String)>>>,
}

impl StreamRecorder {
    fn new(registry: Arc<TrackedRegistry>) -> StreamRecorder {
        StreamRecorder {
            chunks: Mutex::new(Vec::new()),
            registry,
            at_first_chunk: Mutex::new(None),
        }
    }
}

impl OutputSink for StreamRecorder {
    fn chunk(&self, _pipe: Pipe, text: &str) {
        let mut seen = lock(&self.at_first_chunk);
        if seen.is_none() {
            *seen = Some(
                self.registry
                    .games()
                    .into_iter()
                    .map(|g| (g.runner, g.key))
                    .collect(),
            );
        }
        lock(&self.chunks).push(text.to_string());
    }
}

// ---------------------------------------------------------------------------------------------
// The scripted spawn seams
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
    #[serde(default)]
    hold: bool,
    #[serde(default)]
    timed_out: bool,
    throws: Option<String>,
}

/// One spawn the run asked for, and through which seam it went.
#[derive(Clone)]
struct Spawned {
    spec: ProcSpec,
    via_game: bool,
}

struct CaseRunner {
    steps: Mutex<Vec<(Step, bool)>>,
    specs: Mutex<Vec<Spawned>>,
    release: tokio::sync::watch::Sender<bool>,
    via_game: AtomicUsize,
}

impl CaseRunner {
    fn new(script: Vec<Step>) -> CaseRunner {
        CaseRunner {
            steps: Mutex::new(script.into_iter().map(|s| (s, false)).collect()),
            specs: Mutex::new(Vec::new()),
            release: tokio::sync::watch::channel(false).0,
            via_game: AtomicUsize::new(0),
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

impl SpecRunner for CaseRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.run_streamed(spec, Box::new(|_, _| {}))
    }

    fn run_streamed(&self, spec: ProcSpec, mut on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        lock(&self.specs).push(Spawned {
            spec: spec.clone(),
            via_game: false,
        });
        let Some(step) = self.take(&spec.program) else {
            return Box::pin(async move {
                SpecOutput {
                    stderr: format!("unscripted process call: {}", spec.program),
                    ..SpecOutput::default()
                }
            });
        };
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
            if step.hold {
                let cancel = spec
                    .cancel
                    .clone()
                    .expect("a wine run carries a cancel token");
                tokio::select! {
                    _ = cancel.cancelled() => {
                        return SpecOutput { cancelled: true, ..SpecOutput::default() };
                    }
                    _ = release.wait_for(|released| *released) => {}
                }
            } else {
                tokio::task::yield_now().await;
            }
            if step.timed_out {
                return SpecOutput {
                    timed_out: true,
                    ..SpecOutput::default()
                };
            }
            SpecOutput {
                code: match step.code {
                    None => Some(0),
                    Some(code) => code,
                },
                ..SpecOutput::default()
            }
        })
    }
}

/// The game class's scripted seam: it records what the run asked for (as a `ProcSpec`), then plays the next
/// step of the case's script as a real stub process that exits with the recorded code.
struct CaseGameSpawner {
    cases: Arc<CaseRunner>,
}

impl GameSpawner for CaseGameSpawner {
    fn spawn(&self, spec: &GameSpawn<'_>) -> std::io::Result<gamelib_proc::GameHandle> {
        let mut recorded = ProcSpec::new("wine-command", spec.program);
        recorded.argv = spec.argv.to_vec();
        recorded.env = spec.env.to_vec();
        recorded.replace_env = true;
        recorded.cwd = spec.cwd.map(PathBuf::from);
        lock(&self.cases.specs).push(Spawned {
            spec: recorded,
            via_game: true,
        });
        self.cases.via_game.fetch_add(1, Ordering::SeqCst);
        let Some(step) = self.cases.take(spec.program) else {
            return Err(std::io::Error::other("unscripted process call"));
        };
        if let Some(reason) = &step.throws {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                reason.clone(),
            ));
        }
        // The recorded chunks, in order, into the capture file (both pipes share it).
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(spec.capture)?;
        for chunk in &step.chunks {
            file.write_all(chunk.text.as_bytes())?;
        }
        drop(file);
        let mut cmd = std::process::Command::new(STUB);
        cmd.arg("exit")
            .arg("--code")
            .arg(step.code.flatten().unwrap_or(0).to_string());
        gamelib_proc::spawn_game_tracked(cmd, None)
    }
}

// ---------------------------------------------------------------------------------------------
// The wine installations a wine_launch case runs against (the TS oracle's `settingsOf` and `seedOf`)
// ---------------------------------------------------------------------------------------------

const PREFIX: &str = "<HOME>/Games/prefix";

#[derive(Debug, Clone, Deserialize)]
struct Setup {
    kind: String,
    #[serde(default)]
    wineserver: bool,
    #[serde(default, rename = "missingBin")]
    missing_bin: bool,
}

impl Setup {
    fn wine_dir(&self) -> &'static str {
        match self.kind.as_str() {
            "wine" => "<TOOLS>/wine/Wine-9",
            "proton-umu" | "proton" => "<TOOLS>/proton/GE-Proton9-1",
            "crossover" => "<TOOLS>/crossover",
            "toolkit" => "<TOOLS>/toolkit",
            other => panic!("unknown wine kind {other}"),
        }
    }

    fn bin(&self) -> String {
        let dir = self.wine_dir();
        match self.kind.as_str() {
            "wine" | "crossover" => format!("{dir}/bin/wine"),
            "toolkit" => format!("{dir}/bin/wine64"),
            _ => format!("{dir}/proton"),
        }
    }

    fn wineserver_path(&self) -> String {
        let dir = self.wine_dir();
        match self.kind.as_str() {
            "proton-umu" | "proton" => format!("{dir}/files/bin/wineserver"),
            _ => format!("{dir}/bin/wineserver"),
        }
    }

    fn has_wineserver(&self) -> bool {
        self.kind == "wine" || self.wineserver
    }

    fn name(&self) -> &'static str {
        match self.kind.as_str() {
            "wine" => "Wine-9",
            "proton-umu" | "proton" => "GE-Proton9-1",
            "crossover" => "CrossOver-24",
            "toolkit" => "GPTK-2",
            other => panic!("unknown wine kind {other}"),
        }
    }

    fn platform(&self) -> Platform {
        if self.kind == "crossover" || self.kind == "toolkit" {
            Platform::Mac
        } else {
            Platform::Linux
        }
    }

    /// The `GameSettings` fields the env builders and the runner read, placeholders unexpanded.
    fn settings(&self) -> Value {
        let mut wine_version = json!({
            "type": if self.kind.starts_with("proton") { "proton" } else { self.kind.as_str() },
            "name": self.name(),
            "bin": self.bin(),
        });
        if self.has_wineserver() {
            wine_version["wineserver"] = json!(self.wineserver_path());
        }
        if self.kind == "wine" {
            wine_version["lib"] = json!(format!("{}/lib64", self.wine_dir()));
            wine_version["lib32"] = json!(format!("{}/lib", self.wine_dir()));
        }
        json!({
            "nvidiaPrime": false,
            "showFps": false,
            "enviromentOptions": [{ "key": "MY_VAR", "value": "\"quoted value\"" }],
            "winePrefix": PREFIX,
            "wineCrossoverBottle": if self.kind == "crossover" { "bottle-1" } else { "" },
            "enableDXVKFpsLimit": false,
            "DXVKFpsCap": "60",
            "enableFSR": false,
            "enableEsync": false,
            "enableMsync": false,
            "enableFsync": false,
            "enableWineWayland": false,
            "enableHDR": false,
            "enableWoW64": false,
            "autoInstallDxvkNvapi": false,
            "eacRuntime": false,
            "battlEyeRuntime": false,
            "verboseLogs": false,
            "preferSystemLibs": false,
            "advertiseAvxForRosetta": false,
            "disableUMU": self.kind != "proton-umu",
            "wineVersion": wine_version,
        })
    }

    /// The files a case starts from: the installation, and the prefix `runWineCommand` checks for.
    fn seed(&self) -> Value {
        let mut seed: Vec<Value> = Vec::new();
        if !self.missing_bin {
            seed.push(json!({ "path": self.bin(), "text": "" }));
        }
        if self.has_wineserver() {
            seed.push(json!({ "path": self.wineserver_path(), "text": "" }));
        }
        if self.kind == "crossover" {
            return Value::Array(seed);
        }
        let regs = |base: &str| -> Vec<Value> {
            vec![
                json!({ "path": format!("{base}/dosdevices"), "dir": true }),
                json!({ "path": format!("{base}/drive_c"), "dir": true }),
                json!({ "path": format!("{base}/system.reg"), "text": "" }),
                json!({ "path": format!("{base}/user.reg"), "text": "" }),
                json!({ "path": format!("{base}/userdef.reg"), "text": "" }),
            ]
        };
        if self.kind.starts_with("proton") {
            for file in ["pfx.lock", "tracked_files", "version", "config_info"] {
                seed.push(json!({ "path": format!("{PREFIX}/{file}"), "text": "" }));
            }
            seed.extend(regs(&format!("{PREFIX}/pfx")));
        } else {
            seed.extend(regs(PREFIX));
        }
        if self.kind == "proton-umu" {
            // The file `getUmuPath` falls back to, so the install is umu-supported.
            seed.push(json!({ "path": "<TOOLS>/runtimes/umu/umu_run.py", "text": "" }));
        }
        Value::Array(seed)
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseArgs {
    command_parts: Vec<String>,
    start_folder: Option<String>,
    #[serde(default)]
    skip_prefix_check: bool,
    #[serde(default)]
    wait: bool,
    proton_verb: Option<String>,
    track_key: Option<String>,
    wrappers: Option<Vec<String>>,
    install_folder_name: Option<String>,
    game_install_path: Option<String>,
    resolve_on_exit: Option<bool>,
    #[serde(default)]
    ignore_logging: bool,
    #[serde(default)]
    on_spawn: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchCase {
    id: String,
    call_site: String,
    setup: Setup,
    args: CaseArgs,
    writers: String,
    on_output: bool,
    #[serde(default)]
    process_env: BTreeMap<String, String>,
    script: Vec<Step>,
}

fn launch_cases() -> Vec<LaunchCase> {
    let path = fixtures().join("golden/wine_launch/cases.json");
    serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn writer_target(index: usize) -> FrameTarget {
    FrameTarget {
        kind: "game".into(),
        app_name: Some(if index == 0 {
            "sideload-app".into()
        } else {
            format!("sideload-app-{index}")
        }),
        runner: Some("sideload".into()),
        log_type: Some("launch".into()),
    }
}

/// The log writers a case hands over. A claimed writer's rotation was taken by an earlier entry (the TS
/// harness wrote one before the call), so its header carries `rotate: false`.
fn writers_of(mode: &str) -> Vec<LogHandOff> {
    let count = match mode {
        "none" => 0,
        "two" => 2,
        _ => 1,
    };
    (0..count)
        .map(|index| LogHandOff {
            target: writer_target(index),
            disabled: false,
            rotate: mode != "claimed",
        })
        .collect()
}

/// The header line of a game log: what the TS wrote to each writer when the child started.
fn is_header(frame: &Value) -> bool {
    frame["raw"]
        .as_str()
        .is_some_and(|raw| raw.starts_with("Wine Command: "))
}

/// `game-merged-streams`: consecutive raw entries to one writer are compared as the one text they make (a
/// header entry never joins).
fn join_raw(frames: Vec<Value>) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for frame in frames {
        if let (Some(last), Some(raw)) = (out.last_mut(), frame.get("raw")) {
            if last.get("raw").is_some()
                && !is_header(last)
                && !is_header(&frame)
                && last["target"] == frame["target"]
                && last["rotate"] == frame["rotate"]
            {
                let joined = format!(
                    "{}{}",
                    last["raw"].as_str().unwrap_or_default(),
                    raw.as_str().unwrap_or_default()
                );
                last["raw"] = Value::String(joined);
                continue;
            }
        }
        out.push(frame);
    }
    out
}

/// What one replayed call left behind.
struct Played {
    result: WineLaunchResult,
    settled_before_release: bool,
    specs: Vec<Spawned>,
    frames: Vec<Value>,
    general: Vec<(Level, Prefix, String)>,
    events: Vec<RunnerEvent>,
    stream: Option<Vec<String>>,
    registry_at_first_chunk: Option<Vec<(String, String)>>,
    registry_after: usize,
    engine_log: Vec<(String, String)>,
}

/// Replays one wine_launch case through `launch_wine_command`.
fn replay_wine_launch(case: &LaunchCase) -> Result<(), String> {
    let id = &case.id;
    let expected = fixtures().join("golden/wine_launch/expected").join(id);
    let rig = Rig::new();
    rig.seed(&case.setup.seed());
    let class = class_of(&case.call_site);
    let is_game = class == "game";

    let wineserver = rig.expand(&case.setup.wineserver_path());
    let script: Vec<Step> = case
        .script
        .iter()
        .cloned()
        .map(|mut step| {
            step.program = step.program.map(|p| {
                if p == "<WINESERVER>" {
                    wineserver.clone()
                } else {
                    rig.expand(&p)
                }
            });
            step
        })
        .collect();
    let has_hold = script.iter().any(|s| s.hold);
    let runner = Arc::new(CaseRunner::new(script));
    let sink = Arc::new(RecordingLogSink::default());
    let engine_log = Arc::new(RecordingLog::new());
    let events = Arc::new(Mutex::new(Vec::new()));
    let tables = Arc::new(RunnerTables::recording_into(events.clone()));
    let ctx = rig
        .launch_ctx(case.setup.platform(), runner.clone(), engine_log.clone())
        .with_game_spawner(Arc::new(CaseGameSpawner {
            cases: runner.clone(),
        }))
        .with_log_sink(sink.clone())
        .with_runner_tables(tables);

    let mut env = rig.pinned_env();
    env.extend(case.process_env.clone());
    let host = WineHost {
        env: EnvSnapshot::from_pairs(env),
        // The TS oracle's validWine stand-in checks file existence only and skips the Sonoma rule.
        darwin_release: (case.setup.platform() == Platform::Mac).then(|| "24.1.0".to_string()),
        ..WineHost::default()
    };

    let a = &case.args;
    let mut options = serde_json::Map::new();
    if let Some(wrappers) = &a.wrappers {
        options.insert("wrappers".into(), json!(wrappers));
    }
    if let Some(track) = &a.track_key {
        options.insert("trackKey".into(), json!(track));
    }
    let mut call = json!({
        "commandParts": a.command_parts,
        "gameSettings": case.setup.settings(),
        "options": options,
        "spawnClass": if is_game { "game" } else { "helper" },
        "observe": case.on_output,
        "streamId": "stream-1",
        "logTargets": writers_of(&case.writers).iter().map(|w| json!({
            "target": {
                "kind": w.target.kind, "appName": w.target.app_name,
                "runner": w.target.runner, "type": w.target.log_type
            },
            "rotate": w.rotate,
        })).collect::<Vec<_>>(),
    });
    for (key, value) in [
        ("wait", a.wait.then_some(json!(true))),
        ("protonVerb", a.proton_verb.as_ref().map(|v| json!(v))),
        ("startFolder", a.start_folder.as_ref().map(|v| json!(v))),
        (
            "installFolderName",
            a.install_folder_name.as_ref().map(|v| json!(v)),
        ),
        (
            "gameInstallPath",
            a.game_install_path.as_ref().map(|v| json!(v)),
        ),
        (
            "skipPrefixCheckIKnowWhatImDoing",
            a.skip_prefix_check.then_some(json!(true)),
        ),
        ("ignoreLogging", a.ignore_logging.then_some(json!(true))),
        ("resolveOnExit", a.resolve_on_exit.map(|v| json!(v))),
    ] {
        if let Some(value) = value {
            call[key] = value;
        }
    }
    let call = rig.expand_deep(&call);
    let args: LaunchWineCommandArgs =
        serde_json::from_value(call).map_err(|e| format!("{id}: the call does not decode: {e}"))?;

    let recorder = case
        .on_output
        .then(|| Arc::new(StreamRecorder::new(ctx.registry.clone())));
    let output: Arc<dyn OutputSink> = match &recorder {
        Some(r) => r.clone(),
        None => Arc::new(gamelib_launch::runner::stream::NullSink),
    };

    let rt = runtime();
    let (result, settled) = rt.block_on(async {
        let run_ctx = ctx.clone();
        let run_host = host.clone();
        let task =
            tokio::spawn(
                async move { launch_wine_command(&run_ctx, args, &run_host, output).await },
            );
        let mut settled = true;
        if has_hold {
            // Enough turns for every unheld run to finish: only a held wineserver wait is still pending.
            for _ in 0..6 {
                tokio::task::yield_now().await;
            }
            settled = task.is_finished();
            let _ = runner.release.send(true);
        }
        (task.await.expect("the launch task"), settled)
    });
    drop(rt);

    if runner.unused() > 0 {
        return Err(format!("{id}: a scripted spawn never happened"));
    }
    let played = Played {
        result,
        settled_before_release: settled,
        specs: lock(&runner.specs).clone(),
        frames: lock(&sink.frames).clone(),
        general: lock(&sink.general).clone(),
        events: lock(&events).clone(),
        stream: recorder.as_ref().map(|r| lock(&r.chunks).clone()),
        registry_at_first_chunk: recorder
            .as_ref()
            .and_then(|r| lock(&r.at_first_chunk).clone()),
        registry_after: ctx.registry.len(),
        engine_log: engine_log
            .lines()
            .into_iter()
            .filter(|(level, _)| *level == "warn" || *level == "error")
            .map(|(level, text)| (level.to_string(), text))
            .collect(),
    };
    compare_wine_launch(case, &rig, &expected, is_game, &played)
}

fn compare_wine_launch(
    case: &LaunchCase,
    rig: &Rig,
    expected: &Path,
    is_game: bool,
    played: &Played,
) -> Result<(), String> {
    let id = &case.id;
    let norm = |v: Value| rig.normalise(v);

    // result.json: the response, and whether the call had settled while a held wait was pending.
    let want = read_json(&expected.join("result.json"));
    let got = norm(played.result.to_json());
    let mut want_response = want["response"].clone();
    if is_game && want_response.get("code").is_some() {
        // `game-merged-streams`: a game's output is one capture file, so everything it printed is stdout.
        let printed: String = case
            .script
            .first()
            .map(|s| s.chunks.iter().map(|c| c.text.as_str()).collect())
            .unwrap_or_default();
        if want_response["code"] != Value::Null {
            want_response["stdout"] = Value::String(rig.norm_text(&printed));
            want_response["stderr"] = Value::String(String::new());
        }
    }
    if got != want_response {
        return Err(format!("{id}: result is {got}, want {want_response}"));
    }
    if want["settledBeforeRelease"] != json!(played.settled_before_release) {
        return Err(format!(
            "{id}: settled before the wineserver wait was released is {}, want {}",
            played.settled_before_release, want["settledBeforeRelease"]
        ));
    }
    // The lists the TS left in the caller's hand are the argv the child was given (the TS built them in
    // place), and `caller-arrays-mutated` is the delta that the Rust call leaves its own lists as they were.
    let ran: Vec<&Spawned> = played
        .specs
        .iter()
        .filter(|s| !is_wineserver(&s.spec))
        .collect();
    if let Some(main) = ran.first() {
        let after = norm(json!(main.spec.argv));
        if after != want["commandPartsAfter"] {
            return Err(format!(
                "{id}: the argv is {after}, the TS left {} in the caller's list",
                want["commandPartsAfter"]
            ));
        }
    }

    // spawns.json
    let want_spawns = read_json(&expected.join("spawns.json"));
    let want_spawns = want_spawns.as_array().cloned().unwrap_or_default();
    if played.specs.len() != want_spawns.len() {
        return Err(format!(
            "{id}: {} spawns, want {}",
            played.specs.len(),
            want_spawns.len()
        ));
    }
    let tracks: Vec<(String, String)> = played
        .events
        .iter()
        .filter_map(|e| match e {
            RunnerEvent::Track { runner, key } => Some((runner.clone(), key.clone())),
            _ => None,
        })
        .collect();
    let mut want_tracks: Vec<(String, String)> = Vec::new();
    for (index, (spawned, want)) in played.specs.iter().zip(&want_spawns).enumerate() {
        let spec = &spawned.spec;
        let env: BTreeMap<String, String> = spec.env.iter().cloned().collect();
        let waiting = want["callSite"] == "runner.wine_command.wineserver_wait";
        let got = norm(json!({
            "program": spec.program,
            "argv": spec.argv,
            "env": env,
            "cwd": spec.cwd.as_ref().map(|c| c.to_string_lossy().into_owned()),
            "replaceEnv": spec.replace_env,
            "timeoutMs": spec.timeout.map(|t| t.as_millis() as u64),
            "windowsHide": spec.hide_window,
            "class": if spawned.via_game { "game" } else { "helper" },
        }));
        let wanted = json!({
            "program": want["program"],
            "argv": want["argv"],
            "env": want["env"],
            "cwd": want["cwd"],
            "replaceEnv": want["replaceEnv"],
            "timeoutMs": want["timeoutMs"],
            "windowsHide": want["windowsHide"],
            "class": want["class"],
        });
        if got != wanted {
            return Err(format!("{id}: spawn {index} is {got}, want {wanted}"));
        }
        if waiting == !is_wineserver(spec) {
            return Err(format!(
                "{id}: spawn {index} is {} but the golden calls it {}",
                spec.program, want["callSite"]
            ));
        }
        if !waiting {
            if let Some(track) = want["track"].as_object() {
                want_tracks.push((
                    track["runner"].as_str().unwrap_or_default().to_string(),
                    track["key"].as_str().unwrap_or_default().to_string(),
                ));
            }
            // `resolveOn` is the helper arm's post-exit mode; the game arm selects `GameEnd` (unit-tested
            // in `wine_command.rs`), which the spawn seam does not see.
            if !spawned.via_game {
                let post = format!("{:?}", spec.post_exit);
                let wanted_post = if want["resolveOn"] == "exit" {
                    "Grace(250ms)"
                } else {
                    "UntilClosed"
                };
                if post != wanted_post {
                    return Err(format!(
                        "{id}: spawn {index} resolves with {post}, want {wanted_post} (resolveOn {})",
                        want["resolveOn"]
                    ));
                }
            }
        } else if want["track"] != Value::Null || spec.post_exit != Default::default() {
            return Err(format!(
                "{id}: the wineserver wait is tracked or not a plain run"
            ));
        }
    }
    let tracks: Vec<(String, String)> = tracks
        .into_iter()
        .map(|(runner, key)| (runner, rig.norm_text(&key)))
        .collect();
    if tracks != want_tracks {
        return Err(format!("{id}: tracked as {tracks:?}, want {want_tracks:?}"));
    }
    // The class is observed, not assumed: a game case's main spawn went through the game spawner.
    for (spawned, want) in played.specs.iter().zip(&want_spawns) {
        if (want["class"] == "game") != spawned.via_game {
            return Err(format!("{id}: a spawn's class is not the golden's"));
        }
    }
    if is_game
        && !played
            .specs
            .iter()
            .all(|s| s.via_game == !is_wineserver(&s.spec))
    {
        return Err(format!("{id}: a game case spawned through the wrong seam"));
    }
    if !tracks.is_empty() && played.registry_after != 0 {
        return Err(format!(
            "{id}: a run left {} entries registered",
            played.registry_after
        ));
    }
    // A game is registered under `{ wine, key }` while it runs.
    if is_game {
        if let (Some(seen), Some((runner, key))) =
            (&played.registry_at_first_chunk, want_tracks.first())
        {
            let key = rig.norm_text(key);
            let seen: Vec<(String, String)> = seen
                .iter()
                .map(|(r, k)| (r.clone(), rig.norm_text(k)))
                .collect();
            if seen != vec![(runner.clone(), key.clone())] {
                return Err(format!(
                    "{id}: the registry held {seen:?} while the game ran, want [({runner}, {key})]"
                ));
            }
        }
    }

    // events.json: the general log lines, in order.
    let want_events = read_json(&expected.join("events.json"));
    let level_of = |name: &str| match name {
        "debug" => Level::Debug,
        "info" => Level::Info,
        "warning" => Level::Warning,
        "error" => Level::Error,
        other => panic!("unknown level {other}"),
    };
    let want_lines: Vec<(Level, String, String, bool)> = want_events
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|e| {
            let (text, exact) = match &e["parts"] {
                Value::String(s) => (s.clone(), true),
                Value::Array(parts) => {
                    let joined: Vec<String> = parts
                        .iter()
                        .filter_map(|p| p.as_str().map(str::to_string))
                        .collect();
                    // A part that is not text (the Error a failed spawn carried) is the OS's own to word.
                    (joined.join(" "), joined.len() == parts.len())
                }
                other => panic!("unexpected parts {other}"),
            };
            (
                level_of(e["level"].as_str().unwrap_or_default()),
                e["prefix"].as_str().unwrap_or_default().to_string(),
                text,
                exact,
            )
        })
        .collect();
    let got_lines: Vec<(Level, String, String)> = played
        .general
        .iter()
        .map(|(level, prefix, msg)| (*level, prefix.as_str().to_string(), rig.norm_text(msg)))
        .collect();
    if got_lines.len() != want_lines.len() {
        return Err(format!(
            "{id}: log lines are {got_lines:?}, want {want_lines:?}"
        ));
    }
    for (got, want) in got_lines.iter().zip(&want_lines) {
        let same_text = if want.3 {
            got.2 == want.2
        } else {
            got.2.starts_with(&want.2)
        };
        if got.0 != want.0 || got.1 != want.1 || !same_text {
            return Err(format!("{id}: log line {got:?}, want {want:?}"));
        }
    }
    if !played.engine_log.is_empty() {
        return Err(format!(
            "{id}: the engine log carried {:?}, which the TS did not log",
            played.engine_log
        ));
    }

    // stream.json
    let want_stream = read_json(&expected.join("stream.json"));
    let one_text = |stream: Option<Vec<String>>| -> Value {
        match stream {
            None => Value::Null,
            Some(chunks) if is_game && !chunks.is_empty() => json!([chunks.concat()]),
            Some(chunks) => json!(chunks),
        }
    };
    let want_stream = one_text(want_stream.as_array().map(|a| {
        a.iter()
            .filter_map(|c| c.as_str().map(str::to_string))
            .collect()
    }));
    let got_stream = one_text(played.stream.clone());
    if norm(got_stream.clone()) != want_stream {
        return Err(format!("{id}: stream is {got_stream}, want {want_stream}"));
    }

    // logFrames.json
    let mut want_frames = read_json(&expected.join("logFrames.json"))
        .as_array()
        .cloned()
        .unwrap_or_default();
    if case.writers == "claimed" {
        // The TS harness wrote one line before the call, to claim the writer's rotation.
        let first = want_frames.remove(0);
        if first["line"]["message"] != "earlier output" {
            return Err(format!("{id}: the claimed writer's first frame is {first}"));
        }
    }
    let mut got_frames: Vec<Value> = played.frames.iter().cloned().map(norm).collect();
    if is_game {
        got_frames = join_raw(got_frames);
        want_frames = join_raw(want_frames);
    }
    if got_frames != want_frames {
        return Err(format!(
            "{id}: log frames are {got_frames:?}, want {want_frames:?}"
        ));
    }
    // The header comes before any output, for each writer.
    if let Some(first) = played.frames.first() {
        if !is_header(first) {
            return Err(format!(
                "{id}: the first frame written is not the header: {first}"
            ));
        }
    }
    Ok(())
}

fn is_wineserver(spec: &ProcSpec) -> bool {
    spec.argv == ["--wait"] && spec.program.ends_with("wineserver")
}

fn run_case(case: &LaunchCase) {
    if let Err(message) = replay_wine_launch(case) {
        panic!("{message}");
    }
}

// ---------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------

/// The tracer: a sideload wine launch as Game class, with the header before the first chunk, a registry
/// entry keyed by the app name while it runs, and the `wineserver --wait` helper after it.
#[test]
fn the_sideload_wine_launch_runs_as_a_game_with_the_ts_log_stream_and_track() {
    let tracer = launch_cases()
        .into_iter()
        .find(|c| c.id == "wine-launch-sideload")
        .expect("the tracer case");
    assert_eq!(class_of(&tracer.call_site), "game");
    run_case(&tracer);
}
