use std::path::Path;
use std::process::Command;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-store-cli"));
    c.env_clear();
    c
}

/// A store-flavour golden file, copied into a temp dir so the run never touches the fixture tree.
fn golden_copy(dir: &Path) -> std::path::PathBuf {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join(
        "../gamelib-store/tests/fixtures/golden/expected/engine-newer-readonly-user-state/store/prefs.json",
    );
    let dst = dir.join("prefs.json");
    std::fs::copy(&src, &dst).unwrap();
    dst
}

#[test]
fn a_golden_file_round_trips_identical() {
    let d = tempfile::tempdir().unwrap();
    let f = golden_copy(d.path());
    let out = cli()
        .args(["roundtrip", f.to_str().unwrap(), "--flavour", "store"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "identical");
}

#[test]
fn a_different_flavour_reports_the_first_differing_byte() {
    let d = tempfile::tempdir().unwrap();
    let f = golden_copy(d.path());
    let out = cli()
        .args(["roundtrip", f.to_str().unwrap(), "--flavour", "compact"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("differs at byte "));
}

#[test]
fn a_file_that_is_not_json_exits_2_with_stdout_empty() {
    let d = tempfile::tempdir().unwrap();
    let f = d.path().join("bad.json");
    std::fs::write(&f, b"{\"a\":").unwrap();
    let out = cli()
        .args(["roundtrip", f.to_str().unwrap(), "--flavour", "store"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("parse error"));
}

#[test]
fn usage_errors_exit_64() {
    assert_eq!(cli().output().unwrap().status.code(), Some(64));
    let out = cli()
        .args(["roundtrip", "x.json", "--flavour", "nope"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(64));
}
