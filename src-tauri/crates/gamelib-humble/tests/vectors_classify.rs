//! Replays every classify golden recorded from the TypeScript (94-06, D-05/D-06) through the Rust
//! port. A golden is `{fn, input, output}`; the expected value is the TS's, never typed here. A case
//! that disagrees prints its id and both values, and the test fails after all cases ran.
//!
//! The floor guards the replay itself: a manifest count the directory does not match, a count under
//! the floor, a classifier version the constant does not equal, or a function family with no case at
//! all fails the test instead of letting an empty or truncated vector set pass.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use gamelib_humble::classify::{
    classify_order, classify_tpk, describe_missing_expiration_tpks, describe_skipped_entitlements,
    describe_zero_key_order, extract_expiration, is_freeze_eligible, is_server_terminal,
    is_terminal, FreezeKey, HumbleKeyState, TpkSignals, HUMBLE_CLASSIFIER_VERSION,
};
use gamelib_humble::js_date::{parse_js_date, LocalZone};
use gamelib_humble::js_value::JsValue;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
struct Manifest {
    count: usize,
    floor: usize,
    #[serde(rename = "classifierVersion")]
    classifier_version: u32,
}

/// One golden. `input` is read order-preserving: the diagnostics list field names in document order.
#[derive(Deserialize)]
struct Case {
    #[serde(rename = "fn")]
    func: String,
    input: JsValue,
    output: Value,
}

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/classify")
}

/// The fixed-offset zones the goldens were recorded in (none observes daylight saving). A case with
/// no `tz` is zone-independent by construction (every instant it carries has a zone of its own).
fn zone_of(input: &JsValue) -> LocalZone<'_> {
    match input.get("tz").and_then(JsValue::as_str) {
        None | Some("UTC") => LocalZone::UTC,
        Some("America/Phoenix") => LocalZone::from_east_secs(-7 * 3600),
        Some("Asia/Kolkata") => LocalZone::from_east_secs(5 * 3600 + 1800),
        Some(other) => panic!("a golden names a zone this replay does not know: {other}"),
    }
}

fn now_of(input: &JsValue) -> i64 {
    let now = input
        .get("now")
        .and_then(JsValue::as_str)
        .expect("a case with a clock carries `now`");
    parse_js_date(now, LocalZone::UTC).expect("`now` is an ISO instant")
}

/// A recorded selector: `{all: bool}` or `{only: [name, ...]}`.
fn selects(selector: &JsValue, name: &str) -> bool {
    match (selector.get("all"), selector.get("only")) {
        (Some(JsValue::Bool(all)), _) => *all,
        (_, Some(JsValue::Array(only))) => only.iter().any(|v| v.as_str() == Some(name)),
        _ => panic!("a selector is {{all}} or {{only}}"),
    }
}

fn plain(value: &JsValue) -> Value {
    fn walk(value: &JsValue) -> Value {
        match value {
            JsValue::Null => Value::Null,
            JsValue::Bool(b) => json!(b),
            JsValue::Number(n) => json!(n),
            JsValue::String(s) => json!(s),
            JsValue::Array(a) => Value::Array(a.iter().map(walk).collect()),
            JsValue::Object(o) => {
                Value::Object(o.iter().map(|(k, v)| (k.clone(), walk(v))).collect())
            }
        }
    }
    walk(value)
}

fn arg<'a>(input: &'a JsValue, name: &str) -> &'a JsValue {
    input
        .get(name)
        .unwrap_or_else(|| panic!("a case carries `{name}`"))
}

