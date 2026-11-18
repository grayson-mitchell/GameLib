use std::io::Write;
use std::process::{Command, Stdio};

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-steampoll-cli"));
    c.env_clear();
    c
}

fn timeline(name: &str) -> String {
    format!(
        "{}/../gamelib-steampoll/tests/fixtures/timelines/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    )
}

#[test]
fn list_prints_every_op_one_per_line() {
    let out = cli().arg("--list").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let text = String::from_utf8_lossy(&out.stdout);
    let ops: Vec<&str> = text.lines().collect();
    assert_eq!(ops.len(), gamelib_steampoll::OPS.len());
    assert_eq!(ops.len(), 27);
    assert!(ops.contains(&"steampoll_install_start"));
}

#[test]
fn usage_errors_exit_64() {
    assert_eq!(cli().output().unwrap().status.code(), Some(64));
    assert_eq!(
        cli().arg("replay").output().unwrap().status.code(),
        Some(64)
    );
    assert_eq!(
        cli().arg("--bogus").output().unwrap().status.code(),
        Some(64)
    );
}

#[test]
fn ndjson_round_trips_and_exits_2_on_an_op_error() {
    let input = concat!(
        "{\"op\":\"steampoll_breadcrumb_installed_on_disk\",\"args\":{\"steamappsDir\":\"/nonexistent\",\"appId\":\"1\"}}\n",
        "\n",
        "{\"op\":\"steampoll_acf_read_state\",\"args\":{\"bogus\":1}}\n",
        "{\"op\":\"steampoll_nope\",\"args\":{}}\n",
        "not json\n",
        "{\"op\":\"steampoll_status\",\"args\":{}}\n",
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
    assert_eq!(out.status.code(), Some(2));
    let lines: Vec<serde_json::Value> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 5);
    assert_eq!(lines[0]["ok"], true);
    assert_eq!(lines[0]["result"], false);
    assert_eq!(lines[1]["error"], "steampoll_acf_read_state:bad-args");
    assert_eq!(lines[2]["error"], "steampoll_nope:unknown-op");
    assert_eq!(lines[3]["error"], "bad-request");
    // No facade in the CLI process.
    assert_eq!(lines[4]["error"], "steampoll:not-configured");
}

#[test]
fn ndjson_with_only_successes_exits_0() {
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
        .write_all(b"{\"op\":\"steampoll_breadcrumb_installed_on_disk\",\"args\":{\"steamappsDir\":\"\",\"appId\":\"1\"}}\n")
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(out.status.code(), Some(0));
}

fn replay(name: &str) -> String {
    let out = cli().args(["replay", &timeline(name)]).output().unwrap();
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}

#[test]
fn replay_of_grace_expiry_is_non_empty_and_deterministic() {
    let first = replay("install-grace-expiry");
    let records: Vec<serde_json::Value> = serde_json::from_str(&first).unwrap();
    assert!(!records.is_empty());
    assert_eq!(records[0]["frontend"]["channel"], "gameStatusUpdate");
    assert_eq!(records[0]["frontend"]["args"][0]["status"], "done");
    assert_eq!(first, replay("install-grace-expiry"));
}

#[test]
fn replay_strips_temp_paths_and_seq() {
    let text = replay("install-installed-mac-arch-32");
    assert!(text.contains("/fake/steam/steamapps/common/TestGame"));
    assert!(!text.contains("\"seq\""));
    assert!(!text.contains("/var/") && !text.contains("/tmp/"));
}

#[test]
fn replay_renders_notifications_through_the_catalog() {
    let text = replay("install-depot-skipped");
    let records: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap();
    let notify = records
        .iter()
        .find_map(|r| r.get("notify"))
        .expect("a notification");
    assert!(notify["key"].is_string());
    assert!(!notify["body"].as_str().unwrap().is_empty());
}

#[test]
fn replay_rejects_a_missing_or_malformed_timeline() {
    let out = cli()
        .args(["replay", "/nonexistent/x.json"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
}

#[test]
fn every_shipped_timeline_replays() {
    let dir = format!(
        "{}/../gamelib-steampoll/tests/fixtures/timelines",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut count = 0;
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "json") {
            let out = cli().arg("replay").arg(&path).output().unwrap();
            assert_eq!(out.status.code(), Some(0), "{}", path.display());
            let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
            assert!(v.is_array());
            count += 1;
        }
    }
    assert!(count >= 35, "found {count} timelines");
}
