//! Restart-hold cases from steamRestartHold.test.ts and the decision-level cases of
//! library.restartHold.test.ts, plus the steamClientProcess probes and the shared-file checks
//! against the file the real TS CacheStore wrote (fixtures/restart_hold/ts-written.json).

use gamelib_steampoll::acf_state::AcfSource;
use gamelib_steampoll::constants::STEAM_HOLD_PROBE_MIN_INTERVAL_MS;
use gamelib_steampoll::effects::{Effect, LogLevel};
use gamelib_steampoll::hold::*;
use gamelib_steampoll::host::{HoldSink, NotifyText, RunOutput};
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::testing::{FakeClock, ScriptedRunner};
use serde_json::{json, Value};
use std::collections::HashMap;

const PGREP: &str = "/usr/bin/pgrep -x steam_osx";

fn out(code: i32, stdout: &str) -> RunOutput {
    RunOutput {
        code: Some(code),
        stdout: stdout.into(),
        stderr: String::new(),
    }
}

fn rec() -> RestartHoldRecord {
    RestartHoldRecord {
        pids: vec![PidToken {
            pid: 111,
            start_token: "T1".into(),
        }],
        recorded_at: 1000.0,
        mac_native_route: true,
        skipped_depots: vec!["5".into()],
    }
}

fn store() -> (tempfile::TempDir, HoldStore) {
    let dir = tempfile::tempdir().unwrap();
    let s = HoldStore::new(
        dir.path()
            .join("store_cache")
            .join("steam_restart_hold.json"),
    );
    (dir, s)
}

// ---- steamRestartHold.test.ts: persistence ----------------------------------------------------

#[test]
fn round_trips_a_record_and_clears_it() {
    let (_d, s) = store();
    s.record("730", &rec(), 5000);
    assert_eq!(s.read("730"), Some(rec()));
    s.clear("730");
    assert_eq!(s.read("730"), None);
}

#[test]
fn read_rejects_invalid_records() {
    let good = rec().to_value();
    let with = |k: &str, v: Value| {
        let mut g = good.clone();
        g[k] = v;
        g
    };
    let cases: Vec<(&str, Value)> = vec![
        ("non-object", json!("x")),
        ("missing pids", {
            let mut g = good.clone();
            g.as_object_mut().unwrap().remove("pids");
            g
        }),
        ("empty pids", with("pids", json!([]))),
        (
            "zero pid",
            with("pids", json!([{"pid": 0, "startToken": "a"}])),
        ),
        (
            "negative pid",
            with("pids", json!([{"pid": -3, "startToken": "a"}])),
        ),
        (
            "non-integer pid",
            with("pids", json!([{"pid": 1.5, "startToken": "a"}])),
        ),
        (
            "non-string token",
            with("pids", json!([{"pid": 1, "startToken": 7}])),
        ),
        (
            "empty token",
            with("pids", json!([{"pid": 1, "startToken": ""}])),
        ),
        ("non-number recordedAt", with("recordedAt", json!("1"))),
        ("non-string depots", with("skippedDepots", json!([1]))),
    ];
    for (name, v) in cases {
        assert_eq!(parse_record(&v), None, "{name}");
    }
    // JSON cannot carry Infinity, so the non-finite case arrives as null.
    assert_eq!(parse_record(&with("recordedAt", Value::Null)), None);
}

#[test]
fn mac_native_route_defaults_false() {
    let mut v = rec().to_value();
    v.as_object_mut().unwrap().remove("macNativeRoute");
    assert!(!parse_record(&v).unwrap().mac_native_route);
}

#[test]
fn list_returns_only_valid_pairs() {
    let (_d, s) = store();
    s.record("730", &rec(), 1);
    // A hand-edited bad entry beside the good one.
    let mut raw: Value = serde_json::from_str(&std::fs::read_to_string(s.path()).unwrap()).unwrap();
    raw["bad"] = json!({"nope": true});
    std::fs::write(s.path(), raw.to_string()).unwrap();
    assert_eq!(s.list(), vec![("730".to_string(), rec())]);
}

