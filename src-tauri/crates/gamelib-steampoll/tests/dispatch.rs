//! The op table: every op is handled, bad args are `{op}:bad-args`, ops that need the facade
//! answer `steampoll:not-configured` before `install`, and the result shapes are camelCase.
//! The facade is process-wide, so every test takes `GUARD`.

use gamelib_steampoll::dispatch::{dispatch, facade, OPS};
use gamelib_steampoll::profile::{Platform, SidecarProfile};
use gamelib_steampoll::testing::{FakeClock, RecordingHost, ScriptedRunner};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, MutexGuard};

static GUARD: Mutex<()> = Mutex::new(());

fn guard() -> MutexGuard<'static, ()> {
    GUARD.lock().unwrap_or_else(|e| e.into_inner())
}

fn install(home: &std::path::Path) -> Arc<RecordingHost> {
    // The facade reads HOME once at install: point it at a scratch dir, never the real profile.
    std::env::set_var("HOME", home);
    std::env::set_var("USERPROFILE", home);
    let host = Arc::new(RecordingHost::default());
    let profile = SidecarProfile::resolve(Platform::current(), &home.to_string_lossy(), &|_| None);
    facade::install_for_test(
        host.clone(),
        Arc::new(ScriptedRunner::default()),
        Arc::new(FakeClock::new(1_700_000_000_000)),
        host.clone(),
        profile,
    );
    host
}

fn ok(op: &str, args: Value) -> Value {
    dispatch(op, &[args]).unwrap_or_else(|e| panic!("{op}: {e}"))
}

fn roots(steam: &str) -> Value {
    json!({"steamRoot": steam})
}

fn write_acf(dir: &std::path::Path, app_id: &str, flags: u32) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(
        dir.join(format!("appmanifest_{app_id}.acf")),
        format!(
            "\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"installdir\"\t\t\"Game\"\n\t\"StateFlags\"\t\t\"{flags}\"\n\t\"buildid\"\t\t\"7\"\n}}\n"
        ),
    )
    .unwrap();
}

#[test]
fn every_op_in_the_table_is_handled() {
    let _g = guard();
    for op in OPS {
        // Ops that take no args may succeed once another test installed the facade.
        if let Err(e) = dispatch(op, &[json!({"__nope": true})]) {
            assert!(!e.contains("unknown-op"), "{op} is not handled: {e}");
        }
    }
    assert_eq!(
        dispatch("steampoll_nope", &[json!({})]),
        Err("steampoll_nope:unknown-op".to_string())
    );
}

#[test]
fn bad_args_are_named_per_op() {
    let _g = guard();
    for op in OPS {
        if matches!(
            *op,
            "steampoll_next_notice_seq"
                | "steampoll_running_last_app_id"
                | "steampoll_running_start"
                | "steampoll_running_stop"
                | "steampoll_status"
                | "steampoll_read_running_app_id"
                | "steampoll_hold_drain"
        ) {
            continue;
        }
        assert_eq!(
            dispatch(op, &[json!({"__nope": true})]),
            Err(format!("{op}:bad-args")),
            "{op}"
        );
        assert_eq!(dispatch(op, &[]), Err(format!("{op}:bad-args")), "{op}");
    }
    // Unknown source, non-numeric appId, unknown option key.
    assert_eq!(
        dispatch(
            "steampoll_acf_read_state",
            &[json!({"roots": roots("/x"), "appId": "1", "source": "other"})]
        ),
        Err("steampoll_acf_read_state:bad-args".to_string())
    );
    assert_eq!(
        dispatch("steampoll_install_stop", &[json!({"appId": "1; rm"})]),
        Err("steampoll_install_stop:bad-args".to_string())
    );
    assert_eq!(
        dispatch(
            "steampoll_install_start",
            &[json!({"appId": "1", "title": "t", "roots": roots("/x"), "options": {"extra": 1}})]
        ),
        Err("steampoll_install_start:bad-args".to_string())
    );
}

