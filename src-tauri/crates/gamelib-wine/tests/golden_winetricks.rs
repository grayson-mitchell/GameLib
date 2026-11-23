//! Winetricks against the TS goldens (87-10 recorded them, 87-32 ports them; SC3, D-08, D-10, D-17):
//! every case in `tests/fixtures/golden/winetricks/cases.json` that is not the queue's (87-33) runs the
//! Rust entry point of the TS call it recorded, over a fake HOME laid out like the oracle's, a scripted
//! spawn seam that streams the case's output chunks (and advances a paused clock for its ticks), the
//! oracle's launcher stubs and a `Replay` of its recorded exchanges.
//!
//! What the call returned, the `progressOfWinetricks`, `installing-winetricks-component` and
//! `showDialog` events in order, the requests, the tree it left (a sha256 per file), the environment
//! report, the launcher calls it made and the log lines must equal the oracle's golden, and the replay
//! must finish clean. Where the Rust port deliberately differs, the comparison says so (see
//! [`rust_message`], [`rust_launcher`] and [`comparable_spawns`]):
//!
//! - a log line names the winetricks program by its file name, an I/O failure by a category word, and
//!   wine's debug-channel noise is not logged (the engine log has no debug level);
//! - the TS fired its dependency and wine-version probes beside the run and the spawn trace lists them
//!   in completion order; the Rust joins them, so the spawns are compared as a set;
//! - the launcher stubs are asked only for the platform's own environment (the TS computed both);
//! - the request carries the GameLib `User-Agent`, where the oracle's axios client sent
//!   `HeroicGamesLauncher/<version>`; the replay is given the recorded one.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::{
    BoxFuture, ChunkSink, LineSink, Pipe, ProcSpec, SpecOutput, SpecRunner,
};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress, Replay,
};
use gamelib_engine::sinks::{EngineLog, EngineUi};
use gamelib_engine::testing::RecordingLog;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::{Arch, WineCtx};
use gamelib_wine::wine_cmd::env::{EnvSnapshot, GameSettingsView};
use gamelib_wine::wine_cmd::{WineHost, WineInstallation};
use gamelib_wine::winetricks::catalog_cache_key;
use gamelib_wine::winetricks::classify::LogLine;
use gamelib_wine::winetricks::install::{
    catalog_for, check_dependencies, check_wine_version, download_script, install, list_available,
    list_installed,
};
use gamelib_wine::winetricks::{Launcher, Session, Target, ToolSettings};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 76;

