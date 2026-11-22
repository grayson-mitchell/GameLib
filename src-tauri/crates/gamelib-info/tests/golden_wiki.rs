//! The wiki aggregator against the TS goldens (86-06 recorded them, 86-22 ports it; SC1, D-10, D-17,
//! D-18, D-23): every case of `tests/fixtures/golden/wiki/cases.json` that runs a `wiki` op replays
//! through `info_wiki_get` over a `Replay` of the recorded exchanges, on a clock that only moves when a
//! case says so, over a copy of the case's starting profile (`state/wiki/<case>`).
//!
//! What each op returned, the requests the case made, and the bytes of every cache file it left behind
//! (`expected/<case>/after`: the 30 day wiki cache with its dotted-title nesting and `__timestamp` keys,
//! the umu cache, the CrossOver index copy) must equal the TS oracle's golden, and the replay must finish
//! clean. The one thing a GOG case may leave unconsumed is what the recording flags `tsOnly` (D-23: the
//! requests the TS made and Rust does not).
//!
//! The `umu` cases are `golden_umu.rs`'s, the per-source parity is `golden_wiki_sources.rs`'s; this file
//! is the aggregator: the cache key, the stale rules, which sources run on which platform, and the result.

mod wiki_golden;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use gamelib_info::dispatch;
use gamelib_info::http::{Http, HttpFuture, Replay, Request, Response};
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use url::Url;
use wiki_golden::*;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 25;

/// The cases that run a `wiki` op (86-06 recorded 31 of the 40: the other nine are the direct umu ones).
const WIKI_CASES_FLOOR: usize = 31;

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
fn the_wiki_ops_are_in_the_sorted_op_table() {
    assert!(gamelib_info::OPS.contains(&"info_wiki_get"));
    assert!(gamelib_info::OPS.contains(&"info_wiki_cache_clear"));
    let mut sorted = gamelib_info::OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(gamelib_info::OPS, sorted.as_slice());
}

fn wiki_cases(cases: &[Value]) -> Vec<&Value> {
    cases
        .iter()
        .filter(|c| {
            c["ops"]
                .as_array()
                .unwrap()
                .iter()
                .any(|o| o["op"] == "wiki")
        })
        .collect()
}

/// `<METHOD> <url>` of every request the case made in its recording, without the `tsOnly` ones (D-23),
/// and whether a `rustOnly` exchange is among them (its place in the file is where the recorder
/// appended it, not where the flow makes it).
fn rust_requests(id: &str) -> (Vec<String>, bool) {
    let list = read_json(
        &fixtures()
            .join("recorded/wiki")
            .join(id)
            .join("exchanges.json"),
    );
    let mut requests = Vec::new();
    let mut rust_only = false;
    for exchange in list.as_array().unwrap() {
        if exchange["tsOnly"].as_bool().unwrap_or(false) {
            continue;
        }
        rust_only |= exchange["rustOnly"].as_bool().unwrap_or(false);
        let request = &exchange["request"];
        requests.push(format!(
            "{} {}",
            request["method"].as_str().unwrap().to_ascii_uppercase(),
            request["url"].as_str().unwrap()
        ));
    }
    (requests, rust_only)
}

fn host_of(request: &str) -> String {
    let url = request.split_once(' ').map_or(request, |(_, url)| url);
    Url::parse(url)
        .unwrap()
        .host_str()
        .unwrap_or_default()
        .to_string()
}

/// The requests of one host, in the order they were made.
fn of_host(requests: &[String], host: &str) -> Vec<String> {
    requests
        .iter()
        .filter(|r| host_of(r) == host)
        .cloned()
        .collect()
}

/// What the case wrote, compared to the oracle's `after` folder byte for byte.
fn assert_files(id: &str, user_data: &std::path::Path) {
    let want_files = tree(&golden_dir().join("expected").join(id).join("after"));
    let got_files = tree(user_data);
    assert_eq!(
        got_files.keys().collect::<Vec<_>>(),
        want_files.keys().collect::<Vec<_>>(),
        "{id}: files left behind"
    );
    for (path, bytes) in &want_files {
        assert!(
            &got_files[path] == bytes,
            "{id}: {path} differs from the TS golden ({} vs {} bytes)",
            got_files[path].len(),
            bytes.len()
        );
    }
}