#[test]
fn ops_that_need_the_facade_are_not_configured_before_install() {
    let _g = guard();
    facade::reset_for_test();
    assert!(facade::registry().is_none());
    let nc = Err("steampoll:not-configured".to_string());
    assert_eq!(dispatch("steampoll_status", &[]), nc);
    assert_eq!(dispatch("steampoll_next_notice_seq", &[]), nc);
    assert_eq!(dispatch("steampoll_running_start", &[]), nc);
    assert_eq!(
        dispatch("steampoll_install_stop", &[json!({"appId": "1"})]),
        nc
    );
    // File-only ops need no facade.
    assert!(dispatch(
        "steampoll_breadcrumb_installed_on_disk",
        &[json!({"steamappsDir": "/nonexistent", "appId": "1"})]
    )
    .is_ok());
}

#[test]
fn acf_ops_read_and_remove_through_the_crate() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    let steam = tmp.path().join("steam");
    let apps = steam.join("steamapps");
    write_acf(&apps, "1000", 4);
    write_acf(&apps, "2000", 1026);
    std::fs::write(
        apps.join("libraryfolders.vdf"),
        format!(
            "\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n}}\n",
            steam.to_string_lossy()
        ),
    )
    .unwrap();
    let r = roots(&steam.to_string_lossy());

    let st = ok(
        "steampoll_acf_read_state",
        json!({"roots": r, "appId": "1000", "source": "native"}),
    );
    assert_eq!(st["state"], "installed");
    let absent = ok(
        "steampoll_acf_read_state",
        json!({"roots": r, "appId": "999", "source": "native"}),
    );
    assert_eq!(absent["state"], "absent");

    let up = ok(
        "steampoll_acf_read_update_from_dir",
        json!({"steamappsDir": apps, "appId": "1000"}),
    );
    assert_eq!(up["buildid"], "7");
    let none = ok(
        "steampoll_acf_read_update_from_dir",
        json!({"steamappsDir": apps, "appId": "3"}),
    );
    assert_eq!(none, Value::Null);
    let up2 = ok(
        "steampoll_acf_read_update",
        json!({"roots": r, "appId": "1000", "source": "native"}),
    );
    assert_eq!(up2["steamappsDir"], apps.to_string_lossy().as_ref());

    let copies = ok(
        "steampoll_acf_enumerate_copies",
        json!({"roots": r, "appId": "1000"}),
    );
    assert!(copies.as_array().is_some());
    let dl = ok("steampoll_acf_scan_downloading", json!({"roots": r}));
    assert!(dl.as_array().unwrap().contains(&json!("2000")));
    let others = ok(
        "steampoll_acf_find_other_manifests",
        json!({"steamappsDir": apps, "installdir": "Game", "appId": "1000"}),
    );
    assert!(others.as_array().unwrap().contains(&json!("2000")));

    // Breadcrumb: true only for a fully-installed manifest.
    let bc = |id: &str| {
        ok(
            "steampoll_breadcrumb_installed_on_disk",
            json!({"steamappsDir": apps, "appId": id}),
        )
    };
    assert_eq!(bc("1000"), json!(true));
    assert_eq!(bc("2000"), json!(false));
    assert_eq!(bc("404"), json!(false));
    assert_eq!(bc("not-a-number"), json!(false));

    // The only deleting op goes through acf_copies::remove_copy and its guard: a manifest-only
    // removal result is a status object, never a bare error.
    let rm = ok(
        "steampoll_acf_remove_copy",
        json!({"roots": r, "appId": "404", "source": "native"}),
    );
    assert!(rm["status"].is_string());
}