/// The channels the Rust side emits. The queue's own pushes (`winetricksQueueChanged`, the game status
/// updates) are 87-33's.
const CHANNELS: [&str; 3] = [
    "progressOfWinetricks",
    "installing-winetricks-component",
    "showDialog",
];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/winetricks")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// The manifest rules every oracle suite carries: the count equals the cases, it is at or above the
/// floor, and `expected/` holds one folder per case. `Err` names the failure.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    expected: &[String],
) -> Result<(), String> {
    if cases.len() < floor {
        return Err(format!(
            "scanned {}, below the floor of {floor}",
            cases.len()
        ));
    }
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
    let mut have = expected.to_vec();
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

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

fn case_of(id: &str) -> Value {
    cases()
        .into_iter()
        .find(|c| c["id"] == id)
        .unwrap_or_else(|| panic!("no case {id}"))
}

/// The oracle's profile layout (`buildProfile` in the TS harness), rooted in a fake HOME.
struct Profile {
    home: FakeHome,
    tools: PathBuf,
    app_folder: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("winetricks-golden-");
        let app_folder = home.root().join(".config").join("GameLib");
        Profile {
            tools: app_folder.join("tools"),
            app_folder,
            home,
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    /// The placeholder table; a root that has a different real path (macOS `/var` is `/private/var`)
    /// is listed under both names.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<TOOLS>", as_text(&self.tools)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    table.push((
                        "<TOOLS>",
                        as_text(&real.join(".config").join("GameLib").join("tools")),
                    ));
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        table
    }

    fn normalise_text(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in self.placeholders() {
            out = out.replace(root.as_str(), token);
        }
        if cfg!(windows) {
            out = out.replace('\\', "/");
        }
        out
    }

    /// Every profile root in `value`'s strings replaced by its placeholder (object keys are left alone).
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

    /// A placeholder path (`<TOOLS>/winetricks`) as a real path.
    fn expand(&self, text: &str) -> String {
        text.replace("<TOOLS>", &self.tools.to_string_lossy())
            .replace("<HOME>", &self.root().to_string_lossy())
    }

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

    /// Writes one starting entry: a directory, or a file with its text and optional mode.
    fn seed_entry(&self, entry: &Value) {
        let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
        assert!(
            target.starts_with(self.root()),
            "seed {target:?} is outside the profile"
        );
        if entry["dir"].as_bool() == Some(true) {
            std::fs::create_dir_all(&target).unwrap();
            return;
        }
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
        set_mode(&target, entry["mode"].as_str());
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
fn set_mode(path: &Path, mode: Option<&str>) {
    use std::os::unix::fs::PermissionsExt;
    if let Some(mode) = mode {
        let bits = u32::from_str_radix(mode, 8).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(bits)).unwrap();
    }
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: Option<&str>) {}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
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
        let md = std::fs::symlink_metadata(root.join(&rel_path)).unwrap();
        let mut entry = serde_json::Map::new();
        entry.insert("path".into(), json!(rel_path));
        let kind = if md.is_dir() { "dir" } else { "file" };
        entry.insert("kind".into(), json!(kind));
        if let Some(mode) = mode_text(&md) {
            entry.insert("mode".into(), json!(mode));
        }
        if md.is_dir() {
            out.push((rel_path.clone(), Value::Object(entry)));
            walk_tree(root, &rel_path, out);
        } else {
            let digest = Sha256::digest(std::fs::read(root.join(&rel_path)).unwrap());
            entry.insert("sha256".into(), json!(hex(&digest)));
            out.push((rel_path, Value::Object(entry)));
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

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// What the renderer would be sent, in order: the emitter's pushes and the UI's dialogs share one
/// timeline, because the oracle's `showDialog` sits between two `installing-winetricks-component`
/// events.
#[derive(Default)]
struct Events {
    seen: Mutex<Vec<Value>>,
}

impl FrontendEmitter for Events {
    fn emit(&self, channel: &str, args: Vec<Value>) {
        lock(&self.seen).push(json!({ "channel": channel, "args": args }));
    }
}

impl EngineUi for Events {
    fn notify(&self, _title: &str, _body: &str) {}

    fn show_dialog(&self, title: &str, body: &str, kind: &str, ack_id: &str) -> bool {
        // The oracle's i18next stub answers the key, so its event carries `box.error.winetricks.*`;
        // here the catalog is empty and the inline English default comes back. The shape is what is
        // pinned: the two texts, the dialog type and no acknowledgement id.
        assert_eq!(title, "Winetricks error");
        assert!(body.starts_with("Winetricks returned the following error during execution:\n"));
        assert_eq!(ack_id, "");
        lock(&self.seen).push(json!({
            "channel": "showDialog",
            "args": ["box.error.winetricks.title", "box.error.winetricks.message", kind, null, null],
        }));
        true
    }

    fn raise_main_window(&self) {}

    fn send_to_sidecar(&self, _channel: &str, _args: Vec<Value>) {}
}

/// Records `<METHOD> <url>` per request, as the oracle's recorder did, and gives the replay the
/// `User-Agent` the oracle's axios client sent (see the module docs).
struct Tap {
    inner: Arc<Replay>,
    seen: Mutex<Vec<String>>,
}

impl Fetch for Tap {
    fn get(&self, mut req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        lock(&self.seen).push(format!("{} {}", req.method.as_str(), req.url));
        for (name, value) in req.headers.iter_mut() {
            if name.eq_ignore_ascii_case("user-agent") {
                assert!(
                    value.starts_with("GameLib/"),
                    "the request must carry the GameLib User-Agent, got {value}"
                );
                *value = "HeroicGamesLauncher/0.0.0-test".to_string();
            }
        }
        self.inner.get(req)
    }

    fn download<'a>(
        &'a self,
        req: FetchRequest,
        dest: &'a Path,
        progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        self.inner.download(req, dest, progress, cancel)
    }
}

/// One scripted run of a program: what it prints in order, and how it ends.
#[derive(Clone, Default)]
struct Script {
    code: Option<i32>,
    steps: Vec<Value>,
    throws: Option<String>,
    stdout: String,
    timed_out: bool,
    truncated: bool,
}

