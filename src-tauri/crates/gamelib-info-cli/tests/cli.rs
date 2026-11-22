use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use gamelib_testutil::FakeHome;

fn cli() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_gamelib-info-cli"));
    c.env_clear();
    c
}

/// The operator's real wikigameinfo cache (Phase 85 corpus), copied into a fake profile's
/// `store_cache/` so a run never touches the fixture tree.
fn profile_with_wikigameinfo(home: &FakeHome) -> PathBuf {
    let src = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("gamelib-store")
        .join("tests")
        .join("fixtures")
        .join("corpus")
        .join("operator")
        .join("store_cache")
        .join("wikigameinfo.json");
    let user_data = home.root().join("userData");
    let dir = user_data.join("store_cache");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::copy(&src, dir.join("wikigameinfo.json")).unwrap();
    user_data
}

fn cache_get(user_data: &Path, key: &str, now_ms: u64) -> Output {
    cli()
        .args(["cache-get", "--user-data"])
        .arg(user_data)
        .args(["--store", "wikigameinfo", "--key", key, "--now-ms"])
        .arg(now_ms.to_string())
        .output()
        .unwrap()
}

/// `Tue Nov 17 2026 21:32:56 GMT+1300` is 2026-11-17T08:32:56Z.
const DEAD_AGE_2_WRITTEN_MS: u64 = 1_794_904_376_000;
const THIRTY_DAYS_MS: u64 = 30 * 24 * 60 * 60 * 1000;

#[test]
fn a_real_operator_entry_reads_back_while_fresh() {
    let home = FakeHome::new("info-cli-");
    let user_data = profile_with_wikigameinfo(&home);
    let out = cache_get(&user_data, "Dead Age 2", DEAD_AGE_2_WRITTEN_MS + 60_000);
    assert_eq!(out.status.code(), Some(0));
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(text.starts_with("{\"pcgamingwiki\":"), "got: {text}");
    assert!(
        text.contains("\"howLongToBeatID\":\"81570\""),
        "got: {text}"
    );
}

#[test]
fn the_same_entry_reads_as_fallback_past_its_thirty_day_lifespan() {
    let home = FakeHome::new("info-cli-");
    let user_data = profile_with_wikigameinfo(&home);
    let out = cache_get(
        &user_data,
        "Dead Age 2",
        DEAD_AGE_2_WRITTEN_MS + THIRTY_DAYS_MS + 60_000,
    );
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "fallback");
    // TS deletes both keys on expiry; the copy in the fake profile shows it.
    let file =
        std::fs::read_to_string(user_data.join("store_cache").join("wikigameinfo.json")).unwrap();
    assert!(!file.contains("\"Dead Age 2\""), "entry should be gone");
}

#[test]
fn an_absent_key_is_the_fallback() {
    let home = FakeHome::new("info-cli-");
    let user_data = profile_with_wikigameinfo(&home);
    let out = cache_get(&user_data, "No Such Game", DEAD_AGE_2_WRITTEN_MS);
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "fallback");
}

#[test]
fn ops_prints_the_sorted_op_table() {
    let out = cli().arg("ops").output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let text = String::from_utf8_lossy(&out.stdout);
    let ops: Vec<&str> = text.lines().collect();
    assert_eq!(ops, gamelib_info::OPS);
    let mut sorted = ops.clone();
    sorted.sort_unstable();
    assert_eq!(ops, sorted, "OPS must stay sorted");
}

