//! The umu id lookup against the TS goldens (86-06 recorded them, 86-20 ports them; SC1, D-04, D-10,
//! D-18): every `umu` case in `tests/fixtures/golden/wiki/cases.json` runs over a `Replay` of the
//! recorded exchanges filtered to the umu host (the pin on each request), on a clock that only moves
//! when a case says so, over a copy of the case's starting profile (`state/wiki/<case>`, the
//! `store_cache/umu.json` file).
//!
//! What the op returned, the requests made, how many it made and the bytes of every cache file the case
//! left behind (`expected/<case>/after`) must equal the TS oracle's golden, and the replay must finish
//! clean: no unmatched request, no recorded exchange left over.

mod wiki_golden;

use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use gamelib_info::dispatch;
use gamelib_info::http::{Http, Replay};
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use wiki_golden::*;

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 25;

/// The `umu` cases the oracle recorded that this file must replay (86-06 recorded nine).
const REPLAYED_FLOOR: usize = 9;

const UMU_HOST: &str = "umu.openwinecomponents.org";

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
fn the_umu_op_is_in_the_sorted_op_table() {
    assert!(gamelib_info::OPS.contains(&"info_umu_get"));
    let mut sorted = gamelib_info::OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(gamelib_info::OPS, sorted.as_slice());
}

fn umu_cases(cases: &[Value]) -> Vec<&Value> {
    cases
        .iter()
        .filter(|c| {
            c["ops"]
                .as_array()
                .unwrap()
                .iter()
                .all(|o| o["op"] == "umu")
        })
        .collect()
}

async fn replay_case(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let replay = Arc::new(
        Replay::for_host(&fixtures().join("recorded/wiki").join(id), UMU_HOST)
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Http>));
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-umu-");
    let (ctx, user_data) = case_ctx(case, &home, &clock, Arc::clone(&tap) as Arc<dyn Http>);

    let mut got = Vec::new();
    for op in case["ops"].as_array().unwrap() {
        let before = tap.count();
        let args = json!({ "appName": op["app_name"], "runner": op["runner"] });
        let result = dispatch("info_umu_get", &[args], &ctx)
            .await
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        got.push(json!({
            "op": "umu",
            "runner": op["runner"],
            "app_name": op["app_name"],
            "result": result,
            "requestsMade": tap.count() - before
        }));
    }
    let expected = golden_dir().join("expected").join(id);
    let want = read_json(&expected.join("result.json"));
    assert_eq!(json!(got), want["ops"], "{id}: ops");
    assert_eq!(json!(tap.urls()), want["requests"], "{id}: requests");
    replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    // The bytes of every file the case left.
    let want_files = tree(&expected.join("after"));
    let got_files = tree(&user_data);
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

#[tokio::test]
async fn every_direct_getumuid_case_matches_the_ts_results_requests_and_cache_bytes() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let direct = umu_cases(cases.as_array().unwrap());
    assert!(
        direct.len() >= REPLAYED_FLOOR,
        "{} umu cases, below the floor of {REPLAYED_FLOOR}",
        direct.len()
    );
    for case in direct {
        replay_case(case).await;
    }
}

/// A case that makes no request still has to prove that: an op that is not a store runner never reaches
/// the transport, and an unknown runner name is rejected the way the TS table lookup threw.
#[tokio::test]
async fn a_runner_without_a_catalog_asks_nothing_and_an_unknown_runner_is_refused() {
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/wiki/umu-sideload-has-no-store-catalog"))
            .unwrap(),
    );
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Http>));
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-umu-");
    let case = json!({ "id": "umu-sideload-has-no-store-catalog", "platform": "linux" });
    let (ctx, _) = case_ctx(&case, &home, &clock, Arc::clone(&tap) as Arc<dyn Http>);
    let sideload = json!({ "appName": "x", "runner": "sideload" });
    assert_eq!(
        dispatch("info_umu_get", &[sideload], &ctx).await,
        Ok(Value::Null)
    );
    let unknown = json!({ "appName": "x", "runner": "humble" });
    assert_eq!(
        dispatch("info_umu_get", &[unknown], &ctx).await,
        Err("info_umu_get:bad-args".to_string())
    );
    assert_eq!(tap.count(), 0);
}

/// Answers every request with one status and body.
struct Canned(u16, &'static str);

impl Http for Canned {
    fn send(&self, _request: gamelib_info::http::Request) -> gamelib_info::http::HttpFuture<'_> {
        let (status, body) = (self.0, self.1);
        Box::pin(async move {
            Ok(gamelib_info::http::Response {
                status,
                headers: Vec::new(),
                body: body.as_bytes().to_vec(),
            })
        })
    }
}

async fn canned_op(status: u16, body: &'static str) -> (Result<Value, String>, String) {
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-umu-");
    let case = json!({ "id": "umu-canned", "platform": "linux" });
    let (ctx, user_data) = case_ctx(&case, &home, &clock, Arc::new(Canned(status, body)));
    let args = json!({ "appName": "Abc", "runner": "legendary" });
    let result = dispatch("info_umu_get", &[args], &ctx).await;
    let stored =
        std::fs::read_to_string(user_data.join("store_cache/umu.json")).unwrap_or_default();
    (result, stored)
}

/// Shapes the TS handled by throwing (a failed destructure, a TypeError, conf refusing `undefined`) are
/// rejections that write nothing; the shapes it handled by returning are answers.
#[tokio::test]
async fn an_odd_answer_is_a_rejection_that_writes_nothing_and_a_plain_one_is_an_answer() {
    for body in [
        "{}", "null", "7", "true", "[null]", "[{}]", "[7]", "[[]]", "\"text\"", "not json",
    ] {
        let (result, stored) = canned_op(200, body).await;
        assert_eq!(
            result,
            Err("info_umu_get:bad-response".to_string()),
            "{body}"
        );
        assert_eq!(stored, "", "{body}");
    }
    // 2xx other than 200, and any other status: null, nothing stored.
    for status in [201, 204, 301, 404, 500] {
        let (result, stored) = canned_op(status, "[{\"umu_id\":\"umu-1\"}]").await;
        assert_eq!(result, Ok(Value::Null), "{status}");
        assert_eq!(stored, "", "{status}");
    }
    // An empty list, or an empty body (axios hands back the empty text): a miss, cached as null.
    for body in ["[]", ""] {
        let (result, stored) = canned_op(200, body).await;
        assert_eq!(result, Ok(Value::Null), "{body:?}");
        assert!(stored.contains("\"legendary_Abc\": null"), "{stored}");
    }
    // The first entry wins and only its id is kept; the id is stored and returned as the server sent it.
    let (result, stored) = canned_op(
        200,
        "[{\"title\":\"A\",\"umu_id\":\"umu-9\"},{\"umu_id\":\"umu-10\"}]",
    )
    .await;
    assert_eq!(result, Ok(json!("umu-9")));
    assert!(stored.contains("\"legendary_Abc\": \"umu-9\""), "{stored}");
}