impl Script {
    fn from_run(run: &Value) -> Script {
        Script {
            code: run["code"].as_i64().map(|c| c as i32),
            steps: run["steps"].as_array().cloned().unwrap_or_default(),
            throws: run["throws"].as_str().map(str::to_string),
            ..Script::default()
        }
    }
}

/// The spawn seam of a case: answers each program from the case's script, streams a winetricks run's
/// chunks (advancing the paused clock for a tick step) and records every spawn in the oracle's
/// `spawns.json` shape.
struct OracleRunner {
    base_env: Vec<(String, String)>,
    /// `which <dependency>`: missing ones exit 1, or every probe fails to start.
    missing: Vec<String>,
    which_throws: bool,
    /// The wine binary winetricks runs with and what `--version` answers.
    wine_bin: String,
    version: Script,
    /// The winetricks program and the runs it answers, keyed by argv (the last repeating).
    winetricks_program: String,
    runs: Mutex<Vec<(Vec<String>, Script, bool)>>,
    spawns: Mutex<Vec<Value>>,
}

impl OracleRunner {
    fn record(&self, spec: &ProcSpec, result: Value) {
        let base: BTreeMap<&str, &str> = self
            .base_env
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        let set: BTreeMap<String, String> = spec
            .env
            .iter()
            .filter(|(k, v)| base.get(k.as_str()) != Some(&v.as_str()))
            .cloned()
            .collect();
        let mut unset: Vec<String> = if spec.replace_env {
            base.keys()
                .filter(|k| !spec.env.iter().any(|(sk, _)| sk == *k))
                .map(|k| (*k).to_string())
                .collect()
        } else {
            Vec::new()
        };
        unset.sort();
        lock(&self.spawns).push(json!({
            "program": spec.program,
            "argv": spec.argv,
            "envDiff": { "set": set, "unset": unset },
            "cwd": spec.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
            "stdin": spec.stdin,
            "via": "run",
            "result": result,
        }));
    }

    /// The answer of a probe (`which`, `wine --version`) as a spawn result.
    fn probe(&self, spec: &ProcSpec) -> (SpecOutput, Value) {
        let throws = |message: &str| {
            (
                SpecOutput {
                    code: None,
                    stderr: format!("spawn {}: {message}", spec.program),
                    ..SpecOutput::default()
                },
                json!({ "code": null, "stdout": "", "stderr": "", "error": message }),
            )
        };
        if spec.program == "which" {
            if self.which_throws {
                return throws("spawn which ENOENT");
            }
            let dependency = spec.argv.first().cloned().unwrap_or_default();
            let code = if self.missing.contains(&dependency) {
                1
            } else {
                0
            };
            return (
                SpecOutput {
                    code: Some(code),
                    ..SpecOutput::default()
                },
                json!({ "code": code, "stdout": "", "stderr": "" }),
            );
        }
        assert_eq!(spec.program, self.wine_bin, "an unscripted probe");
        assert_eq!(spec.argv, ["--version"]);
        if let Some(message) = &self.version.throws {
            return throws(message);
        }
        let v = &self.version;
        let mut result = json!({ "code": v.code, "stdout": v.stdout, "stderr": "" });
        if v.timed_out {
            result["timedOut"] = json!(true);
        }
        if v.truncated {
            result["truncated"] = json!(true);
        }
        (
            SpecOutput {
                code: v.code,
                stdout: v.stdout.clone(),
                timed_out: v.timed_out,
                truncated: v.truncated,
                ..SpecOutput::default()
            },
            result,
        )
    }

    fn next_run(&self, argv: &[String]) -> Script {
        let mut runs = lock(&self.runs);
        let at = runs
            .iter()
            .position(|(a, _, _)| a == argv)
            .unwrap_or_else(|| panic!("an unscripted winetricks run: {argv:?}"));
        let (_, script, repeat) = &runs[at];
        let script = script.clone();
        if !*repeat {
            runs.remove(at);
        }
        script
    }
}

