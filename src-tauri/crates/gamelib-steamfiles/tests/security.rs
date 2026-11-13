//! Dispatch-level security (ASVS V5, T-75-31): every path op, fed every prefix of every
//! fixture, returns without panicking, and the depth cap holds through dispatch.

use gamelib_steamfiles::dispatch;
use serde_json::json;
use std::path::{Path, PathBuf};

const PATH_OPS: [&str; 7] = [
    "steamfiles_read_acf",
    "steamfiles_read_library_folders",
    "steamfiles_read_running_app_id",
    "steamfiles_read_installscript",
    "steamfiles_parse_valve_manifest",
    "steamfiles_shortcuts_read",
    "steamfiles_shortcuts_roundtrip",
];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            collect(&p, out);
        } else if p.extension().is_some_and(|x| x != "json" && x != "md") {
            out.push(p);
        }
    }
}

#[test]
fn security_truncation_never_panics() {
    let mut files = Vec::new();
    collect(&fixtures(), &mut files);
    assert!(files.len() > 30, "anti-vacuity: {}", files.len());
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("f");
    for f in files {
        let bytes = std::fs::read(&f).unwrap();
        for n in 0..=bytes.len() {
            std::fs::write(&target, &bytes[..n]).unwrap();
            for op in PATH_OPS {
                let r = dispatch(op, &[json!({ "path": target.to_string_lossy() })]);
                assert!(r.is_ok(), "{op} on {} prefix {n}: {r:?}", f.display());
            }
            let r = dispatch(
                "steamfiles_read_localconfig_beta_key",
                &[json!({ "path": target.to_string_lossy(), "appId": "10" })],
            );
            assert!(r.is_ok(), "localconfig on {} prefix {n}", f.display());
        }
    }
}

#[test]
fn deep_nesting_is_a_result_not_a_crash() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("deep.acf");
    std::fs::write(&p, "{".repeat(100_000)).unwrap();
    let r = dispatch(
        "steamfiles_read_acf",
        &[json!({ "path": p.to_string_lossy() })],
    )
    .unwrap();
    assert_eq!(r["parsed"], json!(false));
    let r = dispatch(
        "steamfiles_read_installscript",
        &[json!({ "path": p.to_string_lossy() })],
    );
    assert!(r.is_ok());
}
