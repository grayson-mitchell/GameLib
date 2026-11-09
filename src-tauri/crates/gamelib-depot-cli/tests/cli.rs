//! Drives the built `gamelib-depot-cli` binary against the `zip-deflate` fixture, served by a
//! local fake CDN. Reuses the gamelib-depot test support modules.

#[allow(dead_code)]
#[path = "../../gamelib-depot/tests/support/encode.rs"]
mod encode;
#[allow(dead_code)]
#[path = "../../gamelib-depot/tests/support/fake_cdn.rs"]
mod fake_cdn;
#[allow(dead_code)]
#[path = "../../gamelib-depot/tests/support/fixture_builder.rs"]
mod fixture_builder;

use fake_cdn::{FakeCdn, Reply};
use fixture_builder::{all_cases, render};
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_gamelib-depot-cli");
const TOKEN: &str = "SECRETTOKEN123";

struct Env {
    _rt: tokio::runtime::Runtime,
    cdn: FakeCdn,
    dir: tempfile::TempDir,
    case_json: Value,
    app_id: String,
}

impl Env {
    fn steamapps(&self) -> std::path::PathBuf {
        self.dir.path().join("steamapps")
    }
    fn root(&self) -> std::path::PathBuf {
        self.steamapps().join("common").join("zip-deflate")
    }
    fn depots(&self) -> Vec<Value> {
        self.case_json["depots"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| {
                json!({
                    "depotId": d["depotId"], "manifestId": d["manifestId"],
                    "requestCode": "123", "key": d["keyHex"],
                    "ownerAppId": self.app_id, "fromManifest": null,
                })
            })
            .collect()
    }
    fn hosts(&self, token_auth: bool) -> Value {
        json!([{
            "host": self.cdn.host(), "vhost": null, "kind": "SteamCache",
            "httpsSupport": null, "useTokenAuth": token_auth, "weightedLoad": null
        }])
    }
    fn job(&self, id: &str, mode: &str, token_auth: bool) -> Value {
        json!({
            "jobId": id, "mode": mode, "appId": self.app_id,
            "installRoot": self.root().to_string_lossy(),
            "depots": self.depots(), "hosts": self.hosts(token_auth),
            "selectPaths": null,
            "finalize": {
                "steamappsDir": self.steamapps().to_string_lossy(),
                "installdir": "zip-deflate", "name": "Fixture", "buildid": "1001",
                "lastOwner": "76561197960265728", "allowFullOwnership": true
            },
            "limits": null
        })
    }
}

