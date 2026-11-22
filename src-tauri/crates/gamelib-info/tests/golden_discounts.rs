//! GOG discounts against the TS goldens (86-06, 86-18, SC1, D-10): every case in
//! `tests/fixtures/golden/discounts/cases.json` runs through the crate's own dispatcher over a `Replay`
//! of the recorded exchanges, which pins each request to the one the TS made (path, the decoded query
//! pairs in order, `User-Agent`, and the `Authorization` header, which the recorder stores as
//! `REDACTED`). What the op returned must equal the TS oracle's golden (the product count, the ordered
//! ids, and the SHA-256 of the products as canonical JSON: keys sorted at every level, compact; the
//! products whole when there are 20 or fewer), and the replay must finish clean: no unmatched request,
//! no recorded exchange left over.
//!
//! The token is the string `REDACTED`, never a real one. The TS oracle asked for credentials itself
//! (`credentialLookups`); here the caller's job is the case's `credentials` flag: a flag with
//! credentials hands the op a token, a flag without hands it `null`, no flag hands it `null` too.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoLog, InfoPaths, Platform};
use gamelib_info::http::{Http, HttpError, HttpFuture, Replay, Request, Response};
use gamelib_info::{dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 9;

/// The oracle keeps the products whole in a golden of at most this many.
const FULL_RESULT_LIMIT: usize = 20;

/// The one place Rust's answer differs from the TS golden on purpose (D-03): the TS oracle's transport
/// failure text names the sandbox host it tried (`connect ECONNREFUSED oracle.invalid:443`), which is
/// an environment fact; the Rust `Http` seam reports a category, and the op answers axios's
/// category text for it.
const NETWORK_ERROR_CASE: (&str, &str) = ("synthetic-network-error-page1", "Network Error");

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/discounts")
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

#[test]
fn manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(
        cases.as_array().unwrap(),
        &manifest,
        FLOOR,
        &expected_folders(),
    )
    .unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let err = check_manifest(&[], &manifest, FLOOR, &[]).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

#[test]
fn the_discounts_op_is_in_the_sorted_op_table() {
    assert!(OPS.contains(&"info_gog_discounts"));
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

/// An `InfoLog` that keeps every line, so a test can read what was logged.
#[derive(Default)]
struct Lines(Mutex<Vec<String>>);

impl InfoLog for Lines {
    fn line(&self, text: &str) {
        self.0.lock().unwrap().push(text.to_string());
    }
}

impl Lines {
    fn all(&self) -> Vec<String> {
        self.0.lock().unwrap().clone()
    }
}

/// A context on a FakeHome over `http`, logging into `lines`.
fn ctx_over(home: &FakeHome, http: Arc<dyn Http>, lines: Arc<Lines>) -> InfoCtx {
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        // The version the recorded TS requests carry in their User-Agent.
        "0.11.0".to_string(),
        Shutdown::new(),
        http,
    );
    ctx.log = Some(lines);
    ctx
}

/// JavaScript's `JSON.stringify` for a number: an integral value prints without a fraction.
fn js_number(number: &serde_json::Number) -> String {
    if let Some(f) = number.as_f64().filter(|f| number.is_f64() && f.is_finite()) {
        if f.fract() == 0.0 && f.abs() < 1e21 {
            return format!("{f:.0}");
        }
    }
    number.to_string()
}

/// Keys sorted at every level, compact: the form the TS oracle's digest is taken over.
fn canonical(value: &Value) -> String {
    match value {
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(canonical).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|k| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical(&map[k])
                    )
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Number(n) => js_number(n),
        other => serde_json::to_string(other).unwrap(),
    }
}

