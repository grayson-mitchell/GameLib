use std::process::Command;

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-wine-cli"));
    c.env_clear();
    c
}

#[test]
fn ops_prints_the_op_table_and_exits_zero() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let printed = String::from_utf8_lossy(&out.stdout);
    let names: Vec<&str> = printed.lines().collect();
    assert_eq!(names, gamelib_wine::OPS);
}

#[test]
fn an_unknown_op_exits_two_over_a_fake_home() {
    let home = FakeHome::new("wine-cli-");
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

#[test]
fn a_missing_replay_case_exits_two() {
    let home = FakeHome::new("wine-cli-");
    let out = cli()
        .args(["op", "nope", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .arg("--replay")
        .arg(home.root().join("no-such-case"))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("cannot read exchanges.json"));
}

#[test]
fn home_and_replay_flags_are_accepted_ahead_of_the_op_error() {
    let home = FakeHome::new("wine-cli-");
    let case = home.root().join("case");
    std::fs::create_dir_all(&case).unwrap();
    std::fs::write(case.join("exchanges.json"), "[]").unwrap();
    let out = cli()
        .args(["op", "nope", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .arg("--home")
        .arg(home.root().join("fakeHome"))
        .arg("--replay")
        .arg(&case)
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown op: nope"));
}
