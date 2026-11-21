//! The shared oracle vectors (`tests/fixtures/vectors`), replayed in Rust.
//!
//! The vectors were produced by running the real TS stack (JSON.stringify, conf, dot-prop 6), so a
//! pass here means Rust prints numbers and orders keys the way the TS store did.

use std::fs;
use std::path::Path;

use gamelib_store::dotpath;
use gamelib_store::json::{parse, to_compact_bytes, to_store_bytes, Json, Obj};

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

/// Applies one keyorder step to `root`. A `store` step goes through `dotpath` (the store's `set`
/// takes dot paths); an `object` step is a plain property assignment on the object.
fn apply(root: &mut Json, via: &str, step: &Json) {
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
            assert!(matches!(value(), Json::Obj(_)), "assign needs an object");
            *root = value();
        }
        "set" | "delete" => {
            let path = text(step, "path");
            if via == "store" {
                if op == "set" {
                    dotpath::set(root, path, value(), true);
                } else {
                    dotpath::delete(root, path, true);
                }
            } else if let Json::Obj(o) = root {
                if op == "set" {
                    o.insert_js(path, value());
                } else {
                    o.remove(path);
                }
            }
        }
        other => panic!("unknown op {other}"),
    }
}

#[test]
fn key_order_vectors_match() {
    let all = cases("keyorder.json");
    assert!(all.len() >= 10, "keyorder.json shrank to {}", all.len());
    let mut dotted = 0;
    for case in &all {
        let name = text(case, "name");
        let via = text(case, "via");
        let mut root = Json::Obj(Obj::new());
        let steps = case.get("steps").and_then(Json::as_array).unwrap();
        for step in steps {
            let path = step.get("path").and_then(Json::as_str).unwrap_or("");
            if via == "store" && path.contains('.') {
                dotted += 1;
            }
            apply(&mut root, via, step);
        }
        let got = String::from_utf8(to_store_bytes(&root)).unwrap();
        assert_eq!(got, text(case, "stringified"), "{name}");
    }
    assert!(dotted >= 3, "only {dotted} dotted store steps replayed");
}

fn compact(v: &Json) -> String {
    String::from_utf8(to_compact_bytes(v)).unwrap()
}

#[test]
fn dot_prop_vectors_match() {
    let all = cases("dotpath.json");
    assert!(all.len() >= 30, "dotpath.json shrank to {}", all.len());
    for case in &all {
        let name = text(case, "name");
        let op = text(case, "op");
        let path = text(case, "path");
        let dot = case.get("dotNotation").and_then(Json::as_bool).unwrap();
        let initial = case.get("initial").unwrap();
        let expected = case.get("result").unwrap();
        let mut doc = initial.clone();
        let threw = expected.get("threw").and_then(Json::as_str);

        match op {
            "get" => {
                let got = dotpath::get(&doc, path, dot);
                let found = expected.get("found").and_then(Json::as_bool).unwrap();
                assert_eq!(got.is_some(), found, "{name}: found");
                if found {
                    assert_eq!(
                        compact(got.unwrap()),
                        compact(expected.get("value").unwrap()),
                        "{name}: value"
                    );
                }
            }
            "has" => {
                let want = expected.get("has").and_then(Json::as_bool).unwrap();
                assert_eq!(dotpath::has(&doc, path, dot), want, "{name}: has");
            }
            "set" => {
                // Two conf rules sit in front of dot-prop: an undefined value and a reserved
                // `__internal__.` key throw TypeError. Rust has no undefined value to pass.
                let refused = case.get("valueUndefined").is_some()
                    || dotpath::is_reserved_internal(path, dot);
                assert_eq!(threw == Some("TypeError"), refused, "{name}: throws");
                if !refused {
                    dotpath::set(&mut doc, path, case.get("value").unwrap().clone(), dot);
                }
            }
            "delete" => {
                dotpath::delete(&mut doc, path, dot);
            }
            other => panic!("{name}: unknown op {other}"),
        }
        assert_eq!(
            compact(&doc),
            compact(case.get("after").unwrap()),
            "{name}: after"
        );
    }
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
