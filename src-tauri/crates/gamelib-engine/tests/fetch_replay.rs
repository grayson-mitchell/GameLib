//! The Fetch seam end to end (87-06 task 1): a recorded GET and a streamed download replayed byte
//! for byte through `Replay`, with the progress throttle and the cancel, and the real `ReqwestFetch`
//! proven against a local socket server. The recorded cases under `tests/fixtures/recorded/
//! fetch_selftest/` are small, hand-written exchanges in the oracle recorder's shape.

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_engine::fetch::{
    plan_ranges, user_agent, DownloadOutcome, Fetch, FetchError, FetchRequest, Progress, Replay,
    ReqwestFetch,
};
use gamelib_engine::testing::FixedClock;
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
        .with_clock(Arc::new(FixedClock::stepping(0, 400)));
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
        .with_clock(Arc::new(FixedClock::stepping(0, 1000)));
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

// ---- ranged downloads (quick 261123-txk) ----

/// The ranged Replay cases serve the 5000-byte body of `download` as ten 500-byte ranges.
fn ranged_body() -> Vec<u8> {
    recorded_body("download", "body-2.bin")
}

#[tokio::test]
async fn a_ranged_download_is_joined_whatever_order_the_ranges_were_recorded_in() {
    // The case records the ten ranges in REVERSE order: each GET finds its exchange by `range`.
    let body = ranged_body();
    let replay = Replay::from_case(&case("download-ranged"))
        .unwrap()
        .with_chunk_size(1024);
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("sub").join("tool.tar.xz");
    let seen = Mutex::new(Vec::new());

    let outcome = download(&replay, &dest, &seen, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.bytes, 5000);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    assert_eq!(files_under(dest.parent().unwrap()), ["tool.tar.xz"]);
    replay.finish().unwrap();
}