// ---- steamRestartHold.test.ts: decideSteamRestartHoldRearm ------------------------------------

fn tokens(pairs: &[(u32, &str)]) -> HashMap<u32, String> {
    pairs.iter().map(|(p, t)| (*p, t.to_string())).collect()
}

#[test]
fn decide_unknown_when_live_pids_is_none() {
    let t = tokens(&[(111, "T1")]);
    assert_eq!(
        decide_rearm(&rec(), None, Some(&t), 2000, 10_000),
        RearmDecision::Unknown
    );
}

#[test]
fn decide_drops_when_expired() {
    let t = tokens(&[(111, "T1")]);
    assert_eq!(
        decide_rearm(&rec(), Some(&[111]), Some(&t), 11_000, 10_000),
        RearmDecision::Drop {
            reason: DropReason::Expired
        }
    );
}

#[test]
fn decide_drops_when_no_recorded_pid_is_live() {
    let t = tokens(&[(111, "T1")]);
    assert_eq!(
        decide_rearm(&rec(), Some(&[9]), Some(&t), 2000, 10_000),
        RearmDecision::Drop {
            reason: DropReason::SteamExited
        }
    );
}

#[test]
fn decide_unknown_when_tokens_unavailable() {
    assert_eq!(
        decide_rearm(&rec(), Some(&[111]), None, 2000, 10_000),
        RearmDecision::Unknown
    );
}

#[test]
fn decide_drops_on_a_differing_token_pid_reuse() {
    let t = tokens(&[(111, "T2")]);
    assert_eq!(
        decide_rearm(&rec(), Some(&[111]), Some(&t), 2000, 10_000),
        RearmDecision::Drop {
            reason: DropReason::PidReused
        }
    );
}

#[test]
fn decide_arms_with_only_the_matching_pids() {
    let mut r = rec();
    r.pids.push(PidToken {
        pid: 222,
        start_token: "X".into(),
    });
    let t = tokens(&[(111, "T1"), (222, "Y")]);
    assert_eq!(
        decide_rearm(&r, Some(&[111, 222]), Some(&t), 2000, 10_000),
        RearmDecision::Arm { pids: vec![111] }
    );
}

// ---- shared file with the TS CacheStore (D-16, R3) --------------------------------------------

fn ts_fixture_into(dir: &std::path::Path) -> HoldStore {
    let path = dir.join("steam_restart_hold.json");
    std::fs::write(&path, include_str!("fixtures/restart_hold/ts-written.json")).unwrap();
    HoldStore::new(path)
}

#[test]
fn reads_both_records_the_real_ts_store_wrote() {
    let dir = tempfile::tempdir().unwrap();
    let s = ts_fixture_into(dir.path());
    let list = s.list();
    let ids: Vec<&str> = list.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(list.len(), 2, "{ids:?}");
    let first = s.read("43160").unwrap();
    assert_eq!(first.pids[0].pid, 4242);
    assert_eq!(first.pids[0].start_token, "Mon Nov 16 09:12:03 2026");
    assert!(first.mac_native_route);
    assert_eq!(first.skipped_depots, vec!["43161".to_string()]);
    assert_eq!(s.read("238320").unwrap().pids.len(), 2);
}

