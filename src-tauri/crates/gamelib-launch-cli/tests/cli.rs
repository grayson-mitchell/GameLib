use std::process::Command;

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-launch-cli"));
    c.env_clear();
    c
}

#[test]
fn ops_prints_the_op_table_one_name_per_line() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let printed = String::from_utf8(out.stdout).unwrap();
    let names: Vec<&str> = printed.lines().collect();
    assert_eq!(names, gamelib_launch::OPS);
    assert!(names.contains(&"launch_setup_wrapper_env_vars"));
}

#[test]
fn the_wrapper_env_op_runs_from_the_cli_and_answers_json() {
    let home = FakeHome::new("launch-cli-");
    let out = cli()
        .args([
            "op",
            "launch_setup_wrapper_env_vars",
            r#"[{"appName":"app1","appRunner":"gog"}]"#,
            "--user-data",
        ])
        .arg(home.root().join("userData"))
        .output()
        .unwrap();
    assert_eq!(
        out.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let answer: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(
        answer,
        serde_json::json!({
            "HEROIC_APP_NAME": "app1",
            "HEROIC_APP_RUNNER": "gog",
            "GAMEID": "umu-0",
            "HEROIC_APP_SOURCE": "gog",
            "STORE": "gog",
        })
    );
}

#[test]
fn a_bad_argument_exits_two_with_the_fixed_literal() {
    let home = FakeHome::new("launch-cli-");
    let out = cli()
        .args([
            "op",
            "launch_setup_wrapper_env_vars",
            r#"[{"appName":"a"}]"#,
            "--user-data",
        ])
        .arg(home.root().join("userData"))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert_eq!(
        String::from_utf8_lossy(&out.stderr).trim(),
        "launch_setup_wrapper_env_vars:bad-args"
    );
}

#[test]
fn an_unknown_op_exits_two_over_a_fake_home() {
    let home = FakeHome::new("launch-cli-");
    let out = cli()
        .args(["op", "nope", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown op: nope"));
}

#[test]
fn no_subcommand_is_a_usage_error() {
    let out = cli().output().unwrap();
    assert_eq!(out.status.code(), Some(64));
}
