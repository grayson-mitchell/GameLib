//! What `golden_script.rs` and `golden_wine_path.rs` share (88.2-13): the profile a case runs in, the scripted
//! spawn seam that plays a case's recorded chunks and exit, and the recording log sink. A smaller copy of the
//! pieces `golden_wine_launch.rs` carries (that file is left as it was); each test file uses a subset.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{
    BoxFuture, ChunkSink, LineSink, Pipe, ProcSpec, SpecOutput, SpecRunner,
};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::RecordingLog;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::runner::stream::LaunchLogSink;
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde::Deserialize;
use serde_json::{json, Value};

pub fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

pub fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

pub fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

pub fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
}

pub fn class_of(site: &str) -> String {
    read_json(&fixtures().join("golden/classes.json"))[site]
        .as_str()
        .unwrap_or_else(|| panic!("{site} has no class in classes.json"))
        .to_string()
}

/// The profile a case runs in. Every case gets a fresh fake home (D-22); the script's inherited `HOME` is
/// this one, never the operator's.
pub struct Rig {
    pub home: FakeHome,
}

impl Rig {
    pub fn new() -> Rig {
        Rig {
            home: FakeHome::new("launch-golden-"),
        }
    }

    pub fn root(&self) -> &Path {
        self.home.root()
    }

    pub fn app_folder(&self) -> PathBuf {
        self.root().join(".config").join("GameLib")
    }

    pub fn tools(&self) -> PathBuf {
        self.app_folder().join("tools")
    }

    pub fn user_data(&self) -> PathBuf {
        self.root()
            .join("Library")
            .join("Application Support")
            .join("GameLib")
    }

    pub fn tmp(&self) -> PathBuf {
        self.root().join("tmp")
    }

    /// A placeholder path (`<TOOLS>/wine/x`) as a real one.
    pub fn expand(&self, text: &str) -> String {
        let as_text = |p: PathBuf| p.to_string_lossy().into_owned();
        text.replace("<TOOLS>", &as_text(self.tools()))
            .replace("<APPFOLDER>", &as_text(self.app_folder()))
            .replace("<USERDATA>", &as_text(self.user_data()))
            .replace("<TMP>", &as_text(self.tmp()))
            .replace("<HOME>", &as_text(self.root().to_path_buf()))
    }

    pub fn expand_deep(&self, value: &Value) -> Value {
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
    pub fn normalise(&self, value: Value) -> Value {
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

    pub fn norm_text(&self, text: &str) -> String {
        match self.normalise(Value::String(text.to_string())) {
            Value::String(s) => s,
            _ => unreachable!("a string stays a string"),
        }
    }

    /// The environment the TS ran in: the profile's eight variables and the three pinned ones.
    pub fn pinned_env(&self) -> BTreeMap<String, String> {
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

    /// Writes a case's starting state: a directory, or a file.
    pub fn seed(&self, entries: &Value) {
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

    pub fn launch_ctx(
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

// ---------------------------------------------------------------------------------------------
// The recording log sink
// ---------------------------------------------------------------------------------------------

#[derive(Default)]
pub struct RecordingLogSink {
    pub frames: Mutex<Vec<Value>>,
    pub general: Mutex<Vec<(Level, Prefix, String)>>,
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

// ---------------------------------------------------------------------------------------------
// The scripted spawn seam
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
pub struct ScriptChunk {
    pub stream: String,
    pub text: String,
}

/// One scripted spawn: the chunks it prints, its exit code, or the reason it could not start.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    #[serde(default)]
    pub chunks: Vec<ScriptChunk>,
    #[serde(default, deserialize_with = "present")]
    pub code: Option<Option<i32>>,
    pub throws: Option<String>,
}

pub struct CaseRunner {
    steps: Mutex<Vec<(Step, bool)>>,
    pub specs: Mutex<Vec<ProcSpec>>,
}

impl CaseRunner {
    pub fn new(script: Vec<Step>) -> CaseRunner {
        CaseRunner {
            steps: Mutex::new(script.into_iter().map(|s| (s, false)).collect()),
            specs: Mutex::new(Vec::new()),
        }
    }

    fn take(&self) -> Option<Step> {
        let mut steps = lock(&self.steps);
        for (step, used) in steps.iter_mut() {
            if !*used {
                *used = true;
                return Some(step.clone());
            }
        }
        None
    }

    pub fn unused(&self) -> usize {
        lock(&self.steps).iter().filter(|(_, used)| !used).count()
    }
}

impl SpecRunner for CaseRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.run_streamed(spec, Box::new(|_, _| {}))
    }

    fn run_streamed(&self, spec: ProcSpec, mut on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        lock(&self.specs).push(spec.clone());
        let Some(step) = self.take() else {
            return Box::pin(async move {
                SpecOutput {
                    stderr: format!("unscripted process call: {}", spec.program),
                    ..SpecOutput::default()
                }
            });
        };
        Box::pin(async move {
            if let Some(reason) = &step.throws {
                return SpecOutput {
                    stderr: format!("spawn {}: {reason} (the OS error text)", spec.program),
                    ..SpecOutput::default()
                };
            }
            // The streamed run keeps no capture of its own (`max_buffer` 0); a plain run's output is
            // what the chunks add up to.
            let (mut stdout, mut stderr) = (String::new(), String::new());
            for chunk in &step.chunks {
                let pipe = if chunk.stream == "stdout" {
                    stdout.push_str(&chunk.text);
                    Pipe::Stdout
                } else {
                    stderr.push_str(&chunk.text);
                    Pipe::Stderr
                };
                on_chunk(pipe, &chunk.text);
            }
            tokio::task::yield_now().await;
            SpecOutput {
                code: match step.code {
                    None => Some(0),
                    Some(code) => code,
                },
                stdout,
                stderr,
                ..SpecOutput::default()
            }
        })
    }
}
