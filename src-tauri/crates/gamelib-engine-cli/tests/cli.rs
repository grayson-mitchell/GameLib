use std::process::{Command, Output};

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-engine-cli"));
    c.env_clear();
    c
}

fn run_op(home: &FakeHome, name: &str, json_args: &str) -> Output {
    cli()
        .args(["op", name, json_args, "--user-data"])
        .arg(home.root().join("userData"))
        .output()
        .unwrap()
}

#[test]
fn ops_lists_the_engine_pins_op() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(text.lines().any(|l| l == "engine_pins"), "got: {text}");
}

#[test]
fn engine_pins_prints_the_shared_table_over_a_fake_home() {
    let home = FakeHome::new("engine-cli-");
    let out = run_op(&home, "engine_pins", "[]");
    assert_eq!(out.status.code(), Some(0));
    let table: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(table["current"]["id"], "wine-staging-11.20");
    assert_eq!(
        table["current"]["wine"]["archiveName"],
        "wine-staging-11.20-osx64.tar.xz"
    );
    assert_eq!(
        table["current"]["wine"]["sha256"].as_str().unwrap().len(),
        64
    );
    assert!(table["previous"].is_null());
}

#[test]
fn an_unknown_op_exits_two_with_the_fixed_error() {
    let home = FakeHome::new("engine-cli-");
    let out = run_op(&home, "nope", "[]");
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown op: nope"));
}

#[test]
fn extra_arguments_exit_two_with_bad_args() {
    let home = FakeHome::new("engine-cli-");
    let out = run_op(&home, "engine_pins", "[1,2]");
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("engine_pins:bad-args"));
}

#[test]
fn no_subcommand_is_a_usage_error() {
    let out = cli().output().unwrap();
    assert_eq!(out.status.code(), Some(64));
}

fn write_case(dir: &std::path::Path, ts_only: bool) -> std::path::PathBuf {
    let case = dir.join("case");
    std::fs::create_dir_all(&case).unwrap();
    let exchange = serde_json::json!([{
        "id": "ex-1",
        "tsOnly": ts_only,
        "request": {"method": "GET", "url": "https://api.example.test/a", "headers": {}},
        "response": {"status": 200, "headers": {}}
    }]);
    std::fs::write(case.join("exchanges.json"), exchange.to_string()).unwrap();
    case
}

#[test]
fn replay_fails_the_run_on_an_exchange_the_op_never_requested() {
    let home = FakeHome::new("engine-cli-");
    let case = write_case(home.root(), false);
    let out = cli()
        .args(["op", "engine_pins", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .arg("--replay")
        .arg(&case)
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unconsumed recorded exchange(s): ex-1"));
    // The result is withheld: a drifting run prints nothing on stdout.
    assert!(out.stdout.is_empty());
}

#[test]
fn replay_passes_when_the_leftover_exchange_is_ts_only_and_home_is_accepted() {
    let home = FakeHome::new("engine-cli-");
    let case = write_case(home.root(), true);
    let out = cli()
        .args(["op", "engine_pins", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .arg("--home")
        .arg(home.root().join("fakeHome"))
        .arg("--replay")
        .arg(&case)
        .output()
        .unwrap();
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let table: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(table["current"]["id"], "wine-staging-11.20");
}

#[test]
fn a_missing_replay_case_exits_two() {
    let home = FakeHome::new("engine-cli-");
    let out = cli()
        .args(["op", "engine_pins", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .arg("--replay")
        .arg(home.root().join("no-such-case"))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("cannot read exchanges.json"));
}
