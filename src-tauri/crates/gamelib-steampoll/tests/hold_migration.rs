//! Phase 81 D-12: draining and discarding the restart-hold store older builds wrote. Process
//! probes are scripted (`ScriptedRunner`), the store files are temp files, and the TS-written
//! fixture is the shape the real CacheStore produced.

use gamelib_steampoll::hold_migration::{drain_hold_records, DrainedHold};
use gamelib_steampoll::host::RunOutput;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::testing::ScriptedRunner;
use serde_json::json;
use std::path::PathBuf;

const PGREP: &str = "/usr/bin/pgrep -x steam_osx";
const FIXTURE: &str = include_str!("fixtures/restart_hold/ts-written.json");
const NOW: u64 = 1_700_000_500_000;

fn out(code: i32, stdout: &str) -> RunOutput {
    RunOutput {
        code: Some(code),
        stdout: stdout.into(),
        stderr: String::new(),
    }
}

fn store_with(text: &str) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir
        .path()
        .join("store_cache")
        .join("steam_restart_hold.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, text).unwrap();
    (dir, path)
}

/// The fixture records pids 4242 (app 43160, token "Mon Nov 16 09:12:03 2026") and 77 / 78
/// (app 238320, tokens 6380...00 and 6380...01).
fn script(r: &ScriptedRunner, pgrep: RunOutput, ps: Option<RunOutput>) {
    r.on(PGREP, vec![pgrep]);
    if let Some(ps) = ps {
        r.on("/bin/ps -o pid=,lstart= -p 77,78,4242", vec![ps]);
    }
}

async fn drain(r: &ScriptedRunner, path: &std::path::Path) -> Vec<DrainedHold> {
    drain_hold_records(r, Platform::Darwin, path, NOW).await
}

fn ids(list: &[DrainedHold]) -> Vec<&str> {
    let mut v: Vec<&str> = list.iter().map(|d| d.app_id.as_str()).collect();
    v.sort_unstable();
    v
}

#[tokio::test]
async fn drains_each_valid_record_whose_recorded_steam_is_still_live() {
    let (_d, path) = store_with(FIXTURE);
    let r = ScriptedRunner::default();
    script(
        &r,
        out(0, "4242\n78\n"),
        Some(out(
            0,
            "4242 Mon   Nov 16 09:12:03 2026\n78 638000000000000001\n",
        )),
    );
    let drained = drain(&r, &path).await;
    assert_eq!(ids(&drained), vec!["238320", "43160"]);
    let by = |id: &str| drained.iter().find(|d| d.app_id == id).unwrap().clone();
    // Only pid 78 is live and matches for the second app: the smallest matching pid.
    assert_eq!(by("238320").steam_pid, 78);
    assert_eq!(by("238320").recorded_at_ms, 1_700_000_100_000.0);
    assert_eq!(by("43160").steam_pid, 4242);
    assert_eq!(by("43160").recorded_at_ms, 1_700_000_000_000.0);
    // Bookkeeping keys never surface as records.
    assert!(!ids(&drained).iter().any(|i| i.starts_with("__")));
}

#[tokio::test]
async fn a_record_whose_recorded_steam_has_exited_is_dropped() {
    let (_d, path) = store_with(FIXTURE);
    let r = ScriptedRunner::default();
    // Only 4242 is live; 77 and 78 are gone, so that Steam adopted app 238320 at its own restart.
    script(
        &r,
        out(0, "4242\n"),
        Some(out(0, "4242 Mon Nov 16 09:12:03 2026\n")),
    );
    let drained = drain(&r, &path).await;
    assert_eq!(ids(&drained), vec!["43160"]);
}

#[tokio::test]
async fn a_record_whose_pid_was_reused_by_another_process_is_dropped() {
    let (_d, path) = store_with(FIXTURE);
    let r = ScriptedRunner::default();
    script(
        &r,
        out(0, "4242\n77\n"),
        Some(out(0, "4242 Tue Dec 1 00:00:00 2026\n77 99999\n")),
    );
    let drained = drain(&r, &path).await;
    assert!(
        drained.is_empty(),
        "both pids now belong to other processes"
    );
}

#[tokio::test]
async fn an_unreachable_probe_keeps_every_record_with_the_smallest_recorded_pid() {
    let (_d, path) = store_with(FIXTURE);
    let r = ScriptedRunner::default();
    // pgrep exit 2 is an error, not "no Steam".
    script(&r, out(2, ""), None);
    let drained = drain(&r, &path).await;
    assert_eq!(ids(&drained), vec!["238320", "43160"]);
    let by = |id: &str| drained.iter().find(|d| d.app_id == id).unwrap().steam_pid;
    assert_eq!(by("238320"), 77);
    assert_eq!(by("43160"), 4242);
}

