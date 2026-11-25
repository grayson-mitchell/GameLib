//! Replays every Steam app-id resolver golden recorded from the TypeScript (94-09, D-05/D-06) through
//! the Rust resolver, over the HTTP seam's `Replay` pinned to the recorded wire requests (94-06).
//!
//! A golden is `{input: {seed}, trace, runs, requests, logs, stateBefore, stateAfter}`; the expected
//! value is the TypeScript's, never typed here. For each case the test
//!
//! - seeds `stateBefore` into a FakeHome and builds a context over a clock that reads `tokio`'s paused
//!   time, so the 350 ms gap sleeps are instant, countable, and move the clock the way the TypeScript's
//!   fake timers did (a `checkedAt` after a gap is `base + 350 * n`);
//! - replays each run's titles and compares its summary and the `lookups` after it;
//! - compares the request sequence and its timing with the trace (the term, the 8 s timeout, the
//!   `GameLib` user agent, the instant each request went out), the log lines, and the exact bytes of
//!   the cache file after the case;
//! - fails if any recorded request was not made, or one made differs from its recorded twin.
//!
//! The floor guards the replay itself: a manifest count the directory does not match, a count under
//! the floor, or a replay that never exercised an error, a deferral, a cached skip and a stale stop
//! fails the test instead of letting a truncated vector set pass.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_humble::app_id_resolver::{lookup_cached, resolve_pass, ResolveOutcome};
use gamelib_humble::ctx::{HumbleCtx, HumbleLog, Platform};
use gamelib_humble::http::{Http, HttpError, HttpFuture, Replay, Request};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde::Deserialize;
use serde_json::Value;

/// The instant the TypeScript harness pinned its fake clock to: 2026-11-24T12:00:00Z. Every
/// `checkedAt` in the goldens is this plus the gaps slept; a wrong value fails the cache bytes.
const BASE_MS: u64 = 1_795_521_600_000;

/// A run whose `isStale` turns true once this many requests have been made in it (the oracle's
/// `staleAfterRequests`; the golden does not carry it, and a wrong value fails the replay).
const STALE_AFTER: &[(&str, usize)] =
    &[("a-stale-fence-stops-the-pass-after-the-first-request", 1)];

#[derive(Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
}

#[derive(Deserialize)]
struct Case {
    trace: Vec<Value>,
    runs: Vec<Run>,
    logs: Vec<LogLine>,
    #[serde(rename = "stateBefore")]
    state_before: BTreeMap<String, Bytes>,
    #[serde(rename = "stateAfter")]
    state_after: BTreeMap<String, Bytes>,
}

#[derive(Deserialize)]
struct Run {
    titles: Vec<String>,
    summary: Summary,
    lookups: Vec<Lookup>,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
struct Summary {
    requested: usize,
    resolved: usize,
    cached: usize,
    misses: usize,
    errors: usize,
    deferred: usize,
}

#[derive(Deserialize)]
struct Lookup {
    title: String,
    cached: Option<String>,
}

#[derive(Deserialize)]
struct LogLine {
    level: String,
    message: String,
}

#[derive(Deserialize)]
struct Bytes {
    utf8: String,
}

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// A clock that reads tokio's (paused) time, so a sleep moves it.
struct PausedClock {
    start: tokio::time::Instant,
}

impl PausedClock {
    fn new() -> PausedClock {
        PausedClock {
            start: tokio::time::Instant::now(),
        }
    }