impl SpecRunner for OracleRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let (output, result) = self.probe(&spec);
        self.record(&spec, result);
        Box::pin(async move { output })
    }

    fn run_streamed(&self, spec: ProcSpec, mut on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        assert_eq!(spec.program, self.winetricks_program);
        let script = self.next_run(&spec.argv);
        let (mut out, mut err) = (String::new(), String::new());
        for step in &script.steps {
            if let Some(text) = step["out"].as_str() {
                out.push_str(text);
            } else if let Some(text) = step["err"].as_str() {
                err.push_str(text);
            }
        }
        let record = match &script.throws {
            Some(message) => json!({ "code": null, "stdout": "", "stderr": "", "error": message }),
            None => json!({ "code": script.code, "stdout": out, "stderr": err }),
        };
        self.record(&spec, record);
        let program = spec.program.clone();
        Box::pin(async move {
            // A real install runs for minutes: the probes beside it have long settled before its
            // first byte.
            for _ in 0..8 {
                tokio::task::yield_now().await;
            }
            if let Some(message) = script.throws {
                return SpecOutput {
                    code: None,
                    stderr: format!("spawn {program}: {message}"),
                    ..SpecOutput::default()
                };
            }
            for step in &script.steps {
                if let Some(text) = step["out"].as_str() {
                    on_chunk(Pipe::Stdout, text);
                } else if let Some(text) = step["err"].as_str() {
                    on_chunk(Pipe::Stderr, text);
                } else if step["tick"] == true {
                    // On the paused clock the runtime jumps to the next timer when it is idle: the
                    // run's own one-second flush interval fires first (its branch is polled before
                    // the child's), then this wakes.
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
            SpecOutput {
                code: script.code,
                stdout: out,
                stderr: err,
                ..SpecOutput::default()
            }
        })
    }
}

/// The oracle's launcher stubs: they answer fixed variables and record what they were asked.
struct OracleLauncher {
    valid: bool,
    calls: Mutex<Vec<Value>>,
}

fn wine_of(settings: &GameSettingsView) -> Value {
    json!({
        "type": serde_json::to_value(settings.wine_version.kind).unwrap(),
        "bin": settings.wine_version.bin,
    })
}

impl Launcher for OracleLauncher {
    fn valid_wine(&self, _ctx: &WineCtx, wine: &WineInstallation) -> bool {
        lock(&self.calls).push(json!({ "fn": "validWine", "name": wine.name }));
        self.valid
    }

    fn setup_env_vars(
        &self,
        _ctx: &WineCtx,
        settings: &GameSettingsView,
    ) -> BTreeMap<String, String> {
        lock(&self.calls).push(json!({ "fn": "setupEnvVars", "wineVersion": wine_of(settings) }));
        BTreeMap::from([("ORACLE_SETUP_ENV".to_string(), "1".to_string())])
    }

    fn setup_wine_env_vars(
        &self,
        _ctx: &WineCtx,
        settings: &GameSettingsView,
        app_name: &str,
    ) -> BTreeMap<String, String> {
        lock(&self.calls).push(json!({
            "fn": "setupWineEnvVars",
            "wineVersion": wine_of(settings),
            "appName": app_name,
        }));
        BTreeMap::from([("ORACLE_WINE_ENV".to_string(), app_name.to_string())])
    }
}

/// The launcher calls the oracle logged, reduced to what the Rust asks: every run the TS made asked
/// `validWine` and then built both platforms' environments eagerly (five calls); the Rust builds only
/// the platform's own (three). Each run's calls start at a `validWine`.
fn rust_launcher(expected: &Value, platform: &str) -> Value {
    let calls = expected.as_array().unwrap();
    let starts: Vec<usize> = (0..calls.len())
        .filter(|&i| calls[i]["fn"] == "validWine")
        .collect();
    let mut out = Vec::new();
    for (n, &start) in starts.iter().enumerate() {
        let end = starts.get(n + 1).copied().unwrap_or(calls.len());
        let group = &calls[start..end];
        out.push(group[0].clone());
        if group.len() == 5 {
            let range = if platform == "mac" { 3..5 } else { 1..3 };
            out.extend(group[range].iter().cloned());
        } else {
            out.extend(group[1..].iter().cloned());
        }
    }
    Value::Array(out)
}

/// A TS log message as the Rust port words it (see the module docs).
fn rust_message(message: &str) -> String {
    if let Some(rest) = message.strip_prefix("Running ") {
        let (program, args) = rest.split_once(' ').unwrap_or((rest, ""));
        let name = program.rsplit('/').next().unwrap_or(program);
        return format!("Running {name} {args}");
    }
    if message.starts_with("Error Downloading Winetricks Error: ENOENT") {
        return "Error Downloading Winetricks: not-found".to_string();
    }
    if message.starts_with("Winetricks threw Error:") {
        return "Winetricks threw an error: could not spawn".to_string();
    }
    if message.starts_with("Could not read the winetricks script for its metadata: Error: ENOENT") {
        return "Could not read the winetricks script for its metadata: not-found".to_string();
    }
    let banner = "Could not read the wine version for the winetricks environment banner: Error: ";
    if let Some(reason) = message.strip_prefix(banner) {
        let reason = if reason.starts_with("spawn ") {
            "wine --version did not run"
        } else {
            reason
        };
        return format!(
            "Could not read the wine version for the winetricks environment banner: {reason}"
        );
    }
    message.to_string()
}

/// The oracle's logs as the Rust sink records them: debug lines dropped, the levels as words.
fn rust_logs(expected: &Value) -> Vec<(String, String)> {
    expected
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["level"] != "DEBUG")
        .map(|l| {
            let level = match l["level"].as_str().unwrap() {
                "INFO" => "info",
                "WARNING" => "warn",
                "ERROR" => "error",
                other => panic!("level {other}"),
            };
            (
                level.to_string(),
                rust_message(l["message"].as_str().unwrap()),
            )
        })
        .collect()
}

