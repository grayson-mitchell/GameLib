//! The overlay install (and, from 88-10 task 3, the overlay env) against the TS goldens (88-06 recorded
//! them, 88-10 replays them; D-03, D-15, T-88-24, T-88-25, T-88-26). `golden/overlay_install` holds 41
//! cases, each a list of steps run on a fresh fake HOME:
//!
//! - `ensure`: `ensure_overlay_installed` over a fixture overlay (`test-overlay-1`, pinned from an archive
//!   built here) with a scripted fetch, one or two callers and one or two boots (two contexts, each with its
//!   own single-flight table and overlays folder);
//! - `damage`, `verify`: break the installed tree the way the TS incident tests do, and ask
//!   `verify_installed_overlay`;
//! - `catalogue`: the real catalogue's pins;
//! - `validate`, `resolveEnv`, `profileEnv` and the pure helpers (`appendPathList`, `lastEnvOption`,
//!   `formatLine`, `logLine`, `withEnv`, `filterTier1`): the overlay env, with a scripted installer in
//!   place of the real one, so the catalogue's archive is never fetched.
//!
//! `expected/<case>/result.json` and `events.json` (step, level, text) are compared whole, and `tree.json`
//! is the fake HOME afterwards, so the `overlays/` layout is pinned: the staging names never survive, the
//! install directory is mode 0700, its files 0644. Every fetch is scripted; no case reaches the real
//! archive. The 120 s bound runs on a paused clock, so no test waits for it. Documented differences
//! (`deltas.json`): the fetch seam has no `maxBytes` (the replay computes it from the pin), a failed fetch
//! says what the seam says, an fs error says what the OS says. A count floor lives in this file, so
//! editing the JSON alone cannot lower the bar, and an empty case list fails.

#![cfg_attr(not(unix), allow(dead_code, unused_imports))]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use flate2::write::GzEncoder;
use flate2::Compression;
use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress,
};
use gamelib_engine::testing::RecordingLog;
use gamelib_knownfix::catalogue::{
    archive_url, lookup, OverlayCatalogueEntry, OverlayFile, OverlayPlatform, OverlayRelease,
};
use gamelib_knownfix::ctx::{KnownFixCtx, OverlayInstalls};
use gamelib_knownfix::jsvalue::JsValue;
use gamelib_knownfix::overlay::archive::{build_overlay_tar_gz, OverlayArchiveFile};
use gamelib_knownfix::overlay::env::{
    append_path_list, env_options_of, format_known_fix_env_line, last_env_option,
    log_known_fix_env, profile_overlay_env_with, resolve_overlay_env, validate_overlay_entries,
    with_known_fix_env, EnvLine, OverlayInstaller,
};
use gamelib_knownfix::overlay::install::{
    ensure_overlay_installed, verify_installed_overlay, VerifyError,
};
use gamelib_knownfix::reader::filter_tier1_known_fixes;
use gamelib_knownfix::types::Runner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

/// `golden/overlay_install` holds 41 cases: 18 install cases and 23 env and pure-helper cases. A later edit
/// may raise this, never lower it.
const OVERLAY_INSTALL_FLOOR: usize = 41;

const FIXTURE_ID: &str = "test-overlay-1";
const DEFAULT_DEADLINE_MS: u64 = 120_000;
/// The ops of an install case; every other op is an env or pure-helper step.
const INSTALL_OPS: [&str; 4] = ["ensure", "damage", "verify", "catalogue"];
/// The one kind of line the TS wrote at debug level and the Rust log has no level for (`deltas.json`).
const SKIPPED_DEBUG_MARKER: &str = " skipped: ";

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/overlay_install")
}

fn read_json(path: &Path) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

fn load_cases() -> Vec<Value> {
    match read_json(&golden_dir().join("cases.json")) {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    }
}

/// The same file as the order-preserving value (see [`Run::js_case`]).
fn load_js_cases() -> Vec<JsValue> {
    let text = std::fs::read_to_string(golden_dir().join("cases.json")).unwrap();
    match JsValue::parse(&text).unwrap() {
        JsValue::Array(cases) => cases,
        _ => panic!("cases.json is not an array"),
    }
}