    fn elapsed_ms(&self) -> u64 {
        u64::try_from(self.start.elapsed().as_millis()).unwrap()
    }
}

impl Clock for PausedClock {
    fn now_ms(&self) -> u64 {
        BASE_MS + self.elapsed_ms()
    }
}

/// Every request the resolver made: the term, the timeout, the user agent and the instant it went out.
#[derive(Debug, PartialEq)]
struct Made {
    term: String,
    timeout_ms: u64,
    user_agent: Option<String>,
    at_ms: u64,
}

/// Records each request, then answers it from the replay.
struct Recording {
    inner: Replay,
    clock: Arc<PausedClock>,
    made: Mutex<Vec<Made>>,
    count: AtomicUsize,
}

impl Http for Recording {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let url = url::Url::parse(&request.url).expect("an absolute url");
        let term = url
            .query_pairs()
            .find(|(k, _)| k == "term")
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default();
        self.made.lock().unwrap().push(Made {
            term,
            timeout_ms: u64::try_from(request.timeout.as_millis()).unwrap(),
            user_agent: request
                .headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
                .map(|(_, v)| v.clone()),
            at_ms: self.clock.elapsed_ms(),
        });
        self.count.fetch_add(1, Ordering::SeqCst);
        self.inner.send(request)
    }
}

#[derive(Default)]
struct RecordingLog(Mutex<Vec<(String, String)>>);

impl HumbleLog for RecordingLog {
    fn info(&self, line: &str) {
        self.0
            .lock()
            .unwrap()
            .push(("info".to_string(), line.to_string()));
    }
    fn warn(&self, line: &str) {
        self.0
            .lock()
            .unwrap()
            .push(("warn".to_string(), line.to_string()));
    }
    fn error(&self, line: &str) {
        self.0
            .lock()
            .unwrap()
            .push(("error".to_string(), line.to_string()));
    }
}

fn write_state(home: &FakeHome, files: &BTreeMap<String, Bytes>) {
    for (rel, bytes) in files {
        let mut path = home.root().to_path_buf();
        for part in rel.split('/') {
            path.push(part);
        }
        fs::create_dir_all(path.parent().expect("a state file has a parent")).unwrap();
        fs::write(&path, bytes.utf8.as_bytes()).unwrap();
    }
}

fn read_state(home: &FakeHome, rel: &str) -> Option<String> {
    let mut path = home.root().to_path_buf();
    for part in rel.split('/') {
        path.push(part);
    }
    fs::read_to_string(path).ok()
}

fn summary_of(outcome: &ResolveOutcome) -> Summary {
    Summary {
        requested: outcome.requested,
        resolved: outcome.resolved,
        cached: outcome.cached,
        misses: outcome.misses,
        errors: outcome.errors,
        deferred: outcome.deferred,
    }
}

/// What a replay of every case saw, for the floor.
#[derive(Default)]
struct Coverage {
    cases: usize,
    requests: usize,
    cached_skips: usize,
    errors: usize,
    deferred: usize,
    stale_stops: usize,
    gaps: usize,
}

const CASE_NAME_MARKER: &str = "the-first-error-stops-the-pass-and-is-never-cached";

