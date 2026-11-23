//! The Fetch seam end to end (87-06 task 1): a recorded GET and a streamed download replayed byte
//! for byte through `Replay`, with the progress throttle and the cancel, and the real `ReqwestFetch`
//! proven against a local socket server. The recorded cases under `tests/fixtures/recorded/
//! fetch_selftest/` are small, hand-written exchanges in the oracle recorder's shape.

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_engine::fetch::{
    user_agent, DownloadOutcome, Fetch, FetchError, FetchRequest, Progress, Replay, ReqwestFetch,
};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

const VERSION: &str = "0.11.0";
const DOWNLOAD_URL: &str = "https://downloads.example.test/acme/tool/tool-2.1.0.tar.xz";

fn case(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("recorded")
        .join("fetch_selftest")
        .join(name)
}

/// The bytes the `download` cases record (read from the fixture, so the test cannot drift from it).
fn recorded_body(name: &str, file: &str) -> Vec<u8> {
    std::fs::read(case(name).join(file)).unwrap()
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A clock that answers `start`, `start + step`, ... one call at a time, so a test decides how many
/// "seconds" each chunk costs without sleeping.
struct StepClock {
    next: AtomicU64,
    step: u64,
}

impl StepClock {
    fn new(step: u64) -> Arc<StepClock> {
        Arc::new(StepClock {
            next: AtomicU64::new(0),
            step,
        })
    }
}

impl Clock for StepClock {
    fn now_ms(&self) -> u64 {
        self.next.fetch_add(self.step, Ordering::SeqCst)
    }
}

fn recorded_get(url: &str) -> FetchRequest {
    FetchRequest::get(url).gamelib_agent(VERSION)
}

async fn download(
    fetch: &dyn Fetch,
    dest: &Path,
    seen: &Mutex<Vec<Progress>>,
    cancel: CancellationToken,
) -> Result<DownloadOutcome, FetchError> {
    fetch
        .download(
            recorded_get(DOWNLOAD_URL),
            dest,
            &|p| seen.lock().unwrap().push(p),
            cancel,
        )
        .await
}

fn files_under(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(read) = std::fs::read_dir(dir) {
        for entry in read.flatten() {
            out.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    out.sort();
    out
}

#[tokio::test]
async fn replay_serves_a_recorded_get_body() {
    let replay = Replay::from_case(&case("get-json")).unwrap();
    let url = "https://api.example.test/repos/acme/tool/releases?per_page=2&page=1";
    let response = replay.get(recorded_get(url)).await.unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(response.body, recorded_body("get-json", "body-1.json"));
    assert!(response
        .headers
        .iter()
        .any(|(k, v)| k == "content-type" && v == "application/json"));
    replay.finish().unwrap();
}

#[tokio::test]
async fn replay_streams_a_recorded_download_byte_for_byte() {
    let body = recorded_body("download", "body-2.bin");
    let replay = Replay::from_case(&case("download"))
        .unwrap()
        .with_chunk_size(1024);
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("sub").join("dir").join("tool.tar.xz");
    let seen = Mutex::new(Vec::new());

    let outcome = download(&replay, &dest, &seen, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.bytes, 5000);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    // The temp file the body streamed into is gone once it is renamed over the destination.
    assert_eq!(files_under(dest.parent().unwrap()), ["tool.tar.xz"]);
    replay.finish().unwrap();
}

#[tokio::test]
async fn replay_download_makes_only_the_get_when_no_head_was_recorded() {
    let body = recorded_body("download-get-only", "body-1.bin");
    let replay = Replay::from_case(&case("download-get-only")).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");
    let seen = Mutex::new(Vec::new());

    let outcome = download(&replay, &dest, &seen, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.bytes, body.len() as u64);
    replay.finish().unwrap();
}

#[tokio::test]
async fn an_unmatched_request_fails_naming_method_and_path() {
    let replay = Replay::from_case(&case("get-json")).unwrap();
    let error = replay
        .get(recorded_get("https://api.example.test/repos/acme/other"))
        .await
        .unwrap_err();
    // The caller sees a category, never the request.
    assert_eq!(error, FetchError::Network);
    let report = replay.finish().unwrap_err();
    assert!(
        report.contains("unmatched request: GET https://api.example.test/repos/acme/other"),
        "got: {report}"
    );
}

#[tokio::test]
async fn finish_fails_on_a_leftover_exchange_unless_it_is_ts_only() {
    let leftover = Replay::from_case(&case("leftover")).unwrap();
    leftover
        .get(recorded_get("https://api.example.test/a"))
        .await
        .unwrap();
    let report = leftover.finish().unwrap_err();
    assert!(
        report.contains("unconsumed recorded exchange(s): ex-2"),
        "got: {report}"
    );

    let ts_only = Replay::from_case(&case("leftover-ts-only")).unwrap();
    ts_only
        .get(recorded_get("https://api.example.test/a"))
        .await
        .unwrap();
    ts_only.finish().unwrap();
}

#[tokio::test]
async fn a_drifted_pinned_header_fails_even_if_the_caller_swallows_the_error() {
    let replay = Replay::from_case(&case("get-json")).unwrap();
    let url = "https://api.example.test/repos/acme/tool/releases?per_page=2&page=1";
    let drifted = FetchRequest::get(url).header("User-Agent", "axios/1.7.2");
    let _ = replay.get(drifted).await;
    let report = replay.finish().unwrap_err();
    assert!(report.contains("header user-agent"), "got: {report}");
}

#[tokio::test]
async fn progress_is_throttled_to_once_a_second_plus_a_final_hundred() {
    // 400 ms per clock read and five 1024-byte chunks: the third chunk is the first to be a second
    // past the start, the fifth is only 800 ms past it, so one throttled report and the final one.
    let replay = Replay::from_case(&case("download"))
        .unwrap()
        .with_chunk_size(1024)
        .with_clock(StepClock::new(400));
    let tmp = tempfile::tempdir().unwrap();
    let seen = Mutex::new(Vec::new());

    download(
        &replay,
        &tmp.path().join("tool.tar.xz"),
        &seen,
        CancellationToken::new(),
    )
    .await
    .unwrap();

    let seen = seen.into_inner().unwrap();
    let bytes: Vec<u64> = seen.iter().map(|p| p.bytes).collect();
    assert_eq!(bytes, [3072, 5000]);
    assert!(seen.iter().all(|p| p.total == 5000));
    assert!((seen[0].percentage - 61.44).abs() < 1e-9, "{:?}", seen[0]);
    assert_eq!(seen[1].percentage, 100.0);
}

#[tokio::test]
async fn a_cancel_mid_download_is_aborted_and_removes_the_partial_file() {
    // One clock step per second makes every chunk report; the first report cancels the download.
    let replay = Replay::from_case(&case("download"))
        .unwrap()
        .with_chunk_size(1024)
        .with_clock(StepClock::new(1000));
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");
    let cancel = CancellationToken::new();
    let trigger = cancel.clone();
    let reports = Mutex::new(0u32);

    let result = replay
        .download(
            recorded_get(DOWNLOAD_URL),
            &dest,
            &|_| {
                *reports.lock().unwrap() += 1;
                trigger.cancel();
            },
            cancel,
        )
        .await;

    assert_eq!(result.unwrap_err(), FetchError::Aborted);
    assert_eq!(*reports.lock().unwrap(), 1, "no report after the cancel");
    assert_eq!(files_under(tmp.path()), Vec::<String>::new());
}

#[tokio::test]
async fn a_failed_head_is_failed_to_get_headers() {
    let replay = Replay::from_case(&case("download-head-fails")).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let seen = Mutex::new(Vec::new());
    let result = download(
        &replay,
        &tmp.path().join("tool.tar.xz"),
        &seen,
        CancellationToken::new(),
    )
    .await;
    assert_eq!(result.unwrap_err(), FetchError::FailedToGetHeaders);
    assert_eq!(files_under(tmp.path()), Vec::<String>::new());
    replay.finish().unwrap();
}

#[tokio::test]
async fn a_404_download_is_status_404_and_leaves_no_file() {
    let replay = Replay::from_case(&case("download-404")).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let seen = Mutex::new(Vec::new());
    let result = download(
        &replay,
        &tmp.path().join("tool.tar.xz"),
        &seen,
        CancellationToken::new(),
    )
    .await;
    assert_eq!(result.unwrap_err(), FetchError::Status(404));
    assert_eq!(files_under(tmp.path()), Vec::<String>::new());
    replay.finish().unwrap();
}

#[test]
fn fetch_errors_are_categories_only() {
    assert_eq!(FetchError::Network.to_string(), "network");
    assert_eq!(FetchError::Status(404).to_string(), "status(404)");
    assert_eq!(
        FetchError::FailedToGetHeaders.to_string(),
        "failed-to-get-headers"
    );
    assert_eq!(FetchError::Aborted.to_string(), "aborted");
}

#[test]
fn the_user_agent_is_the_one_the_ts_client_sends() {
    assert_eq!(
        user_agent("0.11.0"),
        "GameLib/0.11.0 (+https://github.com/grayson-mitchell/GameLib)"
    );
}

/// What a local server saw: one `METHOD <user-agent>` line per request.
type Seen = Arc<Mutex<Vec<String>>>;

/// A tiny HTTP/1.1 server: HEAD answers the length, GET the body, `Connection: close`.
async fn local_server(body: Vec<u8>) -> (SocketAddr, Seen) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let seen: Seen = Arc::default();
    let log = seen.clone();
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                return;
            };
            let (body, log) = (body.clone(), log.clone());
            tokio::spawn(async move {
                let mut head = Vec::new();
                let mut buf = [0u8; 1024];
                while !head.windows(4).any(|w| w == b"\r\n\r\n") {
                    match stream.read(&mut buf).await {
                        Ok(0) | Err(_) => return,
                        Ok(n) => head.extend_from_slice(&buf[..n]),
                    }
                }
                let text = String::from_utf8_lossy(&head).to_string();
                let method = text.split(' ').next().unwrap_or_default().to_string();
                let agent = text
                    .lines()
                    .find_map(|l| {
                        l.to_ascii_lowercase()
                            .strip_prefix("user-agent: ")
                            .map(str::to_string)
                    })
                    .unwrap_or_default();
                log.lock().unwrap().push(format!("{method} {agent}"));
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(header.as_bytes()).await;
                if method == "GET" {
                    let _ = stream.write_all(&body).await;
                }
                let _ = stream.shutdown().await;
            });
        }
    });
    (addr, seen)
}

