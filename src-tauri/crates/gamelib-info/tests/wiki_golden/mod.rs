//! What the wiki golden suites share (86-20): the fixtures, the MANIFEST rules every oracle suite
//! carries, a clock that only moves when told, a tap that records each request, and the tree
//! comparison of the files a case leaves behind. `golden_umu.rs` and `golden_wiki_sources.rs` each use
//! a part of it.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_info::ctx::{InfoCtx, InfoLog, InfoPaths, Platform};
use gamelib_info::http::{Http, HttpFuture, Request};
use serde_json::Value;

/// The instant every case starts at (the oracle's `ORACLE_NOW`): 2026-11-22T12:00:00Z.
pub const ORACLE_NOW: u64 = 1_795_348_800_000;

pub fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

pub fn golden_dir() -> PathBuf {
    fixtures().join("golden/wiki")
}

pub fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// The manifest rules every oracle suite carries: the count equals the cases, it is at or above the
/// floor, and `expected/` holds one folder per case. `Err` names the failure.
pub fn check_manifest(
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

pub fn expected_folders() -> Vec<String> {
    std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

/// A clock that only moves when a case says so.
pub struct TestClock(pub AtomicU64);

impl Clock for TestClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// Wraps an [`Http`] and records `<METHOD> <url>` per request. Nothing in this slice puts a key in a URL.
pub struct Tap {
    pub inner: Arc<dyn Http>,
    pub seen: Mutex<Vec<String>>,
    /// The header names of each request, in the same order as `seen`.
    pub header_names: Mutex<Vec<Vec<String>>>,
}

impl Http for Tap {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        self.seen
            .lock()
            .unwrap()
            .push(format!("{} {}", request.method.as_str(), request.url));
        self.header_names
            .lock()
            .unwrap()
            .push(request.headers.iter().map(|(k, _)| k.to_string()).collect());
        self.inner.send(request)
    }
}

impl Tap {
    pub fn new(inner: Arc<dyn Http>) -> Tap {
        Tap {
            inner,
            seen: Mutex::new(Vec::new()),
            header_names: Mutex::new(Vec::new()),
        }
    }

    pub fn count(&self) -> usize {
        self.seen.lock().unwrap().len()
    }

    pub fn urls(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }
}

/// Keeps every diagnostic line the crate wrote.
#[derive(Default)]
pub struct Lines(pub Mutex<Vec<String>>);

impl InfoLog for Lines {
    fn line(&self, text: &str) {
        self.0.lock().unwrap().push(text.to_string());
    }
}

pub fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// Every file under `root`, as relative path (with `/`) to bytes.
pub fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(dir: &Path, root: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        let Ok(read) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in read {
            let entry = entry.unwrap();
            let path = entry.path();
            if entry.file_type().unwrap().is_dir() {
                walk(&path, root, out);
            } else {
                let rel = path
                    .strip_prefix(root)
                    .unwrap()
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                out.insert(rel, std::fs::read(&path).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

pub fn platform_of(word: &str) -> Platform {
    match word {
        "mac" => Platform::Mac,
        "linux" => Platform::Linux,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

/// A ctx over a fake profile seeded from `state/wiki/<id>` (when the case has one), the oracle's clock,
/// the version the recorded TS requests carry in their User-Agent, and `http` as the transport.
pub fn case_ctx(
    case: &Value,
    home: &gamelib_testutil::FakeHome,
    clock: &Arc<TestClock>,
    http: Arc<dyn Http>,
) -> (InfoCtx, PathBuf) {
    let id = case["id"].as_str().unwrap();
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    let state = fixtures().join("state/wiki").join(id);
    if state.is_dir() {
        copy_tree(&state, &user_data);
    }
    let ctx = InfoCtx::new(
        Arc::new(gamelib_store::host::StoreHost::new()),
        Arc::clone(clock) as Arc<dyn Clock>,
        platform_of(case["platform"].as_str().unwrap()),
        InfoPaths {
            app_folder: user_data.clone(),
            user_data: user_data.clone(),
            temp: home.root().join("temp"),
            public_dir: Some(user_data.join("public")),
        },
        "0.11.0".to_string(),
        gamelib_core::shutdown::Shutdown::new(),
        http,
    );
    (ctx, user_data)
}