async fn replay_case(id: &str, case: &Case, coverage: &mut Coverage) -> Result<(), String> {
    let home = FakeHome::new("humble-appid-");
    write_state(&home, &case.state_before);
    let dir = fixtures().join("recorded/app_id_resolver").join(id);
    let replay = Replay::from_recorded(&dir).map_err(|e| format!("{id}: {e}"))?;
    let clock = Arc::new(PausedClock::new());
    let http = Arc::new(Recording {
        inner: replay,
        clock: clock.clone(),
        made: Mutex::new(Vec::new()),
        count: AtomicUsize::new(0),
    });
    let log = Arc::new(RecordingLog::default());
    let ctx = HumbleCtx::new(
        Arc::new(StoreHost::new()),
        home.root().to_path_buf(),
        clock.clone(),
        Platform::Linux,
        Shutdown::new(),
        http.clone(),
    )
    .with_log(log.clone());

    let stale_after = STALE_AFTER
        .iter()
        .find(|(case_id, _)| *case_id == id)
        .map(|(_, n)| *n);
    let mut problems: Vec<String> = Vec::new();
    for (n, run) in case.runs.iter().enumerate() {
        let before = http.count.load(Ordering::SeqCst);
        let is_stale =
            || stale_after.is_some_and(|limit| http.count.load(Ordering::SeqCst) - before >= limit);
        let outcome = resolve_pass(&ctx, &run.titles, &is_stale).await;
        if summary_of(&outcome) != run.summary {
            problems.push(format!(
                "{id}: run {n} summary {:?}, golden {:?}",
                summary_of(&outcome),
                run.summary
            ));
        }
        if outcome.stopped_by_shutdown {
            problems.push(format!("{id}: run {n} stopped by shutdown"));
        }
        for lookup in &run.lookups {
            let got = lookup_cached(&ctx, &lookup.title);
            if got != lookup.cached {
                problems.push(format!(
                    "{id}: run {n} lookup of {:?} is {got:?}, golden {:?}",
                    lookup.title, lookup.cached
                ));
            }
        }
        coverage.cached_skips += outcome.cached;
        coverage.errors += outcome.errors;
        coverage.deferred += outcome.deferred;
        if stale_after.is_some() && outcome.deferred > 0 {
            coverage.stale_stops += 1;
        }
    }

    // The request sequence and its timing, against the trace.
    let want: Vec<(String, u64, u64)> = case
        .trace
        .iter()
        .filter(|event| event["kind"] == "request")
        .map(|event| {
            (
                event["params"]["term"].as_str().unwrap().to_string(),
                event["timeoutMs"].as_u64().unwrap(),
                event["atMs"].as_u64().unwrap(),
            )
        })
        .collect();
    let made = http.made.lock().unwrap();
    let got: Vec<(String, u64, u64)> = made
        .iter()
        .map(|m| (m.term.clone(), m.timeout_ms, m.at_ms))
        .collect();
    if got != want {
        problems.push(format!(
            "{id}: requests (term, timeout, at) {got:?}, golden {want:?}"
        ));
    }
    for (m, event) in made
        .iter()
        .zip(case.trace.iter().filter(|e| e["kind"] == "request"))
    {
        if m.user_agent.as_deref() != event["userAgent"].as_str() {
            problems.push(format!("{id}: user agent {:?}", m.user_agent));
        }
    }
    // The gaps: one 350 ms sleep per `sleep` event, and the clock moved by exactly their sum.
    let slept: u64 = case
        .trace
        .iter()
        .filter(|event| event["kind"] == "sleep")
        .map(|event| event["ms"].as_u64().unwrap())
        .sum();
    coverage.gaps += case
        .trace
        .iter()
        .filter(|event| event["kind"] == "sleep")
        .count();
    if clock.elapsed_ms() != slept {
        problems.push(format!(
            "{id}: the clock moved {} ms, the trace slept {slept} ms",
            clock.elapsed_ms()
        ));
    }
    coverage.requests += made.len();
    drop(made);

    let lines = log.0.lock().unwrap().clone();
    let want_lines: Vec<(String, String)> = case
        .logs
        .iter()
        .map(|l| (l.level.clone(), l.message.clone()))
        .collect();
    if lines != want_lines {
        problems.push(format!("{id}: log {lines:?}, golden {want_lines:?}"));
    }

    // The bytes of the cache file after the case (and no file where the golden has none).
    for (rel, want) in &case.state_after {
        match read_state(&home, rel) {
            Some(got) if got == want.utf8 => {}
            Some(got) => problems.push(format!("{id}: {rel} is {got:?}, golden {:?}", want.utf8)),
            None => problems.push(format!("{id}: {rel} was not written")),
        }
    }
    if case.state_after.is_empty() && case.state_before.is_empty() {
        if let Some(found) = read_state(&home, "store_cache/humble_steam_appid.json") {
            problems.push(format!(
                "{id}: wrote a cache file {found:?} the golden has none of"
            ));
        }
    }
    if let Err(why) = http.inner.finish() {
        problems.push(format!("{id}: replay: {why}"));
    }
    coverage.cases += 1;
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems.join("\n"))
    }
}