fn digest(products: &[Value]) -> String {
    let text = canonical(&Value::Array(products.to_vec()));
    Sha256::digest(text.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The op's answer in the shape of the oracle's `result.json` (without `credentialLookups` and
/// `requests`, which are the caller's and the replay's).
fn outcome(answer: Result<Value, String>) -> Value {
    match answer {
        Err(error) => json!({ "ok": false, "error": error }),
        Ok(Value::Array(products)) => {
            let ids: Vec<Value> = products
                .iter()
                .map(|p| p.get("id").cloned().unwrap_or(Value::Null))
                .collect();
            let mut out = json!({
                "ok": true,
                "count": products.len(),
                "ids": ids,
                "sha256": digest(&products),
            });
            if products.len() <= FULL_RESULT_LIMIT {
                out["products"] = Value::Array(products);
            }
            out
        }
        Ok(other) => panic!("the op answered {other}"),
    }
}

fn args_of(case: &Value) -> Value {
    let wants_token = case["hideOwned"] == json!(true) || case["wishlistOnly"] == json!(true);
    let token = if wants_token && case["credentials"] == json!(true) {
        json!("REDACTED")
    } else {
        Value::Null
    };
    json!({
        "locale": case["locale"],
        "hideOwned": case["hideOwned"] == json!(true),
        "wishlistOnly": case["wishlistOnly"] == json!(true),
        "token": token,
    })
}

#[test]
fn every_case_matches_the_ts_results_and_makes_exactly_the_recorded_requests() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases = cases.as_array().unwrap();
    assert!(cases.len() >= FLOOR, "replayed {} cases", cases.len());
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let replay = Arc::new(
            Replay::from_case(&fixtures().join("recorded/discounts").join(id))
                .unwrap_or_else(|e| panic!("{id}: {e}")),
        );
        let home = FakeHome::new("info-discounts-");
        let lines = Arc::new(Lines::default());
        let ctx = ctx_over(&home, replay.clone(), lines.clone());
        let got = outcome(dispatch_sync("info_gog_discounts", &[args_of(case)], &ctx));
        let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
        let mut want_result = json!({});
        for key in ["ok", "count", "ids", "sha256", "products", "error"] {
            if let Some(value) = want.get(key) {
                want_result[key] = value.clone();
            }
        }
        if id == NETWORK_ERROR_CASE.0 {
            want_result["error"] = json!(NETWORK_ERROR_CASE.1);
        }
        assert_eq!(got, want_result, "{id}: results differ from the TS golden");
        replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
        // One request per `requests` entry in the golden, each consumed from the recording.
        assert!(want["requests"].as_array().is_some_and(|r| !r.is_empty()));
        for line in lines.all() {
            assert!(
                !line.contains("REDACTED"),
                "{id}: a log line carries the token"
            );
        }
    }
}

#[test]
fn a_changed_request_is_caught_by_the_replay_pin() {
    // The hide-owned case recorded `Authorization` and `hideOwned=true`; a different app version
    // changes the User-Agent, which the replay pins: the op fails and the replay finishes unclean.
    let id = "synthetic-hide-owned-with-credentials";
    let replay =
        Arc::new(Replay::from_case(&fixtures().join("recorded/discounts").join(id)).unwrap());
    let home = FakeHome::new("info-discounts-pin-");
    let mut ctx = ctx_over(&home, replay.clone(), Arc::new(Lines::default()));
    ctx.app_version = "9.9.9".to_string();
    let args = json!({
        "locale": { "countryCode": "US", "locale": "en-US", "currencyCode": "USD" },
        "hideOwned": true, "wishlistOnly": false, "token": "REDACTED"
    });
    let result = dispatch_sync("info_gog_discounts", &[args], &ctx);
    assert!(result.is_err());
    let report = replay.finish().unwrap_err();
    assert!(report.to_lowercase().contains("user-agent"), "{report}");
    assert!(!report.contains("Bearer"), "{report}");
}

// ---------------------------------------------------------------------------------------------
// Concurrency order, the request shape and what is logged (T-86-42, T-86-43)
// ---------------------------------------------------------------------------------------------

/// A scripted catalog: page `n` answers `{pages, products}` after `delay(n)` yields, and the order in
/// which pages finished is remembered. `seen` keeps every request.
struct Catalog {
    pages: u64,
    /// How many times a page yields to the scheduler before it answers.
    delays: Vec<(u64, usize)>,
    /// Pages that answer 500.
    failing: Vec<u64>,
    finished: Mutex<Vec<u64>>,
    seen: Mutex<Vec<Request>>,
}

impl Catalog {
    fn new(pages: u64) -> Catalog {
        Catalog {
            pages,
            delays: Vec::new(),
            failing: Vec::new(),
            finished: Mutex::new(Vec::new()),
            seen: Mutex::new(Vec::new()),
        }
    }

    fn page_of(request: &Request) -> u64 {
        let url = url::Url::parse(&request.url).unwrap();
        url.query_pairs()
            .find(|(k, _)| k == "page")
            .and_then(|(_, v)| v.parse().ok())
            .unwrap()
    }
}

impl Http for Catalog {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let page = Catalog::page_of(&request);
        self.seen.lock().unwrap().push(request);
        let yields = self
            .delays
            .iter()
            .find(|(p, _)| *p == page)
            .map_or(0, |(_, n)| *n);
        Box::pin(async move {
            for _ in 0..yields {
                tokio::task::yield_now().await;
            }
            self.finished.lock().unwrap().push(page);
            if self.failing.contains(&page) {
                return Ok(Response {
                    status: 500,
                    headers: Vec::new(),
                    body: Vec::new(),
                });
            }
            // Product ids: page 1 has 1 and 2, page 2 has 3 and 4, and so on.
            let products: Vec<Value> = (0..2)
                .map(|i| json!({ "id": (page - 1) * 2 + i + 1, "title": format!("p{page}-{i}") }))
                .collect();
            let body = json!({ "pages": self.pages, "productCount": 0, "products": products });
            Ok(Response {
                status: 200,
                headers: Vec::new(),
                body: body.to_string().into_bytes(),
            })
        })
    }
}

