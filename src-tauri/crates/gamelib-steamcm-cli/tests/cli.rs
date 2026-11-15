use std::io::Write;
use std::process::{Command, Stdio};

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-steamcm-cli"));
    c.env_clear();
    c
}

#[test]
fn list_prints_ops() {
    let out = cli().arg("--list").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let ops: Vec<String> =
        serde_json::from_str(String::from_utf8_lossy(&out.stdout).trim()).unwrap();
    // The CLI lists OPS plus CLI_ONLY_OPS, deduped (CLI_ONLY_OPS are already in OPS).
    assert_eq!(ops.len(), gamelib_steamcm::OPS.len());
    for op in gamelib_steamcm::CLI_ONLY_OPS {
        assert!(ops.contains(&op.to_string()), "{op}");
    }
    assert!(ops.windows(2).all(|w| w[0] < w[1]));
    assert!(ops.contains(&"steamcm_capture_anon_pics".to_string()));
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

#[test]
fn bad_args_exit_2() {
    let out = cli()
        .args(["steamcm_session_status", "{\"x\":1}"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("steamcm_session_status:bad-args"));
}

#[test]
fn secret_ops_are_refused_on_argv() {
    for op in [
        "steamcm_session_acquire",
        "steamcm_signin_credentials_start",
        "steamcm_signin_guard_submit",
        "steamcm_redeem_key",
    ] {
        let out = cli().args([op, "{}"]).output().unwrap();
        assert_eq!(out.status.code(), Some(64), "{op}");
        assert!(out.stdout.is_empty());
        assert!(
            String::from_utf8_lossy(&out.stderr).contains("--ndjson"),
            "{op}"
        );
    }
}

#[test]
fn ndjson_keeps_state_across_lines() {
    let line = "{\"op\":\"steamcm_session_status\",\"args\":{}}\n";
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
        .write_all(format!("{line}{line}").as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let lines: Vec<serde_json::Value> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 2);
    for l in &lines {
        assert_eq!(l["ok"], true);
        assert_eq!(l["result"]["connected"], false);
        assert_eq!(l["result"]["leaseCount"], 0);
    }
}