#[tokio::test(start_paused = true)]
async fn every_recorded_resolver_pass_is_reproduced() {
    let golden = fixtures().join("golden/app_id_resolver");
    let manifest: Manifest =
        serde_json::from_str(&fs::read_to_string(golden.join("MANIFEST.json")).unwrap()).unwrap();
    let mut files: Vec<PathBuf> = fs::read_dir(&golden)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .filter(|p| p.file_name().is_some_and(|n| n != "MANIFEST.json"))
        .collect();
    files.sort();
    assert_eq!(
        files.len(),
        manifest.count,
        "the manifest count is the directory's"
    );
    assert!(files.len() >= manifest.floor, "under the manifest floor");
    let recorded = fs::read_dir(fixtures().join("recorded/app_id_resolver"))
        .unwrap()
        .count();
    assert_eq!(
        recorded, manifest.count,
        "every golden has a recorded wire case"
    );

    let mut coverage = Coverage::default();
    let mut failures: Vec<String> = Vec::new();
    for file in &files {
        let id = file.file_stem().unwrap().to_string_lossy().into_owned();
        let case: Case = serde_json::from_str(&fs::read_to_string(file).unwrap())
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        if let Err(why) = replay_case(&id, &case, &mut coverage).await {
            failures.push(why);
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));

    // The replay exercised what it claims to: every case, requests, gaps, a cached skip, an error, a
    // cap deferral and the stale fence.
    assert_eq!(coverage.cases, manifest.count);
    assert!(
        coverage.requests >= 50,
        "requests replayed: {}",
        coverage.requests
    );
    assert!(coverage.gaps >= 40, "gaps slept: {}", coverage.gaps);
    assert!(
        coverage.cached_skips >= 2,
        "cached skips: {}",
        coverage.cached_skips
    );
    assert!(coverage.errors >= 3, "errors: {}", coverage.errors);
    assert!(coverage.deferred >= 5, "deferrals: {}", coverage.deferred);
    assert_eq!(coverage.stale_stops, 1, "the stale fence stopped one pass");
    assert!(
        files
            .iter()
            .any(|f| f.file_stem().is_some_and(|s| s == CASE_NAME_MARKER)),
        "the first-error case is among the goldens"
    );
}

// ------------------------------------------------------------------------------------------------
// D-21: the shutdown contract
// ------------------------------------------------------------------------------------------------

/// Answers the first request from a recorded case, then begins shutdown (as exit would, mid-pass),
/// so the pass is between two requests when the token is cancelled.
struct CancelAfterFirst {
    inner: Replay,
    shutdown: Shutdown,
    served: AtomicUsize,
}

impl Http for CancelAfterFirst {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let first = self.served.fetch_add(1, Ordering::SeqCst) == 0;
        if first {
            // Cancels the token; nothing but the pass's own registrant is held, and a zero budget
            // returns at once, naming it.
            let held = self.shutdown.drain(Duration::ZERO);
            assert_eq!(
                held,
                ["humble-appid"],
                "the pass holds its registrant while it runs"
            );
        }
        self.inner.send(request)
    }
}

fn resolver_case_ctx(
    home: &FakeHome,
    http: Arc<dyn Http>,
    shutdown: Shutdown,
) -> (HumbleCtx, Arc<PausedClock>) {
    let clock = Arc::new(PausedClock::new());
    (
        HumbleCtx::new(
            Arc::new(StoreHost::new()),
            home.root().to_path_buf(),
            clock.clone(),
            Platform::Linux,
            shutdown,
            http,
        ),
        clock,
    )
}