async fn replay_case(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/wiki").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Http>));
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-wiki-");
    let (ctx, user_data) = case_ctx(case, &home, &clock, Arc::clone(&tap) as Arc<dyn Http>);

    let expected = golden_dir().join("expected").join(id);
    let want = read_json(&expected.join("result.json"));
    let want_ops = want["ops"].as_array().unwrap();
    let mut asked = Vec::new();
    for (index, op) in case["ops"].as_array().unwrap().iter().enumerate() {
        match op["op"].as_str().unwrap() {
            "advance" => {
                let minutes = op["minutes"].as_u64().unwrap();
                clock.0.fetch_add(minutes * 60_000, Ordering::SeqCst);
            }
            "wiki" => {
                let before = tap.count();
                let game = &op["game"];
                let mut args = json!({
                    "title": game["title"],
                    "appName": game["app_name"],
                    "runner": game["runner"],
                });
                if let Some(force) = op.get("forceRefresh") {
                    args["forceRefresh"] = force.clone();
                }
                let result = dispatch("info_wiki_get", &[args], &ctx)
                    .await
                    .unwrap_or_else(|e| panic!("{id}: {e}"));
                assert_eq!(result, want_ops[index]["result"], "{id}: op {index} result");
                asked.push(tap.count() - before);
            }
            other => panic!("{id}: unknown op {other}"),
        }
    }

    // The requests: the recording minus the `tsOnly` ones. The five concurrent sources interleave, so
    // the whole list is compared as a multiset, and each host's own requests in order unless a
    // `rustOnly` exchange (placed by the recorder, not by the flow) is among them.
    let (expected_requests, rust_only) = rust_requests(id);
    let got_requests = tap.urls();
    let mut got_sorted = got_requests.clone();
    let mut want_sorted = expected_requests.clone();
    got_sorted.sort();
    want_sorted.sort();
    assert_eq!(got_sorted, want_sorted, "{id}: requests");
    if !rust_only {
        let mut hosts: Vec<String> = expected_requests.iter().map(|r| host_of(r)).collect();
        hosts.sort();
        hosts.dedup();
        for host in hosts {
            assert_eq!(
                of_host(&got_requests, &host),
                of_host(&expected_requests, &host),
                "{id}: requests to {host} in order"
            );
        }
    }
    replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
    assert_files(id, &user_data);
}

#[tokio::test]
async fn every_wiki_case_matches_the_ts_results_requests_and_cache_bytes() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let wiki = wiki_cases(cases.as_array().unwrap());
    assert!(
        wiki.len() >= WIKI_CASES_FLOOR,
        "{} wiki cases, below the floor of {WIKI_CASES_FLOOR}",
        wiki.len()
    );
    for case in wiki {
        replay_case(case).await;
    }
}

/// The cases the stale rules and the cache are proven by exist in the recording, so a deleted case
/// cannot hide a rule: each one is named here and replayed by the test above.
#[test]
fn every_stale_rule_and_cache_edge_has_a_golden_case() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let ids: Vec<&str> = cases
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap())
        .collect();
    for id in [
        "cache-fresh-windows-no-request",
        "cache-expired-after-30-days-refetches",
        "force-refresh-bypasses-fresh-cache",
        "stale-apple-data-mac-refetches",
        "stale-crossover-null-mac-refetches",
        "stale-crossover-old-shape-mac-refetches",
        "stale-crossover-miss-now-covered-refetches",
        "crossover-miss-stays-cached-when-index-lacks",
        "stale-pcgw-error-status-refetches",
        "stale-hltb-skipped-status-refetches",
        "stale-no-fetch-status-refetches",
        "live-dotted-title-linux",
        "live-repeat-call-served-from-cache",
    ] {
        assert!(ids.contains(&id), "{id} is missing from the goldens");
    }
}

