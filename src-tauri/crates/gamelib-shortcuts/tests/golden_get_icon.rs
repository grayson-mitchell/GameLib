//! Replays the `getIcon` goldens recorded from the TypeScript (94-07) through the Rust port (94-16):
//! `golden/get_icon` over `getIcon` in `backend/shortcuts/utils.ts`. A golden is the TS's answer, never a
//! value typed here.
//!
//! Each case builds a fresh `FakeHome` with the install tree and the icons already present, answers every
//! download through a URL-keyed `Replay` (nothing reaches the network), and checks the returned path, the
//! URLs requested and the icon folder's listing. The TS resolved the GOG product API itself; here that
//! answer is the `gog_product_icon_url` input, so the one case where the API REJECTED is a caller-side
//! failure: `get_icon` is never reached and the case asserts exactly that.
//!
//! The anti-vacuity floor: the directory matches its manifest, and every manifest case is replayed.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_shortcuts::ctx::{Platform, ShortcutPaths, ShortcutsCtx, ShortcutsLog};
use gamelib_shortcuts::http::{Http, HttpError, HttpFuture, Replay, Request, Response};
use gamelib_shortcuts::icons::{get_icon, gog_local_icon, IconInput};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::Value;

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join("get_icon")
}

fn load() -> (usize, usize, BTreeMap<String, Value>) {
    let dir = golden_dir();
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(dir.join("MANIFEST.json")).expect("a slice has a MANIFEST.json"),
    )
    .expect("MANIFEST.json is JSON");
    let mut cases = BTreeMap::new();
    for entry in fs::read_dir(&dir).expect("the slice directory exists") {
        let path = entry.expect("a directory entry").path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if !name.ends_with(".json") || name == "MANIFEST.json" {
            continue;
        }
        let text = fs::read_to_string(&path).expect("a golden is readable");
        let value: Value = serde_json::from_str(&text)
            .unwrap_or_else(|e| panic!("get_icon/{name}: not JSON: {e}"));
        cases.insert(name.trim_end_matches(".json").to_string(), value);
    }
    (
        manifest["count"].as_u64().expect("count") as usize,
        manifest["floor"].as_u64().expect("floor") as usize,
        cases,
    )
}

/// A log sink that keeps every line.
#[derive(Default)]
struct Lines(Mutex<Vec<String>>);

impl ShortcutsLog for Lines {
    fn line(&self, text: &str) {
        self.0.lock().expect("the log").push(text.to_string());
    }
}

fn ctx_for(
    home: &FakeHome,
    http: Arc<dyn Http>,
    shutdown: Shutdown,
    log: Arc<Lines>,
) -> ShortcutsCtx {
    let root = home.root().to_path_buf();
    ShortcutsCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Mac,
        shutdown,
    )
    .with_paths(ShortcutPaths {
        user_home: root.clone(),
        icon_folder: root.join("icons"),
        shell_exe: root.join("shell-exe"),
        cwd: root,
        ..ShortcutPaths::default()
    })
    .with_http(http)
    .with_log(log)
}

/// The golden's path form: the icon folder as `<ICONS>`, the profile as `<HOME>`, forward slashes.
fn golden_form(path: &Path, home: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let home = home.to_string_lossy().replace('\\', "/");
    let icons = format!("{home}/icons");
    if let Some(rest) = text.strip_prefix(&icons) {
        format!("<ICONS>{rest}")
    } else if let Some(rest) = text.strip_prefix(&home) {
        format!("<HOME>{rest}")
    } else {
        text
    }
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .expect("an array")
        .iter()
        .map(|v| v.as_str().expect("a string").to_string())
        .collect()
}