/// A cancelled token stops a pass at the next gap: the second title is never requested, the first
/// answer stays cached, and the registrant is released when the pass returns.
#[tokio::test(start_paused = true)]
async fn a_cancelled_token_stops_a_pass_at_the_next_gap() {
    let home = FakeHome::new("humble-appid-shutdown-");
    let dir = fixtures()
        .join("recorded/app_id_resolver")
        .join("requests-go-out-in-order-with-a-350-ms-gap-between-them");
    let shutdown = Shutdown::new();
    let http = Arc::new(CancelAfterFirst {
        inner: Replay::from_recorded(&dir).unwrap(),
        shutdown: shutdown.clone(),
        served: AtomicUsize::new(0),
    });
    let (ctx, clock) = resolver_case_ctx(&home, http.clone(), shutdown.clone());
    let titles: Vec<String> = ["Fake Game Alpha", "Fake Game Beta", "Fake Game Gamma"]
        .iter()
        .map(ToString::to_string)
        .collect();
    let outcome = resolve_pass(&ctx, &titles, &|| false).await;
    assert!(outcome.stopped_by_shutdown);
    assert_eq!(outcome.requested, 1, "no request after the cancelled gap");
    assert_eq!(outcome.resolved, 1);
    assert_eq!(outcome.deferred, 2, "the two unasked titles stay deferred");
    assert_eq!(clock.elapsed_ms(), 0, "the gap never ran its 350 ms");
    assert_eq!(http.served.load(Ordering::SeqCst), 1);
    assert_eq!(
        lookup_cached(&ctx, "Fake Game Alpha"),
        Some("11".to_string())
    );
    assert_eq!(lookup_cached(&ctx, "Fake Game Beta"), None);
    // The two exchanges the pass never reached are left over, not a failure of the pass.
    assert!(http.inner.finish().unwrap_err().contains("unconsumed"));
    // Nothing is held after the pass.
    assert!(shutdown.drain(Duration::from_millis(50)).is_empty());
}

/// A pass started after shutdown began starts nothing and makes no request.
#[tokio::test(start_paused = true)]
async fn a_pass_after_shutdown_began_starts_nothing() {
    let home = FakeHome::new("humble-appid-late-");
    let shutdown = Shutdown::new();
    assert!(shutdown.drain(Duration::ZERO).is_empty());
    let (ctx, _clock) = resolver_case_ctx(&home, Arc::new(gamelib_humble::http::NoHttp), shutdown);
    let outcome = resolve_pass(&ctx, &["Portal 2".to_string()], &|| false).await;
    assert!(outcome.stopped_by_shutdown);
    assert_eq!(outcome.requested, 0);
}

/// A request that never answers does not hold exit: shutdown cancels it, well inside the 8 s the
/// request itself may take, and the pass reports it stopped.
struct NeverAnswers;

impl Http for NeverAnswers {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(async {
            std::future::pending::<()>().await;
            Err(HttpError::Cancelled)
        })
    }
}

#[tokio::test(start_paused = true)]
async fn shutdown_cancels_a_request_in_flight() {
    let home = FakeHome::new("humble-appid-flight-");
    let shutdown = Shutdown::new();
    let (ctx, clock) = resolver_case_ctx(&home, Arc::new(NeverAnswers), shutdown.clone());
    let titles = ["Portal 2".to_string()];
    let pass = resolve_pass(&ctx, &titles, &|| false);
    let canceller = async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        // The pass is waiting on the request; shutdown begins.
        let held = shutdown.drain(Duration::ZERO);
        assert_eq!(held, ["humble-appid"]);
    };
    let (outcome, ()) = tokio::join!(pass, canceller);
    assert!(outcome.stopped_by_shutdown);
    assert_eq!(outcome.requested, 1);
    assert_eq!(outcome.deferred, 1);
    assert_eq!(outcome.errors, 0, "a cancelled request is not an error");
    assert_eq!(
        clock.elapsed_ms(),
        100,
        "stopped at the cancel, not at the 8 s timeout"
    );
    assert_eq!(lookup_cached(&ctx, "Portal 2"), None);
}

// ------------------------------------------------------------------------------------------------
// PENDING (94-10): the real capture's request shape
// ------------------------------------------------------------------------------------------------

fn real_dir() -> PathBuf {
    fixtures().join("recorded/real")
}