fn is_install_case(case: &Value) -> bool {
    case["steps"]
        .as_array()
        .unwrap()
        .iter()
        .all(|s| INSTALL_OPS.contains(&s["op"].as_str().unwrap()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256(data: &[u8]) -> String {
    hex(&Sha256::digest(data))
}

// ---------------------------------------------------------------------------------------------
// The fixture overlay and its hostile archives
// ---------------------------------------------------------------------------------------------

/// The overlay's files unless a case brings its own.
const PAYLOAD: [(&str, &str); 2] = [
    ("lib/gstreamer-1.0/libplug.dylib", "plug"),
    ("lib/libdep.1.dylib", "dependency bytes"),
];

fn payload_of(case: &Value) -> Vec<OverlayArchiveFile> {
    match case.get("payload").and_then(Value::as_array) {
        Some(files) => files
            .iter()
            .map(|f| OverlayArchiveFile {
                path: f["path"].as_str().unwrap().to_string(),
                data: f["text"].as_str().unwrap_or("").as_bytes().to_vec(),
            })
            .collect(),
        None => PAYLOAD
            .iter()
            .map(|(path, text)| OverlayArchiveFile {
                path: path.to_string(),
                data: text.as_bytes().to_vec(),
            })
            .collect(),
    }
}

/// gzip with stored blocks, the OS byte pinned, as the oracle's own encoder writes a hostile archive.
fn gz_stored(tar: &[u8]) -> Vec<u8> {
    use std::io::Write;
    let mut enc = GzEncoder::new(Vec::new(), Compression::none());
    enc.write_all(tar).unwrap();
    let mut out = enc.finish().unwrap();
    out[9] = 3;
    out
}

fn put(h: &mut [u8; 512], at: usize, text: &str) {
    h[at..at + text.len()].copy_from_slice(text.as_bytes());
}

fn seal(h: &mut [u8; 512]) {
    let sum: u64 = h.iter().map(|&b| b as u64).sum();
    put(h, 148, &format!("{sum:06o}\0 "));
}

/// A well-formed ustar archive whose one entry is named `../x`.
fn hostile_dotdot() -> Vec<u8> {
    let mut h = [0u8; 512];
    put(&mut h, 0, "../x");
    put(&mut h, 100, "0000644\0");
    put(&mut h, 108, "0000000\0");
    put(&mut h, 116, "0000000\0");
    put(&mut h, 124, "00000000001\0");
    put(&mut h, 136, "00000000000\0");
    put(&mut h, 148, "        ");
    put(&mut h, 156, "0");
    put(&mut h, 257, "ustar\0");
    put(&mut h, 263, "00");
    seal(&mut h);
    let mut tar = h.to_vec();
    tar.extend(std::iter::repeat(0x78).take(512));
    tar.extend(std::iter::repeat(0).take(1024));
    gz_stored(&tar)
}

/// The hostile archive of the TS install test as it builds it: the header run `0ustar\0` + `00` lands at
/// offset 156, so the magic at 257 stays zero and the reader refuses it for its magic.
fn hostile_ts_shape() -> Vec<u8> {
    let mut h = [0u8; 512];
    put(&mut h, 0, "../x");
    put(&mut h, 100, "0000644\0");
    put(&mut h, 108, "0000000\0");
    put(&mut h, 116, "0000000\0");
    put(&mut h, 124, "00000000001\0");
    put(&mut h, 136, "00000000000\0");
    put(&mut h, 148, "        ");
    put(&mut h, 156, "0ustar\u{0}00");
    seal(&mut h);
    let mut tar = h.to_vec();
    tar.extend(std::iter::repeat(0x78).take(512));
    tar.extend(std::iter::repeat(0).take(1024));
    gz_stored(&tar)
}

/// The fixtures one case installs from.
struct Fixture {
    payload: Vec<OverlayArchiveFile>,
    good: Vec<u8>,
    ts_shape: Vec<u8>,
    dotdot: Vec<u8>,
}

impl Fixture {
    fn new(case: &Value) -> Fixture {
        let payload = payload_of(case);
        Fixture {
            good: build_overlay_tar_gz(&payload).unwrap(),
            payload,
            ts_shape: hostile_ts_shape(),
            dotdot: hostile_dotdot(),
        }
    }

    fn entry_for(&self, archive: &[u8], id: &str) -> OverlayCatalogueEntry {
        OverlayCatalogueEntry {
            id: id.to_string(),
            target: "gstreamer-plugin-path".to_string(),
            plugin_subdir: "lib/gstreamer-1.0".to_string(),
            platform: OverlayPlatform {
                os: "darwin".to_string(),
                wine: "crossover".to_string(),
            },
            release: OverlayRelease {
                repo: "o/r".to_string(),
                tag: "t".to_string(),
                asset: "a.tar.gz".to_string(),
            },
            archive_sha256: sha256(archive),
            archive_size: archive.len() as u64,
            files: self
                .payload
                .iter()
                .map(|f| OverlayFile {
                    path: f.path.clone(),
                    sha256: sha256(&f.data),
                    size: f.data.len() as u64,
                })
                .collect(),
        }
    }

    /// The pinned entry and the archive it pins, by the case's `pins` kind.
    fn pinned(&self, kind: &str, id: &str) -> (OverlayCatalogueEntry, Vec<u8>) {
        match kind {
            "zero-sha" => {
                let mut e = self.entry_for(&self.good, id);
                e.archive_sha256 = "0".repeat(64);
                (e, self.good.clone())
            }
            "size-plus-one" => {
                let mut e = self.entry_for(&self.good, id);
                e.archive_size = self.good.len() as u64 + 1;
                (e, self.good.clone())
            }
            "hostile-ts-shape" => (self.entry_for(&self.ts_shape, id), self.ts_shape.clone()),
            "hostile-dotdot" => (self.entry_for(&self.dotdot, id), self.dotdot.clone()),
            _ => (self.entry_for(&self.good, id), self.good.clone()),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The scripted fetch
// ---------------------------------------------------------------------------------------------

/// A fetch the case scripts: what it answers, and what it was asked and how each request ended.
struct ScriptedFetch {
    answer: Answer,
    /// One entry per request: its URL and whether the request ran to its end (a future dropped while it
    /// waited, by the deadline or by the shutdown token, is the Rust twin of an aborted signal).
    requests: Mutex<Vec<(String, Arc<AtomicBool>)>>,
    started: Arc<Notify>,
}

enum Answer {
    Bytes(Vec<u8>),
    Reject,
    Never,
}

impl ScriptedFetch {
    fn new(answer: Answer) -> Arc<ScriptedFetch> {
        Arc::new(ScriptedFetch {
            answer,
            requests: Mutex::new(Vec::new()),
            started: Arc::new(Notify::new()),
        })
    }
}

/// Marks its request as finished when the request's future ends (and not when it is dropped).
struct Finished(Arc<AtomicBool>);

impl Fetch for ScriptedFetch {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        let done = Arc::new(AtomicBool::new(false));
        self.requests
            .lock()
            .unwrap()
            .push((req.url.clone(), done.clone()));
        Box::pin(async move {
            self.started.notify_one();
            // A reply is not instant: the other caller of a concurrent pair has to find this one in flight.
            tokio::task::yield_now().await;
            let finished = Finished(done);
            let outcome = match &self.answer {
                Answer::Bytes(body) => Ok(FetchResponse {
                    status: 200,
                    headers: Vec::new(),
                    body: body.clone(),
                }),
                Answer::Reject => Err(FetchError::Status(500)),
                Answer::Never => std::future::pending().await,
            };
            finished.0.store(true, Ordering::SeqCst);
            outcome
        })
    }

    fn download<'a>(
        &'a self,
        _req: FetchRequest,
        _dest: &'a Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        _cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(async { panic!("the overlay install reads its archive with get, never download") })
    }
}

// ---------------------------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------------------------

struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
}

impl Rig {
    fn new() -> Rig {
        Rig {
            home: FakeHome::new("knownfix-overlay-golden-"),
            log: Arc::new(RecordingLog::new()),
        }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn app_folder(&self) -> PathBuf {
        self.root().join(".config").join("GameLib")
    }

    /// Boot A's overlays folder (`<appFolder>/overlays`).
    fn root_a(&self) -> PathBuf {
        self.app_folder().join("overlays")
    }

    /// Boot B's (`<HOME>/overlays-b`).
    fn root_b(&self) -> PathBuf {
        self.root().join("overlays-b")
    }

    /// A context over this HOME with `fetch` as its network, and the overlays folder of `boot`.
    fn ctx(&self, boot: &str, fetch: Arc<dyn Fetch>, timeout: Option<Duration>) -> KnownFixCtx {
        self.ctx_on(Platform::Mac, boot, fetch, timeout)
    }

    /// The same on another platform (the env cases run `darwin`, `linux` and `win32`).
    fn ctx_on(
        &self,
        platform: Platform,
        boot: &str,
        fetch: Arc<dyn Fetch>,
        timeout: Option<Duration>,
    ) -> KnownFixCtx {
        let root = self.root().to_path_buf();
        let app_folder = self.app_folder();
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
                app_folder,
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(self.log.clone())
        .with_fetch(fetch);
        let mut ctx = KnownFixCtx::new(
            Arc::new(engine),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        );
        if boot == "B" {
            ctx.paths.overlays = self.root_b();
        }
        if let Some(timeout) = timeout {
            ctx.overlay_installs = OverlayInstalls::new().with_timeout(timeout);
        }
        ctx
    }

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`, so the
    /// real name is listed too).
    fn normalise_text(&self, text: &str) -> String {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let mut table = vec![
            ("<APPFOLDER>", as_text(&self.app_folder())),
            ("<HOME>", as_text(self.root())),
        ];
        if let Ok(real) = std::fs::canonicalize(self.root()) {
            if real != self.root() {
                table.insert(
                    0,
                    (
                        "<APPFOLDER>",
                        as_text(&real.join(".config").join("GameLib")),
                    ),
                );
                table.push(("<HOME>", as_text(&real)));
            }
        }
        let mut s = text.to_string();
        for (token, root) in table {
            s = s.replace(root.as_str(), token);
        }
        normalise_lengths(&s)
    }

    fn normalise_value(&self, value: Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.normalise_text(&s)),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.normalise_value(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, self.normalise_value(v)))
                    .collect(),
            ),
            other => other,
        }
    }
}

impl Rig {
    /// A placeholder path as a real one.
    fn expand(&self, text: &str) -> String {
        text.replace("<APPFOLDER>", &self.app_folder().to_string_lossy())
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

    /// Writes one seed file, inside the fake HOME.
    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            std::fs::create_dir_all(target.parent().unwrap()).unwrap();
            std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
        }
    }
}

/// `archive size <got> does not match the pinned <pinned>` as the golden holds it: the lengths depend on
/// the deflate build, so the fetched length is `<A>` and the pinned one is `<A+d>` (`deltas.json`).
fn normalise_lengths(text: &str) -> String {
    const HEAD: &str = "archive size ";
    const MID: &str = " does not match the pinned ";
    let Some(at) = text.find(HEAD) else {
        return text.to_string();
    };
    let rest = &text[at + HEAD.len()..];
    let Some(mid) = rest.find(MID) else {
        return text.to_string();
    };
    let got = &rest[..mid];
    let after = &rest[mid + MID.len()..];
    let digits = after.chars().take_while(char::is_ascii_digit).count();
    let (Ok(got_n), Ok(pinned_n)) = (got.parse::<i64>(), after[..digits].parse::<i64>()) else {
        return text.to_string();
    };
    let d = pinned_n - got_n;
    let sign = if d >= 0 { "+" } else { "" };
    format!(
        "{}{HEAD}<A>{MID}<A{sign}{d}>{}",
        &text[..at],
        &after[digits..]
    )
}

/// The OS's own text for a path that is not there: what the verify reason carries where Node printed
/// `ENOENT: no such file or directory, lstat '<path>'`.
fn not_found_text(rig: &Rig) -> String {
    std::fs::symlink_metadata(rig.root().join("definitely-missing"))
        .unwrap_err()
        .to_string()
}

// ---------------------------------------------------------------------------------------------
// The fake HOME as a tree
// ---------------------------------------------------------------------------------------------

/// `snapshotTree`: every entry under `root`, sorted by path, with the mode minus the group and other write
/// bits, the sha256 of a file and the target of a link.
#[cfg(unix)]
fn snapshot_tree(rig: &Rig) -> Value {
    use std::os::unix::fs::PermissionsExt;

    fn walk(rig: &Rig, root: &Path, rel: &str, out: &mut Vec<(String, Value)>) {
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
            let mode = format!("{:04o}", md.permissions().mode() & 0o7755);
            let entry = if md.file_type().is_symlink() {
                let target = std::fs::read_link(&full).unwrap();
                json!({"path": rel_path, "kind": "symlink", "mode": mode,
                       "symlink": rig.normalise_text(&target.to_string_lossy())})
            } else if md.is_dir() {
                out.push((
                    rel_path.clone(),
                    json!({"path": rel_path, "kind": "dir", "mode": mode}),
                ));
                walk(rig, root, &rel_path, out);
                continue;
            } else {
                json!({"path": rel_path, "kind": "file", "mode": mode,
                       "sha256": sha256(&std::fs::read(&full).unwrap())})
            };
            out.push((rel_path, entry));
        }
    }

    let mut out = Vec::new();
    walk(rig, rig.root(), "", &mut out);
    out.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    Value::Array(out.into_iter().map(|(_, v)| v).collect())
}

// ---------------------------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------------------------

struct Run<'a> {
    rig: &'a Rig,
    fixture: &'a Fixture,
    /// The case as the order-preserving value: a warning that echoes a profile entry lists its keys in the
    /// order the file has them, which `serde_json::Value` would sort.
    js_case: &'a JsValue,
}

/// What a scripted installer answers (`install` in the case).
#[derive(Clone, Copy)]
enum InstallMode {
    Dir,
    Null,
    Reject,
}

/// The installer the env cases use: it answers `<overlays>/<id>`, `None` or an error, and records what it
/// was asked.
struct ScriptedInstaller {
    mode: InstallMode,
    root: PathBuf,
    calls: Mutex<Vec<(String, String)>>,
}

impl ScriptedInstaller {
    fn new(mode: &str, root: PathBuf) -> ScriptedInstaller {
        ScriptedInstaller {
            mode: match mode {
                "dir" => InstallMode::Dir,
                "null" => InstallMode::Null,
                "reject" => InstallMode::Reject,
                other => panic!("unknown install mode {other}"),
            },
            root,
            calls: Mutex::new(Vec::new()),
        }
    }

    fn calls(&self) -> Value {
        Value::Array(
            self.calls
                .lock()
                .unwrap()
                .iter()
                .map(|(id, label)| json!({"id": id, "label": label}))
                .collect(),
        )
    }
}

impl OverlayInstaller for ScriptedInstaller {
    fn ensure<'a>(
        &'a self,
        entry: &'a gamelib_knownfix::catalogue::OverlayCatalogueEntry,
        label: &'a str,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Option<PathBuf>, String>> + Send + 'a>,
    > {
        self.calls
            .lock()
            .unwrap()
            .push((entry.id.clone(), label.to_string()));
        let answer = match self.mode {
            InstallMode::Dir => Ok(Some(self.root.join(&entry.id))),
            InstallMode::Null => Ok(None),
            InstallMode::Reject => Err("boom".to_string()),
        };
        Box::pin(async move { answer })
    }
}

/// A member of step `index` of the case, as the order-preserving value.
fn js_step<'a>(js_case: &'a JsValue, index: usize, key: &str) -> Option<&'a JsValue> {
    let JsValue::Object(case) = js_case else {
        return None;
    };
    let JsValue::Array(steps) = &case.iter().find(|(k, _)| k == "steps")?.1 else {
        return None;
    };
    let JsValue::Object(step) = steps.get(index)? else {
        return None;
    };
    step.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

fn strings_of(value: &Value) -> BTreeMap<String, String> {
    value
        .as_object()
        .into_iter()
        .flatten()
        .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string()))
        .collect()
}

fn env_lines(value: &Value) -> Vec<EnvLine> {
    value
        .as_array()
        .unwrap()
        .iter()
        .map(|e| EnvLine {
            key: e["key"].as_str().unwrap().to_string(),
            value: e["value"].as_str().unwrap().to_string(),
            source: e["source"].as_str().unwrap().to_string(),
        })
        .collect()
}

fn platform_of(name: &str) -> Platform {
    match name {
        "darwin" => Platform::Mac,
        "linux" => Platform::Linux,
        "win32" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

impl Run<'_> {
    fn installed_dir(&self) -> PathBuf {
        self.rig.root_a().join(FIXTURE_ID)
    }

    async fn ensure(&self, step: &Value) -> Value {
        let id = step["entryId"].as_str().unwrap_or(FIXTURE_ID).to_string();
        let pins = step["pins"].as_str().unwrap_or("good");
        let fetch_kind = step["fetch"].as_str().unwrap();
        let (entry, pinned_archive) = self.fixture.pinned(pins, &id);
        let timeout = step["timeoutMs"].as_u64().map(Duration::from_millis);
        let calls: Vec<String> = match step["calls"].as_array() {
            Some(list) => list
                .iter()
                .map(|c| c["boot"].as_str().unwrap().to_string())
                .collect(),
            None => vec!["A".to_string()],
        };

        // One context and one scripted fetch per boot, shared by that boot's callers.
        let mut boots: Vec<(String, KnownFixCtx, Arc<ScriptedFetch>)> = Vec::new();
        for boot in ["A", "B"] {
            if !calls.iter().any(|c| c == boot) {
                continue;
            }
            let answer = match fetch_kind {
                "reject" => Answer::Reject,
                "never" => Answer::Never,
                "wrong-bytes" => Answer::Bytes(vec![0x78; self.fixture.good.len()]),
                "hostile-ts-shape" => Answer::Bytes(self.fixture.ts_shape.clone()),
                "hostile-dotdot" => Answer::Bytes(self.fixture.dotdot.clone()),
                _ => Answer::Bytes(self.fixture.good.clone()),
            };
            let fetch = ScriptedFetch::new(answer);
            let ctx = self.rig.ctx(boot, fetch.clone(), timeout);
            boots.push((boot.to_string(), ctx, fetch));
        }
        let ctx_of = |boot: &str| boots.iter().find(|(b, _, _)| b == boot).unwrap().1.clone();

        // The abort case cancels the shutdown token once the fetch is waiting; every other `never` case
        // is ended by the (paused) clock reaching the deadline.
        let driver = (fetch_kind == "never" && step["abort"] == json!(true)).then(|| {
            let (_, ctx, fetch) = &boots[0];
            let started = fetch.started.clone();
            let token = ctx.engine.shutdown.token();
            tokio::spawn(async move {
                started.notified().await;
                token.cancel();
            })
        });

        let handles: Vec<_> = calls
            .iter()
            .map(|boot| {
                let ctx = ctx_of(boot);
                let entry = entry.clone();
                tokio::spawn(async move { ensure_overlay_installed(&ctx, &entry, "test").await })
            })
            .collect();
        let mut dirs = Vec::new();
        for handle in handles {
            dirs.push(handle.await.expect("the install task panicked"));
        }
        if let Some(driver) = driver {
            driver.await.unwrap();
        }

        let mut fetches = Vec::new();
        let mut signals = Vec::new();
        for (boot, _, fetch) in &boots {
            for (url, done) in fetch.requests.lock().unwrap().iter() {
                // The cap the install holds the body to is the pin's archive size; the seam has no
                // `maxBytes` of its own (`deltas.json`).
                fetches.push(json!({
                    "boot": boot, "url": url,
                    "maxBytesMinusPinnedArchive":
                        entry.archive_size as i64 - pinned_archive.len() as i64,
                }));
                signals.push(!done.load(Ordering::SeqCst));
            }
        }
        let still_in_flight = boots
            .iter()
            .any(|(_, ctx, _)| ctx.overlay_installs.in_flight() > 0);
        let root_a = self.rig.root_a();
        let mut leftovers: Vec<String> = match std::fs::read_dir(&root_a) {
            Ok(list) => list
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .filter(|n| n.starts_with('.'))
                .collect(),
            Err(_) => Vec::new(),
        };
        leftovers.sort();
        json!({
            "op": "ensure",
            "entryId": id,
            "pins": pins,
            "fetch": fetch_kind,
            "timeoutMs": step["timeoutMs"].as_u64(),
            "calls": calls.iter().zip(&dirs).map(|(boot, dir)| json!({
                "boot": boot,
                "dir": dir.as_ref().map(|p| p.to_string_lossy().into_owned()),
            })).collect::<Vec<_>>(),
            "fetches": fetches,
            "signalsAbortedAfterwards": signals,
            "registryStillHolds": still_in_flight,
            "leftovers": leftovers,
            "escapedFileExists": root_a.join("..").join("x").exists(),
        })
    }

    #[cfg(unix)]
    fn damage(&self, kind: &str) -> Value {
        let d = self.installed_dir();
        let root = self.rig.root_a();
        match kind {
            "extra-in-plugin-subdir" => {
                std::fs::write(d.join("lib/gstreamer-1.0/extra.dylib"), "x").unwrap()
            }
            "corrupted-file" => {
                std::fs::write(d.join("lib/libdep.1.dylib"), "xxxxxxxxxxxxxxxx").unwrap()
            }
            "wrong-size" => std::fs::write(d.join("lib/libdep.1.dylib"), "short").unwrap(),
            "symlink-in-place-of-a-file" => {
                std::fs::remove_file(d.join("lib/libdep.1.dylib")).unwrap();
                std::fs::write(root.join("real"), "dependency bytes").unwrap();
                std::os::unix::fs::symlink(root.join("real"), d.join("lib/libdep.1.dylib"))
                    .unwrap();
            }
            "lib-is-a-symlink" => {
                let moved = root.join("lib-moved");
                std::fs::rename(d.join("lib"), &moved).unwrap();
                std::os::unix::fs::symlink(&moved, d.join("lib")).unwrap();
            }
            "extra-root-file" => std::fs::write(d.join("SHA256SUMS"), "x").unwrap(),
            other => panic!("unknown damage {other}"),
        }
        json!({"op": "damage", "kind": kind})
    }

    fn verify(&self, step: &Value) -> Value {
        let entry = self.fixture.entry_for(&self.fixture.good, FIXTURE_ID);
        let target = step["target"].as_str().unwrap_or("installed");
        match verify_installed_overlay(&self.installed_dir(), &entry) {
            Ok(()) => json!({"op": "verify", "target": target, "ok": true}),
            Err(e) => {
                json!({"op": "verify", "target": target, "ok": false, "reason": e.reason()})
            }
        }
    }

    /// A context for the env cases: nothing in them reaches the network.
    fn env_ctx(&self, platform: Platform) -> KnownFixCtx {
        self.rig
            .ctx_on(platform, "A", ScriptedFetch::new(Answer::Never), None)
    }

    fn raw_of(&self, index: usize, step: &Value) -> (Option<&JsValue>, Value) {
        (
            js_step(self.js_case, index, "raw"),
            step.get("raw").cloned().unwrap_or(Value::Null),
        )
    }

    fn validate(&self, index: usize, step: &Value) -> Value {
        let (raw, echo) = self.raw_of(index, step);
        let ctx = self.env_ctx(Platform::Mac);
        let ids: Vec<&str> = validate_overlay_entries(&ctx, raw, "test")
            .iter()
            .map(|e| e.id.as_str())
            .collect();
        json!({"op": "validate", "raw": echo, "ids": ids})
    }

    async fn resolve_env(&self, index: usize, step: &Value) -> Value {
        let (raw, echo) = self.raw_of(index, step);
        let ctx = self.env_ctx(platform_of(step["platform"].as_str().unwrap()));
        let base = strings_of(&self.rig.expand_value(&step["base"]));
        let asked: Mutex<BTreeMap<String, Option<String>>> = Mutex::new(BTreeMap::new());
        let lookup = |key: &str| -> Option<String> {
            let value = base.get(key).cloned();
            asked.lock().unwrap().insert(key.to_string(), value.clone());
            value
        };
        let installer =
            ScriptedInstaller::new(step["install"].as_str().unwrap(), self.rig.root_a());
        let result = resolve_overlay_env(
            &ctx,
            raw,
            "test",
            step["wineType"].as_str(),
            &lookup,
            &installer,
        )
        .await;
        json!({
            "op": "resolveEnv", "raw": echo, "platform": step["platform"],
            "wineType": step.get("wineType").cloned().unwrap_or(Value::Null),
            "base": step["base"], "install": step["install"],
            "result": result,
            "baseAsked": asked.into_inner().unwrap(),
            "ensureCalls": installer.calls(),
        })
    }

    async fn profile_env(&self, step: &Value) -> Value {
        let ctx = self.env_ctx(Platform::Mac);
        let settings = self.rig.expand_value(&step["settings"]);
        let tier1 = strings_of(&self.rig.expand_value(&step["tier1Env"]));
        let process = strings_of(&step["processEnv"]);
        let installer =
            ScriptedInstaller::new(step["install"].as_str().unwrap(), self.rig.root_a());
        let runner = Runner::parse(step["runner"].as_str().unwrap()).unwrap();
        let result = profile_overlay_env_with(
            &ctx,
            step["appName"].as_str().unwrap(),
            runner,
            &settings,
            &tier1,
            &process,
            &installer,
        )
        .await;
        json!({
            "op": "profileEnv", "appName": step["appName"], "runner": step["runner"],
            "settings": step["settings"], "tier1Env": step["tier1Env"],
            "processEnv": step["processEnv"],
            "result": result, "ensureCalls": installer.calls(),
        })
    }

    fn pure(&self, index: usize, step: &Value) -> Value {
        let op = step["op"].as_str().unwrap();
        match op {
            "appendPathList" => json!({
                "op": op, "existing": step.get("existing").cloned().unwrap_or(Value::Null),
                "dir": step["dir"],
                "result": append_path_list(step["existing"].as_str(), step["dir"].as_str().unwrap()),
            }),
            "lastEnvOption" => {
                let options = env_options_of(&json!({"enviromentOptions": step["options"]}));
                json!({
                    "op": op, "options": step.get("options").cloned().unwrap_or(Value::Null),
                    "key": step["key"],
                    "result": last_env_option(&options, step["key"].as_str().unwrap()),
                })
            }
            "formatLine" => json!({
                "op": op, "entries": step["entries"],
                "result": format_known_fix_env_line(&env_lines(&step["entries"])),
            }),
            "logLine" => {
                let ctx = self.env_ctx(Platform::Mac);
                json!({
                    "op": op, "label": step["label"], "entries": step["entries"],
                    "result": log_known_fix_env(
                        &ctx, step["label"].as_str().unwrap(), &env_lines(&step["entries"])),
                })
            }
            "withEnv" => {
                let env: Vec<(String, String)> = strings_of(&step["env"]).into_iter().collect();
                let count = |v: &Value| v["enviromentOptions"].as_array().map(Vec::len);
                let before = count(&step["settings"]);
                let out = with_known_fix_env(&step["settings"], &env);
                json!({
                    "op": op, "settings": step["settings"], "env": step["env"],
                    "result": out.clone().into_owned(),
                    "isTheSameObject": matches!(out, std::borrow::Cow::Borrowed(_)),
                    "originalOptionCountAfter": count(&step["settings"]),
                    "originalOptionCountBefore": before,
                })
            }
            "filterTier1" => {
                let ctx = self.env_ctx(Platform::Mac);
                let parsed = js_step(self.js_case, index, "parsed").expect("parsed");
                let out = filter_tier1_known_fixes(
                    &ctx,
                    step["appName"].as_str().unwrap(),
                    step["layer"].as_str().unwrap(),
                    parsed,
                )
                .map(|f| serde_json::to_value(f).unwrap());
                json!({
                    "op": op, "appName": step["appName"], "layer": step["layer"],
                    "parsed": step["parsed"],
                    "hasOverlays": out.as_ref().is_some_and(|v| v.get("overlays").is_some()),
                    "result": out,
                })
            }
            other => panic!("unknown step op {other}"),
        }
    }

    fn catalogue(&self) -> Value {
        let real = lookup("gst-libav-1.24.13").expect("gst-libav-1.24.13 is not in the catalogue");
        let table = gamelib_knownfix::catalogue::catalogue().unwrap();
        json!({
            "op": "catalogue",
            "paths": real.files.iter().map(|f| f.path.clone()).collect::<Vec<_>>(),
            "everyFileShaIs64Hex": real.files.iter().all(|f| f.sha256.len() == 64
                && f.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))),
            "totalFileBytes": real.files.iter().map(|f| f.size).sum::<u64>(),
            "archiveSha256": real.archive_sha256,
            "archiveSize": real.archive_size,
            "url": archive_url(real),
            "pluginSubdir": real.plugin_subdir,
            "filesInPluginSubdir": real.files.iter()
                .filter(|f| f.path.starts_with("lib/gstreamer-1.0/")).count(),
            "tableHoldsThisEntry": table.entries.iter().any(|e| std::ptr::eq(e, real)),
            "protoLookup": lookup("__proto__").map(|e| e.id.clone()),
            "constructorLookup": lookup("constructor").map(|e| e.id.clone()),
        })
    }
}

/// The golden's warning line as the Rust side is specified to say it (`deltas.json`): a fetch that
/// failed says what the seam's error says (`status(500)`), not axios's `HTTP 500`.
fn expected_line(golden: &str) -> String {
    golden
        .replace("not installed (HTTP 500)", "not installed (status(500))")
        // A rejected entry is echoed without the URL it carried (prohibition 1, `deltas.json`).
        .replace("https://evil.example/x.tar.gz", "<url>")
}

/// The golden's verify reason for an fs error is `ENOENT: ... lstat '<path>'`; Rust says the OS's text.
fn expected_reason(rig: &Rig, golden: &str) -> String {
    if golden.starts_with("ENOENT:") {
        not_found_text(rig)
    } else {
        golden.to_string()
    }
}

/// Runs one case on a fresh fake HOME; `(result, events, tree)` normalised like the golden.
#[cfg(unix)]
async fn run_case(case: &Value, js_case: &JsValue) -> (Value, Value, Value) {
    let rig = Rig::new();
    let fixture = Fixture::new(case);
    let run = Run {
        rig: &rig,
        fixture: &fixture,
        js_case,
    };
    let mut steps = Vec::new();
    let mut events = Vec::new();
    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        rig.seed(&step["seed"]);
        let before = rig.log.lines().len();
        let answer = match step["op"].as_str().unwrap() {
            "ensure" => run.ensure(step).await,
            "damage" => run.damage(step["kind"].as_str().unwrap()),
            "verify" => run.verify(step),
            "catalogue" => run.catalogue(),
            "validate" => run.validate(index, step),
            "resolveEnv" => run.resolve_env(index, step).await,
            "profileEnv" => run.profile_env(step).await,
            _ => run.pure(index, step),
        };
        steps.push(answer);
        for (level, line) in rig.log.lines().into_iter().skip(before) {
            // Prohibition 1: a line carries ids, labels and reasons, never a URL or a path of this machine.
            assert!(
                !line.contains("://") && !line.contains(&*rig.root().to_string_lossy()),
                "a log line carries a URL or a path: {line}"
            );
            events.push(json!({
                "step": index,
                "level": if level == "warn" { "warning" } else { level },
                "text": rig.normalise_text(&line),
            }));
        }
    }
    let result = rig.normalise_value(json!({ "steps": steps }));
    let tree = snapshot_tree(&rig);
    (result, Value::Array(events), tree)
}

/// A golden `result.json` as the Rust side is specified to answer it.
fn expected_result(rig: &Rig, golden: &Value) -> Value {
    let mut want = golden.clone();
    for step in want["steps"].as_array_mut().unwrap() {
        if step["op"] == "verify" {
            if let Some(reason) = step["reason"].as_str() {
                step["reason"] = Value::String(expected_reason(rig, reason));
            }
        }
    }
    want
}

#[cfg(unix)]
#[tokio::test(start_paused = true)]
async fn every_install_golden_replays() {
    let cases = load_cases();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    let js_cases = load_js_cases();
    let mut skipped_debug = 0usize;
    for (case, js_case) in cases.iter().zip(&js_cases) {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let (result, events, tree) = run_case(case, js_case).await;
        let rig = Rig::new();
        let want_result = expected_result(&rig, &read_json(&dir.join("result.json")));
        let want_events = Value::Array(
            read_json(&dir.join("events.json"))
                .as_array()
                .unwrap()
                .iter()
                .filter(|e| {
                    // The TS wrote the `skipped` line at debug level; the Rust log has no such level
                    // (`deltas.json`), so the line is dropped, and nothing else is.
                    if e["level"] == "debug" {
                        assert!(
                            e["text"].as_str().unwrap().contains(SKIPPED_DEBUG_MARKER),
                            "{id}: a debug line that is not a skipped-overlay line: {e}"
                        );
                        skipped_debug += 1;
                        return false;
                    }
                    true
                })
                .map(|e| {
                    json!({"step": e["step"], "level": e["level"],
                           "text": expected_line(e["text"].as_str().unwrap())})
                })
                .collect(),
        );
        let want_tree = read_json(&dir.join("tree.json"));
        if result != want_result {
            failures.push(format!(
                "{id}: result\n  want {want_result}\n  got  {result}"
            ));
        }
        if events != want_events {
            failures.push(format!(
                "{id}: events\n  want {want_events}\n  got  {events}"
            ));
        }
        if tree != want_tree {
            failures.push(format!("{id}: tree\n  want {want_tree}\n  got  {tree}"));
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor(
        "golden/overlay_install cases compared",
        compared,
        OVERLAY_INSTALL_FLOOR,
    )
    .unwrap();
    println!(
        "compared {compared} overlay install and env cases, dropped {skipped_debug} debug lines"
    );
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let cases = load_cases();
    assert_eq!(manifest["count"].as_u64(), Some(cases.len() as u64));
    assert!(OVERLAY_INSTALL_FLOOR <= cases.len());
    let ids: std::collections::BTreeSet<&str> =
        cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), cases.len(), "case ids repeat");
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "one expected folder per case");
    let err = check_floor("golden/overlay_install cases", 0, OVERLAY_INSTALL_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

#[test]
fn the_cases_split_into_18_install_cases_and_23_env_cases() {
    let cases = load_cases();
    let install = cases.iter().filter(|c| is_install_case(c)).count();
    assert_eq!((install, cases.len() - install), (18, 23));
}

#[test]
fn no_case_reaches_the_real_catalogue_archive() {
    for case in load_cases() {
        for step in case["steps"].as_array().unwrap() {
            if step["op"] == "ensure" {
                assert_ne!(
                    step["entryId"].as_str().unwrap_or(FIXTURE_ID),
                    "gst-libav-1.24.13",
                    "{}: a case that installs the real overlay",
                    case["id"]
                );
            }
        }
    }
}

#[test]
fn the_install_removes_nothing_but_through_gamelib_safety_and_spawns_nothing() {
    // T-88-26: every recursive removal goes through gamelib-safety; and the archive is unpacked in
    // process, so there is no `tar` child to spawn (T-88-23).
    let source = include_str!("../src/overlay/install.rs");
    for banned in [
        "remove_dir_all",
        "std::process::Command",
        "tokio::process",
        "Command::new",
    ] {
        assert!(!source.contains(banned), "install.rs mentions {banned}");
    }
    assert!(source.contains("gamelib_safety"));
    let archive = include_str!("../src/overlay/archive.rs");
    for banned in ["std::process", "tokio::process", "Command::new", "std::fs"] {
        assert!(!archive.contains(banned), "archive.rs mentions {banned}");
    }
}

/// The type is part of the contract: a verify error answers its reason as text.
#[allow(dead_code)]
fn verify_error_has_a_reason(e: &VerifyError) -> String {
    e.reason()
}

/// The deadline in the TS and in the context.
#[test]
fn the_download_bound_is_120_seconds() {
    assert_eq!(DEFAULT_DEADLINE_MS, 120_000);
    assert_eq!(
        OverlayInstalls::new().timeout(),
        Duration::from_millis(DEFAULT_DEADLINE_MS)
    );
}
