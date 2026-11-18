//! Restart-hold store cases from steamRestartHold.test.ts, plus the steamClientProcess probes and
//! the shared-file checks against the file the real TS CacheStore wrote
//! (fixtures/restart_hold/ts-written.json). The hold decision cases went with `should_hold`
//! (Phase 81, D-11).

use gamelib_steampoll::hold::*;
use gamelib_steampoll::host::HoldSink;
use serde_json::{json, Value};
use std::collections::HashMap;

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

/// 80-REVIEW A/WR-03: concurrent read-modify-writes from separate instances on separate threads
/// (the per-poll tasks plus rearm's own instance) neither lose a record nor resurrect a cleared one.
#[test]
fn concurrent_writers_on_separate_instances_lose_nothing() {
    let (_d, s) = store();
    let path = s.path().to_path_buf();
    // Records that must end up cleared.
    for i in 0..16u32 {
        s.record(&format!("9{i}"), &rec(), 1);
    }
    let threads: Vec<_> = (0..16u32)
        .map(|i| {
            let path = path.clone();
            std::thread::spawn(move || {
                let mine = HoldStore::new(path);
                for _ in 0..4 {
                    mine.record(&format!("1{i}"), &rec(), 2);
                    mine.clear(&format!("9{i}"));
                }
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    for i in 0..16u32 {
        assert_eq!(s.read(&format!("1{i}")), Some(rec()), "record 1{i} lost");
        assert_eq!(s.read(&format!("9{i}")), None, "record 9{i} resurrected");
    }
    let leftovers: Vec<_> = std::fs::read_dir(path.parent().unwrap())
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
        .collect();
    assert!(leftovers.is_empty(), "temp files left behind");
}

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