/// Answers every request with one status and an empty JSON object.
struct Canned(u16);

impl Http for Canned {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        let status = self.0;
        Box::pin(async move {
            Ok(Response {
                status,
                headers: Vec::new(),
                body: b"{}".to_vec(),
            })
        })
    }
}

fn canned_ctx(
    id: &str,
    platform: &str,
    home: &FakeHome,
    http: Arc<dyn Http>,
) -> (gamelib_info::ctx::InfoCtx, std::path::PathBuf) {
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    case_ctx(
        &json!({ "id": id, "platform": platform }),
        home,
        &clock,
        http,
    )
}

fn wiki_args(title: &str) -> Value {
    json!({ "title": title, "appName": "app", "runner": "legendary" })
}

/// SVC-01 concurrency edge: two concurrent calls for the same title both complete with the same answer
/// and leave one well-formed entry (the CacheView writes are serialised by the StoreHost lock).
#[tokio::test]
async fn two_concurrent_calls_for_one_title_both_complete_and_leave_one_well_formed_entry() {
    let home = FakeHome::new("info-wiki-concurrent-");
    let (ctx, user_data) = canned_ctx("concurrent", "windows", &home, Arc::new(Canned(404)));
    let args = wiki_args("Zzqx Qvbnm");
    let (first, second) = tokio::join!(
        dispatch("info_wiki_get", std::slice::from_ref(&args), &ctx),
        dispatch("info_wiki_get", std::slice::from_ref(&args), &ctx),
    );
    let (first, second) = (first.unwrap(), second.unwrap());
    assert_eq!(first, second);
    assert!(first["fetchStatus"].is_object(), "{first}");

    let text = std::fs::read_to_string(user_data.join("store_cache/wikigameinfo.json")).unwrap();
    let file: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(file["Zzqx Qvbnm"], first, "the stored entry is the answer");
    assert!(
        file["__timestamp"]["Zzqx Qvbnm"].is_string(),
        "the timestamp sits beside the value: {file}"
    );
    // A third call is served from the entry the two left.
    let third = dispatch("info_wiki_get", &[args], &ctx).await.unwrap();
    assert_eq!(third, first);
}

/// A shape the TS threw out of its one `try` is the `null` answer and nothing is cached: GamesDB's
/// answer with data but no `game.releases` list (86-21's `Err`).
#[tokio::test]
async fn a_source_that_threw_outside_its_own_try_gives_null_and_caches_nothing() {
    let home = FakeHome::new("info-wiki-null-");
    // A GOG game on Windows: the GamesDB release answers 200 `{}`, which has no `game`.
    let (ctx, user_data) = canned_ctx("null", "windows", &home, Arc::new(Canned(200)));
    let args = json!({ "title": "Zzqx", "appName": "1", "runner": "gog" });
    let result = dispatch("info_wiki_get", &[args], &ctx).await.unwrap();
    assert_eq!(result, Value::Null);
    assert!(
        !user_data.join("store_cache/wikigameinfo.json").exists(),
        "nothing is cached for a failed lookup"
    );
}

#[tokio::test]
async fn an_unknown_runner_and_bad_args_are_refused_before_any_request() {
    let home = FakeHome::new("info-wiki-bad-");
    let (ctx, _) = canned_ctx("bad", "windows", &home, Arc::new(Canned(404)));
    for bad in [
        json!({ "title": "t", "appName": "a", "runner": "humble" }),
        json!({ "title": "t", "appName": "a" }),
        json!({ "title": "t", "appName": "a", "runner": "gog", "extra": 1 }),
        json!({ "title": "t", "appName": "a", "runner": "gog", "forceRefresh": 1 }),
    ] {
        let err = dispatch("info_wiki_get", &[bad], &ctx).await.unwrap_err();
        assert_eq!(err, "info_wiki_get:bad-args");
    }
    assert_eq!(
        dispatch("info_wiki_get", &[], &ctx).await,
        Err("info_wiki_get:bad-args".to_string())
    );
}

