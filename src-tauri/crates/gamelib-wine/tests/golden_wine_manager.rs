//! The wine manager against the TS goldens (87-07 recorded them, 87-19 ports them; SC3, D-08, D-10,
//! D-19): every case in `tests/fixtures/golden/wine_manager/cases.json` runs over a `Replay` of its
//! recorded exchanges (the pin on every request: method, URL and the GameLib `User-Agent`), over a fake
//! HOME laid out like the oracle's, seeded with the case's starting state, and a store the StoreHost
//! owns.
//!
//! What the run returned, the requests made, the events pushed (`wineVersionsUpdated` and
//! `progressOfWineManager`, a run of the same progress status counting once, D-10), the notifications
//! shown, the spawns made and the tree it left (a sha256 per file, the store file's over its
//! path-normalised text) must equal the oracle's golden, and the replay must finish clean: no
//! unmatched request, no recorded exchange left over.
//!
//! POSIX only: the store file's text and the tree hashes carry the fake HOME's path, and a Windows
//! HOME (`C:\Users\RUNNER~1\...`) is JSON-escaped inside that text, so the path-normalised bytes
//! the golden pins cannot be reproduced there. The wine manager's own unit tests run on every OS.
#![cfg(unix)]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Method, Progress,
    Replay,
};
use gamelib_engine::testing::{RecordingEmitter, RecordingUi, UiEvent};
use gamelib_i18n::Catalog;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_store::json::{self, Json, Obj};
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::{Arch, WineCtx};
use gamelib_wine::manager::releases::{self, Repository};
use gamelib_wine::manager::store;
use gamelib_wine::tools::macho::{MachoScan, WinemacMetalCheck};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 21;

/// The app version the oracle's recordings were made under (the `User-Agent` they pin).
const RECORDED_APP_VERSION: &str = "0.11.0";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/wine_manager")
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

/// The cases parsed with their key order kept: a stored list is seeded from this, because the store's
/// bytes (and so the golden's hash of them) depend on the order of each entry's keys.
fn ordered_cases() -> Vec<Json> {
    let bytes = std::fs::read(golden_dir().join("cases.json")).unwrap();
    match json::parse(&bytes).unwrap() {
        Json::Arr(items) => items,
        _ => panic!("cases.json must be a list"),
    }
}

