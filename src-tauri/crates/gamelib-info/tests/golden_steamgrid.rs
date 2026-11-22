//! SteamGridDB against the TS goldens (86-07, SC1, D-10): every case in
//! `tests/fixtures/golden/steamgrid/cases.json` runs through the crate's own dispatcher over a
//! `Replay` of the recorded exchanges, which pins each request to the one the TS made (path, the
//! decoded query pairs in order, `User-Agent`, and the `Authorization` header, which the recorder
//! stores as `REDACTED`). What each op returned must equal the TS oracle's golden, and the replay
//! must finish clean: no unmatched request, no recorded exchange left over.
//!
//! The key is the string `REDACTED` in an in-memory source, never a real one.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::{Http, Replay};
use gamelib_info::secrets::{MemorySecretSource, Slot};
use gamelib_info::{dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 6;

/// Every case op this file replays; a case holding an op not listed is not replayed (and counts
/// against the replayed floor below).
const REPLAYED: &[&str] = &["search", "grids", "heroes"];

/// The cases the oracle recorded: at least this many must be replayed, so a stale `REPLAYED` list
/// cannot quietly skip the golden.
const REPLAYED_FLOOR: usize = 12;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/steamgrid")
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
fn the_steamgrid_ops_are_in_the_sorted_op_table() {
    for op in [
        "info_steamgrid_grids",
        "info_steamgrid_has_key",
        "info_steamgrid_heroes",
        "info_steamgrid_search",
        "info_steamgrid_set_key",
    ] {
        assert!(OPS.contains(&op), "{op}");
    }
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

/// A context on a FakeHome over `http`, with the in-memory key source (`REDACTED` when `with_key`,
/// the empty source otherwise).
fn ctx_over(home: &FakeHome, http: Arc<dyn Http>, with_key: bool) -> InfoCtx {
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
    ctx.secrets = Some(Arc::new(if with_key {
        MemorySecretSource::with(Slot::SteamGridDb, "REDACTED")
    } else {
        MemorySecretSource::new()
    }));
    ctx
}

/// One case op through the dispatcher, as the TS oracle's `{ ok }` / `{ error }` record.
fn run_op(ctx: &InfoCtx, op: &Value, first_search_id: &mut Option<u64>) -> Value {
    let result = match op["op"].as_str().unwrap() {
        "search" => {
            let found = dispatch_sync(
                "info_steamgrid_search",
                &[json!({ "query": op["query"] })],
                ctx,
            );
            if let Ok(list) = &found {
                *first_search_id = list.get(0).and_then(|g| g["id"].as_u64());
            }
            found
        }
        kind @ ("grids" | "heroes") => {
            let game_id = if op["gameIdFromSearch"] == json!(true) {
                json!(first_search_id)
            } else {
                op["gameId"].clone()
            };
            let mut args = json!({ "gameId": game_id });
            for field in ["styles", "dimensions"] {
                if let Some(list) = op.get(field) {
                    args[field] = list.clone();
                }
            }
            dispatch_sync(&format!("info_steamgrid_{kind}"), &[args], ctx)
        }
        other => panic!("unknown op {other}"),
    };
    match result {
        Ok(value) => json!({ "ok": value }),
        Err(message) => json!({ "error": message }),
    }
}

fn replayed(case: &Value) -> bool {
    case["ops"]
        .as_array()
        .unwrap()
        .iter()
        .all(|op| REPLAYED.contains(&op["op"].as_str().unwrap_or_default()))
}

#[test]
fn every_case_matches_the_ts_results_and_makes_exactly_the_recorded_requests() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases: Vec<&Value> = cases
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| replayed(c))
        .collect();
    assert!(
        cases.len() >= REPLAYED_FLOOR,
        "replayed {} cases, below {REPLAYED_FLOOR}",
        cases.len()
    );
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let replay = Arc::new(
            Replay::from_case(&fixtures().join("recorded/steamgrid").join(id))
                .unwrap_or_else(|e| panic!("{id}: {e}")),
        );
        let home = FakeHome::new("info-steamgrid-");
        let ctx = ctx_over(&home, replay.clone(), case["key"] == json!("set"));
        let mut first = None;
        let got: Vec<Value> = case["ops"]
            .as_array()
            .unwrap()
            .iter()
            .map(|op| run_op(&ctx, op, &mut first))
            .collect();
        let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
        assert_eq!(
            Value::Array(got),
            want["ops"],
            "{id}: results differ from the TS golden"
        );
        replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
    }
}

