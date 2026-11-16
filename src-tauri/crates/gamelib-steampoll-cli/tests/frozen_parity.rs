//! Phase 80 plan 19 (D-14): the Rust replay against the frozen TS streams in
//! `gamelib-steampoll/tests/fixtures/expected-ts/`, with the accepted divergence ledger
//! (`divergences.json`). Needs no TS: it keeps parity enforced after the TS loops are deleted.
//!
//! A diff that is not in the ledger fails, and so does a ledger entry that no longer diffs.

use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::Command;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../gamelib-steampoll/tests/fixtures")
}

fn replay(name: &str) -> Vec<Value> {
    let out = Command::new(env!("CARGO_BIN_EXE_gamelib-steampoll-cli"))
        .env_clear()
        .arg("replay")
        .arg(fixtures().join("timelines").join(format!("{name}.json")))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0), "replay {name} failed");
    serde_json::from_slice(&out.stdout).unwrap()
}

/// JSON has one number type: `2` (TS) and `2.0` (Rust f64) are the same value.
fn canon(v: Value) -> Value {
    match v {
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 9e15 => Value::from(f as i64),
            _ => Value::Number(n),
        },
        Value::Array(a) => Value::Array(a.into_iter().map(canon).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, x)| (k, canon(x))).collect()),
        other => other,
    }
}

fn read_json(path: PathBuf) -> Value {
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap()
}

/// (recordIndex, tsRecord, rustRecord) for every index where the streams differ; a missing side is null.
fn diff(ts: &[Value], rust: &[Value]) -> Vec<(usize, Value, Value)> {
    (0..ts.len().max(rust.len()))
        .filter_map(|i| {
            let a = canon(ts.get(i).cloned().unwrap_or(Value::Null));
            let b = canon(rust.get(i).cloned().unwrap_or(Value::Null));
            (a != b).then_some((i, a, b))
        })
        .collect()
}

#[test]
fn rust_replay_equals_frozen_ts_streams_except_ledgered_records() {
    let ledger = read_json(fixtures().join("divergences.json"));
    let mut by_scenario: BTreeMap<String, Vec<(usize, Value, Value)>> = BTreeMap::new();
    for e in ledger.as_array().unwrap() {
        let dv = e["dv"].as_str().unwrap();
        assert!(
            dv.starts_with("DV-80-") && dv.len() == 8,
            "ledger entry without a DV-80-nn id: {e}"
        );
        by_scenario
            .entry(e["scenario"].as_str().unwrap().to_string())
            .or_default()
            .push((
                e["recordIndex"].as_u64().unwrap() as usize,
                canon(e["tsRecord"].clone()),
                canon(e["rustRecord"].clone()),
            ));
    }

    let mut names: Vec<String> = std::fs::read_dir(fixtures().join("timelines"))
        .unwrap()
        .filter_map(|f| {
            let n = f.unwrap().file_name().into_string().unwrap();
            n.strip_suffix(".json").map(str::to_string)
        })
        .collect();
    names.sort();
    assert!(names.len() >= 34);
    for scenario in by_scenario.keys() {
        assert!(
            names.contains(scenario),
            "ledger names unknown scenario {scenario}"
        );
    }

    for name in &names {
        let frozen = read_json(fixtures().join("expected-ts").join(format!("{name}.json")));
        let got = diff(frozen.as_array().unwrap(), &replay(name));
        let want = by_scenario.remove(name).unwrap_or_default();
        assert_eq!(
            got, want,
            "{name}: streams differ from the frozen TS stream beyond the ledger (or the ledger is stale)"
        );
    }
}
