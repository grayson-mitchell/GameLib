//! DXMT against the TS goldens (87-09 recorded them, 87-30 ports them; SC3, D-08, D-17, D-19): every
//! case in `tests/fixtures/golden/dxmt/cases.json` runs the Rust entry point of the TS listener it
//! recorded (`wineVersionInstalled`, `wineVersionUninstalled` or `releasesInfoReady`) over a `Replay`
//! of its recorded exchanges (the pin on every request: method, URL and the GameLib `User-Agent`),
//! over a fake HOME laid out like the oracle's and seeded with the case's starting state.
//!
//! What the run returned (resolved or rejected), the archives it downloaded, the warnings and errors
//! it logged, the dialog it showed, the `tar` spawns it made, the winemac scans the gate asked for and
//! the tree it left (a sha256 per file) must equal the oracle's golden, and the replay must finish
//! clean: no unmatched request, no recorded exchange left over. Where the Rust port deliberately
//! differs, the comparison is the one `golden/dxmt/deltas.json` states.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress, Replay,
};
use gamelib_engine::testing::{RecordingLog, RecordingUi, UiEvent};
use gamelib_i18n::Catalog;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_store::json::Json;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::{Arch, WineCtx};
use gamelib_wine::manager::store;
use gamelib_wine::tools::dxmt::{
    boot_update, on_releases_info, on_wine_installed, on_wine_uninstalled, DxmtReleasesInfo,
    WineVersionInfo,
};
use gamelib_wine::tools::macho::ScriptedScan;
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
    fixtures().join("golden/dxmt")
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
    app_folder: PathBuf,
    user_data: PathBuf,
    tools: PathBuf,
    tmp: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("dxmt-golden-");
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

    /// `text` with every profile root replaced by its placeholder, Windows separators folded to `/`.
    fn normalise_text(&self, text: &str) -> String {
        let mut out = text.to_string();
        for (token, root) in self.placeholders() {
            out = out.replace(root.as_str(), token);
        }
        if cfg!(windows)
            && ["<TOOLS>", "<APPFOLDER>", "<USERDATA>", "<TMP>", "<HOME>"]
                .iter()
                .any(|t| out.contains(t))
        {
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

    /// A placeholder path (`<TOOLS>/dxmt/x`) as a real path.
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

    /// The tree without the wine-manager store the harness seeded under `userData` (the oracle held
    /// that list in a mocked store, which left no file): only what DXMT itself left on disk.
    fn tree_without_seeded_store(&self) -> Value {
        Value::Array(
            self.tree()
                .as_array()
                .unwrap()
                .iter()
                .filter(|entry| !entry["path"].as_str().unwrap().starts_with("Library"))
                .cloned()
                .collect(),
        )
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
                .join("recorded/dxmt")
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

/// Runs every spawn (`tar`, over the recorded synthetic archive) through the real runner over the
/// fake profile's environment and records it in the oracle's `spawns.json` shape.
struct Tracing {
    inner: SpecProcRunner,
    base_env: Vec<(String, String)>,
    seen: Arc<Mutex<Vec<Value>>>,
}

impl Tracing {
    fn records(&self) -> Vec<Value> {
        self.seen.lock().unwrap().clone()
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
        let mut env = self.base_env.clone();
        env.extend(std::mem::take(&mut spec.env));
        spec.env = env;
        let run = self.inner.run(spec, on_line);
        let seen = Arc::clone(&self.seen);
        Box::pin(async move {
            let out = run.await;
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

fn golden_level(level: &str) -> String {
    match level {
        "INFO" => "info",
        "WARNING" => "warn",
        "ERROR" => "error",
        other => panic!("unexpected golden log level {other}"),
    }
    .to_string()
}

/// The subject of a log line that ends in an error object: Node's message (`Error: ENOENT: ...`) or
/// the AxiosError text in the TS, the OS error kind or a category word in Rust. The first words are
/// what the golden pins (`golden/dxmt/deltas.json`, `error-text`).
fn trimmed(message: &str) -> String {
    let keep = if message.starts_with("Error when downloading ") {
        Some(4)
    } else if message.starts_with("Error copying wine staging for DXMT version") {
        Some(7)
    } else {
        None
    };
    match keep {
        Some(n) => message.split(' ').take(n).collect::<Vec<_>>().join(" "),
        None => message.to_string(),
    }
}

/// Everything one replayed case runs over.
struct Run {
    profile: Profile,
    replay: Arc<Replay>,
    tap: Arc<Tap>,
    tracer: Arc<Tracing>,
    scan: Arc<ScriptedScan>,
    ui: Arc<RecordingUi>,
    log: Arc<RecordingLog>,
    ctx: Arc<WineCtx>,
}

fn start(case: &Value) -> Run {
    let id = case["id"].as_str().unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/dxmt").join(id))
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
        seen: Arc::new(Mutex::new(Vec::new())),
    });
    let scan = Arc::new(match case["scan"]["mode"].as_str() {
        Some("fail") => ScriptedScan::failing(
            case["scan"]["failFor"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| PathBuf::from(profile.expand(p.as_str().unwrap())))
                .collect(),
        ),
        Some("reject") => ScriptedScan::rejecting(),
        _ => ScriptedScan::passing(),
    });
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Mac,
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
    .with_i18n(Arc::new(Catalog::load(&locales(), "en")))
    .with_online(case["online"] != false);
    let ctx = Arc::new(
        WineCtx::new(Arc::new(engine), profile.tools.join("runtimes"))
            .with_arch(Arch::X64)
            .with_macho_scan(Arc::clone(&scan) as Arc<dyn gamelib_wine::tools::macho::MachoScan>),
    );
    // The wine-manager store the releases listener reads: the case's list of wines.
    if let Some(wines) = case["wines"].as_array() {
        let entries: Vec<Json> = wines
            .iter()
            .map(|w| Json::from(profile.expand_value(w)))
            .collect();
        let handle = store::open(&ctx).unwrap();
        store::write(&handle, entries).unwrap();
    }
    Run {
        profile,
        replay,
        tap,
        tracer,
        scan,
        ui,
        log,
        ctx,
    }
}

/// How an entry point of the port ended, for the golden's `resolved` or `rejected`.
enum Outcome {
    Resolved,
    Rejected,
}

/// The `releasesInfoReady` payload of a case: the feed's DXMT tag.
fn releases_info(case: &Value) -> DxmtReleasesInfo {
    serde_json::from_value(json!({ "dxmt": { "tag": case["tag"] } })).unwrap()
}

/// Which Rust entry point answers a `releases-ready` case.
#[derive(Clone, Copy)]
enum Via {
    /// The listener's own entry point: the TS `onReleasesInfoReady`, offline quirk and all.
    Listener,
    /// The bounded boot task's body.
    Boot,
}

/// The entry point the case's trigger names.
async fn trigger_via(run: &Run, case: &Value, via: Via) -> Outcome {
    if case["trigger"] == "releases-ready" {
        let info = releases_info(case);
        let done = match via {
            Via::Listener => on_releases_info(&run.ctx, &info).await,
            Via::Boot => boot_update(&run.ctx, &info).await,
        };
        return match done {
            Ok(()) => Outcome::Resolved,
            Err(_) => Outcome::Rejected,
        };
    }
    let wine: WineVersionInfo =
        serde_json::from_value(run.profile.expand_value(&case["wine"])).unwrap_or_default();
    match case["trigger"].as_str().unwrap() {
        "wine-installed" => {
            // The listener's second argument is the directory the version lives in.
            let dir = Path::new(wine.install_dir.as_deref().unwrap())
                .parent()
                .unwrap()
                .to_path_buf();
            match on_wine_installed(&run.ctx, &wine, &dir).await {
                Ok(()) => Outcome::Resolved,
                Err(_) => Outcome::Rejected,
            }
        }
        "wine-uninstalled" => {
            on_wine_uninstalled(&run.ctx, &wine).await;
            Outcome::Resolved
        }
        other => panic!("trigger {other} is not replayed here"),
    }
}

/// Replays one case and compares everything the oracle recorded for it.
async fn replay_case(case: &Value) {
    replay_case_via(case, Via::Listener).await;
}

async fn replay_case_via(case: &Value, via: Via) {
    let id = case["id"].as_str().unwrap();
    let run = start(case);
    let outcome = trigger_via(&run, case, via).await;
    check_case(&run, case, outcome, id);
}

fn check_case(run: &Run, case: &Value, outcome: Outcome, id: &str) {
    let _ = case;
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    let expected = golden_dir().join("expected").join(id);
    let golden = read_json(&expected.join("result.json"));

    // The result: resolved, or rejected (the TS error text is Node's, so only the fact of the
    // rejection is pinned).
    match (golden["outcome"]["rejected"].is_string(), &outcome) {
        (false, Outcome::Resolved) | (true, Outcome::Rejected) => {}
        (rejected, _) => panic!("{id}: the TS rejected = {rejected}, Rust disagrees"),
    }

    assert_eq!(
        run.tap
            .downloads()
            .into_iter()
            .map(|u| run.profile.normalise_text(&u))
            .collect::<Vec<_>>(),
        golden["downloads"]
            .as_array()
            .unwrap()
            .iter()
            .map(|u| u.as_str().unwrap().to_string())
            .collect::<Vec<_>>(),
        "{id}: downloads"
    );

    // The gate: the bundles the scan was asked about, in order.
    let want_scans: Vec<String> = golden["scanRequests"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            assert_eq!(s["channel"], "scan_winemac_metal_exports", "{id}");
            s["args"][0]["wineBundlePath"].as_str().unwrap().to_string()
        })
        .collect();
    let got_scans: Vec<String> = run
        .scan
        .asked()
        .iter()
        .map(|p| run.profile.normalise_text(&p.to_string_lossy()))
        .collect();
    assert_eq!(got_scans, want_scans, "{id}: the winemac scans asked");

    // The evidence lines. Every golden line carries the ToolInstaller prefix, which the Rust log (a
    // level and a line) does not, and the per-file DEBUG lines have no sink (`deltas.json`).
    let mut want_logs: Vec<(String, String)> = Vec::new();
    for line in golden["logs"].as_array().unwrap() {
        assert_eq!(line["prefix"], "ToolInstaller", "{id}: a golden log prefix");
        if line["level"] == "DEBUG" {
            assert!(
                line["message"].as_str().unwrap().starts_with("Copying "),
                "{id}: an unexpected DEBUG line"
            );
            continue;
        }
        want_logs.push((
            golden_level(line["level"].as_str().unwrap()),
            trimmed(line["message"].as_str().unwrap()),
        ));
    }
    let got_logs: Vec<(String, String)> = run
        .log
        .lines()
        .into_iter()
        .map(|(level, line)| {
            (
                level.to_string(),
                trimmed(&run.profile.normalise_text(&line)),
            )
        })
        .collect();
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

    // The process trace: the `tar` spawns.
    assert_eq!(
        run.profile.normalise(Value::Array(run.tracer.records())),
        read_json(&expected.join("spawns.json")),
        "{id}: the spawns"
    );

    // The requests, in order: DXMT has one tool, so there is no concurrency to reorder.
    let want_requests: Vec<String> = read_json(&expected.join("requests.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u.as_str().unwrap().to_string())
        .collect();
    assert_eq!(run.tap.urls(), want_requests, "{id}: requests");

    assert_eq!(
        run.profile
            .normalise(run.profile.tree_without_seeded_store()),
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

/// The tracer: a new Wine-Staging-macOS that passes the export gate (the scan asked through the
/// injected trait), the latest DXMT downloaded over the replay and extracted, the bundle copied to
/// `<version>-DXMT`, the eleven files written and the plist marked.
#[tokio::test]
async fn dxmt_installs_into_a_wine_version_through_the_gate() {
    replay_case(&case_of("install-gate-passes")).await;
}

/// The gate, the other wine types, the download and feed failures and the malformed release body.
#[tokio::test]
async fn every_install_into_a_version_case_replays() {
    let all = cases();
    let installs: Vec<&Value> = all
        .iter()
        .filter(|c| c["trigger"] == "wine-installed")
        .collect();
    assert!(installs.len() >= 9, "{} install cases", installs.len());
    for case in installs {
        replay_case(case).await;
    }
}

/// Uninstalling a Wine-Staging-macOS removes its `-DXMT` copy; another type or no copy removes nothing.
#[tokio::test]
async fn every_uninstall_case_replays() {
    let all = cases();
    let uninstalls: Vec<&Value> = all
        .iter()
        .filter(|c| c["trigger"] == "wine-uninstalled")
        .collect();
    assert_eq!(uninstalls.len(), 3);
    for case in uninstalls {
        replay_case(case).await;
    }
}

/// Every `releasesInfoReady` case replays through the listener's entry point: the tag already
/// current, no copies to update, the gate failing a copy, the fetch and the copy, a failed download
/// and the offline skip that still tries the copy and rejects.
#[tokio::test]
async fn every_releases_info_case_replays() {
    let all = cases();
    let releases: Vec<&Value> = all
        .iter()
        .filter(|c| c["trigger"] == "releases-ready")
        .collect();
    assert!(releases.len() >= 9, "{} releases cases", releases.len());
    for case in releases {
        replay_case(case).await;
    }
}

/// The boot task's body answers every online golden as the listener does: the fetch, the tag already
/// current, the feed asset already installed, no copies, one failing the gate, a failed download.
#[tokio::test]
async fn the_boot_update_replays_the_online_and_already_current_goldens() {
    let all = cases();
    let online: Vec<&Value> = all
        .iter()
        .filter(|c| c["trigger"] == "releases-ready" && c["online"] != false)
        .collect();
    assert!(online.len() >= 8, "{} online boot cases", online.len());
    for case in online {
        replay_case_via(case, Via::Boot).await;
    }
}

/// Offline, the boot update returns early: one warning, no scan, no request and nothing copied. (The
/// listener's own entry point keeps the TS quirk the `boot-fetch-offline` golden pins: it still
/// tries the copy and rejects.)
#[tokio::test]
async fn the_boot_update_does_nothing_offline() {
    let case = case_of("boot-fetch-offline");
    let run = start(&case);
    let before = run.profile.tree();
    let outcome = trigger_via(&run, &case, Via::Boot).await;
    assert!(matches!(outcome, Outcome::Resolved));
    run.replay.finish().unwrap();
    assert!(run.tap.urls().is_empty(), "no request offline");
    assert!(run.scan.asked().is_empty(), "no scan offline");
    assert_eq!(
        run.log.lines(),
        vec![(
            "warn",
            "App offline, skipping possible DXMT update.".to_string()
        )]
    );
    assert_eq!(run.profile.tree(), before, "nothing was written");
}

/// The places the Rust port deliberately differs from the TS golden (D-19), each explained in
/// `golden/dxmt/deltas.json`, which this list must match key for key.
const DELTAS: &[&str] = &[
    "debug-copy-lines",
    "dialog-keys",
    "error-text",
    "half-made-copy-removal",
    "log-prefix",
    "offline-boot-returns-early",
    "rejection-text",
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