fn listing(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = match fs::read_dir(dir) {
        Ok(entries) => entries
            .map(|e| {
                e.expect("an entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    names.sort();
    names
}

#[tokio::test]
async fn get_icon_replays_every_golden() {
    let (count, floor, cases) = load();
    assert_eq!(
        cases.len(),
        count,
        "the directory and its manifest disagree"
    );
    assert!(
        cases.len() >= floor,
        "{} goldens is under the floor {floor}",
        cases.len()
    );
    let mut failures = Vec::new();
    let mut replayed = 0usize;
    let mut downloads = 0usize;
    let mut caller_side = 0usize;
    for (id, case) in &cases {
        replayed += 1;
        let input = &case["input"];
        let runner = input["runner"].as_str().expect("runner");
        let app_name = input["appName"].as_str().expect("appName");
        let home = FakeHome::new("gamelib-get-icon-");
        let icons = home.root().join("icons");

        // The GOG install tree (made even when the case withholds the install path from the game).
        let install = home.root().join("GOG Games").join("Icon Game");
        fs::create_dir_all(&install).expect("install root");
        for file in strings(&input["installFiles"]) {
            let path = install.join(&file);
            fs::create_dir_all(path.parent().expect("a parent")).expect("parents");
            fs::write(&path, b"x").expect("an install file");
        }
        let present = strings(&input["presentIcons"]);
        if input["iconsFolderExistedBefore"].as_bool() == Some(true) || !present.is_empty() {
            fs::create_dir_all(&icons).expect("icons folder");
        }
        for name in &present {
            fs::write(icons.join(name), b"already here").expect("a present icon");
        }
        let install_path =
            (input["installPathGiven"].as_bool() == Some(true)).then(|| install.clone());

        // The product API: the TS resolver's answer is an input here.
        let product_icon = match input["productApi"]["kind"].as_str().expect("kind") {
            "icon" => Some(
                input["productApi"]["icon"]
                    .as_str()
                    .expect("an icon")
                    .to_string(),
            ),
            "null" | "no-images" => None,
            "rejects" => {
                // The resolver failed before `get_icon`: nothing is requested and nothing is written.
                caller_side += 1;
                if case["outcome"]["result"].as_str() != Some("rejected")
                    || !strings(&case["downloads"]).is_empty()
                    || !strings(&case["iconsFolder"]).is_empty()
                {
                    failures.push(format!(
                        "{id}: a rejected case that touched the icon folder"
                    ));
                }
                continue;
            }
            other => panic!("{id}: product api kind {other}"),
        };

        // Every URL the TS downloaded is answered; any other URL is an error, so a wrong URL fails.
        let want_urls: Vec<String> = case["downloads"]
            .as_array()
            .expect("downloads")
            .iter()
            .map(|d| d["url"].as_str().expect("a url").to_string())
            .collect();
        let mut replay = Replay::new();
        for url in &want_urls {
            let answer = match input["download"].as_str().expect("download") {
                "ok" => Ok(Response {
                    status: 200,
                    body: format!("downloaded:{url}").into_bytes(),
                }),
                "fails" => Err(HttpError::Network("scripted failure".to_string())),
                // The TS download resolved and left no file: the nearest Rust case is an empty answer.
                "writes-nothing" => Ok(Response {
                    status: 200,
                    body: Vec::new(),
                }),
                other => panic!("{id}: download kind {other}"),
            };
            replay = replay.answer(url, answer);
        }
        let replay = Arc::new(replay);
        let log = Arc::new(Lines::default());
        let ctx = ctx_for(&home, replay.clone(), Shutdown::new(), log.clone());

        let is_gog = runner == "gog";
        // The caller contract: the API is consulted only when no local GOG file answered, and only for GOG.
        let local = install_path
            .as_deref()
            .filter(|_| is_gog)
            .and_then(|p| gog_local_icon(p, app_name));
        let api_calls = strings(&case["productApiCalls"]);
        let want_calls = if is_gog && local.is_none() {
            vec![app_name.to_string()]
        } else {
            Vec::new()
        };
        if api_calls != want_calls {
            failures.push(format!("{id}: the golden consulted the API {api_calls:?}, a lazy caller would {want_calls:?}"));
        }

        let got = get_icon(
            &ctx,
            &IconInput {
                app_name: app_name.to_string(),
                art_square: input["artSquare"].as_str().map(str::to_string),
                is_gog,
                install_path,
                gog_product_icon_url: product_icon,
            },
        )
        .await;

        let got_form = got.as_deref().map(|p| golden_form(p, home.root()));
        let want_form = case["outcome"]["icon"].as_str().map(str::to_string);
        if got_form != want_form {
            failures.push(format!("{id}: icon {got_form:?} want {want_form:?}"));
        }
        if replay.asked() != want_urls {
            failures.push(format!(
                "{id}: requested {:?} want {want_urls:?}",
                replay.asked()
            ));
        }
        downloads += want_urls.len();
        let want_listing = strings(&case["iconsFolder"]);
        let got_listing = listing(&icons);
        if got_listing != want_listing {
            failures.push(format!(
                "{id}: icon folder {got_listing:?} want {want_listing:?}"
            ));
        }
        // A successful download is exactly what the replay served.
        if let (Some(path), true) = (got.as_deref(), !want_urls.is_empty()) {
            let body = fs::read_to_string(path).unwrap_or_default();
            if body != format!("downloaded:{}", want_urls[0]) {
                failures.push(format!("{id}: the saved file holds {body:?}"));
            }
        }
        // A failed download leaves no URL in the log.
        for line in log.0.lock().expect("log").iter() {
            if line.contains("http") || line.contains("example") {
                failures.push(format!("{id}: a log line names a URL: {line}"));
            }
        }
    }
    println!(
        "get_icon goldens replayed: {replayed} ({downloads} downloads, {caller_side} caller-side)"
    );
    assert_eq!(replayed, count, "every manifest case must be replayed");
    assert!(downloads >= 6, "only {downloads} downloads replayed");
    assert!(
        failures.is_empty(),
        "get_icon mismatches:\n{}",
        failures.join("\n")
    );
}

#[tokio::test]
async fn a_download_error_answers_none_and_logs_fixed_text() {
    let home = FakeHome::new("gamelib-get-icon-err-");
    let url = "https://art.example.test/secret-token-abc/square.jpg";
    let replay = Arc::new(Replay::new().answer(url, Err(HttpError::Network("boom".to_string()))));
    let log = Arc::new(Lines::default());
    let ctx = ctx_for(&home, replay, Shutdown::new(), log.clone());
    let got = get_icon(
        &ctx,
        &IconInput {
            app_name: "app".to_string(),
            art_square: Some("https://art.example.test/secret-token-abc/square.{ext}".to_string()),
            ..IconInput::default()
        },
    )
    .await;
    assert_eq!(got, None);
    let lines = log.0.lock().expect("log").clone();
    assert!(!lines.is_empty(), "the failure is logged");
    for line in &lines {
        assert!(!line.contains("secret-token"), "{line}");
        assert!(!line.contains("art.example"), "{line}");
    }
    assert_eq!(listing(&home.root().join("icons")), Vec::<String>::new());
}

#[tokio::test]
async fn a_non_success_status_is_a_failed_download() {
    let home = FakeHome::new("gamelib-get-icon-404-");
    let url = "https://art.example.test/square.jpg";
    let replay = Arc::new(Replay::new().answer(
        url,
        Ok(Response {
            status: 404,
            body: b"not found".to_vec(),
        }),
    ));
    let ctx = ctx_for(&home, replay, Shutdown::new(), Arc::new(Lines::default()));
    let got = get_icon(
        &ctx,
        &IconInput {
            app_name: "app".to_string(),
            art_square: Some(url.to_string()),
            ..IconInput::default()
        },
    )
    .await;
    assert_eq!(got, None);
    assert_eq!(listing(&home.root().join("icons")), Vec::<String>::new());
}

#[tokio::test]
async fn an_app_name_that_is_not_a_file_name_gets_no_icon_and_writes_nothing() {
    let home = FakeHome::new("gamelib-get-icon-name-");
    let outside = home.root().join("outside.jpg");
    let replay = Arc::new(Replay::new());
    let ctx = ctx_for(
        &home,
        replay.clone(),
        Shutdown::new(),
        Arc::new(Lines::default()),
    );
    for name in ["../outside", "..\\outside", "a/b", "C:x", ".."] {
        let got = get_icon(
            &ctx,
            &IconInput {
                app_name: name.to_string(),
                art_square: Some("https://art.example.test/a.jpg".to_string()),
                ..IconInput::default()
            },
        )
        .await;
        assert_eq!(got, None, "{name}");
    }
    assert!(
        replay.asked().is_empty(),
        "nothing is requested for a bad name"
    );
    assert!(!outside.exists());
    assert!(
        !home.root().join("icons").exists(),
        "not even the folder is made"
    );
}

/// An `Http` that never answers, so a download stays in flight until shutdown ends it.
struct Hangs(Arc<AtomicBool>);

impl Http for Hangs {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        self.0.store(true, Ordering::SeqCst);
        Box::pin(std::future::pending())
    }
}

/// An in-flight download holds a `shortcuts-icon` registrant, and a cancelled shutdown token aborts it
/// without writing a file. The test runs on the current-thread runtime, so while it drains synchronously the
/// download task cannot run: it provably still holds its registrant at that moment.
#[tokio::test]
async fn shutdown_aborts_an_in_flight_download_and_the_registrant_is_released() {
    let home = FakeHome::new("gamelib-get-icon-shutdown-");
    let started = Arc::new(AtomicBool::new(false));
    let shutdown = Shutdown::new();
    let ctx = Arc::new(ctx_for(
        &home,
        Arc::new(Hangs(started.clone())),
        shutdown.clone(),
        Arc::new(Lines::default()),
    ));
    let task_ctx = ctx.clone();
    let handle = tokio::spawn(async move {
        get_icon(
            &task_ctx,
            &IconInput {
                app_name: "app".to_string(),
                art_square: Some("https://art.example.test/a.jpg".to_string()),
                ..IconInput::default()
            },
        )
        .await
    });
    while !started.load(Ordering::SeqCst) {
        tokio::task::yield_now().await;
    }
    let held = shutdown.drain(Duration::ZERO);
    assert!(held.contains(&"shortcuts-icon"), "held: {held:?}");
    assert_eq!(handle.await.expect("the task ends"), None);
    assert_eq!(
        shutdown.drain(Duration::ZERO),
        Vec::<&str>::new(),
        "released"
    );
    assert_eq!(listing(&home.root().join("icons")), Vec::<String>::new());
}
