//! Fixture-driven tests for the single text KV1 parser (P75-A, D-06/D-07).

use gamelib_steamfiles::kv_text::{
    find, merged, parse, KvErrorKind, Limits, MergedValue, Value,
};
use std::path::{Path, PathBuf};

fn fixture(rel: &str) -> Vec<u8> {
    std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/").to_owned() + rel)
        .unwrap_or_else(|e| panic!("{rel}: {e}"))
}

fn lim() -> Limits {
    Limits::local_file()
}

fn state_flags(rel: &str) -> Option<String> {
    let root = parse(&fixture(rel), &lim()).expect("parses");
    merged(&root).map("AppState")?.str("StateFlags")
}

#[test]
fn installed_acf_merged_lookup() {
    assert_eq!(state_flags("acf/installed.acf").as_deref(), Some("4"));
}

#[test]
fn lowercase_keys_are_case_insensitive() {
    assert_eq!(state_flags("acf/lowercase-keys.acf").as_deref(), Some("4"));
}

#[test]
fn duplicate_keys_ordered_and_merged() {
    let root = parse(&fixture("acf/duplicate-keys.acf"), &lim()).unwrap();
    assert_eq!(root.len(), 2);
    assert!(root.iter().all(|p| p.key.eq_ignore_ascii_case("appstate")));
    let m = merged(&root);
    let app = m.map("AppState").unwrap();
    assert_eq!(app.str("name").as_deref(), Some("Second Name"));
    assert_eq!(app.str("appid").as_deref(), Some("60"));
    assert_eq!(app.str("installdir").as_deref(), Some("ReopenedDir"));
    assert_eq!(app.str("buildid").as_deref(), Some("77"));
    // ordered view keeps both names inside the first block
    let Value::Map(first) = &find(&root, "AppState").unwrap().value else {
        panic!("map")
    };
    let names: Vec<_> = first
        .iter()
        .filter(|p| p.key.eq_ignore_ascii_case("name"))
        .collect();
    assert_eq!(names.len(), 2);
}