/// Runs the Rust function a case names over its input and returns what the TS golden holds.
fn run(case: &Case) -> Value {
    let input = &case.input;
    match case.func.as_str() {
        "classifyOrder" => {
            let revealed = arg(input, "revealed");
            let redeemed = arg(input, "redeemed");
            let out = classify_order(
                arg(input, "order"),
                |machine| selects(revealed, machine),
                now_of(input),
                zone_of(input),
                |gamekey, machine| selects(redeemed, &format!("{gamekey}:{machine}")),
            );
            serde_json::to_value(out).expect("serialises")
        }
        "classifyTpk" => {
            let tpk: TpkSignals =
                serde_json::from_value(plain(arg(input, "tpk"))).expect("tpk signals");
            let flag = |name: &str| matches!(arg(input, name), JsValue::Bool(true));
            serde_json::to_value(classify_tpk(
                &tpk,
                flag("isLocallyRevealed"),
                flag("isLocallyRedeemed"),
                now_of(input),
                zone_of(input),
            ))
            .expect("serialises")
        }
        "isTerminal" | "isServerTerminal" => {
            let state: HumbleKeyState =
                serde_json::from_value(plain(arg(input, "state"))).expect("a state");
            json!(if case.func == "isTerminal" {
                is_terminal(state)
            } else {
                is_server_terminal(state)
            })
        }
        "isFreezeEligible" => {
            let key: FreezeKey = serde_json::from_value(plain(arg(input, "key"))).expect("a key");
            json!(is_freeze_eligible(&key))
        }
        "extractExpiration" => json!(extract_expiration(
            arg(input, "tpk"),
            now_of(input),
            zone_of(input)
        )),
        "describeZeroKeyOrder" => {
            serde_json::to_value(describe_zero_key_order(arg(input, "order"))).expect("serialises")
        }
        "describeSkippedEntitlements" => json!(describe_skipped_entitlements(arg(input, "order"))),
        "describeMissingExpirationTpks" => json!(describe_missing_expiration_tpks(
            arg(input, "order"),
            now_of(input),
            zone_of(input)
        )),
        other => panic!("a golden names a function this replay does not know: {other}"),
    }
}

#[test]
fn every_classify_vector_replays_exactly() {
    let dir = golden_dir();
    let manifest: Manifest = serde_json::from_str(
        &fs::read_to_string(dir.join("MANIFEST.json")).expect("the classify manifest"),
    )
    .expect("a valid manifest");

    assert_eq!(
        HUMBLE_CLASSIFIER_VERSION, manifest.classifier_version,
        "the Rust classifier version must equal the one the goldens were recorded under"
    );

    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .expect("the classify golden directory")
        .map(|e| e.expect("a directory entry").path())
        .filter(|p| {
            p.extension().is_some_and(|e| e == "json")
                && p.file_name().is_some_and(|n| n != "MANIFEST.json")
        })
        .collect();
    files.sort();

    assert_eq!(
        files.len(),
        manifest.count,
        "the manifest count and the case files must agree"
    );
    assert!(
        manifest.count >= manifest.floor && manifest.floor > 0,
        "the manifest count {} must stay at or above its floor {}",
        manifest.count,
        manifest.floor
    );

    let mut per_function: BTreeMap<String, usize> = BTreeMap::new();
    let mut failures: Vec<String> = Vec::new();
    for path in &files {
        let id = path
            .file_stem()
            .expect("a file name")
            .to_string_lossy()
            .into_owned();
        let text = fs::read_to_string(path).expect("a readable case");
        let case: Case = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{id}: {e}"));
        *per_function.entry(case.func.clone()).or_default() += 1;
        let got = run(&case);
        if got != case.output {
            failures.push(format!(
                "{id}\n  TS golden: {}\n  Rust:      {got}",
                case.output
            ));
        }
    }

    // Every export the library calls has vectors, so a silently dropped family fails here.
    for func in [
        "classifyOrder",
        "classifyTpk",
        "isTerminal",
        "isServerTerminal",
        "isFreezeEligible",
        "extractExpiration",
        "describeZeroKeyOrder",
        "describeSkippedEntitlements",
        "describeMissingExpirationTpks",
    ] {
        assert!(
            per_function.get(func).copied().unwrap_or(0) > 0,
            "no vector exercises {func}"
        );
    }

    assert!(
        failures.is_empty(),
        "{} of {} classify vectors disagree with the TypeScript:\n{}",
        failures.len(),
        files.len(),
        failures
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