#[test]
fn record_and_clear_keep_other_keys_and_the_layout() {
    let dir = tempfile::tempdir().unwrap();
    let s = ts_fixture_into(dir.path());
    let before: Value =
        serde_json::from_str(include_str!("fixtures/restart_hold/ts-written.json")).unwrap();

    s.record("999", &rec(), 1_700_000_200_000);
    let after: Value = serde_json::from_str(&std::fs::read_to_string(s.path()).unwrap()).unwrap();
    // TS layout: record at the top level, timestamp nested under "__timestamp", envelope kept.
    assert_eq!(after["999"], rec().to_value());
    assert_eq!(after["__internal__"], before["__internal__"]);
    assert_eq!(after["43160"], before["43160"]);
    assert_eq!(
        after["__timestamp"]["43160"],
        before["__timestamp"]["43160"]
    );
    assert_eq!(after["__timestamp"]["999"], "2023-11-14T22:16:40.000Z");

    s.clear("999");
    s.clear("238320");
    let end: Value = serde_json::from_str(&std::fs::read_to_string(s.path()).unwrap()).unwrap();
    assert!(end.get("999").is_none() && end.get("238320").is_none());
    assert!(end["__timestamp"].get("999").is_none());
    assert!(end["__timestamp"].get("238320").is_none());
    assert_eq!(end["43160"], before["43160"]);
    assert_eq!(end["__timestamp"]["43160"], before["__timestamp"]["43160"]);
    assert_eq!(end["__internal__"], before["__internal__"]);
}

#[test]
fn a_new_file_carries_the_version_envelope_and_clear_on_missing_is_a_noop() {
    let (_d, s) = store();
    s.clear("1");
    assert!(!s.path().exists());
    s.record("1", &rec(), 0);
    let v: Value = serde_json::from_str(&std::fs::read_to_string(s.path()).unwrap()).unwrap();
    assert_eq!(v["__internal__"]["gamelib"]["schemaVersion"], 1);
    assert_eq!(v["__timestamp"]["1"], "1970-01-01T00:00:00.000Z");
}

#[test]
fn a_flat_timestamp_key_is_removed_with_its_record() {
    let (_d, s) = store();
    std::fs::create_dir_all(s.path().parent().unwrap()).unwrap();
    let mut v = json!({"7": rec().to_value(), "__timestamp.7": "x"});
    v["__internal__"] = json!({"gamelib": {"schemaVersion": 1}});
    std::fs::write(s.path(), v.to_string()).unwrap();
    assert_eq!(s.list().len(), 1);
    s.clear("7");
    let after: Value = serde_json::from_str(&std::fs::read_to_string(s.path()).unwrap()).unwrap();
    assert!(after.get("__timestamp.7").is_none() && after.get("7").is_none());
}

#[test]
fn an_unparseable_store_is_never_overwritten() {
    let (_d, s) = store();
    std::fs::create_dir_all(s.path().parent().unwrap()).unwrap();
    std::fs::write(s.path(), "{not json").unwrap();
    assert!(s.list().is_empty());
    s.record("1", &rec(), 0);
    s.clear("1");
    assert_eq!(std::fs::read_to_string(s.path()).unwrap(), "{not json");
}

