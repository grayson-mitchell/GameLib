//! Parity tier 1 (D-12): every op over every committed fixture must equal the TS golden in
//! `tests/fixtures/expected.json`, or the case's explicit `rustOverride` (which must carry a
//! `divergenceNote`, D-07). The normaliser is a port of src/backend/scanners/scanNormalize.ts;
//! the six rules there are the only things parity ignores.
//! The TS oracle that produced expected.json was deleted in 63-13/63-14; new cases are added by hand with a
//! Rust-verified expected value and a note naming the source of truth.

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

const EXPECTED: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/expected.json"
));
const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
const TOKEN: &str = "${FIXTURES}";

fn tokenise(value: &str) -> Option<String> {
    let fwd = FIXTURES.replace('\\', "/");
    let back = FIXTURES.replace('/', "\\");
    for root in [FIXTURES, fwd.as_str(), back.as_str()] {
        if let Some(rest) = value.strip_prefix(root) {
            return Some(format!("{TOKEN}{rest}").replace('\\', "/"));
        }
    }
    None
}

fn is_unreadable_pe(s: &str) -> bool {
    [
        "Failed to run objdump",
        "objdump exited with code",
        "not a parseable PE",
        "could not read ",
    ]
    .iter()
    .any(|p| s.starts_with(p))
}

fn normalise(
    op: &str,
    node: &Value,
    key: Option<&str>,
    parent: Option<&Map<String, Value>>,
) -> Value {
    match node {
        Value::Array(a) => Value::Array(a.iter().map(|v| normalise(op, v, None, None)).collect()),
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, v) in m {
                if k == "diagnostics" {
                    continue;
                }
                out.insert(k.clone(), normalise(op, v, Some(k), Some(m)));
            }
            Value::Object(out)
        }
        Value::String(s) => {
            if key == Some("readError") {
                return json!("<read-error>");
            }
            if op == "scan_steam_api_imports"
                && key == Some("error")
                && parent.and_then(|p| p.get("status")) == Some(&json!("error"))
                && is_unreadable_pe(s)
            {
                return json!("<unreadable-pe>");
            }
            if op == "scan_winemac_metal_exports"
                && key == Some("reason")
                && s.starts_with("could not read winemac.so: ")
            {
                return json!("could not read winemac.so: <io>");
            }
            if let Some(t) = tokenise(s) {
                return json!(t);
            }
            if matches!(key, Some("winemacPath") | Some("real")) {
                return json!(s.replace('\\', "/"));
            }
            node.clone()
        }
        Value::Null if key == Some("readError") => Value::Null,
        _ => node.clone(),
    }
}

#[test]
fn rust_equals_ts_goldens_for_every_fixture_and_op() {
    let doc: Value = serde_json::from_str(EXPECTED).expect("expected.json parses");
    let cases = doc["cases"].as_array().expect("cases array");
    assert!(cases.len() >= 40, "only {} cases", cases.len());

    let mut exercised: BTreeSet<String> = BTreeSet::new();
    let mut mismatches: Vec<String> = Vec::new();
    for case in cases {
        let name = case["name"].as_str().expect("case name");
        let override_ops = case.get("rustOverride");
        if override_ops.is_some() {
            let note = case.get("divergenceNote").and_then(Value::as_str);
            assert!(
                note.is_some_and(|n| n.len() > 20),
                "{name}: rustOverride without a divergenceNote"
            );
        }
        for (op, golden) in case["ops"].as_object().expect("ops object") {
            let args = if let Some(file) = case.get("file").and_then(Value::as_str) {
                let mut a = json!({"exePath": format!("{FIXTURES}/{file}")});
                if op == "scan_steam_api_imports" {
                    a["appId"] = json!("480");
                }
                a
            } else {
                let bundle = case["bundle"].as_str().expect("bundle");
                json!({"wineBundlePath": format!("{FIXTURES}/{bundle}")})
            };
            let expected = override_ops
                .and_then(|o| o.get(op))
                .unwrap_or(golden)
                .clone();
            let actual = match gamelib_scan::dispatch(op, &[args]) {
                Ok(v) => normalise(op, &v, None, None),
                Err(e) => json!({"dispatchError": e}),
            };
            exercised.insert(op.clone());
            if actual != expected {
                mismatches.push(format!(
                    "case {name} op {op}\n  expected: {expected}\n  actual:   {actual}"
                ));
            }
        }
    }
    for op in [
        "scan_steamstub_section",
        "scan_steam_drm",
        "scan_pe_imported_dlls",
        "scan_pe_delay_imports",
        "scan_steam_api_imports",
        "scan_winemac_metal_exports",
    ] {
        assert!(exercised.contains(op), "{op} never exercised");
    }
    assert!(
        mismatches.is_empty(),
        "{} golden mismatch(es):\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}