#[test]
fn install_ops_drive_the_registry_and_status() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    let steam = tmp.path().join("steam");
    std::fs::create_dir_all(steam.join("steamapps")).unwrap();

    assert_eq!(
        ok(
            "steampoll_install_start",
            json!({"appId": "1000", "title": "T", "roots": roots(&steam.to_string_lossy()),
                   "options": {"source": "native", "intervalMs": 100000}})
        ),
        json!(false)
    );
    // 80-REVIEW C-WR-03: the start reports whether the poll is update-aware once it returns,
    // read under the start's own lock. A repeat start that carries `awaitingUpdate` upgrades the
    // running poll, so it reports true; a fresh update start reports true too.
    assert_eq!(
        ok(
            "steampoll_install_start",
            json!({"appId": "1000", "title": "T", "roots": roots(&steam.to_string_lossy()),
                   "options": {"awaitingUpdate": {"fromBuild": "1", "targetBuild": "2"}}})
        ),
        json!(true)
    );
    assert_eq!(
        ok(
            "steampoll_install_start",
            json!({"appId": "1001", "title": "U", "roots": roots(&steam.to_string_lossy()),
                   "options": {"source": "native", "intervalMs": 100000,
                               "awaitingUpdate": {"fromBuild": "1", "targetBuild": "2"}}})
        ),
        json!(true)
    );
    assert_eq!(
        ok("steampoll_install_stop", json!({"appId": "1001"})),
        json!(true)
    );
    let st = ok("steampoll_status", json!(null));
    assert_eq!(st["installs"][0]["appId"], "1000");
    assert_eq!(st["installs"][0]["delegatedToSteamClient"], false);
    assert!(st["uninstalls"].is_array());

    assert_eq!(
        ok(
            "steampoll_install_cancel_delegated",
            json!({"appId": "1000"})
        ),
        json!(false)
    );
    assert_eq!(
        ok(
            "steampoll_native_in_flight",
            json!({"appId": "1000", "inFlight": true})
        ),
        Value::Null
    );
    assert_eq!(
        ok(
            "steampoll_bridge_finalized",
            json!({"appId": "1000", "finalized": true})
        ),
        Value::Null
    );
    assert_eq!(
        ok("steampoll_install_stop", json!({"appId": "1000"})),
        json!(true)
    );
    assert_eq!(
        ok("steampoll_install_stop", json!({"appId": "1000"})),
        json!(false)
    );

    let a = ok("steampoll_next_notice_seq", json!(null))
        .as_u64()
        .unwrap();
    let b = ok("steampoll_next_notice_seq", json!(null))
        .as_u64()
        .unwrap();
    assert_eq!(b, a + 1);
    assert!(facade::registry().is_some() && facade::outbox().is_some());
}

#[test]
fn uninstall_and_running_ops() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    let steam = tmp.path().join("steam");
    std::fs::create_dir_all(steam.join("steamapps")).unwrap();

    let started = ok(
        "steampoll_uninstall_start",
        json!({"appId": "1000", "title": "T", "roots": roots(&steam.to_string_lossy()),
               "source": "native", "intervalMs": 100000}),
    );
    assert_eq!(started, json!(true));
    assert_eq!(
        ok(
            "steampoll_uninstall_start",
            json!({"appId": "1000", "title": "T", "roots": roots(&steam.to_string_lossy()),
                   "source": "native"})
        ),
        json!(false)
    );
    assert_eq!(
        ok("steampoll_uninstall_stop", json!({"appId": "1000"})),
        json!(true)
    );

    assert_eq!(ok("steampoll_running_last_app_id", json!(null)), json!(0));
    let claim = ok("steampoll_running_hold", json!({"appId": 1000}));
    assert!(claim.as_u64().is_some());
    assert_eq!(
        ok(
            "steampoll_running_release",
            json!({"claimId": claim, "terminalSent": true})
        ),
        Value::Null
    );
    // A released (unknown) claim is a no-op.
    assert_eq!(
        ok(
            "steampoll_running_release",
            json!({"claimId": claim, "terminalSent": true})
        ),
        Value::Null
    );
    assert_eq!(ok("steampoll_running_start", json!(null)), Value::Null);
    assert_eq!(ok("steampoll_running_stop", json!(null)), Value::Null);

    let id = ok("steampoll_read_running_app_id", json!({"strict": false}));
    assert_eq!(id, json!(0));
    assert_eq!(dispatch("steampoll_read_running_app_id", &[]), Ok(json!(0)));
    // `[undefined]` arrives as `[null]` (80-REVIEW B/WR-03).
    assert_eq!(
        dispatch("steampoll_read_running_app_id", &[Value::Null]),
        Ok(json!(0))
    );
    let verdict = ok(
        "steampoll_mac_arch_verdict",
        json!({"installPath": tmp.path().join("nothing")}),
    );
    assert_eq!(verdict, Value::Null);
}