#[cfg(unix)]
#[test]
fn the_store_file_is_private() {
    use std::os::unix::fs::PermissionsExt;
    let (_d, s) = store();
    s.record("1", &rec(), 0);
    let mode = std::fs::metadata(s.path()).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

#[test]
fn hold_sink_records_a_valid_value_and_rejects_an_invalid_one() {
    let (_d, s) = store();
    let sink: &dyn HoldSink = &s;
    sink.record("5", json!({"pids": []}), 1);
    assert!(!s.path().exists());
    sink.record("5", rec().to_value(), 1);
    assert_eq!(s.read("5"), Some(rec()));
    sink.clear("5");
    assert_eq!(s.read("5"), None);
}

// ---- library.restartHold.test.ts: the decision-level cases ------------------------------------

fn poll() -> HoldPoll {
    HoldPoll {
        is_native_handoff: true,
        mac_native_route: true,
        skipped_depots: vec!["5".into()],
        ..HoldPoll::default()
    }
}

fn yes() -> impl Fn() -> bool + Send + Sync {
    || true
}

async fn hold(
    r: &ScriptedRunner,
    c: &FakeClock,
    p: &mut HoldPoll,
    source: AcfSource,
) -> (bool, Vec<Effect>) {
    should_hold(r, c, Platform::Darwin, "730", p, source, &yes()).await
}

fn script_steam(r: &ScriptedRunner, pgrep: Vec<RunOutput>, ps: Option<&str>) {
    r.on(PGREP, pgrep);
    if let Some(text) = ps {
        r.on("/bin/ps -o pid=,lstart= -p 111", vec![out(0, text)]);
    }
}

#[tokio::test]
async fn holds_a_native_handoff_and_records_pids_with_tokens() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(50_000);
    script_steam(
        &r,
        vec![out(0, "111\n")],
        Some("111 Mon Nov  2 10:00:00 2026\n"),
    );
    let mut p = poll();
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(held);
    assert_eq!(p.steam_hold, HoldState::Holding);
    assert_eq!(p.steam_pids_at_handoff, vec![111]);
    assert!(p.seen_downloading);
    assert_eq!(p.last_steam_probe_ms, 50_000);
    let write = fx
        .iter()
        .find_map(|e| match e {
            Effect::WriteHoldRecord { app_id, record } => Some((app_id, record)),
            _ => None,
        })
        .expect("a WriteHoldRecord effect");
    assert_eq!(write.0, "730");
    assert_eq!(
        *write.1,
        json!({
            "pids": [{"pid": 111, "startToken": "Mon Nov 2 10:00:00 2026"}],
            "recordedAt": 50_000,
            "macNativeRoute": true,
            "skippedDepots": ["5"]
        })
    );
    assert!(!fx
        .iter()
        .any(|e| matches!(e, Effect::ClearHoldRecord { .. })));
}

#[tokio::test]
async fn keeps_holding_while_the_same_pid_is_alive_and_does_not_rewrite() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(0, "111\n")], Some("111 T\n"));
    let mut p = poll();
    hold(&r, &c, &mut p, AcfSource::Native).await;
    c.advance(STEAM_HOLD_PROBE_MIN_INTERVAL_MS);
    p.absent_ticks_since_seen = 4;
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(held);
    assert!(fx.is_empty());
    assert_eq!(p.absent_ticks_since_seen, 0);
    assert_eq!(p.steam_hold, HoldState::Holding);
}

#[tokio::test]
async fn reprobes_no_more_often_than_the_probe_gap() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(0, "111\n")], Some("111 T\n"));
    let mut p = poll();
    hold(&r, &c, &mut p, AcfSource::Native).await;
    let pgreps = |r: &ScriptedRunner| r.calls().iter().filter(|k| *k == PGREP).count();
    assert_eq!(pgreps(&r), 1);
    for _ in 0..3 {
        c.advance(3000);
        hold(&r, &c, &mut p, AcfSource::Native).await;
    }
    assert_eq!(pgreps(&r), 1, "9 s in: still inside the gap");
    c.advance(3000);
    hold(&r, &c, &mut p, AcfSource::Native).await;
    assert_eq!(pgreps(&r), 2, "12 s in: one more probe");
    assert_eq!(p.last_steam_probe_ms, 12_000);
}

#[tokio::test]
async fn releases_and_clears_the_record_once_the_recorded_pid_is_gone() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    // First probe sees 111; the re-probe finds Steam not running (pgrep exit 1).
    script_steam(&r, vec![out(0, "111\n"), out(1, "")], Some("111 T\n"));
    let mut p = poll();
    hold(&r, &c, &mut p, AcfSource::Native).await;
    c.advance(STEAM_HOLD_PROBE_MIN_INTERVAL_MS);
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(!held);
    assert_eq!(p.steam_hold, HoldState::Released);
    assert!(fx
        .iter()
        .any(|e| matches!(e, Effect::ClearHoldRecord { app_id } if app_id == "730")));
    // Released never holds or probes again.
    let calls = r.calls().len();
    let (again, fx2) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(!again && fx2.is_empty());
    assert_eq!(r.calls().len(), calls);
}