#[tokio::test]
async fn a_probe_answered_200_is_streamed_as_the_whole_file_with_no_further_request() {
    let body = ranged_body();
    let replay = Replay::from_case(&case("download-ranged-ignored")).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");
    let seen = Mutex::new(Vec::new());

    let outcome = download(&replay, &dest, &seen, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    assert_eq!(files_under(tmp.path()), ["tool.tar.xz"]);
    // Clean: the HEAD and the probe were the only exchanges, and both were used.
    replay.finish().unwrap();
}

#[tokio::test]
async fn a_head_with_ranges_but_no_length_is_one_plain_stream() {
    let body = ranged_body();
    let replay = Replay::from_case(&case("download-ranged-no-length")).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");
    let seen = Mutex::new(Vec::new());

    download(&replay, &dest, &seen, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    replay.finish().unwrap();
}

#[tokio::test]
async fn a_206_for_another_total_is_network_and_leaves_no_file() {
    // The probe's Content-Range says /4000 but the HEAD said 5000: the file changed, or lies.
    let replay = Replay::from_case(&case("download-ranged-bad-probe")).unwrap();
    let tmp = tempfile::tempdir().unwrap();
    let seen = Mutex::new(Vec::new());

    let result = download(
        &replay,
        &tmp.path().join("tool.tar.xz"),
        &seen,
        CancellationToken::new(),
    )
    .await;

    assert_eq!(result.unwrap_err(), FetchError::Network);
    assert_eq!(files_under(tmp.path()), Vec::<String>::new());
    replay.finish().unwrap();
}

#[tokio::test]
async fn a_cancel_in_a_ranged_download_is_aborted_with_one_report_and_no_file() {
    let replay = Replay::from_case(&case("download-ranged"))
        .unwrap()
        .with_chunk_size(100)
        .with_clock(Arc::new(FixedClock::stepping(0, 1000)));
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
    // No `finish()`: a cancel leaves recorded ranges unrequested by design.
    assert_eq!(files_under(tmp.path()), Vec::<String>::new());
}

#[tokio::test]
async fn ranged_progress_never_goes_backwards_and_ends_at_a_hundred() {
    let replay = Replay::from_case(&case("download-ranged"))
        .unwrap()
        .with_chunk_size(100)
        .with_clock(Arc::new(FixedClock::stepping(0, 400)));
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
    assert!(seen.len() > 1, "{seen:?}");
    assert!(seen.iter().all(|p| p.total == 5000));
    assert!(
        seen.windows(2).all(|w| w[1].bytes >= w[0].bytes),
        "{seen:?}"
    );
    let last = seen[seen.len() - 1];
    assert_eq!(
        (last.bytes, last.total, last.percentage),
        (5000, 5000, 100.0)
    );
}

/// How the range server answers a ranged GET.
#[derive(Clone, Copy, PartialEq)]
enum RangeMode {
    /// 206 with the slice.
    Honour,
    /// 200 with the whole body, to every ranged GET.
    IgnoreAll,
    /// 206 for the range starting at 0 (the probe), 200 with the whole body for every other.
    IgnoreAfterProbe,
    /// 206, except the range starting at 2500, which is a 500.
    FailAt2500,
}

struct RangeServer {
    addr: SocketAddr,
    /// `<METHOD> <path> <range or ->`, one per request, in arrival order.
    log: Arc<Mutex<Vec<String>>>,
    /// The most ranged GETs open at once (head read to the answer being written).
    peak: Arc<AtomicUsize>,
}

impl RangeServer {
    /// The log entries for `path`, the target of the `/moved/` redirect.
    fn entries(&self, path: &str) -> Vec<String> {
        let prefix = format!(" {path} ");
        self.log
            .lock()
            .unwrap()
            .iter()
            .filter(|l| l.contains(&prefix))
            .cloned()
            .collect()
    }
}

/// A local HTTP/1.1 server that advertises `Accept-Ranges: bytes`, serves `/moved/<name>` as a 302
/// to `/<name>`, and answers a ranged GET as `mode` says. Every ranged GET waits 50 ms before its
/// answer, so parallel ones overlap and `peak` shows it.
async fn range_server(body: Vec<u8>, mode: RangeMode) -> RangeServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let log: Arc<Mutex<Vec<String>>> = Arc::default();
    let peak = Arc::new(AtomicUsize::new(0));
    let current = Arc::new(AtomicUsize::new(0));
    let (log_in, peak_in) = (log.clone(), peak.clone());
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else {
                return;
            };
            let (body, log, peak, current) = (
                body.clone(),
                log_in.clone(),
                peak_in.clone(),
                current.clone(),
            );
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
                let mut first = text.lines().next().unwrap_or_default().split(' ');
                let method = first.next().unwrap_or_default().to_string();
                let path = first.next().unwrap_or_default().to_string();
                let range = text
                    .lines()
                    .find_map(|l| {
                        l.to_ascii_lowercase()
                            .strip_prefix("range: bytes=")
                            .map(str::to_string)
                    })
                    .map(|r| {
                        let mut parts = r.trim().split('-');
                        let a: usize = parts.next().unwrap().parse().unwrap();
                        let b: usize = parts.next().unwrap().parse().unwrap();
                        (a, b)
                    });
                let shown = range.map_or("-".to_string(), |(a, b)| format!("bytes={a}-{b}"));
                log.lock().unwrap().push(format!("{method} {path} {shown}"));
                if let Some(name) = path.strip_prefix("/moved/") {
                    let answer = format!(
                        "HTTP/1.1 302 Found\r\nLocation: /{name}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    );
                    let _ = stream.write_all(answer.as_bytes()).await;
                    let _ = stream.shutdown().await;
                    return;
                }
                let whole = |status: &str, payload: &[u8], extra: &str| {
                    let mut out = format!(
                        "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n",
                        payload.len()
                    )
                    .into_bytes();
                    if method == "GET" {
                        out.extend_from_slice(payload);
                    }
                    out
                };
                let answer = match (method.as_str(), range) {
                    ("HEAD", _) => whole("200 OK", &body, "Accept-Ranges: bytes\r\n"),
                    (_, None) => whole("200 OK", &body, ""),
                    (_, Some((a, b))) => {
                        let open = current.fetch_add(1, Ordering::SeqCst) + 1;
                        peak.fetch_max(open, Ordering::SeqCst);
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        // Leave the count before the answer is written, so a client that starts its
                        // next range on seeing this one finish cannot be counted beside it.
                        current.fetch_sub(1, Ordering::SeqCst);
                        let ignore = mode == RangeMode::IgnoreAll
                            || (mode == RangeMode::IgnoreAfterProbe && a != 0);
                        if ignore {
                            whole("200 OK", &body, "")
                        } else if mode == RangeMode::FailAt2500 && a == 2500 {
                            whole("500 Internal Server Error", b"", "")
                        } else {
                            let total = body.len();
                            whole(
                                "206 Partial Content",
                                &body[a..=b],
                                &format!("Content-Range: bytes {a}-{b}/{total}\r\n"),
                            )
                        }
                    }
                };
                let _ = stream.write_all(&answer).await;
                let _ = stream.shutdown().await;
            });
        }
    });
    RangeServer { addr, log, peak }
}