#[tokio::test]
async fn reqwest_fetch_gets_and_downloads_from_a_local_server() {
    let body = recorded_body("download", "body-2.bin");
    let (addr, seen) = local_server(body.clone()).await;
    let fetch = ReqwestFetch::new();
    let url = format!("http://{addr}/tool.tar.xz");

    let response = fetch
        .get(FetchRequest::get(&url).gamelib_agent(VERSION))
        .await
        .unwrap();
    assert_eq!((response.status, &response.body), (200, &body));

    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");
    let reports = Mutex::new(Vec::new());
    let outcome = fetch
        .download(
            FetchRequest::get(&url).gamelib_agent(VERSION),
            &dest,
            &|p| reports.lock().unwrap().push(p),
            CancellationToken::new(),
        )
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    let last = *reports.lock().unwrap().last().unwrap();
    assert_eq!(
        (last.bytes, last.total, last.percentage),
        (5000, 5000, 100.0)
    );
    let ua = user_agent(VERSION);
    assert_eq!(
        *seen.lock().unwrap(),
        [
            format!("GET {}", ua.to_ascii_lowercase()),
            format!("HEAD {}", ua.to_ascii_lowercase()),
            format!("GET {}", ua.to_ascii_lowercase()),
        ]
    );
}

#[tokio::test]
async fn a_reqwest_failure_carries_no_url_or_query() {
    // Bind then drop, so the port is free and the connect is refused.
    let addr = {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        listener.local_addr().unwrap()
    };
    let fetch = ReqwestFetch::new();
    let url = format!("http://{addr}/private/path?key=SECRET-KEY-VALUE");
    let error = fetch.get(FetchRequest::get(&url)).await.unwrap_err();
    assert_eq!(error, FetchError::Network);
    let shown = format!("{error} {error:?}");
    for leaked in ["SECRET-KEY-VALUE", "private", "127.0.0.1", "key="] {
        assert!(!shown.contains(leaked), "{leaked} leaked: {shown}");
    }
}
