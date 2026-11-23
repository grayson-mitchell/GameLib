//! The runtimes slice against the TS goldens (87-05 recorded them, 87-17 ports them; SC3, D-08, D-17,
//! D-19): every case in `tests/fixtures/golden/runtimes/cases.json` runs over a `Replay` of its
//! recorded exchanges (the pin on every request), over a fake HOME laid out like the oracle's
//! (`<appFolder>` = `.config/GameLib`, `<tools>` under it, `<runtimes>` under that) seeded with the
//! case's starting state, and a `tar` that really runs through `SpecProcRunner` and is traced.
//!
//! What the op returned, the requests made, the spawns made, the events pushed and the tree the case
//! left (a sha256 per file, modes with the group/other write bits cleared) must equal the TS oracle's
//! golden, and the replay must finish clean: no unmatched request, no recorded exchange left over.

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
use gamelib_engine::testing::RecordingEmitter;
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 9;

/// The app version the oracle's recordings were made under (the `User-Agent` they pin).
const RECORDED_APP_VERSION: &str = "0.11.0";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/runtimes")
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
    runtimes: PathBuf,
    tmp: PathBuf,
}

impl Profile {
    fn new() -> Profile {
        let home = FakeHome::new("wine-runtimes-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let tools = app_folder.join("tools");
        Profile {
            user_data: root
                .join("Library")
                .join("Application Support")
                .join("GameLib"),
            runtimes: tools.join("runtimes"),
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

    /// Every profile root in `value`'s strings replaced by its placeholder (object keys are left
    /// alone), with Windows separators folded to `/` so one golden serves every OS.
    fn normalise(&self, value: Value) -> Value {
        let table = self.placeholders();
        fn walk(value: Value, table: &[(&'static str, String)]) -> Value {
            match value {
                Value::String(mut s) => {
                    for (token, root) in table {
                        s = s.replace(root.as_str(), token);
                    }
                    if cfg!(windows)
                        && ["<TOOLS>", "<APPFOLDER>", "<USERDATA>", "<TMP>", "<HOME>"]
                            .iter()
                            .any(|t| s.contains(t))
                    {
                        s = s.replace('\\', "/");
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
        walk(value, &table)
    }

    /// A seed path (`<TOOLS>/runtimes/x`) as a real path.
    fn expand(&self, text: &str) -> PathBuf {
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
        PathBuf::from(out)
    }

    /// Writes a case's starting state. Only the forms the runtimes cases use are supported; an
    /// unknown one fails the test rather than being skipped.
    fn seed(&self, entries: &Value) {
        let Some(entries) = entries.as_array() else {
            return;
        };
        for entry in entries {
            let target = self.expand(entry["path"].as_str().unwrap());
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
            let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
            entry.insert("sha256".into(), json!(hex));
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

/// Wraps a [`Fetch`] and records `<METHOD> <url>` per request, as the oracle's recorder did.
struct Tap {
    inner: Arc<dyn Fetch>,
    seen: Mutex<Vec<String>>,
}

impl Tap {
    fn new(inner: Arc<dyn Fetch>) -> Tap {
        Tap {
            inner,
            seen: Mutex::new(Vec::new()),
        }
    }

    fn note(&self, req: &FetchRequest) {
        self.seen
            .lock()
            .unwrap()
            .push(format!("{} {}", req.method.as_str(), req.url));
    }

    fn urls(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }
}

impl Fetch for Tap {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.note(&req);
        self.inner.get(req)
    }

    fn download<'a>(
        &'a self,
        req: FetchRequest,
        dest: &'a Path,
        progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        self.note(&req);
        self.inner.download(req, dest, progress, cancel)
    }
}

/// Runs every spawn through the real runner over the fake profile's environment (the oracle's
/// `createFakeHomeProfile().childEnv()`) and records it in the oracle's `spawns.json` shape, with
/// the environment diffed against that base.
struct Tracing {
    inner: SpecProcRunner,
    base_env: Vec<(String, String)>,
    seen: Arc<Mutex<Vec<Value>>>,
}

impl Tracing {
    fn new(base_env: Vec<(String, String)>) -> Tracing {
        Tracing {
            inner: SpecProcRunner,
            base_env,
            seen: Arc::new(Mutex::new(Vec::new())),
        }
    }

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
        // The child runs with the fake profile's variables under whatever the op set.
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

fn op_name(case: &Value) -> &'static str {
    match case["op"].as_str().unwrap() {
        "isInstalled" => "wine_runtime_is_installed",
        "download" => "wine_runtime_download",
        other => panic!("unknown case op {other}"),
    }
}

/// Replays one case and compares everything the oracle recorded for it.
async fn replay_case(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let name = case["name"].as_str().unwrap();
    let profile = Profile::new();
    profile.seed(&case["seed"]);

    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/runtimes").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Fetch>));
    let base_env = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let tracer = Arc::new(Tracing::new(base_env));
    let emitter = Arc::new(RecordingEmitter::new());
    let ctx = WineCtx::new(
        Arc::new(
            engine(&profile, platform_of(case))
                .with_fetch(Arc::clone(&tap) as Arc<dyn Fetch>)
                .with_proc(Arc::clone(&tracer) as Arc<dyn SpecRunner>)
                .with_emitter(
                    Arc::clone(&emitter) as Arc<dyn gamelib_core::emitter::FrontendEmitter>
                ),
        ),
        profile.runtimes.clone(),
    );

    let result = gamelib_wine::dispatch(op_name(case), &[json!(name)], &ctx)
        .await
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    let expected = golden_dir().join("expected").join(id);
    assert_eq!(
        json!({ "op": case["op"], "name": name, "result": result }),
        read_json(&expected.join("result.json")),
        "{id}: result"
    );
    assert_eq!(
        json!(tap.urls()),
        read_json(&expected.join("requests.json")),
        "{id}: requests"
    );
    assert_eq!(
        profile.normalise(json!(tracer.records())),
        read_json(&expected.join("spawns.json")),
        "{id}: spawns"
    );
    assert_eq!(
        json!(emitter.pushed().len()),
        json!(read_json(&expected.join("events.json"))
            .as_array()
            .unwrap()
            .len()),
        "{id}: events"
    );
    assert_eq!(
        profile.normalise(profile.tree()),
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

#[test]
fn every_case_is_an_is_installed_or_a_download_case() {
    let all = cases();
    let is_installed = all.iter().filter(|c| c["op"] == "isInstalled").count();
    let download = all.iter().filter(|c| c["op"] == "download").count();
    assert_eq!(is_installed + download, all.len());
    assert!(
        is_installed >= 5 && download >= 4,
        "{is_installed}/{download}"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_is_installed_case_matches_the_ts_result_requests_and_tree() {
    let all = cases();
    let wanted: Vec<&Value> = all.iter().filter(|c| c["op"] == "isInstalled").collect();
    assert!(wanted.len() >= 5, "{} is-installed cases", wanted.len());
    for case in wanted {
        replay_case(case).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_download_case_matches_the_ts_result_requests_spawns_and_tree() {
    let all = cases();
    let wanted: Vec<&Value> = all.iter().filter(|c| c["op"] == "download").collect();
    assert!(wanted.len() >= 4, "{} download cases", wanted.len());
    for case in wanted {
        replay_case(case).await;
    }
}