#[test]
fn a_changed_request_is_caught_by_the_replay_pin() {
    // The 401 case recorded `Authorization` and the Heroic-style User-Agent. A different version
    // changes the User-Agent, which the replay pins: the op fails and the replay finishes unclean.
    let id = "synthetic-search-401-rethrows";
    let replay =
        Arc::new(Replay::from_case(&fixtures().join("recorded/steamgrid").join(id)).unwrap());
    let home = FakeHome::new("info-steamgrid-pin-");
    let mut ctx = ctx_over(&home, replay.clone(), true);
    ctx.app_version = "9.9.9".to_string();
    let result = dispatch_sync(
        "info_steamgrid_search",
        &[json!({ "query": "Celeste" })],
        &ctx,
    );
    assert!(result.is_err());
    let report = replay.finish().unwrap_err();
    assert!(report.to_lowercase().contains("user-agent"), "{report}");
    assert!(!report.contains("Bearer"), "{report}");
}

// ---------------------------------------------------------------------------------------------
// The renderer-facing bounds, the key channels and the error texts (T-86-31/32/33)
// ---------------------------------------------------------------------------------------------

use gamelib_info::http::{HttpError, HttpFuture, Request, Response};
use std::sync::Mutex;

/// Answers every request with one canned result and remembers the requests.
struct Stub {
    answer: Result<Response, HttpError>,
    seen: Mutex<Vec<Request>>,
}

impl Stub {
    fn body(status: u16, body: &str) -> Arc<Stub> {
        Stub::answering(Ok(Response {
            status,
            headers: Vec::new(),
            body: body.as_bytes().to_vec(),
        }))
    }

    fn answering(answer: Result<Response, HttpError>) -> Arc<Stub> {
        Arc::new(Stub {
            answer,
            seen: Mutex::new(Vec::new()),
        })
    }

    fn requests(&self) -> usize {
        self.seen.lock().unwrap().len()
    }
}

impl Http for Stub {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        self.seen.lock().unwrap().push(request);
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
}

fn with_stub(answer: Arc<Stub>) -> (FakeHome, InfoCtx) {
    let home = FakeHome::new("info-steamgrid-stub-");
    let ctx = ctx_over(&home, answer, true);
    (home, ctx)
}

fn grid_args(extra: Value) -> Value {
    let mut args = json!({ "gameId": 5 });
    for (k, v) in extra.as_object().unwrap() {
        args[k] = v.clone();
    }
    args
}