/// Every `exchanges.json` under `recorded/real`, one directory per captured case.
fn real_cases() -> Vec<PathBuf> {
    let mut cases: Vec<PathBuf> = match fs::read_dir(real_dir()) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.join("exchanges.json").is_file())
            .collect(),
        Err(_) => Vec::new(),
    };
    cases.sort();
    cases
}

/// The header names the real capture's requests carry, none of which may be a header the seam neither
/// pins nor knowingly leaves to the HTTP stack. An unlisted header would mean the real TypeScript sent
/// something the Rust replay would never notice dropping.
fn real_header_gaps() -> Vec<String> {
    let mut gaps = Vec::new();
    let mut exchanges = 0usize;
    for dir in real_cases() {
        let list: Value =
            serde_json::from_str(&fs::read_to_string(dir.join("exchanges.json")).unwrap()).unwrap();
        // The replay must at least load the real case.
        Replay::from_recorded(&dir).unwrap_or_else(|e| panic!("{}: {e}", dir.display()));
        for exchange in list.as_array().expect("a list") {
            exchanges += 1;
            for pair in exchange["request"]["headers"]
                .as_array()
                .unwrap_or(&Vec::new())
            {
                let name = pair[0].as_str().unwrap_or_default().to_ascii_lowercase();
                let known = gamelib_humble::http::PINNED_HEADERS.contains(&name.as_str())
                    || gamelib_humble::http::TRANSPORT_HEADERS.contains(&name.as_str());
                if !known {
                    gaps.push(format!("{}: header {name}", dir.display()));
                }
            }
        }
    }
    let wire = fs::read_to_string(real_dir().join("WIRE_HEADERS.json"))
        .expect("recorded/real/WIRE_HEADERS.json (94-10)");
    let wire: Value = serde_json::from_str(&wire).expect("WIRE_HEADERS.json is JSON");
    assert!(
        wire.as_object().is_some_and(|o| !o.is_empty()),
        "WIRE_HEADERS.json is empty"
    );
    assert!(
        exchanges >= 4,
        "the real capture holds {exchanges} exchanges, 94-10 needs 4 kinds"
    );
    gaps.sort();
    gaps.dedup();
    gaps
}

/// PENDING: `recorded/real/` and `WIRE_HEADERS.json` come from plan 94-10 (a live Humble capture, run
/// by the operator after 94-24). Un-ignore this once they are committed (the guard below fails until
/// you do). Until then the seam is pinned to the 94-06 recordings and the 94-08 wire goldens only, and
/// no header value was typed by hand.
#[test]
#[ignore = "pending: 94-10 live Humble capture (recorded/real/WIRE_HEADERS.json); the seam is pinned to the 94-06 wire recordings until then"]
fn the_real_capture_sends_no_header_the_seam_does_not_pin() {
    let gaps = real_header_gaps();
    assert!(
        gaps.is_empty(),
        "headers in the real capture the seam neither pins nor leaves to the transport:\n{}",
        gaps.join("\n")
    );
}

/// Absent real captures are loudly pending, never a quiet pass; present ones must be replayed, so
/// the ignore must be gone.
#[test]
fn the_real_capture_check_runs_once_it_is_recorded() {
    if real_cases().is_empty() && !real_dir().join("WIRE_HEADERS.json").exists() {
        eprintln!(
            "PENDING: recorded/real is not captured yet (94-10 runs after 94-24, from the operator's terminal); \
             the real-capture header check is ignored."
        );
        return;
    }
    // The marker is assembled so this test's own source does not contain it.
    let marker = ["#[ignore = \"pending", ": 94-10"].concat();
    assert!(
        !include_str!("golden_app_id_resolver.rs").contains(&marker),
        "recorded/real exists: remove the #[ignore] on the_real_capture_sends_no_header_the_seam_does_not_pin and run it"
    );
    let gaps = real_header_gaps();
    assert!(
        gaps.is_empty(),
        "unpinned real headers:\n{}",
        gaps.join("\n")
    );
}
