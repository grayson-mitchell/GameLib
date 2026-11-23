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

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress, Replay,
};
use gamelib_engine::testing::RecordingEmitter;
use gamelib_store::host::StoreHost;
use gamelib_store::json::{self, Json, Obj};
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::{Arch, WineCtx};
use gamelib_wine::manager::releases::{self, Repository};
use gamelib_wine::manager::store;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 19;

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
                Value::String(if cfg!(windows) {
                    s.replace('\\', "/")
                } else {
                    s
                })
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

/// Everything one replayed case runs over.
struct Run {
    profile: Profile,
    replay: Arc<Replay>,
    tap: Arc<Tap>,
    emitter: Arc<RecordingEmitter>,
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
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Fetch>, id));
    let emitter = Arc::new(RecordingEmitter::new());
    let ctx = WineCtx::new(
        Arc::new(
            engine(&profile, platform_of(case))
                .with_fetch(Arc::clone(&tap) as Arc<dyn Fetch>)
                .with_emitter(
                    Arc::clone(&emitter) as Arc<dyn gamelib_core::emitter::FrontendEmitter>
                ),
        ),
        profile.tools.join("runtimes"),
    )
    // The oracle pinned `process.arch` to x64: GE-Proton picks its asset by it.
    .with_arch(Arch::X64);
    let run = Run {
        profile,
        replay,
        tap,
        emitter,
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
/// `event:wineVersionUninstalled`), which the TS DXMT listener consumed and no Rust op pushes: 87-20
/// opens that gap on purpose and 87-31 closes it.
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
