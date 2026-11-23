//! The DXVK family against the TS goldens (87-09 recorded them, 87-27 ports them; SC3, D-08, D-17,
//! D-19): every case in `tests/fixtures/golden/dxvk/cases.json` runs `tools::dxvk::install_remove`
//! over a `Replay` of its recorded exchanges (the pin on every request: method, URL and the GameLib
//! `User-Agent`), over a fake HOME laid out like the oracle's and seeded with the case's starting
//! state.
//!
//! What the run returned, the archives it downloaded, the evidence lines it logged, the dialog it
//! showed, the Vulkan-helper and `tar` spawns it made, the wine commands it asked of the wine core
//! (recorded at that seam, as the oracle did, with the `reg import` file's text) and the tree it left
//! (a sha256 per file) must equal the oracle's golden, and the replay must finish clean: no
//! unmatched request, no recorded exchange left over. Where the Rust port deliberately differs, the
//! comparison is the one `golden/dxvk/deltas.json` states.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::dxvk::{DxvkAction, DxvkRequest, DxvkSource, DxvkTool};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress, Replay,
};
use gamelib_engine::testing::{RecordingLog, RecordingUi, UiEvent};
use gamelib_i18n::Catalog;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::{Arch, WineCtx};
use gamelib_wine::tools::dxvk::install_remove;
use gamelib_wine::tools::{ToolsHost, WineCall, WineFuture, WineRunner};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 38;

/// The app version the oracle's recordings were made under (the `User-Agent` they pin).
const RECORDED_APP_VERSION: &str = "0.11.0";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/dxvk")
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