#[test]
fn escapes_raw_and_decoded() {
    let root = parse(&fixture("acf/escapes.acf"), &lim()).unwrap();
    let Value::Map(app) = &find(&root, "AppState").unwrap().value else {
        panic!("map")
    };
    let Value::Str(raw) = &find(app, "name").unwrap().value else {
        panic!("str")
    };
    assert_eq!(raw.0, br#"Say \"Hi\" \\ there"#.to_vec());
    assert_eq!(raw.decoded(), r#"Say "Hi" \ there"#);
    assert_eq!(
        merged(&root).map("AppState").unwrap().str("installdir").as_deref(),
        Some(r"Sub\Dir")
    );
}

#[test]
fn unknown_escape_kept_literally() {
    let root = parse(br#""a" "x\qy\n\t""#, &lim()).unwrap();
    assert_eq!(merged(&root).str("a").as_deref(), Some("x\\qy\n\t"));
}

#[test]
fn coercion_never_happens() {
    let root = parse(&fixture("acf/coercion.acf"), &lim()).unwrap();
    let app = merged(&root);
    let app = app.map("AppState").unwrap();
    assert_eq!(app.str("name").as_deref(), Some("1979"));
    assert_eq!(app.str("buildid").as_deref(), Some("0123"));
    assert_eq!(app.str("installdir").as_deref(), Some("1e3"));
    assert_eq!(app.str("hexval").as_deref(), Some("0x10"));
    assert_eq!(app.str("boolval").as_deref(), Some("true"));
}

#[test]
fn bom_and_crlf_match_plain() {
    for rel in ["acf/bom.acf", "acf/crlf.acf"] {
        let root = parse(&fixture(rel), &lim()).unwrap_or_else(|e| panic!("{rel}: {e:?}"));
        let m = merged(&root);
        let app = m.map("AppState").unwrap_or_else(|| panic!("{rel}: no AppState"));
        assert_eq!(app.str("StateFlags").as_deref(), Some("4"), "{rel}");
        assert!(app.str("appid").is_some(), "{rel}");
    }
}

#[test]
fn comments_and_unquoted_tokens() {
    let root = parse(&fixture("acf/comments-unquoted.acf"), &lim()).unwrap();
    let m = merged(&root);
    let app = m.map("AppState").unwrap();
    assert_eq!(app.str("appid").as_deref(), Some("100"));
    assert_eq!(app.str("name").as_deref(), Some("Comments Game"));
    assert_eq!(app.str("installdir").as_deref(), Some("CommentsGame"));
}

#[test]
fn non_utf8_is_lossy() {
    let root = parse(&fixture("acf/non-utf8.acf"), &lim()).unwrap();
    let name = merged(&root).map("AppState").unwrap().str("name").unwrap();
    assert!(name.contains('\u{FFFD}'), "{name:?}");
}

#[test]
fn conditionals_stored_not_shifting_pairs() {
    let root = parse(&fixture("installscript/conditionals.vdf"), &lim()).unwrap();
    let Value::Map(script) = &find(&root, "InstallScript").unwrap().value else {
        panic!("map")
    };
    let Value::Map(run) = &find(script, "Run Process").unwrap().value else {
        panic!("map")
    };
    let vc = find(run, "VC 2019").unwrap();
    assert_eq!(vc.cond.as_deref(), Some("$WIN32"));
    let Value::Map(inner) = &vc.value else { panic!("map") };
    let p1 = find(inner, "Process 1").unwrap();
    assert_eq!(p1.cond.as_deref(), Some("$WIN32"));
    let Value::Str(v) = &p1.value else { panic!("str") };
    assert!(v.decoded().ends_with("VC_redist.x64.exe"));
    let Value::Str(c) = &find(inner, "Command 1").unwrap().value else {
        panic!("str")
    };
    assert_eq!(c.decoded(), "/q /norestart");
    assert!(find(inner, "Command 1").unwrap().cond.is_none());
}

#[test]
fn dotnet_duplicate_keeps_both_in_order() {
    let root = parse(&fixture("installscript/dotnet-duplicate.vdf"), &lim()).unwrap();
    let Value::Map(script) = &find(&root, "InstallScript").unwrap().value else {
        panic!("map")
    };
    let Value::Map(run) = &find(script, "Run Process").unwrap().value else {
        panic!("map")
    };
    let both: Vec<_> = run.iter().filter(|p| p.key.eq_ignore_ascii_case("4.8")).collect();
    assert_eq!(both.len(), 2);
    let proc_of = |p: &&gamelib_steamfiles::kv_text::Pair| {
        let Value::Map(m) = &p.value else { panic!("map") };
        let Value::Str(s) = &find(m, "Process 1").unwrap().value else {
            panic!("str")
        };
        s.decoded()
    };
    assert!(proc_of(&both[0]).contains(r"4.0"));
    assert!(proc_of(&both[1]).contains("NDP48"));
}

#[test]
fn unbalanced_is_error() {
    let e = parse(&fixture("acf/unbalanced.acf"), &lim()).unwrap_err();
    assert_eq!(e.kind, KvErrorKind::Unbalanced);
}

#[test]
fn truncated_returns_error_not_hang() {
    for rel in [
        "acf/truncated.acf",
        "installscript/malformed.vdf",
        "scan/lib1/steamapps/appmanifest_30.acf",
    ] {
        let e = parse(&fixture(rel), &lim()).unwrap_err();
        assert!(
            matches!(
                e.kind,
                KvErrorKind::Unbalanced | KvErrorKind::UnterminatedString
            ),
            "{rel}: {e:?}"
        );
    }
}

#[test]
fn empty_is_ok_and_empty() {
    assert!(parse(&fixture("acf/empty.acf"), &lim()).unwrap().is_empty());
}

#[test]
fn missing_value_and_unexpected_open() {
    assert_eq!(
        parse(br#""a" }"#, &lim()).unwrap_err().kind,
        KvErrorKind::Unbalanced
    );
    assert_eq!(
        parse(br#""a""#, &lim()).unwrap_err().kind,
        KvErrorKind::MissingValue
    );
    assert_eq!(
        parse(b"{ }", &lim()).unwrap_err().kind,
        KvErrorKind::UnexpectedOpen
    );
}

#[test]
fn deep_nesting_is_rejected_without_overflow() {
    let mut s = Vec::new();
    for _ in 0..100_000 {
        s.extend_from_slice(b"\"k\" {");
    }
    assert_eq!(parse(&s, &lim()).unwrap_err().kind, KvErrorKind::TooDeep);
}

#[test]
fn depth_64_ok_65_rejected() {
    let build = |n: usize| {
        let mut s = Vec::new();
        for _ in 0..n {
            s.extend_from_slice(b"\"k\" {");
        }
        for _ in 0..n {
            s.push(b'}');
        }
        s
    };
    assert!(parse(&build(64), &lim()).is_ok());
    assert_eq!(parse(&build(65), &lim()).unwrap_err().kind, KvErrorKind::TooDeep);
}

#[test]
fn oversized_input_rejected() {
    let l = Limits { max_bytes: 16, max_depth: 64 };
    assert!(parse(&[b' '; 16], &l).is_ok());
    assert_eq!(parse(&[b' '; 17], &l).unwrap_err().kind, KvErrorKind::TooLarge);
}

#[test]
fn merged_value_variants() {
    let root = parse(br#""A" { "b" "1" } "a" { "c" "2" }"#, &lim()).unwrap();
    let m = merged(&root);
    let a = m.map("a").unwrap();
    assert_eq!(a.str("B").as_deref(), Some("1"));
    assert_eq!(a.str("c").as_deref(), Some("2"));
    assert!(matches!(m.get("A"), Some(MergedValue::Map(_))));
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            if p.file_name().unwrap() != "shortcuts" {
                collect(&p, out);
            }
        } else if matches!(
            p.extension().and_then(|x| x.to_str()),
            Some("acf" | "vdf")
        ) {
            out.push(p);
        }
    }
}

#[test]
fn every_prefix_of_every_text_fixture_is_total() {
    let mut files = Vec::new();
    collect(
        Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures")),
        &mut files,
    );
    assert!(files.len() > 20);
    for f in files {
        let bytes = std::fs::read(&f).unwrap();
        for n in 0..=bytes.len() {
            let _ = parse(&bytes[..n], &lim());
        }
    }
}