/// A spawn trace as a sorted list (see the module docs).
fn comparable_spawns(spawns: &Value) -> Vec<String> {
    let mut out: Vec<String> = spawns
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            let mut s = s.clone();
            // The order of the unset names is the base environment's, not a behaviour; and the oracle's
            // tracer never reports `PATH` or `LANG` as unset (the two keys the case adds to the fake
            // profile's own environment), so neither side is compared on them.
            if let Some(unset) = s["envDiff"]["unset"].as_array().cloned() {
                let mut names: Vec<String> = unset
                    .iter()
                    .map(|n| n.as_str().unwrap().to_string())
                    .filter(|n| n != "PATH" && n != "LANG")
                    .collect();
                names.sort();
                s["envDiff"]["unset"] = json!(names);
            }
            s.to_string()
        })
        .collect();
    out.sort();
    out
}

/// The script every case starts with: the synthetic one the oracle served (T-87-61).
fn synthetic_script() -> String {
    std::fs::read_to_string(fixtures().join("recorded/winetricks/download-online-fresh/body-1.txt"))
        .unwrap()
}

fn kind_platform(name: &str) -> Platform {
    match name {
        "mac" => Platform::Mac,
        "linux" => Platform::Linux,
        "windows" => Platform::Windows,
        other => panic!("platform {other}"),
    }
}

/// Everything one replayed case runs over.
struct Run {
    profile: Profile,
    replay: Arc<Replay>,
    tap: Arc<Tap>,
    runner: Arc<OracleRunner>,
    events: Arc<Events>,
    log: Arc<RecordingLog>,
    launcher: OracleLauncher,
    host: WineHost,
    ctx: Arc<WineCtx>,
    /// The game the case is for.
    runner_name: String,
    app_name: String,
    settings: Value,
    wine_bin: String,
}

const DEFAULT_WINE: &str =
    r#"{"type":"wine","name":"Wine-9","bin":"<TOOLS>/wine/Wine-9/bin/wine"}"#;