#[tokio::test]
async fn releases_when_steam_was_restarted_a_different_pid() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(0, "111\n"), out(0, "222\n")], Some("111 T\n"));
    let mut p = poll();
    hold(&r, &c, &mut p, AcfSource::Native).await;
    c.advance(STEAM_HOLD_PROBE_MIN_INTERVAL_MS);
    let (held, _) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(!held);
    assert_eq!(p.steam_hold, HoldState::Released);
}

#[tokio::test]
async fn an_inconclusive_reprobe_keeps_holding() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(0, "111\n"), out(2, "")], Some("111 T\n"));
    let mut p = poll();
    hold(&r, &c, &mut p, AcfSource::Native).await;
    c.advance(STEAM_HOLD_PROBE_MIN_INTERVAL_MS);
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(held);
    assert!(fx.is_empty());
    assert_eq!(p.steam_hold, HoldState::Holding);
}

#[tokio::test]
async fn fail_open_when_steam_is_not_running_at_finalize() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(1, "")], None);
    let mut p = poll();
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(!held);
    assert_eq!(p.steam_hold, HoldState::Released);
    // Also removes a stale record left by an earlier hold of this app.
    assert!(fx
        .iter()
        .any(|e| matches!(e, Effect::ClearHoldRecord { .. })));
}

#[tokio::test]
async fn fail_open_when_the_first_probe_is_inconclusive() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(2, "")], None);
    let mut p = poll();
    let (held, _) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(!held);
    assert_eq!(p.steam_hold, HoldState::Released);
}

#[tokio::test]
async fn an_off_path_poll_never_probes_and_never_holds() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    let mut p = poll();
    p.is_native_handoff = false;
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(!held && fx.is_empty());
    assert!(r.calls().is_empty());
    assert_eq!(p.steam_hold, HoldState::Unprobed);
}

#[tokio::test]
async fn bottle_and_bridge_sources_never_probe_and_never_hold() {
    for source in [AcfSource::Bottle, AcfSource::Bridge] {
        let r = ScriptedRunner::default();
        let c = FakeClock::new(0);
        let mut p = poll();
        let (held, fx) = hold(&r, &c, &mut p, source).await;
        assert!(!held && fx.is_empty());
        assert!(r.calls().is_empty());
    }
}

#[tokio::test]
async fn a_poll_stopped_during_the_probe_changes_nothing() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(0, "111\n")], Some("111 T\n"));
    let mut p = poll();
    let gone = || false;
    let (held, fx) = should_hold(
        &r,
        &c,
        Platform::Darwin,
        "730",
        &mut p,
        AcfSource::Native,
        &gone,
    )
    .await;
    assert!(!held && fx.is_empty());
    assert_eq!(p.steam_hold, HoldState::Unprobed);
    assert_eq!(p.last_steam_probe_ms, 0);
}

#[tokio::test]
async fn unreadable_start_tokens_hold_without_a_record_and_warn() {
    let r = ScriptedRunner::default();
    let c = FakeClock::new(0);
    script_steam(&r, vec![out(0, "111\n")], None); // ps unscripted: code None => unknown
    let mut p = poll();
    let (held, fx) = hold(&r, &c, &mut p, AcfSource::Native).await;
    assert!(held);
    assert!(!fx
        .iter()
        .any(|e| matches!(e, Effect::WriteHoldRecord { .. })));
    assert!(fx.iter().any(|e| matches!(
        e,
        Effect::Log {
            level: LogLevel::Warn,
            ..
        }
    )));
}

#[test]
fn release_hold_is_the_one_place_a_hold_ends() {
    let mut p = poll();
    p.steam_hold = HoldState::Holding;
    let fx = release_hold("730", &mut p);
    assert_eq!(p.steam_hold, HoldState::Released);
    assert_eq!(
        fx,
        Effect::ClearHoldRecord {
            app_id: "730".into()
        }
    );
}