#[test]
fn strict_running_read_errors_without_a_profile_home() {
    let _g = guard();
    if cfg!(windows) {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    // The facade captured a real scratch home above; rebuild it with no home at all.
    std::env::set_var("HOME", "");
    std::env::set_var("USERPROFILE", "");
    let host = Arc::new(RecordingHost::default());
    facade::install_for_test(
        host.clone(),
        Arc::new(ScriptedRunner::default()),
        Arc::new(FakeClock::new(0)),
        host,
        SidecarProfile::resolve(Platform::current(), "/fake", &|_| None),
    );
    let e = dispatch("steampoll_read_running_app_id", &[json!({"strict": true})])
        .expect_err("strict with no home must refuse");
    assert!(e.starts_with("steampoll_read_running_app_id:"), "{e}");
    assert_eq!(
        dispatch("steampoll_read_running_app_id", &[json!({"strict": false})]),
        Ok(json!(0))
    );
}

#[tokio::test]
async fn async_ops_refuse_to_run_inside_a_runtime() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    assert_eq!(
        dispatch("steampoll_read_running_app_id", &[json!({"strict": false})]),
        Err("steampoll_read_running_app_id:wrong-thread".to_string())
    );
    assert_eq!(
        dispatch(
            "steampoll_mac_arch_verdict",
            &[json!({"installPath": "/x"})]
        ),
        Err("steampoll_mac_arch_verdict:wrong-thread".to_string())
    );
}

fn watch_args(tmp: &std::path::Path, app_id: &str) -> Value {
    json!({
        "appId": app_id,
        "manifestPath": tmp.join("steamapps").join(format!("appmanifest_{app_id}.acf")).to_string_lossy(),
        "baselineContent": "baseline",
        "recordedAtMs": 1_700_000_000_000.0,
        "steamPid": 0
    })
}

#[test]
fn adoption_watch_is_listed_and_round_trips_through_the_facade() {
    let _g = guard();
    assert!(OPS.contains(&"steampoll_adoption_watch"));
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    assert_eq!(
        ok("steampoll_adoption_watch", watch_args(tmp.path(), "1234")),
        json!(true)
    );
    let f = facade::current().unwrap();
    assert_eq!(f.adoption.watched_app_ids(), vec!["1234".to_string()]);
    assert!(f.adoption.unwatch("1234"));
}

#[test]
fn adoption_watch_rejects_invalid_args_with_its_own_bad_args() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    let bad = Err("steampoll_adoption_watch:bad-args".to_string());
    let mut relative = watch_args(tmp.path(), "1234");
    relative["manifestPath"] = json!("steamapps/appmanifest_1234.acf");
    assert_eq!(dispatch("steampoll_adoption_watch", &[relative]), bad);
    let mut bad_id = watch_args(tmp.path(), "1234");
    bad_id["appId"] = json!("12; rm");
    assert_eq!(dispatch("steampoll_adoption_watch", &[bad_id]), bad);
    let mut unknown = watch_args(tmp.path(), "1234");
    unknown["extra"] = json!(1);
    assert_eq!(dispatch("steampoll_adoption_watch", &[unknown]), bad);
    assert!(facade::current()
        .unwrap()
        .adoption
        .watched_app_ids()
        .is_empty());
}

#[test]
fn adoption_unwatch_answers_true_for_a_watched_app_and_false_otherwise() {
    let _g = guard();
    assert!(OPS.contains(&"steampoll_adoption_unwatch"));
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    ok("steampoll_adoption_watch", watch_args(tmp.path(), "1234"));
    assert_eq!(
        ok("steampoll_adoption_unwatch", json!({"appId": "1234"})),
        json!(true)
    );
    assert_eq!(
        ok("steampoll_adoption_unwatch", json!({"appId": "1234"})),
        json!(false)
    );
    assert_eq!(
        dispatch("steampoll_adoption_unwatch", &[json!({"appId": "1; rm"})]),
        Err("steampoll_adoption_unwatch:bad-args".to_string())
    );
}