fn start(case: &Value) -> Run {
    let id = case["id"].as_str().unwrap();
    let platform = case["platform"].as_str().unwrap();
    let profile = Profile::new();

    // The script on disk, as the case says (a download case states it itself).
    if case["noToolsDir"] != true {
        std::fs::create_dir_all(&profile.tools).unwrap();
    }
    let script = case["script"].as_str().unwrap_or("present");
    if script != "absent" {
        let path = profile.tools.join("winetricks");
        std::fs::write(&path, synthetic_script()).unwrap();
        set_mode(&path, Some("0755"));
    }
    for entry in case["seed"].as_array().into_iter().flatten() {
        profile.seed_entry(entry);
    }
    if script == "stale" {
        // Older than the 7 days the download cache honours.
        let eight_days_ago = std::time::SystemTime::now() - Duration::from_secs(8 * 24 * 3600);
        std::fs::File::options()
            .write(true)
            .open(profile.tools.join("winetricks"))
            .unwrap()
            .set_modified(eight_days_ago)
            .unwrap();
    }

    let runner_name = case["runner"].as_str().unwrap_or("gog").to_string();
    let app_name = case["appName"].as_str().unwrap_or("game").to_string();
    let wine: Value = profile.expand_value(
        case.get("wineVersion")
            .unwrap_or(&serde_json::from_str(DEFAULT_WINE).unwrap()),
    );
    let prefix = profile.expand(case["winePrefix"].as_str().unwrap_or("<HOME>/prefix"));
    let mut settings = json!({ "winePrefix": prefix, "wineVersion": wine });
    if case["disableUMU"] == true {
        settings["disableUMU"] = json!(true);
    }

    // The fake profile's own env is the process env of the case: it is the base of every spawn, so
    // the recorded env diff is what the tool built.
    let mut base_env: Vec<(String, String)> = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    base_env.push(("PATH".into(), "/oracle/bin".into()));
    base_env.push(("LANG".into(), "en_US.UTF-8".into()));

    let umu = case["umu"] == true;
    let program = if umu {
        profile.tools.join("runtimes/umu/umu_run.py")
    } else {
        profile.tools.join("winetricks")
    };
    let always_wine_bin = {
        let bin = wine["bin"].as_str().unwrap();
        if wine["type"] == "proton" && !umu {
            Path::new(bin)
                .parent()
                .unwrap()
                .join("files/bin/wine")
                .to_string_lossy()
                .into_owned()
        } else {
            bin.to_string()
        }
    };
    let argv = |verb: &str| -> Vec<String> {
        if umu {
            vec!["winetricks".to_string(), verb.to_string()]
        } else {
            vec!["-q".to_string(), verb.to_string()]
        }
    };
    let mut runs: Vec<(Vec<String>, Script, bool)> = Vec::new();
    if case.get("run").is_some() {
        let verb = case["verb"].as_str().unwrap_or("vcrun2019");
        runs.push((argv(verb), Script::from_run(&case["run"]), false));
    }
    if let Some(list) = case.get("list") {
        let list_argv = if umu {
            vec!["winetricks".to_string(), "list-all".to_string()]
        } else {
            vec!["list-all".to_string()]
        };
        runs.push((list_argv, Script::from_run(list), true));
    }
    let probe = &case["versionProbe"];
    let version = Script {
        code: if probe.get("code").is_some() {
            probe["code"].as_i64().map(|c| c as i32)
        } else {
            Some(0)
        },
        throws: probe["throws"].as_str().map(str::to_string),
        stdout: probe["stdout"].as_str().unwrap_or("wine-9.0\n").to_string(),
        timed_out: probe["timedOut"] == true,
        truncated: probe["truncated"] == true,
        steps: Vec::new(),
    };
    let runner = Arc::new(OracleRunner {
        base_env: base_env.clone(),
        missing: case["missing"]
            .as_array()
            .map(|m| m.iter().map(|d| d.as_str().unwrap().to_string()).collect())
            .unwrap_or_default(),
        which_throws: case["whichThrows"] == true,
        wine_bin: always_wine_bin.clone(),
        version,
        winetricks_program: program.to_string_lossy().into_owned(),
        runs: Mutex::new(runs),
        spawns: Mutex::new(Vec::new()),
    });

    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/winetricks").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap {
        inner: Arc::clone(&replay),
        seen: Mutex::new(Vec::new()),
    });
    let events = Arc::new(Events::default());
    let log = Arc::new(RecordingLog::new());
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        kind_platform(platform),
        EnginePaths {
            app_folder: profile.app_folder.clone(),
            user_data: profile.root().join("userdata"),
            tools_path: profile.tools.clone(),
            user_home: profile.root().to_path_buf(),
            temp: profile.root().join("tmp"),
        },
        Shutdown::new(),
    )
    .with_app_version("0.11.0")
    .with_fetch(Arc::clone(&tap) as Arc<dyn Fetch>)
    .with_proc(Arc::clone(&runner) as Arc<dyn SpecRunner>)
    .with_emitter(Arc::clone(&events) as Arc<dyn FrontendEmitter>)
    .with_ui(Arc::clone(&events) as Arc<dyn EngineUi>)
    .with_log(Arc::clone(&log) as Arc<dyn EngineLog>)
    .with_online(case["online"] != false);
    let ctx = Arc::new(
        WineCtx::new(Arc::new(engine), profile.tools.join("runtimes")).with_arch(Arch::X64),
    );

    // The report the game already has when the case starts.
    let preset = &case["preset"];
    if let Some(missing) = preset["missingDependencies"].as_array() {
        let missing: Vec<String> = missing
            .iter()
            .map(|d| d.as_str().unwrap().to_string())
            .collect();
        ctx.tools
            .winetricks_env
            .record_missing_dependencies(&runner_name, &app_name, &missing);
    }
    if preset.get("unsupportedWineVersion").is_some() {
        ctx.tools.winetricks_env.record_unsupported_wine(
            &runner_name,
            &app_name,
            preset["unsupportedWineVersion"].as_str(),
        );
    }
    if let Some(installing) = case["installing"].as_str() {
        std::mem::forget(ctx.tools.begin_install(installing).unwrap());
    }

    let host = WineHost {
        env: EnvSnapshot::from_pairs(base_env),
        ..WineHost::default()
    };
    Run {
        launcher: OracleLauncher {
            valid: case["validWine"] != false,
            calls: Mutex::new(Vec::new()),
        },
        profile,
        replay,
        tap,
        runner,
        events,
        log,
        host,
        ctx,
        runner_name,
        app_name,
        settings,
        wine_bin: always_wine_bin,
    }
}