fn ordered_case(id: &str) -> Json {
    ordered_cases()
        .into_iter()
        .find(|c| c.get("id").and_then(Json::as_str) == Some(id))
        .unwrap_or_else(|| panic!("no case {id}"))
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
        let home = FakeHome::new("wine-manager-");
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
                    table.push((
                        "<USERDATA>",
                        as_text(
                            &real
                                .join("Library")
                                .join("Application Support")
                                .join("GameLib"),
                        ),
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

    /// A placeholder path (`<TOOLS>/proton/x`) as a real path.
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

    /// `expand` over every string of an ordered document, keeping each object's key order.
    fn expand_json(&self, value: &Json) -> Json {
        match value {
            Json::Str(s) => Json::Str(self.expand(s)),
            Json::Arr(items) => Json::Arr(items.iter().map(|v| self.expand_json(v)).collect()),
            Json::Obj(obj) => {
                let mut out = Obj::new();
                for (k, v) in obj.iter() {
                    out.insert_js(k.clone(), self.expand_json(v));
                }
                Json::Obj(out)
            }
            other => other.clone(),
        }
    }

    /// Writes a case's starting files. Only the forms the wine-manager cases use are supported; an
    /// unknown one fails the test rather than being skipped.
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

    /// The tree under HOME, as the oracle's `snapshotTree` writes it, with the store file's hash taken
    /// over its path-normalised text (it holds absolute install directories).
    fn tree(&self) -> Value {
        let mut out: Vec<(String, Value)> = Vec::new();
        walk_tree(self.root(), "", &mut out);
        out.sort_by(|a, b| a.0.cmp(&b.0));
        let mut entries: Vec<Value> = out.into_iter().map(|(_, v)| v).collect();
        for entry in &mut entries {
            let path = entry["path"].as_str().unwrap().to_string();
            if path.ends_with("store/wine-downloader-info.json") {
                let text = std::fs::read_to_string(self.root().join(&path)).unwrap();
                entry["sha256"] = json!(hex(&Sha256::digest(self.normalise_text(&text))));
            }
        }
        Value::Array(entries)
    }

    /// The store's parsed content, `null` when there is no file.
    fn store_file(&self) -> Value {
        let file = self.user_data.join("store/wine-downloader-info.json");
        match std::fs::read(&file) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap(),
            Err(_) => Value::Null,
        }
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
                .join("recorded/wine_manager")
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

fn platform_of(case: &Value) -> Platform {
    match case["platform"].as_str() {
        Some("linux") => Platform::Linux,
        Some("windows") => Platform::Windows,
        _ => Platform::Mac,
    }
}

fn engine(profile: &Profile, platform: Platform) -> EngineCtx {
    EngineCtx::new(
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
}

/// What the oracle did with `tar` in a case: ran it for real, scripted a non-zero exit (recorded), or
/// had the spawn itself reject (so it never reached the trace).
#[derive(Clone, Copy, PartialEq, Eq)]
enum TarMode {
    Real,
    NonZero,
    Throws,
}

/// Runs every spawn through the real runner over the fake profile's environment (the oracle's
/// `createFakeHomeProfile().childEnv()`) and records it in the oracle's `spawns.json` shape. `du`
/// measures the machine's block size, so its answer is scripted exactly as the oracle scripted it.
struct Tracing {
    inner: SpecProcRunner,
    base_env: Vec<(String, String)>,
    tar: TarMode,
    seen: Arc<Mutex<Vec<Value>>>,
}

impl Tracing {
    fn new(base_env: Vec<(String, String)>, tar: TarMode) -> Tracing {
        Tracing {
            inner: SpecProcRunner,
            base_env,
            tar,
            seen: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn records(&self) -> Vec<Value> {
        self.seen.lock().unwrap().clone()
    }

    /// What the oracle scripted for `program`, if it did.
    fn scripted(&self, program: &str) -> Option<SpecOutput> {
        match (program, self.tar) {
            ("du", _) => Some(SpecOutput {
                code: Some(0),
                stdout: "4096\n".to_string(),
                ..SpecOutput::default()
            }),
            ("tar", TarMode::NonZero) => Some(SpecOutput {
                code: Some(2),
                stderr: "tar: Error is not recoverable: exiting now".to_string(),
                ..SpecOutput::default()
            }),
            _ => None,
        }
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
        let scripted = self.scripted(&program);
        // A spawn that rejects never reached the oracle's trace; here it is a program that could not
        // be started (no exit code).
        if program == "tar" && self.tar == TarMode::Throws {
            return Box::pin(async {
                SpecOutput {
                    code: None,
                    stderr: "spawn tar ENOENT".to_string(),
                    ..SpecOutput::default()
                }
            });
        }
        // The child runs with the fake profile's variables under whatever the op set.
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

/// The oracle's abort stand-in at the download seam: it made the HEAD, set the abort signal and
/// stopped. Here that is the recorded HEAD, then `aborted` (the replay's own download would go on to a
/// GET the case never recorded).
struct StopAfterHead {
    inner: Arc<dyn Fetch>,
}

impl Fetch for StopAfterHead {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.inner.get(req)
    }

    fn download<'a>(
        &'a self,
        req: FetchRequest,
        _dest: &'a Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        _cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(async move {
            let head = FetchRequest {
                method: Method::Head,
                ..req
            };
            self.inner.get(head).await?;
            Err(FetchError::Aborted)
        })
    }
}

/// The DXMT export gate's scan (87-31): fails every bundle it is asked about, so the DXMT hooks a wine
/// install runs stop at the gate with nothing fetched and nothing copied (the oracle recorded the install
/// with no DXMT listener), and remembers the bundles it was asked about, which is how the test sees that the
/// hook ran.
#[derive(Default)]
struct AskedScan {
    asked: Mutex<Vec<PathBuf>>,
}

impl AskedScan {
    fn asked(&self) -> Vec<PathBuf> {
        self.asked.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

impl MachoScan for AskedScan {
    fn winemac_metal_exports(&self, wine_bundle: &Path) -> Result<WinemacMetalCheck, String> {
        self.asked
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(wine_bundle.to_path_buf());
        Ok(WinemacMetalCheck::Fail {
            winemac_path: String::new(),
            reason: "scripted".to_string(),
            missing: Vec::new(),
        })
    }
}

/// Everything one replayed case runs over.
struct Run {
    profile: Profile,
    replay: Arc<Replay>,
    tap: Arc<Tap>,
    emitter: Arc<RecordingEmitter>,
    ui: Arc<RecordingUi>,
    tracer: Arc<Tracing>,
    scan: Arc<AskedScan>,
    ctx: WineCtx,
}

fn start(case: &Value) -> Run {
    let id = case["id"].as_str().unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/wine_manager").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let served: Arc<dyn Fetch> = if case["flow"] == "abort" {
        Arc::new(StopAfterHead {
            inner: Arc::clone(&replay) as Arc<dyn Fetch>,
        })
    } else {
        Arc::clone(&replay) as Arc<dyn Fetch>
    };
    let tap = Arc::new(Tap::new(served, id));
    let emitter = Arc::new(RecordingEmitter::new());
    let ui = Arc::new(RecordingUi::new());
    let tar = match case["tar"].as_str() {
        Some("nonzero") => TarMode::NonZero,
        Some("throws") => TarMode::Throws,
        _ => TarMode::Real,
    };
    let base_env = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let tracer = Arc::new(Tracing::new(base_env, tar));
    let scan = Arc::new(AskedScan::default());
    let ctx = WineCtx::new(
        Arc::new(
            engine(&profile, platform_of(case))
                .with_fetch(Arc::clone(&tap) as Arc<dyn Fetch>)
                .with_proc(Arc::clone(&tracer) as Arc<dyn SpecRunner>)
                .with_ui(Arc::clone(&ui) as Arc<dyn gamelib_engine::sinks::EngineUi>)
                .with_emitter(
                    Arc::clone(&emitter) as Arc<dyn gamelib_core::emitter::FrontendEmitter>
                ),
        ),
        profile.tools.join("runtimes"),
    )
    // The oracle pinned `process.arch` to x64: GE-Proton picks its asset by it.
    .with_arch(Arch::X64)
    .with_macho_scan(Arc::clone(&scan) as Arc<dyn MachoScan>);
    let run = Run {
        profile,
        replay,
        tap,
        emitter,
        ui,
        tracer,
        scan,
        ctx,
    };
    seed_store(&run, id);
    run
}

/// Writes the case's starting list through the host (the oracle did the same through its store). A
/// case with no `store` starts with none, except an install, which the oracle seeded with the release.
fn seed_store(run: &Run, id: &str) {
    let ordered = ordered_case(id);
    let list = match ordered.get("store") {
        Some(list) => Some(list.clone()),
        None if ordered.get("op").and_then(Json::as_str) == Some("install") => {
            ordered.get("release").map(|r| Json::Arr(vec![r.clone()]))
        }
        None => None,
    };
    if let Some(Json::Arr(entries)) = list.map(|l| run.profile.expand_json(&l)) {
        let handle = store::open(&run.ctx).unwrap();
        store::write(&handle, entries).unwrap();
    }
}

/// The oracle's `collapseProgress`: a run of the same progress status for one version is one entry
/// (D-10), and the backend bus events (`event:*`) are not renderer pushes.
fn comparable_events(pushed: Vec<(String, Vec<Value>)>) -> Value {
    let mut out: Vec<Value> = Vec::new();
    for (channel, args) in pushed {
        let event = json!({ "channel": channel, "args": args });
        if let Some(last) = out.last() {
            let same_progress = channel == "progressOfWineManager"
                && last["channel"] == "progressOfWineManager"
                && last["args"][0] == event["args"][0]
                && last["args"][1]["status"] == event["args"][1]["status"];
            if same_progress {
                continue;
            }
        }
        out.push(event);
    }
    Value::Array(out)
}

/// The golden's events without the backend bus entries (`event:wineVersionInstalled` and
/// `event:wineVersionUninstalled`), which the TS DXMT listener consumed. They are not renderer pushes and
/// no Rust op pushes them: since 87-31 the manager calls DXMT's `on_wine_installed` and
/// `on_wine_uninstalled` directly, and the tests of that sit below the install and remove replays.
fn renderer_events(expected: &Value) -> Value {
    Value::Array(
        expected
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| !e["channel"].as_str().unwrap().starts_with("event:"))
            .cloned()
            .collect(),
    )
}

fn repositories_of(case: &Value) -> Option<Vec<Repository>> {
    case["repositorys"].as_array().map(|list| {
        list.iter()
            .map(|n| Repository::from_index(n.as_u64().unwrap() as usize).unwrap())
            .collect()
    })
}

/// Replays one refresh case and compares everything the oracle recorded for it.
async fn replay_refresh(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let run = start(case);
    let fetch = case["fetch"].as_bool().unwrap_or(false);
    let count = case["count"]
        .as_u64()
        .map_or(releases::DEFAULT_COUNT, |n| n as u32);
    let repositories = repositories_of(case);

    let got = releases::update_wine_version_infos(&run.ctx, fetch, repositories.as_deref(), count)
        .await
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    let expected = golden_dir().join("expected").join(id);
    let golden = read_json(&expected.join("result.json"));
    assert_eq!(
        run.profile
            .normalise(Value::Array(got.iter().map(Json::to_value).collect())),
        golden["releases"],
        "{id}: the releases the refresh returned"
    );
    assert_eq!(
        run.profile.normalise(run.profile.store_file()),
        golden["store"],
        "{id}: store"
    );
    assert_eq!(
        json!(run.tap.downloads()),
        golden["downloads"],
        "{id}: downloads"
    );
    assert_eq!(
        json!(run.tap.urls()),
        read_json(&expected.join("requests.json")),
        "{id}: requests"
    );
    assert_eq!(
        comparable_events(run.emitter.pushed()),
        renderer_events(&read_json(&expected.join("events.json"))),
        "{id}: events"
    );
    assert_eq!(
        run.profile.normalise(run.profile.tree()),
        comparable_tree(read_json(&expected.join("tree.json"))),
        "{id}: the tree the case left"
    );
}

fn cases_of_op(op: &str) -> Vec<Value> {
    cases().into_iter().filter(|c| c["op"] == op).collect()
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

#[test]
fn every_case_is_a_refresh_an_install_or_a_remove_case() {
    let all = cases();
    let count = |op: &str| all.iter().filter(|c| c["op"] == op).count();
    assert_eq!(
        count("refresh") + count("install") + count("remove"),
        all.len()
    );
    assert!(
        count("refresh") >= 4 && count("install") >= 12 && count("remove") >= 3,
        "{}/{}/{}",
        count("refresh"),
        count("install"),
        count("remove")
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_refresh_case_matches_the_ts_store_bytes_events_and_requests() {
    let wanted = cases_of_op("refresh");
    assert!(wanted.len() >= 4, "{} refresh cases", wanted.len());
    for case in &wanted {
        replay_refresh(case).await;
    }
}

/// The cases where the Rust port deliberately differs from the TS golden (D-19), by the golden
/// fields that differ. Each is explained in `golden/wine_manager/deltas.json`, which this list must
/// match key for key.
const DELTAS: &[(&str, &[&str])] = &[
    ("install-overwrite-aborted", &["tree"]),
    ("install-overwrite-unzip-throws", &["tree"]),
    (
        "install-tar-nonzero-swallowed",
        &["notifications", "events", "store", "spawns", "tree"],
    ),
];

fn differs(id: &str, field: &str) -> bool {
    DELTAS
        .iter()
        .any(|(case, fields)| *case == id && fields.contains(&field))
}

/// The English catalog the notification keys resolve through. The run itself uses an empty catalog,
/// so a notification body is the op's inline default: the two must agree with the locale file.
fn english(key: &str) -> String {
    let locales = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales");
    let text = Catalog::load(&locales, "en").t(key, "", &serde_json::Map::new());
    assert!(!text.is_empty(), "the English catalog has no {key}");
    text
}

/// The notifications of the golden with each key replaced by its English text.
fn expected_notifications(golden: &Value) -> Value {
    Value::Array(
        golden["notifications"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| {
                json!({
                    "title": n["title"],
                    "body": english(n["body"].as_str().unwrap()),
                })
            })
            .collect(),
    )
}

fn notifications_of(ui: &RecordingUi) -> Value {
    Value::Array(
        ui.events()
            .into_iter()
            .map(|event| match event {
                UiEvent::Notify { title, body } => json!({ "title": title, "body": body }),
                other => panic!("an unexpected UI call: {other:?}"),
            })
            .collect(),
    )
}

/// The release a case sends, with the profile placeholders expanded.
fn release_of(run: &Run, case: &Value) -> Value {
    serde_json::from_str(&run.profile.expand(&case["release"].to_string())).unwrap()
}

/// What an install or remove case compares, minus what a delta changes.
fn compare_run(run: &Run, case: &Value, golden: &Value) {
    compare_run_with_tree(run, case, golden, |tree| tree);
}

/// [`compare_run`], with `shape` applied to both trees before they are compared.
fn compare_run_with_tree(run: &Run, case: &Value, golden: &Value, shape: impl Fn(Value) -> Value) {
    let id = case["id"].as_str().unwrap();
    let expected = golden_dir().join("expected").join(id);
    let check = |field: &str, got: Value, want: Value| {
        if !differs(id, field) {
            assert_eq!(got, want, "{id}: {field}");
        }
    };
    check(
        "store",
        run.profile.normalise(run.profile.store_file()),
        golden["store"].clone(),
    );
    check(
        "downloads",
        json!(run.tap.downloads()),
        golden["downloads"].clone(),
    );
    check(
        "notifications",
        notifications_of(&run.ui),
        expected_notifications(golden),
    );
    check(
        "requests",
        json!(run.tap.urls()),
        read_json(&expected.join("requests.json")),
    );
    check(
        "events",
        comparable_events(run.emitter.pushed()),
        renderer_events(&read_json(&expected.join("events.json"))),
    );
    check(
        "spawns",
        run.profile.normalise(json!(run.tracer.records())),
        read_json(&expected.join("spawns.json")),
    );
    check(
        "tree",
        shape(run.profile.normalise(run.profile.tree())),
        shape(comparable_tree(read_json(&expected.join("tree.json")))),
    );
}

/// Replays one install case through the op and compares everything the oracle recorded for it.
async fn replay_install(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let run = start(case);
    let mut args = vec![release_of(&run, case)];
    if case.get("settings").is_some() {
        args.push(
            serde_json::from_str(&run.profile.expand(&case["settings"].to_string())).unwrap(),
        );
    }
    let outcome = gamelib_wine::dispatch("wine_manager_install", &args, &run.ctx)
        .await
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    let golden = read_json(&golden_dir().join("expected").join(id).join("result.json"));
    let want = match (
        id,
        golden["notifications"][1]["body"]
            .as_str()
            .unwrap_or_default(),
    ) {
        ("install-tar-nonzero-swallowed", _) => "error",
        (_, "notify.install.finished") => "success",
        (_, "notify.install.canceled") => "abort",
        _ => "error",
    };
    assert_eq!(outcome, json!(want), "{id}: the outcome");
    compare_run(&run, case, &golden);
    assert_delta(&run, id);
    assert_dxmt_hook(&run, id);
}

/// The DXMT hook a successful wine install runs (87-31, closing the gap 87-20 opened): the one case that
/// installs a Wine-Staging-macOS on a Mac asks the gate about `<tools>/wine/<version>`, and no other case
/// (Proton, a failed or aborted install) reaches DXMT at all.
fn assert_dxmt_hook(run: &Run, id: &str) {
    let wanted: Vec<PathBuf> = if id == "install-checksum-absent" {
        vec![run
            .profile
            .tools
            .join("wine")
            .join("Wine-Staging-macOS-9.21")]
    } else {
        Vec::new()
    };
    assert_eq!(run.scan.asked(), wanted, "{id}: the DXMT gate");
}

/// What the Rust port leaves where it differs from the TS golden (see `deltas.json`).
fn assert_delta(run: &Run, id: &str) {
    let proton = run.profile.tools.join("proton");
    let version = proton.join("GE-Proton9-27");
    let backup = proton.join("GE-Proton9-27_backup");
    let archive = proton.join("GE-Proton9-27.tar.xz");
    match id {
        // The TS deleted the existing install when an update was aborted, and left the old tree as a
        // `_backup` beside a half-made install and its archive when the extraction rejected. The Rust
        // port touches the install only after the download is whole and puts it back on a failed
        // extraction.
        "install-overwrite-aborted" | "install-overwrite-unzip-throws" => {
            assert_eq!(
                std::fs::read_to_string(version.join("old-file")).unwrap(),
                "old"
            );
            assert!(!backup.exists() && !archive.exists(), "{id}: leftovers");
        }
        // The TS counted a failed `tar` as a success and left an empty install directory.
        "install-tar-nonzero-swallowed" => {
            assert!(!version.exists() && !backup.exists() && !archive.exists());
            assert_eq!(
                comparable_events(run.emitter.pushed()),
                json!([
                    { "channel": "progressOfWineManager", "args": ["GE-Proton9-27", {
                        "status": "downloading", "percentage": 0, "avgSpeed": 0, "eta": "00:00:00" }] },
                    { "channel": "progressOfWineManager", "args": ["GE-Proton9-27", { "status": "unzipping" }] },
                    { "channel": "progressOfWineManager", "args": ["GE-Proton9-27", { "status": "idle" }] },
                ])
            );
            assert_eq!(
                notifications_of(&run.ui),
                json!([
                    { "title": "GE-Proton9-27", "body": english("notify.install.startInstall") },
                    { "title": "GE-Proton9-27", "body": english("notify.install.error") },
                ])
            );
            let stored = run.profile.store_file();
            assert_eq!(stored["wine-releases"][0]["isInstalled"], json!(false));
            let programs: Vec<Value> = run
                .tracer
                .records()
                .iter()
                .map(|r| r["program"].clone())
                .collect();
            assert_eq!(programs, [json!("tar")]);
        }
        _ => {}
    }
}

/// Replays one remove case through the op, which is handed the whole release the renderer sent (its
/// `installDir` among it) and must use only the stored one.
async fn replay_remove(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let run = start(case);
    let args = [release_of(&run, case)];
    let result = gamelib_wine::dispatch("wine_manager_remove", &args, &run.ctx)
        .await
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    let golden = read_json(&golden_dir().join("expected").join(id).join("result.json"));
    let removed = !golden["notifications"].as_array().unwrap().is_empty();
    assert_eq!(result, json!(removed), "{id}: the result");
    compare_run(&run, case, &golden);
}

/// F2 (87-62): the stored entry of a release that was never installed has no `isInstalled`,
/// `hasUpdate` or `installDir` (the refresh merge appends feed releases without them, and released
/// builds stored them that way, D-07). This is `install-checksum-match` with those three keys left
/// out of the release and of the store it starts from, replayed over the same recorded exchanges rather than
/// a new case: it adds no recording, and the install must end exactly where the keyed twin ends (the
/// golden's store value, tree, requests, events, notifications and spawns). A renderer-supplied
/// `installDir` is not read, so the keyed twin and this one land in the same directory.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_never_installed_entry_installs_to_the_same_result_as_its_keyed_twin() {
    let mut case = cases_of_op("install")
        .into_iter()
        .find(|c| c["id"] == "install-checksum-match")
        .unwrap();
    for key in ["isInstalled", "hasUpdate", "installDir"] {
        case["release"].as_object_mut().unwrap().remove(key);
    }
    let id = "install-checksum-match";
    let run = start(&case);
    // `start` seeds from the case file (the keyed release); seed the stripped one over it, the way
    // a refresh merge leaves a never-installed release.
    let stripped = run
        .profile
        .expand_json(&Json::from(case["release"].clone()));
    assert!(["isInstalled", "hasUpdate", "installDir"]
        .iter()
        .all(|key| stripped.get(key).is_none()));
    store::write(&store::open(&run.ctx).unwrap(), vec![stripped]).unwrap();
    let args = [release_of(&run, &case)];
    let outcome = gamelib_wine::dispatch("wine_manager_install", &args, &run.ctx)
        .await
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
    assert_eq!(outcome, json!("success"));
    let golden = read_json(&golden_dir().join("expected").join(id).join("result.json"));
    // The store file's bytes differ in one way only: a never-installed entry gets `installDir`,
    // `isInstalled` and `hasUpdate` appended in the order the install sets them, where the keyed
    // twin's entry already held them in the feed's order. The store's value is compared whole by the
    // `store` field, so the file's digest is dropped from the tree on both sides.
    compare_run_with_tree(&run, &case, &golden, |mut tree| {
        for entry in tree.as_array_mut().unwrap() {
            if entry["path"]
                .as_str()
                .is_some_and(|p| p.ends_with("wine-downloader-info.json"))
            {
                entry.as_object_mut().unwrap().remove("sha256");
            }
        }
        tree
    });
}

/// A wine-manager removal of a Wine-Staging-macOS calls DXMT's `on_wine_uninstalled` (87-31): its `-DXMT`
/// copy beside it goes with it. The case is `remove-stored-installdir` moved onto a Mac and onto a staging
/// build in `<tools>/wine`, the only place DXMT writes a copy.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_staging_removal_removes_its_dxmt_copy_and_a_proton_removal_leaves_a_sibling_alone() {
    let version = "Wine-Staging-macOS-9.21";
    let case = json!({
        "id": "remove-stored-installdir",
        "op": "remove",
        "platform": "mac",
        "seed": [
            { "path": format!("<TOOLS>/wine/{version}/file"), "text": "installed" },
            { "path": format!("<TOOLS>/wine/{version}-DXMT/file"), "text": "copy" },
            { "path": "<TOOLS>/proton/GE-Proton9-27/file", "text": "installed" },
            { "path": "<TOOLS>/proton/GE-Proton9-27-DXMT/file", "text": "not a dxmt copy" },
        ],
    });
    let run = start(&case);
    let entry = |name: &str, kind: &str, dir: &str| {
        json!({
            "version": name, "type": kind, "date": "2025-01-01", "download": "", "downsize": 0,
            "disksize": 1, "checksum": "", "release_notes_link": "", "isInstalled": true,
            "hasUpdate": false, "installDir": dir,
        })
    };
    let staging = entry(
        version,
        "Wine-Staging-macOS",
        &format!("<TOOLS>/wine/{version}"),
    );
    let proton = entry("GE-Proton9-27", "GE-Proton", "<TOOLS>/proton/GE-Proton9-27");
    let handle = store::open(&run.ctx).unwrap();
    store::write(
        &handle,
        [&staging, &proton]
            .iter()
            .map(|e| run.profile.expand_json(&Json::from((*e).clone())))
            .collect(),
    )
    .unwrap();

    let wine_dir = run.profile.tools.join("wine");
    let proton_dir = run.profile.tools.join("proton");
    for (name, release) in [(version, &staging), ("GE-Proton9-27", &proton)] {
        let result = gamelib_wine::dispatch(
            "wine_manager_remove",
            std::slice::from_ref(release),
            &run.ctx,
        )
        .await
        .unwrap();
        assert_eq!(result, json!(true), "{name}");
    }
    assert!(!wine_dir.join(version).exists());
    assert!(
        !wine_dir.join(format!("{version}-DXMT")).exists(),
        "the DXMT copy of a removed staging build goes with it"
    );
    assert!(!proton_dir.join("GE-Proton9-27").exists());
    assert!(
        proton_dir.join("GE-Proton9-27-DXMT").join("file").exists(),
        "DXMT touches only a Wine-Staging-macOS"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_install_case_matches_the_ts_tree_store_events_and_requests() {
    let wanted = cases_of_op("install");
    assert!(wanted.len() >= 14, "{} install cases", wanted.len());
    for case in &wanted {
        replay_install(case).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_remove_case_matches_the_ts_tree_store_and_notifications() {
    let wanted = cases_of_op("remove");
    assert!(wanted.len() >= 3, "{} remove cases", wanted.len());
    for case in &wanted {
        replay_remove(case).await;
    }
}

#[test]
fn the_documented_deltas_are_exactly_the_cases_the_test_treats_differently() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut documented: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    documented.sort_unstable();
    let mut coded: Vec<&str> = DELTAS.iter().map(|(id, _)| *id).collect();
    coded.sort_unstable();
    assert_eq!(documented, coded);
    for (id, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().is_some_and(|w| w.len() > 40), "{id}: say why");
        assert!(cases().iter().any(|c| c["id"] == *id), "{id} is not a case");
    }
}

/// The ranged install cases (Rust-only, quick 261123-txk) must really record a ranged download: one
/// archive HEAD advertising `accept-ranges: bytes` and ten ranged archive GETs, each a 206, whose
/// bodies join into the archive the single-GET twin serves. Without this a later edit that flattened
/// the fixture to one GET would leave the install cases green and prove nothing ranged.
#[test]
fn the_ranged_install_cases_record_a_ranged_download() {
    let archive = "https://downloads.oracle.invalid/GE-Proton9-27.tar.xz";
    let whole =
        std::fs::read(fixtures().join("recorded/wine_manager/install-checksum-match/body-3.bin"))
            .unwrap();
    for id in [
        "install-ranged-checksum-match",
        "install-ranged-checksum-mismatch",
    ] {
        assert!(cases().iter().any(|c| c["id"] == id), "{id} is not a case");
        let dir = fixtures().join("recorded/wine_manager").join(id);
        let exchanges = read_json(&dir.join("exchanges.json"));
        let of_archive = |method: &str| -> Vec<&Value> {
            exchanges
                .as_array()
                .unwrap()
                .iter()
                .filter(|e| e["request"]["method"] == method && e["request"]["url"] == archive)
                .collect()
        };
        let heads = of_archive("HEAD");
        assert_eq!(heads.len(), 1, "{id}: one archive HEAD");
        assert_eq!(
            heads[0]["response"]["headers"]["accept-ranges"], "bytes",
            "{id}: the HEAD advertises ranges"
        );
        assert_eq!(
            heads[0]["response"]["headers"]["content-length"], "200",
            "{id}: the HEAD length"
        );
        let gets = of_archive("GET");
        assert_eq!(gets.len(), 10, "{id}: ten archive GETs");
        let mut parts: Vec<(u64, Vec<u8>)> = gets
            .iter()
            .map(|e| {
                let range = e["request"]["headers"]["range"]
                    .as_str()
                    .unwrap_or_else(|| panic!("{id}: a GET without a range header"));
                let start = range
                    .strip_prefix("bytes=")
                    .and_then(|r| r.split('-').next())
                    .and_then(|n| n.parse::<u64>().ok())
                    .unwrap_or_else(|| panic!("{id}: range {range}"));
                assert_eq!(e["response"]["status"], 206, "{id}: {range} is a 206");
                let file = e["response"]["bodyFile"].as_str().unwrap();
                (start, std::fs::read(dir.join(file)).unwrap())
            })
            .collect();
        parts.sort_by_key(|(start, _)| *start);
        let joined: Vec<u8> = parts.into_iter().flat_map(|(_, body)| body).collect();
        assert_eq!(joined, whole, "{id}: the ranges join into the archive");
    }
}
