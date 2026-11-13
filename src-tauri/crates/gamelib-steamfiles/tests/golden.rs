//! Parity tier 1 (P75-E), Rust half. Two checks:
//! 1. `recorded_results`: every invocation in `invocations.json` run through `dispatch` must
//!    equal the committed `rust-results.json` (the TS wrapper replay input for plans 15-20).
//!    Rewrite it with `GAMELIB_WRITE_STEAMFILES_RUST=1`.
//! 2. `shortcuts_logical_parity`: Rust add/remove on the oracle's edit cases must equal the
//!    `steam-shortcut-editor` result by value (booleans as 0/1, dates in seconds), or the
//!    case's `overrides/shortcuts.json[case].rustOverride`, which must carry a `divergenceNote`.

use gamelib_steamfiles::dispatch;
use gamelib_steamfiles::kv_bin::{parse_bin, BinLimits, BinNode};
use serde_json::{json, Map, Value};
use std::path::Path;

const INVOCATIONS: &str = include_str!("fixtures/invocations.json");
const EXPECTED: &str = include_str!("fixtures/expected.json");
const SHORTCUTS_OVERRIDES: &str = include_str!("fixtures/overrides/shortcuts.json");
const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
const TOKEN: &str = "${FIXTURES}";

fn copy_dir(from: &Path, to: &Path, root: &str) {
    std::fs::create_dir_all(to).unwrap();
    for e in std::fs::read_dir(from).unwrap() {
        let e = e.unwrap();
        let (src, dst) = (e.path(), to.join(e.file_name()));
        if src.is_dir() {
            copy_dir(&src, &dst, root);
        } else if src.extension().is_some_and(|x| x == "vdf")
            && !src.components().any(|c| c.as_os_str() == "shortcuts")
        {
            let text = std::fs::read(&src).unwrap();
            let text = String::from_utf8_lossy(&text).replace(TOKEN, root);
            std::fs::write(&dst, text).unwrap();
        } else {
            std::fs::copy(&src, &dst).unwrap();
        }
    }
}

fn with_root(v: &Value, root: &str) -> Value {
    match v {
        Value::String(s) => Value::String(s.replace(TOKEN, root)),
        Value::Array(a) => Value::Array(a.iter().map(|x| with_root(x, root)).collect()),
        Value::Object(m) => Value::Object(
            m.iter()
                .map(|(k, x)| (k.clone(), with_root(x, root)))
                .collect(),
        ),
        o => o.clone(),
    }
}

fn tokenise(v: &Value, roots: &[String]) -> Value {
    match v {
        Value::String(s) => {
            let mut out = s.clone();
            for r in roots {
                out = out.replace(r.as_str(), TOKEN);
            }
            Value::String(out.replace('\\', "/"))
        }
        Value::Array(a) => Value::Array(a.iter().map(|x| tokenise(x, roots)).collect()),
        Value::Object(m) => Value::Object(
            m.iter()
                .map(|(k, x)| (k.clone(), tokenise(x, roots)))
                .collect(),
        ),
        o => o.clone(),
    }
}

fn pretty(v: &Value) -> String {
    format!("{}\n", serde_json::to_string_pretty(v).unwrap())
}

#[test]
fn recorded_results() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("fx");
    let root_str = root.to_string_lossy().into_owned();
    copy_dir(Path::new(FIXTURES), &root, &root_str);
    let mut roots = vec![root_str.clone()];
    if let Ok(c) = root.canonicalize() {
        roots.push(c.to_string_lossy().into_owned());
    }
    roots.sort_by_key(|r| std::cmp::Reverse(r.len()));

    let list: Value = serde_json::from_str(INVOCATIONS).unwrap();
    let invs = list["invocations"].as_array().unwrap();
    assert!(invs.len() >= 60, "anti-vacuity: {}", invs.len());
    let mut results = Map::new();
    for inv in invs {
        let id = inv["id"].as_str().unwrap();
        let op = inv["op"].as_str().unwrap();
        let args = with_root(&inv["args"], &root_str);
        let r = dispatch(op, &[args]).unwrap_or_else(|e| panic!("{id}: {e}"));
        assert!(
            results
                .insert(id.to_string(), tokenise(&r, &roots))
                .is_none(),
            "dup {id}"
        );
    }
    let doc = pretty(&json!({ "results": results }));
    let path = Path::new(FIXTURES).join("rust-results.json");
    if std::env::var("GAMELIB_WRITE_STEAMFILES_RUST").as_deref() == Ok("1") {
        std::fs::write(&path, doc).unwrap();
        return;
    }
    // Compared as JSON values so a formatter pass over the file never makes it stale.
    let committed: Value = serde_json::from_str(
        &std::fs::read_to_string(&path).expect("run with GAMELIB_WRITE_STEAMFILES_RUST=1"),
    )
    .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&doc).unwrap(),
        committed,
        "rust-results.json is stale"
    );
}