fn setup() -> Env {
    let case = all_cases()
        .into_iter()
        .find(|c| c.name == "zip-deflate")
        .unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let cdn = rt.block_on(FakeCdn::start());
    let files = render(&case);
    let case_json: Value = serde_json::from_slice(&files["case.json"]).unwrap();
    let depot_ids: Vec<String> = case_json["depots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["depotId"].as_str().unwrap().to_string())
        .collect();
    for (rel, bytes) in &files {
        if let Some(sha) = rel
            .strip_prefix("chunks/")
            .and_then(|r| r.strip_suffix(".bin"))
        {
            for d in &depot_ids {
                cdn.script(
                    &format!("/depot/{d}/chunk/{sha}"),
                    vec![Reply::Status(200, bytes.clone())],
                );
            }
        } else if let Some(stem) = rel
            .strip_prefix("manifests/")
            .and_then(|r| r.strip_suffix(".bin"))
        {
            let (d, g) = stem.split_once('_').unwrap();
            cdn.script(
                &format!("/depot/{d}/manifest/{g}/5/123"),
                vec![Reply::Status(200, bytes.clone())],
            );
        }
    }
    Env {
        _rt: rt,
        cdn,
        dir: tempfile::tempdir().unwrap(),
        case_json,
        app_id: case.app_id.to_string(),
    }
}

struct Run {
    status: i32,
    stdout: String,
    lines: Vec<Value>,
}

fn cli(env: &Env, args: &[&str], stdin: &str) -> Run {
    let cache = env.dir.path().join("cache");
    let mut cmd = Command::new(BIN);
    cmd.arg("--cache-dir").arg(&cache).args(args);
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    let stdout = String::from_utf8(out.stdout).unwrap();
    let lines = stdout
        .lines()
        .map(|l| serde_json::from_str(l).expect("every stdout line is JSON"))
        .collect();
    Run {
        status: out.status.code().unwrap(),
        stdout,
        lines,
    }
}

#[test]
fn run_streams_events_then_one_final_line() {
    let env = setup();
    let input =
        json!({ "job": env.job("cli-run-1", "install", false), "tokens": { "other:1": TOKEN } });
    let r = cli(&env, &["run"], &input.to_string());
    assert_eq!(r.status, 0, "{}", r.stdout);
    let (last, events) = r.lines.split_last().unwrap();
    assert_eq!(last["ok"], json!(true));
    assert_eq!(last["result"]["status"], json!("completed"));
    assert_eq!(last["result"]["jobId"], json!("cli-run-1"));
    assert!(!events.is_empty());
    for e in events {
        assert!(e.get("ok").is_none());
        assert_eq!(e["jobId"], json!("cli-run-1"));
        assert!(e["seq"].is_u64());
        assert!(e["kind"].is_string());
    }
    assert!(events.iter().any(|e| e["kind"] == json!("planned")));
    assert_eq!(r.lines.iter().filter(|l| l.get("ok").is_some()).count(), 1);
    assert!(env.root().join("data/multi.bin").is_file());
    assert!(!r.stdout.contains(TOKEN));
}

#[test]
fn verify_forces_verify_only_and_reports_missing() {
    let env = setup();
    // The job says "install" but verify must override it: nothing is fetched or written.
    let input = json!({ "job": env.job("cli-verify-1", "install", false) });
    let r = cli(&env, &["verify"], &input.to_string());
    assert_eq!(r.status, 0, "{}", r.stdout);
    let last = r.lines.last().unwrap();
    assert_eq!(last["ok"], json!(true));
    assert!(last["result"]["missing"].as_array().unwrap().len() >= 3);
    assert!(!env.root().join("data/multi.bin").exists());
    assert_eq!(
        env.cdn
            .hits()
            .iter()
            .filter(|h| h.target.contains("/chunk/"))
            .count(),
        0
    );
}

#[test]
fn summarize_prints_one_result_line() {
    let env = setup();
    let input = json!({ "request": {
        "appId": env.app_id, "depots": env.depots(), "hosts": env.hosts(false),
        "patterns": ["readme.txt"]
    }});
    let r = cli(&env, &["summarize"], &input.to_string());
    assert_eq!(r.status, 0, "{}", r.stdout);
    assert_eq!(r.lines.len(), 1);
    assert_eq!(r.lines[0]["ok"], json!(true));
    assert!(r.lines[0]["result"]["depots"].is_array());
}

#[test]
fn static_token_is_sent_and_never_echoed() {
    let env = setup();
    let host = env.cdn.host();
    let input = json!({
        "job": env.job("cli-token-1", "install", true),
        "tokens": { host: TOKEN }
    });
    let r = cli(&env, &["run"], &input.to_string());
    assert!(!r.stdout.contains(TOKEN));
    assert!(
        env.cdn.hits().iter().any(|h| h.target.contains(TOKEN)),
        "token reaches the CDN request"
    );
}

#[test]
fn bad_stdin_is_ok_false_exit_2() {
    let env = setup();
    for mode in ["run", "verify", "summarize"] {
        let r = cli(&env, &[mode], "{not json");
        assert_eq!(r.status, 2);
        assert_eq!(r.lines.len(), 1);
        assert_eq!(r.lines[0]["ok"], json!(false));
    }
    let r = cli(&env, &["run"], &json!({ "job": { "nope": 1 } }).to_string());
    assert_eq!(r.status, 2);
    assert_eq!(r.lines[0]["ok"], json!(false));
}

#[test]
fn unknown_flag_exits_64() {
    let env = setup();
    let r = Command::new(BIN)
        .args(["--bogus"])
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert_eq!(r.status.code(), Some(64));
    drop(env);
}

#[test]
fn list_still_works() {
    let out = Command::new(BIN).arg("--list").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let ops: Vec<String> = serde_json::from_slice(&out.stdout).unwrap();
    assert!(ops.contains(&"depot_job_run".to_string()));
}