#[test]
fn adoption_read_answers_the_reading_shape_and_rejects_bad_args() {
    let _g = guard();
    assert!(OPS.contains(&"steampoll_adoption_read"));
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    let reading = ok("steampoll_adoption_read", watch_args(tmp.path(), "1234"));
    assert_eq!(reading["adopted"], json!(false));
    for key in ["signedIn", "steamRunning", "helperState", "evidence"] {
        assert!(reading.get(key).is_some(), "{key} is in the reading");
    }
    // A read registers nothing.
    assert!(facade::current()
        .unwrap()
        .adoption
        .watched_app_ids()
        .is_empty());
    let bad = Err("steampoll_adoption_read:bad-args".to_string());
    let mut relative = watch_args(tmp.path(), "1234");
    relative["manifestPath"] = json!("steamapps/appmanifest_1234.acf");
    assert_eq!(dispatch("steampoll_adoption_read", &[relative]), bad);
    let mut unknown = watch_args(tmp.path(), "1234");
    unknown["extra"] = json!(1);
    assert_eq!(dispatch("steampoll_adoption_read", &[unknown]), bad);
}

#[tokio::test]
async fn adoption_read_refuses_to_run_inside_a_runtime_without_panicking() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    assert_eq!(
        dispatch("steampoll_adoption_read", &[watch_args(tmp.path(), "1234")]),
        Err("steampoll_adoption_read:wrong-thread".to_string())
    );
}

// ---- Phase 81 D-12: the hold migration ops ---------------------------------------------------

fn profile_store(home: &std::path::Path) -> std::path::PathBuf {
    std::path::PathBuf::from(
        SidecarProfile::resolve(Platform::current(), &home.to_string_lossy(), &|_| None)
            .restart_hold_store_path,
    )
}

#[test]
fn hold_drain_is_listed_and_ignores_its_args() {
    let _g = guard();
    assert!(OPS.contains(&"steampoll_hold_drain"));
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    // No store under the profile: an empty list, whatever the args are.
    assert_eq!(dispatch("steampoll_hold_drain", &[]), Ok(json!([])));
    assert_eq!(
        dispatch(
            "steampoll_hold_drain",
            &[json!({"storePath": "/etc/passwd", "__nope": true})]
        ),
        Ok(json!([]))
    );
}

#[test]
fn hold_drain_reads_only_the_facade_profile_store() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    let store = profile_store(tmp.path());
    std::fs::create_dir_all(store.parent().unwrap()).unwrap();
    // An unreadable store: empty answer, file untouched.
    std::fs::write(&store, "{not json").unwrap();
    assert_eq!(dispatch("steampoll_hold_drain", &[]), Ok(json!([])));
    assert_eq!(std::fs::read_to_string(&store).unwrap(), "{not json");
    // A path in the args never redirects the read.
    let other = tmp.path().join("other.json");
    std::fs::write(
        &other,
        r#"{"5":{"pids":[{"pid":9,"startToken":"T"}],"recordedAt":1,"skippedDepots":[]}}"#,
    )
    .unwrap();
    assert_eq!(
        dispatch(
            "steampoll_hold_drain",
            &[json!({"path": other.to_string_lossy()})]
        ),
        Ok(json!([]))
    );
}

#[tokio::test]
async fn hold_drain_refuses_to_run_inside_a_runtime() {
    let _g = guard();
    let tmp = tempfile::tempdir().unwrap();
    install(tmp.path());
    assert_eq!(
        dispatch("steampoll_hold_drain", &[]),
        Err("steampoll_hold_drain:wrong-thread".to_string())
    );
}

#[test]
fn hold_drain_is_not_configured_before_install() {
    let _g = guard();
    facade::reset_for_test();
    assert_eq!(
        dispatch("steampoll_hold_drain", &[]),
        Err("steampoll:not-configured".to_string())
    );
}