async fn ranged_download(
    server: &RangeServer,
    path: &str,
    dest: &Path,
) -> Result<DownloadOutcome, FetchError> {
    let fetch = ReqwestFetch::new();
    let url = format!("http://{}{path}", server.addr);
    fetch
        .download(
            FetchRequest::get(&url).gamelib_agent(VERSION),
            dest,
            &|_| {},
            CancellationToken::new(),
        )
        .await
}

fn expected_ranges() -> Vec<String> {
    let mut ranges: Vec<String> = plan_ranges(5000)
        .unwrap()
        .iter()
        .map(|(a, b)| format!("bytes={a}-{b}"))
        .collect();
    ranges.sort();
    ranges
}

#[tokio::test]
async fn reqwest_fetch_downloads_in_ranges_over_a_redirect_and_at_most_five_connections() {
    let body = ranged_body();
    let server = range_server(body.clone(), RangeMode::Honour).await;
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");

    let outcome = ranged_download(&server, "/moved/tool.tar.xz", &dest)
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.bytes, 5000);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    assert_eq!(files_under(tmp.path()), ["tool.tar.xz"]);
    let entries = server.entries("/tool.tar.xz");
    let heads: Vec<&String> = entries.iter().filter(|l| l.starts_with("HEAD")).collect();
    assert_eq!(heads.len(), 1, "{entries:?}");
    let mut ranges: Vec<String> = entries
        .iter()
        .filter(|l| l.starts_with("GET"))
        .map(|l| l.rsplit(' ').next().unwrap().to_string())
        .collect();
    ranges.sort();
    // Each ranged GET kept its Range across the 302.
    assert_eq!(ranges, expected_ranges());
    let peak = server.peak.load(Ordering::SeqCst);
    assert!((2..=5).contains(&peak), "{peak} ranged GETs open at once");
}

#[tokio::test]
async fn a_server_that_answers_every_range_200_gets_one_get() {
    let body = ranged_body();
    let server = range_server(body.clone(), RangeMode::IgnoreAll).await;
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");

    let outcome = ranged_download(&server, "/tool.tar.xz", &dest)
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    let entries = server.entries("/tool.tar.xz");
    assert_eq!(entries.len(), 2, "the HEAD and one GET: {entries:?}");
    assert!(entries[0].starts_with("HEAD"));
    assert!(entries[1].starts_with("GET"));
    assert_eq!(files_under(tmp.path()), ["tool.tar.xz"]);
}

#[tokio::test]
async fn a_200_to_a_later_range_restarts_as_one_plain_get() {
    let body = ranged_body();
    let server = range_server(body.clone(), RangeMode::IgnoreAfterProbe).await;
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");

    let outcome = ranged_download(&server, "/tool.tar.xz", &dest)
        .await
        .unwrap();

    assert_eq!(std::fs::read(&dest).unwrap(), body);
    assert_eq!(outcome.sha256, sha256_hex(&body));
    let entries = server.entries("/tool.tar.xz");
    let plain: Vec<&String> = entries
        .iter()
        .filter(|l| l.starts_with("GET") && l.ends_with(" -"))
        .collect();
    assert_eq!(
        plain.len(),
        1,
        "exactly one GET without a Range: {entries:?}"
    );
    assert!(entries
        .iter()
        .any(|l| l.starts_with("GET") && !l.ends_with(" -")));
    // No `.part` left behind.
    assert_eq!(files_under(tmp.path()), ["tool.tar.xz"]);
}

#[tokio::test]
async fn a_failed_range_is_its_status_and_leaves_nothing_behind() {
    let server = range_server(ranged_body(), RangeMode::FailAt2500).await;
    let tmp = tempfile::tempdir().unwrap();
    let dest = tmp.path().join("tool.tar.xz");

    let result = ranged_download(&server, "/tool.tar.xz", &dest).await;

    assert_eq!(result.unwrap_err(), FetchError::Status(500));
    assert_eq!(files_under(tmp.path()), Vec::<String>::new());
}