impl Run {
    fn session(&self) -> Session<'_> {
        Session {
            ctx: &self.ctx,
            host: &self.host,
            launcher: &self.launcher,
        }
    }

    /// The tool settings the TS resolver would have handed over: a Steam title with no per-game
    /// bottle and no explicit settings has none.
    fn tool_settings(&self, case: &Value) -> ToolSettings {
        if self.runner_name == "steam" && case["explicitSettings"] != true {
            return ToolSettings::Unavailable("not-own-bottle".to_string());
        }
        let settings: GameSettingsView = serde_json::from_value(self.settings.clone()).unwrap();
        ToolSettings::Resolved(Box::new(settings))
    }

    /// `{ WINEPREFIX: winePrefix }`, the environment the probe ops are called with.
    fn prefix_env(&self) -> BTreeMap<String, String> {
        BTreeMap::from([(
            "WINEPREFIX".to_string(),
            self.settings["winePrefix"].as_str().unwrap().to_string(),
        )])
    }

    fn target(&self, case: &Value) -> Target<'_> {
        Target {
            runner: &self.runner_name,
            app_name: &self.app_name,
            settings: self.tool_settings(case),
        }
    }
}

/// The result object the oracle wrote, for the ops this file replays.
async fn run_op(run: &Run, case: &Value) -> Value {
    let session = run.session();
    match case["op"].as_str().unwrap() {
        "download" => {
            download_script(&session).await;
            json!({ "returned": null })
        }
        "install" => {
            let verb = case["verb"].as_str().unwrap_or("vcrun2019");
            let target = run.target(case);
            let mut lines: Vec<LogLine> = Vec::new();
            let mut sink = |line: &LogLine| lines.push(line.clone());
            let outcome = install(&session, &target, verb, Some(&mut sink)).await;
            json!({ "verb": verb, "outcome": outcome.as_str(), "onLines": lines })
        }
        "list-available" => {
            let target = run.target(case);
            let components = list_available(&session, &target).await;
            let cache = run
                .ctx
                .tools
                .catalog(&catalog_cache_key(&run.runner_name, &run.app_name));
            json!({ "components": components, "catalogCache": cache })
        }
        "catalog-for" => {
            let target = run.target(case);
            let verbs =
                |list: Vec<gamelib_wine::winetricks::list_parse::Component>| -> Vec<String> {
                    list.into_iter().map(|c| c.verb).collect()
                };
            let first = verbs(catalog_for(&session, &target).await);
            let second = verbs(catalog_for(&session, &target).await);
            json!({ "first": first, "second": second })
        }
        "list-installed" => {
            let target = run.target(case);
            json!({ "lines": list_installed(&session, &target) })
        }
        "check-wine-version" => {
            check_wine_version(
                &session,
                &run.runner_name,
                &run.app_name,
                &run.wine_bin,
                &run.prefix_env(),
            )
            .await;
            json!({})
        }
        "check-dependencies" => {
            let mut messages: Vec<String> = Vec::new();
            let mut append = |message: String| messages.push(message);
            check_dependencies(
                &session,
                &run.runner_name,
                &run.app_name,
                &run.prefix_env(),
                &mut append,
            )
            .await;
            json!({ "messages": messages })
        }
        other => panic!("op {other} is not replayed here"),
    }
}

