use std::io::Write;
use std::process::{Command, Stdio};

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-scan-cli"));
    c.env_clear();
    c
}

#[test]
fn list_prints_ops() {
    let out = cli().arg("--list").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).trim(),
        r#"["scan_contained_real","scan_pe_delay_imports","scan_pe_imported_dlls","scan_steam_drm","scan_steamstub_section"]"#
    );
}

#[test]
fn argv_contained_real() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("a.exe");
    std::fs::write(&f, b"x").unwrap();
    let arg = serde_json::json!({"path": f, "rootDir": dir.path()}).to_string();
    let out = cli().args(["scan_contained_real", &arg]).output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert!(v["real"].is_string());
}

#[test]
fn bad_args_exit_2_stdout_empty() {
    let out = cli().args(["scan_contained_real", "{}"]).output().unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("bad-args"));
}

#[test]
fn usage_errors_exit_64() {
    assert_eq!(cli().output().unwrap().status.code(), Some(64));
    let out = cli()
        .args(["scan_contained_real", "not json"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(64));
}

#[test]
fn ndjson_streams_in_order_and_survives_bad_lines() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("a.exe");
    std::fs::write(&f, b"x").unwrap();
    let good = serde_json::json!({"op": "scan_contained_real", "args": {"path": f, "rootDir": dir.path()}});
    let input = format!(
        "{good}\nnot json\n\n{{\"op\":\"scan_contained_real\",\"args\":{{}}}}\n{{\"op\":\"nope\",\"args\":{{}}}}\n"
    );
    let mut child = cli()
        .arg("--ndjson")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let lines: Vec<serde_json::Value> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 4);
    assert_eq!(lines[0]["ok"], true);
    assert!(lines[0]["result"]["real"].is_string());
    assert_eq!(lines[1]["error"], "bad-request");
    assert_eq!(lines[2]["error"], "scan_contained_real:bad-args");
    assert_eq!(lines[3]["error"], "unknown-op:nope");
}