#[test]
fn restart_to_finish_notification_uses_the_waiting_key() {
    let n = restart_to_finish_notification("Dark Game");
    assert_eq!(n.title, NotifyText::Literal("Dark Game".into()));
    match n.body {
        NotifyText::Key {
            key,
            default,
            params,
        } => {
            assert_eq!(key, "steam.waitingForSteam.notify");
            assert_eq!(default, "Restart Steam to finish installing {{game}}");
            assert_eq!(params["game"], "Dark Game");
        }
        other => panic!("{other:?}"),
    }
}

// ---- steamClientProcess probes ----------------------------------------------------------------

#[test]
fn parses_tasklist_rows() {
    assert_eq!(
        parse_tasklist_steam_pids("\"steam.exe\",\"4812\",\"Console\",\"1\",\"1 K\"\r\n"),
        vec![4812]
    );
    assert_eq!(
        parse_tasklist_steam_pids("\"STEAM.EXE\",\"1\"\n\"steam.exe\",\"22\"\n"),
        vec![1, 22]
    );
    assert!(parse_tasklist_steam_pids(
        "INFO: No tasks are running which match the specified criteria.\n\"steamwebhelper.exe\",\"9\"\n\"steamservice.exe\",\"8\"\n"
    )
    .is_empty());
    assert!(parse_tasklist_steam_pids("\"steam.exe\",\"abc\"\n\"steam.exe\",\"0\"\n").is_empty());
}

#[test]
fn parses_pgrep_and_pid_token_lines() {
    assert_eq!(parse_pgrep_pids("111\n 222 \n\nabc\n0\n"), vec![111, 222]);
    let m =
        parse_pid_token_lines("111 Mon Nov  2 10:00:00 2026\n  222   638000000000000000\nnoise\n");
    assert_eq!(m[&111], "Mon Nov 2 10:00:00 2026");
    assert_eq!(m[&222], "638000000000000000");
    assert_eq!(m.len(), 2);
}

#[tokio::test]
async fn pgrep_codes_map_to_pids_empty_or_unknown() {
    let r = ScriptedRunner::default();
    r.on(PGREP, vec![out(0, "30\n10\n")]);
    assert_eq!(
        list_steam_client_pids(&r, Platform::Darwin).await,
        Some(vec![30, 10])
    );
    r.on(PGREP, vec![out(1, "")]);
    assert_eq!(
        list_steam_client_pids(&r, Platform::Darwin).await,
        Some(vec![])
    );
    r.on(PGREP, vec![out(2, "")]);
    assert_eq!(list_steam_client_pids(&r, Platform::Darwin).await, None);
    // A spawn failure or timeout carries no exit code.
    r.on(PGREP, vec![RunOutput::default()]);
    assert_eq!(list_steam_client_pids(&r, Platform::Darwin).await, None);
    r.on("pgrep -x steam", vec![out(0, "5\n")]);
    assert_eq!(
        list_steam_client_pids(&r, Platform::Linux).await,
        Some(vec![5])
    );
}

#[tokio::test]
async fn start_tokens_probe_by_platform() {
    let r = ScriptedRunner::default();
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Darwin, &[]).await,
        Some(HashMap::new())
    );
    assert!(r.calls().is_empty(), "no spawn for an empty pid list");
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Darwin, &[0]).await,
        Some(HashMap::new())
    );

    r.on(
        "/bin/ps -o pid=,lstart= -p 111,222",
        vec![out(0, "111 T1\n333 other\n")],
    );
    let t = read_steam_process_start_tokens(&r, Platform::Darwin, &[111, 222])
        .await
        .unwrap();
    assert_eq!(t, tokens(&[(111, "T1")]), "only asked-for pids appear");

    r.on("ps -o pid=,lstart= -p 5", vec![out(1, "")]);
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Linux, &[5]).await,
        Some(HashMap::new())
    );
    r.on("ps -o pid=,lstart= -p 6", vec![out(3, "")]);
    assert_eq!(
        read_steam_process_start_tokens(&r, Platform::Linux, &[6]).await,
        None
    );
}
