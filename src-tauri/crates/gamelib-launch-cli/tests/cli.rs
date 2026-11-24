use std::process::Command;

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-launch-cli"));
    c.env_clear();
    c
}

#[test]
fn ops_prints_nothing_and_exits_zero_until_the_first_op_lands() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert!(out.stdout.is_empty());
    assert!(gamelib_launch::OPS.is_empty());
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
