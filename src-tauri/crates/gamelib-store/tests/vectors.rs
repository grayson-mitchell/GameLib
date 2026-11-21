//! The shared oracle vectors (`tests/fixtures/vectors`), replayed in Rust.
//!
//! The vectors were produced by running the real TS stack (JSON.stringify, conf, dot-prop 6), so a
//! pass here means Rust prints numbers and orders keys the way the TS store did.

use std::fs;
use std::path::Path;

use gamelib_store::json::{parse, to_store_bytes, Json, Obj};

fn load(name: &str) -> Json {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/vectors")
        .join(name);
    let bytes = fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    parse(&bytes).unwrap_or_else(|e| panic!("{name}: {e}"))
}

fn cases(name: &str) -> Vec<Json> {
    load(name)
        .as_array()
        .unwrap_or_else(|| panic!("{name} is not an array"))
        .to_vec()
}

fn text<'a>(case: &'a Json, key: &str) -> &'a str {
    case.get(key)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("case {case:?} has no string `{key}`"))
}

#[test]
fn numbers_print_as_js_prints_them() {
    let all = cases("numbers.json");
    assert!(all.len() >= 18, "numbers.json shrank to {}", all.len());
    for case in &all {
        let name = text(case, "name");
        let json_text = text(case, "jsonText");
        if case.get("rustParse").and_then(Json::as_str) == Some("reject") {
            assert!(
                parse(json_text.as_bytes()).is_err(),
                "{name}: Rust must reject this text"
            );
            continue;
        }
        let v = parse(json_text.as_bytes()).unwrap_or_else(|e| panic!("{name}: {e}"));
        let got = String::from_utf8(to_store_bytes(&v)).unwrap();
        assert_eq!(got, text(case, "stringified"), "{name}");
    }
}

/// Applies one keyorder step to `root`. `dotted` store steps need `dotpath` and are replayed in
/// Task 3; everything else is a plain key on the root object.
fn apply(root: &mut Obj, via: &str, step: &Json) -> bool {
    let op = text(step, "op");
    let value = || -> Json {
        match (step.get("value"), step.get("valueText")) {
            (Some(v), _) => v.clone(),
            (None, Some(t)) => parse(t.as_str().unwrap().as_bytes()).unwrap(),
            _ => panic!("step has no value: {step:?}"),
        }
    };
    match op {
        "assign" => {
            let Json::Obj(o) = value() else {
                panic!("assign needs an object")
            };
            *root = o;
            true
        }
        "set" | "delete" => {
            let path = text(step, "path");
            if via == "store" && path.contains('.') {
                return false;
            }
            if op == "set" {
                root.insert_js(path, value());
            } else {
                root.remove(path);
            }
            true
        }
        other => panic!("unknown op {other}"),
    }
}

#[test]
fn undotted_key_order_vectors_match() {
    let all = cases("keyorder.json");
    assert!(all.len() >= 10, "keyorder.json shrank to {}", all.len());
    let mut replayed = 0;
    for case in &all {
        let name = text(case, "name");
        let via = text(case, "via");
        let mut root = Obj::new();
        let steps = case.get("steps").and_then(Json::as_array).unwrap();
        let mut skipped = false;
        for step in steps {
            if !apply(&mut root, via, step) {
                skipped = true;
                break;
            }
        }
        if skipped {
            continue;
        }
        replayed += 1;
        let got = String::from_utf8(to_store_bytes(&Json::Obj(root))).unwrap();
        assert_eq!(got, text(case, "stringified"), "{name}");
    }
    assert!(replayed >= 10, "only {replayed} undotted vectors replayed");
}

fn nested_arrays(depth: usize) -> Vec<u8> {
    let mut s = "[".repeat(depth).into_bytes();
    s.extend(std::iter::repeat(b']').take(depth));
    s
}

#[test]
fn a_200_deep_document_is_a_parse_error_not_a_stack_overflow() {
    assert!(parse(&nested_arrays(200)).is_err());
    assert!(parse(&nested_arrays(100)).is_ok());
}

#[test]
fn a_re_set_key_keeps_its_place_and_a_deleted_one_re_enters_last() {
    let mut o = Obj::new();
    o.insert_js("b", Json::Bool(true));
    o.insert_js("a", Json::Bool(true));
    o.insert_js("b", Json::Bool(false));
    let keys: Vec<&str> = o.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(keys, ["b", "a"]);
    o.remove("b");
    o.insert_js("b", Json::Null);
    let keys: Vec<&str> = o.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(keys, ["a", "b"]);
}