fn plain_args(hide_owned: bool, wishlist_only: bool, token: Value) -> Value {
    json!({
        "locale": { "countryCode": "US", "locale": "en-US", "currencyCode": "USD" },
        "hideOwned": hide_owned, "wishlistOnly": wishlist_only, "token": token
    })
}

fn ids(answer: &Value) -> Vec<i64> {
    answer
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_i64().unwrap())
        .collect()
}

#[test]
fn the_concurrent_pages_merge_in_page_order_even_when_page_three_answers_first() {
    // Page 2 yields to the scheduler ten times before it answers; pages 3 and 4 answer at once.
    let mut catalog = Catalog::new(4);
    catalog.delays = vec![(2, 10)];
    let catalog = Arc::new(catalog);
    let home = FakeHome::new("info-discounts-order-");
    let ctx = ctx_over(&home, catalog.clone(), Arc::new(Lines::default()));
    let answer = dispatch_sync(
        "info_gog_discounts",
        &[plain_args(false, false, Value::Null)],
        &ctx,
    )
    .unwrap();
    let finished = catalog.finished.lock().unwrap().clone();
    assert_eq!(finished[0], 1, "{finished:?}");
    let position = |page: u64| finished.iter().position(|p| *p == page).unwrap();
    assert!(
        position(3) < position(2),
        "page 3 must finish before page 2: {finished:?}"
    );
    assert_eq!(ids(&answer), vec![1, 2, 3, 4, 5, 6, 7, 8]);
}

#[test]
fn the_pages_are_fetched_together_and_capped_at_thirty() {
    let catalog = Arc::new(Catalog::new(132));
    let home = FakeHome::new("info-discounts-cap-");
    let ctx = ctx_over(&home, catalog.clone(), Arc::new(Lines::default()));
    let answer = dispatch_sync(
        "info_gog_discounts",
        &[plain_args(false, false, Value::Null)],
        &ctx,
    )
    .unwrap();
    let seen = catalog.seen.lock().unwrap();
    assert_eq!(seen.len(), 30);
    assert_eq!(answer.as_array().unwrap().len(), 60);
    // Every request has the 15 s timeout and the Heroic-style User-Agent.
    for request in seen.iter() {
        assert_eq!(request.timeout, std::time::Duration::from_secs(15));
        let agent = request
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
            .map(|(_, v)| v.as_str());
        assert_eq!(agent, Some("HeroicGamesLauncher/0.11.0"));
    }
}

#[test]
fn a_failed_page_is_logged_without_its_url_and_skipped() {
    let mut catalog = Catalog::new(3);
    catalog.failing = vec![2];
    let catalog = Arc::new(catalog);
    let home = FakeHome::new("info-discounts-skip-");
    let lines = Arc::new(Lines::default());
    let ctx = ctx_over(&home, catalog, lines.clone());
    let answer = dispatch_sync(
        "info_gog_discounts",
        &[plain_args(false, false, Value::Null)],
        &ctx,
    )
    .unwrap();
    assert_eq!(ids(&answer), vec![1, 2, 5, 6]);
    let all = lines.all();
    assert_eq!(all.len(), 1, "{all:?}");
    assert!(all[0].contains("page 2 failed"), "{all:?}");
    assert!(all[0].contains("status code 500"), "{all:?}");
    assert!(!all[0].contains("catalog.gog.com"), "{all:?}");
}

#[test]
fn the_token_is_sent_only_with_a_flag_and_never_logged() {
    let secret = "tok-0123456789";
    for (hide, wish, token, expect_header) in [
        (true, false, json!(secret), true),
        (false, true, json!(secret), true),
        (false, false, json!(secret), false),
        (true, false, json!(""), false),
    ] {
        let catalog = Arc::new(Catalog::new(1));
        let home = FakeHome::new("info-discounts-token-");
        let lines = Arc::new(Lines::default());
        let ctx = ctx_over(&home, catalog.clone(), lines.clone());
        dispatch_sync(
            "info_gog_discounts",
            &[plain_args(hide, wish, token.clone())],
            &ctx,
        )
        .unwrap();
        let seen = catalog.seen.lock().unwrap();
        let sent = seen[0]
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("authorization"))
            .map(|(_, v)| v.clone());
        if expect_header {
            assert_eq!(sent, Some(format!("Bearer {secret}")));
        } else {
            assert_eq!(sent, None, "{hide} {wish} {token}");
        }
        for request in seen.iter() {
            assert!(!request.url.contains(secret));
        }
        for line in lines.all() {
            assert!(!line.contains(secret), "{line}");
        }
        // The debug form of the arguments never prints the token either.
        let parsed: gamelib_info::discounts::DiscountsArgs =
            serde_json::from_value(plain_args(hide, wish, token)).unwrap();
        assert!(!format!("{parsed:?}").contains(secret));
    }
}