// ---- shortcuts logical parity ------------------------------------------------------------

fn s(key: &str, value: &str) -> Value {
    json!({"kind": "string", "key": key, "value": value})
}
fn i(key: &str, value: i64) -> Value {
    json!({"kind": "int32", "key": key, "value": value})
}

/// The oracle's FIXED_ENTRY, in its key order.
fn fixed_entry() -> Value {
    json!([
        s("AppName", "Golden Game"),
        s("Exe", "\"/x/gamelib\""),
        s("StartDir", "\"/x\""),
        i("appid", 1_234_567),
        s("LaunchOptions", "--no-gui"),
        i("IsHidden", 0),
        i("AllowDesktopConfig", 1),
        i("AllowOverlay", 1),
        i("OpenVR", 0),
        i("Devkit", 0),
        i("DevkitOverrideAppID", 0),
        i("LastPlayTime", 1_700_000_000),
    ])
}

fn logical(node: &BinNode) -> Value {
    match node {
        BinNode::Str(b) => Value::String(String::from_utf8_lossy(b).into_owned()),
        BinNode::Int32(n) => json!(n),
        BinNode::Map(m) => {
            if m.iter()
                .all(|(k, _)| !k.is_empty() && k.iter().all(u8::is_ascii_digit))
            {
                Value::Array(m.iter().map(|(_, v)| logical(v)).collect())
            } else {
                Value::Object(
                    m.iter()
                        .map(|(k, v)| (String::from_utf8_lossy(k).into_owned(), logical(v)))
                        .collect(),
                )
            }
        }
        other => Value::String(format!("{other:?}")),
    }
}

/// Booleans to 0/1 (the oracle's autoConvertBooleans), so both sides are comparable.
fn norm_bools(v: &Value) -> Value {
    match v {
        Value::Bool(b) => json!(i32::from(*b)),
        Value::Array(a) => Value::Array(a.iter().map(norm_bools).collect()),
        Value::Object(m) => {
            Value::Object(m.iter().map(|(k, x)| (k.clone(), norm_bools(x))).collect())
        }
        o => o.clone(),
    }
}

fn read_logical(path: &Path) -> Value {
    let bytes = std::fs::read(path).unwrap();
    let doc = parse_bin(&bytes, &BinLimits::shortcuts()).unwrap();
    let root = doc
        .root
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(b"shortcuts"))
        .map(|(_, v)| logical(v))
        .unwrap_or(Value::Null);
    json!({ "shortcuts": root })
}

#[test]
fn shortcuts_logical_parity() {
    let expected: Value = serde_json::from_str(EXPECTED).unwrap();
    let cases = expected["cases"].as_object().unwrap();
    let overrides: Value = serde_json::from_str(SHORTCUTS_OVERRIDES).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let mut checked = 0;
    let mut failures = Vec::new();
    for (key, case) in cases {
        let (kind, name) = if let Some(n) = key.strip_prefix("shortcuts/edit-add/") {
            ("add", n)
        } else if let Some(n) = key.strip_prefix("shortcuts/edit-remove-first/") {
            ("remove", n)
        } else {
            continue;
        };
        let src = Path::new(FIXTURES)
            .join("shortcuts")
            .join(format!("{name}.vdf"));
        let target = dir.path().join(format!("{checked}.vdf"));
        std::fs::copy(&src, &target).unwrap();
        let mutation = if kind == "add" {
            json!({"op": "add", "entry": fixed_entry(), "createIfMissing": false})
        } else {
            let title = case["oracle"]["title"].as_str().unwrap();
            json!({"op": "remove", "appName": title})
        };
        let r = dispatch(
            "steamfiles_shortcuts_apply",
            &[json!({"path": target.to_string_lossy(), "mutation": mutation})],
        )
        .unwrap();
        assert_eq!(r["written"], json!(true), "{key}: {r}");
        let got = norm_bools(&read_logical(&target));
        let ov = overrides.get(key.as_str());
        let want = match ov {
            Some(o) => {
                let note = o["divergenceNote"].as_str().unwrap_or("");
                assert!(!note.is_empty(), "{key}: override without divergenceNote");
                o["rustOverride"].clone()
            }
            None => norm_bools(&case["oracle"]["reparsed"]),
        };
        if got != want {
            failures.push(format!(
                "{key}\n  got:  {}\n  want: {}",
                serde_json::to_string(&got).unwrap(),
                serde_json::to_string(&want).unwrap()
            ));
        }
        checked += 1;
    }
    assert!(checked >= 8, "anti-vacuity: {checked}");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
