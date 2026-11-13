use std::io::Write;
use std::process::{Command, Stdio};

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-steamfiles-cli"));
    c.env_clear();
    c
}

#[test]
fn list_prints_ops() {
    let out = cli().arg("--list").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    // Plan 11 registers the ops and updates this.
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "[]");
}

#[test]
fn unknown_op_exits_2_stdout_empty() {
    let out = cli().args(["nope", "{}"]).output().unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown-op"));
}

#[test]
fn usage_errors_exit_64() {
    assert_eq!(cli().output().unwrap().status.code(), Some(64));
    let out = cli().args(["nope", "not json"]).output().unwrap();
    assert_eq!(out.status.code(), Some(64));
}

#[test]
fn ndjson_streams_in_order_and_survives_bad_lines() {
    let input = "not json\n\n{\"op\":\"nope\",\"args\":{}}\n{\"op\":\"x\"}\n";
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
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0]["error"], "bad-request");
    assert_eq!(lines[1]["error"], "unknown-op:nope");
    assert_eq!(lines[2]["error"], "bad-request");
}