/// Replays one case and compares everything the oracle recorded for it.
async fn replay_case(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let expected_dir = golden_dir().join("expected").join(id);
    let run = start(case);
    let mut result = run_op(&run, case).await;
    run.replay
        .finish()
        .unwrap_or_else(|e| panic!("{id}: replay: {e}"));

    let want = read_json(&expected_dir.join("result.json"));
    let ctx = &run.ctx;
    let object = result.as_object_mut().unwrap();
    object.insert("op".into(), case["op"].clone());
    object.insert("platform".into(), case["platform"].clone());
    object.insert("installing".into(), json!(ctx.tools.installing()));
    object.insert(
        "environment".into(),
        serde_json::to_value(
            ctx.tools
                .winetricks_env
                .report(&run.runner_name, &run.app_name),
        )
        .unwrap(),
    );
    let got = run.profile.normalise(result);
    let mut want_core = want.clone();
    for key in ["logs", "launcher"] {
        want_core.as_object_mut().unwrap().remove(key);
    }
    let mut got_core = got.clone();
    got_core.as_object_mut().unwrap().remove("logs");
    assert_eq!(got_core, want_core, "{id}: result");

    let platform = case["platform"].as_str().unwrap();
    let launcher = run
        .profile
        .normalise(Value::Array(lock(&run.launcher.calls).clone()));
    assert_eq!(
        launcher,
        rust_launcher(&want["launcher"], platform),
        "{id}: launcher"
    );

    let want_logs: Vec<(String, String)> = rust_logs(&run.profile.normalise(want["logs"].clone()))
        .into_iter()
        .collect();
    let got_logs: Vec<(String, String)> = run
        .log
        .lines()
        .into_iter()
        .map(|(level, text)| (level.to_string(), run.profile.normalise_text(&text)))
        .collect();
    assert_eq!(got_logs, want_logs, "{id}: logs");

    let want_events: Vec<Value> = read_json(&expected_dir.join("events.json"))
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| CHANNELS.contains(&e["channel"].as_str().unwrap()))
        .cloned()
        .collect();
    let got_events = run
        .profile
        .normalise(Value::Array(lock(&run.events.seen).clone()));
    assert_eq!(got_events, Value::Array(want_events), "{id}: events");

    let got_spawns = run
        .profile
        .normalise(Value::Array(lock(&run.runner.spawns).clone()));
    let want_spawns = read_json(&expected_dir.join("spawns.json"));
    assert_eq!(
        comparable_spawns(&got_spawns),
        comparable_spawns(&want_spawns),
        "{id}: spawns"
    );

    let requests: Vec<String> = lock(&run.tap.seen).clone();
    assert_eq!(
        json!(requests),
        read_json(&expected_dir.join("requests.json")),
        "{id}: requests"
    );

    assert_eq!(
        comparable_tree(run.profile.tree()),
        comparable_tree(read_json(&expected_dir.join("tree.json"))),
        "{id}: tree"
    );
    let _ = &run.wine_bin;
}

#[test]
fn the_committed_manifest_agrees_with_the_case_list() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(&cases(), &manifest, FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_check() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let err = check_manifest(&[], &manifest, FLOOR, &[]).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

/// The tracer: one verb installed end to end (script present, the five `which` probes, winetricks with
/// its streamed stdout and stderr classified, a one-second tick flush, exit 0) and every golden of it
/// matched.
#[tokio::test(start_paused = true)]
async fn the_single_verb_install_replays() {
    replay_case(&case_of("install-single-verb-linux")).await;
}

/// Every case of the oracle but the queue's (87-33): the install lifecycle (the refusal, the missing
/// dependencies, the unsupported wine, a failing verb, a signal, a spawn error, umu and Proton), the
/// script download (fresh, cached, stale, offline, a failing server, no tools directory), the catalog
/// reads (list, annotate from the script, cache, installed log) and the two environment probes.
#[tokio::test(start_paused = true)]
async fn every_case_but_the_queues_replays() {
    let mut by_op: BTreeMap<String, usize> = BTreeMap::new();
    for case in cases() {
        let op = case["op"].as_str().unwrap().to_string();
        if op == "queue" {
            continue;
        }
        replay_case(&case).await;
        *by_op.entry(op).or_default() += 1;
    }
    // Each op the plan names has its cases, and a quiet loop is not a pass.
    for op in [
        "download",
        "install",
        "list-available",
        "catalog-for",
        "list-installed",
        "check-wine-version",
        "check-dependencies",
    ] {
        assert!(by_op.get(op).copied().unwrap_or(0) >= 2, "{op}: {by_op:?}");
    }
    assert!(by_op.values().sum::<usize>() >= 55, "{by_op:?}");
}