/// The oracle's profile layout (`buildProfile` in the TS harness), rooted in a fake HOME.
struct Profile {
    home: FakeHome,
    app_folder: PathBuf,
    user_data: PathBuf,
    tools: PathBuf,
    tmp: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("dxvk-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let tools = app_folder.join("tools");
        Profile {
            user_data: root
                .join("Library")
                .join("Application Support")
                .join("GameLib"),
            tmp: root.join("tmp"),
            app_folder,
            tools,
            home,
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    /// The placeholder table, most specific root first; a root that has a different real path
    /// (macOS `/var` is `/private/var`) is listed under both names.
    fn placeholders(&self) -> Vec<(&'static str, String)> {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<TOOLS>", as_text(&self.tools)),
            ("<APPFOLDER>", as_text(&self.app_folder)),
            ("<USERDATA>", as_text(&self.user_data)),
            ("<TMP>", as_text(&self.tmp)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    table.push((
                        "<TOOLS>",
                        as_text(&real.join(".config").join("GameLib").join("tools")),
                    ));
                    table.push((
                        "<APPFOLDER>",
                        as_text(&real.join(".config").join("GameLib")),
                    ));
                    table.push(("<TMP>", as_text(&real.join("tmp"))));
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        table
    }

    /// `text` with every profile root replaced by its placeholder.
    fn normalise_text(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in self.placeholders() {
            out = out.replace(root.as_str(), token);
        }
        out
    }

    /// Every profile root in `value`'s strings replaced by its placeholder (object keys are left
    /// alone), with Windows separators folded to `/` so one golden serves every OS.
    fn normalise(&self, value: Value) -> Value {
        match value {
            Value::String(s) => {
                let s = self.normalise_text(&s);
                Value::String(
                    if cfg!(windows)
                        && ["<TOOLS>", "<APPFOLDER>", "<USERDATA>", "<TMP>", "<HOME>"]
                            .iter()
                            .any(|t| s.contains(t))
                    {
                        s.replace('\\', "/")
                    } else {
                        s
                    },
                )
            }
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

    /// A placeholder path (`<TOOLS>/dxvk/x`) as a real path.
    fn expand(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in [
            ("<TOOLS>", &self.tools),
            ("<APPFOLDER>", &self.app_folder),
            ("<USERDATA>", &self.user_data),
            ("<TMP>", &self.tmp),
            ("<HOME>", &self.root().to_path_buf()),
        ] {
            out = out.replace(token, &root.to_string_lossy());
        }
        out
    }

    /// `expand` over every string of a value.
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

    /// Writes a case's starting files: a directory, or a file with its text.
    fn seed(&self, entries: &Value) {
        let Some(entries) = entries.as_array() else {
            return;
        };
        for entry in entries {
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
}

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
        let full = root.join(&rel_path);
        let md = std::fs::symlink_metadata(&full).unwrap();
        let mut entry = serde_json::Map::new();
        entry.insert("path".into(), json!(rel_path));
        if md.file_type().is_symlink() {
            entry.insert("kind".into(), json!("symlink"));
            insert_mode(&mut entry, &md);
            entry.insert(
                "symlink".into(),
                json!(std::fs::read_link(&full)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()),
            );
            out.push((rel_path, Value::Object(entry)));
        } else if md.is_dir() {
            entry.insert("kind".into(), json!("dir"));
            insert_mode(&mut entry, &md);
            out.push((rel_path.clone(), Value::Object(entry)));
            walk_tree(root, &rel_path, out);
        } else {
            entry.insert("kind".into(), json!("file"));
            insert_mode(&mut entry, &md);
            let digest = Sha256::digest(std::fs::read(&full).unwrap());
            entry.insert("sha256".into(), json!(hex(&digest)));
            out.push((rel_path, Value::Object(entry)));
        }
    }
}

fn insert_mode(entry: &mut serde_json::Map<String, Value>, md: &std::fs::Metadata) {
    if let Some(mode) = mode_text(md) {
        entry.insert("mode".into(), json!(mode));
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

/// Wraps a [`Fetch`] and records `<METHOD> <url>` per request, as the oracle's recorder did. A
/// download is the HEAD and the GET the oracle's stand-in made for it, as many of the two as the case
/// recorded for that URL (the replay's finish proves each was really made).
struct Tap {
    inner: Arc<dyn Fetch>,
    recorded: Vec<(String, String)>,
    seen: Mutex<Vec<String>>,
    downloads: Mutex<Vec<String>>,
}

impl Tap {
    fn new(inner: Arc<dyn Fetch>, case_id: &str) -> Tap {
        let exchanges = read_json(
            &fixtures()
                .join("recorded/dxvk")
                .join(case_id)
                .join("exchanges.json"),
        );
        let recorded = exchanges
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                (
                    e["request"]["method"].as_str().unwrap().to_string(),
                    e["request"]["url"].as_str().unwrap().to_string(),
                )
            })
            .collect();
        Tap {
            inner,
            recorded,
            seen: Mutex::new(Vec::new()),
            downloads: Mutex::new(Vec::new()),
        }
    }

    fn urls(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }

    fn downloads(&self) -> Vec<String> {
        self.downloads.lock().unwrap().clone()
    }
}

impl Fetch for Tap {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.seen
            .lock()
            .unwrap()
            .push(format!("{} {}", req.method.as_str(), req.url));
        self.inner.get(req)
    }

    fn download<'a>(
        &'a self,
        req: FetchRequest,
        dest: &'a Path,
        progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        self.downloads.lock().unwrap().push(req.url.clone());
        for method in ["HEAD", "GET"] {
            if self
                .recorded
                .iter()
                .any(|(m, u)| m == method && *u == req.url)
            {
                self.seen
                    .lock()
                    .unwrap()
                    .push(format!("{method} {}", req.url));
            }
        }
        self.inner.download(req, dest, progress, cancel)
    }
}

/// Runs every spawn through the real runner over the fake profile's environment and records it in
/// the oracle's `spawns.json` shape. The Vulkan helper answers what the case scripted for the GPU
/// (the oracle scripted it the same way); `tar` runs for real over the recorded synthetic archive.
struct Tracing {
    inner: SpecProcRunner,
    base_env: Vec<(String, String)>,
    gpu: String,
    nvngx_dir: Option<String>,
    seen: Arc<Mutex<Vec<Value>>>,
}

impl Tracing {
    fn records(&self) -> Vec<Value> {
        self.seen.lock().unwrap().clone()
    }

    /// What the oracle scripted for the Vulkan helper, if `program` is it.
    fn scripted(&self, program: &str, argv: &[String]) -> Option<SpecOutput> {
        if !program.ends_with("vulkan-helper") {
            return None;
        }
        let stdout = match argv.first().map(String::as_str) {
            Some("physical-versions") => match self.gpu.as_str() {
                "none" => "[]".to_string(),
                gpu => format!(
                    "[{{\"name\":\"Oracle GPU\",\"major\":1,\"minor\":{},\"patch\":250}}]",
                    if gpu == "1.3" { 3 } else { 2 }
                ),
            },
            Some("instance-version") => "[1,3,280]".to_string(),
            Some("nvapi-path") => match &self.nvngx_dir {
                Some(dir) => format!("{dir}\n"),
                None => "\n".to_string(),
            },
            _ => return None,
        };
        Some(SpecOutput {
            code: Some(0),
            stdout,
            ..SpecOutput::default()
        })
    }
}

impl SpecRunner for Tracing {
    fn run(&self, mut spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
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
        let unset: Vec<String> = if spec.replace_env {
            base.keys()
                .filter(|k| !spec.env.iter().any(|(sk, _)| sk == *k))
                .map(|k| (*k).to_string())
                .collect()
        } else {
            Vec::new()
        };
        let (program, argv, cwd, stdin) = (
            spec.program.clone(),
            spec.argv.clone(),
            spec.cwd.clone(),
            spec.stdin.clone(),
        );
        let scripted = self.scripted(&program, &argv);
        let mut env = self.base_env.clone();
        env.extend(std::mem::take(&mut spec.env));
        spec.env = env;
        let run = match scripted {
            Some(_) => None,
            None => Some(self.inner.run(spec, on_line)),
        };
        let seen = Arc::clone(&self.seen);
        Box::pin(async move {
            let out = match (run, scripted) {
                (Some(run), _) => run.await,
                (None, Some(out)) => out,
                (None, None) => unreachable!("a spawn is either run or scripted"),
            };
            seen.lock().unwrap().push(json!({
                "program": program,
                "argv": argv,
                "envDiff": { "set": set, "unset": unset },
                "cwd": cwd.map(|p| p.to_string_lossy().into_owned()),
                "stdin": stdin,
                "via": "run",
                "result": { "code": out.code, "stdout": out.stdout, "stderr": out.stderr },
            }));
            out
        })
    }
}

/// The wine core as the oracle stood it in: a scripted runner that records each command at the
/// tool's boundary (the `runWineCommand` call, not the wine spawns under it) and answers the exit
/// codes the case scripted.
struct ScriptedWine {
    profile_root: PathBuf,
    import: i32,
    left: Vec<String>,
    boot: i32,
    restock: Vec<PathBuf>,
    calls: Mutex<Vec<Value>>,
}

impl WineRunner for ScriptedWine {
    fn run<'a>(&'a self, _ctx: &'a WineCtx, call: WineCall) -> WineFuture<'a, Option<i32>> {
        let parts = call.command_parts.clone();
        let mut record = json!({
            "program": "runWineCommand",
            "commandParts": parts,
            "wait": call.wait,
            "resolveOnExit": if call.resolve_on_exit { json!(true) } else { Value::Null },
            "protonVerb": "run",
            "winePrefix": call.settings["winePrefix"],
            "wineVersion": call.settings["wineVersion"]["name"],
        });
        let mut code = 0;
        match (
            parts.first().map(String::as_str),
            parts.get(1).map(String::as_str),
        ) {
            (Some("reg"), Some("import")) => {
                let file = self
                    .profile_root
                    .join("prefix")
                    .join("drive_c")
                    .join("gamelib-dxvk-restore.reg");
                if let Ok(text) = std::fs::read_to_string(file) {
                    record["importedFile"] = json!(text);
                }
                code = self.import;
                for path in &self.restock {
                    std::fs::write(path, "builtin").unwrap();
                }
            }
            (Some("reg"), Some("query")) => {
                let at = parts.iter().position(|p| p == "/v").unwrap() + 1;
                code = i32::from(!self.left.contains(&parts[at]));
            }
            (Some("wineboot"), _) => code = self.boot,
            _ => {}
        }
        self.calls.lock().unwrap().push(record);
        Box::pin(async move { Some(code) })
    }
}

fn platform_of(case: &Value) -> Platform {
    match case["platform"].as_str() {
        Some("linux") => Platform::Linux,
        Some("windows") => Platform::Windows,
        _ => Platform::Mac,
    }
}

fn tool_of(case: &Value) -> DxvkTool {
    match case["tool"].as_str().unwrap() {
        "dxvk" => DxvkTool::Dxvk,
        "dxvk-nvapi" => DxvkTool::DxvkNvapi,
        "vkd3d" => DxvkTool::Vkd3d,
        other => panic!("unknown tool {other}"),
    }
}

fn locales() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

/// The English text of a catalog key: the dialog the run shows resolves through the English catalog,
/// and the golden carries the key (the TS test project stubs i18next to return it).
fn english(key: &str) -> String {
    let text = Catalog::load(&locales(), "en").t(key, "", &serde_json::Map::new());
    assert!(!text.is_empty(), "the English catalog has no {key}");
    text
}

/// The concurrent block of the log: the lines the TS wrote while it ran the tools' installs at
/// once. Their order across tools followed the TS's promise scheduling; each tool's own lines keep
/// their order. The Rust port runs the tools one after the other, so the block is compared grouped
/// by tool in the TS list order (`golden/dxvk/deltas.json`, `concurrent-tools`).
const TOOL_ORDER: [&str; 4] = ["vkd3d", "dxvk", "dxvk-nvapi", "dxvk-macOS"];

fn block_tool(message: &str) -> Option<usize> {
    let name = if let Some(rest) = message.strip_prefix("Updating ") {
        rest.split(" to: ").next()
    } else if let Some(rest) = message.strip_prefix("Downloaded ") {
        rest.strip_suffix(", extracting...")
    } else if let Some(rest) = message.strip_prefix("Error when downloading ") {
        rest.split(' ').next()
    } else {
        message.strip_suffix(" updated!")
    }?;
    TOOL_ORDER.iter().position(|t| *t == name)
}

/// The log lines of a run in the form the two sides are compared in: the level in the Rust
/// spelling, the error text after a path dropped (Node's `ENOENT: ...` against the OS error), and
/// the concurrent block grouped by tool.
fn canonical_logs(lines: Vec<(String, String)>) -> Vec<(String, String)> {
    let trimmed = |message: &str| -> String {
        // The error object follows the subject of these lines; the subject is what the golden pins.
        let keep = if message.starts_with("Error removing ") {
            Some(3)
        } else if message.starts_with("Error when downloading ")
            || message.starts_with("Error when copying ")
        {
            Some(4)
        } else {
            None
        };
        match keep {
            Some(n) => message.split(' ').take(n).collect::<Vec<_>>().join(" "),
            None => message.to_string(),
        }
    };
    let lines: Vec<(String, String)> = lines
        .into_iter()
        .map(|(level, message)| (level, trimmed(&message)))
        .collect();
    let mut out: Vec<(String, String)> = Vec::new();
    let mut block: Vec<(usize, (String, String))> = Vec::new();
    let flush = |block: &mut Vec<(usize, (String, String))>, out: &mut Vec<(String, String)>| {
        block.sort_by_key(|(tool, _)| *tool);
        out.extend(block.drain(..).map(|(_, line)| line));
    };
    for line in lines {
        match block_tool(&line.1) {
            Some(tool) => block.push((tool, line)),
            None => {
                flush(&mut block, &mut out);
                out.push(line);
            }
        }
    }
    flush(&mut block, &mut out);
    out
}

fn golden_level(level: &str) -> String {
    match level {
        "INFO" => "info",
        "WARNING" => "warn",
        "ERROR" => "error",
        other => panic!("unexpected golden log level {other}"),
    }
    .to_string()
}

/// Everything one replayed case runs over.
struct Run {
    profile: Profile,
    replay: Arc<Replay>,
    tap: Arc<Tap>,
    tracer: Arc<Tracing>,
    wine: Arc<ScriptedWine>,
    ui: Arc<RecordingUi>,
    log: Arc<RecordingLog>,
    ctx: WineCtx,
    host: ToolsHost,
}

fn start(case: &Value) -> Run {
    let id = case["id"].as_str().unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/dxvk").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Fetch>, id));
    let ui = Arc::new(RecordingUi::new());
    let log = Arc::new(RecordingLog::new());
    let base_env = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let tracer = Arc::new(Tracing {
        inner: SpecProcRunner,
        base_env,
        gpu: case["gpu"].as_str().unwrap_or("1.3").to_string(),
        nvngx_dir: (case["nvngx"] == true).then(|| {
            profile
                .root()
                .join("nvidia-libs")
                .to_string_lossy()
                .into_owned()
        }),
        seen: Arc::new(Mutex::new(Vec::new())),
    });
    let platform = platform_of(case);
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        EnginePaths {
            app_folder: profile.app_folder.clone(),
            user_data: profile.user_data.clone(),
            tools_path: profile.tools.clone(),
            user_home: profile.root().to_path_buf(),
            temp: profile.tmp.clone(),
        },
        Shutdown::new(),
    )
    .with_app_version(RECORDED_APP_VERSION)
    .with_fetch(Arc::clone(&tap) as Arc<dyn Fetch>)
    .with_proc(Arc::clone(&tracer) as Arc<dyn SpecRunner>)
    .with_ui(Arc::clone(&ui) as Arc<dyn gamelib_engine::sinks::EngineUi>)
    .with_log(Arc::clone(&log) as Arc<dyn gamelib_engine::sinks::EngineLog>)
    .with_i18n(Arc::new(Catalog::load(&locales(), "en")));
    // The oracle pinned `process.arch` to x64: the Vulkan helper's path carries it.
    let ctx = WineCtx::new(Arc::new(engine), profile.tools.join("runtimes")).with_arch(Arch::X64);

    let scripted = &case["wine"];
    let wine = Arc::new(ScriptedWine {
        profile_root: profile.root().to_path_buf(),
        import: scripted["import"].as_i64().unwrap_or(0) as i32,
        left: scripted["left"]
            .as_array()
            .map(|l| l.iter().map(|n| n.as_str().unwrap().to_string()).collect())
            .unwrap_or_default(),
        boot: scripted["boot"].as_i64().unwrap_or(0) as i32,
        restock: scripted["restock"]
            .as_array()
            .map(|l| {
                l.iter()
                    .map(|p| PathBuf::from(profile.expand(p.as_str().unwrap())))
                    .collect()
            })
            .unwrap_or_default(),
        calls: Mutex::new(Vec::new()),
    });
    let host = ToolsHost {
        public_dir: Some(profile.root().join("public")),
        online: case["online"] != false,
        ..ToolsHost::default()
    };
    Run {
        profile,
        replay,
        tap,
        tracer,
        wine,
        ui,
        log,
        ctx,
        host,
    }
}

fn request_of(case: &Value, profile: &Profile) -> DxvkRequest {
    let prefix = profile.expand(case["prefix"].as_str().unwrap_or("<HOME>/prefix"));
    let source = case["source"].as_object().map(|s| DxvkSource {
        dir: profile.expand(s["dir"].as_str().unwrap()),
        version: s["version"].as_str().unwrap().to_string(),
    });
    DxvkRequest {
        settings: json!({
            "winePrefix": prefix,
            "wineVersion": profile.expand_value(&case["wineVersion"]),
        }),
        tool: tool_of(case),
        action: if case["action"] == "backup" {
            DxvkAction::Backup
        } else {
            DxvkAction::Restore
        },
        source,
    }
}

/// Replays one case and compares everything the oracle recorded for it.
async fn replay_case(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let run = start(case);
    let request = request_of(case, &run.profile);
    let outcome = install_remove(&run.ctx, &run.host, run.wine.as_ref(), request).await;
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    let expected = golden_dir().join("expected").join(id);
    let golden = read_json(&expected.join("result.json"));

    // The result: the boolean, or a rejection (the TS error text is Node's, so only the fact of
    // the rejection is pinned).
    match (&golden["outcome"]["returned"], &outcome) {
        (Value::Bool(want), Ok(got)) => assert_eq!(got, want, "{id}: the returned boolean"),
        (Value::Null, Err(_)) => assert!(golden["outcome"]["thrown"].is_string(), "{id}"),
        (want, got) => panic!(
            "{id}: the TS gave {want:?} / {:?}, Rust gave {got:?}",
            golden["outcome"]["thrown"]
        ),
    }

    assert_eq!(
        json!(run.tap.downloads())
            .as_array()
            .unwrap()
            .iter()
            .map(|u| run.profile.normalise(u.clone()))
            .collect::<Vec<_>>(),
        golden["downloads"].as_array().unwrap().clone(),
        "{id}: downloads"
    );

    // The evidence lines. Every golden line carries the ToolInstaller prefix, which the Rust log
    // (a level and a line) does not.
    for line in golden["logs"].as_array().unwrap() {
        assert_eq!(line["prefix"], "ToolInstaller", "{id}: a golden log prefix");
    }
    let want_logs = canonical_logs(
        golden["logs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| {
                (
                    golden_level(l["level"].as_str().unwrap()),
                    l["message"].as_str().unwrap().to_string(),
                )
            })
            .collect(),
    );
    let got_logs = canonical_logs(
        run.log
            .lines()
            .into_iter()
            .map(|(level, line)| (level.to_string(), run.profile.normalise_text(&line)))
            .collect(),
    );
    assert_eq!(got_logs, want_logs, "{id}: log lines");

    // The download-failure dialog: the golden carries the catalog keys.
    let want_dialogs: Vec<Value> = read_json(&expected.join("events.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|e| {
            assert_eq!(e["channel"], "showDialog", "{id}");
            json!({
                "title": english(e["args"][0].as_str().unwrap()),
                "body": english(e["args"][1].as_str().unwrap()),
                "kind": e["args"][2],
            })
        })
        .collect();
    let got_dialogs: Vec<Value> = run
        .ui
        .events()
        .into_iter()
        .map(|e| match e {
            UiEvent::ShowDialog {
                title, body, kind, ..
            } => json!({"title": title, "body": body, "kind": kind}),
            other => panic!("{id}: unexpected UI event {other:?}"),
        })
        .collect();
    assert_eq!(got_dialogs, want_dialogs, "{id}: the dialogs shown");

    // The process trace: the helper and `tar` spawns, then the wine commands, as the oracle listed
    // them (its two lists were concatenated).
    let golden_spawns = read_json(&expected.join("spawns.json"));
    let (golden_wine, golden_procs): (Vec<Value>, Vec<Value>) = golden_spawns
        .as_array()
        .unwrap()
        .iter()
        .cloned()
        .partition(|s| s["program"] == "runWineCommand");
    assert_eq!(
        run.profile.normalise(Value::Array(run.tracer.records())),
        Value::Array(golden_procs),
        "{id}: the helper and tar spawns"
    );
    assert_eq!(
        run.profile
            .normalise(Value::Array(run.wine.calls.lock().unwrap().clone())),
        Value::Array(golden_wine),
        "{id}: the wine commands"
    );

    // The requests, as a sorted set: the TS made the tools' requests at once, so their interleaving
    // was an artifact of the scheduler (`concurrent-tools`); each request was made exactly once.
    let mut got_requests = run.tap.urls();
    let mut want_requests: Vec<String> = read_json(&expected.join("requests.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u.as_str().unwrap().to_string())
        .collect();
    got_requests.sort();
    want_requests.sort();
    assert_eq!(got_requests, want_requests, "{id}: requests");

    assert_eq!(
        run.profile.normalise(run.profile.tree()),
        comparable_tree(read_json(&expected.join("tree.json"))),
        "{id}: the tree the case left"
    );
}

#[test]
fn manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(&cases(), &manifest, FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let err = check_manifest(&[], &manifest, FLOOR, &[]).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

/// The macOS install, first (the tracer): the tools directory already holds the build (no network,
/// the copy, one `reg add` per DLL name and `current_dxvk-macOS`), then the whole chain from a
/// missing build (the pinned-tag lookup, the download, the extraction, the install).
#[tokio::test]
async fn the_macos_dxvk_install_replays_the_golden() {
    let wanted = [
        "mac-dxvk-install-from-tools",
        "mac-dxvk-install-crossover-pinned-tag",
    ];
    let all = cases();
    for id in wanted {
        let case = all
            .iter()
            .find(|c| c["id"] == id)
            .unwrap_or_else(|| panic!("no case {id}"));
        replay_case(case).await;
    }
}

/// Every golden case: remove with and without a backup, nvapi and vkd3d, the Linux prefixes, the
/// pinned tag, the download failures with their dialog, the offline and 32-bit prefixes, the strict
/// restores and the skipped bottles.
#[tokio::test]
async fn every_dxvk_golden_case_replays() {
    let all = cases();
    assert!(all.len() >= FLOOR, "{} cases", all.len());
    for case in &all {
        replay_case(case).await;
    }
}

/// The places the Rust port deliberately differs from the TS golden (D-19), each explained in
/// `golden/dxvk/deltas.json`, which this list must match key for key.
const DELTAS: &[&str] = &[
    "archive-with-no-repack-asset",
    "concurrent-tools",
    "copies-finish-before-the-call-returns",
    "dialog-keys",
    "dll-names-are-sorted",
    "error-text",
    "extract-failure-cleans-up",
    "feed-failure-is-not-fatal-to-the-others",
    "log-lines-carry-the-prefix-path",
    "log-prefix",
    "missing-latest-is-an-error-value",
    "replaced-version-removed",
];

#[test]
fn every_difference_from_the_ts_is_explained() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut keys: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(keys, DELTAS);
    for (key, text) in deltas.as_object().unwrap() {
        assert!(
            text.as_str().is_some_and(|t| t.len() > 40),
            "{key} has no explanation"
        );
    }
}

/// Every case the oracle recorded is one of the three shapes the replay can state a result for.
#[test]
fn every_case_is_an_install_a_remove_or_a_strict_restore() {
    let all = cases();
    let count = |f: &dyn Fn(&Value) -> bool| all.iter().filter(|c| f(c)).count();
    let installs = count(&|c| c["action"] == "backup");
    let removes = count(&|c| c["action"] == "restore" && c["source"].is_null());
    let strict = count(&|c| c["action"] == "restore" && !c["source"].is_null());
    assert_eq!(installs + removes + strict, all.len());
    // The MANIFEST floor of the plan is 10; these are the shapes the plan names.
    assert!(
        installs >= 20 && removes >= 4 && strict >= 5,
        "{installs}/{removes}/{strict}"
    );
}
