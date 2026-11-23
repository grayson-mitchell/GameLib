use std::process::Command;

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-wine-cli"));
    c.env_clear();
    c
}

#[test]
fn ops_prints_an_empty_list_and_exits_zero() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert!(out.stdout.is_empty(), "got: {:?}", out.stdout);
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
