use std::process::Command;

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-knownfix-cli"));
    c.env_clear();
    c
}

#[test]
fn ops_prints_the_op_table_and_exits_zero() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let printed = String::from_utf8_lossy(&out.stdout);
    let names: Vec<&str> = printed.lines().collect();
    assert_eq!(names, gamelib_knownfix::OPS);
}

#[test]
fn the_overlay_catalogue_op_prints_the_shared_json_over_a_fake_home() {
    let home = FakeHome::new("knownfix-cli-");
    let out = cli()
        .args(["op", "knownfix_overlay_catalogue", "[]", "--user-data"])
        .arg(home.root().join("userData"))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0), "{out:?}");
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    let first = &value["entries"][0];
    assert_eq!(first["id"], "gst-libav-1.24.13");
    assert_eq!(
        first["archiveSha256"],
        "57e5f74b66116d5074771cfc18c112a5a8b7e8b76a71b0897496e2dedbc7cced"
    );
    assert_eq!(
        value["targetEnv"]["gstreamer-plugin-path"],
        "GST_PLUGIN_PATH"
    );
}

#[test]
fn the_read_op_prints_the_local_fix_and_null_for_an_unknown_game_over_a_fake_home() {
    let home = FakeHome::new("knownfix-cli-");
    let user_data = home.root().join("userData");
    let local = user_data.join("fixes").join("local");
    std::fs::create_dir_all(&local).unwrap();
    std::fs::write(
        local.join("1234-gog.json"),
        r#"{"title":"Seeded","winetricks":["vcrun2019"],"registry":[]}"#,
    )
    .unwrap();
    let run = |args: &str| {
        let out = cli()
            .args(["op", "knownfix_read", args, "--user-data"])
            .arg(&user_data)
            .output()
            .unwrap();
        assert_eq!(out.status.code(), Some(0), "{out:?}");
        serde_json::from_slice::<serde_json::Value>(&out.stdout).unwrap()
    };
    assert_eq!(
        run(r#"["1234","gog"]"#),
        serde_json::json!({"title": "Seeded", "winetricks": ["vcrun2019"]})
    );
    assert_eq!(run(r#"["9999","gog"]"#), serde_json::Value::Null);
    let bad = cli()
        .args(["op", "knownfix_read", r#"["1234","epic"]"#, "--user-data"])
        .arg(&user_data)
        .output()
        .unwrap();
    assert_eq!(bad.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&bad.stderr).contains("knownfix_read:bad-args"));
}

#[test]
fn an_unknown_op_exits_two_over_a_fake_home() {
    let home = FakeHome::new("knownfix-cli-");
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
