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

/// Runs `op <name> <args>` over a fresh fake profile (`--user-data` and `--home` both inside it: these ops
/// read no profile, so there is no real-profile arm) and returns the finished process.
fn run_op(name: &str, args: &str) -> std::process::Output {
    let home = FakeHome::new("launch-cli-");
    cli()
        .args(["op", name, args, "--user-data"])
        .arg(home.root().join("userData"))
        .arg("--home")
        .arg(home.root().join("home"))
        .output()
        .unwrap()
}

/// CR-01 (88.1-VERIFICATION): `setupEnvVars` reads only `nvidiaPrime`, `showFps` and `enviromentOptions`,
/// so settings that carry no wine, an empty one or a legacy-keyed one answer the same map. The host
/// argument is null, so the env is empty on every OS and the default empty `LD_PRELOAD` is always added.
#[test]
fn the_env_op_reads_no_wine_from_the_cli() {
    let rows = [
        // The verifier's table, rows 1 to 4, then `{}` (the Windows factory default).
        r#"[{"nvidiaPrime":false,"winePrefix":""},null,null]"#,
        r#"[{"wineVersion":{}},null,null]"#,
        r#"[{"nvidiaPrime":false,"winePrefix":"","wineVersion":{"bin":"/x","name":"w","type":"wine"}},null,null]"#,
        r#"[{"nvidiaPrime":false,"winePrefix":"","wineVersion":{"bin":"/x","name":"w","type":"wine","legacy":1}},null,null]"#,
        r#"[{},null,null]"#,
    ];
    for args in rows {
        let out = run_op("launch_setup_env_vars", args);
        assert_eq!(
            out.status.code(),
            Some(0),
            "{args}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let answer: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(answer, serde_json::json!({"LD_PRELOAD": ""}), "{args}");
    }
    // A value that is not a list is still refused with the fixed literal, which never echoes it.
    let secret = "s3cret-value";
    let out = run_op(
        "launch_setup_env_vars",
        &format!(r#"[{{"enviromentOptions":"{secret}"}},null,null]"#),
    );
    assert_eq!(out.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert_eq!(stderr.trim(), "launch_setup_env_vars:bad-args");
    assert!(!stderr.contains("s3cret"));
}

/// Behaviour elsewhere is unchanged: the wine env op still needs the game's wine.
#[test]
fn the_wine_env_op_still_needs_a_wine() {
    let out = run_op("launch_setup_wine_env_vars", r#"[{},null,null]"#);
    assert_eq!(out.status.code(), Some(2));
    assert_eq!(
        String::from_utf8_lossy(&out.stderr).trim(),
        "launch_setup_wine_env_vars:bad-args"
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