#[test]
fn usage_errors_exit_64_and_bad_input_exits_2() {
    assert_eq!(cli().output().unwrap().status.code(), Some(64));
    assert_eq!(
        cli().arg("--bogus").output().unwrap().status.code(),
        Some(64)
    );
    assert_eq!(
        cli().arg("cache-get").output().unwrap().status.code(),
        Some(64)
    );
    let home = FakeHome::new("info-cli-");
    let out = cli()
        .args(["cache-get", "--user-data"])
        .arg(home.root())
        .args(["--store", "nope", "--key", "k", "--now-ms", "1"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    let out = cli()
        .args(["cache-get", "--user-data"])
        .arg(home.root())
        .args(["--store", "umu", "--key", "k", "--now-ms", "soon"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
}

#[test]
fn an_unknown_op_exits_2_naming_it() {
    let home = FakeHome::new("info-cli-");
    let out = cli()
        .args(["op", "info_nope", "[]", "--user-data"])
        .arg(home.root())
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown op"));
    assert!(out.stdout.is_empty());
}

#[test]
fn op_usage_and_bad_input_are_told_apart() {
    let home = FakeHome::new("info-cli-");
    // Missing --user-data and missing arguments are usage errors.
    assert_eq!(
        cli()
            .args(["op", "info_nope", "[]"])
            .output()
            .unwrap()
            .status
            .code(),
        Some(64)
    );
    assert_eq!(cli().arg("op").output().unwrap().status.code(), Some(64));
    // Arguments that are not a JSON array, an unreadable replay case: bad input.
    let out = cli()
        .args(["op", "info_nope", "{}", "--user-data"])
        .arg(home.root())
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    let out = cli()
        .args([
            "op",
            "info_nope",
            "[]",
            "--replay",
            "/definitely/not/here",
            "--user-data",
        ])
        .arg(home.root())
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
}

#[test]
fn replay_failure_is_reported_even_when_the_op_is_unknown() {
    // An empty case has nothing to consume, so a clean replay does not change the outcome...
    let home = FakeHome::new("info-cli-");
    let case = home.root().join("case");
    std::fs::create_dir_all(&case).unwrap();
    std::fs::write(case.join("exchanges.json"), "[]").unwrap();
    let out = cli()
        .args(["op", "info_nope", "[]", "--replay"])
        .arg(&case)
        .arg("--user-data")
        .arg(home.root())
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown op"));
    // ...but a recorded exchange nobody requested fails the run.
    std::fs::write(
        case.join("exchanges.json"),
        r#"[{"id":"unused","request":{"method":"GET","url":"https://example.test/"},"response":{"status":200,"headers":{}}}]"#,
    )
    .unwrap();
    let out = cli()
        .args(["op", "info_nope", "[]", "--replay"])
        .arg(&case)
        .arg("--user-data")
        .arg(home.root())
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unused"));
}

// ---------------------------------------------------------------------------------------------
// drift (D-12): the live check is opt-in. None of these touches the network: `--list` only prints
// the case table, and every other case here is a usage or input error that exits first.
// ---------------------------------------------------------------------------------------------

#[test]
fn drift_list_prints_the_anticheat_cases_without_touching_the_network() {
    let out = cli().args(["drift", "--list"]).output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let text = String::from_utf8_lossy(&out.stdout);
    let ids: Vec<&str> = text.lines().collect();
    assert!(
        ids.iter().filter(|id| id.starts_with("anticheat-")).count() >= 3,
        "{ids:?}"
    );
    for id in [
        "anticheat-download-mac",
        "anticheat-download-linux",
        "anticheat-lookup",
    ] {
        assert!(ids.contains(&id), "{id} missing from {ids:?}");
    }
    // Run with an empty environment (see `cli()`): it needs no key, no HOME and no network.
    assert!(out.stderr.is_empty());
}

#[test]
fn drift_slice_filters_the_list_and_an_unknown_slice_is_bad_input() {
    let out = cli()
        .args(["drift", "--slice", "anticheat", "--list"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&out.stdout)
        .lines()
        .all(|id| id.starts_with("anticheat-")));

    let out = cli()
        .args(["drift", "--slice", "nope", "--list"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("no drift cases for slice nope"));
}

#[test]
fn drift_flag_mistakes_are_usage_errors_and_the_usage_names_drift_as_opt_in() {
    for args in [
        vec!["drift", "--bogus"],
        vec!["drift", "--slice"],
        vec!["drift", "extra"],
    ] {
        let out = cli().args(&args).output().unwrap();
        assert_eq!(out.status.code(), Some(64), "{args:?}");
        assert!(out.stdout.is_empty(), "{args:?}");
    }
    let out = cli().output().unwrap();
    let usage = String::from_utf8_lossy(&out.stderr);
    assert!(usage.contains("drift [--slice <name>] [--list]"), "{usage}");
    assert!(usage.contains("opt-in"), "{usage}");
    assert!(usage.contains("never touches the Keychain"), "{usage}");
}