#[test]
fn a_flag_with_no_token_resets_both_flags_and_logs_one_warning() {
    let catalog = Arc::new(Catalog::new(1));
    let home = FakeHome::new("info-discounts-reset-");
    let lines = Arc::new(Lines::default());
    let ctx = ctx_over(&home, catalog.clone(), lines.clone());
    dispatch_sync(
        "info_gog_discounts",
        &[plain_args(true, true, Value::Null)],
        &ctx,
    )
    .unwrap();
    let seen = catalog.seen.lock().unwrap();
    assert!(!seen[0].url.contains("hideOwned"), "{}", seen[0].url);
    assert!(!seen[0].url.contains("wishlist"), "{}", seen[0].url);
    assert!(seen[0]
        .headers
        .iter()
        .all(|(k, _)| !k.eq_ignore_ascii_case("authorization")));
    let all = lines.all();
    assert_eq!(all.len(), 1, "{all:?}");
    assert!(all[0].starts_with("WARN"), "{all:?}");
}

#[test]
fn a_rejection_is_logged_once_and_rethrown_with_the_axios_text() {
    let mut catalog = Catalog::new(2);
    catalog.failing = vec![1];
    let home = FakeHome::new("info-discounts-reject-");
    let lines = Arc::new(Lines::default());
    let ctx = ctx_over(&home, Arc::new(catalog), lines.clone());
    let error = dispatch_sync(
        "info_gog_discounts",
        &[plain_args(false, false, Value::Null)],
        &ctx,
    )
    .unwrap_err();
    assert_eq!(error, "Request failed with status code 500");
    let all = lines.all();
    assert_eq!(all.len(), 1, "{all:?}");
    assert!(all[0].contains("failed"), "{all:?}");
}

#[test]
fn a_transport_failure_on_the_first_page_is_the_axios_category_text() {
    struct Down;
    impl Http for Down {
        fn send(&self, _request: Request) -> HttpFuture<'_> {
            Box::pin(async { Err(HttpError::Timeout) })
        }
    }
    let home = FakeHome::new("info-discounts-down-");
    let ctx = ctx_over(&home, Arc::new(Down), Arc::new(Lines::default()));
    let error = dispatch_sync(
        "info_gog_discounts",
        &[plain_args(false, false, Value::Null)],
        &ctx,
    )
    .unwrap_err();
    assert_eq!(error, "timeout of 15000ms exceeded");
}

#[test]
fn the_arguments_are_strict_and_the_locale_is_bounded() {
    let catalog = Arc::new(Catalog::new(1));
    let home = FakeHome::new("info-discounts-args-");
    let ctx = ctx_over(&home, catalog.clone(), Arc::new(Lines::default()));
    let long = "x".repeat(33);
    let bad: Vec<Value> = vec![
        json!({}),
        json!({ "locale": { "countryCode": "US", "locale": "en-US", "currencyCode": "USD" } }),
        json!({
            "locale": { "countryCode": "US", "locale": "en-US", "currencyCode": "USD" },
            "hideOwned": false, "wishlistOnly": false, "token": null, "extra": 1
        }),
        json!({
            "locale": { "countryCode": "US", "locale": "en-US", "currencyCode": "USD", "x": 1 },
            "hideOwned": false, "wishlistOnly": false, "token": null
        }),
        json!({
            "locale": { "countryCode": "US", "locale": "en-US", "currencyCode": "USD" },
            "hideOwned": "yes", "wishlistOnly": false, "token": null
        }),
        json!({
            "locale": { "countryCode": long, "locale": "en-US", "currencyCode": "USD" },
            "hideOwned": false, "wishlistOnly": false, "token": null
        }),
    ];
    for args in bad {
        let error = dispatch_sync("info_gog_discounts", &[args], &ctx).unwrap_err();
        assert_eq!(error, "info_gog_discounts:bad-args");
    }
    assert_eq!(
        dispatch_sync("info_gog_discounts", &[], &ctx).unwrap_err(),
        "info_gog_discounts:bad-args"
    );
    assert!(catalog.seen.lock().unwrap().is_empty());
}