#[tokio::test]
async fn an_inconclusive_start_token_probe_keeps_the_record() {
    let (_d, path) = store_with(FIXTURE);
    let r = ScriptedRunner::default();
    script(&r, out(0, "4242\n78\n"), Some(out(3, "")));
    let drained = drain(&r, &path).await;
    assert_eq!(ids(&drained), vec!["238320", "43160"]);
    assert_eq!(
        drained
            .iter()
            .find(|d| d.app_id == "238320")
            .unwrap()
            .steam_pid,
        77,
        "unknown keeps the smallest recorded pid"
    );
}

#[tokio::test]
async fn an_aged_hold_is_kept_because_it_is_still_unadopted() {
    // Recorded one year before NOW; max age is disabled, so the age alone never drops it.
    let old = json!({
        "5": {
            "pids": [{"pid": 12, "startToken": "T"}],
            "recordedAt": NOW as f64 - 31_536_000_000.0,
            "macNativeRoute": false,
            "skippedDepots": []
        }
    });
    let (_d, path) = store_with(&old.to_string());
    let r = ScriptedRunner::default();
    r.on(PGREP, vec![out(0, "12\n")]);
    r.on("/bin/ps -o pid=,lstart= -p 12", vec![out(0, "12 T\n")]);
    let drained = drain(&r, &path).await;
    assert_eq!(ids(&drained), vec!["5"]);
    assert_eq!(drained[0].steam_pid, 12);
}

#[tokio::test]
async fn invalid_records_and_non_numeric_keys_are_skipped() {
    let text = json!({
        "100": {"pids": [{"pid": 9, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []},
        "200": {"pids": [], "recordedAt": 1.0, "skippedDepots": []},
        "300": {"pids": [{"pid": 0, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []},
        "400": "not an object",
        "abc": {"pids": [{"pid": 9, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []},
        "12345678901": {"pids": [{"pid": 9, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []},
        "": {"pids": [{"pid": 9, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []},
        "__internal__": {"pids": [{"pid": 9, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []},
        "__timestamp": {"100": "x"},
        "__timestamp.100": {"pids": [{"pid": 9, "startToken": "T"}], "recordedAt": 1.0, "skippedDepots": []}
    })
    .to_string();
    let (_d, path) = store_with(&text);
    let r = ScriptedRunner::default();
    r.on(PGREP, vec![out(0, "9\n")]);
    r.on("/bin/ps -o pid=,lstart= -p 9", vec![out(0, "9 T\n")]);
    let drained = drain(&r, &path).await;
    assert_eq!(ids(&drained), vec!["100"]);
}

#[tokio::test]
async fn a_missing_store_answers_an_empty_list_without_probing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir
        .path()
        .join("store_cache")
        .join("steam_restart_hold.json");
    let r = ScriptedRunner::default();
    assert!(drain(&r, &path).await.is_empty());
    assert!(r.calls().is_empty(), "no process probe for an empty store");
    assert!(!path.exists(), "drain creates nothing");
}

#[tokio::test]
async fn an_unreadable_or_non_object_store_answers_empty_and_is_left_in_place() {
    for body in ["{not json", "[1, 2, 3]", "\"text\"", ""] {
        let (_d, path) = store_with(body);
        let r = ScriptedRunner::default();
        assert!(drain(&r, &path).await.is_empty(), "{body:?}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), body, "{body:?}");
    }
}

#[tokio::test]
async fn drain_writes_no_file_and_leaves_the_store_byte_for_byte() {
    let (d, path) = store_with(FIXTURE);
    let r = ScriptedRunner::default();
    script(
        &r,
        out(0, "4242\n"),
        Some(out(0, "4242 Mon Nov 16 09:12:03 2026\n")),
    );
    let _ = drain(&r, &path).await;
    assert_eq!(std::fs::read_to_string(&path).unwrap(), FIXTURE);
    let entries: Vec<_> = std::fs::read_dir(path.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(
        entries.len(),
        1,
        "no temp or sibling file appeared: {entries:?}"
    );
    drop(d);
}

#[test]
fn drained_hold_serialises_camel_case() {
    let v = serde_json::to_value(DrainedHold {
        app_id: "7".into(),
        steam_pid: 5,
        recorded_at_ms: 12.0,
    })
    .unwrap();
    assert_eq!(
        v,
        json!({"appId": "7", "steamPid": 5, "recordedAtMs": 12.0})
    );
}