// ---- info_wiki_cache_clear (86-22 Task 2) ----

/// A profile holding a fresh wiki entry and a fresh umu entry, from two golden starting states.
fn profile_with_both_caches() -> (FakeHome, gamelib_info::ctx::InfoCtx, std::path::PathBuf) {
    let home = FakeHome::new("info-wiki-clear-");
    let (ctx, user_data) = canned_ctx(
        "cache-fresh-windows-no-request",
        "windows",
        &home,
        Arc::new(Canned(404)),
    );
    let umu_state = fixtures().join("state/wiki/umu-cache-fresh-no-request/store_cache/umu.json");
    std::fs::copy(umu_state, user_data.join("store_cache/umu.json")).unwrap();
    (home, ctx, user_data)
}

#[tokio::test]
async fn the_cache_clear_op_empties_the_wiki_cache_and_leaves_umu_alone() {
    let (_home, ctx, user_data) = profile_with_both_caches();
    let wiki_file = user_data.join("store_cache/wikigameinfo.json");
    let umu_file = user_data.join("store_cache/umu.json");
    let umu_before = std::fs::read(&umu_file).unwrap();
    let before = std::fs::read_to_string(&wiki_file).unwrap();
    assert!(before.contains("Zzqx Qvbnm") && before.contains("__timestamp"));

    let result = dispatch("info_wiki_cache_clear", &[], &ctx).await;
    assert_eq!(result, Ok(Value::Null));
    let after = std::fs::read_to_string(&wiki_file).unwrap();
    let parsed: Value = serde_json::from_str(&after).unwrap();
    assert!(
        !after.contains("Zzqx Qvbnm") && parsed.get("__timestamp").is_none(),
        "both the value and its timestamp are gone: {after}"
    );
    assert_eq!(
        std::fs::read(&umu_file).unwrap(),
        umu_before,
        "umu untouched"
    );

    // Clearing again is a no-op: the file is byte for byte what the first clear left.
    assert_eq!(
        dispatch("info_wiki_cache_clear", &[], &ctx).await,
        Ok(Value::Null)
    );
    assert_eq!(std::fs::read_to_string(&wiki_file).unwrap(), after);
    assert_eq!(std::fs::read(&umu_file).unwrap(), umu_before);
}

#[tokio::test]
async fn the_cache_clear_op_takes_no_argument_and_clears_a_profile_with_no_cache() {
    let (_home, ctx, _) = profile_with_both_caches();
    assert_eq!(
        dispatch("info_wiki_cache_clear", &[json!({})], &ctx).await,
        Err("info_wiki_cache_clear:bad-args".to_string())
    );
    let home = FakeHome::new("info-wiki-clear-empty-");
    let (ctx, _) = canned_ctx("empty", "windows", &home, Arc::new(Canned(404)));
    assert_eq!(
        dispatch("info_wiki_cache_clear", &[], &ctx).await,
        Ok(Value::Null)
    );
}

/// After a clear the next lookup asks the sources again (the entry is gone, so nothing is served).
#[tokio::test]
async fn a_lookup_after_a_clear_fetches_again() {
    let (_home, ctx, _) = profile_with_both_caches();
    // The fresh entry is served with no request.
    let served = dispatch("info_wiki_get", &[wiki_args("Zzqx Qvbnm")], &ctx)
        .await
        .unwrap();
    assert_eq!(served["fetchStatus"]["pcgamingwiki"], "notfound");
    dispatch("info_wiki_cache_clear", &[], &ctx).await.unwrap();
    // The stub answers every request 404, so a fetch gives an `error` PCGamingWiki outcome; the served
    // entry said `notfound`.
    let fetched = dispatch("info_wiki_get", &[wiki_args("Zzqx Qvbnm")], &ctx)
        .await
        .unwrap();
    assert_eq!(fetched["fetchStatus"]["pcgamingwiki"], "error");
}