#[test]
fn grids_and_heroes_reject_what_the_zod_schema_rejected_without_a_request() {
    let stub = Stub::body(200, r#"{"success":true,"data":[]}"#);
    let (_home, ctx) = with_stub(stub.clone());
    let too_many = json!(vec!["a"; 65]);
    let too_long = json!(["x".repeat(65)]);
    let bad: Vec<Value> = vec![
        json!({ "gameId": 0 }),
        json!({ "gameId": -1 }),
        json!({ "gameId": 1.5 }),
        json!({ "gameId": "1" }),
        json!({ "gameId": null }),
        json!({}),
        json!({ "gameId": 1, "extra": 1 }),
        grid_args(json!({ "styles": too_many })),
        grid_args(json!({ "dimensions": too_many })),
        grid_args(json!({ "styles": too_long })),
        grid_args(json!({ "dimensions": too_long })),
        grid_args(json!({ "styles": null })),
        grid_args(json!({ "styles": [1] })),
        grid_args(json!({ "styles": "alternate" })),
    ];
    for op in ["info_steamgrid_grids", "info_steamgrid_heroes"] {
        for args in &bad {
            assert_eq!(
                dispatch_sync(op, std::slice::from_ref(args), &ctx),
                Err(format!("{op}:bad-args")),
                "{op} {args}"
            );
        }
        // The limits themselves are accepted: 64 entries of 64 characters.
        let at_limit = grid_args(json!({ "styles": vec!["x".repeat(64); 64] }));
        assert!(dispatch_sync(op, &[at_limit], &ctx).is_ok(), "{op}");
        // A wrong argument count is bad too.
        assert_eq!(dispatch_sync(op, &[], &ctx), Err(format!("{op}:bad-args")));
    }
    // Only the two at-limit calls reached the network.
    assert_eq!(stub.requests(), 2);
}

#[test]
fn search_rejects_a_long_or_malformed_query_without_a_request() {
    let stub = Stub::body(200, r#"{"success":true,"data":[]}"#);
    let (_home, ctx) = with_stub(stub.clone());
    let op = "info_steamgrid_search";
    for args in [
        vec![],
        vec![json!("Celeste")],
        vec![json!({ "query": 1 })],
        vec![json!({ "query": "a", "extra": 1 })],
        vec![json!({ "query": "x".repeat(257) })],
        // 129 astral characters are 258 UTF-16 units.
        vec![json!({ "query": "\u{1F3AE}".repeat(129) })],
    ] {
        assert_eq!(
            dispatch_sync(op, &args, &ctx),
            Err(format!("{op}:bad-args")),
            "{args:?}"
        );
    }
    assert_eq!(stub.requests(), 0);
    // 256 units and the empty query are fine.
    assert!(dispatch_sync(op, &[json!({ "query": "x".repeat(256) })], &ctx).is_ok());
    assert!(dispatch_sync(op, &[json!({ "query": "" })], &ctx).is_ok());
    assert_eq!(stub.requests(), 2);
}

#[test]
fn set_key_trims_empty_clears_and_has_key_follows_the_slot() {
    let home = FakeHome::new("info-steamgrid-key-");
    let source = Arc::new(MemorySecretSource::new());
    let mut ctx = ctx_over(&home, Stub::body(200, "{}"), false);
    ctx.secrets = Some(source.clone());
    let has = |ctx: &InfoCtx| dispatch_sync("info_steamgrid_has_key", &[json!({})], ctx).unwrap();
    let set = |ctx: &InfoCtx, key: &str| {
        dispatch_sync("info_steamgrid_set_key", &[json!({ "key": key })], ctx)
    };
    assert_eq!(has(&ctx), json!(false));
    assert_eq!(set(&ctx, "  k  "), Ok(Value::Null));
    use gamelib_info::secrets::SecretSource;
    assert_eq!(
        source.get(Slot::SteamGridDb).unwrap().as_deref(),
        Some("k"),
        "the stored key is trimmed"
    );
    assert_eq!(has(&ctx), json!(true));
    // An empty value, and a whitespace-only one, clear the slot.
    assert_eq!(set(&ctx, ""), Ok(Value::Null));
    assert_eq!(has(&ctx), json!(false));
    assert_eq!(set(&ctx, "again"), Ok(Value::Null));
    assert_eq!(set(&ctx, "   "), Ok(Value::Null));
    assert_eq!(source.get(Slot::SteamGridDb).unwrap(), None);
    assert_eq!(has(&ctx), json!(false));
    // The slot named is the steamgrid one only: nothing lands in the ITAD slot.
    assert_eq!(source.get(Slot::Itad).unwrap(), None);
}

#[test]
fn set_key_bounds_and_strictness() {
    let home = FakeHome::new("info-steamgrid-keybad-");
    let ctx = ctx_over(&home, Stub::body(200, "{}"), false);
    let op = "info_steamgrid_set_key";
    for args in [
        vec![],
        vec![json!("k")],
        vec![json!({ "key": 1 })],
        vec![json!({ "key": null })],
        vec![json!({ "key": "k", "extra": 1 })],
        vec![json!({ "key": "k".repeat(257) })],
    ] {
        assert_eq!(
            dispatch_sync(op, &args, &ctx),
            Err(format!("{op}:bad-args")),
            "{args:?}"
        );
    }
    assert_eq!(
        dispatch_sync(op, &[json!({ "key": "k".repeat(256) })], &ctx),
        Ok(Value::Null)
    );
    assert_eq!(
        dispatch_sync("info_steamgrid_has_key", &[json!({ "x": 1 })], &ctx),
        Err("info_steamgrid_has_key:bad-args".to_string())
    );
}

#[test]
fn a_failed_key_write_or_read_never_names_the_key_and_a_failed_read_means_no_key() {
    // No secret source at all: reads are "no key" (the TS getApiKey was total), writes say why.
    let home = FakeHome::new("info-steamgrid-nosource-");
    let stub = Stub::body(200, r#"{"success":true,"data":[]}"#);
    let mut ctx = ctx_over(&home, stub.clone(), false);
    ctx.secrets = None;
    assert_eq!(
        dispatch_sync("info_steamgrid_has_key", &[json!({})], &ctx),
        Ok(json!(false))
    );
    assert_eq!(
        dispatch_sync(
            "info_steamgrid_search",
            &[json!({ "query": "Celeste" })],
            &ctx
        ),
        Ok(json!([]))
    );
    assert_eq!(stub.requests(), 0, "no key, no request");
    let error = dispatch_sync(
        "info_steamgrid_set_key",
        &[json!({ "key": "super-secret-key" })],
        &ctx,
    )
    .unwrap_err();
    assert_eq!(error, "info_steamgrid_set_key:no-secret-source");
    assert!(!error.contains("super-secret-key"));
}

#[test]
fn the_key_travels_only_in_the_authorization_header() {
    let stub = Stub::body(200, r#"{"success":true,"data":[{"id":1,"name":"x"}]}"#);
    let home = FakeHome::new("info-steamgrid-header-");
    let mut ctx = ctx_over(&home, stub.clone(), false);
    ctx.secrets = Some(Arc::new(MemorySecretSource::with(
        Slot::SteamGridDb,
        "the-real-key",
    )));
    dispatch_sync(
        "info_steamgrid_search",
        &[json!({ "query": "Dead Cells: Bad Seed" })],
        &ctx,
    )
    .unwrap();
    dispatch_sync(
        "info_steamgrid_grids",
        &[json!({ "gameId": 7, "styles": ["a"] })],
        &ctx,
    )
    .unwrap();
    let seen = stub.seen.lock().unwrap();
    assert_eq!(seen.len(), 2);
    for request in seen.iter() {
        assert!(!request.url.contains("the-real-key"), "{}", request.url);
        let auth = request
            .headers
            .iter()
            .find(|(k, _)| k == "Authorization")
            .map(|(_, v)| v.as_str());
        assert_eq!(auth, Some("Bearer the-real-key"));
    }
    // encodeURIComponent: the colon and the spaces are escaped in the path.
    assert_eq!(
        seen[0].url,
        "https://www.steamgriddb.com/api/v2/search/autocomplete/Dead%20Cells%3A%20Bad%20Seed"
    );
}

#[test]
fn errors_carry_the_axios_text_and_never_the_url_or_the_key() {
    let run = |answer: Arc<Stub>| {
        let (_home, ctx) = with_stub(answer);
        dispatch_sync("info_steamgrid_grids", &[json!({ "gameId": 3 })], &ctx)
    };
    assert_eq!(
        run(Stub::body(500, "")),
        Err("Request failed with status code 500".to_string())
    );
    assert_eq!(
        run(Stub::body(404, r#"{"success":false}"#)),
        Err("Request failed with status code 404".to_string())
    );
    assert_eq!(
        run(Stub::answering(Err(HttpError::Network(
            "https://www.steamgriddb.com/api/v2/grids/game/3 refused".to_string()
        )))),
        Err("Network Error".to_string())
    );
    assert_eq!(
        run(Stub::answering(Err(HttpError::Timeout))),
        Err("timeout of 30000ms exceeded".to_string())
    );
    // A 2xx that is not the API's JSON, or has no success flag, is the endpoint's fixed message.
    for body in [
        "not json",
        "",
        "[]",
        "7",
        r#"{"success":0}"#,
        r#"{"data":[]}"#,
    ] {
        assert_eq!(
            run(Stub::body(200, body)),
            Err("Failed to get grids".to_string()),
            "{body}"
        );
    }
    // `null` is what JSON.parse gave the TS before `.success` threw.
    assert_eq!(
        run(Stub::body(200, "null")),
        Err("Cannot read properties of null (reading 'success')".to_string())
    );
    // Success with the list missing, null, or not a list.
    assert_eq!(
        run(Stub::body(200, r#"{"success":true}"#)),
        Err("Cannot read properties of undefined (reading 'map')".to_string())
    );
    assert_eq!(
        run(Stub::body(200, r#"{"success":true,"data":null}"#)),
        Err("Cannot read properties of null (reading 'map')".to_string())
    );
    assert_eq!(
        run(Stub::body(200, r#"{"success":true,"data":{}}"#)),
        Err("results.map is not a function".to_string())
    );
    // Errors from the API join with ", "; an all-empty list falls back to the fixed message.
    assert_eq!(
        run(Stub::body(200, r#"{"success":false,"errors":["a","b"]}"#)),
        Err("a, b".to_string())
    );
    assert_eq!(
        run(Stub::body(200, r#"{"success":false,"errors":[""]}"#)),
        Err("Failed to get grids".to_string())
    );
}

#[test]
fn results_keep_only_the_fields_the_ts_handler_kept() {
    let (_home, ctx) = with_stub(Stub::body(
        200,
        r#"{"success":true,"data":[{"id":1,"url":"u","thumb":"t","score":9},{"id":2}]}"#,
    ));
    assert_eq!(
        dispatch_sync("info_steamgrid_heroes", &[json!({ "gameId": 1 })], &ctx),
        Ok(json!([{ "id": 1, "url": "u", "thumb": "t" }, { "id": 2 }]))
    );
}
